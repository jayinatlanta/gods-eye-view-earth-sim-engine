import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createSyntheticBusEngine,
  MUNICIPAL_BUS_ROUTES,
  buildBusTrajectory,
  sampleBusTrajectory,
} from '../layers/citylife/syntheticBusEngine.js';

test('Living City Transit — Municipal Bus Fleet Engine', async (t) => {
  function createMockViewer() {
    const entities = [];
    const primitives = [];
    return {
      entities: {
        add: (spec) => {
          const e = { ...spec, _id: `bus_${entities.length}` };
          entities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = entities.indexOf(e);
          if (idx >= 0) entities.splice(idx, 1);
        },
        _all: entities,
      },
      camera: {
        setView: () => {},
      },
      scene: {
        primitives: {
          added: primitives,
          add: (p) => {
            primitives.push(p);
            return p;
          },
          remove: (p) => {
            const idx = primitives.indexOf(p);
            if (idx >= 0) primitives.splice(idx, 1);
          },
        },
        preRender: {
          addEventListener: () => () => {},
        },
      },
    };
  }

  await t.test(
    'MUNICIPAL_BUS_ROUTES contains all 5 iconic world transit systems',
    () => {
      assert.ok(MUNICIPAL_BUS_ROUTES.atlanta_marta_110);
      assert.ok(MUNICIPAL_BUS_ROUTES.nyc_mta_m15);
      assert.ok(MUNICIPAL_BUS_ROUTES.chicago_cta_66);
      assert.ok(MUNICIPAL_BUS_ROUTES.tokyo_toei_01);
      assert.ok(MUNICIPAL_BUS_ROUTES.london_tfl_24);

      const marta = MUNICIPAL_BUS_ROUTES.atlanta_marta_110;
      assert.equal(marta.operator, 'MARTA');
      assert.equal(marta.routeNumber, '110');
      assert.equal(marta.stops.length, 5);
      assert.ok(marta.waypoints.length >= 5);
    },
  );

  await t.test(
    'buildBusTrajectory calculates cumulative distances accurately',
    () => {
      const route = MUNICIPAL_BUS_ROUTES.atlanta_marta_110;
      const traj = buildBusTrajectory(route.waypoints);
      assert.ok(traj);
      assert.ok(traj.totalDistance > 1000); // Atlanta Peachtree corridor > 1 km
      assert.equal(traj.cumulativeDistances.length, traj.length);
    },
  );

  await t.test(
    'sampleBusTrajectory computes valid positions and normalized forward tangents',
    () => {
      const route = MUNICIPAL_BUS_ROUTES.atlanta_marta_110;
      const traj = buildBusTrajectory(route.waypoints);
      const sample = sampleBusTrajectory(traj, 250);

      assert.ok(sample.pos);
      assert.ok(sample.forward);
      const mag = Cesium.Cartesian3.magnitude(sample.forward);
      assert.ok(
        Math.abs(mag - 1.0) < 1e-4,
        'Tangent vector should be normalized to unit length',
      );
    },
  );

  await t.test(
    'startBusFleet initializes active fleet with highlighted wireframe box reticles',
    () => {
      const viewer = createMockViewer();
      const engine = createSyntheticBusEngine({ viewer });

      assert.equal(engine.isSimActive(), false);
      const fleet = engine.startBusFleet('atlanta', { busCount: 3 });

      assert.equal(engine.isSimActive(), true);
      assert.equal(fleet.length, 3);
      assert.equal(engine.getActiveCity(), 'atlanta');

      const bus = fleet[0];
      assert.ok(bus.entity);
      assert.equal(bus.entity.properties.isSyntheticBus, true);
      assert.equal(bus.entity.box.outline, true);
      assert.equal(bus.entity.box.outlineWidth, 3.0);
      assert.equal(bus.entity.box.outlineColor, Cesium.Color.WHITE);
      assert.ok(bus.entity.point);
      assert.equal(
        bus.entity.point.disableDepthTestDistance,
        Number.POSITIVE_INFINITY,
      );
      assert.equal(bus.entity.point.outlineColor, Cesium.Color.WHITE);

      const telem = engine.getActiveTelemetry();
      assert.ok(telem);
      assert.equal(telem.mode, 'BUS');
      assert.equal(telem.operator, 'MARTA');
      assert.equal(telem.totalFleetSize, 3);
      assert.equal(telem.isCameraEnabled, true);

      engine.stopBusFleet();
      assert.equal(engine.isSimActive(), false);
    },
  );

  await t.test(
    'supports camera mode toggles, establishing map, snapBack, and active bus switching',
    () => {
      let flyToCalled = false;
      const viewer = createMockViewer();
      viewer.camera.flyTo = () => {
        flyToCalled = true;
      };
      const engine = createSyntheticBusEngine({ viewer });
      const fleet = engine.startBusFleet('atlanta', { busCount: 2 });

      assert.equal(engine.getCameraMode(), 'chase');
      engine.setCameraMode('cab');
      assert.equal(engine.getCameraMode(), 'cab');
      engine.setCameraMode('door');
      assert.equal(engine.getCameraMode(), 'door');
      engine.setCameraMode('heli');
      assert.equal(engine.getCameraMode(), 'heli');

      // Establishing Map frames full bus route network and restores contact dots when exiting cab mode
      let flyArgs = null;
      viewer.camera.flyTo = (opts) => {
        flyToCalled = true;
        flyArgs = opts;
      };
      engine.setCameraMode('cab');
      if (fleet[0].entity?.point) {
        fleet[0].entity.point.show = false;
      }
      engine.showTransitMap();
      assert.equal(engine.getCameraMode(), 'overview');
      assert.equal(engine.isCameraEnabled(), false);
      assert.equal(flyToCalled, true);
      assert.equal(
        fleet[0].entity.point.show,
        true,
        'map overview restores bus contact dots immediately',
      );
      const busPrimitivesAdded = viewer.scene.primitives.added || [];
      assert.ok(
        busPrimitivesAdded.length >= 2,
        'adds batched bus corridor & stop primitives on startup',
      );
      assert.equal(engine.isRouteLinesVisible(), true);
      engine.setRouteLinesVisible(false);
      assert.equal(engine.isRouteLinesVisible(), false);
      assert.ok(
        busPrimitivesAdded.some((p) => p.show === false),
        'hiding bus lines sets corridor/stop overlay collections hidden',
      );
      engine.setRouteLinesVisible(true);
      assert.equal(engine.isRouteLinesVisible(), true);
      const camCarto = Cesium.Cartographic.fromCartesian(flyArgs.destination);
      assert.ok(
        camCarto.height >= 3600,
        `bus network map frames whole route system (got ${Math.round(camCarto.height)}m)`,
      );

      // Snap Back to latched bus
      engine.snapBack('chase');
      assert.equal(engine.getCameraMode(), 'chase');
      assert.equal(engine.isCameraEnabled(), true);

      // Camera enable/disable toggles
      engine.setCameraEnabled(false);
      assert.equal(engine.isCameraEnabled(), false);
      engine.setCameraEnabled(true);
      assert.equal(engine.isCameraEnabled(), true);

      const switched = engine.setActiveBus(fleet[1].id);
      assert.equal(switched, true);
      assert.equal(engine.getActiveBus().id, fleet[1].id);

      engine.destroy();
    },
  );

  await t.test(
    'advances sequential targetStopIndex on dwell departure without getting stuck',
    () => {
      let tickCb = null;
      const viewer = createMockViewer();
      viewer.scene.preRender.addEventListener = (cb) => {
        tickCb = cb;
        return () => {};
      };

      const engine = createSyntheticBusEngine({ viewer });
      const fleet = engine.startBusFleet('atlanta', { busCount: 1 });
      const bus = fleet[0];

      assert.ok(bus.targetStopIndex !== undefined);
      const initialTargetIdx = bus.targetStopIndex;

      // Simulate arriving at stop
      bus.state = 'APPROACHING_STOP';
      bus.speedMs = 0.1;
      tickCb(); // transitions to DWELL

      assert.equal(bus.state, 'DWELL');
      assert.ok(bus.dwellTimerSec > 0);

      // Force dwell completion
      bus.dwellTimerSec = 0.001;
      tickCb(); // completes dwell, advances targetStopIndex, transitions to DEPARTING

      assert.equal(bus.state, 'DEPARTING');
      assert.equal(
        bus.targetStopIndex,
        (initialTargetIdx + 1) % bus.route.stops.length,
        'targetStopIndex must advance to the next sequential stop',
      );

      // Departs cleanly
      bus.departTimerSec = 0.001;
      tickCb();
      assert.equal(bus.state, 'CRUISING');

      engine.destroy();
    },
  );

  await t.test(
    'buses ignore 3D building rooftop sampleHeight spikes in photoreal 3D mode',
    () => {
      let tickCb = null;
      const viewer = createMockViewer();
      viewer.scene.globe = { show: false };
      viewer.scene.sampleHeightSupported = true;
      viewer.scene.sampleHeight = () => 9999;
      viewer.scene.preRender.addEventListener = (cb) => {
        tickCb = cb;
        return () => {};
      };

      const engine = createSyntheticBusEngine({ viewer });
      const fleet = engine.startBusFleet('atlanta', { busCount: 1 });
      const bus = fleet[0];
      const startH = Cesium.Cartographic.fromCartesian(bus.currentPos).height;

      tickCb();

      const nextH = Cesium.Cartographic.fromCartesian(bus.currentPos).height;
      assert.ok(
        nextH < 1000,
        `Bus must not climb skyscraper rooftops (got ${nextH}m)`,
      );
      assert.ok(
        Math.abs(nextH - startH) < 15,
        'Bus stays at street/corridor elevation',
      );

      engine.destroy();
    },
  );
});
