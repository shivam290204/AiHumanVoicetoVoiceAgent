'use strict';

const { buildMessages } = require('./prompt');

class ConversationManager {
  constructor(options = {}) {
    this.maxHistoryMessages = options.maxHistoryMessages ?? 16;
  }

  append(session, role, content) {
    session.history.push({ role, content, at: new Date().toISOString() });
    if (session.history.length > this.maxHistoryMessages) {
      session.history = session.history.slice(-this.maxHistoryMessages);
    }
  }

  messagesFor(session, userText) {
    const history = session.history.map(({ role, content }) => ({ role, content }));
    return buildMessages(history, userText);
  }
}

module.exports = { ConversationManager };
