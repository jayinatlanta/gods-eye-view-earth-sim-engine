import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  isPhotoreal3DActive,
  sampleActiveGroundHeight,
  pickActiveGroundPosition,
  calculateTrueAGL,
  subscribeToMapStack,
} from '../layers/citylife/surfaceHeight.js';

test('Surface Height & Dual-Regime Ground Engine', async (t) => {
  await t.test('isPhotoreal3DActive identifies 3D mode from globe.show', () => {
    const viewer3D = { scene: { globe: { show: false } } };
    const viewer2D = { scene: { globe: { show: true } } };
    const viewerNull = null;

    assert.equal(isPhotoreal3DActive(viewer3D), true);
    assert.equal(isPhotoreal3DActive(viewer2D), false);
    assert.equal(isPhotoreal3DActive(viewerNull), false);
  });

  await t.test(
    'sampleActiveGroundHeight uses sampleHeight on 3D tiles and globe.getHeight on 2D',
    () => {
      const carto = Cesium.Cartographic.fromDegrees(-84.388, 33.749, 100);

      // In 3D mode (globe.show = false): queries scene.sampleHeight
      const mock3D = {
        scene: {
          globe: { show: false, getHeight: () => 0 },
          sampleHeightSupported: true,
          sampleHeight: () => 315.5,
        },
      };
      assert.equal(sampleActiveGroundHeight(mock3D, carto), 315.5);

      // In 2D mode (globe.show = true): queries globe.getHeight
      const mock2D = {
        scene: {
          globe: { show: true, getHeight: () => 305.2 },
          sampleHeightSupported: true,
          sampleHeight: () => 999, // Should not be queried first in 2D mode
        },
      };
      assert.equal(sampleActiveGroundHeight(mock2D, carto), 305.2);
    },
  );

  await t.test(
    'sampleActiveGroundHeight falls back gracefully if sampleHeight fails or is unrendered',
    () => {
      const carto = Cesium.Cartographic.fromDegrees(-84.388, 33.749, 120);
      const mockFailing3D = {
        scene: {
          globe: { show: false, getHeight: () => 300.0 },
          sampleHeightSupported: true,
          sampleHeight: () => undefined,
        },
      };
      assert.equal(sampleActiveGroundHeight(mockFailing3D, carto), 300.0);
    },
  );

  await t.test(
    'pickActiveGroundPosition prioritizes pickPosition depth buffer over globe.pick',
    () => {
      const winPos = new Cesium.Cartesian2(400, 300);
      const targetPos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 310);

      const mockViewer = {
        scene: {
          pickPositionSupported: true,
          pickPosition: (pos) => (pos === winPos ? targetPos : null),
          globe: {
            pick: () => Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 0),
          },
        },
        camera: {
          getPickRay: () => ({}),
        },
      };

      const picked = pickActiveGroundPosition(mockViewer, winPos);
      assert.ok(picked);
      assert.equal(picked.x, targetPos.x);
    },
  );

  await t.test(
    'calculateTrueAGL measures real surface distance without sea-level trap',
    () => {
      const groundPos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 310);
      const camPos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 314.5);

      const mockViewer = {
        scene: {
          canvas: { clientWidth: 800, clientHeight: 600 },
          pickPositionSupported: true,
          pickPosition: () => groundPos,
        },
        camera: {
          positionWC: camPos,
        },
      };

      const agl = calculateTrueAGL(mockViewer);
      assert.ok(agl > 4.4 && agl < 4.6, `Expected ~4.5m AGL, got ${agl}`);
    },
  );

  await t.test(
    'subscribeToMapStack notifies listeners when globe.show changes',
    () => {
      let listenerCallback = null;
      const mockViewer = {
        scene: {
          globe: { show: true },
          preRender: {
            addEventListener: (fn) => {
              listenerCallback = fn;
              return () => {
                listenerCallback = null;
              };
            },
          },
        },
      };

      let regimeNotified = null;
      const unsubscribe = subscribeToMapStack(mockViewer, (regime) => {
        regimeNotified = regime;
      });

      // No change
      listenerCallback();
      assert.equal(regimeNotified, null);

      // Change to Google 3D
      mockViewer.scene.globe.show = false;
      listenerCallback();
      assert.deepEqual(regimeNotified, {
        isPhotoreal3D: true,
        globeShown: false,
      });

      // Change back to 2D
      mockViewer.scene.globe.show = true;
      listenerCallback();
      assert.deepEqual(regimeNotified, {
        isPhotoreal3D: false,
        globeShown: true,
      });

      unsubscribe();
    },
  );
});
