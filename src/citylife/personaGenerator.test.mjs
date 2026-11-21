import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePersona,
  hashCoordinate,
  createPRNG,
  CITY_DICTIONARIES,
} from './personaGenerator.js';

test('Living Cities — Persona & Thought Generator', async (t) => {
  await t.test('generates 100% deterministic personas given the same coordinate and seed', () => {
    const lat = 33.7749;
    const lon = -84.3725;
    const p1 = generatePersona(lat, lon, { city: 'atlanta', seed: 42 });
    const p2 = generatePersona(lat, lon, { city: 'atlanta', seed: 42 });

    assert.equal(p1.id, p2.id);
    assert.equal(p1.name, p2.name);
    assert.equal(p1.occupation, p2.occupation);
    assert.equal(p1.thought, p2.thought);
    assert.equal(p1.vibeLabel, p2.vibeLabel);
    assert.equal(p1.walkingSpeedMs, p2.walkingSpeedMs);
  });

  await t.test('generates authentic localized personas across all 10 cities', () => {
    const cities = [
      'atlanta', 'new_york', 'tokyo', 'london', 'paris',
      'san_francisco', 'monaco', 'singapore', 'chicago', 'sydney',
    ];

    for (const cityId of cities) {
      const persona = generatePersona(10.0, 20.0, { city: cityId, seed: 10 });
      assert.ok(persona.name);
      assert.ok(persona.occupation);
      assert.ok(persona.thought);
      assert.ok(persona.destination);
      assert.ok(persona.speedKmh > 0);

      // Verify the persona name came from the city dictionary
      const dict = CITY_DICTIONARIES[cityId];
      assert.ok(dict.names.includes(persona.name), `Name ${persona.name} should belong to ${cityId}`);
    }
  });

  await t.test('adapts to rainy weather with faster pace and rain-specific thoughts', () => {
    const dry = generatePersona(33.7749, -84.3725, {
      city: 'atlanta',
      seed: 5,
      isRaining: false,
    });
    const wet = generatePersona(33.7749, -84.3725, {
      city: 'atlanta',
      seed: 5,
      isRaining: true,
    });

    assert.equal(wet.isRaining, true);
    // Rainy speed should be ~15% faster
    assert.ok(
      wet.walkingSpeedMs > dry.walkingSpeedMs,
      `Rain pace (${wet.walkingSpeedMs}) should be faster than dry (${dry.walkingSpeedMs})`,
    );

    // Thought should come from rain pool
    const dict = CITY_DICTIONARIES.atlanta;
    assert.ok(dict.rainThoughts.includes(wet.thought));
  });

  await t.test('supports jogger kinematics profile', () => {
    const walker = generatePersona(33.7749, -84.3725, { isJogger: false, seed: 1 });
    const jogger = generatePersona(33.7749, -84.3725, { isJogger: true, seed: 1 });

    assert.equal(jogger.isJogger, true);
    assert.ok(
      jogger.walkingSpeedMs >= 0.85,
      `Jogger speed (${jogger.walkingSpeedMs}) should be >= 0.85 m/s`,
    );
    assert.ok(
      walker.walkingSpeedMs <= 0.65,
      `Walker speed (${walker.walkingSpeedMs}) should be <= 0.65 m/s`,
    );
  });

  await t.test('PRNG produces uniform values between 0 and 1', () => {
    const prng = createPRNG(12345);
    for (let i = 0; i < 50; i++) {
      const val = prng();
      assert.ok(val >= 0 && val < 1);
    }
  });
});
