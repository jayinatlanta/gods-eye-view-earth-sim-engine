import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTLEMENT_TYPOLOGIES } from '../layers/citylife/localeClassifier.js';
import {
  createMulberry32,
  hashCoordinateSeed,
  LOCALE_THOUGHT_DICTIONARIES,
  LOCALE_PERSONA_PROFILES,
  generateLocalePersona,
} from '../layers/citylife/localeThoughtMatrix.js';

test('Living World — Zero-Token Localized Monologues & Culture', async (t) => {
  await t.test(
    'createMulberry32 produces deterministic bounded values between 0 and 1',
    () => {
      const rng1 = createMulberry32(999);
      const rng2 = createMulberry32(999);

      const val1a = rng1();
      const val1b = rng1();
      const val2a = rng2();
      const val2b = rng2();

      assert.equal(val1a, val2a);
      assert.equal(val1b, val2b);
      assert.ok(val1a >= 0 && val1a < 1);
      assert.ok(val1b >= 0 && val1b < 1);
    },
  );

  await t.test(
    'hashCoordinateSeed produces stable integer hashes for lat/lon',
    () => {
      const hash1 = hashCoordinateSeed(
        31.3702,
        -81.434,
        'COASTAL_TIDEWATER',
        0,
      );
      const hash2 = hashCoordinateSeed(
        31.3702,
        -81.434,
        'COASTAL_TIDEWATER',
        0,
      );
      const hashDiff = hashCoordinateSeed(
        31.3702,
        -81.434,
        'COASTAL_TIDEWATER',
        1,
      );

      assert.equal(hash1, hash2);
      assert.notEqual(hash1, hashDiff);
      assert.ok(Number.isInteger(hash1));
    },
  );

  await t.test(
    'verifies all 9 typologies have culturally grounded thought dictionaries',
    () => {
      for (const typology of Object.values(SETTLEMENT_TYPOLOGIES)) {
        const thoughts = LOCALE_THOUGHT_DICTIONARIES[typology];
        assert.ok(Array.isArray(thoughts), `Missing thoughts for ${typology}`);
        assert.ok(
          thoughts.length >= 3,
          `Insufficient thoughts for ${typology}`,
        );
        for (const t of thoughts) {
          assert.ok(typeof t === 'string');
          assert.ok(t.length > 15);
        }
      }
    },
  );

  await t.test(
    'verifies all 9 typologies have regional persona demographic profiles',
    () => {
      for (const typology of Object.values(SETTLEMENT_TYPOLOGIES)) {
        const profiles = LOCALE_PERSONA_PROFILES[typology];
        assert.ok(Array.isArray(profiles), `Missing profiles for ${typology}`);
        assert.ok(
          profiles.length >= 1,
          `Insufficient profiles for ${typology}`,
        );
        for (const p of profiles) {
          assert.ok(p.name);
          assert.ok(p.role);
          assert.ok(p.outfit);
          assert.ok(p.vibeColor);
        }
      }
    },
  );

  await t.test(
    'generateLocalePersona produces culturally authentic persona and inner monologue',
    () => {
      // Coastal Tidewater (Darien)
      const pCoast = generateLocalePersona({
        lat: 31.3702,
        lon: -81.434,
        typology: SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
        entityIndex: 0,
        speedMs: 0.42,
      });
      assert.ok(pCoast.name);
      assert.ok(pCoast.occupation);
      assert.ok(pCoast.outfit);
      assert.ok(pCoast.thought);
      assert.equal(pCoast.typology, SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER);
      assert.equal(pCoast.speedKmh, '1.5');

      // Oklahoma Tribal Reservation
      const pTribal = generateLocalePersona({
        lat: 35.6234,
        lon: -95.9614,
        typology: SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
        entityIndex: 1,
      });
      assert.ok(pTribal.name);
      assert.ok(pTribal.thought);
      assert.equal(pTribal.typology, SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION);

      // Iowa Farmland
      const pFarm = generateLocalePersona({
        lat: 42.0347,
        lon: -93.62,
        typology: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
        entityIndex: 2,
      });
      assert.ok(pFarm.name);
      assert.ok(pFarm.thought);
      assert.equal(pFarm.typology, SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL);

      // Cedar Point Coaster Peninsula
      const pCoaster = generateLocalePersona({
        lat: 41.4822,
        lon: -82.6835,
        typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
        entityIndex: 3,
      });
      assert.ok(pCoaster.name);
      assert.ok(pCoaster.thought);
      assert.equal(
        pCoaster.typology,
        SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      );

      // Paramount Studio Backlot
      const pStudio = generateLocalePersona({
        lat: 34.0837,
        lon: -118.3186,
        typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
        entityIndex: 4,
      });
      assert.ok(pStudio.name);
      assert.ok(pStudio.thought);
      assert.equal(pStudio.typology, SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT);
    },
  );
});
