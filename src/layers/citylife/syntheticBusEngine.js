/**
 * Municipal Bus Fleet Engine for Living City Simulator.
 * (Public Transit & Transit Controller)
 *
 * Implements 60fps synthetic bus fleet simulation across major world metropolises
 * (Atlanta MARTA, NYC MTA, Chicago CTA, Tokyo Toei, London TfL) with:
 * - Curated arterial routes and curbside bus stop shelters
 * - Kinematic deceleration, curbside docking, suspension kneeling, and door interlocks
 * - Dotted wireframe bounding reticles on canvas with transit livery styling
 * - Seamless passenger boarding exchange with passengerFlow
 * - First-person Cab, Chase, Curbside Door, and Tactical Overview camera choreographies
 */

import * as Cesium from 'cesium';
import { smoothRoadCurvature } from '../../drive/roadGeometrySnapper.js';
import { createLivePose } from './livePose.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../../renderGovernor.js';
import { createCameraAuthority } from '../../ui/sovereign/cameraControlBridge.js';
import { butterGoogle3DTiles } from '../../ui/sovereign/tilesetButter.js';
import {
  createRouteOverlayState,
  appendRouteOverlay,
  clearRouteOverlay,
  flyCameraToTransitNetwork,
  setRouteOverlayVisible,
} from './transitNetworkOverlay.js';

export const BUS_CRUISE_SPEED_MIN_MS = 8.5; // ~19 mph
export const BUS_CRUISE_SPEED_MAX_MS = 13.5; // ~30 mph
export const BUS_BRAKE_ACCEL_MS2 = 1.4; // smooth braking
export const BUS_ACCEL_MS2 = 1.2; // diesel/electric pull-away
export const BUS_DWELL_TIME_SEC = 14.0; // station dwell
export const BUS_KNEEL_OFFSET_M = 0.15; // suspension lowering

export const BUS_DIMENSIONS = {
  length: 12.0,
  width: 2.8,
  height: 3.2,
};

/**
 * Curated Global Municipal Bus Routes.
 */
export const MUNICIPAL_BUS_ROUTES = {
  atlanta_marta_110: {
    id: 'atlanta_marta_110',
    cityId: 'atlanta',
    routeNumber: '110',
    name: 'MARTA Route 110 — "The Peach"',
    operator: 'MARTA',
    liveryColor: '#2563eb', // MARTA Blue
    accentColor: '#f59e0b', // MARTA Gold
    capacity: 55,
    stops: [
      {
        id: 'atl_stop_1',
        name: 'Arts Center Station',
        lat: 33.7892,
        lon: -84.3872,
        elev: 318,
      },
      {
        id: 'atl_stop_2',
        name: 'Colony Square (14th & Peachtree)',
        lat: 33.7865,
        lon: -84.3845,
        elev: 319,
      },
      {
        id: 'atl_stop_3',
        name: 'Midtown Promenade (10th & Peachtree)',
        lat: 33.7818,
        lon: -84.3837,
        elev: 318,
      },
      {
        id: 'atl_stop_4',
        name: 'Fox Theatre / Ponce de Leon',
        lat: 33.7725,
        lon: -84.3852,
        elev: 316,
      },
      {
        id: 'atl_stop_5',
        name: 'Five Points Underground Terminal',
        lat: 33.754,
        lon: -84.3915,
        elev: 318,
      },
    ],
    waypoints: [
      { lat: 33.7892, lon: -84.3872, elev: 318 },
      { lat: 33.7878, lon: -84.3858, elev: 318 },
      { lat: 33.7865, lon: -84.3845, elev: 319 },
      { lat: 33.7842, lon: -84.384, elev: 319 },
      { lat: 33.7818, lon: -84.3837, elev: 318 },
      { lat: 33.7775, lon: -84.3843, elev: 316 },
      { lat: 33.7725, lon: -84.3852, elev: 316 },
      { lat: 33.765, lon: -84.3875, elev: 316 },
      { lat: 33.7585, lon: -84.3888, elev: 318 },
      { lat: 33.754, lon: -84.3915, elev: 318 },
    ],
  },
  nyc_mta_m15: {
    id: 'nyc_mta_m15',
    cityId: 'new_york',
    routeNumber: 'M15-SBS',
    name: 'MTA M15 Select Bus Service',
    operator: 'MTA Regional Bus',
    liveryColor: '#1e40af', // MTA Blue
    accentColor: '#38bdf8', // SBS Cyan
    capacity: 65,
    stops: [
      {
        id: 'nyc_stop_1',
        name: 'South Ferry Terminal',
        lat: 40.7015,
        lon: -74.0135,
        elev: 3,
      },
      {
        id: 'nyc_stop_2',
        name: 'Lower East Side / Houston St',
        lat: 40.7225,
        lon: -73.9875,
        elev: 8,
      },
      {
        id: 'nyc_stop_3',
        name: 'Midtown East (42nd St & 1st Ave)',
        lat: 40.7485,
        lon: -73.9712,
        elev: 12,
      },
      {
        id: 'nyc_stop_4',
        name: 'Upper East Side (72nd & 2nd Ave)',
        lat: 40.7688,
        lon: -73.9585,
        elev: 16,
      },
      {
        id: 'nyc_stop_5',
        name: '86th St SBS Terminal',
        lat: 40.7782,
        lon: -73.9525,
        elev: 18,
      },
    ],
    waypoints: [
      { lat: 40.7015, lon: -74.0135, elev: 3 },
      { lat: 40.7118, lon: -73.9982, elev: 6 },
      { lat: 40.7225, lon: -73.9875, elev: 8 },
      { lat: 40.7355, lon: -73.9782, elev: 10 },
      { lat: 40.7485, lon: -73.9712, elev: 12 },
      { lat: 40.7592, lon: -73.9645, elev: 14 },
      { lat: 40.7688, lon: -73.9585, elev: 16 },
      { lat: 40.7782, lon: -73.9525, elev: 18 },
    ],
  },
  chicago_cta_66: {
    id: 'chicago_cta_66',
    cityId: 'chicago',
    routeNumber: '66',
    name: 'CTA Route 66 — Chicago Avenue',
    operator: 'Chicago Transit Authority',
    liveryColor: '#dc2626', // CTA Red
    accentColor: '#2563eb', // CTA Blue
    capacity: 55,
    stops: [
      {
        id: 'chi_stop_1',
        name: 'Navy Pier Terminal',
        lat: 41.8918,
        lon: -87.6052,
        elev: 180,
      },
      {
        id: 'chi_stop_2',
        name: 'Michigan Ave & Chicago (Mag Mile)',
        lat: 41.8968,
        lon: -87.6242,
        elev: 181,
      },
      {
        id: 'chi_stop_3',
        name: 'State & Chicago Red Line',
        lat: 41.8966,
        lon: -87.6282,
        elev: 181,
      },
      {
        id: 'chi_stop_4',
        name: 'Chicago Brown/Purple Station',
        lat: 41.8965,
        lon: -87.6358,
        elev: 182,
      },
      {
        id: 'chi_stop_5',
        name: 'Halsted & Chicago Ave',
        lat: 41.8964,
        lon: -87.6475,
        elev: 182,
      },
    ],
    waypoints: [
      { lat: 41.8918, lon: -87.6052, elev: 180 },
      { lat: 41.8942, lon: -87.6155, elev: 181 },
      { lat: 41.8968, lon: -87.6242, elev: 181 },
      { lat: 41.8966, lon: -87.6282, elev: 181 },
      { lat: 41.8965, lon: -87.6358, elev: 182 },
      { lat: 41.8964, lon: -87.6475, elev: 182 },
    ],
  },
  tokyo_toei_01: {
    id: 'tokyo_toei_01',
    cityId: 'tokyo',
    routeNumber: '都01',
    name: 'Toei Bus 都01 — Green Shuttle',
    operator: 'Bureau of Transportation Tokyo',
    liveryColor: '#15803d', // Toei Green
    accentColor: '#fef08a', // Cream accent
    capacity: 60,
    stops: [
      {
        id: 'tyo_stop_1',
        name: 'Shibuya Station East Exit',
        lat: 35.6588,
        lon: 139.7025,
        elev: 18,
      },
      {
        id: 'tyo_stop_2',
        name: 'Minami-Aoyama 7-chome',
        lat: 35.6605,
        lon: 139.7115,
        elev: 28,
      },
      {
        id: 'tyo_stop_3',
        name: 'Roppongi Hills',
        lat: 35.6628,
        lon: 139.7295,
        elev: 32,
      },
      {
        id: 'tyo_stop_4',
        name: 'Toranomon Hills',
        lat: 35.6668,
        lon: 139.7495,
        elev: 12,
      },
      {
        id: 'tyo_stop_5',
        name: 'Shimbashi Station Terminal',
        lat: 35.6662,
        lon: 139.7585,
        elev: 5,
      },
    ],
    waypoints: [
      { lat: 35.6588, lon: 139.7025, elev: 18 },
      { lat: 35.6605, lon: 139.7115, elev: 28 },
      { lat: 35.6628, lon: 139.7295, elev: 32 },
      { lat: 35.6645, lon: 139.7392, elev: 22 },
      { lat: 35.6668, lon: 139.7495, elev: 12 },
      { lat: 35.6662, lon: 139.7585, elev: 5 },
    ],
  },
  london_tfl_24: {
    id: 'london_tfl_24',
    cityId: 'london',
    routeNumber: '24',
    name: 'TfL Route 24 — Red Double Decker',
    operator: 'Transport for London',
    liveryColor: '#dc2626', // London Red
    accentColor: '#ffffff', // White roundel
    capacity: 75,
    stops: [
      {
        id: 'lon_stop_1',
        name: 'Camden Town Station',
        lat: 51.5392,
        lon: -0.1425,
        elev: 25,
      },
      {
        id: 'lon_stop_2',
        name: 'Warren Street Station',
        lat: 51.5248,
        lon: -0.1382,
        elev: 22,
      },
      {
        id: 'lon_stop_3',
        name: 'Tottenham Court Road',
        lat: 51.5165,
        lon: -0.1312,
        elev: 20,
      },
      {
        id: 'lon_stop_4',
        name: 'Trafalgar Square',
        lat: 51.508,
        lon: -0.128,
        elev: 14,
      },
      {
        id: 'lon_stop_5',
        name: 'Westminster Station / Big Ben',
        lat: 51.5015,
        lon: -0.1255,
        elev: 8,
      },
    ],
    waypoints: [
      { lat: 51.5392, lon: -0.1425, elev: 25 },
      { lat: 51.5315, lon: -0.1402, elev: 24 },
      { lat: 51.5248, lon: -0.1382, elev: 22 },
      { lat: 51.5165, lon: -0.1312, elev: 20 },
      { lat: 51.508, lon: -0.128, elev: 14 },
      { lat: 51.5015, lon: -0.1255, elev: 8 },
    ],
  },
};

/**
 * Builds dense trajectory Cartesian3 points from waypoints with cumulative distances.
 * Snaps to smooth road curvature to prevent diagonal chord cutting across blocks.
 */
export function buildBusTrajectory(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;

  const denseWaypoints = smoothRoadCurvature(waypoints, 12.0);
  const points = denseWaypoints.map((wp) =>
    Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, (wp.elev || 0) + 1.6),
  );

  const cumDists = [0];
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = Cesium.Cartesian3.distance(points[i], points[i + 1]);
    totalDist += d;
    cumDists.push(totalDist);
  }

  points.cumulativeDistances = cumDists;
  points.totalDistance = Math.max(totalDist, 1);
  return points;
}

/**
 * Samples a trajectory at distance with interpolation and forward heading tangent.
 */
export function sampleBusTrajectory(trajectory, distMeters) {
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
    forward.x = 0;
    forward.y = 1;
    forward.z = 0;
  }

  return { pos, forward, distMeters: d, segmentIndex: segIdx };
}

/**
 * Creates the Municipal Bus Fleet Engine.
 */
export function createSyntheticBusEngine({
  viewer = null,
  passengerFlow = null,
} = {}) {
  let activeFleet = [];
  let activeCityId = null;
  let activeRouteId = null;
  let activeBus = null;
  let cameraMode = 'chase'; // 'cab', 'chase', 'door', 'overview', 'free'
  let isCameraEnabled = true;
  let removePreRenderListener = null;
  const routeOverlay = createRouteOverlayState();
  let routeLinesVisible = true;
  let lastTickTime = Date.now();
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
    engineId: 'synthetic-bus',
    cancelCameraFlight: () => viewer?.camera?.cancelFlight?.(),
    resetCameraLookAt: () =>
      viewer?.camera?.lookAtTransform?.(Cesium.Matrix4.IDENTITY),
    clearTrackedEntity: () => {
      if (viewer && viewer.trackedEntity !== undefined) {
        viewer.trackedEntity = undefined;
      }
    },
    getTilesetPrimitives: () => viewer?.scene?.primitives || null,
    isRendererDestroyed: () => Boolean(viewer?.isDestroyed?.()),
    onCameraModeApplied: notifyCameraModeListeners,
  });

  function startBusFleet(cityId = 'atlanta', options = {}) {
    stopBusFleet();

    activeCityId = cityId;
    routeOverlay.visible = routeLinesVisible;
    const count = options.busCount || 3;

    // Locate matching route
    let routeKey = Object.keys(MUNICIPAL_BUS_ROUTES).find(
      (k) => MUNICIPAL_BUS_ROUTES[k].cityId === cityId,
    );
    if (!routeKey) routeKey = 'atlanta_marta_110';
    activeRouteId = routeKey;
    const route = MUNICIPAL_BUS_ROUTES[routeKey];

    const trajectory = buildBusTrajectory(route.waypoints);
    if (!trajectory) return null;

    appendRouteOverlay(routeOverlay, viewer, {
      positions: trajectory,
      stops: route.stops,
      liveryColor: route.liveryColor,
    });

    // Register stops with passenger flow if available
    if (passengerFlow && typeof passengerFlow.registerStops === 'function') {
      passengerFlow.registerStops(route.stops, {
        mode: 'bus',
        routeId: route.id,
      });
    }

    // Precompute sequential stop trajectory distances
    const stopTrajDists = (route.stops || []).map((stop) => {
      const stopCart = Cesium.Cartesian3.fromDegrees(
        stop.lon,
        stop.lat,
        (stop.elev || 0) + 1.6,
      );
      let minD = Infinity;
      let bestDist = 0;
      for (let s = 0; s < trajectory.length; s++) {
        const d = Cesium.Cartesian3.distance(trajectory[s], stopCart);
        if (d < minD) {
          minD = d;
          bestDist = trajectory.cumulativeDistances
            ? trajectory.cumulativeDistances[s]
            : 0;
        }
      }
      return bestDist;
    });

    // Spawn fleet with staggered initial headway
    const spacingMeters = trajectory.totalDistance / count;
    for (let i = 0; i < count; i++) {
      const busId = `${route.operator}-${route.routeNumber}-${i + 1}`;
      const initialDist = (i * spacingMeters) % trajectory.totalDistance;
      const sample = sampleBusTrajectory(trajectory, initialDist);

      // Orientation quaternion along velocity
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        sample.pos,
        new Cesium.Cartesian3(),
      );
      const right = Cesium.Cartesian3.cross(
        sample.forward,
        normal,
        new Cesium.Cartesian3(),
      );
      let initQuat = undefined;
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
        initQuat = Cesium.Quaternion.fromRotationMatrix(
          rotMat,
          new Cesium.Quaternion(),
        );
      }

      // LIVE pose => DYNAMIC box geometry (a ConstantPositionProperty would make Cesium
      // rebuild the outlined box asynchronously every frame, so it never draws).
      const pose = createLivePose(sample.pos, initQuat);

      // Highlighted Outlined Bounding Rectangle & Point Reticle (Contact Invariant)
      let entity = null;
      if (viewer?.entities?.add) {
        entity = viewer.entities.add({
          name: `${route.operator} Bus ${route.routeNumber} (#${i + 1})`,
          position: pose.position,
          orientation: pose.orientation,
          box: {
            dimensions: new Cesium.Cartesian3(
              BUS_DIMENSIONS.width,
              BUS_DIMENSIONS.length,
              BUS_DIMENSIONS.height,
            ),
            material: Cesium.Color.fromCssColorString(
              route.liveryColor,
            ).withAlpha(0.65),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3.0,
          },
          point: {
            pixelSize: i === 0 ? 14 : 9,
            color: Cesium.Color.fromCssColorString(route.liveryColor),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: i === 0 ? 3.0 : 2.0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              250.0,
              Number.POSITIVE_INFINITY,
            ),
          },
          properties: {
            isSyntheticBus: true,
            busId,
            routeNumber: route.routeNumber,
            operator: route.operator,
          },
        });
      }

      // Initialize sequential target stop ahead of initial position
      let initStopIdx = 0;
      if (route.stops && route.stops.length > 0) {
        for (let s = 0; s < stopTrajDists.length; s++) {
          if (stopTrajDists[s] > initialDist + 15) {
            initStopIdx = s;
            break;
          }
        }
      }

      const busRecord = {
        id: busId,
        index: i,
        route,
        trajectory,
        entity,
        pose,
        _styleKey: null,
        currentPos: sample.pos,
        currentForward: sample.forward,
        distMeters: initialDist,
        speedMs: BUS_CRUISE_SPEED_MIN_MS + (i % 2) * 1.5,
        targetSpeedMs: BUS_CRUISE_SPEED_MIN_MS + 2.0,
        state: 'CRUISING', // 'CRUISING', 'APPROACHING_STOP', 'DWELL', 'DEPARTING'
        dwellTimerSec: 0,
        departTimerSec: 0,
        targetStopIndex: initStopIdx,
        _prevTargetStopDist: 999999,
        isKneeling: false,
        doorsOpen: false,
        passengers: Math.floor(route.capacity * (0.4 + i * 0.15)),
        capacity: route.capacity,
        nextStop: route.stops[initStopIdx] || route.stops[0] || null,
        nextStopDistMeters: 500,
        onTimeSec: Math.floor((Math.random() - 0.4) * 45), // -18s to +27s schedule adherence
      };

      activeFleet.push(busRecord);
    }

    if (activeFleet.length > 0) {
      activeBus = activeFleet[0];
    }

    // Bind preRender 60fps simulation loop
    if (viewer?.scene?.preRender?.addEventListener) {
      removePreRenderListener =
        viewer.scene.preRender.addEventListener(onPreRender);
    }

    if (activeFleet.length > 0) {
      holdContinuousRender('synthetic-bus');
      butterGoogle3DTiles(viewer?.scene?.primitives, 'bus-start', {
        maxMs: 2400,
      });
      governorRequestRender('bus-start');
    }

    return activeFleet;
  }

  function stopBusFleet() {
    releaseContinuousRender('synthetic-bus');

    if (typeof removePreRenderListener === 'function') {
      removePreRenderListener();
      removePreRenderListener = null;
    }

    if (viewer?.entities?.remove) {
      for (const bus of activeFleet) {
        if (bus.entity) {
          viewer.entities.remove(bus.entity);
        }
      }
    }

    clearRouteOverlay(routeOverlay, viewer);

    activeFleet = [];
    activeCityId = null;
    activeRouteId = null;
    activeBus = null;
  }

  function onPreRender() {
    const now = Date.now();
    const dt = Math.max(0.001, Math.min(0.1, (now - lastTickTime) / 1000));
    lastTickTime = now;

    if (activeFleet.length === 0) return;

    for (const bus of activeFleet) {
      updateBusPhysics(bus, dt);
    }

    // Update active follow camera when enabled
    if (
      isCameraEnabled &&
      activeBus &&
      viewer?.camera &&
      cameraMode !== 'overview' &&
      cameraMode !== 'free'
    ) {
      applyBusCameraFollow(activeBus, cameraMode);
    }
  }

  function updateBusPhysics(bus, dt) {
    const route = bus.route;

    // 1. Step distance along route trajectory
    bus.distMeters =
      (bus.distMeters + bus.speedMs * dt) % bus.trajectory.totalDistance;
    const sampled = sampleBusTrajectory(bus.trajectory, bus.distMeters);

    // 2. Dynamic terrain height clamping (prevents underground clipping)
    let finalPos = Cesium.Cartesian3.clone(
      sampled.pos,
      new Cesium.Cartesian3(),
    );
    const carto = Cesium.Cartographic.fromCartesian(
      sampled.pos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    const is3D = viewer?.scene?.globe?.show === false;
    const baselineH = carto.height;
    const groundH =
      !is3D && viewer?.scene?.globe?.getHeight
        ? viewer.scene.globe.getHeight(carto)
        : null;
    let effectiveH = Number.isFinite(groundH)
      ? groundH
      : sampled.pos
        ? baselineH
        : 0;

    // Reject 3D building/canopy rooftop spikes in BOTH 3D tiles mode and 2D globe mode
    // by comparing against bare terrain (2D) or smooth arterial waypoint grade (3D).
    // Throttled to ~180ms per bus to avoid per-frame depth raycast stalls.
    const refH = Number.isFinite(groundH) ? groundH : baselineH;
    const nowMs = Date.now();
    if (
      !is3D &&
      viewer?.scene?.sampleHeightSupported &&
      viewer?.scene?.sampleHeight
    ) {
      if (!bus._lastSampleAt || nowMs - bus._lastSampleAt >= 180) {
        bus._lastSampleAt = nowMs;
        try {
          const excludeList = bus.entity ? [bus.entity] : [];
          const sampleH =
            excludeList.length > 0
              ? viewer.scene.sampleHeight(carto, excludeList)
              : viewer.scene.sampleHeight(carto);
          if (
            Number.isFinite(sampleH) &&
            (!Number.isFinite(refH) || Math.abs(sampleH - refH) < 6.0)
          ) {
            bus._sampledStreetH = sampleH;
          }
        } catch {
          /* fallback to refH */
        }
      }
      if (
        Number.isFinite(bus._sampledStreetH) &&
        (!Number.isFinite(refH) || Math.abs(bus._sampledStreetH - refH) < 6.0)
      ) {
        effectiveH = bus._sampledStreetH;
      }
    }

    if (Number.isFinite(effectiveH)) {
      carto.height = effectiveH + BUS_DIMENSIONS.height / 2 + 0.35;
      if (bus.isKneeling) carto.height -= BUS_KNEEL_OFFSET_M;
      Cesium.Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        carto.height,
        Cesium.Ellipsoid.WGS84,
        finalPos,
      );
    } else if (bus.isKneeling) {
      const norm = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        finalPos,
        new Cesium.Cartesian3(),
      );
      finalPos = Cesium.Cartesian3.subtract(
        finalPos,
        Cesium.Cartesian3.multiplyByScalar(
          norm,
          BUS_KNEEL_OFFSET_M,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    }

    bus.currentPos = finalPos;
    bus.currentForward = sampled.forward;

    // 3. Sequential Target Stop Progression (solves infinite dwell & skip bug)
    const stops = route.stops || [];
    if (stops.length > 0) {
      if (
        bus.targetStopIndex === undefined ||
        bus.targetStopIndex < 0 ||
        bus.targetStopIndex >= stops.length
      ) {
        bus.targetStopIndex = 0;
      }
      const targetStop = stops[bus.targetStopIndex];
      const targetStopCart = Cesium.Cartesian3.fromDegrees(
        targetStop.lon,
        targetStop.lat,
        (targetStop.elev || 0) + 1.6,
      );
      const targetStopDist = Cesium.Cartesian3.distance(
        bus.currentPos,
        targetStopCart,
      );

      bus.nextStop = targetStop;
      bus.nextStopDistMeters = Math.round(targetStopDist);

      // Kinematic Lookahead Braking Gate: v^2 / (2 * a) + safety buffer
      const brakeDistNeeded =
        (bus.speedMs * bus.speedMs) / (2 * BUS_BRAKE_ACCEL_MS2);
      const approachGate = Math.max(50.0, brakeDistNeeded + 8.0);

      // State Machine
      if (bus.state === 'CRUISING') {
        bus.doorsOpen = false;
        bus.isKneeling = false;

        // Approaching stop deceleration gate
        if (targetStopDist <= approachGate) {
          bus.state = 'APPROACHING_STOP';
          bus._prevTargetStopDist = targetStopDist;
        } else if (bus.speedMs < bus.targetSpeedMs) {
          bus.speedMs = Math.min(
            bus.targetSpeedMs,
            bus.speedMs + BUS_ACCEL_MS2 * dt,
          );
        }
      } else if (bus.state === 'APPROACHING_STOP') {
        // Smooth deceleration to halt
        bus.speedMs = Math.max(0, bus.speedMs - BUS_BRAKE_ACCEL_MS2 * dt);

        // Arrival detection:
        // 1. Within 8 meters, OR
        // 2. Speed dropped below 0.3 m/s, OR
        // 3. Closest approach reached (distance started increasing) while within 22m
        const isPassing =
          targetStopDist > (bus._prevTargetStopDist || targetStopDist) &&
          targetStopDist <= 22.0;

        if (targetStopDist <= 8.0 || bus.speedMs <= 0.3 || isPassing) {
          bus.speedMs = 0;
          bus.state = 'DWELL';
          bus.dwellTimerSec = BUS_DWELL_TIME_SEC;
          bus.isKneeling = true;
          bus.doorsOpen = true;

          // Exchange passengers via passengerFlow
          if (
            passengerFlow &&
            typeof passengerFlow.exchangePassengers === 'function'
          ) {
            const delta = passengerFlow.exchangePassengers(bus, targetStop);
            bus.passengers = Math.max(
              0,
              Math.min(bus.capacity, bus.passengers + delta),
            );
          } else {
            // Autonomous fallback boarding
            const boarded = Math.floor(Math.random() * 6) + 1;
            const alighted = Math.floor(Math.random() * 4);
            bus.passengers = Math.max(
              0,
              Math.min(bus.capacity, bus.passengers + boarded - alighted),
            );
          }
        }
        bus._prevTargetStopDist = targetStopDist;
      } else if (bus.state === 'DWELL') {
        bus.speedMs = 0;
        bus.dwellTimerSec -= dt;
        if (bus.dwellTimerSec <= 0) {
          bus.doorsOpen = false;
          bus.isKneeling = false;
          bus.state = 'DEPARTING';
          // Advance to the next sequential stop along the route
          bus.targetStopIndex = (bus.targetStopIndex + 1) % stops.length;
          bus._prevTargetStopDist = 999999;
          bus.departTimerSec = 4.0;
        }
      } else if (bus.state === 'DEPARTING') {
        bus.doorsOpen = false;
        bus.isKneeling = false;
        bus.speedMs = Math.min(
          bus.targetSpeedMs,
          bus.speedMs + BUS_ACCEL_MS2 * dt,
        );
        bus.departTimerSec = (bus.departTimerSec || 4.0) - dt;
        if (bus.departTimerSec <= 0 || targetStopDist > 30) {
          bus.state = 'CRUISING';
          bus._prevTargetStopDist = targetStopDist;
        }
      }
    }

    // Update entity in 3D scene
    if (bus.entity) {
      // Update orientation
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        finalPos,
        new Cesium.Cartesian3(),
      );
      const right = Cesium.Cartesian3.cross(
        sampled.forward,
        normal,
        new Cesium.Cartesian3(),
      );
      let liveQuat = undefined;
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
        liveQuat = Cesium.Quaternion.fromRotationMatrix(
          rotMat,
          new Cesium.Quaternion(),
        );
      }
      bus.pose?.set(finalPos, liveQuat);

      // Highlight active latched bus & ensure reticle visibility.
      // Graphics props are written ONLY when the style changes: assigning a box
      // property every frame raises definitionChanged and forces a geometry rebuild.
      const isLatched = activeBus && activeBus.id === bus.id;
      const isOverview =
        cameraMode === 'overview' || cameraMode === 'elevated_overview';
      const isCab =
        !isOverview && isCameraEnabled && isLatched && cameraMode === 'cab';
      const styleKey = `${isLatched ? 1 : 0}|${isCab ? 1 : 0}|${isOverview ? 1 : 0}`;
      if (bus._styleKey !== styleKey) {
        bus._styleKey = styleKey;
        if (bus.entity.box) {
          bus.entity.box.show = !isCab;
          bus.entity.box.outlineWidth = isLatched ? 3.5 : 2.0;
          bus.entity.box.outlineColor = isLatched
            ? Cesium.Color.WHITE
            : Cesium.Color.fromCssColorString(
                bus.route.accentColor || '#38bdf8',
              );
        }
        if (bus.entity.point) {
          bus.entity.point.show = !isCab;
          bus.entity.point.pixelSize = isLatched ? 15 : isOverview ? 12 : 10;
          bus.entity.point.outlineWidth = isLatched ? 3.0 : 2.0;
          bus.entity.point.outlineColor = isLatched
            ? Cesium.Color.WHITE
            : Cesium.Color.fromCssColorString('#f8fafc');
          bus.entity.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        }
      }
    }
  }

  function applyBusCameraFollow(bus, mode) {
    if (!viewer?.camera || !bus?.currentPos) return;

    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      bus.currentPos,
      new Cesium.Cartesian3(),
    );
    const forward = bus.currentForward;
    const right = Cesium.Cartesian3.cross(
      forward,
      normal,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(right, right);

    let eye = new Cesium.Cartesian3();
    let target = bus.currentPos;

    if (mode === 'cab') {
      // Driver's seat: inside windshield on left/curbside
      const fwdOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        BUS_DIMENSIONS.length * 0.42,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        2.2,
        new Cesium.Cartesian3(),
      );
      const sideOffset = Cesium.Cartesian3.multiplyByScalar(
        right,
        -0.65,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(bus.currentPos, fwdOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      eye = Cesium.Cartesian3.add(eye, sideOffset, eye);

      target = Cesium.Cartesian3.add(
        eye,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          25.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    } else if (mode === 'door') {
      // Watching passenger front door entrance from curb
      const fwdOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        BUS_DIMENSIONS.length * 0.35,
        new Cesium.Cartesian3(),
      );
      const sideOffset = Cesium.Cartesian3.multiplyByScalar(
        right,
        5.0,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        2.0,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(bus.currentPos, fwdOffset, eye);
      eye = Cesium.Cartesian3.add(eye, sideOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = bus.currentPos;
    } else if (mode === 'heli' || mode === 'copter') {
      // News helicopter / drone overhead tracking camera: +65m overhead, -52m trailing
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        -52.0,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        65.0,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(bus.currentPos, backOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = Cesium.Cartesian3.add(
        bus.currentPos,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          8.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    } else if (mode === 'overview') {
      // High-altitude macro city overview vantage
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        2500.0,
        new Cesium.Cartesian3(),
      );
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        -1600.0,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(bus.currentPos, upOffset, eye);
      eye = Cesium.Cartesian3.add(eye, backOffset, eye);
      target = bus.currentPos;
    } else {
      // 'chase' view (default): raised urban chase clearing street clutter & low structures
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        -32.0,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        22.0,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(bus.currentPos, backOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = Cesium.Cartesian3.add(
        bus.currentPos,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          6.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    }

    // Anti-Subterranean Protection anchored to corridor/globe floor (NOT 3D building rooftops)
    const eyeCarto = Cesium.Cartographic.fromCartesian(
      eye,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    const busCarto = Cesium.Cartographic.fromCartesian(
      bus.currentPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (eyeCarto && busCarto) {
      const is3D = viewer?.scene?.globe?.show === false;
      let floorH = busCarto.height - BUS_DIMENSIONS.height * 0.5;
      if (!is3D && viewer?.scene?.globe?.getHeight) {
        const gh = viewer.scene.globe.getHeight(eyeCarto);
        if (Number.isFinite(gh)) floorH = Math.max(floorH, gh);
      }
      const minBuf = mode === 'cab' || mode === 'door' ? 1.5 : 3.5;
      if (eyeCarto.height < floorH + minBuf) {
        eyeCarto.height = floorH + minBuf;
        Cesium.Cartesian3.fromRadians(
          eyeCarto.longitude,
          eyeCarto.latitude,
          eyeCarto.height,
          Cesium.Ellipsoid.WGS84,
          eye,
        );
      }
    }

    if (typeof viewer.camera.setView === 'function') {
      viewer.camera.setView({
        destination: eye,
        orientation: {
          direction: Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(target, eye, new Cesium.Cartesian3()),
            new Cesium.Cartesian3(),
          ),
          up: normal,
        },
      });
    }
  }

  function normalizeBusCameraMode(mode) {
    if (mode === 'lead_cab' || mode === 'cab') return 'cab';
    if (mode === 'passenger_window' || mode === 'door') return 'door';
    if (mode === 'copter' || mode === 'heli') return 'heli';
    if (mode === 'elevated_overview' || mode === 'overview') return 'overview';
    if (mode === 'free') return 'free';
    return 'chase';
  }

  function setActiveBus(busId) {
    const found = activeFleet.find((b) => b.id === busId);
    if (found) {
      activeBus = found;
      return true;
    }
    return false;
  }

  function showTransitMap() {
    cameraMode = 'overview';
    isCameraEnabled = false;
    cameraAuthority.beginAtomicCameraSwitch({
      mode: 'overview',
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: 'bus-overview',
      butterMaxMs: 2400,
    });
    if (!viewer?.camera) return;

    const contactPositions = [];
    for (const bus of activeFleet) {
      bus._styleKey = null;
      const isLatched = activeBus && activeBus.id === bus.id;
      if (bus.entity?.box) bus.entity.box.show = true;
      if (bus.entity?.point) {
        bus.entity.point.show = true;
        bus.entity.point.pixelSize = isLatched ? 15 : 12;
        bus.entity.point.outlineColor = isLatched
          ? Cesium.Color.WHITE
          : Cesium.Color.fromCssColorString('#f8fafc');
        bus.entity.point.outlineWidth = isLatched ? 3.0 : 2.0;
      }
      if (bus.currentPos) contactPositions.push(bus.currentPos);
    }

    const route = activeRouteId ? MUNICIPAL_BUS_ROUTES[activeRouteId] : null;
    const firstWp = route?.waypoints?.[0] || {
      lat: 33.7892,
      lon: -84.3872,
      elev: 308,
    };
    flyCameraToTransitNetwork(viewer, {
      overlayPoints: routeOverlay.points,
      contactPositions,
      fallbackCenter: firstWp,
    });
    governorRequestRender('bus-overview');
  }

  function snapBack(mode = 'chase') {
    const normalized = normalizeBusCameraMode(mode);
    cameraMode = normalized;
    isCameraEnabled = true;
    cameraAuthority.beginAtomicCameraSwitch({
      mode: normalized,
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: `bus-snap-${normalized}`,
      butterMaxMs: 2200,
    });
    if (!activeBus || !viewer?.camera) return cameraMode;
    for (const b of activeFleet) b._styleKey = null;
    applyBusCameraFollow(activeBus, cameraMode);
    governorRequestRender('bus-snap');
    return cameraMode;
  }

  function setCameraMode(mode) {
    const normalized = normalizeBusCameraMode(mode);
    cameraMode = normalized;
    for (const b of activeFleet) b._styleKey = null;
    if (normalized === 'overview') {
      showTransitMap();
    } else if (normalized === 'free') {
      isCameraEnabled = false;
      cameraAuthority.beginAtomicCameraSwitch({
        mode: 'free',
        clearTrackedEntity: true,
        resetLookAt: true,
        butter: true,
        butterReason: 'bus-free',
        butterMaxMs: 2000,
      });
      governorRequestRender('bus-free');
    } else {
      isCameraEnabled = true;
      cameraAuthority.beginAtomicCameraSwitch({
        mode: normalized,
        clearTrackedEntity: true,
        resetLookAt: true,
        butter: true,
        butterReason: `bus-cam-${normalized}`,
        butterMaxMs: 2200,
      });
      if (activeBus) applyBusCameraFollow(activeBus, normalized);
      governorRequestRender('bus-camera');
    }
    return cameraMode;
  }

  function setCameraEnabled(enabled) {
    isCameraEnabled = Boolean(enabled);
    for (const b of activeFleet) b._styleKey = null;
  }

  function getActiveTelemetry() {
    if (!activeBus) return null;
    const speedMph = Math.round(activeBus.speedMs * 2.23694);
    const capPct = Math.round(
      (activeBus.passengers / activeBus.capacity) * 100,
    );

    return {
      simType: 'transit',
      mode: 'BUS',
      routeId: activeBus.route.id,
      routeName: activeBus.route.name,
      operator: activeBus.route.operator,
      vehicleId: activeBus.id,
      speedMph,
      speedKmh: Math.round(activeBus.speedMs * 3.6),
      state: activeBus.state,
      isKneeling: activeBus.isKneeling,
      doorsOpen: activeBus.doorsOpen,
      passengers: activeBus.passengers,
      capacity: activeBus.capacity,
      occupancyPct: capPct,
      nextStop: activeBus.nextStop?.name || 'In Transit',
      nextStopDistMeters: activeBus.nextStopDistMeters,
      onTimeSec: activeBus.onTimeSec,
      totalFleetSize: activeFleet.length,
      isCameraEnabled,
    };
  }

  return {
    startBusFleet,
    stopBusFleet,
    getFleet: () => activeFleet,
    getActiveBus: () => activeBus,
    setActiveBus,
    setCameraMode,
    getCameraMode: () => cameraMode,
    onCameraModeChange: (cb) => {
      if (typeof cb === 'function') {
        cameraModeListeners.add(cb);
        return () => cameraModeListeners.delete(cb);
      }
      return () => {};
    },
    getCameraIntentSeq: () => cameraAuthority.getSeq(),
    showTransitMap,
    snapBack,
    setCameraEnabled,
    isCameraEnabled: () => isCameraEnabled,
    setRouteLinesVisible: (visible) => {
      routeLinesVisible = Boolean(visible);
      setRouteOverlayVisible(routeOverlay, routeLinesVisible);
      governorRequestRender('bus-lines-toggle');
    },
    isRouteLinesVisible: () => routeLinesVisible,
    getActiveTelemetry,
    isSimActive: () => activeFleet.length > 0,
    getActiveCity: () => activeCityId,
    getActiveRoute: () =>
      activeRouteId ? MUNICIPAL_BUS_ROUTES[activeRouteId] : null,
    destroy: stopBusFleet,
  };
}
