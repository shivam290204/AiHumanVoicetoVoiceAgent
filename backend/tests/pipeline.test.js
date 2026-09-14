'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionManager } = require('../session/sessionManager');
const { ConversationManager } = require('../conversation/conversationManager');
const { VoiceAgent } = require('../pipeline/voiceAgent');
const { MockSttProvider, MockLlmProvider, MockTtsProvider } = require('../providers/mock');
const { createLogger } = require('../logger');

test('voice pipeline transcribes, responds, synthesizes, and stores context', async () => {
  const sessions = new SessionManager();
  const session = sessions.create();
  const agent = new VoiceAgent({
    sessions,
    conversation: new ConversationManager(),
    providers: {
      stt: new MockSttProvider(),
      llm: new MockLlmProvider(),
      tts: new MockTtsProvider()
    },
    logger: createLogger('error')
  });

  const result = await agent.processTurn({
    sessionId: session.id,
    audioBuffer: Buffer.alloc(256, 1),
    mimeType: 'audio/webm',
    voiceGender: 'female'
  });

  assert.match(result.transcript, /natural voice conversation|rice is cooked|something interesting/);
  assert.ok(result.responseText.length > 0);
  assert.equal(result.audio.mimeType, 'audio/wav');
  assert.equal(session.history.length, 2);
});

test('voice pipeline rejects empty audio', async () => {
  const sessions = new SessionManager();
  const session = sessions.create();
  const agent = new VoiceAgent({
    sessions,
    conversation: new ConversationManager(),
    providers: {
      stt: new MockSttProvider(),
      llm: new MockLlmProvider(),
      tts: new MockTtsProvider()
    },
    logger: createLogger('error')
  });

  await assert.rejects(
    () => agent.processTurn({ sessionId: session.id, audioBuffer: Buffer.alloc(0), mimeType: 'audio/webm' }),
    /No useful speech/
  );
});

test('text turn pipeline uses transcript directly and skips server TTS by default', async () => {
  const sessions = new SessionManager();
  const session = sessions.create();
  const agent = new VoiceAgent({
    sessions,
    conversation: new ConversationManager(),
    providers: {
      stt: new MockSttProvider(),
      llm: new MockLlmProvider(),
      tts: new MockTtsProvider()
    },
    logger: createLogger('error')
  });

  const result = await agent.processTextTurn({
    sessionId: session.id,
    transcript: 'Can you hear this real sentence?',
    voiceGender: 'male'
  });

  assert.equal(result.transcript, 'Can you hear this real sentence?');
  assert.equal(result.audio, null);
  assert.ok(result.responseText.length > 0);
  assert.equal(session.state, 'listening');
  assert.equal(session.history.length, 2);
});

test('local fallback answers useful questions and uses conversation context', async () => {
  const sessions = new SessionManager();
  const session = sessions.create();
  const agent = new VoiceAgent({
    sessions,
    conversation: new ConversationManager(),
    providers: {
      stt: new MockSttProvider(),
      llm: new MockLlmProvider(),
      tts: new MockTtsProvider()
    },
    logger: createLogger('error')
  });

  const nameTurn = await agent.processTextTurn({
    sessionId: session.id,
    transcript: 'Hi my name is shivam tiwali'
  });
  assert.match(nameTurn.responseText, /Shivam Tiwali/);

  const riceTurn = await agent.processTextTurn({
    sessionId: session.id,
    transcript: 'Can you tell me how to make rice'
  });
  assert.match(riceTurn.responseText, /Rinse one cup of rice/);

  const explainTurn = await agent.processTextTurn({
    sessionId: session.id,
    transcript: 'Explain'
  });
  assert.match(explainTurn.responseText, /steam control/);
});
