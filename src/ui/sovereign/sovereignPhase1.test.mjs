import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { installVueDom } from '../../testSupport/vueDom.mjs';
import { framePortFor } from '../../testSupport/fakeFramePort.mjs';
import {
  _resetRenderGovernorForTest,
  getRenderGovernorDiagnostics,
  installRenderGovernor,
} from '../../renderGovernor.js';
import {
  TILESET_BUTTER_HOLD,
  areActiveTilesetsSettled,
  butterGoogle3DTiles,
  cancelGoogle3DTilesButter,
  collectActive3DTilesets,
} from './tilesetButter.js';
import {
  createCameraAuthority,
  isEventInsideSovereignUi,
} from './cameraControlBridge.js';
import {
  EXPERIENCE_CATEGORIES,
  buildExperiencesCatalog,
  filterAndSortExperiences,
} from './experiencesCatalogAdapter.js';
import {
  createAvatarWanderEngine,
  WANDER_CAMERA_MODES,
} from '../../layers/citylife/avatarWanderEngine.js';
import { createPersonalFleetEngine } from '../../layers/estates/personalFleetEngine.js';

test('tilesetButter holds continuous render until tilesLoaded settles and never leaks holds', async () => {
  _resetRenderGovernorForTest();
  const scene = {
    requestRenderMode: false,
    maximumRenderTimeChange: 0,
    requestRender() {},
    primitives: {
      length: 1,
      get(i) {
        return i === 0 ? nestedCollection : null;
      },
    },
  };
  const fakeTileset = {
    show: true,
    tilesLoaded: false,
    foveatedTimeDelay: 0.25,
    maximumScreenSpaceError: 8,
    _statistics: { numberOfPendingRequests: 4, numberOfTilesProcessing: 1 },
    tileLoadProgressEvent: {
      listeners: [],
      addEventListener(fn) {
        this.listeners.push(fn);
        return () => {
          this.listeners = this.listeners.filter((l) => l !== fn);
        };
      },
    },
  };
  const nestedCollection = {
    length: 1,
    get(i) {
      return i === 0 ? fakeTileset : null;
    },
  };
  const viewer = { scene };
  installRenderGovernor(framePortFor(scene));

  assert.equal(collectActive3DTilesets(viewer).length, 1);
  assert.equal(areActiveTilesetsSettled(viewer), false);

  let settledResult = null;
  butterGoogle3DTiles(viewer, 'test-teleport', {
    maxMs: 1200,
    pollIntervalMs: 40,
    onSettled: (info) => {
      settledResult = info;
    },
  });

  // Must set foveatedTimeDelay to 0 without altering maximumScreenSpaceError
  assert.equal(fakeTileset.foveatedTimeDelay, 0.0);
  assert.equal(fakeTileset.maximumScreenSpaceError, 8);
  assert.ok(
    getRenderGovernorDiagnostics().holds.includes(TILESET_BUTTER_HOLD),
    'tileset-butter hold must be active while tiles are refining',
  );

  // Mark tileset loaded and wait for 2 consecutive settle checks (~100ms)
  fakeTileset.tilesLoaded = true;
  fakeTileset._statistics.numberOfPendingRequests = 0;
  fakeTileset._statistics.numberOfTilesProcessing = 0;

  await new Promise((r) => setTimeout(r, 140));
  assert.equal(
    getRenderGovernorDiagnostics().holds.includes(TILESET_BUTTER_HOLD),
    false,
    'tileset-butter hold must release cleanly once settled',
  );
  assert.equal(settledResult?.settledEarly, true);
  cancelGoogle3DTilesButter();
});

test('cameraControlBridge + avatarWanderEngine execute single-click camera switch mid-swoop deterministically', () => {
  let cancelledFlights = 0;
  let setViewCalls = 0;
  let capturedSwoopComplete = null;
  const mockViewer = {
    entities: {
      add: (spec) => ({
        ...spec,
        show: true,
        position: { setValue: () => {} },
        orientation: { setValue: () => {} },
      }),
      remove: () => {},
    },
    camera: {
      cancelFlight: () => {
        cancelledFlights += 1;
      },
      lookAtTransform: () => {},
      setView: () => {
        setViewCalls += 1;
      },
      flyTo: (opts) => {
        capturedSwoopComplete = opts.complete;
      },
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(-84.388),
        Cesium.Math.toRadians(33.749),
        500, // > 30m AGL triggers 1.8s entrance swoop
      ),
    },
    scene: {
      globe: { getHeight: () => 290 },
      preRender: {
        addEventListener: () => () => {},
        removeEventListener: () => {},
      },
    },
  };

  const engine = createAvatarWanderEngine({ viewer: mockViewer });
  engine.startWandering({
    lat: 33.749,
    lon: -84.388,
    elev: 290,
    cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
  });

  // Entrance swoop is actively in flight (`isTransitioning === true`)
  assert.equal(engine.isTransitioning(), true);
  assert.equal(typeof capturedSwoopComplete, 'function');

  const viewsBeforeClick = setViewCalls;
  const cancelsBeforeClick = cancelledFlights;

  // Single click on Overview camera button while mid-swoop!
  engine.setCameraMode(WANDER_CAMERA_MODES.OVERVIEW);

  assert.equal(
    engine.isTransitioning(),
    false,
    'Click #1 mid-swoop must clear isTransitioning synchronously',
  );
  assert.ok(
    cancelledFlights > cancelsBeforeClick,
    'Click #1 mid-swoop must cancel active Cesium flyTo',
  );
  assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.OVERVIEW);
  assert.ok(
    setViewCalls > viewsBeforeClick,
    'Click #1 must apply target camera pose in the exact same turn',
  );

  // Stale swoop completion callback must be ignored (monotonic cameraIntentSeq)
  const viewsAfterClick = setViewCalls;
  capturedSwoopComplete();
  assert.equal(
    setViewCalls,
    viewsAfterClick,
    'Stale swoop complete callback must not overwrite newer camera intent',
  );

  engine.destroy();
});

test('personalFleetEngine applies camera pose immediately on Click #1 even while parked', () => {
  let setViewCalls = 0;
  let cancelCalls = 0;
  const mockViewer = {
    entities: { add: (s) => ({ ...s, show: true }), remove: () => {} },
    camera: {
      cancelFlight: () => {
        cancelCalls += 1;
      },
      lookAtTransform: () => {},
      setView: () => {
        setViewCalls += 1;
      },
    },
    scene: { primitives: { length: 0 } },
  };

  const fleet = createPersonalFleetEngine({ viewer: mockViewer });
  fleet.setCameraMode('overview');
  assert.equal(fleet.getCameraMode(), 'overview');
  assert.equal(cancelCalls, 1);
  assert.equal(setViewCalls, 1);
  fleet.destroy();
});

test('cameraControlBridge grace window and Sovereign UI container isolation work cleanly', () => {
  const auth = createCameraAuthority({ engineId: 'test-cam' });
  assert.equal(auth.isWithinCommandGraceWindow(180), false);
  const { seq, isCurrent } = auth.beginAtomicCameraSwitch({
    mode: 'overview',
    butter: false,
  });
  assert.equal(seq, 1);
  assert.equal(isCurrent(), true);
  assert.equal(auth.isWithinCommandGraceWindow(180), true);

  const fakeInsideBtn = {
    closest: (sel) => (sel.includes('data-sovereign-ui') ? {} : null),
  };
  assert.equal(isEventInsideSovereignUi({ target: fakeInsideBtn }), true);
  assert.equal(isEventInsideSovereignUi({ target: { closest: () => null } }), false);
});

test('experiencesCatalogAdapter aggregates Theme Parks, Resorts, Next Experiences, Living Cities, Wilderness & Domiciles with clean search & chip filters', () => {
  const catalog = buildExperiencesCatalog({ includeDomiciles: true });
  assert.ok(catalog.length >= 45, `Expected >= 45 experiences, got ${catalog.length}`);

  // Verify flagship long-title destinations are present with valid lat/lon
  const titles = catalog.map((item) => item.title);
  assert.ok(titles.some((t) => t.includes('Alpine Helen')));
  assert.ok(titles.some((t) => t.includes("Marriott's Grande Vista")));
  assert.ok(titles.some((t) => t.includes('Blizzard Beach')));
  assert.ok(titles.some((t) => t.includes('Fort Yargo State Park')));
  assert.ok(titles.some((t) => t.includes('Unicoi State Park')));
  assert.ok(titles.some((t) => t.includes('Magic Kingdom')));

  // Verify category coverage
  for (const catId of [
    'theme-parks',
    'resort-stays',
    'state-parks',
    'water-mountain',
    'boardwalk-strip',
    'living-cities',
    'wilderness',
  ]) {
    const subset = filterAndSortExperiences(catalog, { chips: [catId] });
    assert.ok(subset.length >= 1, `Expected >= 1 experience for chip ${catId}`);
  }

  // Search query filtering
  const helenMatches = filterAndSortExperiences(catalog, {
    query: 'uhuburg castle',
  });
  assert.equal(helenMatches.length, 1);
  assert.ok(helenMatches[0].title.includes('Alpine Helen'));

  // Sort A-Z
  const sortedAz = filterAndSortExperiences(catalog, { sort: 'az' });
  assert.ok(sortedAz[0].title.localeCompare(sortedAz[1].title) <= 0);
  assert.ok(EXPERIENCE_CATEGORIES.length >= 8);
});

test('SovereignUiRoot mounts EarthSimRailPanel, Experiences entry (data-stories-corner), Hide Custom UI (Alt+H) parity & ActiveSimMicroHud', async () => {
  const uninstall = installVueDom();
  try {
    const { nextTick } = await import('vue');
    const { createUiRuntime } = await import('../vueRuntime.js');
    const { useSovereignUiStore } = await import('../stores/sovereignUi.js');
    const { default: SovereignUiRoot } = await import('./SovereignUiRoot.vue');

    document.body.innerHTML = '';
    const leftStack = document.createElement('div');
    leftStack.id = 'left-panel-stack';
    const host = document.createElement('div');
    host.id = 'gev-sovereign-host';
    document.body.append(leftStack, host);

    const ui = createUiRuntime();
    const store = useSovereignUiStore(ui.pinia);
    let lastCameraMode = 'iso_chase';
    store.connectRuntime({
      wanderEngine: {
        isWandering: true,
        getCameraMode: () => lastCameraMode,
        setCameraMode: (m) => {
          lastCameraMode = m;
        },
        getTelemetry: () => ({
          isWandering: true,
          cameraMode: lastCameraMode,
          speedMph: 3.2,
          locationLabel: 'Downtown Austin, TX',
        }),
      },
    });
    store.setActiveSim({
      kind: 'wander',
      title: 'Ground Wander',
      subtitle: 'Downtown Austin, TX',
      cameraMode: 'iso_chase',
      cameraModes: [
        { id: 'first_person', label: '1st Person' },
        { id: 'iso_chase', label: 'Chase' },
        { id: 'overview', label: 'Overview' },
      ],
    });

    const unmount = ui.mount(SovereignUiRoot, host);
    await nextTick();

    // 1. Single extensible #earth-sim-panel teleported into #left-panel-stack
    const panel = leftStack.querySelector('#earth-sim-panel');
    assert.ok(panel, '#earth-sim-panel must teleport into #left-panel-stack');
    assert.equal(panel.getAttribute('data-rail-icon'), 'public');
    assert.equal(panel.hidden, false);

    // 2. Sibling top-right Experiences entry button with data-stories-corner
    const expEntry = document.getElementById('gev-experiences-entry');
    assert.ok(expEntry, '#gev-experiences-entry must mount');
    assert.equal(expEntry.hasAttribute('data-stories-corner'), true);

    // 3. ActiveSimMicroHud renders and switches camera on Click #1
    const hudOverviewBtn = document.querySelector(
      '#gev-active-sim-hud [data-camera-mode="overview"]',
    );
    assert.ok(hudOverviewBtn, 'ActiveSimMicroHud camera button must render');
    hudOverviewBtn.click();
    await nextTick();
    assert.equal(lastCameraMode, 'overview');
    assert.equal(store.activeSim.cameraMode, 'overview');
    assert.equal(hudOverviewBtn.getAttribute('aria-pressed'), 'true');

    // 4. Hide Custom UI hides #earth-sim-panel, #gev-experiences-entry, and HUD without stopping sims
    const hidePill = document.getElementById('gev-sovereign-hide-pill');
    assert.ok(hidePill, 'Standalone Hide Custom UI pill must mount');
    hidePill.click();
    await nextTick();
    assert.equal(store.customUiHidden, true);
    assert.equal(panel.hidden, true);
    assert.equal(document.getElementById('gev-active-sim-hud'), null);
    assert.equal(store.activeSim.kind, 'wander', 'Hide Custom UI must not stop active simulation');

    // Restore via Alt+H
    window.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'h', altKey: true }),
    );
    await nextTick();
    assert.equal(store.customUiHidden, false);
    assert.equal(panel.hidden, false);
    assert.ok(document.getElementById('gev-active-sim-hud'));

    // 5. Clicking Experiences entry opens ExperiencesExplorer
    expEntry.click();
    await nextTick();
    assert.ok(document.getElementById('gev-experiences-explorer'));

    unmount();
    ui.destroy();
    store.disconnectRuntime();
  } finally {
    uninstall();
  }
});
