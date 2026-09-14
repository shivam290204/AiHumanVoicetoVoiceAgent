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
  return new AppError(`Gemini API Error (${response.status}): ${body.slice(0, 200)}`, response.status, 'PROVIDER_ERROR', {
    status: response.status,
    body: body.slice(0, 500)
  });
}

class GeminiLlmProvider {
  constructor(config) {
    this.config = config;
  }

  async generate({ messages }) {
    if (!this.config.apiKey) throw new AppError('GEMINI_API_KEY is required for Gemini LLM.', 500, 'MISSING_SECRET');
    
    // Extract system message
    const systemMessage = messages.find(m => m.role === 'system');
    let system_instruction = undefined;
    if (systemMessage) {
      system_instruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    // Map history to Gemini format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction,
        contents,
        generationConfig: {
          maxOutputTokens: 180
        }
      })
    }, this.config.timeoutMs);

    if (!response.ok) throw await parseProviderError(response);
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Try to normalize usage if available
    let usage = null;
    if (data.usageMetadata) {
      usage = {
        prompt_tokens: data.usageMetadata.promptTokenCount,
        completion_tokens: data.usageMetadata.candidatesTokenCount,
        total_tokens: data.usageMetadata.totalTokenCount
      };
    }

    return { text: text.trim(), usage };
  }
}

module.exports = { GeminiLlmProvider };
