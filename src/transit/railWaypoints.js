/**
 * Modular Landmark Registry & Rail Corridor Catalog for World of Rails.
 * (World of Rails & Foundational Realism)
 *
 * Provides extensible corridor presets, station landmarks, topological bounding boxes,
 * and coordinate resolution for train simulations in God's Eye View.
 */

/**
 * High-Resolution Northeast Corridor (NEC) Alignment
 * Spanning Boston South Station through Providence, New Haven, New York Penn,
 * Newark, Trenton, Philadelphia 30th St, Wilmington, Baltimore Penn, to Washington Union Station.
 */
export const NORTHEAST_CORRIDOR_FULL_ALIGNMENT = Object.freeze([
  { name: 'Boston South Station', lat: 42.3519, lon: -71.0552, elev: 6 },
  { name: 'Boston Back Bay', lat: 42.3473, lon: -71.0757, elev: 7 },
  { name: 'Route 128 / Westwood', lat: 42.2133, lon: -71.1578, elev: 16 },
  { name: 'Canton Junction', lat: 42.1745, lon: -71.1448, elev: 20 },
  { name: 'Mansfield Mainline', lat: 42.0315, lon: -71.2185, elev: 35 },
  { name: 'Attleboro Curve', lat: 41.9442, lon: -71.2845, elev: 30 },
  { name: 'Pawtucket / Central Falls', lat: 41.8785, lon: -71.391, elev: 18 },
  { name: 'Providence Station (RI)', lat: 41.8295, lon: -71.4137, elev: 12 },
  { name: 'Kingston Station (RI)', lat: 41.482, lon: -71.554, elev: 38 },
  { name: 'Westerly Coastal Approach', lat: 41.378, lon: -71.829, elev: 10 },
  { name: 'Mystic Rail Swing Bridge', lat: 41.357, lon: -71.966, elev: 4 },
  {
    name: 'New London Union Station (CT)',
    lat: 41.3547,
    lon: -72.0935,
    elev: 5,
  },
  { name: 'Old Saybrook Shoreline', lat: 41.3, lon: -72.378, elev: 8 },
  { name: 'Guilford Shoreline', lat: 41.2785, lon: -72.6715, elev: 12 },
  {
    name: 'New Haven Union Station (CT)',
    lat: 41.2974,
    lon: -72.9263,
    elev: 7,
  },
  { name: 'Bridgeport Station (CT)', lat: 41.1785, lon: -73.187, elev: 9 },
  { name: 'Norwalk River Rail Bridge', lat: 41.1015, lon: -73.418, elev: 8 },
  {
    name: 'Stamford Transportation Center (CT)',
    lat: 41.0468,
    lon: -73.5427,
    elev: 12,
  },
  { name: 'Greenwich Coastline', lat: 41.0225, lon: -73.6265, elev: 14 },
  { name: 'New Rochelle Junction (NY)', lat: 40.9115, lon: -73.7825, elev: 22 },
  { name: 'Pelham Bay Rail Viaduct', lat: 40.8545, lon: -73.8185, elev: 10 },
  {
    name: 'Hell Gate Bridge (East River)',
    lat: 40.7818,
    lon: -73.9215,
    elev: 38,
  },
  { name: 'Sunnyside Yard (Queens)', lat: 40.751, lon: -73.935, elev: 12 },
  { name: 'East River Tunnels', lat: 40.748, lon: -73.96, elev: -15 },
  {
    name: 'New York Penn Station (NY)',
    lat: 40.7506,
    lon: -73.9935,
    elev: -10,
  },
  {
    name: 'North River Tunnels (Hudson River)',
    lat: 40.753,
    lon: -74.02,
    elev: -22,
  },
  {
    name: 'Secaucus Junction (NJ Meadowlands)',
    lat: 40.761,
    lon: -74.075,
    elev: 6,
  },
  { name: 'Newark Penn Station (NJ)', lat: 40.7347, lon: -74.1643, elev: 9 },
  {
    name: 'Newark Liberty International Airport',
    lat: 40.7045,
    lon: -74.1908,
    elev: 10,
  },
  { name: 'Rahway Interlocking', lat: 40.6085, lon: -74.2755, elev: 15 },
  { name: 'Metropark Station (NJ)', lat: 40.5684, lon: -74.3298, elev: 20 },
  {
    name: 'New Brunswick Raritan River Bridge',
    lat: 40.498,
    lon: -74.446,
    elev: 22,
  },
  { name: 'Princeton Junction (NJ)', lat: 40.316, lon: -74.624, elev: 25 },
  {
    name: 'Trenton Transit Center (NJ)',
    lat: 40.2185,
    lon: -74.7547,
    elev: 18,
  },
  {
    name: 'Delaware River Stone Arch Viaduct',
    lat: 40.211,
    lon: -74.767,
    elev: 22,
  },
  { name: 'Cornwells Heights (PA)', lat: 40.076, lon: -74.954, elev: 16 },
  { name: 'North Philadelphia Station', lat: 39.999, lon: -75.155, elev: 28 },
  {
    name: 'Philadelphia 30th St Station (PA)',
    lat: 39.9558,
    lon: -75.182,
    elev: 15,
  },
  { name: 'Chester Industrial Corridor', lat: 39.8455, lon: -75.362, elev: 10 },
  { name: 'Wilmington Station (DE)', lat: 39.737, lon: -75.551, elev: 12 },
  { name: 'Newark Station (DE)', lat: 39.668, lon: -75.751, elev: 25 },
  { name: 'Elkton Rail Corridor (MD)', lat: 39.605, lon: -75.834, elev: 22 },
  {
    name: 'Susquehanna River Rail Bridge (Havre de Grace)',
    lat: 39.544,
    lon: -76.088,
    elev: 24,
  },
  { name: 'Aberdeen Station (MD)', lat: 39.509, lon: -76.164, elev: 26 },
  { name: 'Bush River Rail Trestle', lat: 39.421, lon: -76.262, elev: 8 },
  { name: 'Gunpowder River Rail Bridge', lat: 39.362, lon: -76.368, elev: 7 },
  {
    name: 'Baltimore Penn Station (MD)',
    lat: 39.3072,
    lon: -76.6156,
    elev: 32,
  },
  {
    name: 'BWI Thurgood Marshall Airport Station (MD)',
    lat: 39.1915,
    lon: -76.6948,
    elev: 48,
  },
  { name: 'Odenton High-Speed Section', lat: 39.088, lon: -76.702, elev: 45 },
  { name: 'Bowie Junction', lat: 38.995, lon: -76.778, elev: 42 },
  { name: 'New Carrollton (MD)', lat: 38.948, lon: -76.872, elev: 28 },
  {
    name: 'Washington Union Station (DC)',
    lat: 38.8978,
    lon: -77.0063,
    elev: 20,
  },
]);

export const WDW_MONORAIL_RESORT_LOOP = Object.freeze([
  {
    name: 'Magic Kingdom Monorail Station',
    lat: 28.4158,
    lon: -81.5812,
    elev: 32,
  },
  {
    name: 'Seven Seas Eastbound Viaduct',
    lat: 28.4156,
    lon: -81.5778,
    elev: 32,
  },
  {
    name: 'Contemporary Resort Grand Canyon Concourse',
    lat: 28.4141,
    lon: -81.5746,
    elev: 36,
  },
  {
    name: 'Bay Lake Southbound Beamway',
    lat: 28.4095,
    lon: -81.5754,
    elev: 32,
  },
  {
    name: 'Transportation & Ticket Center (TTC)',
    lat: 28.4054,
    lon: -81.5792,
    elev: 32,
  },
  {
    name: "Disney's Polynesian Village Resort",
    lat: 28.4055,
    lon: -81.5852,
    elev: 32,
  },
  {
    name: 'Seven Seas Lagoon West Shore',
    lat: 28.4084,
    lon: -81.5882,
    elev: 32,
  },
  {
    name: "Disney's Grand Floridian Resort & Spa",
    lat: 28.4112,
    lon: -81.5878,
    elev: 32,
  },
  {
    name: 'Lagoon North Bridge Approach',
    lat: 28.4146,
    lon: -81.5847,
    elev: 32,
  },
  {
    name: 'Magic Kingdom Monorail Station',
    lat: 28.4158,
    lon: -81.5812,
    elev: 32,
  },
]);

export const WDW_MONORAIL_EPCOT_BEAM = Object.freeze([
  {
    name: 'Transportation & Ticket Center (TTC)',
    lat: 28.4054,
    lon: -81.5792,
    elev: 32,
  },
  {
    name: 'World Drive Elevated Beamway North',
    lat: 28.3992,
    lon: -81.5744,
    elev: 32,
  },
  {
    name: 'World Drive Elevated Beamway Mid',
    lat: 28.391,
    lon: -81.5662,
    elev: 32,
  },
  {
    name: 'Epcot Center Drive Flyover',
    lat: 28.3832,
    lon: -81.5578,
    elev: 33,
  },
  {
    name: 'EPCOT North Entry Portal',
    lat: 28.3778,
    lon: -81.5515,
    elev: 32,
  },
  {
    name: 'Spaceship Earth West Sweep',
    lat: 28.3746,
    lon: -81.5508,
    elev: 32,
  },
  {
    name: 'World Celebration Garden Loop',
    lat: 28.3728,
    lon: -81.5494,
    elev: 32,
  },
  {
    name: 'Spaceship Earth East Turnaround',
    lat: 28.3745,
    lon: -81.5479,
    elev: 32,
  },
  {
    name: 'EPCOT Monorail Station',
    lat: 28.3765,
    lon: -81.5494,
    elev: 32,
  },
]);

export const WDW_MONORAIL_MK_TO_EPCOT_TRANSFER = Object.freeze([
  {
    name: 'Magic Kingdom Monorail Station',
    lat: 28.4158,
    lon: -81.5812,
    elev: 32,
  },
  {
    name: 'Seven Seas Eastbound Viaduct',
    lat: 28.4156,
    lon: -81.5778,
    elev: 32,
  },
  {
    name: 'Contemporary Resort Grand Canyon Concourse',
    lat: 28.4141,
    lon: -81.5746,
    elev: 36,
  },
  {
    name: 'Bay Lake Southbound Beamway',
    lat: 28.4095,
    lon: -81.5754,
    elev: 32,
  },
  ...WDW_MONORAIL_EPCOT_BEAM,
]);

export const WDW_MONORAIL_EPCOT_TO_MK_TRANSFER = Object.freeze([
  {
    name: 'EPCOT Monorail Station',
    lat: 28.3765,
    lon: -81.5494,
    elev: 32,
  },
  {
    name: 'EPCOT North Entry Portal',
    lat: 28.3778,
    lon: -81.5515,
    elev: 32,
  },
  {
    name: 'Epcot Center Drive Flyover',
    lat: 28.3832,
    lon: -81.5578,
    elev: 33,
  },
  {
    name: 'World Drive Elevated Beamway Mid',
    lat: 28.391,
    lon: -81.5662,
    elev: 32,
  },
  {
    name: 'World Drive Elevated Beamway North',
    lat: 28.3992,
    lon: -81.5744,
    elev: 32,
  },
  {
    name: 'Transportation & Ticket Center (TTC)',
    lat: 28.4054,
    lon: -81.5792,
    elev: 32,
  },
  {
    name: "Disney's Polynesian Village Resort",
    lat: 28.4055,
    lon: -81.5852,
    elev: 32,
  },
  {
    name: 'Seven Seas Lagoon West Shore',
    lat: 28.4084,
    lon: -81.5882,
    elev: 32,
  },
  {
    name: "Disney's Grand Floridian Resort & Spa",
    lat: 28.4112,
    lon: -81.5878,
    elev: 32,
  },
  {
    name: 'Lagoon North Bridge Approach',
    lat: 28.4146,
    lon: -81.5847,
    elev: 32,
  },
  {
    name: 'Magic Kingdom Monorail Station',
    lat: 28.4158,
    lon: -81.5812,
    elev: 32,
  },
]);

export const RAIL_CORRIDORS = Object.freeze({
  atlanta_marta_east: {
    id: 'atlanta_marta_east',
    name: 'Atlanta: Candler Park to Georgia State',
    city: 'Atlanta, GA',
    from: {
      name: 'Edgewood / Candler Park',
      lat: 33.7561,
      lon: -84.3403,
      elev: 305,
    },
    to: {
      name: 'Georgia State Station',
      lat: 33.7505,
      lon: -84.3862,
      elev: 318,
    },
    defaultCorridor: 'csx_mainline', // 'csx_mainline' | 'marta_heavy_rail'
    defaultSpeedMph: 45,
    bbox: [33.74, -84.4, 33.765, -84.33], // [minLat, minLon, maxLat, maxLon]
    trackProfiles: {
      csx_mainline: {
        name: 'CSX Georgia Railroad Mainline (Surface)',
        description:
          '100% surface-grade dual tracks along DeKalb Ave past Hulsey Yard and Oakland Cemetery.',
        subterranean: false,
        waypoints: [
          {
            name: 'Candler Park / Hulsey East',
            lat: 33.7561,
            lon: -84.3403,
            elev: 305,
          },
          {
            name: 'Moreland Ave Crossing',
            lat: 33.7542,
            lon: -84.3496,
            elev: 308,
          },
          {
            name: 'Hulsey Intermodal Yard West',
            lat: 33.7523,
            lon: -84.3592,
            elev: 310,
          },
          {
            name: 'Oakland Cemetery North',
            lat: 33.7495,
            lon: -84.3685,
            elev: 312,
          },
          {
            name: 'King Memorial Junction',
            lat: 33.7498,
            lon: -84.3776,
            elev: 315,
          },
          {
            name: 'Georgia State Station / Downtown Core',
            lat: 33.7505,
            lon: -84.3862,
            elev: 318,
          },
        ],
      },
      marta_heavy_rail: {
        name: 'MARTA Blue/Green Line (Transit & Tunnel)',
        description:
          'Elevated and at-grade line transitioning to cut-and-cover subterranean tunnel west of Piedmont Ave.',
        subterranean: true,
        tunnelEntranceLon: -84.382,
        waypoints: [
          {
            name: 'Edgewood / Candler Park Station',
            lat: 33.7562,
            lon: -84.34,
            elev: 306,
          },
          {
            name: 'Inman Park / Reynoldstown Station',
            lat: 33.7533,
            lon: -84.3564,
            elev: 309,
          },
          {
            name: 'King Memorial Station',
            lat: 33.7498,
            lon: -84.3702,
            elev: 313,
          },
          {
            name: 'Georgia State Station (Tunnel Concourse)',
            lat: 33.7505,
            lon: -84.3862,
            elev: 318,
          },
        ],
      },
    },
  },
  northeast_corridor_acela: {
    id: 'northeast_corridor_acela',
    name: 'Northeast Corridor: NY Penn to 30th St Philly',
    city: 'New York / Philadelphia',
    from: {
      name: 'New York Penn Station',
      lat: 40.7506,
      lon: -73.9935,
      elev: 10,
    },
    to: { name: 'Philadelphia 30th St', lat: 39.9558, lon: -75.182, elev: 15 },
    defaultCorridor: 'amtrak_nec',
    defaultSpeedMph: 125,
    bbox: [39.9, -75.3, 40.8, -73.9],
    trackProfiles: {
      amtrak_nec: {
        name: 'Amtrak Northeast Corridor High-Speed Line (NY to Philly)',
        description:
          'Electrified multi-track mainline connecting NY Penn, Newark, and Philadelphia.',
        subterranean: false,
        waypoints: [
          {
            name: 'New York Penn Station',
            lat: 40.7506,
            lon: -73.9935,
            elev: 10,
          },
          { name: 'Newark Penn Station', lat: 40.7347, lon: -74.1643, elev: 9 },
          { name: 'Metropark Station', lat: 40.5684, lon: -74.3298, elev: 20 },
          {
            name: 'Trenton Transit Center',
            lat: 40.2185,
            lon: -74.7547,
            elev: 18,
          },
          {
            name: 'Philadelphia 30th St Station',
            lat: 39.9558,
            lon: -75.182,
            elev: 15,
          },
        ],
      },
      amtrak_nec_full: {
        name: 'Amtrak Northeast Corridor Spine (Boston to Baltimore & DC)',
        description:
          'Electrified 457-mile multi-track high-speed spine connecting Boston, Providence, New Haven, New York Penn, Newark, Trenton, Philadelphia 30th St, Wilmington, Baltimore Penn, and Washington Union Station.',
        subterranean: false,
        waypoints: NORTHEAST_CORRIDOR_FULL_ALIGNMENT,
      },
    },
  },
  northeast_corridor_full: {
    id: 'northeast_corridor_full',
    name: 'Northeast Corridor: Boston to Baltimore & Washington DC',
    city: 'Boston / NY / Philly / Baltimore / DC',
    from: {
      name: 'Boston South Station',
      lat: 42.3519,
      lon: -71.0552,
      elev: 6,
    },
    to: {
      name: 'Washington Union Station',
      lat: 38.8978,
      lon: -77.0063,
      elev: 20,
    },
    defaultCorridor: 'amtrak_nec_full',
    defaultSpeedMph: 135,
    bbox: [38.8, -77.1, 42.4, -71.0],
    trackProfiles: {
      amtrak_nec_full: {
        name: 'Amtrak Northeast Corridor High-Speed Spine',
        description:
          'Electrified 457-mile multi-track high-speed spine connecting Boston, Providence, New Haven, New York Penn, Newark, Trenton, Philadelphia 30th St, Wilmington, Baltimore Penn, and Washington Union Station.',
        subterranean: false,
        waypoints: NORTHEAST_CORRIDOR_FULL_ALIGNMENT,
      },
    },
  },
  wdw_monorail: {
    id: 'wdw_monorail',
    name: 'Walt Disney World Monorail (Seven Seas & EPCOT Beams)',
    city: 'Lake Buena Vista, Orlando, FL',
    from: {
      name: 'Magic Kingdom Monorail Station',
      lat: 28.4158,
      lon: -81.5812,
      elev: 32,
    },
    to: {
      name: 'EPCOT Monorail Station',
      lat: 28.3765,
      lon: -81.5494,
      elev: 32,
    },
    defaultCorridor: 'mk_to_epcot_express',
    defaultSpeedMph: 40,
    bbox: [28.368, -81.594, 28.422, -81.542],
    trackProfiles: {
      mk_to_epcot_express: {
        name: 'Magic Kingdom → Contemporary → TTC → EPCOT (Spaceship Earth Loop)',
        description:
          'Elevated Mark VI straddle-beam monorail journey from Magic Kingdom through the Contemporary A-frame concourse, TTC, and sweeping around Spaceship Earth into EPCOT.',
        subterranean: false,
        vehicleMode: 'monorail',
        railOffsetMeters: 7.5,
        locoColor: '#ef4444',
        carColor: '#f8fafc',
        trackColor: '#38bdf8',
        waypoints: WDW_MONORAIL_MK_TO_EPCOT_TRANSFER,
      },
      epcot_to_mk_express: {
        name: 'EPCOT → TTC → Polynesian & Grand Floridian → Magic Kingdom',
        description:
          'Return elevated monorail transfer from EPCOT north along World Drive to TTC and around the Seven Seas Lagoon west shore to Magic Kingdom.',
        subterranean: false,
        vehicleMode: 'monorail',
        railOffsetMeters: 7.5,
        locoColor: '#0284c7',
        carColor: '#f8fafc',
        trackColor: '#38bdf8',
        waypoints: WDW_MONORAIL_EPCOT_TO_MK_TRANSFER,
      },
      resort_lagoon_loop: {
        name: 'Seven Seas Lagoon Resort Loop (MK · Contemporary · TTC · Poly · GF)',
        description:
          'Full 2.6-mile Resort Monorail clockwise straddle-beam circuit around Seven Seas Lagoon passing through Disney’s Contemporary Resort.',
        subterranean: false,
        vehicleMode: 'monorail',
        railOffsetMeters: 7.5,
        locoColor: '#f59e0b',
        carColor: '#f8fafc',
        trackColor: '#fbbf24',
        waypoints: WDW_MONORAIL_RESORT_LOOP,
      },
      epcot_beam_only: {
        name: 'EPCOT Beamway (TTC ↔ Spaceship Earth Preview Loop)',
        description:
          '4.0-mile elevated straddle-beam glide from the Transportation & Ticket Center straight into EPCOT’s Future World loop around Spaceship Earth.',
        subterranean: false,
        vehicleMode: 'monorail',
        railOffsetMeters: 7.5,
        locoColor: '#10b981',
        carColor: '#f8fafc',
        trackColor: '#34d399',
        waypoints: WDW_MONORAIL_EPCOT_BEAM,
      },
    },
  },
  tokaido_shinkansen: {
    id: 'tokaido_shinkansen',
    name: 'Tokaido Shinkansen: Tokyo to Shin-Yokohama',
    city: 'Tokyo, Japan',
    from: { name: 'Tokyo Station', lat: 35.6812, lon: 139.7671, elev: 5 },
    to: { name: 'Shin-Yokohama', lat: 35.5075, lon: 139.6176, elev: 12 },
    defaultCorridor: 'shinkansen',
    defaultSpeedMph: 175,
    bbox: [35.45, 139.55, 35.72, 139.8],
    trackProfiles: {
      shinkansen: {
        name: 'JR Central Tokaido Shinkansen High-Speed Line',
        description:
          'Dedicated standard-gauge bullet train corridor connecting Tokyo, Shinagawa, and Shin-Yokohama.',
        subterranean: false,
        waypoints: [
          { name: 'Tokyo Station', lat: 35.6812, lon: 139.7671, elev: 5 },
          { name: 'Shinagawa Station', lat: 35.6284, lon: 139.7387, elev: 6 },
          {
            name: 'Shin-Yokohama Station',
            lat: 35.5075,
            lon: 139.6176,
            elev: 12,
          },
        ],
      },
    },
  },
});

/**
 * Calculates Great-Circle / Haversine distance in meters between two lat/lon coordinates.
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
 * Calculates total route distance along an array of waypoints in meters.
 */
export function calculateCorridorDistance(waypoints = []) {
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
 * Calculates travel duration in seconds based on distance and speed in mph.
 */
export function calculateTravelDurationSeconds(distanceMeters, speedMph = 45) {
  const safeMph = Math.max(5, Number(speedMph) || 45);
  const speedMetersPerSec = safeMph * 0.44704;
  return Math.max(10, Math.round(distanceMeters / speedMetersPerSec));
}

/**
 * Resolves a corridor preset by ID, name, or city.
 */
export function resolveRailCorridor(query) {
  if (!query || typeof query !== 'string') return null;
  const clean = query.trim().toLowerCase();

  // Exact ID match
  if (RAIL_CORRIDORS[clean]) {
    return RAIL_CORRIDORS[clean];
  }

  // Name or city fuzzy match
  for (const corridor of Object.values(RAIL_CORRIDORS)) {
    if (
      corridor.id.toLowerCase() === clean ||
      corridor.name.toLowerCase().includes(clean) ||
      corridor.city.toLowerCase().includes(clean)
    ) {
      return corridor;
    }
  }

  return null;
}

/**
 * Resolves corridor waypoints from preset IDs or custom coordinates.
 */
export function resolveRailWaypoints(fromQuery, toQuery, options = {}) {
  // 1. Direct corridor ID match
  if (fromQuery && !toQuery) {
    const corridor = resolveRailCorridor(fromQuery);
    if (corridor) return formatCorridorResult(corridor, options);
  }

  if (options.corridorId) {
    const corridor = resolveRailCorridor(options.corridorId);
    if (corridor) return formatCorridorResult(corridor, options);
  }

  // 2. When toQuery is also provided, only match an explicit corridor ID (not fuzzy city name)
  // so distinct intercity queries ("Atlanta, GA" -> "Savannah, GA") geocode instead of hijacking to MARTA.
  if (typeof fromQuery === 'string') {
    const exactId = fromQuery.trim().toLowerCase();
    const fromCorridor = toQuery
      ? RAIL_CORRIDORS[exactId] || null
      : resolveRailCorridor(fromQuery);
    if (fromCorridor) {
      return formatCorridorResult(fromCorridor, options);
    }
  }

  // 3. Coordinate parsing fallback (e.g. "33.7561,-84.3403" or { lat, lon, name, elev })
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
        elev: Number.isFinite(Number(val.elev)) ? Number(val.elev) : 100,
      };
    }
    if (typeof val !== 'string') return null;
    const parts = val.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lon: parts[1], name: null, elev: 100 };
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
    const originName = fromCoords.name || 'Origin Terminal';
    const destName = toCoords.name || 'Destination Terminal';

    const customCorridor = {
      id: 'custom_rail_corridor',
      isCustom: true,
      name:
        fromCoords.name && toCoords.name
          ? `Rail: ${originName} ➔ ${destName}`
          : `Custom Rail: ${fromCoords.lat.toFixed(3)},${fromCoords.lon.toFixed(3)} ➔ ${toCoords.lat.toFixed(3)},${toCoords.lon.toFixed(3)}`,
      city: 'Custom Transit Route',
      from: {
        name: originName,
        lat: fromCoords.lat,
        lon: fromCoords.lon,
        elev: fromCoords.elev,
      },
      to: {
        name: destName,
        lat: toCoords.lat,
        lon: toCoords.lon,
        elev: toCoords.elev,
      },
      defaultCorridor: 'custom_mainline',
      defaultSpeedMph: options.speedMph || 45,
      bbox: [minLat, minLon, maxLat, maxLon],
      trackProfiles: {
        custom_mainline: {
          name: 'Custom Vector Rail Line',
          description: 'User-specified rail route.',
          subterranean: false,
          waypoints: [
            {
              name: originName,
              lat: fromCoords.lat,
              lon: fromCoords.lon,
              elev: fromCoords.elev,
            },
            {
              name: destName,
              lat: toCoords.lat,
              lon: toCoords.lon,
              elev: toCoords.elev,
            },
          ],
        },
      },
    };

    return formatCorridorResult(customCorridor, options);
  }

  // Fallback to canonical default: Atlanta Candler Park to Georgia State
  const fallback = formatCorridorResult(
    RAIL_CORRIDORS.atlanta_marta_east,
    options,
  );
  fallback.isFallback = true;
  return fallback;
}

/**
 * Asynchronously resolves rail waypoints, geocoding place names via /api/geocode when needed.
 */
export async function resolveRailWaypointsAsync(
  fromQuery,
  toQuery,
  { fetchImpl = globalThis.fetch, ...options } = {},
) {
  const sync = resolveRailWaypoints(fromQuery, toQuery, options);
  if (sync && !sync.isFallback) {
    return sync;
  }

  const geocode = async (q) => {
    if (!q) return null;
    if (
      typeof q === 'object' &&
      Number.isFinite(Number(q.lat)) &&
      Number.isFinite(Number(q.lon))
    ) {
      return {
        name: q.name || 'Custom Terminal',
        lat: Number(q.lat),
        lon: Number(q.lon),
        elev: Number.isFinite(Number(q.elev)) ? Number(q.elev) : 100,
      };
    }
    if (typeof q !== 'string' || typeof fetchImpl !== 'function') return null;
    try {
      const res = await fetchImpl(
        `/api/geocode?q=${encodeURIComponent(q.trim())}`,
      );
      if (!res?.ok) return null;
      const data = await res.json();
      const first = data?.results?.[0];
      const loc = first?.geometry?.location;
      const lat = Number(loc?.lat ?? first?.lat);
      const lon = Number(loc?.lng ?? loc?.lon ?? first?.lon ?? first?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const label =
          first?.address_components?.[0]?.long_name ||
          first?.name ||
          first?.formatted_address ||
          first?.display_name ||
          q;
        return {
          name: String(label),
          lat,
          lon,
          elev: Number.isFinite(Number(first?.elev)) ? Number(first.elev) : 100,
        };
      }
    } catch {
      /* fallback */
    }
    return null;
  };

  const [fromPoint, toPoint] = await Promise.all([
    geocode(fromQuery),
    geocode(toQuery),
  ]);

  if (fromPoint && toPoint) {
    return resolveRailWaypoints(fromPoint, toPoint, options);
  }

  return sync;
}

function formatCorridorResult(corridor, options = {}) {
  const trackKey =
    options.corridor ||
    corridor.defaultCorridor ||
    Object.keys(corridor.trackProfiles)[0];
  const profile =
    corridor.trackProfiles[trackKey] ||
    Object.values(corridor.trackProfiles)[0];
  const waypoints = profile.waypoints || [corridor.from, corridor.to];
  const totalMeters = calculateCorridorDistance(waypoints);
  const speedMph = Number(options.speedMph) || corridor.defaultSpeedMph || 45;
  const durationSec = calculateTravelDurationSeconds(totalMeters, speedMph);

  return {
    ...corridor,
    isFallback: Boolean(corridor.isFallback),
    activeProfileKey: trackKey,
    activeProfile: profile,
    waypoints,
    totalDistanceMeters: totalMeters,
    speedMph,
    durationSec,
  };
}
