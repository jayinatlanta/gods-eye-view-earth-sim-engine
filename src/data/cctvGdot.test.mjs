import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGdotSourcesFromOpenData,
  formatGdotImageUrl,
} from '../../server/providers/cctv/sources.js';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';
import {
  GDOT_CAMERAS_URL,
  GDOT_IMAGE_ORIGIN,
  GEORGIA_ANCHORS,
} from '../../server/providers/cctv/constants.js';
import { CITY_POIS } from '../locations.js';
import { CAMERA_PRESETS } from '../camera.js';
import { loadCameraSources } from './cctv.js';

test('GDOT image URL formatter constructs valid snapshot endpoint', () => {
  const url = formatGdotImageUrl('12345');
  assert.equal(url, 'https://511ga.org/map/Cctv/12345');
  assert.equal(formatGdotImageUrl(''), '');
  assert.equal(formatGdotImageUrl(null), '');
});

test('GDOT catalog parser parses raw 511ga feed correctly', async () => {
  const mockFeed = {
    item1: 1,
    item2: [
      {
        itemId: '9001',
        location: [33.75, -84.38],
        icon: 'cctv',
        title: 'I-75/85 @ Freedom Pkwy',
      },
      {
        itemId: '9002',
        location: [31.45, -83.51],
        icon: 'cctv',
        title: 'I-75 @ US-82 Tifton Exit 62',
      },
      {
        itemId: '9003',
        location: [34.98, -85.18],
        icon: 'cctv',
        title: 'I-75 @ Ringgold Catoosa TN Border',
      },
      {
        itemId: '9004',
        location: [0, 0], // out of bounds
        icon: 'cctv',
        title: 'Equator Invalid',
      },
    ],
  };

  const sources = await loadGdotSourcesFromOpenData({
    fetchImpl: async () =>
      new Response(JSON.stringify(mockFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    all: true,
  });

  assert.equal(sources.length, 3, 'Invalid coordinate row should be excluded');

  // Camera 1: Atlanta
  const atlCam = sources.find((s) => s.id === 'gdot-9001');
  assert.ok(atlCam, 'Atlanta camera should exist');
  assert.equal(atlCam.city, 'Atlanta');
  assert.equal(atlCam.provider, 'Georgia DOT (511GA)');
  assert.equal(atlCam.feedType, 'image');
  assert.equal(atlCam.url, 'https://511ga.org/map/Cctv/9001');
  assert.equal(atlCam.lat, 33.75);
  assert.equal(atlCam.lon, -84.38);

  // Camera 2: Tifton
  const tiftonCam = sources.find((s) => s.id === 'gdot-9002');
  assert.ok(tiftonCam, 'Tifton camera should exist');
  assert.equal(tiftonCam.city, 'Tifton');

  // Camera 3: Ringgold / Dalton
  const northGaCam = sources.find((s) => s.id === 'gdot-9003');
  assert.ok(northGaCam, 'North Georgia border camera should exist');
  assert.equal(northGaCam.city, 'Dalton / Ringgold');
});

test('CCTV catalog supports spatial bounding box queries (?bbox=s,w,n,e)', async () => {
  const getCctvSources = createCctvCatalog();

  // Test bounding box around Tifton, GA [south, west, north, east]
  // Lat: 31.4 to 31.6, Lon: -83.6 to -83.4
  const tiftonSources = await getCctvSources({
    bbox: [31.4, -83.6, 31.6, -83.4],
    max: 50,
  });

  assert.ok(Array.isArray(tiftonSources), 'Returns array of sources');
  for (const src of tiftonSources) {
    assert.ok(src.lat >= 31.4 && src.lat <= 31.6, `Lat ${src.lat} in bounds`);
    assert.ok(src.lon >= -83.6 && src.lon <= -83.4, `Lon ${src.lon} in bounds`);
  }
});

test('Atlanta location POI and presets are registered', () => {
  assert.ok(CITY_POIS.atlanta, 'CITY_POIS.atlanta must be defined');
  assert.equal(CITY_POIS.atlanta.name, 'Atlanta');
  assert.ok(CITY_POIS.atlanta.viewBounds, 'Atlanta viewBounds must exist');
  assert.ok(
    CITY_POIS.atlanta.pois.length >= 5,
    'Atlanta should have at least 5 landmark POIs',
  );

  const connectorPoi = CITY_POIS.atlanta.pois.find((p) =>
    p.name.includes('Downtown Connector'),
  );
  assert.ok(connectorPoi, 'Downtown Connector POI must exist');

  assert.ok(CAMERA_PRESETS.atlanta, 'CAMERA_PRESETS.atlanta must be defined');
  assert.ok(
    CAMERA_PRESETS.atlanta.destination,
    'Destination should be Cartesian3',
  );
  assert.ok(
    CAMERA_PRESETS.atlanta.orientation,
    'Orientation should be defined',
  );
});

test('loadCameraSources queries backend with bbox parameter', async () => {
  let capturedUrl = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ sources: [] }), { status: 200 });
  };

  try {
    await loadCameraSources('33.7,-84.4,33.8,-84.3', 50);
    assert.ok(
      capturedUrl.includes('bbox=33.7%2C-84.4%2C33.8%2C-84.3') ||
        capturedUrl.includes('bbox=33.7,-84.4,33.8,-84.3'),
      `Url should include bbox param: ${capturedUrl}`,
    );
    assert.ok(
      capturedUrl.includes('max=50'),
      `Url should include max param: ${capturedUrl}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
