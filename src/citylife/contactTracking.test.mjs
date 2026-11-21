import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createLivePose } from '../layers/citylife/livePose.js';
import { createSurfaceTracker } from '../layers/citylife/surfaceHeight.js';
import {
  FREIGHT_CAMERA_MODES,
  calculateFreightCameraTransform,
} from '../layers/freight/freightCameraSuite.js';
import { createFreightSimEngine } from '../layers/freight/freightSimEngine.js';
import { createSyntheticBusEngine } from '../layers/citylife/syntheticBusEngine.js';
import { createSyntheticMetroEngine } from '../layers/citylife/syntheticMetroEngine.js';

const NOW = Cesium.JulianDate.now();
const STUB_SCENE = { frameState: { context: { depthTexture: true } } };

function boxEntity(position, orientation) {
  return new Cesium.Entity({
    position,
    orientation,
    box: {
      dimensions: new Cesium.Cartesian3(2.6, 7.2, 3.8),
      material: Cesium.Color.WHITE.withAlpha(0.5),
      outline: true,
      outlineColor: Cesium.Color.WHITE,
    },
  });
}

test('Outlined Contact Tracking (freight / bus / metro) â€” dynamic box geometry', async (t) => {
  await t.test(
    'ROOT CAUSE: a ConstantPositionProperty box is STATIC geometry (async rebuild per setValue); a live pose box is DYNAMIC',
    () => {
      const here = Cesium.Cartesian3.fromDegrees(-84.39, 33.75, 300);

      const staticEntity = boxEntity(
        new Cesium.ConstantPositionProperty(here),
        new Cesium.ConstantProperty(Cesium.Quaternion.IDENTITY),
      );
      const staticUpdater = new Cesium.BoxGeometryUpdater(
        staticEntity,
        STUB_SCENE,
      );
      assert.equal(
        staticUpdater.isDynamic,
        false,
        'constant position => static geometry (the freezing/never-drawn bug)',
      );

      const pose = createLivePose(here, Cesium.Quaternion.IDENTITY);
      const liveEntity = boxEntity(pose.position, pose.orientation);
      const liveUpdater = new Cesium.BoxGeometryUpdater(liveEntity, STUB_SCENE);
      assert.equal(
        liveUpdater.isDynamic,
        true,
        'live pose => dynamic geometry updated in place every frame',
      );
    },
  );

  await t.test('createLivePose moves without raising definitionChanged', () => {
    const a = Cesium.Cartesian3.fromDegrees(-84.39, 33.75, 300);
    const b = Cesium.Cartesian3.fromDegrees(-84.389, 33.75, 300);
    const pose = createLivePose(a, Cesium.Quaternion.IDENTITY);
    let changed = 0;
    pose.position.definitionChanged.addEventListener(() => changed++);
    pose.orientation.definitionChanged.addEventListener(() => changed++);

    assert.equal(pose.position.isConstant, false);
    assert.equal(pose.orientation.isConstant, false);
    pose.set(b, undefined); // undefined orientation keeps the previous one
    assert.equal(changed, 0, 'moving a live pose must not rebuild geometry');
    assert.ok(Cesium.Cartesian3.equals(pose.position.getValue(NOW), b));
    assert.ok(
      Cesium.Quaternion.equals(
        pose.orientation.getValue(NOW),
        Cesium.Quaternion.IDENTITY,
      ),
    );
  });

  await t.test(
    'freight: tractor, trailer and air-cargo plane entities are driven by live poses that follow the sim',
    () => {
      const entities = [];
      const viewer = {
        scene: { preRender: { addEventListener: () => () => {} } },
        camera: { setView: () => {} },
        entities: {
          add: (def) => {
            entities.push(def);
            return {
              position: def.position,
              orientation: def.orientation,
              box: def.box,
              point: def.point,
            };
          },
          remove: () => {},
        },
      };
      const engine = createFreightSimEngine({ viewer });
      engine.start();

      const moving = entities.filter(
        (e) => e.properties?.isFreightTruck || e.properties?.isFreightTrailer,
      );
      assert.ok(moving.length >= 8);
      for (const e of [
        ...moving,
        ...entities.filter((x) => x.properties?.isAirCargoFreighter),
      ]) {
        assert.equal(
          e.position.isConstant,
          false,
          `${e.name} position must be dynamic`,
        );
        assert.equal(e.orientation.isConstant, false);
      }

      // The entity pose must equal the simulated pose after ticking (not stay frozen).
      const truck = engine.getAllTrucks().find((x) => x.id === 'TRK-504');
      const tractorDef = entities.find(
        (e) =>
          e.properties?.isFreightTruck && e.properties.truckId === 'TRK-504',
      );
      const before = Cesium.Cartesian3.clone(tractorDef.position.getValue(NOW));
      truck.speedMph = 65;
      for (let i = 0; i < 5; i++) {
        engine.tick();
      }
      const after = tractorDef.position.getValue(NOW);
      assert.ok(
        Cesium.Cartesian3.distance(before, after) > 0.0,
        'tractor outlined box must advance with the truck',
      );
      assert.ok(
        Cesium.Cartesian3.equals(after, truck.currentPos),
        'tractor entity position must equal sim position',
      );
      engine.destroy();
    },
  );

  await t.test(
    'freight: camera follows the pose the contact was rendered with (no one-step drift)',
    () => {
      let lastView = null;
      const viewer = {
        scene: { preRender: { addEventListener: () => () => {} } },
        camera: { setView: (o) => (lastView = o) },
        entities: {
          add: (def) => ({
            position: def.position,
            orientation: def.orientation,
            box: def.box,
            point: def.point,
          }),
          remove: () => {},
        },
      };
      const engine = createFreightSimEngine({ viewer });
      engine.start();
      const truck = engine.getLatchedTruck();
      truck.speedMph = 65;
      const drawn = Cesium.Cartesian3.clone(truck.currentPos); // what entities show this frame
      engine.tick();
      assert.ok(lastView?.destination, 'camera was positioned');
      // Camera is placed relative to the DRAWN pose: it must be much closer to `drawn`
      // than to a position a whole sim step ahead along the road (sanity bound only).
      assert.ok(Cesium.Cartesian3.distance(lastView.destination, drawn) < 80);
      assert.ok(
        Cesium.Cartesian3.equals(truck.renderPos, drawn),
        'render snapshot = pre-step pose',
      );
      engine.destroy();
    },
  );

  await t.test(
    'bus & metro cars use live poses (dynamic box) and track the sim',
    () => {
      const mk = () => {
        const ents = [];
        return {
          ents,
          viewer: {
            entities: {
              add: (spec) => {
                const e = { ...spec };
                ents.push(e);
                return e;
              },
              remove: () => {},
            },
            camera: { setView: () => {}, flyTo: () => {} },
            scene: {
              preRender: {
                addEventListener: (cb) => {
                  ents.tick = cb;
                  return () => {};
                },
              },
            },
          },
        };
      };

      const bus = mk();
      const busEngine = createSyntheticBusEngine({ viewer: bus.viewer });
      const fleet = busEngine.startBusFleet('atlanta', { busCount: 2 });
      for (const b of fleet) {
        assert.equal(b.entity.position.isConstant, false, 'bus box dynamic');
      }
      bus.ents.tick();
      assert.ok(
        Cesium.Cartesian3.equals(
          fleet[0].entity.position.getValue(NOW),
          fleet[0].currentPos,
        ),
        'bus entity position equals sim position',
      );
      busEngine.destroy();

      const metro = mk();
      const metroEngine = createSyntheticMetroEngine({ viewer: metro.viewer });
      metroEngine.startMetroSystem('atlanta');
      const cars = metro.ents.filter((e) => e.properties?.isSyntheticMetro);
      assert.ok(cars.length > 0);
      for (const c of cars) {
        assert.equal(c.position.isConstant, false, 'metro car box dynamic');
      }
      metroEngine.destroy?.();
    },
  );

  await t.test(
    'freight camera never dips below the road, even with no surface samples',
    () => {
      const truckPos = Cesium.Cartesian3.fromDegrees(-84.39, 33.75, 320);
      const fwd = new Cesium.Cartesian3(0, 0, 1);
      const viewer = {
        scene: { globe: { show: false } }, // Google 3D mode, nothing sampleable yet
      };
      for (const mode of Object.values(FREIGHT_CAMERA_MODES)) {
        const xf = calculateFreightCameraTransform(truckPos, fwd, mode, viewer);
        const eyeH = Cesium.Cartographic.fromCartesian(xf.eyePos).height;
        const roadH = 320 - 2.25;
        assert.ok(
          eyeH >= roadH + 1.9,
          `${mode}: eye ${eyeH.toFixed(1)}m must clear road ${roadH}m`,
        );
      }
    },
  );

  await t.test(
    'Google 3D mode: camera is lifted above the sampled TILE surface (globe.getHeight is blind there)',
    () => {
      const truckPos = Cesium.Cartesian3.fromDegrees(-84.39, 33.75, 320);
      const fwd = new Cesium.Cartesian3(0, 0, 1);
      const TILE_SURFACE = 410; // e.g. tree canopy / embankment above the road
      const viewer = {
        scene: {
          globe: { show: false, getHeight: () => undefined },
          sampleHeightSupported: true,
          sampleHeight: () => TILE_SURFACE,
        },
      };
      for (const mode of [
        FREIGHT_CAMERA_MODES.SEMI_CHASE,
        FREIGHT_CAMERA_MODES.APRON_TRANSLOAD,
        FREIGHT_CAMERA_MODES.HELI_PATROL,
      ]) {
        const xf = calculateFreightCameraTransform(truckPos, fwd, mode, viewer);
        const eyeH = Cesium.Cartographic.fromCartesian(xf.eyePos).height;
        assert.ok(
          eyeH >= TILE_SURFACE + 3.9,
          `${mode}: eye ${eyeH.toFixed(1)}m must clear tile surface ${TILE_SURFACE}m`,
        );
      }
    },
  );

  await t.test(
    'surface tracker: snaps on acquisition, throttles samples, slews canopy spikes',
    () => {
      let calls = 0;
      let h = 300;
      const viewer = {
        scene: {
          globe: { show: false },
          sampleHeightSupported: true,
          sampleHeight: () => {
            calls++;
            return h;
          },
        },
      };
      const carto = Cesium.Cartographic.fromDegrees(-84.39, 33.75, 0);
      const tracker = createSurfaceTracker({
        sampleIntervalMs: 200,
        slewMps: 3,
        snapMeters: 25,
      });

      assert.equal(tracker.update(viewer, carto, 0), 300, 'first sample snaps');
      tracker.update(viewer, carto, 50);
      tracker.update(viewer, carto, 100);
      assert.equal(calls, 1, 'throttled within interval');

      h = 308; // small bump: glide, do not jump
      tracker.update(viewer, carto, 250);
      const glided = tracker.update(viewer, carto, 450);
      assert.ok(glided > 300 && glided < 308, `slewed (${glided})`);

      h = 600; // tiles refined / big discontinuity: snap
      assert.equal(tracker.update(viewer, carto, 800), 600);
    },
  );

  await t.test(
    'Terrain mode passes bus self-entity exclude lists to sampleHeight; Google 3D mode skips building-roof sampleHeight for bus and metro',
    () => {
      const busTerrainExcludeSeen = [];
      let busTerrainTick = null;
      const busTerrainViewer = {
        entities: {
          add(spec) {
            return { id: Math.random(), ...spec };
          },
          remove() {},
        },
        scene: {
          globe: { show: true, getHeight: () => 308 },
          sampleHeightSupported: true,
          sampleHeight(_carto, exclude) {
            busTerrainExcludeSeen.push(exclude);
            return 310;
          },
          preRender: {
            addEventListener: (cb) => {
              busTerrainTick = cb;
              return () => {};
            },
          },
        },
        camera: { setView() {} },
      };
      const busTerrainEng = createSyntheticBusEngine({
        viewer: busTerrainViewer,
      });
      busTerrainEng.startBusFleet('atlanta', { busCount: 1 });
      if (busTerrainTick) busTerrainTick();
      assert.ok(busTerrainExcludeSeen.length > 0, 'bus sampleHeight called');
      assert.ok(
        busTerrainExcludeSeen.every((ex) => Array.isArray(ex) && ex.length > 0),
        'bus sampleHeight must exclude bus entity to prevent roof self-hit',
      );
      busTerrainEng.destroy();

      const bus3dCalls = [];
      const metro3dCalls = [];
      let bus3dTick = null;
      let metro3dTick = null;
      const bus3dViewer = {
        entities: {
          add(spec) {
            return { id: Math.random(), ...spec };
          },
          remove() {},
        },
        scene: {
          globe: { show: false, getHeight: () => undefined },
          sampleHeightSupported: true,
          sampleHeight(_carto, exclude) {
            bus3dCalls.push(exclude);
            return 450; // tall 3D building roof
          },
          preRender: {
            addEventListener: (cb) => {
              bus3dTick = cb;
              return () => {};
            },
          },
        },
        camera: { setView() {} },
      };
      const bus3dEng = createSyntheticBusEngine({ viewer: bus3dViewer });
      bus3dEng.startBusFleet('atlanta', { busCount: 1 });
      if (bus3dTick) bus3dTick();
      assert.equal(
        bus3dCalls.length,
        0,
        'bus must not snap to 3D building roofs via sampleHeight in Google 3D mode',
      );
      bus3dEng.destroy();

      const metro3dViewer = {
        entities: {
          add(spec) {
            return { id: Math.random(), ...spec };
          },
          remove() {},
        },
        scene: {
          globe: { show: false, getHeight: () => undefined },
          sampleHeightSupported: true,
          sampleHeight(_carto, exclude) {
            metro3dCalls.push(exclude);
            return 450; // tall 3D building roof
          },
          preRender: {
            addEventListener: (cb) => {
              metro3dTick = cb;
              return () => {};
            },
          },
        },
        camera: { setView() {} },
      };
      const metro3dEng = createSyntheticMetroEngine({ viewer: metro3dViewer });
      metro3dEng.startMetroSystem('atlanta');
      if (metro3dTick) metro3dTick();
      assert.equal(
        metro3dCalls.length,
        0,
        'metro must stay flat on corridor grade without building-roof sampleHeight in Google 3D mode',
      );
      metro3dEng.destroy?.();
    },
  );
});
