import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransitControllerDrawer } from './transitControllerDrawer.js';

test('Living City Transit — Transit Controller Drawer & Persistent Sim Coexistence', async (t) => {
  function createMockElement(tagName = 'div') {
    const children = [];
    const listeners = {};
    const element = {
      tagName: tagName.toUpperCase(),
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
      },
      addEventListener: (evt, handler) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      },
      removeEventListener: (evt, handler) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((h) => h !== handler);
      },
      dispatchEvent: (evt) => {
        const handlers = listeners[evt.type || evt] || [];
        for (const h of handlers) h(evt);
      },
      appendChild: (child) => {
        children.push(child);
        child.parentNode = element;
        return child;
      },
      removeChild: (child) => {
        const idx = children.indexOf(child);
        if (idx >= 0) children.splice(idx, 1);
        child.parentNode = null;
        return child;
      },
      querySelector: (selector) => {
        element._cache = element._cache || {};
        if (element._cache[selector]) return element._cache[selector];
        const tag =
          selector.includes('btn') ||
          selector.includes('tab') ||
          selector.includes('mode')
            ? 'button'
            : selector.includes('select')
              ? 'select'
              : 'div';
        const res = createMockElement(tag);
        element._cache[selector] = res;
        return res;
      },
      querySelectorAll: () => [],
    };
    return element;
  }

  await t.test(
    'gracefully handles missing container or SSR environment',
    () => {
      const drawer = createTransitControllerDrawer({ container: null });
      assert.equal(drawer.isOpen(), false);
      drawer.open();
      assert.equal(drawer.isOpen(), false);
      drawer.destroy();
    },
  );

  await t.test(
    'initializes with default Bus mode and supports persistent coexistence',
    () => {
      const origDoc = global.document;
      const origWin = global.window;

      global.document = {
        createElement: (tag) => createMockElement(tag),
        body: createMockElement('body'),
      };
      global.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      let busStarted = 0;
      let metroStarted = 0;
      let busStopped = 0;
      let metroStopped = 0;
      let busCameraEnabled = true;
      let metroCameraEnabled = false;
      let busLinesVisible = true;
      let metroLinesVisible = true;

      const mockBusEngine = {
        isSimActive: () => busStarted > 0,
        getActiveCity: () => 'atlanta',
        startBusFleet: () => {
          busStarted++;
        },
        stopBusFleet: () => {
          busStopped++;
        },
        getActiveBus: () => ({ id: 'MARTA-110-1', speedMs: 10 }),
        getCameraMode: () => 'chase',
        setCameraEnabled: (val) => {
          busCameraEnabled = val;
        },
        setRouteLinesVisible: (val) => {
          busLinesVisible = Boolean(val);
        },
        snapBack: () => {},
        showTransitMap: () => {},
        getFleet: () => [
          { id: 'MARTA-110-1', speedMs: 10, passengers: 20, capacity: 50 },
        ],
      };

      const mockMetroEngine = {
        isSimActive: () => metroStarted > 0,
        getActiveCity: () => 'atlanta',
        startMetroSystem: () => {
          metroStarted++;
        },
        stopMetroSystem: () => {
          metroStopped++;
        },
        getActiveTrain: () => ({ id: 'CTA-LOOP-1', speedMs: 15 }),
        getCameraMode: () => 'chase',
        setCameraEnabled: (val) => {
          metroCameraEnabled = val;
        },
        setRouteLinesVisible: (val) => {
          metroLinesVisible = Boolean(val);
        },
        snapBack: () => {},
        showTransitMap: () => {},
        getTrains: () => [
          { id: 'CTA-LOOP-1', speedMs: 15, passengers: 200, capacity: 600 },
        ],
      };

      const mockMotorman = {
        bindVehicle: () => {},
        getState: () => ({ speedMph: 22, throttleNotch: 2, brakeNotch: 0 }),
      };

      const container = createMockElement('div');
      const drawer = createTransitControllerDrawer({
        busEngine: mockBusEngine,
        metroEngine: mockMetroEngine,
        motormanControls: mockMotorman,
        container,
      });

      assert.equal(drawer.isOpen(), false);
      assert.equal(drawer.getActiveMode(), 'bus');

      // Start transit: both bus and metro fleets are launched concurrently
      drawer.startActiveTransit('atlanta');
      assert.equal(busStarted, 1, 'Bus fleet should be started');
      assert.equal(
        metroStarted,
        1,
        'Metro system should be started concurrently',
      );
      assert.equal(busStopped, 0, 'Bus fleet should not be stopped');
      assert.equal(metroStopped, 0, 'Metro system should not be stopped');
      assert.equal(busCameraEnabled, true);
      assert.equal(metroCameraEnabled, false);

      // Switch to Metro: neither fleet is destroyed; camera latch transfers to metro
      drawer.switchMode('metro');
      assert.equal(drawer.getActiveMode(), 'metro');
      assert.equal(busStopped, 0, 'Switching to metro must NOT stop bus fleet');
      assert.equal(
        metroStopped,
        0,
        'Switching to metro must NOT restart metro',
      );
      assert.equal(metroCameraEnabled, true);
      assert.equal(busCameraEnabled, false);

      // Switch back to Bus: persistent simulation continues without reset
      drawer.switchMode('bus');
      assert.equal(drawer.getActiveMode(), 'bus');
      assert.equal(
        busStopped,
        0,
        'Switching back to bus must NOT restart bus fleet',
      );
      assert.equal(
        metroStopped,
        0,
        'Switching back to bus must NOT stop metro',
      );
      assert.equal(busCameraEnabled, true);
      assert.equal(metroCameraEnabled, false);

      try {
        // Verify zero legacy vanilla DOM is mounted into container
        assert.equal(
          container.children.length,
          0,
          'Phase 2 Transit compatibility shim must mount zero vanilla DOM controls',
        );

        // Verify supported networks cover all major metropolitan & theme-park transit systems
        const networks = drawer.getSupportedNetworks();
        for (const id of [
          'atlanta',
          'los_angeles',
          'san_francisco',
          'washington_dc',
          'northeast_corridor',
          'wdw_monorail',
          'dlr_monorail',
          'wdw_mk_railroad',
          'dlr_railroad',
          'chicago',
          'new_york',
          'tokyo',
          'london',
        ]) {
          assert.ok(networks.includes(id), `Expected network ${id}`);
        }

        // Open/close/toggle lifecycle
        drawer.open();
        assert.equal(drawer.isOpen(), true);
        drawer.close();
        assert.equal(drawer.isOpen(), false);
        drawer.toggle();
        assert.equal(drawer.isOpen(), true);

        // Mode switching transfers camera authority without stopping persistent sims
        drawer.switchMode('metro');
        assert.equal(drawer.getActiveMode(), 'metro');
        assert.equal(metroCameraEnabled, true);
        assert.equal(busCameraEnabled, false);

        drawer.switchMode('bus');
        assert.equal(drawer.getActiveMode(), 'bus');
        assert.equal(busCameraEnabled, true);
        assert.equal(metroCameraEnabled, false);

        // Verify system Lines visibility toggle syncs both metro & bus engines
        assert.equal(drawer.isLinesVisible(), true);
        drawer.setLinesVisible(false);
        assert.equal(drawer.isLinesVisible(), false);
        assert.equal(busLinesVisible, false);
        assert.equal(metroLinesVisible, false);
        drawer.setLinesVisible(true);
        assert.equal(drawer.isLinesVisible(), true);
        assert.equal(busLinesVisible, true);
        assert.equal(metroLinesVisible, true);
      } finally {
        drawer.destroy();
        global.document = origDoc;
        global.window = origWin;
      }
    },
  );
});
