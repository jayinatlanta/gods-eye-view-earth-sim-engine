/**
 * Dusk Fireworks Finale for Living World Theme Park Days.
 *
 * Renders pooled 3D Cesium PointPrimitive starburst shells over each park's
 * signature icon paired with 100% procedural Web Audio crackling fireworks.
 * Strictly zero Cesium.Label APIs, zero external audio assets, zero per-frame
 * heap allocations on the particle loop, and deterministic teardown on
 * stop(), park switch, or destroy().
 */

import * as Cesium from 'cesium';
import { getFireworksAnchorForPark } from './themeParkCatalog.js';
import {
  getEveningAnchorForResort,
  isResortStayId,
} from './resortStayCatalog.js';
import {
  getEveningAnchorForNextExperience,
  isNextExperienceId,
} from './nextExperiencesCatalog.js';
import { createMulberry32, hashStringToSeed } from './parkSecretsAndNpcs.js';

export const FIREWORKS_PARTICLE_POOL_SIZE = 96;
export const EVENING_AMBIANCE_MODES = Object.freeze({
  FIREWORKS: 'fireworks',
  FIRE_PIT_LOUNGE: 'fire_pit_lounge',
});
const GRAVITY_MPS2 = 16.5;
const PARTICLES_PER_BURST = 24;
const SHELL_INTERVAL_SEC = 1.15;
const EMBER_SPAWN_INTERVAL_SEC = 0.28;
const EMBERS_PER_PUFF = 6;

export function createParkFireworksFinale({
  viewer = null,
  tourAndPlayEngine = null,
  audioContext = null,
} = {}) {
  let active = false;
  let activeMode = EVENING_AMBIANCE_MODES.FIREWORKS;
  let isDestroyed = false;
  let activeCityId = null;
  let activeAnchor = null;
  let lastAutoTriggerKey = '';
  let rafId = null;
  let lastFrameMs = 0;
  let shellCooldownSec = 0;
  let shellCounter = 0;
  let acousticChordCooldownSec = 0;
  let collection = null;
  let ownsAudioContext = false;
  let ctx = audioContext;
  let rng = createMulberry32(20261122);

  const stateListeners = new Set();
  const pendingTimers = new Set();
  const activeAudioNodes = new Set();
  const poolPoints = new Array(FIREWORKS_PARTICLE_POOL_SIZE).fill(null);

  // Pre-allocated typed buffers for zero per-frame allocations
  const posEastM = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const posNorthM = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const posUpM = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const velEastMps = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const velNorthMps = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const velUpMps = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const lifeSec = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const maxLifeSec = new Float64Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const activeMask = new Uint8Array(FIREWORKS_PARTICLE_POOL_SIZE);
  const colorIndices = new Uint8Array(FIREWORKS_PARTICLE_POOL_SIZE);
  let poolCursor = 0;

  const scratchCartesian = new Cesium.Cartesian3();
  const paletteColors = [
    Cesium.Color.fromCssColorString('#38bdf8'),
    Cesium.Color.fromCssColorString('#f472b6'),
    Cesium.Color.fromCssColorString('#fbbf24'),
    Cesium.Color.fromCssColorString('#c084fc'),
  ];

  function notifyListeners() {
    const snap = getState();
    for (const cb of stateListeners) {
      try {
        cb(snap);
      } catch {}
    }
  }

  function clearAllTimers() {
    for (const id of pendingTimers) {
      clearTimeout(id);
    }
    pendingTimers.clear();
  }

  function cleanupAudioNodes() {
    for (const node of activeAudioNodes) {
      try {
        if (typeof node.stop === 'function') node.stop();
      } catch {}
      try {
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
    }
    activeAudioNodes.clear();
  }

  function ensureAudioContext() {
    if (ctx) return ctx;
    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          ctx = new AudioCtx();
          ownsAudioContext = true;
        } catch {
          ctx = null;
        }
      }
    }
    return ctx;
  }

  function registerAudioNode(node, cleanupAfterMs = 1500) {
    if (!node) return;
    activeAudioNodes.add(node);
    const tid = setTimeout(() => {
      pendingTimers.delete(tid);
      try {
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
      activeAudioNodes.delete(node);
    }, cleanupAfterMs);
    tid?.unref?.();
    pendingTimers.add(tid);
  }

  function playProceduralFireworkAudio() {
    const ac = ensureAudioContext();
    if (!ac || isDestroyed || !active) return;
    try {
      if (ac.state === 'suspended') {
        ac.resume?.().catch?.(() => {});
      }
      const now = ac.currentTime || 0;

      // 1. Sub-bass aerial shell boom (pitch drop 135Hz -> 36Hz)
      const boomOsc = ac.createOscillator?.();
      const boomGain = ac.createGain?.();
      if (boomOsc && boomGain) {
        boomOsc.type = 'sine';
        boomOsc.frequency?.setValueAtTime?.(135, now);
        boomOsc.frequency?.exponentialRampToValueAtTime?.(36, now + 0.34);
        boomGain.gain?.setValueAtTime?.(0.14, now);
        boomGain.gain?.exponentialRampToValueAtTime?.(0.001, now + 0.42);
        boomOsc.connect?.(boomGain);
        boomGain.connect?.(ac.destination);
        boomOsc.start?.(now);
        boomOsc.stop?.(now + 0.44);
        registerAudioNode(boomOsc, 600);
        registerAudioNode(boomGain, 600);
      }

      // 2. Filtered noise burst + sparkling crackles
      const sampleRate = ac.sampleRate || 22050;
      const len = Math.max(1, Math.floor(sampleRate * 0.45));
      const buffer = ac.createBuffer?.(1, len, sampleRate);
      if (buffer?.getChannelData) {
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < len; i += 1) {
          const env = Math.exp(-i / (sampleRate * 0.14));
          const crackle = i % 197 < 12 ? 1.4 : 0.45;
          ch[i] = (rng() * 2 - 1) * env * crackle;
        }
      }
      const noiseSrc = ac.createBufferSource?.();
      const filter = ac.createBiquadFilter?.();
      const crackleGain = ac.createGain?.();
      if (noiseSrc && filter && crackleGain) {
        noiseSrc.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency?.setValueAtTime?.(1850, now);
        filter.Q?.setValueAtTime?.(1.1, now);
        crackleGain.gain?.setValueAtTime?.(0.1, now);
        crackleGain.gain?.exponentialRampToValueAtTime?.(0.001, now + 0.45);
        noiseSrc.connect?.(filter);
        filter.connect?.(crackleGain);
        crackleGain.connect?.(ac.destination);
        noiseSrc.start?.(now + 0.04);
        noiseSrc.stop?.(now + 0.49);
        registerAudioNode(noiseSrc, 700);
        registerAudioNode(filter, 700);
        registerAudioNode(crackleGain, 700);
      }
    } catch {
      // Safe no-op under browser autoplay restrictions
    }
  }

  function refreshAnchorPalette(anchor) {
    const hexes = anchor?.colors || [
      '#38bdf8',
      '#f472b6',
      '#fbbf24',
      '#c084fc',
    ];
    for (let i = 0; i < paletteColors.length; i += 1) {
      const hex = hexes[i % hexes.length];
      try {
        paletteColors[i] = Cesium.Color.fromCssColorString(hex);
      } catch {}
    }
  }

  function ensurePrimitiveCollection() {
    if (isDestroyed || !viewer?.scene?.primitives?.add) return null;
    if (!collection) {
      try {
        collection = viewer.scene.primitives.add(
          new Cesium.PointPrimitiveCollection(),
        );
        for (let i = 0; i < FIREWORKS_PARTICLE_POOL_SIZE; i += 1) {
          const pt = collection.add({
            position: Cesium.Cartesian3.ZERO,
            pixelSize: 6,
            color: paletteColors[i % paletteColors.length],
            show: false,
          });
          poolPoints[i] = pt;
        }
      } catch {
        collection = null;
      }
    }
    return collection;
  }

  function teardownPrimitives() {
    activeMask.fill(0);
    for (let i = 0; i < FIREWORKS_PARTICLE_POOL_SIZE; i += 1) {
      if (poolPoints[i]) {
        poolPoints[i].show = false;
        poolPoints[i] = null;
      }
    }
    if (collection && viewer?.scene?.primitives?.remove) {
      try {
        viewer.scene.primitives.remove(collection);
      } catch {}
    }
    collection = null;
    viewer?.scene?.requestRender?.();
  }

  function playProceduralFirePitAudio() {
    const ac = ensureAudioContext();
    if (!ac || isDestroyed || !active) return;
    try {
      if (ac.state === 'suspended') {
        ac.resume?.().catch?.(() => {});
      }
      const now = ac.currentTime || 0;

      // 1. Soft hearth ember crackle (gentle high-bandpass filtered micro-pops)
      const sampleRate = ac.sampleRate || 22050;
      const len = Math.max(1, Math.floor(sampleRate * 0.35));
      const buffer = ac.createBuffer?.(1, len, sampleRate);
      if (buffer?.getChannelData) {
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < len; i += 1) {
          const env = Math.exp(-i / (sampleRate * 0.18));
          const pop = rng() > 0.992 ? 1.8 : 0.16;
          ch[i] = (rng() * 2 - 1) * env * pop;
        }
      }
      const crackleSrc = ac.createBufferSource?.();
      const filter = ac.createBiquadFilter?.();
      const gain = ac.createGain?.();
      if (crackleSrc && filter && gain) {
        crackleSrc.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency?.setValueAtTime?.(2400, now);
        filter.Q?.setValueAtTime?.(1.6, now);
        gain.gain?.setValueAtTime?.(0.045, now);
        gain.gain?.exponentialRampToValueAtTime?.(0.001, now + 0.35);
        crackleSrc.connect?.(filter);
        filter.connect?.(gain);
        gain.connect?.(ac.destination);
        crackleSrc.start?.(now);
        crackleSrc.stop?.(now + 0.36);
        registerAudioNode(crackleSrc, 500);
        registerAudioNode(filter, 500);
        registerAudioNode(gain, 500);
      }

      // 2. Warm acoustic sunset pentatonic chord swell every ~2.6s
      if (acousticChordCooldownSec <= 0) {
        acousticChordCooldownSec = 2.6;
        const pentatonic = [220.0, 261.63, 293.66, 329.63, 392.0];
        const rootHz = pentatonic[shellCounter % pentatonic.length];
        const fifthHz = rootHz * 1.5;
        [rootHz, fifthHz].forEach((freq, idx) => {
          const osc = ac.createOscillator?.();
          const padGain = ac.createGain?.();
          if (osc && padGain) {
            osc.type = idx === 0 ? 'triangle' : 'sine';
            osc.frequency?.setValueAtTime?.(freq, now + idx * 0.08);
            padGain.gain?.setValueAtTime?.(0.001, now + idx * 0.08);
            padGain.gain?.linearRampToValueAtTime?.(
              0.032,
              now + idx * 0.08 + 0.25,
            );
            padGain.gain?.exponentialRampToValueAtTime?.(
              0.0008,
              now + idx * 0.08 + 1.4,
            );
            osc.connect?.(padGain);
            padGain.connect?.(ac.destination);
            osc.start?.(now + idx * 0.08);
            osc.stop?.(now + idx * 0.08 + 1.45);
            registerAudioNode(osc, 1650);
            registerAudioNode(padGain, 1650);
          }
        });
      }
    } catch {
      // Safe no-op under browser autoplay restrictions
    }
  }

  function spawnFirePitEmbers() {
    if (!active || !activeAnchor) return;
    ensurePrimitiveCollection();
    shellCounter += 1;
    for (let k = 0; k < EMBERS_PER_PUFF; k += 1) {
      const slot = poolCursor;
      poolCursor = (poolCursor + 1) % FIREWORKS_PARTICLE_POOL_SIZE;
      const angle = rng() * Math.PI * 2;
      const radius = rng() * 3.8;
      posEastM[slot] = Math.cos(angle) * radius;
      posNorthM[slot] = Math.sin(angle) * radius;
      posUpM[slot] = 1.2 + rng() * 1.8;
      velEastMps[slot] = (rng() - 0.5) * 1.6;
      velNorthMps[slot] = (rng() - 0.5) * 1.6;
      velUpMps[slot] = 1.6 + rng() * 2.8;
      lifeSec[slot] = 0;
      maxLifeSec[slot] = 2.2 + rng() * 1.4;
      activeMask[slot] = 1;
      colorIndices[slot] = (shellCounter + k) % paletteColors.length;
    }
    playProceduralFirePitAudio();
  }

  function spawnShellBurst() {
    if (!active || !activeAnchor) return;
    ensurePrimitiveCollection();
    shellCounter += 1;
    const offsetEast = (rng() - 0.5) * 70;
    const offsetNorth = (rng() - 0.5) * 70;
    const burstHeight = (activeAnchor.burstAltitudeM || 110) + rng() * 35;
    const cIdx = shellCounter % paletteColors.length;

    for (let k = 0; k < PARTICLES_PER_BURST; k += 1) {
      const slot = poolCursor;
      poolCursor = (poolCursor + 1) % FIREWORKS_PARTICLE_POOL_SIZE;
      const theta = (k / PARTICLES_PER_BURST) * Math.PI * 2 + rng() * 0.25;
      const phi = (rng() - 0.35) * Math.PI * 0.85;
      const speed = 22 + rng() * 24;
      const horiz = Math.cos(phi) * speed;

      posEastM[slot] = offsetEast;
      posNorthM[slot] = offsetNorth;
      posUpM[slot] = burstHeight;
      velEastMps[slot] = Math.cos(theta) * horiz;
      velNorthMps[slot] = Math.sin(theta) * horiz;
      velUpMps[slot] = Math.sin(phi) * speed + 8;
      lifeSec[slot] = 0;
      maxLifeSec[slot] = 1.4 + rng() * 0.65;
      activeMask[slot] = 1;
      colorIndices[slot] = (cIdx + (k % 2)) % paletteColors.length;
    }

    playProceduralFireworkAudio();
  }

  function stepFrame(dtSec) {
    if (!active || !activeAnchor) return;
    const clampedDt = Math.min(0.08, Math.max(0.001, dtSec));
    const isFirePit = activeMode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE;
    shellCooldownSec -= clampedDt;
    if (acousticChordCooldownSec > 0) {
      acousticChordCooldownSec -= clampedDt;
    }
    if (shellCooldownSec <= 0) {
      if (isFirePit) {
        spawnFirePitEmbers();
        shellCooldownSec = EMBER_SPAWN_INTERVAL_SEC;
      } else {
        spawnShellBurst();
        shellCooldownSec = SHELL_INTERVAL_SEC;
      }
    }

    const baseLat = activeAnchor.lat;
    const baseLon = activeAnchor.lon;
    const baseElev = activeAnchor.elev || 32;
    const cosLat = Math.cos((baseLat * Math.PI) / 180);
    const safeCos = Math.abs(cosLat) > 0.01 ? cosLat : 0.01;
    let anyVisible = false;

    for (let i = 0; i < FIREWORKS_PARTICLE_POOL_SIZE; i += 1) {
      const pt = poolPoints[i];
      if (activeMask[i] !== 1) {
        if (pt && pt.show) pt.show = false;
        continue;
      }
      lifeSec[i] += clampedDt;
      if (lifeSec[i] >= maxLifeSec[i]) {
        activeMask[i] = 0;
        if (pt) pt.show = false;
        continue;
      }
      anyVisible = true;
      if (isFirePit) {
        velEastMps[i] *= 0.992;
        velNorthMps[i] *= 0.992;
        velUpMps[i] += 0.35 * clampedDt;
      } else {
        velEastMps[i] *= 0.985;
        velNorthMps[i] *= 0.985;
        velUpMps[i] -= GRAVITY_MPS2 * clampedDt;
      }

      posEastM[i] += velEastMps[i] * clampedDt;
      posNorthM[i] += velNorthMps[i] * clampedDt;
      posUpM[i] += velUpMps[i] * clampedDt;

      if (pt) {
        const lat = baseLat + posNorthM[i] / 111139.0;
        const lon = baseLon + posEastM[i] / (111139.0 * safeCos);
        const alt = baseElev + Math.max(isFirePit ? 1.2 : 4, posUpM[i]);
        Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          alt,
          undefined,
          scratchCartesian,
        );
        pt.position = scratchCartesian;
        const progress = lifeSec[i] / maxLifeSec[i];
        pt.pixelSize = isFirePit
          ? Math.max(2.0, 5.5 * (1 - progress * 0.65))
          : Math.max(2.5, 7.5 * (1 - progress * 0.7));
        const baseColor = paletteColors[colorIndices[i]] || paletteColors[0];
        if (baseColor) {
          pt.color = baseColor;
        }
        pt.show = true;
      }
    }

    if (anyVisible) {
      viewer?.scene?.requestRender?.();
    }
  }

  function scheduleLoop() {
    if (!active || isDestroyed || typeof requestAnimationFrame !== 'function') {
      return;
    }
    const tick = (nowMs) => {
      if (!active || isDestroyed) return;
      const dt = lastFrameMs > 0 ? (nowMs - lastFrameMs) / 1000 : 0.016;
      lastFrameMs = nowMs;
      stepFrame(dt);
      rafId = requestAnimationFrame(tick);
    };
    lastFrameMs = 0;
    rafId = requestAnimationFrame(tick);
  }

  function start({ cityId = null, landmark = null, mode = null } = {}) {
    if (isDestroyed) return getState();
    const status = tourAndPlayEngine?.getStatus?.();
    const targetCity = cityId || status?.cityId || null;
    const stopTarget = landmark || status?.currentLandmark || null;
    const isResort =
      status?.venueCategory === 'resort_stay' || isResortStayId(targetCity);
    const isNextExp = !isResort && isNextExperienceId(targetCity);
    const nextExpAnchor = isNextExp
      ? getEveningAnchorForNextExperience(targetCity, stopTarget)
      : null;
    const defaultNextExpMode =
      nextExpAnchor?.defaultMode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE
        ? EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE
        : EVENING_AMBIANCE_MODES.FIREWORKS;
    const resolvedMode =
      mode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE ||
      mode === EVENING_AMBIANCE_MODES.FIREWORKS
        ? mode
        : isResort
          ? EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE
          : isNextExp
            ? defaultNextExpMode
            : EVENING_AMBIANCE_MODES.FIREWORKS;

    activeCityId = targetCity;
    activeMode = resolvedMode;
    activeMask.fill(0);
    if (isResort) {
      const resortAnchor = getEveningAnchorForResort(targetCity, stopTarget);
      activeAnchor =
        resolvedMode === EVENING_AMBIANCE_MODES.FIREWORKS &&
        resortAnchor?.nearbyFireworks
          ? {
              ...resortAnchor.nearbyFireworks,
              iconName:
                resortAnchor.nearbyFireworks.label || resortAnchor.iconName,
            }
          : resortAnchor;
    } else if (nextExpAnchor) {
      activeAnchor = nextExpAnchor;
    } else {
      activeAnchor = getFireworksAnchorForPark(targetCity, stopTarget);
    }
    refreshAnchorPalette(activeAnchor);
    rng = createMulberry32(
      hashStringToSeed(`${resolvedMode}:${targetCity || 'park'}`),
    );
    active = true;
    shellCooldownSec = 0;
    acousticChordCooldownSec = 0;
    ensurePrimitiveCollection();
    if (resolvedMode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE) {
      spawnFirePitEmbers();
    } else {
      spawnShellBurst();
    }
    if (!rafId) {
      scheduleLoop();
    }
    notifyListeners();
    return getState();
  }

  function stop() {
    const wasActive = active;
    active = false;
    activeCityId = null;
    activeAnchor = null;
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
    lastFrameMs = 0;
    clearAllTimers();
    cleanupAudioNodes();
    teardownPrimitives();
    if (wasActive) {
      notifyListeners();
    }
    return getState();
  }

  function toggle(requestedMode = null) {
    if (active && (!requestedMode || requestedMode === activeMode)) {
      return stop();
    }
    if (active && requestedMode && requestedMode !== activeMode) {
      stop();
    }
    return start({ mode: requestedMode });
  }

  function toggleFirePit() {
    return toggle(EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE);
  }

  function toggleFireworks() {
    return toggle(EVENING_AMBIANCE_MODES.FIREWORKS);
  }

  const unsubTour = tourAndPlayEngine?.onStatusChange?.((status) => {
    if (isDestroyed) return;
    if (!status?.isTour || !status.cityId) {
      lastAutoTriggerKey = '';
      if (active) stop();
      return;
    }
    if (active && activeCityId && status.cityId !== activeCityId) {
      lastAutoTriggerKey = '';
      stop();
    }
    if (
      status.tourScope === 'venue' &&
      status.isFinalEveningStop &&
      status.currentLandmark?.id
    ) {
      const autoKey = `${status.cityId}:${status.currentLandmark.id}`;
      if (autoKey !== lastAutoTriggerKey) {
        lastAutoTriggerKey = autoKey;
        if (!active) {
          const nextExpDefault = isNextExperienceId(status.cityId)
            ? getEveningAnchorForNextExperience(
                status.cityId,
                status.currentLandmark,
              )?.defaultMode
            : null;
          const defaultMode =
            status.venueCategory === 'resort_stay' ||
            nextExpDefault === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE
              ? EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE
              : EVENING_AMBIANCE_MODES.FIREWORKS;
          start({
            cityId: status.cityId,
            landmark: status.currentLandmark,
            mode: defaultMode,
          });
        }
      }
    }
  });

  function getState() {
    return {
      active,
      mode: activeMode,
      isFirePitActive:
        active && activeMode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE,
      isFireworksActive:
        active && activeMode === EVENING_AMBIANCE_MODES.FIREWORKS,
      cityId: activeCityId,
      anchor: activeAnchor ? { ...activeAnchor } : null,
      shellCounter,
      activeAudioNodeCount: activeAudioNodes.size,
      pendingTimerCount: pendingTimers.size,
      hasPrimitiveCollection: Boolean(collection),
    };
  }

  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;
    stop();
    try {
      unsubTour?.();
    } catch {}
    if (ownsAudioContext && ctx?.close) {
      try {
        ctx.close()?.catch?.(() => {});
      } catch {}
    }
    ctx = null;
    stateListeners.clear();
  }

  return {
    start,
    stop,
    toggle,
    toggleFirePit,
    toggleFireworks,
    isActive: () => active,
    getMode: () => activeMode,
    isFirePitActive: () =>
      active && activeMode === EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE,
    isFireworksActive: () =>
      active && activeMode === EVENING_AMBIANCE_MODES.FIREWORKS,
    getState,
    onStateChange: (cb) => {
      if (typeof cb !== 'function') return () => {};
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    _stepForTest: stepFrame,
    destroy,
  };
}
