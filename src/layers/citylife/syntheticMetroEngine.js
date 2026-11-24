/**
 * Urban Heavy Rail & Rapid Transit Engine for Living City Simulator.
 * (Public Transit & Transit Controller)
 *
 * Implements 60fps synthetic multi-car articulated trainsets across iconic world rapid transit networks:
 * - Chicago CTA The Loop Elevated (Brown/Purple/Pink lines circling at +5.5m above street level)
 * - Tokyo Yamanote Heavy Rail Loop (Shibuya, Shinjuku, Akihabara, Tokyo Station)
 * - Atlanta MARTA Red/Gold Trunk (Five Points, Midtown, Arts Center, Lindbergh)
 * - New York Subway (Queensboro elevated viaduct & Grand Central approach)
 * - London Underground (Circle & District lines)
 *
 * Features:
 * - Multi-car articulated physics with individual bogie tangents along track splines
 * - Elevated viaduct and tunnel portal altitude clamping
 * - Highlighted dotted wireframe bounding reticles with glowing rail liveries
 * - Station platform dwell timing, door speed interlocks, and passengerFlow integration
 * - First-person Motorman Cab, Chase, In-Car Window, and Elevated Overview camera choreographies
 */

import * as Cesium from 'cesium';
import {
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
  getCityMetroRoutes,
  METRO_ELEVATED_HEIGHT_M,
} from './metroNetworkCatalog.js';
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
  createSafeColorMaterial,
  setRouteOverlayVisible,
} from './transitNetworkOverlay.js';

export {
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
  getCityMetroRoutes,
  METRO_ELEVATED_HEIGHT_M,
};

export const METRO_CRUISE_SPEED_MIN_MS = 15.0; // ~34 mph
export const METRO_CRUISE_SPEED_MAX_MS = 24.5; // ~55 mph
export const METRO_BRAKE_ACCEL_MS2 = 1.2;
export const METRO_ACCEL_MS2 = 1.0;
export const METRO_STATION_DWELL_SEC = 20.0;

export const METRO_CAR_DIMENSIONS = {
  length: 19.5,
  width: 3.0,
  height: 3.8,
  couplerGap: 0.9,
};

export const MONORAIL_MODEL_URI = '/models/fleet/transit/monorail.glb';
export const MONORAIL_MODEL_LENGTH_M = 55.5;
export const STEAM_TRAIN_MODEL_URI = '/models/fleet/transit/regional_dmu.glb';
export const STEAM_TRAIN_MODEL_LENGTH_M = 49.5;
export const MONORAIL_MODEL_HEADING_OFFSET_DEG = 180;

export function isFleetGlbVehicleMode(vehicleMode) {
  return vehicleMode === 'monorail' || vehicleMode === 'steam_rail';
}

export function resolveFleetTransitModelSpec(vehicleMode) {
  if (vehicleMode === 'monorail') {
    return {
      uri: MONORAIL_MODEL_URI,
      lengthMeters: MONORAIL_MODEL_LENGTH_M,
      colorBlendAmount: 0.28,
      label: 'Monorail',
    };
  }
  if (vehicleMode === 'steam_rail') {
    return {
      uri: STEAM_TRAIN_MODEL_URI,
      lengthMeters: STEAM_TRAIN_MODEL_LENGTH_M,
      colorBlendAmount: 0.35,
      label: 'Steam Train',
    };
  }
  return null;
}

/**
 * Computes the ENU compass course in degrees [0, 360) (0 = North, 90 = East)
 * for a world-space forward tangent vector at `pos`.
 */
export function computeForwardCourseDeg(pos, forward) {
  if (!pos || !forward) return 0;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
    pos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Matrix4(),
  );
  const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const localFwd = Cesium.Matrix4.multiplyByPointAsVector(
    invEnu,
    forward,
    new Cesium.Cartesian3(),
  );
  if (Math.hypot(localFwd.x, localFwd.y) < 1e-6) return 0;
  return ((Math.atan2(localFwd.x, localFwd.y) * 180) / Math.PI + 360) % 360;
}

/**
 * Computes the world-space orientation quaternion for a Cesium Entity displaying
 * a procedural fleet glTF model (built glTF Y-up, nose toward local -X) so that:
 *   - glTF(-1, 0, 0) [nose] aligns exactly with the track `forward` vector (dot = +1)
 *   - glTF(0, 1, 0)  [up]   aligns with WGS84 surface normal (geodetic up)
 *
 * Because Cesium applies `ModelUtility.getAxisCorrectionMatrix(Axis.Y, Axis.Z)`
 * to glTF models (mapping glTF -X -> entity -Y), adding `MONORAIL_MODEL_HEADING_OFFSET_DEG`
 * (`+180 deg`) to the ENU compass course flips entity -Y onto the travel heading.
 */
export function computeFleetGlbOrientationQuat(pos, forward) {
  if (!pos || !forward) return undefined;
  const courseDeg = computeForwardCourseDeg(pos, forward);
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(courseDeg + MONORAIL_MODEL_HEADING_OFFSET_DEG),
    0,
    0,
  );
  return Cesium.Transforms.headingPitchRollQuaternion(
    pos,
    hpr,
    Cesium.Ellipsoid.WGS84,
    undefined,
    new Cesium.Quaternion(),
  );
}

/**
 * Builds dense trajectory Cartesian3 points from waypoints with elevated viaduct offset.
 * Applies smooth curvature densification for sparse station coordinates.
 */
export function buildMetroTrajectory(waypoints, elevOffset = 0) {
  if (!waypoints || waypoints.length < 2) return null;

  const smoothed =
    waypoints.length <= 15 ? smoothRoadCurvature(waypoints, 15.0) : waypoints;
  const points = smoothed.map((wp) =>
    Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, (wp.elev || 0) + elevOffset),
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
 * Samples metro trajectory at scalar distance.
 */
export function sampleMetroTrajectory(trajectory, distMeters) {
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
 * Creates the Urban Heavy Rail & Rapid Transit Engine.
 */
export function createSyntheticMetroEngine({
  viewer = null,
  passengerFlow = null,
} = {}) {
  let activeTrains = [];
  let activeCityId = null;
  let activeRouteId = null;
  let activeTrain = null;
  let cameraMode = 'chase'; // 'lead_cab', 'chase', 'passenger_window', 'elevated_overview', 'overview', 'free'
  let isCameraEnabled = true;
  let removePreRenderListener = null;
  let centipedeCollection = null;
  const routeOverlay = createRouteOverlayState();
  let routeLinesVisible = true;
  let screenHandler = null;
  let onTrainSelectedCallback = null;
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
    engineId: 'synthetic-metro',
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

  function computeFlatRotationQuat(pos, forward) {
    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      pos,
      new Cesium.Cartesian3(),
    );
    const right = Cesium.Cartesian3.cross(
      forward,
      normal,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(right) <= 1e-6) return undefined;
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
    return Cesium.Quaternion.fromRotationMatrix(
      rotMat,
      new Cesium.Quaternion(),
    );
  }

  function updateJunctureRibs(train, midPos, forward, visible) {
    if (!train.junctureLines || train.junctureLines.length === 0) return;
    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      midPos,
      new Cesium.Cartesian3(),
    );
    const right = Cesium.Cartesian3.cross(
      forward,
      normal,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(right) <= 1e-6) return;
    Cesium.Cartesian3.normalize(right, right);
    const carPitch =
      METRO_CAR_DIMENSIONS.length + METRO_CAR_DIMENSIONS.couplerGap;
    const halfSpan = train.consistLength * 0.5;
    const halfWidth = METRO_CAR_DIMENSIONS.width * 0.55;
    const halfHeight = METRO_CAR_DIMENSIONS.height * 0.5 + 0.14;

    for (let j = 0; j < train.junctureLines.length; j++) {
      const rib = train.junctureLines[j];
      rib.show = visible;
      if (!visible) continue;
      const offsetAlong =
        halfSpan -
        (j + 1) * METRO_CAR_DIMENSIONS.length -
        (j + 0.5) * METRO_CAR_DIMENSIONS.couplerGap;
      const cx = midPos.x + forward.x * offsetAlong;
      const cy = midPos.y + forward.y * offsetAlong;
      const cz = midPos.z + forward.z * offsetAlong;
      const topZOff = normal.z * halfHeight;
      const topXOff = normal.x * halfHeight;
      const topYOff = normal.y * halfHeight;
      rib.positions = [
        new Cesium.Cartesian3(
          cx - right.x * halfWidth,
          cy - right.y * halfWidth,
          cz - right.z * halfWidth,
        ),
        new Cesium.Cartesian3(
          cx - right.x * halfWidth + topXOff,
          cy - right.y * halfWidth + topYOff,
          cz - right.z * halfWidth + topZOff,
        ),
        new Cesium.Cartesian3(
          cx + right.x * halfWidth + topXOff,
          cy + right.y * halfWidth + topYOff,
          cz + right.z * halfWidth + topZOff,
        ),
        new Cesium.Cartesian3(
          cx + right.x * halfWidth,
          cy + right.y * halfWidth,
          cz + right.z * halfWidth,
        ),
      ];
    }
    void carPitch;
  }

  function startMetroSystem(cityId = 'chicago', options = {}) {
    stopMetroSystem();

    activeCityId = cityId;
    routeOverlay.visible = routeLinesVisible;

    // Get all routes for this city from METRO_NETWORKS_BY_CITY, or fallback to single route matching cityId
    let routeKeys = options.lineId
      ? [options.lineId]
      : METRO_NETWORKS_BY_CITY[cityId] || [];

    if (routeKeys.length === 0) {
      const fallbackKey =
        Object.keys(RAPID_TRANSIT_ROUTES).find(
          (k) => RAPID_TRANSIT_ROUTES[k].cityId === cityId,
        ) || 'chicago_cta_loop';
      routeKeys = [fallbackKey];
    }

    activeRouteId = routeKeys[0];
    const maxTotalTrains =
      options.trainCount !== undefined ? options.trainCount : null;
    const trainsPerLine =
      options.trainsPerLine ||
      (maxTotalTrains !== null
        ? Math.max(1, Math.ceil(maxTotalTrains / routeKeys.length))
        : 2);

    for (const routeKey of routeKeys) {
      if (maxTotalTrains !== null && activeTrains.length >= maxTotalTrains) {
        break;
      }
      const route = RAPID_TRANSIT_ROUTES[routeKey];
      if (!route) continue;

      const trajectory = buildMetroTrajectory(
        route.waypoints,
        route.elevOffsetMeters,
      );
      if (!trajectory) continue;

      appendRouteOverlay(routeOverlay, viewer, {
        positions: trajectory,
        stops: route.stations,
        liveryColor: route.liveryColor,
        elevOffsetMeters: route.elevOffsetMeters || 0,
      });

      // Register stations with passenger flow
      if (passengerFlow && typeof passengerFlow.registerStops === 'function') {
        passengerFlow.registerStops(route.stations, {
          mode: 'metro',
          routeId: route.id,
        });
      }

      // Stagger trainsets along this line's track
      const spacingMeters = trajectory.totalDistance / trainsPerLine;
      for (let t = 0; t < trainsPerLine; t++) {
        if (maxTotalTrains !== null && activeTrains.length >= maxTotalTrains) {
          break;
        }
        const isReverse = t % 2 === 1;
        const dirTag = isReverse ? 'IN' : 'OUT';
        const lineCode = route.id
          .replace(
            /^(atlanta_|la_metro_|bart_|wmata_|nec_|chicago_|new_york_|london_|tokyo_|wdw_monorail_|dlr_monorail_|wdw_mk_railroad_|dlr_railroad_)/,
            '',
          )
          .toUpperCase();
        const trainId = `${route.operator}-${lineCode}-${dirTag}-${t + 1}`;
        const leadDist = (t * spacingMeters) % trajectory.totalDistance;
        const isMonorail = route.vehicleMode === 'monorail';
        const isSteamRail = route.vehicleMode === 'steam_rail';
        const fleetModelSpec = resolveFleetTransitModelSpec(route.vehicleMode);
        const usesFleetGlb = Boolean(fleetModelSpec);

        // Spawn ONE unified consist entity per train:
        // - Monorail and park steam-rail routes use procedural fleet glTF models
        //   (`monorail.glb` / `regional_dmu.glb`) oriented via `computeFleetGlbOrientationQuat`
        //   so their glTF -X nose tracks the track tangent (dot = +1.0) with zero sideways yaw.
        // - Standard urban metros use the batched multi-car box consist + juncture ribs.
        const carCount = Math.max(1, route.carsPerTrain || 6);
        const carPitch =
          METRO_CAR_DIMENSIONS.length + METRO_CAR_DIMENSIONS.couplerGap;
        const consistLength = usesFleetGlb
          ? fleetModelSpec.lengthMeters
          : carCount * METRO_CAR_DIMENSIONS.length +
            Math.max(0, carCount - 1) * METRO_CAR_DIMENSIONS.couplerGap;
        const midOffset = usesFleetGlb
          ? fleetModelSpec.lengthMeters * 0.5
          : (consistLength - METRO_CAR_DIMENSIONS.length) * 0.5;
        const midDist =
          (leadDist - midOffset + trajectory.totalDistance * 10) %
          trajectory.totalDistance;
        const midSample = sampleMetroTrajectory(trajectory, midDist);
        const initQuat = usesFleetGlb
          ? computeFleetGlbOrientationQuat(midSample.pos, midSample.forward)
          : computeFlatRotationQuat(midSample.pos, midSample.forward);
        const pose = createLivePose(midSample.pos, initQuat);

        let entity = null;
        if (viewer?.entities?.add) {
          entity = viewer.entities.add({
            name: usesFleetGlb
              ? `${trainId} ${fleetModelSpec.label}`
              : `${trainId} Consist (${carCount} cars)`,
            position: pose.position,
            orientation: pose.orientation,
            ...(usesFleetGlb
              ? {
                  model: {
                    uri: fleetModelSpec.uri,
                    scale: 1.0,
                    minimumPixelSize: 48,
                    color: Cesium.Color.fromCssColorString(
                      route.liveryColor || '#f59e0b',
                    ),
                    colorBlendMode: Cesium.ColorBlendMode.MIX,
                    colorBlendAmount: fleetModelSpec.colorBlendAmount,
                    show: true,
                  },
                }
              : {
                  box: {
                    dimensions: new Cesium.Cartesian3(
                      METRO_CAR_DIMENSIONS.width,
                      consistLength,
                      METRO_CAR_DIMENSIONS.height,
                    ),
                    material: Cesium.Color.fromCssColorString(
                      route.liveryColor,
                    ).withAlpha(0.72),
                    outline: true,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 3.0,
                  },
                }),
            point: {
              show: true,
              pixelSize: 13,
              color: Cesium.Color.fromCssColorString(route.liveryColor),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2.5,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                250.0,
                Number.POSITIVE_INFINITY,
              ),
            },
            properties: {
              isSyntheticMetro: true,
              isMonorail,
              isSteamRail,
              vehicleMode: route.vehicleMode || 'metro',
              trainId,
              carIndex: 0,
              isLeadCar: true,
              carsCount: carCount,
            },
          });
        }

        const junctureLines = [];
        const junctureCount = usesFleetGlb ? 0 : Math.max(0, carCount - 1);
        if (
          junctureCount > 0 &&
          viewer?.scene?.primitives?.add &&
          typeof Cesium.PolylineCollection === 'function'
        ) {
          try {
            if (!centipedeCollection) {
              centipedeCollection = new Cesium.PolylineCollection();
              viewer.scene.primitives.add(centipedeCollection);
            }
            const ribMat = createSafeColorMaterial(
              Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.95),
            );
            for (let j = 0; j < junctureCount; j++) {
              const poly = centipedeCollection.add({
                positions: [midSample.pos, midSample.pos],
                width: 3.5,
                ...(ribMat ? { material: ribMat } : {}),
                show: true,
              });
              junctureLines.push(poly);
            }
          } catch {
            /* headless / non-DOM environments skip Cesium Material initialization */
          }
        }

        const leadPos = Cesium.Cartesian3.add(
          midSample.pos,
          Cesium.Cartesian3.multiplyByScalar(
            midSample.forward,
            midOffset,
            new Cesium.Cartesian3(),
          ),
          new Cesium.Cartesian3(),
        );

        const carEntities = entity ? [entity] : [];
        const cars = [
          {
            index: 0,
            entity,
            pose,
            _styleKey: null,
            distMeters: leadDist,
            currentPos: leadPos,
            midPos: midSample.pos,
            currentForward: midSample.forward,
          },
        ];

        // Initialize sequential target station along route
        let initStnIdx = 0;
        if (route.stations && route.stations.length > 0) {
          initStnIdx = (t + 1) % route.stations.length;
        }

        const totalCap = route.carsPerTrain * route.capacityPerCar;
        const trainRecord = {
          id: trainId,
          index: t,
          route,
          trajectory,
          cars,
          carEntities,
          consistEntity: entity,
          consistLength,
          carsCount: carCount,
          junctureCount,
          junctureLines,
          leadDistMeters: leadDist,
          speedMs: isSteamRail ? 6.8 : METRO_CRUISE_SPEED_MIN_MS + 2.0,
          targetSpeedMs: isSteamRail ? 7.6 : METRO_CRUISE_SPEED_MIN_MS + 4.0,
          state: 'CRUISING', // 'CRUISING', 'APPROACHING_STATION', 'DWELL', 'DEPARTING'
          dwellTimerSec: 0,
          departTimerSec: 0,
          targetStationIndex: initStnIdx,
          doorsOpen: false,
          passengers: Math.floor(totalCap * (0.55 + t * 0.1)),
          capacity: totalCap,
          nextStation: route.stations[initStnIdx] || route.stations[0] || null,
          nextStationDistMeters: 600,
          onTimeSec: Math.floor((Math.random() - 0.3) * 60),
        };

        activeTrains.push(trainRecord);
      }
    }

    if (activeTrains.length > 0 && !activeTrain) {
      activeTrain = activeTrains[0];
    }

    // Register 3D globe click listener for 1-click pick-any-train follow
    if (viewer?.scene?.canvas && Cesium.ScreenSpaceEventHandler) {
      try {
        screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        screenHandler.setInputAction((click) => {
          if (!viewer?.scene) return;
          try {
            const picked = viewer.scene.pick(click.position);
            const entity = picked?.id;
            if (entity?.properties?.isSyntheticMetro) {
              const tId =
                entity.properties.trainId?.getValue?.() ||
                entity.properties.trainId;
              if (tId) {
                const found = activeTrains.find((t) => t.id === tId);
                if (found) {
                  activeTrain = found;
                  activeRouteId = found.route.id;
                  snapBack(cameraMode === 'overview' ? 'chase' : cameraMode);
                  if (typeof onTrainSelectedCallback === 'function') {
                    onTrainSelectedCallback(activeTrain);
                  }
                }
              }
            }
          } catch {}
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      } catch {}
    }

    if (viewer?.scene?.preRender?.addEventListener) {
      removePreRenderListener =
        viewer.scene.preRender.addEventListener(onPreRender);
    }

    if (activeTrains.length > 0) {
      holdContinuousRender('synthetic-metro');
      butterGoogle3DTiles(viewer?.scene?.primitives, 'metro-start', {
        maxMs: 2400,
      });
      governorRequestRender('metro-start');
    }

    return activeTrains;
  }

  function stopMetroSystem() {
    releaseContinuousRender('synthetic-metro');

    if (typeof removePreRenderListener === 'function') {
      removePreRenderListener();
      removePreRenderListener = null;
    }

    if (screenHandler && !screenHandler.isDestroyed?.()) {
      try {
        screenHandler.destroy();
      } catch {}
      screenHandler = null;
    }

    if (centipedeCollection && viewer?.scene?.primitives?.remove) {
      try {
        viewer.scene.primitives.remove(centipedeCollection);
      } catch {}
      centipedeCollection = null;
    }

    clearRouteOverlay(routeOverlay, viewer);

    if (viewer?.entities?.remove) {
      for (const train of activeTrains) {
        for (const entity of train.carEntities) {
          if (entity) viewer.entities.remove(entity);
        }
      }
    }

    activeTrains = [];
    activeCityId = null;
    activeRouteId = null;
    activeTrain = null;
  }

  function onPreRender() {
    const now = Date.now();
    const dt = Math.max(0.001, Math.min(0.1, (now - lastTickTime) / 1000));
    lastTickTime = now;

    if (activeTrains.length === 0) return;

    for (const train of activeTrains) {
      updateTrainPhysics(train, dt);
    }

    if (
      isCameraEnabled &&
      activeTrain &&
      viewer?.camera &&
      cameraMode !== 'overview' &&
      cameraMode !== 'elevated_overview' &&
      cameraMode !== 'free'
    ) {
      applyTrainCameraFollow(activeTrain, cameraMode);
    }
  }

  function updateTrainPhysics(train, dt) {
    const route = train.route;
    const fleetModelSpec = resolveFleetTransitModelSpec(route?.vehicleMode);
    const usesFleetGlb = Boolean(fleetModelSpec);
    const consistCar = train.cars[0];
    if (!consistCar) return;

    // 1. Step lead position and evaluate the unified long consist at mid-body (1x sample per train)
    train.leadDistMeters =
      (train.leadDistMeters + train.speedMs * dt) %
      train.trajectory.totalDistance;
    const consistLength =
      train.consistLength ||
      (usesFleetGlb
        ? fleetModelSpec.lengthMeters
        : Math.max(1, train.carsCount || route.carsPerTrain || 6) *
          METRO_CAR_DIMENSIONS.length);
    const midOffset = usesFleetGlb
      ? fleetModelSpec.lengthMeters * 0.5
      : Math.max(0, (consistLength - METRO_CAR_DIMENSIONS.length) * 0.5);
    const midDist =
      (train.leadDistMeters - midOffset + train.trajectory.totalDistance * 10) %
      train.trajectory.totalDistance;
    const sampled = sampleMetroTrajectory(train.trajectory, midDist);

    // Keep the train flat on corridor track grade (no 3D building rooftop climbing).
    // Note: procedural fleet GLBs (`monorail.glb`, `regional_dmu.glb`) have origin at rail top
    // (z = 0), whereas standard metro boxes are centered at mid-height (+height * 0.5).
    const verticalCenterOffset = usesFleetGlb
      ? 0.0
      : METRO_CAR_DIMENSIONS.height * 0.5 + 0.35;
    const midPos = Cesium.Cartesian3.clone(
      sampled.pos,
      new Cesium.Cartesian3(),
    );
    const is3D = viewer?.scene?.globe?.show === false;
    if (!is3D && viewer?.scene?.globe?.getHeight) {
      const carto = Cesium.Cartographic.fromCartesian(
        sampled.pos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      const groundH = carto ? viewer.scene.globe.getHeight(carto) : null;
      if (carto && Number.isFinite(groundH)) {
        carto.height =
          groundH + (route.elevOffsetMeters || 0) + verticalCenterOffset;
        Cesium.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          carto.height,
          Cesium.Ellipsoid.WGS84,
          midPos,
        );
      }
    } else if (sampled.pos && verticalCenterOffset !== 0) {
      const carto = Cesium.Cartographic.fromCartesian(
        sampled.pos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      if (carto) {
        // Trajectory already includes (wp.elev + elevOffsetMeters); add half car height clearance for boxes
        carto.height += verticalCenterOffset;
        Cesium.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          carto.height,
          Cesium.Ellipsoid.WGS84,
          midPos,
        );
      }
    }

    const leadPos = Cesium.Cartesian3.add(
      midPos,
      Cesium.Cartesian3.multiplyByScalar(
        sampled.forward,
        midOffset,
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );

    consistCar.distMeters = train.leadDistMeters;
    consistCar.midPos = midPos;
    consistCar.currentPos = leadPos;
    consistCar.currentForward = sampled.forward;

    const isLatched = activeTrain && activeTrain.id === train.id;
    const isOverview =
      cameraMode === 'overview' || cameraMode === 'elevated_overview';
    const isCab =
      !isOverview &&
      isCameraEnabled &&
      isLatched &&
      (cameraMode === 'lead_cab' ||
        cameraMode === 'cab' ||
        cameraMode === 'passenger_window' ||
        cameraMode === 'door');

    if (consistCar.entity) {
      const liveQuat = usesFleetGlb
        ? computeFleetGlbOrientationQuat(midPos, sampled.forward)
        : computeFlatRotationQuat(midPos, sampled.forward);
      consistCar.pose?.set(midPos, liveQuat);

      // Graphics props are written ONLY when the style changes: assigning a box/model
      // property every frame raises definitionChanged and forces a geometry rebuild.
      const styleKey = `${isLatched ? 1 : 0}|${isCab ? 1 : 0}|${isOverview ? 1 : 0}`;
      if (consistCar._styleKey !== styleKey) {
        consistCar._styleKey = styleKey;
        if (consistCar.entity.model) {
          consistCar.entity.model.show = !isCab;
        }
        if (consistCar.entity.box) {
          consistCar.entity.box.show = !isCab;
          consistCar.entity.box.outlineWidth = isLatched ? 3.5 : 2.5;
          consistCar.entity.box.outlineColor = isLatched
            ? Cesium.Color.WHITE
            : Cesium.Color.fromCssColorString(
                train.route.accentColor || '#f59e0b',
              );
        }
        if (consistCar.entity.point) {
          consistCar.entity.point.show = !isCab;
          consistCar.entity.point.pixelSize = isLatched
            ? 15
            : isOverview
              ? 12
              : 10;
          consistCar.entity.point.outlineColor = isLatched
            ? Cesium.Color.WHITE
            : Cesium.Color.fromCssColorString('#f8fafc');
          consistCar.entity.point.outlineWidth = isLatched ? 3.0 : 2.0;
          consistCar.entity.point.disableDepthTestDistance =
            Number.POSITIVE_INFINITY;
        }
      }
    }

    updateJunctureRibs(train, midPos, sampled.forward, !isCab);

    // 2. Sequential Target Station Progression (solves station dwell oscillation)
    const stations = route.stations || [];
    if (stations.length > 0) {
      if (
        train.targetStationIndex === undefined ||
        train.targetStationIndex < 0 ||
        train.targetStationIndex >= stations.length
      ) {
        train.targetStationIndex = 0;
      }
      const targetStn = stations[train.targetStationIndex];
      const targetStnCart = Cesium.Cartesian3.fromDegrees(
        targetStn.lon,
        targetStn.lat,
        (targetStn.elev || 0) + (route.elevOffsetMeters || 0) + 2.0,
      );
      const targetStnDist = Cesium.Cartesian3.distance(
        consistCar.currentPos,
        targetStnCart,
      );

      train.nextStation = targetStn;
      train.nextStationDistMeters = Math.round(targetStnDist);

      // State Machine
      if (train.state === 'CRUISING') {
        train.doorsOpen = false;
        if (targetStnDist <= 65) {
          train.state = 'APPROACHING_STATION';
        } else if (train.speedMs < train.targetSpeedMs) {
          train.speedMs = Math.min(
            train.targetSpeedMs,
            train.speedMs + METRO_ACCEL_MS2 * dt,
          );
        }
      } else if (train.state === 'APPROACHING_STATION') {
        train.speedMs = Math.max(0, train.speedMs - METRO_BRAKE_ACCEL_MS2 * dt);
        if (targetStnDist <= 7.0 || train.speedMs <= 0.3) {
          train.speedMs = 0;
          train.state = 'DWELL';
          train.dwellTimerSec = METRO_STATION_DWELL_SEC;
          train.doorsOpen = true;

          if (
            passengerFlow &&
            typeof passengerFlow.exchangePassengers === 'function'
          ) {
            const delta = passengerFlow.exchangePassengers(train, targetStn);
            train.passengers = Math.max(
              0,
              Math.min(train.capacity, train.passengers + delta),
            );
          } else {
            const boarded = Math.floor(Math.random() * 25) + 10;
            const alighted = Math.floor(Math.random() * 20);
            train.passengers = Math.max(
              0,
              Math.min(train.capacity, train.passengers + boarded - alighted),
            );
          }
        }
      } else if (train.state === 'DWELL') {
        train.speedMs = 0;
        train.dwellTimerSec -= dt;
        if (train.dwellTimerSec <= 0) {
          train.doorsOpen = false;
          train.state = 'DEPARTING';
          train.targetStationIndex =
            (train.targetStationIndex + 1) % stations.length;
          train.departTimerSec = 5.0;
        }
      } else if (train.state === 'DEPARTING') {
        train.doorsOpen = false;
        train.speedMs = Math.min(
          train.targetSpeedMs,
          train.speedMs + METRO_ACCEL_MS2 * dt,
        );
        train.departTimerSec = (train.departTimerSec || 5.0) - dt;
        if (train.departTimerSec <= 0 || targetStnDist > 45) {
          train.state = 'CRUISING';
        }
      }
    }
  }

  function normalizeMetroCameraMode(mode) {
    if (mode === 'cab' || mode === 'lead_cab') return 'lead_cab';
    if (mode === 'door' || mode === 'passenger_window')
      return 'passenger_window';
    if (mode === 'heli' || mode === 'copter') return 'heli';
    if (mode === 'overview' || mode === 'elevated_overview') return 'overview';
    if (mode === 'free') return 'free';
    return 'chase';
  }

  function applyTrainCameraFollow(train, mode) {
    if (!viewer?.camera || !train?.cars?.length) return;
    const leadCar = train.cars[0];
    const leadPos = leadCar.currentPos;
    const midPos = leadCar.midPos || leadPos;
    const consistLength =
      train.consistLength ||
      Math.max(1, train.carsCount || train.route?.carsPerTrain || 6) *
        METRO_CAR_DIMENSIONS.length;
    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      leadPos,
      new Cesium.Cartesian3(),
    );
    const forward = leadCar.currentForward;
    const right = Cesium.Cartesian3.cross(
      forward,
      normal,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(right, right);

    let eye = new Cesium.Cartesian3();
    let target = midPos;
    const resolvedMode = normalizeMetroCameraMode(mode);
    const isFleetGlbTrain = isFleetGlbVehicleMode(train.route?.vehicleMode);

    if (resolvedMode === 'lead_cab') {
      // First person Motorman cab window at the front nose of the consist
      const fwdOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        isFleetGlbTrain ? 2.5 : METRO_CAR_DIMENSIONS.length * 0.46,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        isFleetGlbTrain ? 2.4 : 2.6,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(leadPos, fwdOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = Cesium.Cartesian3.add(
        eye,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          45.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    } else if (resolvedMode === 'passenger_window') {
      // In-car passenger seat looking out side window along forward/right quadrant
      const windowAnchor = Cesium.Cartesian3.add(
        midPos,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          consistLength * 0.12,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        2.1,
        new Cesium.Cartesian3(),
      );
      const sideOffset = Cesium.Cartesian3.multiplyByScalar(
        right,
        1.65,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(windowAnchor, upOffset, eye);
      eye = Cesium.Cartesian3.add(eye, sideOffset, eye);
      target = Cesium.Cartesian3.add(
        eye,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(
            right,
            15.0,
            new Cesium.Cartesian3(),
          ),
          Cesium.Cartesian3.multiplyByScalar(
            forward,
            6.0,
            new Cesium.Cartesian3(),
          ),
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    } else if (resolvedMode === 'heli') {
      // Elevated city aerial helicopter camera: +85m overhead, -75m trailing
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        -75.0,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        85.0,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(midPos, backOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = Cesium.Cartesian3.add(
        midPos,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          15.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    } else {
      // 'chase' view (default): raised urban chase clearing low/mid buildings without jumps
      const distBack = isFleetGlbTrain
        ? -(consistLength * 0.5 + 34.0)
        : -(consistLength * 0.65 + 48.0);
      const heightUp = isFleetGlbTrain ? 26.0 : 42.0;
      const backOffset = Cesium.Cartesian3.multiplyByScalar(
        forward,
        distBack,
        new Cesium.Cartesian3(),
      );
      const upOffset = Cesium.Cartesian3.multiplyByScalar(
        normal,
        heightUp,
        new Cesium.Cartesian3(),
      );
      eye = Cesium.Cartesian3.add(midPos, backOffset, eye);
      eye = Cesium.Cartesian3.add(eye, upOffset, eye);
      target = Cesium.Cartesian3.add(
        midPos,
        Cesium.Cartesian3.multiplyByScalar(
          forward,
          15.0,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
    }

    // Anti-Subterranean Protection anchored to smooth corridor/globe floor (NOT 3D building roofs)
    const eyeCarto = Cesium.Cartographic.fromCartesian(
      eye,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    const trackCarto = Cesium.Cartographic.fromCartesian(
      midPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (eyeCarto && trackCarto) {
      const is3D = viewer?.scene?.globe?.show === false;
      let floorH = trackCarto.height - METRO_CAR_DIMENSIONS.height * 0.5;
      if (!is3D && viewer?.scene?.globe?.getHeight) {
        const gh = viewer.scene.globe.getHeight(eyeCarto);
        if (Number.isFinite(gh)) floorH = Math.max(floorH, gh);
      }
      const minBuf =
        resolvedMode === 'lead_cab' || resolvedMode === 'passenger_window'
          ? 1.5
          : 4.0;
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

  function setActiveTrain(trainId) {
    const found = activeTrains.find((t) => t.id === trainId);
    if (found) {
      activeTrain = found;
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
      butterReason: 'metro-overview',
      butterMaxMs: 2400,
    });
    if (!viewer?.camera) return;

    // Reveal every active train contact dot immediately (even when exiting Cab/Door mode)
    const contactPositions = [];
    for (const train of activeTrains) {
      const consistCar = train.cars[0];
      if (!consistCar) continue;
      consistCar._styleKey = null;
      const isLatched = activeTrain && activeTrain.id === train.id;
      if (consistCar.entity?.model) consistCar.entity.model.show = true;
      if (consistCar.entity?.box) consistCar.entity.box.show = true;
      if (consistCar.entity?.point) {
        consistCar.entity.point.show = true;
        consistCar.entity.point.pixelSize = isLatched ? 15 : 12;
        consistCar.entity.point.outlineColor = isLatched
          ? Cesium.Color.WHITE
          : Cesium.Color.fromCssColorString('#f8fafc');
        consistCar.entity.point.outlineWidth = isLatched ? 3.0 : 2.0;
      }
      const pos = consistCar.midPos || consistCar.currentPos;
      if (pos) contactPositions.push(pos);
    }

    const route = activeRouteId ? RAPID_TRANSIT_ROUTES[activeRouteId] : null;
    const firstWp = route?.waypoints?.[0] || {
      lat: 41.8858,
      lon: -87.6355,
      elev: 186,
    };
    flyCameraToTransitNetwork(viewer, {
      overlayPoints: routeOverlay.points,
      contactPositions,
      fallbackCenter: firstWp,
    });
    governorRequestRender('metro-overview');
  }

  function snapBack(mode = 'chase') {
    const normalized = normalizeMetroCameraMode(mode);
    cameraMode = normalized;
    isCameraEnabled = true;
    cameraAuthority.beginAtomicCameraSwitch({
      mode: normalized,
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: `metro-snap-${normalized}`,
      butterMaxMs: 2200,
    });
    if (!activeTrain || !viewer?.camera) return cameraMode;
    for (const t of activeTrains) {
      if (t.cars[0]) t.cars[0]._styleKey = null;
    }
    applyTrainCameraFollow(activeTrain, cameraMode);
    governorRequestRender('metro-snap');
    return cameraMode;
  }

  function setCameraMode(mode) {
    const normalized = normalizeMetroCameraMode(mode);
    cameraMode = normalized;
    for (const t of activeTrains) {
      if (t.cars[0]) t.cars[0]._styleKey = null;
    }
    if (normalized === 'overview') {
      showTransitMap();
    } else if (normalized === 'free') {
      isCameraEnabled = false;
      cameraAuthority.beginAtomicCameraSwitch({
        mode: 'free',
        clearTrackedEntity: true,
        resetLookAt: true,
        butter: true,
        butterReason: 'metro-free',
        butterMaxMs: 2000,
      });
      governorRequestRender('metro-free');
    } else {
      isCameraEnabled = true;
      cameraAuthority.beginAtomicCameraSwitch({
        mode: normalized,
        clearTrackedEntity: true,
        resetLookAt: true,
        butter: true,
        butterReason: `metro-cam-${normalized}`,
        butterMaxMs: 2200,
      });
      if (activeTrain) applyTrainCameraFollow(activeTrain, normalized);
      governorRequestRender('metro-camera');
    }
    return cameraMode;
  }

  function setCameraEnabled(enabled) {
    isCameraEnabled = Boolean(enabled);
    for (const t of activeTrains) {
      if (t.cars[0]) t.cars[0]._styleKey = null;
    }
  }

  function getActiveTelemetry() {
    if (!activeTrain) return null;
    const speedMph = Math.round(activeTrain.speedMs * 2.23694);
    const capPct = Math.round(
      (activeTrain.passengers / activeTrain.capacity) * 100,
    );

    return {
      simType: 'transit',
      mode: 'METRO',
      routeId: activeTrain.route.id,
      lineName: activeTrain.route.lineName,
      operator: activeTrain.route.operator,
      trainId: activeTrain.id,
      carsCount: activeTrain.route.carsPerTrain,
      speedMph,
      speedKmh: Math.round(activeTrain.speedMs * 3.6),
      state: activeTrain.state,
      doorsOpen: activeTrain.doorsOpen,
      passengers: activeTrain.passengers,
      capacity: activeTrain.capacity,
      occupancyPct: capPct,
      isElevated: activeTrain.route.isElevated,
      nextStation: activeTrain.nextStation?.name || 'In Transit',
      nextStationDistMeters: activeTrain.nextStationDistMeters,
      onTimeSec: activeTrain.onTimeSec,
      totalTrainsets: activeTrains.length,
      isCameraEnabled,
    };
  }

  return {
    startMetroSystem,
    stopMetroSystem,
    getTrains: () => activeTrains,
    getActiveTrain: () => activeTrain,
    setActiveTrain,
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
      governorRequestRender('metro-lines-toggle');
    },
    isRouteLinesVisible: () => routeLinesVisible,
    getActiveTelemetry,
    isSimActive: () => activeTrains.length > 0,
    getActiveCity: () => activeCityId,
    getActiveRoute: () =>
      activeRouteId ? RAPID_TRANSIT_ROUTES[activeRouteId] : null,
    pickTrainAtScreenPosition: (windowPosition, select = true) => {
      if (!viewer?.scene?.pick || !windowPosition) return null;
      try {
        const picked = viewer.scene.pick(windowPosition);
        const entity = picked?.id;
        const isMetro =
          entity?.properties?.isSyntheticMetro?.getValue?.() ??
          entity?.properties?.isSyntheticMetro;
        if (isMetro) {
          const tId =
            entity.properties.trainId?.getValue?.() ||
            entity.properties.trainId;
          const found = activeTrains.find((t) => t.id === tId) || null;
          if (found && select) {
            activeTrain = found;
            activeRouteId = found.route.id;
            if (typeof onTrainSelectedCallback === 'function') {
              onTrainSelectedCallback(found);
            }
          }
          return found;
        }
      } catch {}
      return null;
    },
    onTrainSelected: (cb) => {
      onTrainSelectedCallback = cb;
    },
    getNetworksByCity: () => METRO_NETWORKS_BY_CITY,
    destroy: stopMetroSystem,
  };
}
