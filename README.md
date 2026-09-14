# Production AI Voice Agent

This project is a complete, modular AI voice-agent scaffold that runs without external npm packages. It includes browser microphone capture, client-side VAD, interruption/barge-in behavior, session lifecycle management, STT/LLM/TTS provider adapters, mock providers for offline testing, error handling, logging, tests, and documentation.

## Architecture

The browser supports two operating modes:

- Local browser speech mode: used when STT or TTS is set to `mock`. It uses the browser's built-in speech recognition and speech synthesis, so you can actually talk and hear responses without API keys.
- Provider mode: used when STT, LLM, and TTS are configured for real providers. It records audio with `MediaRecorder`, watches speaking state with a Web Audio VAD loop, and sends speech turns to the server.

The server pipeline is:

1. Session manager creates or resumes a voice session.
2. STT provider transcribes the user audio.
3. Conversation manager adds the user message and builds compact context.
4. LLM provider generates a voice-first response.
5. TTS provider synthesizes male or female speech.
6. The response audio is returned to the browser for playback.

The UI supports barge-in: if the user starts speaking while the AI is playing, playback is stopped and the agent immediately listens for the next turn.

## Providers

Set providers in `.env`:

- `mock`: deterministic offline provider for local development and tests.
- `openai`: OpenAI-compatible HTTP adapters for STT, LLM, and TTS.

The provider boundary lives in `backend/providers/index.js`, so STT, LLM, or TTS can be replaced independently.

## Setup

Install dependencies and start the server:

```bash
npm install
cp .env.example .env
node backend/server.js
```

Open `http://127.0.0.1:8787`.

To use real OpenAI-compatible providers instead of browser speech mode, put your key in `.env` and set:

```bash
STT_PROVIDER=openai
LLM_PROVIDER=openai
TTS_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

Never commit `.env`.

## Run Tests

```bash
node --test tests/*.test.js
```

Tests cover VAD, conversation context, provider failure behavior, session lifecycle, voice pipeline success, and interruption state.

## Browser Notes

Local browser speech mode works best in Chrome or Edge because they expose the Web Speech recognition API. Browser speech voices come from your operating system, so exact male and female voice names vary by machine.

## Production Notes

For a large deployment, put this server behind TLS, move sessions to Redis or a database, add per-user authentication, rate limits, metrics, request tracing, and streaming WebSocket transport. The current implementation keeps the architecture provider-ready and testable while avoiding third-party package installation in this workspace.

## Folder Structure

```text
frontend/               Browser UI and client audio pipeline
backend/
  audio/                VAD utilities
  conversation/         Prompting and history management
  pipeline/             Voice turn orchestration
  providers/            STT, LLM, TTS adapters
  session/              Session lifecycle and interruption state
  config.js             Environment management
  server.js             HTTP server and API routes
  tests/                Node test suite
```
