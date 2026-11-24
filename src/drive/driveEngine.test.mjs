import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  DRIVE_CORRIDORS,
  MAX_OSRM_SUBLEG_KM,
  MAX_OSRM_TOTAL_KM,
  subdivideDriveLeg,
  resolveDriveCorridor,
  resolveDriveWaypoints,
  resolveDriveWaypointsAsync,
  calculateHaversineDistance,
  calculateHeadingDegrees,
  calculateTravelDurationSeconds,
  calculateCurvatureSpeedLimits,
  fetchDriveRouteGeometry,
  fetchMultiLegDriveRouteGeometry,
  fetchMultiLegDriveRouteWithStatus,
} from './driveWaypoints.js';
import {
  generateDriveTrajectory,
  createDriveEngine,
  calculateDotHeadingVector,
  calculateDotOrientation,
  applyCameraFollow,
  isPlausible3DGroundSample,
  ROAD_SURFACE_OFFSET_METERS,
  SEAT_VIEW_OFFSET,
  CHASE_VIEW_OFFSET,
  COPTER_VIEW_OFFSET,
} from '../layers/drive/driveEngine.js';
import { createDriveDrawer } from './driveDrawer.js';

test('resolveDriveCorridor correctly matches IDs, aliases, and corridor names', () => {
  const bullrun = resolveDriveCorridor('cannonball_bullrun');
  assert.ok(bullrun);
  assert.equal(bullrun.id, 'cannonball_bullrun');
  assert.equal(bullrun.from.name, 'Red Ball Garage (Manhattan, NYC)');
  assert.equal(bullrun.to.name, 'Portofino Hotel (Redondo Beach, CA)');
  assert.equal(bullrun.defaultSpeedMph, 95);

  const bullrunAlias = resolveDriveCorridor('bullrun');
  assert.ok(bullrunAlias);
  assert.equal(bullrunAlias.id, 'cannonball_bullrun');

  const savannah = resolveDriveCorridor('savannah');
  assert.ok(savannah);
  assert.equal(savannah.id, 'atlanta_savannah');

  const pch = resolveDriveCorridor('pch');
  assert.ok(pch);
  assert.equal(pch.id, 'pacific_coast_highway');

  const blueRidge = resolveDriveCorridor('blue ridge');
  assert.ok(blueRidge);
  assert.equal(blueRidge.id, 'blue_ridge_parkway');

  assert.equal(resolveDriveCorridor('UNKNOWN_DRIVE_ROUTE_XYZ'), null);
  assert.equal(resolveDriveCorridor(null), null);
});

test('resolveDriveWaypoints formats preset and parses custom coordinate pairs', () => {
  const resultPreset = resolveDriveWaypoints('cannonball_bullrun', null, {
    speedMph: 100,
  });
  assert.ok(resultPreset);
  assert.equal(resultPreset.id, 'cannonball_bullrun');
  assert.ok(resultPreset.waypoints.length >= 70);
  assert.ok(resultPreset.totalDistanceMeters > 3000000); // > 3,000 km transcontinental
  assert.ok(resultPreset.durationSec > 0);
  assert.ok(
    resultPreset.curvatureSpeeds.length === resultPreset.waypoints.length,
  );

  // Validate dense waypoint coverage across all long highway presets
  assert.ok(
    DRIVE_CORRIDORS.atlanta_orlando.waypoints.length >= 45,
    'Atlanta-Orlando dense I-75/Turnpike waypoints',
  );
  assert.ok(
    DRIVE_CORRIDORS.miami_new_orleans.waypoints.length >= 65,
    'Miami-New Orleans dense I-10 Gulf Coast waypoints',
  );
  assert.ok(
    DRIVE_CORRIDORS.pacific_coast_highway.waypoints.length >= 45,
    'PCH dense coastal waypoints',
  );
  assert.ok(
    DRIVE_CORRIDORS.blue_ridge_parkway.waypoints.length >= 30,
    'Blue Ridge dense Appalachian waypoints',
  );
  assert.ok(
    DRIVE_CORRIDORS.atlanta_savannah.waypoints.length >= 20,
    'Atlanta-Savannah dense I-16 waypoints',
  );
  assert.ok(
    DRIVE_CORRIDORS.princeton_baltimore.waypoints.length >= 20,
    'Princeton-Baltimore dense I-95 waypoints',
  );

  // Custom coordinate input
  const resultCustom = resolveDriveWaypoints(
    '33.7490,-84.3880',
    '32.0809,-81.0912',
    {
      speedMph: 75,
    },
  );
  assert.ok(resultCustom);
  assert.equal(resultCustom.id, 'custom_drive_corridor');
  assert.equal(resultCustom.from.lat, 33.749);
  assert.equal(resultCustom.to.lat, 32.0809);
  assert.ok(resultCustom.totalDistanceMeters > 300000); // ~350 km Atlanta to Savannah

  // Smart pairing matching (e.g. New York to Los Angeles)
  const resultSmartNYLA = resolveDriveWaypoints('New York', 'Los Angeles');
  assert.ok(resultSmartNYLA);
  assert.equal(resultSmartNYLA.id, 'cannonball_bullrun');
  assert.ok(!resultSmartNYLA.isFallback);

  const resultSmartAtlSav = resolveDriveWaypoints('Atlanta', 'Savannah');
  assert.ok(resultSmartAtlSav);
  assert.equal(resultSmartAtlSav.id, 'atlanta_savannah');
  assert.ok(!resultSmartAtlSav.isFallback);
});

test('resolveDriveWaypointsAsync resolves smart pairs immediately and geocodes unknown locations', async () => {
  let geocodeCalls = 0;
  const mockFetch = async (url) => {
    geocodeCalls++;
    if (url.includes('Miami')) {
      return {
        ok: true,
        json: async () => ({
          results: [{ name: 'Miami, FL', lat: 25.7617, lon: -80.1918 }],
        }),
      };
    }
    if (url.includes('Key%20West') || url.includes('Key+West')) {
      return {
        ok: true,
        json: async () => ({
          results: [{ name: 'Key West, FL', lat: 24.5551, lon: -81.78 }],
        }),
      };
    }
    return { ok: false };
  };

  // Smart pair (NY to LA) should NOT invoke geocode API
  const nyla = await resolveDriveWaypointsAsync('New York', 'LA', {
    fetchImpl: mockFetch,
  });
  assert.ok(nyla);
  assert.equal(nyla.id, 'cannonball_bullrun');
  assert.equal(
    geocodeCalls,
    0,
    'Should not geocode known smart corridor pairs',
  );

  // Unknown city pair (Miami to Key West) should invoke geocode API and return custom corridor
  const miamiKw = await resolveDriveWaypointsAsync('Miami', 'Key West', {
    fetchImpl: mockFetch,
  });
  assert.ok(miamiKw);
  assert.equal(miamiKw.id, 'custom_drive_corridor');
  assert.equal(miamiKw.from.name, 'Miami, FL');
  assert.equal(miamiKw.to.name, 'Key West, FL');
  assert.equal(geocodeCalls, 2);
});

test('calculateCurvatureSpeedLimits detects sharp turns and reduces highway speed', () => {
  const straightRoute = [
    { lat: 33.0, lon: -84.0 },
    { lat: 33.1, lon: -84.0 },
    { lat: 33.2, lon: -84.0 },
    { lat: 33.3, lon: -84.0 },
  ];
  const straightSpeeds = calculateCurvatureSpeedLimits(straightRoute, 75);
  for (const s of straightSpeeds) {
    assert.equal(s, 75);
  }

  // Route with a sharp 90-degree corner
  const cornerRoute = [
    { lat: 33.0, lon: -84.0 },
    { lat: 33.1, lon: -84.0 }, // Heading ~0 deg
    { lat: 33.1, lon: -83.9 }, // Turn 90 deg East
    { lat: 33.1, lon: -83.8 },
  ];
  const cornerSpeeds = calculateCurvatureSpeedLimits(cornerRoute, 75);
  assert.ok(
    cornerSpeeds[1] <= 35,
    `Expected deceleration at turn, got ${cornerSpeeds[1]}`,
  );
});

test('calculateHaversineDistance, calculateHeadingDegrees and calculateTravelDurationSeconds compute accurate physics', () => {
  const dist = calculateHaversineDistance(33.749, -84.388, 32.0809, -81.0912);
  assert.ok(dist > 340000 && dist < 380000); // ~355 km

  const heading = calculateHeadingDegrees(33.749, -84.388, 32.0809, -81.0912);
  assert.ok(heading > 110 && heading < 140); // Southeast heading (~125 degrees)

  // Duration at 75 mph (~33.5 m/s): ~355,000 / 33.5 = ~10,500s (~2.9 hrs)
  const duration = calculateTravelDurationSeconds(dist, 75);
  assert.ok(duration > 9000 && duration < 12000);
});

test('generateDriveTrajectory computes smooth Cartesian3 trajectory with road elevation offset and globe height', () => {
  const waypoints = [
    { lat: 33.749, lon: -84.388, elev: 320 },
    { lat: 33.755, lon: -84.385, elev: 315 },
    { lat: 33.76, lon: -84.38, elev: 310 },
  ];

  const mockViewerWithGlobe = {
    scene: {
      globe: {
        getHeight: (carto) => 325.0, // Globe reports terrain is at 325m
      },
    },
  };

  const trajectory = generateDriveTrajectory(waypoints, {
    sampleIntervalMeters: 50,
    roadOffsetMeters: ROAD_SURFACE_OFFSET_METERS,
    viewer: mockViewerWithGlobe,
  });

  assert.ok(Array.isArray(trajectory));
  assert.ok(trajectory.length > 5);
  assert.ok(trajectory[0] instanceof Cesium.Cartesian3);

  const cartoFirst = Cesium.Cartographic.fromCartesian(trajectory[0]);
  // Should clamp to max(320, 325) + ROAD_SURFACE_OFFSET_METERS = 325.8
  assert.ok(
    Math.abs(cartoFirst.height - (325 + ROAD_SURFACE_OFFSET_METERS)) < 0.1,
  );
});

test('calculateDotHeadingVector and calculateDotOrientation compute valid vectors for traffic dots', () => {
  const pA = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 320);
  const pB = Cesium.Cartesian3.fromDegrees(-84.388, 33.755, 320); // Northward

  const dot = {
    waypoints: [pA, pB],
    segIdx: 0,
    direction: 1,
    point: { position: pA },
  };

  const forward = calculateDotHeadingVector(dot);
  assert.ok(forward instanceof Cesium.Cartesian3);
  assert.ok(Math.abs(Cesium.Cartesian3.magnitude(forward) - 1.0) < 1e-4);

  const orientation = calculateDotOrientation(dot);
  assert.ok(orientation instanceof Cesium.Quaternion);

  // Test reverse direction
  dot.direction = -1;
  const forwardRev = calculateDotHeadingVector(dot);
  assert.ok(Math.abs(Cesium.Cartesian3.dot(forward, forwardRev) + 1.0) < 1e-4);
});

test('applyCameraFollow configures camera destination and orientation for chase, seat and copter', () => {
  let lastCameraView = null;
  const mockViewer = {
    camera: {
      setView: (params) => {
        lastCameraView = params;
      },
    },
  };

  const pos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 320);
  const forward = new Cesium.Cartesian3(0, 1, 0);

  // 1. Chase mode
  applyCameraFollow(mockViewer, pos, forward, 'chase');
  assert.ok(lastCameraView);
  assert.ok(lastCameraView.destination instanceof Cesium.Cartesian3);
  assert.ok(lastCameraView.orientation.direction instanceof Cesium.Cartesian3);
  assert.ok(lastCameraView.orientation.up instanceof Cesium.Cartesian3);

  // 2. Seat mode
  applyCameraFollow(mockViewer, pos, forward, 'seat');
  assert.ok(lastCameraView);

  // 3. Copter mode
  applyCameraFollow(mockViewer, pos, forward, 'copter');
  assert.ok(lastCameraView);
});

test('applyCameraFollow clamps camera strictly above terrain even when vehicle elevation is subterranean', () => {
  let lastCameraView = null;
  const mockViewer = {
    camera: {
      setView: (opts) => {
        lastCameraView = opts;
      },
    },
    scene: {
      globe: {
        getHeight: () => 150.0, // Terrain is at 150m elevation
      },
    },
  };

  // Subterranean vehicle position: only at 10m altitude (140m underground!)
  const subterraneanPos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 10);
  const forward = Cesium.Cartesian3.fromDegrees(-84.388, 33.755, 10);
  const forwardVec = Cesium.Cartesian3.subtract(
    forward,
    subterraneanPos,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(forwardVec, forwardVec);

  // Seat mode
  applyCameraFollow(mockViewer, subterraneanPos, forwardVec, 'seat');
  assert.ok(lastCameraView);
  const camCarto = Cesium.Cartographic.fromCartesian(
    lastCameraView.destination,
  );
  // Must be clamped to >= 150m + 1.25m = 151.25m
  assert.ok(
    camCarto.height >= 151.2,
    `Camera in seat mode must be above ground 150m, got height ${camCarto.height}`,
  );

  // Chase mode
  applyCameraFollow(mockViewer, subterraneanPos, forwardVec, 'chase');
  assert.ok(lastCameraView);
  const chaseCarto = Cesium.Cartographic.fromCartesian(
    lastCameraView.destination,
  );
  // Must be clamped to >= 150m + 3.5m = 153.5m
  assert.ok(
    chaseCarto.height >= 153.4,
    `Camera in chase mode must be above ground 150m, got height ${chaseCarto.height}`,
  );
});

test('createDriveEngine manages highway cruiser simulation lifecycle, camera views and pullOver parking', async () => {
  const addedEntities = [];
  const removedEntities = [];
  let setViewCalled = false;

  const mockViewer = {
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: Cesium.JulianDate.now(),
      shouldAnimate: false,
      multiplier: 1.0,
      clockRange: null,
      onTick: {
        addEventListener: () => () => {},
      },
    },
    entities: {
      add: (ent) => {
        addedEntities.push(ent);
        return ent;
      },
      remove: (ent) => {
        removedEntities.push(ent);
        return true;
      },
    },
    camera: {
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(-84.388),
        Cesium.Math.toRadians(33.749),
        500,
      ),
      setView: () => {
        setViewCalled = true;
      },
    },
    scene: {
      preRender: {
        addEventListener: () => () => {},
      },
      globe: {
        getHeight: () => 320,
      },
    },
    trackedEntity: undefined,
  };

  const engine = createDriveEngine({ viewer: mockViewer });

  const drive = await engine.startRouteDrive('atlanta_savannah', null, {
    speedMph: 75,
    cameraMode: 'chase',
    useOsrm: false,
  });

  assert.ok(drive);
  assert.equal(drive.corridor.id, 'atlanta_savannah');
  assert.equal(addedEntities.length, 2); // Highway polyline path + Cruiser vehicle entity
  assert.equal(
    mockViewer.trackedEntity,
    undefined,
    'Custom preRender follow must keep viewer.trackedEntity cleared',
  );
  assert.equal(engine.getCameraMode(), 'chase');
  assert.ok(setViewCalled);

  // Assert vehicle box is transparent wireframe with correct car dimensions (X length, Y width, Z height)
  const cruiser = addedEntities[1];
  assert.equal(cruiser.box.fill, false);
  assert.equal(cruiser.box.outline, true);
  assert.equal(cruiser.box.dimensions.x, 4.8);
  assert.equal(cruiser.box.dimensions.y, 2.0);
  assert.equal(cruiser.box.dimensions.z, 1.4);

  // Test camera switching
  engine.setCameraMode('seat');
  assert.equal(engine.getCameraMode(), 'seat');
  engine.setCameraMode('copter');
  assert.equal(engine.getCameraMode(), 'copter');

  const current = engine.getActiveDrive();
  assert.equal(current.vehicleName, drive.vehicleName);

  // Test overview, free cam, and snapBack
  engine.setCameraMode('overview');
  assert.equal(engine.getCameraMode(), 'overview');

  engine.setCameraMode('free');
  assert.equal(engine.getCameraMode(), 'free');

  // Telemetry check
  const telem = engine.getActiveTelemetry();
  assert.ok(telem, 'Telemetry must be available during active drive');
  assert.equal(telem.isTrafficStalker, false);
  assert.ok(telem.currentLocation, 'Must have current location name');
  assert.ok(telem.nextLocation, 'Must have next location name');
  assert.ok(Number.isFinite(telem.speedMph));
  assert.ok(telem.progressPct >= 0 && telem.progressPct <= 100);

  // Snap back restores chase or seat view
  engine.snapBack('seat');
  assert.equal(engine.getCameraMode(), 'seat');

  // Test pull over (parking stage)
  const parkResult = engine.pullOver();
  assert.equal(parkResult.status, 'parked');
  assert.equal(engine.isParked(), true);
  assert.equal(mockViewer.clock.shouldAnimate, false);

  // Second pull over clears drive
  const clearResult = engine.pullOver();
  assert.equal(clearResult.status, 'cleared');
  assert.equal(engine.getActiveDrive(), null);
  assert.equal(removedEntities.length, 2);

  engine.destroy();
});

test('createDriveEngine supports Mode 1 Traffic Stalker latching and onTrafficLatched callbacks', () => {
  const addedEntities = [];
  let trafficLatchedDot = null;

  const mockViewer = {
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: Cesium.JulianDate.now(),
      shouldAnimate: false,
      onTick: {
        addEventListener: () => () => {},
      },
    },
    entities: {
      add: (ent) => {
        addedEntities.push(ent);
        return ent;
      },
      remove: () => true,
    },
    camera: {
      positionCartographic: new Cesium.Cartographic(0, 0, 100),
      setView: () => {},
    },
    scene: {
      preRender: {
        addEventListener: () => () => {},
      },
    },
    trackedEntity: undefined,
  };

  const pA = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 320);
  const pB = Cesium.Cartesian3.fromDegrees(-84.388, 33.755, 320);

  const mockTrafficDot = {
    id: 42,
    mps: 25,
    waypoints: [pA, pB],
    segIdx: 0,
    direction: 1,
    point: {
      position: pA,
    },
    road: { key: 'I-75 Connector' },
  };

  const engine = createDriveEngine({ viewer: mockViewer });
  engine.onTrafficLatched((dot) => {
    trafficLatchedDot = dot;
  });

  const stalker = engine.latchOntoTraffic(mockTrafficDot, {
    cameraMode: 'chase',
  });

  assert.ok(stalker);
  assert.equal(stalker.isTrafficStalker, true);
  assert.equal(stalker.dotId, 42);
  assert.equal(stalker.speedMph, 56); // 25 m/s * 2.23694 = ~56 mph
  assert.equal(
    mockViewer.trackedEntity,
    undefined,
    'Traffic stalker preRender follow must keep viewer.trackedEntity cleared',
  );
  assert.equal(engine.getCameraMode(), 'chase');

  // Assert stalker entity box is transparent wireframe with identical car dimensions
  const stalkerEntity = addedEntities[0];
  assert.equal(stalkerEntity.box.fill, false);
  assert.equal(stalkerEntity.box.outline, true);
  assert.equal(stalkerEntity.box.dimensions.x, 4.8);
  assert.equal(stalkerEntity.box.dimensions.y, 2.0);
  assert.equal(stalkerEntity.box.dimensions.z, 1.4);

  engine.stopDrive();
  assert.equal(engine.getActiveDrive(), null);
  engine.destroy();
});

test('fetchMultiLegDriveRouteGeometry stitches multi-leg route geometry and falls back gracefully', async () => {
  const waypoints = [
    { lat: 33.749, lon: -84.388, elev: 320 },
    { lat: 32.84, lon: -83.632, elev: 100 },
    { lat: 32.08, lon: -81.091, elev: 10 },
  ];

  // Mock fetch returning realistic OSRM geometry for each leg
  const mockFetch = async (url) => {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        profile: 'car',
        distanceM: 150000,
        durationS: 5400,
        geometry: [
          [-84.388, 33.749],
          [-84.1, 33.4],
          [-83.632, 32.84],
        ],
      }),
    };
  };

  const stitched = await fetchMultiLegDriveRouteGeometry(waypoints, {
    fetchImpl: mockFetch,
    profile: 'car',
  });

  assert.ok(Array.isArray(stitched));
  assert.ok(stitched.length >= 4);
  assert.equal(stitched[0].lat, 33.749);
  assert.equal(stitched[stitched.length - 1].lat, 32.84);
});

test('generateDriveTrajectory adaptively samples long corridors (Bullrun) to <= 1500 points and decimates dense paths', () => {
  const bullrunWaypoints = DRIVE_CORRIDORS.cannonball_bullrun.waypoints;
  const trajectory = generateDriveTrajectory(bullrunWaypoints);

  assert.ok(Array.isArray(trajectory));
  // Bullrun (4,000+ km) must produce between 800 and 1500 points, never 270k points!
  assert.ok(
    trajectory.length >= 800 && trajectory.length <= 1500,
    `Bullrun points should be bounded, got ${trajectory.length}`,
  );

  // Test dense waypoint decimation: 3,000 points must be decimated to <= 1500
  const dense = Array.from({ length: 3000 }, (_, i) => ({
    lat: 33.749 + i * 0.0001,
    lon: -84.388 + i * 0.0001,
    elev: 320,
  }));
  const decimatedTraj = generateDriveTrajectory(dense);
  assert.ok(
    decimatedTraj.length <= 1500,
    `Dense path should be decimated to <= 1500 points, got ${decimatedTraj.length}`,
  );
});

test('startRouteDrive snaps regional preset corridors and custom drives to OSRM roads while skipping ultra-long transcontinental presets', async () => {
  let fetchCallCount = 0;
  let lastFetchedUrl = '';

  const mockFetch = async (url) => {
    fetchCallCount++;
    lastFetchedUrl = url;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        profile: 'car',
        distanceM: 5000,
        durationS: 300,
        geometry: [
          [-84.388, 33.749],
          [-84.385, 33.785],
        ],
      }),
    };
  };

  const addedEntities = [];
  const mockViewer = {
    entities: {
      add: (opts) => {
        addedEntities.push(opts);
        return { ...opts, id: 'entity-' + addedEntities.length };
      },
      remove: () => {},
    },
    scene: {
      preRender: { addEventListener: () => () => {} },
      canvas: { width: 800, height: 600 },
      globe: { getHeight: () => 20 },
    },
    camera: { setView: () => {} },
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
    },
    trackedEntity: undefined,
  };

  const engine = createDriveEngine({
    viewer: mockViewer,
    fetchImpl: mockFetch,
  });

  // 1. Ultra-long transcontinental preset (Bullrun > MAX_OSRM_TOTAL_KM): skips OSRM automatically
  await engine.startRouteDrive('cannonball_bullrun', null);
  assert.equal(
    fetchCallCount,
    0,
    'Transcontinental preset (>2500 km) should skip OSRM automatically',
  );

  // 2. Regional highway preset (e.g. Atlanta -> Savannah <= 2500 km): MUST query OSRM so vehicle follows real roads
  await engine.startRouteDrive('atlanta_savannah', null, {
    osrmPaceMs: 0,
    osrmRetryDelayMs: 0,
  });
  assert.ok(
    fetchCallCount > 0,
    'Regional preset corridor must query OSRM so Infinite Drive follows real roads instead of straight terrain lines',
  );
  assert.ok(
    lastFetchedUrl.includes('/api/route'),
    'Regional preset corridor should query /api/route for street geometry',
  );

  // 3. Custom point-to-point drive: MUST call fetch to follow streets/bridges
  const prevCount = fetchCallCount;
  await engine.startRouteDrive('33.749,-84.388', '33.785,-84.385');
  assert.ok(fetchCallCount > prevCount, 'Custom drive should query route proxy');
  assert.ok(
    lastFetchedUrl.includes('/api/route'),
    'Should query /api/route for street geometry',
  );

  engine.destroy();
});

test('property-to-property road trip in Google 3D Tiles starts above surface and preserves outlined contact when switching to non-3D preset', async () => {
  const addedEntities = [];
  const preRenderCallbacks = [];
  let lastCameraSetView = null;
  let is3DMode = true;
  let sampled3DHeight = 312.0; // Atlanta Google 3D Tiles surface height
  let globe2DHeight = 298.0; // Non-3D terrain height

  const mockViewer = {
    entities: {
      add: (opts) => {
        const ent = { ...opts, id: 'entity-' + (addedEntities.length + 1) };
        addedEntities.push(ent);
        return ent;
      },
      remove: () => {},
    },
    scene: {
      preRender: {
        addEventListener: (cb) => {
          preRenderCallbacks.push(cb);
          return () => {};
        },
      },
      canvas: { width: 800, height: 600 },
      sampleHeightSupported: true,
      sampleHeight: (_carto, exclude) => {
        // Verify vehicle entity is excluded from self-hit raycast
        assert.ok(
          Array.isArray(exclude),
          'sampleHeight must pass exclude list',
        );
        return is3DMode ? sampled3DHeight : undefined;
      },
      globe: {
        get show() {
          return !is3DMode;
        },
        getHeight: () => (is3DMode ? undefined : globe2DHeight),
      },
      requestRender: () => {},
    },
    camera: {
      setView: (opts) => {
        lastCameraSetView = opts;
      },
    },
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
    },
    trackedEntity: undefined,
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      profile: 'car',
      distanceM: 12000,
      durationS: 600,
      geometry: [
        [-84.388, 33.749],
        [-84.3125, 33.8],
        [-84.3845, 33.7848],
      ],
    }),
  });

  const engine = createDriveEngine({
    viewer: mockViewer,
    fetchImpl: mockFetch,
  });

  // Start a property-to-property road trip (Eastside -> Midtown) in Google 3D Tiles
  await engine.startRouteDrive(
    { lat: 33.749, lon: -84.388 },
    { lat: 33.7848, lon: -84.3845 },
    { vehicleName: 'Electric Sedan' },
  );

  const cruiser = addedEntities.find((e) => e.name === 'Electric Sedan');
  assert.ok(cruiser, 'Vehicle entity must be spawned');
  assert.equal(cruiser.box.outline, true);
  assert.ok(cruiser.point, 'High-visibility point reticle must be attached');

  // Verify Frame 0 starts strictly above the Google 3D Tiles surface (312m + 0.8m = 312.8m)
  const initialCarPos = cruiser.position.getValue(mockViewer.clock.currentTime);
  const initialCarCarto = Cesium.Cartographic.fromCartesian(initialCarPos);
  assert.ok(
    Math.abs(initialCarCarto.height - (sampled3DHeight + 0.8)) < 0.05,
    `Vehicle must start at 3D tile surface + 0.8m (312.8m), got ${initialCarCarto.height}`,
  );
  assert.ok(lastCameraSetView, 'Camera setView must be called on Frame 0');
  const initialCamCarto = Cesium.Cartographic.fromCartesian(
    lastCameraSetView.destination,
  );
  assert.ok(
    initialCamCarto.height > sampled3DHeight + 3.0,
    `Camera must start above 3D tile surface, got ${initialCamCarto.height}`,
  );

  // Now simulate switching visual preset to a non-3D map stack (globe.show = true) after trip starts
  is3DMode = false;
  globe2DHeight = 345.0; // Suppose non-3D terrain at this point is 345m
  for (const cb of preRenderCallbacks) cb();

  const switchedCarPos = cruiser.position.getValue(
    mockViewer.clock.currentTime,
  );
  const switchedCarCarto = Cesium.Cartographic.fromCartesian(switchedCarPos);
  const switchedCamCarto = Cesium.Cartographic.fromCartesian(
    lastCameraSetView.destination,
  );

  // Both the outlined vehicle contact AND the camera must re-clamp together to the non-3D surface!
  assert.ok(
    Math.abs(switchedCarCarto.height - (globe2DHeight + 0.8)) < 0.05,
    `Vehicle entity must clamp to non-3D surface (345.8m) so contact is never lost, got ${switchedCarCarto.height}`,
  );
  assert.ok(
    Math.abs(switchedCamCarto.height - switchedCarCarto.height - 12.0) < 1.0,
    `Chase camera must stay 12m above the clamped vehicle contact (${switchedCarCarto.height + 12.0}m), got ${switchedCamCarto.height}`,
  );

  engine.destroy();
});

test('OSRM >550 km leg subdivision routes Orlando District <-> Piedmont Hub symmetrically under server cap', async () => {
  const originHub = {
    lat: 28.5383,
    lon: -81.3792,
    name: 'Orlando District Hub',
  };
  const destinationHub = {
    lat: 33.749,
    lon: -84.388,
    name: 'Piedmont Hub, GA',
  };

  // Verify direct distance is ~646 km (>550 km previous skip cap, >600 km server limit)
  const directKm =
    calculateHaversineDistance(
      originHub.lat,
      originHub.lon,
      destinationHub.lat,
      destinationHub.lon,
    ) / 1000;
  assert.ok(directKm > 640 && directKm < 680, `Expected ~646 km, got ${directKm}`);

  // Subdivide produces <= MAX_OSRM_SUBLEG_KM sub-legs symmetrically in both directions
  const forwardSub = subdivideDriveLeg(originHub, destinationHub);
  const reverseSub = subdivideDriveLeg(destinationHub, originHub);
  assert.equal(forwardSub.length, 3);
  assert.equal(reverseSub.length, 3);
  assert.ok(
    Math.abs(forwardSub[1].lat - reverseSub[1].lat) < 1e-5 &&
      Math.abs(forwardSub[1].lon - reverseSub[1].lon) < 1e-5,
    'Subdivision midpoint must be identical in both directions',
  );

  const inspectSubLegQueries = async (fromPt, toPt) => {
    const queriedLegKm = [];
    const mockFetch = async (url) => {
      const parsed = new URL(url, 'http://localhost');
      const coordsParam = parsed.searchParams.get('coords') || '';
      const [p1Str, p2Str] = coordsParam.split(';');
      const [lon1, lat1] = p1Str.split(',').map(Number);
      const [lon2, lat2] = p2Str.split(',').map(Number);
      const subKm =
        calculateHaversineDistance(lat1, lon1, lat2, lon2) / 1000;
      queriedLegKm.push(subKm);
      assert.ok(
        subKm <= MAX_OSRM_SUBLEG_KM + 1 && subKm < 600,
        `Sub-leg ${subKm.toFixed(1)} km must stay safely below ROUTE_MAX_LEG_KM=600`,
      );
      const midLat = (lat1 + lat2) / 2 + 0.05;
      const midLon = (lon1 + lon2) / 2 - 0.05;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          profile: 'car',
          distanceM: Math.round(subKm * 1150),
          durationS: 12000,
          geometry: [
            [lon1, lat1],
            [midLon, midLat],
            [lon2, lat2],
          ],
        }),
      };
    };

    const res = await fetchMultiLegDriveRouteWithStatus([fromPt, toPt], {
      fetchImpl: mockFetch,
      profile: 'car',
      paceMs: 0,
      retryDelayMs: 0,
    });
    return { res, queriedLegKm };
  };

  const fwd = await inspectSubLegQueries(originHub, destinationHub);
  const rev = await inspectSubLegQueries(destinationHub, originHub);

  assert.equal(fwd.queriedLegKm.length, 2);
  assert.equal(rev.queriedLegKm.length, 2);
  assert.equal(fwd.res.status, 'osrm');
  assert.equal(rev.res.status, 'osrm');
  assert.equal(fwd.res.osrmLegs, 2);
  assert.equal(rev.res.osrmLegs, 2);
  // 3 points from sub-leg 1 + 2 non-duplicate points from sub-leg 2 = 5 stitched vertices
  assert.equal(fwd.res.points.length, 5);
  assert.equal(rev.res.points.length, 5);
  assert.ok(
    fwd.res.points.every((pt) => Number.isFinite(pt.elev)),
    'All stitched OSRM vertices must preserve interpolated elevation',
  );
});

test('OSRM retries transient 429/5xx errors and surfaces explicit fallback telemetry when routing fails', async () => {
  const originHub = { lat: 28.5383, lon: -81.3792 };
  const destinationHub = { lat: 33.749, lon: -84.388 };

  // 1. Transient 429 then 503 then 200 succeeds after bounded retries
  let attempts = 0;
  const retrySuccessFetch = async (url) => {
    attempts++;
    const parsed = new URL(url, 'http://localhost');
    const [p1Str, p2Str] = (parsed.searchParams.get('coords') || '').split(';');
    const [lon1, lat1] = p1Str.split(',').map(Number);
    const [lon2, lat2] = p2Str.split(',').map(Number);
    if (attempts === 1) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => '1' },
      };
    }
    if (attempts === 2) {
      return { ok: false, status: 503 };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        geometry: [
          [lon1, lat1],
          [(lon1 + lon2) / 2, (lat1 + lat2) / 2],
          [lon2, lat2],
        ],
      }),
    };
  };

  const recovered = await fetchMultiLegDriveRouteWithStatus(
    [originHub, destinationHub],
    {
      fetchImpl: retrySuccessFetch,
      maxRetries: 2,
      retryDelayMs: 0,
      paceMs: 0,
    },
  );
  assert.equal(recovered.status, 'osrm');
  assert.equal(recovered.reason, null);
  assert.ok(attempts >= 4, 'Must retry transient failures and still complete both sub-legs');

  // 2. Persistent failure exposes straight_fallback with explicit reason
  const failingFetch = async () => ({ ok: false, status: 503 });
  const failed = await fetchMultiLegDriveRouteWithStatus(
    [originHub, destinationHub],
    {
      fetchImpl: failingFetch,
      maxRetries: 1,
      retryDelayMs: 0,
      paceMs: 0,
    },
  );
  assert.equal(failed.status, 'straight_fallback');
  assert.match(failed.reason || '', /503/);
  assert.equal(failed.fallbackLegs, 2);

  // 3. Partial OSRM (one sub-leg succeeds, second fails) reports partial_osrm
  let subIdx = 0;
  const partialFetch = async (url) => {
    subIdx++;
    if (subIdx === 1) {
      const parsed = new URL(url, 'http://localhost');
      const [p1Str, p2Str] = (parsed.searchParams.get('coords') || '').split(';');
      const [lon1, lat1] = p1Str.split(',').map(Number);
      const [lon2, lat2] = p2Str.split(',').map(Number);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          geometry: [
            [lon1, lat1],
            [lon2, lat2],
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: 'no route found' }),
    };
  };

  const partial = await fetchMultiLegDriveRouteWithStatus(
    [originHub, destinationHub],
    {
      fetchImpl: partialFetch,
      maxRetries: 0,
      retryDelayMs: 0,
      paceMs: 0,
    },
  );
  assert.equal(partial.status, 'partial_osrm');
  assert.equal(partial.osrmLegs, 1);
  assert.equal(partial.fallbackLegs, 1);
  assert.match(partial.reason || '', /no route found/i);

  // 4. Route exceeding MAX_OSRM_TOTAL_KM (2,500 km) skips OSRM cleanly with reason
  let calledTooLong = 0;
  const tooLong = await fetchMultiLegDriveRouteWithStatus(
    [
      { lat: 40.7128, lon: -74.006 },
      { lat: 34.0522, lon: -118.2437 },
    ],
    {
      fetchImpl: async () => {
        calledTooLong++;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    },
  );
  assert.equal(calledTooLong, 0);
  assert.equal(tooLong.status, 'straight_fallback');
  assert.match(tooLong.reason || '', /2,500/);
  assert.ok(MAX_OSRM_TOTAL_KM === 2500);
});

test('driveEngine ignores Google 3D Tiles rooftop spikes, clears trackedEntity, and calls cancelFlight', async () => {
  assert.equal(isPlausible3DGroundSample(315, 320, 314), true);
  assert.equal(isPlausible3DGroundSample(365, 320, 314), false); // +45m rooftop spike
  assert.equal(isPlausible3DGroundSample(270, 320, 314), false); // -50m subterranean void

  const preRenderCallbacks = [];
  let lastCameraSetView = null;
  let cancelFlightCalls = 0;
  let sampleHeightCalls = 0;
  let mockSampleHeightVal = 415.0; // +95m skyscraper rooftop spike above 320m road grade!

  const mockViewer = {
    entities: {
      add: (opts) => ({ ...opts, id: 'ent-' + Math.random() }),
      remove: () => {},
    },
    scene: {
      globe: {
        show: false, // Google Photorealistic 3D Tiles active
        getHeight: () => undefined,
      },
      sampleHeightSupported: true,
      sampleHeight: () => {
        sampleHeightCalls++;
        return mockSampleHeightVal;
      },
      preRender: {
        addEventListener: (cb) => {
          preRenderCallbacks.push(cb);
          return () => {};
        },
      },
      requestRender: () => {},
    },
    camera: {
      cancelFlight: () => {
        cancelFlightCalls++;
      },
      setView: (opts) => {
        lastCameraSetView = opts;
      },
    },
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
    },
    trackedEntity: { id: 'stale-entity' },
  };

  // 1. generateDriveTrajectory must reject +95m rooftop spike in 3D mode
  const traj = generateDriveTrajectory(
    [
      { lat: 33.749, lon: -84.388, elev: 320 },
      { lat: 33.775, lon: -84.27, elev: 320 },
    ],
    { viewer: mockViewer, sampleIntervalMeters: 100 },
  );
  assert.ok(traj.length >= 2);
  for (const pt of traj) {
    const h = Cesium.Cartographic.fromCartesian(pt).height;
    assert.ok(
      Math.abs(h - (320 + ROAD_SURFACE_OFFSET_METERS)) < 1.0,
      `Trajectory point must stay near 320.8m road grade despite 415m building spike, got ${h}`,
    );
  }

  // 2. applyCameraFollow in 3D mode must anchor to smooth vehicle road floor (NOT 415m rooftop behind car)
  sampleHeightCalls = 0;
  const vehiclePos = Cesium.Cartesian3.fromDegrees(
    -84.388,
    33.749,
    320 + ROAD_SURFACE_OFFSET_METERS,
  );
  const forwardVec = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(
      Cesium.Cartesian3.fromDegrees(-84.27, 33.775, 320.8),
      vehiclePos,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  applyCameraFollow(mockViewer, vehiclePos, forwardVec, 'chase', []);
  assert.equal(
    sampleHeightCalls,
    0,
    'applyCameraFollow must not raycast roadside rooftops in Google 3D Tiles mode',
  );
  const followCamH = Cesium.Cartographic.fromCartesian(
    lastCameraSetView.destination,
  ).height;
  assert.ok(
    followCamH < 340,
    `Chase camera must stay around ~332m above 320m road, never spike onto 415m roof (got ${followCamH})`,
  );

  // 3. startRouteDrive, setCameraMode (overview/free/chase), and snapBack clear trackedEntity and call cancelFlight
  const engine = createDriveEngine({
    viewer: mockViewer,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        geometry: [
          [-84.388, 33.749],
          [-84.27, 33.775],
        ],
      }),
    }),
  });

  const drive = await engine.startRouteDrive(
    { lat: 33.749, lon: -84.388, elev: 320 },
    { lat: 33.775, lon: -84.27, elev: 320 },
    { osrmPaceMs: 0, osrmRetryDelayMs: 0 },
  );
  assert.ok(drive);
  assert.equal(drive.routeStatus, 'osrm');
  assert.equal(mockViewer.trackedEntity, undefined);
  assert.ok(cancelFlightCalls >= 1, 'startRouteDrive must invoke cancelFlight');

  // Google 3D Tiles non-starvation: 60 consecutive preRender frames must throttle scene.sampleHeight
  // so Cesium jobScheduler.disableThisFrame() never starves photorealistic 3D tile refinement.
  let sampleHeightCallsDuringPreRender = 0;
  const origSample = mockViewer.scene.sampleHeight;
  mockViewer.scene.sampleHeight = (...args) => {
    sampleHeightCallsDuringPreRender += 1;
    return origSample(...args);
  };
  for (let frame = 0; frame < 60; frame++) {
    for (const cb of preRenderCallbacks) cb();
  }
  assert.ok(
    sampleHeightCallsDuringPreRender <= 2,
    `Google 3D preRender must throttle scene.sampleHeight to avoid tile starvation, got ${sampleHeightCallsDuringPreRender} calls across 60 frames`,
  );
  mockViewer.scene.sampleHeight = origSample;

  // Tick preRender with 415m rooftop spike — vehicle and camera must remain un-spiked
  for (const cb of preRenderCallbacks) cb();
  const telem = engine.getActiveTelemetry();
  assert.equal(telem.routeStatus, 'osrm');
  assert.ok(
    telem.elev < 330,
    `Vehicle telemetry elevation must ignore 415m rooftop spike (got ${telem.elev})`,
  );

  const callsBeforeModes = cancelFlightCalls;
  engine.setCameraMode('overview');
  engine.setCameraMode('free');
  engine.snapBack('chase');
  assert.ok(
    cancelFlightCalls >= callsBeforeModes + 3,
    'setCameraMode (overview, free) and snapBack must invoke cancelFlight',
  );
  assert.equal(mockViewer.trackedEntity, undefined);

  engine.destroy();
});

test('driveDrawer surfaces OSRM vs Straight-Line Fallback status and reason', async () => {
  const createStubEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      style: {},
      children: [],
      listeners: {},
      _innerHTML: '',
      _textContent: '',
      value: '',
      checked: true,
      classList: {
        _set: new Set(),
        add(c) {
          this._set.add(c);
        },
        remove(c) {
          this._set.delete(c);
        },
        contains(c) {
          return this._set.has(c);
        },
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      remove() {},
      addEventListener(ev, fn) {
        (this.listeners[ev] ||= []).push(fn);
      },
      click() {
        for (const fn of this.listeners.click || []) fn({ stopPropagation() {} });
      },
      set innerHTML(val) {
        this._innerHTML = val;
      },
      get innerHTML() {
        return this._innerHTML;
      },
      set textContent(val) {
        this._textContent = val;
      },
      get textContent() {
        return this._textContent;
      },
      querySelector(sel) {
        const cls = sel.startsWith('.') ? sel.slice(1) : sel;
        this._cache ||= new Map();
        if (!this._cache.has(cls)) {
          this._cache.set(cls, createStubEl('div'));
        }
        return this._cache.get(cls);
      },
      querySelectorAll() {
        return [];
      },
    };
    return el;
  };

  const origDoc = globalThis.document;
  const origRaf = globalThis.requestAnimationFrame;
  const body = createStubEl('body');
  globalThis.document = {
    body,
    createElement: (tag) => createStubEl(tag),
  };
  globalThis.requestAnimationFrame = () => {};

  try {
    let nextResult = {
      corridor: { name: 'Custom Drive' },
      speedMph: 75,
      routeStatus: 'osrm',
      routeFallbackReason: null,
    };
    const mockEngine = {
      startRouteDrive: async () => nextResult,
      getActiveTelemetry: () => ({
        isTrafficStalker: false,
        currentLocation: 'Orlando District Hub',
        nextLocation: 'Piedmont Hub',
        distToNextMi: 410,
        distTraveledMi: 0,
        totalDistMi: 410,
        progressPct: 0,
        speedMph: 75,
        cameraMode: 'chase',
        isParked: false,
        routeStatus: nextResult.routeStatus,
        routeFallbackReason: nextResult.routeFallbackReason,
      }),
      onTrafficLatched: () => {},
      clearActiveDrive: () => {},
    };

    const drawerApi = createDriveDrawer({
      driveEngine: mockEngine,
      container: body,
    });
    assert.equal(
      body.children.length,
      0,
      'Phase 2 Drive compatibility shim mounts zero legacy vanilla DOM',
    );

    const osrmRes = await drawerApi.startCustomDrive(
      '28.5383,-81.3792',
      '33.749,-84.388',
    );
    assert.equal(osrmRes.routeStatus, 'osrm');
    assert.equal(osrmRes.routeFallbackReason, null);

    nextResult = {
      corridor: { name: 'Custom Drive' },
      speedMph: 75,
      routeStatus: 'straight_fallback',
      routeFallbackReason: 'Route proxy error (HTTP 503)',
    };
    const fallbackRes = await drawerApi.startCustomDrive(
      '28.5383,-81.3792',
      '33.749,-84.388',
    );
    assert.equal(fallbackRes.routeStatus, 'straight_fallback');
    assert.match(fallbackRes.routeFallbackReason, /HTTP 503/);

    drawerApi.destroy();
  } finally {
    globalThis.document = origDoc;
    globalThis.requestAnimationFrame = origRaf;
  }
});
