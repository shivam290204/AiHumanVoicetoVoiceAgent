'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationManager } = require('../conversation/conversationManager');

test('conversation manager keeps bounded history', () => {
  const manager = new ConversationManager({ maxHistoryMessages: 2 });
  const session = { history: [] };
  manager.append(session, 'user', 'one');
  manager.append(session, 'assistant', 'two');
  manager.append(session, 'user', 'three');
  assert.deepEqual(session.history.map((message) => message.content), ['two', 'three']);
});

test('conversation context includes system prompt and current user text', () => {
  const manager = new ConversationManager({ maxHistoryMessages: 4 });
  const session = { history: [{ role: 'user', content: 'My name is Mira' }] };
  const messages = manager.messagesFor(session, 'What is my name?');
  assert.equal(messages[0].role, 'system');
  assert.equal(messages.at(-1).content, 'What is my name?');
});
