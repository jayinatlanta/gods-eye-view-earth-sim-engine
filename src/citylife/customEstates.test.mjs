import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  EXEMPLAR_DOMICILES,
  DOMICILE_TYPOLOGIES,
  DOMICILE_TYPOLOGY_META,
  generateParcelFootprint,
  haversineMiles,
  findNearestMetroStation,
  getAllDomiciles,
  getDomicileById,
  claimDomicileAtLocation,
  removeClaimedDomicile,
  renameDomicile,
  clearClaimedDomicilesForTest,
  onDomicileRegistryChange,
} from '../layers/estates/domicileCatalog.js';
import {
  FLEET_MODES,
  COMPANION_MODES,
  createPersonalFleetEngine,
} from '../layers/estates/personalFleetEngine.js';
import { createPropertyClaimScout } from '../layers/estates/propertyClaimScout.js';
import { createProceduralEstateAudio } from '../layers/estates/proceduralEstateAudio.js';
import { createEstateDrawer } from './estateDrawer.js';

test('Custom Domiciles, Estates & Personal Fleet Terminal Suite', async (t) => {
  t.beforeEach(() => {
    clearClaimedDomicilesForTest();
  });

  await t.test(
    'Component 1: Custom Domiciles Catalog — Key Loaner House Starter Easter Egg, Custom Claiming, Naming & Deletion',
    () => {
      // Starter Easter Egg domicile in Key Largo (free, removable, renameable)
      assert.equal(
        EXEMPLAR_DOMICILES.length,
        1,
        'Expected Key Loaner House starter Easter Egg domicile',
      );
      assert.equal(EXEMPLAR_DOMICILES[0].id, 'key_loaner_house');
      assert.equal(EXEMPLAR_DOMICILES[0].title, 'Key Loaner House');
      assert.equal(EXEMPLAR_DOMICILES[0].hasWaterfrontDock, true);

      clearClaimedDomicilesForTest({ includeStarter: true });
      assert.equal(getAllDomiciles().length, 1);
      assert.equal(getAllDomiciles()[0].id, 'key_loaner_house');
      assert.equal(removeClaimedDomicile('key_loaner_house'), true);
      assert.equal(getAllDomiciles().length, 0);

      // Claim a custom primary residence (Civic District Residence)
      const home = claimDomicileAtLocation({
        lat: 30.2672,
        lon: -97.7431,
        typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
        title: 'Civic District Residence',
        localityLabel: 'Austin, TX',
        source: 'viewport',
      });

      assert.ok(home, 'Claimed home must exist');
      assert.equal(home.title, 'Civic District Residence');
      assert.equal(home.typology, DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE);
      assert.equal(home.isExemplar, false);
      assert.ok(home.boundaryPolygon.length >= 5);
      assert.ok(home.frontDoorPoint);
      assert.ok(home.drivewayPoint);
      assert.ok(home.nearestTransit);

      // Verify renaming works
      const renamed = renameDomicile(home.id, 'Civic District Sanctuary');
      assert.equal(renamed, true);
      const updated = getDomicileById(home.id);
      assert.equal(updated.title, 'Civic District Sanctuary');

      // Verify deletion works for any property
      const deleted = removeClaimedDomicile(home.id);
      assert.equal(deleted, true);
      assert.equal(getAllDomiciles().length, 0);
    },
  );

  await t.test(
    'Component 2: Parcel Footprint Generation & Metro Station Resolution',
    () => {
      const footprint = generateParcelFootprint(
        34.0522,
        -118.2437,
        DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
      );
      assert.ok(footprint.boundaryPolygon.length === 6);
      assert.ok(footprint.frontDoorPoint);
      assert.ok(footprint.drivewayPoint);
      assert.ok(footprint.streetJoinPoint);

      // Test nearest metro station resolution in Atlanta
      const nearestAtlanta = findNearestMetroStation(33.7539, -84.3915);
      assert.ok(nearestAtlanta);
      assert.equal(nearestAtlanta.regionKey, 'atlanta');
      assert.ok(nearestAtlanta.distanceMiles < 5.0);

      // Test Haversine distance
      const d = haversineMiles(33.749, -84.388, 34.0522, -118.2437);
      assert.ok(d > 1900 && d < 2200, `Expected ~2100 miles, got ${d}`);
    },
  );

  await t.test(
    'Component 3: Dynamic Property Claiming Anywhere on Earth',
    () => {
      let changeEventFired = false;
      const unsub = onDomicileRegistryChange(() => {
        changeEventFired = true;
      });

      // Claim a vacation home in Lake Tahoe
      const tahoe = claimDomicileAtLocation({
        lat: 39.0968,
        lon: -120.0324,
        typology: DOMICILE_TYPOLOGIES.VACATION_SANCTUARY,
        title: 'Lake Tahoe Alpine Lodge',
        localityLabel: 'Lake Tahoe, CA',
        source: 'viewport',
      });

      assert.ok(tahoe);
      assert.equal(tahoe.title, 'Lake Tahoe Alpine Lodge');
      assert.equal(tahoe.typology, DOMICILE_TYPOLOGIES.VACATION_SANCTUARY);
      assert.equal(tahoe.hasWaterfrontDock, true); // lake detected
      assert.equal(tahoe.isExemplar, false);
      assert.equal(changeEventFired, true);

      // Check it appears in getAllDomiciles
      const all = getAllDomiciles();
      assert.ok(all.some((d) => d.id === tahoe.id));

      // Remove claimed domicile
      const removed = removeClaimedDomicile(tahoe.id);
      assert.equal(removed, true);
      assert.ok(!getAllDomiciles().some((d) => d.id === tahoe.id));

      unsub();
    },
  );

  await t.test(
    'Component 4: Personal Multi-Tier Fleet Engine Kinematics & Speeds',
    () => {
      const home = claimDomicileAtLocation({
        lat: 30.2672,
        lon: -97.7431,
        typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
        title: 'Civic District Residence',
      });

      const fleet = createPersonalFleetEngine();
      assert.ok(fleet);
      assert.equal(fleet.activeMode.id, 'walk');
      assert.equal(fleet.companionMode, COMPANION_MODES.COMPANION_TANDEM);

      // Mode switching to Cruiser Bike
      const bike = fleet.setFleetMode('bike');
      assert.equal(bike.id, 'bike');
      assert.equal(bike.speedMph, 12.3);

      // Mode switching to E-Scooter
      const scooter = fleet.setFleetMode('scooter');
      assert.equal(scooter.id, 'scooter');
      assert.equal(scooter.speedMph, 15.6);

      // Mode switching to EV Sedan
      const ev = fleet.setFleetMode('ev');
      assert.equal(ev.id, 'ev');
      assert.equal(ev.speedMph, 31.3);

      // Start movement and step forward
      fleet.start();
      assert.equal(fleet.isActive, true);
      fleet.step(1.0); // 1 second step
      const telem = fleet.getActiveTelemetry();
      assert.equal(telem.simType, 'fleet');
      assert.equal(telem.mode, 'ev');
      assert.equal(telem.speedMph, 31.3);

      fleet.stop();
      assert.equal(fleet.isActive, false);
      fleet.destroy();
    },
  );

  await t.test('Component 5: Solo vs. Tandem Companion Mode Matrix', () => {
    const fleet = createPersonalFleetEngine();
    assert.equal(fleet.companionMode, COMPANION_MODES.COMPANION_TANDEM);

    fleet.toggleCompanionMode();
    assert.equal(fleet.companionMode, COMPANION_MODES.SOLO_FOCUS);

    fleet.toggleCompanionMode();
    assert.equal(fleet.companionMode, COMPANION_MODES.COMPANION_TANDEM);

    fleet.destroy();
  });

  await t.test('Component 6: Unified Departure Terminal Handoffs', () => {
    const home = claimDomicileAtLocation({
      lat: 30.2672,
      lon: -97.7431,
      typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
      title: 'Civic District Residence',
    });

    const fleet = createPersonalFleetEngine();
    fleet.spawnAtDomicile(home.id);

    // 1. Driveway to Infinite Drive
    const driveHandoff = fleet.handoffToInfiniteDrive();
    assert.ok(driveHandoff);
    assert.equal(driveHandoff.action, 'infinite_drive_handoff');
    assert.ok(driveHandoff.origin);
    assert.ok(driveHandoff.destination);

    // 2. Doorstep to Rapid Transit
    const transitHandoff = fleet.handoffToRapidTransit();
    assert.ok(transitHandoff);
    assert.equal(transitHandoff.action, 'transit_handoff');
    assert.ok(transitHandoff.station);

    // 3. Waterfront Dock to Sails (Coastal claim)
    const coastal = claimDomicileAtLocation({
      lat: 31.956,
      lon: -81.034,
      typology: DOMICILE_TYPOLOGIES.VACATION_SANCTUARY,
      title: 'Coastal Tidal Creek Sanctuary',
    });
    fleet.spawnAtDomicile(coastal.id);
    const sailsHandoff = fleet.handoffToSails();
    assert.ok(sailsHandoff);
    assert.equal(sailsHandoff.action, 'sails_handoff');
    assert.ok(sailsHandoff.dockPoint);

    fleet.destroy();
  });

  await t.test(
    'Component 7: Property Claim Scout Camera Framing & Picking',
    () => {
      const home = claimDomicileAtLocation({
        lat: 30.2672,
        lon: -97.7431,
        typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
        title: 'Civic District Residence',
      });

      const scout = createPropertyClaimScout();
      assert.ok(scout);

      const active = scout.getActiveDomicile();
      assert.equal(active.id, home.id);

      // Fly to modes (framing with calibrated ranges and angles)
      const overview = scout.flyToDomicile(home.id, {
        mode: 'overview',
      });
      assert.equal(overview.mode, 'overview');
      assert.equal(overview.rangeM, 950);
      assert.equal(overview.pitchDeg, -45);

      const doorstep = scout.flyToDomicile(home.id, {
        mode: 'doorstep',
      });
      assert.equal(doorstep.mode, 'doorstep');
      assert.equal(doorstep.rangeM, 50);
      assert.equal(doorstep.pitchDeg, -20);

      const driveway = scout.flyToDomicile(home.id, {
        mode: 'driveway',
      });
      assert.equal(driveway.mode, 'driveway');
      assert.equal(driveway.rangeM, 75);
      assert.equal(driveway.pitchDeg, -25);

      // Viewport coordinates
      const coords = scout.getViewportCoordinates();
      assert.ok(Number.isFinite(coords.lat));
      assert.ok(Number.isFinite(coords.lon));

      scout.destroy();
    },
  );

  await t.test('Component 8: Procedural Web Audio Estate Engine', () => {
    const audio = createProceduralEstateAudio();
    assert.ok(audio);
    assert.equal(audio.isMuted, true);

    const unmuted = audio.toggleMute();
    assert.equal(unmuted, true);
    assert.equal(audio.isMuted, false);

    // Test procedural synthesis methods safely
    audio.playWindChimes();
    audio.playBicycleBell();
    audio.setFleetMode('ev');
    audio.setEngineSpeed(0.5);

    // Verify force unmute on user interaction
    audio.setMuted(true);
    assert.equal(audio.isMuted, true);
    audio.playWindChimes({ force: true });
    assert.equal(audio.isMuted, false, 'Force play on chimes must auto-unmute audio engine');

    audio.destroy();
  });

  await t.test('Component 9: Estate UI Drawer Contract', () => {
    // 1. SSR / Headless fallback test
    const ssrDrawer = createEstateDrawer();
    assert.ok(ssrDrawer, 'SSR drawer must be returned');
    assert.equal(ssrDrawer.isOpen(), false);
    ssrDrawer.open();
    assert.equal(ssrDrawer.isOpen(), false);
    ssrDrawer.destroy();

    // 2. Mock DOM environment test
    function createMockElement(tagName = 'div') {
      const children = [];
      const listeners = {};
      const attributes = {};
      const element = {
        tagName: tagName.toUpperCase(),
        style: {},
        className: '',
        dataset: {},
        attributes,
        children,
        parentNode: null,
        innerHTML: '',
        getAttribute: (name) =>
          attributes[name] ||
          element.dataset[name?.replace(/^data-/, '')] ||
          '',
        setAttribute: (name, val) => {
          attributes[name] = String(val);
        },
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false,
        },
        addEventListener: (evt, handler) => {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(handler);
        },
        removeEventListener: (evt, handler) => {
          if (!listeners[evt]) return;
          listeners[evt] = listeners[evt].filter((h) => h !== handler);
        },
        dispatchEvent: (evt) => {
          const handlers = listeners[evt.type || evt] || [];
          for (const h of handlers) h(evt);
        },
        appendChild: (child) => {
          children.push(child);
          child.parentNode = element;
          return child;
        },
        removeChild: (child) => {
          const idx = children.indexOf(child);
          if (idx >= 0) children.splice(idx, 1);
          child.parentNode = null;
          return child;
        },
        querySelector: (selector) => {
          element._cache = element._cache || {};
          if (element._cache[selector]) return element._cache[selector];
          const tag =
            selector.includes('btn') || selector.includes('tab')
              ? 'button'
              : 'div';
          const mock = createMockElement(tag);
          if (selector.startsWith('.')) mock.className = selector.slice(1);
          element._cache[selector] = mock;
          return mock;
        },
        querySelectorAll: (selector) => {
          return [createMockElement('button'), createMockElement('button')];
        },
      };
      return element;
    }

    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevReqAnim = globalThis.requestAnimationFrame;

    try {
      const mockBody = createMockElement('body');
      globalThis.document = {
        createElement: (tag) => createMockElement(tag),
        body: mockBody,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      globalThis.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { search: '' },
      };
      globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

      const drawer = createEstateDrawer();
      assert.ok(drawer, 'Drawer must be created in mock DOM');
      assert.equal(drawer.isOpen(), false);

      drawer.open();
      assert.equal(drawer.isOpen(), true);

      drawer.close();
      assert.equal(drawer.isOpen(), false);

      drawer.toggle();
      assert.equal(drawer.isOpen(), true);

      drawer.updateUI();
      drawer.destroy();
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      globalThis.requestAnimationFrame = prevReqAnim;
    }
  });
});
