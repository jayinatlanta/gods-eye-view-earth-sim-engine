import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotormanControls } from './motormanControls.js';

test('Living City Transit — Motorman Controls & Central Dispatcher Mini-Games', async (t) => {
  await t.test('Motorman throttle and dynamic braking notches respond accurately', () => {
    const controls = createMotormanControls();
    const mockBus = { id: 'BUS-1', speedMs: 0 };
    controls.bindVehicle(mockBus, 'bus');

    let state = controls.getState();
    assert.equal(state.throttleNotch, 0);
    assert.equal(state.brakeNotch, 0);
    assert.equal(state.doorsOpen, false);

    // Throttle up to Notch 2
    controls.throttleUp();
    controls.throttleUp();
    state = controls.getState();
    assert.equal(state.throttleNotch, 2);

    // Brake notch down
    controls.throttleDown();
    state = controls.getState();
    assert.equal(state.throttleNotch, 1);

    controls.applyBrake();
    state = controls.getState();
    assert.equal(state.throttleNotch, 0);
    assert.equal(state.brakeNotch, 1);

    controls.destroy();
  });

  await t.test('Door-Speed Interlock strictly prohibits acceleration when doors are open', () => {
    const controls = createMotormanControls();
    const mockBus = { id: 'BUS-1', speedMs: 0 };
    controls.bindVehicle(mockBus, 'bus');

    controls.toggleDoors();
    let state = controls.getState();
    assert.equal(state.doorsOpen, true);

    // Throttle up should be completely blocked while doors are open
    const throttled = controls.throttleUp();
    assert.equal(throttled, false);
    state = controls.getState();
    assert.equal(state.throttleNotch, 0);

    // Close doors, now throttle succeeds
    controls.toggleDoors();
    assert.equal(controls.getState().doorsOpen, false);
    assert.equal(controls.throttleUp(), true);
    assert.equal(controls.getState().throttleNotch, 1);

    controls.destroy();
  });

  await t.test('Door-Speed Interlock prohibits opening doors while in motion (>0.5 m/s)', () => {
    let triggeredViolation = false;
    const controls = createMotormanControls({
      onScoreEvent: (evt) => {
        if (evt.type === 'DOOR_SPEED_INTERLOCK_VIOLATION') {
          triggeredViolation = true;
        }
      },
    });

    const mockBus = { id: 'BUS-1', speedMs: 8.5 }; // Cruising at ~19 mph
    controls.bindVehicle(mockBus, 'bus');

    const opened = controls.toggleDoors();
    assert.equal(opened, false);
    assert.equal(controls.getState().doorsOpen, false);
    assert.equal(triggeredViolation, true);

    controls.destroy();
  });

  await t.test('Station docking precision scoring awards correct tiers', () => {
    const controls = createMotormanControls();
    const mockBus = { id: 'BUS-1', speedMs: 0 };
    controls.bindVehicle(mockBus, 'bus');

    // Perfect dock (0.8m from marker)
    const res1 = controls.evaluateStationDock(0.8);
    assert.equal(res1.pts, 100);
    assert.ok(res1.label.includes('PERFECT DOCK'));

    // Good dock (2.5m from marker)
    const res2 = controls.evaluateStationDock(2.5);
    assert.equal(res2.pts, 70);
    assert.ok(res2.label.includes('GOOD DOCK'));

    // Off-target (5.2m from marker)
    const res3 = controls.evaluateStationDock(5.2);
    assert.equal(res3.pts, 25);
    assert.ok(res3.label.includes('OFF-TARGET'));

    controls.destroy();
  });

  await t.test('Mode 2 Central Dispatcher detects anti-bunching and issues hold/express orders', () => {
    const controls = createMotormanControls();
    controls.setDispatcherMode(true);

    const mockFleet = [
      { id: 'BUS-101', distMeters: 1200 },
      { id: 'BUS-102', distMeters: 1100 }, // Only 100m behind = ~9 seconds gap (severe bunching!)
    ];

    const alerts = controls.evaluateFleetHeadways(mockFleet);
    assert.ok(alerts.length > 0);
    assert.equal(alerts[0].type, 'BUNCHING_CRITICAL');

    // Dispatcher intervenes with Hold and Express orders
    const held = controls.issueHoldOrder('BUS-101', 60);
    assert.equal(held, true);
    assert.equal(controls.getState().heldVehiclesCount, 1);

    const express = controls.issueExpressOrder('BUS-102');
    assert.equal(express, true);
    assert.equal(controls.getState().expressVehiclesCount, 1);

    controls.destroy();
  });
});
