import test from 'node:test';
import assert from 'node:assert/strict';

// Wilderness Imports
import {
  WILDERNESS_TRAILHEADS,
  BIOME_TYPES,
  BIOME_META,
  TRAIL_DIFFICULTIES,
  getAllTrailheads,
  getTrailheadById,
  filterTrailheads,
  findNearbyTrailhead,
} from '../layers/wilderness/trailheadCatalog.js';
import {
  calculateSlopeMultiplier,
  generateTrailSpline,
  createTrailNavigator,
  HIKE_PACES,
  TRAIL_CAMERA_MODES,
} from '../layers/wilderness/trailPathfinder.js';
import {
  WILDLIFE_SPECIES,
  spawnFaunaForTrailhead,
  updateFaunaFlock,
} from '../layers/wilderness/faunaEngine.js';
import { createProceduralCampfireAudio } from '../layers/wilderness/proceduralCampfireAudio.js';
import { createWildernessDrawer } from './wildernessDrawer.js';

// World Sandbox Imports
import {
  STRUCTURE_CATALOG,
  STRUCTURE_CATEGORIES,
  TERRAIN_SUITABILITY,
  getStructureById,
  getStructuresByCategory,
  getStructuresByTerrain,
} from '../layers/sandbox/structureCatalog.js';
import { createWorldSandboxEngine } from '../layers/sandbox/worldSandboxEngine.js';
import { createSandboxDrawer } from './sandboxDrawer.js';

test('Living World: Wilderness Ranger & World Sandbox Suite', async (t) => {
  // =========================================================================
  // WILDERNESS RANGER & TRAILHEAD EXPLORER TESTS
  // =========================================================================

  await t.test('24.28.1: Trailhead Catalog — Parks, SAC Ratings & Biomes', () => {
    assert.equal(WILDERNESS_TRAILHEADS.length, 8, 'Expected 8 cataloged national park trailheads');
    const all = getAllTrailheads();
    assert.equal(all.length, 8);

    const halfDome = getTrailheadById('yosemite_half_dome');
    assert.ok(halfDome, 'Half Dome trailhead must exist');
    assert.equal(halfDome.park, 'Yosemite National Park');
    assert.equal(halfDome.state, 'California');
    assert.equal(halfDome.biome, BIOME_TYPES.SIERRA_GRANITE);
    assert.equal(halfDome.difficulty, 'ALPINE_HIKING');
    assert.ok(halfDome.trailLengthKm > 20);
    assert.ok(halfDome.elevationGainM > 1400);
    assert.ok(halfDome.waypoints.length >= 4);
    assert.ok(halfDome.campsites.length >= 1);
    assert.ok(halfDome.faunaTypes.includes('black_bear'));

    // Test biome metadata
    const alpineMeta = BIOME_META[BIOME_TYPES.SIERRA_GRANITE];
    assert.ok(alpineMeta);
    assert.equal(alpineMeta.icon, '🏔️');

    // Test difficulty metadata
    assert.ok(TRAIL_DIFFICULTIES.HIKING);
    assert.ok(TRAIL_DIFFICULTIES.MOUNTAIN_HIKING);
    assert.ok(TRAIL_DIFFICULTIES.ALPINE_HIKING);
  });

  await t.test('24.28.2: Trailhead Spatial Filtering & Nearest Search', () => {
    const alpineOnly = filterTrailheads({ difficulty: 'ALPINE_HIKING' });
    assert.ok(alpineOnly.length >= 2);
    assert.ok(alpineOnly.every((th) => th.difficulty === 'ALPINE_HIKING'));

    const yosemiteSearch = filterTrailheads({ search: 'Yosemite' });
    assert.equal(yosemiteSearch.length, 1);
    assert.equal(yosemiteSearch[0].id, 'yosemite_half_dome');

    // Find nearest trailhead to Yosemite coordinates
    const nearestToYosemite = findNearbyTrailhead(37.74, -119.53, 50);
    assert.ok(nearestToYosemite);
    assert.equal(nearestToYosemite.id, 'yosemite_half_dome');

    // Searching in the middle of Atlantic ocean with 50km radius should return null
    const ocean = findNearbyTrailhead(0.0, 0.0, 50);
    assert.equal(ocean, null);
  });

  await t.test('24.28.3: Topographic Trail Pathfinder & Tobler Slope Function', () => {
    const basePace = HIKE_PACES.BRISK.speedMps; // 1.4 m/s

    // Flat terrain (slope 0)
    const flatMult = calculateSlopeMultiplier(0);
    assert.ok(Math.abs(flatMult - 1.0) < 0.1, 'Flat terrain multiplier should be close to 1.0');

    // Mild downhill (-3° slope) should speed up hiker
    const gentleDownhill = calculateSlopeMultiplier(-3);
    assert.ok(gentleDownhill > flatMult, 'Gentle downhill should be faster than flat');

    // Steep uphill (+18° slope) should significantly slow hiker
    const steepUphill = calculateSlopeMultiplier(18);
    assert.ok(steepUphill < flatMult * 0.7, 'Steep uphill should slow speed');

    // Test spline generation
    const halfDome = getTrailheadById('yosemite_half_dome');
    const spline = generateTrailSpline(halfDome.waypoints);
    assert.ok(spline.points.length >= halfDome.waypoints.length);
    assert.ok(spline.totalDistanceM > 0);

    // Test Navigator
    let lastProgress = null;
    const navigator = createTrailNavigator({
      trailhead: halfDome,
      pace: 'BRISK',
      onProgress: (pose) => {
        lastProgress = pose;
      },
    });

    assert.equal(navigator.isNavigating(), false);
    navigator.start();
    assert.equal(navigator.isNavigating(), true);

    const pose = navigator.getCurrentPose();
    assert.ok(pose.lat);
    assert.ok(pose.lon);
    assert.ok(pose.speedMph > 0);

    navigator.setPace('TRAIL_RUN');
    assert.equal(navigator.getCurrentPose().activePace, 'TRAIL_RUN');

    navigator.setCameraMode(TRAIL_CAMERA_MODES.DRONE_VISTA);
    assert.equal(navigator.getCurrentPose().cameraMode, TRAIL_CAMERA_MODES.DRONE_VISTA);

    navigator.pause();
    assert.equal(navigator.isNavigating(), false);
    navigator.destroy();
  });

  await t.test('24.28.4: Wilderness Fauna Engine & Flocking Kinematics', () => {
    const halfDome = getTrailheadById('yosemite_half_dome');
    const animals = spawnFaunaForTrailhead(halfDome);
    assert.ok(animals.length >= 1, 'Should spawn fauna matching native species');

    const bear = animals.find((a) => a.speciesKey === 'black_bear');
    assert.ok(bear);
    assert.equal(bear.state, 'CALM_GRAZING');
    assert.ok(bear.alertRadiusM > 0);

    // Update flock with distant hiker -> remains calm grazing
    const updatedCalm = updateFaunaFlock(animals, {
      lat: bear.lat + 0.1, // far away
      lon: bear.lon + 0.1,
    });
    const bearCalm = updatedCalm.find((a) => a.id === bear.id);
    assert.equal(bearCalm.state, 'CALM_GRAZING');

    // Update flock with close hiker within caution radius (e.g. 5m away) -> alert sentry or retreat
    const updatedClose = updateFaunaFlock(animals, {
      lat: bear.lat + 0.00005, // ~5m away
      lon: bear.lon + 0.00005,
    });
    const bearClose = updatedClose.find((a) => a.id === bear.id);
    assert.ok(
      bearClose.state === 'ALERT_SENTRY' || bearClose.state === 'RETREATING',
      `Expected ALERT_SENTRY or RETREATING, got ${bearClose.state}`,
    );
  });

  await t.test('24.28.5: Procedural Campfire Audio Engine & Drawer Contract', () => {
    const audio = createProceduralCampfireAudio();
    assert.ok(audio);
    assert.equal(audio.isMuted, true);

    audio.toggleMute();
    assert.equal(audio.isMuted, false);

    audio.setCampfireActive(true);
    audio.setStargazingMode(true);
    const attenuation = audio.calculateAltitudeAttenuation(1500); // above 1200m ceiling
    assert.equal(attenuation, 0.0);
    audio.destroy();

    // Test Wilderness Drawer in headless environment
    const drawer = createWildernessDrawer();
    assert.ok(drawer);
    assert.equal(drawer.isOpen(), false);
    drawer.open();
    drawer.close();
    drawer.toggle();
    drawer.destroy();
  });

  // =========================================================================
  // WORLD ARCHITECT & WORLD SANDBOX TESTS
  // =========================================================================

  await t.test('24.30.1: Structure Catalog — Archetypes, Materials & Suitability', () => {
    assert.equal(STRUCTURE_CATALOG.length, 7, 'Expected 7 modular structure archetypes');

    const cabin = getStructureById('struct-hillside-cabin');
    assert.ok(cabin);
    assert.equal(cabin.name, 'Modern Hillside Cabin');
    assert.equal(cabin.category, STRUCTURE_CATEGORIES.SHELTER);
    assert.ok(cabin.footprint.width >= 10);
    assert.ok(cabin.footprint.length >= 10);
    assert.ok(cabin.materials.includes('western_red_cedar'));
    assert.ok(cabin.amenities.length >= 3);
    assert.ok(cabin.suitableTerrain.includes(TERRAIN_SUITABILITY.RIDGE));
    assert.ok(cabin.sanctuaryScore >= 90);

    const towers = getStructuresByCategory(STRUCTURE_CATEGORIES.OBSERVATION);
    assert.ok(towers.length >= 3); // Lookout tower, Viewing Pavilion, Glass Skywalk, Stargazing deck

    const cliffStructures = getStructuresByTerrain(TERRAIN_SUITABILITY.CLIFF_EDGE);
    assert.ok(cliffStructures.length >= 2);
    assert.ok(cliffStructures.some((s) => s.id === 'struct-glass-skywalk'));
  });

  await t.test('24.30.2: World Sandbox Engine — Placement, Persistence & Sanctuaries', () => {
    const engine = createWorldSandboxEngine({
      storageKey: 'gev_test_sandbox_suite',
    });

    assert.equal(engine.getPlacedStructures().length, 0);

    // Place structure 1: Mountain Fire Lookout
    const lookout = engine.addStructure({
      catalogId: 'struct-fire-lookout',
      position: { longitude: -119.5383, latitude: 37.7456, height: 2694, heading: 45 },
      customName: 'Half Dome Sentinel Tower',
      isSanctuary: true,
      notes: 'USFS historic lookout restoration',
    });

    assert.ok(lookout);
    assert.equal(lookout.catalogId, 'struct-fire-lookout');
    assert.equal(lookout.customName, 'Half Dome Sentinel Tower');
    assert.equal(lookout.isSanctuary, true);
    assert.equal(engine.getPlacedStructures().length, 1);
    assert.equal(engine.getCompanionOverlookId(), lookout.id);

    // Place structure 2: Overlook Bench
    const bench = engine.addStructure({
      catalogId: 'struct-overlook-bench',
      position: { longitude: -119.5734, latitude: 37.7274, height: 2199 },
      customName: 'Glacier Point Sunset Bench',
      isSanctuary: false,
    });

    assert.equal(engine.getPlacedStructures().length, 2);
    assert.equal(engine.getSanctuaries().length, 1);

    // Designate bench as active companion overlook sanctuary
    engine.setCompanionOverlook(bench.id);
    assert.equal(engine.getCompanionOverlookId(), bench.id);
    assert.equal(engine.getStructure(bench.id).isSanctuary, true);
    assert.equal(engine.getSanctuaries().length, 2);

    // Update structure metadata
    engine.updateStructure(bench.id, {
      customName: 'Glacier Point Companion Vista',
      notes: 'Perfect afternoon tea spot',
    });
    assert.equal(engine.getStructure(bench.id).customName, 'Glacier Point Companion Vista');

    // Interactive placement lifecycle
    engine.startPlacement('struct-hillside-cabin');
    const snapshot = engine.getSnapshot();
    assert.equal(snapshot.isPlacing, true);
    assert.equal(snapshot.placementCatalogId, 'struct-hillside-cabin');

    engine.updatePlacementCursor({ longitude: -119.5, latitude: 37.7, height: 2000, heading: 90 });
    const committed = engine.commitPlacement({ customName: 'Tuolumne Cabin' });
    assert.ok(committed);
    assert.equal(engine.getPlacedStructures().length, 3);
    assert.equal(engine.getSnapshot().isPlacing, false);

    // Export & Import Layout
    const jsonLayout = engine.exportSandboxLayout();
    assert.ok(jsonLayout.includes('Tuolumne Cabin'));
    assert.ok(jsonLayout.includes('Half Dome Sentinel Tower'));

    // Test import into fresh engine
    const engineImport = createWorldSandboxEngine({
      storageKey: 'gev_test_sandbox_import',
    });
    const importedCount = engineImport.importSandboxLayout(jsonLayout, true);
    assert.equal(importedCount, 3);
    assert.equal(engineImport.getPlacedStructures().length, 3);
    assert.equal(engineImport.getCompanionOverlookId(), bench.id);

    // Clean up
    engine.removeStructure(lookout.id);
    assert.equal(engine.getPlacedStructures().length, 2);

    engine.destroy();
    engineImport.destroy();
  });

  await t.test('World Sandbox Drawer Headless Contract', () => {
    const drawer = createSandboxDrawer();
    assert.ok(drawer);
    assert.equal(drawer.isOpen(), false);
    drawer.open();
    drawer.close();
    drawer.toggle();
    drawer.destroy();
  });
});
