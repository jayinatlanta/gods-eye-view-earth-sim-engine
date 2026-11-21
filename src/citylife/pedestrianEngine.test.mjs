import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createPedestrianEngine } from '../layers/citylife/pedestrianEngine.js';
import { LIVING_CITIES } from './cityWaypoints.js';

test('Living Cities — Pedestrian Simulation Engine', async (t) => {
  function createMockViewer() {
    const mockEntities = [];
    return {
      entities: {
        add: (spec) => {
          const e = { ...spec, _id: `ped_${mockEntities.length}` };
          mockEntities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = mockEntities.indexOf(e);
          if (idx >= 0) mockEntities.splice(idx, 1);
        },
        _all: mockEntities,
      },
      camera: {
        flyTo: ({ complete }) => {
          if (typeof complete === 'function') complete();
        },
        lookAt: () => {},
        position: new Cesium.Cartesian3(100, 200, 300),
        direction: new Cesium.Cartesian3(0, 0, -1),
        up: new Cesium.Cartesian3(0, 1, 0),
        right: new Cesium.Cartesian3(1, 0, 0),
        heading: 0,
        positionWC: Cesium.Cartesian3.fromDegrees(-84.3725, 33.7749, 1200),
      },
      scene: {
        preRender: {
          addEventListener: () => () => {},
        },
        canvas: {},
      },
    };
  }

  await t.test('engine initializes with simulation default OFF (Opt-In Contract)', () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    assert.equal(engine.isSimActive(), false);
    assert.equal(engine.getActiveCity(), null);
    assert.equal(engine.getActiveTelemetry(), null);

    engine.destroy();
  });

  await t.test('stepIntoCity glides camera and spawns pedestrians in active city', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    const city = await engine.stepIntoCity('atlanta', { density: 'calm', duration: 0 });
    assert.ok(city);
    assert.equal(city.id, 'atlanta');
    assert.equal(engine.isSimActive(), true);

    // Calm density has 40 pedestrians
    assert.equal(mockViewer.entities._all.length, 40);

    const telemetry = engine.getActiveTelemetry();
    assert.ok(telemetry);
    assert.equal(telemetry.isActive, true);
    assert.equal(telemetry.currentLocation, 'Atlanta');
    assert.ok(telemetry.personaName);
    assert.ok(telemetry.thought);
    assert.equal(telemetry.activePedestrians, 40);

    engine.destroy();
  });

  await t.test('supports density switching (Calm, Lively, Rush)', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('tokyo', { density: 'calm', duration: 0 });
    assert.equal(mockViewer.entities._all.length, 40);

    engine.setDensity('rush');
    assert.equal(mockViewer.entities._all.length, 160);

    engine.setDensity('lively');
    assert.equal(mockViewer.entities._all.length, 90);

    engine.destroy();
  });

  await t.test('supports camera modes and snapBack', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('new_york', { duration: 0 });

    engine.setCameraMode('flaneur');
    engine.setCameraMode('balcony');
    engine.setCameraMode('overview');
    engine.setCameraMode('free');

    // Free cam detaches trackedEntity
    assert.equal(mockViewer.trackedEntity, undefined);

    // Snap back restores companion follow
    engine.snapBack('companion');

    engine.destroy();
  });

  await t.test('weather toggle updates rain state and persona speeds', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('atlanta', { duration: 0 });
    let telem = engine.getActiveTelemetry();
    assert.equal(telem.isRaining, false);

    engine.toggleRain(true);
    telem = engine.getActiveTelemetry();
    assert.equal(telem.isRaining, true);

    engine.destroy();
  });

  await t.test('supports pedestrian cycling and browsing across active citizens', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('atlanta', { density: 'calm', duration: 0 });
    const peds = engine.getPedestrians();
    assert.equal(peds.length, 40);

    const initial = engine.getLatchedPedestrian();
    assert.ok(initial);
    assert.equal(initial.id, peds[0].id);

    // Cycle forward
    const next = engine.cyclePedestrian(1);
    assert.equal(next.id, peds[1].id);
    assert.equal(engine.getLatchedPedestrian().id, peds[1].id);

    // Cycle backward
    const prev = engine.cyclePedestrian(-1);
    assert.equal(prev.id, peds[0].id);

    engine.destroy();
  });

  await t.test(
    'pedestrians are rendered as moving dots on canvas with distinct selected target dot on latched citizen',
    async () => {
      const mockViewer = createMockViewer();
      const engine = createPedestrianEngine({ viewer: mockViewer });

      await engine.stepIntoCity('atlanta', { density: 'calm', duration: 0 });
      const peds = engine.getPedestrians();
      assert.equal(peds.length, 40);

      // Verify all pedestrian entities have point graphic with depth test disabled
      for (const ped of peds) {
        assert.ok(ped.entity.point, 'pedestrian must have a point graphic');
        assert.equal(
          ped.entity.point.disableDepthTestDistance,
          Number.POSITIVE_INFINITY,
          'point must have infinite depth test distance so it renders above ground',
        );
      }

      // Initial latched pedestrian (index 0) has prominent selected dot styling
      const initial = peds[0];
      assert.equal(initial.entity.point.pixelSize, 14);
      assert.equal(initial.entity.point.outlineWidth, 2.5);
      assert.equal(initial.entity.point.outlineColor, Cesium.Color.WHITE);

      // Unlatched pedestrians have standard dot styling (8px)
      const unlatched = peds[1];
      assert.equal(unlatched.entity.point.pixelSize, 8);
      assert.equal(unlatched.entity.point.outlineWidth, 1.5);

      // Latching onto peds[1] elevates peds[1] and reverts peds[0]
      engine.latchOntoPedestrian(unlatched);
      assert.equal(unlatched.entity.point.pixelSize, 14);
      assert.equal(unlatched.entity.point.outlineColor, Cesium.Color.WHITE);
      assert.equal(initial.entity.point.pixelSize, 8);

      // City map unlatches and reverts peds[1]
      engine.showCityMap('atlanta');
      assert.equal(unlatched.entity.point.pixelSize, 8);
      assert.equal(engine.getLatchedPedestrian(), null);

      engine.destroy();
    },
  );

  await t.test('supports city map mode and speed multiplier', async () => {
    let flownTarget = null;
    const mockViewer = createMockViewer();
    mockViewer.camera.flyTo = (opts) => {
      flownTarget = opts;
      if (typeof opts.complete === 'function') opts.complete();
    };
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('atlanta', { duration: 0 });
    assert.equal(engine.getSpeedMultiplier(), 1.0);

    engine.setSpeedMultiplier(0.6); // Leisurely pace
    assert.equal(engine.getSpeedMultiplier(), 0.6);

    // Show city map
    const mapCity = engine.showCityMap('atlanta');
    assert.ok(mapCity);
    assert.equal(mapCity.id, 'atlanta');
    assert.ok(flownTarget);

    engine.destroy();
  });

  await t.test('clearPedestrians prunes all entities and resets simulation state', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    await engine.stepIntoCity('london', { duration: 0 });
    assert.ok(mockViewer.entities._all.length > 0);

    engine.clearPedestrians();
    assert.equal(mockViewer.entities._all.length, 0);
    assert.equal(engine.isSimActive(), false);
    assert.equal(engine.getActiveTelemetry(), null);

    engine.destroy();
  });

  await t.test('stepIntoLocale glides camera to living world locale and spawns contextual entities', async () => {
    const mockViewer = createMockViewer();
    const engine = createPedestrianEngine({ viewer: mockViewer });

    const loc = await engine.stepIntoLocale('darien_ga', { duration: 0 });
    assert.ok(loc);
    assert.equal(loc.id, 'darien_ga');
    assert.equal(engine.isSimActive(), true);
    assert.equal(engine.getActiveLocale()?.id, 'darien_ga');
    assert.equal(engine.getActiveTypology(), 'COASTAL_TIDEWATER');

    const spool = engine.getContextualSpool();
    assert.ok(spool.getEntityCount() > 0);

    engine.clearPedestrians();
    assert.equal(engine.getActiveLocale(), null);
    assert.equal(spool.getEntityCount(), 0);

    engine.destroy();
  });
});
