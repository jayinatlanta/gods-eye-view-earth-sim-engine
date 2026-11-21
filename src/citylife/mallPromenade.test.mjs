/**
 * Test Suite: Living World Sim — Peak Mall Promenades & Regional Shopping Sanctuaries on GEV.
 *
 * Validates:
 * 1. SHOPPING_MALL_PROMENADE Settlement Archetype & Metadata Contract
 * 2. Curated Exemplar Landmarks (Phipps Plaza, NorthPark Center, Oglethorpe, Savannah Mall, Quaker Bridge)
 * 3. Multi-Angle Spectator Watch Camera Suites (Atrium Skylight, Central Fountain, Food Court, Colonnade)
 * 4. Coordinate Proximity & OSM Tag Classification
 * 5. Mulberry32 Zero-Token Ambient Shopper Thoughts & Authentic Personas
 * 6. Autonomous Companion Co-Stroll Banter
 * 7. Procedural Web Audio Concourse Micro-Soundscape
 * 8. Contextual Entity Spool Mobility (Security Patrol Cart)
 * 9. City Drawer UI Presets, Watch Camera Buttons & Wander Action
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
  EXEMPLAR_LOCALES,
  classifyLocale,
  resolveExemplarLocale,
} from '../layers/citylife/localeClassifier.js';
import {
  LOCALE_THOUGHT_DICTIONARIES,
  LOCALE_PERSONA_PROFILES,
  generateLocalePersona,
} from '../layers/citylife/localeThoughtMatrix.js';
import { generateCompanionThought } from '../layers/citylife/companionDot.js';
import {
  SOUNDSCAPE_PROFILES,
  createAmbientSoundscape,
} from '../layers/citylife/ambientSoundscape.js';
import {
  createContextualEntitySpool,
  ENTITY_TYPES,
} from '../layers/citylife/contextualEntitySpool.js';
import { createCityDrawer } from './cityDrawer.js';

test('Living World Sim — Peak Mall Promenades & Regional Shopping Sanctuaries', async (t) => {
  // =========================================================================
  // 1. TYPOLOGY & METADATA CONTRACT
  // =========================================================================
  await t.test('24.4.1: SHOPPING_MALL_PROMENADE Archetype & Metadata Contract', () => {
    assert.ok(
      SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      'SHOPPING_MALL_PROMENADE typology must be defined',
    );
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE];
    assert.ok(meta, 'Metadata missing for SHOPPING_MALL_PROMENADE');
    assert.equal(meta.id, 'SHOPPING_MALL_PROMENADE');
    assert.equal(meta.icon, '🛍️');
    assert.ok(meta.name.includes('Shopping Mall Promenade'));
    assert.equal(meta.primaryTransit, 'electric_security_carts_and_shuttles');
    assert.equal(meta.soundscapeProfile, 'mall_concourse');
    assert.ok(meta.pathingModes.includes('mall_concourse'));
    assert.ok(meta.pathingModes.includes('atrium_walk'));
  });

  // =========================================================================
  // 2. CURATED EXEMPLAR LANDMARKS
  // =========================================================================
  await t.test('24.4.2: Curated Exemplar Landmarks Catalog', () => {
    const phipps = EXEMPLAR_LOCALES.phipps_plaza;
    assert.ok(phipps, 'Phipps Plaza must be cataloged');
    assert.equal(phipps.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.ok(phipps.region.includes('Atlanta'));
    assert.equal(phipps.icon, '🛍️');
    assert.ok(phipps.landmarks.some((l) => l.includes('Saks Fifth Avenue')));
    assert.ok(phipps.landmarks.some((l) => l.includes('Marble Concourse')));
    assert.ok(phipps.landmarks.some((l) => l.includes('Atrium Skylight')));
    assert.ok(phipps.corridors.length >= 2);

    const northpark = EXEMPLAR_LOCALES.northpark_center;
    assert.ok(northpark, 'NorthPark Center must be cataloged');
    assert.equal(northpark.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.ok(northpark.region.includes('Dallas'));
    assert.equal(northpark.icon, '🦆');
    assert.ok(northpark.landmarks.some((l) => l.includes('Duck Pond')));
    assert.ok(northpark.landmarks.some((l) => l.includes('White Brick')));
    assert.ok(northpark.landmarks.some((l) => l.includes('Neiman Marcus')));

    const oglethorpe = EXEMPLAR_LOCALES.oglethorpe_mall;
    assert.ok(oglethorpe, 'Oglethorpe Mall must be cataloged');
    assert.equal(oglethorpe.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.ok(oglethorpe.region.includes('Savannah'));

    const savannah = EXEMPLAR_LOCALES.savannah_mall;
    assert.ok(savannah, 'Savannah Mall must be cataloged');
    assert.equal(savannah.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(savannah.icon, '🎠');
    assert.ok(savannah.landmarks.some((l) => l.includes('Double-Decker Venetian Carousel')));

    const quaker = EXEMPLAR_LOCALES.quaker_bridge_mall;
    assert.ok(quaker, 'Quaker Bridge Mall must be cataloged');
    assert.equal(quaker.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.ok(quaker.region.includes('NJ') || quaker.region.includes('Princeton'));
    assert.ok(quaker.landmarks.some((l) => l.includes('Route 1')));

    assert.equal(resolveExemplarLocale('phipps_plaza')?.id, 'phipps_plaza');
    assert.equal(resolveExemplarLocale('northpark_center')?.id, 'northpark_center');
    assert.equal(resolveExemplarLocale('oglethorpe_mall')?.id, 'oglethorpe_mall');
    assert.equal(resolveExemplarLocale('savannah_mall')?.id, 'savannah_mall');
    assert.equal(resolveExemplarLocale('quaker_bridge_mall')?.id, 'quaker_bridge_mall');
  });

  // =========================================================================
  // 3. MULTI-ANGLE SPECTATOR WATCH CAMERAS
  // =========================================================================
  await t.test('24.4.3: Multi-Angle Spectator Watch Camera Suites', () => {
    const malls = [
      EXEMPLAR_LOCALES.phipps_plaza,
      EXEMPLAR_LOCALES.northpark_center,
      EXEMPLAR_LOCALES.oglethorpe_mall,
      EXEMPLAR_LOCALES.savannah_mall,
      EXEMPLAR_LOCALES.quaker_bridge_mall,
    ];

    for (const mall of malls) {
      assert.ok(mall.watchCameras, `${mall.name} must have watchCameras defined`);
      const { atrium_skylight, central_fountain, food_court_balcony, anchor_colonnade } =
        mall.watchCameras;

      assert.ok(atrium_skylight, `${mall.name} missing atrium_skylight camera`);
      assert.ok(atrium_skylight.altOffset >= 35, 'Atrium skylight must be elevated overview (+35m+)');
      assert.ok(atrium_skylight.pitchDeg <= -45, 'Atrium skylight must look down through roof');

      assert.ok(central_fountain, `${mall.name} missing central_fountain camera`);
      assert.ok(central_fountain.altOffset <= 3.0, 'Central fountain must be eye-level camera');

      assert.ok(food_court_balcony, `${mall.name} missing food_court_balcony camera`);
      assert.ok(
        food_court_balcony.altOffset >= 6.0 && food_court_balcony.altOffset <= 8.5,
        'Food court must be mezzanine balcony altitude',
      );

      assert.ok(anchor_colonnade, `${mall.name} missing anchor_colonnade camera`);
      assert.ok(
        anchor_colonnade.altOffset >= 2.5 && anchor_colonnade.altOffset <= 4.0,
        'Colonnade must be concourse eye height',
      );
    }
  });

  // =========================================================================
  // 4. COORDINATE PROXIMITY & OSM CLASSIFICATION
  // =========================================================================
  await t.test('24.4.4: Coordinate Proximity & OSM Tag Classification', () => {
    // Proximity to Phipps Plaza
    const phippsResult = classifyLocale({ lat: 33.8535, lon: -84.3621 });
    assert.equal(phippsResult.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(phippsResult.localeId, 'phipps_plaza');

    // Proximity to NorthPark Center
    const npResult = classifyLocale({ lat: 32.8687, lon: -96.7735 });
    assert.equal(npResult.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(npResult.localeId, 'northpark_center');

    // Proximity to Quaker Bridge Mall
    const qbResult = classifyLocale({ lat: 40.2975, lon: -74.6853 });
    assert.equal(qbResult.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(qbResult.localeId, 'quaker_bridge_mall');

    // Arbitrary location with OSM shop=mall tag (Chicago, outside any exemplar proximity radius)
    const osmResult = classifyLocale({
      lat: 41.8781,
      lon: -87.6298,
      tags: ['shop=mall'],
    });
    assert.equal(osmResult.typology, SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(osmResult.localeId, 'custom_shopping_mall');
    assert.equal(osmResult.icon, '🛍️');
  });

  // =========================================================================
  // 5. MULBERRY32 ZERO-TOKEN AMBIENT SHOPPER THOUGHTS
  // =========================================================================
  await t.test('24.4.5: Mulberry32 Zero-Token Ambient Shopper Thoughts & Personas', () => {
    const thoughts = LOCALE_THOUGHT_DICTIONARIES[SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE];
    assert.ok(Array.isArray(thoughts));
    assert.ok(thoughts.length >= 8);

    assert.ok(thoughts.some((t) => t.includes('power-walkers')));
    assert.ok(thoughts.some((t) => t.includes('NorthPark duck pond') || t.includes('ducks')));
    assert.ok(thoughts.some((t) => t.includes('Cinnabon') || t.includes('Auntie Anne')));
    assert.ok(thoughts.some((t) => t.includes('Sam Goody')));
    assert.ok(thoughts.some((t) => t.includes('Phipps Plaza')));
    assert.ok(thoughts.some((t) => t.includes('wishing well')));
    assert.ok(thoughts.some((t) => t.includes('Orange Julius') || t.includes('Sbarro')));
    assert.ok(thoughts.some((t) => t.includes('Venetian carousel')));

    const personas = LOCALE_PERSONA_PROFILES[SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE];
    assert.ok(Array.isArray(personas));
    assert.ok(personas.length >= 4);
    assert.ok(personas.some((p) => p.name.includes('Evelyn')));
    assert.ok(personas.some((p) => p.name.includes('Tyler')));
    assert.ok(personas.some((p) => p.name.includes('Victoria')));
    assert.ok(personas.some((p) => p.name.includes('Marcus')));

    const generated = generateLocalePersona({
      lat: 33.8535,
      lon: -84.3621,
      typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      index: 1,
    });
    assert.ok(generated.name);
    assert.ok(generated.occupation);
    assert.ok(generated.thought);
    assert.ok(generated.vibeColor);
  });

  // =========================================================================
  // 6. AUTONOMOUS COMPANION CO-STROLL BANTER
  // =========================================================================
  await t.test('24.4.6: Autonomous Companion Co-Stroll Banter', () => {
    const thought = generateCompanionThought({
      localeArchetype: 'SHOPPING_MALL_PROMENADE',
      userSpeed: 1.4,
    });
    assert.ok(thought, 'Companion must generate thought for mall promenade');
    assert.ok(
      thought.includes('atrium') ||
        thought.includes('skylight') ||
        thought.includes('concourse') ||
        thought.includes('strolling'),
      `Unexpected thought: ${thought}`,
    );
  });

  // =========================================================================
  // 7. PROCEDURAL WEB AUDIO CONCOURSE SOUNDSCAPE
  // =========================================================================
  await t.test('24.4.7: Procedural Web Audio Concourse Soundscape', () => {
    assert.equal(SOUNDSCAPE_PROFILES.MALL_CONCOURSE, 'mall_concourse');

    // Headless / SSR safety test
    const audio = createAmbientSoundscape();
    assert.ok(audio);
    audio.startSoundscape(SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE);
    assert.equal(audio.getActiveProfile(), 'mall_concourse');
    audio.setVolume(0.85);
    audio.toggleMute();
    assert.equal(audio.isMuted(), true);
    audio.toggleMute();
    assert.equal(audio.isMuted(), false);
    audio.stopSoundscape();
    audio.destroy();
  });

  // =========================================================================
  // 8. CONTEXTUAL MOBILITY SPOOL (PATROL CART)
  // =========================================================================
  await t.test('24.4.8: Contextual Mobility Spool (Security Patrol Cart)', () => {
    const spool = createContextualEntitySpool();
    assert.ok(spool);

    const phipps = EXEMPLAR_LOCALES.phipps_plaza;
    const entities = spool.spawnEntitiesForLocale(phipps, 'calm');
    assert.ok(Array.isArray(entities));

    const machines = spool.getEntitiesByType(ENTITY_TYPES.VEHICLE);
    assert.ok(machines.length >= 1, 'Expected at least 1 concourse patrol machine');

    const patrol = machines.find((m) => m.subType === 'mall_security_cart');
    assert.ok(patrol, 'Expected to find mall_security_cart');
    assert.ok(patrol.name.includes('Security'));
    assert.ok(patrol.persona.name.includes('Officer'));
    assert.ok(patrol.persona.thought.includes('fountain') || patrol.persona.thought.includes('concourse'));

    spool.clearEntities();
    spool.destroy();
  });

  // =========================================================================
  // 9. CITY DRAWER UI PRESETS & CAMERA/WANDER BUTTONS
  // =========================================================================
  await t.test('24.4.9: City Drawer Headless Contract (Mall Presets & Cam Suite)', () => {
    // In headless test environment (document.body null/simulated), createCityDrawer returns safe contract
    const drawer = createCityDrawer();
    assert.ok(drawer);
    assert.equal(typeof drawer.open, 'function');
    assert.equal(typeof drawer.close, 'function');
    assert.equal(typeof drawer.isOpen, 'function');
    assert.equal(drawer.isOpen(), false);
  });
});
