/**
 * Catalog of Global Living Cities, Sidewalk Offset Geometry & Kinematic Profiles.
 * (Living City Capability + Route Slice)
 *
 * Provides curated pedestrian corridors, park footways, coordinate centroids,
 * and pure geodetic sidewalk-projection vector math.
 */

import * as Cesium from 'cesium';

export const WALKER_SPEED_MIN_MS = 0.38;
export const WALKER_SPEED_MAX_MS = 0.58;
export const JOGGER_SPEED_MIN_MS = 0.85;
export const JOGGER_SPEED_MAX_MS = 1.15;

export const ALTITUDE_DEPTH_THRESHOLD_M = 1500;
export const ALTITUDE_EXIT_THRESHOLD_M = 2000;
export const SIMULATION_RADIUS_M = 1200;
export const CURB_DEFAULT_ELEV_M = 0.15;
export const SIDEWALK_DEFAULT_OFFSET_M = 4.5;

/**
 * Curated Global Living Cities Catalog with centroids, corridors, and viewpoints.
 */
export const LIVING_CITIES = {
  atlanta: {
    id: 'atlanta',
    name: 'Atlanta',
    country: 'USA',
    region: 'North America',
    lat: 33.7749,
    lon: -84.3725,
    elev: 305,
    defaultAlt: 28,
    headingDeg: 35,
    pitchDeg: -12,
    landmarks: [
      'Piedmont Park',
      'BeltLine Eastside Trail',
      'Peachtree St',
      'Ponce City Market',
      'Colony Square',
    ],
    corridors: [
      {
        id: 'piedmont_park_loop',
        name: 'Piedmont Park Meadow & Lake Stroll',
        type: 'park',
        waypoints: [
          { lat: 33.7825, lon: -84.3732, elev: 285 },
          { lat: 33.7845, lon: -84.3715, elev: 287 },
          { lat: 33.7868, lon: -84.3698, elev: 288 },
          { lat: 33.7885, lon: -84.3688, elev: 289 },
          { lat: 33.7892, lon: -84.3712, elev: 290 },
          { lat: 33.7871, lon: -84.3738, elev: 288 },
          { lat: 33.784, lon: -84.3752, elev: 286 },
          { lat: 33.7825, lon: -84.3732, elev: 285 },
        ],
      },
      {
        id: 'midtown_peachtree',
        name: 'Peachtree Street Midtown Promenade',
        type: 'street',
        roadWidthMeters: 14.0,
        waypoints: [
          { lat: 33.7725, lon: -84.3855, elev: 302 },
          { lat: 33.7758, lon: -84.3847, elev: 305 },
          { lat: 33.7792, lon: -84.384, elev: 307 },
          { lat: 33.7824, lon: -84.3835, elev: 309 },
          { lat: 33.7858, lon: -84.3831, elev: 310 },
        ],
      },
      {
        id: 'beltline_eastside',
        name: 'Eastside BeltLine Transit & Trail',
        type: 'sanctuary',
        waypoints: [
          { lat: 33.765, lon: -84.3638, elev: 294 },
          { lat: 33.7682, lon: -84.3619, elev: 295 },
          { lat: 33.7715, lon: -84.3622, elev: 296 },
          { lat: 33.7745, lon: -84.3635, elev: 297 },
          { lat: 33.7768, lon: -84.3644, elev: 298 },
        ],
      },
    ],
  },
  new_york: {
    id: 'new_york',
    name: 'New York',
    country: 'USA',
    region: 'North America',
    lat: 40.758,
    lon: -73.9855,
    elev: 15,
    defaultAlt: 25,
    headingDeg: 45,
    pitchDeg: -10,
    landmarks: [
      'Central Park',
      'Times Square',
      'Broadway',
      'Fifth Avenue',
      'Bryant Park',
    ],
    corridors: [
      {
        id: 'central_park_mall',
        name: 'Central Park Literary Walk & Mall',
        type: 'park',
        waypoints: [
          { lat: 40.7682, lon: -73.9725, elev: 22 },
          { lat: 40.7712, lon: -73.971, elev: 23 },
          { lat: 40.7738, lon: -73.9702, elev: 24 },
          { lat: 40.7765, lon: -73.9698, elev: 24 },
          { lat: 40.7788, lon: -73.9705, elev: 23 },
        ],
      },
      {
        id: 'broadway_times_sq',
        name: 'Broadway & 7th Ave Pedestrian Plazas',
        type: 'street',
        roadWidthMeters: 16.0,
        waypoints: [
          { lat: 40.7545, lon: -73.9875, elev: 14 },
          { lat: 40.7568, lon: -73.9862, elev: 15 },
          { lat: 40.759, lon: -73.985, elev: 16 },
          { lat: 40.7615, lon: -73.9838, elev: 17 },
        ],
      },
    ],
  },
  tokyo: {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    region: 'Asia',
    lat: 35.6595,
    lon: 139.7005,
    elev: 20,
    defaultAlt: 26,
    headingDeg: 0,
    pitchDeg: -14,
    landmarks: [
      'Shibuya Crossing',
      'Hachiko Plaza',
      'Miyashita Park',
      'Meiji Jingu',
      'Omotesando',
    ],
    corridors: [
      {
        id: 'shibuya_crossing_rush',
        name: 'Shibuya Scramble Crossing & Hachiko',
        type: 'sanctuary',
        waypoints: [
          { lat: 35.6591, lon: 139.7002, elev: 20 },
          { lat: 35.6595, lon: 139.7005, elev: 20 },
          { lat: 35.6598, lon: 139.7008, elev: 20 },
          { lat: 35.6602, lon: 139.7012, elev: 20 },
          { lat: 35.6596, lon: 139.7016, elev: 20 },
          { lat: 35.6591, lon: 139.7002, elev: 20 },
        ],
      },
      {
        id: 'meiji_jingu_path',
        name: 'Meiji Jingu Sacred Forest Walk',
        type: 'park',
        waypoints: [
          { lat: 35.6675, lon: 139.6995, elev: 28 },
          { lat: 35.671, lon: 139.6998, elev: 30 },
          { lat: 35.6745, lon: 139.7002, elev: 32 },
          { lat: 35.6765, lon: 139.6995, elev: 33 },
        ],
      },
    ],
  },
  london: {
    id: 'london',
    name: 'London',
    country: 'UK',
    region: 'Europe',
    lat: 51.5074,
    lon: -0.1278,
    elev: 12,
    defaultAlt: 24,
    headingDeg: 90,
    pitchDeg: -12,
    landmarks: [
      'South Bank',
      'Covent Garden',
      'Trafalgar Square',
      'Westminster',
      'Hyde Park',
    ],
    corridors: [
      {
        id: 'south_bank_walk',
        name: 'Queen’s Walk South Bank Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: 51.5035, lon: -0.1195, elev: 9 },
          { lat: 51.5058, lon: -0.1162, elev: 9 },
          { lat: 51.5078, lon: -0.112, elev: 9 },
          { lat: 51.509, lon: -0.1065, elev: 10 },
          { lat: 51.5085, lon: -0.0985, elev: 10 },
        ],
      },
    ],
  },
  paris: {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    region: 'Europe',
    lat: 48.8566,
    lon: 2.3522,
    elev: 35,
    defaultAlt: 25,
    headingDeg: 280,
    pitchDeg: -10,
    landmarks: [
      'Champs-Élysées',
      'Quais de Seine',
      'Jardin des Tuileries',
      'Le Marais',
      'Montmartre',
    ],
    corridors: [
      {
        id: 'seine_left_bank',
        name: 'Quais de Seine Riverside Walk',
        type: 'sanctuary',
        waypoints: [
          { lat: 48.8545, lon: 2.3485, elev: 32 },
          { lat: 48.8565, lon: 2.3425, elev: 32 },
          { lat: 48.8588, lon: 2.336, elev: 33 },
          { lat: 48.8612, lon: 2.328, elev: 33 },
        ],
      },
    ],
  },
  san_francisco: {
    id: 'san_francisco',
    name: 'San Francisco',
    country: 'USA',
    region: 'North America',
    lat: 37.7937,
    lon: -122.3965,
    elev: 6,
    defaultAlt: 28,
    headingDeg: 340,
    pitchDeg: -12,
    landmarks: [
      'The Embarcadero',
      'Ferry Building',
      'Market St',
      'Golden Gate Park',
      'Fisherman’s Wharf',
    ],
    corridors: [
      {
        id: 'embarcadero_promenade',
        name: 'Embarcadero Bayside Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: 37.7915, lon: -122.3905, elev: 4 },
          { lat: 37.7955, lon: -122.3938, elev: 4 },
          { lat: 37.8005, lon: -122.3985, elev: 5 },
          { lat: 37.8055, lon: -122.4042, elev: 5 },
        ],
      },
    ],
  },
  monaco: {
    id: 'monaco',
    name: 'Monaco',
    country: 'Monaco',
    region: 'Europe',
    lat: 43.7384,
    lon: 7.4246,
    elev: 18,
    defaultAlt: 30,
    headingDeg: 120,
    pitchDeg: -15,
    landmarks: [
      'Port Hercule',
      'Casino Square',
      'Fairmont Hairpin',
      'Larvotto Beach',
      'Prince’s Palace',
    ],
    corridors: [
      {
        id: 'port_hercule_quay',
        name: 'Port Hercule Quai des États-Unis Stroll',
        type: 'sanctuary',
        waypoints: [
          { lat: 43.7365, lon: 7.4215, elev: 6 },
          { lat: 43.7378, lon: 7.4245, elev: 6 },
          { lat: 43.7392, lon: 7.4278, elev: 7 },
          { lat: 43.741, lon: 7.4312, elev: 8 },
        ],
      },
    ],
  },
  singapore: {
    id: 'singapore',
    name: 'Singapore',
    country: 'Singapore',
    region: 'Asia',
    lat: 1.2868,
    lon: 103.8545,
    elev: 5,
    defaultAlt: 25,
    headingDeg: 210,
    pitchDeg: -12,
    landmarks: [
      'Marina Bay Promenade',
      'Supertree Grove',
      'Merlion Park',
      'Raffles Place',
      'Helix Bridge',
    ],
    corridors: [
      {
        id: 'marina_bay_loop',
        name: 'Marina Bay Waterfront Circuit',
        type: 'sanctuary',
        waypoints: [
          { lat: 1.2842, lon: 103.854, elev: 5 },
          { lat: 1.2865, lon: 103.8568, elev: 5 },
          { lat: 1.2895, lon: 103.8602, elev: 6 },
          { lat: 1.2872, lon: 103.8625, elev: 6 },
        ],
      },
    ],
  },
  chicago: {
    id: 'chicago',
    name: 'Chicago',
    country: 'USA',
    region: 'North America',
    lat: 41.8827,
    lon: -87.6233,
    elev: 180,
    defaultAlt: 28,
    headingDeg: 0,
    pitchDeg: -14,
    landmarks: [
      'Millennium Park',
      'The Bean (Cloud Gate)',
      'Michigan Ave',
      'Riverwalk',
      'Maggie Daley Park',
    ],
    corridors: [
      {
        id: 'millennium_park_walk',
        name: 'Millennium Park & Cloud Gate Stroll',
        type: 'park',
        waypoints: [
          { lat: 41.8805, lon: -87.6235, elev: 181 },
          { lat: 41.8826, lon: -87.6233, elev: 182 },
          { lat: 41.8845, lon: -87.6228, elev: 182 },
          { lat: 41.886, lon: -87.622, elev: 183 },
        ],
      },
    ],
  },
  sydney: {
    id: 'sydney',
    name: 'Sydney',
    country: 'Australia',
    region: 'Oceania',
    lat: -33.8568,
    lon: 151.2153,
    elev: 8,
    defaultAlt: 26,
    headingDeg: 190,
    pitchDeg: -12,
    landmarks: [
      'Sydney Opera House',
      'Circular Quay',
      'The Rocks',
      'Harbour Bridge Walk',
      'Royal Botanic Garden',
    ],
    corridors: [
      {
        id: 'opera_house_forecourt',
        name: 'Circular Quay to Opera House Boardwalk',
        type: 'sanctuary',
        waypoints: [
          { lat: -33.8615, lon: 151.2115, elev: 6 },
          { lat: -33.859, lon: 151.2135, elev: 7 },
          { lat: -33.8572, lon: 151.215, elev: 8 },
          { lat: -33.8558, lon: 151.2162, elev: 8 },
        ],
      },
    ],
  },
  los_angeles: {
    id: 'los_angeles',
    name: 'Los Angeles',
    country: 'USA',
    region: 'North America',
    lat: 34.0522,
    lon: -118.2437,
    elev: 88,
    defaultAlt: 28,
    headingDeg: 270,
    pitchDeg: -12,
    landmarks: [
      'Hollywood Blvd',
      'Griffith Park',
      'Old City Hall',
      'Chinatown',
      'Santa Monica Pier',
      'Walt Disney Concert Hall',
    ],
    corridors: [
      {
        id: 'hollywood_walk_of_fame',
        name: 'Hollywood Blvd Walk of Fame Promenade',
        type: 'street',
        roadWidthMeters: 16.0,
        waypoints: [
          { lat: 34.1015, lon: -118.3267, elev: 115 },
          { lat: 34.1016, lon: -118.331, elev: 116 },
          { lat: 34.1016, lon: -118.3358, elev: 117 },
          { lat: 34.1017, lon: -118.3402, elev: 118 },
        ],
      },
      {
        id: 'griffith_observatory_terrace',
        name: 'Griffith Park & Observatory Lawn',
        type: 'park',
        waypoints: [
          { lat: 34.1184, lon: -118.3004, elev: 346 },
          { lat: 34.1191, lon: -118.3004, elev: 347 },
          { lat: 34.1198, lon: -118.2998, elev: 348 },
        ],
      },
    ],
  },
  chongqing: {
    id: 'chongqing',
    name: 'Chongqing',
    country: 'China',
    region: 'Asia',
    lat: 29.563,
    lon: 106.5516,
    elev: 245,
    defaultAlt: 32,
    headingDeg: 45,
    pitchDeg: -14,
    landmarks: [
      'Jiefangbei Pedestrian Street',
      'Hongyadong Cliffside Stilted Complex',
      'Raffles City Chaotianmen Confluence',
      'Liziba Monorail Through-Building Station',
    ],
    corridors: [
      {
        id: 'jiefangbei_hongyadong_walk',
        name: 'Jiefangbei to Hongyadong Cliffside Promenade',
        type: 'street',
        roadWidthMeters: 16.0,
        waypoints: [
          { lat: 29.5572, lon: 106.577, elev: 258 },
          { lat: 29.5594, lon: 106.5781, elev: 252 },
          { lat: 29.5612, lon: 106.579, elev: 242 },
          { lat: 29.5625, lon: 106.5796, elev: 225 },
        ],
      },
    ],
  },
  jakarta: {
    id: 'jakarta',
    name: 'Jakarta',
    country: 'Indonesia',
    region: 'Asia',
    lat: -6.1754,
    lon: 106.8272,
    elev: 8,
    defaultAlt: 28,
    headingDeg: 0,
    pitchDeg: -12,
    landmarks: [
      'Monas National Monument & Merdeka Square',
      'Kota Tua Batavia Fatahillah Square',
      'Bundaran HI & Jalan Thamrin',
      'Sunda Kelapa Historic Schooner Harbor',
    ],
    corridors: [
      {
        id: 'merdeka_thamrin_promenade',
        name: 'Merdeka Square & Jalan M.H. Thamrin Walk',
        type: 'park',
        waypoints: [
          { lat: -6.1754, lon: 106.8272, elev: 8 },
          { lat: -6.1815, lon: 106.8245, elev: 8 },
          { lat: -6.1885, lon: 106.8234, elev: 8 },
          { lat: -6.195, lon: 106.823, elev: 9 },
        ],
      },
    ],
  },
  hong_kong: {
    id: 'hong_kong',
    name: 'Hong Kong',
    country: 'China (SAR)',
    region: 'Asia',
    lat: 22.2933,
    lon: 114.1694,
    elev: 12,
    defaultAlt: 30,
    headingDeg: 185,
    pitchDeg: -12,
    landmarks: [
      'Tsim Sha Tsui Victoria Harbour Promenade',
      'Central & Two IFC Skyline Corridor',
      'Victoria Peak Sky Terrace 428',
      'Temple Street & Mong Kok Neon Quarter',
    ],
    corridors: [
      {
        id: 'tsim_sha_tsui_waterfront',
        name: 'Tsim Sha Tsui Avenue of Stars Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: 22.2936, lon: 114.1695, elev: 6 },
          { lat: 22.2932, lon: 114.1725, elev: 6 },
          { lat: 22.2933, lon: 114.1752, elev: 6 },
          { lat: 22.2945, lon: 114.1781, elev: 7 },
        ],
      },
    ],
  },
  shanghai: {
    id: 'shanghai',
    name: 'Shanghai',
    country: 'China',
    region: 'Asia',
    lat: 31.2397,
    lon: 121.4903,
    elev: 6,
    defaultAlt: 28,
    headingDeg: 95,
    pitchDeg: -12,
    landmarks: [
      'The Bund Waterfront Promenade',
      'Lujiazui Skyline & Shanghai Tower',
      'Nanjing Road East Pedestrian Mall',
      'Yu Garden & Old Town Bazaar',
    ],
    corridors: [
      {
        id: 'the_bund_waterfront',
        name: 'The Bund Huangpu River Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: 31.2345, lon: 121.4904, elev: 6 },
          { lat: 31.2378, lon: 121.4903, elev: 6 },
          { lat: 31.2408, lon: 121.4902, elev: 6 },
          { lat: 31.244, lon: 121.4895, elev: 6 },
        ],
      },
    ],
  },
  beijing: {
    id: 'beijing',
    name: 'Beijing',
    country: 'China',
    region: 'Asia',
    lat: 39.9163,
    lon: 116.3972,
    elev: 44,
    defaultAlt: 28,
    headingDeg: 0,
    pitchDeg: -12,
    landmarks: [
      'Forbidden City Meridian Gate & Jingshan',
      'Tiananmen Square Central Axis',
      'Temple of Heaven Cypress Park',
      'Wangfujing Pedestrian Avenue',
    ],
    corridors: [
      {
        id: 'wangfujing_promenade',
        name: 'Wangfujing Historic Pedestrian Street',
        type: 'street',
        roadWidthMeters: 18.0,
        waypoints: [
          { lat: 39.9098, lon: 116.4108, elev: 44 },
          { lat: 39.9125, lon: 116.4109, elev: 44 },
          { lat: 39.9154, lon: 116.411, elev: 45 },
          { lat: 39.9182, lon: 116.411, elev: 45 },
        ],
      },
    ],
  },
  shenzhen: {
    id: 'shenzhen',
    name: 'Shenzhen',
    country: 'China',
    region: 'Asia',
    lat: 22.5333,
    lon: 114.0553,
    elev: 15,
    defaultAlt: 28,
    headingDeg: 180,
    pitchDeg: -12,
    landmarks: [
      'Ping An Finance Centre & Futian CBD',
      'Lianhuashan Park Civic Axis',
      'Shenzhen Bay Waterfront Park',
      'OCT Loft Creative District',
    ],
    corridors: [
      {
        id: 'futian_civic_axis',
        name: 'Futian Civic Center to Lianhuashan Axis',
        type: 'park',
        waypoints: [
          { lat: 22.5431, lon: 114.0579, elev: 15 },
          { lat: 22.5465, lon: 114.0579, elev: 16 },
          { lat: 22.5498, lon: 114.0578, elev: 20 },
          { lat: 22.5535, lon: 114.0577, elev: 32 },
        ],
      },
    ],
  },
  delhi: {
    id: 'delhi',
    name: 'Delhi',
    country: 'India',
    region: 'Asia',
    lat: 28.6129,
    lon: 77.2295,
    elev: 216,
    defaultAlt: 28,
    headingDeg: 270,
    pitchDeg: -12,
    landmarks: [
      'India Gate & Kartavya Path',
      'Red Fort (Lal Qila) & Chandni Chowk',
      'Connaught Place Georgian Colonnade',
      'Humayun Tomb Gardens',
    ],
    corridors: [
      {
        id: 'kartavya_path_promenade',
        name: 'Kartavya Path Ceremonial Boulevard',
        type: 'park',
        waypoints: [
          { lat: 28.6129, lon: 77.2295, elev: 216 },
          { lat: 28.6132, lon: 77.224, elev: 217 },
          { lat: 28.6135, lon: 77.2185, elev: 218 },
          { lat: 28.6138, lon: 77.213, elev: 219 },
        ],
      },
    ],
  },
  mumbai: {
    id: 'mumbai',
    name: 'Mumbai',
    country: 'India',
    region: 'Asia',
    lat: 18.922,
    lon: 72.8347,
    elev: 11,
    defaultAlt: 26,
    headingDeg: 320,
    pitchDeg: -12,
    landmarks: [
      'Gateway of India & Apollo Bunder',
      'Marine Drive Queen Necklace Promenade',
      'Chhatrapati Shivaji Maharaj Terminus',
      'Kala Ghoda Heritage Art Precinct',
    ],
    corridors: [
      {
        id: 'marine_drive_promenade',
        name: 'Marine Drive Coastal Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: 18.9265, lon: 72.8229, elev: 8 },
          { lat: 18.9328, lon: 72.8235, elev: 8 },
          { lat: 18.9392, lon: 72.8238, elev: 9 },
          { lat: 18.944, lon: 72.8231, elev: 9 },
        ],
      },
    ],
  },
  seoul: {
    id: 'seoul',
    name: 'Seoul',
    country: 'South Korea',
    region: 'Asia',
    lat: 37.5759,
    lon: 126.9768,
    elev: 38,
    defaultAlt: 26,
    headingDeg: 0,
    pitchDeg: -12,
    landmarks: [
      'Gyeongbokgung Palace & Gwanghwamun',
      'Cheonggyecheon Stream Walk',
      'N Seoul Tower & Namsan Ridge',
      'Myeongdong & Bukchon Hanok Lanes',
    ],
    corridors: [
      {
        id: 'gwanghwamun_cheonggye',
        name: 'Gwanghwamun Plaza to Cheonggyecheon Stream',
        type: 'sanctuary',
        waypoints: [
          { lat: 37.5759, lon: 126.9768, elev: 38 },
          { lat: 37.5729, lon: 126.9769, elev: 36 },
          { lat: 37.5692, lon: 126.9773, elev: 34 },
          { lat: 37.5691, lon: 126.9825, elev: 33 },
        ],
      },
    ],
  },
  dhaka: {
    id: 'dhaka',
    name: 'Dhaka',
    country: 'Bangladesh',
    region: 'Asia',
    lat: 23.7189,
    lon: 90.3882,
    elev: 9,
    defaultAlt: 26,
    headingDeg: 135,
    pitchDeg: -12,
    landmarks: [
      'Lalbagh Fort Mughal Gardens',
      'National Parliament (Jatiya Sangsad Bhaban)',
      'Ahsan Manzil & Buriganga Riverfront',
      'Hatirjheel Lakeside Promenade',
    ],
    corridors: [
      {
        id: 'parliament_crescent_walk',
        name: 'Jatiya Sangsad Crescent Lake Promenade',
        type: 'park',
        waypoints: [
          { lat: 23.7623, lon: 90.3785, elev: 10 },
          { lat: 23.7642, lon: 90.3792, elev: 10 },
          { lat: 23.7658, lon: 90.3806, elev: 10 },
          { lat: 23.7646, lon: 90.3822, elev: 10 },
        ],
      },
    ],
  },
  mexico_city: {
    id: 'mexico_city',
    name: 'Ciudad de México',
    country: 'Mexico',
    region: 'North America',
    lat: 19.4326,
    lon: -99.1332,
    elev: 2240,
    defaultAlt: 28,
    headingDeg: 265,
    pitchDeg: -12,
    landmarks: [
      'Zócalo (Plaza de la Constitución)',
      'Palacio de Bellas Artes & Alameda Central',
      'El Ángel de la Independencia & Reforma',
      'Bosque de Chapultepec & Castillo',
    ],
    corridors: [
      {
        id: 'madero_reforma_corridor',
        name: 'Calle Madero & Alameda Central Promenade',
        type: 'street',
        roadWidthMeters: 16.0,
        waypoints: [
          { lat: 19.4328, lon: -99.1342, elev: 2240 },
          { lat: 19.4337, lon: -99.1375, elev: 2240 },
          { lat: 19.4348, lon: -99.1408, elev: 2240 },
          { lat: 19.4357, lon: -99.1438, elev: 2240 },
        ],
      },
    ],
  },
  sao_paulo: {
    id: 'sao_paulo',
    name: 'São Paulo',
    country: 'Brazil',
    region: 'South America',
    lat: -23.5614,
    lon: -46.6559,
    elev: 760,
    defaultAlt: 28,
    headingDeg: 315,
    pitchDeg: -12,
    landmarks: [
      'Avenida Paulista & MASP',
      'Parque Ibirapuera Marquise',
      'Pátio do Colégio & Catedral da Sé',
      'Mercado Municipal & Vale do Anhangabaú',
    ],
    corridors: [
      {
        id: 'paulista_cultural_boulevard',
        name: 'Avenida Paulista Open Cultural Boulevard',
        type: 'street',
        roadWidthMeters: 22.0,
        waypoints: [
          { lat: -23.565, lon: -46.652, elev: 810 },
          { lat: -23.5632, lon: -46.654, elev: 812 },
          { lat: -23.5614, lon: -46.6559, elev: 815 },
          { lat: -23.559, lon: -46.6584, elev: 812 },
        ],
      },
    ],
  },
  buenos_aires: {
    id: 'buenos_aires',
    name: 'Buenos Aires',
    country: 'Argentina',
    region: 'South America',
    lat: -34.6037,
    lon: -58.3816,
    elev: 25,
    defaultAlt: 26,
    headingDeg: 90,
    pitchDeg: -12,
    landmarks: [
      'El Obelisco & Avenida 9 de Julio',
      'Plaza de Mayo & Casa Rosada',
      'Puerto Madero & Puente de la Mujer',
      'Teatro Colón & Plaza Lavalle',
    ],
    corridors: [
      {
        id: 'puerto_madero_docks',
        name: 'Puerto Madero Dique 3 Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: -34.6062, lon: -58.3653, elev: 10 },
          { lat: -34.608, lon: -58.3649, elev: 10 },
          { lat: -34.6101, lon: -58.3646, elev: 10 },
          { lat: -34.6122, lon: -58.3644, elev: 10 },
        ],
      },
    ],
  },
  cairo: {
    id: 'cairo',
    name: 'Cairo',
    country: 'Egypt',
    region: 'Africa',
    lat: 30.0444,
    lon: 31.2357,
    elev: 23,
    defaultAlt: 28,
    headingDeg: 220,
    pitchDeg: -12,
    landmarks: [
      'Tahrir Square & Nile Corniche',
      'Khan el-Khalili & Al-Muizz Street',
      'Saladin Citadel & Mosque of Muhammad Ali',
      'Giza Plateau Great Sphinx Overlook',
    ],
    corridors: [
      {
        id: 'al_muizz_historic_walk',
        name: 'Al-Muizz Historic Stone Corridor',
        type: 'street',
        roadWidthMeters: 12.0,
        waypoints: [
          { lat: 30.0525, lon: 31.2625, elev: 28 },
          { lat: 30.0504, lon: 31.2618, elev: 28 },
          { lat: 30.0484, lon: 31.2612, elev: 27 },
          { lat: 30.0468, lon: 31.2608, elev: 27 },
        ],
      },
    ],
  },
  lagos: {
    id: 'lagos',
    name: 'Lagos',
    country: 'Nigeria',
    region: 'Africa',
    lat: 6.4474,
    lon: 3.4126,
    elev: 6,
    defaultAlt: 26,
    headingDeg: 110,
    pitchDeg: -12,
    landmarks: [
      'Tafawa Balewa Square & Marina',
      'Lekki-Ikoyi Link Bridge Waterfront',
      'National Arts Theatre Iganmu',
      'Victoria Island Bar Beach Kuramo Waters',
    ],
    corridors: [
      {
        id: 'ikoyi_lagoon_promenade',
        name: 'Lekki-Ikoyi Lagoon & Marina Walk',
        type: 'sanctuary',
        waypoints: [
          { lat: 6.4455, lon: 3.469, elev: 6 },
          { lat: 6.4475, lon: 3.4712, elev: 7 },
          { lat: 6.4495, lon: 3.4738, elev: 8 },
          { lat: 6.4512, lon: 3.476, elev: 6 },
        ],
      },
    ],
  },
  istanbul: {
    id: 'istanbul',
    name: 'Istanbul',
    country: 'Turkey',
    region: 'Europe',
    lat: 41.0082,
    lon: 28.9784,
    elev: 35,
    defaultAlt: 28,
    headingDeg: 45,
    pitchDeg: -12,
    landmarks: [
      'Hagia Sophia & Sultanahmet Square',
      'Galata Tower & Karaköy Ferry Pier',
      'Grand Bazaar & Eminönü Spice Quay',
      'Ortaköy Bosphorus Mosque Terrace',
    ],
    corridors: [
      {
        id: 'sultanahmet_divanyolu_walk',
        name: 'Sultanahmet Hippodrome to Hagia Sophia Walk',
        type: 'sanctuary',
        waypoints: [
          { lat: 41.0054, lon: 28.9768, elev: 36 },
          { lat: 41.0068, lon: 28.9776, elev: 36 },
          { lat: 41.008, lon: 28.979, elev: 37 },
          { lat: 41.0092, lon: 28.9806, elev: 36 },
        ],
      },
    ],
  },
  melbourne: {
    id: 'melbourne',
    name: 'Melbourne',
    country: 'Australia',
    region: 'Oceania',
    lat: -37.8179,
    lon: 144.969,
    elev: 14,
    defaultAlt: 26,
    headingDeg: 250,
    pitchDeg: -12,
    landmarks: [
      'Federation Square & Flinders Street Station',
      'Southbank Yarra River Promenade',
      'Hosier Lane & Bourke Street Mall',
      'Royal Botanic Gardens & Shrine of Remembrance',
    ],
    corridors: [
      {
        id: 'yarra_southbank_walk',
        name: 'Southbank Yarra Riverfront Promenade',
        type: 'sanctuary',
        waypoints: [
          { lat: -37.8195, lon: 144.9685, elev: 8 },
          { lat: -37.8202, lon: 144.9652, elev: 8 },
          { lat: -37.8211, lon: 144.962, elev: 8 },
          { lat: -37.822, lon: 144.9588, elev: 8 },
        ],
      },
    ],
  },
  mcmurdo_station: {
    id: 'mcmurdo_station',
    name: 'McMurdo Station',
    country: 'Antarctica',
    region: 'Antarctica',
    lat: -77.8419,
    lon: 166.6863,
    elev: 18,
    defaultAlt: 34,
    headingDeg: 195,
    pitchDeg: -14,
    landmarks: [
      'Observation Hill & Vince Cross',
      'Scott Historic Discovery Hut (Hut Point)',
      'Crary Science & Engineering Center',
      'McMurdo Sound Ice Pier Overlook',
    ],
    corridors: [
      {
        id: 'hut_point_obs_hill_trail',
        name: 'Hut Point to Observation Hill Science Loop',
        type: 'sanctuary',
        waypoints: [
          { lat: -77.8462, lon: 166.6625, elev: 8 },
          { lat: -77.8442, lon: 166.673, elev: 14 },
          { lat: -77.8425, lon: 166.6845, elev: 20 },
          { lat: -77.8495, lon: 166.691, elev: 45 },
        ],
      },
    ],
  },
  key_largo: {
    id: 'key_largo',
    name: 'Key Largo',
    country: 'USA',
    region: 'North America',
    lat: 25.089,
    lon: -80.449,
    elev: 2,
    defaultAlt: 22,
    headingDeg: 38,
    pitchDeg: -12,
    landmarks: [
      'Key Loaner House (MM 99 Bayside Pier)',
      'Caribbean Club & Bayside Sunset Dock',
      'Key Largo Fisheries Backyard Marina',
      'John Pennekamp Coral Reef State Park',
      'African Queen Canal & Key Largo Marina',
      "Rowell's Waterfront Park",
    ],
    corridors: [
      {
        id: 'key_largo_overseas_bayside',
        name: 'Overseas Hwy & MM 99 Bayside Stroll',
        type: 'street',
        roadWidthMeters: 12.0,
        waypoints: [
          { lat: 25.0868, lon: -80.4488, elev: 2 },
          { lat: 25.089, lon: -80.449, elev: 2 },
          { lat: 25.0915, lon: -80.4422, elev: 2 },
          { lat: 25.0985, lon: -80.436, elev: 2 },
          { lat: 25.1065, lon: -80.4295, elev: 2 },
        ],
      },
      {
        id: 'key_largo_pennekamp_bay',
        name: 'John Pennekamp Mangrove & Reef Boardwalk',
        type: 'park',
        waypoints: [
          { lat: 25.1255, lon: -80.4095, elev: 2 },
          { lat: 25.1268, lon: -80.4072, elev: 2 },
          { lat: 25.1282, lon: -80.4055, elev: 2 },
          { lat: 25.1296, lon: -80.4078, elev: 2 },
        ],
      },
    ],
  },
};

/**
 * Calculates Great-Circle distance in meters between two lat/lon coordinates (WGS84).
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
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
 * Calculates initial bearing / heading in degrees (0-360) from point 1 to point 2.
 */
export function calculateHeadingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Pure geodetic vector calculation: projects a point laterally onto the sidewalk
 * from a road centerline segment (P1 -> P2), offset by lateral meters and curb height.
 *
 * Vector formula:
 *   v = P2 - P1 (segment direction)
 *   u = geodetic surface normal at P1
 *   r = (v x u) / ||v x u|| (perpendicular right-hand vector)
 *   P_sidewalk = P1 + offsetMeters * r + curbElevMeters * u
 *
 * @param {Object} p1 - { lat, lon, elev }
 * @param {Object} p2 - { lat, lon, elev }
 * @param {number} offsetMeters - Lateral distance from road center (positive = right side, negative = left side)
 * @param {number} curbElevMeters - Height of curb above road mesh (default 0.15m)
 * @returns {Cesium.Cartesian3} WGS84 Cartesian position of the sidewalk point
 */
export function calculateSidewalkOffset(
  p1,
  p2,
  offsetMeters = SIDEWALK_DEFAULT_OFFSET_M,
  curbElevMeters = CURB_DEFAULT_ELEV_M,
) {
  const c1 = Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.elev || 0);
  const c2 = Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.elev || 0);

  // Segment forward direction
  const v = Cesium.Cartesian3.subtract(c2, c1, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(v) < 1e-6) {
    return Cesium.Cartesian3.fromDegrees(
      p1.lon,
      p1.lat,
      (p1.elev || 0) + curbElevMeters,
    );
  }

  // Geodetic surface normal at p1
  const u = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    c1,
    new Cesium.Cartesian3(),
  );

  // Perpendicular right-hand vector: r = normalize(v x u)
  const r = Cesium.Cartesian3.cross(v, u, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(r, r);

  // Sidewalk point: c1 + offsetMeters * r + curbElevMeters * u
  const scaledR = Cesium.Cartesian3.multiplyByScalar(
    r,
    offsetMeters,
    new Cesium.Cartesian3(),
  );
  const scaledU = Cesium.Cartesian3.multiplyByScalar(
    u,
    curbElevMeters,
    new Cesium.Cartesian3(),
  );

  const sidewalk = Cesium.Cartesian3.add(c1, scaledR, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(sidewalk, scaledU, sidewalk);
  return sidewalk;
}

/**
 * Finds the nearest living city in the catalog to a given lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @param {number} maxDistanceMeters - Maximum radius to match (default 35,000m / 35km)
 * @returns {Object|null} Matching city object or null
 */
export function findNearestCity(lat, lon, maxDistanceMeters = 35000) {
  let closest = null;
  let minDistance = Infinity;

  for (const city of Object.values(LIVING_CITIES)) {
    const dist = haversineDistanceMeters(lat, lon, city.lat, city.lon);
    if (dist < minDistance && dist <= maxDistanceMeters) {
      minDistance = dist;
      closest = { ...city, distanceMeters: dist };
    }
  }
  return closest;
}

export const CITY_QUERY_ALIASES = Object.freeze({
  la: 'los_angeles',
  'l.a.': 'los_angeles',
  hollywood: 'los_angeles',
  nyc: 'new_york',
  'new york city': 'new_york',
  sf: 'san_francisco',
  'cuidad de mexico': 'mexico_city',
  'ciudad de mexico': 'mexico_city',
  cdmx: 'mexico_city',
  'mexico city': 'mexico_city',
  mexico_city: 'mexico_city',
  df: 'mexico_city',
  hk: 'hong_kong',
  'hong kong': 'hong_kong',
  hong_kong: 'hong_kong',
  kowloon: 'hong_kong',
  'sao paulo': 'sao_paulo',
  sao_paulo: 'sao_paulo',
  'new delhi': 'delhi',
  new_delhi: 'delhi',
  delhi: 'delhi',
  'buenos aires': 'buenos_aires',
  buenos_aires: 'buenos_aires',
  mcmurdo: 'mcmurdo_station',
  antarctica: 'mcmurdo_station',
  mcmurdo_station: 'mcmurdo_station',
  'mcmurdo station': 'mcmurdo_station',
  'key largo': 'key_largo',
  key_largo: 'key_largo',
  'key loaner': 'key_largo',
  'key loaner house': 'key_largo',
  'florida keys': 'key_largo',
});

function normalizeCityQuery(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Resolves a city by ID or fuzzy text search.
 */
export function resolveCity(query) {
  if (!query) return LIVING_CITIES.atlanta;
  if (typeof query === 'object' && query.id && LIVING_CITIES[query.id]) {
    return LIVING_CITIES[query.id];
  }
  const clean = normalizeCityQuery(query);
  const underscoreClean = clean.replace(/[\s-]+/g, '_');
  const spaceClean = clean.replace(/[_-]+/g, ' ');

  const aliasedId =
    CITY_QUERY_ALIASES[clean] ||
    CITY_QUERY_ALIASES[underscoreClean] ||
    CITY_QUERY_ALIASES[spaceClean];
  if (aliasedId && LIVING_CITIES[aliasedId]) {
    return LIVING_CITIES[aliasedId];
  }

  if (LIVING_CITIES[clean]) return LIVING_CITIES[clean];
  if (LIVING_CITIES[underscoreClean]) return LIVING_CITIES[underscoreClean];

  for (const [id, city] of Object.entries(LIVING_CITIES)) {
    const normName = normalizeCityQuery(city.name);
    if (
      id.includes(underscoreClean) ||
      normName.includes(spaceClean) ||
      spaceClean.includes(normName)
    ) {
      return city;
    }
  }
  return LIVING_CITIES.atlanta;
}
