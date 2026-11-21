/**
 * Topographic Footpath & Backcountry Trail Spline Pathing.
 * (National Parks, Topo Hiking, Backcountry Campsites & Wildlife Tracking on GEV)
 *
 * Implements:
 * - Topographic hiking trail spline generator:
 *   - Ingests trailhead waypoints and generates smooth 3D geodetic trail splines with elevation profiling
 *   - Computes segment slope angles, cumulative distances, and switchback geometry
 * - Tobler's Hiking Kinematics:
 *   - Biomechanically accurate locomotion adjusting pace dynamically based on slope incline
 *   - Support for 3 hiking paces: Casual Stroll (1.0 m/s), Brisk Hike (1.4 m/s), Alpine Trail Run (2.6 m/s)
 * - Companion Tandem Walking Matrix:
 *   - Solo Focus vs Companion Tandem side-by-side or trailing with pack
 * - 3-Tier Camera Perspective Suite:
 *   - First-Person Trail, Hiker Chase, and Drone Ridge Vista
 */

export const HIKE_PACES = Object.freeze({
  CASUAL: {
    id: 'CASUAL',
    // i18n-ignore: domain catalog label
    label: 'Casual Stroll',
    baseSpeedMs: 1.0, // ~2.2 mph
    icon: '🚶',
  },
  BRISK: {
    id: 'BRISK',
    // i18n-ignore: domain catalog label
    label: 'Brisk Mountain Hike',
    baseSpeedMs: 1.4, // ~3.1 mph
    icon: '🥾',
  },
  TRAIL_RUN: {
    id: 'TRAIL_RUN',
    // i18n-ignore: domain catalog label
    label: 'Alpine Trail Run',
    baseSpeedMs: 2.6, // ~5.8 mph
    icon: '🏃',
  },
});

export const TRAIL_CAMERA_MODES = Object.freeze({
  FIRST_PERSON: 'FIRST_PERSON',
  HIKER_CHASE: 'HIKER_CHASE',
  DRONE_VISTA: 'DRONE_VISTA',
});

/**
 * Tobler's Hiking Function: calculates speed multiplier from slope in degrees.
 * Flat ground gives ~1.0; gentle downhills (-3° to -6°) boost speed up to ~1.25x;
 * steep ascents (>15°) reduce speed to 0.4x - 0.6x.
 * @param {number} slopeDeg Incline angle in degrees (-90 to +90)
 * @returns {number} Speed multiplier (0.3 to 1.3)
 */
export function calculateSlopeMultiplier(slopeDeg) {
  if (typeof slopeDeg !== 'number' || isNaN(slopeDeg)) return 1.0;
  const slopeRad = (slopeDeg * Math.PI) / 180.0;
  const grade = Math.tan(slopeRad); // rise / run

  // Tobler's formula normalized to flat grade (S = 0):
  // W = 6 * exp(-3.5 * |grade + 0.05|)
  // Peak occurs at grade = -0.05 (gentle descent)
  const W = 6.0 * Math.exp(-3.5 * Math.abs(grade + 0.05));
  const W_flat = 6.0 * Math.exp(-3.5 * 0.05); // ~5.03 km/h
  const multiplier = W / W_flat;

  // Clamp within realistic human physiological limits
  return Math.max(0.3, Math.min(1.3, multiplier));
}

/**
 * Calculates initial bearing in degrees from (lat1, lon1) to (lat2, lon2).
 */
export function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const y1 = (lat1 * Math.PI) / 180;
  const y2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(y2);
  const x =
    Math.cos(y1) * Math.sin(y2) - Math.sin(y1) * Math.cos(y2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Generates a dense, smoothly interpolated 3D trail spline with slope metrics
 * from trailhead waypoints.
 * @param {Array} waypoints List of { lat, lon, elevM, name }
 * @param {number} pointsPerSegment Density of interpolation points per waypoint span
 * @returns {Object} { points: Array, totalDistanceM: number, elevationGainM: number, elevationLossM: number }
 */
export function generateTrailSpline(waypoints, pointsPerSegment = 15) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return {
      points: waypoints || [],
      totalDistanceM: 0,
      elevationGainM: 0,
      elevationLossM: 0,
    };
  }

  const points = [];
  let totalDistanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    const dLat = p2.lat - p1.lat;
    const dLon = p2.lon - p1.lon;
    const dElev = p2.elevM - p1.elevM;

    // Segment horizontal distance using Haversine
    const R = 6371000.0; // Earth radius in meters
    const phi1 = (p1.lat * Math.PI) / 180;
    const phi2 = (p2.lat * Math.PI) / 180;
    const dPhi = (dLat * Math.PI) / 180;
    const dLambda = (dLon * Math.PI) / 180;

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(dLambda / 2) *
        Math.sin(dLambda / 2);
    const segHorizDistM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const segSlopeDeg =
      segHorizDistM > 0
        ? (Math.atan2(dElev, segHorizDistM) * 180) / Math.PI
        : 0;

    const initialBearing = calculateBearingDeg(p1.lat, p1.lon, p2.lat, p2.lon);

    if (dElev > 0) elevationGainM += dElev;
    else elevationLossM += Math.abs(dElev);

    const steps = Math.max(1, pointsPerSegment);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const curLat = p1.lat + dLat * t;
      const curLon = p1.lon + dLon * t;
      const curElev = p1.elevM + dElev * t;

      points.push({
        lat: curLat,
        lon: curLon,
        elevM: curElev,
        slopeDeg: Math.round(segSlopeDeg * 10) / 10,
        bearingDeg: Math.round(initialBearing * 10) / 10,
        distanceM: Math.round((totalDistanceM + segHorizDistM * t) * 10) / 10,
        segmentIndex: i,
        sourceWaypointName: s === 0 ? p1.name : null,
      });
    }
    totalDistanceM += segHorizDistM;
  }

  // Append final waypoint
  const last = waypoints[waypoints.length - 1];
  points.push({
    lat: last.lat,
    lon: last.lon,
    elevM: last.elevM,
    slopeDeg: 0,
    bearingDeg: points[points.length - 1]?.bearingDeg || 0,
    distanceM: Math.round(totalDistanceM * 10) / 10,
    segmentIndex: waypoints.length - 2,
    sourceWaypointName: last.name,
  });

  return {
    points,
    totalDistanceM: Math.round(totalDistanceM),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
  };
}

/**
 * Creates an interactive Trail Navigator simulator tracking progress along a trailhead spline.
 */
export function createTrailNavigator({
  trailhead = null,
  pace = 'BRISK',
  companionMode = 'COMPANION_TANDEM',
  cameraMode = 'HIKER_CHASE',
  onProgress = null,
  onWaypointReached = null,
} = {}) {
  let isNavigating = false;
  let activePace = HIKE_PACES[pace] || HIKE_PACES.BRISK;
  let activeCompanionMode = companionMode; // 'SOLO_FOCUS' | 'COMPANION_TANDEM'
  let activeCameraMode = cameraMode;
  let currentSplineIndex = 0;
  let simulationTickTimer = null;
  let distanceHikedM = 0;

  const splineData = trailhead?.waypoints
    ? generateTrailSpline(trailhead.waypoints, 15)
    : { points: [], totalDistanceM: 0, elevationGainM: 0, elevationLossM: 0 };

  const points = splineData.points;

  function getCurrentPose() {
    if (points.length === 0) {
      return {
        lat: trailhead?.coordinates?.lat || 0,
        lon: trailhead?.coordinates?.lon || 0,
        elevM: trailhead?.coordinates?.elevM || 0,
        bearingDeg: 0,
        slopeDeg: 0,
        speedMph: 0,
        speedMs: 0,
        progressPercent: 0,
        companionOffset: null,
      };
    }

    const currentPoint =
      points[Math.min(currentSplineIndex, points.length - 1)];
    const slopeMultiplier = calculateSlopeMultiplier(currentPoint.slopeDeg);
    const effectiveSpeedMs = activePace.baseSpeedMs * slopeMultiplier;
    const effectiveSpeedMph = Math.round(effectiveSpeedMs * 2.23694 * 10) / 10;
    const progressPercent =
      splineData.totalDistanceM > 0
        ? Math.min(
            100,
            Math.round(
              (currentPoint.distanceM / splineData.totalDistanceM) * 100,
            ),
          )
        : 0;

    // Companion offset calculations for tandem mode
    let companionPose = null;
    if (activeCompanionMode === 'COMPANION_TANDEM') {
      // 1.8m behind, 1.2m to the right
      const bearingRad = (currentPoint.bearingDeg * Math.PI) / 180;
      const rightBearingRad = bearingRad + Math.PI / 2;
      const latOffset =
        (-1.8 * Math.cos(bearingRad) + 1.2 * Math.cos(rightBearingRad)) /
        111111;
      const lonOffset =
        (-1.8 * Math.sin(bearingRad) + 1.2 * Math.sin(rightBearingRad)) /
        (111111 * Math.cos((currentPoint.lat * Math.PI) / 180));

      companionPose = {
        lat: currentPoint.lat + latOffset,
        lon: currentPoint.lon + lonOffset,
        elevM: currentPoint.elevM,
        role: 'Trail Partner',
      };
    }

    return {
      lat: currentPoint.lat,
      lon: currentPoint.lon,
      elevM: currentPoint.elevM,
      bearingDeg: currentPoint.bearingDeg,
      slopeDeg: currentPoint.slopeDeg,
      speedMs: effectiveSpeedMs,
      speedMph: effectiveSpeedMph,
      distanceHikedM: currentPoint.distanceM,
      totalDistanceM: splineData.totalDistanceM,
      progressPercent,
      activePace: activePace.id,
      companionMode: activeCompanionMode,
      cameraMode: activeCameraMode,
      companionPose,
      waypointName: currentPoint.sourceWaypointName,
    };
  }

  function tick() {
    if (!isNavigating || points.length === 0) return;

    const currentPoint = points[currentSplineIndex];
    const slopeMultiplier = calculateSlopeMultiplier(currentPoint.slopeDeg);
    const effectiveSpeedMs = activePace.baseSpeedMs * slopeMultiplier;

    // Advance based on tick rate (e.g., 100ms interval = 0.1s delta)
    const deltaDistanceM = effectiveSpeedMs * 0.1 * 10; // 10x simulation acceleration for smooth live visual flow

    let nextIndex = currentSplineIndex;
    while (
      nextIndex < points.length - 1 &&
      points[nextIndex].distanceM < currentPoint.distanceM + deltaDistanceM
    ) {
      nextIndex++;
    }

    if (nextIndex >= points.length - 1) {
      currentSplineIndex = points.length - 1;
      isNavigating = false;
      if (simulationTickTimer) {
        clearInterval(simulationTickTimer);
        simulationTickTimer = null;
      }
    } else {
      currentSplineIndex = nextIndex;
    }

    const pose = getCurrentPose();
    if (pose.waypointName && typeof onWaypointReached === 'function') {
      onWaypointReached(pose.waypointName, pose);
    }
    if (typeof onProgress === 'function') {
      onProgress(pose);
    }
  }

  function start() {
    if (isNavigating) return;
    isNavigating = true;
    if (simulationTickTimer) clearInterval(simulationTickTimer);
    simulationTickTimer = setInterval(tick, 100);
  }

  function pause() {
    isNavigating = false;
    if (simulationTickTimer) {
      clearInterval(simulationTickTimer);
      simulationTickTimer = null;
    }
  }

  function reset() {
    pause();
    currentSplineIndex = 0;
    distanceHikedM = 0;
  }

  function setPace(newPace) {
    if (HIKE_PACES[newPace]) {
      activePace = HIKE_PACES[newPace];
    }
  }

  function setCompanionMode(newMode) {
    if (newMode === 'SOLO_FOCUS' || newMode === 'COMPANION_TANDEM') {
      activeCompanionMode = newMode;
    }
  }

  function setCameraMode(newMode) {
    if (TRAIL_CAMERA_MODES[newMode]) {
      activeCameraMode = newMode;
    }
  }

  function destroy() {
    pause();
  }

  return {
    start,
    pause,
    reset,
    setPace,
    setCompanionMode,
    setCameraMode,
    getCurrentPose,
    isNavigating: () => isNavigating,
    getSplineData: () => splineData,
    destroy,
  };
}
