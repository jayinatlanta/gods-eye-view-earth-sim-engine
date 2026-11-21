import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createUserAvatarDot, USER_AVATAR_DEFAULTS } from '../layers/citylife/userAvatarDot.js';

test('Living World Sim — User Avatar Dot & Dynamic Ground Clamping', async (t) => {
  function createMockViewer() {
    const mockEntities = [];
    return {
      entities: {
        add: (spec) => {
          const e = {
            ...spec,
            show: true,
            position: {
              setValue: (val) => { e._pos = val; },
            },
            orientation: {
              setValue: (val) => { e._orient = val; },
            },
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
          getHeight: (_carto) => 305.5,
        },
      },
    };
  }

  await t.test('spawns user avatar with 14px cyan dot and depth-test disabled', () => {
    const viewer = createMockViewer();
    const avatar = createUserAvatarDot({ viewer });

    const entity = avatar.spawn({ lat: 33.7490, lon: -84.3880, heading: 45 });
    assert.ok(entity);
    assert.equal(viewer.entities._all.length, 1);

    // Verify contact reticle specs
    assert.equal(entity.point.pixelSize, 14);
    assert.equal(entity.point.outlineWidth, 3.0);
    assert.equal(entity.point.disableDepthTestDistance, Number.POSITIVE_INFINITY);
    assert.equal(entity.properties.isUserAvatar, true);
    assert.equal(entity.properties.role, 'player');

    // Verify ground clamping: 305.5 + 0.15 = 305.65m
    const coords = avatar.getCoordinates();
    assert.equal(coords.lat, 33.7490);
    assert.equal(coords.lon, -84.3880);
    assert.ok(Math.abs(coords.height - 305.65) < 0.001);
    assert.equal(coords.heading, 45);
  });

  await t.test('updatePosition updates coordinate, heading, and terrain height', () => {
    const viewer = createMockViewer();
    const avatar = createUserAvatarDot({ viewer });

    avatar.spawn({ lat: 33.7490, lon: -84.3880, heading: 0 });
    const newCart = avatar.updatePosition({ lat: 33.7500, lon: -84.3870, heading: 90 });

    assert.ok(newCart);
    const coords = avatar.getCoordinates();
    assert.equal(coords.lat, 33.7500);
    assert.equal(coords.lon, -84.3870);
    assert.equal(coords.heading, 90);
  });

  await t.test('visibility toggle and clean destruction', () => {
    const viewer = createMockViewer();
    const avatar = createUserAvatarDot({ viewer });

    const entity = avatar.spawn({ lat: 33.7490, lon: -84.3880 });
    assert.equal(avatar.isVisible, true);

    avatar.setVisible(false);
    assert.equal(entity.show, false);
    assert.equal(avatar.isVisible, false);

    avatar.destroy();
    assert.equal(avatar.isDestroyed, true);
    assert.equal(viewer.entities._all.length, 0);
  });
});
