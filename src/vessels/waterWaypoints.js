/**
 * Modular Waterway Registry & Vessel Hydrodynamics Catalog for World of Sails.
 * (World of Sails Capability + Route Slice)
 *
 * Provides extensible coastal and inland waterbody presets, multi-class vessel
 * hydrodynamic parameters, dynamic water-surface elevation sampling (solving the
 * 326m Lake Lanier inland elevation trap), and coordinate resolution.
 */

export const VESSEL_CLASSES = Object.freeze({
  sloop: {
    id: 'sloop',
    name: 'Sloop (Day Sailer)',
    description:
      'Authentic mono-hull day sailer with realistic 4-6 knot cruising pace, full rigging, and Dacron sails.',
    minSpeedKnots: 2,
    maxSpeedKnots: 8,
    defaultSpeedKnots: 5,
    draftOffsetMeters: 0.5,
    dimensions: { length: 10.5, width: 3.2, height: 14.0 }, // mast height
    modelScale: 0.8,
    cameraOffsets: {
      helm: { x: 0.0, y: -2.5, z: 1.8 }, // At the tiller looking across teak foredeck
      chase: { x: 0.0, y: -34.0, z: 10.0 }, // Trailing wake looking down the reach
      flybridge: { x: 0.0, y: -6.0, z: 12.0 }, // Masthead spreader view
      overview: { x: 0.0, y: -7000.0, z: 5500.0 }, // Regional tactical overview
    },
  },
  motorboat: {
    id: 'motorboat',
    name: 'Motorboat (Runabout)',
    description:
      'Planing deep-V runabout with comfortable 16 knot cruising speed and twin wake ribbons.',
    minSpeedKnots: 6,
    maxSpeedKnots: 28,
    defaultSpeedKnots: 16,
    draftOffsetMeters: 0.4,
    dimensions: { length: 8.5, width: 2.6, height: 2.4 },
    modelScale: 0.6,
    cameraOffsets: {
      helm: { x: -0.35, y: -0.6, z: 1.8 }, // Driver bucket seat looking through windshield
      chase: { x: 0.0, y: -30.0, z: 9.0 }, // Close spray trail
      flybridge: { x: 0.0, y: -8.0, z: 7.0 }, // Elevated bimini
      overview: { x: 0.0, y: -7000.0, z: 5500.0 }, // Regional tactical overview
    },
  },
  yacht: {
    id: 'yacht',
    name: 'Luxury Yacht (Cruiser)',
    description:
      'Stately multi-deck motor yacht with smooth 11 knot displacement cruising and commanding bridge.',
    minSpeedKnots: 5,
    maxSpeedKnots: 20,
    defaultSpeedKnots: 11,
    draftOffsetMeters: 0.8,
    dimensions: { length: 26.0, width: 6.2, height: 6.8 },
    modelScale: 1.4,
    cameraOffsets: {
      helm: { x: 0.0, y: 2.0, z: 3.6 }, // Main enclosed wheelhouse
      chase: { x: 0.0, y: -55.0, z: 16.0 }, // Grand trailing perspective
      flybridge: { x: 0.0, y: -6.0, z: 8.5 }, // Top sun deck flybridge
      overview: { x: 0.0, y: -7000.0, z: 5500.0 }, // Regional tactical overview
    },
  },
});

export const WATER_PRESETS = Object.freeze({
  savannah_barrier_islands: {
    id: 'savannah_barrier_islands',
    name: 'Savannah: Barrier Islands & Wassaw Sound',
    region: 'Georgia Coast, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'sloop',
    defaultSpeedKnots: 5,
    bbox: [31.85, -81.08, 32.05, -80.85],
    from: {
      name: 'Thunderbolt Harbor & ICW Mile 582',
      lat: 32.0325,
      lon: -81.049,
      elev: 0,
    },
    to: {
      name: 'Wassaw Sound - Atlantic Ocean Inlet',
      lat: 31.868,
      lon: -80.892,
      elev: 0,
    },
    waypoints: [
      {
        name: 'Thunderbolt Harbor & ICW Mile 582',
        lat: 32.0325,
        lon: -81.049,
        elev: 0,
      },
      {
        name: 'Wilmington River - Bonaventure Reach',
        lat: 32.021,
        lon: -81.041,
        elev: 0,
      },
      {
        name: 'Wilmington River - Causton Bluff Turn',
        lat: 32.008,
        lon: -81.028,
        elev: 0,
      },
      {
        name: 'Wilmington River - Grays Creek Reach',
        lat: 31.992,
        lon: -81.011,
        elev: 0,
      },
      {
        name: 'Wilmington River - Priest Landing',
        lat: 31.977,
        lon: -80.995,
        elev: 0,
      },
      {
        name: 'Wilmington River - Skidaway East Reach',
        lat: 31.96,
        lon: -80.984,
        elev: 0,
      },
      {
        name: 'Wilmington River - Halfmoon River Reach',
        lat: 31.942,
        lon: -80.974,
        elev: 0,
      },
      {
        name: 'Wilmington River - Adams Creek Confluence',
        lat: 31.925,
        lon: -80.966,
        elev: 0,
      },
      {
        name: 'Wilmington River - Cabbage Island Cut',
        lat: 31.908,
        lon: -80.956,
        elev: 0,
      },
      {
        name: 'Wassaw Sound - North Channel',
        lat: 31.895,
        lon: -80.938,
        elev: 0,
      },
      {
        name: 'Wassaw Sound - Mid-Sound Deepwater',
        lat: 31.882,
        lon: -80.915,
        elev: 0,
      },
      {
        name: 'Wassaw Sound - Atlantic Ocean Inlet',
        lat: 31.868,
        lon: -80.892,
        elev: 0,
      },
    ],
  },

  savannah_river_ocean: {
    id: 'savannah_river_ocean',
    name: 'Savannah River: Historic River Street to Tybee Roads Ocean',
    region: 'Georgia Coast, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'yacht',
    defaultSpeedKnots: 11,
    bbox: [32.0, -81.1, 32.1, -80.8],
    from: {
      name: 'Savannah River Street Waterfront',
      lat: 32.0815,
      lon: -81.0905,
      elev: 0,
    },
    to: {
      name: 'Tybee Roads Ocean Inlet Buoy',
      lat: 32.015,
      lon: -80.825,
      elev: 0,
    },
    waypoints: [
      {
        name: 'Savannah River Street Waterfront',
        lat: 32.0815,
        lon: -81.0905,
        elev: 0,
      },
      {
        name: 'Old Fort Jackson Deepwater Reach',
        lat: 32.081,
        lon: -81.036,
        elev: 0,
      },
      {
        name: 'Elba Island LNG Terminal Reach',
        lat: 32.085,
        lon: -80.995,
        elev: 0,
      },
      {
        name: 'Savannah River Shipping Channel Bight',
        lat: 32.068,
        lon: -80.95,
        elev: 0,
      },
      {
        name: 'Cockspur Island / Fort Pulaski Channel',
        lat: 32.034,
        lon: -80.899,
        elev: 0,
      },
      {
        name: 'Tybee Island Lighthouse Reach',
        lat: 32.022,
        lon: -80.849,
        elev: 0,
      },
      {
        name: 'Tybee Roads Ocean Inlet Buoy',
        lat: 32.015,
        lon: -80.825,
        elev: 0,
      },
    ],
  },

  savannah_skidaway_narrows: {
    id: 'savannah_skidaway_narrows',
    name: 'Skidaway Narrows: Isle of Hope to Vernon River & Wassaw',
    region: 'Georgia Coast, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'sloop',
    defaultSpeedKnots: 5,
    bbox: [31.85, -81.08, 32.0, -80.88],
    from: {
      name: 'Isle of Hope Historic Marina',
      lat: 31.983,
      lon: -81.055,
      elev: 0,
    },
    to: {
      name: 'Wassaw Sound - South Channel',
      lat: 31.87,
      lon: -80.9,
      elev: 0,
    },
    waypoints: [
      {
        name: 'Isle of Hope Historic Marina',
        lat: 31.983,
        lon: -81.055,
        elev: 0,
      },
      {
        name: 'Skidaway River - Isle of Hope Bend',
        lat: 31.972,
        lon: -81.052,
        elev: 0,
      },
      {
        name: 'Skidaway River - Dutch Island Reach',
        lat: 31.961,
        lon: -81.049,
        elev: 0,
      },
      {
        name: 'Skidaway Narrows - Diamond Causeway',
        lat: 31.952,
        lon: -81.0485,
        elev: 0,
      },
      {
        name: 'Skidaway Narrows - Butter Bean Beach',
        lat: 31.942,
        lon: -81.0505,
        elev: 0,
      },
      {
        name: 'Burnside River Main Channel',
        lat: 31.928,
        lon: -81.055,
        elev: 0,
      },
      {
        name: 'Burnside River - Back River Turn',
        lat: 31.916,
        lon: -81.046,
        elev: 0,
      },
      {
        name: 'Vernon River Confluence',
        lat: 31.908,
        lon: -81.026,
        elev: 0,
      },
      {
        name: 'Romerly Marsh Creek Channel',
        lat: 31.9,
        lon: -80.998,
        elev: 0,
      },
      {
        name: 'Wilmington River Confluence',
        lat: 31.895,
        lon: -80.968,
        elev: 0,
      },
      {
        name: 'Wassaw Sound Open Reach',
        lat: 31.885,
        lon: -80.935,
        elev: 0,
      },
      {
        name: 'Wassaw Sound - South Channel',
        lat: 31.87,
        lon: -80.9,
        elev: 0,
      },
    ],
  },

  tybee_roads: {
    id: 'tybee_roads',
    name: 'Tybee Roads & Savannah River Estuary',
    region: 'Georgia Coast, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'motorboat',
    defaultSpeedKnots: 16,
    bbox: [32.0, -80.92, 32.09, -80.8],
    from: {
      name: 'Tybee Light Harbor',
      lat: 32.022,
      lon: -80.849,
      elev: 0,
    },
    to: {
      name: 'Savannah River South Channel',
      lat: 32.045,
      lon: -80.915,
      elev: 0,
    },
    waypoints: [
      { name: 'Tybee Light Harbor', lat: 32.022, lon: -80.849, elev: 0 },
      { name: 'Fort Pulaski Moat Reach', lat: 32.029, lon: -80.885, elev: 0 },
      {
        name: 'Cockspur Island Lighthouse',
        lat: 32.034,
        lon: -80.899,
        elev: 0,
      },
      {
        name: 'Savannah River South Channel',
        lat: 32.045,
        lon: -80.915,
        elev: 0,
      },
    ],
  },

  key_west: {
    id: 'key_west',
    name: 'Key West Harbor & Sand Key Reef',
    region: 'Florida Keys, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'sloop',
    defaultSpeedKnots: 5,
    bbox: [24.45, -81.9, 24.58, -81.75],
    from: {
      name: 'Key West Bight Marina',
      lat: 24.5615,
      lon: -81.802,
      elev: 0,
    },
    to: {
      name: 'Sand Key Reef Lighthouse',
      lat: 24.521,
      lon: -81.878,
      elev: 0,
    },
    waypoints: [
      { name: 'Key West Bight Marina', lat: 24.5615, lon: -81.802, elev: 0 },
      {
        name: 'Sunset Pier / Mallory Square',
        lat: 24.5595,
        lon: -81.8075,
        elev: 0,
      },
      {
        name: 'Key West Northwest Channel',
        lat: 24.553,
        lon: -81.828,
        elev: 0,
      },
      { name: 'Middle Ground Shoal', lat: 24.538, lon: -81.855, elev: 0 },
      { name: 'Sand Key Reef Lighthouse', lat: 24.521, lon: -81.878, elev: 0 },
    ],
  },

  san_francisco_bay: {
    id: 'san_francisco_bay',
    name: 'San Francisco Bay & Golden Gate',
    region: 'California, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'yacht',
    defaultSpeedKnots: 11,
    bbox: [37.78, -122.52, 37.86, -122.38],
    from: {
      name: 'Fisherman Wharf Pier 39',
      lat: 37.8105,
      lon: -122.4105,
      elev: 0,
    },
    to: {
      name: 'Golden Gate Bridge South Tower',
      lat: 37.8185,
      lon: -122.4785,
      elev: 0,
    },
    waypoints: [
      {
        name: 'Fisherman Wharf Pier 39',
        lat: 37.8105,
        lon: -122.4105,
        elev: 0,
      },
      { name: 'Aquatic Park Cove', lat: 37.808, lon: -122.424, elev: 0 },
      { name: 'Fort Mason Waterfront', lat: 37.807, lon: -122.432, elev: 0 },
      { name: 'Marina Green Shoal', lat: 37.807, lon: -122.443, elev: 0 },
      { name: 'Crissy Field Reach', lat: 37.808, lon: -122.458, elev: 0 },
      { name: 'Fort Point Eddy', lat: 37.811, lon: -122.472, elev: 0 },
      {
        name: 'Golden Gate Bridge South Tower',
        lat: 37.8185,
        lon: -122.4785,
        elev: 0,
      },
    ],
  },

  lake_lanier: {
    id: 'lake_lanier',
    name: 'Lake Lanier: Islands to Buford Dam',
    region: 'Georgia Foothills, USA',
    isOcean: false,
    nominalElevationM: 326, // Inland elevation trap anchor: ~1,071 ft MSL
    defaultVessel: 'motorboat',
    defaultSpeedKnots: 16,
    bbox: [34.13, -84.12, 34.22, -84.0],
    from: {
      name: 'Lake Lanier Islands Marina',
      lat: 34.187,
      lon: -84.0185,
      elev: 326,
    },
    to: {
      name: 'Buford Dam Forebay Basin',
      lat: 34.1555,
      lon: -84.075,
      elev: 326,
    },
    waypoints: [
      {
        name: 'Lake Lanier Islands Marina',
        lat: 34.187,
        lon: -84.0185,
        elev: 326,
      },
      { name: 'Big Creek Main Channel', lat: 34.178, lon: -84.035, elev: 326 },
      { name: 'Holiday Marina Reach', lat: 34.172, lon: -84.048, elev: 326 },
      { name: 'Shoal Creek Confluence', lat: 34.165, lon: -84.062, elev: 326 },
      {
        name: 'Buford Dam Forebay Basin',
        lat: 34.1555,
        lon: -84.075,
        elev: 326,
      },
    ],
  },

  lake_allatoona: {
    id: 'lake_allatoona',
    name: 'Lake Allatoona: Red Top Mountain Basin',
    region: 'Georgia Ridge, USA',
    isOcean: false,
    nominalElevationM: 256, // ~840 ft MSL
    defaultVessel: 'sloop',
    defaultSpeedKnots: 5,
    bbox: [34.12, -84.75, 34.19, -84.66],
    from: {
      name: 'Red Top Mountain State Park Beach',
      lat: 34.159,
      lon: -84.7075,
      elev: 256,
    },
    to: {
      name: 'Allatoona Dam Overlook',
      lat: 34.1675,
      lon: -84.7435,
      elev: 256,
    },
    waypoints: [
      {
        name: 'Red Top Mountain State Park Beach',
        lat: 34.159,
        lon: -84.7075,
        elev: 256,
      },
      { name: 'Iron Hill Tongue', lat: 34.155, lon: -84.718, elev: 256 },
      { name: 'Stamp Creek Arm', lat: 34.161, lon: -84.731, elev: 256 },
      {
        name: 'Allatoona Dam Overlook',
        lat: 34.1675,
        lon: -84.7435,
        elev: 256,
      },
    ],
  },

  lake_tahoe: {
    id: 'lake_tahoe',
    name: 'Lake Tahoe: Emerald Bay to Tahoe City',
    region: 'Sierra Nevada, CA/NV, USA',
    isOcean: false,
    nominalElevationM: 1897, // High-altitude alpine lake: ~6,225 ft MSL
    defaultVessel: 'motorboat',
    defaultSpeedKnots: 16,
    bbox: [38.94, -120.15, 39.2, -120.0],
    from: {
      name: 'Emerald Bay Fannette Island',
      lat: 38.955,
      lon: -120.098,
      elev: 1897,
    },
    to: {
      name: 'Tahoe City Marina',
      lat: 39.171,
      lon: -120.139,
      elev: 1897,
    },
    waypoints: [
      {
        name: 'Emerald Bay Fannette Island',
        lat: 38.955,
        lon: -120.098,
        elev: 1897,
      },
      {
        name: 'Emerald Bay Throat Inlet',
        lat: 38.961,
        lon: -120.082,
        elev: 1897,
      },
      {
        name: 'Rubicon Point Cliff Channel',
        lat: 38.995,
        lon: -120.071,
        elev: 1897,
      },
      { name: 'Meeks Bay Shoreline', lat: 39.038, lon: -120.118, elev: 1897 },
      { name: 'Sugar Pine Point Park', lat: 39.062, lon: -120.108, elev: 1897 },
      {
        name: 'Homewood Marina Channel',
        lat: 39.088,
        lon: -120.158,
        elev: 1897,
      },
      { name: 'Tahoe City Marina', lat: 39.171, lon: -120.139, elev: 1897 },
    ],
  },

  hudson_river: {
    id: 'hudson_river',
    name: 'Hudson River: Battery to Intrepid & GWB',
    region: 'New York, USA',
    isOcean: true,
    nominalElevationM: 0,
    defaultVessel: 'yacht',
    defaultSpeedKnots: 11,
    bbox: [40.69, -74.04, 40.86, -73.94],
    from: {
      name: 'Battery Park Staten Island Ferry Slip',
      lat: 40.701,
      lon: -74.015,
      elev: 0,
    },
    to: {
      name: 'George Washington Bridge Pier',
      lat: 40.851,
      lon: -73.953,
      elev: 0,
    },
    waypoints: [
      {
        name: 'Battery Park Staten Island Ferry Slip',
        lat: 40.701,
        lon: -74.015,
        elev: 0,
      },
      {
        name: 'World Financial Center Marina',
        lat: 40.713,
        lon: -74.018,
        elev: 0,
      },
      {
        name: 'Chelsea Piers Hudson Reach',
        lat: 40.748,
        lon: -74.011,
        elev: 0,
      },
      {
        name: 'Intrepid Sea, Air & Space Pier 86',
        lat: 40.765,
        lon: -74.002,
        elev: 0,
      },
      { name: 'Riverside Park Waterfront', lat: 40.803, lon: -73.974, elev: 0 },
      {
        name: 'George Washington Bridge Pier',
        lat: 40.851,
        lon: -73.953,
        elev: 0,
      },
    ],
  },
});

/**
 * Calculates Great-Circle Haversine distance in meters between two lat/lon coordinates.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates distance in nautical miles (1 NM = 1,852 meters).
 */
export function calculateNauticalDistance(lat1, lon1, lat2, lon2) {
  return calculateHaversineDistance(lat1, lon1, lat2, lon2) / 1852.0;
}

/**
 * Converts velocity in knots to meters per second (1 knot = 0.514444 m/s).
 */
export function knotsToMetersPerSecond(knots) {
  return (Number(knots) || 0) * 0.5144444444444445;
}

/**
 * Converts meters per second to knots.
 */
export function metersPerSecondToKnots(mps) {
  return (Number(mps) || 0) / 0.5144444444444445;
}

/**
 * Converts knots to miles per hour (1 knot = 1.150779 mph).
 */
export function knotsToMph(knots) {
  return (Number(knots) || 0) * 1.150779448;
}

/**
 * Calculates total route distance along an array of waypoints in meters.
 */
export function calculateWaterRouteDistance(waypoints = []) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalMeters += calculateHaversineDistance(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
    );
  }
  return totalMeters;
}

/**
 * Calculates travel duration in seconds based on distance in meters and speed in knots.
 */
export function calculateWaterTravelDurationSeconds(
  distanceMeters,
  speedKnots = 8,
) {
  const safeKnots = Math.max(1, Number(speedKnots) || 8);
  const speedMetersPerSec = knotsToMetersPerSecond(safeKnots);
  return Math.max(10, Math.round(distanceMeters / speedMetersPerSec));
}

/**
 * Resolves a waterway preset by ID, name, or region.
 */
export function resolveWaterPreset(query) {
  if (!query || typeof query !== 'string') return null;
  const clean = query.trim().toLowerCase();

  // 1. Direct ID match
  if (WATER_PRESETS[clean]) {
    return WATER_PRESETS[clean];
  }

  // 2. Fuzzy name or region match
  for (const preset of Object.values(WATER_PRESETS)) {
    if (
      preset.id.toLowerCase() === clean ||
      preset.name.toLowerCase().includes(clean) ||
      preset.region.toLowerCase().includes(clean)
    ) {
      return preset;
    }
  }

  return null;
}

/**
 * Dynamic Water Surface Elevation Sampler.
 *
 * Solves the critical Inland Elevation Trap (e.g. Lake Lanier at ~326m, Lake Tahoe at ~1,897m).
 * Samples the loaded Cesium terrain mesh at (lon, lat). If valid terrain elevation is returned,
 * clamps vessel to (sampledHeight + draftOffset). Defaults to nominal MSL (0.0 + draftOffset) for
 * open ocean or unloaded tiles.
 */
export function sampleWaterSurfaceAltitude(
  viewer,
  lon,
  lat,
  draftOffset = 0.5,
  nominalElevationM = 0.0,
  excludeEntities = [],
) {
  const safeDraft = Number(draftOffset) || 0.5;
  const fallbackBase = Number.isFinite(Number(nominalElevationM))
    ? Number(nominalElevationM)
    : 0.0;

  if (viewer?.scene) {
    try {
      const Cesium =
        globalThis.Cesium || viewer.scene.globe?.constructor?.Cesium;
      const carto = Cesium?.Cartographic?.fromDegrees
        ? Cesium.Cartographic.fromDegrees(lon, lat)
        : {
            longitude: (lon * Math.PI) / 180,
            latitude: (lat * Math.PI) / 180,
            height: 0,
          };
      const is3D = viewer.scene.globe?.show === false;
      if (is3D && typeof viewer.scene.sampleHeight === 'function') {
        const sampled =
          Array.isArray(excludeEntities) && excludeEntities.length > 0
            ? viewer.scene.sampleHeight(carto, excludeEntities)
            : viewer.scene.sampleHeight(carto);
        if (
          typeof sampled === 'number' &&
          Number.isFinite(sampled) &&
          sampled > -500 &&
          sampled < 9000
        ) {
          return sampled + safeDraft;
        }
      }
      if (typeof viewer.scene.globe?.getHeight === 'function') {
        const height = viewer.scene.globe.getHeight(carto);
        if (typeof height === 'number' && !isNaN(height)) {
          return height + safeDraft;
        }
      }
      if (!is3D && typeof viewer.scene.sampleHeight === 'function') {
        const sampled =
          Array.isArray(excludeEntities) && excludeEntities.length > 0
            ? viewer.scene.sampleHeight(carto, excludeEntities)
            : viewer.scene.sampleHeight(carto);
        if (
          typeof sampled === 'number' &&
          Number.isFinite(sampled) &&
          sampled > -500 &&
          sampled < 9000
        ) {
          return sampled + safeDraft;
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  return fallbackBase + safeDraft;
}

/**
 * Resolves waterway waypoints from preset IDs, custom text, or coordinate pairs.
 */
export function resolveWaterWaypoints(fromQuery, toQuery, options = {}) {
  // 1. Direct preset query
  if (fromQuery && !toQuery) {
    const preset = resolveWaterPreset(fromQuery);
    if (preset) return formatWaterResult(preset, options);
  }

  if (options.presetId) {
    const preset = resolveWaterPreset(options.presetId);
    if (preset) return formatWaterResult(preset, options);
  }

  const fromPreset = resolveWaterPreset(fromQuery);
  if (fromPreset) {
    return formatWaterResult(fromPreset, options);
  }

  // 2. Coordinate parsing helper (supports "lat, lon" string or { lat, lon, name, elev })
  const parseCoords = (val) => {
    if (!val) return null;
    if (
      typeof val === 'object' &&
      Number.isFinite(Number(val.lat)) &&
      Number.isFinite(Number(val.lon))
    ) {
      return {
        lat: Number(val.lat),
        lon: Number(val.lon),
        name: typeof val.name === 'string' && val.name ? val.name : null,
        elev: Number.isFinite(Number(val.elev)) ? Number(val.elev) : null,
      };
    }
    if (typeof val !== 'string') return null;
    const parts = val.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lon: parts[1], name: null, elev: null };
    }
    return null;
  };

  const fromCoords = parseCoords(fromQuery);
  const toCoords = parseCoords(toQuery);

  if (fromCoords && toCoords) {
    const minLat = Math.min(fromCoords.lat, toCoords.lat) - 0.02;
    const maxLat = Math.max(fromCoords.lat, toCoords.lat) + 0.02;
    const minLon = Math.min(fromCoords.lon, toCoords.lon) - 0.02;
    const maxLon = Math.max(fromCoords.lon, toCoords.lon) + 0.02;

    const nominalElev = options.nominalElevationM ?? 0;
    const originName = fromCoords.name || 'Departure Harbor';
    const destName = toCoords.name || 'Arrival Anchorage';

    const customWaterbody = {
      id: 'custom_waterway',
      name:
        fromCoords.name && toCoords.name
          ? `Voyage: ${originName} ➔ ${destName}`
          : `Custom Waterway: ${fromCoords.lat.toFixed(3)},${fromCoords.lon.toFixed(3)} ➔ ${toCoords.lat.toFixed(3)},${toCoords.lon.toFixed(3)}`,
      region: 'Custom Maritime Route',
      isOcean: nominalElev <= 5,
      nominalElevationM: nominalElev,
      defaultVessel: options.vesselClass || 'motorboat',
      defaultSpeedKnots: options.speedKnots || 25,
      bbox: [minLat, minLon, maxLat, maxLon],
      from: {
        name: originName,
        lat: fromCoords.lat,
        lon: fromCoords.lon,
        elev: fromCoords.elev ?? nominalElev,
      },
      to: {
        name: destName,
        lat: toCoords.lat,
        lon: toCoords.lon,
        elev: toCoords.elev ?? nominalElev,
      },
      waypoints: [
        {
          name: originName,
          lat: fromCoords.lat,
          lon: fromCoords.lon,
          elev: fromCoords.elev ?? nominalElev,
        },
        {
          name: destName,
          lat: toCoords.lat,
          lon: toCoords.lon,
          elev: toCoords.elev ?? nominalElev,
        },
      ],
    };

    return formatWaterResult(customWaterbody, options);
  }

  // Fallback to canonical preset: Savannah Barrier Islands & Wassaw Sound
  return formatWaterResult(WATER_PRESETS.savannah_barrier_islands, options);
}

function formatWaterResult(preset, options = {}) {
  const vesselKey = options.vesselClass || preset.defaultVessel || 'sloop';
  const vesselSpec = VESSEL_CLASSES[vesselKey] || VESSEL_CLASSES.sloop;
  const speedKnots =
    Number(options.speedKnots) ||
    preset.defaultSpeedKnots ||
    vesselSpec.defaultSpeedKnots;

  const waypoints = preset.waypoints || [preset.from, preset.to];
  const totalMeters = calculateWaterRouteDistance(waypoints);
  const totalNmi = totalMeters / 1852.0;
  const durationSec = calculateWaterTravelDurationSeconds(
    totalMeters,
    speedKnots,
  );

  return {
    ...preset,
    vesselClass: vesselKey,
    vesselSpec,
    speedKnots,
    speedMph: Math.round(knotsToMph(speedKnots)),
    waypoints,
    totalDistanceMeters: totalMeters,
    totalDistanceNmi: Math.round(totalNmi * 10) / 10,
    durationSec,
  };
}
