'use strict';

const SILENT_WAV_BASE64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

class MockSttProvider {
  async transcribe({ audioBuffer }) {
    if (!audioBuffer || audioBuffer.length < 64) {
      return { text: '', confidence: 0, partial: false };
    }
    return {
      text: 'Hello, I would like to have a natural voice conversation.',
      confidence: 0.99,
      partial: false
    };
  }
}

class MockLlmProvider {
  async generate({ messages }) {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const text = (lastUser?.content || '').trim();
    const reply = createLocalAssistantReply(text, messages);
    return {
      text: reply,
      usage: { inputTokens: messages.length * 8, outputTokens: Math.ceil(reply.length / 4) }
    };
  }
}

class MockTtsProvider {
  async synthesize({ text, voiceGender }) {
    return {
      audioBase64: null,
      mimeType: 'audio/wav',
      voice: voiceGender === 'male' ? 'mock-male' : 'mock-female',
      text
    };
  }
}

function createLocalAssistantReply(text, messages = []) {
  const lower = text.toLowerCase();
  const rememberedName = findRememberedName(messages);
  const statedName = extractName(text);

  if (statedName) {
    return `Nice to meet you, ${statedName}. I will remember your name for this session.`;
  }

  if (/\b(my name|who am i|what'?s my name|remember my name)\b/i.test(text)) {
    return rememberedName
      ? `Your name is ${rememberedName}.`
      : 'I do not know your name yet. Tell me your name and I will remember it for this session.';
  }

  if (/\b(rice|chawal|cook rice|make rice)\b/i.test(text)) {
    return 'Rinse one cup of rice, add two cups of water, bring it to a boil, then cover and simmer on low for about fifteen minutes. Turn off the heat and let it rest for five minutes before serving.';
  }

  if (/\bexplain\b/i.test(text)) {
    const previousUser = previousUserMessage(messages, text);
    if (previousUser && /\b(rice|cook|make)\b/i.test(previousUser)) {
      return 'The simple idea is steam control. Rinsing removes extra starch, simmering lets the grains absorb water slowly, and resting finishes the texture without burning the bottom.';
    }
    return 'Sure. Tell me what you want explained, and I will keep it simple and spoken-friendly.';
  }

  if (/\b(can you tell me about|tell me about)\b/i.test(text)) {
    return 'Yes. Tell me the topic after “about,” and I will explain it clearly in a few short sentences.';
  }

  if (/\b(hello|hi|hey)\b/i.test(lower)) {
    return rememberedName
      ? `Hi ${rememberedName}. I am listening. What would you like to talk about?`
      : 'Hi. I am listening. What would you like to talk about?';
  }

  if (/\b(thank|thanks)\b/i.test(lower)) {
    return 'You are welcome.';
  }

  return 'I am running in local fallback mode, so I can handle simple conversation and a few common tasks. For a fully intelligent assistant, add an API key and set the LLM provider to OpenAI.';
}

function extractName(text) {
  const match = text.match(/\bmy name is\s+([a-z][a-z\s.'-]{1,50})/i);
  if (!match) return '';
  return titleCase(match[1].replace(/[.!?]+$/g, '').trim());
}

function findRememberedName(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const name = extractName(message.content || '');
    if (name) return name;
  }
  return '';
}

function previousUserMessage(messages, currentText) {
  const normalizedCurrent = currentText.trim().toLowerCase();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const content = String(message.content || '').trim();
    if (content.toLowerCase() !== normalizedCurrent) return content;
  }
  return '';
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = {
  MockSttProvider,
  MockLlmProvider,
  MockTtsProvider,
  SILENT_WAV_BASE64,
  createLocalAssistantReply
};
