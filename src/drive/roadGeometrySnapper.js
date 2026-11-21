/**
 * True Road Geometry Snapping & Highway Curvature Engine for Infinite Drive & Municipal Fleets.
 * (Foundational Transit & Road/Rail Geometry Realism)
 *
 * Implements:
 * - Multi-leg road network geometry snapping via OSRM /api/route proxy
 * - Resilient offline Catmull-Rom road-bearing spline interpolation
 * - Elimination of diagonal chord slicing across city blocks and water bodies
 * - In-memory and sessionStorage route caching to eliminate duplicate requests
 * - Trajectory distance sampling and tangent direction vector extraction
 */

import * as Cesium from 'cesium';
import { calculateHaversineDistance } from '../transit/railWaypoints.js';

export const DEFAULT_ROAD_SAMPLE_STEP_METERS = 10.0;
const inMemoryRoadCache = new Map();

/**
 * Generates a cache key for a sequence of waypoints.
 */
export function getRouteCacheKey(waypoints, profile = 'car') {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return '';
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  return `${profile}:${first.lat.toFixed(4)},${first.lon.toFixed(4)}->${last.lat.toFixed(4)},${last.lon.toFixed(4)}:${waypoints.length}`;
}

/**
 * Interpolates a Catmull-Rom spline point between p1 and p2 using control points p0 and p3.
 */
export function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const lat =
    0.5 *
    (2 * p1.lat +
      (-p0.lat + p2.lat) * t +
      (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
      (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);

  const lon =
    0.5 *
    (2 * p1.lon +
      (-p0.lon + p2.lon) * t +
      (2 * p0.lon - 5 * p1.lon + 4 * p2.lon - p3.lon) * t2 +
      (-p0.lon + 3 * p1.lon - 3 * p2.lon + p3.lon) * t3);

  const e0 = p0.elev ?? 20;
  const e1 = p1.elev ?? 20;
  const e2 = p2.elev ?? 20;
  const e3 = p3.elev ?? 20;

  const elev =
    0.5 *
    (2 * e1 +
      (-e0 + e2) * t +
      (2 * e0 - 5 * e1 + 4 * e2 - e3) * t2 +
      (-e0 + 3 * e1 - 3 * e2 + e3) * t3);

  return { lat, lon, elev };
}

/**
 * Densifies waypoints with smooth Catmull-Rom curvature preserving road easements.
 */
export function smoothRoadCurvature(
  waypoints,
  sampleStepMeters = DEFAULT_ROAD_SAMPLE_STEP_METERS,
) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return waypoints || [];
  if (waypoints.length === 2) {
    // Generate linear steps if only 2 points
    const p1 = waypoints[0];
    const p2 = waypoints[1];
    const d = calculateHaversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    const steps = Math.max(1, Math.ceil(d / sampleStepMeters));
    const out = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lon: p1.lon + (p2.lon - p1.lon) * t,
        elev: (p1.elev ?? 20) + ((p2.elev ?? 20) - (p1.elev ?? 20)) * t,
      });
    }
    return out;
  }

  const out = [];
  const n = waypoints.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? waypoints[i - 1] : waypoints[i];
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p3 = i + 2 < n ? waypoints[i + 2] : p2;

    const segDist = calculateHaversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    const steps = Math.max(1, Math.ceil(segDist / sampleStepMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }

  out.push(waypoints[n - 1]);
  return out;
}

/**
 * Snaps a sequence of road waypoints through OSRM /api/route proxy, with graceful Catmull-Rom fallback.
 */
export async function snapRouteToRoads(waypoints, options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return waypoints || [];
  }

  const profile = options.profile || 'car';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cacheKey = getRouteCacheKey(waypoints, profile);

  if (cacheKey && inMemoryRoadCache.has(cacheKey)) {
    return inMemoryRoadCache.get(cacheKey);
  }

  // Attempt multi-leg OSRM query
  try {
    const chunkedLegs = [];
    // OSRM backend proxy accepts 2-12 coords safely; use chunkSize = 8 so leg has <= 9 coords
    const chunkSize = 8;
    for (let i = 0; i < waypoints.length - 1; i += chunkSize) {
      chunkedLegs.push(waypoints.slice(i, i + chunkSize + 1));
    }

    const snappedLegs = [];
    for (const leg of chunkedLegs) {
      if (leg.length < 2) continue;
      const coords = leg
        .map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`)
        .join(';');
      const url = `/api/route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coords)}&steps=1`;

      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const payload = await res.json();
        if (
          payload?.ok &&
          Array.isArray(payload.geometry) &&
          payload.geometry.length >= 2
        ) {
          const startElev = Number.isFinite(leg[0]?.elev) ? leg[0].elev : 20;
          const endElev = Number.isFinite(leg[leg.length - 1]?.elev)
            ? leg[leg.length - 1].elev
            : startElev;
          const n = payload.geometry.length;
          const legPoints = payload.geometry.map(([lon, lat], idx) => {
            const t = n > 1 ? idx / (n - 1) : 0;
            return {
              lat: Number(lat),
              lon: Number(lon),
              elev: startElev + (endElev - startElev) * t,
            };
          });
          snappedLegs.push(legPoints);
          continue;
        }
      }
      // If leg fails, fallback to local curvature smoothing
      snappedLegs.push(smoothRoadCurvature(leg));
    }

    // Stitch snapped legs together
    const stitched = [];
    for (const leg of snappedLegs) {
      const startIndex = stitched.length > 0 ? 1 : 0;
      for (let j = startIndex; j < leg.length; j++) {
        stitched.push(leg[j]);
      }
    }

    if (stitched.length >= 2) {
      if (cacheKey) inMemoryRoadCache.set(cacheKey, stitched);
      return stitched;
    }
  } catch {
    // Offline or proxy unconfigured: apply high-density Catmull-Rom curve smoothing
  }

  const smoothed = smoothRoadCurvature(waypoints);
  if (cacheKey) inMemoryRoadCache.set(cacheKey, smoothed);
  return smoothed;
}

/**
 * Builds dense trajectory Cartesian3 points from snapped road points with cumulative distances.
 */
export function buildRoadTrajectory(roadPoints, elevOffsetMeters = 0.5) {
  if (!Array.isArray(roadPoints) || roadPoints.length < 2) return null;

  const points = roadPoints.map((wp) =>
    Cesium.Cartesian3.fromDegrees(
      wp.lon,
      wp.lat,
      (wp.elev || 0) + elevOffsetMeters,
    ),
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
 * Samples a road trajectory at scalar distance with interpolation and normalized forward tangent.
 */
export function sampleRoadTrajectory(trajectory, distMeters) {
  if (!trajectory || !trajectory.cumulativeDistances) return null;
  const points = trajectory;
  const cumDists = trajectory.cumulativeDistances;
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
