/**
 * Procedural Web Audio Engine for Custom Domiciles, Estates & Personal Fleet.
 * (Domiciles, Estates & Personal Fleet Terminal)
 *
 * Implements pure procedural Web Audio synthesis (zero external audio files):
 * - Home / Porch Ambience: Resonant harmonic wind chimes (pentatonic bells: 880Hz, 990Hz, 1320Hz, 1485Hz)
 * - Vacation / Coastal Waves: Gentle pink-noise tidal swell and breeze
 * - Cruiser Bicycle Bell: Crisp double mechanical bell ting (2400Hz dual pulses with exponential decay)
 * - Electric Scooter Motor: High-frequency PWM buzz proportional to throttle
 * - Electric Sedan Inverter: Smooth sine pitch glide (380Hz to 980Hz) matching acceleration
 */

import { createProceduralHelicopterAudio } from './proceduralHelicopterAudio.js';

class ProceduralEstateAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.inverterOsc = null;
    this.inverterGain = null;
    this.helicopterAudio = null;
    this.isMuted = true;
    this.currentMode = 'walk';
  }

  initContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return true;
    }
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || window.webkitAudioContext
        : null;
    if (!AudioContextClass) return false;

    try {
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
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
        this.isMuted ? 0.0 : 0.32,
        this.audioCtx.currentTime,
      );
    }
    return !this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (!this.isMuted && !this.audioCtx) {
      this.initContext();
    }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0.0 : 0.32,
        this.audioCtx.currentTime,
      );
    }
    return !this.isMuted;
  }

  setFleetMode(modeId) {
    const prevMode = this.currentMode;
    this.currentMode = String(modeId).toLowerCase();
    if (prevMode === 'h145' && this.currentMode !== 'h145') {
      this.helicopterAudio?.stop();
    }
    if (this.currentMode === 'h145' && !this.isMuted) {
      if (this.initContext() && !this.helicopterAudio) {
        this.helicopterAudio = createProceduralHelicopterAudio(
          this.audioCtx,
          this.masterGain,
        );
      }
    }
  }

  /**
   * Synthesizes gentle pentatonic wind chimes on the estate porch/deck.
   */
  playWindChimes({ force = false } = {}) {
    if (force && this.isMuted) {
      this.setMuted(false);
    }
    if (this.isMuted || !this.initContext()) return;

    const freqs = [880, 990, 1100, 1320, 1485, 1760];
    const chosen = [
      freqs[Math.floor(Math.random() * freqs.length)],
      freqs[Math.floor(Math.random() * freqs.length)],
      freqs[Math.floor(Math.random() * freqs.length)],
    ];

    chosen.forEach((f, i) => {
      try {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.audioCtx.currentTime + i * 0.12);

        gain.gain.setValueAtTime(0.001, this.audioCtx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(
          0.15,
          this.audioCtx.currentTime + i * 0.12 + 0.02,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          this.audioCtx.currentTime + i * 0.12 + 1.6,
        );

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.audioCtx.currentTime + i * 0.12);
        osc.stop(this.audioCtx.currentTime + i * 0.12 + 1.8);
      } catch {}
    });
  }

  /**
   * Synthesizes a crisp double-ting cruiser bicycle mechanical bell.
   */
  playBicycleBell({ force = false } = {}) {
    if (force && this.isMuted) {
      this.setMuted(false);
    }
    if (this.isMuted || !this.initContext()) return;

    [0, 0.09].forEach((delay) => {
      try {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(
          2400 + Math.random() * 80,
          this.audioCtx.currentTime + delay,
        );

        gain.gain.setValueAtTime(0.001, this.audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(
          0.25,
          this.audioCtx.currentTime + delay + 0.008,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          this.audioCtx.currentTime + delay + 0.22,
        );

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.audioCtx.currentTime + delay);
        osc.stop(this.audioCtx.currentTime + delay + 0.25);
      } catch {}
    });
  }

  /**
   * Modulates EV inverter whine, scooter motor, or H145 helicopter sound based on speed ratio (0.0 to 1.0).
   */
  setEngineSpeed(speedRatio) {
    if (this.isMuted || !this.initContext()) return;
    const ratio = Math.max(0, Math.min(1, Number(speedRatio) || 0));

    if (this.currentMode === 'h145') {
      if (!this.helicopterAudio) {
        this.helicopterAudio = createProceduralHelicopterAudio(
          this.audioCtx,
          this.masterGain,
        );
      }
      this.helicopterAudio?.setEngineSpeed(ratio);
      if (this.inverterGain) {
        try {
          this.inverterGain.gain.setValueAtTime(
            0.0001,
            this.audioCtx.currentTime,
          );
        } catch {}
      }
      return;
    }

    if (this.helicopterAudio) {
      this.helicopterAudio.stop();
    }

    if (this.currentMode === 'ev' || this.currentMode === 'scooter') {
      try {
        if (!this.inverterOsc) {
          this.inverterOsc = this.audioCtx.createOscillator();
          this.inverterGain = this.audioCtx.createGain();
          this.inverterOsc.type =
            this.currentMode === 'ev' ? 'sine' : 'triangle';
          this.inverterOsc.frequency.setValueAtTime(
            380,
            this.audioCtx.currentTime,
          );
          this.inverterGain.gain.setValueAtTime(
            0.0001,
            this.audioCtx.currentTime,
          );

          this.inverterOsc.connect(this.inverterGain);
          this.inverterGain.connect(this.masterGain);
          this.inverterOsc.start();
        }

        const targetFreq =
          this.currentMode === 'ev' ? 380 + ratio * 600 : 220 + ratio * 340;
        const targetVol = ratio > 0.05 ? 0.08 * ratio : 0.0001;

        this.inverterOsc.frequency.linearRampToValueAtTime(
          targetFreq,
          this.audioCtx.currentTime + 0.1,
        );
        this.inverterGain.gain.linearRampToValueAtTime(
          targetVol,
          this.audioCtx.currentTime + 0.1,
        );
      } catch {}
    } else if (this.inverterGain) {
      try {
        this.inverterGain.gain.linearRampToValueAtTime(
          0.0001,
          this.audioCtx.currentTime + 0.1,
        );
      } catch {}
    }
  }

  setHover(hovering) {
    if (this.currentMode === 'h145') {
      if (!this.helicopterAudio && this.initContext()) {
        this.helicopterAudio = createProceduralHelicopterAudio(
          this.audioCtx,
          this.masterGain,
        );
      }
      this.helicopterAudio?.setHover(hovering);
    }
  }

  destroy() {
    if (this.helicopterAudio) {
      try {
        this.helicopterAudio.destroy();
      } catch {}
      this.helicopterAudio = null;
    }
    if (this.inverterOsc) {
      try {
        this.inverterOsc.stop();
        this.inverterOsc.disconnect();
      } catch {}
      this.inverterOsc = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

export function createProceduralEstateAudio() {
  return new ProceduralEstateAudioEngine();
}
