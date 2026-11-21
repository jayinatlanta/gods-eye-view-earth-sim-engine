import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createCompanionDot,
  generateCompanionThought,
  COMPANION_DEFAULTS,
} from '../layers/citylife/companionDot.js';
import { getForkProfile } from '../config/forkProfile.js';

test('Living World Sim — Companion Dot & Tether Kinematics', async (t) => {
  function createMockViewer() {
    const mockEntities = [];
    return {
      entities: {
        add: (spec) => {
          const e = {
            ...spec,
            show: true,
            position: { setValue: (val) => { e._pos = val; } },
            orientation: { setValue: (val) => { e._orient = val; } },
          };
          mockEntities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = mockEntities.indexOf(e);
          if (idx >= 0) mockEntities.splice(idx, 1);
        },
        _all: mockEntities,
      },
      scene: {
        globe: {
          getHeight: (_carto) => 300.0,
        },
      },
    };
  }

  await t.test('spawns companion with 12px emerald dot and depth-test disabled', () => {
    const viewer = createMockViewer();
    const companion = createCompanionDot({ viewer });

    const entity = companion.spawn({ lat: 33.7490, lon: -84.3880, heading: 0 });
    assert.ok(entity);
    assert.equal(viewer.entities._all.length, 1);

    assert.equal(entity.point.pixelSize, 12);
    assert.equal(entity.point.outlineWidth, 2.5);
    assert.equal(entity.point.disableDepthTestDistance, Number.POSITIVE_INFINITY);
    assert.equal(entity.properties.isCompanion, true);
    assert.equal(
      entity.properties.persona.name,
      getForkProfile().defaultCompanionName,
    );
  });

  await t.test('elastic soft tether matches user motion when moving', () => {
    const viewer = createMockViewer();
    const companion = createCompanionDot({ viewer });

    const initialUser = { lat: 33.7490, lon: -84.3880, height: 300.15, heading: 0 };
    companion.spawn(initialUser);

    // User walks forward north for several frames (at 2.0 m/s, dt = 0.1s -> 0.2m per tick)
    let currentUser = { ...initialUser };
    const stepDeg = (2.0 * 0.1) / 111139.0;
    for (let i = 0; i < 20; i++) {
      currentUser.lat += stepDeg;
      const updateRes = companion.update({
        userCoordinates: currentUser,
        userSpeed: 2.0,
        deltaTimeSeconds: 0.1,
      });
      assert.ok(updateRes);
      assert.equal(updateRes.isExploring, false);
      // Distance should be within soft buffer (<= 8m)
      assert.ok(updateRes.distanceToUser <= 8.0);
    }
  });

  await t.test('ambient autonomous curiosity activates when user halts', () => {
    const viewer = createMockViewer();
    const companion = createCompanionDot({ viewer });

    const stationaryUser = { lat: 33.7490, lon: -84.3880, height: 300.15, heading: 90 };
    companion.spawn(stationaryUser);

    // Simulate user standing still (speed = 0) for 4 seconds
    let lastRes = null;
    for (let i = 0; i < 40; i++) {
      lastRes = companion.update({
        userCoordinates: stationaryUser,
        userSpeed: 0,
        deltaTimeSeconds: 0.1,
      });
    }

    assert.ok(lastRes);
    // Companion should be exploring autonomously rather than freezing!
    assert.equal(lastRes.isExploring, true);
    assert.ok(lastRes.thought);
  });

  await t.test('leash hard boundary teleports companion if separated by > 25m', () => {
    const viewer = createMockViewer();
    const companion = createCompanionDot({ viewer });

    const startUser = { lat: 33.7490, lon: -84.3880, height: 300.15, heading: 0 };
    companion.spawn(startUser);

    // User teleports 500m away (e.g. camera hop or fast flight)
    const distantUser = { lat: 33.7540, lon: -84.3880, height: 300.15, heading: 0 };
    const res = companion.update({
      userCoordinates: distantUser,
      userSpeed: 0,
      deltaTimeSeconds: 0.1,
    });

    assert.ok(res);
    // Should have re-anchored near the user (<= 15m)
    assert.ok(res.distanceToUser <= 15.0);
  });

  await t.test('thought generation reacts to locale archetype and high sprint speed', () => {
    const sprintThought = generateCompanionThought({
      userSpeed: 6.0,
      localeArchetype: 'DENSE_URBAN',
    });
    assert.ok(sprintThought.includes('sprint') || sprintThought.includes('sneakers') || sprintThought.includes('Catch me'));

    const coastalThought = generateCompanionThought({
      userSpeed: 1.0,
      localeArchetype: 'COASTAL_TIDEWATER',
    });
    assert.ok(coastalThought.includes('estuary') || coastalThought.includes('shrimp'));
  });

  await t.test('keeps pace inline / slightly leading during 6.7 m/s electric scooter tour transit without falling behind', () => {
    const viewer = createMockViewer();
    const companion = createCompanionDot({ viewer });

    const startUser = { lat: 25.089, lon: -80.449, height: -24.0, heading: 0 };
    companion.spawn(startUser);

    // Simulate 10 seconds of 6.7 m/s northbound electric scooter transit (dt = 0.05s)
    const user = { ...startUser };
    const stepLatDeg = (6.7 * 0.05) / 111139.0;
    let lastRes = null;
    for (let i = 0; i < 200; i++) {
      user.lat += stepLatDeg;
      lastRes = companion.update({
        userCoordinates: user,
        userSpeed: 6.7,
        deltaTimeSeconds: 0.05,
      });
    }

    assert.ok(lastRes);
    const forwardDeltaM = (lastRes.coordinates.lat - user.lat) * 111139.0;
    assert.ok(
      lastRes.distanceToUser <= 3.5,
      `Companion must stay close alongside scooter (<= 3.5m), got ${lastRes.distanceToUser.toFixed(2)}m`,
    );
    assert.ok(
      forwardDeltaM >= 0.0,
      `Companion must ride inline or slightly ahead of scooter (>= 0m forward), got ${forwardDeltaM.toFixed(2)}m`,
    );
  });
});
