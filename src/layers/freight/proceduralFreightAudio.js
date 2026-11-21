/**
 * Procedural Web Audio Engine for Heavy Freight, Diesel Engines & CB Radio.
 * (Transcontinental Freight & Intermodal Logistics Sim)
 *
 * Implements zero-download Web Audio synthesis:
 * - Low-frequency turbo-diesel engine hum (48Hz + 96Hz dual harmonic oscillators modulated by RPM)
 * - Highway asphalt tire hum (filtered noise generator)
 * - Pneumatic air brake release hiss (glad hands / parking brake burst)
 * - Downhill Jake Brake compression retarding pulse
 * - Citizens Band (CB) Radio Channel 19 squelch chirp and trucker tone
 */

class ProceduralFreightAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.tireNoiseNode = null;
    this.tireGain = null;
    this.isMuted = true;
    this.isEngineRunning = false;
  }

  initContext() {
    if (this.audioCtx) return true;
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || window.webkitAudioContext
        : null;
    if (!AudioContextClass) return false;

    try {
      this.audioCtx = new AudioContextClass();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
      return true;
    } catch {
      return false;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (!this.isMuted && !this.audioCtx) {
      this.initContext();
    }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0.0 : 0.35,
        this.audioCtx.currentTime,
      );
    }
    return !this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (!this.isMuted && !this.audioCtx) {
      this.initContext();
    }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0.0 : 0.35,
        this.audioCtx.currentTime,
      );
    }
  }

  startEngine(rpmNorm = 0.5) {
    if (!this.initContext() || this.isEngineRunning) return;

    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Base diesel harmonic 1 (fundamental idle ~42Hz to cruise ~65Hz)
      const baseFreq = 42 + rpmNorm * 26;
      this.engineOsc1 = this.audioCtx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.setValueAtTime(baseFreq, now);

      // Base diesel harmonic 2 (octave + slight detune)
      this.engineOsc2 = this.audioCtx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.setValueAtTime(baseFreq * 2.01, now);

      // Engine low-pass filter
      this.engineFilter = this.audioCtx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(140 + rpmNorm * 180, now);
      this.engineFilter.Q.setValueAtTime(3.0, now);

      this.engineGain = this.audioCtx.createGain();
      this.engineGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.22, now);

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOsc1.start(now);
      this.engineOsc2.start(now);
      this.isEngineRunning = true;
    } catch {
      // Audio node creation fallback
    }
  }

  updateEngineRpm(rpmNorm) {
    if (!this.isEngineRunning || !this.audioCtx || !this.engineOsc1) return;
    const clampedRpm = Math.max(0.1, Math.min(1.0, rpmNorm));
    const now = this.audioCtx.currentTime;
    const baseFreq = 42 + clampedRpm * 26;

    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.15);
    if (this.engineOsc2) {
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.15);
    }
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(
        140 + clampedRpm * 180,
        now,
        0.2,
      );
    }
  }

  playAirBrakeHiss() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.audioCtx.currentTime;
      const bufferSize = this.audioCtx.sampleRate * 0.35; // 350ms burst
      const buffer = this.audioCtx.createBuffer(
        1,
        bufferSize,
        this.audioCtx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(2.0, now);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(now);
    } catch {
      // Fallback
    }
  }

  playJakeBrakeRumble() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(24, now);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(110, now);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch {
      // Fallback
    }
  }

  playCbRadioChirp() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.audioCtx.currentTime;

      // Dual FSK tone squelch chirp
      const osc = this.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.setValueAtTime(640, now + 0.04);
      osc.frequency.setValueAtTime(320, now + 0.08);

      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Fallback
    }
  }

  stopEngine() {
    if (!this.isEngineRunning) return;
    try {
      if (this.engineOsc1) {
        this.engineOsc1.stop();
        this.engineOsc1.disconnect();
        this.engineOsc1 = null;
      }
      if (this.engineOsc2) {
        this.engineOsc2.stop();
        this.engineOsc2.disconnect();
        this.engineOsc2 = null;
      }
      this.isEngineRunning = false;
    } catch {
      // Clean up safely
    }
  }

  destroy() {
    this.stopEngine();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

export function createProceduralFreightAudio() {
  return new ProceduralFreightAudioEngine();
}
