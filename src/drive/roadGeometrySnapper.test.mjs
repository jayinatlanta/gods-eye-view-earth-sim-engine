import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  getRouteCacheKey,
  catmullRomPoint,
  smoothRoadCurvature,
  snapRouteToRoads,
  buildRoadTrajectory,
  sampleRoadTrajectory,
  DEFAULT_ROAD_SAMPLE_STEP_METERS,
} from './roadGeometrySnapper.js';

test('getRouteCacheKey produces consistent key from waypoints', () => {
  assert.equal(getRouteCacheKey([]), '');
  assert.equal(getRouteCacheKey(null), '');

  const pts = [
    { lat: 33.749, lon: -84.388 },
    { lat: 33.755, lon: -84.390 },
  ];
  const key = getRouteCacheKey(pts, 'car');
  assert.ok(key.startsWith('car:33.7490,-84.3880->33.7550,-84.3900:2'));
});

test('catmullRomPoint computes intermediate coordinates', () => {
  const p0 = { lat: 33.0, lon: -84.0, elev: 10 };
  const p1 = { lat: 33.1, lon: -84.1, elev: 20 };
  const p2 = { lat: 33.2, lon: -84.2, elev: 30 };
  const p3 = { lat: 33.3, lon: -84.3, elev: 40 };

  const mid = catmullRomPoint(p0, p1, p2, p3, 0.5);
  assert.ok(mid.lat > 33.1 && mid.lat < 33.2);
  assert.ok(mid.lon < -84.1 && mid.lon > -84.2);
  assert.ok(mid.elev > 20 && mid.elev < 30);
});

test('smoothRoadCurvature densifies sparse waypoint sequences', () => {
  const single = [{ lat: 33.0, lon: -84.0 }];
  assert.deepEqual(smoothRoadCurvature(single), single);

  const twoPoints = [
    { lat: 33.7489, lon: -84.3881, elev: 100 },
    { lat: 33.755, lon: -84.39, elev: 120 },
  ];
  const smoothed2 = smoothRoadCurvature(twoPoints, 50.0);
  assert.ok(smoothed2.length > 2);
  assert.equal(smoothed2[0].lat, twoPoints[0].lat);
  assert.equal(smoothed2[smoothed2.length - 1].lat, twoPoints[1].lat);

  // Multi-point spline
  const multiPoints = [
    { lat: 33.7489, lon: -84.3881, elev: 100 },
    { lat: 33.752, lon: -84.389, elev: 105 },
    { lat: 33.755, lon: -84.39, elev: 110 },
    { lat: 33.76, lon: -84.385, elev: 115 },
  ];
  const smoothedMulti = smoothRoadCurvature(multiPoints, 100.0);
  assert.ok(smoothedMulti.length > multiPoints.length);
});

test('snapRouteToRoads resolves multi-leg route via fetch or fallback', async () => {
  const inputPts = [
    { lat: 33.7489, lon: -84.3881 },
    { lat: 33.755, lon: -84.39 },
  ];

  // Test 1: Successful mock fetch
  const mockFetch = async (url) => {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        geometry: [
          [-84.3881, 33.7489],
          [-84.3885, 33.751],
          [-84.39, 33.755],
        ],
      }),
    };
  };

  const snapped = await snapRouteToRoads(inputPts, { fetchImpl: mockFetch });
  assert.ok(snapped.length >= 3);
  assert.equal(snapped[0].lon, -84.3881);

  // Test 2: Fallback when fetch rejects
  const failFetch = async () => {
    throw new Error('Network offline');
  };
  const fallback = await snapRouteToRoads(
    [
      { lat: 40.7128, lon: -74.006 },
      { lat: 40.7589, lon: -73.9851 },
    ],
    { fetchImpl: failFetch },
  );
  assert.ok(fallback.length >= 2);
});

test('buildRoadTrajectory and sampleRoadTrajectory produce valid 3D Cesium motion vectors', () => {
  const roadPts = [
    { lat: 33.7489, lon: -84.3881, elev: 20 },
    { lat: 33.752, lon: -84.389, elev: 25 },
    { lat: 33.755, lon: -84.39, elev: 30 },
  ];

  const traj = buildRoadTrajectory(roadPts, 1.0);
  assert.ok(traj);
  assert.equal(traj.length, 3);
  assert.ok(traj.totalDistance > 0);
  assert.equal(traj.cumulativeDistances.length, 3);

  // Sample along trajectory
  const sampleStart = sampleRoadTrajectory(traj, 0);
  assert.ok(sampleStart);
  assert.ok(sampleStart.pos instanceof Cesium.Cartesian3);
  assert.ok(sampleStart.forward instanceof Cesium.Cartesian3);
  assert.equal(sampleStart.segmentIndex, 0);

  const sampleHalf = sampleRoadTrajectory(traj, traj.totalDistance / 2);
  assert.ok(sampleHalf);
  assert.ok(sampleHalf.distMeters > 0);

  // Sample wraps around loop
  const sampleOver = sampleRoadTrajectory(traj, traj.totalDistance + 10);
  assert.ok(sampleOver);
  assert.ok(sampleOver.distMeters >= 0 && sampleOver.distMeters <= traj.totalDistance);
});
