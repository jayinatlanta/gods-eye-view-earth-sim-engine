import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  createTourAndPlayEngine,
  TOUR_PLAY_STATES,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  createTourPoiCards,
  TOUR_POI_OVERLAY_SOURCE_ID,
} from '../layers/citylife/tourPoiCards.js';
import { createSightseeingDrawer } from '../discovery/sightseeingDrawer.js';

function withHappyDom(fn) {
  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevImage = globalThis.Image;
  const prevKeyboardEvent = globalThis.KeyboardEvent;

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.KeyboardEvent = win.KeyboardEvent;

  return Promise.resolve()
    .then(() => fn(win))
    .finally(async () => {
      try {
        await win.close();
      } catch {}
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
      if (prevImage === undefined) delete globalThis.Image;
      else globalThis.Image = prevImage;
      if (prevKeyboardEvent === undefined) delete globalThis.KeyboardEvent;
      else globalThis.KeyboardEvent = prevKeyboardEvent;
    });
}

function createFakeWanderEngine() {
  return {
    isWandering: false,
    cameraMode: 'iso_chase',
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    startWandering() {
      this.isWandering = true;
    },
    stopWandering() {
      this.isWandering = false;
    },
    relocateTo() {},
    showDialogBubble() {},
    getCameraMode() {
      return this.cameraMode;
    },
    getUserAvatar() {
      return { isDestroyed: false };
    },
    getTelemetry() {
      return {
        coordinates: { lat: 28.3753, lon: -81.5494, height: 32, heading: 180 },
      };
    },
  };
}

test('tourPoiCards registers worldOverlay tour-poi entries, paces Wikimedia lookups, opens Experience Card with Dual-Mode YouTube, and tears down cleanly on Escape', async () => {
  await withHappyDom(async (win) => {
    const wanderEngine = createFakeWanderEngine();
    const engine = createTourAndPlayEngine({
      wanderEngine,
      rng: () => 0.1,
    });

    const drawer = createSightseeingDrawer({
      container: win.document.body,
    });

    const overlayCalls = [];
    const clearedSources = [];
    let currentEntries = [];
    const overlayApi = {
      setOverlayEntries(sourceId, entries, options) {
        currentEntries = entries;
        overlayCalls.push({ sourceId, count: entries.length, options });
      },
      clearOverlaySource(sourceId) {
        currentEntries = [];
        clearedSources.push(sourceId);
      },
      hitTestWorldOverlay(x, y, options = {}) {
        if (options.sourceId !== TOUR_POI_OVERLAY_SOURCE_ID) return null;
        if (currentEntries.length === 0) return null;
        return {
          sourceId: TOUR_POI_OVERLAY_SOURCE_ID,
          entryId: currentEntries[0].id,
          entry: currentEntries[0],
          rect: { x, y, w: 120, h: 80 },
        };
      },
    };

    const fetchedUrls = [];
    const mockFetch = async (url) => {
      fetchedUrls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            count: 1,
            billboards: [
              {
                title: 'Spaceship Earth (Epcot)',
                thumbnailUrl:
                  'https://upload.wikimedia.org/wikipedia/commons/thumb/spaceship.jpg/640px-spaceship.jpg',
                originalUrl:
                  'https://upload.wikimedia.org/wikipedia/commons/spaceship.jpg',
                extract: 'Iconic geodesic dome at EPCOT World Celebration.',
                url: 'https://en.wikipedia.org/wiki/Spaceship_Earth_(Epcot)',
              },
            ],
          };
        },
      };
    };

    const cards = createTourPoiCards({
      viewer: { camera: { positionCartographic: { height: 220 } } },
      tourAndPlayEngine: engine,
      sightseeingDrawer: drawer,
      fetchImpl: mockFetch,
      overlayApi,
    });

    // Launch EPCOT starting at Spaceship Earth (has live youtubeVideoId '8AI0yNMpt1E')
    engine.startCityTour({
      cityId: 'wdw_epcot',
      startStopId: 'epcot_spaceship_earth',
    });

    assert.ok(overlayCalls.length > 0, 'Must push tour-poi entries on start');
    assert.equal(
      overlayCalls[overlayCalls.length - 1].sourceId,
      TOUR_POI_OVERLAY_SOURCE_ID,
    );
    assert.ok(
      currentEntries.length > 0 && currentEntries.length <= 12,
      'Must respect bounded card budget',
    );
    assert.equal(currentEntries[0].requireImage, false);
    assert.ok(
      fetchedUrls.length >= 1 && fetchedUrls.length <= 4,
      'Cold-fill burst pacer must bound concurrent initial fetches',
    );
    assert.match(fetchedUrls[0], /\/api\/discovery\/sightseeing\?/);
    assert.match(fetchedUrls[0], /title=/);

    // Click billboard hit -> pauses tour for media & opens Dual-Mode Experience Drawer
    const hitHandled = cards.handleOverlayClick(150, 200);
    assert.equal(hitHandled, true);
    assert.equal(engine.getStatus().mediaPaused, true);

    // While paused for media, updateStep freezes dwell/movement cleanly
    const frozenStep = engine._updateStep({
      coordinates: { lat: 28.3753, lon: -81.5494, height: 32, heading: 180 },
      deltaTimeSeconds: 0.25,
    });
    assert.equal(frozenStep.speedMps, 0);

    // Wait a tick for fast-track Wikimedia lookup in openExperienceCard
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(drawer.isVisible(), true);

    const drawerEl = win.document.getElementById('gev-sightseeing-drawer');
    assert.ok(drawerEl);
    assert.equal(drawerEl.classList.contains('hidden'), false);
    assert.match(drawerEl.textContent, /PARK DAY EXPERIENCE/);
    assert.match(drawerEl.textContent, /Spaceship Earth/);
    assert.match(drawerEl.textContent, /World Celebration/);

    // Mode 1: privacy-enhanced youtube-nocookie iframe mounted
    const iframe = drawerEl.querySelector('.gev-sightseeing-yt-iframe');
    assert.ok(iframe, 'Mode 1 youtube-nocookie iframe must render for valid ID');
    assert.match(
      iframe.src,
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/8AI0yNMpt1E/,
    );

    // Mode 2: evergreen Watch 4K POV on YouTube link always present
    const ytSearchLink = drawerEl.querySelector('.gev-sightseeing-yt-search');
    assert.ok(ytSearchLink);
    assert.match(
      ytSearchLink.href,
      /^https:\/\/www\.youtube\.com\/results\?search_query=/,
    );

    // Press Escape -> clears iframe.src, removes iframe from DOM, closes drawer, resumes tour
    win.document.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(drawer.isVisible(), false);
    assert.equal(
      iframe.getAttribute('src'),
      null,
      'iframe src attribute must be removed to halt audio',
    );
    assert.equal(
      iframe.src.includes('youtube'),
      false,
      'iframe src must no longer point at YouTube',
    );
    assert.equal(
      drawerEl.querySelectorAll('iframe').length,
      0,
      'Zero iframes may remain inside closed drawer',
    );
    assert.equal(engine.getStatus().mediaPaused, false);
    assert.equal(engine.getStatus().state, TOUR_PLAY_STATES.SCOOTER_TRANSIT);

    // Stopping tour clears tour-poi overlay source
    engine.stop();
    assert.ok(clearedSources.includes(TOUR_POI_OVERLAY_SOURCE_ID));

    cards.destroy();
    drawer.destroy();
    engine.destroy();
  });
});

test('tourPoiCards also lights up classic city tours (e.g. paris) and falls back cleanly when Wikimedia has zero photos', async () => {
  await withHappyDom(async (win) => {
    const engine = createTourAndPlayEngine({
      wanderEngine: createFakeWanderEngine(),
      rng: () => 0.25,
    });
    const drawer = createSightseeingDrawer({ container: win.document.body });

    let latestEntries = [];
    const cards = createTourPoiCards({
      viewer: { camera: { positionCartographic: { height: 150 } } },
      tourAndPlayEngine: engine,
      sightseeingDrawer: drawer,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: true, count: 0, billboards: [] };
        },
      }),
      overlayApi: {
        setOverlayEntries(sourceId, entries) {
          if (sourceId === TOUR_POI_OVERLAY_SOURCE_ID) latestEntries = entries;
        },
        clearOverlaySource() {
          latestEntries = [];
        },
        hitTestWorldOverlay() {
          return null;
        },
      },
    });

    engine.startCityTour({ cityId: 'paris' });
    const status = engine.getStatus();
    assert.ok(latestEntries.length > 0, 'Paris tour must spawn tour-poi cards');
    assert.ok(
      status.currentLandmark.wikiTitle,
      'Paris stops must expose derived wikiTitle',
    );
    assert.ok(
      status.currentLandmark.youtubeSearchQuery,
      'Paris stops must expose Mode 2 youtubeSearchQuery',
    );

    await cards.openExperienceCard(status.currentLandmark.id);
    await new Promise((r) => setTimeout(r, 15));

    const drawerEl = win.document.getElementById('gev-sightseeing-drawer');
    assert.equal(drawer.isVisible(), true);
    assert.match(drawerEl.textContent, /TOUR STOP EXPERIENCE/);
    const fallbackEl = drawerEl.querySelector('.gev-sightseeing-fallback');
    assert.equal(
      fallbackEl.classList.contains('hidden'),
      false,
      'Fallback gradient banner must appear when Wikimedia returns 0 photos',
    );
    assert.equal(
      drawerEl.querySelectorAll('iframe').length,
      0,
      'City stops without embed ID omit iframe cleanly',
    );
    const ytSearchLink = drawerEl.querySelector('.gev-sightseeing-yt-search');
    assert.equal(ytSearchLink.classList.contains('hidden'), false);
    assert.match(
      ytSearchLink.href,
      /youtube\.com\/results\?search_query=/,
    );

    drawer.hide();
    assert.equal(engine.getStatus().mediaPaused, false);

    cards.destroy();
    drawer.destroy();
    engine.destroy();
  });
});
