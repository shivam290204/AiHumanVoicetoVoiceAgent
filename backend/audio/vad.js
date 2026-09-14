'use strict';

function calculateRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return Math.sqrt(total / samples.length);
}

function isSpeechFrame(samples, threshold = 0.025) {
  return calculateRms(samples) >= threshold;
}

class VadStateMachine {
  constructor(options = {}) {
    this.speechThreshold = options.speechThreshold ?? 0.025;
    this.startFrames = options.startFrames ?? 2;
    this.endFrames = options.endFrames ?? 8;
    this.reset();
  }

  reset() {
    this.state = 'silence';
    this.speechFrames = 0;
    this.silenceFrames = 0;
  }

  accept(samples) {
    const speech = isSpeechFrame(samples, this.speechThreshold);
    if (speech) {
      this.speechFrames += 1;
      this.silenceFrames = 0;
    } else {
      this.silenceFrames += 1;
      this.speechFrames = 0;
    }

    if (this.state === 'silence' && this.speechFrames >= this.startFrames) {
      this.state = 'speaking';
      return 'speech_start';
    }

    if (this.state === 'speaking' && this.silenceFrames >= this.endFrames) {
      this.state = 'silence';
      return 'speech_end';
    }

    return this.state === 'speaking' ? 'speaking' : 'silence';
  }
}

module.exports = { calculateRms, isSpeechFrame, VadStateMachine };
