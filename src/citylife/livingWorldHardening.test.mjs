import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createWorldSimDockCoordinator } from '../ui/worldSimDock.js';
import { createHoverDisclosure } from '../ui/panelDisclosure.js';
import { createDriveDrawer } from '../drive/driveDrawer.js';
import { createBoatDrawer } from '../vessels/boatDrawer.js';
import { createCityDrawer } from './cityDrawer.js';
import { createFreightLogisticsDrawer } from './freightLogisticsDrawer.js';
import { createWildernessDrawer } from './wildernessDrawer.js';
import { createSurfaceTracker } from '../layers/citylife/surfaceHeight.js';
import {
  calculateFreightCameraTransform,
  FREIGHT_CAMERA_MODES,
} from '../layers/freight/freightCameraSuite.js';
import { createFreightSimEngine } from '../layers/freight/freightSimEngine.js';
import { createPedestrianEngine } from '../layers/citylife/pedestrianEngine.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  _resetRenderGovernorForTest,
} from '../renderGovernor.js';
import { framePortFor } from '../testSupport/fakeFramePort.mjs';

function createTestDocument() {
  const listeners = new Map();
  const byId = new Map();
  let fakeNow = 1000;
  let doc = null;

  function makeClassList(el) {
    const set = new Set();
    return {
      add: (...cls) => cls.forEach((c) => set.add(c)),
      remove: (...cls) => cls.forEach((c) => set.delete(c)),
      contains: (c) => set.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (set.has(c)) {
            set.delete(c);
            return false;
          }
          set.add(c);
          return true;
        }
        if (force) set.add(c);
        else set.delete(c);
        return Boolean(force);
      },
      _syncFromString: (str) => {
        set.clear();
        String(str || '')
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => set.add(c));
      },
      _toString: () => [...set].join(' '),
    };
  }

  function matchSelector(el, sel) {
    if (!sel) return false;
    const parts = sel.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (part.startsWith('#') && el.id === part.slice(1)) return true;
      if (part.startsWith('.')) {
        const clsAndAttr = part.slice(1);
        const attrMatch = clsAndAttr.match(/^([^\[]+)\[([^=]+)="([^"]+)"\]$/);
        if (attrMatch) {
          const [, cls, attr, val] = attrMatch;
          if (el.classList.contains(cls) && el.getAttribute(attr) === val) {
            return true;
          }
        } else if (el.classList.contains(clsAndAttr)) {
          return true;
        }
      } else {
        const tagAttr = part.match(/^\[([^=]+)="([^"]+)"\]$/);
        if (tagAttr && el.getAttribute(tagAttr[1]) === tagAttr[2]) return true;
      }
    }
    return false;
  }

  function createEl(tag = 'div') {
    const attrs = new Map();
    const elListeners = new Map();
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      ownerDocument: null,
      children,
      parentNode: null,
      style: { cssText: '' },
      dataset: {},
      _id: '',
      _innerHTML: '',
      _textContent: '',
      _hover: false,
      _focusVisible: false,
    };

    const classList = makeClassList(el);
    el.classList = classList;

    Object.defineProperty(el, 'id', {
      get: () => el._id,
      set: (val) => {
        if (el._id) byId.delete(el._id);
        el._id = String(val || '');
        if (el._id) byId.set(el._id, el);
      },
    });

    Object.defineProperty(el, 'className', {
      get: () => classList._toString(),
      set: (val) => classList._syncFromString(val),
    });

    Object.defineProperty(el, 'innerHTML', {
      get: () => el._innerHTML,
      set: (html) => {
        el._innerHTML = String(html || '');
        children.length = 0;
        if (el._innerHTML.includes('<') && tag !== 'style') {
          parseSimpleChildren(el, el._innerHTML);
        }
      },
    });

    Object.defineProperty(el, 'textContent', {
      get: () => el._textContent,
      set: (val) => {
        el._textContent = String(val ?? '');
      },
    });

    el.setAttribute = (k, v) => {
      attrs.set(k, String(v));
      if (k === 'id') el.id = v;
      if (k === 'class') el.className = v;
      if (k.startsWith('data-')) {
        const camel = k
          .slice(5)
          .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        el.dataset[camel] = String(v);
      }
    };
    el.getAttribute = (k) => attrs.get(k) ?? null;
    el.removeAttribute = (k) => attrs.delete(k);

    el.appendChild = (child) => {
      if (child.parentNode && child.parentNode !== el) {
        child.parentNode.removeChild(child);
      }
      if (!children.includes(child)) {
        children.push(child);
      }
      child.parentNode = el;
      return child;
    };

    el.removeChild = (child) => {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
      child.parentNode = null;
      return child;
    };

    el.remove = () => {
      el.parentNode?.removeChild(el);
    };

    el.contains = (node) => {
      let cur = node;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentNode;
      }
      return false;
    };

    el.closest = (sel) => {
      let cur = el;
      while (cur) {
        if (matchSelector(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    };

    el.querySelectorAll = (sel) => {
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (matchSelector(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    };

    el.querySelector = (sel) => el.querySelectorAll(sel)[0] || null;

    el.matches = (sel) => {
      if (sel === ':hover') return el._hover;
      if (sel === ':focus-visible') return el._focusVisible;
      return matchSelector(el, sel);
    };

    el.focus = () => {
      doc.activeElement = el;
    };

    el.addEventListener = (type, fn) => {
      if (!elListeners.has(type)) elListeners.set(type, []);
      elListeners.get(type).push(fn);
    };

    el.removeEventListener = (type, fn) => {
      const arr = elListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    };

    el.dispatchEvent = (event) => {
      const ev = {
        ...event,
        target: event.target || el,
        currentTarget: el,
        preventDefault: () => {},
        stopPropagation: () => {
          ev._stopped = true;
        },
        stopImmediatePropagation: () => {
          ev._stopped = true;
        },
      };
      let cur = el;
      while (cur && !ev._stopped) {
        ev.currentTarget = cur;
        const map =
          cur === doc ? listeners : cur._listenersMap || new Map();
        const handlers = [...(map.get(ev.type) || [])];
        for (const fn of handlers) {
          fn(ev);
        }
        cur = cur.parentNode;
      }
    };

    el.click = () => el.dispatchEvent({ type: 'click', detail: 1 });
    el._listenersMap = elListeners;
    el.ownerDocument = doc;
    return el;
  }

  // Parses static tags with class/data-* attributes so drawer templates populate querySelector
  function parseSimpleChildren(root, html) {
    const stack = [root];
    const tokenRe = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    while ((match = tokenRe.exec(html))) {
      const [, closing, tagName, rawAttrs] = match;
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const child = createEl(tagName);
      const attrRe = /([a-zA-Z0-9-:]+)="([^"]*)"/g;
      let am;
      while ((am = attrRe.exec(rawAttrs))) {
        child.setAttribute(am[1], am[2]);
      }
      stack[stack.length - 1].appendChild(child);
      if (!rawAttrs.trim().endsWith('/') && tagName !== 'input') {
        stack.push(child);
      }
    }
  }

  const head = { tagName: 'HEAD', children: [] };
  const body = { tagName: 'BODY', children: [] };

  const win = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    performance: { now: () => fakeNow },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost/', search: '' },
  };

  doc = {
    defaultView: win,
    activeElement: null,
    createElement: (tag) => createEl(tag),
    getElementById: (id) => byId.get(id) || null,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatchEvent: (event) => {
      const handlers = [...(listeners.get(event.type) || [])];
      for (const fn of handlers) {
        fn({
          preventDefault: () => {},
          stopPropagation: () => {},
          ...event,
        });
      }
    },
  };

  const realHead = createEl('head');
  const realBody = createEl('body');
  realHead.parentNode = doc;
  realBody.parentNode = doc;
  doc.head = realHead;
  doc.body = realBody;
  doc.activeElement = realBody;
  void head;
  void body;

  return { doc, win, advanceNow: (ms) => (fakeNow += ms) };
}

test('Living World Smoothness, Global Custom UX Collapse & 3D Tiles Hardening', async (t) => {
  await t.test(
    'Global Custom UX Collapse-All hides launchers & custom overlays without stopping active sims and restores cleanly',
    () => {
      const { doc } = createTestDocument();
      const dock = createWorldSimDockCoordinator();

      let drawerOpen = true;
      let simStoppedCount = 0;
      const launcherBtn = doc.createElement('button');
      const forgeLauncher = doc.createElement('button');
      const forgePanel = doc.createElement('div');
      const driveHud = doc.createElement('div');
      let hideHookCount = 0;
      let showHookCount = 0;

      doc.body.appendChild(launcherBtn);
      doc.body.appendChild(forgeLauncher);
      doc.body.appendChild(forgePanel);
      doc.body.appendChild(driveHud);

      dock.registerDrawer('freight', {
        open: () => {
          drawerOpen = true;
        },
        close: () => {
          drawerOpen = false;
        },
        isOpen: () => drawerOpen,
        button: launcherBtn,
      });

      dock.registerSimulation('freight', {
        stop: () => {
          simStoppedCount += 1;
        },
      });

      dock.registerOverlayGroup('agent-forge', {
        elements: [forgeLauncher, forgePanel],
        hide: () => {
          hideHookCount += 1;
        },
        show: () => {
          showHookCount += 1;
        },
      });
      dock.registerOverlayGroup('drive-hud', {
        elements: [driveHud],
      });

      const mounted = dock.mountCustomUxToggle({
        container: doc.body,
        documentRef: doc,
      });
      assert.ok(mounted.element, 'Master collapse toggle should mount');
      assert.equal(mounted.element.id, 'gev-custom-ux-master-toggle');
      assert.equal(dock.isCustomUxCollapsed(), false);

      // Tap toggle -> collapse all custom UX WITHOUT stopping active sim
      mounted.element.click();
      assert.equal(dock.isCustomUxCollapsed(), true);
      assert.equal(drawerOpen, false, 'Open drawer must close on Collapse All');
      assert.equal(
        simStoppedCount,
        0,
        'Collapsing custom UX must NEVER stop active simulations',
      );
      assert.equal(launcherBtn.classList.contains('gev-ux-hidden'), true);
      assert.equal(forgeLauncher.classList.contains('gev-ux-hidden'), true);
      assert.equal(forgePanel.classList.contains('gev-ux-hidden'), true);
      assert.equal(driveHud.classList.contains('gev-ux-hidden'), true);
      assert.equal(hideHookCount, 1);

      // Late overlay group registered while collapsed must inherit hidden state
      const lateBubble = doc.createElement('div');
      dock.registerOverlayGroup('thought-bubble-late', {
        elements: [lateBubble],
      });
      assert.equal(lateBubble.classList.contains('gev-ux-hidden'), true);

      // Tap toggle again -> restore all custom overlays cleanly
      mounted.element.click();
      assert.equal(dock.isCustomUxCollapsed(), false);
      assert.equal(launcherBtn.classList.contains('gev-ux-hidden'), false);
      assert.equal(forgeLauncher.classList.contains('gev-ux-hidden'), false);
      assert.equal(driveHud.classList.contains('gev-ux-hidden'), false);
      assert.equal(lateBubble.classList.contains('gev-ux-hidden'), false);
      assert.equal(showHookCount, 1);

      mounted.destroy();
    },
  );

  await t.test(
    'Command Dock HoverDisclosure opens on touch tap without :hover, ignores touch focusout blur, and dismisses on outside tap',
    async () => {
      const { doc } = createTestDocument();
      const origWin = globalThis.window;
      globalThis.window = doc.defaultView;

      try {
        const panelEl = doc.createElement('div');
        panelEl.id = 'control-panel';
        panelEl.className = 'collapsed';
        const toggleBtn = doc.createElement('button');
        toggleBtn.id = 'control-panel-toggle';
        const innerBtn = doc.createElement('button');
        const outsideCanvas = doc.createElement('div');
        panelEl.appendChild(toggleBtn);
        panelEl.appendChild(innerBtn);
        doc.body.appendChild(panelEl);
        doc.body.appendChild(outsideCanvas);

        let isCollapsed = true;
        const calls = [];
        const disclosure = createHoverDisclosure({
          panel: panelEl,
          disclosure: toggleBtn,
          documentRef: doc,
          closeDelayMs: 25,
          onChange: (collapsed, opts) => {
            isCollapsed = collapsed;
            panelEl.classList.toggle('collapsed', collapsed);
            calls.push({ collapsed, opts });
          },
          onEscape: () => {
            isCollapsed = true;
            panelEl.classList.add('collapsed');
          },
        });

        // 1. Touch tap opens tray without hover
        toggleBtn.dispatchEvent({ type: 'pointerdown', pointerType: 'touch' });
        toggleBtn.dispatchEvent({ type: 'click', detail: 1 });
        assert.equal(isCollapsed, false);
        assert.equal(panelEl.classList.contains('collapsed'), false);

        // 2. Touch focusout with null relatedTarget must NOT auto-close tray
        panelEl.dispatchEvent({
          type: 'focusout',
          relatedTarget: null,
        });
        await new Promise((r) => setTimeout(r, 45));
        assert.equal(
          isCollapsed,
          false,
          'Tray opened via touch must remain open on null-relatedTarget focusout',
        );

        // 3. Tapping inside panel keeps it open
        doc.dispatchEvent({
          type: 'pointerdown',
          target: innerBtn,
          pointerType: 'touch',
        });
        assert.equal(isCollapsed, false);

        // 4. Tapping outside dismisses unpinned tray immediately
        doc.dispatchEvent({
          type: 'pointerdown',
          target: outsideCanvas,
          pointerType: 'touch',
        });
        assert.equal(
          isCollapsed,
          true,
          'Outside tap must dismiss unpinned tray',
        );

        disclosure.destroy();
      } finally {
        globalThis.window = origWin;
      }
    },
  );

  await t.test(
    'Drive compatibility shim mounts zero legacy HUD strip DOM (replaced by Sovereign ActiveSimMicroHud)',
    () => {
      const { doc, win } = createTestDocument();
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = doc;
      globalThis.window = win;

      try {
        const driveDrawer = createDriveDrawer({
          container: doc.body,
        });
        assert.equal(
          doc.body.querySelector('.gev-drive-hud-strip'),
          null,
          'Legacy Drive HUD strip must be retired (replaced by ActiveSimMicroHud.vue)',
        );
        assert.equal(
          doc.body.querySelector('.gev-drive-launcher-button'),
          null,
          'Legacy Drive charm launcher must be retired',
        );
        driveDrawer.destroy();
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  );

  await t.test(
    'Freight Logistics compatibility shim mounts zero legacy vanilla DOM while preserving open/close/toggle lifecycle',
    () => {
      const { doc, win } = createTestDocument();
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = doc;
      globalThis.window = win;

      try {
        let startedCount = 0;
        const freightDrawer = createFreightLogisticsDrawer({
          container: doc.body,
          freightEngine: {
            start: () => {
              startedCount += 1;
            },
            stop: () => {},
            isSimActive: () => startedCount > 0,
          },
        });

        freightDrawer.open();
        assert.equal(freightDrawer.isOpen(), true);
        assert.equal(startedCount, 1);
        assert.equal(
          doc.body.querySelector('.gev-freight-launcher-button'),
          null,
          'Legacy Freight charm launcher must be retired',
        );
        freightDrawer.updateUI();
        freightDrawer.close();
        assert.equal(freightDrawer.isOpen(), false);
        freightDrawer.destroy();
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  );

  await t.test(
    'Wilderness Drawer uses delegated roster clicks, in-place rows, cancelFlight, and 3D Tiles outlier protection',
    () => {
      const { doc, win } = createTestDocument();
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = doc;
      globalThis.window = win;

      try {
        let cancelledFlights = 0;
        let lastFlyDest = null;
        const mockViewer = {
          scene: {
            globe: { show: false },
            sampleHeightSupported: true,
            // Return an absurd skyscraper/cliff outlier spike (+4000m)
            sampleHeight: () => 4900,
          },
          camera: {
            cancelFlight: () => {
              cancelledFlights += 1;
            },
            flyTo: (opts) => {
              lastFlyDest = opts.destination;
            },
          },
        };

        const wildernessDrawer = createWildernessDrawer({
          viewer: mockViewer,
        });

        const selected = wildernessDrawer.selectTrailhead('smokies_alum_cave');
        assert.equal(selected?.id, 'smokies_alum_cave');
        assert.equal(
          wildernessDrawer.getActiveTrailhead()?.id,
          'smokies_alum_cave',
        );
        assert.ok(cancelledFlights >= 1, 'selectTrailhead must cancelFlight');
        assert.ok(lastFlyDest, 'flyTo destination should be populated');

        const flyCarto = Cesium.Cartographic.fromCartesian(lastFlyDest);
        assert.ok(
          flyCarto.height < 4900,
          'Outlier 3D Tiles surface spike (>350m from catalog elevation) must be rejected',
        );

        wildernessDrawer.destroy();
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  );

  await t.test(
    'SurfaceTracker outlier suppression + Freight/Pedestrian renderGovernor holds, cancelFlight, and 3D Tiles camera grounding',
    () => {
      // 1. SurfaceTracker ignores transient upward spike > maxSpikeMeters, commits sustained climbs
      const tracker = createSurfaceTracker({
        sampleIntervalMs: 100,
        slewMps: 5,
        snapMeters: 25,
        maxSpikeMeters: 20,
      });
      let mockTileH = 305;
      const mockViewer = {
        entities: {
          add: (def) => ({ ...def }),
          remove: () => {},
        },
        scene: {
          globe: { show: false },
          sampleHeightSupported: true,
          sampleHeight: () => mockTileH,
          preRender: { addEventListener: () => () => {} },
        },
        camera: {
          cancelled: 0,
          cancelFlight() {
            this.cancelled += 1;
          },
          setView: () => {},
          flyTo: () => {},
          lookAtTransform: () => {},
        },
      };

      const carto = Cesium.Cartographic.fromDegrees(-84.388, 33.749, 0);
      assert.equal(tracker.update(mockViewer, carto, 1000), 305);

      // Single skyscraper roof spike to 490m should be suppressed
      mockTileH = 490;
      const afterSpike = tracker.update(mockViewer, carto, 1200);
      assert.equal(afterSpike, 305);

      // Back to ground 306m
      mockTileH = 306;
      const backToStreet = tracker.update(mockViewer, carto, 1400);
      assert.ok(Math.abs(backToStreet - 306) <= 2);

      // Sustained plateau jump (two corroborating samples at 420m) commits snap
      mockTileH = 420;
      tracker.update(mockViewer, carto, 1600);
      assert.equal(tracker.update(mockViewer, carto, 1800), 420);

      // 2. FreightCameraSuite lookTarget clamps against Google 3D Tiles mesh with excludeEntities
      let capturedExclude = null;
      const camViewer = {
        scene: {
          globe: { show: false },
          sampleHeightSupported: true,
          sampleHeight: (_c, excl) => {
            capturedExclude = excl;
            return 320;
          },
        },
      };
      const truckEntity = { id: 'tractor-1' };
      const pos = Cesium.Cartesian3.fromDegrees(-84.388, 33.749, 321.5);
      const transform = calculateFreightCameraTransform(
        pos,
        new Cesium.Cartesian3(0, 1, 0),
        FREIGHT_CAMERA_MODES.SEMI_CHASE,
        camViewer,
        [truckEntity],
      );
      const lookCarto = Cesium.Cartographic.fromCartesian(transform.lookTarget);
      assert.ok(
        lookCarto.height >= 320.7,
        'lookTarget must clamp above Google 3D Tiles surface when globe is hidden',
      );
      assert.deepEqual(capturedExclude, [truckEntity]);

      // 3. FreightSimEngine renderGovernor hold + cancelFlight
      _resetRenderGovernorForTest();
      installRenderGovernor(framePortFor(mockViewer.scene));

      const freight = createFreightSimEngine({ viewer: mockViewer });
      freight.start();
      assert.ok(
        getRenderGovernorDiagnostics().holds.includes('freight-sim'),
        'freight-sim renderGovernor hold must activate on start()',
      );
      const prevCancel = mockViewer.camera.cancelled;
      freight.setCameraMode(FREIGHT_CAMERA_MODES.HELI_PATROL);
      freight.selectTruck('TRK-219');
      assert.equal(
        mockViewer.camera.cancelled,
        prevCancel + 2,
        'Freight camera mode & truck selection must call cancelFlight',
      );
      freight.stop();
      assert.equal(
        getRenderGovernorDiagnostics().holds.includes('freight-sim'),
        false,
        'freight-sim renderGovernor hold must release on stop()',
      );
      freight.destroy();

      // 4. PedestrianEngine renderGovernor hold + cancelFlight
      const pedEngine = createPedestrianEngine({
        viewer: mockViewer,
        container: null,
      });
      pedEngine.spawnPedestrians(
        {
          id: 'atlanta',
          name: 'Atlanta',
          lat: 33.749,
          lon: -84.388,
          elev: 310,
          corridors: [
            {
              id: 'peachtree',
              waypoints: [
                { lat: 33.749, lon: -84.388, elev: 310 },
                { lat: 33.751, lon: -84.388, elev: 310 },
              ],
            },
          ],
        },
        'calm',
      );
      assert.ok(
        getRenderGovernorDiagnostics().holds.includes('pedestrian-sim'),
        'pedestrian-sim renderGovernor hold must activate on spawnPedestrians()',
      );
      const pedPrevCancel = mockViewer.camera.cancelled;
      pedEngine.setCameraMode('flaneur');
      pedEngine.snapBack('companion');
      assert.ok(
        mockViewer.camera.cancelled >= pedPrevCancel + 2,
        'Pedestrian camera switches must call cancelFlight',
      );
      pedEngine.destroy();
      assert.equal(
        getRenderGovernorDiagnostics().holds.includes('pedestrian-sim'),
        false,
        'pedestrian-sim renderGovernor hold must release on destroy()',
      );
      _resetRenderGovernorForTest();
    },
  );

  await t.test(
    'Living World ambient pills stay suppressed during active Drive/Travel and restore immediately upon Pull Over or Stop',
    async () => {
      const { doc } = createTestDocument();
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      const origRaf = globalThis.requestAnimationFrame;

      globalThis.document = doc;
      globalThis.window = doc.defaultView;
      if (!doc.defaultView.__gevDrawerCoordinator) {
        doc.defaultView.__gevDrawerCoordinator = createWorldSimDockCoordinator();
      }
      globalThis.requestAnimationFrame = (cb) => cb();

      let driveDrawer = null;
      let boatDrawer = null;
      let cityDrawer = null;

      try {
        const dock = doc.defaultView.__gevDrawerCoordinator;

        let driveParked = true;
        let hasActiveDrive = false;
        const mockDriveEngine = {
          startRouteDrive: async () => {
            hasActiveDrive = true;
            driveParked = false;
            return { corridor: { name: 'I-75 Corridor' }, speedMph: 70 };
          },
          pullOver: () => {
            driveParked = true;
            return { status: 'parked' };
          },
          stopDrive: () => {
            hasActiveDrive = false;
            driveParked = true;
          },
          clearActiveDrive: () => {
            hasActiveDrive = false;
            driveParked = true;
          },
          setCameraMode: () => {},
          getActiveTelemetry: () =>
            hasActiveDrive
              ? {
                  currentLocation: 'Peachtree St',
                  speedMph: driveParked ? 0 : 70,
                  distTraveledMi: 1.2,
                  totalDistMi: 10.0,
                  progressPct: 12,
                  cameraMode: 'chase',
                  isParked: driveParked,
                }
              : null,
        };

        let activeBoat = false;
        const mockBoatEngine = {
          spawnBoatRoute: async () => {
            activeBoat = true;
            return { waterbody: { totalDistanceNmi: 4.5 }, durationSec: 120 };
          },
          clearActiveBoatRoute: () => {
            activeBoat = false;
          },
          cancelSplashdownClickMode: () => {},
          getActiveTelemetry: () =>
            activeBoat
              ? {
                  vesselName: 'Savannah Skiff',
                  speedText: '12 KTS',
                  currentLocation: 'Bull River',
                  distTraveledNmi: 0.4,
                  totalDistNmi: 4.5,
                  progressPct: 9,
                  cameraMode: 'chase',
                }
              : null,
        };

        let onDepthCb = null;
        let onDepthExitCb = null;
        const mockCityEngine = {
          onCityDepth: (cb) => {
            onDepthCb = cb;
          },
          onCityDepthExit: (cb) => {
            onDepthExitCb = cb;
          },
          isSimActive: () => false,
          stepIntoCurrentLocation: () => {},
          stepIntoCity: () => {},
        };

        driveDrawer = createDriveDrawer({
          driveEngine: mockDriveEngine,
          container: doc.body,
        });
        boatDrawer = createBoatDrawer({
          boatEngine: mockBoatEngine,
          container: doc.body,
        });
        cityDrawer = createCityDrawer({
          cityEngine: mockCityEngine,
          container: doc.body,
        });

        // 1. Launch Drive via programmatic shim -> registers as active simulation in worldSimDock
        await driveDrawer.startCustomDrive('33.749,-84.388', '32.081,-81.091');
        assert.equal(
          dock.hasActiveSimulation({ excludeIds: ['city'] }),
          true,
          'Drive must register as active simulation while driving',
        );

        // 2. Pull Over -> drive parks and releases active simulation state
        mockDriveEngine.pullOver();
        dock.notifySimulationStopped('drive');
        assert.equal(driveParked, true);
        assert.equal(
          dock.hasActiveSimulation({ excludeIds: ['city'] }),
          false,
          'Parked Drive after Pull Over must not block active simulation availability',
        );

        // 3. Boat cruise active -> registers active simulation cleanly with zero legacy DOM
        await mockBoatEngine.spawnBoatRoute();
        dock.notifySimulationStarted('boat');
        assert.equal(dock.hasActiveSimulation({ excludeIds: ['city'] }), true);
        mockBoatEngine.clearActiveBoatRoute();
        dock.notifySimulationStopped('boat');
        assert.equal(dock.hasActiveSimulation({ excludeIds: ['city'] }), false);

        // 4. Open/close driveDrawer updates coordinator cleanly
        driveDrawer.open();
        assert.equal(dock.getActiveDrawerId(), 'drive');
        driveDrawer.close();
        assert.equal(dock.getActiveDrawerId(), null);
      } finally {
        cityDrawer?.destroy();
        boatDrawer?.destroy();
        driveDrawer?.destroy();
        globalThis.document = origDoc;
        globalThis.window = origWin;
        globalThis.requestAnimationFrame = origRaf;
      }
    },
  );
});
