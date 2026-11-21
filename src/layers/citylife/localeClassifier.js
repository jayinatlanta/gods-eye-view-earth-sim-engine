/**
 * Dynamic Settlement & Biome Classifier for Living World Simulator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Automatically maps arbitrary terrestrial lat/lon coordinates, bounding footprints,
 * and OpenStreetMap / landcover features to settlement typologies:
 *   - COASTAL_TIDEWATER (Darien, GA / barrier islands)
 *   - TRIBAL_RESERVATION (Muscogee / Cherokee / Osage OK tribal trust lands)
 *   - RURAL_AGRICULTURAL (Iowa corn / South Georgia agricultural farmland)
 *   - AMUSEMENT_THEME_PARK (Cedar Point, OH / Orlando Park Resorts, FL)
 *   - ALPINE_SKI_RESORT (Aspen, Whistler, Zermatt)
 *   - SAFARI_WILDLIFE_PARK (Serengeti, Kruger, Yellowstone)
 *   - SUBURBAN_COMMUTER (suburbs, small town main streets)
 *   - WILDERNESS_SANCTUARY (national parks, nature preserves)
 *   - DENSE_URBAN (metropolitan skyscraper grids)
 */

import { findNearbyStadium } from './stadiumCatalog.js';

export const SETTLEMENT_TYPOLOGIES = Object.freeze({
  COASTAL_TIDEWATER: 'COASTAL_TIDEWATER',
  TRIBAL_RESERVATION: 'TRIBAL_RESERVATION',
  RURAL_AGRICULTURAL: 'RURAL_AGRICULTURAL',
  AMUSEMENT_THEME_PARK: 'AMUSEMENT_THEME_PARK',
  STUDIO_MOVIE_LOT: 'STUDIO_MOVIE_LOT',
  STADIUM_SPORTS_COMPLEX: 'STADIUM_SPORTS_COMPLEX',
  SHOPPING_MALL_PROMENADE: 'SHOPPING_MALL_PROMENADE',
  ALPINE_SKI_RESORT: 'ALPINE_SKI_RESORT',
  SAFARI_WILDLIFE_PARK: 'SAFARI_WILDLIFE_PARK',
  SUBURBAN_COMMUTER: 'SUBURBAN_COMMUTER',
  WILDERNESS_SANCTUARY: 'WILDERNESS_SANCTUARY',
  DENSE_URBAN: 'DENSE_URBAN',
});

export const TYPOLOGY_METADATA = Object.freeze({
  [SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER]: {
    id: SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
    name: 'Coastal Tidewater Harbor',
    icon: '🦐',
    description:
      'Estuary deltas, wooden shrimping docks, salt marshes, and oyster-shell shoulders.',
    primaryTransit: 'water_taxis_and_golf_carts',
    pathingModes: ['pier_boardwalk', 'rural_shoulder'],
    soundscapeProfile: 'coastal',
  },
  [SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION]: {
    id: SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
    name: 'Tribal Reservation & Trust Lands',
    icon: '🪶',
    description:
      'Rolling tallgrass prairie, red clay section lines, homestead lanes, and tribal gathering grounds.',
    primaryTransit: 'tribal_demand_response_vans',
    pathingModes: ['rural_shoulder', 'pasture_wander'],
    soundscapeProfile: 'tribal_plains',
  },
  [SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL]: {
    id: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
    name: 'Heartland Agricultural Farmland',
    icon: '🌽',
    description:
      'Geometric field swathes, combines, grain elevators, and tractor furrows.',
    primaryTransit: 'crew_vans_and_grain_trucks',
    pathingModes: ['agricultural_swath', 'rural_shoulder', 'pasture_wander'],
    soundscapeProfile: 'farmland',
  },
  [SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK]: {
    id: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    name: 'Amusement & Theme Park Complex',
    icon: '🎢',
    description:
      'Car-free midways, 3D roller coaster rails, queue serpentines, and kinetic rides.',
    primaryTransit: 'parking_trams_and_miniature_rail',
    pathingModes: ['midway_concourse', 'coaster_spline', 'queue_switchback'],
    soundscapeProfile: 'theme_park',
  },
  [SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT]: {
    id: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    name: 'Active Studio Movie Set & Backlot',
    icon: '🎬',
    description:
      'Soundstage alleys, camera dolly tracks, lighting trusses, filming protocols, and talent trailers.',
    primaryTransit: 'production_golf_carts_and_grip_trucks',
    pathingModes: ['studio_backlot_lane', 'dolly_track_spline', 'sidewalk'],
    soundscapeProfile: 'studio_lot',
  },
  [SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX]: {
    id: SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX,
    name: 'Stadium & Arena Gameday Complex',
    icon: '🏟️',
    description:
      'Collegiate & pro sports stadiums, radial tailgate lots, turnstile ingress corridors, and transit surges.',
    primaryTransit: 'transit_shuttles_and_light_rail',
    pathingModes: [
      'tailgate_cluster',
      'stadium_ingress_corridor',
      'stadium_concourse_ring',
      'sidewalk',
    ],
    soundscapeProfile: 'stadium_gameday',
  },
  [SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE]: {
    id: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    name: 'Shopping Mall Promenade & Retail Sanctuary',
    icon: '🛍️',
    description:
      'Skylit atriums, marble concourses, central fountain basins, anchor department store wings, and food court mezzanines.',
    primaryTransit: 'electric_security_carts_and_shuttles',
    pathingModes: ['mall_concourse', 'atrium_walk', 'sidewalk'],
    soundscapeProfile: 'mall_concourse',
  },
  [SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT]: {
    id: SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT,
    name: 'Alpine Ski Lodge & Mountain Resort',
    icon: '⛷️',
    description:
      'Snow-packed village lanes, aerial gondolas, chairlifts, and lodge ski shuttles.',
    primaryTransit: 'lodge_shuttles_and_aerial_gondolas',
    pathingModes: ['snow_lane', 'aerial_cableway'],
    soundscapeProfile: 'alpine',
  },
  [SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK]: {
    id: SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK,
    name: 'Safari & Wildlife Sanctuary',
    icon: '🦁',
    description:
      'Unpaved game trails, river crossings, open-top safari rovers, and fauna flocking.',
    primaryTransit: 'open_top_safari_rovers',
    pathingModes: ['game_trail', 'pasture_wander'],
    soundscapeProfile: 'safari',
  },
  [SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER]: {
    id: SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER,
    name: 'Suburban & Small Town Main Street',
    icon: '🏡',
    description:
      'Residential blocks, corner storefronts, school buses, and curbside rideshares.',
    primaryTransit: 'taxis_and_rideshares',
    pathingModes: ['sidewalk', 'rural_shoulder'],
    soundscapeProfile: 'suburban',
  },
  [SETTLEMENT_TYPOLOGIES.WILDERNESS_SANCTUARY]: {
    id: SETTLEMENT_TYPOLOGIES.WILDERNESS_SANCTUARY,
    name: 'Wilderness Sanctuary & Nature Reserve',
    icon: '🌲',
    description:
      'Forested trails, riverbanks, mountain overlooks, and zero vehicular traffic.',
    primaryTransit: 'foot_and_trail',
    pathingModes: ['nature_trail'],
    soundscapeProfile: 'wilderness',
  },
  [SETTLEMENT_TYPOLOGIES.DENSE_URBAN]: {
    id: SETTLEMENT_TYPOLOGIES.DENSE_URBAN,
    name: 'Metropolitan Grid & Skyscraper Core',
    icon: '🏙️',
    description:
      'Paved sidewalk canyons, concrete curbs, signalized crosswalks, and municipal transit.',
    primaryTransit: 'municipal_bus_and_subway',
    pathingModes: ['sidewalk'],
    soundscapeProfile: 'urban',
  },
});

/**
 * Curated Exemplar Living Locales across diverse terrestrial archetypes.
 */
export const EXEMPLAR_LOCALES = Object.freeze({
  darien_ga: {
    id: 'darien_ga',
    name: 'Darien Shrimping Harbor',
    region: 'McIntosh County, Georgia',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
    lat: 31.3702,
    lon: -81.434,
    elev: 5,
    defaultAlt: 32,
    headingDeg: 135,
    pitchDeg: -14,
    icon: '🦐',
    landmarks: [
      'Historic Riverfront Docks',
      'Altamaha Estuary Marshes',
      'Broad Street Tabby Ruins',
      'Skippers Fish House',
    ],
    corridors: [
      {
        id: 'darien_riverfront_docks',
        name: 'Altamaha Waterfront & Trawler Docks',
        type: 'pier',
        waypoints: [
          { lat: 31.3688, lon: -81.4358, elev: 3 },
          { lat: 31.3695, lon: -81.4348, elev: 3 },
          { lat: 31.3702, lon: -81.434, elev: 3 },
          { lat: 31.371, lon: -81.4332, elev: 3 },
          { lat: 31.3718, lon: -81.4322, elev: 3 },
        ],
      },
      {
        id: 'darien_historic_shoulder',
        name: 'Broad Street Historic Tabby Shoulder',
        type: 'rural_shoulder',
        roadWidthMeters: 7.5,
        waypoints: [
          { lat: 31.369, lon: -81.433, elev: 6 },
          { lat: 31.3705, lon: -81.4338, elev: 7 },
          { lat: 31.3722, lon: -81.4345, elev: 7 },
          { lat: 31.3738, lon: -81.4352, elev: 8 },
        ],
      },
      {
        id: 'darien_marsh_boardwalk',
        name: 'Spartina Salt Marsh Elevated Boardwalk',
        type: 'pier',
        waypoints: [
          { lat: 31.3705, lon: -81.432, elev: 2 },
          { lat: 31.3712, lon: -81.4305, elev: 2 },
          { lat: 31.3719, lon: -81.429, elev: 2 },
          { lat: 31.3725, lon: -81.4278, elev: 2 },
        ],
      },
    ],
  },
  ok_reservation: {
    id: 'ok_reservation',
    name: 'Muscogee Nation Rural Prairie',
    region: 'Okmulgee / Creek County, Oklahoma',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
    lat: 35.6234,
    lon: -95.9614,
    elev: 215,
    defaultAlt: 35,
    headingDeg: 45,
    pitchDeg: -12,
    icon: '🪶',
    landmarks: [
      'Tribal Community Complex',
      'Council Oak Ceremonial Grounds',
      'Section Line 240 Grid',
      'Tallgrass Post Oak Pastures',
    ],
    corridors: [
      {
        id: 'ok_section_line_240',
        name: 'Section Line 240 Caliche Shoulder',
        type: 'rural_shoulder',
        roadWidthMeters: 6.5,
        waypoints: [
          { lat: 35.6205, lon: -95.9645, elev: 214 },
          { lat: 35.622, lon: -95.963, elev: 215 },
          { lat: 35.6234, lon: -95.9614, elev: 215 },
          { lat: 35.6252, lon: -95.9595, elev: 216 },
          { lat: 35.627, lon: -95.9575, elev: 217 },
        ],
      },
      {
        id: 'ok_tribal_complex_drive',
        name: 'Tribal Community Center & Elder Drive',
        type: 'rural_shoulder',
        roadWidthMeters: 8.0,
        waypoints: [
          { lat: 35.622, lon: -95.9625, elev: 215 },
          { lat: 35.623, lon: -95.9618, elev: 215 },
          { lat: 35.624, lon: -95.9608, elev: 216 },
          { lat: 35.6248, lon: -95.9598, elev: 216 },
        ],
      },
      {
        id: 'ok_post_oak_pasture',
        name: 'Red Dirt Cattle & Horse Range',
        type: 'pasture_wander',
        waypoints: [
          { lat: 35.621, lon: -95.966, elev: 214 },
          { lat: 35.624, lon: -95.965, elev: 215 },
          { lat: 35.625, lon: -95.962, elev: 215 },
          { lat: 35.622, lon: -95.963, elev: 214 },
        ],
      },
    ],
  },
  iowa_farm: {
    id: 'iowa_farm',
    name: 'Iowa Heartland Agricultural Farm',
    region: 'Story County, Iowa',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
    lat: 42.0347,
    lon: -93.62,
    elev: 290,
    defaultAlt: 38,
    headingDeg: 90,
    pitchDeg: -15,
    icon: '🌽',
    landmarks: [
      'Twin Galvanized Grain Silos',
      'Corn & Soybean Swath Headlands',
      'Machine Barn & Auger Ramp',
      'Black Angus Cattle Pasture',
    ],
    corridors: [
      {
        id: 'iowa_furrow_raster_north',
        name: 'North 80-Acre Corn Swath Furrows',
        type: 'agricultural_swath',
        waypoints: [
          { lat: 42.033, lon: -93.623, elev: 290 },
          { lat: 42.033, lon: -93.617, elev: 290 },
          { lat: 42.034, lon: -93.617, elev: 290 },
          { lat: 42.034, lon: -93.623, elev: 290 },
          { lat: 42.035, lon: -93.623, elev: 290 },
          { lat: 42.035, lon: -93.617, elev: 290 },
        ],
      },
      {
        id: 'iowa_farm_access_lane',
        name: 'County Road & Silo Access Lane',
        type: 'rural_shoulder',
        roadWidthMeters: 6.0,
        waypoints: [
          { lat: 42.032, lon: -93.621, elev: 289 },
          { lat: 42.0335, lon: -93.6205, elev: 290 },
          { lat: 42.0347, lon: -93.62, elev: 290 },
          { lat: 42.0365, lon: -93.6195, elev: 291 },
        ],
      },
      {
        id: 'iowa_south_pasture_boids',
        name: 'South Pasture Herd Boids',
        type: 'pasture_wander',
        waypoints: [
          { lat: 42.0315, lon: -93.619, elev: 289 },
          { lat: 42.033, lon: -93.618, elev: 289 },
          { lat: 42.0325, lon: -93.616, elev: 290 },
          { lat: 42.031, lon: -93.617, elev: 289 },
        ],
      },
    ],
  },
  cedar_point: {
    id: 'cedar_point',
    name: 'Cedar Point Coaster Peninsula',
    region: 'Sandusky, Ohio',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 41.4822,
    lon: -82.6835,
    elev: 176,
    defaultAlt: 45,
    headingDeg: 310,
    pitchDeg: -18,
    icon: '🎢',
    landmarks: [
      'Millennium Force Coaster Lift',
      'Main Midway Car-Free Concourse',
      'Lake Erie Beach Boardwalk',
      'Perimeter Miniature Steam Railway',
    ],
    corridors: [
      {
        id: 'cedar_point_main_midway',
        name: 'Main Midway Pedestrian Concourse',
        type: 'midway_concourse',
        waypoints: [
          { lat: 41.4795, lon: -82.68, elev: 176 },
          { lat: 41.481, lon: -82.682, elev: 176 },
          { lat: 41.4822, lon: -82.6835, elev: 176 },
          { lat: 41.4838, lon: -82.6855, elev: 176 },
          { lat: 41.4852, lon: -82.6875, elev: 176 },
        ],
      },
      {
        id: 'cedar_point_coaster_spline',
        name: 'Giga Coaster 3D Kinetic Rail Spline',
        type: 'coaster_spline',
        waypoints: [
          { lat: 41.482, lon: -82.683, elev: 177 }, // station
          { lat: 41.4825, lon: -82.6838, elev: 215 }, // lift hill apex +38m
          { lat: 41.483, lon: -82.6845, elev: 178 }, // steep plunge drop
          { lat: 41.4838, lon: -82.685, elev: 198 }, // overbanked turn
          { lat: 41.4842, lon: -82.6842, elev: 182 }, // airtime hill
          { lat: 41.4832, lon: -82.6832, elev: 179 }, // brake run
          { lat: 41.482, lon: -82.683, elev: 177 }, // return to station
        ],
      },
      {
        id: 'cedar_point_queue_serpentine',
        name: 'Thrill Coaster Stanchion Queue Serpentine',
        type: 'queue_switchback',
        waypoints: [
          { lat: 41.4818, lon: -82.6828, elev: 176 },
          { lat: 41.4819, lon: -82.6826, elev: 176 },
          { lat: 41.482, lon: -82.6828, elev: 176 },
          { lat: 41.4821, lon: -82.6826, elev: 176 },
          { lat: 41.4822, lon: -82.6828, elev: 176 },
        ],
      },
    ],
  },
  orlando_park: {
    id: 'orlando_park',
    name: 'Orlando Theme Park Resort',
    region: 'Orlando, Florida',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 28.4177,
    lon: -81.5812,
    elev: 32,
    defaultAlt: 40,
    headingDeg: 0,
    pitchDeg: -15,
    icon: '🏰',
    landmarks: [
      'Central Plaza Hub & Spoke',
      'Themed Castle Esplanade',
      'Elevated Monorail Beamway',
      'Lakeside Ferryboat Dock',
    ],
    corridors: [
      {
        id: 'orlando_central_plaza',
        name: 'Central Plaza Hub Promenade',
        type: 'midway_concourse',
        waypoints: [
          { lat: 28.4162, lon: -81.5812, elev: 32 },
          { lat: 28.417, lon: -81.5812, elev: 32 },
          { lat: 28.4177, lon: -81.5812, elev: 32 },
          { lat: 28.4188, lon: -81.5812, elev: 32 },
        ],
      },
      {
        id: 'orlando_monorail_loop',
        name: 'Resort Monorail Straddle Beam',
        type: 'coaster_spline',
        waypoints: [
          { lat: 28.4155, lon: -81.5805, elev: 40 },
          { lat: 28.417, lon: -81.58, elev: 40 },
          { lat: 28.4185, lon: -81.5805, elev: 40 },
          { lat: 28.419, lon: -81.582, elev: 40 },
          { lat: 28.417, lon: -81.5825, elev: 40 },
          { lat: 28.4155, lon: -81.5805, elev: 40 },
        ],
      },
    ],
  },
  paramount_studios: {
    id: 'paramount_studios',
    name: 'Paramount Pictures Studio Backlot',
    region: 'Hollywood, Los Angeles, CA',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    lat: 34.0837,
    lon: -118.3204,
    elev: 86,
    defaultAlt: 36,
    headingDeg: 90,
    pitchDeg: -16,
    icon: '🎬',
    landmarks: [
      'Bronson Gate Arch',
      'New York Street Backlot',
      'Soundstage 18 Alley',
      'Blue Sky Backdrop Tank',
    ],
    corridors: [
      {
        id: 'paramount_ny_street',
        name: 'New York Street Backlot Dolly Track',
        type: 'dolly_track_spline',
        waypoints: [
          { lat: 34.0832, lon: -118.3212, elev: 86 },
          { lat: 34.0837, lon: -118.3204, elev: 86 },
          { lat: 34.0842, lon: -118.3196, elev: 86 },
        ],
      },
      {
        id: 'paramount_stage_alley',
        name: 'Soundstage 18 Grip & Cart Alley',
        type: 'studio_backlot_lane',
        roadWidthMeters: 8.0,
        waypoints: [
          { lat: 34.0828, lon: -118.3218, elev: 86 },
          { lat: 34.0837, lon: -118.3204, elev: 86 },
          { lat: 34.0846, lon: -118.319, elev: 87 },
        ],
      },
    ],
  },
  warner_bros: {
    id: 'warner_bros',
    name: 'Warner Bros. Studios Burbank Lot',
    region: 'Burbank, California',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    lat: 34.1489,
    lon: -118.3374,
    elev: 172,
    defaultAlt: 38,
    headingDeg: 180,
    pitchDeg: -15,
    icon: '🎬',
    landmarks: [
      'WB Water Tower',
      'Midwest Street Town Square',
      'Stage 16 Soundstage',
      'Hennesy Street Facades',
    ],
    corridors: [
      {
        id: 'wb_midwest_street_dolly',
        name: 'Midwest Street Camera Dolly Spline',
        type: 'dolly_track_spline',
        waypoints: [
          { lat: 34.1482, lon: -118.338, elev: 172 },
          { lat: 34.1489, lon: -118.3374, elev: 172 },
          { lat: 34.1496, lon: -118.3368, elev: 172 },
        ],
      },
      {
        id: 'wb_soundstage_promenade',
        name: 'Stage 16 Production Cart Loop',
        type: 'studio_backlot_lane',
        waypoints: [
          { lat: 34.148, lon: -118.3385, elev: 172 },
          { lat: 34.1489, lon: -118.3374, elev: 172 },
          { lat: 34.1498, lon: -118.3362, elev: 173 },
        ],
      },
    ],
  },
  universal_backlot: {
    id: 'universal_backlot',
    name: 'Universal City Studio Backlot',
    region: 'Universal City, California',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    lat: 34.1381,
    lon: -118.3534,
    elev: 210,
    defaultAlt: 40,
    headingDeg: 120,
    pitchDeg: -16,
    icon: '🎬',
    landmarks: [
      'Courthouse Square Clocktower',
      'Colonial Street Set',
      ' Bates Motel & Psycho Hill',
      'War of the Worlds Crash Set',
    ],
    corridors: [
      {
        id: 'universal_courthouse_dolly',
        name: 'Courthouse Square Crane & Dolly Run',
        type: 'dolly_track_spline',
        waypoints: [
          { lat: 34.1375, lon: -118.3542, elev: 210 },
          { lat: 34.1381, lon: -118.3534, elev: 210 },
          { lat: 34.1388, lon: -118.3526, elev: 211 },
        ],
      },
      {
        id: 'universal_tram_backlot_lane',
        name: 'Studio Backlot Tram & Grip Lane',
        type: 'studio_backlot_lane',
        waypoints: [
          { lat: 34.1372, lon: -118.3548, elev: 209 },
          { lat: 34.1381, lon: -118.3534, elev: 210 },
          { lat: 34.1391, lon: -118.352, elev: 211 },
        ],
      },
    ],
  },
  tyler_perry_studios: {
    id: 'tyler_perry_studios',
    name: 'Tyler Perry Studios Backlot',
    region: 'Fort McPherson, Atlanta, GA',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    lat: 33.7042,
    lon: -84.4285,
    elev: 312,
    defaultAlt: 38,
    headingDeg: 60,
    pitchDeg: -15,
    icon: '🎬',
    landmarks: [
      'White House Set Replica',
      'Historic Fort Quadrangle',
      'Dreamers Soundstage Row',
      'Maxine Diner Set',
    ],
    corridors: [
      {
        id: 'tps_whitehouse_dolly',
        name: 'White House Replica Exterior Dolly Track',
        type: 'dolly_track_spline',
        waypoints: [
          { lat: 33.7036, lon: -84.4292, elev: 312 },
          { lat: 33.7042, lon: -84.4285, elev: 312 },
          { lat: 33.7048, lon: -84.4278, elev: 312 },
        ],
      },
      {
        id: 'tps_soundstage_alley',
        name: 'Soundstage Row Production Lane',
        type: 'studio_backlot_lane',
        waypoints: [
          { lat: 33.7032, lon: -84.4298, elev: 311 },
          { lat: 33.7042, lon: -84.4285, elev: 312 },
          { lat: 33.7052, lon: -84.4272, elev: 313 },
        ],
      },
    ],
  },
  pinewood_studios: {
    id: 'pinewood_studios',
    name: 'Pinewood Studios 007 Lot',
    region: 'Iver Heath, Buckinghamshire',
    country: 'UK',
    typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
    lat: 51.5471,
    lon: -0.5342,
    elev: 58,
    defaultAlt: 38,
    headingDeg: 110,
    pitchDeg: -15,
    icon: '🎬',
    landmarks: [
      'Albert R. Broccoli 007 Stage',
      'Underwater Filming Paddock Tank',
      'Heatherden Hall Manor',
      'North Lot Soundstages',
    ],
    corridors: [
      {
        id: 'pinewood_007_dolly',
        name: '007 Stage Paddock Dolly Spline',
        type: 'dolly_track_spline',
        waypoints: [
          { lat: 51.5466, lon: -0.535, elev: 58 },
          { lat: 51.5471, lon: -0.5342, elev: 58 },
          { lat: 51.5476, lon: -0.5334, elev: 58 },
        ],
      },
      {
        id: 'pinewood_backlot_lane',
        name: 'Heatherden Production Lane',
        type: 'studio_backlot_lane',
        waypoints: [
          { lat: 51.5462, lon: -0.5356, elev: 58 },
          { lat: 51.5471, lon: -0.5342, elev: 58 },
          { lat: 51.548, lon: -0.5328, elev: 59 },
        ],
      },
    ],
  },
  disney_magic_kingdom: {
    id: 'disney_magic_kingdom',
    name: 'Walt Disney World Magic Kingdom',
    region: 'Lake Buena Vista, Orlando, FL',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 28.4187,
    lon: -81.5818,
    elev: 32,
    defaultAlt: 42,
    headingDeg: 0,
    pitchDeg: -16,
    icon: '🏰',
    landmarks: [
      'Cinderella Castle Hub',
      'Space Mountain Dome',
      'Seven Seas Monorail Loop',
      'TRON Lightcycle Canopy',
    ],
    corridors: [
      {
        id: 'mk_main_street_midway',
        name: 'Main Street USA & Castle Hub Midway',
        type: 'midway_concourse',
        waypoints: [
          { lat: 28.4165, lon: -81.5812, elev: 32 },
          { lat: 28.4177, lon: -81.5812, elev: 32 },
          { lat: 28.4187, lon: -81.5818, elev: 32 },
          { lat: 28.4196, lon: -81.5812, elev: 32 },
        ],
      },
      {
        id: 'mk_tron_coaster_spline',
        name: 'Tomorrowland Canopy Launch Coaster',
        type: 'coaster_spline',
        waypoints: [
          { lat: 28.419, lon: -81.5775, elev: 33 },
          { lat: 28.4195, lon: -81.5768, elev: 58 },
          { lat: 28.42, lon: -81.5762, elev: 34 },
          { lat: 28.4194, lon: -81.577, elev: 46 },
          { lat: 28.419, lon: -81.5775, elev: 33 },
        ],
      },
    ],
  },
  universal_orlando: {
    id: 'universal_orlando',
    name: 'Universal Orlando & Islands of Adventure',
    region: 'Orlando, Florida',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 28.4722,
    lon: -81.4678,
    elev: 34,
    defaultAlt: 42,
    headingDeg: 320,
    pitchDeg: -17,
    icon: '🎢',
    landmarks: [
      'VelociCoaster Top Hat (+47m)',
      'Hogwarts Castle & Express',
      'Incredible Hulk Launch Coaster',
      'Universal CityWalk Lagoon',
    ],
    corridors: [
      {
        id: 'universal_ioa_midway',
        name: 'Islands of Adventure Lagoon Promenade',
        type: 'midway_concourse',
        waypoints: [
          { lat: 28.471, lon: -81.469, elev: 34 },
          { lat: 28.4722, lon: -81.4678, elev: 34 },
          { lat: 28.4734, lon: -81.4666, elev: 34 },
        ],
      },
      {
        id: 'velocicoaster_spline',
        name: 'VelociCoaster 47m Lagoon Top-Hat Spline',
        type: 'coaster_spline',
        waypoints: [
          { lat: 28.4715, lon: -81.4685, elev: 35 },
          { lat: 28.4722, lon: -81.4678, elev: 82 },
          { lat: 28.4728, lon: -81.467, elev: 35 },
          { lat: 28.472, lon: -81.4675, elev: 54 },
          { lat: 28.4715, lon: -81.4685, elev: 35 },
        ],
      },
    ],
  },
  disneyland_ca: {
    id: 'disneyland_ca',
    name: 'Disneyland Resort California',
    region: 'Anaheim, California',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 33.8121,
    lon: -117.919,
    elev: 48,
    defaultAlt: 40,
    headingDeg: 0,
    pitchDeg: -16,
    icon: '🏰',
    landmarks: [
      'Sleeping Beauty Castle',
      'Matterhorn Bobsleds Peak',
      'Pixar Pal-A-Round Wheel',
      'Incredicoaster Pier Loop',
    ],
    corridors: [
      {
        id: 'disneyland_esplanade',
        name: 'Main Street & Castle Hub Midway',
        type: 'midway_concourse',
        waypoints: [
          { lat: 33.81, lon: -117.919, elev: 48 },
          { lat: 33.8121, lon: -117.919, elev: 48 },
          { lat: 33.8135, lon: -117.919, elev: 48 },
        ],
      },
      {
        id: 'matterhorn_coaster_spline',
        name: 'Matterhorn Bobsleds Alpine Plunge',
        type: 'coaster_spline',
        waypoints: [
          { lat: 33.8128, lon: -117.9178, elev: 49 },
          { lat: 33.8132, lon: -117.9175, elev: 92 },
          { lat: 33.8136, lon: -117.918, elev: 50 },
          { lat: 33.8128, lon: -117.9178, elev: 49 },
        ],
      },
    ],
  },
  disneyland_paris: {
    id: 'disneyland_paris',
    name: 'Disneyland Paris Resort',
    region: 'Marne-la-Vallée, Île-de-France',
    country: 'France',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 48.8722,
    lon: 2.7758,
    elev: 122,
    defaultAlt: 42,
    headingDeg: 340,
    pitchDeg: -16,
    icon: '🏰',
    landmarks: [
      'Sleeping Beauty Castle & Dragon Lair',
      'Big Thunder Mountain Island',
      'Hyperspace Mountain Dome',
      'Walt Disney Studios Lot',
    ],
    corridors: [
      {
        id: 'dlp_central_plaza',
        name: 'Central Plaza & Frontierland Midway',
        type: 'midway_concourse',
        waypoints: [
          { lat: 48.871, lon: 2.7765, elev: 122 },
          { lat: 48.8722, lon: 2.7758, elev: 122 },
          { lat: 48.8732, lon: 2.775, elev: 122 },
        ],
      },
      {
        id: 'dlp_thunder_mountain_spline',
        name: 'Big Thunder Mountain Mesa Coaster',
        type: 'coaster_spline',
        waypoints: [
          { lat: 48.8715, lon: 2.7735, elev: 123 },
          { lat: 48.872, lon: 2.7728, elev: 162 },
          { lat: 48.8725, lon: 2.7738, elev: 124 },
          { lat: 48.8715, lon: 2.7735, elev: 123 },
        ],
      },
    ],
  },
  tokyo_disneyland: {
    id: 'tokyo_disneyland',
    name: 'Tokyo Disney Resort & DisneySea',
    region: 'Urayasu, Chiba / Tokyo Bay',
    country: 'Japan',
    typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
    lat: 35.6329,
    lon: 139.8804,
    elev: 6,
    defaultAlt: 42,
    headingDeg: 210,
    pitchDeg: -16,
    icon: '🎢',
    landmarks: [
      'Mount Prometheus Volcano',
      'World Bazaar Glass Canopy',
      'Mediterranean Harbor Lagoon',
      'Disney Resort Line Monorail',
    ],
    corridors: [
      {
        id: 'tdr_harbor_midway',
        name: 'World Bazaar & Harbor Promenade',
        type: 'midway_concourse',
        waypoints: [
          { lat: 35.6318, lon: 139.8812, elev: 6 },
          { lat: 35.6329, lon: 139.8804, elev: 6 },
          { lat: 35.634, lon: 139.8796, elev: 6 },
        ],
      },
      {
        id: 'tdr_prometheus_spline',
        name: 'Journey to the Center of the Earth Plunge',
        type: 'coaster_spline',
        waypoints: [
          { lat: 35.6265, lon: 139.885, elev: 8 },
          { lat: 35.6272, lon: 139.8842, elev: 56 },
          { lat: 35.6278, lon: 139.8852, elev: 9 },
          { lat: 35.6265, lon: 139.885, elev: 8 },
        ],
      },
    ],
  },
  phipps_plaza: {
    id: 'phipps_plaza',
    name: 'Phipps Plaza Luxury Promenade',
    region: 'Buckhead, Atlanta, GA',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    lat: 33.8535,
    lon: -84.3621,
    elev: 295,
    defaultAlt: 55,
    headingDeg: 180,
    pitchDeg: -22,
    icon: '🛍️',
    landmarks: [
      'Central Glass Atrium Skylight',
      'Polished Marble Concourse',
      'Saks Fifth Avenue Colonnade',
      'Citizen Market Food Hall',
      'Court of the South Tiered Fountain',
    ],
    corridors: [
      {
        id: 'phipps_main_concourse',
        name: 'Grand Marble Concourse Promenade',
        type: 'mall_concourse',
        roadWidthMeters: 10.0,
        waypoints: [
          { lat: 33.8528, lon: -84.3621, elev: 295 },
          { lat: 33.8535, lon: -84.3621, elev: 295 },
          { lat: 33.8542, lon: -84.3621, elev: 295 },
        ],
      },
      {
        id: 'phipps_saks_colonnade',
        name: 'Saks Fifth Avenue Colonnade Wing',
        type: 'mall_concourse',
        roadWidthMeters: 8.0,
        waypoints: [
          { lat: 33.8535, lon: -84.3628, elev: 295 },
          { lat: 33.8535, lon: -84.3621, elev: 295 },
          { lat: 33.8535, lon: -84.3614, elev: 295 },
        ],
      },
    ],
    watchCameras: {
      atrium_skylight: {
        lat: 33.8535,
        lon: -84.3621,
        altOffset: 45,
        pitchDeg: -55,
        headingDeg: 180,
      },
      central_fountain: {
        lat: 33.8532,
        lon: -84.3621,
        altOffset: 2.2,
        pitchDeg: -8,
        headingDeg: 0,
      },
      food_court_balcony: {
        lat: 33.8538,
        lon: -84.3623,
        altOffset: 7.5,
        pitchDeg: -18,
        headingDeg: 135,
      },
      anchor_colonnade: {
        lat: 33.8529,
        lon: -84.362,
        altOffset: 3.5,
        pitchDeg: -10,
        headingDeg: 15,
      },
    },
  },
  northpark_center: {
    id: 'northpark_center',
    name: 'NorthPark Center Modernist Landmark',
    region: 'Dallas, TX',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    lat: 32.8687,
    lon: -96.7735,
    elev: 185,
    defaultAlt: 50,
    headingDeg: 0,
    pitchDeg: -20,
    icon: '🦆',
    landmarks: [
      'Indoor Duck Pond & Turtle Planters',
      '1965 White Brick Concourse',
      'CenterPark 1.4-Acre Interior Courtyard',
      'Neiman Marcus Flagship',
      'Nasher Modern Art Sculpture Collection',
    ],
    corridors: [
      {
        id: 'northpark_duck_promenade',
        name: 'Central Court Duck Pond Promenade',
        type: 'mall_concourse',
        roadWidthMeters: 12.0,
        waypoints: [
          { lat: 32.868, lon: -96.7735, elev: 185 },
          { lat: 32.8687, lon: -96.7735, elev: 185 },
          { lat: 32.8694, lon: -96.7735, elev: 185 },
        ],
      },
      {
        id: 'northpark_neiman_wing',
        name: 'Neiman Marcus White Brick Wing',
        type: 'mall_concourse',
        roadWidthMeters: 9.0,
        waypoints: [
          { lat: 32.8687, lon: -96.7742, elev: 185 },
          { lat: 32.8687, lon: -96.7735, elev: 185 },
          { lat: 32.8687, lon: -96.7728, elev: 185 },
        ],
      },
    ],
    watchCameras: {
      atrium_skylight: {
        lat: 32.8687,
        lon: -96.7735,
        altOffset: 42,
        pitchDeg: -50,
        headingDeg: 45,
      },
      central_fountain: {
        lat: 32.8684,
        lon: -96.7736,
        altOffset: 2.0,
        pitchDeg: -8,
        headingDeg: 350,
      },
      food_court_balcony: {
        lat: 32.8692,
        lon: -96.7732,
        altOffset: 6.8,
        pitchDeg: -15,
        headingDeg: 210,
      },
      anchor_colonnade: {
        lat: 32.868,
        lon: -96.7738,
        altOffset: 3.2,
        pitchDeg: -10,
        headingDeg: 30,
      },
    },
  },
  oglethorpe_mall: {
    id: 'oglethorpe_mall',
    name: 'Oglethorpe Mall Coastal Promenade',
    region: 'Abercorn St, Savannah, GA',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    lat: 32.0003,
    lon: -81.1219,
    elev: 12,
    defaultAlt: 48,
    headingDeg: 90,
    pitchDeg: -18,
    icon: '🛍️',
    landmarks: [
      'Abercorn Central Skylit Atrium',
      'Belk & Macy Wings',
      'Lowcountry Food Court Mezzanine',
      'Coastal Palm Tree Promenade',
    ],
    corridors: [
      {
        id: 'oglethorpe_main_spine',
        name: 'Central Concourse Shopping Spine',
        type: 'mall_concourse',
        roadWidthMeters: 9.0,
        waypoints: [
          { lat: 31.9996, lon: -81.1219, elev: 12 },
          { lat: 32.0003, lon: -81.1219, elev: 12 },
          { lat: 32.001, lon: -81.1219, elev: 12 },
        ],
      },
    ],
    watchCameras: {
      atrium_skylight: {
        lat: 32.0003,
        lon: -81.1219,
        altOffset: 38,
        pitchDeg: -55,
        headingDeg: 90,
      },
      central_fountain: {
        lat: 32.0001,
        lon: -81.1221,
        altOffset: 2.2,
        pitchDeg: -8,
        headingDeg: 45,
      },
      food_court_balcony: {
        lat: 32.0007,
        lon: -81.1215,
        altOffset: 6.5,
        pitchDeg: -16,
        headingDeg: 220,
      },
      anchor_colonnade: {
        lat: 31.9998,
        lon: -81.1225,
        altOffset: 3.2,
        pitchDeg: -10,
        headingDeg: 75,
      },
    },
  },
  savannah_mall: {
    id: 'savannah_mall',
    name: 'Savannah Mall Nostalgic Sanctuary',
    region: 'Abercorn South, Savannah, GA',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    lat: 31.9806,
    lon: -81.1517,
    elev: 8,
    defaultAlt: 48,
    headingDeg: 45,
    pitchDeg: -20,
    icon: '🎠',
    landmarks: [
      '1990 Double-Decker Venetian Carousel',
      'Skylit Food Pavilion Center',
      'Bass Pro Shops Coastal Lagoon',
      'Nostalgic 90s Retail Concourse',
    ],
    corridors: [
      {
        id: 'savannah_carousel_promenade',
        name: 'Venetian Carousel Center Concourse',
        type: 'mall_concourse',
        roadWidthMeters: 10.0,
        waypoints: [
          { lat: 31.98, lon: -81.1522, elev: 8 },
          { lat: 31.9806, lon: -81.1517, elev: 8 },
          { lat: 31.9812, lon: -81.1512, elev: 8 },
        ],
      },
    ],
    watchCameras: {
      atrium_skylight: {
        lat: 31.9806,
        lon: -81.1517,
        altOffset: 40,
        pitchDeg: -55,
        headingDeg: 45,
      },
      central_fountain: {
        lat: 31.9804,
        lon: -81.1519,
        altOffset: 2.5,
        pitchDeg: -6,
        headingDeg: 30,
      },
      food_court_balcony: {
        lat: 31.981,
        lon: -81.1512,
        altOffset: 7.0,
        pitchDeg: -18,
        headingDeg: 215,
      },
      anchor_colonnade: {
        lat: 31.98,
        lon: -81.1522,
        altOffset: 3.2,
        pitchDeg: -10,
        headingDeg: 60,
      },
    },
  },
  quaker_bridge_mall: {
    id: 'quaker_bridge_mall',
    name: 'Quaker Bridge Mall Princeton Gateway',
    region: 'Lawrence Township / Route 1 Corridor, NJ',
    country: 'USA',
    typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
    lat: 40.2975,
    lon: -74.6853,
    elev: 24,
    defaultAlt: 50,
    headingDeg: 135,
    pitchDeg: -20,
    icon: '🛍️',
    landmarks: [
      'Route 1 Modern Glass Atrium',
      'Stainless Steel Balcony Railings',
      'Central Escalator Spine',
      'Cheesecake Factory Terrace',
      'Simon Regional Center Promenade',
    ],
    corridors: [
      {
        id: 'quaker_bridge_central_promenade',
        name: 'Route 1 Skylit Central Concourse',
        type: 'mall_concourse',
        roadWidthMeters: 10.0,
        waypoints: [
          { lat: 40.2968, lon: -74.686, elev: 24 },
          { lat: 40.2975, lon: -74.6853, elev: 24 },
          { lat: 40.2982, lon: -74.6846, elev: 24 },
        ],
      },
    ],
    watchCameras: {
      atrium_skylight: {
        lat: 40.2975,
        lon: -74.6853,
        altOffset: 42,
        pitchDeg: -55,
        headingDeg: 135,
      },
      central_fountain: {
        lat: 40.2973,
        lon: -74.6855,
        altOffset: 2.2,
        pitchDeg: -8,
        headingDeg: 45,
      },
      food_court_balcony: {
        lat: 40.2979,
        lon: -74.685,
        altOffset: 6.8,
        pitchDeg: -16,
        headingDeg: 240,
      },
      anchor_colonnade: {
        lat: 40.2969,
        lon: -74.6858,
        altOffset: 3.5,
        pitchDeg: -10,
        headingDeg: 50,
      },
    },
  },
});

/**
 * Calculates Haversine distance in meters between two lat/lon pairs.
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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
 * Dynamic Settlement & Biome Classifier.
 * Inspects coordinates, bounding boxes, and OSM/landcover tags to determine typology.
 */
export function classifyLocale({
  lat = null,
  lon = null,
  tags = [],
  roadCount = null,
  buildingCount = null,
  elevationMeters = null,
} = {}) {
  // 1. Direct coordinate proximity to curated exemplar locales or stadiums
  if (typeof lat === 'number' && typeof lon === 'number') {
    const nearbyStadium = findNearbyStadium(lat, lon, 3000);
    if (nearbyStadium) {
      const meta =
        TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX];
      return {
        typology: SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX,
        confidence: Math.max(0.85, 1.0 - nearbyStadium.distanceMeters / 4000),
        localeId: nearbyStadium.stadium.id,
        name: nearbyStadium.stadium.name,
        icon: nearbyStadium.stadium.icon,
        primaryTransit: meta.primaryTransit,
        pathingModes: meta.pathingModes,
        soundscapeProfile: meta.soundscapeProfile,
        stadium: nearbyStadium.stadium,
        exemplar: null,
      };
    }

    let bestExemplar = null;
    let bestDist = Infinity;
    for (const exemplar of Object.values(EXEMPLAR_LOCALES)) {
      const dist = haversineMeters(lat, lon, exemplar.lat, exemplar.lon);
      if (dist <= 25000 && dist < bestDist) {
        bestDist = dist;
        bestExemplar = exemplar;
      }
    }
    if (bestExemplar) {
      return {
        typology: bestExemplar.typology,
        confidence: Math.max(0.7, 1.0 - bestDist / 35000),
        localeId: bestExemplar.id,
        name: bestExemplar.name,
        icon: bestExemplar.icon,
        primaryTransit: TYPOLOGY_METADATA[bestExemplar.typology].primaryTransit,
        pathingModes: TYPOLOGY_METADATA[bestExemplar.typology].pathingModes,
        soundscapeProfile:
          TYPOLOGY_METADATA[bestExemplar.typology].soundscapeProfile,
        exemplar: bestExemplar,
      };
    }
  }

  // Normalize tags array
  const tagSet = new Set(
    (tags || []).map((t) => String(t).toLowerCase().trim()),
  );

  // 2. OSM Tag Evaluation
  if (
    tagSet.has('leisure=stadium') ||
    tagSet.has('building=stadium') ||
    tagSet.has('building=sports_hall') ||
    tagSet.has('building=arena') ||
    tagSet.has('sports_centre=stadium') ||
    tagSet.has('stadium') ||
    tagSet.has('arena')
  ) {
    const meta =
      TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX];
    return {
      typology: SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX,
      confidence: 0.96,
      localeId: 'custom_stadium_sports_complex',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('industrial=film_studio') ||
    tagSet.has('studio=film') ||
    tagSet.has('studio=television') ||
    tagSet.has('landuse=studio') ||
    tagSet.has('film_studio') ||
    tagSet.has('soundstage') ||
    tagSet.has('movie_lot')
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT];
    return {
      typology: SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT,
      confidence: 0.96,
      localeId: 'custom_studio_movie_lot',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('shop=mall') ||
    tagSet.has('amenity=marketplace') ||
    tagSet.has('building=retail') ||
    tagSet.has('mall') ||
    tagSet.has('shopping_mall')
  ) {
    const meta =
      TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE];
    return {
      typology: SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      confidence: 0.94,
      localeId: 'custom_shopping_mall',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('tourism=theme_park') ||
    tagSet.has('attraction=roller_coaster') ||
    tagSet.has('theme_park') ||
    tagSet.has('roller_coaster')
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK];
    return {
      typology: SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
      confidence: 0.95,
      localeId: 'custom_theme_park',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('boundary=aboriginal_lands') ||
    tagSet.has('tribal_land') ||
    tagSet.has('reservation')
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION];
    return {
      typology: SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION,
      confidence: 0.92,
      localeId: 'custom_tribal_land',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('natural=coastline') ||
    tagSet.has('waterway=dock') ||
    tagSet.has('landuse=harbor') ||
    tagSet.has('man_made=pier') ||
    tagSet.has('estuary')
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER];
    return {
      typology: SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
      confidence: 0.88,
      localeId: 'custom_coastal_tidewater',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('landuse=farmland') ||
    tagSet.has('landuse=farmyard') ||
    tagSet.has('landuse=orchard') ||
    tagSet.has('crop')
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL];
    return {
      typology: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
      confidence: 0.86,
      localeId: 'custom_agricultural_farmland',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('tourism=alpine_resort') ||
    tagSet.has('aerialway=gondola') ||
    tagSet.has('piste:type') ||
    (elevationMeters && elevationMeters > 1800) ||
    (elevationMeters && elevationMeters > 1200 && tagSet.has('winter_sports'))
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT];
    return {
      typology: SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT,
      confidence: 0.9,
      localeId: 'custom_alpine_resort',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  if (
    tagSet.has('tourism=safari_park') ||
    (tagSet.has('boundary=national_park') && tagSet.has('game_reserve'))
  ) {
    const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK];
    return {
      typology: SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK,
      confidence: 0.87,
      localeId: 'custom_safari_park',
      name: meta.name,
      icon: meta.icon,
      primaryTransit: meta.primaryTransit,
      pathingModes: meta.pathingModes,
      soundscapeProfile: meta.soundscapeProfile,
      exemplar: null,
    };
  }

  // 3. Density / Road Heuristics
  if (typeof roadCount === 'number' && typeof buildingCount === 'number') {
    if (roadCount > 35 || buildingCount > 120) {
      const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.DENSE_URBAN];
      return {
        typology: SETTLEMENT_TYPOLOGIES.DENSE_URBAN,
        confidence: 0.85,
        localeId: 'custom_dense_urban',
        name: meta.name,
        icon: meta.icon,
        primaryTransit: meta.primaryTransit,
        pathingModes: meta.pathingModes,
        soundscapeProfile: meta.soundscapeProfile,
        exemplar: null,
      };
    }
    if (roadCount >= 8 && buildingCount >= 20) {
      const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER];
      return {
        typology: SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER,
        confidence: 0.78,
        localeId: 'custom_suburban',
        name: meta.name,
        icon: meta.icon,
        primaryTransit: meta.primaryTransit,
        pathingModes: meta.pathingModes,
        soundscapeProfile: meta.soundscapeProfile,
        exemplar: null,
      };
    }
  }

  // 4. Default Terrestrial Fallback (Heartland Farmland)
  const meta = TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL];
  return {
    typology: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
    confidence: 0.6,
    localeId: 'default_terrestrial',
    name: meta.name,
    icon: meta.icon,
    primaryTransit: meta.primaryTransit,
    pathingModes: meta.pathingModes,
    soundscapeProfile: meta.soundscapeProfile,
    exemplar: null,
  };
}

export const classifySettlementTypology = classifyLocale;

/**
 * Resolves a locale by ID, matching either an exemplar locale or returning null.
 */
export function resolveExemplarLocale(id) {
  if (!id || typeof id !== 'string') return null;
  const key = id.toLowerCase().trim();
  return (
    EXEMPLAR_LOCALES[key] ||
    Object.values(EXEMPLAR_LOCALES).find(
      (loc) =>
        loc.id.toLowerCase() === key || loc.name.toLowerCase().includes(key),
    ) ||
    null
  );
}
