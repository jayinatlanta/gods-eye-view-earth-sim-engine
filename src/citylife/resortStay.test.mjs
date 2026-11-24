import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESORT_STAY_LANDMARKS,
  RESORT_STAY_METADATA,
  RESORT_EXCURSION_BRIDGES,
  RESORT_HIDDEN_SECRETS_CATALOG,
  ALL_CURATED_RESORT_STAY_IDS,
  isResortStayId,
  getExcursionBridgesForResort,
  getEveningAnchorForResort,
} from '../layers/citylife/resortStayCatalog.js';
import {
  METRO_LANDMARK_CATALOG,
  METRO_TOUR_METADATA,
  TOUR_WALK_MIDWAY_SPEED_MPS,
  TOUR_RESORT_CART_SPEED_MPS,
  TOUR_SCOOTER_SPEED_MPS,
  resolveTourOrPlayContext,
  buildTourItinerary,
  createTourAndPlayEngine,
  normalizeMetroTourCityKey,
  ALL_CURATED_THEME_PARK_IDS,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  RESORT_NPC_ROLES,
  getHiddenSecretsForTour,
  generateParkNpcsForTour,
  createParkAdventureController,
  clearDayPassportForTest,
} from '../layers/citylife/parkSecretsAndNpcs.js';
import {
  EVENING_AMBIANCE_MODES,
  createParkFireworksFinale,
} from '../layers/citylife/parkFireworksFinale.js';
import {
  DOMICILE_TYPOLOGIES,
  claimDomicileAtLocation,
  getAllDomiciles,
  clearClaimedDomicilesForTest,
  checkInTempBasecamp,
  getTempBasecamp,
  checkOutTempBasecamp,
  clearTempBasecampForTest,
} from '../layers/estates/domicileCatalog.js';
import { LIVING_CITIES } from './cityWaypoints.js';

function createMockWanderEngine() {
  const calls = {
    started: [],
    relocated: [],
    bubbles: [],
    stopped: 0,
  };
  let telemetryCoord = { lat: 28.4046, lon: -81.4628, height: 28, heading: 90 };
  return {
    calls,
    isWandering: false,
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    startWandering(opts) {
      this.isWandering = true;
      calls.started.push(opts);
      if (opts && Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
        telemetryCoord = {
          lat: opts.lat,
          lon: opts.lon,
          height: opts.elev || 28,
          heading: opts.heading || 90,
        };
      }
    },
    relocateTo(opts) {
      calls.relocated.push(opts);
      if (opts && Number.isFinite(opts.lat) && Number.isFinite(opts.lon)) {
        telemetryCoord = {
          lat: opts.lat,
          lon: opts.lon,
          height: opts.elev || 28,
          heading: opts.heading || 90,
        };
      }
    },
    stopWandering() {
      this.isWandering = false;
      calls.stopped += 1;
    },
    showDialogBubble(spec) {
      calls.bubbles.push(spec);
    },
    getTelemetry() {
      return { coordinates: { ...telemetryCoord } };
    },
    getCameraMode() {
      return 'iso_chase';
    },
    getUserAvatar() {
      return { isDestroyed: false };
    },
  };
}

test('All 7 curated Resort Stays register cleanly on Tour v2 without polluting Theme Park Days or LIVING_CITIES', () => {
  const expectedIds = [
    'orlando_marriott_grande_vista',
    'orlando_star_island',
    'atl_evergreen_stone_mountain',
    'phoenix_jw_desert_ridge',
    'savannah_westin_harbor',
    'honolulu_royal_hawaiian',
    'singapore_marina_bay_sands',
  ];
  assert.deepEqual(ALL_CURATED_RESORT_STAY_IDS, expectedIds);

  for (const resortId of expectedIds) {
    assert.equal(isResortStayId(resortId), true);
    assert.equal(
      ALL_CURATED_THEME_PARK_IDS.includes(resortId),
      false,
      `${resortId} must not pollute Theme Park Days`,
    );
    assert.equal(
      Boolean(LIVING_CITIES[resortId]),
      false,
      `${resortId} must not pollute LIVING_CITIES`,
    );

    const meta = METRO_TOUR_METADATA[resortId];
    const stops = METRO_LANDMARK_CATALOG[resortId];
    assert.ok(meta, `Metadata present for ${resortId}`);
    assert.equal(meta.tourScope, 'venue');
    assert.equal(meta.venueCategory, 'resort_stay');
    assert.equal(meta.dayCycleEnabled, true);
    assert.deepEqual(meta.supportedTransitModes, [
      'walk_midway',
      'scooter',
      'resort_cart',
    ]);
    assert.ok(Array.isArray(stops) && stops.length >= 8);
    assert.equal(
      stops.some((s) => s.isEveningCapstone === true),
      true,
      `${resortId} must include an evening capstone stop`,
    );

    for (const stop of stops) {
      assert.ok(stop.id && stop.name);
      assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
      assert.ok(stop.wikiTitle, `wikiTitle required on ${stop.id}`);
      assert.ok(
        stop.youtubeSearchQuery,
        `youtubeSearchQuery required on ${stop.id}`,
      );
      assert.ok(stop.lore && stop.lore.length >= 12);
      assert.ok(stop.companionNote && stop.companionNote.length >= 8);
    }

    const secrets = RESORT_HIDDEN_SECRETS_CATALOG[resortId];
    assert.equal(secrets.length, 5, `${resortId} must have 5 hidden secrets`);
  }

  assert.equal(
    normalizeMetroTourCityKey('grande_vista'),
    'orlando_marriott_grande_vista',
  );
  assert.equal(
    normalizeMetroTourCityKey('evergreen_stone_mountain'),
    'atl_evergreen_stone_mountain',
  );
  assert.equal(
    normalizeMetroTourCityKey('desert_ridge'),
    'phoenix_jw_desert_ridge',
  );
  assert.equal(
    normalizeMetroTourCityKey('marina_bay_sands'),
    'singapore_marina_bay_sands',
  );

  // Verify Orlando Lake Cecile resort includes the Lakeside Foliage Nature Trail & Helipad at real-world coords
  const lakeCecileMeta = METRO_TOUR_METADATA.orlando_star_island;
  assert.ok(Math.abs(lakeCecileMeta.centerLat - 28.328606) < 0.001);
  assert.ok(Math.abs(lakeCecileMeta.centerLon - -81.484887) < 0.001);
  const lakeCecileStops = METRO_LANDMARK_CATALOG.orlando_star_island;
  const natureTrail = lakeCecileStops.find(
    (s) => s.id === 'si_lakeside_nature_trail',
  );
  assert.ok(natureTrail, 'Lake Cecile resort must include lakeside foliage nature trail');
  assert.match(natureTrail.name, /Nature Trail/i);
  assert.match(natureTrail.lore, /foliage/i);
  const resortHelipad = lakeCecileStops.find(
    (s) => s.id === 'si_resort_helipad',
  );
  assert.ok(resortHelipad, 'Lake Cecile resort must include helipad amenity');
  assert.match(resortHelipad.name, /Helipad/i);
});

test('resolveTourOrPlayContext prioritizes Resort Stays with Resort Day label ahead of metro/Play', () => {
  const gvCtx = resolveTourOrPlayContext(28.4046, -81.4628, 28);
  assert.equal(gvCtx.mode, 'tour');
  assert.equal(gvCtx.cityId, 'orlando_marriott_grande_vista');
  assert.equal(gvCtx.tourScope, 'venue');
  assert.equal(gvCtx.venueCategory, 'resort_stay');
  assert.match(gvCtx.actionButtonLabel, /^🏨 Resort Day:/);

  const mbsCtx = resolveTourOrPlayContext(1.2834, 103.8607, 10);
  assert.equal(mbsCtx.cityId, 'singapore_marina_bay_sands');
  assert.equal(mbsCtx.venueCategory, 'resort_stay');
  assert.match(mbsCtx.actionButtonLabel, /^🏨 Resort Day: Marina Bay Sands/);

  // Westin Savannah Harbor resolves on Hutchinson Island while Downtown Savannah across the river remains separate
  const westinCtx = resolveTourOrPlayContext(32.0839, -81.0887, 5);
  assert.equal(westinCtx.cityId, 'savannah_westin_harbor');
  assert.equal(westinCtx.venueCategory, 'resort_stay');
  const downtownSavannahCtx = resolveTourOrPlayContext(32.0809, -81.0912, 8);
  assert.equal(downtownSavannahCtx.hasCuratedOrCustomTour, false);

  // Theme Park Days retain Park Day label untouched
  const mkCtx = resolveTourOrPlayContext(28.4187, -81.5818, 32);
  assert.equal(mkCtx.cityId, 'wdw_magic_kingdom');
  assert.equal(mkCtx.venueCategory, 'theme_park');
  assert.match(mkCtx.actionButtonLabel, /^🎢 Park Day:/);
});

test('Resort Day Off itinerary keeps evening fire pit capstone last and supports Walk, E-Scooter, and Golf Cart transit', () => {
  const itinerary = buildTourItinerary(
    RESORT_STAY_LANDMARKS.phoenix_jw_desert_ridge,
    { rng: () => 0.42, shuffle: true },
  );
  assert.equal(itinerary[0].dayChapter, 'morning_arrival');
  assert.equal(itinerary[itinerary.length - 1].isEveningCapstone, true);

  const wander = createMockWanderEngine();
  const engine = createTourAndPlayEngine({
    wanderEngine: wander,
    rng: () => 0.5,
  });

  // Start directly at a golf stop — default walk_midway auto-engages Resort Golf Cart (5.5 m/s)!
  const golfStatus = engine.startCityTour({
    cityId: 'phoenix_jw_desert_ridge',
    startStopId: 'jwdr_wildfire_golf',
  });
  assert.equal(golfStatus.venueCategory, 'resort_stay');
  assert.equal(golfStatus.effectiveTransitMode, 'resort_cart');
  assert.equal(golfStatus.scooterSpeedMps, TOUR_RESORT_CART_SPEED_MPS);

  // Switch live to E-Scooter (6.7 m/s)
  const scooterStatus = engine.setTransitMode('scooter');
  assert.equal(scooterStatus.effectiveTransitMode, 'scooter');
  assert.equal(scooterStatus.scooterSpeedMps, TOUR_SCOOTER_SPEED_MPS);

  // Pin Walk (3.2 m/s) even on a golf stop when explicitly selected
  const walkStatus = engine.setTransitMode('walk_midway');
  assert.equal(walkStatus.effectiveTransitMode, 'walk_midway');
  assert.equal(walkStatus.scooterSpeedMps, TOUR_WALK_MIDWAY_SPEED_MPS);

  // Restore auto mode -> golf stop resumes Golf Cart automatically
  const autoStatus = engine.setTransitMode('auto');
  assert.equal(autoStatus.effectiveTransitMode, 'resort_cart');

  // Non-golf stop uses walk_midway by default
  const lobbyStatus = engine.startCityTour({
    cityId: 'phoenix_jw_desert_ridge',
    startStopId: 'jwdr_lobby_twenty6',
  });
  assert.equal(lobbyStatus.effectiveTransitMode, 'walk_midway');
  assert.equal(lobbyStatus.scooterSpeedMps, TOUR_WALK_MIDWAY_SPEED_MPS);

  engine.destroy();
});

test('Resort Hidden Secrets and Mulberry32 Resort NPCs (concierge, poolside_server, golf_pro, fellow_guest) activate cleanly', () => {
  clearDayPassportForTest();
  const secrets = getHiddenSecretsForTour(
    'atl_evergreen_stone_mountain',
    RESORT_STAY_LANDMARKS.atl_evergreen_stone_mountain,
  );
  assert.equal(secrets.length, 5);

  const npcs = generateParkNpcsForTour(
    'atl_evergreen_stone_mountain',
    RESORT_STAY_LANDMARKS.atl_evergreen_stone_mountain,
    secrets,
    { venueCategory: 'resort_stay' },
  );
  assert.equal(npcs.length, RESORT_NPC_ROLES.length);
  assert.deepEqual(
    npcs.map((n) => n.role),
    ['concierge', 'poolside_server', 'golf_pro', 'fellow_guest'],
  );

  const wander = createMockWanderEngine();
  const engine = createTourAndPlayEngine({ wanderEngine: wander });
  const controller = createParkAdventureController({
    tourAndPlayEngine: engine,
    wanderEngine: wander,
  });

  engine.startCityTour({ cityId: 'atl_evergreen_stone_mountain' });
  const state = controller.getState();
  assert.equal(state.secrets.length, 5);
  assert.equal(state.npcs.length, 4);
  assert.equal(state.npcs[0].role, 'concierge');

  const collected = controller.collectSecretById(state.secrets[0].id);
  assert.equal(collected.ok, true);
  assert.equal(collected.newlyCollected, true);
  assert.equal(collected.progress.collected, 1);

  const chat = controller.interactWithNpc(state.npcs[2].id);
  assert.equal(chat.ok, true);
  assert.equal(chat.npc.role, 'golf_pro');

  controller.destroy();
  engine.destroy();
  clearDayPassportForTest();
});

test('Evening ambiance defaults to Lakeside Fire Pit Lounge on Resort Stays and supports optional Nearby Fireworks View', () => {
  const wander = createMockWanderEngine();
  const engine = createTourAndPlayEngine({
    wanderEngine: wander,
    rng: () => 0.3,
  });
  const finale = createParkFireworksFinale({ tourAndPlayEngine: engine });

  // Jump straight to Evergreen's evening fire pit capstone
  const evgStatus = engine.startCityTour({
    cityId: 'atl_evergreen_stone_mountain',
    startStopId: 'evg_evening_fire_pit',
  });
  assert.equal(evgStatus.isFinalEveningStop, true);

  const fpState = finale.getState();
  assert.equal(fpState.active, true);
  assert.equal(fpState.mode, EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE);
  assert.equal(fpState.isFirePitActive, true);
  assert.equal(fpState.isFireworksActive, false);

  // Step the ember particle loop without throwing
  finale._stepForTest(0.05);

  // Toggle optional Nearby Fireworks View (Stone Mountain Laser & Fireworks)
  const fwState = finale.toggleFireworks();
  assert.equal(fwState.active, true);
  assert.equal(fwState.mode, EVENING_AMBIANCE_MODES.FIREWORKS);
  assert.equal(fwState.isFireworksActive, true);
  assert.match(fwState.anchor.iconName, /Stone Mountain/i);

  // Stopping tour tears down evening ambiance deterministically
  engine.stop();
  const stoppedState = finale.getState();
  assert.equal(stoppedState.active, false);
  assert.equal(stoppedState.activeAudioNodeCount, 0);
  assert.equal(stoppedState.pendingTimerCount, 0);

  // Verify Desert Ridge has evening fire pit anchor and null nearbyFireworks
  const drAnchor = getEveningAnchorForResort('phoenix_jw_desert_ridge');
  assert.ok(drAnchor.iconName.includes('Sonoran'));
  assert.equal(drAnchor.nearbyFireworks, null);

  finale.destroy();
  engine.destroy();
});

test('Resort Excursion Bridges launch linked Theme Park Days, City Tours, and Scenic Drive Excursions', () => {
  const wander = createMockWanderEngine();
  const engine = createTourAndPlayEngine({ wanderEngine: wander });

  // 1. Tour hop from Orlando Grande Vista -> Magic Kingdom
  engine.startCityTour({ cityId: 'orlando_marriott_grande_vista' });
  const gvBridges = getExcursionBridgesForResort(
    'orlando_marriott_grande_vista',
  );
  assert.ok(gvBridges.length >= 4);
  const hopRes = engine.hopToLinkedPark('wdw_magic_kingdom');
  assert.equal(hopRes.ok, true);
  assert.equal(hopRes.status.cityId, 'wdw_magic_kingdom');
  assert.equal(hopRes.status.venueCategory, 'theme_park');

  // 2. Tour hop from Marina Bay Sands -> Singapore City Tour
  engine.startCityTour({ cityId: 'singapore_marina_bay_sands' });
  const sgHop = engine.hopToLinkedPark('singapore');
  assert.equal(sgHop.ok, true);
  assert.equal(sgHop.status.cityId, 'singapore');

  // 3. Scenic Ferry/Drive excursion from Westin Savannah Harbor -> Historic River Street
  engine.startCityTour({ cityId: 'savannah_westin_harbor' });
  const ferryExcursion = engine.hopToLinkedPark(null, {
    bridgeId: 'swh_ferry_river_street',
  });
  assert.equal(ferryExcursion.ok, true);
  assert.equal(ferryExcursion.excursion, true);
  const lastReloc = wander.calls.relocated[wander.calls.relocated.length - 1];
  assert.ok(Math.abs(lastReloc.lat - 32.0811) < 0.001);
  assert.ok(Math.abs(lastReloc.lon - -81.0912) < 0.001);

  assert.ok(RESORT_EXCURSION_BRIDGES.length >= 15);
  engine.destroy();
});

test('1-click Temporary Resort Basecamp Check-In is strictly non-destructive to claimed permanent domiciles', () => {
  clearClaimedDomicilesForTest({ includeStarter: false });
  clearTempBasecampForTest();

  // Claim a neutral public civic domicile first
  const claimed = claimDomicileAtLocation({
    lat: 30.2672,
    lon: -97.7431,
    typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
    title: 'Austin Civic Test Residence',
    localityLabel: 'Austin, TX',
    source: 'test',
  });
  assert.equal(getAllDomiciles().length, 1);
  assert.equal(getTempBasecamp(), null);

  // Check into Marriott's Grande Vista as Temp Basecamp
  const checkedIn = checkInTempBasecamp(
    RESORT_STAY_METADATA.orlando_marriott_grande_vista,
  );
  assert.ok(checkedIn);
  assert.equal(checkedIn.isTempBasecamp, true);
  assert.equal(checkedIn.resortId, 'orlando_marriott_grande_vista');
  assert.ok(checkedIn.frontDoorPoint && checkedIn.drivewayPoint);

  // Permanent claimed estates remain 100% untouched
  const permanentAfterCheckIn = getAllDomiciles();
  assert.equal(permanentAfterCheckIn.length, 1);
  assert.equal(permanentAfterCheckIn[0].id, claimed.id);

  // Check out removes temp basecamp while preserving permanent domicile
  assert.equal(checkOutTempBasecamp(), true);
  assert.equal(getTempBasecamp(), null);
  assert.equal(getAllDomiciles().length, 1);
  assert.equal(getAllDomiciles()[0].id, claimed.id);

  clearClaimedDomicilesForTest({ includeStarter: true });
  clearTempBasecampForTest();
});

test('orlando_star_island stops expose unique official gallery imageUrls and zero lighthouse city fallbacks', () => {
  const stops = RESORT_STAY_LANDMARKS.orlando_star_island;
  assert.equal(stops.length, 9);
  const seenUrls = new Set();
  for (const stop of stops) {
    assert.ok(stop.imageUrl, `Expected curated official imageUrl on ${stop.id}`);
    assert.match(
      stop.imageUrl,
      /^https:\/\/www\.star-island\.com\/files\/4607\/.+\.(?:jpg|jpeg|png|webp)$/i,
    );
    assert.equal(
      seenUrls.has(stop.imageUrl),
      false,
      `Duplicate imageUrl ${stop.imageUrl} on ${stop.id}`,
    );
    seenUrls.add(stop.imageUrl);
    assert.notEqual(
      stop.wikiTitle,
      'Kissimmee,_Florida',
      `Must not use Kissimmee city lighthouse fallback on ${stop.id}`,
    );
  }
});
