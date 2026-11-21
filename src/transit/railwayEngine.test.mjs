import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  RAIL_CORRIDORS,
  resolveRailCorridor,
  resolveRailWaypoints,
  calculateHaversineDistance,
  calculateCorridorDistance,
  calculateTravelDurationSeconds,
} from './railWaypoints.js';
import {
  buildOverpassRailQuery,
  generateRailTrajectory,
  stitchOverpassWaypoints,
  createRailwayEngine,
  TOP_OF_RAIL_OFFSET_METERS,
  LOCOMOTIVE_DIMENSIONS,
  RAIL_CAR_DIMENSIONS,
} from '../layers/transit/railwayEngine.js';

test('resolveRailCorridor correctly matches IDs, corridor names, and cities', () => {
  const atl = resolveRailCorridor('atlanta_marta_east');
  assert.ok(atl);
  assert.equal(atl.id, 'atlanta_marta_east');
  assert.equal(atl.from.name, 'Edgewood / Candler Park');
  assert.equal(atl.to.name, 'Georgia State Station');

  const nec = resolveRailCorridor('northeast_corridor_acela');
  assert.ok(nec);
  assert.equal(nec.defaultSpeedMph, 125);

  const shinkansen = resolveRailCorridor('shinkansen');
  assert.ok(shinkansen);
  assert.equal(shinkansen.id, 'tokaido_shinkansen');
  assert.equal(shinkansen.city, 'Tokyo, Japan');

  assert.equal(resolveRailCorridor('UNKNOWN_CORRIDOR_123'), null);
  assert.equal(resolveRailCorridor(null), null);
});

test('resolveRailWaypoints formats preset and parses custom coordinate pairs', () => {
  const resultPreset = resolveRailWaypoints('atlanta_marta_east', null, {
    corridor: 'csx_mainline',
    speedMph: 45,
  });
  assert.ok(resultPreset);
  assert.equal(resultPreset.activeProfileKey, 'csx_mainline');
  assert.ok(resultPreset.waypoints.length >= 2);
  assert.ok(resultPreset.totalDistanceMeters > 3000); // ~4.5 km
  assert.ok(resultPreset.durationSec > 0);

  // Custom coordinate input
  const resultCustom = resolveRailWaypoints(
    '33.7561,-84.3403',
    '33.7505,-84.3862',
    {
      speedMph: 50,
    },
  );
  assert.ok(resultCustom);
  assert.equal(resultCustom.id, 'custom_rail_corridor');
  assert.equal(resultCustom.from.lat, 33.7561);
  assert.equal(resultCustom.to.lat, 33.7505);
  assert.ok(resultCustom.totalDistanceMeters > 3000);
});

test('calculateHaversineDistance and calculateTravelDurationSeconds compute accurate physics', () => {
  // Distance from Candler Park (33.7561, -84.3403) to Georgia State (33.7505, -84.3862)
  const dist = calculateHaversineDistance(33.7561, -84.3403, 33.7505, -84.3862);
  assert.ok(dist > 4000 && dist < 4800); // ~4.26 km direct line

  // Duration at 45 mph (~20.1 m/s): ~4260 / 20.1 = ~212s
  const duration = calculateTravelDurationSeconds(dist, 45);
  assert.ok(duration > 180 && duration < 240);

  // Duration at 125 mph (~55.9 m/s)
  const durationHighSpeed = calculateTravelDurationSeconds(dist, 125);
  assert.ok(durationHighSpeed < duration);
});

test('buildOverpassRailQuery formats valid Overpass QL with bounding box', () => {
  const bbox = [33.74, -84.4, 33.765, -84.33];
  const query = buildOverpassRailQuery(bbox);
  assert.ok(query.includes('[out:json]'));
  assert.ok(
    query.includes(
      'way["railway"~"^(rail|subway)$"](33.74,-84.4,33.765,-84.33)',
    ),
  );
  assert.ok(query.includes('out body;'));
});

test('generateRailTrajectory computes smooth Cartesian3 trajectory with rail elevation offset and dynamic terrain clamping', () => {
  const waypoints = [
    { lat: 33.7561, lon: -84.3403, elev: 305 },
    { lat: 33.7495, lon: -84.3685, elev: 312 },
    { lat: 33.7505, lon: -84.3862, elev: 318 },
  ];

  // 1. Static elevation interpolation
  const trajectory = generateRailTrajectory(waypoints, {
    sampleIntervalMeters: 50,
    railOffsetMeters: TOP_OF_RAIL_OFFSET_METERS,
  });

  assert.ok(Array.isArray(trajectory));
  assert.ok(trajectory.length > 10);
  assert.ok(trajectory[0] instanceof Cesium.Cartesian3);

  const cartoFirst = Cesium.Cartographic.fromCartesian(trajectory[0]);
  assert.ok(
    Math.abs(cartoFirst.height - (305 + TOP_OF_RAIL_OFFSET_METERS)) < 1.0,
  );

  // 2. Dynamic Cesium terrain sampling
  const mockScene = {
    globe: {
      getHeight: (carto) => 326.5,
    },
  };
  const dynamicTrajectory = generateRailTrajectory(waypoints, {
    sampleIntervalMeters: 50,
    railOffsetMeters: TOP_OF_RAIL_OFFSET_METERS,
    scene: mockScene,
  });

  const cartoDynamic = Cesium.Cartographic.fromCartesian(dynamicTrajectory[0]);
  assert.ok(
    Math.abs(cartoDynamic.height - (326.5 + TOP_OF_RAIL_OFFSET_METERS)) < 0.1,
  );

  // 3. Google 3D Tiles mode (globe.show === false) rejects skyscraper sampleHeight spikes
  const mock3DScene = {
    globe: { show: false },
    sampleHeightSupported: true,
    sampleHeight: () => 9999,
  };
  const flat3DTrajectory = generateRailTrajectory(waypoints, {
    sampleIntervalMeters: 50,
    railOffsetMeters: TOP_OF_RAIL_OFFSET_METERS,
    scene: mock3DScene,
  });
  const carto3D = Cesium.Cartographic.fromCartesian(flat3DTrajectory[0]);
  assert.ok(
    Math.abs(carto3D.height - (305 + TOP_OF_RAIL_OFFSET_METERS)) < 1.0,
    'In Google 3D Tiles mode rail trajectory must stay on flat track grade',
  );
});

test('stitchOverpassWaypoints orders OSM nodes between terminals', () => {
  const fromWp = { lat: 33.7561, lon: -84.3403, elev: 305 };
  const toWp = { lat: 33.7505, lon: -84.3862, elev: 318 };

  const mockElements = [
    { type: 'node', id: 101, lat: 33.754, lon: -84.35 },
    { type: 'node', id: 102, lat: 33.752, lon: -84.36 },
    { type: 'node', id: 103, lat: 33.75, lon: -84.37 },
    { type: 'way', id: 201, nodes: [101, 102, 103] },
  ];

  const stitched = stitchOverpassWaypoints(mockElements, fromWp, toWp);
  assert.ok(stitched);
  assert.equal(stitched[0].lat, fromWp.lat);
  assert.equal(stitched[stitched.length - 1].lat, toWp.lat);
  assert.ok(stitched.length >= 4);
});

test('createRailwayEngine manages articulated train consist, outlined reticles, and establishing views', async () => {
  const addedEntities = [];
  const removedEntities = [];
  let flownCamera = null;

  const mockViewer = {
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
      shouldAnimate: false,
      multiplier: 1.0,
      clockRange: Cesium.ClockRange.UNBOUNDED,
      onTick: {
        addEventListener: () => () => {},
      },
    },
    camera: {
      flyTo: (opts) => {
        flownCamera = opts;
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
    trackedEntity: undefined,
  };

  const engine = createRailwayEngine({ viewer: mockViewer });

  // Spawn Atlanta corridor (defaults to 4 consist cars + 1 locomotive + 1 track = 6 entities)
  const route = await engine.spawnRailRoute('atlanta_marta_east', null, {
    corridor: 'csx_mainline',
    cabRide: true,
    speedMph: 45,
  });

  assert.ok(route);
  assert.equal(route.corridor.id, 'atlanta_marta_east');
  assert.equal(addedEntities.length, 6); // 1 Track polyline + 1 Locomotive + 4 Cars
  assert.equal(mockViewer.trackedEntity, route.trainEntity);

  // 1. Verify Outlined Contact Reticles
  const locoEntity = addedEntities[1];
  assert.equal(locoEntity.box.outline, true);
  assert.equal(locoEntity.box.outlineColor, Cesium.Color.WHITE);
  assert.equal(locoEntity.box.outlineWidth, 3.5);
  assert.ok(locoEntity.point);
  assert.equal(
    locoEntity.point.disableDepthTestDistance,
    Number.POSITIVE_INFINITY,
  );
  assert.equal(locoEntity.point.outlineColor, Cesium.Color.WHITE);

  for (let c = 2; c < 6; c++) {
    const carEntity = addedEntities[c];
    assert.equal(carEntity.box.outline, true);
    assert.equal(carEntity.box.outlineColor, Cesium.Color.WHITE);
    assert.equal(carEntity.box.outlineWidth, 2.5);
    assert.ok(carEntity.point);
    assert.equal(
      carEntity.point.disableDepthTestDistance,
      Number.POSITIVE_INFINITY,
    );
  }

  // 2. Verify Establishing Map Overview Mode & Helicopter Chase Mode
  engine.setCameraMode('heli');
  assert.equal(engine.getCameraMode(), 'heli');

  engine.showRailOverview();
  assert.equal(engine.getCameraMode(), 'overview');
  assert.equal(mockViewer.trackedEntity, undefined); // Unlatches tracking so user can survey city
  assert.ok(flownCamera);
  assert.ok(flownCamera.destination instanceof Cesium.Cartesian3);

  // 3. Verify Snap Back
  engine.snapBack('cab');
  assert.equal(engine.getCameraMode(), 'cab');
  assert.equal(mockViewer.trackedEntity, route.trainEntity);

  // 4. Verify Rich Telemetry with Station Waypoints
  const telem = engine.getActiveTelemetry();
  assert.ok(telem);
  assert.equal(telem.mode, 'TRANSIT CAB');
  assert.equal(telem.trainName, route.trainName);
  assert.equal(telem.speedMph, 45);
  assert.ok(telem.currentStation);
  assert.ok(telem.nextStation);
  assert.equal(telem.carsCount, 5); // 1 loco + 4 cars

  // 5. Verify Clean Cleanup & Clock Restoral
  engine.clearActiveRailRoute();
  assert.equal(engine.getActiveRoute(), null);
  assert.equal(engine.getActiveTelemetry(), null);
  assert.equal(removedEntities.length, 6);
  assert.equal(mockViewer.trackedEntity, undefined);

  engine.destroy();
});
