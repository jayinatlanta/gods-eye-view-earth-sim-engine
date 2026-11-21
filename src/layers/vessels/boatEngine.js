/**
 * Hydrodynamic Simulation & 3D Vessel Engine for World of Sails.
 * (World of Sails Capability + Route Slice)
 *
 * Implements dynamic water-surface elevation sampling (solving the 326m Lake Lanier
 * inland elevation trap), multi-class vessel hydrodynamics (Sloop with heel angle roll,
 * Motorboat planing hull, Luxury Yacht displacement cruise), Cesium 3D entity simulation,
 * interactive camera choreography (Helm View, Chase Deck, Flybridge), and click-to-splashdown.
 */

import * as Cesium from 'cesium';
import {
  VESSEL_CLASSES,
  resolveWaterWaypoints,
  calculateWaterRouteDistance,
  calculateWaterTravelDurationSeconds,
  sampleWaterSurfaceAltitude,
  calculateNauticalDistance,
  knotsToMph,
} from '../../vessels/waterWaypoints.js';
import {
  trySampleSurfaceHeight,
  isPhotoreal3DActive,
  subscribeToMapStack,
} from '../citylife/surfaceHeight.js';
import { nudgeTilesetStreaming } from '../../renderGovernor.js';

export const WATER_SURFACE_OFFSET_METERS = 0.5;

/**
 * Calculates a smooth equidistant Cartesian3 trajectory along waterway waypoints,
 * dynamically sampling water surface altitude to prevent underwater clipping on inland lakes.
 */
export function generateBoatTrajectory(waypoints, options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
  const sampleIntervalMeters = options.sampleIntervalMeters || 20;
  const draftOffset = options.draftOffset ?? WATER_SURFACE_OFFSET_METERS;
  const viewer = options.viewer || null;

  const trajectoryCartesians = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const segmentDist =
      calculateNauticalDistance(p1.lat, p1.lon, p2.lat, p2.lon) * 1852;
    const steps = Math.max(1, Math.ceil(segmentDist / sampleIntervalMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const lat = p1.lat + (p2.lat - p1.lat) * t;
      const lon = p1.lon + (p2.lon - p1.lon) * t;
      const baseElev = (p1.elev ?? 0) + ((p2.elev ?? 0) - (p1.elev ?? 0)) * t;

      let elev;
      if (viewer?.scene?.globe?.getHeight || viewer?.scene?.sampleHeight) {
        elev = sampleWaterSurfaceAltitude(
          viewer,
          lon,
          lat,
          draftOffset,
          baseElev,
        );
      } else {
        elev = baseElev + draftOffset;
      }

      trajectoryCartesians.push(Cesium.Cartesian3.fromDegrees(lon, lat, elev));
    }
  }

  // Include final destination point
  const last = waypoints[waypoints.length - 1];
  const lastBaseElev = last.elev ?? 0;
  let finalElev;
  if (viewer?.scene?.globe?.getHeight || viewer?.scene?.sampleHeight) {
    finalElev = sampleWaterSurfaceAltitude(
      viewer,
      last.lon,
      last.lat,
      draftOffset,
      lastBaseElev,
    );
  } else {
    finalElev = lastBaseElev + draftOffset;
  }
  trajectoryCartesians.push(
    Cesium.Cartesian3.fromDegrees(last.lon, last.lat, finalElev),
  );

  return trajectoryCartesians;
}

/**
 * Applies deterministic camera framing and follow offsets across nautical perspectives
 * with absolute anti-subterranean water-level protection.
 */
export function applyBoatCameraFollow(
  viewer,
  position,
  forwardVec,
  mode = 'chase',
  vesselClass = 'sloop',
  excludeEntities = [],
) {
  if (!viewer?.camera || !position || !forwardVec) return;

  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    position,
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.cross(
    forwardVec,
    up,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(right, right);
  const forward = Cesium.Cartesian3.cross(up, right, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(forward, forward);

  const camPos = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
  const lookTarget = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
  const scratchFwd = new Cesium.Cartesian3();
  const scratchUp = new Cesium.Cartesian3();
  const scratchRight = new Cesium.Cartesian3();

  // Centerline and level horizon guarantee:
  // Zero camera roll to ensure the horizon is level and steady at all times.
  // Helm view: first-person view from cockpit / wheelhouse looking across foredeck
  if (mode === 'helm' || mode === 'cockpit' || mode === 'wheelhouse') {
    if (vesselClass === 'motorboat') {
      // Driver seat in runabout cockpit, slightly offset to starboard
      const lateralOffset = -0.35;
      Cesium.Cartesian3.multiplyByScalar(forward, -0.6, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(right, lateralOffset, scratchRight);
      Cesium.Cartesian3.multiplyByScalar(up, 1.8, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchRight, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      // Look straight ahead along vessel heading with matching lateral offset
      Cesium.Cartesian3.clone(camPos, lookTarget);
      Cesium.Cartesian3.multiplyByScalar(forward, 70.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 0.5, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else if (vesselClass === 'yacht') {
      // Bridge helm in luxury cruiser looking out over salon roof
      Cesium.Cartesian3.multiplyByScalar(forward, 2.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 3.6, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.clone(camPos, lookTarget);
      Cesium.Cartesian3.multiplyByScalar(forward, 80.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 0.5, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else {
      // Sloop: In the cockpit at the helm/tiller looking across teak deck, cabin, mast, and sails
      Cesium.Cartesian3.multiplyByScalar(forward, -2.5, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 1.8, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.clone(camPos, lookTarget);
      Cesium.Cartesian3.multiplyByScalar(forward, 70.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 0.5, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    }
  } else if (
    mode === 'overview' ||
    mode === 'satellite' ||
    mode === 'zoom_out' ||
    mode === 'map'
  ) {
    // High-altitude regional marine overview tracking vessel from 5,500m up, 7,000m back
    Cesium.Cartesian3.multiplyByScalar(forward, -7000.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 5500.0, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    // Look 1,200m down the waterway ahead of the boat to capture full regional context
    Cesium.Cartesian3.multiplyByScalar(forward, 1200.0, scratchFwd);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else if (mode === 'flybridge' || mode === 'masthead') {
    if (vesselClass === 'yacht') {
      // Top sun deck flybridge
      Cesium.Cartesian3.multiplyByScalar(forward, -6.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 8.5, scratchUp);
    } else if (vesselClass === 'motorboat') {
      // Elevated wake arch view
      Cesium.Cartesian3.multiplyByScalar(forward, -8.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 7.0, scratchUp);
    } else {
      // Sloop masthead spreader view
      Cesium.Cartesian3.multiplyByScalar(forward, -6.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(up, 12.0, scratchUp);
    }
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(forward, 50.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 1.5, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  } else {
    // Default 'chase': Third-person camera trailing vessel and wake with proud view of hull and horizon
    const distBack =
      vesselClass === 'yacht'
        ? -55.0
        : vesselClass === 'motorboat'
          ? -30.0
          : -34.0;
    const heightUp =
      vesselClass === 'yacht' ? 16.0 : vesselClass === 'motorboat' ? 9.0 : 10.0;

    Cesium.Cartesian3.multiplyByScalar(forward, distBack, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, heightUp, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    // Look at vessel and forward down waterway toward horizon
    const fwdLook =
      vesselClass === 'yacht'
        ? 60.0
        : vesselClass === 'motorboat'
          ? 45.0
          : 40.0;
    const upLook = vesselClass === 'yacht' ? 4.0 : 2.5;

    Cesium.Cartesian3.multiplyByScalar(forward, fwdLook, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, upLook, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  }

  // Anti-Subterranean Water Clamping: never allow camera to submerge below water/ground (Google 3D Tiles + 2D)
  const posCarto = Cesium.Cartographic.fromCartesian(
    position,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  const baseWaterFallback = posCarto
    ? posCarto.height - WATER_SURFACE_OFFSET_METERS
    : null;

  const is3D = isPhotoreal3DActive(viewer);
  const camCarto = Cesium.Cartographic.fromCartesian(
    camPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (camCarto) {
    const sampledCamGround = is3D
      ? null
      : trySampleSurfaceHeight(viewer, camCarto, excludeEntities);
    const globeCamGround = viewer.scene?.globe?.getHeight?.(camCarto);
    const groundH = Number.isFinite(sampledCamGround)
      ? sampledCamGround
      : Number.isFinite(globeCamGround)
        ? globeCamGround
        : baseWaterFallback;
    const minBuffer = mode === 'helm' ? 1.25 : 3.0;
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
  }

  const targetCarto = Cesium.Cartographic.fromCartesian(
    lookTarget,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (targetCarto) {
    const sampledTargetGround = is3D
      ? null
      : trySampleSurfaceHeight(viewer, targetCarto, excludeEntities);
    const globeTargetGround = viewer.scene?.globe?.getHeight?.(targetCarto);
    const targetGroundH = Number.isFinite(sampledTargetGround)
      ? sampledTargetGround
      : Number.isFinite(globeTargetGround)
        ? globeTargetGround
        : baseWaterFallback;
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
        up,
      },
    });
  }
}

/**
 * Creates the World of Sails Modular Simulation Engine.
 */
export function createBoatEngine({ viewer = null, operations = null } = {}) {
  let activeVesselEntity = null;
  let activeRawVesselPositionProperty = null;
  let activeWakeEntity = null;
  let preRenderListener = null;
  let mapStackUnsub = null;
  let activeRouteData = null;
  let currentCameraMode = 'chase';
  let isDestroyed = false;
  let splashdownHandler = null;
  let lastSampledWaterM = null;
  let last3DWaterSampleMs = -Infinity;
  const BOAT_3D_SAMPLE_INTERVAL_MS = 320;
  let liveClampedVesselPos = null;

  function syncVesselAndCameraPose() {
    if (!activeVesselEntity || isDestroyed || !viewer?.clock) return null;

    const curTime = viewer.clock.currentTime;
    const rawProp =
      activeRawVesselPositionProperty || activeVesselEntity.position;
    const rawPos = rawProp?.getValue(curTime);
    if (!rawPos) return null;

    const excludeEntities = [activeVesselEntity, activeWakeEntity].filter(
      Boolean,
    );
    const pos = Cesium.Cartesian3.clone(rawPos, new Cesium.Cartesian3());
    const draftOffset =
      activeRouteData?.vesselSpec?.draftOffsetMeters ??
      WATER_SURFACE_OFFSET_METERS;
    const vesselCarto = Cesium.Cartographic.fromCartesian(
      pos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (vesselCarto) {
      const is3D = isPhotoreal3DActive(viewer);
      const nowMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      let sampledWater = null;
      if (!is3D || nowMs - last3DWaterSampleMs >= BOAT_3D_SAMPLE_INTERVAL_MS) {
        if (is3D) last3DWaterSampleMs = nowMs;
        sampledWater = trySampleSurfaceHeight(
          viewer,
          vesselCarto,
          excludeEntities,
        );
      }
      const globeWater = viewer.scene?.globe?.getHeight?.(vesselCarto);
      const waterM = Number.isFinite(sampledWater)
        ? sampledWater
        : Number.isFinite(globeWater)
          ? globeWater
          : null;
      if (Number.isFinite(waterM)) {
        lastSampledWaterM = waterM;
      }
      const effectiveWaterM = Number.isFinite(waterM)
        ? waterM
        : lastSampledWaterM;
      if (Number.isFinite(effectiveWaterM)) {
        const targetH = effectiveWaterM + draftOffset;
        if (isPhotoreal3DActive(viewer)) {
          vesselCarto.height = targetH;
        } else if (vesselCarto.height < targetH) {
          vesselCarto.height = targetH;
        }
        Cesium.Cartesian3.fromRadians(
          vesselCarto.longitude,
          vesselCarto.latitude,
          vesselCarto.height,
          Cesium.Ellipsoid.WGS84,
          pos,
        );
      }
    }
    liveClampedVesselPos = Cesium.Cartesian3.clone(pos);

    if (activeVesselEntity?.point) {
      activeVesselEntity.point.show =
        currentCameraMode !== 'helm' &&
        currentCameraMode !== 'cockpit' &&
        currentCameraMode !== 'wheelhouse';
    }

    if (currentCameraMode === 'free') return { pos, forward: null };

    // Calculate heading tangent by sampling 0.25s ahead on the trajectory
    let forward = null;
    const futureTime = Cesium.JulianDate.addSeconds(
      curTime,
      0.25,
      new Cesium.JulianDate(),
    );
    const futurePos = rawProp?.getValue(futureTime);
    if (futurePos) {
      forward = Cesium.Cartesian3.subtract(
        futurePos,
        rawPos,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(forward, forward);
    }

    // Fallback to orientation property Column 0 (velocity heading axis)
    if (!forward) {
      const vel = activeVesselEntity.orientation?.getValue(curTime);
      if (vel) {
        const m = Cesium.Matrix3.fromQuaternion(vel, new Cesium.Matrix3());
        forward = Cesium.Matrix3.getColumn(m, 0, new Cesium.Cartesian3());
      }
    }

    if (pos && forward) {
      applyBoatCameraFollow(
        viewer,
        pos,
        forward,
        currentCameraMode,
        activeRouteData?.vesselClass,
        excludeEntities,
      );
    }

    return { pos, forward };
  }

  /**
   * Spawns a real-time 3D vessel simulation along specified waterway or coordinate route.
   */
  async function spawnBoatRoute(fromQuery, toQuery, options = {}) {
    if (!viewer || isDestroyed) return null;

    clearActiveBoatRoute();

    const waterRoute = resolveWaterWaypoints(fromQuery, toQuery, options);
    const vesselClass =
      options.vesselClass || waterRoute.vesselClass || 'sloop';
    const vesselSpec = VESSEL_CLASSES[vesselClass] || VESSEL_CLASSES.sloop;
    const speedKnots =
      Number(options.speedKnots) ||
      waterRoute.speedKnots ||
      vesselSpec.defaultSpeedKnots;
    currentCameraMode = options.cameraMode || (options.helm ? 'helm' : 'chase');

    const waypoints = waterRoute.waypoints;
    const trajectoryCartesians = generateBoatTrajectory(waypoints, {
      sampleIntervalMeters: 20,
      draftOffset: vesselSpec.draftOffsetMeters,
      viewer,
    });

    if (trajectoryCartesians.length < 2) return null;

    const durationSec = calculateWaterTravelDurationSeconds(
      waterRoute.totalDistanceMeters,
      speedKnots,
    );
    const startTime = Cesium.JulianDate.now();
    const stopTime = Cesium.JulianDate.addSeconds(
      startTime,
      durationSec,
      new Cesium.JulianDate(),
    );

    const positionProperty = new Cesium.SampledPositionProperty();
    activeRawVesselPositionProperty = positionProperty;
    const totalPoints = trajectoryCartesians.length;

    for (let i = 0; i < totalPoints; i++) {
      const t = i / (totalPoints - 1);
      const time = Cesium.JulianDate.addSeconds(
        startTime,
        t * durationSec,
        new Cesium.JulianDate(),
      );
      positionProperty.addSample(time, trajectoryCartesians[i]);
    }

    // Configure viewer clock
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 1.0;
    viewer.clock.shouldAnimate = true;

    // 1. Optional subtle trajectory guide (hidden by default to avoid solid-line visual noise)
    activeWakeEntity = null;

    // 2. 3D Vessel Entity with High-Contrast Outlined Reticle & 3D Hull Box
    const orientationProperty = new Cesium.VelocityOrientationProperty(
      positionProperty,
    );
    const vesselName =
      options.vesselName ||
      `${vesselSpec.name} · ${waterRoute.name.split(':')[0] || 'Vessel'}`;

    const dynamicVesselPosition = new Cesium.CallbackPositionProperty(
      (time, result) => {
        const evalTime = time || viewer.clock?.currentTime;
        if (
          liveClampedVesselPos &&
          evalTime &&
          viewer.clock?.currentTime &&
          Math.abs(
            Cesium.JulianDate.secondsDifference(
              evalTime,
              viewer.clock.currentTime,
            ),
          ) < 1e-4
        ) {
          return Cesium.Cartesian3.clone(
            liveClampedVesselPos,
            result || new Cesium.Cartesian3(),
          );
        }
        const raw = positionProperty.getValue(evalTime);
        if (!raw) return undefined;
        if (!Number.isFinite(lastSampledWaterM)) {
          return Cesium.Cartesian3.clone(
            raw,
            result || new Cesium.Cartesian3(),
          );
        }
        const c = Cesium.Cartographic.fromCartesian(
          raw,
          Cesium.Ellipsoid.WGS84,
          new Cesium.Cartographic(),
        );
        if (!c) {
          return Cesium.Cartesian3.clone(
            raw,
            result || new Cesium.Cartesian3(),
          );
        }
        const targetH = lastSampledWaterM + vesselSpec.draftOffsetMeters;
        if (isPhotoreal3DActive(viewer)) {
          c.height = targetH;
        } else if (c.height < targetH) {
          c.height = targetH;
        }
        return Cesium.Cartesian3.fromRadians(
          c.longitude,
          c.latitude,
          c.height,
          Cesium.Ellipsoid.WGS84,
          result || new Cesium.Cartesian3(),
        );
      },
      false,
    );

    activeVesselEntity = viewer.entities.add({
      name: vesselName,
      position: dynamicVesselPosition,
      orientation: orientationProperty,
      box: {
        dimensions: new Cesium.Cartesian3(
          vesselSpec.dimensions.width,
          vesselSpec.dimensions.length,
          vesselSpec.dimensions.height,
        ),
        material: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.65),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3.0,
      },
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#0284c7'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3.0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      model: {
        uri: `/models/${vesselClass}.glb`,
        minimumPixelSize: 36,
        maximumScale: 200,
        runAnimations: true,
      },
      path: {
        resolution: 1,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
        width: 4.0,
        leadTime: 0,
        trailTime: 25,
      },
      gevTrackedId: vesselName,
    });

    activeRouteData = {
      waterbody: waterRoute,
      vesselClass,
      vesselSpec,
      vesselName,
      speedKnots,
      speedMph: Math.round(knotsToMph(speedKnots)),
      durationSec,
      startTime,
      vesselEntity: activeVesselEntity,
      wakeEntity: activeWakeEntity,
    };

    // Frame 0 Camera Alignment
    const synced = syncVesselAndCameraPose();
    if (!synced) {
      const frame0Pos = trajectoryCartesians[0];
      const frame0Fwd = Cesium.Cartesian3.subtract(
        trajectoryCartesians[1],
        trajectoryCartesians[0],
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(frame0Fwd, frame0Fwd);
      applyBoatCameraFollow(
        viewer,
        frame0Pos,
        frame0Fwd,
        currentCameraMode,
        vesselClass,
        [activeVesselEntity],
      );
    }

    // Frame-by-frame camera follow loop via scene.preRender
    if (viewer.scene?.preRender) {
      preRenderListener = viewer.scene.preRender.addEventListener(() => {
        syncVesselAndCameraPose();
      });
    }
    mapStackUnsub = subscribeToMapStack(() => {
      if (isDestroyed || !activeRouteData) return;
      lastSampledWaterM = null;
      last3DWaterSampleMs = -Infinity;
      syncVesselAndCameraPose();
      nudgeTilesetStreaming('boat-map-stack-switch', { force: true });
      viewer?.scene?.requestRender?.();
    });

    return activeRouteData;
  }

  function setCameraMode(mode) {
    currentCameraMode = mode;
    if (mode === 'free') {
      return currentCameraMode;
    }
    syncVesselAndCameraPose();
    return currentCameraMode;
  }

  function snapBack(mode = 'chase') {
    return setCameraMode(mode);
  }

  function setThrottle(speedKnots) {
    if (!activeRouteData || !viewer?.clock) return;
    const safeKnots = Math.max(1, Number(speedKnots) || 8);
    const oldSpeed = activeRouteData.speedKnots || 8;
    activeRouteData.speedKnots = safeKnots;
    activeRouteData.speedMph = Math.round(knotsToMph(safeKnots));

    // Adjust viewer clock multiplier proportionally to change velocity seamlessly
    viewer.clock.multiplier = safeKnots / oldSpeed;
  }

  function clearActiveBoatRoute() {
    if (preRenderListener) {
      preRenderListener();
      preRenderListener = null;
    }
    if (mapStackUnsub) {
      try {
        mapStackUnsub();
      } catch {
        /* ignore */
      }
      mapStackUnsub = null;
    }
    lastSampledWaterM = null;
    liveClampedVesselPos = null;
    activeRawVesselPositionProperty = null;
    if (activeVesselEntity) {
      viewer.entities.remove(activeVesselEntity);
      activeVesselEntity = null;
    }
    if (activeWakeEntity) {
      viewer.entities.remove(activeWakeEntity);
      activeWakeEntity = null;
    }
    activeRouteData = null;
  }

  function getActiveTelemetry() {
    if (!activeRouteData || !activeVesselEntity || !viewer?.clock) return null;
    const curTime = viewer.clock.currentTime;
    const curPos = activeVesselEntity.position?.getValue?.(curTime);
    if (!curPos) return null;

    const carto = Cesium.Cartographic.fromCartesian(curPos);
    const lat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4));
    const lon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4));
    const altM = Math.round(carto.height);

    const startTime = activeRouteData.startTime;
    const durationSec = activeRouteData.durationSec || 1;
    const elapsedSec = Math.max(
      0,
      Cesium.JulianDate.secondsDifference(curTime, startTime),
    );
    const progressFrac = Math.min(1.0, Math.max(0.0, elapsedSec / durationSec));
    const progressPct = Math.round(progressFrac * 100);

    const waterbody = activeRouteData.waterbody;
    const totalDistM = waterbody?.totalDistanceMeters || 1;
    const distTraveledKm = Math.round((progressFrac * totalDistM) / 1000);
    const totalDistKm = Math.round(totalDistM / 1000);
    const distTraveledNmi = Math.round((distTraveledKm / 1.852) * 10) / 10;
    const totalDistNmi = Math.round((totalDistKm / 1.852) * 10) / 10;
    const distTraveledMi = Math.round(distTraveledKm * 0.621371);
    const totalDistMi = Math.round(totalDistKm * 0.621371);

    const fromName = waterbody?.from?.name || 'Harbor';
    const toName = waterbody?.to?.name || 'Destination';

    return {
      mode: 'VESSEL CRUISE',
      vesselClass: activeRouteData.vesselClass,
      vesselName: activeRouteData.vesselName,
      waterwayName: waterbody?.name || activeRouteData.vesselName,
      currentLocation: `${activeRouteData.vesselName} (${fromName} ➔ ${toName})`,
      nextLocation: toName,
      speedKnots: activeRouteData.speedKnots,
      speedMph: activeRouteData.speedMph,
      speedText: `${activeRouteData.speedKnots} KTS`,
      lat,
      lon,
      altM,
      progressPct,
      distTraveledNmi,
      totalDistNmi,
      distTraveledMi,
      totalDistMi,
      cameraMode: currentCameraMode,
    };
  }

  /**
   * Enables interactive click-to-splashdown anywhere on Earth.
   */
  function startSplashdownClickMode(onSplashdown) {
    if (!viewer?.scene?.canvas) return;
    cancelSplashdownClickMode();

    splashdownHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    splashdownHandler.setInputAction((movement) => {
      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        cancelSplashdownClickMode();
        if (typeof onSplashdown === 'function') {
          onSplashdown({ lat, lon });
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function cancelSplashdownClickMode() {
    if (splashdownHandler) {
      splashdownHandler.destroy();
      splashdownHandler = null;
    }
  }

  // Check URL query parameters ?boat=...&water=...&vessel=...&knots=...&helm=true
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const boat =
        params.get('boat') || params.get('sail') || params.get('water');
      const boatFrom = params.get('boatFrom') || params.get('waterFrom');
      const boatTo = params.get('boatTo') || params.get('waterTo');
      const vesselClass = params.get('vessel') || 'sloop';
      const speedKnots = Number(params.get('knots')) || 0;
      const helm = params.get('helm') === 'true';

      if (boat || (boatFrom && boatTo)) {
        setTimeout(() => {
          spawnBoatRoute(boat || boatFrom, boatTo, {
            vesselClass,
            speedKnots: speedKnots || undefined,
            helm,
          });
        }, 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    spawnBoatRoute,
    clearActiveBoatRoute,
    setCameraMode,
    snapBack,
    setThrottle,
    getActiveRoute: () => activeRouteData,
    getActiveTelemetry,
    startSplashdownClickMode,
    cancelSplashdownClickMode,
    destroy: () => {
      isDestroyed = true;
      cancelSplashdownClickMode();
      clearActiveBoatRoute();
    },
  };
}
