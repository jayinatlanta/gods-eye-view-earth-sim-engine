import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { Window } from 'happy-dom';
import { haversineDistanceMeters } from './cityWaypoints.js';
import {
  METRO_LANDMARK_CATALOG,
  METRO_TOUR_METADATA,
  ALL_CURATED_THEME_PARK_IDS,
  RESORT_PARK_HOPPER_BRIDGES,
  getParkHopperBridgesForPark,
  getLandmarksForCity,
  buildTourItinerary,
  computeDayCycleSolarState,
  findNearestVenueTour,
  resolveTourOrPlayContext,
  createTourAndPlayEngine,
  TOUR_OR_PLAY_STATES,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  EXEMPLAR_LOCALES,
  classifyLocale,
  SETTLEMENT_TYPOLOGIES,
} from '../layers/citylife/localeClassifier.js';
import {
  HIDDEN_SECRETS_CATALOG,
  PASSPORT_STORAGE_KEY,
  getHiddenSecretsForTour,
  collectHiddenSecret,
  getPassportProgress,
  clearDayPassportForTest,
  createMulberry32,
  hashStringToSeed,
  generateParkNpcsForTour,
  buildNpcDialogue,
  createParkAdventureController,
} from '../layers/citylife/parkSecretsAndNpcs.js';
import {
  createParkFireworksFinale,
  FIREWORKS_PARTICLE_POOL_SIZE,
} from '../layers/citylife/parkFireworksFinale.js';
import { createWanderDrawer } from './wanderDrawer.js';
import { createCityDrawer } from './cityDrawer.js';

function withHappyDom(fn) {
  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevKeyboardEvent = globalThis.KeyboardEvent;
  const prevEvent = globalThis.Event;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancelRaf = globalThis.cancelAnimationFrame;

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.Event = win.Event;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

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
      if (prevStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = prevStorage;
      if (prevKeyboardEvent === undefined) delete globalThis.KeyboardEvent;
      else globalThis.KeyboardEvent = prevKeyboardEvent;
      if (prevEvent === undefined) delete globalThis.Event;
      else globalThis.Event = prevEvent;
      if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = prevRaf;
      if (prevCancelRaf === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = prevCancelRaf;
    });
}

function createFakeWanderEngine() {
  return {
    isWandering: false,
    cameraMode: 'iso_chase',
    companionActive: true,
    coords: { lat: 28.3563, lon: -81.5604, height: 32, heading: 0 },
    lastBubble: null,
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    startWandering(opts = {}) {
      this.isWandering = true;
      if (Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
        this.coords = {
          lat: opts.lat,
          lon: opts.lon,
          height: opts.elev || 32,
          heading: opts.heading || 0,
        };
      }
    },
    stopWandering() {
      this.isWandering = false;
    },
    relocateTo(opts = {}) {
      if (Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
        this.coords = {
          lat: opts.lat,
          lon: opts.lon,
          height: opts.elev || 32,
          heading: opts.heading || 0,
        };
      }
    },
    showDialogBubble(spec) {
      this.lastBubble = spec;
    },
    getCameraMode() {
      return this.cameraMode;
    },
    isCompanionActive() {
      return this.companionActive;
    },
    getUserAvatar() {
      return { isDestroyed: false };
    },
    getTelemetry() {
      return {
        coordinates: { ...this.coords },
        companionThought: 'Ready to explore!',
      };
    },
  };
}

function createMockViewer(lat = 28.3575, lon = -81.5583) {
  const dataSources = [];
  const primitives = [];
  const clock = {
    currentTime: Cesium.JulianDate.fromIso8601('2026-06-21T16:00:00Z'),
    shouldAnimate: true,
    multiplier: 1,
  };
  return {
    clock,
    camera: {
      heading: 0,
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(lon),
        Cesium.Math.toRadians(lat),
        120,
      ),
      flyTo: () => {},
      setView: () => {},
      cancelFlight: () => {},
    },
    dataSources: {
      add(ds) {
        dataSources.push(ds);
        return ds;
      },
      remove(ds) {
        const idx = dataSources.indexOf(ds);
        if (idx >= 0) dataSources.splice(idx, 1);
      },
      _all: dataSources,
    },
    scene: {
      requestRender: () => {},
      primitives: {
        add(coll) {
          primitives.push(coll);
          return coll;
        },
        remove(coll) {
          const idx = primitives.indexOf(coll);
          if (idx >= 0) primitives.splice(idx, 1);
        },
        _all: primitives,
      },
    },
  };
}

function createMockAudioContext() {
  const createdNodes = [];
  return {
    state: 'running',
    currentTime: 10,
    sampleRate: 22050,
    destination: { nodeType: 'dest' },
    createdNodes,
    createOscillator() {
      const n = {
        type: 'sine',
        stopped: false,
        disconnected: false,
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {
          this.stopped = true;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      createdNodes.push(n);
      return n;
    },
    createGain() {
      const n = {
        disconnected: false,
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
      };
      createdNodes.push(n);
      return n;
    },
    createBuffer(channels, length, sr) {
      const arr = new Float32Array(length);
      return {
        channels,
        length,
        sampleRate: sr,
        getChannelData: () => arr,
      };
    },
    createBufferSource() {
      const n = {
        buffer: null,
        stopped: false,
        disconnected: false,
        connect() {},
        start() {},
        stop() {
          this.stopped = true;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      createdNodes.push(n);
      return n;
    },
    createBiquadFilter() {
      const n = {
        type: 'bandpass',
        disconnected: false,
        frequency: { setValueAtTime() {} },
        Q: { setValueAtTime() {} },
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
      };
      createdNodes.push(n);
      return n;
    },
  };
}

test('Stage 3 Pillar 1: Full 13-Park Roster (10 US + Tokyo DisneySea/Disneyland + Disneyland Paris) on Tour v2', async () => {
  assert.equal(ALL_CURATED_THEME_PARK_IDS.length, 13);

  for (const parkId of ALL_CURATED_THEME_PARK_IDS) {
    const stops = METRO_LANDMARK_CATALOG[parkId];
    const meta = METRO_TOUR_METADATA[parkId];
    assert.ok(Array.isArray(stops) && stops.length >= 10, `${parkId} stops >= 10`);
    assert.ok(meta, `${parkId} metadata present`);
    assert.equal(meta.tourScope, 'venue', `${parkId} must be venue scope`);
    assert.equal(
      meta.transitMode,
      'walk_midway',
      `${parkId} must use walk_midway`,
    );
    assert.equal(
      meta.dayCycleEnabled,
      true,
      `${parkId} must enable dayCycleEnabled`,
    );
    assert.ok(
      Number.isFinite(meta.radiusMeters) && meta.radiusMeters <= 2500,
      `${parkId} tight radiusMeters`,
    );

    const enriched = getLandmarksForCity(parkId);
    for (const stop of enriched) {
      assert.ok(stop.id, `${parkId} stop.id`);
      assert.ok(stop.name, `${parkId} stop.name`);
      assert.ok(stop.wikiTitle, `${parkId} ${stop.id} wikiTitle`);
      assert.ok(stop.youtubeSearchQuery, `${parkId} ${stop.id} youtubeSearchQuery`);
      assert.ok(stop.land, `${parkId} ${stop.id} land`);
      assert.ok(
        Number.isFinite(stop.estimatedWaitMin) && Number.isFinite(stop.waitTimeMin),
        `${parkId} ${stop.id} dual wait fields`,
      );
      assert.ok(
        stop.snackNote && stop.snackTag,
        `${parkId} ${stop.id} dual snack fields`,
      );
      assert.ok(stop.lore && stop.lore.length > 20, `${parkId} ${stop.id} lore`);
      assert.ok(
        stop.companionNote && stop.companionNote.length > 10,
        `${parkId} ${stop.id} companionNote`,
      );
    }

    // Center coordinates must resolve unambiguously to this exact park
    const venueHit = findNearestVenueTour(meta.centerLat, meta.centerLon);
    assert.ok(venueHit, `findNearestVenueTour hit for ${parkId}`);
    assert.equal(
      venueHit.id,
      parkId,
      `Center of ${parkId} must resolve cleanly to ${parkId}`,
    );

    const ctx = resolveTourOrPlayContext(meta.centerLat, meta.centerLon, 35);
    assert.equal(ctx.mode, 'tour');
    assert.equal(ctx.tourScope, 'venue');
    assert.equal(ctx.hasCuratedOrCustomTour, true);
    assert.equal(ctx.isDynamicPlaceholder, false);
    assert.equal(ctx.cityId, parkId);
  }

  // Verify Universal Hollywood covers Upper Lot, Studio Backlot Tour & Lower Lot modes
  const ushStops = getLandmarksForCity('ush_hollywood');
  assert.equal(ushStops.length, 11);
  assert.equal(
    buildTourItinerary(ushStops, { tourMode: 'upper_lot', shuffle: false }).length,
    5,
  );
  assert.equal(
    buildTourItinerary(ushStops, { tourMode: 'studio_tour', shuffle: false }).length,
    3,
  );
  assert.equal(
    buildTourItinerary(ushStops, { tourMode: 'lower_lot', shuffle: false }).length,
    3,
  );

  // Verify Tokyo (UTC+9) & Paris (UTC+2) day-cycle solar arcs
  const tokyoSolar = computeDayCycleSolarState({
    dayCycle: METRO_TOUR_METADATA.tdr_disneysea.dayCycle,
    stopIndex: 2,
    totalStops: 10,
    nowDate: new Date('2026-06-21T12:00:00.000Z'),
  });
  assert.ok(Math.abs(tokyoSolar.localHour - 10.8) < 0.01);
  assert.ok(Math.abs(tokyoSolar.utcHour - 1.8) < 0.01);

  const parisSolar = computeDayCycleSolarState({
    dayCycle: METRO_TOUR_METADATA.dlp_disneyland.dayCycle,
    stopIndex: 4,
    totalStops: 11,
    nowDate: new Date('2026-06-21T12:00:00.000Z'),
  });
  assert.ok(Math.abs(parisSolar.localHour - 12.9) < 0.01);
  assert.ok(Math.abs(parisSolar.utcHour - 10.9) < 0.01);

  // Verify Living World EXEMPLAR_LOCALES ambiance stays preserved beneath
  assert.equal(
    classifyLocale({ lat: 33.8121, lon: -117.919 }).typology,
    SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
  );
  assert.ok(EXEMPLAR_LOCALES.universal_backlot);
  assert.ok(EXEMPLAR_LOCALES.disneyland_paris);
  assert.ok(EXEMPLAR_LOCALES.tokyo_disneyland);

  // Verify wanderDrawer optgroup and cityDrawer Park Day pill (never Build: Tour)
  await withHappyDom(async (win) => {
    const wanderEngine = createFakeWanderEngine();
    const engine = createTourAndPlayEngine({ wanderEngine, rng: () => 0.25 });
    const fakeAgentPanel = {
      canBuildTourWithForge: () => true,
      onCapabilitiesChange: () => () => {},
    };
    let depthCb = null;
    const cityDrawer = createCityDrawer({
      tourAndPlayEngine: engine,
      wanderEngine,
      cityEngine: {
        onCityDepth(cb) {
          depthCb = cb;
          return () => {};
        },
      },
      agentForgePanel: fakeAgentPanel,
      container: win.document.body,
    });
    const wanderDrawer = createWanderDrawer({
      tourAndPlayEngine: engine,
      wanderEngine,
      agentForgePanel: fakeAgentPanel,
      container: win.document.body,
    });

    const { buildExperiencesCatalog } = await import(
      '../ui/sovereign/experiencesCatalogAdapter.js'
    );
    const catalogIds = new Set(
      buildExperiencesCatalog({ includeDomiciles: false })
        .filter((e) => e.category === 'theme-parks')
        .map((e) => e.launch?.cityId),
    );
    for (const parkId of ALL_CURATED_THEME_PARK_IDS) {
      assert.ok(
        catalogIds.has(parkId),
        `Experiences catalog missing theme park ${parkId}`,
      );
      const meta = METRO_TOUR_METADATA[parkId];
      const resolved = resolveTourOrPlayContext(meta.centerLat, meta.centerLon);
      assert.equal(resolved.mode, 'tour', `Park ${parkId} must resolve as curated tour`);
      assert.equal(resolved.tourScope, 'venue');
    }

    // Verify Universal Hollywood multi-lot modes in tour engine
    wanderDrawer.open();
    engine.startCityTour({ cityId: 'ush_hollywood' });
    assert.deepEqual(engine.getStatus().supportedModes, [
      'all',
      'upper_lot',
      'studio_tour',
      'lower_lot',
    ]);

    wanderDrawer.destroy();
    cityDrawer.destroy();
    engine.destroy();
  });
});

test('Stage 3 Pillar 2: Hidden Secrets Scavenger Hunt, 30-90m Detour Distances, Day Passport & City Gems', async () => {
  // Check all 13 parks + Paris, Tokyo, Atlanta curated off-route secrets sit 30-90m off stops
  for (const tourId of [...ALL_CURATED_THEME_PARK_IDS, 'paris', 'tokyo', 'atlanta']) {
    const secrets = getHiddenSecretsForTour(tourId, getLandmarksForCity(tourId));
    assert.ok(
      secrets.length >= 5 && secrets.length <= 8,
      `${tourId} should have 5-8 secrets (got ${secrets.length})`,
    );
    const stops = getLandmarksForCity(tourId);
    for (const sec of secrets) {
      const minDist = Math.min(
        ...stops.map((st) =>
          haversineDistanceMeters(sec.lat, sec.lon, st.lat, st.lon),
        ),
      );
      assert.ok(
        minDist >= 30 && minDist <= 90,
        `${tourId}:${sec.id} min distance to nearest stop is ${minDist.toFixed(1)}m (must be 30-90m)`,
      );
    }
  }

  // Fallback dynamic Hidden City Gems on any other city tour (e.g. London)
  const londonGems = getHiddenSecretsForTour(
    'london',
    getLandmarksForCity('london'),
  );
  assert.ok(londonGems.length >= 3 && londonGems[0].kind === 'city_gem');

  await withHappyDom(async (win) => {
    clearDayPassportForTest();
    const viewer = createMockViewer(35.6267, 139.8851);
    const wanderEngine = createFakeWanderEngine();
    const engine = createTourAndPlayEngine({
      wanderEngine,
      viewer,
      rng: () => 0.15,
    });
    const adventures = createParkAdventureController({
      viewer,
      tourAndPlayEngine: engine,
      wanderEngine,
    });
    const wanderDrawer = createWanderDrawer({
      wanderEngine,
      tourAndPlayEngine: engine,
      parkAdventures: adventures,
      viewer,
      container: win.document.body,
    });

    wanderDrawer.open();
    engine.startCityTour({
      cityId: 'tdr_disneysea',
      startStopId: 'tds_aquasphere_harbor',
    });

    const initialState = adventures.getState();
    assert.equal(initialState.cityId, 'tdr_disneysea');
    assert.equal(initialState.secrets.length, 5);
    assert.equal(initialState.passport.collected, 0);

    // Zero Cesium.Label on spawned adventure entities
    const ds = viewer.dataSources._all.find(
      (d) => d.name === 'gev-park-adventures',
    );
    assert.ok(ds, 'gev-park-adventures CustomDataSource added');
    for (const ent of ds.entities.values) {
      assert.equal(ent.label, undefined, 'Strictly zero Cesium.Label on entities');
      assert.ok(ent.billboard, 'Adventure markers must use billboard graphics');
    }

    // Proximity collection within <= 24m
    const firstSecret = initialState.secrets[0];
    const prox = adventures.checkProximityAt(firstSecret.lat, firstSecret.lon);
    assert.equal(prox.collected.length, 1);
    assert.equal(prox.collected[0].id, firstSecret.id);

    // Idempotent duplicate proximity check
    const proxRepeat = adventures.checkProximityAt(firstSecret.lat, firstSecret.lon);
    assert.equal(proxRepeat.collected.length, 0);

    // Verify localStorage persistence + Day Passport UI inside wanderDrawer (zero new dock icons)
    const rawSaved = JSON.parse(win.localStorage.getItem(PASSPORT_STORAGE_KEY));
    assert.deepEqual(rawSaved.collectedByCity.tdr_disneysea, [firstSecret.id]);
    assert.equal(
      getPassportProgress('tdr_disneysea', initialState.secrets).collected,
      1,
    );

    // Verify transferable Hidden City Gems work on Paris city tour
    engine.startCityTour({ cityId: 'paris' });
    const parisState = adventures.getState();
    assert.equal(parisState.cityId, 'paris');
    assert.equal(parisState.secrets.length, 5);
    collectHiddenSecret('paris', parisState.secrets[0]);
    assert.equal(
      getPassportProgress('paris', parisState.secrets).collected,
      1,
    );

    adventures.destroy();
    wanderDrawer.destroy();
    engine.destroy();
    clearDayPassportForTest();
  });
});

test('Stage 3 Pillar 3: Mulberry32 Clue-Giving Park NPCs & Non-Colliding E Key Interaction', async () => {
  // Deterministic Mulberry32 output
  const a1 = createMulberry32(hashStringToSeed('npcs:dlp_disneyland'));
  const a2 = createMulberry32(hashStringToSeed('npcs:dlp_disneyland'));
  assert.deepEqual([a1(), a1(), a1()], [a2(), a2(), a2()]);

  const stops = getLandmarksForCity('dlp_disneyland');
  const secrets = getHiddenSecretsForTour('dlp_disneyland', stops);
  const npcsA = generateParkNpcsForTour('dlp_disneyland', stops, secrets);
  const npcsB = generateParkNpcsForTour('dlp_disneyland', stops, secrets);
  assert.equal(npcsA.length, 4);
  assert.deepEqual(
    npcsA.map((n) => n.name),
    npcsB.map((n) => n.name),
  );
  assert.deepEqual(
    npcsA.map((n) => n.role),
    ['ride_op', 'street_performer', 'food_vendor', 'fellow_fan'],
  );

  const sampleDialog = buildNpcDialogue(npcsA[0], {
    uncollectedSecrets: secrets,
    companionName: 'Scout',
  });
  assert.ok(sampleDialog.clue.includes('Scavenger Clue:'));
  assert.ok(sampleDialog.companionBanter.includes('Scout:'));

  await withHappyDom(async (win) => {
    clearDayPassportForTest();
    const viewer = createMockViewer(48.8722, 2.7758);
    const wanderEngine = createFakeWanderEngine();
    const engine = createTourAndPlayEngine({
      wanderEngine,
      viewer,
      rng: () => 0.1,
    });
    const adventures = createParkAdventureController({
      viewer,
      tourAndPlayEngine: engine,
      wanderEngine,
    });
    const wanderDrawer = createWanderDrawer({
      wanderEngine,
      tourAndPlayEngine: engine,
      parkAdventures: adventures,
      viewer,
      container: win.document.body,
    });

    wanderDrawer.open();
    engine.startCityTour({ cityId: 'dlp_disneyland' });
    const npcList = adventures.getNpcs();
    assert.equal(npcList.length, 4);

    // Move player into FREE_ROAM far from all NPCs -> E key must yield back to yaw turn!
    engine.takeOverAtLandmark();
    adventures.checkProximityAt(48.85, 2.75);
    const farEvt = new win.KeyboardEvent('keydown', {
      key: 'e',
      code: 'KeyE',
      bubbles: true,
      cancelable: true,
    });
    win.dispatchEvent(farEvt);
    assert.equal(adventures.getState().activeDialogue, null);

    // Approach NPC #2 within 45m -> E key triggers clue dialogue cleanly
    adventures.checkProximityAt(npcList[1].lat, npcList[1].lon);
    assert.equal(adventures.getNearestInteractableNpc()?.id, npcList[1].id);
    const nearEvt = new win.KeyboardEvent('keydown', {
      key: 'e',
      code: 'KeyE',
      bubbles: true,
      cancelable: true,
    });
    win.dispatchEvent(nearEvt);
    const afterNear = adventures.getState().activeDialogue;
    assert.equal(afterNear?.npcId, npcList[1].id);
    assert.ok(afterNear?.clue?.includes('Scavenger Clue:'));

    // Non-E hotkeys (C, K, F, T, Alt+H) and input elements never intercepted
    const inputEl = win.document.createElement('input');
    win.document.body.appendChild(inputEl);
    const inputEvt = new win.KeyboardEvent('keydown', {
      key: 'e',
      code: 'KeyE',
      bubbles: true,
      cancelable: true,
    });
    inputEl.dispatchEvent(inputEvt);
    assert.equal(inputEvt.defaultPrevented, false);

    // Interacting directly with NPC #3 triggers dialogue cleanly
    adventures.interactWithNpc(npcList[2].id);
    assert.equal(adventures.getState().activeDialogue?.npcId, npcList[2].id);

    adventures.destroy();
    wanderDrawer.destroy();
    engine.destroy();
  });
});

test('Stage 3 Pillar 4: Bidirectional Resort Park-Hopper Transit Bridges', async () => {
  assert.ok(RESORT_PARK_HOPPER_BRIDGES.length >= 10);
  const mkHops = getParkHopperBridgesForPark('wdw_magic_kingdom');
  assert.equal(mkHops[0].toCityId, 'wdw_epcot');
  assert.equal(mkHops[0].transitLabel, 'Seven Seas Monorail');

  const epcotHops = getParkHopperBridgesForPark('wdw_epcot');
  assert.ok(epcotHops.some((b) => b.toCityId === 'wdw_magic_kingdom'));
  assert.ok(epcotHops.some((b) => b.toCityId === 'wdw_hollywood_studios'));

  const usfHops = getParkHopperBridgesForPark('uor_universal_florida');
  assert.equal(usfHops[0].toCityId, 'uor_islands_of_adventure');
  assert.equal(usfHops[0].transitLabel, 'Hogwarts Express');

  await withHappyDom(async (win) => {
    const wanderEngine = createFakeWanderEngine();
    const engine = createTourAndPlayEngine({ wanderEngine, rng: () => 0.2 });
    const adventures = createParkAdventureController({
      tourAndPlayEngine: engine,
      wanderEngine,
    });
    const wanderDrawer = createWanderDrawer({
      wanderEngine,
      tourAndPlayEngine: engine,
      parkAdventures: adventures,
      container: win.document.body,
    });
    wanderDrawer.open();

    // WDW Magic Kingdom -> EPCOT (Monorail) -> DHS (Skyliner) via wanderDrawer shim
    engine.startCityTour({ cityId: 'wdw_magic_kingdom' });
    assert.equal(
      wanderDrawer.launchHopperBridge({ targetCityId: 'wdw_epcot' }),
      true,
    );

    let st = engine.getStatus();
    assert.equal(st.cityId, 'wdw_epcot');
    assert.equal(st.currentLandmark.id, 'epcot_spaceship_earth');

    assert.equal(
      wanderDrawer.launchHopperBridge({
        targetCityId: 'wdw_hollywood_studios',
      }),
      true,
    );

    st = engine.getStatus();
    assert.equal(st.cityId, 'wdw_hollywood_studios');
    assert.equal(st.currentLandmark.id, 'dhs_hollywood_boulevard');

    // Universal Florida <-> Islands of Adventure (Hogwarts Express)
    engine.startCityTour({ cityId: 'uor_universal_florida' });
    const hogRes = engine.hopToLinkedPark('uor_islands_of_adventure');
    assert.equal(hogRes.ok, true);
    assert.equal(engine.getStatus().cityId, 'uor_islands_of_adventure');
    assert.equal(
      engine.getStatus().currentLandmark.id,
      'ioa_hogsmeade_station',
    );
    const backRes = engine.hopToLinkedPark('uor_universal_florida');
    assert.equal(backRes.ok, true);
    assert.equal(engine.getStatus().cityId, 'uor_universal_florida');
    assert.equal(engine.getStatus().currentLandmark.id, 'usf_kings_cross');

    // Tokyo Disneyland <-> Tokyo DisneySea (Disney Resort Line)
    engine.startCityTour({ cityId: 'tdr_disneyland' });
    const tdrHop = engine.hopToLinkedPark('tdr_disneysea');
    assert.equal(tdrHop.ok, true);
    assert.equal(engine.getStatus().cityId, 'tdr_disneysea');
    assert.equal(
      engine.getStatus().currentLandmark.id,
      'tds_aquasphere_harbor',
    );

    adventures.destroy();
    wanderDrawer.destroy();
    engine.destroy();
  });
});

test('Stage 3 Pillar 5: Dusk Fireworks Finale Auto-Trigger, Particle Pool & Deterministic Teardown', async () => {
  const viewer = createMockViewer(28.4194, -81.5812);
  const wanderEngine = createFakeWanderEngine();
  const mockAudio = createMockAudioContext();
  const engine = createTourAndPlayEngine({
    wanderEngine,
    viewer,
    rng: () => 0.1,
  });
  const fireworks = createParkFireworksFinale({
    viewer,
    tourAndPlayEngine: engine,
    audioContext: mockAudio,
  });

  // Launch Magic Kingdom and advance to the final evening stop
  const st0 = engine.startCityTour({ cityId: 'wdw_magic_kingdom' });
  assert.equal(fireworks.isActive(), false);
  for (let i = 0; i < st0.landmarks.length - 1; i += 1) {
    engine.continueTour({ advanceToNext: true });
  }
  const finalStatus = engine.getStatus();
  assert.equal(finalStatus.isFinalEveningStop, true);
  assert.equal(
    fireworks.isActive(),
    true,
    'Dusk Fireworks must auto-trigger on final evening stop',
  );
  assert.equal(viewer.scene.primitives._all.length, 1);
  assert.equal(
    viewer.scene.primitives._all[0].length,
    FIREWORKS_PARTICLE_POOL_SIZE,
  );
  assert.ok(
    mockAudio.createdNodes.length > 0,
    'Procedural Web Audio firework nodes synthesized',
  );

  // Step particle physics cleanly
  fireworks._stepForTest(0.016);
  fireworks._stepForTest(0.05);
  assert.ok(fireworks.getState().shellCounter >= 1);

  // Park switch tears down current fireworks cleanly
  engine.startCityTour({ cityId: 'wdw_animal_kingdom' });
  assert.equal(fireworks.isActive(), false);
  assert.equal(viewer.scene.primitives._all.length, 0);
  assert.equal(fireworks.getState().activeAudioNodeCount, 0);
  assert.equal(fireworks.getState().pendingTimerCount, 0);

  // Manual start followed by engine.stop() tears down deterministically
  fireworks.start({ cityId: 'wdw_animal_kingdom' });
  assert.equal(fireworks.isActive(), true);
  assert.equal(viewer.scene.primitives._all.length, 1);
  engine.stop();
  assert.equal(fireworks.isActive(), false);
  assert.equal(viewer.scene.primitives._all.length, 0);
  assert.equal(fireworks.getState().pendingTimerCount, 0);
  assert.ok(
    mockAudio.createdNodes.every((n) => n.disconnected === true),
    'All created Web Audio nodes must disconnect on stop()',
  );

  fireworks.destroy();
  engine.destroy();
});
