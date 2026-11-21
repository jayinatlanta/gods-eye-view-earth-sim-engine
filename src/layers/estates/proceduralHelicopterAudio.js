/**
 * Procedural Web Audio Engine for Airbus H145 with Fenestron Tail Rotor.
 * (Multi-Modal Planetary Travel & Meditative Rotorcraft Simulator)
 *
 * Implements pure procedural Web Audio synthesis (zero external audio files):
 * 1. 5-Blade Main Rotor Pulse:
 *    Low-frequency rhythmic thrum (18–24 Hz pulse rate) using dual detuned oscillators
 *    through a 120 Hz steep low-pass filter.
 * 2. Fenestron Ducted Anti-Torque Fan:
 *    Smooth high-frequency enclosed ducted fan hum (460–520 Hz) with resonant bandpass,
 *    capturing the signature quiet acoustic profile of the Airbus H145 and completely
 *    eliminating open tail rotor blade slap.
 * 3. Twin Safran Arriel 2E Turboshaft Compressor:
 *    High-frequency turbine whine (2,600–3,100 Hz) with soft air rush.
 * 4. Helionix Hover Meditation Profile:
 *    Calibrated harmonic volume balance for serene, contemplative landscape observation.
 */

export class ProceduralHelicopterAudioEngine {
  constructor(audioCtx = null, masterGain = null) {
    this.audioCtx = audioCtx;
    this.masterGain = masterGain;

    this.rotorOsc = null;
    this.rotorGain = null;
    this.rotorFilter = null;

    this.fenestronOsc = null;
    this.fenestronGain = null;
    this.fenestronFilter = null;

    this.turbineOsc = null;
    this.turbineGain = null;

    this.isPlaying = false;
    this.isHovering = false;
    this.currentRatio = 0;
  }

  start() {
    if (!this.audioCtx || !this.masterGain || this.isPlaying) return;

    try {
      const now = this.audioCtx.currentTime;

      // 1. 5-Blade Main Rotor Oscillator
      this.rotorOsc = this.audioCtx.createOscillator();
      this.rotorGain = this.audioCtx.createGain();
      this.rotorFilter = this.audioCtx.createBiquadFilter();

      this.rotorOsc.type = 'sawtooth';
      this.rotorOsc.frequency.setValueAtTime(21.5, now); // ~21.5 Hz rotor RPM fundamental
      this.rotorFilter.type = 'lowpass';
      this.rotorFilter.frequency.setValueAtTime(115, now);

      this.rotorGain.gain.setValueAtTime(0.001, now);
      this.rotorGain.gain.linearRampToValueAtTime(0.08, now + 0.5);

      this.rotorOsc.connect(this.rotorFilter);
      this.rotorFilter.connect(this.rotorGain);
      this.rotorGain.connect(this.masterGain);
      this.rotorOsc.start(now);

      // 2. Fenestron Ducted Anti-Torque Fan (Signature H145 smooth hum)
      this.fenestronOsc = this.audioCtx.createOscillator();
      this.fenestronGain = this.audioCtx.createGain();
      this.fenestronFilter = this.audioCtx.createBiquadFilter();

      this.fenestronOsc.type = 'triangle';
      this.fenestronOsc.frequency.setValueAtTime(480, now); // 480 Hz ducted fan fundamental
      this.fenestronFilter.type = 'bandpass';
      this.fenestronFilter.frequency.setValueAtTime(480, now);
      this.fenestronFilter.Q.setValueAtTime(3.5, now);

      this.fenestronGain.gain.setValueAtTime(0.001, now);
      this.fenestronGain.gain.linearRampToValueAtTime(0.04, now + 0.4);

      this.fenestronOsc.connect(this.fenestronFilter);
      this.fenestronFilter.connect(this.fenestronGain);
      this.fenestronGain.connect(this.masterGain);
      this.fenestronOsc.start(now);

      // 3. Twin Safran Turboshaft Compressor Whine
      this.turbineOsc = this.audioCtx.createOscillator();
      this.turbineGain = this.audioCtx.createGain();

      this.turbineOsc.type = 'sine';
      this.turbineOsc.frequency.setValueAtTime(2850, now);

      this.turbineGain.gain.setValueAtTime(0.001, now);
      this.turbineGain.gain.linearRampToValueAtTime(0.015, now + 0.6);

      this.turbineOsc.connect(this.turbineGain);
      this.turbineGain.connect(this.masterGain);
      this.turbineOsc.start(now);

      this.isPlaying = true;
    } catch {
      // AudioContext unavailable in headless environments
    }
  }

  setEngineSpeed(speedRatio) {
    const ratio = Math.max(0, Math.min(1.0, Number(speedRatio) || 0));
    this.currentRatio = ratio;

    if (!this.isPlaying && ratio > 0.05) {
      this.start();
    }
    if (!this.isPlaying || !this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const targetRotorFreq = 18.0 + ratio * 6.5; // 18 Hz idle to 24.5 Hz cruise
      const targetFenestronFreq = 440 + ratio * 80; // 440 Hz idle to 520 Hz cruise
      const targetTurbineFreq = 2600 + ratio * 500;

      const rotorVol = ratio > 0.02 ? 0.04 + ratio * 0.07 : 0.0001;
      const fenestronVol = ratio > 0.02 ? 0.02 + ratio * 0.04 : 0.0001;
      const turbineVol = ratio > 0.02 ? 0.008 + ratio * 0.015 : 0.0001;

      this.rotorOsc?.frequency.linearRampToValueAtTime(
        targetRotorFreq,
        now + 0.15,
      );
      this.rotorGain?.gain.linearRampToValueAtTime(rotorVol, now + 0.15);

      this.fenestronOsc?.frequency.linearRampToValueAtTime(
        targetFenestronFreq,
        now + 0.15,
      );
      this.fenestronFilter?.frequency.linearRampToValueAtTime(
        targetFenestronFreq,
        now + 0.15,
      );
      this.fenestronGain?.gain.linearRampToValueAtTime(
        fenestronVol,
        now + 0.15,
      );

      this.turbineOsc?.frequency.linearRampToValueAtTime(
        targetTurbineFreq,
        now + 0.2,
      );
      this.turbineGain?.gain.linearRampToValueAtTime(turbineVol, now + 0.2);
    } catch {}
  }

  setHover(hovering) {
    this.isHovering = Boolean(hovering);
    if (!this.isPlaying && this.isHovering) {
      this.start();
    }
    if (this.isHovering) {
      this.setEngineSpeed(0.5); // Smooth meditative steady hover
    }
  }

  stop() {
    if (!this.isPlaying || !this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      this.rotorGain?.gain.linearRampToValueAtTime(0.0001, now + 0.4);
      this.fenestronGain?.gain.linearRampToValueAtTime(0.0001, now + 0.4);
      this.turbineGain?.gain.linearRampToValueAtTime(0.0001, now + 0.4);

      setTimeout(() => {
        try {
          this.rotorOsc?.stop();
          this.fenestronOsc?.stop();
          this.turbineOsc?.stop();
          this.rotorOsc?.disconnect();
          this.fenestronOsc?.disconnect();
          this.turbineOsc?.disconnect();
        } catch {}
        this.rotorOsc = null;
        this.fenestronOsc = null;
        this.turbineOsc = null;
        this.isPlaying = false;
      }, 450);
    } catch {
      this.isPlaying = false;
    }
  }

  destroy() {
    this.stop();
  }
}

export function createProceduralHelicopterAudio(audioCtx, masterGain) {
  return new ProceduralHelicopterAudioEngine(audioCtx, masterGain);
}
