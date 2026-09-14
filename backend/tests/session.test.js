'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionManager } = require('../session/sessionManager');

test('session manager creates, interrupts, and ends sessions', () => {
  const sessions = new SessionManager();
  const session = sessions.create({ voiceGender: 'male' });
  session.activeTurnId = 'turn-1';
  sessions.interrupt(session);
  assert.equal(session.voiceGender, 'male');
  assert.equal(session.interruptedTurnId, 'turn-1');
  assert.equal(session.state, 'listening');
  assert.equal(sessions.end(session.id), true);
});
