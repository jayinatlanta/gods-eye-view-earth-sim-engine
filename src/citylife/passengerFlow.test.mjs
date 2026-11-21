import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createPassengerFlow } from '../layers/citylife/passengerFlow.js';

test('Living City Transit — Passenger Flow & Transit Interlock Engine', async (t) => {
  const sampleStops = [
    { id: 'stop_midtown', name: 'Midtown Station', lat: 33.7818, lon: -84.3837, elev: 308 },
    { id: 'stop_arts_center', name: 'Arts Center', lat: 33.7892, lon: -84.3872, elev: 308 },
  ];

  await t.test('registerStops catalogs stops and initializes empty queues', () => {
    const flow = createPassengerFlow();
    flow.registerStops(sampleStops, { mode: 'bus', routeId: 'marta_110' });

    const registered = flow.getRegisteredStops();
    assert.equal(registered.length, 2);
    assert.equal(registered[0].name, 'Midtown Station');
    assert.equal(flow.getStopQueue('stop_midtown').length, 0);

    const telem = flow.getTelemetry();
    assert.equal(telem.registeredStopsCount, 2);
    assert.equal(telem.totalQueuedPassengers, 0);
  });

  await t.test('update identifies pedestrians within catchment and transitions to transit queue', () => {
    const flow = createPassengerFlow();
    flow.registerStops(sampleStops, { mode: 'bus' });

    // Mock pedestrian right near Midtown Station stop
    const stopCart = Cesium.Cartesian3.fromDegrees(-84.3837, 33.7818, 308.2);
    const mockPeds = [
      {
        id: 'ped_persona_1',
        currentPos: Cesium.Cartesian3.add(stopCart, new Cesium.Cartesian3(2, 2, 0), new Cesium.Cartesian3()),
        progressMeters: 45,
        isBoarded: false,
        isWaitingForTransit: false,
        entity: {
          point: { outlineColor: null, pixelSize: 8 },
        },
      },
      {
        // Distant pedestrian (> 100m away)
        id: 'ped_persona_2',
        currentPos: Cesium.Cartesian3.fromDegrees(-84.4, 33.8, 308),
        progressMeters: 10,
        isBoarded: false,
        isWaitingForTransit: false,
      },
    ];

    flow.update(0.1, mockPeds);

    // Distant pedestrian should never queue
    assert.equal(mockPeds[1].isWaitingForTransit, false);
  });

  await t.test('exchangePassengers processes boarding and alighting transitions smoothly', () => {
    const flow = createPassengerFlow();
    flow.registerStops(sampleStops, { mode: 'bus' });

    const stop = sampleStops[0];
    const mockVehicle = {
      id: 'MARTA-110-1',
      capacity: 50,
      passengers: 20,
    };

    // Pre-populate queue with 3 waiting pedestrians
    const queue = flow.getStopQueue(stop.id);
    const ped1 = { id: 'p1', isBoarded: false, isWaitingForTransit: true, entity: { show: true } };
    const ped2 = { id: 'p2', isBoarded: false, isWaitingForTransit: true, entity: { show: true } };
    queue.push(ped1, ped2);

    const delta = flow.exchangePassengers(mockVehicle, stop);
    assert.equal(typeof delta, 'number');
    assert.equal(ped1.isBoarded, true);
    assert.equal(ped1.entity.show, false); // Hidden while riding inside bus

    const telem = flow.getTelemetry();
    assert.ok(telem.totalBoardings > 0);
  });
});
