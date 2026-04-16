🏥 Hospital AI 💊

AI-Powered Medicine Search & Smart Inventory System

Built for Hack With Chennai 2026 by Team Kali

📌 Problem Statement

Hospital staff often struggle to quickly find medicine availability, location, and stock levels — especially in emergency situations. Traditional systems are slow, manual, and lack intelligence.

💡 Solution

Hospital AI is an intelligent assistant that allows staff to query medicine inventory using natural language and get instant, context-aware responses.

It not only answers queries but also learns from usage patterns and predicts restocking needs.

✨ Key Features

💬 Natural Language Search

Ask like a human:
"Do we have insulin?" or "Where is paracetamol?"

🧠 Smart Memory (Hindsight AI)

Remembers past queries per user and improves responses over time

📊 Smart Restock Prediction

Detects frequently searched low-stock medicines and alerts staff

💊 Inventory Dashboard

View complete stock with filters (low/out-of-stock)

⚡ Fast AI Responses

Powered by Groq’s ultra-low latency LLM

🌐 REST API Ready

Easily integrates with hospital systems

🔌 Offline Mode

Works even without API keys using keyword matching


🛠️ Tech Stack


| Layer    | Technology            |
| -------- | --------------------- |
| Backend  | Node.js, Express      |
| AI Model | Groq (LLaMA 3.3 70B)  |
| Memory   | Hindsight AI          |
| Frontend | HTML, CSS, JavaScript |



🧠 How It Works

User sends a query

System checks medicine inventory

Hindsight retrieves past interactions (memory)

AI generates a contextual response

System tracks frequency for restock prediction

Response is returned and stored for future learning


🏗️ Architecture


Browser → Express Server → Rate Limiter

                        → /chat endpoint
                            ├── Input Validation
                            ├── Search Tracking
                            ├── Memory Recall (Hindsight)                            
                            ├── AI Processing (Groq)                            
                            ├── Memory Storage         
                            └── Response վերադարձ



⚙️ Installation Guide 

# 1. Install dependencies
npm install

# 2. Run server
node server.js

# 3. Open browser
http://localhost:3000


🔌 API Endpoints

| Method | Endpoint   | Description         |
| ------ | ---------- | ------------------- |
| POST   | /chat      | AI query system     |
| GET    | /medicines | View inventory      |
| GET    | /insights  | Restock predictions |
| GET    | /health    | Server status       |


👥 Team Kali

Built with dedication at Hack With Chennai 2026


