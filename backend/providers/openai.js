'use strict';

const { AppError } = require('../errors');

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError('The provider request timed out.', 504, 'PROVIDER_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseProviderError(response) {
  let body = '';
  try {
    body = await response.text();
  } catch {
    body = response.statusText;
  }
  return new AppError(`OpenAI API Error (${response.status}): ${body.slice(0, 200)}`, response.status, 'PROVIDER_ERROR', {
    status: response.status,
    body: body.slice(0, 500)
  });
}

class OpenAiSttProvider {
  constructor(config) {
    this.config = config;
  }

  async transcribe({ audioBuffer, mimeType }) {
    if (!this.config.apiKey) throw new AppError('OPENAI_API_KEY is required for OpenAI STT.', 500, 'MISSING_SECRET');

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', this.config.sttModel || 'whisper-1');

    const url = `${this.config.baseUrl}/audio/transcriptions`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: formData
    }, this.config.timeoutMs);

    if (!response.ok) throw await parseProviderError(response);
    
    const data = await response.json();
    return { text: (data.text || '').trim(), confidence: 1.0, partial: false };
  }
}

class OpenAiLlmProvider {
  constructor(config) {
    this.config = config;
  }

  async generate({ messages }) {
    if (!this.config.apiKey) throw new AppError('OPENAI_API_KEY is required for OpenAI LLM.', 500, 'MISSING_SECRET');

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.llmModel || 'gpt-4o-mini',
        messages,
        max_tokens: 180
      })
    }, this.config.timeoutMs);

    if (!response.ok) throw await parseProviderError(response);
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    let usage = null;
    if (data.usage) {
      usage = {
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens
      };
    }

    return { text: text.trim(), usage };
  }
}

class OpenAiTtsProvider {
  constructor(config) {
    this.config = config;
  }

  async synthesize({ text, voiceGender }) {
    if (!this.config.apiKey) throw new AppError('OPENAI_API_KEY is required for OpenAI TTS.', 500, 'MISSING_SECRET');

    const url = `${this.config.baseUrl}/audio/speech`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.ttsModel || 'tts-1',
        input: text,
        voice: voiceGender === 'male' ? (this.config.ttsVoiceMale || 'onyx') : (this.config.ttsVoiceFemale || 'nova'),
        response_format: 'mp3',
        speed: this.config.ttsSpeed || 1.0,
        instructions: this.config.ttsInstructions
      })
    }, this.config.timeoutMs);

    if (!response.ok) throw await parseProviderError(response);
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
    
    return {
      audioBase64,
      mimeType: 'audio/mp3',
      voice: voiceGender === 'male' ? (this.config.ttsVoiceMale || 'onyx') : (this.config.ttsVoiceFemale || 'nova'),
      text
    };
  }
}

module.exports = { OpenAiSttProvider, OpenAiLlmProvider, OpenAiTtsProvider };
