import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  RAIL_CORRIDORS,
  WDW_MONORAIL_RESORT_LOOP,
  WDW_MONORAIL_EPCOT_BEAM,
  WDW_MONORAIL_MK_TO_EPCOT_TRANSFER,
  WDW_MONORAIL_EPCOT_TO_MK_TRANSFER,
  resolveRailCorridor,
  resolveRailWaypoints,
} from '../transit/railWaypoints.js';
import { createRailwayEngine } from '../layers/transit/railwayEngine.js';
import {
  createSyntheticMetroEngine,
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
  MONORAIL_MODEL_URI,
  MONORAIL_MODEL_HEADING_OFFSET_DEG,
  computeForwardCourseDeg,
  computeFleetGlbOrientationQuat,
} from '../layers/citylife/syntheticMetroEngine.js';

function assertMonorailModelAlignedWithForward(
  position,
  forwardWorld,
  orientationQuat,
  label,
) {
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

  // Fleet GLBs (`public/models/fleet/transit/monorail.glb`) are built glTF Y-up, nose toward -X.
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
    `${label}: monorail glTF -X nose must point along travel forward (got dot=${dotFwd.toFixed(4)}, noseEnu=${JSON.stringify(noseEnu)}, fwdEnu=${JSON.stringify(fwdEnu)})`,
  );
  assert.ok(
    upEnu.z > 0.999,
    `${label}: monorail glTF +Y up must point geodetically up (got upEnu.z=${upEnu.z.toFixed(4)})`,
  );
}

test('WDW Monorail corridors and multi-line metro catalog expose authentic Resort Loop and EPCOT Beamways', () => {
  const corridor = resolveRailCorridor('wdw_monorail');
  assert.ok(corridor);
  assert.equal(corridor.id, 'wdw_monorail');
  assert.equal(
    RAIL_CORRIDORS.wdw_monorail.defaultCorridor,
    'mk_to_epcot_express',
  );
  assert.ok(WDW_MONORAIL_RESORT_LOOP.length >= 9);
  assert.ok(WDW_MONORAIL_EPCOT_BEAM.length >= 8);
  assert.ok(WDW_MONORAIL_MK_TO_EPCOT_TRANSFER.length >= 12);
  assert.ok(WDW_MONORAIL_EPCOT_TO_MK_TRANSFER.length >= 10);

  for (const profileKey of [
    'mk_to_epcot_express',
    'epcot_to_mk_express',
    'resort_lagoon_loop',
    'epcot_beam_only',
  ]) {
    const resolved = resolveRailWaypoints('wdw_monorail', null, {
      corridor: profileKey,
    });
    assert.equal(resolved.activeProfile.vehicleMode, 'monorail');
    assert.equal(resolved.activeProfile.railOffsetMeters, 7.5);
    assert.ok(resolved.totalDistanceMeters > 3500);
  }

  assert.deepEqual(METRO_NETWORKS_BY_CITY.wdw_monorail, [
    'wdw_monorail_resort_loop',
    'wdw_monorail_epcot_beam',
  ]);
  assert.equal(
    RAPID_TRANSIT_ROUTES.wdw_monorail_resort_loop.vehicleMode,
    'monorail',
  );
  assert.equal(
    RAPID_TRANSIT_ROUTES.wdw_monorail_epcot_beam.vehicleMode,
    'monorail',
  );
});

test('computeFleetGlbOrientationQuat aligns monorail.glb glTF -X nose across all 8 compass headings (zero 90°/180° offset)', () => {
  assert.equal(MONORAIL_MODEL_HEADING_OFFSET_DEG, 180);
  const pos = Cesium.Cartesian3.fromDegrees(-81.5812, 28.4158, 39.5);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);

  const cases = [
    ['N', 0, 1, 0],
    ['NE', 1, 1, 45],
    ['E', 1, 0, 90],
    ['SE', 1, -1, 135],
    ['S', 0, -1, 180],
    ['SW', -1, -1, 225],
    ['W', -1, 0, 270],
    ['NW', -1, 1, 315],
  ];

  for (const [label, east, north, expectedCourse] of cases) {
    const fwdWorld = Cesium.Cartesian3.normalize(
      Cesium.Matrix4.multiplyByPointAsVector(
        enu,
        new Cesium.Cartesian3(east, north, 0),
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );
    const course = computeForwardCourseDeg(pos, fwdWorld);
    assert.ok(
      Math.abs(((course - expectedCourse + 540) % 360) - 180) < 0.1,
      `${label}: course=${course}, expected=${expectedCourse}`,
    );
    const q = computeFleetGlbOrientationQuat(pos, fwdWorld);
    assertMonorailModelAlignedWithForward(pos, fwdWorld, q, `compass-${label}`);
  }
});

test('World of Rails railwayEngine spawns WDW Monorail with monorail.glb oriented nose-forward along the beamway and supports all camera modes', async () => {
  const addedEntities = [];
  const cameraViews = [];
  const mockViewer = {
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
      requestRender: () => {},
    },
    camera: {
      setView: (v) => cameraViews.push(v),
      flyTo: (v) => cameraViews.push(v),
      cancelFlight: () => {},
    },
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
      clockRange: Cesium.ClockRange.UNBOUNDED,
      multiplier: 1,
      shouldAnimate: true,
    },
  };

  const engine = createRailwayEngine({ viewer: mockViewer });
  const route = await engine.spawnRailRoute('wdw_monorail', null, {
    corridor: 'mk_to_epcot_express',
    cameraMode: 'chase',
    cabRide: false,
    speedMph: 45,
    useOverpass: false,
  });

  assert.ok(route);
  assert.equal(route.trainEntity.model.uri, MONORAIL_MODEL_URI);
  assert.equal(route.trainEntity.model.show, true);
  assert.equal(route.trainEntity.box, undefined);
  assert.equal(route.carEntities.length, 0);

  // Sample orientation at 10%, 50%, and 85% of the Magic Kingdom -> EPCOT journey and assert dot(nose, forward) > 0.999
  for (const frac of [0.1, 0.5, 0.85]) {
    const t = Cesium.JulianDate.addSeconds(
      route.startTime,
      route.durationSec * frac,
      new Cesium.JulianDate(),
    );
    const tAhead = Cesium.JulianDate.addSeconds(t, 0.35, new Cesium.JulianDate());
    const p0 = route.trainEntity.position.getValue(t);
    const p1 = route.trainEntity.position.getValue(tAhead);
    const fwd = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(p1, p0, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const q = route.trainEntity.orientation.getValue(t);
    assertMonorailModelAlignedWithForward(p0, fwd, q, `WoR-frac-${frac}`);
  }

  // Camera switches hide model in Cab mode and reveal it in Chase / Heli / Overview / Free
  engine.setCameraMode('cab');
  assert.equal(route.trainEntity.model.show, false);
  engine.setCameraMode('chase');
  assert.equal(route.trainEntity.model.show, true);
  engine.setCameraMode('heli');
  assert.equal(route.trainEntity.model.show, true);
  engine.setCameraMode('overview');
  assert.equal(route.trainEntity.model.show, true);

  engine.destroy();
});

test('Transit Controller syntheticMetroEngine spawns WDW Monorail fleet with monorail.glb aligned along both beams', () => {
  const addedEntities = [];
  const mockViewer = {
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
  };

  const metro = createSyntheticMetroEngine({ viewer: mockViewer });
  const trains = metro.startMetroSystem('wdw_monorail');

  assert.equal(trains.length, 4);
  for (const train of trains) {
    assert.equal(train.route.vehicleMode, 'monorail');
    const car = train.cars[0];
    assert.equal(car.entity.model.uri, MONORAIL_MODEL_URI);
    assert.equal(car.entity.box, undefined);
    const pos = car.pose.position.getValue();
    const q = car.pose.orientation.getValue();
    assertMonorailModelAlignedWithForward(
      pos,
      car.currentForward,
      q,
      `Metro-${train.id}`,
    );
  }

  metro.destroy();
});
