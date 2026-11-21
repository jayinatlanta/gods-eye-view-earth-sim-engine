import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  LIVING_CITIES,
  resolveCity,
  findNearestCity,
  haversineDistanceMeters,
  calculateHeadingDegrees,
  calculateSidewalkOffset,
  ALTITUDE_DEPTH_THRESHOLD_M,
  ALTITUDE_EXIT_THRESHOLD_M,
} from './cityWaypoints.js';

test('Living Cities — Catalog & Coordinates', async (t) => {
  await t.test('verifies all 10 iconic cities are cataloged with corridors', () => {
    const expected = [
      'atlanta', 'new_york', 'tokyo', 'london', 'paris',
      'san_francisco', 'monaco', 'singapore', 'chicago', 'sydney',
    ];
    for (const id of expected) {
      const city = LIVING_CITIES[id];
      assert.ok(city, `City ${id} must exist in catalog`);
      assert.ok(city.name, `City ${id} must have a name`);
      assert.ok(Number.isFinite(city.lat), `City ${id} must have lat`);
      assert.ok(Number.isFinite(city.lon), `City ${id} must have lon`);
      assert.ok(Array.isArray(city.corridors) && city.corridors.length > 0, `City ${id} must have corridors`);
      assert.ok(Array.isArray(city.landmarks) && city.landmarks.length > 0, `City ${id} must have landmarks`);
    }
  });

  await t.test('calculates accurate Haversine distance between coordinates', () => {
    // Atlanta (33.7490, -84.3880) to NYC (40.7128, -74.0060) is ~1,195 km (~1,195,000 m)
    const dist = haversineDistanceMeters(33.749, -84.388, 40.7128, -74.006);
    assert.ok(dist > 1180000 && dist < 1220000, `Distance should be ~1,195km, got ${dist}`);
  });

  await t.test('calculates accurate initial heading degrees', () => {
    // Heading due North from (0, 0) to (1, 0) is 0 / 360 deg
    const headingNorth = calculateHeadingDegrees(0, 0, 1, 0);
    assert.ok(Math.abs(headingNorth - 0) < 0.1 || Math.abs(headingNorth - 360) < 0.1);

    // Heading due East from (0, 0) to (0, 1) is 90 deg
    const headingEast = calculateHeadingDegrees(0, 0, 0, 1);
    assert.ok(Math.abs(headingEast - 90) < 0.1);
  });

  await t.test('projects sidewalk points laterally from road centerlines using right-vector math', () => {
    const p1 = { lat: 33.7725, lon: -84.3855, elev: 300 };
    const p2 = { lat: 33.7758, lon: -84.3847, elev: 300 };

    const offsetM = 5.0;
    const curbM = 0.2;
    const sidewalk = calculateSidewalkOffset(p1, p2, offsetM, curbM);

    assert.ok(sidewalk instanceof Cesium.Cartesian3);
    const c1 = Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.elev);
    const distFromCenter = Cesium.Cartesian3.distance(c1, sidewalk);

    // Distance should be approximately sqrt(offset^2 + curb^2) = sqrt(25 + 0.04) ~= 5.004m
    assert.ok(
      Math.abs(distFromCenter - 5.0) < 0.2,
      `Sidewalk point should be offset by ~5.0m, got ${distFromCenter}`,
    );
  });

  await t.test('finds the nearest city accurately within radius', () => {
    // Near Piedmont Park in Atlanta
    const nearest = findNearestCity(33.785, -84.372, 10000);
    assert.ok(nearest);
    assert.equal(nearest.id, 'atlanta');

    // In the middle of the Atlantic Ocean -> null
    const ocean = findNearestCity(25.0, -45.0, 10000);
    assert.equal(ocean, null);
  });

  await t.test('resolves cities by ID or fuzzy text search', () => {
    assert.equal(resolveCity('atlanta').id, 'atlanta');
    assert.equal(resolveCity('TOKYO').id, 'tokyo');
    assert.equal(resolveCity('New York City').id, 'new_york');
    assert.equal(resolveCity('London Bridge').id, 'london');
  });

  await t.test('verifies altitude depth gate thresholds', () => {
    assert.equal(ALTITUDE_DEPTH_THRESHOLD_M, 1500);
    assert.equal(ALTITUDE_EXIT_THRESHOLD_M, 2000);
  });
});
