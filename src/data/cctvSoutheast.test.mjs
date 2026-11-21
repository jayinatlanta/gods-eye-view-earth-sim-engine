import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFl511SourcesFromOpenData,
  formatFl511ImageUrl,
  loadNcdotSourcesFromOpenData,
  formatNcdotImageUrl,
} from '../../server/providers/cctv/sources.js';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';
import { CITY_POIS } from '../locations.js';
import {
  CAMERA_PRESETS,
  flyToMiami,
  flyToOrlando,
  flyToCharlotte,
} from '../camera.js';

test('FL511 image URL formatter constructs valid snapshot endpoint', () => {
  const url = formatFl511ImageUrl('404');
  assert.equal(url, 'https://fl511.com/map/Cctv/404');
  assert.equal(formatFl511ImageUrl(''), '');
  assert.equal(formatFl511ImageUrl(null), '');
});

test('NCDOT image URL formatter constructs valid snapshot endpoint', () => {
  const url = formatNcdotImageUrl('4020');
  assert.equal(url, 'https://drivenc.gov/map/Cctv/4020');
  assert.equal(formatNcdotImageUrl(''), '');
  assert.equal(formatNcdotImageUrl(null), '');
});

test('FL511 catalog parser parses raw fl511 feed correctly', async () => {
  const mockFeed = {
    item1: 1,
    item2: [
      {
        itemId: '8001',
        location: [25.77, -80.19],
        icon: 'cctv',
        title: 'Biscayne Blvd @ SE 1st St',
      },
      {
        itemId: '8002',
        location: [28.54, -81.38],
        icon: 'cctv',
        title: 'I-4 @ SR-408 Orlando',
      },
      {
        itemId: '8003',
        location: [27.95, -82.46],
        icon: 'cctv',
        title: 'I-275 @ Downtown Tampa',
      },
      {
        itemId: '8004',
        location: [0, 0], // out of bounds
        icon: 'cctv',
        title: 'Null Island Invalid',
      },
    ],
  };

  const sources = await loadFl511SourcesFromOpenData({
    fetchImpl: async () =>
      new Response(JSON.stringify(mockFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    all: true,
  });

  assert.equal(sources.length, 3, 'Invalid coordinates should be excluded');

  // Camera 1: Miami
  const miamiCam = sources.find((s) => s.id === 'fl511-8001');
  assert.ok(miamiCam, 'Miami camera should exist');
  assert.equal(miamiCam.city, 'Miami');
  assert.equal(miamiCam.provider, 'Florida DOT (FL511)');
  assert.equal(miamiCam.feedType, 'image');
  assert.equal(miamiCam.url, 'https://fl511.com/map/Cctv/8001');
  assert.equal(miamiCam.lat, 25.77);
  assert.equal(miamiCam.lon, -80.19);

  // Camera 2: Orlando
  const orlandoCam = sources.find((s) => s.id === 'fl511-8002');
  assert.ok(orlandoCam, 'Orlando camera should exist');
  assert.equal(orlandoCam.city, 'Orlando');

  // Camera 3: Tampa
  const tampaCam = sources.find((s) => s.id === 'fl511-8003');
  assert.ok(tampaCam, 'Tampa camera should exist');
  assert.equal(tampaCam.city, 'Tampa');
});

test('NCDOT catalog parser parses raw drivenc feed correctly', async () => {
  const mockFeed = {
    item1: 1,
    item2: [
      {
        itemId: '7001',
        location: [35.22, -80.84],
        icon: 'cctv',
        title: 'I-77 @ I-277 Uptown Charlotte',
      },
      {
        itemId: '7002',
        location: [35.78, -78.64],
        icon: 'cctv',
        title: 'I-40 @ Wade Ave Raleigh',
      },
      {
        itemId: '7003',
        location: [35.59, -82.55],
        icon: 'cctv',
        title: 'I-240 @ I-40 Asheville',
      },
      {
        itemId: '7004',
        location: [0, 0], // out of bounds
        icon: 'cctv',
        title: 'Null Island Invalid',
      },
    ],
  };

  const sources = await loadNcdotSourcesFromOpenData({
    fetchImpl: async () =>
      new Response(JSON.stringify(mockFeed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    all: true,
  });

  assert.equal(sources.length, 3, 'Invalid coordinates should be excluded');

  // Camera 1: Charlotte
  const charlotteCam = sources.find((s) => s.id === 'ncdot-7001');
  assert.ok(charlotteCam, 'Charlotte camera should exist');
  assert.equal(charlotteCam.city, 'Charlotte');
  assert.equal(charlotteCam.provider, 'North Carolina DOT (DriveNC)');
  assert.equal(charlotteCam.feedType, 'image');
  assert.equal(charlotteCam.url, 'https://drivenc.gov/map/Cctv/7001');
  assert.equal(charlotteCam.lat, 35.22);
  assert.equal(charlotteCam.lon, -80.84);

  // Camera 2: Raleigh
  const raleighCam = sources.find((s) => s.id === 'ncdot-7002');
  assert.ok(raleighCam, 'Raleigh camera should exist');
  assert.equal(raleighCam.city, 'Raleigh');

  // Camera 3: Asheville
  const ashevilleCam = sources.find((s) => s.id === 'ncdot-7003');
  assert.ok(ashevilleCam, 'Asheville camera should exist');
  assert.equal(ashevilleCam.city, 'Asheville');
});

test('CCTV catalog supports spatial bounding box queries across Southeast', async () => {
  const getCctvSources = createCctvCatalog();

  // Test bounding box around Miami [south, west, north, east]
  const miamiSources = await getCctvSources({
    bbox: [25.7, -80.3, 25.9, -80.1],
    max: 20,
  });

  assert.ok(Array.isArray(miamiSources), 'Returns array of sources');
  for (const src of miamiSources) {
    assert.ok(
      src.lat >= 25.7 && src.lat <= 25.9,
      `Lat ${src.lat} in Miami bounds`,
    );
    assert.ok(
      src.lon >= -80.3 && src.lon <= -80.1,
      `Lon ${src.lon} in Miami bounds`,
    );
  }

  // Test bounding box around Charlotte [south, west, north, east]
  const charlotteSources = await getCctvSources({
    bbox: [35.1, -80.9, 35.3, -80.7],
    max: 20,
  });

  assert.ok(Array.isArray(charlotteSources), 'Returns array of sources');
  for (const src of charlotteSources) {
    assert.ok(
      src.lat >= 35.1 && src.lat <= 35.3,
      `Lat ${src.lat} in Charlotte bounds`,
    );
    assert.ok(
      src.lon >= -80.9 && src.lon <= -80.7,
      `Lon ${src.lon} in Charlotte bounds`,
    );
  }
});

test('Miami, Orlando, and Charlotte POIs and presets are properly registered', () => {
  // Miami
  assert.ok(CITY_POIS.miami, 'CITY_POIS.miami must be defined');
  assert.equal(CITY_POIS.miami.name, 'Miami');
  assert.ok(CITY_POIS.miami.viewBounds, 'Miami viewBounds must exist');
  assert.equal(CITY_POIS.miami.pois.length, 5, 'Miami should have 5 POIs');
  assert.ok(CAMERA_PRESETS.miami, 'CAMERA_PRESETS.miami must be defined');
  assert.equal(typeof flyToMiami, 'function');

  // Orlando
  assert.ok(CITY_POIS.orlando, 'CITY_POIS.orlando must be defined');
  assert.equal(CITY_POIS.orlando.name, 'Orlando');
  assert.ok(CITY_POIS.orlando.viewBounds, 'Orlando viewBounds must exist');
  assert.equal(CITY_POIS.orlando.pois.length, 5, 'Orlando should have 5 POIs');
  assert.ok(CAMERA_PRESETS.orlando, 'CAMERA_PRESETS.orlando must be defined');
  assert.equal(typeof flyToOrlando, 'function');

  // Charlotte
  assert.ok(CITY_POIS.charlotte, 'CITY_POIS.charlotte must be defined');
  assert.equal(CITY_POIS.charlotte.name, 'Charlotte');
  assert.ok(CITY_POIS.charlotte.viewBounds, 'Charlotte viewBounds must exist');
  assert.equal(
    CITY_POIS.charlotte.pois.length,
    5,
    'Charlotte should have 5 POIs',
  );
  assert.ok(
    CAMERA_PRESETS.charlotte,
    'CAMERA_PRESETS.charlotte must be defined',
  );
  assert.equal(typeof flyToCharlotte, 'function');
});
