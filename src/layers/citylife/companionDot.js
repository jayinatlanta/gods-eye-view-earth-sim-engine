/**
 * Autonomous Tethered Companion Co-Stroll Engine.
 * (Living World Sim: Autonomous Companion Co-Stroll)
 *
 * Implements companion traversal for planetary exploration:
 * - Emerald green & gold luminous aura (#10b981 / #fbbf24)
 * - 12px reticle with 2.5px white outline & depth-test disabled
 * - Elastic soft-radius tether kinematics (3-8m proximity buffer)
 * - Dynamic pace catch-up (athletic trot up to 6.5 m/s if separated)
 * - Ambient Autonomous Curiosity: When user pauses, the companion explores nearby
 *   vantage points and storefronts within 3-8m rather than freezing
 * - Contextual thought bubbles & conversational spoken banter (+2.2m AGL)
 */

import * as Cesium from 'cesium';
import { getForkProfile } from '../../config/forkProfile.js';
import {
  sampleActiveGroundHeight,
  createSurfaceTracker,
  isPhotoreal3DActive,
} from './surfaceHeight.js';

export const COMPANION_DEFAULTS = Object.freeze({
  PIXEL_SIZE: 12,
  COLOR: '#10b981',
  AURA_COLOR: '#fbbf24',
  OUTLINE_COLOR: '#ffffff',
  OUTLINE_WIDTH: 2.5,
  SOFT_BUFFER_MIN_METERS: 2.0,
  SOFT_BUFFER_MAX_METERS: 6.0,
  MAX_TETHER_LEASH_METERS: 25.0,
  TROT_SPEED_MAX_MS: 12.0,
  STROLL_SPEED_MS: 0.85,
  THOUGHT_OFFSET_METERS: 1.1,
  FORMATION_SIDE_OFFSET_METERS: 1.8,
  FORMATION_LEAD_OFFSET_METERS: 0.8,
});

/**
 * Returns the currently active companion persona name dynamically.
 * Prioritizes window / localStorage / URL overrides, falling back to forkProfile default.
 */
export function getCompanionPersonaName() {
  if (typeof window !== 'undefined') {
    if (window.__gevCompanionName) return window.__gevCompanionName;
    if (window.__gevCompanionPersona?.name)
      return window.__gevCompanionPersona.name;
    try {
      const stored = localStorage.getItem('gev_companion_name');
      if (stored) return stored;
    } catch {}
    try {
      const param = new URLSearchParams(window.location.search).get(
        'companion_name',
      );
      if (param) return param.trim();
    } catch {}
  }
  return getForkProfile().defaultCompanionName;
}

/**
 * Updates the companion persona name dynamically across the session and persistence.
 */
export function setCompanionPersonaName(name) {
  if (typeof window !== 'undefined' && name && typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) {
      window.__gevCompanionName = trimmed;
      try {
        localStorage.setItem('gev_companion_name', trimmed);
      } catch {}
    }
  }
}

/**
 * Generate contextual thoughts based on locale, pace, and living sim surroundings.
 */
export function generateCompanionThought({
  localeArchetype = 'DENSE_URBAN',
  userSpeed = 0,
  isExploringCuriosity = false,
  nearbyPOIs = [],
} = {}) {
  // Speed-based dynamic reactions
  if (userSpeed > 5.0) {
    const sprintThoughts = [
      "Easy on the throttle! You're power-sprinting like we're late for launch!",
      "Whoa, love the pace, but my sneakers weren't laced for a sprint!",
      "Catch me if you can! I'm keeping right beside you!",
    ];
    return sprintThoughts[Math.floor(Math.random() * sprintThoughts.length)];
  }

  // Curiosity thoughts when inspecting points of interest
  if (isExploringCuriosity) {
    const curiosityThoughts = [
      'Take a look over here—the view of the horizon is incredible.',
      'Checking out this spot while you catch your breath.',
      'I love how the architecture looks from this angle.',
      "Just inspecting the surroundings... isn't this place fascinating?",
    ];
    return curiosityThoughts[
      Math.floor(Math.random() * curiosityThoughts.length)
    ];
  }

  // Locale-specific ambient thoughts
  switch (localeArchetype) {
    case 'COASTAL_TIDEWATER':
      return 'Smell that salty estuary breeze! Look at the shrimp boats bobbing on the tide.';
    case 'RURAL_AGRICULTURAL':
      return 'Endless prairie skies. We should check if any combines are harvesting those fields!';
    case 'AMUSEMENT_THEME_PARK':
      return 'Listen to that coaster ratchet on the lift hill! We have to ride the front car.';
    case 'ALPINE_SKI_RESORT':
      return 'Crisp mountain air at this altitude. Look at the gondolas climbing the ridge!';
    case 'TRIBAL_RESERVATION':
      return "Sprawling open lands. There's so much history in these vast rolling hills.";
    case 'SAFARI_WILDLIFE_PARK':
      return 'Keep your eyes open for wildlife tracks along this unpaved route.';
    case 'WILDERNESS_SANCTUARY':
      return "Pure tranquil silence. It's so serene exploring out here together.";
    case 'SHOPPING_MALL_PROMENADE':
      return 'Love the natural light filtering through these glass atrium skylights! Which concourse wing are we strolling down first?';
    case 'DENSE_URBAN':
    default:
      return 'The energy in this city is electric. Look at the skyline towering above us!';
  }
}

/**
 * Creates and manages the autonomous companion dot.
 *
 * @param {Object} options
 * @param {Cesium.Viewer} options.viewer - Active Cesium Viewer instance
 * @returns {Object} Companion Controller
 */
export function createCompanionDot({ viewer = null } = {}) {
  let entity = null;
  let currentCoordinates = null; // { lat, lon, height, heading }
  let currentCartesian = null;
  let isDestroyed = false;
  let isVisible = true;

  // Curiosity state machine
  let curiosityState = {
    isExploring: false,
    timerSeconds: 0,
    targetOffsetLat: 0,
    targetOffsetLon: 0,
    pauseDuration: 0,
  };

  let currentThought = 'Exploring the living world with you!';
  let lastThoughtTime = 0;

  const companionGroundTracker = createSurfaceTracker({
    sampleIntervalMs: 360,
    slewMps: 6.0,
    snapMeters: 25.0,
    maxSpikeMeters: 8.0,
  });

  function sampleTerrainHeight(carto) {
    if (!viewer) return carto?.height || 0;
    const exclude = entity ? [entity] : [];
    return sampleActiveGroundHeight(viewer, carto, exclude);
  }

  function removeEntity() {
    if (entity && viewer?.entities?.remove) {
      viewer.entities.remove(entity);
      entity = null;
    }
  }

  function spawn({ lat, lon, height = null, heading = 0 } = {}) {
    if (!viewer) return null;
    isDestroyed = false;
    companionGroundTracker.reset();
    if (entity) removeEntity();

    // Initial position inline / slightly leading alongside user so companion is immediately in-frame
    const spawnHeadingRad =
      ((Number.isFinite(heading) ? heading : 0) * Math.PI) / 180;
    const rightHeading = spawnHeadingRad + Math.PI / 2;
    const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const spawnLat =
      lat +
      (Math.cos(rightHeading) *
        COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS +
        Math.cos(spawnHeadingRad) *
          COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS) /
        111139.0;
    const spawnLon =
      lon +
      (Math.sin(rightHeading) *
        COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS +
        Math.sin(spawnHeadingRad) *
          COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS) /
        (111139.0 * cosLat);
    const fallbackH =
      height !== null && Number.isFinite(height)
        ? height
        : currentCoordinates?.height || 0;
    const carto = Cesium.Cartographic.fromDegrees(
      spawnLon,
      spawnLat,
      fallbackH,
    );
    const groundH =
      height !== null && Number.isFinite(height) && height !== 0
        ? height
        : sampleTerrainHeight(carto);
    const clampedH = groundH + 0.15;

    currentCoordinates = {
      lat: spawnLat,
      lon: spawnLon,
      height: clampedH,
      heading,
    };
    currentCartesian = Cesium.Cartesian3.fromDegrees(
      spawnLon,
      spawnLat,
      clampedH,
    );

    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(heading),
      0,
      0,
    );
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      currentCartesian,
      hpr,
    );

    const compName = getCompanionPersonaName();
    entity = viewer.entities.add({
      name: `${compName} (Autonomous Companion)`,
      position: new Cesium.ConstantPositionProperty(currentCartesian),
      orientation: new Cesium.ConstantProperty(orientation),
      point: {
        pixelSize: COMPANION_DEFAULTS.PIXEL_SIZE,
        color: Cesium.Color.fromCssColorString(
          COMPANION_DEFAULTS.COLOR,
        ).withAlpha(0.95),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: COMPANION_DEFAULTS.OUTLINE_WIDTH,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        isCompanion: true,
        role: 'companion',
        persona: {
          name: compName,
          vibeColor: COMPANION_DEFAULTS.COLOR,
          role: 'Autonomous Companion',
        },
      },
    });

    entity.show = isVisible;
    return entity;
  }

  /**
   * Updates companion position using elastic soft tether & ambient curiosity kinematics.
   *
   * @param {Object} params
   * @param {Object} params.userCoordinates - { lat, lon, height, heading }
   * @param {number} params.userSpeed - Speed in m/s
   * @param {number} params.deltaTimeSeconds - Frame delta time
   * @param {string} params.localeArchetype - Active settlement archetype
   */
  function update({
    userCoordinates,
    userSpeed = 0,
    deltaTimeSeconds = 0.016,
    localeArchetype = 'DENSE_URBAN',
    now = Date.now(),
  } = {}) {
    if (!entity || !userCoordinates || isDestroyed) return null;

    const dt = Math.min(deltaTimeSeconds, 0.1);

    // Compute distance to user in meters
    const dLat = (userCoordinates.lat - currentCoordinates.lat) * 111139.0;
    const dLon =
      (userCoordinates.lon - currentCoordinates.lon) *
      111139.0 *
      Math.cos((userCoordinates.lat * Math.PI) / 180);
    let distanceToUser = Math.hypot(dLat, dLon);

    let targetLat = userCoordinates.lat;
    let targetLon = userCoordinates.lon;
    let targetSpeed = userSpeed;
    let isExploring = false;

    // Hard leash boundary: teleport back into inline/leading slot if separated by >25m
    if (distanceToUser > COMPANION_DEFAULTS.MAX_TETHER_LEASH_METERS) {
      const returnHeadingRad = (userCoordinates.heading * Math.PI) / 180;
      const lateralHeading = returnHeadingRad + Math.PI / 2;
      const cosLat = Math.max(
        0.2,
        Math.cos((userCoordinates.lat * Math.PI) / 180),
      );
      targetLat =
        userCoordinates.lat +
        (Math.cos(lateralHeading) *
          COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS +
          Math.cos(returnHeadingRad) *
            COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS) /
          111139.0;
      targetLon =
        userCoordinates.lon +
        (Math.sin(lateralHeading) *
          COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS +
          Math.sin(returnHeadingRad) *
            COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS) /
          (111139.0 * cosLat);
      currentCoordinates.lat = targetLat;
      currentCoordinates.lon = targetLon;
      distanceToUser = Math.hypot(
        COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS,
        COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS,
      );
    }

    if (userSpeed < 0.2) {
      // User is paused! Activate ambient autonomous curiosity within the camera's forward-lateral arc
      // so the companion & thought bubble stay comfortably close and in-frame in ISO_CHASE.
      curiosityState.timerSeconds += dt;
      if (curiosityState.timerSeconds > curiosityState.pauseDuration) {
        curiosityState.timerSeconds = 0;
        curiosityState.pauseDuration = 3.5 + Math.random() * 4.0;
        const userHeadingRad =
          ((Number.isFinite(userCoordinates.heading)
            ? userCoordinates.heading
            : 0) *
            Math.PI) /
          180;
        const angle = userHeadingRad + (Math.random() - 0.5) * Math.PI * 1.1;
        const radius = 1.8 + Math.random() * 1.8;
        curiosityState.targetOffsetLat = (Math.cos(angle) * radius) / 111139.0;
        curiosityState.targetOffsetLon =
          (Math.sin(angle) * radius) /
          (111139.0 * Math.cos((userCoordinates.lat * Math.PI) / 180));
      }

      targetLat = userCoordinates.lat + curiosityState.targetOffsetLat;
      targetLon = userCoordinates.lon + curiosityState.targetOffsetLon;
      targetSpeed = COMPANION_DEFAULTS.STROLL_SPEED_MS;
      isExploring = true;
    } else {
      // User is moving (walking, sprinting, or 6.7 m/s scooter tour):
      // Ride inline & slightly leading (+0.8m ahead, 1.8m lateral) so the companion
      // stays clearly visible ahead/beside the player instead of falling behind the camera.
      curiosityState.timerSeconds = 0;
      const userHeadingRad = (userCoordinates.heading * Math.PI) / 180;
      const rightHeading = userHeadingRad + Math.PI / 2;
      const cosLat = Math.max(
        0.2,
        Math.cos((userCoordinates.lat * Math.PI) / 180),
      );

      const sideOffset = COMPANION_DEFAULTS.FORMATION_SIDE_OFFSET_METERS;
      const leadOffset = COMPANION_DEFAULTS.FORMATION_LEAD_OFFSET_METERS;

      targetLat =
        userCoordinates.lat +
        (Math.cos(rightHeading) * sideOffset +
          Math.cos(userHeadingRad) * leadOffset) /
          111139.0;
      targetLon =
        userCoordinates.lon +
        (Math.sin(rightHeading) * sideOffset +
          Math.sin(userHeadingRad) * leadOffset) /
          (111139.0 * cosLat);

      const slotLagMeters = Math.hypot(
        (targetLat - currentCoordinates.lat) * 111139.0,
        (targetLon - currentCoordinates.lon) * 111139.0 * cosLat,
      );
      const maxCatchupSpeed = Math.max(
        COMPANION_DEFAULTS.TROT_SPEED_MAX_MS,
        userSpeed * 1.5 + 1.5,
      );
      // Proportionally close any slot lag >0.25m so scooter-speed transit (6.7 m/s) never drops the companion behind
      targetSpeed =
        slotLagMeters > 0.25
          ? Math.min(maxCatchupSpeed, userSpeed + slotLagMeters * 1.8 + 0.6)
          : userSpeed;
    }

    // Step toward target coordinate
    const stepLat = targetLat - currentCoordinates.lat;
    const stepLon = targetLon - currentCoordinates.lon;
    const stepDistMeters = Math.hypot(
      stepLat * 111139.0,
      stepLon * 111139.0 * Math.cos((userCoordinates.lat * Math.PI) / 180),
    );

    let newHeading = currentCoordinates.heading;
    if (stepDistMeters > 0.1) {
      const moveMeters = Math.min(
        stepDistMeters,
        Math.max(0.4, targetSpeed) * dt,
      );
      const fraction = moveMeters / stepDistMeters;
      currentCoordinates.lat += stepLat * fraction;
      currentCoordinates.lon += stepLon * fraction;

      // Update heading facing movement direction
      const moveAngleRad = Math.atan2(
        stepLon * Math.cos((userCoordinates.lat * Math.PI) / 180),
        stepLat,
      );
      newHeading = ((moveAngleRad * 180) / Math.PI + 360) % 360;
    } else if (isExploring) {
      // Face towards user when stopped at curiosity point
      const faceAngleRad = Math.atan2(dLon, dLat);
      newHeading = ((faceAngleRad * 180) / Math.PI + 360) % 360;
    }

    currentCoordinates.heading = newHeading;

    // Ground clamping: in Google 3D mode, anchor cleanly to the user's sidewalk ground plane
    // instead of calling scene.sampleHeight() every frame (which starves tile texture uploads
    // and yanks the companion onto overhanging awnings or facades 2.2m to the side).
    const prevBaseH = Number.isFinite(currentCoordinates.height)
      ? currentCoordinates.height - 0.15
      : null;
    const userBaseH =
      Number.isFinite(userCoordinates.height) && userCoordinates.height !== 0
        ? userCoordinates.height
        : (prevBaseH ?? 0);

    let groundH = userBaseH;
    if (isPhotoreal3DActive(viewer)) {
      if (distanceToUser < 15.0 && Number.isFinite(userCoordinates.height)) {
        if (prevBaseH === null || Math.abs(userBaseH - prevBaseH) > 6.0) {
          groundH = userBaseH;
        } else {
          const delta = userBaseH - prevBaseH;
          const step = 6.0 * dt;
          groundH =
            prevBaseH +
            (Math.abs(delta) <= step ? delta : Math.sign(delta) * step);
        }
      } else {
        const carto = Cesium.Cartographic.fromDegrees(
          currentCoordinates.lon,
          currentCoordinates.lat,
          userBaseH,
        );
        const exclude = entity ? [entity] : [];
        const trackedH = companionGroundTracker.update(viewer, carto, now, {
          excludeEntities: exclude,
        });
        if (trackedH !== null && Number.isFinite(trackedH)) {
          groundH =
            Math.abs(trackedH - userBaseH) <= 6.0 ? trackedH : userBaseH;
        }
      }
    } else {
      const carto = Cesium.Cartographic.fromDegrees(
        currentCoordinates.lon,
        currentCoordinates.lat,
        userBaseH,
      );
      const exclude = entity ? [entity] : [];
      const trackedH = companionGroundTracker.update(viewer, carto, now, {
        excludeEntities: exclude,
      });
      groundH =
        trackedH !== null && Number.isFinite(trackedH) ? trackedH : userBaseH;
    }
    currentCoordinates.height = groundH + 0.15;

    currentCartesian = Cesium.Cartesian3.fromDegrees(
      currentCoordinates.lon,
      currentCoordinates.lat,
      currentCoordinates.height,
    );

    if (entity.position) {
      entity.position.setValue(currentCartesian);
    }

    if (entity.orientation) {
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(newHeading),
        0,
        0,
      );
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        currentCartesian,
        hpr,
      );
      entity.orientation.setValue(orientation);
    }

    // Refresh thought bubble every 12 seconds
    if (now - lastThoughtTime > 12000) {
      lastThoughtTime = now;
      currentThought = generateCompanionThought({
        localeArchetype,
        userSpeed,
        isExploringCuriosity: isExploring,
      });
    }

    return {
      cartesian: currentCartesian,
      coordinates: { ...currentCoordinates },
      isExploring,
      thought: currentThought,
      distanceToUser,
    };
  }

  function setVisible(val) {
    isVisible = Boolean(val);
    if (entity) entity.show = isVisible;
  }

  function teleport({ lat, lon, height = null, heading = 0 } = {}) {
    if (!entity || isDestroyed) return;
    companionGroundTracker.reset();
    const offsetLon = lon + 0.00003;
    const fallbackH =
      height !== null && Number.isFinite(height)
        ? height
        : currentCoordinates?.height || 0;
    const hasExplicitHeight =
      height !== null && Number.isFinite(height) && height !== 0;
    let baseGroundH = fallbackH;
    if (!hasExplicitHeight) {
      const carto = Cesium.Cartographic.fromDegrees(offsetLon, lat, fallbackH);
      baseGroundH = sampleTerrainHeight(carto);
    }
    const groundH = baseGroundH + 0.15;
    currentCoordinates = { lat, lon: offsetLon, height: groundH, heading };
    currentCartesian = Cesium.Cartesian3.fromDegrees(offsetLon, lat, groundH);
    if (entity.position) entity.position.setValue(currentCartesian);
  }

  function destroy() {
    removeEntity();
    currentCoordinates = null;
    currentCartesian = null;
    isDestroyed = true;
  }

  return {
    spawn,
    update,
    teleport,
    setVisible,
    getEntity: () => entity,
    getCoordinates: () =>
      currentCoordinates ? { ...currentCoordinates } : null,
    getCartesian: () =>
      currentCartesian ? Cesium.Cartesian3.clone(currentCartesian) : null,
    getThought: () => currentThought,
    setThought: (t) => {
      currentThought = t;
    },
    destroy,
    get isDestroyed() {
      return isDestroyed;
    },
    get isVisible() {
      return isVisible;
    },
  };
}
