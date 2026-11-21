import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  URBAN_EVENTS,
  generateCircuitTrajectory,
  createUrbanEventsEngine,
} from './urbanEvents.js';

test('Living Cities — Urban Spectacles & Events Engine', async (t) => {
  await t.test('verifies Monaco GP, Vegas GP, and cultural festivals are cataloged', () => {
    assert.ok(URBAN_EVENTS.monaco_gp);
    assert.equal(URBAN_EVENTS.monaco_gp.type, 'race');
    assert.equal(URBAN_EVENTS.monaco_gp.carCount, 12);
    assert.equal(URBAN_EVENTS.monaco_gp.waypoints.length, 18);

    assert.ok(URBAN_EVENTS.vegas_gp);
    assert.equal(URBAN_EVENTS.vegas_gp.type, 'race');
    assert.ok(URBAN_EVENTS.vegas_gp.topSpeedKmh > 300);

    assert.ok(URBAN_EVENTS.atlanta_dogwood);
    assert.equal(URBAN_EVENTS.atlanta_dogwood.type, 'festival');

    assert.ok(URBAN_EVENTS.shibuya_halloween);
    assert.equal(URBAN_EVENTS.shibuya_halloween.type, 'festival');

    assert.ok(URBAN_EVENTS.emergency_pulse);
    assert.equal(URBAN_EVENTS.emergency_pulse.type, 'emergency');
  });

  await t.test('generates closed-loop circuit trajectory with smooth interpolation', () => {
    const waypoints = URBAN_EVENTS.monaco_gp.waypoints;
    const trajectory = generateCircuitTrajectory(waypoints, 20);

    assert.ok(Array.isArray(trajectory));
    assert.ok(trajectory.length > waypoints.length);
    assert.ok(trajectory[0] instanceof Cesium.Cartesian3);

    // Verify start and end points match the loop closure
    const start = trajectory[0];
    const end = trajectory[trajectory.length - 1];
    const closureDist = Cesium.Cartesian3.distance(start, end);
    assert.ok(
      closureDist < 5.0,
      `Circuit must close smoothly, start/end delta is ${closureDist}m`,
    );
  });

  await t.test('engine starts, updates telemetry, and stops cleanly in mock viewer', () => {
    const mockEntities = [];
    const mockViewer = {
      entities: {
        add: (spec) => {
          const e = { ...spec, _id: `e_${mockEntities.length}` };
          mockEntities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = mockEntities.indexOf(e);
          if (idx >= 0) mockEntities.splice(idx, 1);
        },
      },
      camera: {
        flyTo: () => {},
        lookAt: () => {},
      },
      scene: {
        preRender: {
          addEventListener: () => () => {},
        },
      },
    };

    const engine = createUrbanEventsEngine({ viewer: mockViewer });
    assert.equal(engine.getActiveEvent(), null);

    // Start Monaco GP
    const started = engine.startUrbanEvent('monaco_gp');
    assert.ok(started);
    assert.equal(started.id, 'monaco_gp');
    assert.equal(mockEntities.length, 12); // 12 F1 cars spawned

    // Stop event
    engine.stopUrbanEvent();
    assert.equal(engine.getActiveEvent(), null);
    assert.equal(mockEntities.length, 0); // All entities cleaned up

    engine.destroy();
  });

  await t.test('supports spectacle camera mode switching (overview, chase, cockpit, grandstand, free)', () => {
    let flownTo = null;
    const mockViewer = {
      entities: {
        add: () => ({}),
        remove: () => {},
      },
      camera: {
        flyTo: (opts) => {
          flownTo = opts;
        },
        lookAtTransform: () => {},
      },
      scene: {
        preRender: {
          addEventListener: () => () => {},
        },
      },
    };

    const engine = createUrbanEventsEngine({ viewer: mockViewer });
    engine.startUrbanEvent('monaco_gp');

    assert.equal(engine.getCameraMode(), 'chase');

    engine.setCameraMode('overview');
    assert.equal(engine.getCameraMode(), 'overview');
    assert.ok(flownTo);

    engine.setCameraMode('cockpit');
    assert.equal(engine.getCameraMode(), 'cockpit');

    engine.setCameraMode('grandstand');
    assert.equal(engine.getCameraMode(), 'grandstand');

    engine.setCameraMode('free');
    assert.equal(engine.getCameraMode(), 'free');

    engine.snapBack('chase');
    assert.equal(engine.getCameraMode(), 'chase');

    engine.destroy();
  });
});
