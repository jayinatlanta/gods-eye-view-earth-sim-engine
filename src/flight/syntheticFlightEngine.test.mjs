import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  AIRPORT_WAYPOINTS,
  AIRLINER_CRUISE_KTS,
  AIRLINER_CRUISE_MS,
  DEFAULT_AIRLINER_MODEL_URI,
  buildContactBracketSvg,
  resolveWaypoint,
  resolveWaypointAsync,
  interpolateGreatCirclePoint,
  applyFlightCameraFollow,
  ROTORCRAFT_CRUISE_KTS,
  ROTORCRAFT_CRUISE_MS,
  createSyntheticFlightEngine,
} from './syntheticFlightEngine.js';

test('resolveWaypoint correctly matches IATA codes, names, and coordinate pairs', () => {
  const atl = resolveWaypoint('ATL');
  assert.equal(atl.code, 'ATL');
  assert.equal(atl.name, 'Atlanta (Hartsfield-Jackson)');
  assert.equal(typeof atl.lat, 'number');
  assert.equal(typeof atl.lon, 'number');

  const eyw = resolveWaypoint('EYW');
  assert.equal(eyw.code, 'EYW');
  assert.equal(eyw.name, 'Key West International');

  const clt = resolveWaypoint('charlotte');
  assert.equal(clt.code, 'CLT');

  const custom = resolveWaypoint('33.74,-84.38');
  assert.equal(custom.code, 'CUSTOM');
  assert.equal(custom.lat, 33.74);
  assert.equal(custom.lon, -84.38);

  assert.equal(resolveWaypoint('UNKNOWN_XYZ'), null);
  assert.equal(resolveWaypoint(null), null);
});

test('resolveWaypointAsync falls back to geocoding endpoint for custom place names', async () => {
  const mockFetch = async (url) => {
    if (url.includes('Miami%20Beach')) {
      return {
        ok: true,
        json: async () => ({
          results: [{ name: 'Miami Beach', lat: '25.7907', lon: '-80.1300' }],
        }),
      };
    }
    return { ok: false };
  };

  const wp = await resolveWaypointAsync('Miami Beach', mockFetch);
  assert.ok(wp);
  assert.equal(wp.name, 'Miami Beach');
  assert.equal(wp.lat, 25.7907);
  assert.equal(wp.lon, -80.13);
});

test('interpolateGreatCirclePoint computes curved WGS84 Cartesian coordinates with altitude arc', () => {
  const start = Cesium.Cartesian3.fromDegrees(-84.4281, 33.6407, 100);
  const end = Cesium.Cartesian3.fromDegrees(-80.9431, 35.214, 100);

  const pStart = interpolateGreatCirclePoint(start, end, 0.0, 10000);
  const pMid = interpolateGreatCirclePoint(start, end, 0.5, 10000);
  const pEnd = interpolateGreatCirclePoint(start, end, 1.0, 10000);

  assert.ok(pStart instanceof Cesium.Cartesian3);
  assert.ok(pMid instanceof Cesium.Cartesian3);
  assert.ok(pEnd instanceof Cesium.Cartesian3);

  const cartoMid = Cesium.Cartographic.fromCartesian(pMid);
  const cartoStart = Cesium.Cartographic.fromCartesian(pStart);

  // Midpoint altitude should be substantially higher than start/end
  assert.ok(cartoMid.height > cartoStart.height);
  assert.ok(cartoMid.height > 9000); // Near cruise altitude
});

test('createSyntheticFlightEngine manages flight lifecycle and entities', async () => {
  const addedEntities = [];
  const removedEntities = [];

  const mockViewer = {
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: null,
      shouldAnimate: false,
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
    trackedEntity: undefined,
  };

  const engine = createSyntheticFlightEngine({ viewer: mockViewer });

  const flight = await engine.spawnFlightRoute('ATL', 'CLT', {
    durationSec: 60,
  });
  assert.ok(flight);
  assert.equal(flight.from.code, 'ATL');
  assert.equal(flight.to.code, 'CLT');
  assert.equal(addedEntities.length, 2); // Polyline path + Airliner entity
  assert.equal(mockViewer.trackedEntity, flight.entity);

  const current = engine.getActiveFlight();
  assert.equal(current.callsign, flight.callsign);

  const telem = engine.getActiveTelemetry();
  assert.ok(telem);
  assert.equal(telem.fromCode, 'ATL');
  assert.equal(telem.toCode, 'CLT');
  assert.equal(telem.mode, 'FLIGHT SIMULATOR');
  assert.ok(telem.speedText.endsWith('KTS'));

  engine.clearActiveFlight();
  assert.equal(engine.getActiveFlight(), null);
  assert.equal(engine.getActiveTelemetry(), null);
  assert.equal(removedEntities.length, 2);

  engine.destroy();
});

test('applyFlightCameraFollow correctly positions camera for cockpit, chase, overview, and heli modes', () => {
  const views = [];
  const mockViewer = {
    camera: {
      setView: (v) => {
        views.push(v);
      },
    },
  };

  const pos = Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 305);
  const forward = new Cesium.Cartesian3(0.5, 0.5, 0.0);
  Cesium.Cartesian3.normalize(forward, forward);

  // 1. Cockpit view
  applyFlightCameraFollow(mockViewer, pos, forward, 'cockpit', true);
  assert.equal(views.length, 1);
  assert.ok(views[0].destination instanceof Cesium.Cartesian3);
  assert.ok(views[0].orientation.direction instanceof Cesium.Cartesian3);

  // 2. Chase view
  applyFlightCameraFollow(mockViewer, pos, forward, 'chase', true);
  assert.equal(views.length, 2);

  // 3. Overview view
  applyFlightCameraFollow(mockViewer, pos, forward, 'overview', true);
  assert.equal(views.length, 3);

  // 4. Heli view
  applyFlightCameraFollow(mockViewer, pos, forward, 'heli', true);
  assert.equal(views.length, 4);
});

test('rotorcraft simulation maintains authentic cruising speed, visibility at zoom-out, and camera modes', async () => {
  const addedEntities = [];
  const removedEntities = [];

  const mockViewer = {
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: null,
      multiplier: 1.0,
      shouldAnimate: false,
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
    scene: {
      requestRender: () => {},
      preRender: {
        addEventListener: () => () => {},
      },
    },
    trackedEntity: undefined,
  };

  const engine = createSyntheticFlightEngine({ viewer: mockViewer });

  // Spawn Atlanta to Savannah flight (~350 km)
  const flight = await engine.spawnFlightRoute('ATL', 'SAV', {
    isRotorcraft: true,
  });
  assert.ok(flight);
  assert.equal(flight.isRotorcraft, true);

  // Duration should be authentically calibrated (~350,000m / 64 m/s â‰ˆ 5,468s)
  // NOT compressed into 90-300 seconds that yielded 5,892 knots!
  assert.ok(
    flight.durationSec > 3000,
    `durationSec ${flight.durationSec} must reflect ~125 kts cruise`,
  );

  // Entity contact visibility: For Airbus H145 rotorcraft, authentic 2D icon billboard
  // is used at all distances (no mismatched Bell 206 3D model).
  const entity = flight.entity;
  assert.equal(
    entity.model,
    undefined,
    'Mismatched Bell 206 model must be omitted for H145',
  );
  assert.ok(
    entity.billboard,
    'Entity must have billboard for contact representation',
  );
  assert.equal(entity.billboard.width, 48);
  assert.equal(entity.billboard.height, 48);
  assert.equal(
    entity.billboard.distanceDisplayCondition.near,
    0.0,
    'Billboard must display from 0m upwards',
  );
  assert.equal(
    entity.point,
    undefined,
    'Raw point dot must be omitted so contacts always render as [ ] bracket / silhouette / wireframe box',
  );
  assert.ok(
    entity.box && entity.box.outline === true && entity.box.fill === false,
    'Entity must have wireframe contact box outline for chase/heli views',
  );

  // Verify camera switching: In cockpit mode, 100% pure OOB ghost cam
  // (all visuals + flight-path ribbon hidden, trackedEntity cleared)
  const pathEntity = addedEntities[0];
  engine.setCameraMode('cockpit');
  assert.equal(
    entity.billboard.show,
    false,
    'Billboard must be hidden in ghost cockpit view',
  );
  assert.equal(
    entity.box.show,
    false,
    'Wireframe box must be hidden in ghost cockpit view',
  );
  assert.equal(
    entity.path.show,
    false,
    'Path must be hidden in ghost cockpit view',
  );
  assert.equal(
    pathEntity.show,
    false,
    'Great-circle flight path ribbon must be hidden in ghost cockpit view',
  );
  assert.equal(
    mockViewer.trackedEntity,
    undefined,
    'trackedEntity must be cleared in ghost cockpit view',
  );

  engine.setCameraMode('chase');
  assert.equal(
    entity.billboard.show,
    true,
    'Billboard must be shown in chase view',
  );
  assert.equal(
    entity.box.show,
    true,
    'Wireframe contact box must be shown in chase view',
  );
  assert.equal(entity.path.show, true, 'Path must be shown in chase view');
  assert.equal(
    pathEntity.show,
    true,
    'Great-circle flight path ribbon must be restored in chase view',
  );

  engine.setCameraMode('overview');
  assert.equal(
    entity.billboard.show,
    true,
    'Billboard must be shown in overview view',
  );
  assert.equal(
    entity.box.show,
    false,
    'Close-range wireframe box hides in high-altitude overview (billboard + [ ] bracket carry contact)',
  );

  engine.setCameraMode('heli');
  assert.equal(
    entity.billboard.show,
    true,
    'Billboard must be shown in heli-cam view',
  );
  assert.equal(
    entity.box.show,
    true,
    'Wireframe contact box must be shown in heli-cam view',
  );

  // Verify fixed-wing airliner retains authentic 3D fleet model, authentic 480 KTS 1x cruise, and readable place names
  const airlinerFlight = await engine.spawnFlightRoute(
    { lat: 30.2672, lon: -97.7431, name: 'Austin, TX', shortLabel: 'Austin' },
    { lat: 34.0522, lon: -118.2437, name: 'Los Angeles, CA', shortLabel: 'Los Angeles' },
    { isRotorcraft: false },
  );
  assert.ok(airlinerFlight.entity.model, 'Airliners retain 3D model');
  assert.equal(
    airlinerFlight.entity.model.uri,
    DEFAULT_AIRLINER_MODEL_URI,
    'Airliner must use bundled fleet A320 glTF model (not 404 /models/airplane.glb)',
  );
  assert.equal(
    airlinerFlight.entity.point,
    undefined,
    'Airliner must not render a raw point dot',
  );
  assert.ok(
    airlinerFlight.durationSec > 6000,
    `Transcontinental 1x airliner flight must cruise at authentic ~${AIRLINER_CRUISE_KTS} KTS, got durationSec=${airlinerFlight.durationSec}`,
  );
  assert.ok(
    airlinerFlight.entity.orientation,
    'Airliners have orientation property',
  );
  // Verify A320 ENU orientation: local +Z must align with geodetic up (wings level, not knifing sideways)
  const midTime = Cesium.JulianDate.addSeconds(
    airlinerFlight.startTime,
    airlinerFlight.durationSec * 0.5,
    new Cesium.JulianDate(),
  );
  const midPos = airlinerFlight.entity.position.getValue(midTime);
  const midQuat = airlinerFlight.entity.orientation.getValue(midTime);
  const midRot = Cesium.Matrix3.fromQuaternion(midQuat, new Cesium.Matrix3());
  const localZ = Cesium.Matrix3.getColumn(midRot, 2, new Cesium.Cartesian3());
  const geodeticUp = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    midPos,
    new Cesium.Cartesian3(),
  );
  assert.ok(
    Cesium.Cartesian3.dot(localZ, geodeticUp) > 0.999,
    'Aircraft local +Z must point straight up (wings level, upright tail fin)',
  );
  // Verify nose (local -Y in Cesium glTF Z-up) points forward along the trajectory
  const nextTime = Cesium.JulianDate.addSeconds(
    midTime,
    5,
    new Cesium.JulianDate(),
  );
  const nextPos = airlinerFlight.entity.position.getValue(nextTime);
  const travelDir = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(nextPos, midPos, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const localNegY = Cesium.Cartesian3.negate(
    Cesium.Matrix3.getColumn(midRot, 1, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  assert.ok(
    Cesium.Cartesian3.dot(localNegY, travelDir) > 0.99,
    'Aircraft nose (local -Y) must point forward along flight course (not backwards)',
  );

  // Verify telemetry shows authentic ~480 KTS airspeed and real place names (never CUSTOM -> CUSTOM or Mach 52)
  const telem = engine.getActiveTelemetry();
  assert.ok(telem);
  assert.equal(telem.isRotorcraft, false);
  assert.equal(telem.fromCode, 'AUSTIN');
  assert.equal(telem.toCode, 'LOS ANGELES');
  const kts = parseInt(telem.speedText, 10);
  assert.ok(
    kts >= 460 && kts <= 500,
    `Expected authentic ~${AIRLINER_CRUISE_KTS} KTS at 1x, got ${telem.speedText}`,
  );
  assert.ok(
    buildContactBracketSvg('#38bdf8', 48).includes('<svg'),
    'OOB corner-bracket SVG helper must produce valid SVG markup',
  );
  assert.ok(AIRLINER_CRUISE_MS > 240 && AIRLINER_CRUISE_MS < 255);

  engine.clearActiveFlight();
  assert.equal(mockViewer.clock.multiplier, 1.0);
  engine.destroy();
});

test('preRender frame callback runs without error for every camera mode (regression: undefined bearing helper)', async () => {
  let frameCallback = null;
  const mockViewer = {
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: null,
      multiplier: 1.0,
      shouldAnimate: false,
    },
    entities: { add: (ent) => ent, remove: () => true },
    camera: { setView: () => {} },
    scene: {
      requestRender: () => {},
      camera: {
        rightWC: new Cesium.Cartesian3(1, 0, 0),
        upWC: new Cesium.Cartesian3(0, 0, 1),
      },
      preRender: {
        addEventListener: (cb) => {
          frameCallback = cb;
          return () => {};
        },
      },
    },
    trackedEntity: undefined,
  };
  const engine = createSyntheticFlightEngine({ viewer: mockViewer });
  const flight = await engine.spawnFlightRoute('ATL', 'SAV', {
    isRotorcraft: true,
  });
  assert.ok(flight);
  assert.equal(typeof frameCallback, 'function');
  mockViewer.clock.currentTime = Cesium.JulianDate.addSeconds(
    flight.startTime,
    30,
    new Cesium.JulianDate(),
  );
  for (const mode of ['chase', 'cockpit', 'overview', 'heli']) {
    engine.setCameraMode(mode);
    assert.doesNotThrow(
      () => frameCallback(),
      'frame callback must not throw in ' + mode,
    );
  }
  assert.ok(
    Number.isFinite(flight.entity.billboard.rotation),
    'billboard rotation must be set from course',
  );
  engine.destroy();
});

test('rotorcraft cruise is 0.66x of 125 kts, cockpit sits 50 m up, chase scales with zoom', () => {
  assert.equal(ROTORCRAFT_CRUISE_KTS, 82);
  assert.ok(Math.abs(ROTORCRAFT_CRUISE_MS - 42.24) < 0.01);

  const pos = Cesium.Cartesian3.fromDegrees(-84.3, 33.7, 305);
  const fwd = new Cesium.Cartesian3(0, 0, 0);
  Cesium.Cartesian3.normalize(new Cesium.Cartesian3(-0.3, 0.9, 0.1), fwd);
  const make = () => {
    const calls = [];
    return { calls, viewer: { camera: { setView: (o) => calls.push(o) } } };
  };
  const heightOf = (p) => Cesium.Cartographic.fromCartesian(p).height;

  const cockpit = make();
  applyFlightCameraFollow(cockpit.viewer, pos, fwd, 'cockpit', true);
  assert.ok(
    heightOf(cockpit.calls[0].destination) - 305 > 49,
    'cockpit must sit ~50 m above flight path',
  );

  const near = make();
  applyFlightCameraFollow(near.viewer, pos, fwd, 'chase', true, 1);
  const far = make();
  applyFlightCameraFollow(far.viewer, pos, fwd, 'chase', true, 4);
  const d1 = Cesium.Cartesian3.distance(near.calls[0].destination, pos);
  const d4 = Cesium.Cartesian3.distance(far.calls[0].destination, pos);
  assert.ok(d1 > 150, 'default chase must be well back from the aircraft');
  assert.ok(d4 > d1 * 3.5, 'zoom scale must pull chase camera farther out');
});
