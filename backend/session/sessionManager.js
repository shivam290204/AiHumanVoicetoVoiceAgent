'use strict';

const crypto = require('node:crypto');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(options = {}) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = {
      id,
      state: 'idle',
      voiceGender: options.voiceGender || 'female',
      history: [],
      interruptedTurnId: null,
      activeTurnId: null,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  require(id) {
    const session = this.get(id);
    if (!session) {
      const error = new Error('Voice session not found.');
      error.statusCode = 404;
      throw error;
    }
    return session;
  }

  updateState(session, state) {
    session.state = state;
    session.updatedAt = new Date().toISOString();
  }

  interrupt(session) {
    session.interruptedTurnId = session.activeTurnId;
    session.activeTurnId = null;
    this.updateState(session, 'listening');
  }

  end(id) {
    const session = this.get(id);
    if (session) this.updateState(session, 'ended');
    return this.sessions.delete(id);
  }
}

module.exports = { SessionManager };
