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

/**
 * Disneyland Monorail — Anaheim (2.5-mile Elevated Straddle-Beam Closed Loop, +7.5m)
 * Tomorrowland Monorail Station → Submarine Lagoon & Matterhorn curve → Harbor/Esplanade crossing →
 * Downtown Disney Station → Disney's Grand Californian / DCA edge loop → Tomorrowland Monorail Station.
 */
export const DLR_MONORAIL_LOOP = Object.freeze([
  {
    name: 'Tomorrowland Monorail Station',
    lat: 33.8125,
    lon: -117.9165,
    elev: 48,
  },
  {
    name: 'Submarine Lagoon & Matterhorn Curve',
    lat: 33.8138,
    lon: -117.9169,
    elev: 48,
  },
  {
    name: 'Autopia North Beamway',
    lat: 33.8139,
    lon: -117.9154,
    elev: 48,
  },
  {
    name: 'Tomorrowland East / Space Mountain Beam',
    lat: 33.8115,
    lon: -117.9153,
    elev: 48,
  },
  {
    name: 'Harbor Blvd & Esplanade Crossing',
    lat: 33.8091,
    lon: -117.9156,
    elev: 48,
  },
  {
    name: 'DCA Buena Vista / Golden Gate Flyover',
    lat: 33.8084,
    lon: -117.9182,
    elev: 48,
  },
  {
    name: "Grizzly Peak & Disney's Grand Californian Edge",
    lat: 33.8077,
    lon: -117.9212,
    elev: 48,
  },
  {
    name: 'Disneyland Drive Overpass',
    lat: 33.8085,
    lon: -117.9242,
    elev: 48,
  },
  {
    name: 'Downtown Disney Monorail Station',
    lat: 33.8092,
    lon: -117.9258,
    elev: 48,
  },
  {
    name: 'Disneyland Hotel West Turnaround',
    lat: 33.8099,
    lon: -117.9267,
    elev: 48,
  },
  {
    name: 'Downtown Disney North Promenade Beam',
    lat: 33.8097,
    lon: -117.9234,
    elev: 48,
  },
  {
    name: 'Grand Californian North Approach',
    lat: 33.8094,
    lon: -117.9203,
    elev: 48,
  },
  {
    name: 'Esplanade West Return Beam',
    lat: 33.8094,
    lon: -117.9174,
    elev: 48,
  },
  {
    name: 'Tomorrowland Entry Curve',
    lat: 33.8109,
    lon: -117.9162,
    elev: 48,
  },
  {
    name: 'Tomorrowland Monorail Station',
    lat: 33.8125,
    lon: -117.9165,
    elev: 48,
  },
]);

/**
 * Walt Disney World Railroad — Magic Kingdom (1.5-mile 3-ft Narrow-Gauge Steam Loop, +1.8m)
 * Main Street, U.S.A. Station → Adventureland/Splash berm → Frontierland Station →
 * Big Thunder/Rivers of America curve → Fantasyland / Storybook Circus Station →
 * Tomorrowland Speedway berm → Main Street, U.S.A. Station.
 */
export const WDW_MK_RAILROAD_LOOP = Object.freeze([
  {
    name: 'Main Street, U.S.A. Station',
    lat: 28.4165,
    lon: -81.5812,
    elev: 32,
  },
  {
    name: 'Adventureland West Berm',
    lat: 28.4169,
    lon: -81.5835,
    elev: 32,
  },
  {
    name: 'Jungle Cruise & Pirates Perimeter Berm',
    lat: 28.4181,
    lon: -81.5852,
    elev: 32,
  },
  {
    name: 'Bayou / Splash Tunnel Berm',
    lat: 28.4192,
    lon: -81.5856,
    elev: 32,
  },
  {
    name: 'Frontierland Station',
    lat: 28.4202,
    lon: -81.5855,
    elev: 32,
  },
  {
    name: 'Big Thunder Mountain West Curve',
    lat: 28.4216,
    lon: -81.5849,
    elev: 32,
  },
  {
    name: 'Rivers of America North Curve',
    lat: 28.4227,
    lon: -81.5831,
    elev: 32,
  },
  {
    name: 'New Fantasyland North Berm',
    lat: 28.4228,
    lon: -81.5805,
    elev: 32,
  },
  {
    name: 'Fantasyland / Storybook Circus Station',
    lat: 28.4218,
    lon: -81.5784,
    elev: 32,
  },
  {
    name: 'TRON & Space Mountain Outer Berm',
    lat: 28.42,
    lon: -81.5772,
    elev: 32,
  },
  {
    name: 'Tomorrowland Speedway Berm',
    lat: 28.4182,
    lon: -81.5777,
    elev: 32,
  },
  {
    name: 'Main Street East Approach',
    lat: 28.4168,
    lon: -81.5792,
    elev: 32,
  },
  {
    name: 'Main Street, U.S.A. Station',
    lat: 28.4165,
    lon: -81.5812,
    elev: 32,
  },
]);

/**
 * Disneyland Railroad — Anaheim (1.2-mile 3-ft Narrow-Gauge Steam Loop, +1.8m)
 * Main Street, U.S.A. Station → New Orleans Square Station → Bayou/Critter perimeter →
 * Mickey's Toontown Depot → Tomorrowland Station → Grand Canyon / Primeval World diorama berm →
 * Main Street, U.S.A. Station.
 */
export const DLR_RAILROAD_LOOP = Object.freeze([
  {
    name: 'Main Street, U.S.A. Station',
    lat: 33.8096,
    lon: -117.919,
    elev: 48,
  },
  {
    name: 'Adventureland South Berm',
    lat: 33.8101,
    lon: -117.9212,
    elev: 48,
  },
  {
    name: 'New Orleans Square Station',
    lat: 33.8115,
    lon: -117.9226,
    elev: 48,
  },
  {
    name: 'Bayou / Critter Country Perimeter',
    lat: 33.8132,
    lon: -117.9229,
    elev: 48,
  },
  {
    name: 'Rivers of America North Trestle',
    lat: 33.8147,
    lon: -117.9216,
    elev: 48,
  },
  {
    name: "Mickey's Toontown Depot",
    lat: 33.8153,
    lon: -117.9191,
    elev: 48,
  },
  {
    name: '"it\'s a small world" Promenade Berm',
    lat: 33.8148,
    lon: -117.9172,
    elev: 48,
  },
  {
    name: 'Autopia & Submarine Lagoon East Berm',
    lat: 33.8133,
    lon: -117.916,
    elev: 48,
  },
  {
    name: 'Tomorrowland Station',
    lat: 33.8117,
    lon: -117.9158,
    elev: 48,
  },
  {
    name: 'Grand Canyon / Primeval World Diorama Berm',
    lat: 33.8102,
    lon: -117.9167,
    elev: 48,
  },
  {
    name: 'Main Street, U.S.A. Station',
    lat: 33.8096,
    lon: -117.919,
    elev: 48,
  },
]);

/**
 * Las Vegas Monorail — 3.9-Mile Elevated Straddle-Beam Corridor (+7.5m)
 * MGM Grand → Horseshoe/Paris → Flamingo/Caesars → Harrah's/LINQ → Convention Center → Westgate → Sahara.
 */
export const LAS_VEGAS_MONORAIL_LINE = Object.freeze([
  { name: 'MGM Grand Station', lat: 36.1024, lon: -115.1678, elev: 646 },
  {
    name: 'Tropicana Ave Elevated Span',
    lat: 36.1069,
    lon: -115.1676,
    elev: 645,
  },
  {
    name: 'Horseshoe / Paris Station',
    lat: 36.1128,
    lon: -115.1675,
    elev: 644,
  },
  {
    name: 'Flamingo / Caesars Palace Station',
    lat: 36.1162,
    lon: -115.1682,
    elev: 643,
  },
  {
    name: "Harrah's / The LINQ Station",
    lat: 36.1187,
    lon: -115.1684,
    elev: 643,
  },
  {
    name: 'Sands Ave / Sphere Beam Curve',
    lat: 36.1225,
    lon: -115.1618,
    elev: 641,
  },
  {
    name: 'Convention Center Station',
    lat: 36.1292,
    lon: -115.1544,
    elev: 638,
  },
  {
    name: 'Westgate Las Vegas Station',
    lat: 36.1361,
    lon: -115.1546,
    elev: 635,
  },
  { name: 'Sahara Las Vegas Station', lat: 36.1422, lon: -115.1558, elev: 633 },
]);

export const LAS_VEGAS_MONORAIL_SOUTHBOUND = Object.freeze(
  LAS_VEGAS_MONORAIL_LINE.slice().reverse(),
);

/**
 * Disney Skyliner — Elevated Aerial Gondola Network (+16.0m)
 * EPCOT International Gateway ↔ Riviera Resort ↔ Caribbean Beach Hub ↔ Disney's Hollywood Studios.
 */
export const WDW_SKYLINER_EPCOT_TO_DHS = Object.freeze([
  {
    name: 'EPCOT International Gateway Station',
    lat: 28.3688,
    lon: -81.5535,
    elev: 32,
  },
  {
    name: 'BoardWalk / Buena Vista Turn Tower',
    lat: 28.3679,
    lon: -81.5471,
    elev: 32,
  },
  {
    name: "Disney's Riviera Resort Station",
    lat: 28.3666,
    lon: -81.5425,
    elev: 32,
  },
  {
    name: 'Caribbean Beach Resort Skyliner Hub',
    lat: 28.3636,
    lon: -81.5453,
    elev: 32,
  },
  {
    name: 'Buena Vista Drive Aerial Cable Span',
    lat: 28.3596,
    lon: -81.5531,
    elev: 32,
  },
  {
    name: "Disney's Hollywood Studios Station",
    lat: 28.3568,
    lon: -81.5594,
    elev: 32,
  },
]);

export const WDW_SKYLINER_DHS_TO_EPCOT = Object.freeze(
  WDW_SKYLINER_EPCOT_TO_DHS.slice().reverse(),
);

/**
 * Ober Mountain Aerial Tramway — 2.1-Mile Smoky Mountains Cableway (+22.0m)
 * Downtown Gatlinburg Parkway Lower Terminal ↔ Ober Mountain Upper Summit Terminal.
 */
export const OBER_AERIAL_TRAM_ASCENT = Object.freeze([
  {
    name: 'Gatlinburg Parkway Lower Terminal',
    lat: 35.7118,
    lon: -83.5168,
    elev: 394,
  },
  {
    name: 'Little Pigeon River Aerial Crossing',
    lat: 35.7107,
    lon: -83.522,
    elev: 448,
  },
  {
    name: 'Tram Tower 1 — Foothill Ascent',
    lat: 35.7094,
    lon: -83.5282,
    elev: 532,
  },
  {
    name: 'Mount Harrison Mid-Span Vista',
    lat: 35.7074,
    lon: -83.5375,
    elev: 645,
  },
  {
    name: 'Tram Tower 2 — Ski Ridge Crest',
    lat: 35.7052,
    lon: -83.5476,
    elev: 756,
  },
  {
    name: 'Ober Mountain Upper Summit Terminal',
    lat: 35.7031,
    lon: -83.5578,
    elev: 845,
  },
]);

export const OBER_AERIAL_TRAM_DESCENT = Object.freeze(
  OBER_AERIAL_TRAM_ASCENT.slice().reverse(),
);

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
  dlr_monorail: {
    id: 'dlr_monorail',
    name: 'Disneyland Monorail (Tomorrowland ↔ Downtown Disney Loop)',
    city: 'Anaheim, CA',
    from: {
      name: 'Tomorrowland Monorail Station',
      lat: 33.8125,
      lon: -117.9165,
      elev: 48,
    },
    to: {
      name: 'Tomorrowland Monorail Station',
      lat: 33.8125,
      lon: -117.9165,
      elev: 48,
    },
    defaultCorridor: 'dlr_monorail_loop',
    defaultSpeedMph: 30,
    bbox: [33.806, -117.928, 33.816, -117.914],
    trackProfiles: {
      dlr_monorail_loop: {
        name: 'Disneyland Monorail Mark VII Loop (Tomorrowland · Esplanade · Downtown Disney · Grand Californian)',
        description:
          'Elevated 2.5-mile Mark VII straddle-beam loop (+7.5m) gliding over Submarine Lagoon, Matterhorn, Harbor/Esplanade, DCA, Grand Californian, and Downtown Disney.',
        subterranean: false,
        vehicleMode: 'monorail',
        trainName: 'Disneyland Monorail Mark VII',
        railOffsetMeters: 7.5,
        locoColor: '#0284c7',
        carColor: '#f8fafc',
        trackColor: '#38bdf8',
        waypoints: DLR_MONORAIL_LOOP,
      },
    },
  },
  wdw_mk_railroad: {
    id: 'wdw_mk_railroad',
    name: 'Walt Disney World Railroad (Magic Kingdom Steam Loop)',
    city: 'Lake Buena Vista, Orlando, FL',
    from: {
      name: 'Main Street, U.S.A. Station',
      lat: 28.4165,
      lon: -81.5812,
      elev: 32,
    },
    to: {
      name: 'Main Street, U.S.A. Station',
      lat: 28.4165,
      lon: -81.5812,
      elev: 32,
    },
    defaultCorridor: 'mk_perimeter_steam_loop',
    defaultSpeedMph: 15,
    bbox: [28.415, -81.587, 28.424, -81.576],
    trackProfiles: {
      mk_perimeter_steam_loop: {
        name: 'Magic Kingdom 3-ft Narrow-Gauge Steam Loop (Main St · Frontierland · Fantasyland)',
        description:
          '1.5-mile surface/berm (+1.8m) perimeter steam excursion circling Main Street, Adventureland, Frontierland, Rivers of America, Storybook Circus, and Tomorrowland.',
        subterranean: false,
        vehicleMode: 'steam_rail',
        trainName: 'WDW Railroad Steam #1 Walter E. Disney',
        railOffsetMeters: 1.8,
        locoColor: '#b91c1c',
        carColor: '#92400e',
        trackColor: '#f59e0b',
        waypoints: WDW_MK_RAILROAD_LOOP,
      },
    },
  },
  dlr_railroad: {
    id: 'dlr_railroad',
    name: 'Disneyland Railroad (Anaheim Steam Loop)',
    city: 'Anaheim, CA',
    from: {
      name: 'Main Street, U.S.A. Station',
      lat: 33.8096,
      lon: -117.919,
      elev: 48,
    },
    to: {
      name: 'Main Street, U.S.A. Station',
      lat: 33.8096,
      lon: -117.919,
      elev: 48,
    },
    defaultCorridor: 'dlr_perimeter_steam_loop',
    defaultSpeedMph: 15,
    bbox: [33.808, -117.924, 33.817, -117.914],
    trackProfiles: {
      dlr_perimeter_steam_loop: {
        name: 'Disneyland 3-ft Narrow-Gauge Steam Loop (Main St · New Orleans Sq · Toontown · Tomorrowland)',
        description:
          '1.2-mile surface/berm (+1.8m) 1955 original narrow-gauge steam loop circling Main Street, New Orleans Square, Bayou Country, Toontown, Tomorrowland, and the Grand Canyon Diorama.',
        subterranean: false,
        vehicleMode: 'steam_rail',
        trainName: 'Disneyland Railroad Steam #1 C.K. Holliday',
        railOffsetMeters: 1.8,
        locoColor: '#15803d',
        carColor: '#92400e',
        trackColor: '#f59e0b',
        waypoints: DLR_RAILROAD_LOOP,
      },
    },
  },
  las_vegas_monorail: {
    id: 'las_vegas_monorail',
    name: 'Las Vegas Monorail (MGM Grand ↔ Sahara Elevated Strip Beam)',
    city: 'Las Vegas, NV',
    from: {
      name: 'MGM Grand Station',
      lat: 36.1024,
      lon: -115.1678,
      elev: 646,
    },
    to: {
      name: 'Sahara Las Vegas Station',
      lat: 36.1422,
      lon: -115.1558,
      elev: 633,
    },
    defaultCorridor: 'lv_monorail_mgm_to_sahara',
    defaultSpeedMph: 45,
    bbox: [36.098, -115.172, 36.146, -115.15],
    trackProfiles: {
      lv_monorail_mgm_to_sahara: {
        name: 'Las Vegas Monorail Northbound (MGM Grand → LINQ/Sphere → Convention Ctr → Sahara)',
        description:
          '3.9-mile elevated (+7.5m) straddle-beam monorail gliding behind the east Strip past Paris, Caesars, High Roller, Sphere, and Convention Center.',
        subterranean: false,
        vehicleMode: 'monorail',
        trainName: 'Las Vegas Monorail Mark VI',
        railOffsetMeters: 7.5,
        locoColor: '#0284c7',
        carColor: '#f8fafc',
        trackColor: '#38bdf8',
        waypoints: LAS_VEGAS_MONORAIL_LINE,
      },
      lv_monorail_sahara_to_mgm: {
        name: 'Las Vegas Monorail Southbound (Sahara → Convention Ctr → LINQ → MGM Grand)',
        description:
          'Return elevated (+7.5m) straddle-beam run south from Sahara past Westgate, Sphere, and High Roller down to MGM Grand.',
        subterranean: false,
        vehicleMode: 'monorail',
        trainName: 'Las Vegas Monorail Mark VI',
        railOffsetMeters: 7.5,
        locoColor: '#ec4899',
        carColor: '#f8fafc',
        trackColor: '#f472b6',
        waypoints: LAS_VEGAS_MONORAIL_SOUTHBOUND,
      },
    },
  },
  wdw_skyliner: {
    id: 'wdw_skyliner',
    name: 'Disney Skyliner (EPCOT ↔ Caribbean Beach ↔ Hollywood Studios)',
    city: 'Lake Buena Vista, Orlando, FL',
    from: {
      name: 'EPCOT International Gateway Station',
      lat: 28.3688,
      lon: -81.5535,
      elev: 32,
    },
    to: {
      name: "Disney's Hollywood Studios Station",
      lat: 28.3568,
      lon: -81.5594,
      elev: 32,
    },
    defaultCorridor: 'epcot_to_dhs_gondola',
    defaultSpeedMph: 14,
    bbox: [28.354, -81.563, 28.372, -81.539],
    trackProfiles: {
      epcot_to_dhs_gondola: {
        name: 'Disney Skyliner: EPCOT Gateway → Riviera → Caribbean Beach Hub → Hollywood Studios',
        description:
          'Elevated (+16.0m) aerial gondola glide soaring above World Showcase Lagoon, Disney’s Riviera Resort, and Caribbean Beach into Hollywood Studios.',
        subterranean: false,
        vehicleMode: 'aerial_tram',
        trainName: 'Disney Skyliner Gondola Cabin',
        railOffsetMeters: 16.0,
        locoColor: '#0ea5e9',
        carColor: '#fde047',
        trackColor: '#38bdf8',
        waypoints: WDW_SKYLINER_EPCOT_TO_DHS,
      },
      dhs_to_epcot_gondola: {
        name: 'Disney Skyliner: Hollywood Studios → Caribbean Beach Hub → Riviera → EPCOT Gateway',
        description:
          'Return elevated (+16.0m) aerial gondola flight from Hollywood Studios through Caribbean Beach Hub into EPCOT’s France/UK International Gateway.',
        subterranean: false,
        vehicleMode: 'aerial_tram',
        trainName: 'Disney Skyliner Gondola Cabin',
        railOffsetMeters: 16.0,
        locoColor: '#f59e0b',
        carColor: '#38bdf8',
        trackColor: '#fbbf24',
        waypoints: WDW_SKYLINER_DHS_TO_EPCOT,
      },
    },
  },
  ober_aerial_tram: {
    id: 'ober_aerial_tram',
    name: 'Ober Mountain Aerial Tramway (Gatlinburg Parkway ↔ Summit)',
    city: 'Gatlinburg, TN',
    from: {
      name: 'Gatlinburg Parkway Lower Terminal',
      lat: 35.7118,
      lon: -83.5168,
      elev: 394,
    },
    to: {
      name: 'Ober Mountain Upper Summit Terminal',
      lat: 35.7031,
      lon: -83.5578,
      elev: 845,
    },
    defaultCorridor: 'ober_parkway_to_summit',
    defaultSpeedMph: 20,
    bbox: [35.699, -83.562, 35.716, -83.512],
    trackProfiles: {
      ober_parkway_to_summit: {
        name: 'Ober Mountain Aerial Tramway Ascent (Downtown Gatlinburg → Summit)',
        description:
          '2.1-mile suspended cable car ascent (+22.0m AGL) climbing nearly 1,500 vertical feet above the Great Smoky Mountains into Ober Mountain.',
        subterranean: false,
        vehicleMode: 'aerial_tram',
        trainName: 'Ober Mountain Tram Car #1',
        railOffsetMeters: 22.0,
        locoColor: '#ef4444',
        carColor: '#f8fafc',
        trackColor: '#f87171',
        waypoints: OBER_AERIAL_TRAM_ASCENT,
      },
      ober_summit_to_parkway: {
        name: 'Ober Mountain Aerial Tramway Descent (Summit → Downtown Gatlinburg)',
        description:
          'Panoramic 2.1-mile cable car descent overlooking Mount LeConte and downtown Gatlinburg Parkway.',
        subterranean: false,
        vehicleMode: 'aerial_tram',
        trainName: 'Ober Mountain Tram Car #2',
        railOffsetMeters: 22.0,
        locoColor: '#2563eb',
        carColor: '#f8fafc',
        trackColor: '#60a5fa',
        waypoints: OBER_AERIAL_TRAM_DESCENT,
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
