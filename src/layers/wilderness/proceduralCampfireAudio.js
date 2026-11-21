/**
 * Procedural Web Audio Engine for Wilderness Backcountry, Campfire & Celestial Stargazing.
 * (National Parks, Topo Hiking, Backcountry Campsites & Wildlife Tracking on GEV)
 *
 * Implements pure procedural Web Audio synthesis (zero external audio dependencies):
 * - Mountain Wilderness Breeze: Pink-noise atmospheric wind with slow LFO modulation
 * - Evening Campfire Bivouac:
 *   - Crackling wood embers: Stochastic Poisson micro-burst impulse noise
 *   - Thermal fire roar: Low resonant brown/pink noise at 50Hz - 130Hz
 * - Alpine Night Crickets & Cicadas: Dual pulse harmonic oscillators for twilight/stargazing
 * - Celestial Stargazing Transition: Smooth crossfade lowering wind, amplifying warm fire & night insects
 * - Altitude attenuation curve (fades naturally when zooming camera above 1,200m AGL)
 */

class ProceduralCampfireAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.windGain = null;
    this.fireGain = null;
    this.cricketGain = null;
    this.isMuted = true;
    this.isCampfireActive = false;
    this.isStargazingActive = false;
    this.fireTimer = null;
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
      this.masterGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);

      this._initWindSubsystem();
      this._initCampfireSubsystem();
      this._initCricketSubsystem();

      return true;
    } catch {
      return false;
    }
  }

  _initWindSubsystem() {
    if (!this.audioCtx) return;
    try {
      // 2-second pink noise buffer
      const bufferSize = this.audioCtx.sampleRate * 2;
      const noiseBuffer = this.audioCtx.createBuffer(
        1,
        bufferSize,
        this.audioCtx.sampleRate,
      );
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
      }

      const whiteNoise = this.audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Resonant Lowpass Filter modulating between 200Hz and 600Hz
      const windFilter = this.audioCtx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(320, this.audioCtx.currentTime);
      windFilter.Q.setValueAtTime(2.2, this.audioCtx.currentTime);

      this.windGain = this.audioCtx.createGain();
      this.windGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);

      whiteNoise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      whiteNoise.start();
    } catch {}
  }

  _initCampfireSubsystem() {
    if (!this.audioCtx) return;
    try {
      // Continuous low thermal flame rumble
      const bufferSize = this.audioCtx.sampleRate * 2;
      const roarBuffer = this.audioCtx.createBuffer(
        1,
        bufferSize,
        this.audioCtx.sampleRate,
      );
      const roarData = roarBuffer.getChannelData(0);
      let lastVal = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastVal = (lastVal + 0.02 * white) / 1.02;
        roarData[i] = lastVal * 2.8;
      }

      const roarSource = this.audioCtx.createBufferSource();
      roarSource.buffer = roarBuffer;
      roarSource.loop = true;

      const roarFilter = this.audioCtx.createBiquadFilter();
      roarFilter.type = 'lowpass';
      roarFilter.frequency.setValueAtTime(110, this.audioCtx.currentTime);
      roarFilter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);

      this.fireGain = this.audioCtx.createGain();
      this.fireGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime); // initially silent

      roarSource.connect(roarFilter);
      roarFilter.connect(this.fireGain);
      this.fireGain.connect(this.masterGain);
      roarSource.start();
    } catch {}
  }

  _initCricketSubsystem() {
    if (!this.audioCtx) return;
    try {
      // Dual high-frequency pulse oscillators
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(4400, this.audioCtx.currentTime);
      osc2.frequency.setValueAtTime(4850, this.audioCtx.currentTime);

      // Amplitude modulation for chirping cadence
      const lfo = this.audioCtx.createOscillator();
      lfo.frequency.setValueAtTime(16, this.audioCtx.currentTime);
      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      lfo.connect(lfoGain);

      this.cricketGain = this.audioCtx.createGain();
      this.cricketGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);

      osc1.connect(this.cricketGain);
      osc2.connect(this.cricketGain);
      this.cricketGain.connect(this.masterGain);

      osc1.start();
      osc2.start();
      lfo.start();
    } catch {}
  }

  triggerEmberPop() {
    if (!this.audioCtx || this.isMuted || !this.isCampfireActive) return;
    try {
      // High-frequency pop burst (15ms - 35ms)
      const now = this.audioCtx.currentTime;
      const popOsc = this.audioCtx.createOscillator();
      const popGain = this.audioCtx.createGain();

      popOsc.type = 'triangle';
      const startFreq = 1200 + Math.random() * 2200;
      popOsc.frequency.setValueAtTime(startFreq, now);
      popOsc.frequency.exponentialRampToValueAtTime(80, now + 0.028);

      popGain.gain.setValueAtTime(0.25 + Math.random() * 0.2, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      popOsc.connect(popGain);
      popGain.connect(this.masterGain);
      popOsc.start(now);
      popOsc.stop(now + 0.03);
    } catch {}
  }

  setCampfireActive(active) {
    this.isCampfireActive = Boolean(active);
    if (!this.audioCtx && this.isCampfireActive) {
      this.initContext();
    }

    if (this.fireGain && this.audioCtx) {
      const targetGain = this.isCampfireActive ? 0.32 : 0.0;
      this.fireGain.gain.setTargetAtTime(
        targetGain,
        this.audioCtx.currentTime,
        0.4,
      );
    }

    // Schedule random Poisson ember pops
    if (this.isCampfireActive) {
      if (!this.fireTimer) {
        const scheduleNextPop = () => {
          if (!this.isCampfireActive) return;
          this.triggerEmberPop();
          const nextIntervalMs = 80 + Math.random() * 320;
          this.fireTimer = setTimeout(scheduleNextPop, nextIntervalMs);
        };
        scheduleNextPop();
      }
    } else {
      if (this.fireTimer) {
        clearTimeout(this.fireTimer);
        this.fireTimer = null;
      }
    }
  }

  setStargazingMode(active) {
    this.isStargazingActive = Boolean(active);
    if (!this.audioCtx && this.isStargazingActive) {
      this.initContext();
    }

    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      if (this.isStargazingActive) {
        // Night mode: turn on campfire, amplify crickets, quiet mountain wind
        this.setCampfireActive(true);
        if (this.cricketGain) {
          this.cricketGain.gain.setTargetAtTime(0.18, now, 0.5);
        }
        if (this.windGain) {
          this.windGain.gain.setTargetAtTime(0.08, now, 0.5);
        }
      } else {
        if (this.cricketGain) {
          this.cricketGain.gain.setTargetAtTime(0.0, now, 0.5);
        }
        if (this.windGain) {
          this.windGain.gain.setTargetAtTime(0.2, now, 0.5);
        }
      }
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
    this.isMuted = Boolean(muted);
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

  calculateAltitudeAttenuation(altitudeAglM) {
    if (typeof altitudeAglM !== 'number' || altitudeAglM < 0) return 1.0;
    // Full volume at ground level (<= 50m AGL), fades to 0 above 1200m AGL
    if (altitudeAglM <= 50) return 1.0;
    if (altitudeAglM >= 1200) return 0.0;
    return Math.max(0.0, 1.0 - (altitudeAglM - 50) / 1150);
  }

  updateAltitude(altitudeAglM) {
    const factor = this.calculateAltitudeAttenuation(altitudeAglM);
    if (this.masterGain && this.audioCtx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(
        0.35 * factor,
        this.audioCtx.currentTime,
        0.15,
      );
    }
  }

  destroy() {
    if (this.fireTimer) {
      clearTimeout(this.fireTimer);
      this.fireTimer = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

export function createProceduralCampfireAudio() {
  return new ProceduralCampfireAudioEngine();
}
