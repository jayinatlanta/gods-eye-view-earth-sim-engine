import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STADIUM_ARCHETYPES,
  STADIUM_VENUES,
  getStadiumById,
  getAllStadiums,
  getStadiumsByMetro,
  getStadiumColorways,
  findNearbyStadium,
} from '../layers/citylife/stadiumCatalog.js';
import {
  generateTailgateClusterPositions,
  generateIngressCorridorTrajectory,
  generateStadiumConcourseRing,
  TOPOLOGY_MODES,
} from '../layers/citylife/multiTopologyPathing.js';
import {
  createStadiumCrowdEngine,
  GAMEDAY_STATES,
  GAMEDAY_STATE_BADGES,
  GAMEDAY_CAMERA_MODES,
} from '../layers/citylife/stadiumCrowdEngine.js';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
} from '../layers/citylife/localeClassifier.js';
import {
  generateLocalePersona,
  STADIUM_SPECIFIC_THOUGHTS,
} from '../layers/citylife/localeThoughtMatrix.js';
import {
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
} from '../layers/citylife/metroNetworkCatalog.js';

test('Living World Sim — Stadium & Arena Gameday Spectacle Engine', async (t) => {
  await t.test(
    'Component 1: Stadium catalog curates target Atlanta, Phoenix & exemplar venues',
    () => {
      const all = getAllStadiums();
      assert.ok(all.length >= 9, 'Expected at least 9 curated stadiums');

      // Check Atlanta cluster
      const gsu = getStadiumById('gsu_summerhill');
      assert.ok(gsu, 'GSU Summerhill Center Parc must exist');
      assert.equal(
        gsu.archetype,
        STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC,
      );
      assert.ok(gsu.turnstiles.length >= 2, 'GSU must have turnstiles');
      assert.ok(gsu.tailgateLots.length >= 3, 'GSU must have 3 tailgate lots');
      assert.equal(gsu.homeTeam, 'Georgia State Panthers');

      const gsuConvo = getStadiumById('gsu_convocation_center');
      assert.ok(gsuConvo, 'GSU Convocation Center must exist');
      assert.equal(gsuConvo.archetype, STADIUM_ARCHETYPES.COLLEGE_URBAN_ARENA);

      const mbs = getStadiumById('mercedes_benz_stadium');
      assert.ok(mbs, 'Mercedes-Benz Stadium must exist');
      assert.equal(mbs.archetype, STADIUM_ARCHETYPES.PRO_DOME);

      const gt = getStadiumById('georgia_tech_bobby_dodd');
      assert.ok(gt, 'Georgia Tech Bobby Dodd must exist');
      assert.equal(gt.archetype, STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC);

      // Check Phoenix cluster
      const cardinals = getStadiumById('state_farm_stadium_glendale');
      assert.ok(cardinals, 'State Farm Stadium Glendale must exist');
      assert.equal(cardinals.archetype, STADIUM_ARCHETYPES.PRO_DOME);

      const suns = getStadiumById('footprint_center_phoenix');
      assert.ok(suns, 'Footprint Center must exist');
      assert.equal(suns.archetype, STADIUM_ARCHETYPES.PRO_ARENA);

      const asu = getStadiumById('asu_tempe_stadium');
      assert.ok(asu, 'ASU Sun Devils stadium must exist');
      assert.equal(asu.archetype, STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC);

      // Check Metro filters
      const atlStadiums = getStadiumsByMetro('atlanta');
      assert.ok(atlStadiums.length >= 4, 'Atlanta must have >= 4 venues');
      const phxStadiums = getStadiumsByMetro('phoenix');
      assert.ok(phxStadiums.length >= 3, 'Phoenix must have >= 3 venues');
    },
  );

  await t.test(
    'Component 1: findNearbyStadium and colorway lookup functions',
    () => {
      // Near Summerhill Center Parc (33.7353, -84.3894)
      const nearSummerhill = findNearbyStadium(33.736, -84.389, 1000);
      assert.ok(nearSummerhill, 'Should detect Summerhill venue');
      assert.equal(nearSummerhill.stadium.id, 'gsu_summerhill');

      // Near State Farm Stadium Glendale (33.5276, -112.2626)
      const nearGlendale = findNearbyStadium(33.528, -112.262, 1000);
      assert.ok(nearGlendale, 'Should detect Glendale stadium');
      assert.equal(nearGlendale.stadium.id, 'state_farm_stadium_glendale');

      // Colorways
      const colors = getStadiumColorways('georgia_tech_bobby_dodd');
      assert.equal(colors.primary, '#B3A369');
      assert.equal(colors.secondary, '#003057');
    },
  );

  await t.test(
    'Component 2: Radial tailgate lot clusters & ingress trajectory generators',
    () => {
      const cluster = generateTailgateClusterPositions({
        centerLat: 33.7368,
        centerLon: -84.3908,
        baseElev: 300,
        lotRadiusMeters: 60,
        canopyCount: 24,
        grillCount: 12,
        seed: 42,
      });

      assert.ok(cluster.canopies.length >= 20, 'Should generate canopies');
      assert.ok(cluster.grills.length === 12, 'Should generate 12 grills');
      assert.ok(cluster.games.length >= 4, 'Should generate lawn games');
      assert.ok(
        cluster.wanderWaypoints.length >= 8,
        'Should generate wander paths',
      );

      // Verify ingress corridor
      const ingress = generateIngressCorridorTrajectory({
        originLat: 33.739,
        originLon: -84.3894,
        targetLat: 33.737,
        targetLon: -84.3894,
        baseElev: 300,
        corridorWidthMeters: 12.0,
        stepIntervalMeters: 4.0,
        fanOffsetMeters: -3.0,
      });
      assert.ok(ingress.length >= 10, 'Should build dense ingress steps');
      assert.equal(
        ingress[0].mode,
        TOPOLOGY_MODES.STADIUM_INGRESS_CORRIDOR,
      );

      // Verify concourse ring
      const ring = generateStadiumConcourseRing(33.7353, -84.3894, 75.0, 308);
      assert.ok(ring.length >= 32, 'Should generate concourse loop');
      assert.equal(ring[0].mode, TOPOLOGY_MODES.STADIUM_CONCOURSE_RING);
    },
  );

  await t.test(
    'Component 3: Gameday Match Lifecycle State Machine & Crowd Balancing',
    () => {
      const engine = createStadiumCrowdEngine();
      assert.ok(engine);

      // Initial state
      assert.equal(engine.getGamedayState(), GAMEDAY_STATES.PREGAME_TAILGATE);
      assert.ok(engine.getGamedayStatusBadge().includes('TAILGATE'));

      // Pregame crowd distribution: tailgate should dominate
      const spectators = engine._getSimulatedSpectators();
      assert.ok(spectators.length >= 300);
      const pregameTailgateCount = spectators.filter(
        (s) => s.zone === 'tailgate',
      ).length;
      assert.ok(
        pregameTailgateCount > spectators.length * 0.5,
        'Pregame must have >50% fans in tailgate lots',
      );

      // Advance to GATES_OPEN_INGRESS
      engine.advanceGamedayState();
      assert.equal(engine.getGamedayState(), GAMEDAY_STATES.GATES_OPEN_INGRESS);
      assert.ok(engine.getGamedayStatusBadge().includes('GATES OPEN'));
      const ingressCount = spectators.filter((s) => s.zone === 'ingress').length;
      assert.ok(
        ingressCount > spectators.length * 0.5,
        'Gates open must have >50% fans in ingress corridors',
      );

      // Advance to IN_PLAY_CONCOURSE
      engine.advanceGamedayState();
      assert.equal(engine.getGamedayState(), GAMEDAY_STATES.IN_PLAY_CONCOURSE);
      assert.ok(engine.getGamedayStatusBadge().includes('IN PLAY'));
      const concourseCount = spectators.filter(
        (s) => s.zone === 'concourse',
      ).length;
      assert.ok(
        concourseCount > spectators.length * 0.6,
        'In-play must have >60% fans in concourses',
      );

      // Advance to FOURTH_QUARTER_EXIT
      engine.advanceGamedayState();
      assert.equal(
        engine.getGamedayState(),
        GAMEDAY_STATES.FOURTH_QUARTER_EXIT,
      );

      // Advance to POSTGAME_SURGE
      engine.advanceGamedayState();
      assert.equal(engine.getGamedayState(), GAMEDAY_STATES.POSTGAME_SURGE);
      assert.ok(engine.getGamedayStatusBadge().includes('POSTGAME'));
      const transitSurgeCount = spectators.filter(
        (s) => s.zone === 'transit',
      ).length;
      assert.ok(
        transitSurgeCount > spectators.length * 0.5,
        'Postgame must have >50% fans surged onto transit & access roads',
      );

      // Tick simulation
      engine.tick(0.05);

      // Camera modes cycle
      assert.equal(engine.getCameraMode(), GAMEDAY_CAMERA_MODES.BLIMP_AERIAL);
      engine.cycleCameraMode();
      assert.equal(
        engine.getCameraMode(),
        GAMEDAY_CAMERA_MODES.MAIN_GATE_INGRESS,
      );
      engine.cycleCameraMode();
      assert.equal(engine.getCameraMode(), GAMEDAY_CAMERA_MODES.TAILGATE_ROAM);
      engine.cycleCameraMode();
      assert.equal(
        engine.getCameraMode(),
        GAMEDAY_CAMERA_MODES.UPPER_DECK_BALCONY,
      );

      engine.destroy();
    },
  );

  await t.test(
    'Component 4: Fan team colorways, Mulberry32 monologues & soundscape profiles',
    () => {
      // Check typologies & metadata
      assert.ok(SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX);
      const meta =
        TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX];
      assert.ok(meta);
      assert.equal(meta.soundscapeProfile, 'stadium_gameday');

      // Venue-specific thoughts
      assert.ok(STADIUM_SPECIFIC_THOUGHTS.gsu_summerhill.length >= 5);
      assert.ok(STADIUM_SPECIFIC_THOUGHTS.georgia_tech_bobby_dodd.length >= 5);
      assert.ok(STADIUM_SPECIFIC_THOUGHTS.state_farm_stadium_glendale.length >= 4);

      // Persona generation
      const persona = generateLocalePersona({
        lat: 33.7353,
        lon: -84.3894,
        typology: SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX,
        venueId: 'gsu_summerhill',
      });
      assert.ok(persona.name);
      assert.ok(persona.occupation);
      assert.ok(persona.thought);
      assert.ok(persona.vibeColor);
    },
  );

  await t.test(
    'Component 5: Transit platform surge & Valley Metro Light Rail cataloging',
    () => {
      const phxRoute = RAPID_TRANSIT_ROUTES.phoenix_valley_metro;
      assert.ok(phxRoute, 'Valley Metro Light Rail must be cataloged');
      assert.equal(phxRoute.cityId, 'phoenix');
      assert.ok(phxRoute.stations.length >= 8);

      // Check key stadium stations
      const footprintStn = phxRoute.stations.find((s) =>
        s.name.includes('Jefferson'),
      );
      assert.ok(
        footprintStn,
        'Valley Metro must serve 3rd St / Jefferson (Footprint/Chase)',
      );

      const asuStn = phxRoute.stations.find((s) =>
        s.name.includes('Veterans Way'),
      );
      assert.ok(
        asuStn,
        'Valley Metro must serve Veterans Way / College Ave (ASU Stadium)',
      );

      // Check METRO_NETWORKS_BY_CITY
      assert.ok(METRO_NETWORKS_BY_CITY.phoenix);
      assert.ok(
        METRO_NETWORKS_BY_CITY.phoenix.includes('phoenix_valley_metro'),
      );
    },
  );
});
