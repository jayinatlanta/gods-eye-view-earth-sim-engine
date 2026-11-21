import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
  EXEMPLAR_LOCALES,
  classifyLocale,
  resolveExemplarLocale,
  haversineMeters,
} from '../layers/citylife/localeClassifier.js';

test('Living World — Dynamic Settlement & Biome Classifier', async (t) => {
  await t.test(
    'verifies all 12 settlement typologies are defined with metadata',
    () => {
      const keys = Object.keys(SETTLEMENT_TYPOLOGIES);
      assert.equal(keys.length, 12);
      for (const key of keys) {
        const meta = TYPOLOGY_METADATA[key];
        assert.ok(meta, `Metadata missing for ${key}`);
        assert.ok(meta.name);
        assert.ok(meta.icon);
        assert.ok(meta.primaryTransit);
        assert.ok(Array.isArray(meta.pathingModes));
        assert.ok(meta.soundscapeProfile);
      }
    },
  );

  await t.test(
    'verifies curated exemplar locales exist with corridors and valid coordinates',
    () => {
      const locales = Object.values(EXEMPLAR_LOCALES);
      assert.ok(locales.length >= 15);

      const darien = EXEMPLAR_LOCALES.darien_ga;
      assert.ok(darien);
      assert.equal(darien.typology, SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER);
      assert.ok(darien.corridors.length >= 2);

      const okReservation = EXEMPLAR_LOCALES.ok_reservation;
      assert.ok(okReservation);
      assert.equal(
        okReservation.typology,
        SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
      );

      const iowaFarm = EXEMPLAR_LOCALES.iowa_farm;
      assert.ok(iowaFarm);
      assert.equal(iowaFarm.typology, SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL);

      const cedarPoint = EXEMPLAR_LOCALES.cedar_point;
      assert.ok(cedarPoint);
      assert.equal(
        cedarPoint.typology,
        SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      );

      const orlandoPark = EXEMPLAR_LOCALES.orlando_park;
      assert.ok(orlandoPark);
      assert.equal(
        orlandoPark.typology,
        SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      );

      // Studio Backlots & Global Theme Parks
      const studioIds = [
        'paramount_studios',
        'warner_bros',
        'universal_backlot',
        'tyler_perry_studios',
        'pinewood_studios',
      ];
      for (const id of studioIds) {
        const loc = EXEMPLAR_LOCALES[id];
        assert.ok(loc, `Missing studio exemplar ${id}`);
        assert.equal(loc.typology, SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT);
        assert.ok(loc.corridors.length >= 2);
      }

      const parkIds = [
        'disney_magic_kingdom',
        'universal_orlando',
        'disneyland_ca',
        'disneyland_paris',
        'tokyo_disneyland',
      ];
      for (const id of parkIds) {
        const loc = EXEMPLAR_LOCALES[id];
        assert.ok(loc, `Missing theme park exemplar ${id}`);
        assert.equal(loc.typology, SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK);
        assert.ok(loc.corridors.length >= 2);
      }
    },
  );

  await t.test(
    'classifies coordinates within proximity to exemplar epcenters',
    () => {
      // Exact Darien lat/lon
      const resDarien = classifyLocale({ lat: 31.3702, lon: -81.434 });
      assert.equal(resDarien.typology, SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER);
      assert.equal(resDarien.localeId, 'darien_ga');
      assert.equal(resDarien.icon, '🦐');

      // Nearby Muscogee OK coordinate (within ~5km)
      const resOK = classifyLocale({ lat: 35.63, lon: -95.96 });
      assert.equal(resOK.typology, SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION);
      assert.equal(resOK.localeId, 'ok_reservation');
      assert.equal(resOK.icon, '🪶');

      // Iowa Farmland coordinate
      const resFarm = classifyLocale({ lat: 42.0347, lon: -93.62 });
      assert.equal(resFarm.typology, SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL);
      assert.equal(resFarm.localeId, 'iowa_farm');

      // Cedar Point Coaster Peninsula
      const resCoaster = classifyLocale({ lat: 41.4822, lon: -82.6835 });
      assert.equal(
        resCoaster.typology,
        SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      );
      assert.equal(resCoaster.localeId, 'cedar_point');
      assert.equal(resCoaster.icon, '🎢');

      // Paramount Pictures Studios (Hollywood)
      const resStudio = classifyLocale({ lat: 34.0837, lon: -118.3186 });
      assert.equal(resStudio.typology, SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT);
      assert.equal(resStudio.localeId, 'paramount_studios');
      assert.equal(resStudio.icon, '🎬');
    },
  );

  await t.test('classifies arbitrary coordinates via OSM tags', () => {
    // Film studio backlot tag in an unknown location
    const resStudioTag = classifyLocale({
      lat: 43.65,
      lon: -79.35,
      tags: ['industrial=film_studio', 'studio=film'],
    });
    assert.equal(resStudioTag.typology, SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT);

    // Theme park tag in an unknown location
    const resTheme = classifyLocale({
      lat: 51.5,
      lon: 0.1,
      tags: ['tourism=theme_park', 'attraction=roller_coaster'],
    });
    assert.equal(resTheme.typology, SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK);

    // Tribal / Indigenous lands tag
    const resTribal = classifyLocale({
      lat: 34.0,
      lon: -110.0,
      tags: ['boundary=aboriginal_lands'],
    });
    assert.equal(resTribal.typology, SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION);

    // Coastal / Harbor dock tags
    const resCoast = classifyLocale({
      lat: 25.0,
      lon: -77.0,
      tags: ['waterway=dock', 'man_made=pier'],
    });
    assert.equal(resCoast.typology, SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER);

    // Farmland / Crop tags
    const resAgri = classifyLocale({
      lat: 38.0,
      lon: -90.0,
      tags: ['landuse=farmland'],
    });
    assert.equal(resAgri.typology, SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL);

    // Alpine ski resort tags
    const resAlpine = classifyLocale({
      lat: 46.5,
      lon: 8.0,
      tags: ['tourism=alpine_resort', 'aerialway=gondola'],
      elevationMeters: 2200,
    });
    assert.equal(resAlpine.typology, SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT);
  });

  await t.test(
    'classifies density and falls back gracefully to rural agricultural',
    () => {
      // High road/building count -> DENSE_URBAN
      const resUrban = classifyLocale({
        lat: 10.0,
        lon: 10.0,
        roadCount: 50,
        buildingCount: 150,
      });
      assert.equal(resUrban.typology, SETTLEMENT_TYPOLOGIES.DENSE_URBAN);

      // Empty coordinates without tags -> Default Terrestrial RURAL_AGRICULTURAL
      const resDefault = classifyLocale({ lat: -15.0, lon: -45.0 });
      assert.equal(
        resDefault.typology,
        SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
      );
      assert.ok(resDefault.confidence > 0.5);
    },
  );

  await t.test(
    'resolveExemplarLocale finds locales by id or case-insensitive search',
    () => {
      assert.equal(
        resolveExemplarLocale('darien_ga')?.name,
        'Darien Shrimping Harbor',
      );
      assert.equal(
        resolveExemplarLocale('cedar_point')?.name,
        'Cedar Point Coaster Peninsula',
      );
      assert.equal(resolveExemplarLocale('Muscogee')?.id, 'ok_reservation');
      assert.equal(resolveExemplarLocale('non_existent'), null);
    },
  );

  await t.test(
    'haversineMeters calculates realistic terrestrial distances',
    () => {
      // Distance between Darien GA (31.3702, -81.434) and Savannah GA (32.0809, -81.0912) is ~85-90 km
      const dist = haversineMeters(31.3702, -81.434, 32.0809, -81.0912);
      assert.ok(dist > 80000 && dist < 100000, `Expected ~85km, got ${dist}`);
    },
  );

  await t.test(
    'classifies alpine elevation (>1800m) as alpine ski resort',
    () => {
      const resAlpine = classifyLocale({
        lat: 45.9237,
        lon: 6.8694,
        elevationMeters: 2200,
      });
      assert.equal(resAlpine.typology, SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT);
      assert.equal(resAlpine.icon, '⛷️');
    },
  );
});
