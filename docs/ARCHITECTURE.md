# Architecture

## Runtime Shape

The app is split into a browser client and a Node server.

- Browser: microphone permission, browser speech recognition, audio capture, VAD, barge-in, playback, and visible conversation state.
- Server: session lifecycle, provider orchestration, conversation context, error handling, and static file hosting.
- Providers: replaceable STT, LLM, and TTS classes selected by environment variables.

The implementation intentionally has no npm runtime dependencies because this workspace has a broken package manager. The boundaries are still production-oriented, so teams can later swap the transport to WebSockets, add Redis-backed sessions, or use a streaming provider SDK.

## Voice Turn Lifecycle

1. The user starts a session from the UI.
2. In local browser speech mode, browser speech recognition listens and sends final transcript text to `/api/text-turns`.
3. In provider mode, the browser asks for microphone permission and starts a Web Audio VAD loop.
4. When speech crosses the VAD threshold, `MediaRecorder` begins collecting audio chunks.
5. When silence remains long enough, the client closes the turn and sends audio to `/api/turns`.
6. The server transcribes audio through the configured STT provider, or uses the browser transcript directly.
7. The transcript is appended to session history.
8. The LLM receives the voice-specific system prompt plus bounded conversation history.
9. The assistant response is normalized for speech and appended to history.
10. TTS synthesizes the assistant response in provider mode, or browser speech synthesis speaks it in local mode.
11. The browser resumes listening.

## Barge-In

While audio is playing, the browser keeps monitoring microphone energy. If the user starts speaking, playback stops immediately and `/api/interrupt` marks the active session as listening. The next user utterance becomes the priority turn.

## Provider Replacement

Provider construction is centralized in `src/providers/index.js`.

- STT contract: `transcribe({ audioBuffer, mimeType, session }) -> { text, confidence, partial }`
- LLM contract: `generate({ messages, session }) -> { text, usage }`
- TTS contract: `synthesize({ text, voiceGender, session }) -> { audioBase64, mimeType, voice }`

To add a new provider, create a class that satisfies one of these contracts and update `createProviders`.

## Error Handling

The server converts known failures into structured JSON errors. The browser maps common failures, such as microphone denial or empty speech, into short user-facing messages.

Covered failure classes include:

- Missing or invalid JSON
- Request body too large
- Empty audio
- Unknown session
- Missing provider secret
- Provider timeout
- Provider HTTP error
- Unexpected pipeline failure

## Scaling Path

For production multi-user deployment:

- Put the server behind TLS so microphone APIs work reliably.
- Add authentication and associate sessions with user IDs.
- Move session history from memory to Redis or a database.
- Add per-user rate limits and request-size limits at the edge.
- Add traces and metrics for STT latency, LLM latency, TTS latency, total turn time, errors, and provider costs.
- Upgrade `/api/turns` to a WebSocket or WebRTC transport for true bidirectional audio streaming.
- Use streaming STT partials and LLM token streaming when the chosen provider supports it.
- Stream TTS audio chunks to playback as soon as possible.

## Current Limitations

The app is production-shaped but dependency-light. It performs real local browser speech and interruption, but it sends each detected utterance as a complete turn over HTTP. True chunk-by-chunk duplex streaming is the next transport upgrade.
