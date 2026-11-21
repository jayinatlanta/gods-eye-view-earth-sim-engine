import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createContextualEntitySpool,
  ENTITY_TYPES,
  FILMING_PROTOCOL_STATES,
} from '../layers/citylife/contextualEntitySpool.js';
import {
  EXEMPLAR_LOCALES,
  SETTLEMENT_TYPOLOGIES,
} from '../layers/citylife/localeClassifier.js';

test('Living World — Contextual Multi-Entity Synthetics & Mobility Spool', async (t) => {
  function createMockViewer() {
    const mockEntities = [];
    return {
      entities: {
        add: (spec) => {
          const e = { ...spec, _id: `ent_${mockEntities.length}` };
          mockEntities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = mockEntities.indexOf(e);
          if (idx >= 0) mockEntities.splice(idx, 1);
        },
        _all: mockEntities,
      },
      scene: {
        globe: {
          getHeight: (carto) => (carto ? 12.0 : 0),
        },
      },
    };
  }

  await t.test('spool initializes safely with empty entity registry', () => {
    const mockViewer = createMockViewer();
    const spool = createContextualEntitySpool({ viewer: mockViewer });

    assert.equal(spool.getEntityCount(), 0);
    assert.equal(spool.getLatchedEntity(), null);
    assert.deepEqual(spool.getActiveEntities(), []);
    spool.destroy();
  });

  await t.test(
    'spawns coastal entities for Darien with trawlers, golf carts, and pelicans',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      const entities = spool.spawnEntitiesForLocale(
        EXEMPLAR_LOCALES.darien_ga,
        'calm',
      );
      assert.ok(entities.length > 0);
      assert.equal(
        spool.getActiveTypology(),
        SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
      );

      const vehicles = spool.getEntitiesByType(ENTITY_TYPES.VEHICLE);
      const fauna = spool.getEntitiesByType(ENTITY_TYPES.FAUNA);
      const humans = spool.getEntitiesByType(ENTITY_TYPES.HUMAN);

      assert.ok(humans.length > 0, 'Spawns coastal human citizens');
      assert.ok(
        vehicles.some((v) => v.subType === 'shrimp_trawler'),
        'Spawns shrimp trawler',
      );
      assert.ok(
        vehicles.some((v) => v.subType === 'golf_cart'),
        'Spawns island electric golf cart',
      );
      assert.ok(
        fauna.some((f) => f.subType === 'brown_pelican'),
        'Spawns brown pelican flock lead',
      );

      // Invariant Check: Outlined Contact Reticles
      for (const ent of entities) {
        assert.ok(
          ent.cesiumEntity,
          'Every entity creates a Cesium scene entity',
        );
        assert.ok(ent.cesiumEntity.point, 'Entity contains a point reticle');
        assert.equal(
          ent.cesiumEntity.point.disableDepthTestDistance,
          Number.POSITIVE_INFINITY,
          'Reticles must disable depth test distance to prevent underground terrain occlusion',
        );
        assert.equal(ent.cesiumEntity.point.outlineColor, Cesium.Color.WHITE);
      }

      spool.destroy();
    },
  );

  await t.test(
    'spawns tribal reservation entities for Oklahoma with pickups and elder vans',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      const entities = spool.spawnEntitiesForLocale(
        EXEMPLAR_LOCALES.ok_reservation,
        'calm',
      );
      assert.ok(entities.length > 0);
      assert.equal(
        spool.getActiveTypology(),
        SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
      );

      const vehicles = spool.getEntitiesByType(ENTITY_TYPES.VEHICLE);
      assert.ok(
        vehicles.some((v) => v.subType === 'work_pickup'),
        'Spawns heavy ranch pickup',
      );
      assert.ok(
        vehicles.some((v) => v.subType === 'tribal_transit_van'),
        'Spawns tribal elder transit van',
      );

      const fauna = spool.getEntitiesByType(ENTITY_TYPES.FAUNA);
      assert.ok(
        fauna.some((f) => f.subType === 'black_angus_cattle'),
        'Spawns pasture cattle',
      );

      spool.destroy();
    },
  );

  await t.test(
    'spawns farmland entities for Iowa with combine harvesters and tractors',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      const entities = spool.spawnEntitiesForLocale(
        EXEMPLAR_LOCALES.iowa_farm,
        'calm',
      );
      assert.ok(entities.length > 0);
      assert.equal(
        spool.getActiveTypology(),
        SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
      );

      const machines = spool.getEntitiesByType(ENTITY_TYPES.MACHINERY);
      assert.ok(
        machines.some((m) => m.subType === 'combine_harvester'),
        'Spawns Case IH combine',
      );
      assert.ok(
        machines.some((m) => m.subType === 'agricultural_tractor'),
        'Spawns John Deere tractor',
      );

      spool.destroy();
    },
  );

  await t.test(
    'spawns theme park entities for Cedar Point with 3D roller coaster trainsets, Ferris wheel, and parking tram',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      const entities = spool.spawnEntitiesForLocale(
        EXEMPLAR_LOCALES.cedar_point,
        'calm',
      );
      assert.ok(entities.length > 0);
      assert.equal(
        spool.getActiveTypology(),
        SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      );

      const rides = spool.getEntitiesByType(ENTITY_TYPES.KINETIC_RIDE);
      const vehicles = spool.getEntitiesByType(ENTITY_TYPES.VEHICLE);
      assert.ok(
        rides.some((r) => r.subType === 'roller_coaster'),
        'Spawns giga coaster trainset',
      );
      assert.ok(
        rides.some((r) => r.subType === 'ferris_wheel'),
        'Spawns giant observation Ferris wheel',
      );
      assert.ok(
        vehicles.some((v) => v.subType === 'parking_tram'),
        'Spawns resort parking tram',
      );

      spool.destroy();
    },
  );

  await t.test(
    'spawns studio movie lot entities and cycles filming protocol states',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      const entities = spool.spawnEntitiesForLocale(
        EXEMPLAR_LOCALES.paramount_studios,
        'calm',
      );
      assert.ok(entities.length > 0);
      assert.equal(
        spool.getActiveTypology(),
        SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
      );

      const machines = spool.getEntitiesByType(ENTITY_TYPES.MACHINERY);
      const vehicles = spool.getEntitiesByType(ENTITY_TYPES.VEHICLE);
      assert.ok(
        machines.some((m) => m.subType === 'camera_dolly_crane'),
        'Spawns Chapman/Technocrane dolly',
      );
      assert.ok(
        machines.some((m) => m.subType === 'soundstage_lighting_truss'),
        'Spawns 18K HMI lighting truss',
      );
      assert.ok(
        vehicles.some((v) => v.subType === 'production_golf_cart'),
        'Spawns studio production runabout cart',
      );
      assert.ok(
        vehicles.some((v) => v.subType === 'grip_lighting_truck'),
        'Spawns 40ft grip & electric truck',
      );

      assert.equal(spool.getFilmingState(), FILMING_PROTOCOL_STATES.ROLLING);
      assert.ok(spool.getFilmingStatusBadge().includes('CAMERA ROLLING'));

      // Advance state via 12s timer update
      spool.update(12.5);
      assert.equal(spool.getFilmingState(), FILMING_PROTOCOL_STATES.CUT);
      assert.ok(spool.getFilmingStatusBadge().includes('CUT!'));

      spool.advanceFilmingState();
      assert.equal(
        spool.getFilmingState(),
        FILMING_PROTOCOL_STATES.COMPANY_MOVE,
      );

      spool.destroy();
    },
  );

  await t.test(
    'kinematics update advances progress along trajectory and updates positions',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      spool.spawnEntitiesForLocale(EXEMPLAR_LOCALES.darien_ga, 'calm');
      const entities = spool.getActiveEntities();
      const initialProgress = entities[0].progress;

      spool.update(0.1); // 100ms
      assert.notEqual(entities[0].progress, initialProgress);

      spool.destroy();
    },
  );

  await t.test(
    'cycleEntity navigates through spawned entities seamlessly',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      spool.spawnEntitiesForLocale(EXEMPLAR_LOCALES.darien_ga, 'calm');
      const first = spool.getLatchedEntity();
      assert.ok(first);

      const second = spool.cycleEntity(1);
      assert.ok(second);
      assert.notEqual(first.id, second.id);

      const back = spool.cycleEntity(-1);
      assert.equal(back.id, first.id);

      spool.destroy();
    },
  );

  await t.test(
    'clearEntities and destroy purge Cesium scene entities cleanly',
    () => {
      const mockViewer = createMockViewer();
      const spool = createContextualEntitySpool({ viewer: mockViewer });

      spool.spawnEntitiesForLocale(EXEMPLAR_LOCALES.darien_ga, 'calm');
      assert.ok(mockViewer.entities._all.length > 0);

      spool.clearEntities();
      assert.equal(spool.getEntityCount(), 0);
      assert.equal(mockViewer.entities._all.length, 0);

      spool.destroy();
    },
  );
});
