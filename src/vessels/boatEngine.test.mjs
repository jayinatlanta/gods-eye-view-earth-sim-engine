import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  VESSEL_CLASSES,
  WATER_PRESETS,
  calculateHaversineDistance,
  calculateNauticalDistance,
  knotsToMetersPerSecond,
  metersPerSecondToKnots,
  knotsToMph,
  calculateWaterRouteDistance,
  calculateWaterTravelDurationSeconds,
  resolveWaterPreset,
  resolveWaterWaypoints,
  sampleWaterSurfaceAltitude,
} from './waterWaypoints.js';
import {
  generateBoatTrajectory,
  applyBoatCameraFollow,
  createBoatEngine,
  WATER_SURFACE_OFFSET_METERS,
} from '../layers/vessels/boatEngine.js';

describe('World of Sails — Water Waypoints & Vessel Hydrodynamics', () => {
  it('correctly calculates Haversine and nautical distance formulas', () => {
    // Distance from Savannah (31.9565, -81.0425) to Wassaw Sound (31.8950, -80.9350)
    const meters = calculateHaversineDistance(31.9565, -81.0425, 31.8950, -80.9350);
    assert.ok(meters > 11000 && meters < 14000, `Expected ~12km, got ${meters}`);

    const nmi = calculateNauticalDistance(31.9565, -81.0425, 31.8950, -80.9350);
    assert.ok(nmi > 6 && nmi < 8, `Expected ~6.7 NM, got ${nmi}`);
  });

  it('correctly converts velocities between knots, m/s, and mph', () => {
    // 1 knot = 0.514444 m/s
    const mps = knotsToMetersPerSecond(10);
    assert.ok(Math.abs(mps - 5.144) < 0.01, `Expected ~5.14 m/s, got ${mps}`);

    const backKnots = metersPerSecondToKnots(mps);
    assert.ok(Math.abs(backKnots - 10) < 0.01, `Expected 10 knots, got ${backKnots}`);

    // 10 knots = 11.51 mph
    const mph = knotsToMph(10);
    assert.ok(Math.abs(mph - 11.51) < 0.05, `Expected ~11.51 mph, got ${mph}`);
  });

  it('verifies all vessel classes have valid hydrodynamic and camera contracts', () => {
    const requiredClasses = ['sloop', 'motorboat', 'yacht'];
    for (const cId of requiredClasses) {
      const cls = VESSEL_CLASSES[cId];
      assert.ok(cls, `Missing vessel class: ${cId}`);
      assert.ok(cls.name && typeof cls.name === 'string');
      assert.ok(cls.minSpeedKnots < cls.maxSpeedKnots);
      assert.ok(
        cls.defaultSpeedKnots >= cls.minSpeedKnots &&
          cls.defaultSpeedKnots <= cls.maxSpeedKnots,
      );
      assert.ok(cls.draftOffsetMeters > 0);
      assert.ok(
        cls.cameraOffsets?.helm &&
          cls.cameraOffsets?.chase &&
          cls.cameraOffsets?.flybridge &&
          cls.cameraOffsets?.overview,
      );
    }
  });

  it('verifies coastal and inland waterbody presets adhere to the inland elevation contract', () => {
    // Coastal ocean presets should be at sea level (0m)
    assert.equal(WATER_PRESETS.savannah_barrier_islands.nominalElevationM, 0);
    assert.equal(WATER_PRESETS.savannah_barrier_islands.isOcean, true);
    assert.equal(WATER_PRESETS.key_west.nominalElevationM, 0);
    assert.equal(WATER_PRESETS.san_francisco_bay.nominalElevationM, 0);

    // Inland lake presets must anchor real-world elevated surfaces
    // Lake Lanier (GA): ~326m (1,071 ft MSL)
    assert.equal(WATER_PRESETS.lake_lanier.nominalElevationM, 326);
    assert.equal(WATER_PRESETS.lake_lanier.isOcean, false);
    assert.ok(WATER_PRESETS.lake_lanier.waypoints.length >= 4);

    // Lake Tahoe (CA/NV): ~1,897m (6,225 ft MSL)
    assert.equal(WATER_PRESETS.lake_tahoe.nominalElevationM, 1897);
    assert.equal(WATER_PRESETS.lake_tahoe.isOcean, false);

    // Lake Allatoona (GA): ~256m
    assert.equal(WATER_PRESETS.lake_allatoona.nominalElevationM, 256);
  });

  it('resolves presets by ID, name, or region fuzzy search', () => {
    const p1 = resolveWaterPreset('lake_lanier');
    assert.ok(p1 && p1.id === 'lake_lanier');

    const p2 = resolveWaterPreset('Lake Tahoe');
    assert.ok(p2 && p2.id === 'lake_tahoe');

    const p3 = resolveWaterPreset('Florida Keys');
    assert.ok(p3 && p3.id === 'key_west');
  });

  it('resolves custom coordinate routes and calculates duration', () => {
    const route = resolveWaterWaypoints('31.9565, -81.0425', '31.8950, -80.9350', {
      vesselClass: 'motorboat',
      speedKnots: 30,
    });

    assert.ok(route);
    assert.equal(route.vesselClass, 'motorboat');
    assert.equal(route.speedKnots, 30);
    assert.ok(route.totalDistanceMeters > 10000);
    assert.ok(route.totalDistanceNmi > 5);
    assert.ok(route.durationSec > 0);
  });

  it('solves the inland elevation trap via sampleWaterSurfaceAltitude', () => {
    // 1. Without viewer globe (fallback)
    const fallbackAlt = sampleWaterSurfaceAltitude(null, -84.02, 34.18, 0.5);
    assert.equal(fallbackAlt, 0.5);

    // 2. Mock viewer with Lake Lanier elevation (+326m)
    const mockLanierViewer = {
      scene: {
        globe: {
          getHeight: () => 326.4,
        },
      },
    };
    const lanierAlt = sampleWaterSurfaceAltitude(mockLanierViewer, -84.02, 34.18, 0.5);
    assert.equal(lanierAlt, 326.9); // 326.4 + 0.5 draft offset

    // 3. Mock viewer with Lake Tahoe elevation (+1897m)
    const mockTahoeViewer = {
      scene: {
        globe: {
          getHeight: () => 1897.2,
        },
      },
    };
    const tahoeAlt = sampleWaterSurfaceAltitude(mockTahoeViewer, -120.03, 39.09, 0.8);
    assert.equal(tahoeAlt, 1898.0);
  });

  it('generates a smooth Cartesian trajectory along waypoints', () => {
    const waypoints = WATER_PRESETS.lake_lanier.waypoints;
    const trajectory = generateBoatTrajectory(waypoints, {
      sampleIntervalMeters: 50,
      draftOffset: WATER_SURFACE_OFFSET_METERS,
    });

    assert.ok(Array.isArray(trajectory));
    assert.ok(trajectory.length >= waypoints.length);
  });

  it('calibrates camera perspectives to gaze along horizon and prevents nadir top-down drop', () => {
    let lastView = null;
    const mockViewer = {
      camera: {
        setView: (opts) => {
          lastView = opts;
        },
      },
      scene: {
        globe: {
          getHeight: () => 0.0,
        },
        screenSpaceCameraController: {},
      },
    };

    // Position in Savannah coastal waters
    const position = Cesium.Cartesian3.fromDegrees(-81.0425, 31.9565, 0.5);
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      position,
      new Cesium.Cartesian3(),
    );
    // Forward vector perpendicular to up
    const northVec = Cesium.Cartesian3.fromDegrees(-81.0425, 31.9665, 0.5);
    const forwardVec = Cesium.Cartesian3.subtract(
      northVec,
      position,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(forwardVec, forwardVec);

    // 1. Test Overview Mode (Regional tactical oblique view)
    applyBoatCameraFollow(
      mockViewer,
      position,
      forwardVec,
      'overview',
      'motorboat',
    );
    assert.ok(lastView && lastView.destination && lastView.orientation);
    const camDist = Cesium.Cartesian3.distance(lastView.destination, position);
    assert.ok(
      camDist > 7000 && camDist < 11000,
      `Expected overview distance ~8.9km, got ${camDist}`,
    );
    const dotFwdOverview = Cesium.Cartesian3.dot(
      lastView.orientation.direction,
      forwardVec,
    );
    const dotUpOverview = Cesium.Cartesian3.dot(
      lastView.orientation.direction,
      up,
    );
    // Not looking straight down (nadir would be dotUp ~ -1.0)
    assert.ok(
      dotFwdOverview > 0.6,
      `Overview must look forward along course, got dot=${dotFwdOverview}`,
    );
    assert.ok(
      dotUpOverview > -0.8 && dotUpOverview < -0.3,
      `Overview pitch must be ~34 deg oblique, got dotUp=${dotUpOverview}`,
    );

    // 2. Test Chase Mode (Deck & wake view)
    applyBoatCameraFollow(mockViewer, position, forwardVec, 'chase', 'sloop');
    const dotFwdChase = Cesium.Cartesian3.dot(
      lastView.orientation.direction,
      forwardVec,
    );
    const dotUpChase = Cesium.Cartesian3.dot(
      lastView.orientation.direction,
      up,
    );
    assert.ok(
      dotFwdChase > 0.9,
      `Chase must look forward along vessel track, got dot=${dotFwdChase}`,
    );
    assert.ok(
      dotUpChase > -0.3 && dotUpChase < 0.1,
      `Chase pitch must look along horizon, got dotUp=${dotUpChase}`,
    );
    // Level Horizon Contract: Zero roll contamination
    const dotUpRollChase = Cesium.Cartesian3.dot(lastView.orientation.up, up);
    assert.ok(
      Math.abs(dotUpRollChase - 1.0) < 1e-6,
      `Chase camera must have zero roll (level horizon), got dotUpRoll=${dotUpRollChase}`,
    );

    // 3. Test Helm Mode (First-person helm perspective)
    applyBoatCameraFollow(mockViewer, position, forwardVec, 'helm', 'yacht');
    const dotFwdHelm = Cesium.Cartesian3.dot(
      lastView.orientation.direction,
      forwardVec,
    );
    assert.ok(
      dotFwdHelm > 0.98,
      `Helm must look straight ahead toward horizon, got dot=${dotFwdHelm}`,
    );
    const dotUpRollHelm = Cesium.Cartesian3.dot(lastView.orientation.up, up);
    assert.ok(
      Math.abs(dotUpRollHelm - 1.0) < 1e-6,
      `Helm camera must have zero roll (level horizon), got dotUpRoll=${dotUpRollHelm}`,
    );
  });

  it('engine supports camera modes, snapBack, and free cam detachment', () => {
    const mockViewer = {
      camera: {
        setView: () => {},
      },
      scene: {
        canvas: {},
      },
      entities: {
        add: () => ({}),
        remove: () => {},
      },
    };

    const engine = createBoatEngine({ viewer: mockViewer });
    assert.ok(typeof engine.setCameraMode === 'function');
    assert.ok(typeof engine.snapBack === 'function');

    // Switch camera modes
    assert.equal(engine.setCameraMode('overview'), 'overview');
    assert.equal(engine.setCameraMode('free'), 'free');
    assert.equal(engine.snapBack('chase'), 'chase');
    assert.equal(engine.snapBack('helm'), 'helm');

    engine.destroy();
  });
});
