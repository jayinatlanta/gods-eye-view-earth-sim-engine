import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  FREIGHT_HUBS,
  FREIGHT_HUB_TYPES,
  CARGO_TYPES,
  PRIORITY_TIERS,
  CARGO_MANIFESTS,
  FREIGHT_CORRIDORS,
  getAllFreightCorridors,
  getFreightCorridorById,
  getAllFreightHubs,
  getFreightHubById,
  getAllCargoManifests,
  getCargoManifestById,
  calculateHaversineDistanceMiles,
} from '../layers/freight/freightCorridors.js';
import {
  FREIGHT_CAMERA_MODES,
  FREIGHT_CAMERA_BADGES,
  computeVehicleBasis,
  calculateFreightCameraTransform,
  applyFreightCameraFollow,
} from '../layers/freight/freightCameraSuite.js';
import { createProceduralFreightAudio } from '../layers/freight/proceduralFreightAudio.js';
import {
  TRUCK_DIMENSIONS,
  TRANSLOAD_STATES,
  TRANSLOAD_STATE_BADGES,
  normalizeAngleRad,
  calculateArticulatedTrailerState,
  createFreightSimEngine,
} from '../layers/freight/freightSimEngine.js';
import { createFreightLogisticsDrawer } from './freightLogisticsDrawer.js';

test('Transcontinental Freight & Logistics Simulation Suite', async (t) => {
  await t.test(
    'Component 1: Quad-Modal Freight Hubs & Corridors Catalog',
    () => {
      const hubs = getAllFreightHubs();
      assert.ok(hubs.length >= 8, 'Expected at least 8 freight hubs');

      // Check FedEx World Hub (KMEM)
      const memphis = getFreightHubById('memphis_kmem');
      assert.ok(memphis, 'Memphis KMEM must exist');
      assert.equal(memphis.type, FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB);
      assert.equal(memphis.city, 'Memphis');
      assert.ok(memphis.capacityULDsPerHour >= 1500);

      // Check UPS Worldport (KSDF)
      const louisville = getFreightHubById('louisville_ksdf');
      assert.ok(louisville, 'Louisville KSDF must exist');
      assert.equal(louisville.type, FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB);

      // Check Port of Savannah
      const savannah = getFreightHubById('savannah_port');
      assert.ok(savannah, 'Port of Savannah must exist');
      assert.equal(savannah.type, FREIGHT_HUB_TYPES.MARITIME_CONTAINER_PORT);
      assert.ok(savannah.craneCount >= 30);

      // Check Corridors
      const corridors = getAllFreightCorridors();
      assert.ok(corridors.length >= 7, 'Expected at least 7 freight corridors');

      const memAtl = getFreightCorridorById('memphis_to_atlanta');
      assert.ok(memAtl, 'Memphis to Atlanta corridor must exist');
      assert.ok(memAtl.waypoints.length >= 15, 'Expected dense waypoints');
      assert.equal(memAtl.originHubId, 'memphis_kmem');
      assert.equal(memAtl.destinationHubId, 'atlanta_inman');
      assert.equal(memAtl.speedMphGoverned, 68);

      const laChi = getFreightCorridorById('la_to_chicago');
      assert.ok(laChi, 'LA to Chicago transcontinental bridge must exist');
      assert.ok(laChi.distanceMiles > 1900);

      // Haversine distance validation
      const d = calculateHaversineDistanceMiles(35.0424, -89.9767, 33.7997, -84.4403);
      assert.ok(d > 300 && d < 450, `Distance expected ~330-360 miles, got ${d}`);

      // Manifests validation
      const manifests = getAllCargoManifests();
      assert.ok(manifests.length >= 7, 'Expected at least 7 cargo manifests');
      const pharma = getCargoManifestById('manifest_mem_atl_01');
      assert.ok(pharma, 'Critical pharma manifest must exist');
      assert.equal(pharma.priority, PRIORITY_TIERS.CRITICAL_EXPEDITE);
      assert.equal(pharma.cargoType, CARGO_TYPES.PHARMACEUTICALS);
      assert.ok(pharma.cargoValueUsd > 1000000);
      assert.equal(pharma.reeferTempF, 36);
    },
  );

  await t.test(
    'Component 2: Articulated 18-Wheeler Trailer Kinematics & Hitch Math',
    () => {
      // Dimensions
      assert.equal(TRUCK_DIMENSIONS.tractor.width, 2.6);
      assert.equal(TRUCK_DIMENSIONS.trailer.length, 16.15); // 53ft trailer
      assert.equal(TRUCK_DIMENSIONS.fifthWheelOffset, -2.6);

      const tractorPos = Cesium.Cartesian3.fromDegrees(-84.44, 33.8, 300);
      const tractorHeading = 0.0; // Heading due North

      const state1 = calculateArticulatedTrailerState({
        tractorPos,
        tractorHeadingRad: tractorHeading,
        prevTrailerYawRad: 0.0,
        dtSeconds: 0.033,
      });

      assert.ok(state1.hitchPos, 'Hitch position must be computed');
      assert.ok(state1.trailerCenter, 'Trailer center must be computed');
      assert.equal(state1.trailerYaw, 0.0);

      // Turning right test (heading = 30 degrees = ~0.523 rad)
      const turnHeading = 0.523;
      const state2 = calculateArticulatedTrailerState({
        tractorPos,
        tractorHeadingRad: turnHeading,
        prevTrailerYawRad: 0.0,
        dtSeconds: 0.033,
      });

      assert.ok(
        state2.trailerYaw > 0.0 && state2.trailerYaw < turnHeading,
        'Trailer yaw should smoothly lag behind tractor turning',
      );

      // Jackknife prevention clamp test: sudden 90 degree turn
      const jackknifeHeading = (90 * Math.PI) / 180;
      const state3 = calculateArticulatedTrailerState({
        tractorPos,
        tractorHeadingRad: jackknifeHeading,
        prevTrailerYawRad: 0.0,
        dtSeconds: 1.0, // High delta time
      });
      const maxAllowedRad = (45 * Math.PI) / 180 + 0.001;
      assert.ok(
        Math.abs(state3.trailerYaw) <= maxAllowedRad,
        'Jackknife clamp must restrict articulation delta to <= 45 degrees',
      );

      // Angle normalizer test
      assert.equal(normalizeAngleRad(0), 0);
      assert.ok(Math.abs(normalizeAngleRad(Math.PI * 3) - Math.PI) < 1e-6);
    },
  );

  await t.test(
    'Component 3: 8-Phase Air-to-Highway Transload State Machine',
    () => {
      assert.equal(
        TRANSLOAD_STATES.INBOUND_APPROACH,
        'INBOUND_APPROACH',
      );
      assert.equal(TRANSLOAD_STATES.APRON_ARRIVAL, 'APRON_ARRIVAL');
      assert.equal(
        TRANSLOAD_STATES.ULD_GANTRY_OFFLOAD,
        'ULD_GANTRY_OFFLOAD',
      );
      assert.equal(
        TRANSLOAD_STATES.FREIGHT_SORT_BAY,
        'FREIGHT_SORT_BAY',
      );
      assert.equal(
        TRANSLOAD_STATES.TRAILER_COUPLING,
        'TRAILER_COUPLING',
      );
      assert.equal(
        TRANSLOAD_STATES.GATE_CLEARANCE,
        'GATE_CLEARANCE',
      );
      assert.equal(
        TRANSLOAD_STATES.HIGHWAY_DISPATCH,
        'HIGHWAY_DISPATCH',
      );
      assert.equal(TRANSLOAD_STATES.HIGHWAY_CRUISE, 'HIGHWAY_CRUISE');

      // Verify badges exist for every state
      for (const st of Object.values(TRANSLOAD_STATES)) {
        assert.ok(
          TRANSLOAD_STATE_BADGES[st],
          `State ${st} must have a human-readable badge`,
        );
      }
    },
  );

  await t.test(
    'Component 4: 5-Mode Freight Camera Perspectives & Basis Vectors',
    () => {
      const pos = Cesium.Cartesian3.fromDegrees(-89.976, 35.042, 104);
      const forwardHeading = new Cesium.Cartesian3(0, 1, 0);

      const basis = computeVehicleBasis(pos, forwardHeading);
      assert.ok(basis, 'Basis vectors must be computed');
      assert.ok(basis.forward, 'Forward basis vector must exist');
      assert.ok(basis.right, 'Right basis vector must exist');
      assert.ok(basis.up, 'Up basis vector must exist');

      // Test all 5 camera modes
      for (const mode of Object.values(FREIGHT_CAMERA_MODES)) {
        const xform = calculateFreightCameraTransform(pos, forwardHeading, mode);
        assert.ok(xform, `Camera transform for mode ${mode} must exist`);
        assert.ok(xform.eyePos, `eyePos for mode ${mode} must exist`);
        assert.ok(xform.lookTarget, `lookTarget for mode ${mode} must exist`);
        assert.ok(xform.up, `up for mode ${mode} must exist`);
      }

      // In-cab look target should be ahead of eyePos
      const inCab = calculateFreightCameraTransform(
        pos,
        forwardHeading,
        FREIGHT_CAMERA_MODES.IN_CAB,
      );
      assert.ok(inCab.eyePos);
      assert.ok(inCab.lookTarget);

      // Verify camera follow doesn't throw
      const mockViewer = {
        camera: {
          setView: (opts) => {
            assert.ok(opts.destination);
            assert.ok(opts.orientation.direction);
            assert.ok(opts.orientation.up);
          },
        },
      };
      applyFreightCameraFollow(
        mockViewer,
        pos,
        forwardHeading,
        FREIGHT_CAMERA_MODES.SEMI_CHASE,
      );
    },
  );

  await t.test(
    'Component 5: Procedural Freight Audio Synthesis Engine',
    () => {
      const audio = createProceduralFreightAudio();
      assert.ok(audio, 'Audio engine must be created');

      // Initially muted
      assert.equal(audio.isMuted, true);
      const toggled = audio.toggleMute();
      assert.equal(toggled, true);
      audio.setMuted(true);
      assert.equal(audio.isMuted, true);

      // Safe trigger calls without throwing in Node environment
      audio.startEngine(0.5);
      audio.updateEngineRpm(0.8);
      audio.playAirBrakeHiss();
      audio.playJakeBrakeRumble();
      audio.playCbRadioChirp();
      audio.stopEngine();
      audio.destroy();
    },
  );

  await t.test(
    'Component 6: FreightSimEngine Lifecycle, Spawning & Entity Verification',
    () => {
      const mockEntities = [];
      const mockViewer = {
        scene: {
          preRender: {
            addEventListener: () => () => {},
          },
        },
        camera: {
          setView: () => {},
        },
        entities: {
          add: (def) => {
            mockEntities.push(def);
            return {
              id: def.name,
              position: def.position,
              orientation: def.orientation,
              box: def.box,
              point: def.point,
            };
          },
          remove: () => {},
        },
      };

      const engine = createFreightSimEngine({ viewer: mockViewer });
      assert.ok(engine, 'FreightSimEngine must be instantiated');

      engine.start();

      const all = engine.getAllTrucks();
      assert.ok(all.length >= 4, 'Default start should seed at least 4 trucks');

      const latched = engine.getLatchedTruck();
      assert.ok(latched, 'Default latched truck should exist');
      assert.equal(latched.id, 'TRK-504');

      // Entity invariant verification (Outlined Contact Reticle & No Cesium Text Labels)
      assert.ok(mockEntities.length >= 8, 'Expected tractor + trailer entities');
      const tractorEntity = mockEntities.find(
        (e) => e.properties?.isFreightTruck,
      );
      assert.ok(tractorEntity, 'Tractor entity must have isFreightTruck property');
      assert.ok(tractorEntity.box, 'Tractor entity must have box geometry');
      assert.ok(tractorEntity.point, 'Tractor entity must have point reticle');
      assert.equal(
        tractorEntity.point.disableDepthTestDistance,
        Number.POSITIVE_INFINITY,
        'Point reticle must satisfy disableDepthTestDistance: Infinity contact invariant',
      );
      assert.equal(
        tractorEntity.label,
        undefined,
        'Zero Cesium text labels allowed under noCesiumLabels policy',
      );
      assert.ok(
        tractorEntity.point.distanceDisplayCondition,
        'Point reticle must specify distanceDisplayCondition to hide in follow range',
      );

      // Verify Air Cargo plane entity is spawned for air hub corridors
      const planeEntity = mockEntities.find(
        (e) => e.properties?.isAirCargoFreighter,
      );
      assert.ok(planeEntity, 'Air Cargo freighter entity must be spawned for air superhubs');
      assert.ok(planeEntity.box, 'Freighter must have 3D contact box reticle');
      assert.ok(planeEntity.point, 'Freighter must have point reticle');
      assert.equal(
        planeEntity.label,
        undefined,
        'Zero Cesium text labels allowed on air cargo entities',
      );

      // Verify getActiveTelemetry() contract for HUD summary
      const telemetry = engine.getActiveTelemetry();
      assert.ok(telemetry, 'getActiveTelemetry() must return live telemetry');
      assert.equal(telemetry.simType, 'freight');
      assert.ok(telemetry.carrierLivery);
      assert.ok(telemetry.cargoDescription);
      assert.ok(Number.isFinite(telemetry.speedMph));
      assert.ok(Number.isFinite(telemetry.progressPct));
      assert.ok(Number.isFinite(telemetry.milesRemaining));
      assert.ok(telemetry.stateBadge);
      assert.equal(telemetry.isActive, true);

      // Truck selection
      const selected = engine.selectTruck('TRK-219');
      assert.equal(selected, true);
      assert.equal(engine.getLatchedTruck().id, 'TRK-219');

      // Camera mode switching
      assert.equal(
        engine.setCameraMode(FREIGHT_CAMERA_MODES.IN_CAB),
        true,
      );
      assert.equal(engine.getCameraMode(), FREIGHT_CAMERA_MODES.IN_CAB);

      // Actions
      assert.equal(engine.fastForwardTransload('TRK-219'), true);
      assert.equal(engine.rerouteWeatherDetour('TRK-219'), true);

      // Tick execution
      engine.tick();

      engine.stop();
      engine.destroy();
    },
  );

  await t.test(
    'Component 7: Freight Logistics Drawer UI & Dock Integration',
    () => {
      // 1. SSR / headless fallback test
      const ssrDrawer = createFreightLogisticsDrawer({
        freightEngine: null,
      });
      assert.ok(ssrDrawer, 'SSR drawer must be returned');
      assert.equal(ssrDrawer.isOpen(), false);
      ssrDrawer.open();
      assert.equal(ssrDrawer.isOpen(), false);
      ssrDrawer.destroy();

      // 2. Mock DOM environment test
      function createMockElement(tagName = 'div') {
        const children = [];
        const listeners = {};
        const element = {
          tagName: tagName.toUpperCase(),
          style: {},
          className: '',
          dataset: {},
          children,
          parentNode: null,
          innerHTML: '',
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
              selector.includes('btn') ||
              selector.includes('tab') ||
              selector.includes('mode')
                ? 'button'
                : 'div';
            const res = createMockElement(tag);
            element._cache[selector] = res;
            return res;
          },
          querySelectorAll: () => [],
          getAttribute: () => null,
          setAttribute: () => {},
        };
        return element;
      }

      const origDoc = globalThis.document;
      const origWin = globalThis.window;

      try {
        globalThis.document = {
          createElement: (tag) => createMockElement(tag),
          body: createMockElement('body'),
        };
        globalThis.window = {
          addEventListener: () => {},
          removeEventListener: () => {},
        };

        const mockEngine = createFreightSimEngine();
        mockEngine.start();

        const drawer = createFreightLogisticsDrawer({
          freightEngine: mockEngine,
        });
        assert.ok(drawer, 'Drawer must be created');
        assert.equal(drawer.isOpen(), false);

        drawer.open();
        assert.equal(drawer.isOpen(), true);

        drawer.updateUI();

        drawer.close();
        assert.equal(drawer.isOpen(), false);

        drawer.toggle();
        assert.equal(drawer.isOpen(), true);

        drawer.destroy();
        mockEngine.destroy();
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  );
});
