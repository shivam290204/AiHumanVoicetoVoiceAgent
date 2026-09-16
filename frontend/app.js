'use strict';

const state = {
  ws: null,
  mediaStream: null,
  audioContext: null,
  audioProcessor: null,
  audioSource: null,
  nextPlayTime: 0,
  isStarting: false,
};

const ui = {
  start: document.querySelector('#startButton'),
  stop: document.querySelector('#stopButton'),
  interrupt: document.querySelector('#interruptButton'),
  state: document.querySelector('#stateLabel'),
  micStatus: document.querySelector('#micStatus'),
  messages: document.querySelector('#messages'),
  session: document.querySelector('#sessionLabel'),
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
    if (!state.ws) startAgent();
  }
  if (e.code === 'Escape') {
    interruptAgent();
  }
});

if (ui.start) ui.start.addEventListener('click', startAgent);
if (ui.stop) ui.stop.addEventListener('click', stopAgent);
if (ui.interrupt) ui.interrupt.addEventListener('click', interruptAgent);

async function startAgent() {
  if (state.isStarting || state.ws) return;
  state.isStarting = true;
  ui.start.disabled = true;
  ui.messages.replaceChildren();
  setUiState('processing', 'Requesting microphone access...');

  try {
    // 1. Get local microphone
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1
      }
    });

    // 2. Connect WebSocket to our FastAPI proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/gemini`;
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        startTimeMs = Date.now();
        ui.session.textContent = `SESSION: ACTIVE (GEMINI)`;
        if (ui.micStatus) {
            ui.micStatus.innerHTML = `<span class="icon-mic"></span> MIC ON`;
            ui.micStatus.style.color = "var(--red)";
        }
        addMessage('system', 'Hello! How can I help you today?');
        setUiState('listening', 'Listening. Speak naturally.');
        
        startAudioProcessing();
        ui.stop.disabled = false;
        ui.interrupt.disabled = false;
    };

    state.ws.onmessage = handleServerEvent;
    
    state.ws.onclose = () => {
        stopAgent();
    };

    state.ws.onerror = (err) => {
        addMessage('system', 'WebSocket error occurred.');
        stopAgent();
    };
    
  } catch (error) {
    addMessage('system', `Error: ${error.message}`);
    await stopAgent();
  } finally {
    state.isStarting = false;
  }
}

function startAudioProcessing() {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    state.audioSource = state.audioContext.createMediaStreamSource(state.mediaStream);
    
    // We need 16kHz PCM data. Using ScriptProcessorNode for simplicity across browsers
    state.audioProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
    
    state.audioProcessor.onaudioprocess = (e) => {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Base64 encode
        const buffer = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
            binary += String.fromCharCode(buffer[i]);
        }
        const base64 = btoa(binary);
        
        const msg = {
            "realtimeInput": {
                "mediaChunks": [{
                    "mimeType": "audio/pcm;rate=16000",
                    "data": base64
                }]
            }
        };
        state.ws.send(JSON.stringify(msg));
    };
    
    state.audioSource.connect(state.audioProcessor);
    state.audioProcessor.connect(state.audioContext.destination);
    
    // Initialize playback timing
    state.nextPlayTime = state.audioContext.currentTime;
}

function playBase64Pcm(base64) {
    if (!state.audioContext) return;
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for(let i=0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
    }
    
    const buffer = state.audioContext.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);
    
    const source = state.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext.destination);
    
    // Schedule gapless playback
    if (state.nextPlayTime < state.audioContext.currentTime) {
        state.nextPlayTime = state.audioContext.currentTime;
    }
    source.start(state.nextPlayTime);
    state.nextPlayTime += buffer.duration;
}

async function handleServerEvent(e) {
  try {
    const event = JSON.parse(e.data);
    
    if (event.serverContent && event.serverContent.modelTurn) {
        setUiState('speaking', 'Agent speaking...');
        const parts = event.serverContent.modelTurn.parts;
        for (let part of parts) {
            // Text response
            if (part.text) {
                addMessage('assistant', part.text);
                setUiState('listening', 'Listening. Speak naturally.');
            }
            // Audio response
            if (part.inlineData && part.inlineData.data) {
                playBase64Pcm(part.inlineData.data);
            }
        }
    }
    
  } catch (err) {
    console.error('Failed to parse realtime event:', err);
  }
}

async function stopAgent() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  if (state.audioProcessor) {
    state.audioProcessor.disconnect();
    state.audioProcessor = null;
  }
  if (state.audioSource) {
    state.audioSource.disconnect();
    state.audioSource = null;
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }
  
  ui.start.disabled = false;
  ui.stop.disabled = true;
  ui.interrupt.disabled = true;
  ui.session.textContent = 'SESSION IDLE';
  if (ui.micStatus) {
    ui.micStatus.innerHTML = `<span class="icon-mic"></span> MIC OFF`;
    ui.micStatus.style.color = "inherit";
  }
  setUiState('idle', 'Press SPACE to start.');
  addMessage('system', 'Session ended.');
}

function interruptAgent() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    
    // Gemini Live API lets you clear the playback queue to stop audio
    // For now we just reset our local playback time to drop incoming audio that is queued
    state.nextPlayTime = 0;
    
    // Send clear command to Gemini
    state.ws.send(JSON.stringify({ clientContent: { turnComplete: true }}));
    
    setUiState('listening', 'Agent interrupted. Listening...');
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
      <span class="msg-tag blue">REALTIME // WEBSOCKET</span>
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
