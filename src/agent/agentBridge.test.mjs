import test from 'node:test';
import assert from 'node:assert/strict';
import { initAgentBridge } from './agentBridge.js';

test('AgentBridge registers SSE listener and dispatches explore action', async () => {
  let createdUrl = null;
  let messageHandler = null;
  let closed = false;

  class MockEventSource {
    constructor(url) {
      createdUrl = url;
    }
    set onmessage(fn) {
      messageHandler = fn;
    }
    close() {
      closed = true;
    }
  }

  const dispatched = [];
  const runner = async (name, args) => {
    dispatched.push({ name, args });
  };
  let searchTarget = null;
  const operations = {
    searchAndFlyTo: async (query) => {
      searchTarget = query;
    },
  };

  const bridge = initAgentBridge({
    runner,
    operations,
    EventSourceClass: MockEventSource,
  });

  assert.equal(createdUrl, '/api/agent/events');
  assert.equal(typeof messageHandler, 'function');

  // Send an explore command
  await messageHandler({
    data: JSON.stringify({
      action: 'explore',
      query: 'Mount Fuji',
    }),
  });

  assert.equal(searchTarget, 'Mount Fuji');

  // Send a direct runner action
  await messageHandler({
    data: JSON.stringify({
      action: 'set_visual_style',
      args: { style: 'thermal' },
    }),
  });

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].name, 'set_visual_style');
  assert.deepEqual(dispatched[0].args, { style: 'thermal' });

  // Test discover_sightseeing action
  let discoveredTarget = null;
  const sightseeingEngine = {
    discoverAndSpawn: async (target) => {
      discoveredTarget = target;
    },
  };

  // Test rail_route action
  let railRouteArgs = null;
  const railwayEngine = {
    spawnRailRoute: async (from, to, args) => {
      railRouteArgs = { from, to, args };
    },
  };

  const bridgeWithSightseeing = initAgentBridge({
    sightseeingEngine,
    railwayEngine,
    EventSourceClass: MockEventSource,
  });
  await messageHandler({
    data: JSON.stringify({
      action: 'discover_sightseeing',
      query: 'Labadee Haiti',
    }),
  });
  assert.equal(discoveredTarget, 'Labadee Haiti');

  await messageHandler({
    data: JSON.stringify({
      action: 'rail_route',
      origin: 'CandlerPark',
      destination: 'GeorgiaState',
      args: { cabRide: true, corridor: 'csx_mainline' },
    }),
  });
  assert.ok(railRouteArgs);
  assert.equal(railRouteArgs.from, 'CandlerPark');
  assert.equal(railRouteArgs.to, 'GeorgiaState');
  assert.equal(railRouteArgs.args.corridor, 'csx_mainline');

  // Test drive_route & follow_traffic actions
  let driveRouteArgs = null;
  let trafficFollowArgs = null;
  const driveEngine = {
    startRouteDrive: async (from, to, args) => {
      driveRouteArgs = { from, to, args };
    },
    latchOntoTraffic: (targetId, args) => {
      trafficFollowArgs = { targetId, args };
    },
  };

  const bridgeWithDrive = initAgentBridge({
    driveEngine,
    EventSourceClass: MockEventSource,
  });

  await messageHandler({
    data: JSON.stringify({
      action: 'drive_route',
      origin: 'Manhattan',
      destination: 'RedondoBeach',
      args: { speedMph: 95, seat: true },
    }),
  });
  assert.ok(driveRouteArgs);
  assert.equal(driveRouteArgs.from, 'Manhattan');
  assert.equal(driveRouteArgs.to, 'RedondoBeach');
  assert.equal(driveRouteArgs.args.speedMph, 95);

  await messageHandler({
    data: JSON.stringify({
      action: 'follow_traffic',
      args: { targetId: 'VEH-0042', seat: true },
    }),
  });
  assert.ok(trafficFollowArgs);
  assert.equal(trafficFollowArgs.targetId, 'VEH-0042');

  bridgeWithDrive.destroy();
  bridgeWithSightseeing.destroy();

  // Destroy bridge
  bridge.destroy();
  assert.equal(closed, true);
});
