'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(filePath = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createConfig() {
  loadDotEnv();
  return {
    host: process.env.HOST || '127.0.0.1',
    port: numberEnv('PORT', 8787),
    logLevel: process.env.LOG_LEVEL || 'info',
    providers: {
      stt: process.env.STT_PROVIDER || 'mock',
      llm: process.env.LLM_PROVIDER || 'mock',
      tts: process.env.TTS_PROVIDER || 'mock'
    },

    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest'
    },
    defaultVoiceGender: process.env.DEFAULT_VOICE_GENDER || 'female',
    maxHistoryMessages: numberEnv('MAX_HISTORY_MESSAGES', 16),
    requestTimeoutMs: numberEnv('REQUEST_TIMEOUT_MS', 30000)
  };
}

module.exports = { createConfig, loadDotEnv };
