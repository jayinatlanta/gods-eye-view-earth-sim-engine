import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterScenicImage,
  fetchSightseeingFromWikipedia,
  fetchSightseeingImage,
  isAllowedSightseeingImageUrl,
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

test('fetchSightseeingFromWikipedia supports exact title lookup with redirects and 640px thumb', async () => {
  const seenUrls = [];
  const res = await fetchSightseeingFromWikipedia({
    title: 'Spaceship_Earth_(Epcot)',
    fetchImpl: async (url) => {
      seenUrls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            query: {
              pages: {
                101: {
                  pageid: 101,
                  title: 'Spaceship Earth (Epcot)',
                  extract: 'Iconic geodesic sphere attraction at EPCOT.',
                  thumbnail: {
                    source:
                      'https://upload.wikimedia.org/wikipedia/commons/thumb/spaceship.jpg/640px-spaceship.jpg',
                  },
                },
              },
            },
          };
        },
      };
    },
  });

  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /action=query&titles=Spaceship_Earth_\(Epcot\)/);
  assert.match(seenUrls[0], /redirects=1/);
  assert.match(seenUrls[0], /pithumbsize=640/);
  assert.equal(res.count, 1);
  assert.equal(res.title, 'Spaceship_Earth_(Epcot)');
  assert.equal(res.billboards[0].title, 'Spaceship Earth (Epcot)');
});

test('sightseeingDiscoveryProxy forwards ?title= parameter and falls back to ?query= when needed', async () => {
  const seenUrls = [];
  const middlewares = [];
  const server = {
    middlewares: {
      use(path, handler) {
        middlewares.push({ path, handler });
      },
    },
  };
  const plugin = sightseeingDiscoveryProxy({
    fetchImpl: async (url) => {
      const s = String(url);
      seenUrls.push(s);
      if (s.includes('titles=')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { query: { pages: {} } };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            query: {
              pages: {
                202: {
                  pageid: 202,
                  title: 'Cinderella Castle',
                  extract: 'Fairytale fortress centerpiece of Magic Kingdom.',
                  thumbnail: {
                    source:
                      'https://upload.wikimedia.org/wikipedia/commons/thumb/castle.jpg/640px-castle.jpg',
                  },
                },
              },
            },
          };
        },
      };
    },
  });
  plugin.configureServer(server);
  const route = middlewares.find((m) => m.path === '/api/discovery/sightseeing');
  assert.ok(route);

  let statusCode = 0;
  let body = '';
  const headers = {};
  await route.handler(
    {
      method: 'GET',
      url: '/?title=Nonexistent_Title_Fallback_Check&query=Cinderella%20Castle%20Magic%20Kingdom',
    },
    {
      setHeader(k, v) {
        headers[k] = v;
      },
      set statusCode(c) {
        statusCode = c;
      },
      get statusCode() {
        return statusCode;
      },
      end(payload) {
        body = String(payload || '');
      },
    },
  );

  assert.equal(statusCode, 200);
  assert.equal(seenUrls.length, 2);
  assert.match(seenUrls[0], /titles=Nonexistent_Title_Fallback_Check/);
  assert.match(seenUrls[1], /generator=search&gsrsearch=Cinderella%20Castle/);
  const parsed = JSON.parse(body);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.billboards[0].title, 'Cinderella Castle');
});

test('fetchSightseeingFromWikipedia skips distant homonym pages when lat/lon anchor is provided on free-text query', async () => {
  const res = await fetchSightseeingFromWikipedia({
    query: 'Star Island',
    lat: 28.3286,
    lon: -81.4849,
    limit: 2,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          query: {
            pages: {
              1: {
                index: 1,
                title: 'Star Island (New Hampshire)',
                extract: 'Island in the Isles of Shoals, New Hampshire.',
                thumbnail: {
                  source:
                    'https://upload.wikimedia.org/wikipedia/commons/1/17/Star_Island_Chapel.jpg',
                },
                coordinates: [{ lat: 42.9767, lon: -70.6139 }],
              },
            },
          },
        };
      },
    }),
  });

  assert.equal(res.ok, true);
  assert.equal(
    res.billboards.length,
    0,
    'Must not return a 1,900 km away New Hampshire homonym for a Florida coordinate query',
  );
});

test('sightseeingDiscoveryProxy /api/discovery/sightseeing/image enforces strict HTTPS host allowlist and raster content-type', async () => {
  assert.equal(
    isAllowedSightseeingImageUrl(
      'https://www.star-island.com/files/4607/7934065_ImageLargeWidth.jpg',
    ),
    true,
  );
  assert.equal(
    isAllowedSightseeingImageUrl('http://www.star-island.com/files/4607/a.jpg'),
    false,
  );
  assert.equal(
    isAllowedSightseeingImageUrl('https://evil.example.com/photo.jpg'),
    false,
  );
  assert.equal(
    isAllowedSightseeingImageUrl('https://127.0.0.1/secret.jpg'),
    false,
  );

  const middlewares = [];
  const server = {
    middlewares: {
      use(path, handler) {
        middlewares.push({ path, handler });
      },
    },
  };
  const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const plugin = sightseeingDiscoveryProxy({
    fetchImpl: async (url) => {
      if (String(url).includes('not-image')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          arrayBuffer: async () => fakeBytes.buffer,
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'image/jpeg',
          'content-length': String(fakeBytes.byteLength),
        }),
        arrayBuffer: async () => fakeBytes.buffer,
      };
    },
  });
  plugin.configureServer(server);

  const imgRoute = middlewares.find(
    (m) => m.path === '/api/discovery/sightseeing/image',
  );
  assert.ok(imgRoute, '/api/discovery/sightseeing/image route must be mounted');

  async function callImg(urlPath) {
    let statusCode = 0;
    let body = null;
    const headers = {};
    await imgRoute.handler(
      { method: 'GET', url: urlPath },
      {
        setHeader(k, v) {
          headers[k.toLowerCase()] = v;
        },
        set statusCode(c) {
          statusCode = c;
        },
        get statusCode() {
          return statusCode;
        },
        end(data) {
          body = data;
        },
      },
    );
    return { statusCode, headers, body };
  }

  const blocked = await callImg(
    '/?url=' + encodeURIComponent('https://evil.example.com/x.jpg'),
  );
  assert.equal(blocked.statusCode, 403);

  const nonImage = await callImg(
    '/?url=' +
      encodeURIComponent('https://www.star-island.com/files/not-image.jpg'),
  );
  assert.equal(nonImage.statusCode, 502);

  const allowed = await callImg(
    '/?url=' +
      encodeURIComponent(
        'https://www.star-island.com/files/4607/7934065_ImageLargeWidth.jpg',
      ),
  );
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['content-type'], 'image/jpeg');
  assert.equal(allowed.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(Buffer.isBuffer(allowed.body), true);
  assert.equal(allowed.body.byteLength, 4);

  const directErr = await fetchSightseeingImage('https://169.254.169.254/a.jpg');
  assert.equal(directErr.ok, false);
  assert.equal(directErr.status, 403);
});
