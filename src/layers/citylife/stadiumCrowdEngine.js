/**
 * Stadium & Arena Gameday Spectacle Crowd Engine for Living World Simulator.
 * (Living World Sim: Stadium & Arena Gameday Spectacles)
 *
 * Implements 60fps high-density spectator crowd flows, tailgating lot ecosystems,
 * turnstile ingress surges, match lifecycle progression, fan team colorways,
 * transit platform surges, and a 4-mode gameday camera suite across Atlanta
 * (GSU Summerhill, GSU Convocation Center, Georgia Tech Bobby Dodd, Mercedes-Benz Stadium)
 * and Phoenix (State Farm Stadium Glendale, Footprint Center, ASU Sun Devils Tempe).
 *
 * Adheres strictly to the Outlined Contact Reticle Invariant:
 * Every spectator entity renders high-contrast outlined contact reticles with
 * disableDepthTestDistance: Number.POSITIVE_INFINITY and dynamic terrain clamping (+0.35m),
 * eliminating subsurface terrain occlusion and "ghost camera" empty air views.
 */

import * as Cesium from 'cesium';
import {
  STADIUM_VENUES,
  getStadiumById,
  findNearbyStadium,
} from './stadiumCatalog.js';
import {
  generateTailgateClusterPositions,
  generateIngressCorridorTrajectory,
  generateStadiumConcourseRing,
} from './multiTopologyPathing.js';
import { sampleActiveGroundHeight } from './surfaceHeight.js';

export const GAMEDAY_STATES = Object.freeze({
  PREGAME_TAILGATE: 'PREGAME_TAILGATE',
  GATES_OPEN_INGRESS: 'GATES_OPEN_INGRESS',
  IN_PLAY_CONCOURSE: 'IN_PLAY_CONCOURSE',
  FOURTH_QUARTER_EXIT: 'FOURTH_QUARTER_EXIT',
  POSTGAME_SURGE: 'POSTGAME_SURGE',
});

export const GAMEDAY_STATE_BADGES = Object.freeze({
  [GAMEDAY_STATES.PREGAME_TAILGATE]:
    '🍖 PREGAME TAILGATE · CANOPIES & SMOKERS BURNING',
  [GAMEDAY_STATES.GATES_OPEN_INGRESS]:
    '🎟️ GATES OPEN · HIGH-DENSITY INGRESS SURGE',
  [GAMEDAY_STATES.IN_PLAY_CONCOURSE]: '🏟️ GAME IN PLAY · CONCOURSE CIRCULATION',
  [GAMEDAY_STATES.FOURTH_QUARTER_EXIT]:
    '🚪 4TH QUARTER · EARLY DEPARTURES & RIDESHARE',
  [GAMEDAY_STATES.POSTGAME_SURGE]:
    '🚨 POSTGAME EGRESS · TRANSIT PLATFORM STAMPEDE',
});

export const GAMEDAY_STATE_ORDER = [
  GAMEDAY_STATES.PREGAME_TAILGATE,
  GAMEDAY_STATES.GATES_OPEN_INGRESS,
  GAMEDAY_STATES.IN_PLAY_CONCOURSE,
  GAMEDAY_STATES.FOURTH_QUARTER_EXIT,
  GAMEDAY_STATES.POSTGAME_SURGE,
];

export const GAMEDAY_CAMERA_MODES = Object.freeze({
  BLIMP_AERIAL: 'blimp_aerial',
  MAIN_GATE_INGRESS: 'main_gate_ingress',
  TAILGATE_ROAM: 'tailgate_roam',
  UPPER_DECK_BALCONY: 'upper_deck_balcony',
});

export const GAMEDAY_CAMERA_MODE_ORDER = [
  GAMEDAY_CAMERA_MODES.BLIMP_AERIAL,
  GAMEDAY_CAMERA_MODES.MAIN_GATE_INGRESS,
  GAMEDAY_CAMERA_MODES.TAILGATE_ROAM,
  GAMEDAY_CAMERA_MODES.UPPER_DECK_BALCONY,
];

/**
 * Creates the Stadium Crowd & Gameday Spectacle Engine.
 */
export function createStadiumCrowdEngine({ viewer = null } = {}) {
  let activeStadium = STADIUM_VENUES.gsu_summerhill;
  let currentStateIndex = 0; // Starts at PREGAME_TAILGATE
  let stateTimerSec = 0;
  let currentCameraModeIndex = 0; // Starts at BLIMP_AERIAL
  let blimpOrbitAngleRad = 0;
  let isDestroyed = false;

  // Primitives collections managed on Cesium viewer
  let spectatorPoints = null;
  let canopyBillboards = null;
  let smokePoints = null;

  // In-memory simulated entities
  let tailgateLotsData = [];
  let ingressStreams = [];
  let concourseRingPoints = [];
  let simulatedSpectators = [];

  function sampleGround(lat, lon, fallbackElev = 0) {
    if (!viewer) return fallbackElev;
    const carto = Cesium.Cartographic.fromDegrees(lon, lat, fallbackElev);
    return sampleActiveGroundHeight(viewer, carto);
  }

  function getGamedayState() {
    return (
      GAMEDAY_STATE_ORDER[currentStateIndex] || GAMEDAY_STATES.PREGAME_TAILGATE
    );
  }

  function getGamedayStatusBadge() {
    const s = getGamedayState();
    return (
      GAMEDAY_STATE_BADGES[s] ||
      GAMEDAY_STATE_BADGES[GAMEDAY_STATES.PREGAME_TAILGATE]
    );
  }

  function setGamedayState(state) {
    const idx = GAMEDAY_STATE_ORDER.indexOf(state);
    if (idx !== -1) {
      currentStateIndex = idx;
      stateTimerSec = 0;
      rebalanceCrowdForState();
      return true;
    }
    return false;
  }

  function advanceGamedayState() {
    currentStateIndex = (currentStateIndex + 1) % GAMEDAY_STATE_ORDER.length;
    stateTimerSec = 0;
    rebalanceCrowdForState();
    return getGamedayState();
  }

  function getCameraMode() {
    return (
      GAMEDAY_CAMERA_MODE_ORDER[currentCameraModeIndex] ||
      GAMEDAY_CAMERA_MODES.BLIMP_AERIAL
    );
  }

  function setCameraMode(mode) {
    const idx = GAMEDAY_CAMERA_MODE_ORDER.indexOf(mode);
    if (idx !== -1) {
      currentCameraModeIndex = idx;
      applyGamedayCamera(mode, 1.8);
      return true;
    }
    return false;
  }

  function cycleCameraMode() {
    currentCameraModeIndex =
      (currentCameraModeIndex + 1) % GAMEDAY_CAMERA_MODE_ORDER.length;
    const mode = getCameraMode();
    applyGamedayCamera(mode, 1.8);
    return mode;
  }

  /**
   * Builds all static and kinematic structures for the active stadium.
   */
  function buildStadiumGeometry(stadium) {
    tailgateLotsData = [];
    ingressStreams = [];
    concourseRingPoints = [];
    simulatedSpectators = [];

    if (!stadium) return;

    // 1. Build Tailgate Lots
    const lots = stadium.tailgateLots || [];
    for (const lot of lots) {
      const lotElev = sampleGround(
        lot.centerLat,
        lot.centerLon,
        stadium.elev || 0,
      );
      const cluster = generateTailgateClusterPositions({
        centerLat: lot.centerLat,
        centerLon: lot.centerLon,
        baseElev: lotElev,
        lotRadiusMeters: lot.radiusMeters || 60,
        canopyCount: lot.canopies || 24,
        grillCount: lot.grills || 12,
        seed:
          Math.floor(Math.abs(lot.centerLat * 1000 + lot.centerLon * 1000)) ||
          42,
      });
      tailgateLotsData.push({
        lot,
        cluster,
      });
    }

    // 2. Build Ingress Corridors
    const corridors = stadium.ingressCorridors || [];
    for (const corr of corridors) {
      const startElev = sampleGround(
        corr.origin.lat,
        corr.origin.lon,
        stadium.elev || 0,
      );
      const targetElev = sampleGround(
        corr.turnstileTarget.lat,
        corr.turnstileTarget.lon,
        stadium.elev || 0,
      );

      // Create 3 parallel flow streams across corridor width
      const streamOffsets = [-4.0, 0.0, 4.0];
      for (let s = 0; s < streamOffsets.length; s++) {
        const streamPts = generateIngressCorridorTrajectory({
          originLat: corr.origin.lat,
          originLon: corr.origin.lon,
          targetLat: corr.turnstileTarget.lat,
          targetLon: corr.turnstileTarget.lon,
          baseElev: (startElev + targetElev) / 2,
          corridorWidthMeters: corr.widthMeters || 12.0,
          fanOffsetMeters: streamOffsets[s],
          stepIntervalMeters: 3.0,
        });
        ingressStreams.push({
          corr,
          streamIndex: s,
          points: streamPts,
        });
      }
    }

    // 3. Build Concourse Circulation Ring
    const concourseElev =
      sampleGround(stadium.lat, stadium.lon, stadium.elev || 0) + 7.5;
    concourseRingPoints = generateStadiumConcourseRing(
      stadium.lat,
      stadium.lon,
      stadium.archetype === 'pro_dome' ? 95.0 : 70.0,
      concourseElev,
      36,
    );

    // 4. Initialize Spectator Entities Pool (Capacity calibrated for high density at 60fps)
    spawnInitialSpectators(stadium);
    updatePrimitives();
  }

  function spawnInitialSpectators(stadium) {
    const totalSpectators = 320; // Crisp performance budget
    const homeColor = stadium.teamColors?.primary || '#0039A6';
    const awayColor = '#FFFFFF';
    const accentColor = stadium.teamColors?.accent || '#FFB612';

    simulatedSpectators = [];

    for (let i = 0; i < totalSpectators; i++) {
      // 75% Home team, 25% away / neutral
      const color =
        i % 4 === 0
          ? awayColor
          : i % 7 === 0
            ? accentColor
            : Cesium.Color.fromCssColorString(homeColor);
      const parsedColor =
        typeof color === 'string'
          ? Cesium.Color.fromCssColorString(color)
          : color;

      simulatedSpectators.push({
        id: `spectator_${i}`,
        zone: 'tailgate', // 'tailgate' | 'ingress' | 'concourse' | 'transit'
        color: parsedColor,
        progress: (i / totalSpectators) * 1.0,
        speed: 0.35 + (i % 5) * 0.15,
        lat: stadium.lat,
        lon: stadium.lon,
        elev: stadium.elev || 0,
        cartesian: Cesium.Cartesian3.fromDegrees(
          stadium.lon,
          stadium.lat,
          (stadium.elev || 0) + 0.35,
        ),
      });
    }

    rebalanceCrowdForState();
  }

  /**
   * Distributes crowd zones based on gameday temporal state.
   */
  function rebalanceCrowdForState() {
    const state = getGamedayState();
    const count = simulatedSpectators.length;
    if (count === 0) return;

    let tailgateRatio = 0.7;
    let ingressRatio = 0.15;
    let concourseRatio = 0.1;
    let transitRatio = 0.05;

    if (state === GAMEDAY_STATES.PREGAME_TAILGATE) {
      tailgateRatio = 0.7;
      ingressRatio = 0.15;
      concourseRatio = 0.05;
      transitRatio = 0.1;
    } else if (state === GAMEDAY_STATES.GATES_OPEN_INGRESS) {
      tailgateRatio = 0.15;
      ingressRatio = 0.65;
      concourseRatio = 0.15;
      transitRatio = 0.05;
    } else if (state === GAMEDAY_STATES.IN_PLAY_CONCOURSE) {
      tailgateRatio = 0.05;
      ingressRatio = 0.1;
      concourseRatio = 0.8;
      transitRatio = 0.05;
    } else if (state === GAMEDAY_STATES.FOURTH_QUARTER_EXIT) {
      tailgateRatio = 0.15;
      ingressRatio = 0.35; // Egress flow
      concourseRatio = 0.2;
      transitRatio = 0.3;
    } else if (state === GAMEDAY_STATES.POSTGAME_SURGE) {
      tailgateRatio = 0.1;
      ingressRatio = 0.15;
      concourseRatio = 0.05;
      transitRatio = 0.7; // Stampede onto transit platforms & road edges
    }

    const tEnd = Math.floor(count * tailgateRatio);
    const iEnd = tEnd + Math.floor(count * ingressRatio);
    const cEnd = iEnd + Math.floor(count * concourseRatio);

    for (let idx = 0; idx < count; idx++) {
      const spec = simulatedSpectators[idx];
      if (idx < tEnd) {
        spec.zone = 'tailgate';
      } else if (idx < iEnd) {
        spec.zone = 'ingress';
      } else if (idx < cEnd) {
        spec.zone = 'concourse';
      } else {
        spec.zone = 'transit';
      }
    }
  }

  /**
   * Updates primitive visual positions adhering to Outlined Contact Reticle Invariant.
   */
  function updatePrimitives() {
    if (!viewer || isDestroyed) return;

    if (!spectatorPoints) {
      spectatorPoints = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection(),
      );
    }
    spectatorPoints.removeAll();

    for (const spec of simulatedSpectators) {
      spectatorPoints.add({
        position: spec.cartesian,
        pixelSize: spec.zone === 'concourse' ? 6 : 8,
        color: spec.color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        // NON-NEGOTIABLE OUTLINED CONTACT RETICLE INVARIANT:
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }

  /**
   * Applies gameday camera presets with cinematic flight.
   */
  function applyGamedayCamera(mode, durationSec = 1.8) {
    if (!viewer || !activeStadium) return;

    const stadium = activeStadium;
    const sLat = stadium.lat;
    const sLon = stadium.lon;
    const sElev = stadium.elev || 0;

    let destination;
    let orientation = {
      heading: Cesium.Math.toRadians(stadium.headingDeg || 0),
      pitch: Cesium.Math.toRadians(stadium.pitchDeg || -30),
      roll: 0.0,
    };

    if (mode === GAMEDAY_CAMERA_MODES.BLIMP_AERIAL) {
      // Orbiting blimp (+220m AGL, ~320m radius)
      const r = 320.0;
      const blimpLat = sLat + (Math.cos(blimpOrbitAngleRad) * r) / 111132;
      const blimpLon =
        sLon +
        (Math.sin(blimpOrbitAngleRad) * r) /
          (111132 * Math.cos((sLat * Math.PI) / 180));
      destination = Cesium.Cartesian3.fromDegrees(
        blimpLon,
        blimpLat,
        sElev + 220,
      );
      orientation = {
        heading: Cesium.Math.toRadians(
          (blimpOrbitAngleRad * 180) / Math.PI + 180,
        ),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0.0,
      };
    } else if (mode === GAMEDAY_CAMERA_MODES.MAIN_GATE_INGRESS) {
      // Eye-level at main entrance turnstiles looking into the gate
      const turnstile = stadium.turnstiles?.[0] || {
        lat: sLat,
        lon: sLon,
        elev: sElev,
      };
      const eyeLat = turnstile.lat - 0.0003;
      const eyeLon = turnstile.lon;
      destination = Cesium.Cartesian3.fromDegrees(
        eyeLon,
        eyeLat,
        turnstile.elev + 3.5,
      );
      orientation = {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-5),
        roll: 0.0,
      };
    } else if (mode === GAMEDAY_CAMERA_MODES.TAILGATE_ROAM) {
      // Roaming eye-level in primary tailgate lot
      const lot = stadium.tailgateLots?.[0];
      const eyeLat = lot ? lot.centerLat : sLat + 0.0004;
      const eyeLon = lot ? lot.centerLon : sLon;
      destination = Cesium.Cartesian3.fromDegrees(eyeLon, eyeLat, sElev + 1.8);
      orientation = {
        heading: Cesium.Math.toRadians(45),
        pitch: Cesium.Math.toRadians(-2),
        roll: 0.0,
      };
    } else if (mode === GAMEDAY_CAMERA_MODES.UPPER_DECK_BALCONY) {
      // Upper deck rim overlooking field and city skyline
      const rimLat = sLat + 0.0008;
      const rimLon = sLon;
      destination = Cesium.Cartesian3.fromDegrees(rimLon, rimLat, sElev + 48.0);
      orientation = {
        heading: Cesium.Math.toRadians(180),
        pitch: Cesium.Math.toRadians(-24),
        roll: 0.0,
      };
    }

    if (destination && viewer.camera) {
      try {
        viewer.camera.flyTo({
          destination,
          orientation,
          duration: durationSec,
        });
      } catch {
        /* viewer or camera disposed */
      }
    }
  }

  /**
   * Main simulation tick called on frame update.
   */
  function tick(dtSeconds = 0.016) {
    if (isDestroyed) return;

    stateTimerSec += dtSeconds;
    blimpOrbitAngleRad += 0.04 * dtSeconds; // Slow gentle blimp orbit

    // Update spectator positions along their designated path topology
    for (let i = 0; i < simulatedSpectators.length; i++) {
      const spec = simulatedSpectators[i];
      spec.progress = (spec.progress + (spec.speed * dtSeconds) / 20) % 1.0;

      if (spec.zone === 'tailgate') {
        // Slow drift around active tailgate lot waypoints
        const lot = tailgateLotsData[i % Math.max(1, tailgateLotsData.length)];
        const wps = lot?.cluster?.wanderWaypoints || [];
        if (wps.length > 0) {
          const wpIdx = Math.floor(spec.progress * wps.length) % wps.length;
          const targetWp = wps[wpIdx];
          spec.lat = targetWp.lat;
          spec.lon = targetWp.lon;
          spec.elev = (targetWp.elev || activeStadium.elev || 0) + 0.35;
        }
      } else if (spec.zone === 'ingress') {
        // Channeled march along ingress corridor towards stadium turnstiles
        const stream = ingressStreams[i % Math.max(1, ingressStreams.length)];
        const pts = stream?.points || [];
        if (pts.length > 1) {
          const ptIdx = Math.floor(spec.progress * pts.length) % pts.length;
          const targetPt = pts[ptIdx];
          spec.lat = targetPt.lat;
          spec.lon = targetPt.lon;
          spec.elev = (targetPt.elev || activeStadium.elev || 0) + 0.35;
        }
      } else if (spec.zone === 'concourse') {
        // Circular loop around upper/lower concourse ring
        if (concourseRingPoints.length > 1) {
          const ringIdx =
            Math.floor(spec.progress * concourseRingPoints.length) %
            concourseRingPoints.length;
          const ringPt = concourseRingPoints[ringIdx];
          spec.lat = ringPt.lat;
          spec.lon = ringPt.lon;
          spec.elev = (ringPt.elev || activeStadium.elev || 0) + 0.35;
        }
      } else if (spec.zone === 'transit') {
        // Transit platform surge
        const transit = activeStadium.transitConnections?.[0];
        const baseLat = transit?.lat || activeStadium.lat;
        const baseLon = transit?.lon || activeStadium.lon;
        // Jitter around station platform
        const j = Math.sin(i * 1.7 + spec.progress * Math.PI * 2) * 0.00015;
        spec.lat = baseLat + j;
        spec.lon = baseLon + j * 0.8;
        spec.elev = (activeStadium.elev || 0) + 0.35;
      }

      spec.cartesian = Cesium.Cartesian3.fromDegrees(
        spec.lon,
        spec.lat,
        spec.elev,
      );
    }

    updatePrimitives();
  }

  function setActiveStadium(stadiumIdOrObj) {
    if (!stadiumIdOrObj) return null;
    const stadium =
      typeof stadiumIdOrObj === 'string'
        ? getStadiumById(stadiumIdOrObj)
        : stadiumIdOrObj;
    if (stadium) {
      activeStadium = stadium;
      buildStadiumGeometry(stadium);
      applyGamedayCamera(getCameraMode(), 2.0);
      return activeStadium;
    }
    return null;
  }

  function getActiveStadium() {
    return activeStadium;
  }

  function destroy() {
    isDestroyed = true;
    if (viewer && spectatorPoints) {
      try {
        viewer.scene.primitives.remove(spectatorPoints);
      } catch {
        /* ignore */
      }
      spectatorPoints = null;
    }
    simulatedSpectators = [];
    tailgateLotsData = [];
    ingressStreams = [];
    concourseRingPoints = [];
  }

  // Initialize with default stadium
  buildStadiumGeometry(activeStadium);

  return {
    getActiveStadium,
    setActiveStadium,
    getGamedayState,
    setGamedayState,
    advanceGamedayState,
    getGamedayStatusBadge,
    getCameraMode,
    setCameraMode,
    cycleCameraMode,
    applyGamedayCamera,
    tick,
    destroy,
    _getSimulatedSpectators: () => simulatedSpectators,
    _getTailgateLotsData: () => tailgateLotsData,
    _getIngressStreams: () => ingressStreams,
  };
}
