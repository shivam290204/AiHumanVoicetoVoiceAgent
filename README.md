# VOCALIS.AI Voice-to-Voice Agent

A real-time, low-latency, conversational AI Voice Agent leveraging the official **OpenAI Realtime API** via **WebRTC**.

## Architecture Upgrade (v2.0)
This project has been migrated from a sequential Node.js architecture to a robust, asynchronous **Python FastAPI** backend using true **WebRTC**.

### Why WebRTC?
Instead of capturing audio, sending it to a server, waiting for transcription, sending it to an LLM, generating TTS, and streaming it back (which causes immense latency), we now use OpenAI's **Ephemeral Tokens**.

1. The browser requests an Ephemeral Token from our FastAPI backend.
2. The browser establishes a direct WebRTC `RTCPeerConnection` to OpenAI's edge servers.
3. Audio flows bidirectionally with sub-500ms latency.
4. If the AI needs to query the database (RAG), OpenAI sends a Tool Call over the WebRTC Data Channel to the browser, which proxies it to the FastAPI backend, keeping all secure logic on your server!

---

## Technology Stack

### Backend
* **Python 3.11+**
* **FastAPI** & Uvicorn (REST API)
* **SQLAlchemy** (Database ORM, ready for Postgres)
* **ChromaDB** (Local Vector Database for RAG)
* **Pytest** (Testing)

### Frontend
* Vanilla HTML5 / CSS3 / JavaScript
* WebRTC (`RTCPeerConnection` and `RTCDataChannel`)
* Native MediaDevices API

---

## Folder Structure

```
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI Routers (realtime, tools)
│   │   ├── conversation/ # System Prompts & Persona
│   │   ├── database/     # SQLAlchemy Models & Session
│   │   ├── rag/          # Vector Search Engine (Chroma)
│   │   ├── services/     # OpenAI Ephemeral Token generation
│   │   └── tools/        # Tool Registry
│   ├── tests/            # Pytest test suite
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── index.html
│   ├── app.js            # WebRTC logic
│   └── styles.css
└── .env                  # Configuration
```

---

## Local Setup

### 1. Environment Variables
Copy the example config:
```bash
cp .env.example .env
```
Open `.env` and add your real `OPENAI_API_KEY`. You **must** have a funded OpenAI account to use the Realtime API (`gpt-4o-realtime-preview-2024-12-17`).

### 2. Install Python Dependencies
It's recommended to use a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 3. Run the Backend & Frontend
FastAPI serves the frontend statically on the same port!
```bash
python backend/app/main.py
```
Open `http://127.0.0.1:8787` in your browser.

---

## Advanced Features

### RAG (Retrieval-Augmented Generation) & Tools
The system includes a fully modular Tool Registry (`backend/app/tools/registry.py`).
By default, the AI is equipped with a `retrieve_company_knowledge` tool connected to ChromaDB.
When a user asks a company-specific question, the AI autonomously requests a database lookup, retrieving the relevant chunks and responding naturally without missing a beat in the voice conversation.

### Authentication & Production
- **Ephemeral Tokens**: The architecture ensures your `OPENAI_API_KEY` is completely hidden from the browser.
- **Database**: We use SQLite by default for easy local testing, but you can instantly switch to Postgres by changing the `DATABASE_URL` in `.env`.

### Testing
Run tests using:
```bash
pytest backend/tests/
```
