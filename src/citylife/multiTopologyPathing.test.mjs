import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  TOPOLOGY_MODES,
  calculateShoulderOffset,
  generateFurrowRaster,
  calculateCoasterKinematics,
  generateSerpentineQueue,
  generatePastureWander,
  generateDollyTrackSpline,
  generateCraneSwingArc,
  generateFerrisWheelRing,
  generateMultiTopologyTrajectory,
} from '../layers/citylife/multiTopologyPathing.js';

test('Living World — Universal Multi-Topology Pathing Engine', async (t) => {
  await t.test('verifies all topology modes are cataloged', () => {
    assert.equal(TOPOLOGY_MODES.SIDEWALK, 'sidewalk');
    assert.equal(TOPOLOGY_MODES.RURAL_SHOULDER, 'rural_shoulder');
    assert.equal(TOPOLOGY_MODES.PIER_BOARDWALK, 'pier');
    assert.equal(TOPOLOGY_MODES.AGRICULTURAL_SWATH, 'agricultural_swath');
    assert.equal(TOPOLOGY_MODES.PASTURE_WANDER, 'pasture_wander');
    assert.equal(TOPOLOGY_MODES.MIDWAY_CONCOURSE, 'midway_concourse');
    assert.equal(TOPOLOGY_MODES.QUEUE_SWITCHBACK, 'queue_switchback');
    assert.equal(TOPOLOGY_MODES.COASTER_SPLINE, 'coaster_spline');
    assert.equal(TOPOLOGY_MODES.MINIATURE_RAIL, 'miniature_rail');
    assert.equal(TOPOLOGY_MODES.STUDIO_BACKLOT_LANE, 'studio_backlot_lane');
    assert.equal(TOPOLOGY_MODES.DOLLY_TRACK_SPLINE, 'dolly_track_spline');
    assert.equal(TOPOLOGY_MODES.CRANE_SWING_ARC, 'crane_swing_arc');
    assert.equal(TOPOLOGY_MODES.FERRIS_WHEEL_RING, 'ferris_wheel_ring');
  });

  await t.test(
    'calculateShoulderOffset computes lateral displacement and elevation offset',
    () => {
      const p1 = { lat: 31.3702, lon: -81.434, elev: 5 };
      const p2 = { lat: 31.3722, lon: -81.434, elev: 5 }; // Northward vector

      const offset = calculateShoulderOffset(p1, p2, 2.0, 0.1);
      assert.ok(offset.cartesian);
      assert.ok(typeof offset.lat === 'number');
      assert.ok(typeof offset.lon === 'number');
      // Height should reflect elevation offset
      assert.ok(offset.elev > 5.0 && offset.elev < 5.25);
    },
  );

  await t.test(
    'generateFurrowRaster creates alternating parallel swaths with 180 deg hairpins',
    () => {
      const furrows = generateFurrowRaster({
        minLat: 42.03,
        maxLat: 42.04,
        minLon: -93.62,
        maxLon: -93.61,
        swathCount: 4,
        elev: 290,
      });

      assert.equal(furrows.length, 8); // 4 swaths * 2 points each
      // Swath 0: minLon -> maxLon
      assert.equal(furrows[0].lon, -93.62);
      assert.equal(furrows[1].lon, -93.61);
      // Swath 1: maxLon -> minLon (180 deg turnaround)
      assert.equal(furrows[2].lon, -93.61);
      assert.equal(furrows[3].lon, -93.62);
    },
  );

  await t.test(
    'calculateCoasterKinematics computes lift hill speed and gravity drop acceleration',
    () => {
      const waypoints = [
        { lat: 41.482, lon: -82.683, elev: 176 }, // station
        { lat: 41.4825, lon: -82.6838, elev: 215 }, // lift apex (39m height gain)
        { lat: 41.483, lon: -82.6845, elev: 178 }, // bottom of drop (37m plunge)
        { lat: 41.4838, lon: -82.685, elev: 198 }, // hill
      ];

      const kin = calculateCoasterKinematics(waypoints, 2.5);
      assert.equal(kin.length, 4);

      // Station / early ascent should be lift hill speed (2.5 m/s)
      assert.equal(kin[0].speedMs, 2.5);
      assert.equal(kin[0].isLift, true);

      // Bottom of drop (elev 178 vs apex 215 => heightDelta = 37m)
      // v = sqrt(2 * 9.81 * 37 + 6.25) ~ 27 m/s (~60 mph)
      const dropSpeed = kin[2].speedMs;
      assert.ok(
        dropSpeed > 24.0 && dropSpeed < 32.0,
        `Expected ~27 m/s, got ${dropSpeed}`,
      );
      assert.equal(kin[2].isLift, false);
    },
  );

  await t.test(
    'generateSerpentineQueue creates compact switchback lanes with slow creep speed',
    () => {
      const queue = generateSerpentineQueue(41.482, -82.682, 4, 10.0, 1.2, 176);
      assert.equal(queue.length, 8); // 4 lanes * 2 points

      for (const pt of queue) {
        assert.equal(pt.speedMs, 0.15); // slow creeping speed
        assert.equal(pt.elev, 176);
      }
    },
  );

  await t.test(
    'generatePastureWander produces points bounded by perimeter with grazing pauses',
    () => {
      const perimeter = [
        { lat: 35.62, lon: -95.965, elev: 215 },
        { lat: 35.625, lon: -95.965, elev: 215 },
        { lat: 35.625, lon: -95.96, elev: 215 },
        { lat: 35.62, lon: -95.96, elev: 215 },
      ];

      const wander = generatePastureWander(perimeter, 10, 12345);
      assert.equal(wander.length, 10);

      for (const pt of wander) {
        assert.ok(pt.lat >= 35.62 && pt.lat <= 35.625);
        assert.ok(pt.lon >= -95.965 && pt.lon <= -95.96);
        assert.ok(pt.speedMs > 0.2 && pt.speedMs < 1.0);
      }
    },
  );

  await t.test(
    'generateMultiTopologyTrajectory samples corridor points accurately',
    () => {
      const corridor = {
        id: 'test_shoulder',
        type: TOPOLOGY_MODES.RURAL_SHOULDER,
        waypoints: [
          { lat: 31.369, lon: -81.433, elev: 6 },
          { lat: 31.371, lon: -81.434, elev: 7 },
        ],
      };

      const traj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 20,
      });
      assert.ok(traj.length >= 2);
      assert.equal(traj[0].mode, TOPOLOGY_MODES.RURAL_SHOULDER);
      assert.ok(traj[0].cartesian);
    },
  );

  await t.test(
    'generates studio dolly tracks, crane swing arcs, and Ferris wheel orbital rings',
    () => {
      const dolly = generateDollyTrackSpline(
        34.0837,
        -118.3186,
        28.0,
        90,
        86,
        6,
      );
      assert.ok(dolly.length >= 10);
      assert.equal(dolly[0].mode, TOPOLOGY_MODES.DOLLY_TRACK_SPLINE);
      assert.equal(dolly[0].speedMs, 1.4);

      const crane = generateCraneSwingArc(34.0837, -118.3186, 12.0, 86, 98, 8);
      assert.equal(crane.length, 9);
      assert.equal(crane[0].mode, TOPOLOGY_MODES.CRANE_SWING_ARC);
      assert.ok(crane.some((pt) => pt.elev > 95));

      const wheel = generateFerrisWheelRing(28.4177, -81.5812, 22.0, 30, 12);
      assert.equal(wheel.length, 13);
      assert.equal(wheel[0].mode, TOPOLOGY_MODES.FERRIS_WHEEL_RING);
      assert.ok(wheel.some((pt) => pt.elev >= 70));

      const backlotTraj = generateMultiTopologyTrajectory({
        id: 'studio_lane',
        type: TOPOLOGY_MODES.STUDIO_BACKLOT_LANE,
        waypoints: [
          { lat: 34.083, lon: -118.32, elev: 86 },
          { lat: 34.084, lon: -118.318, elev: 86 },
        ],
      });
      assert.ok(backlotTraj.length >= 2);
      assert.equal(backlotTraj[0].mode, TOPOLOGY_MODES.STUDIO_BACKLOT_LANE);
    },
  );
});
