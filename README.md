# Hospital AI 💊

AI-powered medicine search and pharmacy management system for hospital staff. Built for **Hack With Chennai 2026**.

## What it does

- **Instant medicine search** — Ask in natural language: "Do we have insulin?" or "Where is amoxicillin?"
- **Hindsight Memory** — The agent remembers past queries per staff member and surfaces patterns over time
- **Smart Restock Prediction** — Detects medicines queried frequently that are low on stock and proactively alerts staff
- **Inventory dashboard** — Full stock overview with low/out-of-stock filters
- **Offline fallback** — Works without API keys using keyword matching

## Stack

- **Backend**: Node.js + Express
- **LLM**: Groq (LLaMA-3.3-70B) for fast inference
- **Memory**: Hindsight for persistent per-user memory (retain + recall)
- **Frontend**: Vanilla HTML/CSS/JS — no build step

  ✨ Features

💬 Natural language chat — query medicine stock in plain English
🧠 Persistent memory — remembers past interactions per user via Hindsight
💊 Full inventory access — stock status, location, category, and availability
⚡ Fast responses — powered by Groq's ultra-low-latency LLM inference
🌐 REST API — simple endpoints to integrate with existing hospital systems


🔮 Future Scope

Expand beyond inventory to support appointment booking, patient triage, and ward management
Scale to multi-hospital networks with role-based access for doctors, nurses, and admins


## Setup

```bash
# 1. Clone and install
npm install

# 2. Add your medicine inventory
# Edit medicines.json with your hospital's stock data

# 3. Run
node server.js

# 4. Open in browser
# http://localhost:3000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat` | Main AI chat endpoint |
| GET | `/medicines` | List/filter medicines |
| GET | `/insights` | Search frequency & restock predictions |
| GET | `/health` | System health check |

### POST /chat

**Body:**
```json
{ "message": "Do we have insulin?", "user": "nurse-priya" }
```

**Response:**
```json
{
  "reply": "⚠️ Insulin (Rapid) is LOW on stock...",
  "usedAI": true,
  "memoryInjected": true,
  "restockAlerts": [...],
  "timestamp": "2026-04-13T10:00:00.000Z"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes (for AI) | Groq API key |
| `HINDSIGHT_API_KEY` | Yes (for memory) | Hindsight API key |
| `HINDSIGHT_BANK_ID` | No | Memory bank name (default: hospital-ai) |
| `PORT` | No | Server port (default: 3000) |


🧠 How the Memory Works

Before responding — Hindsight searches past conversations for relevant context (recall)
The LLM generates a response using the current query + inventory + recalled memory
After responding — the conversation is saved back to Hindsight (retain) for future recall

Each user has isolated memory, so staff members get personalized context without overlap.



## Architecture

```
Browser → Express Server → Rate Limiter
                        → POST /chat:
                            1. Validate input
                            2. Record search frequency
                            3. Hindsight recall (memory)
                            4. Build system prompt (inventory + memory + restock alerts)
                            5. Groq LLM
                            6. Hindsight retain (async)
                            7. Return reply + memory/restock metadata


👥 Team Kali

Built with ❤️ at Hack with Chennai
```
