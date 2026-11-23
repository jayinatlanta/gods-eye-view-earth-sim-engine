/**
 * Vector Routing & 3D Train Simulation Engine for World of Rails.
 * (World of Rails Substrate Slice)
 *
 * Implements OpenStreetMap Overpass API railway vector ingestion, topological graph
 * stitching, spline curve sampling, Cesium 3D locomotive and articulated consist simulation,
 * high-contrast outlined contact reticles, dynamic terrain elevation clamping, establishing
 * overview camera, and first-person cab-ride camera tracking with subterranean cut-and-cover auto-fallback.
 */

import * as Cesium from 'cesium';
import {
  resolveRailWaypoints,
  resolveRailWaypointsAsync,
  calculateHaversineDistance,
  calculateTravelDurationSeconds,
} from '../../transit/railWaypoints.js';
import { stitchOverpassWaypointsTopological } from './railGraphPathfinder.js';
import {
  isPhotoreal3DActive,
  subscribeToMapStack,
} from '../citylife/surfaceHeight.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../../renderGovernor.js';
import {
  MONORAIL_MODEL_URI,
  MONORAIL_MODEL_LENGTH_M,
  computeFleetGlbOrientationQuat,
} from '../citylife/syntheticMetroEngine.js';

export const TOP_OF_RAIL_OFFSET_METERS = 2.0; // Elevation offset matching locomotive wheel-rail interface
export const CAB_VIEW_OFFSET = new Cesium.Cartesian3(0.0, 6.0, 2.0); // +2m above deck looking forward
export const ORBITAL_CHASE_OFFSET = new Cesium.Cartesian3(0.0, -50.0, 25.0); // 50m trailing, 25m overhead
export const HELICOPTER_CHASE_OFFSET = new Cesium.Cartesian3(0.0, -90.0, 55.0); // Overhead helicopter tracking view

export const LOCOMOTIVE_DIMENSIONS = {
  width: 3.2,
  length: 20.0,
  height: 4.2,
};

export const RAIL_CAR_DIMENSIONS = {
  width: 3.1,
  length: 20.0,
  height: 4.0,
  couplerGap: 1.0,
};

export const DEFAULT_CARS_PER_CORRIDOR = {
  atlanta_marta_east: 4,
  northeast_corridor_acela: 6,
  tokaido_shinkansen: 8,
  wdw_monorail: 0,
};

/**
 * Builds an Overpass QL query string for railways within a bounding box.
 */
export function buildOverpassRailQuery(bbox) {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  return `[out:json][timeout:25];(way["railway"~"^(rail|subway)$"](${minLat},${minLon},${maxLat},${maxLon}););out body;>;out skel qt;`;
}

/**
 * Chains waypoints or topological Overpass nodes into a smooth equidistant Cartesian trajectory.
 * Incorporates dynamic Cesium globe terrain height sampling when available.
 */
export function generateRailTrajectory(waypoints, options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
  const sampleIntervalMeters = options.sampleIntervalMeters || 20;
  const railOffset = options.railOffsetMeters ?? TOP_OF_RAIL_OFFSET_METERS;
  const scene = options.scene || null;

  const trajectoryCartesians = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const segmentDist = calculateHaversineDistance(
      p1.lat,
      p1.lon,
      p2.lat,
      p2.lon,
    );
    const steps = Math.max(1, Math.ceil(segmentDist / sampleIntervalMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const lat = p1.lat + (p2.lat - p1.lat) * t;
      const lon = p1.lon + (p2.lon - p1.lon) * t;
      let elev = (p1.elev ?? 100) + ((p2.elev ?? 100) - (p1.elev ?? 100)) * t;

      const is3D = scene?.globe?.show === false;
      // Only sample bare terrain in 2D globe mode; in Google 3D Tiles keep corridor grade flat so rails never climb buildings.
      if (!is3D && scene?.sampleHeightSupported && scene?.sampleHeight) {
        try {
          const carto = Cesium.Cartographic.fromDegrees(lon, lat);
          const sampleH = scene.sampleHeight(carto);
          if (
            typeof sampleH === 'number' &&
            Number.isFinite(sampleH) &&
            Math.abs(sampleH - elev) < 12.0
          ) {
            elev = sampleH;
          }
        } catch {
          /* fallback */
        }
      } else if (!is3D && scene?.globe?.getHeight) {
        try {
          const carto = Cesium.Cartographic.fromDegrees(lon, lat);
          const groundH = scene.globe.getHeight(carto);
          if (typeof groundH === 'number' && Number.isFinite(groundH)) {
            elev = groundH;
          }
        } catch {
          /* use interpolated elev */
        }
      }

      trajectoryCartesians.push(
        Cesium.Cartesian3.fromDegrees(lon, lat, elev + railOffset),
      );
    }
  }

  // Include final destination point
  const last = waypoints[waypoints.length - 1];
  let lastElev = last.elev ?? 100;
  const is3DLast = scene?.globe?.show === false;
  if (!is3DLast && scene?.sampleHeightSupported && scene?.sampleHeight) {
    try {
      const carto = Cesium.Cartographic.fromDegrees(last.lon, last.lat);
      const sampleH = scene.sampleHeight(carto);
      if (
        typeof sampleH === 'number' &&
        Number.isFinite(sampleH) &&
        Math.abs(sampleH - lastElev) < 12.0
      ) {
        lastElev = sampleH;
      }
    } catch {
      /* fallback */
    }
  } else if (!is3DLast && scene?.globe?.getHeight) {
    try {
      const carto = Cesium.Cartographic.fromDegrees(last.lon, last.lat);
      const groundH = scene.globe.getHeight(carto);
      if (typeof groundH === 'number' && Number.isFinite(groundH)) {
        lastElev = groundH;
      }
    } catch {
      /* use last.elev */
    }
  }
  trajectoryCartesians.push(
    Cesium.Cartesian3.fromDegrees(last.lon, last.lat, lastElev + railOffset),
  );

  return trajectoryCartesians;
}

/**
 * Attempts to fetch live railway vectors from Overpass API proxy or public mirrors.
 */
export async function fetchOverpassRailways(
  bbox,
  fetchImpl = globalThis.fetch,
) {
  if (!bbox || bbox.length !== 4) return null;
  const query = buildOverpassRailQuery(bbox);

  const endpoints = [
    '/api/overpass',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.elements) && data.elements.length > 0) {
          return data.elements;
        }
      }
    } catch {
      // Try next mirror
    }
  }

  return null;
}

/**
 * Stitches raw Overpass OSM elements into an ordered array of waypoint coordinates
 * using topological graph pathfinding to eliminate radial sorting jumps across land.
 */
export function stitchOverpassWaypoints(elements, fromWp, toWp) {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  const topological = stitchOverpassWaypointsTopological(
    elements,
    fromWp,
    toWp,
  );
  if (topological && topological.length >= 2) {
    return topological;
  }

  const nodeMap = new Map();
  const ways = [];

  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === 'way' && Array.isArray(el.nodes)) {
      ways.push(el);
    }
  }

  if (ways.length === 0) return null;

  // Flatten way coordinates
  const points = [];
  for (const way of ways) {
    for (const nodeId of way.nodes) {
      const node = nodeMap.get(nodeId);
      if (node) points.push(node);
    }
  }

  if (points.length < 2) return null;

  // Sort / chain points by proximity along directional vector from fromWp to toWp
  const sorted = [...points].sort((a, b) => {
    const distA = calculateHaversineDistance(
      fromWp.lat,
      fromWp.lon,
      a.lat,
      a.lon,
    );
    const distB = calculateHaversineDistance(
      fromWp.lat,
      fromWp.lon,
      b.lat,
      b.lon,
    );
    return distA - distB;
  });

  // Decimate to avoid redundant points closer than 15 meters
  const result = [fromWp];
  for (const pt of sorted) {
    const last = result[result.length - 1];
    if (calculateHaversineDistance(last.lat, last.lon, pt.lat, pt.lon) > 15) {
      result.push({ ...pt, elev: fromWp.elev || 100 });
    }
  }
  result.push(toWp);

  return result;
}

/**
 * Applies deterministic, oriented camera follow for heavy rail trains.
 * Aligns camera heading along the track velocity vector and supports First-Person Cab,
 * Articulated Consist Chase, and Aerial Helicopter follow with terrain clamping.
 */
export function applyRailCameraFollow(
  viewer,
  position,
  forwardVec,
  mode = 'cab',
  consistLength = 120,
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
  if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-6) return;
  Cesium.Cartesian3.normalize(right, right);

  const trueForward = Cesium.Cartesian3.cross(
    up,
    right,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(trueForward, trueForward);

  const camPos = new Cesium.Cartesian3();
  const lookTarget = new Cesium.Cartesian3();
  const scratchFwd = new Cesium.Cartesian3();
  const scratchUp = new Cesium.Cartesian3();

  if (mode === 'cab') {
    // Lead Locomotive Driver Cab: seated in front windshield looking forward along rails
    Cesium.Cartesian3.multiplyByScalar(
      trueForward,
      LOCOMOTIVE_DIMENSIONS.length * 0.42,
      scratchFwd,
    );
    Cesium.Cartesian3.multiplyByScalar(up, 2.8, scratchUp);
    Cesium.Cartesian3.add(position, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.clone(camPos, lookTarget);
    Cesium.Cartesian3.multiplyByScalar(trueForward, 75.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 0.5, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  } else if (mode === 'heli' || mode === 'copter') {
    // Aerial Helicopter tracking follow: 85m overhead, 85m back to clear city skylines
    Cesium.Cartesian3.multiplyByScalar(trueForward, -85.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 85.0, scratchUp);
    Cesium.Cartesian3.add(position, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.clone(position, lookTarget);
    Cesium.Cartesian3.multiplyByScalar(trueForward, 20.0, scratchFwd);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else {
    // 'chase': Raised urban chase behind train consist clearing low/mid buildings
    const distBack = -(Math.max(40.0, consistLength) + 40.0);
    const heightUp = 36.0;
    Cesium.Cartesian3.multiplyByScalar(trueForward, distBack, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, heightUp, scratchUp);
    Cesium.Cartesian3.add(position, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.clone(position, lookTarget);
    Cesium.Cartesian3.multiplyByScalar(trueForward, 15.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, 2.0, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  }

  // Anti-Subterranean Protection anchored to corridor track / bare terrain (NOT 3D building rooftops)
  const posCarto = Cesium.Cartographic.fromCartesian(
    position,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  const baseRailFallback = posCarto
    ? posCarto.height - TOP_OF_RAIL_OFFSET_METERS
    : null;

  const camCarto = Cesium.Cartographic.fromCartesian(
    camPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (camCarto) {
    const is3D = isPhotoreal3DActive(viewer);
    const globeCamGround = !is3D
      ? viewer.scene?.globe?.getHeight?.(camCarto)
      : null;
    const groundH = Number.isFinite(globeCamGround)
      ? Math.max(globeCamGround, baseRailFallback ?? globeCamGround)
      : baseRailFallback;
    const minBuffer = mode === 'cab' ? 1.5 : 4.0;
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

  const direction = Cesium.Cartesian3.subtract(
    lookTarget,
    camPos,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(direction, direction);

  if (typeof viewer.camera?.setView === 'function') {
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
 * Creates the World of Rails Modular Engine.
 */
export function createRailwayEngine({
  viewer = null,
  operations = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  let activeTrainEntity = null;
  let activeRawTrainPositionProperty = null;
  let activeCarEntities = [];
  let activeTrackEntity = null;
  let tickListener = null;
  let mapStackUnsub = null;
  let activeRouteData = null;
  let isDestroyed = false;
  let cameraMode = 'cab'; // 'cab' | 'chase' | 'heli' | 'overview' | 'free'
  let originalClockState = null;
  let lastSampledRailGroundM = null;
  let liveClampedTrainPos = null;
  let activeRailOffsetM = TOP_OF_RAIL_OFFSET_METERS;
  let activeArrivalCallback = null;
  let arrivalTriggered = false;

  function getExcludeEntities() {
    return [activeTrainEntity, activeTrackEntity, ...activeCarEntities].filter(
      Boolean,
    );
  }

  function clampRailCartesian(rawCartesian, fallbackGroundM = null) {
    if (!rawCartesian) return undefined;
    const c = Cesium.Cartographic.fromCartesian(
      rawCartesian,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (!c) return Cesium.Cartesian3.clone(rawCartesian);
    const groundM = fallbackGroundM ?? lastSampledRailGroundM;
    if (!Number.isFinite(groundM)) return Cesium.Cartesian3.clone(rawCartesian);
    const targetH = groundM + activeRailOffsetM;
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
      new Cesium.Cartesian3(),
    );
  }

  /**
   * Spawns a real-time 3D train simulation along the specified rail corridor,
   * complete with articulated multi-car consist, outlined contact reticles,
   * dynamic terrain clamping, and establishing view support.
   */
  async function spawnRailRoute(fromQuery, toQuery, options = {}) {
    if (!viewer || isDestroyed) return null;

    clearActiveRailRoute();

    let corridor = resolveRailWaypoints(fromQuery, toQuery, options);
    if (corridor?.isFallback && fromQuery && toQuery) {
      try {
        const asyncCorridor = await resolveRailWaypointsAsync(
          fromQuery,
          toQuery,
          { fetchImpl, ...options },
        );
        if (asyncCorridor) corridor = asyncCorridor;
      } catch {
        /* fallback cleanly to synchronous corridor */
      }
    }
    const speedMph = Number(options.speedMph) || corridor.speedMph || 45;
    const requestedCam =
      options.cameraMode || (options.cabRide === false ? 'chase' : 'cab');
    const isCabRide = requestedCam === 'cab';
    cameraMode = requestedCam;
    const isMonorail =
      corridor.activeProfile?.vehicleMode === 'monorail' ||
      options.vehicleMode === 'monorail';
    activeRailOffsetM = Number.isFinite(
      corridor.activeProfile?.railOffsetMeters,
    )
      ? corridor.activeProfile.railOffsetMeters
      : TOP_OF_RAIL_OFFSET_METERS;
    activeArrivalCallback =
      typeof options.onArrival === 'function' ? options.onArrival : null;
    arrivalTriggered = false;

    let orderedWaypoints = corridor.waypoints;

    // Optional dynamic Overpass vector ingestion (skipped for dedicated monorail beamways
    // so curated elevated Disney straddle-beam coordinates are preserved verbatim).
    if (options.useOverpass && corridor.bbox && !isMonorail) {
      try {
        const elements = await fetchOverpassRailways(corridor.bbox, fetchImpl);
        if (elements) {
          const stitched = stitchOverpassWaypoints(
            elements,
            corridor.from,
            corridor.to,
          );
          if (stitched && stitched.length >= 2) {
            orderedWaypoints = stitched;
          }
        }
      } catch {
        // Fall back seamlessly to corridor waypoints
      }
    }

    const trajectoryCartesians = generateRailTrajectory(orderedWaypoints, {
      sampleIntervalMeters: isMonorail ? 12 : 20,
      railOffsetMeters: activeRailOffsetM,
      scene: viewer?.scene,
    });

    if (trajectoryCartesians.length < 2) return null;

    // Consist configuration
    const carsCount = isMonorail
      ? 0
      : options.carsCount !== undefined
        ? Number(options.carsCount)
        : (DEFAULT_CARS_PER_CORRIDOR[corridor.id] ?? 4);

    const carPitch =
      RAIL_CAR_DIMENSIONS.length + RAIL_CAR_DIMENSIONS.couplerGap;
    const speedMps = Math.max(1.0, speedMph * 0.44704);
    const durationSec = calculateTravelDurationSeconds(
      corridor.totalDistanceMeters,
      speedMph,
    );
    const maxTimeLagSec = (carsCount * carPitch) / speedMps;
    const totalSimDurationSec = durationSec + maxTimeLagSec;

    const startTime = Cesium.JulianDate.now();
    const stopTime = Cesium.JulianDate.addSeconds(
      startTime,
      totalSimDurationSec,
      new Cesium.JulianDate(),
    );

    // Save previous clock state for clean restoral on clear
    if (viewer.clock && !originalClockState) {
      originalClockState = {
        startTime: viewer.clock.startTime?.clone?.(),
        stopTime: viewer.clock.stopTime?.clone?.(),
        currentTime: viewer.clock.currentTime?.clone?.(),
        clockRange: viewer.clock.clockRange,
        multiplier: viewer.clock.multiplier,
        shouldAnimate: viewer.clock.shouldAnimate,
      };
    }

    // Lead locomotive position property
    const positionProperty = new Cesium.SampledPositionProperty();
    activeRawTrainPositionProperty = positionProperty;
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

    // Hold at destination until entire consist arrives
    const endHoldTime = Cesium.JulianDate.addSeconds(
      startTime,
      totalSimDurationSec + 30,
      new Cesium.JulianDate(),
    );
    positionProperty.addSample(
      endHoldTime,
      trajectoryCartesians[totalPoints - 1],
    );

    // Configure viewer clock
    if (viewer.clock) {
      viewer.clock.startTime = startTime.clone();
      viewer.clock.stopTime = stopTime.clone();
      viewer.clock.currentTime = startTime.clone();
      viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
      viewer.clock.multiplier = 1.0;
      viewer.clock.shouldAnimate = true;
    }

    // 1. Vector Rail Track Entity (Amber/Gold or Monorail Cyan glowing beamway)
    const trackColor = corridor.activeProfile?.trackColor || '#f59e0b';
    activeTrackEntity = viewer.entities.add({
      name: `Track: ${corridor.name}`,
      polyline: {
        positions: trajectoryCartesians,
        width: isMonorail ? 5.0 : 4.0,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          taperPower: 0.1,
          color: Cesium.Color.fromCssColorString(trackColor).withAlpha(0.9),
        }),
        clampToGround: false,
      },
    });

    // 2. 3D Locomotive / Monorail Entity
    // For procedural fleet `monorail.glb` (built glTF Y-up, nose toward local -X),
    // compute orientation dynamically from track forward vector via `computeFleetGlbOrientationQuat`
    // so glTF(-1,0,0) aligns strictly along travel direction (dot = +1.0, zero 90°/180° offset).
    let lastValidMonorailQuat = null;
    if (isMonorail && trajectoryCartesians.length >= 2) {
      const initFwd = Cesium.Cartesian3.subtract(
        trajectoryCartesians[1],
        trajectoryCartesians[0],
        new Cesium.Cartesian3(),
      );
      if (Cesium.Cartesian3.magnitudeSquared(initFwd) > 1e-6) {
        Cesium.Cartesian3.normalize(initFwd, initFwd);
        lastValidMonorailQuat = computeFleetGlbOrientationQuat(
          trajectoryCartesians[0],
          initFwd,
        );
      }
    }

    const orientationProperty = isMonorail
      ? new Cesium.CallbackProperty((time, result) => {
          const evalTime = time || viewer.clock?.currentTime;
          const p0 = evalTime ? positionProperty.getValue(evalTime) : null;
          if (!p0) return lastValidMonorailQuat || undefined;
          const futureTime = Cesium.JulianDate.addSeconds(
            evalTime,
            0.35,
            new Cesium.JulianDate(),
          );
          let p1 = positionProperty.getValue(futureTime);
          let fwd = null;
          if (p1 && Cesium.Cartesian3.distanceSquared(p0, p1) > 1e-4) {
            fwd = Cesium.Cartesian3.subtract(p1, p0, new Cesium.Cartesian3());
          } else {
            const pastTime = Cesium.JulianDate.addSeconds(
              evalTime,
              -0.35,
              new Cesium.JulianDate(),
            );
            const pPrev = positionProperty.getValue(pastTime);
            if (pPrev && Cesium.Cartesian3.distanceSquared(pPrev, p0) > 1e-4) {
              fwd = Cesium.Cartesian3.subtract(
                p0,
                pPrev,
                new Cesium.Cartesian3(),
              );
            }
          }
          if (fwd && Cesium.Cartesian3.magnitudeSquared(fwd) > 1e-6) {
            Cesium.Cartesian3.normalize(fwd, fwd);
            const q = computeFleetGlbOrientationQuat(p0, fwd);
            if (q) {
              lastValidMonorailQuat = Cesium.Quaternion.clone(
                q,
                lastValidMonorailQuat || new Cesium.Quaternion(),
              );
              return Cesium.Quaternion.clone(
                q,
                result || new Cesium.Quaternion(),
              );
            }
          }
          return lastValidMonorailQuat
            ? Cesium.Quaternion.clone(
                lastValidMonorailQuat,
                result || new Cesium.Quaternion(),
              )
            : undefined;
        }, false)
      : new Cesium.VelocityOrientationProperty(positionProperty);

    const trainName =
      options.trainName ||
      (isMonorail
        ? 'WDW Monorail Mark VI'
        : `Locomotive ${corridor.activeProfileKey || 'CSX-4500'}`);
    const locoColor = corridor.activeProfile?.locoColor || '#0284c7';
    const carColor = corridor.activeProfile?.carColor || '#0369a1';

    const dynamicTrainPosition = new Cesium.CallbackPositionProperty(
      (time, result) => {
        const evalTime = time || viewer.clock?.currentTime;
        if (
          liveClampedTrainPos &&
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
            liveClampedTrainPos,
            result || new Cesium.Cartesian3(),
          );
        }
        const raw = positionProperty.getValue(evalTime);
        if (!raw) return undefined;
        const clamped = clampRailCartesian(raw);
        return Cesium.Cartesian3.clone(
          clamped || raw,
          result || new Cesium.Cartesian3(),
        );
      },
      false,
    );

    activeTrainEntity = viewer.entities.add({
      name: trainName,
      position: dynamicTrainPosition,
      orientation: orientationProperty,
      ...(isMonorail
        ? {
            model: {
              uri: MONORAIL_MODEL_URI,
              scale: 1.0,
              minimumPixelSize: 48,
              color: Cesium.Color.fromCssColorString(locoColor),
              colorBlendMode: Cesium.ColorBlendMode.MIX,
              colorBlendAmount: 0.25,
              show: !isCabRide,
            },
          }
        : {
            box: {
              dimensions: new Cesium.Cartesian3(
                LOCOMOTIVE_DIMENSIONS.width,
                LOCOMOTIVE_DIMENSIONS.length,
                LOCOMOTIVE_DIMENSIONS.height,
              ),
              material:
                Cesium.Color.fromCssColorString(locoColor).withAlpha(0.85),
              outline: true,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 3.5,
            },
          }),
      point: {
        pixelSize: 15,
        color: Cesium.Color.fromCssColorString(locoColor),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3.0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          250.0,
          Number.POSITIVE_INFINITY,
        ),
      },
      path: {
        resolution: 1,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
        width: 3.0,
        leadTime: 0,
        trailTime: 20,
      },
      gevTrackedId: trainName,
    });

    // 3. Articulated Consist Cars with Outlined Reticles
    activeCarEntities = [];
    for (let c = 1; c <= carsCount; c++) {
      const distanceLag = c * carPitch;
      const timeLagSec = distanceLag / speedMps;

      const carPositionProperty = new Cesium.SampledPositionProperty();
      // At start, car rests at origin station
      carPositionProperty.addSample(startTime, trajectoryCartesians[0]);

      for (let i = 0; i < totalPoints; i++) {
        const t = i / (totalPoints - 1);
        const time_c = Cesium.JulianDate.addSeconds(
          startTime,
          t * durationSec + timeLagSec,
          new Cesium.JulianDate(),
        );
        carPositionProperty.addSample(time_c, trajectoryCartesians[i]);
      }

      carPositionProperty.addSample(
        endHoldTime,
        trajectoryCartesians[totalPoints - 1],
      );

      const carOrientation = new Cesium.VelocityOrientationProperty(
        carPositionProperty,
      );

      const dynamicCarPosition = new Cesium.CallbackPositionProperty(
        (time, result) => {
          const evalTime = time || viewer.clock?.currentTime;
          const raw = carPositionProperty.getValue(evalTime);
          if (!raw) return undefined;
          const clamped = clampRailCartesian(raw);
          return Cesium.Cartesian3.clone(
            clamped || raw,
            result || new Cesium.Cartesian3(),
          );
        },
        false,
      );

      const carEntity = viewer.entities.add({
        name: `${trainName} - Car ${c}`,
        position: dynamicCarPosition,
        orientation: carOrientation,
        box: {
          dimensions: new Cesium.Cartesian3(
            RAIL_CAR_DIMENSIONS.width,
            RAIL_CAR_DIMENSIONS.length,
            RAIL_CAR_DIMENSIONS.height,
          ),
          material: Cesium.Color.fromCssColorString(carColor).withAlpha(0.7),
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
        },
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString(carColor),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            250.0,
            Number.POSITIVE_INFINITY,
          ),
        },
        gevTrackedId: `${trainName}-car-${c}`,
      });
      activeCarEntities.push(carEntity);
    }

    // Camera setup - frame-by-frame follow via scene.preRender
    const initialViewOffset = isCabRide
      ? CAB_VIEW_OFFSET
      : ORBITAL_CHASE_OFFSET;
    activeTrainEntity.viewFrom = initialViewOffset.clone();
    viewer.trackedEntity = activeTrainEntity;
    cameraMode = requestedCam;
    const consistLength = isMonorail
      ? MONORAIL_MODEL_LENGTH_M
      : carsCount * carPitch;

    const syncTrainAndCamera = () => {
      if (!activeTrainEntity || isDestroyed || !viewer.clock) return;
      const curTime = viewer.clock.currentTime;
      const rawPos = positionProperty.getValue(curTime);
      if (!rawPos) return;

      const excludeList = getExcludeEntities();
      const trainCarto = Cesium.Cartographic.fromCartesian(
        rawPos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      if (trainCarto) {
        const is3D = isPhotoreal3DActive(viewer);
        // In Google 3D Tiles mode keep train on flat corridor grade (no rooftop spikes).
        if (!is3D) {
          const globeGround = viewer.scene?.globe?.getHeight?.(trainCarto);
          if (Number.isFinite(globeGround)) {
            lastSampledRailGroundM = globeGround;
          }
        } else {
          lastSampledRailGroundM = null;
        }
      }
      const currentPos = clampRailCartesian(rawPos) || rawPos;
      liveClampedTrainPos = Cesium.Cartesian3.clone(currentPos);

      if (activeTrainEntity.point) {
        activeTrainEntity.point.show = cameraMode !== 'cab';
      }
      if (activeTrainEntity.model) {
        activeTrainEntity.model.show = cameraMode !== 'cab';
      }

      if (
        activeArrivalCallback &&
        !arrivalTriggered &&
        Cesium.JulianDate.secondsDifference(curTime, startTime) >=
          durationSec - 0.5
      ) {
        arrivalTriggered = true;
        const cb = activeArrivalCallback;
        activeArrivalCallback = null;
        setTimeout(() => {
          try {
            cb();
          } catch {
            /* ignore arrival handoff errors */
          }
        }, 0);
        return;
      }

      if (cameraMode === 'free' || cameraMode === 'overview') return;

      // Sample 0.25s ahead on trajectory for heading tangent
      let forward = null;
      const futureTime = Cesium.JulianDate.addSeconds(
        curTime,
        0.25,
        new Cesium.JulianDate(),
      );
      const futurePos = positionProperty.getValue(futureTime);
      if (futurePos) {
        forward = Cesium.Cartesian3.subtract(
          futurePos,
          rawPos,
          new Cesium.Cartesian3(),
        );
        Cesium.Cartesian3.normalize(forward, forward);
      }

      if (!forward) {
        const vel = activeTrainEntity.orientation?.getValue(curTime);
        if (vel) {
          const m = Cesium.Matrix3.fromQuaternion(vel, new Cesium.Matrix3());
          forward = Cesium.Matrix3.getColumn(m, 0, new Cesium.Cartesian3());
        }
      }

      if (currentPos && forward) {
        applyRailCameraFollow(
          viewer,
          currentPos,
          forward,
          cameraMode,
          consistLength,
          excludeList,
        );
      }
    };

    syncTrainAndCamera();

    const eventSource = viewer.scene?.preRender || viewer.clock?.onTick;
    if (eventSource) {
      tickListener = eventSource.addEventListener(syncTrainAndCamera);
      holdContinuousRender('railway-engine');
    }
    mapStackUnsub = subscribeToMapStack(() => {
      if (isDestroyed || !activeRouteData) return;
      lastSampledRailGroundM = null;
      syncTrainAndCamera();
      viewer?.scene?.requestRender?.();
    });

    activeRouteData = {
      corridor,
      trainName,
      speedMph,
      durationSec,
      totalSimDurationSec,
      isCabRide,
      startTime,
      carsCount,
      trainEntity: activeTrainEntity,
      carEntities: activeCarEntities,
      trackEntity: activeTrackEntity,
    };

    return activeRouteData;
  }

  function clearActiveRailRoute() {
    releaseContinuousRender('railway-engine');
    if (tickListener) {
      tickListener();
      tickListener = null;
    }
    if (mapStackUnsub) {
      try {
        mapStackUnsub();
      } catch {
        /* ignore */
      }
      mapStackUnsub = null;
    }
    lastSampledRailGroundM = null;
    liveClampedTrainPos = null;
    activeRawTrainPositionProperty = null;
    activeRailOffsetM = TOP_OF_RAIL_OFFSET_METERS;
    activeArrivalCallback = null;
    arrivalTriggered = false;
    if (activeTrainEntity) {
      viewer.entities.remove(activeTrainEntity);
      activeTrainEntity = null;
    }
    for (const car of activeCarEntities) {
      viewer.entities.remove(car);
    }
    activeCarEntities = [];
    if (activeTrackEntity) {
      viewer.entities.remove(activeTrackEntity);
      activeTrackEntity = null;
    }
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }

    // Cleanly restore viewer clock state
    if (originalClockState && viewer.clock) {
      if (originalClockState.startTime)
        viewer.clock.startTime = originalClockState.startTime;
      if (originalClockState.stopTime)
        viewer.clock.stopTime = originalClockState.stopTime;
      if (originalClockState.currentTime)
        viewer.clock.currentTime = originalClockState.currentTime;
      if (originalClockState.clockRange !== undefined)
        viewer.clock.clockRange = originalClockState.clockRange;
      if (originalClockState.multiplier !== undefined)
        viewer.clock.multiplier = originalClockState.multiplier;
      if (originalClockState.shouldAnimate !== undefined)
        viewer.clock.shouldAnimate = originalClockState.shouldAnimate;
      originalClockState = null;
    }

    cameraMode = 'cab';
    activeRouteData = null;
  }

  /**
   * Flies the camera to a high macro establishing overview vantage point
   * surveying the entire rail corridor, unlatching continuous tracking.
   */
  function showRailOverview() {
    if (!viewer || isDestroyed || !activeRouteData) return;
    cameraMode = 'overview';
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }

    const corridor = activeRouteData.corridor;
    const from = corridor.from;
    const to = corridor.to;
    const midLat = (from.lat + to.lat) / 2;
    const midLon = (from.lon + to.lon) / 2;
    const distM = corridor.totalDistanceMeters || 10000;
    const altitude = Math.max(3000, Math.min(18000, distM * 0.22));

    if (viewer.camera?.flyTo) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(midLon, midLat, altitude),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-52.0),
          roll: 0.0,
        },
        duration: 1.5,
      });
    }
  }

  /**
   * Instantly re-docks camera follow to the lead locomotive.
   */
  function snapBack(mode = 'cab') {
    if (!viewer || isDestroyed || !activeTrainEntity) return;
    viewer.camera?.cancelFlight?.();
    cameraMode = mode;
    viewer.trackedEntity = activeTrainEntity;
    if (activeTrainEntity.point) {
      activeTrainEntity.point.show = mode !== 'cab';
    }
    if (activeTrainEntity.model) {
      activeTrainEntity.model.show = mode !== 'cab';
    }
    governorRequestRender('rail-snap');
    if (viewer.clock) {
      const curTime = viewer.clock.currentTime;
      const rawProp =
        activeRawTrainPositionProperty || activeTrainEntity.position;
      const currentPos = activeTrainEntity.position?.getValue(curTime);
      const rawPos = rawProp?.getValue(curTime);
      if (currentPos && rawPos) {
        let fwd = null;
        const futureTime = Cesium.JulianDate.addSeconds(
          curTime,
          0.25,
          new Cesium.JulianDate(),
        );
        const futurePos = rawProp?.getValue(futureTime);
        if (futurePos) {
          fwd = Cesium.Cartesian3.subtract(
            futurePos,
            rawPos,
            new Cesium.Cartesian3(),
          );
          Cesium.Cartesian3.normalize(fwd, fwd);
        }
        if (fwd) {
          const isMono =
            activeRouteData?.corridor?.activeProfile?.vehicleMode ===
            'monorail';
          const consistLength = isMono
            ? MONORAIL_MODEL_LENGTH_M
            : (activeRouteData?.carsCount || 4) *
              (RAIL_CAR_DIMENSIONS.length + RAIL_CAR_DIMENSIONS.couplerGap);
          applyRailCameraFollow(
            viewer,
            currentPos,
            fwd,
            cameraMode,
            consistLength,
            getExcludeEntities(),
          );
        }
      }
    }
  }

  /**
   * Sets the active camera mode ('cab', 'chase', 'heli', 'overview', 'free').
   */
  function setCameraMode(mode) {
    if (mode === 'overview') {
      if (activeTrainEntity?.model) activeTrainEntity.model.show = true;
      if (activeTrainEntity?.point) activeTrainEntity.point.show = true;
      showRailOverview();
    } else if (mode === 'free') {
      cameraMode = 'free';
      if (activeTrainEntity?.model) activeTrainEntity.model.show = true;
      if (activeTrainEntity?.point) activeTrainEntity.point.show = true;
      if (viewer.trackedEntity) {
        viewer.trackedEntity = undefined;
      }
    } else if (
      mode === 'chase' ||
      mode === 'cab' ||
      mode === 'heli' ||
      mode === 'copter'
    ) {
      snapBack(mode);
    }
  }

  function getActiveTelemetry() {
    if (!activeRouteData || !activeTrainEntity || !viewer?.clock) return null;
    const curTime = viewer.clock.currentTime;
    const curPos = activeTrainEntity.position?.getValue?.(curTime);
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

    const corridor = activeRouteData.corridor;
    const totalDistM = corridor?.totalDistanceMeters || 1;
    const distTraveledKm = Math.round((progressFrac * totalDistM) / 1000);
    const totalDistKm = Math.round(totalDistM / 1000);
    const distTraveledMi = Math.round(distTraveledKm * 0.621371);
    const totalDistMi = Math.round(totalDistKm * 0.621371);

    const waypoints =
      corridor.activeProfile?.waypoints || corridor.waypoints || [];
    let currentStation = corridor?.from?.name || 'Origin';
    let nextStation = corridor?.to?.name || 'Destination';
    let distToNextMi = null;

    if (waypoints.length >= 2) {
      const segIdx = Math.min(
        waypoints.length - 2,
        Math.floor(progressFrac * (waypoints.length - 1)),
      );
      currentStation = waypoints[segIdx]?.name || currentStation;
      nextStation = waypoints[segIdx + 1]?.name || nextStation;

      const targetWp = waypoints[segIdx + 1];
      if (targetWp) {
        const dMeters = calculateHaversineDistance(
          lat,
          lon,
          targetWp.lat,
          targetWp.lon,
        );
        distToNextMi = Number((dMeters / 1609.34).toFixed(1));
      }
    }

    const fromName = corridor?.from?.name || 'Origin';
    const toName = corridor?.to?.name || 'Destination';

    return {
      mode: 'TRANSIT CAB',
      trainName: activeRouteData.trainName,
      lineName: corridor?.name || activeRouteData.trainName,
      currentLocation: `${activeRouteData.trainName} (${fromName} ➔ ${toName})`,
      currentStation,
      nextStation,
      distToNextMi,
      speedMph: activeRouteData.speedMph,
      lat,
      lon,
      altM,
      progressPct,
      distTraveledMi,
      totalDistMi,
      distTraveledKm,
      totalDistKm,
      isCabRide: cameraMode === 'cab',
      cameraMode,
      vehicleMode: corridor?.activeProfile?.vehicleMode || 'rail',
      carsCount:
        corridor?.activeProfile?.vehicleMode === 'monorail'
          ? 6
          : activeCarEntities.length + 1,
    };
  }

  // Check URL query parameters ?railFrom=...&railTo=...
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const railFrom = params.get('railFrom') || params.get('trainFrom');
      const railTo = params.get('railTo') || params.get('trainTo');
      const corridor = params.get('corridor') || 'csx_mainline';
      const cabRide = params.get('cabRide') !== 'false';
      const speedMph = Number(params.get('railSpeed')) || 45;

      if (railFrom && railTo) {
        setTimeout(() => {
          spawnRailRoute(railFrom, railTo, { corridor, cabRide, speedMph });
        }, 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    spawnRailRoute,
    clearActiveRailRoute,
    getActiveRoute: () => activeRouteData,
    getActiveTelemetry,
    showRailOverview,
    snapBack,
    setCameraMode,
    getCameraMode: () => cameraMode,
    getActiveCarEntities: () => activeCarEntities,
    destroy: () => {
      isDestroyed = true;
      clearActiveRailRoute();
    },
  };
}
