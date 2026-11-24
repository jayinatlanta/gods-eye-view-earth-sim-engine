/**
 * Vector Drive & 3D Autonomous Highway Cruiser Engine for Infinite Drive.
 * (Infinite Drive Autonomous Highway Cruiser & Traffic Follower)
 *
 * Implements road-following spline sampling with terrain elevation clamping, Cesium 3D
 * vehicle simulation with VelocityOrientationProperty and dynamic preRender camera follow,
 * dynamic curvature braking, toggleable traffic hesitation, synthetic traffic follower
 * latching with screen-space click-to-follow, and First-Person Driver's Seat / Cockpit,
 * Chase, and News Copter camera tracking.
 */

import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
  nudgeTilesetStreaming,
} from '../../renderGovernor.js';
import { createCameraAuthority } from '../../ui/sovereign/cameraControlBridge.js';
import { butterGoogle3DTiles } from '../../ui/sovereign/tilesetButter.js';
import {
  MAX_OSRM_TOTAL_KM,
  resolveDriveWaypoints,
  resolveDriveWaypointsAsync,
  calculateHaversineDistance,
  calculateTravelDurationSeconds,
  calculateCurvatureSpeedLimits,
  fetchDriveRouteGeometry,
  fetchMultiLegDriveRouteGeometry,
} from '../../drive/driveWaypoints.js';
import {
  trySampleSurfaceHeight,
  isPhotoreal3DActive,
  subscribeToMapStack,
} from '../citylife/surfaceHeight.js';

export const ROAD_SURFACE_OFFSET_METERS = 0.8; // Elevation offset above ground/asphalt tiles
export const MAX_3D_SPIKE_ABOVE_BASELINE_M = 6.0; // Reject Google 3D Tiles building/tree rooftop spikes
export const MAX_3D_DROP_BELOW_BASELINE_M = 35.0; // Reject subterranean void/artifact samples
export const SEAT_VIEW_OFFSET = new Cesium.Cartesian3(-0.4, 0.6, 1.25); // Left driver seat forward
export const CHASE_VIEW_OFFSET = new Cesium.Cartesian3(0.0, -32.0, 12.0); // Comfortable third-person chase
export const COPTER_VIEW_OFFSET = new Cesium.Cartesian3(0.0, -65.0, 45.0); // Overhead news copter / drone
export const OVERVIEW_VIEW_OFFSET = new Cesium.Cartesian3(
  0.0,
  -12000.0,
  9500.0,
); // High-altitude tactical overview

/**
 * Validates whether a Google 3D Tiles `sampleHeight` reading represents plausible road surface
 * rather than a building rooftop, bridge parapet, or tree-canopy spike.
 */
export function isPlausible3DGroundSample(
  sampledH,
  baselineRoadH,
  prevGroundM = null,
) {
  if (!Number.isFinite(sampledH)) return false;
  if (Number.isFinite(baselineRoadH)) {
    if (sampledH > baselineRoadH + MAX_3D_SPIKE_ABOVE_BASELINE_M) return false;
    if (sampledH < baselineRoadH - MAX_3D_DROP_BELOW_BASELINE_M) return false;
  }
  if (
    Number.isFinite(prevGroundM) &&
    Math.abs(sampledH - prevGroundM) > MAX_3D_SPIKE_ABOVE_BASELINE_M
  ) {
    return false;
  }
  return true;
}

/**
 * Samples the rendered surface height (Google 3D Tiles or 2D globe terrain) at a Cartographic point,
 * excluding any vehicle/route entities so the ray never hits the car's own 3D box.
 */
export function sampleDriveSurfaceHeight(viewer, carto, excludeEntities = []) {
  if (!viewer || !carto) return null;
  const sampled = trySampleSurfaceHeight(viewer, carto, excludeEntities);
  if (Number.isFinite(sampled)) return sampled;
  if (viewer.scene?.globe?.getHeight) {
    try {
      const gh = viewer.scene.globe.getHeight(carto);
      if (Number.isFinite(gh)) return gh;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Computes forward heading vector along the road for a synthetic traffic dot.
 */
export function calculateDotHeadingVector(dot) {
  if (!dot || !dot.waypoints || dot.waypoints.length < 2) return null;
  const waypoints = dot.waypoints;
  let idx = Number.isInteger(dot.segIdx) ? dot.segIdx : 0;
  if (idx < 0) idx = 0;
  let nextIdx = idx + 1;
  if (nextIdx >= waypoints.length) {
    nextIdx = waypoints.length - 1;
    idx = Math.max(0, nextIdx - 1);
  }
  const p1 = waypoints[idx];
  const p2 = waypoints[nextIdx];
  if (!p1 || !p2) return null;

  const forward = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
  if ((dot.direction ?? 1) < 0) {
    Cesium.Cartesian3.negate(forward, forward);
  }
  Cesium.Cartesian3.normalize(forward, forward);
  return forward;
}

/**
 * Computes Cesium Quaternion orientation for a synthetic traffic dot.
 */
export function calculateDotOrientation(dot) {
  const pos = dot?.point?.position;
  const forward = calculateDotHeadingVector(dot);
  if (!pos || !forward) return Cesium.Quaternion.IDENTITY;

  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    pos,
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.cross(forward, up, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(right, right);
  Cesium.Cartesian3.cross(up, right, forward);
  Cesium.Cartesian3.normalize(forward, forward);

  const rot = new Cesium.Matrix3();
  Cesium.Matrix3.setColumn(rot, 0, forward, rot);
  Cesium.Matrix3.setColumn(rot, 1, right, rot);
  Cesium.Matrix3.setColumn(rot, 2, up, rot);
  return Cesium.Quaternion.fromRotationMatrix(rot);
}

/**
 * Applies deterministic, rock-solid camera framing and follow offsets without
 * relying on buggy EntityView ground collisions.
 */
export function applyCameraFollow(
  viewer,
  position,
  forwardVec,
  mode = 'chase',
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

  if (mode === 'seat' || mode === 'cockpit' || mode === 'dashcam') {
    // Inside driver's seat looking forward through windshield
    Cesium.Cartesian3.multiplyByScalar(forward, 0.6, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(right, -0.4, scratchRight);
    Cesium.Cartesian3.multiplyByScalar(up, 1.25, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchRight, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    // Look 60 meters down the highway with slight downward tilt
    Cesium.Cartesian3.clone(camPos, lookTarget);
    Cesium.Cartesian3.multiplyByScalar(forward, 60.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, -1.8, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  } else if (mode === 'copter' || mode === 'drone') {
    // News helicopter / drone overhead trailing
    Cesium.Cartesian3.multiplyByScalar(forward, -65.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 45.0, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(forward, 5.0, scratchFwd);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else if (
    mode === 'overview' ||
    mode === 'satellite' ||
    mode === 'map' ||
    mode === 'zoom_out'
  ) {
    // High-altitude regional highway overview tracking vehicle from 9,500m up, 12,000m back
    Cesium.Cartesian3.multiplyByScalar(forward, -12000.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 9500.0, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(forward, 1500.0, scratchFwd);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else {
    // Default 'chase': comfortable third-person follow cam
    Cesium.Cartesian3.multiplyByScalar(forward, -32.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 12.0, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    // Look ahead at the car and the highway in front of it
    Cesium.Cartesian3.multiplyByScalar(forward, 15.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 2.0, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  }

  // ABSOLUTE ANTI-SUBTERRANEAN CAMERA GUARANTEE:
  // Never allow camPos or lookTarget to sink into or below Google 3D Tiles or terrain mesh!
  // In Google 3D Tiles mode (globe.show === false), anchor clearance to the smooth vehicle
  // road floor instead of raw scene.sampleHeight at camPos/lookTarget (which hit roadside rooftops).
  const is3D = isPhotoreal3DActive(viewer);
  const posCarto = Cesium.Cartographic.fromCartesian(
    position,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  const baseGroundFallback = posCarto
    ? posCarto.height - ROAD_SURFACE_OFFSET_METERS
    : null;

  const camCarto = Cesium.Cartographic.fromCartesian(
    camPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (camCarto) {
    const sampledCamGround = is3D
      ? null
      : sampleDriveSurfaceHeight(viewer, camCarto, excludeEntities);
    const camGroundH = Number.isFinite(sampledCamGround)
      ? sampledCamGround
      : baseGroundFallback;
    const minBuffer =
      mode === 'seat' || mode === 'cockpit' || mode === 'dashcam' ? 1.25 : 3.5;
    if (
      Number.isFinite(camGroundH) &&
      camCarto.height < camGroundH + minBuffer
    ) {
      camCarto.height = camGroundH + minBuffer;
      Cesium.Cartesian3.fromRadians(
        camCarto.longitude,
        camCarto.latitude,
        camCarto.height,
        Cesium.Ellipsoid.WGS84,
        camPos,
      );
    }
  }

  // Also clamp lookTarget above ground so the camera does not look downward into subterranean rock
  const targetCarto = Cesium.Cartographic.fromCartesian(
    lookTarget,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (targetCarto) {
    const sampledTargetGround = is3D
      ? null
      : sampleDriveSurfaceHeight(viewer, targetCarto, excludeEntities);
    const targetGroundH = Number.isFinite(sampledTargetGround)
      ? sampledTargetGround
      : baseGroundFallback;
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

  // Ensure Cesium camera collision detection is active to prevent subterranean clipping
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
 * Chains waypoints into an equidistant Cartesian trajectory clamped to road elevation.
 */
export function generateDriveTrajectory(waypoints, options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
  const roadOffset = options.roadOffsetMeters ?? ROAD_SURFACE_OFFSET_METERS;
  const viewer = options.viewer || null;
  const maxPoints = options.maxPoints || 1500;

  // If input waypoints is already extremely dense (e.g. from raw OSRM street paths),
  // decimate with uniform stride to prevent WebGL GPU stalls and memory thrashing.
  let inputWaypoints = waypoints;
  if (waypoints.length > maxPoints) {
    const stride = Math.ceil(waypoints.length / 1000);
    inputWaypoints = waypoints.filter(
      (wp, idx) =>
        idx === 0 || idx === waypoints.length - 1 || idx % stride === 0,
    );
  }

  // Adaptive sampling: guarantee ~800 to 1,200 points total, regardless of whether
  // the route is a 5-mile city trip or a 3,000-mile cross-country marathon.
  let sampleIntervalMeters = options.sampleIntervalMeters;
  if (!sampleIntervalMeters) {
    let totalDist = 0;
    for (let i = 0; i < inputWaypoints.length - 1; i++) {
      totalDist += calculateHaversineDistance(
        inputWaypoints[i].lat,
        inputWaypoints[i].lon,
        inputWaypoints[i + 1].lat,
        inputWaypoints[i + 1].lon,
      );
    }
    sampleIntervalMeters = Math.max(25, Math.ceil(totalDist / 1200));
  }

  const trajectoryCartesians = [];
  const is3D = viewer ? isPhotoreal3DActive(viewer) : false;
  let prev3DGround = null;

  for (let i = 0; i < inputWaypoints.length - 1; i++) {
    const p1 = inputWaypoints[i];
    const p2 = inputWaypoints[i + 1];
    const segmentDist = calculateHaversineDistance(
      p1.lat,
      p1.lon,
      p2.lat,
      p2.lon,
    );
    const steps = Math.max(1, Math.round(segmentDist / sampleIntervalMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const lat = p1.lat + (p2.lat - p1.lat) * t;
      const lon = p1.lon + (p2.lon - p1.lon) * t;
      let elev = (p1.elev ?? 20) + ((p2.elev ?? 20) - (p1.elev ?? 20)) * t;

      if (viewer) {
        const carto = Cesium.Cartographic.fromDegrees(lon, lat);
        const groundHeight = sampleDriveSurfaceHeight(viewer, carto);
        if (Number.isFinite(groundHeight)) {
          if (is3D) {
            if (isPlausible3DGroundSample(groundHeight, elev, prev3DGround)) {
              elev = groundHeight;
              prev3DGround = groundHeight;
            }
          } else {
            elev = Math.max(elev, groundHeight);
          }
        }
      }

      trajectoryCartesians.push(
        Cesium.Cartesian3.fromDegrees(lon, lat, elev + roadOffset),
      );
    }
  }

  // Include final destination point
  const last = inputWaypoints[inputWaypoints.length - 1];
  let lastElev = last.elev ?? 20;
  if (viewer) {
    const carto = Cesium.Cartographic.fromDegrees(last.lon, last.lat);
    const groundHeight = sampleDriveSurfaceHeight(viewer, carto);
    if (Number.isFinite(groundHeight)) {
      if (is3D) {
        if (isPlausible3DGroundSample(groundHeight, lastElev, prev3DGround)) {
          lastElev = groundHeight;
        }
      } else {
        lastElev = Math.max(lastElev, groundHeight);
      }
    }
  }
  trajectoryCartesians.push(
    Cesium.Cartesian3.fromDegrees(last.lon, last.lat, lastElev + roadOffset),
  );

  return trajectoryCartesians;
}

/**
 * Creates the Infinite Drive Autonomous Highway Cruiser & Traffic Follower Engine.
 */
export function createDriveEngine({
  viewer = null,
  operations = null,
  fetchImpl = globalThis.fetch,
  trafficLayer = null,
} = {}) {
  let activeVehicleEntity = null;
  let activeRawPositionProperty = null;
  let activeRoadPathEntity = null;
  let stalkerEntity = null;
  let tickListener = null;
  let preRenderRemover = null;
  let mapStackUnsub = null;
  let screenClickHandler = null;
  let onTrafficLatchedCallback = null;
  let activeDriveData = null;
  let isDestroyed = false;
  let isParked = false;
  let currentCameraMode = 'chase'; // Default to comfortable Chase follow cam
  let lastSampledGroundM = null;
  let liveClampedVehiclePos = null;
  let liveClampedStalkerPos = null;
  const cameraModeListeners = new Set();

  function notifyCameraModeListeners(mode) {
    for (const cb of cameraModeListeners) {
      try {
        cb(mode);
      } catch {
        /* ignore */
      }
    }
  }

  const cameraAuthority = createCameraAuthority({
    engineId: 'drive',
    cancelCameraFlight: () => viewer?.camera?.cancelFlight?.(),
    resetCameraLookAt: () =>
      viewer?.camera?.lookAtTransform?.(Cesium.Matrix4.IDENTITY),
    clearTrackedEntity: () => {
      if (viewer && viewer.trackedEntity !== undefined) {
        viewer.trackedEntity = undefined;
      }
    },
    getTilesetPrimitives: () => viewer?.scene?.primitives || null,
    isRendererDestroyed: () => Boolean(isDestroyed || viewer?.isDestroyed?.()),
    onCameraModeApplied: notifyCameraModeListeners,
  });

  function getCameraOffset(mode) {
    if (mode === 'seat' || mode === 'dashcam' || mode === 'cockpit') {
      return SEAT_VIEW_OFFSET;
    }
    if (mode === 'copter' || mode === 'drone') {
      return COPTER_VIEW_OFFSET;
    }
    if (
      mode === 'overview' ||
      mode === 'satellite' ||
      mode === 'map' ||
      mode === 'zoom_out'
    ) {
      return OVERVIEW_VIEW_OFFSET;
    }
    return CHASE_VIEW_OFFSET;
  }

  let last3DSurfaceSampleMs = -Infinity;
  const SURFACE_SAMPLE_INTERVAL_3D_MS = 320;

  function sampleThrottledDriveGroundM(carto, excludeEntities, is3D) {
    if (!is3D) {
      return sampleDriveSurfaceHeight(viewer, carto, excludeEntities);
    }
    // Cesium `scene.sampleHeight()` invokes `scene.jobScheduler.disableThisFrame()`
    // during `preRender`, starving Google 3D Tiles refinement workers if called
    // every frame. Throttle 3D Tiles ground sampling to >=320ms so ~19 of every 20
    // frames refine photorealistic tiles at full speed.
    const nowMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - last3DSurfaceSampleMs < SURFACE_SAMPLE_INTERVAL_3D_MS) {
      return null;
    }
    last3DSurfaceSampleMs = nowMs;
    return sampleDriveSurfaceHeight(viewer, carto, excludeEntities);
  }

  function getExcludeEntities() {
    return [activeVehicleEntity, activeRoadPathEntity, stalkerEntity].filter(
      Boolean,
    );
  }

  /**
   * Samples the current surface height under the vehicle or stalker dot, updates the
   * live clamped entity position so the outlined 3D box and point reticle stay strictly
   * synchronized with the camera across Google 3D Tiles and 2D preset switches, and
   * returns `{ pos, forward }` for camera framing.
   */
  function syncVehicleAndCameraPose() {
    if (isDestroyed || !activeDriveData || !viewer) return null;

    const excludeEntities = getExcludeEntities();
    let pos = null;
    let forward = null;

    if (activeDriveData.isTrafficStalker) {
      const dot = activeDriveData.targetDot;
      if (!dot || !dot.point?.position) return null;
      pos = Cesium.Cartesian3.clone(
        dot.point.position,
        new Cesium.Cartesian3(),
      );
      const dotCarto = Cesium.Cartographic.fromCartesian(
        pos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      if (dotCarto) {
        const is3D = isPhotoreal3DActive(viewer);
        const baselineRoadH = dotCarto.height - ROAD_SURFACE_OFFSET_METERS;
        const rawGroundM = sampleThrottledDriveGroundM(
          dotCarto,
          excludeEntities,
          is3D,
        );
        const groundM =
          is3D &&
          !isPlausible3DGroundSample(
            rawGroundM,
            baselineRoadH,
            lastSampledGroundM,
          )
            ? null
            : rawGroundM;
        if (Number.isFinite(groundM)) {
          lastSampledGroundM = groundM;
          const targetH = is3D
            ? groundM + ROAD_SURFACE_OFFSET_METERS
            : Math.max(dotCarto.height, groundM + ROAD_SURFACE_OFFSET_METERS);
          dotCarto.height = targetH;
          Cesium.Cartesian3.fromRadians(
            dotCarto.longitude,
            dotCarto.latitude,
            dotCarto.height,
            Cesium.Ellipsoid.WGS84,
            pos,
          );
          dot.point.position = Cesium.Cartesian3.clone(pos);
        }
      }
      liveClampedStalkerPos = Cesium.Cartesian3.clone(pos);
      forward = calculateDotHeadingVector(dot);
    } else if (activeVehicleEntity && viewer.clock) {
      const rawProp = activeRawPositionProperty || activeVehicleEntity.position;
      const rawPos = rawProp?.getValue(viewer.clock.currentTime);
      if (!rawPos) return null;
      pos = Cesium.Cartesian3.clone(rawPos, new Cesium.Cartesian3());

      // Dynamic Real-Time Altitude Clamping of the Car (Google 3D Tiles + 2D Terrain):
      // Query the live rendered surface height under the car (excluding the car & polyline entities).
      // Reject Google 3D Tiles building/canopy rooftop spikes (>+6m over smooth road grade) so the
      // car and camera never snap onto rooftops across presets.
      const carCarto = Cesium.Cartographic.fromCartesian(
        pos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      if (carCarto) {
        const is3D = isPhotoreal3DActive(viewer);
        const baselineRoadH = carCarto.height - ROAD_SURFACE_OFFSET_METERS;
        const rawGroundM = sampleThrottledDriveGroundM(
          carCarto,
          excludeEntities,
          is3D,
        );
        const groundM =
          is3D &&
          !isPlausible3DGroundSample(
            rawGroundM,
            baselineRoadH,
            lastSampledGroundM,
          )
            ? null
            : rawGroundM;
        if (Number.isFinite(groundM)) {
          lastSampledGroundM = groundM;
        }
        const effectiveGroundM = Number.isFinite(groundM)
          ? groundM
          : is3D
            ? (lastSampledGroundM ?? baselineRoadH)
            : lastSampledGroundM;
        if (Number.isFinite(effectiveGroundM)) {
          const minCarH = effectiveGroundM + ROAD_SURFACE_OFFSET_METERS;
          if (is3D) {
            carCarto.height = minCarH;
          } else if (carCarto.height < minCarH) {
            carCarto.height = minCarH;
          }
          Cesium.Cartesian3.fromRadians(
            carCarto.longitude,
            carCarto.latitude,
            carCarto.height,
            Cesium.Ellipsoid.WGS84,
            pos,
          );
        }
      }
      liveClampedVehiclePos = Cesium.Cartesian3.clone(pos);

      // Calculate heading tangent by sampling 0.25s ahead on the raw trajectory
      const futureTime = Cesium.JulianDate.addSeconds(
        viewer.clock.currentTime,
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
    }

    if (currentCameraMode !== 'free' && pos && forward) {
      applyCameraFollow(
        viewer,
        pos,
        forward,
        currentCameraMode,
        excludeEntities,
      );
    }

    return { pos, forward };
  }

  function unbindPreRenderCameraFollow() {
    if (preRenderRemover) {
      if (typeof preRenderRemover === 'function') {
        preRenderRemover();
      } else if (typeof preRenderRemover.remove === 'function') {
        preRenderRemover.remove();
      }
      preRenderRemover = null;
    }
    if (mapStackUnsub) {
      try {
        mapStackUnsub();
      } catch {
        /* ignore */
      }
      mapStackUnsub = null;
    }
  }

  function bindPreRenderCameraFollow() {
    unbindPreRenderCameraFollow();
    if (viewer?.scene?.preRender?.addEventListener) {
      preRenderRemover = viewer.scene.preRender.addEventListener(() => {
        if (isDestroyed || isParked || !activeDriveData) return;
        syncVehicleAndCameraPose();
      });
    }
    mapStackUnsub = subscribeToMapStack(() => {
      if (isDestroyed || !activeDriveData) return;
      // Reset cached ground height on map stack switch so the new surface (2D globe vs 3D tiles)
      // immediately re-clamps both the vehicle entity and camera follow position.
      lastSampledGroundM = null;
      last3DSurfaceSampleMs = -Infinity;
      syncVehicleAndCameraPose();
      nudgeTilesetStreaming('drive-map-stack-switch', { force: true });
      butterGoogle3DTiles(viewer?.scene?.primitives, 'drive-map-stack-switch', {
        maxMs: 2400,
      });
      viewer?.scene?.requestRender?.();
    });
  }

  function clearActiveDrive() {
    if (!viewer) return;

    unbindPreRenderCameraFollow();
    releaseContinuousRender('drive-sim');
    governorRequestRender('drive-sim-end');
    isParked = false;
    lastSampledGroundM = null;
    last3DSurfaceSampleMs = -Infinity;
    liveClampedVehiclePos = null;
    liveClampedStalkerPos = null;
    activeRawPositionProperty = null;

    if (tickListener) {
      if (typeof tickListener === 'function') {
        tickListener();
      } else if (
        viewer.clock?.onTick &&
        typeof tickListener.remove === 'function'
      ) {
        tickListener.remove();
      }
      tickListener = null;
    }

    if (activeVehicleEntity) {
      viewer.entities.remove(activeVehicleEntity);
      activeVehicleEntity = null;
    }
    if (activeRoadPathEntity) {
      viewer.entities.remove(activeRoadPathEntity);
      activeRoadPathEntity = null;
    }
    if (stalkerEntity) {
      viewer.entities.remove(stalkerEntity);
      stalkerEntity = null;
    }
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }
    activeDriveData = null;
  }

  /**
   * Pull over to the side of the road, halt motion, and release camera so user can look around.
   */
  function pullOver() {
    if (!activeDriveData && !activeVehicleEntity && !stalkerEntity) {
      clearActiveDrive();
      return { status: 'idle' };
    }

    if (!isParked) {
      isParked = true;
      releaseContinuousRender('drive-sim');
      if (viewer?.clock) {
        viewer.clock.shouldAnimate = false;
      }
      unbindPreRenderCameraFollow();

      let parkedPos = null;
      if (activeVehicleEntity && viewer?.clock) {
        const curTime = viewer.clock.currentTime;
        const curPos = activeVehicleEntity.position?.getValue(curTime);
        if (curPos) {
          parkedPos = Cesium.Cartesian3.clone(curPos);
          activeVehicleEntity.position = new Cesium.ConstantPositionProperty(
            parkedPos,
          );
          if (activeVehicleEntity.box) {
            activeVehicleEntity.box.show = true;
            activeVehicleEntity.box.outlineColor =
              Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.95);
          }
        }
      }

      if (stalkerEntity) {
        const curPos = stalkerEntity.position?.getValue(
          viewer?.clock?.currentTime,
        );
        if (curPos) {
          parkedPos = Cesium.Cartesian3.clone(curPos);
          stalkerEntity.position = new Cesium.ConstantPositionProperty(
            parkedPos,
          );
          if (stalkerEntity.box) {
            stalkerEntity.box.show = true;
            stalkerEntity.box.outlineColor =
              Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.95);
          }
        }
      }

      if (activeDriveData) {
        activeDriveData.isParked = true;
      }
      return { status: 'parked', position: parkedPos };
    } else {
      clearActiveDrive();
      return { status: 'cleared' };
    }
  }

  /**
   * Spawns a real-time autonomous highway drive along the specified corridor or point-to-point.
   */
  async function startRouteDrive(fromQuery, toQuery, options = {}) {
    if (!viewer || isDestroyed) return null;

    clearActiveDrive();
    viewer.camera?.cancelFlight?.();
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }

    let corridor = resolveDriveWaypoints(fromQuery, toQuery, options);
    if (corridor?.id === 'cannonball_bullrun' && fromQuery && toQuery) {
      // If fromQuery and toQuery were provided as place names, try geocoding
      try {
        const asyncCorridor = await resolveDriveWaypointsAsync(
          fromQuery,
          toQuery,
          { fetchImpl, ...options },
        );
        if (asyncCorridor) corridor = asyncCorridor;
      } catch {
        // Fall back seamlessly to synchronous corridor
      }
    }

    const speedMph = Number(options.speedMph) || corridor.speedMph || 75;
    const isHesitation = options.hesitation !== false;
    currentCameraMode =
      options.cameraMode || (options.seat === true ? 'seat' : 'chase');

    let orderedWaypoints = corridor.waypoints;

    // Dynamic OSRM street network geometry ingestion:
    // Snap BOTH custom drives and preset highway corridors (within MAX_OSRM_TOTAL_KM)
    // to real OSRM roads so Infinite Drive never cuts straight across terrain/rivers.
    // Ultra-long transcontinental presets (> MAX_OSRM_TOTAL_KM, e.g. NY -> LA Bullrun)
    // skip OSRM automatically unless explicitly forced via options.useOsrm === true.
    const isCustomDrive =
      corridor.isCustom === true ||
      corridor.id === 'custom_drive_corridor' ||
      (Boolean(fromQuery) && Boolean(toQuery));
    const corridorKm = (corridor.totalDistanceMeters || 0) / 1000;
    const presetWithinOsrmRange =
      corridorKm > 0 && corridorKm <= MAX_OSRM_TOTAL_KM;
    const shouldQueryOsrm =
      options.useOsrm === true ||
      (options.useOsrm !== false && (isCustomDrive || presetWithinOsrmRange));

    let routeStatus = shouldQueryOsrm ? 'straight_fallback' : 'preset_corridor';
    let routeFallbackReason = null;
    let routeSubLegCount = 0;

    if (shouldQueryOsrm && orderedWaypoints.length >= 2) {
      try {
        const roadGeometry = await fetchMultiLegDriveRouteGeometry(
          orderedWaypoints,
          {
            fetchImpl,
            profile: 'car',
            ...(Number.isFinite(options.osrmPaceMs)
              ? { paceMs: options.osrmPaceMs }
              : {}),
            ...(Number.isFinite(options.osrmRetryDelayMs)
              ? { retryDelayMs: options.osrmRetryDelayMs }
              : {}),
            ...(Number.isFinite(options.osrmMaxRetries)
              ? { maxRetries: options.osrmMaxRetries }
              : {}),
          },
        );
        if (roadGeometry && roadGeometry.length >= 2) {
          orderedWaypoints = roadGeometry;
          if (roadGeometry.routeMeta) {
            routeStatus = roadGeometry.routeMeta.status;
            routeFallbackReason = roadGeometry.routeMeta.reason || null;
            routeSubLegCount = roadGeometry.routeMeta.subLegCount || 0;
          } else {
            routeStatus = 'osrm';
          }
        } else {
          routeStatus = 'straight_fallback';
          routeFallbackReason = 'No road geometry returned';
        }
      } catch (err) {
        routeStatus = 'straight_fallback';
        routeFallbackReason = err?.message || 'OSRM query error';
      }
    }

    // Update totalDistanceMeters when OSRM road geometry provides actual road mileage
    let totalDistanceMeters = corridor.totalDistanceMeters;
    if (
      (routeStatus === 'osrm' || routeStatus === 'partial_osrm') &&
      orderedWaypoints.length >= 2
    ) {
      let roadDist = 0;
      for (let i = 0; i < orderedWaypoints.length - 1; i++) {
        roadDist += calculateHaversineDistance(
          orderedWaypoints[i].lat,
          orderedWaypoints[i].lon,
          orderedWaypoints[i + 1].lat,
          orderedWaypoints[i + 1].lon,
        );
      }
      if (roadDist > 0) {
        totalDistanceMeters = roadDist;
        corridor = { ...corridor, totalDistanceMeters: roadDist };
      }
    }

    const trajectoryCartesians = generateDriveTrajectory(orderedWaypoints, {
      sampleIntervalMeters: options.sampleIntervalMeters,
      roadOffsetMeters: ROAD_SURFACE_OFFSET_METERS,
      viewer,
    });

    if (trajectoryCartesians.length < 2) return null;

    // Calculate duration with optional curvature slowing
    const curvatureSpeeds = calculateCurvatureSpeedLimits(
      orderedWaypoints,
      speedMph,
    );
    let avgSpeedMph = speedMph;
    if (isHesitation && curvatureSpeeds.length > 0) {
      const sum = curvatureSpeeds.reduce((acc, s) => acc + s, 0);
      avgSpeedMph = Math.round(sum / curvatureSpeeds.length);
    }

    const durationSec = calculateTravelDurationSeconds(
      totalDistanceMeters,
      avgSpeedMph,
    );

    const startTime = Cesium.JulianDate.now();
    const stopTime = Cesium.JulianDate.addSeconds(
      startTime,
      durationSec,
      new Cesium.JulianDate(),
    );

    const positionProperty = new Cesium.SampledPositionProperty();
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
    activeRawPositionProperty = positionProperty;

    // Configure viewer clock
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 1.0;
    viewer.clock.shouldAnimate = true;

    // 1. Glowing Highway Vector Entity (Cyan / Electric Blue) clamped to terrain
    activeRoadPathEntity = viewer.entities.add({
      name: `Highway: ${corridor.name}`,
      polyline: {
        positions: trajectoryCartesians,
        width: 3.5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          taperPower: 0.1,
          color: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.85),
        }),
        clampToGround: true,
      },
    });

    // 2. 3D Vehicle Entity (Sports Grand-Tourer dimensions: 4.8m length, 2.0m width, 1.4m height)
    const orientationProperty = new Cesium.VelocityOrientationProperty(
      positionProperty,
    );

    const vehicleName = options.vehicleName || `Cruiser [${corridor.name}]`;

    // Seed initial ground sample so Frame 0 and dynamic CallbackPositionProperty start above the surface
    const initialCarto = Cesium.Cartographic.fromCartesian(
      trajectoryCartesians[0],
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (initialCarto) {
      const initialBaseline = initialCarto.height - ROAD_SURFACE_OFFSET_METERS;
      const initialGround = sampleDriveSurfaceHeight(viewer, initialCarto, [
        activeRoadPathEntity,
      ]);
      if (
        Number.isFinite(initialGround) &&
        (!isPhotoreal3DActive(viewer) ||
          isPlausible3DGroundSample(initialGround, initialBaseline, null))
      ) {
        lastSampledGroundM = initialGround;
      }
    }

    const dynamicVehiclePosition = new Cesium.CallbackPositionProperty(
      (time, result) => {
        const evalTime = time || viewer.clock?.currentTime;
        if (
          liveClampedVehiclePos &&
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
            liveClampedVehiclePos,
            result || new Cesium.Cartesian3(),
          );
        }
        const raw = positionProperty.getValue(evalTime);
        if (!raw) return undefined;
        if (!Number.isFinite(lastSampledGroundM)) {
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
        const targetH = lastSampledGroundM + ROAD_SURFACE_OFFSET_METERS;
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

    activeVehicleEntity = viewer.entities.add({
      name: vehicleName,
      position: dynamicVehiclePosition,
      orientation: orientationProperty,
      box: {
        dimensions: new Cesium.Cartesian3(4.8, 2.0, 1.4),
        fill: false,
        outline: true,
        outlineColor:
          Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.95),
        outlineWidth: 2,
        show: currentCameraMode !== 'seat',
      },
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#38bdf8'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: currentCameraMode !== 'seat',
      },
      path: {
        resolution: 1,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
        width: 2.5,
        leadTime: 0,
        trailTime: 12,
      },
      gevTrackedId: vehicleName,
    });

    activeDriveData = {
      corridor,
      vehicleName,
      speedMph: avgSpeedMph,
      baseSpeedMph: speedMph,
      totalDistanceMeters,
      durationSec,
      cameraMode: currentCameraMode,
      isTrafficStalker: false,
      isParked: false,
      routeStatus,
      routeFallbackReason,
      routeSubLegCount,
      startTime,
      stopTime,
    };

    // Immediate Frame 0 Camera + Surface Clamping Setup
    const synced = syncVehicleAndCameraPose();
    if (!synced) {
      const initialPos = trajectoryCartesians[0];
      const initialNext = trajectoryCartesians[1];
      const initialForward = Cesium.Cartesian3.subtract(
        initialNext,
        initialPos,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(initialForward, initialForward);
      applyCameraFollow(
        viewer,
        initialPos,
        initialForward,
        currentCameraMode,
        getExcludeEntities(),
      );
    }

    // Frame-by-frame camera follow loop (custom preRender follow owns camera; never pin trackedEntity)
    bindPreRenderCameraFollow();
    holdContinuousRender('drive-sim');
    nudgeTilesetStreaming('drive-sim-start', { force: true });
    butterGoogle3DTiles(viewer?.scene?.primitives, 'drive-sim-start', {
      maxMs: 2600,
    });
    governorRequestRender('drive-sim-start');
    viewer.scene?.requestRender?.();

    activeVehicleEntity.viewFrom = getCameraOffset(currentCameraMode).clone();
    viewer.trackedEntity = undefined;

    return activeDriveData;
  }

  /**
   * Mode 1: Traffic Stalker — Latch camera onto a synthetic traffic dot and cruise with it indefinitely.
   */
  function latchOntoTraffic(targetDotOrId = null, options = {}) {
    if (!viewer || isDestroyed) return null;

    clearActiveDrive();
    viewer.camera?.cancelFlight?.();
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }

    let targetDot = null;
    const resolvedTraffic =
      trafficLayer ||
      (typeof window !== 'undefined' ? window.__gevTraffic : null);

    // Auto-enable traffic layer if present
    if (resolvedTraffic && typeof resolvedTraffic.enable === 'function') {
      try {
        resolvedTraffic.enable(viewer);
      } catch {
        /* ignore */
      }
    }

    // 1. If target object is passed directly
    if (
      targetDotOrId &&
      typeof targetDotOrId === 'object' &&
      targetDotOrId.point?.position
    ) {
      targetDot = targetDotOrId;
    }
    // 2. If ID was passed, find in traffic layer
    else if (
      targetDotOrId &&
      resolvedTraffic &&
      typeof resolvedTraffic.getTrafficDot === 'function'
    ) {
      targetDot = resolvedTraffic.getTrafficDot(targetDotOrId);
    }
    // 3. Auto-acquire dot closest to screen center or camera
    else if (resolvedTraffic) {
      if (typeof resolvedTraffic.getTrafficDots === 'function') {
        const dots = resolvedTraffic.getTrafficDots();
        if (dots && dots.length > 0) {
          let minDistance = Infinity;
          const canvas = viewer?.scene?.canvas;
          const centerX = canvas ? canvas.width / 2 : 0;
          const centerY = canvas ? canvas.height / 2 : 0;

          for (const d of dots) {
            const p = d.point?.position;
            if (!p) continue;
            if (canvas && Cesium.SceneTransforms?.worldToWindowCoordinates) {
              const scr = Cesium.SceneTransforms.worldToWindowCoordinates(
                viewer.scene,
                p,
              );
              if (scr) {
                const dist = Math.hypot(scr.x - centerX, scr.y - centerY);
                if (dist < minDistance) {
                  minDistance = dist;
                  targetDot = d;
                }
              }
            } else {
              const camPos = viewer.camera?.position;
              const dist = camPos ? Cesium.Cartesian3.distance(camPos, p) : 0;
              if (dist < minDistance) {
                minDistance = dist;
                targetDot = d;
              }
            }
          }
          if (!targetDot) targetDot = dots[0];
        }
      }
      if (!targetDot && typeof resolvedTraffic.visitMotionDots === 'function') {
        resolvedTraffic.visitMotionDots((id, key, point, road, dot) => {
          if (!targetDot && (point?.position || dot?.point?.position)) {
            targetDot = dot || { id, point, road };
          }
        });
      }
    }

    // Fallback: If no traffic dot is active in viewport, simulate synthetic highway cruiser at camera center
    if (!targetDot || !targetDot.point?.position) {
      const cameraCartographic = viewer.camera?.positionCartographic || {
        latitude: Cesium.Math.toRadians(33.749),
        longitude: Cesium.Math.toRadians(-84.388),
      };
      const centerLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
      const centerLon = Cesium.Math.toDegrees(cameraCartographic.longitude);

      return startRouteDrive(
        `${centerLat.toFixed(4)},${centerLon.toFixed(4)}`,
        `${(centerLat + 0.15).toFixed(4)},${(centerLon + 0.15).toFixed(4)}`,
        {
          speedMph: options.speedMph || 65,
          vehicleName: 'Synthetic Highway Cruiser',
          ...options,
        },
      );
    }

    currentCameraMode =
      options.cameraMode || (options.seat === true ? 'seat' : 'chase');
    const dotPos = targetDot.point.position;
    const dotSpeedMph = Math.round((targetDot.mps || 18) * 2.23694);

    // Stalker Entity tied to the moving dot (clamped to rendered 3D/2D surface)
    const positionProp = new Cesium.CallbackProperty(() => {
      return liveClampedStalkerPos || targetDot.point?.position || dotPos;
    }, false);

    const orientationProp = new Cesium.CallbackProperty(() => {
      return calculateDotOrientation(targetDot);
    }, false);

    stalkerEntity = viewer.entities.add({
      name: `Traffic Stalker: VEH-${String(targetDot.id).padStart(4, '0')}`,
      position: positionProp,
      orientation: orientationProp,
      box: {
        dimensions: new Cesium.Cartesian3(4.8, 2.0, 1.4),
        fill: false,
        outline: true,
        outlineColor:
          Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.95),
        outlineWidth: 2,
        show: currentCameraMode !== 'seat',
      },
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: currentCameraMode !== 'seat',
      },
      gevTrackedId: `traffic-stalker-${targetDot.id}`,
    });

    activeDriveData = {
      isTrafficStalker: true,
      dotId: targetDot.id,
      speedMph: dotSpeedMph,
      cameraMode: currentCameraMode,
      road: targetDot.road?.key || 'Local Arterial',
      targetDot,
      isParked: false,
    };

    // Immediate Frame 0 Camera + Surface Clamping Setup
    const synced = syncVehicleAndCameraPose();
    if (!synced) {
      const forward = calculateDotHeadingVector(targetDot);
      if (forward) {
        applyCameraFollow(
          viewer,
          dotPos,
          forward,
          currentCameraMode,
          getExcludeEntities(),
        );
      }
    }

    // Frame-by-frame camera follow loop (custom preRender follow owns camera; never pin trackedEntity)
    bindPreRenderCameraFollow();
    holdContinuousRender('drive-sim');
    nudgeTilesetStreaming('drive-sim-start', { force: true });
    butterGoogle3DTiles(viewer?.scene?.primitives, 'drive-sim-start', {
      maxMs: 2600,
    });
    governorRequestRender('drive-sim-start');
    viewer.scene?.requestRender?.();

    stalkerEntity.viewFrom = getCameraOffset(currentCameraMode).clone();
    viewer.trackedEntity = undefined;

    return activeDriveData;
  }

  /**
   * Switches the active camera mode: 'chase', 'seat' (driver's cockpit), 'copter', 'overview' (regional tactical map), or 'free' (detached).
   */
  function setCameraMode(mode) {
    currentCameraMode = mode;
    cameraAuthority.beginAtomicCameraSwitch({
      mode,
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: `drive-cam-${mode}`,
      butterMaxMs: 2200,
    });
    const targetEntity = activeVehicleEntity || stalkerEntity;
    if (targetEntity) {
      const offset = getCameraOffset(mode);
      targetEntity.viewFrom = offset.clone();
      if (targetEntity.box) {
        targetEntity.box.show = mode !== 'seat';
      }
      if (targetEntity.point) {
        targetEntity.point.show = mode !== 'seat';
      }
    }
    if (activeDriveData) {
      activeDriveData.cameraMode = mode;
      activeDriveData.isFreeCam = mode === 'free';
    }
    // Apply pose immediately even while parked so camera buttons work on Click #1
    if (mode !== 'free' && activeDriveData) {
      syncVehicleAndCameraPose();
    }
    governorRequestRender(`drive-cam-${mode}`);
    return currentCameraMode;
  }

  /**
   * Snaps camera directly back to the active vehicle from Overview or Free Cam.
   */
  function snapBack(mode = 'chase') {
    return setCameraMode(mode);
  }

  /**
   * Returns live, rich telemetry for HUD displays and status overlays with zero API credit drain.
   */
  function getActiveTelemetry() {
    if (!activeDriveData || isDestroyed) return null;

    let curLat = null;
    let curLon = null;
    let curElev = 0;

    if (activeDriveData.isTrafficStalker) {
      const dot = activeDriveData.targetDot;
      if (dot?.point?.position) {
        const carto = Cesium.Cartographic.fromCartesian(
          dot.point.position,
          Cesium.Ellipsoid.WGS84,
          new Cesium.Cartographic(),
        );
        if (carto) {
          curLat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4));
          curLon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4));
          curElev = Math.round(carto.height);
        }
      }
      return {
        isTrafficStalker: true,
        dotId: activeDriveData.dotId,
        speedMph: activeDriveData.speedMph || 35,
        lat: curLat,
        lon: curLon,
        elev: curElev,
        roadName: activeDriveData.road || 'Local Traffic Network',
        currentLocation: `Vehicle VEH-${String(activeDriveData.dotId).padStart(4, '0')} (${activeDriveData.road || 'Local Network'})`,
        nextLocation: 'Traffic Flow',
        progressPct: 100,
        distTraveledKm: 0,
        totalDistKm: 0,
        distTraveledMi: 0,
        totalDistMi: 0,
        distToNextKm: 0,
        distToNextMi: 0,
        cameraMode: currentCameraMode,
        isParked,
        isFreeCam: currentCameraMode === 'free',
      };
    }

    if (!activeVehicleEntity || !viewer?.clock) return null;

    const curTime = viewer.clock.currentTime;
    const curPos = activeVehicleEntity.position?.getValue(curTime);
    if (!curPos) return null;

    const carto = Cesium.Cartographic.fromCartesian(
      curPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (carto) {
      curLat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4));
      curLon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4));
      curElev = Math.round(carto.height);
    }

    const corridor = activeDriveData.corridor;
    const totalDistM = corridor?.totalDistanceMeters || 1;
    const durationSec = activeDriveData.durationSec || 1;
    const startTime = activeDriveData.startTime;

    const elapsedSec = Math.max(
      0,
      Cesium.JulianDate.secondsDifference(curTime, startTime),
    );
    const progressFrac = Math.min(1.0, Math.max(0.0, elapsedSec / durationSec));
    const progressPct = Math.round(progressFrac * 100);
    const distTraveledKm = Math.round((progressFrac * totalDistM) / 1000);
    const totalDistKm = Math.round(totalDistM / 1000);
    const distTraveledMi = Math.round(distTraveledKm * 0.621371);
    const totalDistMi = Math.round(totalDistKm * 0.621371);

    // Find closest and next waypoints from corridor.waypoints
    let closestWp = null;
    let nextWp = null;
    let distToNextKm = 0;

    const waypoints = corridor?.waypoints || [];
    if (waypoints.length > 0 && curLat !== null && curLon !== null) {
      let minDist = Infinity;
      let closestIdx = 0;

      for (let i = 0; i < waypoints.length; i++) {
        const d = calculateHaversineDistance(
          curLat,
          curLon,
          waypoints[i].lat,
          waypoints[i].lon,
        );
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }
      closestWp = waypoints[closestIdx];

      if (closestIdx + 1 < waypoints.length) {
        nextWp = waypoints[closestIdx + 1];
        distToNextKm = Math.round(
          calculateHaversineDistance(curLat, curLon, nextWp.lat, nextWp.lon) /
            1000,
        );
      } else {
        nextWp = waypoints[waypoints.length - 1];
        distToNextKm = 0;
      }
    }

    return {
      isTrafficStalker: false,
      corridorId: corridor?.id,
      corridorName: corridor?.name || 'Highway Cruiser',
      vehicleName: activeDriveData.vehicleName,
      speedMph: activeDriveData.speedMph || 75,
      lat: curLat,
      lon: curLon,
      elev: curElev,
      progressPct,
      distTraveledKm,
      totalDistKm,
      distTraveledMi,
      totalDistMi,
      currentLocation:
        closestWp?.name || corridor?.from?.name || 'Highway Corridor',
      nextLocation: nextWp?.name || corridor?.to?.name || 'Destination',
      distToNextKm,
      distToNextMi: Math.round(distToNextKm * 0.621371),
      cameraMode: currentCameraMode,
      isParked,
      isFreeCam: currentCameraMode === 'free',
      routeStatus: activeDriveData.routeStatus || 'preset_corridor',
      routeFallbackReason: activeDriveData.routeFallbackReason || null,
      routeSubLegCount: activeDriveData.routeSubLegCount || 0,
    };
  }

  /**
   * Installs screen-space click listener to pick traffic contacts directly on the Cesium canvas.
   */
  function installClickHandler() {
    if (!viewer?.scene?.canvas || screenClickHandler) return;
    try {
      screenClickHandler = new Cesium.ScreenSpaceEventHandler(
        viewer.scene.canvas,
      );
      screenClickHandler.setInputAction((click) => {
        if (!isPointerFree()) return;

        const resolvedTraffic =
          trafficLayer ||
          (typeof window !== 'undefined' ? window.__gevTraffic : null);
        if (!resolvedTraffic) return;

        const dots =
          typeof resolvedTraffic.getTrafficDots === 'function'
            ? resolvedTraffic.getTrafficDots()
            : [];
        if (!dots || dots.length === 0) return;

        let bestDot = null;
        let bestDistPx = 35; // 35px threshold

        for (let i = 0; i < dots.length; i++) {
          const dot = dots[i];
          const pos = dot.point?.position;
          if (!pos) continue;

          const screenPos = Cesium.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            pos,
          );
          if (!screenPos) continue;

          const dist = Math.hypot(
            screenPos.x - click.position.x,
            screenPos.y - click.position.y,
          );
          if (dist < bestDistPx) {
            bestDistPx = dist;
            bestDot = dot;
          }
        }

        if (bestDot) {
          const res = latchOntoTraffic(bestDot, {
            cameraMode: currentCameraMode,
          });
          if (res && onTrafficLatchedCallback) {
            onTrafficLatchedCallback(bestDot, res);
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      // Non-browser or headless environment
    }
  }

  installClickHandler();

  // URL query parameter routing: ?driveFrom=...&driveTo=... or ?driveCorridor=... or ?trafficFollow=true
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const driveFrom = params.get('driveFrom');
      const driveTo = params.get('driveTo');
      const corridor = params.get('driveCorridor');
      const trafficFollow =
        params.get('trafficFollow') === 'true' ||
        params.get('trafficFollow') === '1';
      const seat =
        params.get('seat') === 'true' ||
        params.get('dashcam') === 'true' ||
        params.get('cockpit') === 'true';
      const speed = params.get('speed') ? Number(params.get('speed')) : 75;

      if (trafficFollow) {
        setTimeout(() => {
          latchOntoTraffic(null, {
            seat,
            cameraMode: seat ? 'seat' : 'chase',
            speedMph: speed,
          });
        }, 1500);
      } else if (driveFrom && driveTo) {
        setTimeout(() => {
          startRouteDrive(driveFrom, driveTo, {
            seat,
            cameraMode: seat ? 'seat' : 'chase',
            speedMph: speed,
          });
        }, 1500);
      } else if (corridor) {
        setTimeout(() => {
          startRouteDrive(corridor, null, {
            seat,
            cameraMode: seat ? 'seat' : 'chase',
            speedMph: speed,
          });
        }, 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    startRouteDrive,
    latchOntoTraffic,
    setCameraMode,
    pullOver,
    stopDrive: clearActiveDrive,
    clearActiveDrive,
    onTrafficLatched: (cb) => {
      onTrafficLatchedCallback = cb;
    },
    getActiveDrive: () => activeDriveData,
    getActiveTelemetry,
    snapBack,
    getCameraMode: () => currentCameraMode,
    onCameraModeChange: (cb) => {
      if (typeof cb === 'function') {
        cameraModeListeners.add(cb);
        return () => cameraModeListeners.delete(cb);
      }
      return () => {};
    },
    getCameraIntentSeq: () => cameraAuthority.getSeq(),
    isParked: () => isParked,
    destroy: () => {
      isDestroyed = true;
      unbindPreRenderCameraFollow();
      if (screenClickHandler) {
        try {
          screenClickHandler.destroy();
        } catch {
          /* ignore */
        }
        screenClickHandler = null;
      }
      clearActiveDrive();
    },
  };
}
