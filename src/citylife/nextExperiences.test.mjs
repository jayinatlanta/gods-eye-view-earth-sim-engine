import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_NEXT_EXPERIENCE_IDS,
  NEXT_EXPERIENCE_LANDMARKS,
  NEXT_EXPERIENCE_METADATA,
  NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG,
  NEXT_EXPERIENCE_BRIDGES,
  NEXT_EXPERIENCE_EVENING_ANCHORS,
  isNextExperienceId,
  getNextExperienceBridgesForVenue,
} from '../layers/citylife/nextExperiencesCatalog.js';
import {
  METRO_LANDMARK_CATALOG,
  METRO_TOUR_METADATA,
  TOUR_AERIAL_TRAM_SPEED_MPS,
  TOUR_LAZY_RIVER_TUBE_SPEED_MPS,
  buildTourItinerary,
  createTourAndPlayEngine,
  getExcursionBridgesForResort,
  getParkHopperBridgesForPark,
  normalizeTourV2Metadata,
  resolveTourOrPlayContext,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  getHiddenSecretsForTour,
  generateParkNpcsForTour,
} from '../layers/citylife/parkSecretsAndNpcs.js';
import {
  EVENING_AMBIANCE_MODES,
  createParkFireworksFinale,
} from '../layers/citylife/parkFireworksFinale.js';
import {
  LAS_VEGAS_MONORAIL_LINE,
  WDW_SKYLINER_EPCOT_TO_DHS,
  OBER_AERIAL_TRAM_ASCENT,
  RAIL_CORRIDORS,
} from '../transit/railWaypoints.js';
import {
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
} from '../layers/citylife/metroNetworkCatalog.js';
import { createRailwayEngine } from '../layers/transit/railwayEngine.js';
import { fetchSightseeingFromWikipedia } from '../../server/providers/discovery/sightseeing.js';

function createMockWanderEngine() {
  let state = {
    lat: 34.7015,
    lon: -83.7316,
    elev: 441,
    heading: 0,
    isWandering: false,
  };
  return {
    startWandering(opts = {}) {
      state = { ...state, ...opts, isWandering: true };
    },
    relocateTo(opts = {}) {
      state = { ...state, ...opts };
    },
    stopWandering() {
      state.isWandering = false;
    },
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    showDialogBubble() {},
    getState: () => ({ ...state }),
    getPosition: () => ({ lat: state.lat, lon: state.lon, elev: state.elev }),
    isWandering: () => state.isWandering,
    isCompanionActive: () => true,
  };
}

test('Destination experiences catalog ships all 7 curated Next Experiences & Georgia State Parks with verified stops and secrets', () => {
  assert.deepEqual(ALL_NEXT_EXPERIENCE_IDS, [
    'wdw_blizzard_beach',
    'ober_mountain',
    'alpine_helen',
    'unicoi_state_park',
    'fort_yargo_state_park',
    'atlantic_city',
    'las_vegas',
  ]);

  for (const id of ALL_NEXT_EXPERIENCE_IDS) {
    assert.equal(isNextExperienceId(id), true, `${id} recognized`);
    const meta = METRO_TOUR_METADATA[id];
    assert.ok(meta, `${id} registered in METRO_TOUR_METADATA`);
    assert.equal(meta.tourScope, 'venue');
    const normalized = normalizeTourV2Metadata(meta, id);
    assert.equal(
      normalized.venueCategory,
      meta.venueCategory,
      `${id} preserves venueCategory`,
    );

    const stops = METRO_LANDMARK_CATALOG[id];
    assert.ok(
      Array.isArray(stops) && stops.length >= 8,
      `${id} has at least 8 stops`,
    );
    for (const stop of stops) {
      assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
      assert.ok(stop.wikiTitle, `${id}:${stop.id} has wikiTitle`);
      assert.ok(
        stop.youtubeSearchQuery,
        `${id}:${stop.id} has youtubeSearchQuery`,
      );
      assert.ok(stop.lore && stop.companionNote);
    }

    const secrets = getHiddenSecretsForTour(id, stops);
    assert.equal(secrets.length, 5, `${id} has 5 curated hidden secrets`);
    assert.ok(NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG[id]);
    assert.ok(NEXT_EXPERIENCE_EVENING_ANCHORS[id]);
  }
});

test('Alpine Helen includes Uhuburg Castle, Chattahoochee Tubing, Helen-to-Hardman Heritage Trail, Hardman Farm & Nacoochee Mound', () => {
  const helenStops = NEXT_EXPERIENCE_LANDMARKS.alpine_helen;
  const ids = helenStops.map((s) => s.id);
  assert.ok(ids.includes('helen_chattahoochee_tubing'));
  assert.ok(ids.includes('helen_uhuburg_castle'));
  assert.ok(ids.includes('helen_georgia_mountain_coaster'));
  assert.ok(ids.includes('helen_fun_factory'));
  assert.ok(ids.includes('helen_hardman_heritage_trail'));
  assert.ok(ids.includes('helen_hardman_farm'));
  assert.ok(ids.includes('helen_nacoochee_mound'));

  const uhuburg = helenStops.find((s) => s.id === 'helen_uhuburg_castle');
  assert.ok(Math.abs(uhuburg.lat - 34.70873) < 0.002);
  assert.ok(Math.abs(uhuburg.lon - -83.74515) < 0.002);
});

test('Unicoi State Park and Fort Yargo State Park cover signature outdoor variety and bidirectional Georgia bridges', () => {
  const unicoiIds = NEXT_EXPERIENCE_LANDMARKS.unicoi_state_park.map(
    (s) => s.id,
  );
  assert.ok(unicoiIds.includes('unicoi_lake_beach'));
  assert.ok(unicoiIds.includes('unicoi_screaming_eagle_zipline'));
  assert.ok(unicoiIds.includes('unicoi_archery_airgun_range'));
  assert.ok(unicoiIds.includes('unicoi_barrel_cabins_glamping'));
  assert.ok(unicoiIds.includes('unicoi_anna_ruby_falls'));

  const yargoIds = NEXT_EXPERIENCE_LANDMARKS.fort_yargo_state_park.map(
    (s) => s.id,
  );
  assert.ok(yargoIds.includes('fy_1792_log_fort'));
  assert.ok(yargoIds.includes('fy_marbury_lake_beach'));
  assert.ok(yargoIds.includes('fy_yurt_village'));
  assert.ok(yargoIds.includes('fy_disc_golf_course'));
  assert.ok(yargoIds.includes('fy_mtb_yellow_trailhead'));

  const evgBridges = getExcursionBridgesForResort(
    'atl_evergreen_stone_mountain',
  );
  assert.ok(evgBridges.some((b) => b.toCityId === 'fort_yargo_state_park'));
  assert.ok(evgBridges.some((b) => b.toCityId === 'alpine_helen'));

  const mgvBridges = getExcursionBridgesForResort(
    'orlando_marriott_grande_vista',
  );
  assert.ok(mgvBridges.some((b) => b.toCityId === 'wdw_blizzard_beach'));
  const siBridges = getExcursionBridgesForResort('orlando_star_island');
  assert.ok(siBridges.some((b) => b.toCityId === 'wdw_blizzard_beach'));
});

test('Sequential itinerary policy preserves Ober Mountain tram ascent order and Las Vegas supports Strip + Fremont dual zones', () => {
  const oberOrder = buildTourItinerary(NEXT_EXPERIENCE_LANDMARKS.ober_mountain, {
    itineraryPolicy: 'sequential',
    shuffle: true,
  });
  assert.equal(oberOrder[0].id, 'ober_parkway_tram_terminal');
  assert.equal(oberOrder[1].id, 'ober_aerial_tram_span');
  assert.equal(oberOrder[2].id, 'ober_upper_tram_and_ice_arena');

  const vegasAll = buildTourItinerary(NEXT_EXPERIENCE_LANDMARKS.las_vegas, {
    itineraryPolicy: 'las_vegas_dual_zone',
    tourMode: 'all',
  });
  assert.equal(vegasAll[0].id, 'lv_welcome_sign');
  assert.equal(vegasAll.at(-1).id, 'lv_neon_museum_arts_district');

  const vegasStripOnly = buildTourItinerary(
    NEXT_EXPERIENCE_LANDMARKS.las_vegas,
    {
      itineraryPolicy: 'las_vegas_dual_zone',
      tourMode: 'the_strip',
    },
  );
  assert.equal(vegasStripOnly.length, 7);
  assert.ok(vegasStripOnly.every((s) => s.showcaseZone === 'the_strip'));

  const vegasFremontOnly = buildTourItinerary(
    NEXT_EXPERIENCE_LANDMARKS.las_vegas,
    {
      itineraryPolicy: 'las_vegas_dual_zone',
      tourMode: 'fremont_downtown',
    },
  );
  assert.equal(vegasFremontOnly.length, 3);
  assert.ok(
    vegasFremontOnly.every((s) => s.showcaseZone === 'fremont_downtown'),
  );
});

test('Tour engine auto-engages aerial_tram and lazy_river_tube per stop and resolves venue geofences', () => {
  assert.ok(TOUR_AERIAL_TRAM_SPEED_MPS > 5.0);
  assert.ok(TOUR_LAZY_RIVER_TUBE_SPEED_MPS > 1.5);

  const engine = createTourAndPlayEngine({
    wanderEngine: createMockWanderEngine(),
  });

  const bbStart = engine.startCityTour({
    cityId: 'wdw_blizzard_beach',
    startStopId: 'bb_cross_country_creek',
  });
  assert.equal(bbStart.cityId, 'wdw_blizzard_beach');
  assert.equal(bbStart.venueCategory, 'water_park');
  assert.equal(bbStart.transitMode, 'lazy_river_tube');

  const chairlift = engine.startCityTour({
    cityId: 'wdw_blizzard_beach',
    startStopId: 'bb_mount_gushmore_chairlift',
  });
  assert.equal(chairlift.transitMode, 'aerial_tram');

  const fyCtx = resolveTourOrPlayContext(33.969621, -83.729612, 274);
  assert.equal(fyCtx.cityId, 'fort_yargo_state_park');
  assert.equal(fyCtx.venueCategory, 'state_park');

  const acCtx = resolveTourOrPlayContext(39.3575, -74.419, 8);
  assert.equal(acCtx.cityId, 'atlantic_city');
  assert.equal(acCtx.venueCategory, 'boardwalk_strip');

  engine.destroy();
});

test('Themed Mulberry32 NPC pools and evening ambiance defaults adapt to Water Park, State Park, and Boardwalk/Strip venues', () => {
  const bbNpcs = generateParkNpcsForTour(
    'wdw_blizzard_beach',
    NEXT_EXPERIENCE_LANDMARKS.wdw_blizzard_beach,
    NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG.wdw_blizzard_beach,
  );
  assert.equal(bbNpcs.length, 4);
  assert.ok(bbNpcs.some((n) => n.role === 'lifeguard'));

  const yargoNpcs = generateParkNpcsForTour(
    'fort_yargo_state_park',
    NEXT_EXPERIENCE_LANDMARKS.fort_yargo_state_park,
    NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG.fort_yargo_state_park,
  );
  assert.equal(yargoNpcs.length, 4);
  assert.ok(yargoNpcs.some((n) => n.role === 'park_ranger'));

  const vegasNpcs = generateParkNpcsForTour(
    'las_vegas',
    NEXT_EXPERIENCE_LANDMARKS.las_vegas,
    NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG.las_vegas,
  );
  assert.equal(vegasNpcs.length, 4);
  assert.ok(vegasNpcs.some((n) => n.role === 'boardwalk_historian'));

  const finale = createParkFireworksFinale();
  const yargoEvening = finale.start({ cityId: 'fort_yargo_state_park' });
  assert.equal(yargoEvening.mode, EVENING_AMBIANCE_MODES.FIRE_PIT_LOUNGE);
  finale.stop();

  const vegasEvening = finale.start({ cityId: 'las_vegas' });
  assert.equal(vegasEvening.mode, EVENING_AMBIANCE_MODES.FIREWORKS);
  finale.destroy();
});

test('3D Rideable Las Vegas Monorail, Disney Skyliner, and Ober Mountain Aerial Tramway wire across corridors, metro catalog, and bridges', async () => {
  assert.ok(LAS_VEGAS_MONORAIL_LINE.length >= 7);
  assert.ok(WDW_SKYLINER_EPCOT_TO_DHS.length >= 5);
  assert.ok(OBER_AERIAL_TRAM_ASCENT.length >= 5);

  assert.equal(
    RAIL_CORRIDORS.las_vegas_monorail.trackProfiles.lv_monorail_mgm_to_sahara
      .vehicleMode,
    'monorail',
  );
  assert.equal(
    RAIL_CORRIDORS.wdw_skyliner.trackProfiles.epcot_to_dhs_gondola.vehicleMode,
    'aerial_tram',
  );
  assert.equal(
    RAIL_CORRIDORS.ober_aerial_tram.trackProfiles.ober_parkway_to_summit
      .vehicleMode,
    'aerial_tram',
  );

  assert.deepEqual(METRO_NETWORKS_BY_CITY.las_vegas_monorail, [
    'las_vegas_monorail_line',
  ]);
  assert.deepEqual(METRO_NETWORKS_BY_CITY.wdw_skyliner, ['wdw_skyliner_line']);
  assert.deepEqual(METRO_NETWORKS_BY_CITY.ober_aerial_tram, [
    'ober_aerial_tram_line',
  ]);
  assert.ok(RAPID_TRANSIT_ROUTES.las_vegas_monorail_line);
  assert.ok(RAPID_TRANSIT_ROUTES.wdw_skyliner_line);
  assert.ok(RAPID_TRANSIT_ROUTES.ober_aerial_tram_line);

  // Verify upgraded EPCOT <-> DHS Skyliner Ride 3D bridges
  const epcotBridges = getParkHopperBridgesForPark('wdw_epcot');
  const skylinerToDhs = epcotBridges.find((b) => b.id === 'wdw_skyliner_to_dhs');
  assert.equal(skylinerToDhs?.rideableTransit, true);
  assert.equal(skylinerToDhs?.railCorridorId, 'wdw_skyliner');
  assert.equal(skylinerToDhs?.rideButtonLabel, '🚡 Ride 3D');

  const vegasBridges = getNextExperienceBridgesForVenue('las_vegas');
  assert.ok(
    vegasBridges.some(
      (b) =>
        b.railCorridorId === 'las_vegas_monorail' && b.rideableTransit === true,
    ),
  );
  const oberBridges = getNextExperienceBridgesForVenue('ober_mountain');
  assert.ok(
    oberBridges.some(
      (b) =>
        b.railCorridorId === 'ober_aerial_tram' && b.rideableTransit === true,
    ),
  );
  assert.ok(NEXT_EXPERIENCE_BRIDGES.length >= 14);

  // Verify railwayEngine spawns Ober Aerial Tramway cleanly without Overpass mutation
  const addedEntities = [];
  const mockViewer = {
    entities: {
      add(spec) {
        addedEntities.push(spec);
        return spec;
      },
      remove() {},
    },
    clock: {
      startTime: null,
      stopTime: null,
      currentTime: null,
      clockRange: 0,
      multiplier: 1,
      shouldAnimate: false,
    },
    scene: {
      globe: { show: true, getHeight: () => 400 },
      requestRender() {},
    },
    camera: {
      flyTo() {},
      lookAtTransform() {},
      cancelFlight() {},
    },
  };
  const railEngine = createRailwayEngine({ viewer: mockViewer });
  const spawned = await railEngine.spawnRailRoute('ober_aerial_tram', null, {
    corridor: 'ober_parkway_to_summit',
    cameraMode: 'chase',
    speedMph: 20,
    cabRide: false,
    useOverpass: false,
  });
  assert.ok(spawned, 'Ober Aerial Tramway spawns cleanly');
  assert.equal(spawned.corridor.activeProfile.vehicleMode, 'aerial_tram');
  assert.ok(
    addedEntities.some((e) => e.box && e.name.includes('Ober Mountain Tram')),
    'Aerial tram cabin renders with compact suspended cabin box',
  );

  const skyliner = await railEngine.spawnRailRoute('wdw_skyliner', null, {
    corridor: 'epcot_to_dhs_gondola',
    cameraMode: 'chase',
    speedMph: 14,
    cabRide: false,
    useOverpass: false,
  });
  assert.ok(skyliner, 'WDW Skyliner spawns cleanly');
  assert.equal(skyliner.corridor.activeProfile.vehicleMode, 'aerial_tram');

  const vegasMono = await railEngine.spawnRailRoute(
    'las_vegas_monorail',
    null,
    {
      corridor: 'lv_monorail_mgm_to_sahara',
      cameraMode: 'chase',
      speedMph: 45,
      cabRide: false,
      useOverpass: false,
    },
  );
  assert.ok(vegasMono, 'Las Vegas Monorail spawns cleanly');
  assert.equal(vegasMono.corridor.activeProfile.vehicleMode, 'monorail');
  assert.equal(vegasMono.carEntities.length, 0);
  railEngine.clearRail?.();
  railEngine.destroy?.();
});

test('sightseeing.js geo-homonym guard rejects >250km Wikipedia title mismatches when venue coordinates are provided', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      query: {
        pages: {
          501: {
            index: 1,
            title: 'Mount St. Helens',
            extract: 'Active stratovolcano in Skamania County, Washington.',
            thumbnail: {
              source:
                'https://upload.wikimedia.org/wikipedia/commons/mount_st_helens.jpg',
            },
            coordinates: [{ lat: 46.1914, lon: -122.1956 }],
          },
        },
      },
    }),
  });

  const res = await fetchSightseeingFromWikipedia({
    title: 'Mount_St._Helens_Homonym_Test',
    lat: 34.7015,
    lon: -83.7316,
    fetchImpl: mockFetch,
  });
  assert.equal(res.ok, true);
  assert.equal(
    res.count,
    0,
    'Rejects Washington volcano homonym when anchored at Helen, GA',
  );
});
