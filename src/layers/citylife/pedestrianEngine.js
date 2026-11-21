/**
 * Pedestrian Simulation & Sidewalk Kinematics Engine for Living City.
 * (Living City Capability + Route Slice)
 *
 * Implements geodetic sidewalk offset projection, park & footway sanctuaries,
 * stochastic crosswalk pauses, demographic persona thought bubbles,
 * camera follow choreography (Companion Eye-Level, Flâneur, Balcony, Overview, Free Cam),
 * and camera altitude depth gating (<=1500m trigger / >2000m sleep pruning).
 */

import * as Cesium from 'cesium';
import {
  sampleActiveGroundHeight,
  trySampleSurfaceHeight,
  createSurfaceTracker,
  pickActiveGroundPosition,
} from './surfaceHeight.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../../renderGovernor.js';
import {
  LIVING_CITIES,
  resolveCity,
  findNearestCity,
  haversineDistanceMeters,
  calculateSidewalkOffset,
  ALTITUDE_DEPTH_THRESHOLD_M,
  ALTITUDE_EXIT_THRESHOLD_M,
  SIMULATION_RADIUS_M,
} from '../../citylife/cityWaypoints.js';
import { generatePersona } from '../../citylife/personaGenerator.js';
import { createThoughtBubbleOverlay } from '../../citylife/thoughtBubbleOverlay.js';
import { createUrbanEventsEngine } from './urbanEvents.js';
import { createContextualEntitySpool } from './contextualEntitySpool.js';
import { createAmbientSoundscape } from './ambientSoundscape.js';
import {
  resolveExemplarLocale,
  EXEMPLAR_LOCALES,
  classifySettlementTypology,
  SETTLEMENT_TYPOLOGIES,
} from './localeClassifier.js';

export const PEDESTRIAN_DENSITIES = {
  calm: { label: 'Calm', count: 40 },
  lively: { label: 'Lively', count: 90 },
  rush: { label: 'Rush Hour', count: 160 },
};

/**
 * Creates the complete Living City simulation engine.
 */
export function createPedestrianEngine({
  viewer = null,
  container = null,
} = {}) {
  let activeCity = null;
  let isSimActive = false;
  let activePedestrians = [];
  let latchedPedestrian = null;
  let currentCameraMode = 'companion'; // 'companion' | 'flaneur' | 'balcony' | 'overview' | 'city_map' | 'free'
  let currentDensityKey = 'lively';
  let isRaining = false;
  let isDestroyed = false;
  let speedMultiplier = 1.0;
  let isTransitioning = false;
  let flightGenerationToken = 0;
  let activeLocale = null;
  let activeTypology = null;

  const contextualSpool = createContextualEntitySpool({ viewer });
  const ambientSoundscape = createAmbientSoundscape();

  let preRenderListener = null;
  let screenClickHandler = null;
  let depthGateCheckTimer = null;

  let onCityDepthCallback = null;
  let onCityDepthExitCallback = null;
  let onPedestrianLatchedCallback = null;
  let lastFrameTime = null;
  let renderHoldActive = false;

  const cameraGroundTracker = createSurfaceTracker({
    sampleIntervalMs: 120,
    slewMps: 8.0,
    snapMeters: 25.0,
    maxSpikeMeters: 22.0,
  });
  const targetGroundTracker = createSurfaceTracker({
    sampleIntervalMs: 120,
    slewMps: 8.0,
    snapMeters: 25.0,
    maxSpikeMeters: 22.0,
  });

  function setPedestrianRenderHold(active) {
    const next = Boolean(active);
    if (next === renderHoldActive) return;
    renderHoldActive = next;
    if (next) {
      holdContinuousRender('pedestrian-sim');
      governorRequestRender('pedestrian-start');
    } else {
      releaseContinuousRender('pedestrian-sim');
    }
  }

  // Thought Bubble Overlay
  const thoughtBubble = createThoughtBubbleOverlay({
    viewer,
    container:
      container || (typeof document !== 'undefined' ? document.body : null),
  });
  thoughtBubble.onCameraMode?.((mode) => {
    setCameraMode(mode);
  });

  // Urban Spectacles Subsystem with mutual exclusion
  const urbanEvents = createUrbanEventsEngine({ viewer });
  urbanEvents.onEventStarted(() => {
    clearPedestrians();
  });

  /**
   * Generates a smooth Cartesian trajectory along waypoints for a pedestrian,
   * applying sidewalk lateral offsets if the corridor is a road.
   */
  function generatePedestrianTrajectory(
    corridor,
    offsetMeters = 4.5,
    sampleIntervalMeters = 4,
  ) {
    const waypoints = corridor.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length < 2) return [];

    const trajectory = [];
    const isStreet = corridor.type === 'street';

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];

      const dist = haversineDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);
      const steps = Math.max(1, Math.ceil(dist / sampleIntervalMeters));

      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const curLat = p1.lat + (p2.lat - p1.lat) * t;
        const curLon = p1.lon + (p2.lon - p1.lon) * t;
        const curElev = (p1.elev || 0) + ((p2.elev || 0) - (p1.elev || 0)) * t;

        if (isStreet) {
          const pt1 = { lat: curLat, lon: curLon, elev: curElev };
          const pt2 = { lat: p2.lat, lon: p2.lon, elev: p2.elev };
          const sidewalkPos = calculateSidewalkOffset(
            pt1,
            pt2,
            offsetMeters,
            0.15,
          );
          trajectory.push(sidewalkPos);
        } else {
          // Park or dedicated pedestrian sanctuary
          const cart = Cesium.Cartesian3.fromDegrees(
            curLon,
            curLat,
            curElev + 0.15,
          );
          trajectory.push(cart);
        }
      }
    }

    const last = waypoints[waypoints.length - 1];
    if (isStreet && waypoints.length >= 2) {
      const prev = waypoints[waypoints.length - 2];
      trajectory.push(calculateSidewalkOffset(prev, last, offsetMeters, 0.15));
    } else {
      trajectory.push(
        Cesium.Cartesian3.fromDegrees(
          last.lon,
          last.lat,
          (last.elev || 0) + 0.15,
        ),
      );
    }

    // Precompute cumulative arc distances for authentic human walking speed
    const cumDists = [0];
    let totalDist = 0;
    for (let i = 0; i < trajectory.length - 1; i++) {
      const segDist = Cesium.Cartesian3.distance(
        trajectory[i],
        trajectory[i + 1],
      );
      totalDist += segDist;
      cumDists.push(totalDist);
    }
    trajectory.cumulativeDistances = cumDists;
    trajectory.totalDistance = Math.max(totalDist, 1);

    return trajectory;
  }

  /**
   * Samples a position and forward tangent along a trajectory given a scalar distance in meters.
   */
  function sampleTrajectoryAtDistance(trajectory, distMeters) {
    const points = trajectory;
    const cumDists = trajectory.cumulativeDistances || [0, 1];
    const totalDist = trajectory.totalDistance || 1;

    let d = distMeters % totalDist;
    if (d < 0) d += totalDist;

    let segIdx = 0;
    for (let i = 0; i < cumDists.length - 1; i++) {
      if (d >= cumDists[i] && d <= cumDists[i + 1]) {
        segIdx = i;
        break;
      }
    }

    const p1 = points[segIdx] || points[0];
    const p2 = points[segIdx + 1] || p1;
    const segLen = cumDists[segIdx + 1] - cumDists[segIdx] || 1e-4;
    const t = Math.max(0, Math.min(1, (d - cumDists[segIdx]) / segLen));

    const pos = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
    const forward = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitudeSquared(forward) > 1e-6) {
      Cesium.Cartesian3.normalize(forward, forward);
    } else {
      Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z, forward);
    }

    return { pos, forward, segIdx };
  }

  /**
   * Spawns a cluster of simulated pedestrians in the active city.
   */
  function spawnPedestrians(city, densityKey = currentDensityKey) {
    clearPedestrians();
    if (!viewer?.entities || !city) return;

    activeCity = city;
    currentDensityKey = densityKey;
    const targetCount = PEDESTRIAN_DENSITIES[densityKey]?.count || 80;
    const corridors = city.corridors || [];
    if (corridors.length === 0) return;

    const spawned = [];
    const spawnNow =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (let i = 0; i < targetCount; i++) {
      const corridor = corridors[i % corridors.length];
      const sideOffset = (i % 2 === 0 ? 1 : -1) * (3.5 + (i % 3) * 1.2);
      const trajectory = generatePedestrianTrajectory(corridor, sideOffset, 4);

      if (trajectory.length < 3) continue;

      const initialDist = (i / targetCount) * trajectory.totalDistance;
      const { pos: initialPos, forward: initialForward } =
        sampleTrajectoryAtDistance(trajectory, initialDist);

      const groundTracker = createSurfaceTracker({
        sampleIntervalMs: 350,
        slewMps: 3.0,
        snapMeters: 20.0,
        maxSpikeMeters: 18.0,
      });
      const samplePhaseMs = (i % 8) * 45;

      // Clamp initialPos to ground if terrain or 3D tiles is loaded
      if (viewer?.scene) {
        const carto = Cesium.Cartographic.fromCartesian(
          initialPos,
          Cesium.Ellipsoid.WGS84,
          new Cesium.Cartographic(),
        );
        const groundH = groundTracker.update(
          viewer,
          carto,
          spawnNow + samplePhaseMs,
        );
        if (Number.isFinite(groundH)) {
          carto.height = groundH + 1.0;
          Cesium.Cartesian3.fromRadians(
            carto.longitude,
            carto.latitude,
            carto.height,
            Cesium.Ellipsoid.WGS84,
            initialPos,
          );
        }
      }

      // Generate demographic persona deterministically
      const startWp = corridor.waypoints[0];
      const persona = generatePersona(startWp.lat, startWp.lon, {
        city: city.id,
        seed: i * 77 + 13,
        isRaining,
      });

      // Calculate upright orientation along geodetic surface normal
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        initialPos,
        new Cesium.Cartesian3(),
      );
      const right = Cesium.Cartesian3.cross(
        initialForward,
        normal,
        new Cesium.Cartesian3(),
      );
      let orientationProp = undefined;
      if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
        Cesium.Cartesian3.normalize(right, right);
        const trueForward = Cesium.Cartesian3.cross(
          normal,
          right,
          new Cesium.Cartesian3(),
        );
        Cesium.Cartesian3.normalize(trueForward, trueForward);
        const rotMat = new Cesium.Matrix3(
          right.x,
          trueForward.x,
          normal.x,
          right.y,
          trueForward.y,
          normal.y,
          right.z,
          trueForward.z,
          normal.z,
        );
        const quat = Cesium.Quaternion.fromRotationMatrix(
          rotMat,
          new Cesium.Quaternion(),
        );
        orientationProp = new Cesium.ConstantProperty(quat);
      }

      // Sleek glowing pedestrian reticle: 2D screen-space moving dot on canvas
      const isInitialLatched = i === 0;
      const entity = viewer.entities.add({
        name: `${persona.name} (${persona.occupation})`,
        position: new Cesium.ConstantPositionProperty(initialPos),
        orientation: orientationProp,
        point: {
          pixelSize: isInitialLatched ? 14 : 8,
          color: Cesium.Color.fromCssColorString(
            persona.vibeColor || '#06b6d4',
          ).withAlpha(0.9),
          outlineColor: isInitialLatched
            ? Cesium.Color.WHITE
            : Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85),
          outlineWidth: isInitialLatched ? 2.5 : 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        cylinder: {
          length: 1.7,
          topRadius: 0.28,
          bottomRadius: 0.35,
          material: Cesium.Color.fromCssColorString(
            persona.vibeColor || '#06b6d4',
          ).withAlpha(0.85),
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
          outlineWidth: 1.5,
        },
        properties: {
          isPedestrian: true,
          persona,
        },
      });

      spawned.push({
        id: persona.id,
        entity,
        persona,
        trajectory,
        progressMeters: initialDist,
        currentPos: initialPos,
        currentForward: initialForward,
        corridor,
        groundTracker,
        samplePhaseMs,
        speedFraction: persona.walkingSpeedMs / 1.2,
        isPausedAtCrosswalk: false,
        pauseTicksRemaining: 0,
        hasPausedRecently: false,
      });
    }

    activePedestrians = spawned;
    isSimActive = true;
    setPedestrianRenderHold(true);

    // Default latch onto the first pedestrian if none active
    if (!latchedPedestrian && activePedestrians.length > 0) {
      latchOntoPedestrian(activePedestrians[0]);
    }
  }

  function clearPedestrians() {
    flightGenerationToken += 1;
    if (isTransitioning) {
      isTransitioning = false;
      try {
        viewer?.camera?.cancelFlight?.();
      } catch {
        /* ignore */
      }
    }
    setPedestrianRenderHold(false);
    cameraGroundTracker.reset();
    targetGroundTracker.reset();
    thoughtBubble.hide();
    latchedPedestrian = null;

    if (viewer?.camera && typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    if (viewer?.entities) {
      for (const ped of activePedestrians) {
        try {
          viewer.entities.remove(ped.entity);
        } catch {
          /* ignore */
        }
      }
    }
    activePedestrians = [];
    isSimActive = false;

    if (activeLocale) {
      contextualSpool.clearEntities();
      ambientSoundscape.stopSoundscape();
      activeLocale = null;
      activeTypology = null;
    }
  }

  /**
   * Latches camera and Thought Bubble onto a target pedestrian,
   * visually highlighting them with a prominent selected outlined dot.
   */
  function latchOntoPedestrian(ped) {
    if (!ped) return;

    // Revert previously latched pedestrian's dot to standard unselected styling
    if (
      latchedPedestrian &&
      latchedPedestrian !== ped &&
      latchedPedestrian.entity?.point
    ) {
      const prevPersona = latchedPedestrian.persona;
      latchedPedestrian.entity.point.pixelSize = 8;
      latchedPedestrian.entity.point.color = Cesium.Color.fromCssColorString(
        prevPersona?.vibeColor || '#06b6d4',
      ).withAlpha(0.9);
      latchedPedestrian.entity.point.outlineColor =
        Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85);
      latchedPedestrian.entity.point.outlineWidth = 1.5;
    }

    latchedPedestrian = ped;

    // Elevate the newly latched pedestrian to an unmistakable selected highlighted target dot
    if (ped.entity?.point) {
      ped.entity.point.pixelSize = 14;
      ped.entity.point.color = Cesium.Color.fromCssColorString(
        ped.persona?.vibeColor || '#06b6d4',
      );
      ped.entity.point.outlineColor = Cesium.Color.WHITE;
      ped.entity.point.outlineWidth = 2.5;
      ped.entity.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    }

    const pos =
      ped.currentPos ||
      (ped.trajectory?.[0]?.lat != null
        ? Cesium.Cartesian3.fromDegrees(
            ped.trajectory[0].lon,
            ped.trajectory[0].lat,
            (ped.trajectory[0].elev || 0) + 1.2,
          )
        : ped.trajectory?.[0]);
    thoughtBubble.show(pos, ped.persona);

    if (onPedestrianLatchedCallback) {
      onPedestrianLatchedCallback(ped);
    }
  }

  /**
   * Applies realistic camera perspectives following the latched pedestrian,
   * strictly enforcing the level horizon and anti-subterranean ground clamping.
   */
  function applyCameraFollow(ped, cameraMode = currentCameraMode) {
    if (
      !viewer?.camera ||
      !ped ||
      cameraMode === 'free' ||
      cameraMode === 'city_map'
    )
      return;

    // Reset any dirty Cesium lookAt transform matrix to World Identity
    if (typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    let curPos = ped.currentPos || ped.trajectory?.[0];
    if (!curPos) return;

    if (curPos.lat != null && curPos.lon != null) {
      curPos = Cesium.Cartesian3.fromDegrees(
        curPos.lon,
        curPos.lat,
        (curPos.elev || 0) + 1.2,
      );
    } else if (typeof curPos.x !== 'number' || Number.isNaN(curPos.x)) {
      return;
    }

    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      curPos,
      new Cesium.Cartesian3(),
    );
    if (!normal || Number.isNaN(normal.x)) return;

    const forwardSource =
      ped.currentForward ||
      viewer.camera.directionWC ||
      viewer.camera.direction ||
      new Cesium.Cartesian3(0, 0, -1);
    const forwardVec = Cesium.Cartesian3.clone(forwardSource);
    const right = Cesium.Cartesian3.cross(
      forwardVec,
      normal,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
      Cesium.Cartesian3.normalize(right, right);
    } else {
      const rightSource =
        viewer.camera.rightWC ||
        viewer.camera.right ||
        new Cesium.Cartesian3(1, 0, 0);
      Cesium.Cartesian3.clone(rightSource, right);
    }
    const trueForward = Cesium.Cartesian3.cross(
      normal,
      right,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(trueForward, trueForward);

    const camPos = Cesium.Cartesian3.clone(curPos, new Cesium.Cartesian3());
    const lookTarget = Cesium.Cartesian3.clone(curPos, new Cesium.Cartesian3());
    const scratchFwd = new Cesium.Cartesian3();
    const scratchUp = new Cesium.Cartesian3();
    const scratchRight = new Cesium.Cartesian3();

    if (cameraMode === 'companion') {
      // Companion Eye-Level: 1.75m eye height, 3.2m trailing, looking 8.0m down sidewalk
      Cesium.Cartesian3.multiplyByScalar(trueForward, -3.2, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 1.75, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(trueForward, 8.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 1.5, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else if (cameraMode === 'flaneur') {
      // Street-corner observer: 3.5m up, 8.0m lateral offset, 4.0m ahead, looking at stroller
      Cesium.Cartesian3.multiplyByScalar(right, 8.0, scratchRight);
      Cesium.Cartesian3.multiplyByScalar(normal, 3.5, scratchUp);
      Cesium.Cartesian3.multiplyByScalar(trueForward, 4.0, scratchFwd);
      Cesium.Cartesian3.add(camPos, scratchRight, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.2, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else if (cameraMode === 'balcony') {
      // Second-story balcony: 16.0m up, 18.0m trailing, looking down at 40 degrees
      Cesium.Cartesian3.multiplyByScalar(trueForward, -18.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 16.0, scratchUp);
      Cesium.Cartesian3.multiplyByScalar(right, 4.0, scratchRight);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);
      Cesium.Cartesian3.add(camPos, scratchRight, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.0, scratchUp);
      Cesium.Cartesian3.multiplyByScalar(trueForward, 2.0, scratchFwd);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    } else if (cameraMode === 'overview') {
      // Tactical overhead overview: 95.0m up, 55.0m trailing, looking down at 60 degrees
      Cesium.Cartesian3.multiplyByScalar(trueForward, -55.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 95.0, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.0, scratchUp);
      Cesium.Cartesian3.multiplyByScalar(trueForward, 4.0, scratchFwd);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    }

    // Anti-subterranean clamp for camPos and lookTarget across 3D and 2D regimes
    if (viewer?.scene) {
      const followNow =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const excludeEntities = [ped.entity, ped.cesiumEntity].filter(Boolean);
      const camCarto = Cesium.Cartographic.fromCartesian(
        camPos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      const groundH = cameraGroundTracker.update(viewer, camCarto, followNow, {
        excludeEntities,
      });
      const minBuffer = cameraMode === 'companion' ? 1.6 : 3.0;
      if (Number.isFinite(groundH) && camCarto.height < groundH + minBuffer) {
        camCarto.height = groundH + minBuffer;
        Cesium.Cartesian3.fromRadians(
          camCarto.longitude,
          camCarto.latitude,
          camCarto.height,
          Cesium.Ellipsoid.WGS84,
          camPos,
        );
      }

      const targetCarto = Cesium.Cartographic.fromCartesian(
        lookTarget,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      const targetGroundH = targetGroundTracker.update(
        viewer,
        targetCarto,
        followNow,
        { excludeEntities },
      );
      if (
        Number.isFinite(targetGroundH) &&
        targetCarto.height < targetGroundH + 0.5
      ) {
        targetCarto.height = targetGroundH + 0.5;
        Cesium.Cartesian3.fromRadians(
          targetCarto.longitude,
          targetCarto.latitude,
          targetCarto.height,
          Cesium.Ellipsoid.WGS84,
          lookTarget,
        );
      }
    }

    if (viewer.scene?.screenSpaceCameraController) {
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    }

    const direction = Cesium.Cartesian3.subtract(
      lookTarget,
      camPos,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(direction, direction);

    if (typeof viewer.camera.setView === 'function') {
      viewer.camera.setView({
        destination: camPos,
        orientation: {
          direction,
          up: normal,
        },
      });
    }
  }

  /**
   * Flies the camera to a majestic panoramic city map overview without latching to a single pedestrian.
   */
  function showCityMap(cityQuery) {
    if (!viewer || isDestroyed) return null;
    urbanEvents.stopUrbanEvent();

    const city = resolveCity(cityQuery || activeCity?.id || 'atlanta');
    activeCity = city;
    currentCameraMode = 'city_map';
    if (latchedPedestrian?.entity?.point) {
      const prevPersona = latchedPedestrian.persona;
      latchedPedestrian.entity.point.pixelSize = 8;
      latchedPedestrian.entity.point.color = Cesium.Color.fromCssColorString(
        prevPersona?.vibeColor || '#06b6d4',
      ).withAlpha(0.9);
      latchedPedestrian.entity.point.outlineColor =
        Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85);
      latchedPedestrian.entity.point.outlineWidth = 1.5;
    }
    latchedPedestrian = null;
    thoughtBubble.hide();

    if (typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    // Ensure pedestrian simulation runs in background if not already active
    if (!isSimActive || activePedestrians.length === 0) {
      spawnPedestrians(city, currentDensityKey);
      latchedPedestrian = null; // Unlatched for clean overview map
    }

    isTransitioning = true;
    const myFlightToken = ++flightGenerationToken;
    viewer.camera.cancelFlight?.();
    governorRequestRender('pedestrian-city-map');
    const ov = city.overviewCamera || {
      lon: city.lon,
      lat: city.lat - 0.015,
      height: Math.max(2200, (city.elev || 0) + 2200),
      headingDeg: city.headingDeg || 30,
      pitchDeg: -48,
    };

    const dest = Cesium.Cartesian3.fromDegrees(ov.lon, ov.lat, ov.height);
    viewer.camera.flyTo({
      destination: dest,
      orientation: {
        heading: Cesium.Math.toRadians(ov.headingDeg || 30),
        pitch: Cesium.Math.toRadians(ov.pitchDeg || -48),
        roll: 0,
      },
      duration: 1.8,
      complete: () => {
        if (myFlightToken === flightGenerationToken) {
          isTransitioning = false;
        }
      },
      cancel: () => {
        if (myFlightToken === flightGenerationToken) {
          isTransitioning = false;
        }
      },
    });

    return city;
  }

  /**
   * Smoothly glides the camera down to street level and ignites city life simulation.
   */
  async function stepIntoCity(cityQuery = 'atlanta', options = {}) {
    if (!viewer || isDestroyed) return null;

    urbanEvents.stopUrbanEvent();
    const city = resolveCity(cityQuery);
    const density = options.density || currentDensityKey;
    currentCameraMode = options.cameraMode || 'companion';

    // Clear any dirty lookAt transform
    if (typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    viewer.camera?.cancelFlight?.();
    governorRequestRender('pedestrian-step-city');

    // Cleanly unlatch and clear old city if switching cities or starting afresh
    const isCityChanged = activeCity && activeCity.id !== city.id;
    if (isCityChanged || !isSimActive) {
      latchedPedestrian = null;
      thoughtBubble.hide();
      clearPedestrians();
    }
    activeCity = city;

    // Pick first corridor arrival vantage point
    const corridors = city.corridors || [];
    const firstWp = corridors[0]?.waypoints?.[0] || {
      lat: city.lat,
      lon: city.lon,
      elev: city.elev,
    };
    const targetPos = Cesium.Cartesian3.fromDegrees(
      firstWp.lon,
      firstWp.lat,
      (firstWp.elev || city.elev || 0) + (city.defaultAlt || 25),
    );

    // Smooth camera glide without preRender interference
    isTransitioning = true;
    const myFlightToken = ++flightGenerationToken;
    let flightCancelled = false;
    await new Promise((resolve) => {
      viewer.camera.flyTo({
        destination: targetPos,
        orientation: {
          heading: Cesium.Math.toRadians(city.headingDeg || 30),
          pitch: Cesium.Math.toRadians(city.pitchDeg || -15),
          roll: 0,
        },
        duration: options.duration ?? 2.0,
        complete: () => {
          isTransitioning = false;
          resolve();
        },
        cancel: () => {
          isTransitioning = false;
          flightCancelled = true;
          resolve();
        },
      });
    });

    if (
      flightCancelled ||
      myFlightToken !== flightGenerationToken ||
      isDestroyed
    ) {
      return null;
    }

    // Spawn and latch AFTER camera arrival completes
    spawnPedestrians(city, density);

    return city;
  }

  /**
   * Smoothly glides the camera down to arbitrary terrestrial coordinates and ignites
   * universal living world simulation with contextual entities, multi-topology pathing,
   * zero-token monologues, and ambient soundscapes.
   */
  async function stepIntoLocale(localeQuery = 'darien_ga', options = {}) {
    if (!viewer || isDestroyed) return null;

    urbanEvents.stopUrbanEvent();
    clearPedestrians();

    const locale =
      resolveExemplarLocale(localeQuery) || EXEMPLAR_LOCALES.darien_ga;
    activeLocale = locale;
    activeCity = null;
    activeTypology = options.typology || locale.typology;
    currentCameraMode = options.cameraMode || 'companion';

    if (typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    viewer.camera?.cancelFlight?.();
    governorRequestRender('pedestrian-step-locale');

    const corridors = locale.corridors || [];
    const firstWp = corridors[0]?.waypoints?.[0] || {
      lat: locale.lat,
      lon: locale.lon,
      elev: locale.elev || 0,
    };
    const targetPos = Cesium.Cartesian3.fromDegrees(
      firstWp.lon,
      firstWp.lat,
      (firstWp.elev || locale.elev || 0) + (locale.defaultAlt || 30),
    );

    isTransitioning = true;
    const myFlightToken = ++flightGenerationToken;
    let flightCancelled = false;
    await new Promise((resolve) => {
      viewer.camera.flyTo({
        destination: targetPos,
        orientation: {
          heading: Cesium.Math.toRadians(locale.headingDeg || 30),
          pitch: Cesium.Math.toRadians(locale.pitchDeg || -15),
          roll: 0,
        },
        duration: options.duration ?? 2.0,
        complete: () => {
          isTransitioning = false;
          resolve();
        },
        cancel: () => {
          isTransitioning = false;
          flightCancelled = true;
          resolve();
        },
      });
    });

    if (
      flightCancelled ||
      myFlightToken !== flightGenerationToken ||
      isDestroyed
    ) {
      return null;
    }

    const density = options.density || currentDensityKey;
    contextualSpool.spawnEntitiesForLocale(locale, density);
    ambientSoundscape.startSoundscape(activeTypology);

    isSimActive = true;
    setPedestrianRenderHold(true);
    const latched = contextualSpool.getLatchedEntity();
    if (latched?.persona) {
      const pos =
        latched.currentPos ||
        (latched.trajectory?.[0]?.lat != null
          ? Cesium.Cartesian3.fromDegrees(
              latched.trajectory[0].lon,
              latched.trajectory[0].lat,
              (latched.trajectory[0].elev || 0) + 1.2,
            )
          : latched.trajectory?.[0]);
      thoughtBubble.show(pos, latched.persona);
      applyCameraFollow(latched, currentCameraMode);
    }

    return locale;
  }

  function generateProceduralCorridors(lat, lon, groundElev, typologyKey) {
    const latDelta = 0.0012;
    const lonDelta = 0.0015;

    let corridorType = 'rural_shoulder';
    let secondaryType = 'rural_shoulder';
    if (typologyKey === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER) {
      corridorType = 'pier';
      secondaryType = 'rural_shoulder';
    } else if (typologyKey === SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL) {
      corridorType = 'swath';
      secondaryType = 'swath';
    } else if (typologyKey === SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK) {
      corridorType = 'midway_concourse';
      secondaryType = 'coaster_spline';
    } else if (typologyKey === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
      corridorType = 'studio_backlot_lane';
      secondaryType = 'dolly_track_spline';
    } else if (typologyKey === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE) {
      corridorType = 'mall_concourse';
      secondaryType = 'mall_concourse';
    }

    return [
      {
        id: 'proc_corridor_1',
        name: 'Primary Living Corridor',
        type: corridorType,
        roadWidthMeters: 7.0,
        waypoints: [
          { lat: lat - latDelta, lon: lon - lonDelta, elev: groundElev },
          {
            lat: lat - latDelta * 0.3,
            lon: lon - lonDelta * 0.3,
            elev: groundElev,
          },
          { lat, lon, elev: groundElev },
          {
            lat: lat + latDelta * 0.4,
            lon: lon + lonDelta * 0.4,
            elev: groundElev,
          },
          { lat: lat + latDelta, lon: lon + lonDelta, elev: groundElev },
        ],
      },
      {
        id: 'proc_corridor_2',
        name: 'Secondary Crossway',
        type: secondaryType,
        roadWidthMeters: 6.0,
        waypoints: [
          {
            lat: lat + latDelta * 0.7,
            lon: lon - lonDelta * 0.7,
            elev: groundElev,
          },
          {
            lat,
            lon,
            elev: groundElev + (secondaryType === 'coaster_spline' ? 45 : 0),
          },
          {
            lat: lat - latDelta * 0.7,
            lon: lon + lonDelta * 0.7,
            elev: groundElev,
          },
        ],
      },
    ];
  }

  /**
   * Smoothly descends to the current camera location (or arbitrary lat/lon) anywhere
   * on Earth and ignites a contextual living world based on local settlement & biome typology.
   */
  async function stepIntoCurrentLocation(options = {}) {
    if (!viewer || isDestroyed) return null;

    urbanEvents.stopUrbanEvent();
    clearPedestrians();

    let lat = options.lat;
    let lon = options.lon;
    let groundElev = 0;

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      try {
        const scene = viewer.scene;
        const camera = scene?.camera || viewer.camera;
        if (scene?.canvas?.clientWidth && camera) {
          const centerPos = new Cesium.Cartesian2(
            scene.canvas.clientWidth / 2,
            scene.canvas.clientHeight / 2,
          );
          const pickPos = pickActiveGroundPosition(viewer, centerPos);
          if (pickPos) {
            const pickCarto = Cesium.Cartographic.fromCartesian(pickPos);
            lat = Cesium.Math.toDegrees(pickCarto.latitude);
            lon = Cesium.Math.toDegrees(pickCarto.longitude);
            groundElev = pickCarto.height;
          }
        }
        if (typeof lat !== 'number' || typeof lon !== 'number') {
          if (viewer.camera?.positionWC) {
            const carto = Cesium.Cartographic.fromCartesian(
              viewer.camera.positionWC,
            );
            lat = Cesium.Math.toDegrees(carto.latitude);
            lon = Cesium.Math.toDegrees(carto.longitude);
          } else if (viewer.camera?.position) {
            const carto = Cesium.Cartographic.fromCartesian(
              viewer.camera.position,
            );
            lat = Cesium.Math.toDegrees(carto.latitude);
            lon = Cesium.Math.toDegrees(carto.longitude);
          }
        }
      } catch {
        lat = 31.3702;
        lon = -81.434;
      }
    }
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      lat = 31.3702;
      lon = -81.434;
    }

    if (groundElev === 0 && viewer?.scene) {
      try {
        const carto = Cesium.Cartographic.fromDegrees(lon, lat);
        const h = trySampleSurfaceHeight(viewer, carto);
        if (Number.isFinite(h)) groundElev = h;
      } catch {
        /* fallback 0 */
      }
    }

    const classification = classifySettlementTypology({
      lat,
      lon,
      elevationMeters: groundElev,
    });
    const typologyKey = options.typology || classification.typology;

    activeTypology = typologyKey;
    activeLocale = null;
    activeCity = null;
    currentCameraMode = options.cameraMode || 'companion';

    if (typeof viewer.camera?.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    viewer.camera?.cancelFlight?.();
    governorRequestRender('pedestrian-step-location');

    const dynamicLocale = {
      id: `dynamic_locale_${Math.round(lat * 100)}_${Math.round(lon * 100)}`,
      name: classification.name,
      icon: classification.icon,
      region: `Terrestrial Coordinates (${lat.toFixed(3)}°, ${lon.toFixed(3)}°)`,
      country: 'Earth',
      typology: typologyKey,
      lat,
      lon,
      elev: groundElev,
      defaultAlt: 28,
      headingDeg: 45,
      pitchDeg: -12,
      landmarks: [`${classification.name} Outpost`],
      corridors: generateProceduralCorridors(lat, lon, groundElev, typologyKey),
    };

    activeLocale = dynamicLocale;

    const targetPos = Cesium.Cartesian3.fromDegrees(lon, lat, groundElev + 28);

    isTransitioning = true;
    const myFlightToken = ++flightGenerationToken;
    let flightCancelled = false;
    if (viewer.camera?.flyTo) {
      await new Promise((resolve) => {
        viewer.camera.flyTo({
          destination: targetPos,
          orientation: {
            heading: Cesium.Math.toRadians(45),
            pitch: Cesium.Math.toRadians(-12),
            roll: 0,
          },
          duration: options.duration ?? 1.8,
          complete: () => {
            isTransitioning = false;
            resolve();
          },
          cancel: () => {
            isTransitioning = false;
            flightCancelled = true;
            resolve();
          },
        });
      });
    } else {
      isTransitioning = false;
    }

    if (
      flightCancelled ||
      myFlightToken !== flightGenerationToken ||
      isDestroyed
    ) {
      return null;
    }

    const density = options.density || currentDensityKey;
    contextualSpool.spawnEntitiesForLocale(dynamicLocale, density);
    ambientSoundscape.startSoundscape(activeTypology);

    isSimActive = true;
    setPedestrianRenderHold(true);
    const latched = contextualSpool.getLatchedEntity();
    if (latched?.persona) {
      const pos =
        latched.currentPos ||
        (latched.trajectory?.[0]?.lat != null
          ? Cesium.Cartesian3.fromDegrees(
              latched.trajectory[0].lon,
              latched.trajectory[0].lat,
              (latched.trajectory[0].elev || 0) + 1.2,
            )
          : latched.trajectory?.[0]);
      thoughtBubble.show(pos, latched.persona);
      applyCameraFollow(latched, currentCameraMode);
    }

    return dynamicLocale;
  }

  /**
   * Frame-by-frame simulation update loop.
   */
  function bindPreRenderLoop() {
    if (preRenderListener || !viewer?.scene?.preRender) return;

    preRenderListener = viewer.scene.preRender.addEventListener(() => {
      if (!isSimActive || isDestroyed || isTransitioning) return;
      if (urbanEvents.getActiveEvent()) return; // Never fight with an active spectacle!

      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = lastFrameTime
        ? Math.min((now - lastFrameTime) / 1000, 0.05)
        : 0.016;
      lastFrameTime = now;

      // Update pedestrian positions along trajectories
      for (const ped of activePedestrians) {
        if (ped.isPausedAtCrosswalk) {
          ped.pauseTicksRemaining -= dt;
          if (ped.pauseTicksRemaining <= 0) {
            ped.isPausedAtCrosswalk = false;
          }
        } else {
          // Advance progress along trajectory at authentic human walking speed
          const baseSpeedMs = ped.persona?.walkingSpeedMs || 0.45;
          const speedMs = baseSpeedMs * speedMultiplier;
          ped.progressMeters =
            (ped.progressMeters + speedMs * dt) % ped.trajectory.totalDistance;

          // Stochastic crosswalk pause near endpoints or mid-corridor
          const total = ped.trajectory.totalDistance;
          if (
            Math.abs(ped.progressMeters - total / 2) < 0.6 ||
            ped.progressMeters < 0.6
          ) {
            if (!ped.hasPausedRecently && Math.random() < 0.006) {
              ped.isPausedAtCrosswalk = true;
              ped.pauseTicksRemaining = 2.0 + Math.random() * 2.5; // 2 - 4.5 seconds
              ped.hasPausedRecently = true;
            }
          } else {
            ped.hasPausedRecently = false;
          }
        }

        const { pos, forward } = sampleTrajectoryAtDistance(
          ped.trajectory,
          ped.progressMeters,
        );

        // Anti-subterranean ground clamping of pedestrian across 3D and 2D regimes
        if (viewer?.scene) {
          const carto = Cesium.Cartographic.fromCartesian(
            pos,
            Cesium.Ellipsoid.WGS84,
            new Cesium.Cartographic(),
          );
          const excludeEntities = ped.entity ? [ped.entity] : [];
          const groundH = ped.groundTracker
            ? ped.groundTracker.update(
                viewer,
                carto,
                now + (ped.samplePhaseMs || 0),
                { excludeEntities },
              )
            : trySampleSurfaceHeight(viewer, carto, excludeEntities);
          if (Number.isFinite(groundH)) {
            carto.height = groundH + 1.0;
            Cesium.Cartesian3.fromRadians(
              carto.longitude,
              carto.latitude,
              carto.height,
              Cesium.Ellipsoid.WGS84,
              pos,
            );
          }
        }

        ped.currentPos = pos;
        ped.currentForward = forward;
        ped.entity.position = new Cesium.ConstantPositionProperty(pos);

        // Update upright orientation along surface normal
        const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
          pos,
          new Cesium.Cartesian3(),
        );
        const right = Cesium.Cartesian3.cross(
          forward,
          normal,
          new Cesium.Cartesian3(),
        );
        if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
          Cesium.Cartesian3.normalize(right, right);
          const trueForward = Cesium.Cartesian3.cross(
            normal,
            right,
            new Cesium.Cartesian3(),
          );
          Cesium.Cartesian3.normalize(trueForward, trueForward);
          const rotMat = new Cesium.Matrix3(
            right.x,
            trueForward.x,
            normal.x,
            right.y,
            trueForward.y,
            normal.y,
            right.z,
            trueForward.z,
            normal.z,
          );
          const quat = Cesium.Quaternion.fromRotationMatrix(
            rotMat,
            new Cesium.Quaternion(),
          );
          ped.entity.orientation = new Cesium.ConstantProperty(quat);
        }
      }

      // Camera choreography & thought bubble update
      if (latchedPedestrian) {
        applyCameraFollow(latchedPedestrian, currentCameraMode);
        const latchedPos =
          latchedPedestrian.currentPos || latchedPedestrian.trajectory[0];
        thoughtBubble.updatePosition(latchedPos);
      } else if (activeLocale) {
        const latchedContextual = contextualSpool.getLatchedEntity();
        if (latchedContextual) {
          applyCameraFollow(latchedContextual, currentCameraMode);
          const latchedPos =
            latchedContextual.currentPos ||
            (latchedContextual.cesiumEntity?.position?.getValue
              ? latchedContextual.cesiumEntity.position.getValue(
                  viewer.clock?.currentTime || Cesium.JulianDate.now(),
                )
              : latchedContextual.cesiumEntity?.position);
          if (latchedPos) {
            thoughtBubble.updatePosition(latchedPos);
          }
        }
      }

      // Contextual Living World Spool & Ambient Soundscape update
      if (activeLocale) {
        contextualSpool.update(0.016 * speedMultiplier);
        if (viewer?.camera?.positionWC) {
          try {
            const camCarto = Cesium.Cartographic.fromCartesian(
              viewer.camera.positionWC,
            );
            ambientSoundscape.updateAltitude(camCarto.height);
          } catch {
            /* ignore */
          }
        }
      }
    });
  }

  /**
   * Installs click-to-latch on pedestrian entities in the 3D scene.
   */
  function installClickHandler() {
    if (
      !viewer?.scene?.canvas ||
      typeof Cesium.ScreenSpaceEventHandler === 'undefined'
    )
      return;

    try {
      screenClickHandler = new Cesium.ScreenSpaceEventHandler(
        viewer.scene.canvas,
      );
      screenClickHandler.setInputAction((click) => {
        if (!isSimActive || isDestroyed) return;
        const picked = viewer.scene.pick(click.position);

        if (picked?.id?.properties?.isPedestrian) {
          const pedProp = picked.id.properties.persona;
          const pedPersona = pedProp?.getValue ? pedProp.getValue() : pedProp;
          const target = activePedestrians.find(
            (p) =>
              p.persona?.id === pedPersona?.id ||
              p.persona?.name === pedPersona?.name,
          );
          if (target) {
            viewer.camera?.cancelFlight?.();
            latchOntoPedestrian(target);
            applyCameraFollow(target, currentCameraMode);
            governorRequestRender('pedestrian-latch');
          }
        } else if (picked?.id?.properties?.spoolId) {
          const spoolProp = picked.id.properties.spoolId;
          const spoolId = spoolProp?.getValue
            ? spoolProp.getValue()
            : spoolProp;
          const target = contextualSpool
            .getActiveEntities()
            .find((e) => e.id === spoolId);
          if (target) {
            viewer.camera?.cancelFlight?.();
            latchedPedestrian = null;
            contextualSpool.latchOntoEntity(target);
            const pos =
              target.currentPos ||
              (target.trajectory?.[0]?.lat != null
                ? Cesium.Cartesian3.fromDegrees(
                    target.trajectory[0].lon,
                    target.trajectory[0].lat,
                    (target.trajectory[0].elev || 0) + 1.2,
                  )
                : target.trajectory?.[0]);
            thoughtBubble.show(pos, target.persona);
            applyCameraFollow(target, currentCameraMode);
            governorRequestRender('pedestrian-spool-latch');
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      // Headless / non-browser environment
    }
  }

  /**
   * Altitude depth gate check: monitors camera altitude to trigger the HUD action pill
   * or sleep/prune the simulation when zooming out > 2000m.
   */
  function startDepthGateWatchdog() {
    if (typeof setInterval === 'undefined') return;

    depthGateCheckTimer = setInterval(() => {
      if (!viewer?.camera || isDestroyed) return;

      try {
        const scene = viewer.scene;
        const camera = scene?.camera || viewer.camera;
        if (!camera) return;

        let lat = null;
        let lon = null;
        let altAGL = 999999;
        let groundElev = 0;

        // 1. Raycast center of screen across 3D tiles & terrain globe
        if (scene?.canvas?.clientWidth) {
          const centerPos = new Cesium.Cartesian2(
            scene.canvas.clientWidth / 2,
            scene.canvas.clientHeight / 2,
          );
          const pickPos = pickActiveGroundPosition(viewer, centerPos);
          if (pickPos) {
            const pickCarto = Cesium.Cartographic.fromCartesian(pickPos);
            lat = Cesium.Math.toDegrees(pickCarto.latitude);
            lon = Cesium.Math.toDegrees(pickCarto.longitude);
            groundElev = pickCarto.height;
            const camPos = camera.positionWC || camera.position;
            if (camPos) {
              altAGL = Cesium.Cartesian3.distance(camPos, pickPos);
            }
          }
        }

        // 2. Fallback to camera eye position if tilted towards sky/space
        if (lat === null || lon === null) {
          const camCarto = Cesium.Cartographic.fromCartesian(
            camera.positionWC || camera.position,
          );
          lat = Cesium.Math.toDegrees(camCarto.latitude);
          lon = Cesium.Math.toDegrees(camCarto.longitude);
          const h = sampleActiveGroundHeight(viewer, camCarto);
          if (Number.isFinite(h)) groundElev = h;
          altAGL = Math.max(0, camCarto.height - groundElev);
        }

        // Sleep / Prune if zoomed above 2000m AGL (unless in city map overview) or panned away (>35km)
        if (isSimActive && (activeCity || activeLocale)) {
          const targetLat = activeCity ? activeCity.lat : activeLocale.lat;
          const targetLon = activeCity ? activeCity.lon : activeLocale.lon;
          const distFromTarget = haversineDistanceMeters(
            lat,
            lon,
            targetLat,
            targetLon,
          );
          if (
            (currentCameraMode !== 'city_map' &&
              altAGL > ALTITUDE_EXIT_THRESHOLD_M) ||
            distFromTarget > 35000
          ) {
            clearPedestrians();
            return;
          }
        }

        // Ambient depth trigger if below 1500m AGL over a living city or arbitrary biome on Earth
        if (!isSimActive && altAGL <= ALTITUDE_DEPTH_THRESHOLD_M) {
          const nearest = findNearestCity(lat, lon, 25000);
          if (nearest && onCityDepthCallback) {
            onCityDepthCallback(nearest, altAGL);
          } else if (onCityDepthCallback) {
            const classification = classifySettlementTypology({
              lat,
              lon,
              elevationMeters: groundElev,
            });
            onCityDepthCallback(
              {
                id: 'current_location',
                name: classification.name,
                icon: classification.icon,
                typology: classification.typology,
                lat,
                lon,
                isDynamic: true,
              },
              altAGL,
            );
          }
        } else if (!isSimActive && altAGL > ALTITUDE_DEPTH_THRESHOLD_M) {
          if (onCityDepthExitCallback) {
            onCityDepthExitCallback();
          }
        }
      } catch {
        /* ignore */
      }
    }, 1000);
  }

  // Bind loops
  bindPreRenderLoop();
  installClickHandler();
  startDepthGateWatchdog();

  /**
   * Telemetry for HUD summary integration.
   */
  function getActiveTelemetry() {
    if (urbanEvents.getActiveEvent()) {
      return urbanEvents.getActiveTelemetry();
    }

    if (!isSimActive || (!activeCity && !activeLocale)) return null;

    if (activeLocale) {
      const latched = contextualSpool.getLatchedEntity();
      const p = latched?.persona;
      return {
        isActive: true,
        isSpectacle: false,
        currentLocation: activeLocale.name || 'Living World',
        personaName: p?.name || 'Local Contact',
        occupation: p?.occupation || 'Resident',
        thought: p?.thought || 'In the living world',
        speedKmh: Number(
          p?.speedKmh ||
            (latched?.speedMs ? (latched.speedMs * 3.6).toFixed(1) : 1.5),
        ),
        activePedestrians: contextualSpool.getEntityCount(),
        density: currentDensityKey,
        isRaining,
        cameraMode: currentCameraMode,
        speedMultiplier,
      };
    }

    const latched = latchedPedestrian;
    const baseSpeed = latched?.persona?.walkingSpeedMs || 0.45;
    return {
      isActive: true,
      isSpectacle: false,
      currentLocation: activeCity.name,
      personaName: latched?.persona?.name || 'Stroller',
      occupation: latched?.persona?.occupation || 'Citizen',
      thought: latched?.persona?.thought || 'Enjoying the city',
      speedKmh: Number((baseSpeed * speedMultiplier * 3.6).toFixed(1)),
      activePedestrians: activePedestrians.length,
      density: currentDensityKey,
      isRaining,
      cameraMode: currentCameraMode,
      speedMultiplier,
    };
  }

  function setCameraMode(mode) {
    currentCameraMode = mode;
    thoughtBubble.setCameraMode?.(mode);
    viewer?.camera?.cancelFlight?.();
    if (mode === 'city_map') {
      showCityMap(activeCity?.id);
    } else if (mode === 'free' && viewer) {
      viewer.trackedEntity = undefined;
      governorRequestRender('pedestrian-free-cam');
    } else if (latchedPedestrian) {
      applyCameraFollow(latchedPedestrian, mode);
      governorRequestRender('pedestrian-camera');
    } else if (activeLocale) {
      const latchedContextual = contextualSpool.getLatchedEntity();
      if (latchedContextual) {
        applyCameraFollow(latchedContextual, mode);
        governorRequestRender('pedestrian-camera');
      }
    }
  }

  function setSpeedMultiplier(factor) {
    speedMultiplier = Math.max(0.2, Math.min(3.0, Number(factor) || 1.0));
  }

  function setDensity(densityKey) {
    if (activeCity) {
      spawnPedestrians(activeCity, densityKey);
    }
  }

  function toggleRain(enable = !isRaining) {
    isRaining = Boolean(enable);
    if (activeCity && isSimActive) {
      spawnPedestrians(activeCity, currentDensityKey);
    }
  }

  function snapBack(mode = 'companion') {
    currentCameraMode = mode;
    viewer?.camera?.cancelFlight?.();
    if (latchedPedestrian) {
      applyCameraFollow(latchedPedestrian, mode);
      governorRequestRender('pedestrian-snap-back');
    }
  }

  function cyclePedestrian(direction = 1) {
    if (activePedestrians.length === 0) return null;
    const curIdx = latchedPedestrian
      ? activePedestrians.findIndex(
          (p) => p.id === latchedPedestrian.persona?.id,
        )
      : 0;
    const safeCur = curIdx >= 0 ? curIdx : 0;
    const nextIdx =
      (safeCur + direction + activePedestrians.length) %
      activePedestrians.length;
    const nextPed = activePedestrians[nextIdx];
    viewer?.camera?.cancelFlight?.();
    latchOntoPedestrian(nextPed);
    if (currentCameraMode !== 'free' && currentCameraMode !== 'city_map') {
      applyCameraFollow(nextPed, currentCameraMode);
    }
    governorRequestRender('pedestrian-cycle');
    return nextPed;
  }

  return {
    viewer,
    stepIntoCity,
    stepIntoLocale,
    stepIntoCurrentLocation,
    showCityMap,
    spawnPedestrians,
    clearPedestrians,
    latchOntoPedestrian,
    cyclePedestrian,
    getLatchedPedestrian: () => latchedPedestrian,
    getPedestrians: () => activePedestrians,
    getContextualSpool: () => contextualSpool,
    getAmbientSoundscape: () => ambientSoundscape,
    getActiveLocale: () => activeLocale,
    getActiveTypology: () => activeTypology,
    setTypologyOverride: (typology) => {
      activeTypology = typology;
      ambientSoundscape.startSoundscape(typology);
    },
    setCameraMode,
    setSpeedMultiplier,
    getSpeedMultiplier: () => speedMultiplier,
    setDensity,
    toggleRain,
    snapBack,
    getActiveTelemetry,
    getThoughtBubble: () => thoughtBubble,
    getUrbanEvents: () => urbanEvents,
    onCityDepth: (cb) => {
      onCityDepthCallback = cb;
    },
    onCityDepthExit: (cb) => {
      onCityDepthExitCallback = cb;
    },
    onPedestrianLatched: (cb) => {
      onPedestrianLatchedCallback = cb;
    },
    isSimActive: () => isSimActive,
    getActiveCity: () => activeCity,
    destroy: () => {
      isDestroyed = true;
      setPedestrianRenderHold(false);
      if (preRenderListener && viewer?.scene?.preRender) {
        preRenderListener();
        preRenderListener = null;
      }
      if (screenClickHandler) {
        try {
          screenClickHandler.destroy();
        } catch {
          /* ignore */
        }
        screenClickHandler = null;
      }
      if (depthGateCheckTimer) {
        clearInterval(depthGateCheckTimer);
        depthGateCheckTimer = null;
      }
      thoughtBubble.destroy();
      urbanEvents.destroy();
      contextualSpool.destroy();
      ambientSoundscape.destroy();
      clearPedestrians();
    },
  };
}
