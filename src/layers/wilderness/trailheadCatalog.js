/**
 * Wilderness Ranger & Trailhead Explorer Catalog.
 * (National Parks, Topo Hiking, Backcountry Campsites & Wildlife Tracking on GEV)
 *
 * Implements:
 * - Curated National Parks & Premier Wilderness Trailheads across iconic North American biomes:
 *   1. Yosemite Half Dome & Mist Trail (Sierra Nevada Granite)
 *   2. Great Smoky Mountains Alum Cave to Mt. LeConte (Appalachian Forest)
 *   3. Zion Angels Landing & West Rim (Red Rock Canyon)
 *   4. Grand Canyon Bright Angel Rim-to-River (Desert Canyon Gorge)
 *   5. Mount Rainier Skyline Trail at Paradise (Volcanic Glacial)
 *   6. Shenandoah Old Rag Mountain Rock Scramble (Blue Ridge Monadnock)
 *   7. Olympic Hoh River Rainforest to Blue Glacier (Temperate Rainforest)
 *   8. Rocky Mountain Bear Lake to Emerald Lake & Tyndall Gorge (Continental Divide)
 * - Metadata: SAC hiking scale (T1 Hiking, T2 Mountain Hiking, T3 Alpine Hiking),
 *   elevation profiles (m), trail lengths, scenic waypoints, authorized backcountry bivouac campsites,
 *   and native wildlife fauna associations.
 * - Distance math and spatial queries for nearby trailhead discovery.
 */

export const BIOME_TYPES = Object.freeze({
  SIERRA_GRANITE: 'SIERRA_GRANITE',
  APPALACHIAN_FOREST: 'APPALACHIAN_FOREST',
  RED_ROCK_CANYON: 'RED_ROCK_CANYON',
  DESERT_GORGE: 'DESERT_GORGE',
  VOLCANIC_GLACIAL: 'VOLCANIC_GLACIAL',
  BLUE_RIDGE_MONADNOCK: 'BLUE_RIDGE_MONADNOCK',
  TEMPERATE_RAINFOREST: 'TEMPERATE_RAINFOREST',
  CONTINENTAL_DIVIDE: 'CONTINENTAL_DIVIDE',
});

export const BIOME_META = Object.freeze({
  SIERRA_GRANITE: {
    // i18n-ignore: domain biome label
    label: 'Sierra Nevada Granite',
    icon: '🏔️',
    colorHex: '#38bdf8',
    soundProfile: 'alpine_breeze',
  },
  APPALACHIAN_FOREST: {
    // i18n-ignore: domain biome label
    label: 'Appalachian Spruce-Fir',
    icon: '🌳',
    colorHex: '#10b981',
    soundProfile: 'mountain_forest',
  },
  RED_ROCK_CANYON: {
    // i18n-ignore: domain biome label
    label: 'Navajo Sandstone Canyon',
    icon: '🏜️',
    colorHex: '#f97316',
    soundProfile: 'canyon_echo',
  },
  DESERT_GORGE: {
    // i18n-ignore: domain biome label
    label: 'Desert Canyon Gorge',
    icon: '🏜️',
    colorHex: '#ea580c',
    soundProfile: 'canyon_wind',
  },
  VOLCANIC_GLACIAL: {
    // i18n-ignore: domain biome label
    label: 'Volcanic Glacial Subalpine',
    icon: '❄️',
    colorHex: '#06b6d4',
    soundProfile: 'glacial_wind',
  },
  BLUE_RIDGE_MONADNOCK: {
    // i18n-ignore: domain biome label
    label: 'Blue Ridge Wilderness',
    icon: '⛰️',
    colorHex: '#6366f1',
    soundProfile: 'ridge_winds',
  },
  TEMPERATE_RAINFOREST: {
    // i18n-ignore: domain biome label
    label: 'Coastal Temperate Rainforest',
    icon: '🌲',
    colorHex: '#059669',
    soundProfile: 'rainforest_canopy',
  },
  CONTINENTAL_DIVIDE: {
    // i18n-ignore: domain biome label
    label: 'Continental Divide Cirque',
    icon: '🏔️',
    colorHex: '#8b5cf6',
    soundProfile: 'tundra_winds',
  },
});

export const TRAIL_DIFFICULTIES = Object.freeze({
  HIKING: {
    id: 'HIKING',
    // i18n-ignore: domain difficulty label
    label: 'Easy / Moderate Trail',
    sacScale: 'T1',
    badge: 'T1 HIKING',
    colorHex: '#22c55e',
  },
  MOUNTAIN_HIKING: {
    id: 'MOUNTAIN_HIKING',
    // i18n-ignore: domain difficulty label
    label: 'Mountain Hiking',
    sacScale: 'T2',
    badge: 'T2 MOUNTAIN',
    colorHex: '#f59e0b',
  },
  ALPINE_HIKING: {
    id: 'ALPINE_HIKING',
    // i18n-ignore: domain difficulty label
    label: 'Demanding Alpine Trail',
    sacScale: 'T3',
    badge: 'T3 ALPINE',
    colorHex: '#ef4444',
  },
});

export const WILDERNESS_TRAILHEADS = Object.freeze([
  {
    id: 'yosemite_half_dome',
    name: 'Half Dome & Mist Trail',
    park: 'Yosemite National Park',
    state: 'California',
    biome: BIOME_TYPES.SIERRA_GRANITE,
    coordinates: {
      lat: 37.7346,
      lon: -119.5663,
      elevM: 1220,
    },
    summitCoordinates: {
      lat: 37.7456,
      lon: -119.5332,
      elevM: 2694,
    },
    trailLengthKm: 22.8, // ~14.2 miles
    elevationGainM: 1474,
    difficulty: 'ALPINE_HIKING',
    scenicHighlights: [
      'Vernal Fall footbridge spray',
      'Nevada Fall brink overlook',
      'Little Yosemite Valley sugar pine flats',
      'Subdome granite steps',
      'Iconic cables route to Half Dome visor',
    ],
    faunaTypes: ['mule_deer', 'black_bear', 'golden_eagle', 'marmot'],
    waypoints: [
      {
        name: 'Happy Isles Trailhead',
        lat: 37.7326,
        lon: -119.5592,
        elevM: 1220,
      },
      {
        name: 'Vernal Fall Footbridge',
        lat: 37.7289,
        lon: -119.5492,
        elevM: 1390,
      },
      { name: 'Top of Vernal Fall', lat: 37.7275, lon: -119.5438, elevM: 1530 },
      { name: 'Nevada Fall Crest', lat: 37.7251, lon: -119.5327, elevM: 1810 },
      {
        name: 'Little Yosemite Valley Ranger Camp',
        lat: 37.7314,
        lon: -119.5168,
        elevM: 1875,
      },
      { name: 'Subdome Base', lat: 37.7422, lon: -119.5358, elevM: 2470 },
      {
        name: 'Half Dome Summit Visor',
        lat: 37.7456,
        lon: -119.5332,
        elevM: 2694,
      },
    ],
    campsites: [
      {
        id: 'lyv_backcountry',
        name: 'Little Yosemite Valley Bivouac',
        lat: 37.7314,
        lon: -119.5168,
        elevM: 1875,
        firePermitted: true,
        stargazingRating: 5,
      },
    ],
  },
  {
    id: 'smokies_alum_cave',
    name: 'Alum Cave to Mt. LeConte',
    park: 'Great Smoky Mountains National Park',
    state: 'Tennessee / North Carolina',
    biome: BIOME_TYPES.APPALACHIAN_FOREST,
    coordinates: {
      lat: 35.6295,
      lon: -83.4513,
      elevM: 1180,
    },
    summitCoordinates: {
      lat: 35.6542,
      lon: -83.4367,
      elevM: 1980,
    },
    trailLengthKm: 17.7, // ~11.0 miles
    elevationGainM: 800,
    difficulty: 'MOUNTAIN_HIKING',
    scenicHighlights: [
      'Arch Rock natural limestone tunnel',
      'Alum Cave Bluffs massive concave overhang',
      'Inspiration Point panoramic valley vista',
      'Cliff Top & Myrtle Point sunrise overlooks',
      'Historic Mount LeConte Lodge & rustic cabins',
    ],
    faunaTypes: [
      'black_bear',
      'white_tailed_deer',
      'salamanders',
      'peregrine_falcon',
    ],
    waypoints: [
      { name: 'Alum Cave Trailhead', lat: 35.6295, lon: -83.4513, elevM: 1180 },
      { name: 'Arch Rock Tunnel', lat: 35.6358, lon: -83.4475, elevM: 1320 },
      { name: 'Inspiration Point', lat: 35.6421, lon: -83.4442, elevM: 1490 },
      { name: 'Alum Cave Bluffs', lat: 35.6443, lon: -83.4426, elevM: 1530 },
      { name: 'Gracie’s Pulpit', lat: 35.6491, lon: -83.4398, elevM: 1770 },
      { name: 'Cliff Top Overlook', lat: 35.6531, lon: -83.4385, elevM: 1960 },
      {
        name: 'High Top Summit / LeConte Shelter',
        lat: 35.6542,
        lon: -83.4367,
        elevM: 1980,
      },
    ],
    campsites: [
      {
        id: 'leconte_shelter',
        name: 'Mount LeConte Wilderness Bivouac',
        lat: 35.6542,
        lon: -83.4367,
        elevM: 1980,
        firePermitted: false,
        stargazingRating: 4.8,
      },
    ],
  },
  {
    id: 'zion_angels_landing',
    name: 'Angels Landing & West Rim',
    park: 'Zion National Park',
    state: 'Utah',
    biome: BIOME_TYPES.RED_ROCK_CANYON,
    coordinates: {
      lat: 37.2591,
      lon: -112.9515,
      elevM: 1300,
    },
    summitCoordinates: {
      lat: 37.2692,
      lon: -112.9475,
      elevM: 1765,
    },
    trailLengthKm: 8.7, // ~5.4 miles
    elevationGainM: 465,
    difficulty: 'ALPINE_HIKING',
    scenicHighlights: [
      'Virgin River footbridge and canyon canyon floor',
      'Refrigerator Canyon shaded sandstone slot',
      'Walters Wiggles 21 paved zigzag switchbacks',
      'Scouts Lookout windswept pass',
      'Knife-edge spine with heavy safety chains over 1,400ft vertical drop',
    ],
    faunaTypes: [
      'bighorn_sheep',
      'peregrine_falcon',
      'ringtail_cat',
      'mule_deer',
    ],
    waypoints: [
      { name: 'Grotto Trailhead', lat: 37.2591, lon: -112.9515, elevM: 1300 },
      {
        name: 'Refrigerator Canyon Entrance',
        lat: 37.2635,
        lon: -112.9528,
        elevM: 1410,
      },
      {
        name: 'Walters Wiggles Switchbacks',
        lat: 37.2668,
        lon: -112.9505,
        elevM: 1540,
      },
      { name: 'Scouts Lookout', lat: 37.2681, lon: -112.9492, elevM: 1610 },
      {
        name: 'Hogsback Spine (Chains)',
        lat: 37.2688,
        lon: -112.9482,
        elevM: 1690,
      },
      {
        name: 'Angels Landing Summit Fin',
        lat: 37.2692,
        lon: -112.9475,
        elevM: 1765,
      },
    ],
    campsites: [
      {
        id: 'west_rim_campsite_1',
        name: 'West Rim Wilderness Bivouac (Site 1)',
        lat: 37.2755,
        lon: -112.9568,
        elevM: 1840,
        firePermitted: false,
        stargazingRating: 5,
      },
    ],
  },
  {
    id: 'grand_canyon_bright_angel',
    name: 'Bright Angel Trail (Rim to River)',
    park: 'Grand Canyon National Park',
    state: 'Arizona',
    biome: BIOME_TYPES.DESERT_GORGE,
    coordinates: {
      lat: 36.0574,
      lon: -112.1437,
      elevM: 2090,
    },
    summitCoordinates: {
      lat: 36.1052,
      lon: -112.0911,
      elevM: 750,
    },
    trailLengthKm: 25.1, // ~15.6 miles
    elevationGainM: 1340, // descent loss
    difficulty: 'MOUNTAIN_HIKING',
    scenicHighlights: [
      'South Rim Kolb Studio trailhead panorama',
      'Lower and Upper Tunnels carved through Coconino sandstone',
      '1.5-Mile and 3-Mile shaded stone resthouses',
      'Havasupai Gardens lush cottonwood oasis',
      'Silver Bridge suspension over raging Colorado River',
      'Historic Phantom Ranch cantina and stone cabins',
    ],
    faunaTypes: [
      'bighorn_sheep',
      'california_condor',
      'mule_deer',
      'ringtail_cat',
    ],
    waypoints: [
      {
        name: 'Bright Angel Trailhead',
        lat: 36.0574,
        lon: -112.1437,
        elevM: 2090,
      },
      { name: '1.5-Mile Resthouse', lat: 36.0682, lon: -112.1402, elevM: 1740 },
      { name: '3-Mile Resthouse', lat: 36.0755, lon: -112.1381, elevM: 1445 },
      {
        name: 'Havasupai Gardens Oasis',
        lat: 36.0778,
        lon: -112.1285,
        elevM: 1160,
      },
      {
        name: 'Devil’s Corkscrew Switchbacks',
        lat: 36.0892,
        lon: -112.1158,
        elevM: 920,
      },
      {
        name: 'Silver Suspension Bridge',
        lat: 36.1012,
        lon: -112.0945,
        elevM: 760,
      },
      {
        name: 'Phantom Ranch & Bright Angel Creek',
        lat: 36.1052,
        lon: -112.0911,
        elevM: 750,
      },
    ],
    campsites: [
      {
        id: 'bright_angel_campground',
        name: 'Bright Angel Creek Backcountry Bivouac',
        lat: 36.1042,
        lon: -112.0924,
        elevM: 755,
        firePermitted: false,
        stargazingRating: 5,
      },
    ],
  },
  {
    id: 'rainier_skyline_trail',
    name: 'Skyline Trail at Paradise',
    park: 'Mount Rainier National Park',
    state: 'Washington',
    biome: BIOME_TYPES.VOLCANIC_GLACIAL,
    coordinates: {
      lat: 46.7865,
      lon: -121.735,
      elevM: 1650,
    },
    summitCoordinates: {
      lat: 46.8042,
      lon: -121.7312,
      elevM: 2070,
    },
    trailLengthKm: 8.9, // ~5.5 miles
    elevationGainM: 420,
    difficulty: 'MOUNTAIN_HIKING',
    scenicHighlights: [
      'Myrtle Falls framed by Rainier glaciated peak',
      'Vibrant subalpine lupine and paintbrush meadows',
      'Nisqually Glacier dynamic ice seracs and moraines',
      'Panorama Point 360° views of St. Helens, Adams & Hood',
      'Pebble Creek alpine climber staging field',
    ],
    faunaTypes: ['marmot', 'mountain_goat', 'black_tailed_deer', 'pika'],
    waypoints: [
      {
        name: 'Paradise Visitor Center Trailhead',
        lat: 46.7865,
        lon: -121.735,
        elevM: 1650,
      },
      {
        name: 'Myrtle Falls Viewpoint',
        lat: 46.7912,
        lon: -121.7318,
        elevM: 1710,
      },
      { name: 'Alta Vista Crest', lat: 46.7945, lon: -121.7362, elevM: 1810 },
      {
        name: 'Glacier Vista Overlook',
        lat: 46.7988,
        lon: -121.7375,
        elevM: 1930,
      },
      { name: 'Panorama Point', lat: 46.8042, lon: -121.7312, elevM: 2070 },
      {
        name: 'Pebble Creek Crossing',
        lat: 46.8122,
        lon: -121.7285,
        elevM: 2195,
      },
    ],
    campsites: [
      {
        id: 'camp_muir_high_bivouac',
        name: 'Camp Muir Glacial High Bivouac',
        lat: 46.8354,
        lon: -121.7319,
        elevM: 3070,
        firePermitted: false,
        stargazingRating: 5,
      },
    ],
  },
  {
    id: 'shenandoah_old_rag',
    name: 'Old Rag Mountain Rock Scramble',
    park: 'Shenandoah National Park / Blue Ridge',
    state: 'Virginia',
    biome: BIOME_TYPES.BLUE_RIDGE_MONADNOCK,
    coordinates: {
      lat: 38.5707,
      lon: -78.3168,
      elevM: 750,
    },
    summitCoordinates: {
      lat: 38.5524,
      lon: -78.3188,
      elevM: 1002,
    },
    trailLengthKm: 15.1, // ~9.4 miles
    elevationGainM: 720,
    difficulty: 'ALPINE_HIKING',
    scenicHighlights: [
      'Switchbacks through lush hardwood and mountain laurel',
      'Upper ridge granite rock scramble with natural rock tunnels',
      'The Chasm squeeze-through granite crevice',
      'Bouldering traverse along exposed ridge spine',
      '360° unobstructed summit view of Shenandoah Valley and Piedmont',
    ],
    faunaTypes: [
      'black_bear',
      'white_tailed_deer',
      'timber_rattlesnake',
      'bobcat',
    ],
    waypoints: [
      {
        name: 'Old Rag Ridge Trailhead',
        lat: 38.5707,
        lon: -78.3168,
        elevM: 750,
      },
      {
        name: 'Hardwood Switchback Turn',
        lat: 38.5632,
        lon: -78.3175,
        elevM: 860,
      },
      { name: 'Rock Scramble Gate', lat: 38.5578, lon: -78.3182, elevM: 935 },
      {
        name: 'The Granite Squeeze Chasm',
        lat: 38.5545,
        lon: -78.3185,
        elevM: 980,
      },
      {
        name: 'Old Rag Summit Overlook',
        lat: 38.5524,
        lon: -78.3188,
        elevM: 1002,
      },
      { name: 'Byrds Nest Shelter', lat: 38.5512, lon: -78.3225, elevM: 940 },
    ],
    campsites: [
      {
        id: 'byrds_nest_shelter',
        name: 'Byrds Nest Wilderness Bivouac',
        lat: 38.5512,
        lon: -78.3225,
        elevM: 940,
        firePermitted: true,
        stargazingRating: 4.6,
      },
    ],
  },
  {
    id: 'olympic_hoh_river',
    name: 'Hoh River Trail to Blue Glacier',
    park: 'Olympic National Park',
    state: 'Washington',
    biome: BIOME_TYPES.TEMPERATE_RAINFOREST,
    coordinates: {
      lat: 47.8601,
      lon: -123.9348,
      elevM: 180,
    },
    summitCoordinates: {
      lat: 47.8015,
      lon: -123.7052,
      elevM: 1310,
    },
    trailLengthKm: 28.2, // ~17.5 miles
    elevationGainM: 1130,
    difficulty: 'HIKING',
    scenicHighlights: [
      'Hall of Mosses primeval hanging club moss canopy',
      'Gigantic 500-year-old Sitka spruce and western hemlock groves',
      'Wide gravel bars and turquoise glacial waters of Hoh River',
      'High Divide overlook of Mount Olympus massifs',
      'Terminal moraine view of tumbling Blue Glacier icefall',
    ],
    faunaTypes: ['elk', 'black_bear', 'river_otter', 'bald_eagle'],
    waypoints: [
      {
        name: 'Hoh Rain Forest Visitor Center',
        lat: 47.8601,
        lon: -123.9348,
        elevM: 180,
      },
      {
        name: 'First River Bar Camp',
        lat: 47.8522,
        lon: -123.8812,
        elevM: 210,
      },
      {
        name: 'Five Mile Island Meadow',
        lat: 47.8445,
        lon: -123.8325,
        elevM: 250,
      },
      {
        name: 'Olympus Guard Station',
        lat: 47.8312,
        lon: -123.7745,
        elevM: 320,
      },
      {
        name: 'Hoh River High Bridge',
        lat: 47.8185,
        lon: -123.7312,
        elevM: 460,
      },
      {
        name: 'Glacier Meadows Bivouac',
        lat: 47.8062,
        lon: -123.7125,
        elevM: 1280,
      },
      {
        name: 'Blue Glacier Moraine Edge',
        lat: 47.8015,
        lon: -123.7052,
        elevM: 1310,
      },
    ],
    campsites: [
      {
        id: 'glacier_meadows_bivouac',
        name: 'Glacier Meadows High Bivouac',
        lat: 47.8062,
        lon: -123.7125,
        elevM: 1280,
        firePermitted: false,
        stargazingRating: 4.9,
      },
    ],
  },
  {
    id: 'rockies_emerald_lake',
    name: 'Bear Lake to Emerald Lake & Tyndall Gorge',
    park: 'Rocky Mountain National Park',
    state: 'Colorado',
    biome: BIOME_TYPES.CONTINENTAL_DIVIDE,
    coordinates: {
      lat: 40.3132,
      lon: -105.6486,
      elevM: 2880,
    },
    summitCoordinates: {
      lat: 40.3082,
      lon: -105.6668,
      elevM: 3080,
    },
    trailLengthKm: 5.8, // ~3.6 miles
    elevationGainM: 200,
    difficulty: 'HIKING',
    scenicHighlights: [
      'Bear Lake subalpine shoreline and granite backdrop',
      'Nymph Lake yellow pond-lily cove',
      'Dream Lake pristine reflections of Hallett Peak',
      'Tyndall Gorge towering vertical glacial arêtes',
      'Emerald Lake turquoise waters beneath Continental Divide crest',
    ],
    faunaTypes: ['elk', 'bighorn_sheep', 'marmot', 'pika'],
    waypoints: [
      {
        name: 'Bear Lake Trailhead',
        lat: 40.3132,
        lon: -105.6486,
        elevM: 2880,
      },
      {
        name: 'Nymph Lake Shoreline',
        lat: 40.3112,
        lon: -105.6542,
        elevM: 2950,
      },
      { name: 'Dream Lake Inlet', lat: 40.3098, lon: -105.6595, elevM: 3020 },
      {
        name: 'Tyndall Gorge Creek Crossing',
        lat: 40.3089,
        lon: -105.6632,
        elevM: 3050,
      },
      {
        name: 'Emerald Lake Cirque Basin',
        lat: 40.3082,
        lon: -105.6668,
        elevM: 3080,
      },
    ],
    campsites: [
      {
        id: 'tyndall_gorge_bivouac',
        name: 'Tyndall Gorge Continental Bivouac',
        lat: 40.3089,
        lon: -105.6632,
        elevM: 3050,
        firePermitted: false,
        stargazingRating: 5,
      },
    ],
  },
]);

/**
 * Returns all cataloged wilderness trailheads.
 * @returns {Array} List of trailheads.
 */
export function getAllTrailheads() {
  return [...WILDERNESS_TRAILHEADS];
}

/**
 * Retrieves a trailhead by its identifier.
 * @param {string} id Trailhead ID.
 * @returns {Object|null} Trailhead or null.
 */
export function getTrailheadById(id) {
  if (!id || typeof id !== 'string') return null;
  const clean = id.trim().toLowerCase();
  return (
    WILDERNESS_TRAILHEADS.find(
      (t) => t.id.toLowerCase() === clean || t.name.toLowerCase() === clean,
    ) || null
  );
}

/**
 * Filters trailheads by difficulty, biome, and text search.
 * @param {Object} options Filter options.
 * @returns {Array} Filtered trailheads.
 */
export function filterTrailheads({
  difficulty = null,
  biome = null,
  search = '',
} = {}) {
  let results = [...WILDERNESS_TRAILHEADS];
  if (difficulty) {
    const diffUpper = difficulty.trim().toUpperCase();
    results = results.filter((t) => t.difficulty === diffUpper);
  }
  if (biome) {
    const biomeUpper = biome.trim().toUpperCase();
    results = results.filter((t) => t.biome === biomeUpper);
  }
  if (search && typeof search === 'string') {
    const q = search.trim().toLowerCase();
    results = results.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.park.toLowerCase().includes(q) ||
        t.state.toLowerCase().includes(q),
    );
  }
  return results;
}

/**
 * Calculates Great-Circle distance in km between two lat/lon pairs using Haversine formula.
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest wilderness trailhead to a given coordinate within maxDistanceKm.
 * @param {number} lat Latitude
 * @param {number} lon Longitude
 * @param {number} maxDistanceKm Maximum discovery radius (default 300km)
 * @returns {Object|null} Nearest trailhead with distanceKm property.
 */
export function findNearbyTrailhead(lat, lon, maxDistanceKm = 300) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  let nearest = null;
  let minDistance = Infinity;

  for (const th of WILDERNESS_TRAILHEADS) {
    const dist = calculateHaversineDistanceKm(
      lat,
      lon,
      th.coordinates.lat,
      th.coordinates.lon,
    );
    if (dist < minDistance && dist <= maxDistanceKm) {
      minDistance = dist;
      nearest = { ...th, distanceKm: Math.round(dist * 10) / 10 };
    }
  }
  return nearest;
}
