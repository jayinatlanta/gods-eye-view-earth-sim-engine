/**
 * Core Freight Simulation & 18-Wheeler Highway Kinematics Engine for God's Eye View.
 * (Transcontinental Freight & Intermodal Logistics Sim)
 *
 * Implements:
 * - Real-world Class 8 semi-tractor & 53ft trailer articulated geometry with fifth-wheel hitch pivot
 * - Catmull-Rom road-following spline sampling via roadGeometrySnapper.js
 * - 8-Phase Air-to-Highway Transload state machine ("Plane Lands -> Off We Go!" & Intermodal Port Drayage)
 * - Dynamic grade deceleration, Jake Brake compression retarding, and highway cruising speeds (65–70 mph)
 * - Cesium 3D entity management complying with the Outlined Contact Reticle Invariant
 *   (disableDepthTestDistance: Infinity, no Cesium text labels)
 * - Integrated 5-mode freight camera suite and procedural Web Audio engine
 */

import * as Cesium from 'cesium';
import {
  FREIGHT_CORRIDORS,
  CARGO_MANIFESTS,
  FREIGHT_HUB_TYPES,
  getFreightCorridorById,
  getCargoManifestById,
  getFreightHubById,
  calculateHaversineDistanceMiles,
} from './freightCorridors.js';
import {
  smoothRoadCurvature,
  snapRouteToRoads,
} from '../../drive/roadGeometrySnapper.js';
import {
  FREIGHT_CAMERA_MODES,
  applyFreightCameraFollow,
} from './freightCameraSuite.js';
import { createProceduralFreightAudio } from './proceduralFreightAudio.js';
import { createLivePose } from '../citylife/livePose.js';
import {
  createSurfaceTracker,
  isPhotoreal3DActive,
} from '../citylife/surfaceHeight.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../../renderGovernor.js';

export const ROAD_SURFACE_ALTITUDE_METERS = 0.8;

// Physical dimensions for Class 8 Heavy Semi & 53ft Trailer
export const TRUCK_DIMENSIONS = Object.freeze({
  tractor: { width: 2.6, length: 7.2, height: 3.8 },
  trailer: { width: 2.6, length: 16.15, height: 4.1 }, // 53ft highway box
  fifthWheelOffset: -2.6, // Relative to tractor center (meters)
  trailerPivotOffset: -8.075, // Distance from hitch to trailer center (meters)
});

export const TRACTOR_CENTER_HEIGHT_OFFSET =
  TRUCK_DIMENSIONS.tractor.height / 2 + 0.35; // 2.25m
export const TRAILER_CENTER_HEIGHT_OFFSET =
  TRUCK_DIMENSIONS.trailer.height / 2 + 0.35; // 2.40m

export const TRANSLOAD_STATES = Object.freeze({
  INBOUND_APPROACH: 'INBOUND_APPROACH',
  APRON_ARRIVAL: 'APRON_ARRIVAL',
  ULD_GANTRY_OFFLOAD: 'ULD_GANTRY_OFFLOAD',
  FREIGHT_SORT_BAY: 'FREIGHT_SORT_BAY',
  TRAILER_COUPLING: 'TRAILER_COUPLING',
  GATE_CLEARANCE: 'GATE_CLEARANCE',
  HIGHWAY_DISPATCH: 'HIGHWAY_DISPATCH',
  HIGHWAY_CRUISE: 'HIGHWAY_CRUISE',
});

export const TRANSLOAD_STATE_BADGES = Object.freeze({
  INBOUND_APPROACH: '✈️ Inbound Flight / Vessel Final',
  APRON_ARRIVAL: '🛬 Runway Touchdown & Taxi to Apron',
  ULD_GANTRY_OFFLOAD: '🏗️ ULD & Container Crane Offload',
  FREIGHT_SORT_BAY: '📦 Sortation Conveyors & Bay Docking',
  TRAILER_COUPLING: '🚛 53ft Trailer Coupling & Air Lines',
  GATE_CLEARANCE: '🛡️ Security Gate Clearance & Scale',
  HIGHWAY_DISPATCH: '⚡ Highway Dispatch ("Off We Go!")',
  HIGHWAY_CRUISE: '🛣️ Interstate Highway Cruising',
});

/**
 * Normalizes an angle in radians to [-PI, PI].
 */
export function normalizeAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Calculates articulated trailer position and yaw following the tractor.
 */
export function calculateArticulatedTrailerState({
  tractorPos,
  tractorHeadingRad,
  prevTrailerYawRad,
  dtSeconds = 0.033,
}) {
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    tractorPos,
    new Cesium.Cartesian3(),
  );

  // Compute tractor local forward and right vectors
  const north = new Cesium.Cartesian3(0, 0, 1);
  const east = Cesium.Cartesian3.cross(north, up, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(east, east);
  Cesium.Cartesian3.cross(up, east, north);
  Cesium.Cartesian3.normalize(north, north);

  const sinT = Math.sin(tractorHeadingRad);
  const cosT = Math.cos(tractorHeadingRad);

  const forward = new Cesium.Cartesian3(
    east.x * sinT + north.x * cosT,
    east.y * sinT + north.y * cosT,
    east.z * sinT + north.z * cosT,
  );
  Cesium.Cartesian3.normalize(forward, forward);

  // Fifth wheel hitch position = tractorPos - forward * 2.6m
  const hitchPos = Cesium.Cartesian3.multiplyByScalar(
    forward,
    TRUCK_DIMENSIONS.fifthWheelOffset,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.add(tractorPos, hitchPos, hitchPos);

  // Trailer yaw smoothly lags tractor heading
  const currentTrailerYaw =
    prevTrailerYawRad !== null && prevTrailerYawRad !== undefined
      ? prevTrailerYawRad
      : tractorHeadingRad;

  const deltaYaw = normalizeAngleRad(tractorHeadingRad - currentTrailerYaw);
  // Clamp articulation angle to max 45 degrees to prevent jackknifing
  const maxJackknifeRad = (45 * Math.PI) / 180;
  const clampedDelta = Math.max(
    -maxJackknifeRad,
    Math.min(maxJackknifeRad, deltaYaw),
  );

  const followRate = Math.min(1.0, dtSeconds * 3.5);
  const trailerYaw = normalizeAngleRad(
    currentTrailerYaw + clampedDelta * followRate,
  );

  // Trailer orientation forward vector
  const sinTr = Math.sin(trailerYaw);
  const cosTr = Math.cos(trailerYaw);
  const trailerForward = new Cesium.Cartesian3(
    east.x * sinTr + north.x * cosTr,
    east.y * sinTr + north.y * cosTr,
    east.z * sinTr + north.z * cosTr,
  );
  Cesium.Cartesian3.normalize(trailerForward, trailerForward);

  // Trailer center position = hitchPos - trailerForward * 8.075m
  const trailerCenter = Cesium.Cartesian3.multiplyByScalar(
    trailerForward,
    TRUCK_DIMENSIONS.trailerPivotOffset,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.add(hitchPos, trailerCenter, trailerCenter);

  // Surface elevation alignment: keep trailer center height aligned with tractor surface height
  try {
    const tractorCarto = Cesium.Cartographic.fromCartesian(tractorPos);
    const trailerCarto = Cesium.Cartographic.fromCartesian(trailerCenter);
    if (tractorCarto && trailerCarto) {
      const roadSurface = tractorCarto.height - TRACTOR_CENTER_HEIGHT_OFFSET;
      const trailerCenterElev = roadSurface + TRAILER_CENTER_HEIGHT_OFFSET;
      Cesium.Cartesian3.fromRadians(
        trailerCarto.longitude,
        trailerCarto.latitude,
        trailerCenterElev,
        Cesium.Ellipsoid.WGS84,
        trailerCenter,
      );
    }
  } catch {
    // Graceful fallback for non-ellipsoidal mock points in unit tests
  }

  return {
    hitchPos,
    trailerCenter,
    trailerYaw,
    trailerForward,
    tractorForward: forward,
  };
}

/**
 * Factory for creating the Freight Simulation Engine.
 */
export function createFreightSimEngine({ viewer = null } = {}) {
  const audio = createProceduralFreightAudio();
  const activeTrucks = new Map();
  let latchedTruckId = null;
  let activeCameraMode = FREIGHT_CAMERA_MODES.SEMI_CHASE;
  let isRunning = false;
  let preRenderRemove = null;
  let lastTickTime = performance.now();

  const corridorCache = new Map();

  /**
   * Builds high-density Catmull-Rom spline waypoints for a corridor.
   */
  function getPreparedCorridorPoints(corridorId) {
    if (corridorCache.has(corridorId)) {
      return corridorCache.get(corridorId);
    }
    const corridor = getFreightCorridorById(corridorId);
    if (!corridor || !corridor.waypoints || corridor.waypoints.length < 2) {
      return [];
    }

    // Densify points with smooth Catmull-Rom curvature easements
    const smoothed = smoothRoadCurvature(corridor.waypoints, 15.0);

    // Compute cumulative geodesic distance along the spline in meters
    const cumulativeMeters = [0];
    let totalMeters = 0;
    const cartesianPoints = [];

    for (let i = 0; i < smoothed.length; i++) {
      const pt = smoothed[i];
      const cart = Cesium.Cartesian3.fromDegrees(
        pt.lon,
        pt.lat,
        (pt.elev ?? 20) + ROAD_SURFACE_ALTITUDE_METERS,
      );
      cartesianPoints.push(cart);

      if (i > 0) {
        const prev = smoothed[i - 1];
        const dMiles = calculateHaversineDistanceMiles(
          prev.lat,
          prev.lon,
          pt.lat,
          pt.lon,
        );
        totalMeters += dMiles * 1609.34;
        cumulativeMeters.push(totalMeters);
      }
    }

    const prepared = {
      corridor,
      smoothed,
      cartesianPoints,
      cumulativeMeters,
      totalMeters,
      isOsrmSnapped: false,
    };
    corridorCache.set(corridorId, prepared);

    // Dynamic OSRM road geometry ingestion
    if (typeof globalThis.fetch === 'function') {
      snapRouteToRoads(corridor.waypoints, { profile: 'car' })
        .then((snapped) => {
          if (Array.isArray(snapped) && snapped.length >= 10) {
            const smoothedSnapped = smoothRoadCurvature(snapped, 15.0);
            const cum = [0];
            let total = 0;
            const carts = [];
            for (let i = 0; i < smoothedSnapped.length; i++) {
              const pt = smoothedSnapped[i];
              carts.push(
                Cesium.Cartesian3.fromDegrees(
                  pt.lon,
                  pt.lat,
                  (pt.elev ?? 20) + ROAD_SURFACE_ALTITUDE_METERS,
                ),
              );
              if (i > 0) {
                const prev = smoothedSnapped[i - 1];
                const dM = calculateHaversineDistanceMiles(
                  prev.lat,
                  prev.lon,
                  pt.lat,
                  pt.lon,
                );
                total += dM * 1609.34;
                cum.push(total);
              }
            }
            prepared.smoothed = smoothedSnapped;
            prepared.cartesianPoints = carts;
            prepared.cumulativeMeters = cum;
            prepared.totalMeters = total;
            prepared.isOsrmSnapped = true;
          }
        })
        .catch(() => {});
    }

    return prepared;
  }

  /**
   * Spawns an 18-wheeler truck on a freight corridor.
   */
  function spawnTruck({
    truckId = `TRK-${Math.floor(100 + Math.random() * 900)}`,
    corridorId = 'memphis_to_atlanta',
    manifestId = null,
    initialProgress = 0.0,
    transloadState = TRANSLOAD_STATES.HIGHWAY_CRUISE,
  } = {}) {
    const prepared = getPreparedCorridorPoints(corridorId);
    if (!prepared || prepared.cartesianPoints.length < 2) return null;

    const manifest =
      getCargoManifestById(manifestId) ||
      getCargoManifestById(prepared.corridor.defaultManifestId) ||
      CARGO_MANIFESTS.manifest_mem_atl_01;

    const p0 = prepared.smoothed[0];
    const p1 = prepared.smoothed[1] || p0;
    const initPos = Cesium.Cartesian3.fromDegrees(
      p0.lon,
      p0.lat,
      (p0.elev ?? 20) + ROAD_SURFACE_ALTITUDE_METERS,
    );
    const initFwdPos = Cesium.Cartesian3.fromDegrees(
      p1.lon,
      p1.lat,
      (p1.elev ?? 20) + ROAD_SURFACE_ALTITUDE_METERS,
    );
    const initUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      initPos,
      new Cesium.Cartesian3(),
    );
    let initFwd = Cesium.Cartesian3.subtract(
      initFwdPos,
      initPos,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(initFwd) > 1e-6) {
      Cesium.Cartesian3.normalize(initFwd, initFwd);
      const initDot = Cesium.Cartesian3.dot(initFwd, initUp);
      initFwd = Cesium.Cartesian3.subtract(
        initFwd,
        Cesium.Cartesian3.multiplyByScalar(
          initUp,
          initDot,
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(initFwd, initFwd);
    } else {
      initFwd = new Cesium.Cartesian3(0, 0, 1);
    }

    const truckRecord = {
      id: truckId,
      corridorId,
      corridor: prepared.corridor,
      manifest,
      progress: Math.max(0.0, Math.min(1.0, initialProgress)),
      distanceTraveledMeters: prepared.totalMeters * initialProgress,
      speedMph: 0,
      targetSpeedMph: prepared.corridor.speedMphGoverned || 68,
      transloadState,
      transloadTimerSeconds: 0,
      trailerYaw: null,
      currentPos: initPos,
      tractorForward: initFwd,
      trailerCenter: initPos,
      currentWaypointName: prepared.corridor.waypoints[0]?.name || 'Origin',
      nextWaypointName: prepared.corridor.waypoints[1]?.name || 'En Route',
      milesRemaining: prepared.corridor.distanceMiles * (1 - initialProgress),
      fuelGallonsRemaining: 150 - initialProgress * 45,
      driverHOSHours: Math.min(11.0, initialProgress * 8.0),
      entities: null,
      poses: null,
      selfHidden: false,
      // Throttled / slew-limited surface tracker (Google 3D Tiles mesh or terrain DEM)
      groundTracker: createSurfaceTracker({
        sampleIntervalMs: 200,
        slewMps: 3.0,
        snapMeters: 25.0,
        maxSpikeMeters: 30.0,
      }),
      // Pose the entities were last RENDERED with (camera follows this so the lens
      // and the outlined contact never drift apart by one simulation step).
      renderPos: initPos,
      renderForward: initFwd,
    };

    // Calculate true initial surface position immediately (including initialProgress === 0 in Google 3D Tiles)
    updateTruckState(truckRecord, 0);

    // Create 3D Cesium entities if viewer is available
    if (viewer?.entities?.add) {
      const tractorMaterial = Cesium.Color.fromCssColorString(
        manifest.truckColor || '#4d148c',
      ).withAlpha(0.9);
      const trailerMaterial = Cesium.Color.fromCssColorString(
        manifest.trailerColor || '#ffffff',
      ).withAlpha(0.85);

      // Compute initial tractor and trailer orientations
      const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        truckRecord.currentPos,
        new Cesium.Cartesian3(),
      );
      const north = new Cesium.Cartesian3(0, 0, 1);
      const east = Cesium.Cartesian3.cross(north, up, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(east, east);
      Cesium.Cartesian3.cross(up, east, north);
      Cesium.Cartesian3.normalize(north, north);

      const fDotEast = Cesium.Cartesian3.dot(truckRecord.tractorForward, east);
      const fDotNorth = Cesium.Cartesian3.dot(
        truckRecord.tractorForward,
        north,
      );
      const tractorHeadingRad = Math.atan2(fDotEast, fDotNorth);

      const articulated = calculateArticulatedTrailerState({
        tractorPos: truckRecord.currentPos,
        tractorHeadingRad,
        prevTrailerYawRad: truckRecord.trailerYaw,
        dtSeconds: 0,
      });
      truckRecord.trailerYaw = articulated.trailerYaw;
      truckRecord.trailerCenter = articulated.trailerCenter;

      const tractorRot = new Cesium.Matrix3();
      const tractorRight = Cesium.Cartesian3.cross(
        truckRecord.tractorForward,
        up,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(tractorRight, tractorRight);
      const tractorOrthoUp = Cesium.Cartesian3.cross(
        tractorRight,
        truckRecord.tractorForward,
        new Cesium.Cartesian3(),
      );
      Cesium.Matrix3.setColumn(tractorRot, 0, tractorRight, tractorRot);
      Cesium.Matrix3.setColumn(
        tractorRot,
        1,
        truckRecord.tractorForward,
        tractorRot,
      );
      Cesium.Matrix3.setColumn(tractorRot, 2, tractorOrthoUp, tractorRot);
      const initTractorQuat = Cesium.Quaternion.fromRotationMatrix(tractorRot);

      const trailerRot = new Cesium.Matrix3();
      const trailerRight = Cesium.Cartesian3.cross(
        articulated.trailerForward,
        up,
        new Cesium.Cartesian3(),
      );
      Cesium.Cartesian3.normalize(trailerRight, trailerRight);
      const trailerOrthoUp = Cesium.Cartesian3.cross(
        trailerRight,
        articulated.trailerForward,
        new Cesium.Cartesian3(),
      );
      Cesium.Matrix3.setColumn(trailerRot, 0, trailerRight, trailerRot);
      Cesium.Matrix3.setColumn(
        trailerRot,
        1,
        articulated.trailerForward,
        trailerRot,
      );
      Cesium.Matrix3.setColumn(trailerRot, 2, trailerOrthoUp, trailerRot);
      const initTrailerQuat = Cesium.Quaternion.fromRotationMatrix(trailerRot);

      const tractorPose = createLivePose(
        truckRecord.currentPos,
        initTractorQuat,
      );
      const trailerPose = createLivePose(
        truckRecord.trailerCenter,
        initTrailerQuat,
      );

      const tractorEntity = viewer.entities.add({
        name: `${manifest.carrierLivery} Semi (${truckId})`,
        // LIVE (callback) pose => DYNAMIC box geometry. A ConstantPositionProperty
        // here makes Cesium rebuild the box asynchronously on every update, so the
        // outlined contact freezes/never draws (only the point reticle tracks).
        position: tractorPose.position,
        orientation: tractorPose.orientation,
        box: {
          dimensions: new Cesium.Cartesian3(
            TRUCK_DIMENSIONS.tractor.width,
            TRUCK_DIMENSIONS.tractor.length,
            TRUCK_DIMENSIONS.tractor.height,
          ),
          material: tractorMaterial,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3.5,
        },
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString(
            manifest.truckColor || '#4d148c',
          ),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            150.0,
            Number.POSITIVE_INFINITY,
          ),
        },
        properties: {
          isFreightTruck: true,
          truckId,
          corridorId,
        },
      });

      const trailerEntity = viewer.entities.add({
        name: `${manifest.carrierLivery} 53ft Trailer (${truckId})`,
        position: trailerPose.position,
        orientation: trailerPose.orientation,
        box: {
          dimensions: new Cesium.Cartesian3(
            TRUCK_DIMENSIONS.trailer.width,
            TRUCK_DIMENSIONS.trailer.length,
            TRUCK_DIMENSIONS.trailer.height,
          ),
          material: trailerMaterial,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3.0,
        },
        properties: {
          isFreightTrailer: true,
          truckId,
        },
      });

      const originHub = getFreightHubById(prepared.corridor.originHubId);
      const isAirHub = originHub?.type === FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB;
      let planeEntity = null;
      let planePose = null;
      if (isAirHub && viewer?.entities?.add) {
        const isApproaching =
          truckRecord.transloadState === TRANSLOAD_STATES.INBOUND_APPROACH ||
          truckRecord.transloadState === TRANSLOAD_STATES.APRON_ARRIVAL;
        planePose = createLivePose(truckRecord.currentPos, initTractorQuat);
        planeEntity = viewer.entities.add({
          name: `${manifest.carrierLivery} Air Cargo Freighter (${truckId})`,
          position: planePose.position,
          orientation: planePose.orientation,
          show: isApproaching,
          model: {
            uri: '/models/airplane.glb',
            scale: 1.0,
            minimumPixelSize: 64,
            maximumScale: 150,
          },
          box: {
            dimensions: new Cesium.Cartesian3(64.8, 63.7, 18.6),
            material: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.2),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2.5,
          },
          point: {
            pixelSize: 15,
            color: Cesium.Color.fromCssColorString('#a855f7'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3.0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              200.0,
              Number.POSITIVE_INFINITY,
            ),
          },
          properties: {
            isAirCargoFreighter: true,
            truckId,
          },
        });
      }

      truckRecord.entities = {
        tractor: tractorEntity,
        trailer: trailerEntity,
        plane: planeEntity,
      };
      truckRecord.poses = {
        tractor: tractorPose,
        trailer: trailerPose,
        plane: planePose,
      };
    }

    activeTrucks.set(truckId, truckRecord);

    // If no truck is currently latched, latch this one
    if (!latchedTruckId) {
      latchedTruckId = truckId;
    }

    return truckRecord;
  }

  /**
   * Advances a truck along its highway trajectory.
   */
  function updateTruckState(truck, dtSeconds) {
    const prepared = getPreparedCorridorPoints(truck.corridorId);
    if (!prepared) return;

    // Handle Transload State Machine Transitions at Hubs
    if (truck.transloadState !== TRANSLOAD_STATES.HIGHWAY_CRUISE) {
      truck.transloadTimerSeconds += dtSeconds;
      truck.speedMph = 0;

      const originHub = getFreightHubById(truck.corridor?.originHubId);
      const isAirHub = originHub?.type === FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB;

      // Inbound flight & approach kinematics for air cargo
      if (
        isAirHub &&
        (truck.transloadState === TRANSLOAD_STATES.INBOUND_APPROACH ||
          truck.transloadState === TRANSLOAD_STATES.APRON_ARRIVAL)
      ) {
        const timer = truck.transloadTimerSeconds;
        const ratio = Math.min(1.0, timer / 6.0);
        let planeLat = originHub.lat;
        let planeLon = originHub.lon;
        let planeElev = originHub.elevationMeters || 104;

        if (truck.transloadState === TRANSLOAD_STATES.INBOUND_APPROACH) {
          // Descending on 3° glidepath from South (ILS Runway 36L)
          const distMeters = (1.0 - ratio) * 5500.0;
          planeLat = originHub.lat - distMeters / 111000.0;
          planeLon = originHub.lon;
          planeElev =
            (originHub.elevationMeters || 104) +
            Math.max(8.0, distMeters * Math.tan((3.0 * Math.PI) / 180.0));
          truck.speedMph = Math.round(155 - ratio * 35); // 155 -> 120 mph touchdown
        } else if (truck.transloadState === TRANSLOAD_STATES.APRON_ARRIVAL) {
          // Runway rollout and taxi to cargo apron
          planeLat = originHub.lat - 0.003 + ratio * 0.003;
          planeLon = originHub.lon + ratio * 0.002;
          planeElev = (originHub.elevationMeters || 104) + 4.5;
          truck.speedMph = Math.round(75 - ratio * 55); // 75 -> 20 mph taxi
        }

        const planePos = Cesium.Cartesian3.fromDegrees(
          planeLon,
          planeLat,
          planeElev,
        );
        truck.currentPos = planePos;
        truck.tractorForward = new Cesium.Cartesian3(0, 0, 1);

        // Plane heading is North (0°) along Runway 36L
        const planeRot = new Cesium.Matrix3();
        const planeUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
          planePos,
          new Cesium.Cartesian3(),
        );
        const planeNorth = new Cesium.Cartesian3(0, 0, 1);
        const planeEast = Cesium.Cartesian3.cross(
          planeNorth,
          planeUp,
          new Cesium.Cartesian3(),
        );
        Cesium.Cartesian3.normalize(planeEast, planeEast);
        Cesium.Cartesian3.cross(planeUp, planeEast, planeNorth);
        Cesium.Cartesian3.normalize(planeNorth, planeNorth);

        Cesium.Matrix3.setColumn(planeRot, 0, planeEast, planeRot);
        Cesium.Matrix3.setColumn(planeRot, 1, planeNorth, planeRot);
        Cesium.Matrix3.setColumn(planeRot, 2, planeUp, planeRot);
        const planeQuat = Cesium.Quaternion.fromRotationMatrix(planeRot);

        if (truck.entities?.plane) {
          truck.entities.plane.show = true;
          truck.poses?.plane?.set(planePos, planeQuat);
        }
        if (truck.entities?.tractor) truck.entities.tractor.show = false;
        if (truck.entities?.trailer) truck.entities.trailer.show = false;
      } else {
        // Ground transload: semi parked at loading dock
        if (truck.entities?.plane) {
          truck.entities.plane.show =
            truck.transloadState === TRANSLOAD_STATES.ULD_GANTRY_OFFLOAD;
        }
        if (truck.entities?.tractor) truck.entities.tractor.show = true;
        if (truck.entities?.trailer) truck.entities.trailer.show = true;
      }

      // 6-second phase progression for interactive demonstration
      if (truck.transloadTimerSeconds >= 6.0) {
        truck.transloadTimerSeconds = 0;
        switch (truck.transloadState) {
          case TRANSLOAD_STATES.INBOUND_APPROACH:
            truck.transloadState = TRANSLOAD_STATES.APRON_ARRIVAL;
            audio.playAirBrakeHiss();
            break;
          case TRANSLOAD_STATES.APRON_ARRIVAL:
            truck.transloadState = TRANSLOAD_STATES.ULD_GANTRY_OFFLOAD;
            break;
          case TRANSLOAD_STATES.ULD_GANTRY_OFFLOAD:
            truck.transloadState = TRANSLOAD_STATES.FREIGHT_SORT_BAY;
            break;
          case TRANSLOAD_STATES.FREIGHT_SORT_BAY:
            truck.transloadState = TRANSLOAD_STATES.TRAILER_COUPLING;
            audio.playAirBrakeHiss();
            break;
          case TRANSLOAD_STATES.TRAILER_COUPLING:
            truck.transloadState = TRANSLOAD_STATES.GATE_CLEARANCE;
            audio.playCbRadioChirp();
            break;
          case TRANSLOAD_STATES.GATE_CLEARANCE:
            truck.transloadState = TRANSLOAD_STATES.HIGHWAY_DISPATCH;
            audio.playAirBrakeHiss();
            break;
          case TRANSLOAD_STATES.HIGHWAY_DISPATCH:
            truck.transloadState = TRANSLOAD_STATES.HIGHWAY_CRUISE;
            audio.startEngine(0.65);
            if (truck.entities?.plane) truck.entities.plane.show = false;
            break;
        }
      }
      return;
    }

    // Highway cruising speed kinematics
    const targetMph = truck.targetSpeedMph || 68;
    if (truck.speedMph < targetMph) {
      truck.speedMph = Math.min(targetMph, truck.speedMph + dtSeconds * 8.5);
    } else if (truck.speedMph > targetMph) {
      truck.speedMph = Math.max(targetMph, truck.speedMph - dtSeconds * 12.0);
    }

    const speedMps = (truck.speedMph * 1609.34) / 3600.0;
    truck.distanceTraveledMeters += speedMps * dtSeconds;

    if (truck.distanceTraveledMeters >= prepared.totalMeters) {
      // Loop or finish delivery
      truck.distanceTraveledMeters = 0;
      truck.transloadState = TRANSLOAD_STATES.INBOUND_APPROACH;
      truck.transloadTimerSeconds = 0;
      audio.playAirBrakeHiss();
      return;
    }

    truck.progress = truck.distanceTraveledMeters / prepared.totalMeters;
    truck.milesRemaining =
      truck.corridor.distanceMiles * (1.0 - truck.progress);

    // Locate current position along the cumulative distance array
    const dist = truck.distanceTraveledMeters;
    const cum = prepared.cumulativeMeters;
    let segIdx = 0;
    while (segIdx < cum.length - 2 && cum[segIdx + 1] < dist) {
      segIdx++;
    }

    const segStartDist = cum[segIdx];
    const segEndDist = cum[segIdx + 1];
    const segLen = Math.max(0.1, segEndDist - segStartDist);
    const t = Math.max(0.0, Math.min(1.0, (dist - segStartDist) / segLen));

    const p1 = prepared.smoothed[segIdx];
    const p2 = prepared.smoothed[segIdx + 1] || p1;

    // True Geodetic Ellipsoid / Terrain / Photoreal-3D-Tiles surface interpolation
    const curLon = p1.lon + (p2.lon - p1.lon) * t;
    const curLat = p1.lat + (p2.lat - p1.lat) * t;
    let curElev = (p1.elev ?? 20) + ((p2.elev ?? 20) - (p1.elev ?? 20)) * t;

    if (viewer?.scene) {
      const carto = Cesium.Cartographic.fromDegrees(curLon, curLat);
      if (isPhotoreal3DActive(viewer) && truck.groundTracker) {
        // Google 3D Tiles mode: the globe is hidden so `globe.getHeight` is blind.
        // The corridor's baked elevation can sit far below the streamed tile mesh
        // (e.g. a default 20m in 300m Atlanta), burying the truck so its outlined
        // box is occluded. Track the real rendered surface instead.
        const isLatched = truck.id === latchedTruckId;
        const tileH = truck.groundTracker.update(
          viewer,
          carto,
          performance.now(),
          {
            intervalMs: isLatched ? 200 : 1000,
            excludeEntities: [
              truck.entities?.tractor,
              truck.entities?.trailer,
              truck.entities?.plane,
            ].filter(Boolean),
          },
        );
        if (Number.isFinite(tileH)) curElev = tileH;
      } else if (viewer.scene.globe?.getHeight) {
        const groundH = viewer.scene.globe.getHeight(carto);
        if (Number.isFinite(groundH)) {
          curElev = Math.max(curElev, groundH);
        }
      }
    }

    const currentPos = Cesium.Cartesian3.fromDegrees(
      curLon,
      curLat,
      curElev + TRACTOR_CENTER_HEIGHT_OFFSET,
    );
    truck.currentPos = currentPos;

    // Up vector at current position
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      currentPos,
      new Cesium.Cartesian3(),
    );

    // Compute tractor forward heading vector by sampling forward along the path
    const fwdDist = Math.min(prepared.totalMeters, dist + 4.0);
    let fwdSegIdx = segIdx;
    while (fwdSegIdx < cum.length - 2 && cum[fwdSegIdx + 1] < fwdDist) {
      fwdSegIdx++;
    }
    const fwdStart = cum[fwdSegIdx];
    const fwdEnd = cum[fwdSegIdx + 1];
    const fwdLen = Math.max(0.1, fwdEnd - fwdStart);
    const fwdT = Math.max(0.0, Math.min(1.0, (fwdDist - fwdStart) / fwdLen));

    const fp1 = prepared.smoothed[fwdSegIdx];
    const fp2 = prepared.smoothed[fwdSegIdx + 1] || fp1;
    const fwdLon = fp1.lon + (fp2.lon - fp1.lon) * fwdT;
    const fwdLat = fp1.lat + (fp2.lat - fp1.lat) * fwdT;
    let fwdElev =
      (fp1.elev ?? 20) + ((fp2.elev ?? 20) - (fp1.elev ?? 20)) * fwdT;

    if (viewer?.scene && isPhotoreal3DActive(viewer)) {
      // Heading is projected onto the tangent plane anyway; keep the look-ahead
      // sample on the same tracked surface so a corridor-vs-tile elevation gap
      // cannot degenerate the forward vector into a near-vertical sliver.
      fwdElev = curElev;
    } else if (viewer?.scene?.globe?.getHeight) {
      const fCarto = Cesium.Cartographic.fromDegrees(fwdLon, fwdLat);
      const fGroundH = viewer.scene.globe.getHeight(fCarto);
      if (Number.isFinite(fGroundH)) {
        fwdElev = Math.max(fwdElev, fGroundH);
      }
    }

    const posFwd = Cesium.Cartesian3.fromDegrees(
      fwdLon,
      fwdLat,
      fwdElev + TRACTOR_CENTER_HEIGHT_OFFSET,
    );

    const fwdDiff = Cesium.Cartesian3.subtract(
      posFwd,
      currentPos,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(fwdDiff) > 1e-6) {
      const normFwd = Cesium.Cartesian3.normalize(
        fwdDiff,
        new Cesium.Cartesian3(),
      );
      const dotUp = Cesium.Cartesian3.dot(normFwd, up);
      const tangentFwd = Cesium.Cartesian3.subtract(
        normFwd,
        Cesium.Cartesian3.multiplyByScalar(up, dotUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      if (Cesium.Cartesian3.magnitudeSquared(tangentFwd) > 1e-6) {
        truck.tractorForward = Cesium.Cartesian3.normalize(
          tangentFwd,
          new Cesium.Cartesian3(),
        );
      }
    }
    const tractorForward = truck.tractorForward;

    // Compute tractor heading angle relative to North
    const north = new Cesium.Cartesian3(0, 0, 1);
    const east = Cesium.Cartesian3.cross(north, up, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(east, east);
    Cesium.Cartesian3.cross(up, east, north);
    Cesium.Cartesian3.normalize(north, north);

    const fDotEast = Cesium.Cartesian3.dot(tractorForward, east);
    const fDotNorth = Cesium.Cartesian3.dot(tractorForward, north);
    const tractorHeadingRad = Math.atan2(fDotEast, fDotNorth);

    // Articulated trailer physics
    const articulated = calculateArticulatedTrailerState({
      tractorPos: currentPos,
      tractorHeadingRad,
      prevTrailerYawRad: truck.trailerYaw,
      dtSeconds,
    });
    truck.trailerYaw = articulated.trailerYaw;
    truck.trailerCenter = articulated.trailerCenter;

    // Update orientation Quaternions
    const tractorRot = new Cesium.Matrix3();
    const tractorRight = Cesium.Cartesian3.cross(
      tractorForward,
      up,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(tractorRight, tractorRight);
    const tractorOrthoUp = Cesium.Cartesian3.cross(
      tractorRight,
      tractorForward,
      new Cesium.Cartesian3(),
    );
    Cesium.Matrix3.setColumn(tractorRot, 0, tractorRight, tractorRot);
    Cesium.Matrix3.setColumn(tractorRot, 1, tractorForward, tractorRot);
    Cesium.Matrix3.setColumn(tractorRot, 2, tractorOrthoUp, tractorRot);
    const tractorQuat = Cesium.Quaternion.fromRotationMatrix(tractorRot);

    const trailerRot = new Cesium.Matrix3();
    const trailerRight = Cesium.Cartesian3.cross(
      articulated.trailerForward,
      up,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(trailerRight, trailerRight);
    const trailerOrthoUp = Cesium.Cartesian3.cross(
      trailerRight,
      articulated.trailerForward,
      new Cesium.Cartesian3(),
    );
    Cesium.Matrix3.setColumn(trailerRot, 0, trailerRight, trailerRot);
    Cesium.Matrix3.setColumn(
      trailerRot,
      1,
      articulated.trailerForward,
      trailerRot,
    );
    Cesium.Matrix3.setColumn(trailerRot, 2, trailerOrthoUp, trailerRot);
    const trailerQuat = Cesium.Quaternion.fromRotationMatrix(trailerRot);

    // Update Cesium 3D Entities via LIVE poses (dynamic box geometry — see livePose.js)
    if (truck.poses) {
      truck.poses.tractor?.set(currentPos, tractorQuat);
      truck.poses.trailer?.set(articulated.trailerCenter, trailerQuat);
    }

    // Waypoint landmark resolution
    const wpCount = truck.corridor.waypoints.length;
    const currentWpIdx = Math.min(
      wpCount - 1,
      Math.floor(truck.progress * wpCount),
    );
    const nextWpIdx = Math.min(wpCount - 1, currentWpIdx + 1);
    truck.currentWaypointName =
      truck.corridor.waypoints[currentWpIdx]?.name || 'En Route';
    truck.nextWaypointName =
      truck.corridor.waypoints[nextWpIdx]?.name || 'Destination Hub';
  }

  /**
   * Main per-frame animation tick.
   */
  function tick() {
    const now = performance.now();
    const dtSeconds = Math.min(0.1, (now - lastTickTime) / 1000.0);
    lastTickTime = now;

    // Entities were drawn this frame (dataSourceDisplay runs before preRender) with
    // the pose left by the PREVIOUS tick. Snapshot it before advancing the sim so the
    // camera frames the contact exactly where it is drawn — no one-step drift that
    // would otherwise make a 30 m/s truck jitter against the lens.
    for (const truck of activeTrucks.values()) {
      truck.renderPos = truck.currentPos;
      truck.renderForward = truck.tractorForward;
    }

    for (const truck of activeTrucks.values()) {
      updateTruckState(truck, dtSeconds);
    }

    // If latched, update camera tracking
    if (latchedTruckId && activeTrucks.has(latchedTruckId) && viewer) {
      const latched = activeTrucks.get(latchedTruckId);
      applyFreightCameraFollow(
        viewer,
        latched.renderPos,
        latched.renderForward,
        activeCameraMode,
        [
          latched.entities?.tractor,
          latched.entities?.trailer,
          latched.entities?.plane,
        ].filter(Boolean),
      );

      // In-cab view hides the latched truck's point reticle and box (we are inside it);
      // every exterior view (chase, apron/iso, heli, orbital) shows the outlined box.
      // Applied across all trucks so switching trucks never leaves a box stuck hidden.
      // NOTE: only write graphics props on CHANGE — assigning `box.show` re-wraps it in a
      // new ConstantProperty and raises definitionChanged, which rebuilds the geometry.
      const inCab = activeCameraMode === FREIGHT_CAMERA_MODES.IN_CAB;
      for (const truck of activeTrucks.values()) {
        const hideSelf = inCab && truck.id === latchedTruckId;
        if (truck.selfHidden === hideSelf) continue;
        truck.selfHidden = hideSelf;
        if (truck.entities?.tractor?.point) {
          truck.entities.tractor.point.show = !hideSelf;
        }
        if (truck.entities?.tractor?.box) {
          truck.entities.tractor.box.show = !hideSelf;
        }
        if (truck.entities?.trailer?.box) {
          truck.entities.trailer.box.show = !hideSelf;
        }
      }

      // Update audio engine RPM
      if (latched.speedMph > 0) {
        audio.updateEngineRpm(latched.speedMph / 70.0);
      }
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    holdContinuousRender('freight-sim');
    lastTickTime = performance.now();

    // Default: seed primary freight routes
    if (activeTrucks.size === 0) {
      spawnTruck({
        truckId: 'TRK-504',
        corridorId: 'memphis_to_atlanta',
        manifestId: 'manifest_mem_atl_01',
        initialProgress: 0.28,
      });
      spawnTruck({
        truckId: 'TRK-219',
        corridorId: 'savannah_to_atlanta',
        manifestId: 'manifest_sav_atl_04',
        initialProgress: 0.45,
      });
      spawnTruck({
        truckId: 'TRK-882',
        corridorId: 'louisville_to_midwest',
        manifestId: 'manifest_sdf_midwest_03',
        initialProgress: 0.12,
      });
      spawnTruck({
        truckId: 'TRK-901',
        corridorId: 'la_to_chicago',
        manifestId: 'manifest_la_chi_07',
        initialProgress: 0.62,
      });
    }

    if (viewer?.scene?.preRender) {
      preRenderRemove = viewer.scene.preRender.addEventListener(tick);
    }
    governorRequestRender('freight-start');
  }

  function stop() {
    isRunning = false;
    releaseContinuousRender('freight-sim');
    if (typeof preRenderRemove === 'function') {
      preRenderRemove();
      preRenderRemove = null;
    }
    audio.stopEngine();
  }

  function selectTruck(truckId) {
    if (activeTrucks.has(truckId)) {
      latchedTruckId = truckId;
      viewer?.camera?.cancelFlight?.();
      audio.playCbRadioChirp();
      governorRequestRender('freight-select');
      return true;
    }
    return false;
  }

  function getLatchedTruck() {
    return latchedTruckId ? activeTrucks.get(latchedTruckId) || null : null;
  }

  function getAllTrucks() {
    return [...activeTrucks.values()];
  }

  function setCameraMode(mode) {
    if (FREIGHT_CAMERA_MODES[mode]) {
      activeCameraMode = mode;
      viewer?.camera?.cancelFlight?.();
      governorRequestRender('freight-camera');
      return true;
    }
    return false;
  }

  function getCameraMode() {
    return activeCameraMode;
  }

  function fastForwardTransload(truckId) {
    const id = truckId || latchedTruckId;
    const truck = activeTrucks.get(id);
    if (!truck) return false;
    truck.transloadState = TRANSLOAD_STATES.HIGHWAY_DISPATCH;
    truck.transloadTimerSeconds = 5.9;
    audio.playAirBrakeHiss();
    return true;
  }

  function rerouteWeatherDetour(truckId) {
    const id = truckId || latchedTruckId;
    const truck = activeTrucks.get(id);
    if (!truck) return false;
    // Lower speed limit slightly for severe weather safety
    truck.targetSpeedMph = Math.max(45, truck.targetSpeedMph - 15);
    audio.playJakeBrakeRumble();
    audio.playCbRadioChirp();
    return true;
  }

  function getActiveTelemetry() {
    if (!latchedTruckId || !activeTrucks.has(latchedTruckId)) {
      const first = activeTrucks.values().next().value;
      if (!first) return null;
      latchedTruckId = first.id;
    }
    const truck = activeTrucks.get(latchedTruckId);
    if (!truck) return null;

    let carto = null;
    try {
      carto = Cesium.Cartographic.fromCartesian(truck.currentPos);
    } catch {}

    const curLat = carto
      ? Cesium.Math.toDegrees(carto.latitude)
      : truck.corridor?.waypoints?.[0]?.lat;
    const curLon = carto
      ? Cesium.Math.toDegrees(carto.longitude)
      : truck.corridor?.waypoints?.[0]?.lon;
    const curElev = carto ? carto.height : 0;

    const originHub = getFreightHubById(truck.corridor?.originHubId);
    const isAirCargo = Boolean(
      originHub?.type === FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB,
    );

    return {
      simType: 'freight',
      truckId: truck.id,
      carrierLivery: truck.manifest?.carrierLivery || 'Freight Carrier',
      cargoDescription: truck.manifest?.description || 'Commercial Freight',
      cargoType: truck.manifest?.cargoType || 'GENERAL_FREIGHT',
      grossWeightLbs: truck.manifest?.grossWeightLbs || 45000,
      cargoValueUsd: truck.manifest?.cargoValueUsd || 500000,
      speedMph: Math.round(truck.speedMph || 0),
      progressPct: Math.round((truck.progress || 0) * 100),
      milesRemaining: Math.round(truck.milesRemaining || 0),
      currentWaypointName: truck.currentWaypointName || 'En Route',
      nextWaypointName: truck.nextWaypointName || 'Destination Hub',
      currentLat: curLat,
      currentLon: curLon,
      currentElev: curElev,
      transloadState: truck.transloadState,
      stateBadge:
        TRANSLOAD_STATE_BADGES[truck.transloadState] ||
        'Interstate Highway Cruising',
      cameraMode: activeCameraMode,
      corridorName: truck.corridor?.name || 'Highway Corridor',
      highways: truck.corridor?.highways || 'Interstate',
      isAirCargo,
      transloadSource: truck.manifest?.transloadSource || 'Freight Bay',
      isActive: isRunning,
    };
  }

  function destroy() {
    stop();
    audio.destroy();
    for (const truck of activeTrucks.values()) {
      if (viewer?.entities && truck.entities) {
        if (truck.entities.tractor) {
          viewer.entities.remove(truck.entities.tractor);
        }
        if (truck.entities.trailer) {
          viewer.entities.remove(truck.entities.trailer);
        }
        if (truck.entities.plane) {
          viewer.entities.remove(truck.entities.plane);
        }
      }
    }
    activeTrucks.clear();
    latchedTruckId = null;
  }

  return {
    start,
    stop,
    tick,
    spawnTruck,
    selectTruck,
    getLatchedTruck,
    getAllTrucks,
    getActiveTelemetry,
    isSimActive: () => isRunning,
    setCameraMode,
    getCameraMode,
    fastForwardTransload,
    rerouteWeatherDetour,
    getAudioEngine: () => audio,
    destroy,
  };
}
