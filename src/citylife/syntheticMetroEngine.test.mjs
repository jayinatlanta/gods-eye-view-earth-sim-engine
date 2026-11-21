import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createSyntheticMetroEngine,
  RAPID_TRANSIT_ROUTES,
  METRO_NETWORKS_BY_CITY,
  getCityMetroRoutes,
  buildMetroTrajectory,
  sampleMetroTrajectory,
  METRO_CAR_DIMENSIONS,
} from '../layers/citylife/syntheticMetroEngine.js';

test('Living City Transit — Urban Heavy Rail & Rapid Transit Engine', async (t) => {
  function createMockViewer() {
    const entities = [];
    const primitives = [];
    return {
      entities: {
        add: (spec) => {
          const e = { ...spec, _id: `train_${entities.length}` };
          entities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = entities.indexOf(e);
          if (idx >= 0) entities.splice(idx, 1);
        },
        _all: entities,
      },
      camera: {
        setView: () => {},
      },
      scene: {
        primitives: {
          added: primitives,
          add: (p) => {
            primitives.push(p);
            return p;
          },
          remove: (p) => {
            const idx = primitives.indexOf(p);
            if (idx >= 0) primitives.splice(idx, 1);
          },
        },
        preRender: {
          addEventListener: () => () => {},
        },
      },
    };
  }

  await t.test(
    'RAPID_TRANSIT_ROUTES catalogs elevated loops and subway corridors',
    () => {
      assert.ok(RAPID_TRANSIT_ROUTES.chicago_cta_loop);
      assert.ok(RAPID_TRANSIT_ROUTES.tokyo_yamanote);
      assert.ok(RAPID_TRANSIT_ROUTES.atlanta_marta_rail);
      assert.ok(RAPID_TRANSIT_ROUTES.new_york_subway_7);
      assert.ok(RAPID_TRANSIT_ROUTES.london_tube_circle);

      const loop = RAPID_TRANSIT_ROUTES.chicago_cta_loop;
      assert.equal(loop.operator, 'CTA');
      assert.equal(loop.isElevated, true);
      assert.equal(loop.elevOffsetMeters, 5.5);
      assert.equal(loop.carsPerTrain, 6);
    },
  );

  await t.test(
    'buildMetroTrajectory applies elevated viaduct clearance height',
    () => {
      const route = RAPID_TRANSIT_ROUTES.chicago_cta_loop;
      const traj = buildMetroTrajectory(
        route.waypoints,
        route.elevOffsetMeters,
      );
      assert.ok(traj);
      assert.ok(traj.totalDistance > 500);

      const sample = sampleMetroTrajectory(traj, 100);
      assert.ok(sample.pos);
      assert.ok(sample.forward);
      const mag = Cesium.Cartesian3.magnitude(sample.forward);
      assert.ok(Math.abs(mag - 1.0) < 1e-4);
    },
  );

  await t.test(
    'startMetroSystem spawns unified long consist entities with centipede juncture count and telemetry',
    () => {
      const viewer = createMockViewer();
      const engine = createSyntheticMetroEngine({ viewer });

      assert.equal(engine.isSimActive(), false);
      const trains = engine.startMetroSystem('chicago', { trainCount: 2 });

      assert.equal(engine.isSimActive(), true);
      assert.equal(trains.length, 2);

      const train = trains[0];
      const expectedLength =
        6 * METRO_CAR_DIMENSIONS.length + 5 * METRO_CAR_DIMENSIONS.couplerGap;
      assert.equal(train.carsCount, 6);
      assert.equal(train.carEntities.length, 1); // Single unified consist entity (high-perf)
      assert.equal(train.junctureCount, 5); // 5 centipede car junctures for a 6-car train
      assert.equal(viewer.entities._all.length, 2); // Only 1 entity per train

      const consist = train.consistEntity;
      assert.equal(consist.properties.isSyntheticMetro, true);
      assert.equal(consist.properties.isLeadCar, true);
      assert.equal(consist.box.outline, true);
      assert.equal(consist.box.outlineWidth, 3.0);
      assert.equal(consist.box.outlineColor, Cesium.Color.WHITE);
      assert.equal(consist.box.dimensions.x, METRO_CAR_DIMENSIONS.width);
      assert.ok(Math.abs(consist.box.dimensions.y - expectedLength) < 1e-6);
      assert.ok(consist.point);
      assert.equal(
        consist.point.disableDepthTestDistance,
        Number.POSITIVE_INFINITY,
      );
      assert.equal(consist.point.outlineColor, Cesium.Color.WHITE);

      const telem = engine.getActiveTelemetry();
      assert.ok(telem);
      assert.equal(telem.mode, 'METRO');
      assert.equal(telem.carsCount, 6);
      assert.equal(telem.isElevated, true);
      assert.equal(telem.isCameraEnabled, true);

      engine.stopMetroSystem();
      assert.equal(engine.isSimActive(), false);
    },
  );

  await t.test(
    'trains stay flat along corridor grade in Google 3D Tiles mode (no building rooftop climbs)',
    () => {
      let tickCb = null;
      const viewer = createMockViewer();
      viewer.scene.globe = { show: false };
      viewer.scene.sampleHeightSupported = true;
      // Simulate a tall 120m skyscraper rooftop directly over the track
      viewer.scene.sampleHeight = () => 9999;
      viewer.scene.preRender.addEventListener = (cb) => {
        tickCb = cb;
        return () => {};
      };

      const engine = createSyntheticMetroEngine({ viewer });
      const trains = engine.startMetroSystem('atlanta', { trainCount: 1 });
      const train = trains[0];
      const baseHeight = Cesium.Cartographic.fromCartesian(
        train.cars[0].currentPos,
      ).height;

      tickCb();

      const updatedHeight = Cesium.Cartographic.fromCartesian(
        train.cars[0].currentPos,
      ).height;
      assert.ok(
        updatedHeight < 1000,
        `Train must not climb 3D building rooftops (got ${updatedHeight}m)`,
      );
      assert.ok(
        Math.abs(updatedHeight - baseHeight) < 20,
        'Train elevation stays anchored to track corridor grade',
      );

      engine.destroy();
    },
  );

  await t.test(
    'supports train selection, establishing map, snapBack, and camera choreographies',
    () => {
      let flyToCalled = false;
      const viewer = createMockViewer();
      viewer.camera.flyTo = () => {
        flyToCalled = true;
      };
      const engine = createSyntheticMetroEngine({ viewer });
      const trains = engine.startMetroSystem('tokyo', { trainCount: 2 });

      assert.equal(engine.getCameraMode(), 'chase');
      engine.setCameraMode('lead_cab');
      assert.equal(engine.getCameraMode(), 'lead_cab');
      engine.setCameraMode('passenger_window');
      assert.equal(engine.getCameraMode(), 'passenger_window');
      engine.setCameraMode('heli');
      assert.equal(engine.getCameraMode(), 'heli');

      // Establishing Map frames full multi-line system and restores contact dots even when exiting cab mode
      let flyArgs = null;
      viewer.camera.flyTo = (opts) => {
        flyToCalled = true;
        flyArgs = opts;
      };
      engine.setCameraMode('lead_cab');
      if (trains[0].cars[0]?.entity?.point) {
        trains[0].cars[0].entity.point.show = false;
      }
      engine.showTransitMap();
      assert.equal(engine.getCameraMode(), 'overview');
      assert.equal(engine.isCameraEnabled(), false);
      assert.equal(flyToCalled, true);
      assert.ok(
        flyArgs?.destination,
        'map overview supplies camera destination',
      );
      assert.equal(
        trains[0].cars[0].entity.point.show,
        true,
        'map overview restores active train contact dots immediately',
      );
      const metroPrimitivesAdded = viewer.scene.primitives.added || [];
      assert.ok(
        metroPrimitivesAdded.length >= 2,
        'adds batched route corridor & station primitives on startup',
      );
      assert.equal(engine.isRouteLinesVisible(), true);
      engine.setRouteLinesVisible(false);
      assert.equal(engine.isRouteLinesVisible(), false);
      assert.ok(
        metroPrimitivesAdded.some((p) => p.show === false),
        'hiding route lines sets route/station overlay collections hidden',
      );
      engine.setRouteLinesVisible(true);
      assert.equal(engine.isRouteLinesVisible(), true);
      const camCarto = Cesium.Cartographic.fromCartesian(flyArgs.destination);
      assert.ok(
        camCarto.height >= 3600,
        `metro network map frames whole system from high vantage (got ${Math.round(camCarto.height)}m)`,
      );

      // Snap Back to latched train
      engine.snapBack('chase');
      assert.equal(engine.getCameraMode(), 'chase');
      assert.equal(engine.isCameraEnabled(), true);

      // Camera enable/disable toggles
      engine.setCameraEnabled(false);
      assert.equal(engine.isCameraEnabled(), false);
      engine.setCameraEnabled(true);
      assert.equal(engine.isCameraEnabled(), true);

      const switched = engine.setActiveTrain(trains[1].id);
      assert.equal(switched, true);
      assert.equal(engine.getActiveTrain().id, trains[1].id);

      engine.destroy();
    },
  );

  await t.test(
    'advances sequential targetStationIndex on station departure without getting stuck',
    () => {
      let tickCb = null;
      const viewer = createMockViewer();
      viewer.scene.preRender.addEventListener = (cb) => {
        tickCb = cb;
        return () => {};
      };

      const engine = createSyntheticMetroEngine({ viewer });
      const trains = engine.startMetroSystem('chicago', { trainCount: 1 });
      const train = trains[0];

      assert.ok(train.targetStationIndex !== undefined);
      const initialTargetIdx = train.targetStationIndex;

      // Simulate arriving at station
      train.state = 'APPROACHING_STATION';
      train.speedMs = 0.2;
      tickCb(); // transitions to DWELL

      assert.equal(train.state, 'DWELL');
      assert.ok(train.dwellTimerSec > 0);

      // Force dwell completion
      train.dwellTimerSec = 0.001;
      tickCb(); // completes dwell, advances targetStationIndex, transitions to DEPARTING

      assert.equal(train.state, 'DEPARTING');
      assert.equal(
        train.targetStationIndex,
        (initialTargetIdx + 1) % train.route.stations.length,
        'targetStationIndex must advance to the next sequential station',
      );

      // Departs cleanly
      train.departTimerSec = 0.001;
      tickCb();
      assert.equal(train.state, 'CRUISING');

      engine.destroy();
    },
  );

  await t.test(
    'METRO_NETWORKS_BY_CITY catalogs all 9 major metropolitan regions',
    () => {
      const requiredCities = [
        'atlanta',
        'los_angeles',
        'san_francisco',
        'washington_dc',
        'northeast_corridor',
        'chicago',
        'new_york',
        'london',
        'tokyo',
      ];

      for (const city of requiredCities) {
        assert.ok(
          METRO_NETWORKS_BY_CITY[city] &&
            METRO_NETWORKS_BY_CITY[city].length > 0,
          `Expected routes defined for ${city}`,
        );
        const routes = getCityMetroRoutes(city);
        assert.ok(routes.length > 0);
        for (const r of routes) {
          assert.ok(r.id, 'Route must have id');
          assert.ok(r.name, 'Route must have name');
          assert.ok(
            r.waypoints && r.waypoints.length >= 2,
            'Route must have waypoints',
          );
          assert.ok(
            r.stations && r.stations.length >= 2,
            'Route must have stations',
          );
        }
      }
    },
  );

  await t.test(
    'spawns simultaneous multi-line metro networks for Atlanta and Northeast Corridor',
    () => {
      const viewer = createMockViewer();
      const engine = createSyntheticMetroEngine({ viewer });

      // Atlanta: 5 lines (Red, Gold, Blue, Green, Streetcar)
      const atlantaTrains = engine.startMetroSystem('atlanta');
      assert.ok(
        atlantaTrains.length >= 5,
        'Atlanta should spawn trains across all lines',
      );
      const atlantaLines = new Set(atlantaTrains.map((t) => t.route.id));
      assert.ok(atlantaLines.has('marta_red'));
      assert.ok(atlantaLines.has('marta_blue'));
      assert.ok(atlantaLines.has('marta_gold'));
      assert.ok(atlantaLines.has('marta_green'));
      assert.ok(atlantaLines.has('marta_streetcar'));

      // Northeast Corridor: 2 lines (Acela Express & Regional Rail)
      const necTrains = engine.startMetroSystem('northeast_corridor');
      assert.ok(
        necTrains.length >= 2,
        'NEC should spawn trains across Acela & Regional',
      );
      const necLines = new Set(necTrains.map((t) => t.route.id));
      assert.ok(necLines.has('nec_acela_express'));
      assert.ok(necLines.has('nec_regional_rail'));

      engine.destroy();
    },
  );

  await t.test(
    'supports 3D screen position picking and onTrainSelected callback dispatch',
    () => {
      let selectedTrain = null;
      const viewer = createMockViewer();
      const engine = createSyntheticMetroEngine({ viewer });
      const trains = engine.startMetroSystem('chicago', { trainCount: 2 });

      engine.onTrainSelected((train) => {
        selectedTrain = train;
      });

      const targetTrain = trains[1];
      const leadCarEntity = targetTrain.cars[0].entity;

      // Mock scene.pick
      viewer.scene.pick = (pos) => {
        if (pos.x === 100 && pos.y === 200) {
          return { id: leadCarEntity };
        }
        return null;
      };

      const picked = engine.pickTrainAtScreenPosition({ x: 100, y: 200 });
      assert.ok(picked);
      assert.equal(picked.id, targetTrain.id);
      assert.equal(selectedTrain.id, targetTrain.id);
      assert.equal(engine.getActiveTrain().id, targetTrain.id);

      engine.destroy();
    },
  );
});
