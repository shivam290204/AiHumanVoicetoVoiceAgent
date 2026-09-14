'use strict';

const { MockSttProvider, MockLlmProvider, MockTtsProvider } = require('./mock');
const { GeminiLlmProvider } = require('./gemini');
const { OpenAiSttProvider, OpenAiLlmProvider, OpenAiTtsProvider } = require('./openai');
const { AppError } = require('../errors');

function createProviders(config) {
  const stt = config.providers.stt === 'openai'
    ? new OpenAiSttProvider({ ...config.openai, timeoutMs: config.requestTimeoutMs })
    : config.providers.stt === 'mock'
      ? new MockSttProvider()
      : null;

  const llm = config.providers.llm === 'openai'
    ? new OpenAiLlmProvider({ ...config.openai, timeoutMs: config.requestTimeoutMs })
    : config.providers.llm === 'gemini'
      ? new GeminiLlmProvider({ ...config.gemini, timeoutMs: config.requestTimeoutMs })
      : config.providers.llm === 'mock'
        ? new MockLlmProvider()
        : null;

  const tts = config.providers.tts === 'openai'
    ? new OpenAiTtsProvider({ ...config.openai, timeoutMs: config.requestTimeoutMs })
    : config.providers.tts === 'mock'
      ? new MockTtsProvider()
      : null;

  if (!stt || !llm || !tts) {
    throw new AppError('Unsupported provider configuration.', 500, 'BAD_PROVIDER_CONFIG', config.providers);
  }

  return { stt, llm, tts };
}

module.exports = { createProviders };
