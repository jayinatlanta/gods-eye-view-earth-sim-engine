import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlaqueCanvas,
  createSightseeingEngine,
  DWELL_DEBOUNCE_MS,
} from './sightseeingEngine.js';

function createMockViewer() {
  const moveEndListeners = new Set();
  const moveStartListeners = new Set();
  const entities = new Map();

  return {
    camera: {
      moveEnd: {
        addEventListener: (fn) => {
          moveEndListeners.add(fn);
          return () => moveEndListeners.delete(fn);
        },
      },
      moveStart: {
        addEventListener: (fn) => {
          moveStartListeners.add(fn);
          return () => moveStartListeners.delete(fn);
        },
      },
      flyTo: () => {},
      positionCartographic: { latitude: 0.34, longitude: -1.26, height: 1200 },
      getPickRay: () => ({ origin: {}, direction: {} }),
      pickEllipsoid: () => ({ x: 1000, y: 2000, z: 3000 }),
    },
    canvas: { clientWidth: 1280, clientHeight: 720 },
    scene: {
      canvas: {},
      globe: {
        pick: () => ({ x: 1000, y: 2000, z: 3000 }),
      },
      pick: () => null,
    },
    entities: {
      add: (def) => {
        entities.set(def.id, def);
        return def;
      },
      remove: (def) => {
        entities.delete(def.id);
      },
      getById: (id) => entities.get(id),
    },
    _emitMoveEnd: () => {
      for (const fn of moveEndListeners) fn();
    },
    _emitMoveStart: () => {
      for (const fn of moveStartListeners) fn();
    },
    _entities: entities,
  };
}

test('DWELL_DEBOUNCE_MS is 3000ms', () => {
  assert.equal(DWELL_DEBOUNCE_MS, 3000);
});

test('createSightseeingEngine discovers and spawns 3D billboards', async () => {
  const viewer = createMockViewer();

  const mockPayload = {
    ok: true,
    query: 'Labadee Haiti',
    count: 1,
    billboards: [
      {
        id: 'billboard-labadee',
        title: 'Labadee',
        image_url: 'https://upload.wikimedia.org/Labadee_Haiti_II.jpg',
        original_url: 'https://upload.wikimedia.org/Labadee_Haiti_II_full.jpg',
        summary: 'Labadee is a resort peninsula located on the northern coast of Haiti.',
        lat: 19.7864,
        lon: -72.2456,
        source: 'Wikimedia Commons / Wikipedia',
        kind: 'discovered_sightseeing',
      },
    ],
  };

  const mockFetch = async (url) => {
    if (url.includes('/api/discovery/sightseeing')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockPayload,
      };
    }
    return { ok: false, status: 404 };
  };

  const engine = createSightseeingEngine({
    viewer,
    fetchImpl: mockFetch,
    container: null,
  });

  const res = await engine.discoverAndSpawn('Labadee Haiti', { flyTo: true });
  assert.equal(res.ok, true);
  assert.equal(res.count, 1);

  const billboards = engine.getBillboards();
  assert.equal(billboards.length, 1);
  assert.equal(billboards[0].id, 'billboard-labadee');
  assert.equal(billboards[0].title, 'Labadee');

  const entity = viewer._entities.get('billboard-labadee');
  assert.ok(entity, 'Entity must be added to Cesium entities collection');
  assert.equal(entity._sightseeingData.title, 'Labadee');
  assert.ok(entity.billboard, 'Entity must have a billboard component');

  // Verify clearing
  engine.clearBillboards();
  assert.equal(engine.getBillboards().length, 0);
  assert.equal(viewer._entities.size, 0);

  engine.destroy();
});

test('createSightseeingEngine handles spatial CCTV sparsity correctly with distant cameras', async () => {
  const viewer = createMockViewer();

  // Simulate a CCTV layer with 4,000 cameras in Georgia, but ZERO in Key West
  const mockDataManager = {
    layers: new Map([
      [
        'cctv',
        {
          module: {
            getUIState: () => ({
              enabled: true,
              cameras: [
                { id: 'gdot-1', lat: 33.749, lon: -84.388 }, // Atlanta
                { id: 'gdot-2', lat: 34.0, lon: -84.0 },
              ],
            }),
          },
        },
      ],
    ]),
  };

  const mockPayload = {
    ok: true,
    query: 'Key West',
    count: 1,
    billboards: [
      {
        id: 'billboard-keywest',
        title: 'Key West',
        lat: 24.5551,
        lon: -81.78,
      },
    ],
  };

  const mockFetch = async (url) => {
    if (url.includes('/api/discovery/sightseeing')) {
      return { ok: true, status: 200, json: async () => mockPayload };
    }
    if (url.includes('/api/geocode')) {
      return { ok: true, status: 200, json: async () => ({ name: 'Key West' }) };
    }
    return { ok: false, status: 404 };
  };

  const engine = createSightseeingEngine({
    viewer,
    dataManager: mockDataManager,
    fetchImpl: mockFetch,
    container: null,
  });

  // Target Key West (24.5551, -81.78)
  const res = await engine.discoverAndSpawn('Key West', {
    lat: 24.5551,
    lon: -81.78,
    flyTo: false,
  });

  assert.equal(res.ok, true);
  assert.equal(res.count, 1);
  assert.ok(viewer._entities.get('billboard-keywest'));

  engine.destroy();
});
