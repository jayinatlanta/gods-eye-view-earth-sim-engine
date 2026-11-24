import '../testSupport/registerDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  parseCoordinateQuery,
  extractGeocodeCandidate,
  resolvePlaceEndpoint,
  calculateInitialBearingDeg,
  bearingToCardinal16,
  computeGeodesicMidpoint,
  computeSolarTimeDeltaHours,
  computeProportionalFramingAltitude,
  analyzePlaceRelationship,
} from './placeRelationshipEngine.js';
import {
  evaluateCorridorModes,
  evaluateRoadMode,
  evaluateHelicopterMode,
  evaluateMaritimeMode,
} from './corridorFeasibility.js';
import {
  buildGeodesicArcPositions,
  computeOrbitalCameraPose,
  createCorridorVisualizer,
} from './corridorVisualizer.js';
import {
  parseCorridorDeeplink,
  createCorridorDrawer,
} from './corridorDrawer.js';
import {
  resolveRailWaypoints,
  resolveRailWaypointsAsync,
} from '../transit/railWaypoints.js';
import { resolveWaterWaypoints } from '../vessels/waterWaypoints.js';
import { initAgentBridge } from '../agent/agentBridge.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import {
  claimDomicileAtLocation,
  clearClaimedDomicilesForTest,
} from '../layers/estates/domicileCatalog.js';

function createMockFetch({ geocodeMap = {}, routeResponse = null, overpassResponse = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('/api/geocode')) {
      const parsed = new URL(url, 'http://localhost');
      const q = (parsed.searchParams.get('q') || '').toLowerCase();
      for (const [needle, payload] of Object.entries(geocodeMap)) {
        if (q.includes(needle.toLowerCase())) {
          return {
            ok: true,
            json: async () => payload,
          };
        }
      }
      return {
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      };
    }

    if (String(url).startsWith('/api/route')) {
      if (typeof routeResponse === 'function') {
        const payload = routeResponse(String(url));
        return { ok: true, json: async () => payload };
      }
      if (routeResponse) {
        return { ok: true, json: async () => routeResponse };
      }
      return { ok: false, status: 404, json: async () => ({ ok: false }) };
    }

    if (String(url).startsWith('/api/overpass')) {
      if (overpassResponse) {
        return { ok: true, json: async () => overpassResponse };
      }
      return { ok: true, json: async () => ({ elements: [] }) };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

function createMockViewer() {
  const flyToCalls = [];
  let cancelFlightCalls = 0;
  let dataSources = [];
  const standaloneEntities = [];
  const viewer = {
    trackedEntity: { id: 'previous-lock' },
    camera: {
      positionCartographic: {
        latitude: Cesium.Math.toRadians(33.749),
        longitude: Cesium.Math.toRadians(-84.388),
        height: 1500,
      },
      cancelFlight: () => {
        cancelFlightCalls++;
      },
      flyTo: (opts) => {
        flyToCalls.push(opts);
      },
    },
    dataSources: {
      add: (ds) => {
        dataSources.push(ds);
        return ds;
      },
      remove: (ds) => {
        dataSources = dataSources.filter((item) => item !== ds);
      },
    },
    entities: {
      add: (spec) => {
        standaloneEntities.push(spec);
        return spec;
      },
      remove: () => {},
    },
    scene: {
      requestRender: () => {},
    },
  };
  return {
    viewer,
    getFlyToCalls: () => flyToCalls,
    getCancelFlightCalls: () => cancelFlightCalls,
    getDataSources: () => dataSources,
  };
}

test('Place resolver parses coordinates, domiciles, airports, metros, and mocked /api/geocode', async () => {
  const coord = parseCoordinateQuery('30.2672, -97.7431');
  assert.ok(coord);
  assert.equal(coord.source, 'coordinates');
  assert.ok(Math.abs(coord.lat - 30.2672) < 1e-4);

  const domicile = await resolvePlaceEndpoint('Northgate Manor', {
    getDomiciles: () => [
      {
        id: 'northgate-manor',
        name: 'Northgate Manor',
        shortLabel: 'NG Manor',
        city: 'Round Rock, TX',
        lat: 30.5083,
        lon: -97.6789,
        elev: 220,
      },
    ],
  });
  assert.equal(domicile.source, 'domicile');
  assert.equal(domicile.name, 'Northgate Manor');

  const jfk = await resolvePlaceEndpoint('KJFK');
  assert.equal(jfk.source, 'airport');
  assert.equal(jfk.code, 'JFK');
  assert.equal(jfk.countryCode, 'US');

  const tokyo = await resolvePlaceEndpoint('Tokyo');
  assert.equal(tokyo.source, 'gazetteer');
  assert.equal(tokyo.name, 'Tokyo');

  const { fetchImpl } = createMockFetch({
    geocodeMap: {
      'marble falls': {
        status: 'OK',
        results: [
          {
            formatted_address: 'Marble Falls, Texas, United States',
            geometry: { location: { lat: 30.2672, lng: -97.7431 } },
            types: ['city'],
            address_components: [
              { short_name: 'US', long_name: 'United States', types: ['country'] },
            ],
          },
        ],
      },
    },
  });

  const geocoded = await resolvePlaceEndpoint('Marble Falls, TX', { fetchImpl });
  assert.equal(geocoded.source, 'geocode');
  assert.ok(Math.abs(geocoded.lat - 30.2672) < 1e-4);
  assert.ok(Math.abs(geocoded.lon - -97.7431) < 1e-4);
  assert.equal(geocoded.countryCode, 'US');
});

test('extractGeocodeCandidate gracefully skips malformed candidates', () => {
  assert.equal(extractGeocodeCandidate(null), null);
  assert.equal(extractGeocodeCandidate({ status: 'ZERO_RESULTS', results: [] }), null);
  const parsed = extractGeocodeCandidate({
    results: [
      {
        display_name: 'Savannah, Chatham County, Georgia, United States',
        lat: '32.0809',
        lon: '-81.0912',
      },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.name, 'Savannah');
  assert.ok(Math.abs(parsed.lat - 32.0809) < 1e-4);
});

test('Macro relationship engine computes geodesic metrics, solar delta, border flag, and framing', async () => {
  const rel = await analyzePlaceRelationship('Atlanta, GA', 'Tokyo, Japan', {
    fetchImpl: createMockFetch().fetchImpl,
    naturalRegionResolver: async (lat, lon) => ({
      label: lon < -50 ? 'North America' : 'East Asia',
      region: lon < -50 ? 'Piedmont Plateau' : 'Kanto Plain',
      source: 'Natural Earth',
      kind: 'natural',
    }),
  });

  assert.ok(rel.greatCircleKm > 10500 && rel.greatCircleKm < 11600);
  assert.ok(rel.greatCircleMi > 6500);
  assert.ok(rel.greatCircleNm > 5600);
  assert.equal(rel.isCrossBorder, true);
  assert.equal(rel.framing.pitchDeg, -62);
  assert.equal(rel.framing.altitudeM, 18_000_000);
  assert.equal(rel.physiographicContext.originRegion, 'Piedmont Plateau');

  const bearing = calculateInitialBearingDeg(
    { lat: 33.749, lon: -84.388 },
    { lat: 32.0809, lon: -81.0912 },
  );
  assert.equal(bearingToCardinal16(bearing), 'ESE');

  const mid = computeGeodesicMidpoint(
    { lat: 35.6762, lon: 139.6503 },
    { lat: 34.0522, lon: -118.2437 },
  );
  assert.ok(Number.isFinite(mid.lat) && Number.isFinite(mid.lon));
  assert.ok(Math.abs(mid.lon) > 150);

  assert.equal(computeSolarTimeDeltaHours(-75, 0), 5);
  assert.equal(computeProportionalFramingAltitude(50), 120_000);
  assert.equal(computeProportionalFramingAltitude(15000), 18_000_000);
});

test('Multi-modal feasibility evaluator distinguishes short overland, H145 hops, coastal vs inland, and OSRM NoRoute', async () => {
  const { fetchImpl } = createMockFetch({
    geocodeMap: {
      savannah: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Savannah, GA, United States',
            geometry: { location: { lat: 32.0809, lng: -81.0912 } },
            address_components: [
              { short_name: 'US', long_name: 'United States', types: ['country'] },
            ],
          },
        ],
      },
    },
    routeResponse: {
      ok: true,
      distanceM: 402_000,
      durationS: 14_700,
      geometry: [
        [-84.388, 33.749],
        [-83.0, 32.8],
        [-81.0912, 32.0809],
      ],
    },
    overpassResponse: {
      elements: [
        { id: 101, lat: 33.75, lon: -84.39 },
        { id: 102, lat: 32.08, lon: -81.09 },
      ],
    },
  });

  const relShort = await analyzePlaceRelationship('Atlanta, GA', 'Savannah, GA', {
    fetchImpl,
    naturalRegionResolver: async () => ({ region: 'Georgia Coastal Plain', kind: 'natural' }),
  });

  const evalShort = await evaluateCorridorModes(
    relShort.origin,
    relShort.destination,
    relShort,
    {
      fetchImpl,
      naturalRegionResolver: async () => ({ region: 'Georgia Coastal Plain', kind: 'natural' }),
    },
  );

  assert.equal(evalShort.byId.drive.feasible, true);
  assert.equal(evalShort.byId.drive.badge, 'Realistic Drive');
  assert.equal(evalShort.byId.drive.roadPoints.length, 3);
  assert.equal(evalShort.byId.h145.feasible, true);
  assert.equal(evalShort.byId.h145.status, 'ideal');
  assert.equal(evalShort.byId.jet.feasible, true);
  assert.equal(evalShort.byId.rail.feasible, true);
  assert.equal(evalShort.byId.boat.visible, false);

  // Multi-hop helicopter band (~800 km)
  const h145Hop = evaluateHelicopterMode(
    relShort.origin,
    relShort.destination,
    { greatCircleKm: 820, greatCircleMi: 510 },
  );
  assert.equal(h145Hop.feasible, true);
  assert.equal(h145Hop.status, 'multi_hop');

  // Coastal marine visibility (Miami -> Nassau)
  const relMarine = await analyzePlaceRelationship('Miami, FL', {
    lat: 25.0443,
    lon: -77.3504,
    name: 'Nassau',
    countryCode: 'BS',
  }, {
    fetchImpl,
    naturalRegionResolver: async () => ({ region: 'Straits of Florida', kind: 'marine' }),
  });
  const boatViable = await evaluateMaritimeMode(
    relMarine.origin,
    relMarine.destination,
    relMarine,
    {
      naturalRegionResolver: async () => ({ region: 'Straits of Florida', kind: 'marine' }),
    },
  );
  assert.equal(boatViable.visible, true);
  assert.equal(boatViable.feasible, true);

  // Transoceanic guard (> 2,500 km skips OSRM)
  const { fetchImpl: noCallsFetch, calls } = createMockFetch();
  const relLong = await analyzePlaceRelationship('Atlanta, GA', 'Tokyo, Japan', {
    fetchImpl: noCallsFetch,
    naturalRegionResolver: async () => null,
  });
  const longRoad = await evaluateRoadMode(
    relLong.origin,
    relLong.destination,
    relLong,
    { fetchImpl: noCallsFetch },
  );
  assert.equal(longRoad.feasible, false);
  assert.equal(calls.length, 0);

  // OSRM explicit NoRoute failure
  const { fetchImpl: noRouteFetch } = createMockFetch({
    routeResponse: { ok: false, error: 'OSRM NoRoute across water barrier' },
  });
  const noRouteRoad = await evaluateRoadMode(
    relShort.origin,
    relShort.destination,
    relShort,
    { fetchImpl: noRouteFetch },
  );
  assert.equal(noRouteRoad.feasible, false);
});

test('Rail & water waypoint helpers support coordinate objects and async geocode fallback', async () => {
  const { fetchImpl } = createMockFetch({
    geocodeMap: {
      atlanta: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Atlanta, GA',
            geometry: { location: { lat: 33.749, lng: -84.388 } },
          },
        ],
      },
      savannah: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Savannah, GA',
            geometry: { location: { lat: 32.0809, lng: -81.0912 } },
          },
        ],
      },
    },
  });

  const syncCustom = resolveRailWaypoints(
    { lat: 33.749, lon: -84.388, name: 'Atlanta Custom', elev: 320 },
    { lat: 32.0809, lon: -81.0912, name: 'Savannah Custom', elev: 15 },
  );
  assert.equal(syncCustom.from.name, 'Atlanta Custom');
  assert.equal(syncCustom.to.name, 'Savannah Custom');

  const asyncResolved = await resolveRailWaypointsAsync(
    'Atlanta, GA',
    'Savannah, GA',
    { fetchImpl },
  );
  assert.equal(asyncResolved.isFallback, false);
  assert.ok(Math.abs(asyncResolved.to.lat - 32.0809) < 1e-3);

  const waterObj = resolveWaterWaypoints(
    { lat: 25.7617, lon: -80.1918, name: 'Port Miami', elev: 2 },
    { lat: 25.0443, lon: -77.3504, name: 'Nassau Harbor', elev: 3 },
  );
  assert.equal(waterObj.from.name, 'Port Miami');
  assert.equal(waterObj.to.name, 'Nassau Harbor');
});

test('CorridorVisualizer builds arc, renders pins/arc/road preview, and frames globe cleanly', async () => {
  const rel = await analyzePlaceRelationship(
    { lat: 33.749, lon: -84.388, name: 'Atlanta', elev: 320 },
    { lat: 32.0809, lon: -81.0912, name: 'Savannah', elev: 15 },
    { naturalRegionResolver: async () => null },
  );

  const arc = buildGeodesicArcPositions(rel.origin, rel.destination, {
    steps: 12,
    peakAltitudeM: 40_000,
  });
  assert.equal(arc.length, 13);
  assert.ok(arc[6].altM > arc[0].altM);

  const pose = computeOrbitalCameraPose(rel);
  assert.equal(pose.pitchDeg, -62);
  assert.ok(pose.altitudeM >= 120_000);

  const { viewer, getFlyToCalls, getCancelFlightCalls, getDataSources } =
    createMockViewer();
  const vis = createCorridorVisualizer({ viewer });

  vis.renderRelationship(rel, {
    roadMode: {
      geometry: {
        coordinates: [
          [-84.388, 33.749],
          [-82.5, 32.8],
          [-81.0912, 32.0809],
        ],
      },
    },
  });

  assert.equal(getCancelFlightCalls(), 1);
  assert.equal(viewer.trackedEntity, undefined);
  assert.equal(getFlyToCalls().length, 1);
  assert.equal(getDataSources().length, 1);
  assert.equal(getDataSources()[0].entities.values.length, 6);

  vis.clear();
  assert.equal(getDataSources()[0].entities.values.length, 0);
  vis.destroy();
  assert.equal(getDataSources().length, 0);
});

test('CorridorDrawer coordinates mutual exclusion, Alt+H, hotkey K, deeplinks, sim launches & AgentBridge', async () => {
  document.body.replaceChildren();
  const coordinator = getGlobalDrawerCoordinator();

  let otherDrawerOpen = false;
  coordinator.registerDrawer('test-other', {
    open: () => {
      otherDrawerOpen = true;
    },
    close: () => {
      otherDrawerOpen = false;
    },
    isOpen: () => otherDrawerOpen,
  });

  const launchLog = [];
  const { fetchImpl } = createMockFetch({
    geocodeMap: {
      savannah: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Savannah, GA, United States',
            geometry: { location: { lat: 32.0809, lng: -81.0912 } },
            address_components: [
              { short_name: 'US', long_name: 'United States', types: ['country'] },
            ],
          },
        ],
      },
    },
    routeResponse: {
      ok: true,
      distanceM: 398_000,
      durationS: 14_200,
      geometry: [
        [-84.388, 33.749],
        [-81.0912, 32.0809],
      ],
    },
  });

  const { viewer } = createMockViewer();
  const visualizer = createCorridorVisualizer({ viewer });

  const drawer = createCorridorDrawer({
    viewer,
    visualizer,
    coordinator,
    fetchImpl,
    naturalRegionResolver: async () => ({ region: 'Piedmont', kind: 'natural' }),
    domiciles: [
      {
        id: 'home',
        name: 'Austin Crest Estate',
        shortLabel: 'AC Estate',
        city: 'Austin, TX',
        lat: 30.2672,
        lon: -97.7431,
        elev: 165,
        icon: '🏡',
      },
    ],
    driveEngine: {
      startRouteDrive: async (from, to, opts) => {
        launchLog.push({ mode: 'drive', from, to, opts });
      },
    },
    flightEngine: {
      spawnFlightRoute: async (from, to, opts) => {
        launchLog.push({ mode: opts.aircraftType || 'jet', from, to, opts });
      },
    },
    railwayEngine: {
      spawnRailRoute: async (from, to, opts) => {
        launchLog.push({ mode: 'rail', from, to, opts });
      },
    },
    boatEngine: {
      spawnBoatRoute: async (from, to, opts) => {
        launchLog.push({ mode: 'boat', from, to, opts });
      },
    },
    autoRunDeeplink: false,
  });

  // Phase 2 compatibility shim mounts zero legacy bottom-right charm launcher DOM
  assert.equal(document.querySelector('.gev-corridor-launcher-btn'), null);

  // Mutual exclusion with other drawer
  coordinator.openDrawer('test-other');
  assert.equal(otherDrawerOpen, true);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
  assert.equal(drawer.isOpen(), true);
  assert.equal(otherDrawerOpen, false);

  // Deeplink parser
  assert.deepEqual(
    parseCorridorDeeplink('?connectFrom=Atlanta&connectTo=Tokyo'),
    { from: 'Atlanta', to: 'Tokyo' },
  );
  assert.deepEqual(
    parseCorridorDeeplink('?relFrom=Miami&relTo=Nassau'),
    { from: 'Miami', to: 'Nassau' },
  );

  // AgentBridge connect_places
  const bridge = initAgentBridge({
    getCorridorDrawer: () => drawer,
    EventSourceClass: null,
  });
  assert.ok(bridge);

  const bridgeWithEs = initAgentBridge({
    getCorridorDrawer: () => drawer,
    EventSourceClass: class MockES {
      close() {}
    },
  });
  await bridgeWithEs.dispatchLocal({
    action: 'connect_places',
    origin: 'Austin Crest Estate',
    destination: 'San Antonio, TX',
  });

  const state = drawer.getState();
  assert.ok(state.relationship);
  assert.equal(state.relationship.origin.name, 'Austin Crest Estate');
  assert.ok(state.modes.byId.drive.feasible);

  // 1-click launches for drive and Airbus H145 (must emit coordinator simulation-started so ActiveSimMicroHud shows)
  const simEvents = [];
  const unsubSimEvents = coordinator.onSimulationStateChange((evt) =>
    simEvents.push(evt),
  );
  assert.ok(state.modes.byId.h145.feasible);
  await drawer.launchMode('drive');
  await drawer.launchMode('h145');
  unsubSimEvents();
  assert.equal(launchLog[0].mode, 'drive');
  assert.equal(launchLog[1].mode, 'h145');
  assert.equal(launchLog[1].opts.isRotorcraft, true);
  assert.ok(
    simEvents.some((e) => e?.type === 'started' && e?.id === 'drive'),
    'Launching drive from Connect Places must emit simulation-started so Drive camera HUD strip appears',
  );

  bridgeWithEs.destroy();
  coordinator.unregisterDrawer('test-other');
  drawer.destroy();
  visualizer.destroy();
});

test('Place resolver resolves worldwide non-metro places via offline 7,342-city pack, unified placeSearch, and Photon even when Nominatim is unconfigured', async () => {
  const unconfiguredFetch = async (url) => {
    if (String(url).startsWith('/api/geocode')) {
      return { ok: false, status: 503, json: async () => ({ error: 'Not configured' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  // 1. Offline 7,342-city Natural Earth resolution (bare name + comma-qualified fallback)
  const agua = await resolvePlaceEndpoint('aguascalientes', {
    fetchImpl: unconfiguredFetch,
  });
  assert.ok(agua);
  assert.equal(agua.name, 'Aguascalientes');
  assert.equal(agua.source, 'natural-earth-places');
  assert.equal(agua.countryCode, 'MX');
  assert.ok(Math.abs(agua.lat - 21.881) < 0.05);
  assert.ok(Math.abs(agua.lon - -102.292) < 0.05);

  const aguaQual = await resolvePlaceEndpoint('Aguascalientes, Mexico', {
    fetchImpl: unconfiguredFetch,
  });
  assert.ok(aguaQual);
  assert.equal(aguaQual.countryCode, 'MX');

  const relCross = await analyzePlaceRelationship('aguascalientes', 'Austin, TX', {
    fetchImpl: unconfiguredFetch,
  });
  assert.equal(relCross.isCrossBorder, true);
  assert.ok(relCross.greatCircleKm > 950 && relCross.greatCircleKm < 1150);

  // 2. Unified placeSearch delegation
  const viaPlaceSearch = await resolvePlaceEndpoint('Chamonix Mont-Blanc', {
    fetchImpl: unconfiguredFetch,
    placeSearch: {
      async geocode(q) {
        if (!q.toLowerCase().includes('chamonix')) return { place: null, answered: true };
        return {
          answered: true,
          place: {
            lat: 45.9237,
            lng: 6.8694,
            name: 'Chamonix-Mont-Blanc',
            label: 'Chamonix-Mont-Blanc, Auvergne-Rhône-Alpes, France',
            types: ['locality'],
            viewport: null,
          },
        };
      },
    },
  });
  assert.ok(viaPlaceSearch);
  assert.equal(viaPlaceSearch.source, 'placeSearch');
  assert.equal(viaPlaceSearch.countryCode, 'FR');

  // 3. Direct Photon fallback when Nominatim /api/geocode returns 503
  const photonFetch = async (url) => {
    if (String(url).startsWith('https://photon.komoot.io/api/')) {
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                osm_key: 'place',
                osm_value: 'town',
                type: 'city',
                name: 'Zermatt',
                state: 'Valais',
                country: 'Schweiz',
                countrycode: 'CH',
              },
              geometry: { type: 'Point', coordinates: [7.7491, 46.0207] },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const viaPhoton = await resolvePlaceEndpoint('Zermatt', {
    fetchImpl: photonFetch,
  });
  assert.ok(viaPhoton);
  assert.equal(viaPhoton.source, 'photon');
  assert.equal(viaPhoton.countryCode, 'CH');
  assert.ok(Math.abs(viaPhoton.lat - 46.0207) < 1e-4);
});

test('Claimed domiciles render human-readable titles in Estate dropdowns, sync live, and resolve by title', async () => {
  document.body.replaceChildren();
  clearClaimedDomicilesForTest();

  const d1 = claimDomicileAtLocation({
    title: 'Peachtree Loft',
    lat: 30.2672,
    lon: -97.7431,
    typology: 'primary_residence',
    localityLabel: 'Atlanta, GA',
  });
  const d2 = claimDomicileAtLocation({
    title: 'Coastal Sanctuary',
    lat: 28.0836,
    lon: -80.6081,
    typology: 'vacation_sanctuary',
    localityLabel: 'Melbourne, FL',
  });
  const d3 = claimDomicileAtLocation({
    title: 'Coastal Sanctuary',
    lat: 32.0338,
    lon: -80.9604,
    typology: 'vacation_sanctuary',
    localityLabel: 'Savannah, GA',
  });

  const { viewer } = createMockViewer();
  const drawer = createCorridorDrawer({
    viewer,
    autoRunDeeplink: false,
  });

  const initialEstates = drawer.getEstateOptions();
  const optionTexts = initialEstates.map((o) => o.label);
  const optionValues = initialEstates.map((o) => o.value);
  assert.equal(optionValues.length, 3);
  assert.ok(optionValues.every((v) => !v.startsWith('claimed_')));
  assert.ok(optionTexts.every((t) => !t.includes('claimed_')));
  assert.ok(optionTexts.some((t) => t.includes('Peachtree Loft')));
  assert.ok(optionValues.includes('Peachtree Loft'));
  // Duplicate titles get disambiguated with address
  assert.ok(optionValues.includes('Coastal Sanctuary (Melbourne, FL)'));
  assert.ok(optionValues.includes('Coastal Sanctuary (Savannah, GA)'));

  // Newly claimed domicile syncs live into existing estate options
  const d4 = claimDomicileAtLocation({
    title: 'Mesa Venture HQ',
    lat: 32.351,
    lon: -106.7655,
    typology: 'venture_hq',
    localityLabel: 'Las Cruces, NM',
  });
  const updatedEstates = drawer.getEstateOptions();
  assert.equal(updatedEstates.length, 4);
  assert.ok(updatedEstates.some((o) => o.value === 'Mesa Venture HQ'));

  // Selecting an estate populates input & resolves cleanly via title or disambiguated value
  const resolvedUnique = await resolvePlaceEndpoint(d1.title);
  assert.ok(resolvedUnique);
  assert.equal(resolvedUnique.source, 'domicile');
  assert.equal(resolvedUnique.name, 'Peachtree Loft');
  assert.ok(Math.abs(resolvedUnique.lat - 30.2672) < 1e-4);

  const resolvedDup = await resolvePlaceEndpoint('Coastal Sanctuary (Savannah, GA)');
  assert.ok(resolvedDup);
  assert.equal(resolvedDup.source, 'domicile');
  assert.equal(resolvedDup.name, 'Coastal Sanctuary');
  assert.ok(Math.abs(resolvedDup.lat - d3.lat) < 1e-4);

  const resolvedHq = await resolvePlaceEndpoint(d4.id);
  assert.ok(resolvedHq);
  assert.equal(resolvedHq.name, 'Mesa Venture HQ');

  // Ensure d2 is distinguishable too
  const resolvedMelbourne = await resolvePlaceEndpoint('Coastal Sanctuary (Melbourne, FL)');
  assert.ok(Math.abs(resolvedMelbourne.lat - d2.lat) < 1e-4);

  drawer.destroy();
  clearClaimedDomicilesForTest();
});

test('CorridorVisualizer frames midpoint in view (south-offset fallback + flyToBoundingSphere when available)', async () => {
  const rel = await analyzePlaceRelationship(
    { lat: 21.881, lon: -102.292, name: 'Aguascalientes', elev: 20 },
    { lat: 19.4326, lon: -99.1332, name: 'Mexico City', elev: 20 },
    { naturalRegionResolver: async () => null },
  );

  const pose = computeOrbitalCameraPose(rel);
  assert.ok(pose.destinationLat < rel.midpoint.lat);
  assert.equal(pose.centerLat, rel.midpoint.lat);

  const bsCalls = [];
  const { viewer, getFlyToCalls } = createMockViewer();
  viewer.camera.flyToBoundingSphere = (sphere, options) => {
    bsCalls.push({ sphere, options });
  };

  const vis = createCorridorVisualizer({ viewer });
  vis.renderRelationship(rel);

  assert.equal(bsCalls.length, 1);
  assert.equal(getFlyToCalls().length, 0);
  assert.ok(bsCalls[0].sphere.radius >= 25_000);
  assert.ok(bsCalls[0].options.offset.range >= pose.altitudeM);

  vis.destroy();
});
