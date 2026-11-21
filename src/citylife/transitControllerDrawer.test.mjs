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
        // Verify Fleet List rendering contains Heli camera latch pill
        drawer.open();
        const fleetListEl = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-fleet-list');
        assert.ok(fleetListEl);
        assert.equal(fleetListEl.innerHTML.includes('gev-latch-follow'), false);
        assert.ok(fleetListEl.innerHTML.includes('gev-latch-cab'));
        assert.ok(fleetListEl.innerHTML.includes('gev-latch-chase'));
        assert.ok(fleetListEl.innerHTML.includes('gev-latch-door'));
        assert.ok(fleetListEl.innerHTML.includes('gev-latch-heli'));
        assert.ok(fleetListEl.innerHTML.includes('🚁 Heli'));

        // Switch to metro and verify multi-line filters and 4 radio camera pills without redundant Follow button
        drawer.switchMode('metro');
        const metroFleetList = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-fleet-list');
        assert.ok(metroFleetList);
        assert.equal(
          metroFleetList.innerHTML.includes('gev-latch-follow'),
          false,
        );
        assert.ok(metroFleetList.innerHTML.includes('gev-latch-cab'));
        assert.ok(metroFleetList.innerHTML.includes('gev-latch-chase'));
        assert.ok(metroFleetList.innerHTML.includes('gev-latch-door'));
        assert.ok(metroFleetList.innerHTML.includes('gev-latch-heli'));

        // Verify City Select options in drawer template contain all 9 major metropolitan regions
        const drawerHtml = drawer.getDrawerElement().innerHTML;
        assert.ok(drawerHtml.includes('value="los_angeles"'));
        assert.ok(drawerHtml.includes('value="san_francisco"'));
        assert.ok(drawerHtml.includes('value="washington_dc"'));
        assert.ok(drawerHtml.includes('value="northeast_corridor"'));

        // Verify Dedicated Full-Width Segmented Mode Switcher & Non-Overflow Layout
        assert.ok(
          drawerHtml.includes('gev-transit-mode-switcher'),
          'Mode switcher must exist in drawer DOM',
        );
        assert.ok(
          drawerHtml.includes('gev-transit-mode-bus'),
          'Mode switcher must contain bus button',
        );
        assert.ok(
          drawerHtml.includes('gev-transit-mode-metro'),
          'Mode switcher must contain metro button',
        );

        const btnBus = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-mode-bus');
        const btnMetro = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-mode-metro');
        assert.ok(btnBus, 'Bus button must be resolvable');
        assert.ok(btnMetro, 'Metro button must be resolvable');

        // Test Responsive Click Event Listeners
        // Clicking Metro button switches mode to metro and enables metro camera
        btnMetro.dispatchEvent({ type: 'click' });
        assert.equal(
          drawer.getActiveMode(),
          'metro',
          'Clicking metro button must switch active mode to metro',
        );
        assert.equal(metroCameraEnabled, true, 'Metro camera must be enabled');
        assert.equal(busCameraEnabled, false, 'Bus camera must be disabled');

        // Clicking Bus button switches back to bus mode
        btnBus.dispatchEvent({ type: 'click' });
        assert.equal(
          drawer.getActiveMode(),
          'bus',
          'Clicking bus button must switch active mode to bus',
        );
        assert.equal(busCameraEnabled, true, 'Bus camera must be enabled');
        assert.equal(
          metroCameraEnabled,
          false,
          'Metro camera must be disabled',
        );

        // Verify delegated camera latch clicks work across Cab, Chase, Door, Heli, and card-header select
        // without wiping DOM innerHTML on unchanged refreshes
        drawer.switchMode('metro');
        let lastMetroCamMode = null;
        mockMetroEngine.setCameraMode = (m) => {
          lastMetroCamMode = m;
        };
        const metroListEl = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-fleet-list');
        const snapshotHtml = metroListEl.innerHTML;
        const makeLatchClick = (action, id) => ({
          target: {
            closest: () => ({
              getAttribute: (attr) =>
                attr === 'data-cam-action'
                  ? action
                  : attr === 'data-id'
                    ? id
                    : null,
            }),
            getAttribute: (attr) =>
              attr === 'data-cam-action'
                ? action
                : attr === 'data-id'
                  ? id
                  : null,
          },
        });
        metroListEl.dispatchEvent({
          type: 'click',
          ...makeLatchClick('cab', 'CTA-LOOP-1'),
        });
        assert.equal(lastMetroCamMode, 'lead_cab');
        metroListEl.dispatchEvent({
          type: 'click',
          ...makeLatchClick('chase', 'CTA-LOOP-1'),
        });
        assert.equal(lastMetroCamMode, 'chase');
        metroListEl.dispatchEvent({
          type: 'click',
          ...makeLatchClick('door', 'CTA-LOOP-1'),
        });
        assert.equal(lastMetroCamMode, 'passenger_window');
        metroListEl.dispatchEvent({
          type: 'click',
          ...makeLatchClick('heli', 'CTA-LOOP-1'),
        });
        assert.equal(lastMetroCamMode, 'heli');
        assert.equal(
          metroListEl.innerHTML,
          snapshotHtml,
          'Unchanged fleet refreshes must not replace button innerHTML mid-click',
        );

        // Verify simple system Lines visibility toggle syncs both metro & bus engines
        const btnLines = drawer
          .getDrawerElement()
          .querySelector('.gev-transit-btn-lines');
        assert.ok(btnLines, 'Lines toggle button must exist');
        assert.equal(drawer.isLinesVisible(), true);
        btnLines.dispatchEvent({ type: 'click' });
        assert.equal(drawer.isLinesVisible(), false);
        assert.equal(busLinesVisible, false);
        assert.equal(metroLinesVisible, false);
        btnLines.dispatchEvent({ type: 'click' });
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
