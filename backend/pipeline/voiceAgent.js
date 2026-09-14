'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../errors');

class VoiceAgent {
  constructor({ sessions, conversation, providers, logger }) {
    this.sessions = sessions;
    this.conversation = conversation;
    this.providers = providers;
    this.logger = logger;
  }

  async processTurn({ sessionId, audioBuffer, mimeType, voiceGender }) {
    const session = this.sessions.require(sessionId);
    const turnId = crypto.randomUUID();
    session.activeTurnId = turnId;
    session.voiceGender = voiceGender || session.voiceGender;
    this.sessions.updateState(session, 'transcribing');

    if (!audioBuffer || audioBuffer.length < 32) {
      throw new AppError('No useful speech audio was received.', 400, 'EMPTY_AUDIO');
    }

    try {
      const stt = await this.providers.stt.transcribe({ audioBuffer, mimeType, session });
      const transcript = (stt.text || '').trim();
      return await this.respondToTranscript({ session, sessionId, turnId, transcript, synthesize: true });
    } catch (error) {
      session.activeTurnId = null;
      this.sessions.updateState(session, 'error');
      this.logger.error({ event: 'voice_turn_failed', sessionId, turnId, error: error.message });
      throw error;
    }
  }

  async processTextTurn({ sessionId, transcript, voiceGender, synthesize = false }) {
    const session = this.sessions.require(sessionId);
    const turnId = crypto.randomUUID();
    session.activeTurnId = turnId;
    session.voiceGender = voiceGender || session.voiceGender;

    try {
      return await this.respondToTranscript({
        session,
        sessionId,
        turnId,
        transcript: String(transcript || '').trim(),
        synthesize
      });
    } catch (error) {
      session.activeTurnId = null;
      this.sessions.updateState(session, 'error');
      this.logger.error({ event: 'text_turn_failed', sessionId, turnId, error: error.message });
      throw error;
    }
  }

  async respondToTranscript({ session, sessionId, turnId, transcript, synthesize }) {
    if (!transcript) {
      this.sessions.updateState(session, 'listening');
      session.activeTurnId = null;
      return {
        sessionId,
        turnId,
        state: session.state,
        transcript: '',
        responseText: 'I did not catch that. Could you say it again?',
        audio: null
      };
    }

    this.sessions.updateState(session, 'thinking');
    const messages = this.conversation.messagesFor(session, transcript);
    const llm = await this.providers.llm.generate({ messages, session });
    const responseText = normalizeSpokenResponse(llm.text);

    this.conversation.append(session, 'user', transcript);
    this.conversation.append(session, 'assistant', responseText);

    let audio = null;
    if (synthesize) {
      this.sessions.updateState(session, 'speaking');
      audio = await this.providers.tts.synthesize({
        text: responseText,
        voiceGender: session.voiceGender,
        session
      });
    }

    if (session.interruptedTurnId === turnId) {
      this.sessions.updateState(session, 'listening');
    } else {
      this.sessions.updateState(session, synthesize ? 'idle' : 'listening');
    }

    session.activeTurnId = null;
    return {
      sessionId,
      turnId,
      state: session.state,
      transcript,
      responseText,
      audio,
      usage: llm.usage || null
    };
  }
}

function normalizeSpokenResponse(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'I am here. Could you tell me a little more?';
  return cleaned.length > 700 ? `${cleaned.slice(0, 697).trim()}...` : cleaned;
}

module.exports = { VoiceAgent, normalizeSpokenResponse };
