/**
 * Ambient Environmental Audio Micro-Soundscapes for Living World Simulator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Implements a procedural Web Audio micro-soundscape synthesizer with zero external
 * MP3 asset dependencies. Synthesizes spatial, altitude-attenuated environmental ambiances:
 *   - Coastal (estuary surf, buoy bells, gull calls)
 *   - Tribal Plains (tallgrass prairie wind, summer cicadas, distant diesel pickup)
 *   - Farmland (steady tractor diesel rumble, livestock lowing, morning songbirds)
 *   - Theme Park (coaster lift ratchet clatter, tubular steel track roar, calliope organ chords)
 *   - Alpine, Safari, Suburban, Wilderness & Urban presets
 */

export const SOUNDSCAPE_PROFILES = Object.freeze({
  COASTAL: 'coastal',
  TRIBAL_PLAINS: 'tribal_plains',
  FARMLAND: 'farmland',
  THEME_PARK: 'theme_park',
  STUDIO_LOT: 'studio_lot',
  STADIUM_GAMEDAY: 'stadium_gameday',
  MALL_CONCOURSE: 'mall_concourse',
  ALPINE: 'alpine',
  SAFARI: 'safari',
  SUBURBAN: 'suburban',
  WILDERNESS: 'wilderness',
  URBAN: 'urban',
});

const TYPOLOGY_TO_SOUNDSCAPE = Object.freeze({
  COASTAL_TIDEWATER: SOUNDSCAPE_PROFILES.COASTAL,
  TRIBAL_RESERVATION: SOUNDSCAPE_PROFILES.TRIBAL_PLAINS,
  RURAL_AGRICULTURAL: SOUNDSCAPE_PROFILES.FARMLAND,
  AMUSEMENT_THEME_PARK: SOUNDSCAPE_PROFILES.THEME_PARK,
  STUDIO_MOVIE_LOT: SOUNDSCAPE_PROFILES.STUDIO_LOT,
  STADIUM_SPORTS_COMPLEX: SOUNDSCAPE_PROFILES.STADIUM_GAMEDAY,
  SHOPPING_MALL_PROMENADE: SOUNDSCAPE_PROFILES.MALL_CONCOURSE,
  ALPINE_SKI_RESORT: SOUNDSCAPE_PROFILES.ALPINE,
  SAFARI_WILDLIFE_PARK: SOUNDSCAPE_PROFILES.SAFARI,
  SUBURBAN_COMMUTER: SOUNDSCAPE_PROFILES.SUBURBAN,
  WILDERNESS_SANCTUARY: SOUNDSCAPE_PROFILES.WILDERNESS,
  DENSE_URBAN: SOUNDSCAPE_PROFILES.URBAN,
});

export const ALTITUDE_SOUND_CEILING_M = 1500;
export const ALTITUDE_SOUND_FULL_M = 60;

/**
 * Creates the Procedural Ambient Soundscape Engine.
 */
export function createAmbientSoundscape({
  audioContext = null,
  initialVolume = 0.35,
} = {}) {
  let ctx = audioContext;
  let masterGain = null;
  let activeProfile = null;
  let isMuted = false;
  let userVolume = initialVolume;
  let altitudeAttenuatedVolume = 1.0;
  let activeNodes = [];
  let isDestroyed = false;

  function initContext() {
    if (ctx) return ctx;
    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          ctx = new AudioCtx();
        } catch {
          /* browser audio policy block */
        }
      }
    }
    return ctx;
  }

  function getMasterGain() {
    if (!masterGain) {
      const c = initContext();
      if (c) {
        masterGain = c.createGain();
        masterGain.gain.setValueAtTime(isMuted ? 0 : userVolume, c.currentTime);
        masterGain.connect(c.destination);
      }
    }
    return masterGain;
  }

  function clearActiveNodes() {
    for (const node of activeNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {
        /* ignore */
      }
    }
    activeNodes = [];
  }

  function updateMasterGainLevel() {
    if (!masterGain || !ctx) return;
    const target = isMuted ? 0 : userVolume * altitudeAttenuatedVolume;
    try {
      masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
    } catch {
      masterGain.gain.value = target;
    }
  }

  /**
   * Generates a pink-noise audio buffer for wind and water surf modeling.
   */
  function createPinkNoiseBuffer(c, durationSeconds = 3.0) {
    const bufferSize = c.sampleRate * durationSeconds;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /**
   * Builds procedural micro-soundscape nodes matching the given profile.
   */
  function synthesizeProfile(profile) {
    const c = initContext();
    const dest = getMasterGain();
    if (!c || !dest) return;

    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }

    clearActiveNodes();

    if (profile === SOUNDSCAPE_PROFILES.COASTAL) {
      // 1. Gentle estuary water surf: filtered pink noise modulated by slow 0.1Hz LFO
      const noise = c.createBufferSource();
      noise.buffer = createPinkNoiseBuffer(c, 4.0);
      noise.loop = true;

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, c.currentTime);

      const surfGain = c.createGain();
      surfGain.gain.setValueAtTime(0.4, c.currentTime);

      // LFO for wave swelling
      const lfo = c.createOscillator();
      lfo.frequency.setValueAtTime(0.12, c.currentTime); // Wave swell every ~8 seconds
      const lfoGain = c.createGain();
      lfoGain.gain.setValueAtTime(0.25, c.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(surfGain.gain);

      noise.connect(filter);
      filter.connect(surfGain);
      surfGain.connect(dest);

      noise.start();
      lfo.start();
      activeNodes.push(noise, filter, surfGain, lfo, lfoGain);

      // 2. Distant harbor bell: high-Q sine with fast decay
      const bellOsc = c.createOscillator();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(880, c.currentTime);
      const bellGain = c.createGain();
      bellGain.gain.setValueAtTime(0.04, c.currentTime);
      bellOsc.connect(bellGain);
      bellGain.connect(dest);
      bellOsc.start();
      activeNodes.push(bellOsc, bellGain);
    } else if (profile === SOUNDSCAPE_PROFILES.TRIBAL_PLAINS) {
      // Tallgrass prairie wind: bandpass filtered noise
      const noise = c.createBufferSource();
      noise.buffer = createPinkNoiseBuffer(c, 3.5);
      noise.loop = true;

      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, c.currentTime);
      filter.Q.setValueAtTime(1.8, c.currentTime);

      const windGain = c.createGain();
      windGain.gain.setValueAtTime(0.35, c.currentTime);

      noise.connect(filter);
      filter.connect(windGain);
      windGain.connect(dest);

      noise.start();
      activeNodes.push(noise, filter, windGain);

      // Summer cicadas: high-frequency amplitude-modulated sine
      const cicada = c.createOscillator();
      cicada.type = 'sine';
      cicada.frequency.setValueAtTime(4600, c.currentTime);
      const cicadaGain = c.createGain();
      cicadaGain.gain.setValueAtTime(0.03, c.currentTime);

      cicada.connect(cicadaGain);
      cicadaGain.connect(dest);
      cicada.start();
      activeNodes.push(cicada, cicadaGain);
    } else if (profile === SOUNDSCAPE_PROFILES.FARMLAND) {
      // Tractor diesel hum: sub-bass saw/triangle oscillator 42Hz + 2nd harmonic 84Hz
      const osc1 = c.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(42, c.currentTime);

      const osc2 = c.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(84, c.currentTime);

      const dieselFilter = c.createBiquadFilter();
      dieselFilter.type = 'lowpass';
      dieselFilter.frequency.setValueAtTime(160, c.currentTime);

      const dieselGain = c.createGain();
      dieselGain.gain.setValueAtTime(0.38, c.currentTime);

      osc1.connect(dieselFilter);
      osc2.connect(dieselFilter);
      dieselFilter.connect(dieselGain);
      dieselGain.connect(dest);

      osc1.start();
      osc2.start();
      activeNodes.push(osc1, osc2, dieselFilter, dieselGain);
    } else if (profile === SOUNDSCAPE_PROFILES.THEME_PARK) {
      // 1. Roller coaster lift-hill mechanical ratchet clatter (3Hz click pulses)
      const ratchetOsc = c.createOscillator();
      ratchetOsc.type = 'square';
      ratchetOsc.frequency.setValueAtTime(3.2, c.currentTime); // 3.2 clicks per sec

      const ratchetFilter = c.createBiquadFilter();
      ratchetFilter.type = 'highpass';
      ratchetFilter.frequency.setValueAtTime(2200, c.currentTime);

      const ratchetGain = c.createGain();
      ratchetGain.gain.setValueAtTime(0.08, c.currentTime);

      ratchetOsc.connect(ratchetFilter);
      ratchetFilter.connect(ratchetGain);
      ratchetGain.connect(dest);

      ratchetOsc.start();
      activeNodes.push(ratchetOsc, ratchetFilter, ratchetGain);

      // 2. Tubular steel track roar (low-rumble filtered noise)
      const trackNoise = c.createBufferSource();
      trackNoise.buffer = createPinkNoiseBuffer(c, 2.5);
      trackNoise.loop = true;

      const trackFilter = c.createBiquadFilter();
      trackFilter.type = 'bandpass';
      trackFilter.frequency.setValueAtTime(540, c.currentTime);
      trackFilter.Q.setValueAtTime(2.2, c.currentTime);

      const trackGain = c.createGain();
      trackGain.gain.setValueAtTime(0.28, c.currentTime);

      trackNoise.connect(trackFilter);
      trackFilter.connect(trackGain);
      trackGain.connect(dest);

      trackNoise.start();
      activeNodes.push(trackNoise, trackFilter, trackGain);

      // 3. Calliope carousel organ sweet major chord tone (E5 / 659Hz)
      const organOsc = c.createOscillator();
      organOsc.type = 'sine';
      organOsc.frequency.setValueAtTime(659.25, c.currentTime);
      const organGain = c.createGain();
      organGain.gain.setValueAtTime(0.03, c.currentTime);

      organOsc.connect(organGain);
      organGain.connect(dest);
      organOsc.start();
      activeNodes.push(organOsc, organGain);
    } else if (profile === SOUNDSCAPE_PROFILES.STUDIO_LOT) {
      // 1. Soundstage red-light warning bell chime (784Hz G5 sine tone)
      const bellOsc = c.createOscillator();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(784.0, c.currentTime);
      const bellGain = c.createGain();
      bellGain.gain.setValueAtTime(0.04, c.currentTime);
      bellOsc.connect(bellGain);
      bellGain.connect(dest);
      bellOsc.start();
      activeNodes.push(bellOsc, bellGain);

      // 2. Studio lighting generator & dolly hydraulic hum (60Hz lowpass triangle)
      const genOsc = c.createOscillator();
      genOsc.type = 'triangle';
      genOsc.frequency.setValueAtTime(60.0, c.currentTime);
      const genFilter = c.createBiquadFilter();
      genFilter.type = 'lowpass';
      genFilter.frequency.setValueAtTime(180, c.currentTime);
      const genGain = c.createGain();
      genGain.gain.setValueAtTime(0.24, c.currentTime);
      genOsc.connect(genFilter);
      genFilter.connect(genGain);
      genGain.connect(dest);
      genOsc.start();
      activeNodes.push(genOsc, genFilter, genGain);

      // 3. Backlot soundstage breezeway air (bandpass pink noise)
      const lotNoise = c.createBufferSource();
      lotNoise.buffer = createPinkNoiseBuffer(c, 3.0);
      lotNoise.loop = true;
      const lotFilter = c.createBiquadFilter();
      lotFilter.type = 'bandpass';
      lotFilter.frequency.setValueAtTime(360, c.currentTime);
      const lotGain = c.createGain();
      lotGain.gain.setValueAtTime(0.18, c.currentTime);
      lotNoise.connect(lotFilter);
      lotFilter.connect(lotGain);
      lotGain.connect(dest);
      lotNoise.start();
      activeNodes.push(lotNoise, lotFilter, lotGain);
    } else if (profile === SOUNDSCAPE_PROFILES.STADIUM_GAMEDAY) {
      // 1. Stadium crowd murmur & collective roar rumble (bandpass pink noise at 240Hz)
      const crowdNoise = c.createBufferSource();
      crowdNoise.buffer = createPinkNoiseBuffer(c, 3.0);
      crowdNoise.loop = true;
      const crowdFilter = c.createBiquadFilter();
      crowdFilter.type = 'bandpass';
      crowdFilter.frequency.setValueAtTime(240, c.currentTime);
      const crowdGain = c.createGain();
      crowdGain.gain.setValueAtTime(0.22, c.currentTime);
      crowdNoise.connect(crowdFilter);
      crowdFilter.connect(crowdGain);
      crowdGain.connect(dest);
      crowdNoise.start();
      activeNodes.push(crowdNoise, crowdFilter, crowdGain);

      // 2. High-pitch referee whistle tweet tone (2850Hz sine tone)
      const whistleOsc = c.createOscillator();
      whistleOsc.type = 'sine';
      whistleOsc.frequency.setValueAtTime(2850.0, c.currentTime);
      const whistleGain = c.createGain();
      whistleGain.gain.setValueAtTime(0.018, c.currentTime);
      whistleOsc.connect(whistleGain);
      whistleGain.connect(dest);
      whistleOsc.start();
      activeNodes.push(whistleOsc, whistleGain);

      // 3. Marching band brass harmonic accent (A4 / 440Hz triangle tone)
      const hornOsc = c.createOscillator();
      hornOsc.type = 'triangle';
      hornOsc.frequency.setValueAtTime(440.0, c.currentTime);
      const hornGain = c.createGain();
      hornGain.gain.setValueAtTime(0.025, c.currentTime);
      hornOsc.connect(hornGain);
      hornGain.connect(dest);
      hornOsc.start();
      activeNodes.push(hornOsc, hornGain);
    } else if (profile === SOUNDSCAPE_PROFILES.MALL_CONCOURSE) {
      // 1. Distant concourse crowd murmur & ambient acoustic reverberation
      const crowdNoise = c.createBufferSource();
      crowdNoise.buffer = createPinkNoiseBuffer(c, 3.0);
      crowdNoise.loop = true;
      const crowdFilter = c.createBiquadFilter();
      crowdFilter.type = 'bandpass';
      crowdFilter.frequency.setValueAtTime(450, c.currentTime);
      crowdFilter.Q.setValueAtTime(1.8, c.currentTime);
      const crowdGain = c.createGain();
      crowdGain.gain.setValueAtTime(0.16, c.currentTime);
      crowdNoise.connect(crowdFilter);
      crowdFilter.connect(crowdGain);
      crowdGain.connect(dest);
      crowdNoise.start();
      activeNodes.push(crowdNoise, crowdFilter, crowdGain);

      // 2. Central fountain water trickle & gentle splashing basin
      const fountainNoise = c.createBufferSource();
      fountainNoise.buffer = createPinkNoiseBuffer(c, 2.0);
      fountainNoise.loop = true;
      const fountainFilter = c.createBiquadFilter();
      fountainFilter.type = 'bandpass';
      fountainFilter.frequency.setValueAtTime(1250, c.currentTime);
      fountainFilter.Q.setValueAtTime(2.5, c.currentTime);
      const fountainGain = c.createGain();
      fountainGain.gain.setValueAtTime(0.12, c.currentTime);
      fountainNoise.connect(fountainFilter);
      fountainFilter.connect(fountainGain);
      fountainGain.connect(dest);
      fountainNoise.start();
      activeNodes.push(fountainNoise, fountainFilter, fountainGain);

      // 3. Subtle glass atrium chime / smooth nostalgic chords (523.25 Hz C5 sine tone)
      const chimeOsc = c.createOscillator();
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(523.25, c.currentTime);
      const chimeGain = c.createGain();
      chimeGain.gain.setValueAtTime(0.035, c.currentTime);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(dest);
      chimeOsc.start();
      activeNodes.push(chimeOsc, chimeGain);
    } else {
      // Generic ambient hum (Urban / Suburban / Wilderness)
      const noise = c.createBufferSource();
      noise.buffer = createPinkNoiseBuffer(c, 3.0);
      noise.loop = true;

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, c.currentTime);

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.2, c.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      noise.start();
      activeNodes.push(noise, filter, gain);
    }
  }

  function startSoundscape(profile = SOUNDSCAPE_PROFILES.FARMLAND) {
    if (isDestroyed) return;
    const normalized = TYPOLOGY_TO_SOUNDSCAPE[profile] || profile;
    activeProfile = normalized;
    synthesizeProfile(normalized);
    updateMasterGainLevel();
  }

  function stopSoundscape() {
    clearActiveNodes();
    activeProfile = null;
  }

  function setVolume(vol) {
    userVolume = Math.max(0.0, Math.min(1.0, Number(vol) || 0));
    updateMasterGainLevel();
    return userVolume;
  }

  function toggleMute() {
    isMuted = !isMuted;
    updateMasterGainLevel();
    return isMuted;
  }

  function updateAltitude(altitudeMeters) {
    if (typeof altitudeMeters !== 'number' || altitudeMeters < 0) return;
    if (altitudeMeters <= ALTITUDE_SOUND_FULL_M) {
      altitudeAttenuatedVolume = 1.0;
    } else if (altitudeMeters >= ALTITUDE_SOUND_CEILING_M) {
      altitudeAttenuatedVolume = 0.0;
    } else {
      // Smooth linear decay between 60m and 1500m
      const span = ALTITUDE_SOUND_CEILING_M - ALTITUDE_SOUND_FULL_M;
      altitudeAttenuatedVolume =
        1.0 - (altitudeMeters - ALTITUDE_SOUND_FULL_M) / span;
    }
    updateMasterGainLevel();
    return altitudeAttenuatedVolume;
  }

  return {
    startSoundscape,
    stopSoundscape,
    setVolume,
    toggleMute,
    updateAltitude,
    getActiveProfile: () => activeProfile,
    isAudioActive: () => activeNodes.length > 0 && !isMuted,
    isMuted: () => isMuted,
    getVolume: () => userVolume,
    getAttenuatedVolume: () => altitudeAttenuatedVolume,
    destroy: () => {
      isDestroyed = true;
      stopSoundscape();
      if (ctx && typeof ctx.close === 'function') {
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
