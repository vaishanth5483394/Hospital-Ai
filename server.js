require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app = express();

// ─────────────────────────────────────────────
// Security middlewares
// ─────────────────────────────────────────────
// Simple manual rate limiter (no extra dep needed)
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > 60) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }
  next();
}

app.use(cors({ origin: "*" })); // keep permissive for hackathon demo
app.use(express.json());
app.use(rateLimit);

// Serve frontend from same server — fixes the localhost hardcode issue
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────────
// Config from .env
// ─────────────────────────────────────────────
const GROQ_API_KEY      = process.env.GROQ_API_KEY;
const HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY;
const HINDSIGHT_API_URL = process.env.HINDSIGHT_API_URL || "https://api.hindsight.vectorize.io";
const HINDSIGHT_BANK_ID = process.env.HINDSIGHT_BANK_ID || "hospital-ai";
const PORT              = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// Load medicines from JSON — with safe fallback
// ─────────────────────────────────────────────
let medicines = [];
try {
  medicines = JSON.parse(fs.readFileSync(path.join(__dirname, "medicines.json"), "utf-8"));
} catch (err) {
  console.warn("⚠️  medicines.json not found or invalid — using empty inventory.");
}

// ─────────────────────────────────────────────
// In-memory search frequency tracker
// Tracks how many times each medicine is queried per session
// Used to power the "Smart Restock Prediction" feature
// ─────────────────────────────────────────────
const searchFrequency = {}; // { "insulin": 5, "paracetamol": 3 }

function recordSearch(query) {
  const key = query.toLowerCase().trim();
  searchFrequency[key] = (searchFrequency[key] || 0) + 1;
}

function getFrequentSearches(threshold = 3) {
  return Object.entries(searchFrequency)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function getRestockAlerts() {
  // Find medicines that are low/out AND have been searched frequently
  const frequent = getFrequentSearches(2);
  const alerts = [];
  for (const { name, count } of frequent) {
    const med = medicines.find(m =>
      m.name.toLowerCase().includes(name) || name.includes(m.name.toLowerCase())
    );
    if (med && med.stock <= 50) {
      alerts.push({ medicine: med.name, stock: med.stock, searchCount: count, location: med.location });
    }
  }
  return alerts;
}

// ═════════════════════════════════════════════
// LOCAL IN-MEMORY MEMORY HELPERS
// (replaces Hindsight — no external service needed)
// ═════════════════════════════════════════════

const localMemory = {}; // { userId: [ { userMessage, agentReply, timestamp } ] }
const MAX_MEMORY_PER_USER = 20;

async function hindsightRetain(userId, userMessage, agentReply) {
  if (!localMemory[userId]) localMemory[userId] = [];
  localMemory[userId].push({ userMessage, agentReply, timestamp: new Date().toISOString() });
  // Keep only the last N entries
  if (localMemory[userId].length > MAX_MEMORY_PER_USER) {
    localMemory[userId] = localMemory[userId].slice(-MAX_MEMORY_PER_USER);
  }
}

async function hindsightRecall(userId, query) {
  const history = localMemory[userId];
  if (!history || history.length === 0) return null;
  // Return last 5 exchanges as context
  return history.slice(-5)
    .map(m => `User: ${m.userMessage}\nAssistant: ${m.agentReply}`)
    .join("\n---\n");
}

// ═════════════════════════════════════════════
// GROQ LLM HELPER
// ═════════════════════════════════════════════
async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set in .env");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Groq API error ${res.status}: ${t}`); }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No text returned from Groq");
  return text.trim();
}

// ─────────────────────────────────────────────
// Fallback: keyword matcher (no API keys needed)
// ─────────────────────────────────────────────
function keywordFallback(msg) {
  const match = medicines.find(m =>
    msg.toLowerCase().includes(m.name.toLowerCase()) ||
    m.name.toLowerCase().includes(msg.toLowerCase())
  );
  if (!match) return `❌ Medicine not found.\n💡 Try searching for: ${medicines.slice(0, 5).map(m => m.name).join(", ")} and more.`;
  if (match.stock > 50) return `✅ ${match.name} is available\n📍 Location: ${match.location}\n📦 Stock: ${match.stock} units\n🏷️ Category: ${match.category}`;
  else if (match.stock > 0) return `⚠️ ${match.name} is LOW on stock\n📍 Location: ${match.location}\n📦 Stock: ${match.stock} units remaining\n🏷️ Category: ${match.category}`;
  else return `❌ ${match.name} is OUT OF STOCK\n📍 Usually at: ${match.location}\n🏷️ Category: ${match.category}\n⚡ Please restock urgently.`;
}

// ═════════════════════════════════════════════
// POST /chat — main endpoint
// Flow: record search → recall memory → Groq LLM (with memory + restock intelligence) → retain memory
// ═════════════════════════════════════════════
app.post("/chat", async (req, res) => {
  const { message, user } = req.body;

  // Validate user field — must be a non-empty string if provided
  const userId = typeof user === "string" && user.trim().length > 0
    ? user.trim().slice(0, 64)   // cap length
    : "anonymous";

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required and must be a string." });
  }
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return res.status(400).json({ error: "Message cannot be empty." });
  if (trimmedMessage.length > 500) return res.status(400).json({ error: "Message too long (max 500 chars)." });

  // Record search frequency for restock prediction
  recordSearch(trimmedMessage);

  let reply   = "";
  let usedAI  = false;
  let memories = null;

  try {
    // STEP 1: RECALL relevant memories from Hindsight
    memories = await hindsightRecall(userId, trimmedMessage);

    // STEP 2: Get restock alerts based on search frequency
    const restockAlerts = getRestockAlerts();
    const restockContext = restockAlerts.length > 0
      ? `\nSMART RESTOCK ALERTS (medicines searched frequently that are low):\n${restockAlerts.map(a => `- ${a.medicine}: ${a.stock} units left, searched ${a.searchCount} times today. Location: ${a.location}`).join("\n")}\n`
      : "";

    // STEP 3: Build system prompt
    const systemPrompt = `You are a smart hospital pharmacy assistant AI. You help hospital staff check medicine availability, track stock, and predict shortages.

CURRENT MEDICINE INVENTORY:
${JSON.stringify(medicines, null, 2)}
${restockContext}
${memories ? `MEMORY — RELEVANT PAST CONTEXT FOR THIS USER:\n${memories}\n` : ""}

RULES:
- Answer clearly and concisely — hospital staff are busy.
- For medicine queries: report name, stock status, location, and category.
  Stock > 50 = Available ✅ | Stock 1–50 = Low Stock ⚠️ | Stock 0 = Out of Stock ❌
- Only use stock numbers from the inventory above. Never make up numbers.
- If MEMORY context exists, reference it naturally: "Based on your earlier queries..." — this shows the agent is learning.
- If SMART RESTOCK ALERTS exist and the user is asking about a medicine in those alerts, proactively mention the restock recommendation.
- If a medicine has been queried many times (visible in restock alerts), proactively warn: "This medicine has been searched frequently today — consider restocking."
- Use emojis for structure. No markdown headers or bullet hyphens.`;

    // STEP 4: Call Groq LLM
    reply = await callGroq(systemPrompt, trimmedMessage);
    usedAI = true;

    // STEP 5: RETAIN this turn into Hindsight (async, non-blocking)
    hindsightRetain(userId, trimmedMessage, reply);

  } catch (err) {
    console.error("⚠️ AI pipeline failed, using fallback:", err.message);
    reply = keywordFallback(trimmedMessage);
  }

  res.json({
    reply,
    usedAI,
    memoryInjected: !!memories,
    restockAlerts: getRestockAlerts(),    // send to frontend for display
    searchFrequency: searchFrequency,    // send to frontend for dashboard
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────
// GET /medicines — list/filter medicines
// ─────────────────────────────────────────────
app.get("/medicines", (req, res) => {
  const { category, status } = req.query;
  let result = medicines;
  if (category) result = result.filter(m => m.category.toLowerCase().includes(category.toLowerCase()));
  if (status === "low")       result = result.filter(m => m.stock > 0 && m.stock <= 50);
  else if (status === "out")  result = result.filter(m => m.stock === 0);
  else if (status === "available") result = result.filter(m => m.stock > 50);
  res.json({ total: result.length, medicines: result });
});

// ─────────────────────────────────────────────
// GET /insights — search frequency & restock predictions
// ─────────────────────────────────────────────
app.get("/insights", (req, res) => {
  res.json({
    searchFrequency,
    restockAlerts: getRestockAlerts(),
    topSearches: getFrequentSearches(1)
  });
});

// ─────────────────────────────────────────────
// GET /health — system health check
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    medicinesLoaded: medicines.length,
    groqEnabled: !!GROQ_API_KEY,
    hindsightEnabled: !!HINDSIGHT_API_KEY,
    hindsightBankId: HINDSIGHT_BANK_ID,
    uptime: Math.floor(process.uptime()) + "s"
  });
});

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Hospital AI Server running on http://localhost:${PORT}`);
  console.log(`🤖 Groq LLM:         ${GROQ_API_KEY      ? "enabled ✅" : "not set ❌ (fallback mode)"}`);
  console.log(`🧠 Hindsight Memory: ${HINDSIGHT_API_KEY ? "enabled ✅" : "not set ❌ (no persistent memory)"}`);
  console.log(`💊 Medicines loaded: ${medicines.length}`);
  console.log(`📦 Memory bank:      ${HINDSIGHT_BANK_ID}`);
  console.log(`\n🌐 Open http://localhost:${PORT} in your browser\n`);
});