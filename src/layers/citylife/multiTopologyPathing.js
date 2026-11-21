/**
 * Universal Multi-Topology Pathing Engine for Living World Simulator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Generalizes pathing beyond metropolitan concrete curbs to support:
 *   - SIDEWALK: Paved sidewalks (+4.5m lateral offset, +0.15m curb)
 *   - RURAL_SHOULDER: Unpaved dirt/gravel road shoulders (+1.8m offset facing traffic)
 *   - PIER_BOARDWALK: Wooden shrimping docks, slips, and marsh boardwalks at water level
 *   - AGRICULTURAL_SWATH: Parallel raster furrow splines across farmland with 180° headland hairpins
 *   - PASTURE_WANDER: Bounded 2D wander targets and boid flocking for livestock/fauna
 *   - MIDWAY_CONCOURSE: Car-free amusement park concourses and stone plazas
 *   - QUEUE_SWITCHBACK: Stanchion queue lines with 1.2m lane pitch and creeping cadence
 *   - COASTER_SPLINE: 3D closed-loop coaster rail splines with gravity plunge kinematics
 *   - MINIATURE_RAIL: Narrow-gauge perimeter train track loops
 */

import * as Cesium from 'cesium';

export const TOPOLOGY_MODES = Object.freeze({
  SIDEWALK: 'sidewalk',
  RURAL_SHOULDER: 'rural_shoulder',
  PIER_BOARDWALK: 'pier',
  AGRICULTURAL_SWATH: 'agricultural_swath',
  PASTURE_WANDER: 'pasture_wander',
  MIDWAY_CONCOURSE: 'midway_concourse',
  MALL_CONCOURSE: 'mall_concourse',
  QUEUE_SWITCHBACK: 'queue_switchback',
  COASTER_SPLINE: 'coaster_spline',
  MINIATURE_RAIL: 'miniature_rail',
  STUDIO_BACKLOT_LANE: 'studio_backlot_lane',
  DOLLY_TRACK_SPLINE: 'dolly_track_spline',
  CRANE_SWING_ARC: 'crane_swing_arc',
  FERRIS_WHEEL_RING: 'ferris_wheel_ring',
  TAILGATE_CLUSTER: 'tailgate_cluster',
  STADIUM_INGRESS_CORRIDOR: 'stadium_ingress_corridor',
  STADIUM_CONCOURSE_RING: 'stadium_concourse_ring',
});

/**
 * Calculates geodetic right-vector offset for rural shoulders or sidewalks.
 */
export function calculateShoulderOffset(
  p1,
  p2,
  offsetMeters = 1.8,
  elevationOffsetMeters = 0.05,
) {
  const c1 = Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.elev || 0);
  const c2 = Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.elev || 0);

  const v = Cesium.Cartesian3.subtract(c2, c1, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(v) < 1e-6) {
    return {
      lat: p1.lat,
      lon: p1.lon,
      elev: (p1.elev || 0) + elevationOffsetMeters,
      cartesian: Cesium.Cartesian3.fromDegrees(
        p1.lon,
        p1.lat,
        (p1.elev || 0) + elevationOffsetMeters,
      ),
    };
  }

  const u = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    c1,
    new Cesium.Cartesian3(),
  );
  const r = Cesium.Cartesian3.cross(v, u, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(r, r);

  const scaledR = Cesium.Cartesian3.multiplyByScalar(
    r,
    offsetMeters,
    new Cesium.Cartesian3(),
  );
  const scaledU = Cesium.Cartesian3.multiplyByScalar(
    u,
    elevationOffsetMeters,
    new Cesium.Cartesian3(),
  );

  const pos = Cesium.Cartesian3.add(c1, scaledR, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(pos, scaledU, pos);

  const carto = Cesium.Cartographic.fromCartesian(pos);
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
    elev: carto.height,
    cartesian: pos,
  };
}

/**
 * Generates parallel raster furrow lines across a bounding box with 180° headland turns.
 * Used for agricultural combines and tractors in farm parcels.
 */
export function generateFurrowRaster({
  minLat,
  maxLat,
  minLon,
  maxLon,
  swathCount = 6,
  elev = 290,
} = {}) {
  const waypoints = [];
  const latStep = (maxLat - minLat) / Math.max(1, swathCount - 1);

  for (let i = 0; i < swathCount; i++) {
    const curLat = minLat + i * latStep;
    // Alternate direction for realistic 180° headland hairpins
    if (i % 2 === 0) {
      waypoints.push({ lat: curLat, lon: minLon, elev });
      waypoints.push({ lat: curLat, lon: maxLon, elev });
    } else {
      waypoints.push({ lat: curLat, lon: maxLon, elev });
      waypoints.push({ lat: curLat, lon: minLon, elev });
    }
  }
  return waypoints;
}

/**
 * Calculates 3D roller coaster kinematics along 3D track points using conservation of energy:
 * v(h) = sqrt( max( 2.5^2, 2 * g * (h_apex - h) + v0^2 ) )
 */
export function calculateCoasterKinematics(
  waypoints = [],
  initialSpeedMs = 2.5,
  gravity = 9.81,
) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];

  // Determine apex elevation along the track
  let apexElev = -Infinity;
  for (const wp of waypoints) {
    if ((wp.elev || 0) > apexElev) apexElev = wp.elev || 0;
  }

  return waypoints.map((wp, idx) => {
    const elev = wp.elev || 0;
    const heightDelta = Math.max(0, apexElev - elev);

    // Is this segment a lift hill? (first ~25% or ascending steeply)
    const isLift = idx < Math.ceil(waypoints.length * 0.25) && elev < apexElev;
    const speedMs = isLift
      ? initialSpeedMs
      : Math.sqrt(
          Math.max(
            6.25,
            2 * gravity * heightDelta + initialSpeedMs * initialSpeedMs,
          ),
        );

    return {
      ...wp,
      speedMs: Math.min(speedMs, 42.0), // Cap at ~94 mph / 42 m/s for hyper/giga coaster sanity
      isLift,
      cartesian: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, elev),
    };
  });
}

/**
 * Generates a serpentine queue switchback stanchion path.
 */
export function generateSerpentineQueue(
  startLat,
  startLon,
  numLanes = 4,
  laneLengthMeters = 8.0,
  lanePitchMeters = 1.2,
  elev = 176,
) {
  const waypoints = [];
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111132 * Math.cos((startLat * Math.PI) / 180);

  const deltaLon = laneLengthMeters / metersPerDegLon;
  const pitchLat = lanePitchMeters / metersPerDegLat;

  for (let i = 0; i < numLanes; i++) {
    const curLat = startLat + i * pitchLat;
    if (i % 2 === 0) {
      waypoints.push({ lat: curLat, lon: startLon, elev, speedMs: 0.15 });
      waypoints.push({
        lat: curLat,
        lon: startLon + deltaLon,
        elev,
        speedMs: 0.15,
      });
    } else {
      waypoints.push({
        lat: curLat,
        lon: startLon + deltaLon,
        elev,
        speedMs: 0.15,
      });
      waypoints.push({ lat: curLat, lon: startLon, elev, speedMs: 0.15 });
    }
  }
  return waypoints;
}

/**
 * Generates a pseudo-random wander path within pasture polygon boundaries.
 */
export function generatePastureWander(
  perimeter = [],
  numWaypoints = 8,
  seed = 42,
) {
  if (!Array.isArray(perimeter) || perimeter.length < 3) return [];

  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  let avgElev = 0;

  for (const p of perimeter) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
    avgElev += p.elev || 0;
  }
  avgElev /= perimeter.length;

  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const waypoints = [];
  for (let i = 0; i < numWaypoints; i++) {
    const lat = minLat + rand() * (maxLat - minLat);
    const lon = minLon + rand() * (maxLon - minLon);
    waypoints.push({
      lat,
      lon,
      elev: avgElev,
      speedMs: 0.35 + rand() * 0.4, // Gentle livestock wander
      pauseDurationSec: rand() > 0.6 ? 4.0 + rand() * 8.0 : 0.0, // Grazing pause
    });
  }
  return waypoints;
}

/**
 * Generates a linear back-and-forth camera dolly track spline with smooth ease endpoints.
 */
export function generateDollyTrackSpline(
  startLat,
  startLon,
  lengthMeters = 28.0,
  headingDeg = 90,
  elev = 86,
  steps = 8,
) {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111132 * Math.cos((startLat * Math.PI) / 180);
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = (Math.cos(rad) * lengthMeters) / metersPerDegLat;
  const dLon = (Math.sin(rad) * lengthMeters) / metersPerDegLon;

  const waypoints = [];
  const segSteps = Math.max(2, steps);
  // Forward dolly push
  for (let i = 0; i <= segSteps; i++) {
    const t = i / segSteps;
    const lat = startLat + dLat * t;
    const lon = startLon + dLon * t;
    waypoints.push({
      lat,
      lon,
      elev: elev + 0.25,
      speedMs: 1.4,
      mode: TOPOLOGY_MODES.DOLLY_TRACK_SPLINE,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, elev + 0.25),
    });
  }
  // Reverse dolly pull back to one
  for (let i = segSteps - 1; i >= 1; i--) {
    const t = i / segSteps;
    const lat = startLat + dLat * t;
    const lon = startLon + dLon * t;
    waypoints.push({
      lat,
      lon,
      elev: elev + 0.25,
      speedMs: 1.4,
      mode: TOPOLOGY_MODES.DOLLY_TRACK_SPLINE,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, elev + 0.25),
    });
  }
  return waypoints;
}

/**
 * Generates a 3D elevated camera crane / Technocrane boom sweep arc.
 */
export function generateCraneSwingArc(
  centerLat,
  centerLon,
  radiusMeters = 12.0,
  minElev = 86,
  maxElev = 98,
  steps = 12,
) {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111132 * Math.cos((centerLat * Math.PI) / 180);
  const waypoints = [];
  const count = Math.max(4, steps);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = -Math.PI * 0.4 + Math.PI * 0.8 * Math.sin(t * Math.PI);
    const lat = centerLat + (Math.cos(angle) * radiusMeters) / metersPerDegLat;
    const lon = centerLon + (Math.sin(angle) * radiusMeters) / metersPerDegLon;
    const elev = minElev + (maxElev - minElev) * Math.sin(t * Math.PI);
    waypoints.push({
      lat,
      lon,
      elev,
      speedMs: 1.6,
      mode: TOPOLOGY_MODES.CRANE_SWING_ARC,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, elev),
    });
  }
  return waypoints;
}

/**
 * Generates a vertical 3D Ferris wheel orbital ring loop.
 */
export function generateFerrisWheelRing(
  centerLat,
  centerLon,
  radiusMeters = 22.0,
  baseElev = 35,
  steps = 16,
) {
  const metersPerDegLon = 111132 * Math.cos((centerLat * Math.PI) / 180);
  const waypoints = [];
  const count = Math.max(6, steps);

  for (let i = 0; i <= count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const lonOffset = (Math.cos(theta) * radiusMeters) / metersPerDegLon;
    const elevOffset = radiusMeters + Math.sin(theta) * radiusMeters;
    const lat = centerLat;
    const lon = centerLon + lonOffset;
    const elev = baseElev + elevOffset;
    waypoints.push({
      lat,
      lon,
      elev,
      speedMs: 2.2,
      mode: TOPOLOGY_MODES.FERRIS_WHEEL_RING,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, elev),
    });
  }
  return waypoints;
}

/**
 * Generates radial tailgate lot clusters with canopy positions, smoker grills, and lawn games.
 */
export function generateTailgateClusterPositions({
  centerLat,
  centerLon,
  baseElev = 0,
  lotRadiusMeters = 60,
  canopyCount = 24,
  grillCount = 12,
  seed = 1337,
} = {}) {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111132 * Math.cos((centerLat * Math.PI) / 180);

  const canopies = [];
  const grills = [];
  const games = [];
  const wanderWaypoints = [];

  // Deterministic PRNG
  let s = Math.abs(seed) || 1337;
  function rand() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }

  const canopyColors = [
    '#0039A6', // Royal Blue
    '#B3A369', // Tech Gold
    '#003057', // Tech Navy
    '#A71930', // Falcons Red
    '#97233F', // Cardinals Red
    '#E56020', // Suns Orange
    '#8C1D40', // Maroon
    '#FFC627', // Gold
    '#FFFFFF', // White
    '#2563EB', // Blue
  ];

  // Radial rows of canopies
  const ringCount = 3;
  for (let ring = 1; ring <= ringCount; ring++) {
    const ringRadius = lotRadiusMeters * (ring / (ringCount + 0.5));
    const perRing = Math.floor(canopyCount / ringCount);
    for (let c = 0; c < perRing; c++) {
      const angle =
        (c / perRing) * Math.PI * 2 + ring * 0.4 + (rand() - 0.5) * 0.2;
      const r = ringRadius + (rand() - 0.5) * 6.0;
      const lat = centerLat + (Math.cos(angle) * r) / metersPerDegLat;
      const lon = centerLon + (Math.sin(angle) * r) / metersPerDegLon;
      const color = canopyColors[(ring * perRing + c) % canopyColors.length];

      canopies.push({
        lat,
        lon,
        elev: baseElev,
        headingDeg: (angle * 180) / Math.PI,
        color,
        sizeMeters: 3.0, // standard 10x10ft canopy
        cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, baseElev),
      });

      // Wander waypoints between canopies
      if (c % 2 === 0) {
        wanderWaypoints.push({
          lat,
          lon,
          elev: baseElev,
          speedMs: 0.42,
          mode: TOPOLOGY_MODES.TAILGATE_CLUSTER,
        });
      }
    }
  }

  // Grills with rising smoke points
  for (let g = 0; g < grillCount; g++) {
    const idx = Math.floor(rand() * canopies.length);
    const hostCanopy = canopies[idx] || {
      lat: centerLat,
      lon: centerLon,
      elev: baseElev,
    };
    const angle = rand() * Math.PI * 2;
    const lat = hostCanopy.lat + (Math.cos(angle) * 2.5) / metersPerDegLat;
    const lon = hostCanopy.lon + (Math.sin(angle) * 2.5) / metersPerDegLon;

    grills.push({
      lat,
      lon,
      elev: baseElev,
      smokeIntensity: 0.75 + rand() * 0.25,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, baseElev),
    });
  }

  // Cornhole / lawn games
  const gameCount = Math.floor(canopyCount / 4);
  for (let m = 0; m < gameCount; m++) {
    const idx = (m * 4) % canopies.length;
    const hostCanopy = canopies[idx] || {
      lat: centerLat,
      lon: centerLon,
      elev: baseElev,
    };
    const angle = (m / gameCount) * Math.PI * 2;
    const lat = hostCanopy.lat + (Math.cos(angle) * 4.0) / metersPerDegLat;
    const lon = hostCanopy.lon + (Math.sin(angle) * 4.0) / metersPerDegLon;

    games.push({
      lat,
      lon,
      elev: baseElev,
      type: 'cornhole',
      headingDeg: (angle * 180) / Math.PI,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, baseElev),
    });
  }

  return {
    canopies,
    grills,
    games,
    wanderWaypoints,
  };
}

/**
 * Generates high-density directed ingress flow points channeling fans towards stadium turnstiles.
 */
export function generateIngressCorridorTrajectory({
  originLat,
  originLon,
  targetLat,
  targetLon,
  baseElev = 0,
  corridorWidthMeters = 12.0,
  stepIntervalMeters = 2.5,
  fanOffsetMeters = 0,
} = {}) {
  const c1 = Cesium.Cartesian3.fromDegrees(originLon, originLat, baseElev);
  const c2 = Cesium.Cartesian3.fromDegrees(targetLon, targetLat, baseElev);
  const totalDist = Cesium.Cartesian3.distance(c1, c2);
  const steps = Math.max(2, Math.ceil(totalDist / stepIntervalMeters));

  const trajectory = [];
  const p1 = { lat: originLat, lon: originLon, elev: baseElev };
  const p2 = { lat: targetLat, lon: targetLon, elev: baseElev };

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const curLat = p1.lat + (p2.lat - p1.lat) * t;
    const curLon = p1.lon + (p2.lon - p1.lon) * t;
    const curElev = p1.elev + (p2.elev - p1.elev) * t;

    const pt = calculateShoulderOffset(
      { lat: curLat, lon: curLon, elev: curElev },
      p2,
      fanOffsetMeters,
      0.1,
    );

    trajectory.push({
      lat: pt.lat,
      lon: pt.lon,
      elev: pt.elev,
      cartesian: pt.cartesian,
      mode: TOPOLOGY_MODES.STADIUM_INGRESS_CORRIDOR,
      speedMs: 1.25, // brisk gameday march
    });
  }

  return trajectory;
}

/**
 * Generates an elevated circular concourse ring for in-stadium circulation.
 */
export function generateStadiumConcourseRing(
  centerLat,
  centerLon,
  radiusMeters = 70.0,
  baseElev = 8.0,
  steps = 32,
) {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111132 * Math.cos((centerLat * Math.PI) / 180);
  const waypoints = [];
  const count = Math.max(8, steps);

  for (let i = 0; i <= count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const lat = centerLat + (Math.cos(theta) * radiusMeters) / metersPerDegLat;
    const lon = centerLon + (Math.sin(theta) * radiusMeters) / metersPerDegLon;
    const cart = Cesium.Cartesian3.fromDegrees(lon, lat, baseElev);

    waypoints.push({
      lat,
      lon,
      elev: baseElev,
      speedMs: 0.65,
      mode: TOPOLOGY_MODES.STADIUM_CONCOURSE_RING,
      cartesian: cart,
    });
  }
  return waypoints;
}

/**
 * Generates the full trajectory along a corridor according to its topology mode.
 */
export function generateMultiTopologyTrajectory(corridor, options = {}) {
  if (
    !corridor ||
    !Array.isArray(corridor.waypoints) ||
    corridor.waypoints.length < 2
  ) {
    return [];
  }

  const mode = corridor.type || TOPOLOGY_MODES.SIDEWALK;
  const sampleIntervalMeters = options.sampleIntervalMeters || 4;

  if (mode === TOPOLOGY_MODES.COASTER_SPLINE) {
    return calculateCoasterKinematics(
      corridor.waypoints,
      options.initialSpeedMs || 2.5,
    );
  }

  if (mode === TOPOLOGY_MODES.CRANE_SWING_ARC) {
    const wp0 = corridor.waypoints[0];
    return generateCraneSwingArc(
      wp0.lat,
      wp0.lon,
      options.radiusMeters || 12.0,
      wp0.elev || 86,
      (wp0.elev || 86) + 12.0,
    );
  }

  if (mode === TOPOLOGY_MODES.FERRIS_WHEEL_RING) {
    const wp0 = corridor.waypoints[0];
    return generateFerrisWheelRing(
      wp0.lat,
      wp0.lon,
      options.radiusMeters || 22.0,
      wp0.elev || 35,
    );
  }

  const trajectory = [];
  const waypoints = corridor.waypoints;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    const c1 = Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.elev || 0);
    const c2 = Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.elev || 0);
    const dist = Cesium.Cartesian3.distance(c1, c2);
    const steps = Math.max(1, Math.ceil(dist / sampleIntervalMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const curLat = p1.lat + (p2.lat - p1.lat) * t;
      const curLon = p1.lon + (p2.lon - p1.lon) * t;
      const curElev = (p1.elev || 0) + ((p2.elev || 0) - (p1.elev || 0)) * t;

      let pt;
      if (mode === TOPOLOGY_MODES.RURAL_SHOULDER) {
        pt = calculateShoulderOffset(
          { lat: curLat, lon: curLon, elev: curElev },
          p2,
          options.offsetMeters || 1.8,
          options.elevationOffset || 0.08,
        );
      } else if (mode === TOPOLOGY_MODES.PIER_BOARDWALK) {
        // Pier centerline with water-level elevation (+0.8m)
        const cart = Cesium.Cartesian3.fromDegrees(
          curLon,
          curLat,
          curElev + 0.8,
        );
        pt = { lat: curLat, lon: curLon, elev: curElev + 0.8, cartesian: cart };
      } else if (mode === TOPOLOGY_MODES.MIDWAY_CONCOURSE) {
        // Broad concourse with randomized lateral jitter
        const jitter = Math.sin(s * 1.5) * (options.concourseWidth || 4.0);
        pt = calculateShoulderOffset(
          { lat: curLat, lon: curLon, elev: curElev },
          p2,
          jitter,
          0.05,
        );
      } else if (mode === TOPOLOGY_MODES.MALL_CONCOURSE) {
        // Broad indoor marble/terrazzo mall concourse with pedestrian wandering spread
        const jitter = Math.sin(s * 1.8) * (options.concourseWidth || 3.5);
        pt = calculateShoulderOffset(
          { lat: curLat, lon: curLon, elev: curElev },
          p2,
          jitter,
          0.05,
        );
      } else if (mode === TOPOLOGY_MODES.DOLLY_TRACK_SPLINE) {
        // Precision steel camera dolly track centerline (+0.25m track height)
        const cart = Cesium.Cartesian3.fromDegrees(
          curLon,
          curLat,
          curElev + 0.25,
        );
        pt = {
          lat: curLat,
          lon: curLon,
          elev: curElev + 0.25,
          cartesian: cart,
        };
      } else if (mode === TOPOLOGY_MODES.STUDIO_BACKLOT_LANE) {
        // Studio soundstage alley & backlot street shoulder (+2.4m offset)
        pt = calculateShoulderOffset(
          { lat: curLat, lon: curLon, elev: curElev },
          p2,
          options.offsetMeters || 2.4,
          options.elevationOffset || 0.1,
        );
      } else {
        // Default standard sidewalk offset
        pt = calculateShoulderOffset(
          { lat: curLat, lon: curLon, elev: curElev },
          p2,
          options.offsetMeters || 4.5,
          options.elevationOffset || 0.15,
        );
      }

      trajectory.push({
        lat: pt.lat,
        lon: pt.lon,
        elev: pt.elev,
        cartesian: pt.cartesian,
        mode,
        speedMs: p1.speedMs || options.speedMs || 0.48,
      });
    }
  }

  // Include final point
  const lastWp = waypoints[waypoints.length - 1];
  trajectory.push({
    lat: lastWp.lat,
    lon: lastWp.lon,
    elev: lastWp.elev || 0,
    cartesian: Cesium.Cartesian3.fromDegrees(
      lastWp.lon,
      lastWp.lat,
      lastWp.elev || 0,
    ),
    mode,
    speedMs: lastWp.speedMs || options.speedMs || 0.48,
  });

  return trajectory;
}
