'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRms, isSpeechFrame, VadStateMachine } = require('../audio/vad');

test('calculates RMS for audio samples', () => {
  assert.equal(calculateRms(new Float32Array([0, 0, 0])), 0);
  assert.ok(calculateRms(new Float32Array([1, -1])) > 0.99);
});

test('detects speech frames above threshold', () => {
  assert.equal(isSpeechFrame(new Float32Array([0.001, 0.002]), 0.01), false);
  assert.equal(isSpeechFrame(new Float32Array([0.1, -0.1]), 0.01), true);
});

test('VAD state machine emits start and end events', () => {
  const vad = new VadStateMachine({ speechThreshold: 0.01, startFrames: 2, endFrames: 2 });
  assert.equal(vad.accept(new Float32Array([0.1])), 'silence');
  assert.equal(vad.accept(new Float32Array([0.1])), 'speech_start');
  assert.equal(vad.accept(new Float32Array([0])), 'speaking');
  assert.equal(vad.accept(new Float32Array([0])), 'speech_end');
});
