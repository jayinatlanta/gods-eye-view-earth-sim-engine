import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterScenicImage,
  fetchSightseeingFromWikipedia,
  sightseeingDiscoveryProxy,
} from './sightseeing.js';

test('filterScenicImage rejects heraldic icons, flags and SVGs', () => {
  assert.equal(filterScenicImage('https://upload.wikimedia.org/flag_of_haiti.svg'), false);
  assert.equal(filterScenicImage('https://upload.wikimedia.org/coat_of_arms.png'), false);
  assert.equal(filterScenicImage('https://upload.wikimedia.org/locator_map_labadee.jpg'), false);
  assert.equal(filterScenicImage('https://upload.wikimedia.org/Labadee_Haiti_II.jpg'), true);
  assert.equal(filterScenicImage('https://upload.wikimedia.org/Bora_Bora_Lagoon.png'), true);
});

test('fetchSightseeingFromWikipedia transforms pages into billboards', async () => {
  const mockWikipediaPayload = {
    query: {
      pages: {
        123: {
          index: 1,
          title: 'Labadee',
          extract: 'Labadee is a port located on the northern coast of Haiti.',
          thumbnail: {
            source: 'https://upload.wikimedia.org/Labadee_Haiti_II.jpg',
          },
          original: {
            source: 'https://upload.wikimedia.org/Labadee_Haiti_II_full.jpg',
          },
          coordinates: [{ lat: 19.7864, lon: -72.2456 }],
        },
        124: {
          index: 2,
          title: 'Flag of Haiti',
          extract: 'The national flag of Haiti.',
          thumbnail: {
            source: 'https://upload.wikimedia.org/flag_of_haiti.svg',
          },
        },
      },
    },
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => mockWikipediaPayload,
  });

  const res = await fetchSightseeingFromWikipedia({
    query: 'Labadee Haiti',
    limit: 2,
    fetchImpl: mockFetch,
  });

  assert.equal(res.ok, true);
  assert.equal(res.count, 1);
  assert.equal(res.billboards.length, 1);
  const bb = res.billboards[0];
  assert.equal(bb.title, 'Labadee');
  assert.equal(bb.image_url, 'https://upload.wikimedia.org/Labadee_Haiti_II.jpg');
  assert.equal(bb.lat, 19.7864);
  assert.equal(bb.lon, -72.2456);
  assert.equal(bb.kind, 'discovered_sightseeing');
});

test('sightseeingDiscoveryProxy handles /api/discovery/sightseeing', async () => {
  const middlewares = [];
  const server = {
    middlewares: {
      use(path, handler) {
        middlewares.push({ path, handler });
      },
    },
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      query: {
        pages: {
          10: {
            index: 1,
            title: 'Bora Bora',
            extract: 'Bora Bora is an island group in the Leeward Islands.',
            thumbnail: { source: 'https://upload.wikimedia.org/Bora_Bora.jpg' },
            coordinates: [{ lat: -16.5004, lon: -151.7415 }],
          },
        },
      },
    }),
  });

  const plugin = sightseeingDiscoveryProxy({ fetchImpl: mockFetch });
  plugin.configureServer(server);

  const route = middlewares.find((m) => m.path === '/api/discovery/sightseeing');
  assert.ok(route, 'Route /api/discovery/sightseeing must be mounted');

  let statusCode = 0;
  let body = '';
  const headers = {};
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    set statusCode(c) {
      statusCode = c;
    },
    get statusCode() {
      return statusCode;
    },
    end(data) {
      if (data) body = data;
    },
  };

  const req = {
    method: 'GET',
    url: '/?query=Bora+Bora',
  };

  await route.handler(req, res);
  assert.equal(statusCode, 200);
  const parsed = JSON.parse(body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.billboards.length, 1);
  assert.equal(parsed.billboards[0].title, 'Bora Bora');
});
