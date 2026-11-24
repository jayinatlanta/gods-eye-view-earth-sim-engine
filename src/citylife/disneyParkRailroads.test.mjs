import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { Window } from 'happy-dom';
import {
  RAIL_CORRIDORS,
  WDW_MONORAIL_RESORT_LOOP,
  WDW_MONORAIL_EPCOT_BEAM,
  WDW_MONORAIL_MK_TO_EPCOT_TRANSFER,
  WDW_MONORAIL_EPCOT_TO_MK_TRANSFER,
  DLR_MONORAIL_LOOP,
  WDW_MK_RAILROAD_LOOP,
  DLR_RAILROAD_LOOP,
  calculateHaversineDistance,
  calculateCorridorDistance,
  resolveRailWaypoints,
} from '../transit/railWaypoints.js';
import { createRailwayEngine } from '../layers/transit/railwayEngine.js';
import {
  createSyntheticMetroEngine,
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
  MONORAIL_MODEL_URI,
  STEAM_TRAIN_MODEL_URI,
} from '../layers/citylife/syntheticMetroEngine.js';
import { getParkHopperBridgesForPark } from '../layers/citylife/themeParkCatalog.js';
import { createTourAndPlayEngine } from '../layers/citylife/tourAndPlayEngine.js';
import { createWanderDrawer } from './wanderDrawer.js';
import { createRailDrawer } from '../transit/railDrawer.js';
import { createTransitControllerDrawer } from './transitControllerDrawer.js';

function assertFleetGlbNoseForward(position, forwardWorld, orientationQuat, label) {
  assert.ok(orientationQuat, `${label}: orientation quaternion must exist`);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const gltfAxisCorrection = Cesium.ModelUtility.getAxisCorrectionMatrix(
    Cesium.Axis.Y,
    Cesium.Axis.Z,
    new Cesium.Matrix4(),
  );

  const entityFrame = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromQuaternion(orientationQuat),
    position,
  );
  const localEntity = Cesium.Matrix4.multiply(
    invEnu,
    entityFrame,
    new Cesium.Matrix4(),
  );
  const totalGltfToEnu = Cesium.Matrix4.multiply(
    localEntity,
    gltfAxisCorrection,
    new Cesium.Matrix4(),
  );

  // Procedural fleet GLBs (`monorail.glb`, `regional_dmu.glb`) are glTF Y-up, nose toward -X.
  const noseEnu = Cesium.Matrix4.multiplyByPointAsVector(
    totalGltfToEnu,
    new Cesium.Cartesian3(-1, 0, 0),
    new Cesium.Cartesian3(),
  );
  const upEnu = Cesium.Matrix4.multiplyByPointAsVector(
    totalGltfToEnu,
    new Cesium.Cartesian3(0, 1, 0),
    new Cesium.Cartesian3(),
  );
  const fwdEnu = Cesium.Matrix4.multiplyByPointAsVector(
    invEnu,
    forwardWorld,
    new Cesium.Cartesian3(),
  );
  fwdEnu.z = 0;
  Cesium.Cartesian3.normalize(fwdEnu, fwdEnu);
  Cesium.Cartesian3.normalize(noseEnu, noseEnu);

  const dotFwd = Cesium.Cartesian3.dot(noseEnu, fwdEnu);
  assert.ok(
    dotFwd > 0.999,
    `${label}: glTF -X nose must align with travel forward (got dot=${dotFwd.toFixed(4)})`,
  );
  assert.ok(
    upEnu.z > 0.999,
    `${label}: glTF +Y up must align with geodetic up (got upEnu.z=${upEnu.z.toFixed(4)})`,
  );
}

function createMockViewer() {
  const addedEntities = [];
  return {
    entities: {
      add: (spec) => {
        addedEntities.push(spec);
        return spec;
      },
      remove: (ent) => {
        const idx = addedEntities.indexOf(ent);
        if (idx >= 0) addedEntities.splice(idx, 1);
      },
    },
    scene: {
      globe: { show: false },
      preRender: {
        addEventListener: () => () => {},
      },
      primitives: {
        add: () => {},
        remove: () => {},
      },
      requestRender: () => {},
    },
    camera: {
      setView: () => {},
      flyTo: () => {},
      cancelFlight: () => {},
      lookAtTransform: () => {},
    },
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
      clockRange: Cesium.ClockRange.UNBOUNDED,
      multiplier: 1,
      shouldAnimate: true,
    },
    _addedEntities: addedEntities,
  };
}

async function withHappyDom(fn) {
  const win = new Window({ url: 'http://localhost:4173/' });
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevHTMLElement = globalThis.HTMLElement;
  const prevRAF = globalThis.requestAnimationFrame;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.requestAnimationFrame = (cb) => {
    cb(0);
    return 1;
  };
  try {
    return await fn(win);
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.HTMLElement = prevHTMLElement;
    globalThis.requestAnimationFrame = prevRAF;
    win.close();
  }
}

function createFakeWanderEngine() {
  let state = {
    isActive: false,
    lat: 28.4194,
    lon: -81.5812,
    city: 'Magic Kingdom',
    cameraMode: 'iso_chase',
    companionMode: 'duo',
  };
  return {
    startAtLocation: (opts = {}) => {
      state = { ...state, ...opts, isActive: true };
    },
    setWalking: () => {},
    setHeadingDeg: () => {},
    setTargetSpeedMs: () => {},
    setCameraMode: () => {},
    setCompanionMode: () => {},
    setMotionMode: () => {},
    setRoadSnapEnabled: () => {},
    setNavigationWaypoint: () => {},
    clearNavigationWaypoint: () => {},
    showDialogBubble: () => {},
    hideDialogBubble: () => {},
    isActive: () => state.isActive,
    getState: () => ({ ...state }),
    stop: () => {
      state.isActive = false;
    },
  };
}

test('All Disney monorail and park steam railroad alignments have valid spacing and exact loop closure', () => {
  const closedLoops = [
    ['WDW_MONORAIL_RESORT_LOOP', WDW_MONORAIL_RESORT_LOOP, 3500, 5500],
    ['DLR_MONORAIL_LOOP', DLR_MONORAIL_LOOP, 2800, 4600],
    ['WDW_MK_RAILROAD_LOOP', WDW_MK_RAILROAD_LOOP, 2000, 3000],
    ['DLR_RAILROAD_LOOP', DLR_RAILROAD_LOOP, 1600, 2600],
  ];

  for (const [name, wps, minMeters, maxMeters] of closedLoops) {
    assert.ok(wps.length >= 10, `${name}: must have >= 10 waypoints`);
    const first = wps[0];
    const last = wps[wps.length - 1];
    const closureMeters = calculateHaversineDistance(
      first.lat,
      first.lon,
      last.lat,
      last.lon,
    );
    assert.ok(
      closureMeters < 1.0,
      `${name}: loop must close cleanly (start-to-end=${closureMeters.toFixed(3)}m)`,
    );

    for (let i = 0; i < wps.length - 1; i++) {
      const segM = calculateHaversineDistance(
        wps[i].lat,
        wps[i].lon,
        wps[i + 1].lat,
        wps[i + 1].lon,
      );
      assert.ok(
        segM >= 40 && segM <= 1200,
        `${name}: segment ${i} must be non-degenerate (got ${segM.toFixed(1)}m)`,
      );
    }

    const totalM = calculateCorridorDistance(wps);
    assert.ok(
      totalM >= minMeters && totalM <= maxMeters,
      `${name}: expected distance in [${minMeters}, ${maxMeters}]m, got ${totalM.toFixed(1)}m`,
    );
  }

  for (const [name, wps] of [
    ['WDW_MONORAIL_EPCOT_BEAM', WDW_MONORAIL_EPCOT_BEAM],
    ['WDW_MONORAIL_MK_TO_EPCOT_TRANSFER', WDW_MONORAIL_MK_TO_EPCOT_TRANSFER],
    ['WDW_MONORAIL_EPCOT_TO_MK_TRANSFER', WDW_MONORAIL_EPCOT_TO_MK_TRANSFER],
  ]) {
    assert.ok(wps.length >= 8, `${name}: must have >= 8 waypoints`);
    for (let i = 0; i < wps.length - 1; i++) {
      const segM = calculateHaversineDistance(
        wps[i].lat,
        wps[i].lon,
        wps[i + 1].lat,
        wps[i + 1].lon,
      );
      assert.ok(
        segM >= 50 && segM <= 2500,
        `${name}: segment ${i} must be non-degenerate (got ${segM.toFixed(1)}m)`,
      );
    }
  }
});

test('Disneyland Monorail, WDW MK Railroad, and Disneyland Railroad corridors and metro catalog specs match authentic offsets and modes', () => {
  const cases = [
    ['dlr_monorail', 'dlr_monorail_loop', 'monorail', 7.5, 'dlr_monorail_loop'],
    [
      'wdw_mk_railroad',
      'mk_perimeter_steam_loop',
      'steam_rail',
      1.8,
      'wdw_mk_railroad_loop',
    ],
    [
      'dlr_railroad',
      'dlr_perimeter_steam_loop',
      'steam_rail',
      1.8,
      'dlr_railroad_loop',
    ],
  ];

  for (const [
    corridorId,
    profileKey,
    expectedMode,
    expectedOffsetM,
    metroRouteKey,
  ] of cases) {
    assert.ok(RAIL_CORRIDORS[corridorId], `${corridorId} in RAIL_CORRIDORS`);
    const resolved = resolveRailWaypoints(corridorId, null, {
      corridor: profileKey,
    });
    assert.equal(resolved.id, corridorId);
    assert.equal(resolved.activeProfile.vehicleMode, expectedMode);
    assert.equal(resolved.activeProfile.railOffsetMeters, expectedOffsetM);
    assert.deepEqual(METRO_NETWORKS_BY_CITY[corridorId], [metroRouteKey]);
    assert.equal(RAPID_TRANSIT_ROUTES[metroRouteKey].vehicleMode, expectedMode);
    assert.equal(
      RAPID_TRANSIT_ROUTES[metroRouteKey].elevOffsetMeters,
      expectedOffsetM,
    );
  }
});

test('World of Rails railwayEngine spawns DLR Monorail, WDW MK Railroad, and DLR Railroad with verified nose-forward glTF orientation', async () => {
  const mockViewer = createMockViewer();
  const engine = createRailwayEngine({ viewer: mockViewer });

  const specs = [
    ['dlr_monorail', 'dlr_monorail_loop', MONORAIL_MODEL_URI, 30],
    ['wdw_mk_railroad', 'mk_perimeter_steam_loop', STEAM_TRAIN_MODEL_URI, 15],
    ['dlr_railroad', 'dlr_perimeter_steam_loop', STEAM_TRAIN_MODEL_URI, 15],
  ];

  for (const [corridorId, profileId, expectedUri, speedMph] of specs) {
    const route = await engine.spawnRailRoute(corridorId, null, {
      corridor: profileId,
      cameraMode: 'chase',
      cabRide: false,
      speedMph,
      useOverpass: false,
    });
    assert.ok(route, `${corridorId}: route spawned`);
    assert.equal(route.trainEntity.model.uri, expectedUri);
    assert.equal(route.trainEntity.model.show, true);
    assert.equal(route.trainEntity.box, undefined);
    assert.equal(route.carEntities.length, 0);

    for (const frac of [0.1, 0.45, 0.8]) {
      const t = Cesium.JulianDate.addSeconds(
        route.startTime,
        route.durationSec * frac,
        new Cesium.JulianDate(),
      );
      const tAhead = Cesium.JulianDate.addSeconds(
        t,
        0.35,
        new Cesium.JulianDate(),
      );
      const p0 = route.trainEntity.position.getValue(t);
      const p1 = route.trainEntity.position.getValue(tAhead);
      const fwd = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(p1, p0, new Cesium.Cartesian3()),
        new Cesium.Cartesian3(),
      );
      const q = route.trainEntity.orientation.getValue(t);
      assertFleetGlbNoseForward(p0, fwd, q, `WoR-${corridorId}-${frac}`);
    }

    engine.setCameraMode('cab');
    assert.equal(route.trainEntity.model.show, false);
    engine.setCameraMode('chase');
    assert.equal(route.trainEntity.model.show, true);
    engine.setCameraMode('overview');
    assert.equal(route.trainEntity.model.show, true);
  }

  engine.destroy();
});

test('Transit Controller syntheticMetroEngine spawns DLR Monorail and both Disney Park Steam Railroads nose-forward with zero boxes', () => {
  const mockViewer = createMockViewer();
  const metro = createSyntheticMetroEngine({ viewer: mockViewer });

  const specs = [
    ['dlr_monorail', 'monorail', MONORAIL_MODEL_URI, 2],
    ['wdw_mk_railroad', 'steam_rail', STEAM_TRAIN_MODEL_URI, 2],
    ['dlr_railroad', 'steam_rail', STEAM_TRAIN_MODEL_URI, 2],
  ];

  for (const [cityId, expectedMode, expectedUri, expectedCount] of specs) {
    const trains = metro.startMetroSystem(cityId);
    assert.equal(trains.length, expectedCount);
    for (const train of trains) {
      assert.equal(train.route.vehicleMode, expectedMode);
      const car = train.cars[0];
      assert.equal(car.entity.model.uri, expectedUri);
      assert.equal(car.entity.box, undefined);
      const pos = car.pose.position.getValue();
      const q = car.pose.orientation.getValue();
      assertFleetGlbNoseForward(
        pos,
        car.currentForward,
        q,
        `Metro-${cityId}-${train.id}`,
      );
    }
  }

  metro.destroy();
});

test('World of Rails drawer, Transit Controller drawer, and Theme Park Day Ride 3D triggers wire all 4 Disney transit lines cleanly', async () => {
  const mkBridges = getParkHopperBridgesForPark('wdw_magic_kingdom');
  assert.ok(
    mkBridges.some(
      (b) => b.railCorridorId === 'wdw_monorail' && b.rideButtonLabel === '🚝 Ride 3D',
    ),
  );
  assert.ok(
    mkBridges.some(
      (b) => b.railCorridorId === 'wdw_mk_railroad' && b.rideButtonLabel === '🚂 Ride 3D',
    ),
  );

  const epcotBridges = getParkHopperBridgesForPark('wdw_epcot');
  assert.ok(
    epcotBridges.some(
      (b) =>
        b.railCorridorId === 'wdw_monorail' &&
        b.railProfileId === 'epcot_to_mk_express' &&
        b.rideButtonLabel === '🚝 Ride 3D',
    ),
  );

  const dlrBridges = getParkHopperBridgesForPark('dlr_disneyland');
  assert.ok(
    dlrBridges.some(
      (b) => b.railCorridorId === 'dlr_monorail' && b.rideButtonLabel === '🚝 Ride 3D',
    ),
  );
  assert.ok(
    dlrBridges.some(
      (b) => b.railCorridorId === 'dlr_railroad' && b.rideButtonLabel === '🚂 Ride 3D',
    ),
  );

  await withHappyDom(async (win) => {
    const spawnedCalls = [];
    const mockRailEngine = {
      spawnRailRoute: async (fromQuery, toQuery, opts) => {
        spawnedCalls.push({ fromQuery, toQuery, opts });
        return {
          corridor: resolveRailWaypoints(fromQuery, toQuery, opts),
          durationSec: 60,
          carsCount: 0,
        };
      },
      clearActiveRailRoute: () => {},
      getActiveRoute: () => null,
      getActiveTelemetry: () => null,
    };

    // 1. Verify World of Rails drawer shim selects all 4 Disney rail/monorail corridors cleanly with zero vanilla DOM
    const railDrawer = createRailDrawer({
      railwayEngine: mockRailEngine,
      container: win.document.body,
    });
    for (const id of [
      'wdw_monorail',
      'dlr_monorail',
      'wdw_mk_railroad',
      'dlr_railroad',
    ]) {
      assert.ok(RAIL_CORRIDORS[id], `World of Rails corridor ${id} present`);
      const sel = railDrawer.selectCorridor(id);
      assert.equal(sel?.corridorId, id, `railDrawer.selectCorridor(${id}) works`);
    }

    // 2. Verify Transit Controller drawer shim exposes all 4 Disney transit networks with zero vanilla DOM
    const startedMetroCities = [];
    const transitDrawer = createTransitControllerDrawer({
      busEngine: { stopBusFleet: () => {}, isSimActive: () => false },
      metroEngine: {
        startMetroSystem: (cityId) => {
          startedMetroCities.push(cityId);
          return [];
        },
        stopMetroSystem: () => {},
        isSimActive: () => false,
        getTrains: () => [],
        getActiveTrain: () => null,
        setCameraEnabled: () => {},
        setRouteLinesVisible: () => {},
      },
      container: win.document.body,
    });
    const transitOptions = transitDrawer.getSupportedNetworks();
    for (const id of [
      'wdw_monorail',
      'dlr_monorail',
      'wdw_mk_railroad',
      'dlr_railroad',
    ]) {
      assert.ok(
        transitOptions.includes(id),
        `Transit Controller option ${id} present`,
      );
    }

    // 3. Verify Park Day Ride 3D buttons inside wanderDrawer for MK, EPCOT & Disneyland
    const wanderEngine = createFakeWanderEngine();
    const tourEngine = createTourAndPlayEngine({ wanderEngine, rng: () => 0.25 });
    const wanderDrawer = createWanderDrawer({
      wanderEngine,
      tourAndPlayEngine: tourEngine,
      railwayEngine: mockRailEngine,
      railDrawer,
      container: win.document.body,
    });
    wanderDrawer.open();

    // Magic Kingdom: both WDW Monorail -> EPCOT handoff & WDW MK Railroad via launchHopperBridge
    tourEngine.startCityTour({ cityId: 'wdw_magic_kingdom' });
    const mkBridges = tourEngine.getStatus().parkHopperBridges || [];
    const mkMonoBridge = mkBridges.find((b) => b.railCorridorId === 'wdw_monorail');
    const mkSteamBridge = mkBridges.find((b) => b.railCorridorId === 'wdw_mk_railroad');
    assert.ok(mkMonoBridge, 'MK WDW Monorail Ride 3D bridge available');
    assert.ok(mkSteamBridge, 'MK WDW Railroad Ride 3D bridge available');

    wanderDrawer.launchHopperBridge(mkMonoBridge);
    assert.equal(spawnedCalls.at(-1).fromQuery, 'wdw_monorail');
    assert.equal(spawnedCalls.at(-1).opts.corridor, 'mk_to_epcot_express');
    assert.equal(typeof spawnedCalls.at(-1).opts.onArrival, 'function');
    // Trigger arrival handoff to EPCOT Spaceship Earth
    spawnedCalls.at(-1).opts.onArrival();
    assert.equal(tourEngine.getStatus().cityId, 'wdw_epcot');
    assert.equal(
      tourEngine.getStatus().currentLandmark.id,
      'epcot_spaceship_earth',
    );

    // EPCOT: return to Magic Kingdom
    const epcotMonoBridge = (tourEngine.getStatus().parkHopperBridges || []).find(
      (b) => b.railCorridorId === 'wdw_monorail',
    );
    assert.ok(epcotMonoBridge, 'EPCOT WDW Monorail return bridge available');
    wanderDrawer.launchHopperBridge(epcotMonoBridge);
    assert.equal(spawnedCalls.at(-1).opts.corridor, 'epcot_to_mk_express');

    // Magic Kingdom Steam Railroad Ride 3D
    tourEngine.startCityTour({ cityId: 'wdw_magic_kingdom' });
    wanderDrawer.launchHopperBridge(mkSteamBridge);
    assert.equal(spawnedCalls.at(-1).fromQuery, 'wdw_mk_railroad');
    assert.equal(spawnedCalls.at(-1).opts.corridor, 'mk_perimeter_steam_loop');

    // Disneyland Park Day: both DLR Monorail & DLR Railroad
    tourEngine.startCityTour({ cityId: 'dlr_disneyland' });
    const dlrBridges = tourEngine.getStatus().parkHopperBridges || [];
    const dlrMonoBridge = dlrBridges.find((b) => b.railCorridorId === 'dlr_monorail');
    const dlrSteamBridge = dlrBridges.find((b) => b.railCorridorId === 'dlr_railroad');
    assert.ok(dlrMonoBridge, 'Disneyland Monorail Ride 3D bridge available');
    assert.ok(dlrSteamBridge, 'Disneyland Railroad Ride 3D bridge available');

    wanderDrawer.launchHopperBridge(dlrMonoBridge);
    assert.equal(spawnedCalls.at(-1).fromQuery, 'dlr_monorail');
    assert.equal(spawnedCalls.at(-1).opts.corridor, 'dlr_monorail_loop');

    tourEngine.startCityTour({ cityId: 'dlr_disneyland' });
    wanderDrawer.launchHopperBridge(dlrSteamBridge);
    assert.equal(spawnedCalls.at(-1).fromQuery, 'dlr_railroad');
    assert.equal(spawnedCalls.at(-1).opts.corridor, 'dlr_perimeter_steam_loop');

    wanderDrawer.destroy();
    transitDrawer.destroy();
    railDrawer.destroy();
    tourEngine.destroy();
  });
});
