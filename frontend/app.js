'use strict';

const state = {
  sessionId: null,
  mediaStream: null,
  mediaRecorder: null,
  audioContext: null,
  analyser: null,
  vadTimer: null,
  chunks: [],
  isSpeaking: false,
  isProcessing: false,
  voiceGender: 'female',
  playback: null,
  recognition: null,
  useBrowserSpeech: false,
  recognitionPaused: false,
  isStarting: false,
  lastTranscript: '',
  lastTranscriptAt: 0,
  lastTranscriptAt: 0,
  speechStartMs: 0,
  silenceStartMs: 0,
  ws: null
};

const ui = {
  start: document.querySelector('#startButton'),
  stop: document.querySelector('#stopButton'),
  interrupt: document.querySelector('#interruptButton'),
  state: document.querySelector('#stateLabel'),
  micStatus: document.querySelector('#micStatus'),
  messages: document.querySelector('#messages'),
  session: document.querySelector('#sessionLabel'),
  voiceButtons: [...document.querySelectorAll('.voice-card')],
  languageSelect: document.querySelector('#languageSelect')
};

let startTimeMs = 0;

function formatTimestamp() {
  if (!startTimeMs) return 'T+00:00.00';
  const diff = Date.now() - startTimeMs;
  const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
  const secs = ((diff % 60000) / 1000).toFixed(2).padStart(5, '0');
  return `T+${mins}:${secs}`;
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    if (!state.sessionId) startAgent();
  }
  if (e.code === 'Escape') {
    interruptAgent();
  }
});

ui.start.addEventListener('click', startAgent);
ui.stop.addEventListener('click', stopAgent);
ui.interrupt.addEventListener('click', interruptAgent);
for (const button of ui.voiceButtons) {
  button.addEventListener('click', () => setVoice(button.dataset.voice));
}

async function startAgent() {
  if (state.isStarting || state.sessionId) return;
  state.isStarting = true;
  ui.start.disabled = true;
  ui.messages.replaceChildren();
  try {
    setUiState('processing', 'Requesting microphone access...');
    const health = await api('/api/health');
    state.useBrowserSpeech = health.providers?.stt === 'mock' || health.providers?.tts === 'mock';
    const sessionResponse = await api('/api/sessions', {
      method: 'POST',
      body: { voiceGender: state.voiceGender }
    });
    state.sessionId = sessionResponse.session.id;
    startTimeMs = Date.now();
    ui.session.textContent = `SESSION ID: ${state.sessionId.slice(0, 8)}`;
    if (ui.micStatus) {
      ui.micStatus.innerHTML = `<span class="icon-mic"></span> MIC ON`;
      ui.micStatus.style.color = "var(--red)";
    }

    state.ws = new WebSocket(`ws://${location.host}`);
    state.ws.onopen = () => {
      state.ws.send(JSON.stringify({ type: 'init', sessionId: state.sessionId }));
    };
    state.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'turn_result') {
        const result = data.result;
        if (result.transcript && !state.useBrowserSpeech) addMessage('user', result.transcript);
        addMessage('assistant', result.responseText);
        if (result.audio?.audioBase64) {
          setUiState('speaking', 'Speaking...');
          await playAudio(result.audio.audioBase64, result.audio.mimeType);
        } else {
          setUiState('speaking', 'Speaking...');
          await speakWithBrowser(result.responseText);
        }
        setUiState('listening', 'Listening. Speak naturally.');
        state.isProcessing = false;
      } else if (data.type === 'error') {
        addMessage('system', data.error);
        setUiState('listening', 'Listening. Try again when ready.');
        state.isProcessing = false;
      }
    };

    if (state.useBrowserSpeech) {
      startBrowserSpeechRecognition();
      ui.stop.disabled = false;
      ui.interrupt.disabled = false;
      const brainLabel = health.providers?.llm === 'mock' ? 'local fallback brain' : 'configured AI brain';
      addMessage('system', `Voice session started with browser speech and ${brainLabel}.`);
      setUiState('listening', 'Listening with your browser microphone.');
      return;
    }

    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    setupVAD(state.mediaStream);
    ui.stop.disabled = false;
    ui.interrupt.disabled = false;
    addMessage('system', 'Voice session started.');
    setUiState('listening', 'Listening. Speak naturally.');
  } catch (error) {
    addMessage('system', friendlyError(error));
    await stopAgent();
  } finally {
    state.isStarting = false;
  }
}

async function stopAgent() {
  stopPlayback();
  stopBrowserSpeechRecognition();
  stopRecorder(false);
  if (state.vadTimer) clearInterval(state.vadTimer);
  state.vadTimer = null;
  if (state.audioContext) await state.audioContext.close().catch(() => {});
  state.audioContext = null;
  if (state.mediaStream) {
    for (const track of state.mediaStream.getTracks()) track.stop();
  }
  if (state.sessionId) {
    await fetch(`/api/sessions/${encodeURIComponent(state.sessionId)}`, { method: 'DELETE' }).catch(() => {});
  }
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.sessionId = null;
  state.mediaStream = null;
  state.isSpeaking = false;
  state.isProcessing = false;
  state.useBrowserSpeech = false;
  state.isStarting = false;
  ui.start.disabled = false;
  ui.stop.disabled = true;
  ui.interrupt.disabled = true;
  ui.session.textContent = 'SESSION IDLE';
  if (ui.micStatus) {
    ui.micStatus.innerHTML = `<span class="icon-mic"></span> MIC OFF`;
    ui.micStatus.style.color = "inherit";
  }
  setUiState('idle', 'Press SPACE to start.');
}

async function interruptAgent() {
  stopPlayback();
  cancelBrowserSpeech();
  if (state.sessionId) {
    await api('/api/interrupt', {
      method: 'POST',
      body: { sessionId: state.sessionId }
    }).catch(() => {});
  }
  setUiState('listening', 'Listening. Go ahead.');
}

function startBrowserSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('This browser does not support built-in speech recognition. Use Chrome or Edge, or configure real STT/TTS API keys in .env.');
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = ui.languageSelect ? ui.languageSelect.value : (navigator.language || 'en-US');

  recognition.onspeechstart = () => {
    if (speechSynthesis.speaking) interruptAgent();
    if (!state.isProcessing) setUiState('listening', 'Listening...');
  };

  recognition.onresult = (event) => {
    let finalText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalText += result[0].transcript;
    }
    const transcript = finalText.trim();
    if (transcript) sendTextTurn(transcript);
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech') return;
    addMessage('system', `Speech recognition error: ${event.error}.`);
    setUiState('listening', 'Listening. Try again when ready.');
  };

  recognition.onend = () => {
    if (state.sessionId && state.useBrowserSpeech && !state.recognitionPaused) {
      setTimeout(() => {
        try {
          if (state.recognition && !state.recognitionPaused) state.recognition.start();
        } catch (e) {}
      }, 50);
    }
  };

  state.recognition = recognition;
  recognition.start();
}

function stopBrowserSpeechRecognition() {
  if (!state.recognition) return;
  const recognition = state.recognition;
  state.recognition = null;
  state.recognitionPaused = false;
  recognition.onend = null;
  recognition.stop();
}

function pauseBrowserSpeechRecognition() {
  if (!state.recognition) return;
  state.recognitionPaused = true;
  state.recognition.stop();
}

function resumeBrowserSpeechRecognition() {
  if (!state.recognition || !state.sessionId || !state.useBrowserSpeech) return;
  state.recognitionPaused = false;
  try {
    state.recognition.start();
  } catch {
    // The browser can throw if recognition is already starting.
  }
}

function cancelBrowserSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
}

async function sendTextTurn(transcript) {
  const normalized = transcript.replace(/\s+/g, ' ').trim();
  const now = Date.now();
  if (!normalized || state.isProcessing) return;
  if (normalized === state.lastTranscript && now - state.lastTranscriptAt < 2500) return;
  state.lastTranscript = normalized;
  state.lastTranscriptAt = now;

  state.isProcessing = true;
  setUiState('processing', 'Thinking...');
  addMessage('user', normalized);
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'text_turn',
      transcript: normalized,
      synthesize: true
    }));
  } else {
    state.isProcessing = false;
  }
}

function setupVAD(stream) {
  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 1024;
  source.connect(state.analyser);
  const data = new Float32Array(state.analyser.fftSize);
  state.vadTimer = setInterval(() => {
    state.analyser.getFloatTimeDomainData(data);
    const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    handleVadFrame(rms);
  }, 80);
}

function handleVadFrame(rms) {
  if (!state.sessionId || state.isProcessing) return;
  const now = performance.now();
  const speech = rms > 0.025;

  if (speech && state.playback) {
    interruptAgent();
  }

  if (speech && !state.isSpeaking) {
    state.speechStartMs = now;
    state.isSpeaking = true;
    state.chunks = [];
    startRecorder();
    setUiState('listening', 'Listening...');
  }

  if (!speech && state.isSpeaking) {
    if (!state.silenceStartMs) state.silenceStartMs = now;
    if (now - state.silenceStartMs > 800 && now - state.speechStartMs > 450) {
      state.isSpeaking = false;
      state.silenceStartMs = 0;
      stopRecorder(true);
    }
  }

  if (speech) state.silenceStartMs = 0;
}

function startRecorder() {
  if (state.mediaRecorder?.state === 'recording') return;
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  state.mediaRecorder = new MediaRecorder(state.mediaStream, { mimeType });
  
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'start_turn', mimeType }));
  }

  state.mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size && state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(event.data);
    }
  });
  state.mediaRecorder.addEventListener('stop', () => {
    if (state.mediaRecorder?.datasetShouldSend === 'true') {
      state.isProcessing = true;
      setUiState('processing', 'Understanding...');
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'end_turn' }));
      }
    }
  });
  state.mediaRecorder.start(120);
}

function stopRecorder(shouldSend) {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
  state.mediaRecorder.datasetShouldSend = shouldSend ? 'true' : 'false';
  state.mediaRecorder.stop();
}

function setVoice(voiceGender) {
  state.voiceGender = voiceGender;
  for (const button of ui.voiceButtons) {
    if (button.dataset.voice === voiceGender) {
      button.classList.add('active');
      button.querySelector('.voice-checkbox').textContent = '■';
    } else {
      button.classList.remove('active');
      button.querySelector('.voice-checkbox').textContent = '□';
    }
  }
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) return resolve();
    pauseBrowserSpeechRecognition();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.pitch = state.voiceGender === 'male' ? 0.86 : 1.05;
    utterance.volume = 1;
    const voices = speechSynthesis.getVoices();
    const preferred = pickBrowserVoice(voices, state.voiceGender);
    if (preferred) utterance.voice = preferred;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    state.playback = { pause: () => speechSynthesis.cancel(), currentTime: 0 };
    speechSynthesis.speak(utterance);
  }).finally(() => {
    state.playback = null;
    resumeBrowserSpeechRecognition();
  });
}

function pickBrowserVoice(voices, voiceGender) {
  const selectedLang = ui.languageSelect ? ui.languageSelect.value : 'en-US';
  const langPrefix = selectedLang.split('-')[0].toLowerCase();
  
  let pool = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (pool.length === 0) pool = voices;

  const femaleHints = ['female', 'woman', 'zira', 'jenny', 'aria', 'samantha', 'susan', 'kalpana', 'swara'];
  const maleHints = ['male', 'man', 'david', 'guy', 'mark', 'george', 'ryan', 'hemant', 'madhur'];
  const hints = voiceGender === 'male' ? maleHints : femaleHints;
  return pool.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint))) || pool[0] || null;
}

function setUiState(name, hint) {
  if (ui.state) ui.state.textContent = name === 'processing' ? 'Processing...' : (name === 'speaking' ? 'Agent speaking...' : hint);
}

function addMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${role === 'user' ? 'user' : 'ai'}`;
  
  if (role === 'system') {
    wrapper.innerHTML = `
      <div class="msg-meta"><span class="msg-tag dark">SYSTEM NOTIFICATION</span></div>
      <div class="msg-bubble" style="color: var(--red); font-weight: bold;">${text}</div>
    `;
    ui.messages.append(wrapper);
    wrapper.scrollIntoView({ block: 'end' });
    return;
  }

  let metaHtml = '';
  const time = formatTimestamp();
  if (role === 'user') {
    metaHtml = `
      <span class="msg-tag">SPEECH DETECTED</span>
      <span class="msg-time">${time}</span>
      <span class="msg-tag dark">USER</span>
    `;
  } else {
    metaHtml = `
      <span class="msg-tag dark">AI AGENT</span>
      <span class="msg-tag blue">${state.voiceGender.toUpperCase()} // 24KHZ</span>
      <span class="msg-time">${time}</span>
    `;
  }
  
  wrapper.innerHTML = `
    <div class="msg-meta">${metaHtml}</div>
    <div class="msg-bubble">${text}</div>
  `;
  
  ui.messages.append(wrapper);
  wrapper.scrollIntoView({ block: 'end' });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Request failed.');
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function playAudio(base64, mimeType) {
  return new Promise((resolve) => {
    stopPlayback();
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    state.playback = audio;
    audio.onended = () => {
      state.playback = null;
      resolve();
    };
    audio.onerror = () => {
      state.playback = null;
      resolve();
    };
    audio.play().catch(resolve);
  });
}

function stopPlayback() {
  if (!state.playback) return;
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (typeof state.playback.pause === 'function') state.playback.pause();
  if ('currentTime' in state.playback) state.playback.currentTime = 0;
  state.playback = null;
}

function friendlyError(error) {
  if (error.name === 'NotAllowedError') return 'Microphone permission was denied. Enable microphone access and start again.';
  if (error.code === 'EMPTY_AUDIO') return 'I did not hear enough speech. Please try again.';
  return error.message || 'Something went wrong. Please try again.';
}
