import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  clearLocalityCacheForTests,
  createWorldSimDockCoordinator,
  onLocalityResolved,
  resolveZeroCreditLocality,
} from '../ui/worldSimDock.js';
import {
  createAvatarWanderEngine,
  WANDER_CAMERA_MODES,
} from '../layers/citylife/avatarWanderEngine.js';
import { createTransitControllerDrawer } from './transitControllerDrawer.js';

test('World Sim Dock, Non-Destructive Browsing & Wander UI Polish Suite', async (t) => {
  await t.test(
    'Single-Active-Flyout Mutual Exclusion: opening a second drawer automatically closes the first',
    () => {
      const dock = createWorldSimDockCoordinator();
      let cityOpen = false;
      let transitOpen = false;

      dock.registerDrawer('city', {
        open: () => {
          dock.notifyDrawerOpened('city');
          cityOpen = true;
        },
        close: () => {
          cityOpen = false;
          dock.notifyDrawerClosed('city');
        },
        isOpen: () => cityOpen,
      });

      dock.registerDrawer('transit', {
        open: () => {
          dock.notifyDrawerOpened('transit');
          transitOpen = true;
        },
        close: () => {
          transitOpen = false;
          dock.notifyDrawerClosed('transit');
        },
        isOpen: () => transitOpen,
      });

      dock.openDrawer('city');
      assert.equal(cityOpen, true);
      assert.equal(transitOpen, false);
      assert.equal(dock.getActiveDrawerId(), 'city');

      // Opening transit MUST automatically close city (no stacked flyouts)
      dock.openDrawer('transit');
      assert.equal(
        cityOpen,
        false,
        'Previous flyout must close when new flyout opens',
      );
      assert.equal(transitOpen, true);
      assert.equal(dock.getActiveDrawerId(), 'transit');
    },
  );

  await t.test(
    'Non-Destructive Browsing: opening Transit drawer does NOT destroy active Wander or auto-start Atlanta',
    () => {
      const origDoc = global.document;
      const origWin = global.window;

      function createMockEl(tag = 'div') {
        const children = [];
        const listeners = {};
        const el = {
          tagName: tag.toUpperCase(),
          style: {},
          className: '',
          dataset: {},
          children,
          parentNode: null,
          innerHTML: '',
          classList: {
            add: () => {},
            remove: () => {},
            contains: () => false,
            toggle: () => {},
          },
          addEventListener: (evt, fn) => {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
          },
          removeEventListener: () => {},
          appendChild: (c) => {
            children.push(c);
            c.parentNode = el;
            return c;
          },
          removeChild: (c) => c,
          querySelector: (sel) => {
            el._q = el._q || {};
            if (!el._q[sel]) el._q[sel] = createMockEl('div');
            return el._q[sel];
          },
          querySelectorAll: () => [],
        };
        return el;
      }

      global.document = {
        createElement: (tName) => createMockEl(tName),
        body: createMockEl('body'),
      };
      global.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      let busStarted = 0;
      let metroStarted = 0;
      const mockBus = {
        isSimActive: () => busStarted > 0,
        startBusFleet: () => {
          busStarted++;
        },
        getFleet: () => [],
      };
      const mockMetro = {
        isSimActive: () => metroStarted > 0,
        startMetroSystem: () => {
          metroStarted++;
        },
        getTrains: () => [],
      };

      try {
        const container = createMockEl('div');
        const transitDrawer = createTransitControllerDrawer({
          busEngine: mockBus,
          metroEngine: mockMetro,
          container,
        });

        // Merely opening the Transit drawer to see what it's like MUST NOT start Atlanta transit
        transitDrawer.open();
        assert.equal(transitDrawer.isOpen(), true);
        assert.equal(
          busStarted,
          0,
          'Opening Transit drawer must NOT auto-launch Atlanta bus fleet',
        );
        assert.equal(
          metroStarted,
          0,
          'Opening Transit drawer must NOT auto-launch Atlanta metro',
        );

        // Explicit engagement launches the selected transit experience
        transitDrawer.startActiveTransit('chicago');
        assert.equal(busStarted, 1);
        assert.equal(metroStarted, 1);

        transitDrawer.destroy();
      } finally {
        global.document = origDoc;
        global.window = origWin;
      }
    },
  );

  await t.test(
    'Pointer Lock synchronization & Click-to-Release: onPointerLockChange notifies listeners on ESC or click exit',
    () => {
      const mockCanvas = {
        addEventListener: () => {},
        removeEventListener: () => {},
        requestPointerLock: () => {
          mockCanvas._pointerLocked = true;
        },
        _pointerLocked: false,
      };
      const viewer = {
        entities: {
          add: (s) => ({
            ...s,
            show: true,
            position: { setValue: () => {} },
            orientation: { setValue: () => {} },
          }),
          remove: () => {},
        },
        camera: {
          setView: () => {},
          lookAtTransform: () => {},
          positionCartographic: new Cesium.Cartographic(
            Cesium.Math.toRadians(-74.772),
            Cesium.Math.toRadians(40.22),
            20,
          ),
        },
        scene: {
          canvas: mockCanvas,
          globe: { getHeight: () => 15.0 },
          preRender: {
            addEventListener: () => () => {},
            removeEventListener: () => {},
          },
        },
      };

      const engine = createAvatarWanderEngine({ viewer });
      engine.startWandering({
        lat: 40.2203,
        lon: -74.7721,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });

      const lockStates = [];
      const unsub = engine.onPointerLockChange((locked) => {
        lockStates.push(locked);
      });

      engine.requestPointerLock();
      assert.equal(engine.isPointerLocked(), true);
      assert.deepEqual(lockStates, [true]);

      // Left-clicking the canvas while pointer-locked must cleanly release pointer lock!
      engine._handleMouseDown({ button: 0, clientX: 200, clientY: 200 });
      assert.equal(
        engine.isPointerLocked(),
        false,
        'Left-click while pointer-locked must exit pointer lock',
      );
      assert.deepEqual(lockStates, [true, false]);

      // Double-clicking ground in ISO_CHASE must NOT re-lock the pointer
      engine._handleDblClick({});
      assert.equal(
        engine.isPointerLocked(),
        false,
        'Double-clicking in ISO_CHASE must not trap mouse cursor in pointer lock',
      );

      unsub();
      engine.destroy();
    },
  );

  await t.test(
    'Zero-Credit Locality Resolution: resolves known locales/cities synchronously and exposes locationLabel in Wander telemetry',
    () => {
      clearLocalityCacheForTests();
      // Darien, GA exemplar locale
      const darienLoc = resolveZeroCreditLocality(31.3702, -81.434);
      assert.ok(
        darienLoc.fullLabel.includes('Darien'),
        `Expected Darien in fullLabel, got ${darienLoc.fullLabel}`,
      );
      assert.ok(
        darienLoc.shortHudLabel.includes('DARIEN'),
        `Expected DARIEN in shortHudLabel, got ${darienLoc.shortHudLabel}`,
      );

      // Major World Metro offline gazetteer: Discovery Green / Downtown Houston, TX (29.75262, -95.35929)
      const houstonSync = resolveZeroCreditLocality(29.75262, -95.35929);
      assert.ok(
        houstonSync.fullLabel.includes('Houston, TX'),
        `Expected synchronous Houston, TX on Frame 0, got ${houstonSync.fullLabel}`,
      );
      assert.ok(
        houstonSync.shortHudLabel.includes('HOUSTON, TX'),
        `Expected HOUSTON, TX in shortHudLabel, got ${houstonSync.shortHudLabel}`,
      );
    },
  );

  await t.test(
    'Async Street-Level Reverse Geocode: upgrades major metro to exact street/neighborhood and notifies all concurrent callers',
    async () => {
      clearLocalityCacheForTests();
      const resolvedCallers = [];
      const globalEvents = [];
      const unsubGlobal = onLocalityResolved((evt) => {
        globalEvents.push(evt);
      });

      let slowResolve;
      const slowFetchPromise = new Promise((r) => {
        slowResolve = r;
      });

      const mockFetch = async (url) => {
        assert.ok(
          url.includes('q=29.75262%2C-95.35929') ||
            url.includes('29.75262'),
          `Expected reverse geocode query for Houston coords, got ${url}`,
        );
        await slowFetchPromise;
        return {
          ok: true,
          json: async () => [
            {
              name: 'Brown Foundation Promenade',
              display_name:
                'Brown Foundation Promenade, Downtown, Houston, Harris County, Texas, 77010, United States',
              address: {
                road: 'Brown Foundation Promenade',
                suburb: 'Downtown',
                city: 'Houston',
                state: 'Texas',
              },
            },
          ],
        };
      };

      // Caller 1 (e.g. avatarWanderEngine onTick) starts the in-flight request
      const sync1 = resolveZeroCreditLocality(29.75262, -95.35929, {
        fetchImpl: mockFetch,
        onResolved: (loc) => resolvedCallers.push(['engine', loc.fullLabel]),
      });
      assert.ok(sync1.fullLabel.includes('Houston, TX'));

      // Caller 2 (e.g. wanderDrawer) and Caller 3 (e.g. HUD) attach while in-flight
      resolveZeroCreditLocality(29.75262, -95.35929, {
        fetchImpl: mockFetch,
        onResolved: (loc) => resolvedCallers.push(['drawer', loc.fullLabel]),
      });
      resolveZeroCreditLocality(29.75262, -95.35929, {
        fetchImpl: mockFetch,
        onResolved: (loc) => resolvedCallers.push(['hud', loc.shortHudLabel]),
      });

      slowResolve();
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(
        resolvedCallers.length,
        3,
        'All 3 concurrent callers must be notified when reverse geocode resolves',
      );
      assert.ok(
        resolvedCallers[0][1].includes('Houston') &&
          resolvedCallers[0][1].includes('Brown Foundation Promenade'),
        `Expected street-level Houston label, got ${resolvedCallers[0][1]}`,
      );
      assert.ok(
        resolvedCallers[2][1].includes('HOUSTON') &&
          resolvedCallers[2][1].includes('DOWNTOWN'),
        `Expected compact HUD label with neighborhood, got ${resolvedCallers[2][1]}`,
      );
      assert.equal(globalEvents.length, 1);

      unsubGlobal();
    },
  );
});
