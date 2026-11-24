import { test } from 'node:test';
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
  cancelGoogle3DTilesButter,
} from './tilesetButter.js';
import {
  EXPERIENCE_CATEGORIES,
  buildExperiencesCatalog,
  filterAndSortExperiences,
} from './experiencesCatalogAdapter.js';
import { createDriveEngine } from '../../layers/drive/driveEngine.js';
import { createRailwayEngine } from '../../layers/transit/railwayEngine.js';
import { createBoatEngine } from '../../layers/vessels/boatEngine.js';
import { createSyntheticFlightEngine } from '../../flight/syntheticFlightEngine.js';
import { createSyntheticBusEngine } from '../../layers/citylife/syntheticBusEngine.js';
import { createSyntheticMetroEngine } from '../../layers/citylife/syntheticMetroEngine.js';
import { createFreightSimEngine } from '../../layers/freight/freightSimEngine.js';

function createMockVehicleViewer({ tilesLoaded = true } = {}) {
  let cancelFlightCalls = 0;
  let setViewCalls = 0;
  let lookAtCalls = 0;
  const entities = [];
  const fakeTileset = {
    show: true,
    tilesLoaded,
    foveatedTimeDelay: 0.5,
    statistics: {
      numberOfPendingRequests: tilesLoaded ? 0 : 3,
      numberOfTilesProcessing: 0,
    },
    tileLoadProgressEvent: {
      addEventListener: () => () => {},
    },
  };
  const primitives = {
    length: 1,
    get: (i) => (i === 0 ? fakeTileset : null),
    add: () => {},
    remove: () => {},
  };

  const viewer = {
    trackedEntity: undefined,
    clock: {
      startTime: Cesium.JulianDate.now(),
      stopTime: Cesium.JulianDate.now(),
      currentTime: Cesium.JulianDate.now(),
      shouldAnimate: true,
      multiplier: 1,
      clockRange: Cesium.ClockRange.CLAMPED,
      onTick: { addEventListener: () => () => {} },
    },
    entities: {
      add: (spec) => {
        entities.push(spec);
        return spec;
      },
      remove: (ent) => {
        const idx = entities.indexOf(ent);
        if (idx >= 0) entities.splice(idx, 1);
      },
    },
    camera: {
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(-84.388),
        Cesium.Math.toRadians(33.749),
        450,
      ),
      cancelFlight: () => {
        cancelFlightCalls += 1;
      },
      setView: () => {
        setViewCalls += 1;
      },
      flyTo: () => {},
      lookAtTransform: () => {
        lookAtCalls += 1;
      },
    },
    scene: {
      primitives,
      globe: { show: true, getHeight: () => 250 },
      preRender: { addEventListener: () => () => {} },
      requestRender: () => {},
      screenSpaceCameraController: { enableCollisionDetection: true },
    },
  };

  return {
    viewer,
    fakeTileset,
    getCancelFlightCalls: () => cancelFlightCalls,
    getSetViewCalls: () => setViewCalls,
    getLookAtCalls: () => lookAtCalls,
  };
}

test('Phase 2 moduleRegistry registers Vehicles & Corridors covering all 7 legacy mobility drawers', async () => {
  const uninstall = installVueDom();
  try {
    const {
      EARTH_SIM_MODULES,
      getEarthSimModuleById,
      getMigratedLegacyDrawerIds,
    } = await import('./moduleRegistry.js');
    const mod = getEarthSimModuleById('vehicles-mobility');
    assert.ok(mod, 'vehicles-mobility module must be registered');
    assert.equal(mod.id, 'vehicles-mobility');
    assert.equal(mod.group, 'mobility');
    assert.ok(EARTH_SIM_MODULES.length >= 2);
    const migrated = getMigratedLegacyDrawerIds();
    for (const id of [
      'flight',
      'rail',
      'drive',
      'boat',
      'transit',
      'freight',
      'corridor',
    ]) {
      assert.ok(migrated.includes(id), `Expected migrated legacy drawer: ${id}`);
    }
  } finally {
    uninstall();
  }
});

test('Phase 2 experiencesCatalogAdapter includes Rails/Monorails/Skyliner/Tramways, Flights/Heli, Scenic Drives, Waterways & Corridors', () => {
  const catalog = buildExperiencesCatalog({ includeDomiciles: true });
  const categoryIds = new Set(EXPERIENCE_CATEGORIES.map((c) => c.id));
  for (const cat of [
    'rails-monorails',
    'flights-heli',
    'scenic-drives',
    'waterways',
    'corridors',
  ]) {
    assert.ok(categoryIds.has(cat), `Category chip ${cat} must exist`);
    const matches = filterAndSortExperiences(catalog, { chips: [cat] });
    assert.ok(matches.length >= 3, `Expected >=3 experiences in ${cat}`);
  }

  const skyliner = filterAndSortExperiences(catalog, { query: 'Skyliner' });
  assert.ok(skyliner.length >= 1, 'WDW Skyliner must appear in Experiences');
  const monorail = filterAndSortExperiences(catalog, { query: 'Monorail' });
  assert.ok(monorail.length >= 2, 'Monorail lines must appear in Experiences');
  const tram = filterAndSortExperiences(catalog, { query: 'Ober' });
  assert.ok(tram.length >= 1, 'Ober Aerial Tramway must appear in Experiences');
  const h145 = filterAndSortExperiences(catalog, { query: 'H145' });
  assert.ok(h145.length >= 1, 'Airbus H145 route must appear in Experiences');
});

test('Phase 2 Click #1 camera determinism: driveEngine applies camera pose even while parked, cancels flights, and settles tileset butter cleanly', async () => {
  _resetRenderGovernorForTest();
  installRenderGovernor(framePortFor({ scene: { requestRender: () => {} } }));

  const { viewer, getCancelFlightCalls, getSetViewCalls } =
    createMockVehicleViewer({ tilesLoaded: true });
  const drive = createDriveEngine({ viewer });

  await drive.startRouteDrive('atlanta_savannah', null, {
    speedMph: 75,
    cameraMode: 'chase',
    useOsrm: false,
  });

  // Pull over -> vehicle is parked
  const parkRes = drive.pullOver();
  assert.equal(parkRes.status, 'parked');
  assert.equal(drive.isParked(), true);

  const beforeSetView = getSetViewCalls();
  const beforeCancel = getCancelFlightCalls();
  const beforeSeq = drive.getCameraIntentSeq();

  // Click #1 camera switch while PARKED must apply pose immediately!
  drive.setCameraMode('seat');
  assert.equal(drive.getCameraMode(), 'seat');
  assert.ok(
    drive.getCameraIntentSeq() > beforeSeq,
    'cameraIntentSeq must increment on parked switch',
  );
  assert.ok(
    getCancelFlightCalls() > beforeCancel,
    'cancelFlight must run synchronously on Click #1',
  );
  assert.ok(
    getSetViewCalls() > beforeSetView,
    'setView must apply immediately even while parked',
  );

  // Wait for tileset butter to settle cleanly (zero leaked holds)
  await new Promise((r) => setTimeout(r, 320));
  const diag = getRenderGovernorDiagnostics();
  assert.equal(
    diag.holds.includes(TILESET_BUTTER_HOLD),
    false,
    'tileset-butter hold must settle and never leak',
  );

  drive.destroy();
  cancelGoogle3DTilesButter();
  _resetRenderGovernorForTest();
});

test('Phase 2 Click #1 camera determinism across Flight, Rail, Boat, Bus, Metro & Freight engines', async () => {
  _resetRenderGovernorForTest();
  installRenderGovernor(framePortFor({ scene: { requestRender: () => {} } }));

  // 1. Flight
  const fMock = createMockVehicleViewer();
  const flight = createSyntheticFlightEngine({ viewer: fMock.viewer });
  await flight.spawnFlightRoute('ATL', 'MIA', { durationSec: 120 });
  const fCancelBefore = fMock.getCancelFlightCalls();
  flight.setCameraMode('cockpit');
  assert.equal(flight.getCameraMode(), 'cockpit');
  assert.equal(fMock.viewer.trackedEntity, undefined);
  assert.ok(fMock.getCancelFlightCalls() > fCancelBefore);
  assert.ok(flight.getCameraIntentSeq() >= 1);
  flight.destroy();

  // 2. Rail: setCameraMode('free') cancels overview flyTo synchronously
  const rMock = createMockVehicleViewer();
  const rail = createRailwayEngine({ viewer: rMock.viewer });
  await rail.spawnRailRoute('atlanta_marta_east', null, {
    corridor: 'csx_mainline',
    useOverpass: false,
  });
  rail.setCameraMode('overview');
  const rCancelBefore = rMock.getCancelFlightCalls();
  rail.setCameraMode('free');
  assert.equal(rail.getCameraMode(), 'free');
  assert.ok(
    rMock.getCancelFlightCalls() > rCancelBefore,
    'Rail setCameraMode(free) must cancel active overview flyTo',
  );
  rail.destroy();

  // 3. Boat
  const bMock = createMockVehicleViewer();
  const boat = createBoatEngine({ viewer: bMock.viewer });
  await boat.spawnBoatRoute('savannah_barrier_islands', null, {
    vesselClass: 'sloop',
  });
  const bSetViewBefore = bMock.getSetViewCalls();
  boat.setCameraMode('helm');
  assert.equal(boat.getCameraMode(), 'helm');
  assert.ok(bMock.getSetViewCalls() > bSetViewBefore);
  assert.ok(boat.getCameraIntentSeq() >= 1);
  boat.destroy();

  // 4. Bus & Metro
  const busMock = createMockVehicleViewer();
  const bus = createSyntheticBusEngine({ viewer: busMock.viewer });
  bus.startBusFleet('atlanta');
  bus.setCameraMode('cab');
  assert.equal(bus.getCameraMode(), 'cab');
  assert.ok(bus.getCameraIntentSeq() >= 1);
  bus.destroy();

  const metroMock = createMockVehicleViewer();
  const metro = createSyntheticMetroEngine({ viewer: metroMock.viewer });
  metro.startMetroSystem('chicago');
  metro.setCameraMode('lead_cab');
  assert.equal(metro.getCameraMode(), 'lead_cab');
  assert.ok(metro.getCameraIntentSeq() >= 1);
  metro.destroy();

  // 5. Freight: immediate pose apply on setCameraMode + snapBack
  const frMock = createMockVehicleViewer();
  const freight = createFreightSimEngine({ viewer: frMock.viewer });
  freight.start();
  const frSetViewBefore = frMock.getSetViewCalls();
  assert.equal(freight.setCameraMode('IN_CAB'), true);
  assert.equal(freight.getCameraMode(), 'IN_CAB');
  assert.ok(frMock.getSetViewCalls() > frSetViewBefore);
  assert.equal(freight.snapBack('SEMI_CHASE'), true);
  assert.equal(freight.getCameraMode(), 'SEMI_CHASE');
  freight.destroy();

  cancelGoogle3DTilesButter();
  _resetRenderGovernorForTest();
});

test('Phase 2 SearchablePlacePicker + VehiclesMobilityModule mount cleanly with keyboard selection & zero raw selects', async () => {
  const uninstall = installVueDom();
  try {
    const { nextTick } = await import('vue');
    const { createUiRuntime } = await import('../vueRuntime.js');
    const { useSovereignUiStore } = await import('../stores/sovereignUi.js');
    const { default: SearchablePlacePicker } = await import(
      './components/SearchablePlacePicker.vue'
    );
    const { default: VehiclesMobilityModule } = await import(
      './modules/VehiclesMobilityModule.vue'
    );

    document.body.innerHTML = '';

    // 1. Test SearchablePlacePicker filtering & keyboard ArrowDown + Enter
    const pickerHost = document.createElement('div');
    document.body.appendChild(pickerHost);
    let selectedVal = 'ATL';
    const ui1 = createUiRuntime();
    const unmountPicker = ui1.mount(SearchablePlacePicker, pickerHost, {
      modelValue: selectedVal,
      label: 'Origin Hub',
      pickerId: 'test-picker',
      options: [
        { value: 'ATL', label: 'ATL — Atlanta (Hartsfield-Jackson)' },
        { value: 'MIA', label: 'MIA — Miami Intl' },
        { value: 'EYW', label: 'EYW — Key West International' },
      ],
      'onUpdate:modelValue': (v) => {
        selectedVal = v;
      },
    });
    await nextTick();

    assert.equal(
      pickerHost.querySelectorAll('select').length,
      0,
      'SearchablePlacePicker must never render a native <select>',
    );
    const trigger = pickerHost.querySelector('.es-picker-trigger');
    assert.ok(trigger);
    trigger.click();
    await nextTick();

    const pickerRoot = pickerHost.querySelector('.es-place-picker');
    pickerRoot.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    await nextTick();
    pickerRoot.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await nextTick();
    assert.equal(selectedVal, 'MIA', 'ArrowDown + Enter must commit MIA');
    unmountPicker();
    ui1.destroy();

    // 2. Test VehiclesMobilityModule tab switching across all 7 mobility tabs
    const modHost = document.createElement('div');
    document.body.appendChild(modHost);
    const ui2 = createUiRuntime();
    const store = useSovereignUiStore(ui2.pinia);
    let lastDriveCam = 'chase';
    store.connectRuntime({
      driveEngine: {
        getCameraMode: () => lastDriveCam,
        setCameraMode: (m) => {
          lastDriveCam = m;
        },
        getActiveTelemetry: () => ({
          currentLocation: 'Peachtree St',
          speedMph: 0,
          progressPct: 10,
          cameraMode: lastDriveCam,
          isParked: true,
        }),
      },
    });
    store.setActiveSim({
      kind: 'drive',
      title: 'Infinite Drive',
      cameraMode: 'chase',
      cameraModes: [
        { id: 'chase', label: 'Chase' },
        { id: 'seat', label: 'Cockpit' },
      ],
    });
    store.setActiveMobilityTab('drive');

    const unmountMod = ui2.mount(VehiclesMobilityModule, modHost);
    await nextTick();

    const tabs = modHost.querySelectorAll('.es-mobility-tabs [role="radio"]');
    assert.equal(tabs.length, 7, 'Must render all 7 UiSegmented mobility tabs');

    const seatBtn = modHost.querySelector('[data-drive-cam="seat"]');
    assert.ok(seatBtn, 'Drive Cockpit camera button must render');
    seatBtn.click();
    await nextTick();
    assert.equal(lastDriveCam, 'seat');
    assert.equal(store.activeSim.cameraMode, 'seat');

    unmountMod();
    ui2.destroy();
  } finally {
    uninstall();
  }
});

test('Phase 2 retired vehicle & corridor drawers mount zero legacy bottom-right charms in DOM', async () => {
  const uninstall = installVueDom();
  try {
    const { createFlightDrawer } = await import('../../flight/flightDrawer.js');
    const { createRailDrawer } = await import('../../transit/railDrawer.js');
    const { createDriveDrawer } = await import('../../drive/driveDrawer.js');
    const { createBoatDrawer } = await import('../../vessels/boatDrawer.js');
    const { createTransitControllerDrawer } = await import(
      '../../citylife/transitControllerDrawer.js'
    );
    const { createFreightLogisticsDrawer } = await import(
      '../../citylife/freightLogisticsDrawer.js'
    );
    const { createCorridorDrawer } = await import(
      '../../corridor/corridorDrawer.js'
    );

    document.body.innerHTML = '';
    const d1 = createFlightDrawer({ container: document.body });
    const d2 = createRailDrawer({ container: document.body });
    const d3 = createDriveDrawer({ container: document.body });
    const d4 = createBoatDrawer({ container: document.body });
    const d5 = createTransitControllerDrawer({ container: document.body });
    const d6 = createFreightLogisticsDrawer({ container: document.body });
    const d7 = createCorridorDrawer({
      container: document.body,
      autoRunDeeplink: false,
    });

    assert.equal(
      document.body.children.length,
      0,
      'All 7 retired mobility drawers must mount zero legacy DOM elements',
    );

    d1.destroy();
    d2.destroy();
    d3.destroy();
    d4.destroy();
    d5.destroy();
    d6.destroy();
    d7.destroy();
  } finally {
    uninstall();
  }
});
