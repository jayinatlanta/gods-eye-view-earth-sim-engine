import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';

import {
  getAllHelipads,
  getHelipadById,
  resolveHelipad,
  findNearestHelipad,
} from '../flight/helipadCatalog.js';

import {
  createSyntheticFlightEngine,
  resolveWaypoint,
} from '../flight/syntheticFlightEngine.js';

import {
  createPersonalFleetEngine,
  FLEET_MODES,
} from '../layers/estates/personalFleetEngine.js';

import {
  createProceduralHelicopterAudio,
} from '../layers/estates/proceduralHelicopterAudio.js';

import {
  createCompositeTravelEngine,
  TRAVEL_LEGS,
} from '../flight/compositeTravelEngine.js';

import {
  claimDomicileAtLocation,
  clearClaimedDomicilesForTest,
  DOMICILE_TYPOLOGIES,
} from '../layers/estates/domicileCatalog.js';

test('Multi-Modal Planetary Travel, Doorstep Road Trips & Meditative Rotorcraft Simulator Suite', async (t) => {
  t.beforeEach(() => {
    clearClaimedDomicilesForTest();
  });

  await t.test(
    'Component 1: Dedicated Helipad Waypoint Network & Spatial Nearest Search',
    () => {
      const helipads = getAllHelipads();
      assert.equal(helipads.length, 7, 'Expected 7 curated helipads');

      // Verify specific helipads exist
      const pdk = getHelipadById('PDK_PAD');
      assert.ok(pdk, 'KPDK helipad must exist');
      assert.equal(pdk.code, 'PDK_PAD');
      assert.equal(pdk.elev, 306);

      const civic = getHelipadById('CIVIC_PAD');
      assert.ok(civic, 'Zilker helipad must exist');
      assert.equal(civic.elev, 165);

      // Verify resolution by name
      const peach191 = resolveHelipad('191 Peachtree');
      assert.ok(peach191, 'Must resolve 191 Peachtree helipad');
      assert.equal(peach191.code, '191_ATL');
      assert.equal(peach191.type, 'rooftop_helipad');

      // Verify spatial nearest query
      const nearest = findNearestHelipad(30.2672, -97.7431);
      assert.ok(nearest);
      assert.equal(nearest.code, 'CIVIC_PAD');

      // Nearest to mountain sanctuary
      const mountainNearest = findNearestHelipad(34.865, -84.325);
      assert.ok(mountainNearest);
      assert.equal(mountainNearest.code, 'ALPINE_RIDGE_PAD');
    },
  );

  await t.test(
    'Component 2: Synthetic Flight Engine KPDK & Meditative Rotorcraft Flight Simulation',
    async () => {
      // Test KPDK waypoint resolution
      const kpdkWp = resolveWaypoint('KPDK');
      assert.ok(kpdkWp, 'KPDK waypoint must resolve');
      assert.equal(kpdkWp.lat, 33.8756);
      assert.equal(kpdkWp.lon, -84.302);
      assert.equal(kpdkWp.elev, 306);

      const pdkWp = resolveWaypoint('PDK');
      assert.ok(pdkWp, 'PDK IATA code must resolve');
      assert.equal(pdkWp.lat, 33.8756);

      // Test Helipad resolution inside resolveWaypoint
      const heliWp = resolveWaypoint('PDK_PAD');
      assert.ok(heliWp, 'PDK_PAD helipad waypoint must resolve');
      assert.equal(heliWp.name, 'KPDK Signature/Epps Helipad (Atlanta)');

      // Mock Cesium Viewer
      const entities = [];
      const mockViewer = {
        clock: {
          startTime: Cesium.JulianDate.now(),
          stopTime: Cesium.JulianDate.addSeconds(
            Cesium.JulianDate.now(),
            120,
            new Cesium.JulianDate(),
          ),
          currentTime: Cesium.JulianDate.now(),
          shouldAnimate: true,
        },
        entities: {
          add: (ent) => {
            entities.push(ent);
            return ent;
          },
          remove: (ent) => {
            const idx = entities.indexOf(ent);
            if (idx >= 0) entities.splice(idx, 1);
          },
        },
      };

      const flightEngine = createSyntheticFlightEngine(mockViewer);
      assert.ok(flightEngine);

      // Spawn rotorcraft flight from Civic pad to KPDK Helipad
      const flight = await flightEngine.spawnFlightRoute({
        origin: 'CIVIC_PAD',
        destination: 'PDK_PAD',
        isRotorcraft: true,
      });

      assert.ok(flight, 'Spawned rotorcraft flight must exist');
      assert.equal(flight.isRotorcraft, true);
      assert.equal(flight.callsign, 'N145FX');
      assert.equal(flight.aircraftType, 'Airbus H145 / Helicopter');
      assert.equal(flight.cruiseAlt, 305, 'Low-and-slow cruise altitude at 1,000 ft AGL');

      // Verify active telemetry
      const telem = flightEngine.getActiveTelemetry();
      assert.ok(telem);
      assert.equal(telem.isRotorcraft, true);
      assert.equal(telem.aircraftType, 'Airbus H145 / Helicopter');
      assert.equal(telem.mode, 'ROTORCRAFT SIMULATOR');
      assert.equal(telem.callsign, 'N145FX');

      flightEngine.destroy();
    },
  );

  await t.test(
    'Component 3: Personal Fleet Engine — Airbus H145 Mode & Helionix 4-Axis Hover Hold',
    () => {
      // Verify FLEET_MODES.H145 specification
      const h145Mode = FLEET_MODES.H145;
      assert.ok(h145Mode, 'H145 fleet mode must be defined');
      assert.equal(h145Mode.id, 'h145');
      assert.equal(h145Mode.name, 'Airbus H145 (Fenestron)');
      assert.equal(h145Mode.speedMps, 46.3, 'Cruise speed ~104 mph');
      assert.equal(h145Mode.cruiseAltM, 305, '1,000 ft AGL cruise altitude');
      assert.equal(h145Mode.isRotorcraft, true);
      assert.equal(h145Mode.hasFenestron, true);
      assert.equal(h145Mode.modelUri, '/models/bell206.glb');

      // Mock Cesium Viewer
      const entities = [];
      const mockViewer = {
        entities: {
          add: (ent) => {
            entities.push(ent);
            return ent;
          },
          remove: (ent) => {
            const idx = entities.indexOf(ent);
            if (idx >= 0) entities.splice(idx, 1);
          },
        },
      };

      const fleetEngine = createPersonalFleetEngine(mockViewer);
      assert.ok(fleetEngine);

      // Claim a test home and spawn fleet
      const home = claimDomicileAtLocation({
        lat: 30.2672,
        lon: -97.7431,
        typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
        title: 'Civic District Residence',
      });
      fleetEngine.spawnAtDomicile(home);

      // Switch to Airbus H145 mode
      fleetEngine.setFleetMode('h145');
      assert.equal(fleetEngine.activeMode.id, 'h145');
      assert.equal(fleetEngine.currentAlt, 305);

      // Test Cockpit Camera modes
      fleetEngine.setCameraMode('chin_bubble');
      assert.equal(fleetEngine.getCameraMode(), 'chin_bubble');
      fleetEngine.setCameraMode('meditation_orbit');
      assert.equal(fleetEngine.getCameraMode(), 'meditation_orbit');
      fleetEngine.setCameraMode('heli_chase');
      assert.equal(fleetEngine.getCameraMode(), 'heli_chase');

      // Test Helionix 4-Axis Hover Hold Kinematics
      fleetEngine.start();
      assert.equal(fleetEngine.isHovering, false);
      const isHoverNow = fleetEngine.setHover(true);
      assert.equal(isHoverNow, true);
      assert.equal(fleetEngine.isHovering, true);

      // Initial position before hover step
      const latBefore = fleetEngine.currentCoords.lat;
      const lonBefore = fleetEngine.currentCoords.lon;
      const headingBefore = fleetEngine.headingDeg;

      fleetEngine.step(2.0); // 2 seconds of hover hold

      // Under Helionix hover hold, position remains rock solid stationary, while gentle 12°/s yaw rotation operates
      assert.equal(fleetEngine.currentCoords.lat, latBefore);
      assert.equal(fleetEngine.currentCoords.lon, lonBefore);
      assert.ok(fleetEngine.headingDeg !== headingBefore, 'Gentle 12°/s yaw rotation for panoramic view');

      // Toggle hover off and advance forward
      fleetEngine.toggleHover();
      assert.equal(fleetEngine.isHovering, false);

      fleetEngine.step(2.0);
      assert.ok(
        fleetEngine.currentCoords.lat !== latBefore || fleetEngine.currentCoords.lon !== lonBefore,
        'Should advance forward at 104 mph when hover is released',
      );

      // Test Telemetry
      const telem = fleetEngine.getActiveTelemetry();
      assert.ok(telem);
      assert.equal(telem.isRotorcraft, true);
      assert.equal(telem.altitudeM, 305);
      assert.equal(telem.hasFenestron, true);
      assert.equal(telem.cameraMode, 'heli_chase');

      // Test Handoffs
      let roadTripStarted = false;
      fleetEngine.handoffToRoadTrip({
        id: 'dest_test',
        lat: 33.8756,
        lon: -84.302,
        title: 'KPDK Handoff',
      });
      assert.equal(fleetEngine.activeMode.id, 'ev', 'Road trip handoff switches vehicle to EV');

      // Rotorcraft heli-flight handoff
      fleetEngine.handoffToHelicopterFlight({
        id: 'PDK_PAD',
        lat: 33.8756,
        lon: -84.302,
        name: 'Peachtree DeKalb Helipad',
      });
      assert.equal(fleetEngine.activeMode.id, 'h145', 'Helicopter flight handoff switches to H145');

      fleetEngine.destroy();
    },
  );

  await t.test(
    'Component 4: Procedural Web Audio Helicopter Engine — 5-Blade Rotor, Fenestron & Safran Turbines',
    () => {
      // 1. SSR / Null Context Graceful Handling
      const ssrAudio = createProceduralHelicopterAudio();
      assert.ok(ssrAudio);
      assert.equal(ssrAudio.isPlaying, false);
      ssrAudio.start();
      assert.equal(ssrAudio.isPlaying, false, 'Start without audio context must be no-op');
      ssrAudio.setEngineSpeed(0.5);
      ssrAudio.setHover(true);
      ssrAudio.stop();
      ssrAudio.destroy();

      // 2. Active Web Audio Context Graph Verification
      const mockAudioCtx = {
        currentTime: 10.0,
        createOscillator: () => ({
          type: 'sine',
          frequency: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
          disconnect: () => {},
        }),
        createGain: () => ({
          gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
          connect: () => {},
        }),
        createBiquadFilter: () => ({
          type: 'lowpass',
          frequency: { setValueAtTime: () => {} },
          Q: { setValueAtTime: () => {} },
          connect: () => {},
        }),
      };
      const mockMasterGain = { connect: () => {} };

      const heliAudio = createProceduralHelicopterAudio(mockAudioCtx, mockMasterGain);
      assert.ok(heliAudio);
      assert.equal(heliAudio.isPlaying, false);

      heliAudio.start();
      assert.equal(heliAudio.isPlaying, true, 'Helicopter soundscape must become active');

      heliAudio.setEngineSpeed(0.85);
      assert.equal(heliAudio.currentRatio, 0.85);

      heliAudio.setHover(true);
      assert.equal(heliAudio.isHovering, true);

      heliAudio.setHover(false);
      assert.equal(heliAudio.isHovering, false);

      heliAudio.stop();
      heliAudio.destroy();
    },
  );

  await t.test(
    'Component 5: Composite Multi-Modal Planetary Journey Orchestrator (5-Leg Journey)',
    () => {
      const compositeTravel = createCompositeTravelEngine({
        syntheticFlight: {
          spawnFlightRoute: (route) => ({
            id: 'mock_flight',
            ...route,
          }),
        },
        fleetEngine: {
          start: () => {},
          setFleetMode: () => {},
        },
      });

      assert.ok(compositeTravel);

      const home = claimDomicileAtLocation({
        lat: 30.2672,
        lon: -97.7431,
        typology: DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
        title: 'Civic District Residence',
      });

      const mountainSanctuary = claimDomicileAtLocation({
        lat: 30.351,
        lon: -97.812,
        typology: DOMICILE_TYPOLOGIES.VACATION_SANCTUARY,
        title: 'Mountain Overlook Cabin',
      });

      // Plan 5-leg journey
      const plan = compositeTravel.planCompositeJourney({
        originDomicile: home,
        destinationDomicileOrPoint: mountainSanctuary,
        flightMode: 'h145',
      });

      assert.ok(plan, 'Plan must exist');
      assert.equal(plan.legs.length, 5, 'Composite journey must consist of exactly 5 legs');
      assert.equal(plan.legs[0].id, TRAVEL_LEGS.LEG_1_GROUND_DRIVEWAY);
      assert.equal(plan.legs[1].id, TRAVEL_LEGS.LEG_2_AIRFIELD_BOARDING);
      assert.equal(plan.legs[2].id, TRAVEL_LEGS.LEG_3_AIRBORNE_CRUISE);
      assert.equal(plan.legs[3].id, TRAVEL_LEGS.LEG_4_ARRIVAL_TRANSFER);
      assert.equal(plan.legs[4].id, TRAVEL_LEGS.LEG_5_DESTINATION_ARRIVAL);

      assert.ok(plan.totalDistanceMiles > 0, 'Total distance must be computed');
      assert.equal(plan.originDomicile.title, 'Civic District Residence');
      assert.equal(plan.destinationDomicileOrPoint.title, 'Mountain Overlook Cabin');

      // Start journey
      const started = compositeTravel.startJourney();
      assert.ok(started);
      assert.equal(started.isTraveling, true);

      let telem = compositeTravel.getActiveTelemetry();
      assert.ok(telem);
      assert.equal(telem.isTraveling, true);
      assert.equal(telem.currentLegIndex, 1);
      assert.equal(telem.status, TRAVEL_LEGS.LEG_1_GROUND_DRIVEWAY);

      // Advance through all 5 legs
      compositeTravel.advanceLeg(); // To Leg 2
      telem = compositeTravel.getActiveTelemetry();
      assert.equal(telem.currentLegIndex, 2);
      assert.equal(telem.status, TRAVEL_LEGS.LEG_2_AIRFIELD_BOARDING);

      compositeTravel.advanceLeg(); // To Leg 3 (Airborne Cruise)
      telem = compositeTravel.getActiveTelemetry();
      assert.equal(telem.currentLegIndex, 3);
      assert.equal(telem.status, TRAVEL_LEGS.LEG_3_AIRBORNE_CRUISE);

      compositeTravel.advanceLeg(); // To Leg 4
      telem = compositeTravel.getActiveTelemetry();
      assert.equal(telem.currentLegIndex, 4);
      assert.equal(telem.status, TRAVEL_LEGS.LEG_4_ARRIVAL_TRANSFER);

      compositeTravel.advanceLeg(); // To Leg 5 (Arrival)
      telem = compositeTravel.getActiveTelemetry();
      assert.equal(telem.currentLegIndex, 5);
      assert.equal(telem.status, TRAVEL_LEGS.LEG_5_DESTINATION_ARRIVAL);

      // Final advance completes journey
      compositeTravel.advanceLeg();
      telem = compositeTravel.getActiveTelemetry();
      assert.equal(telem.isTraveling, false, 'Journey should be marked completed');
      assert.equal(telem.isCompleted, true);

      compositeTravel.destroy();
    },
  );
});
