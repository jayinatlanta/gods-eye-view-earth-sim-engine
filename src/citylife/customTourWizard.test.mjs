import '../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  METRO_LANDMARK_CATALOG,
  TOUR_OR_PLAY_STATES,
  TOUR_STOP_CATEGORIES,
  createTourAndPlayEngine,
  resolveTourOrPlayContext,
  resolveNearestMetroForTour,
  getLandmarksForCity,
  getCustomToursRegistry,
  getCustomStopsForCity,
  validateTourStopDraft,
  validateCustomTourDraft,
  generateDefaultCompanionNote,
  inferContinentFromCoords,
  createCustomTour,
  addTourStop,
  removeCustomTourStop,
  removeCustomTour,
  exportTourAsContractJson,
  clearCustomToursForTest,
} from '../layers/citylife/tourAndPlayEngine.js';
import { createAvatarWanderEngine } from '../layers/citylife/avatarWanderEngine.js';
import { createWanderDrawer } from './wanderDrawer.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

function createMockViewer(latDeg = 33.7749, lonDeg = -84.3725, altM = 120) {
  const mockEntities = [];
  const preRenderListeners = [];
  const canvasListeners = new Map();

  const mockCanvas = {
    addEventListener: (type, cb) => {
      if (!canvasListeners.has(type)) canvasListeners.set(type, new Set());
      canvasListeners.get(type).add(cb);
    },
    removeEventListener: (type, cb) => {
      canvasListeners.get(type)?.delete(cb);
    },
    requestPointerLock: () => {},
  };

  return {
    entities: {
      add: (spec) => {
        const e = {
          ...spec,
          show: true,
          position: { setValue: () => {} },
          orientation: { setValue: () => {} },
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
    camera: {
      heading: Cesium.Math.toRadians(45),
      setView: () => {},
      lookAtTransform: () => {},
      flyTo: () => {},
      cancelFlight: () => {},
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(lonDeg),
        Cesium.Math.toRadians(latDeg),
        altM,
      ),
    },
    scene: {
      canvas: mockCanvas,
      globe: {
        show: true,
        getHeight: () => 50,
      },
      sampleHeightSupported: false,
      sampleHeight: () => 50,
      preRender: {
        addEventListener: (cb) => {
          preRenderListeners.push(cb);
          return () => {
            const idx = preRenderListeners.indexOf(cb);
            if (idx >= 0) preRenderListeners.splice(idx, 1);
          };
        },
        removeEventListener: (cb) => {
          const idx = preRenderListeners.indexOf(cb);
          if (idx >= 0) preRenderListeners.splice(idx, 1);
        },
      },
      requestRender: () => {},
    },
  };
}

test('Quick Tour Wizard Data Contract Validation & Synthesis', async (t) => {
  t.beforeEach(() => clearCustomToursForTest());
  t.afterEach(() => clearCustomToursForTest());

  await t.test(
    '1. Rejects invalid stop/tour drafts and auto-hydrates missing contract fields cleanly',
    () => {
      const bad = validateTourStopDraft({
        name: 'A',
        lat: 999,
        lon: -84,
        lore: 'hi',
      });
      assert.equal(bad.valid, false);
      assert.ok(bad.errors.length >= 3);

      const good = validateTourStopDraft(
        {
          name: 'Tiny Door on the BeltLine',
          lat: 33.7654,
          lon: -84.3612,
          elev: 295.4,
          category: 'Art & Culture',
          lore: 'A whimsical 7-inch miniature brass door tucked beside the Eastside Trail underpass.',
          companionNote: '',
          streetBearingDeg: 382,
        },
        {
          cityId: 'atlanta',
          existingIds: ['custom_atlanta_tiny_door_on_the_beltline'],
        },
      );

      assert.equal(good.valid, true);
      assert.equal(good.warnings.length, 1);
      assert.equal(
        good.normalized.id,
        'custom_atlanta_tiny_door_on_the_beltline_2',
      );
      assert.equal(good.normalized.elev, 295);
      assert.equal(good.normalized.streetBearingDeg, 22);
      assert.equal(good.normalized.icon, '🎨');
      assert.equal(good.normalized.isCustom, true);
      assert.ok(
        good.normalized.companionNote.includes('Tiny Door on the BeltLine'),
        'Blank companionNote must be auto-drafted from stop name & lore',
      );

      assert.equal(inferContinentFromCoords(34.53, -83.98), 'North America');
      assert.equal(inferContinentFromCoords(-23.55, -46.63), 'South America');
      assert.equal(inferContinentFromCoords(48.85, 2.35), 'Europe');
      assert.equal(inferContinentFromCoords(35.67, 139.65), 'Asia');
      assert.equal(inferContinentFromCoords(-33.86, 151.2), 'Oceania');
      assert.equal(inferContinentFromCoords(-77.84, 166.66), 'Antarctica');

      const fallbackNote = generateDefaultCompanionNote({
        name: 'Old Mill',
        category: 'Historic Landmark',
        lore: 'Built in 1848 along the creek.',
      });
      assert.ok(fallbackNote.includes('Old Mill'));
      assert.ok(TOUR_STOP_CATEGORIES.length >= 6);
    },
  );

  await t.test(
    '2. Creating a brand-new local tour (+ Tour) converts a non-metro Play spot into an active Tour & persists to localStorage',
    () => {
      // Dahlonega, GA — outside Atlanta 32km metro radius, defaults to Play mode
      const dahlonegaLat = 34.5326;
      const dahlonegaLon = -83.9849;
      const beforeCtx = resolveTourOrPlayContext(
        dahlonegaLat,
        dahlonegaLon,
        440,
      );
      assert.equal(beforeCtx.mode, 'play');
      assert.equal(beforeCtx.hasExistingTour, false);

      const created = createCustomTour({
        tour: {
          name: 'Dahlonega Historic Gold Rush Square',
          country: 'USA',
          centerLat: dahlonegaLat,
          centerLon: dahlonegaLon,
        },
        firstStop: {
          name: 'Lumpkin County Gold Museum',
          lat: dahlonegaLat,
          lon: dahlonegaLon,
          elev: 442,
          category: 'Historic Landmark',
          lore: 'The oldest surviving courthouse in Georgia, built in 1836 at the heart of America’s first major gold rush.',
        },
      });

      assert.equal(created.ok, true);
      assert.ok(created.tourId.startsWith('custom_'));
      assert.equal(created.metadata.continent, 'North America');
      assert.equal(created.totalStops, 1);

      // Context now resolves directly to the user's custom tour!
      const afterCtx = resolveTourOrPlayContext(
        dahlonegaLat,
        dahlonegaLon,
        440,
      );
      assert.equal(afterCtx.mode, 'tour');
      assert.equal(afterCtx.hasExistingTour, true);
      assert.equal(afterCtx.isCustomTour, true);
      assert.equal(afterCtx.cityId, created.tourId);
      assert.equal(afterCtx.cityName, 'Dahlonega Historic Gold Rush Square');
      assert.equal(afterCtx.landmarks.length, 1);

      // Nearest metro fallback also finds it when viewing Dahlonega
      const nearest = resolveNearestMetroForTour(dahlonegaLat, dahlonegaLon);
      assert.equal(nearest.cityId, created.tourId);

      // Add a second stop to the new custom tour
      const stop2 = addTourStop({
        cityId: created.tourId,
        stop: {
          name: 'Smith House Heritage Inn',
          lat: 34.5318,
          lon: -83.9838,
          elev: 440,
          category: 'Food & Café',
          lore: 'Famous family-style Southern dining room built atop a real 1890s gold vein.',
        },
      });
      assert.equal(stop2.ok, true);
      assert.equal(stop2.totalStops, 2);

      // Engine launches the custom tour cleanly
      const viewer = createMockViewer(dahlonegaLat, dahlonegaLon, 440);
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      const status = tourEngine.startCityTour({
        cityId: created.tourId,
        startStopId: stop2.stop.id,
      });
      assert.equal(status.mode, 'tour');
      assert.equal(status.cityId, created.tourId);
      assert.equal(status.cityName, 'Dahlonega Historic Gold Rush Square');
      assert.equal(status.totalLandmarks, 2);
      assert.equal(status.currentLandmark.id, stop2.stop.id);

      const exported = JSON.parse(exportTourAsContractJson(created.tourId));
      assert.equal(exported.landmarks.length, 2);
      assert.equal(exported.metadata.isCustom, true);

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '3. Adding a stop (+ Tour Stop) to an existing built-in tour merges non-destructively without mutating METRO_LANDMARK_CATALOG',
    () => {
      const builtInCount = METRO_LANDMARK_CATALOG.atlanta.length;

      const added = addTourStop({
        cityId: 'atlanta',
        stop: {
          name: 'Piedmont Park Historic Pavilion',
          lat: 33.7851,
          lon: -84.3738,
          elev: 295,
          category: 'Local Secret',
          lore: 'Historic urban park pavilion along the BeltLine Eastside Trail.',
        },
      });

      assert.equal(added.ok, true);
      assert.equal(added.cityId, 'atlanta');
      assert.equal(added.totalStops, builtInCount + 1);
      assert.equal(
        METRO_LANDMARK_CATALOG.atlanta.length,
        builtInCount,
        'Frozen METRO_LANDMARK_CATALOG must never be mutated',
      );

      const merged = getLandmarksForCity('atlanta');
      assert.equal(merged.length, builtInCount + 1);
      assert.ok(merged.some((s) => s.id === added.stop.id));
      assert.equal(getCustomStopsForCity('atlanta').length, 1);

      const removed = removeCustomTourStop('atlanta', added.stop.id);
      assert.equal(removed, true);
      assert.equal(getLandmarksForCity('atlanta').length, builtInCount);
    },
  );
});

test('Quick Tour Wizard Flyout Sub-Panel DOM Integration (wanderDrawer)', async (t) => {
  t.beforeEach(() => clearCustomToursForTest());
  t.afterEach(() => clearCustomToursForTest());

  await t.test(
    '1. Non-metro Play view highlights "+ Create Tour Here", creates a new tour via wizard, and updates Tour flyout controls',
    () => {
      const dahlonegaLat = 34.5326;
      const dahlonegaLon = -83.9849;
      const viewer = createMockViewer(dahlonegaLat, dahlonegaLon, 440);
      const cityEngine = {
        getCurrentCameraGroundPosition: () => ({
          lat: dahlonegaLat,
          lon: dahlonegaLon,
          elev: 440,
        }),
      };
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine, cityEngine });
      const drawer = createWanderDrawer({
        wanderEngine,
        cityEngine,
        tourAndPlayEngine: tourEngine,
        viewer,
      });

      drawer.open();
      const root = drawer.getElement();

      // Initially in Play Mode with prominent + Create Tour Here CTA
      const ctaRow = root.querySelector('.gev-tour-no-tour-cta');
      assert.equal(ctaRow.style.display, 'flex');

      const newTourBtn = root.querySelector('.gev-tour-wizard-new-tour-btn');
      newTourBtn.click();

      assert.equal(drawer.isWizardOpen(), true);
      const wizPanel = root.querySelector('.gev-tour-wizard-panel');
      assert.ok(wizPanel.classList.contains('open'));
      assert.ok(
        root
          .querySelector('.gev-wizard-mode-btn[data-wiz-mode="tour"]')
          .classList.contains('active'),
      );

      // Pin coordinates auto-captured from viewed location
      assert.ok(
        root
          .querySelector('.gev-wizard-pin-coords')
          .textContent.includes('34.53260'),
      );

      // Fill wizard fields (leave companionNote blank to verify auto-contract completion)
      const tourNameInput = root.querySelector('.gev-wizard-tour-name');
      const stopNameInput = root.querySelector('.gev-wizard-stop-name');
      const loreInput = root.querySelector('.gev-wizard-stop-lore');
      const statusEl = root.querySelector('.gev-wizard-contract-status');

      tourNameInput.value = 'Dahlonega Insider Walk';
      tourNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      stopNameInput.value = 'Holly Theater Marquee';
      stopNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      loreInput.value =
        'Restored 1948 Art Deco theater anchoring community plays and live bluegrass.';
      loreInput.dispatchEvent(new Event('input', { bubbles: true }));

      assert.ok(statusEl.classList.contains('ready'));
      assert.ok(statusEl.textContent.includes('Contract Ready'));
      assert.ok(
        root
          .querySelector('.gev-wizard-json-pre')
          .textContent.includes('Holly Theater Marquee'),
      );

      // Save Tour & Stop
      root.querySelector('.gev-wizard-save-btn').click();

      const reg = getCustomToursRegistry();
      const customIds = Object.keys(reg.customTours);
      assert.equal(customIds.length, 1);
      const customId = customIds[0];

      // Drawer transitions from Play Mode to Tour Ready and lists the new custom tour & stop!
      assert.equal(
        root.querySelector('.gev-tour-controls').style.display,
        'flex',
      );
      assert.equal(root.querySelector('.gev-tour-city-select').value, customId);
      assert.ok(
        root
          .querySelector('.gev-wizard-custom-list')
          .textContent.includes('Holly Theater Marquee'),
      );

      // Delete custom tour via wizard button
      root.querySelector('.gev-wizard-delete-tour-btn').click();
      assert.equal(Object.keys(getCustomToursRegistry().customTours).length, 0);
      assert.equal(removeCustomTour(customId), false);

      drawer.destroy();
      tourEngine.destroy();
      wanderEngine.destroy();
      getGlobalDrawerCoordinator().unregisterDrawer('wander');
    },
  );

  await t.test(
    '2. Existing metro view opens wizard in "+ Tour Stop" mode and "Save & Start Tour" launches immediately at the new stop',
    () => {
      const atlLat = 33.7749;
      const atlLon = -84.3725;
      const viewer = createMockViewer(atlLat, atlLon, 305);
      const cityEngine = {
        getCurrentCameraGroundPosition: () => ({
          lat: atlLat,
          lon: atlLon,
          elev: 305,
        }),
      };
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine, cityEngine });
      const drawer = createWanderDrawer({
        wanderEngine,
        cityEngine,
        tourAndPlayEngine: tourEngine,
        viewer,
      });

      drawer.open();
      const root = drawer.getElement();

      // Click "+ Stop" button inside .gev-tour-controls
      root.querySelector('.gev-tour-wizard-open-btn').click();
      assert.equal(drawer.isWizardOpen(), true);
      assert.ok(
        root
          .querySelector('.gev-wizard-mode-btn[data-wiz-mode="stop"]')
          .classList.contains('active'),
      );
      assert.equal(
        root.querySelector('.gev-wizard-target-tour-select').value,
        'atlanta',
      );

      // Enter stop details & click "Save & Start Tour"
      const stopNameInput = root.querySelector('.gev-wizard-stop-name');
      const loreInput = root.querySelector('.gev-wizard-stop-lore');
      stopNameInput.value = 'Oakland Cemetery Bell Tower';
      stopNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      loreInput.value =
        'Victorian garden cemetery founded in 1850 with sweeping skyline views of Downtown Atlanta.';
      loreInput.dispatchEvent(new Event('input', { bubbles: true }));

      root.querySelector('.gev-wizard-save-start-btn').click();

      assert.equal(drawer.isWizardOpen(), false);
      const status = tourEngine.getStatus();
      assert.equal(status.isActive, true);
      assert.equal(status.cityId, 'atlanta');
      assert.equal(status.state, TOUR_OR_PLAY_STATES.SCOOTER_TRANSIT);
      assert.equal(status.currentLandmark.name, 'Oakland Cemetery Bell Tower');

      drawer.destroy();
      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );
});
