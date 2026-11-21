import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailDrawer } from './railDrawer.js';

test('World of Rails - Drawer Modal & Camera Perspective Architecture', async (t) => {
  function createMockElement(tagName = 'div') {
    const children = [];
    const listeners = {};
    const classes = new Set();
    const attributes = {};

    const element = {
      tagName: tagName.toUpperCase(),
      style: {},
      dataset: {},
      children,
      parentNode: null,
      innerHTML: '',
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => {
        attributes[k] = v;
      },
      getAttribute: (k) => attributes[k] || null,
      addEventListener: (evt, handler) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(handler);
      },
      removeEventListener: (evt, handler) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((h) => h !== handler);
      },
      click: () => {
        const handlers = listeners['click'] || [];
        for (const h of handlers) h({ stopPropagation: () => {} });
      },
      appendChild: (child) => {
        children.push(child);
        child.parentNode = element;
        return child;
      },
      remove: () => {
        if (element.parentNode) {
          const idx = element.parentNode.children.indexOf(element);
          if (idx >= 0) element.parentNode.children.splice(idx, 1);
          element.parentNode = null;
        }
      },
      querySelector: (selector) => {
        element._queryCache = element._queryCache || {};
        if (element._queryCache[selector]) return element._queryCache[selector];
        const el = createMockElement('div');
        element._queryCache[selector] = el;
        return el;
      },
      querySelectorAll: (selector) => {
        if (selector === '.gev-rail-cam-btn') {
          if (!element._camBtns) {
            const cab = createMockElement('button');
            cab.setAttribute('data-cam', 'cab');
            const chase = createMockElement('button');
            chase.setAttribute('data-cam', 'chase');
            const heli = createMockElement('button');
            heli.setAttribute('data-cam', 'heli');
            const overview = createMockElement('button');
            overview.setAttribute('data-cam', 'overview');
            const free = createMockElement('button');
            free.setAttribute('data-cam', 'free');
            element._camBtns = [cab, chase, heli, overview, free];
          }
          return element._camBtns;
        }
        return [];
      },
    };
    return element;
  }

  await t.test('gracefully handles missing container or SSR environment', () => {
    const drawer = createRailDrawer({ railwayEngine: null, container: null });
    assert.ok(drawer);
    assert.equal(typeof drawer.open, 'function');
    assert.equal(typeof drawer.close, 'function');
    assert.equal(typeof drawer.destroy, 'function');
    assert.equal(drawer.isOpen(), false);
    drawer.open();
    drawer.close();
    drawer.destroy();
  });

  await t.test('renders drawer DOM, controls camera perspectives, and triggers snap back', () => {
    const origDoc = global.document;
    const origReq = global.requestAnimationFrame;

    const mockBody = createMockElement('body');
    global.document = {
      createElement: (tag) => createMockElement(tag),
      body: mockBody,
    };
    global.requestAnimationFrame = (fn) => fn();

    let activeCamMode = 'cab';
    let snappedBack = false;
    let clearedRoute = false;
    let spawnedRoute = null;

    const mockRailwayEngine = {
      setCameraMode: (mode) => {
        activeCamMode = mode;
      },
      getCameraMode: () => activeCamMode,
      snapBack: (mode) => {
        snappedBack = true;
        activeCamMode = mode;
      },
      clearActiveRailRoute: () => {
        clearedRoute = true;
      },
      spawnRailRoute: async (from, to, opts) => {
        spawnedRoute = {
          from,
          to,
          opts,
          corridor: { totalDistanceMeters: 5000, name: 'Test Line' },
          durationSec: 120,
          carsCount: 4,
        };
        return spawnedRoute;
      },
      getActiveRoute: () => spawnedRoute,
      getActiveTelemetry: () => ({
        trainName: 'Test Express',
        speedMph: 60,
        nextStation: 'Peachtree',
        distToNextMi: 1.2,
        progressPct: 45,
        cameraMode: activeCamMode,
      }),
    };

    const container = createMockElement('div');
    const drawer = createRailDrawer({
      railwayEngine: mockRailwayEngine,
      container,
    });

    assert.ok(drawer);

    // 1. Initial State: Closed
    assert.equal(drawer.isOpen(), false);

    // 2. Open Drawer
    drawer.open();
    assert.equal(drawer.isOpen(), true);

    // 3. Camera Perspective Buttons
    const drawerEl = container.children[0];
    const camBtns = drawerEl.querySelectorAll('.gev-rail-cam-btn');
    assert.equal(camBtns.length, 5); // Cab, Chase, Heli, Overview, Free

    const snapBtn = drawerEl.querySelector('.gev-rail-snap-btn');
    assert.ok(snapBtn);

    // Click Heli camera mode
    const heliBtn = camBtns.find((b) => b.getAttribute('data-cam') === 'heli');
    assert.ok(heliBtn);
    heliBtn.click();
    assert.equal(activeCamMode, 'heli');

    // Click Overview camera mode
    const overviewBtn = camBtns.find((b) => b.getAttribute('data-cam') === 'overview');
    assert.ok(overviewBtn);
    overviewBtn.click();

    assert.equal(activeCamMode, 'overview');
    assert.equal(snapBtn.style.display, 'block'); // Exposed in overview

    // Click Snap Back
    snapBtn.click();
    assert.equal(snappedBack, true);
    assert.equal(activeCamMode, 'cab');
    assert.equal(snapBtn.style.display, 'none'); // Hidden after snap back

    // 4. Clear Route
    const clearBtn = drawerEl.querySelector('.gev-rail-clear');
    assert.ok(clearBtn);
    clearBtn.click();
    assert.equal(clearedRoute, true);

    // 5. Close and Destroy
    drawer.close();
    assert.equal(drawer.isOpen(), false);

    drawer.destroy();
    assert.equal(container.children.length, 0);

    global.document = origDoc;
    global.requestAnimationFrame = origReq;
  });
});
