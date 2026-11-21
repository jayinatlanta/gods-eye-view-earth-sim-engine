/**
 * World Architect & World Sandbox - Structure Catalog
 * Modular Structures, Scenic Overlooks & Contemplative Sanctuaries
 */

export const STRUCTURE_CATEGORIES = {
  SHELTER: 'SHELTER',
  OBSERVATION: 'OBSERVATION',
  WATERFRONT: 'WATERFRONT',
  REST_POINT: 'REST_POINT',
};

export const TERRAIN_SUITABILITY = {
  RIDGE: 'RIDGE',
  CLIFF_EDGE: 'CLIFF_EDGE',
  FOREST_CLEARING: 'FOREST_CLEARING',
  LAKESHORE: 'LAKESHORE',
  ALPINE_SUMMIT: 'ALPINE_SUMMIT',
  VALLEY_FLOOR: 'VALLEY_FLOOR',
};

/**
 * Curated modular structure archetypes for the World Architect sandbox.
 */
export const STRUCTURE_CATALOG = [
  {
    id: 'struct-hillside-cabin',
    name: 'Modern Hillside Cabin',
    category: STRUCTURE_CATEGORIES.SHELTER,
    badge: 'Flagship Residence',
    description:
      'Cantilevered cedar and architectural glass retreat with panoramic floor-to-ceiling windows, wrap-around deck, and radiant-heated stone hearth.',
    footprint: { width: 14.0, length: 18.0, height: 7.2 },
    materials: [
      'western_red_cedar',
      'low_iron_glass',
      'matte_black_steel',
      'natural_slate',
    ],
    amenities: [
      'Dual-aspect fireplace',
      'Nordic soaking cedar tub',
      'Solar energy canopy',
      'Reading lounge overlooking abyss',
      'Companion writing desk',
    ],
    capacity: 6,
    suitableTerrain: [
      TERRAIN_SUITABILITY.RIDGE,
      TERRAIN_SUITABILITY.FOREST_CLEARING,
      TERRAIN_SUITABILITY.CLIFF_EDGE,
    ],
    anchorPoints: [
      // i18n-ignore: anchor label
      { id: 'deck_front', offset: [0, 9.0, 0], label: 'Front Cantilever Deck' },
      {
        id: 'hearth_chimney',
        offset: [5.0, 0, 8.0],
        // i18n-ignore: anchor label
        label: 'Stone Chimney Cap',
      },
      // i18n-ignore: anchor label
      { id: 'entryway', offset: [0, -9.0, 0], label: 'Timber Portico Entry' },
    ],
    ambientSoundId: 'cabin_hearth',
    sanctuaryScore: 98,
  },
  {
    id: 'struct-fire-lookout',
    name: 'Mountain Fire Lookout Tower',
    category: STRUCTURE_CATEGORIES.OBSERVATION,
    badge: '360° Panorama',
    description:
      'Historic USFS-inspired timber and structural steel tower with an elevated catwalk and 360-degree glass cupola for wilderness watch.',
    footprint: { width: 8.0, length: 8.0, height: 16.5 },
    materials: [
      'heavy_douglas_fir_timbers',
      'weathered_corten_steel',
      'marine_brass_hardware',
    ],
    amenities: [
      '360° Osborne Fire Finder pedestal',
      'Radio & weather telemetry station',
      'Fold-down cot and brass lantern mount',
      'Exterior wrap catwalk',
    ],
    capacity: 4,
    suitableTerrain: [
      TERRAIN_SUITABILITY.RIDGE,
      TERRAIN_SUITABILITY.ALPINE_SUMMIT,
    ],
    anchorPoints: [
      // i18n-ignore: anchor label
      { id: 'cupola_apex', offset: [0, 0, 16.5], label: 'Cupola Roof Finial' },
      {
        id: 'catwalk_north',
        offset: [0, 4.5, 12.0],
        // i18n-ignore: anchor label
        label: 'North Observation Rail',
      },
      // i18n-ignore: anchor label
      { id: 'stair_base', offset: [0, -5.0, 0], label: 'Timber Stair Landing' },
    ],
    ambientSoundId: 'high_altitude_wind',
    sanctuaryScore: 94,
  },
  {
    id: 'struct-viewing-pavilion',
    name: 'Alpine Viewing Pavilion',
    category: STRUCTURE_CATEGORIES.OBSERVATION,
    badge: 'Open-Air Vista',
    description:
      'Minimalist Japanese-inspired post-and-beam pavilion with an open timber trellis, central granite fire table, and deep bench perimeter seating.',
    footprint: { width: 10.0, length: 12.0, height: 4.8 },
    materials: [
      'charred_shou_sugi_ban_timber',
      'honed_granite',
      'brass_fixtures',
    ],
    amenities: [
      'Linear gas fire trough',
      'Built-in perimeter bench with woolen throws',
      'Stargazing skylight apertures',
      'Rain-chain drainage waterfalls',
    ],
    capacity: 12,
    suitableTerrain: [
      TERRAIN_SUITABILITY.RIDGE,
      TERRAIN_SUITABILITY.CLIFF_EDGE,
      TERRAIN_SUITABILITY.FOREST_CLEARING,
      TERRAIN_SUITABILITY.VALLEY_FLOOR,
    ],
    anchorPoints: [
      // i18n-ignore: anchor label
      { id: 'hearth_center', offset: [0, 0, 0.4], label: 'Central Fire Table' },
      // i18n-ignore: anchor label
      { id: 'overlook_rim', offset: [0, 6.0, 0], label: 'Valley Vista Edge' },
    ],
    ambientSoundId: 'pavilion_windchimes',
    sanctuaryScore: 92,
  },
  {
    id: 'struct-lakeside-gazebo-dock',
    name: 'Lakeside Gazebo & Floating Dock',
    category: STRUCTURE_CATEGORIES.WATERFRONT,
    badge: 'Aquatic Harbor',
    description:
      'Cedar-shingled octagonal gazebo coupled to a buoyant deep-water floating dock with kayak tie-downs and swim ladder.',
    footprint: { width: 12.0, length: 22.0, height: 5.5 },
    materials: [
      'ipe_hardwood_decking',
      'white_cedar_shakes',
      'anodized_aluminum_dock_pontoons',
    ],
    amenities: [
      'Dual kayak & paddleboard racks',
      'Solar dock illumination beacons',
      'Low Adirondack reflection chairs',
      'Retractable stainless swim ladder',
    ],
    capacity: 8,
    suitableTerrain: [
      TERRAIN_SUITABILITY.LAKESHORE,
      TERRAIN_SUITABILITY.VALLEY_FLOOR,
    ],
    anchorPoints: [
      // i18n-ignore: anchor label
      { id: 'gazebo_apex', offset: [0, 0, 5.5], label: 'Octagonal Spire' },
      // i18n-ignore: anchor label
      { id: 'dock_slip', offset: [0, 11.0, 0.3], label: 'Vessel Moor Slip' },
      {
        id: 'shore_gangway',
        offset: [0, -11.0, 0],
        // i18n-ignore: anchor label
        label: 'Shoreline Gangway Hinge',
      },
    ],
    ambientSoundId: 'lakeside_lapping_water',
    sanctuaryScore: 90,
  },
  {
    id: 'struct-overlook-bench',
    name: 'Contemplative Overlook Bench',
    category: STRUCTURE_CATEGORIES.REST_POINT,
    badge: 'Solo Sanctuary',
    description:
      'Sculptural dry-stacked native stone base supporting a massive live-edge white oak timber bench positioned at scenic edge.',
    footprint: { width: 3.2, length: 1.6, height: 1.1 },
    materials: [
      'local_granite_dry_stack',
      'live_edge_white_oak',
      'bronze_memorial_plaque',
    ],
    amenities: [
      'Companion seating for 2',
      'Integrated bronze journal / thermos cup holders',
      'Subtle warm ground wash accent light',
    ],
    capacity: 2,
    suitableTerrain: [
      TERRAIN_SUITABILITY.RIDGE,
      TERRAIN_SUITABILITY.CLIFF_EDGE,
      TERRAIN_SUITABILITY.FOREST_CLEARING,
      TERRAIN_SUITABILITY.LAKESHORE,
      TERRAIN_SUITABILITY.ALPINE_SUMMIT,
      TERRAIN_SUITABILITY.VALLEY_FLOOR,
    ],
    anchorPoints: [
      {
        id: 'bench_seat',
        offset: [0, 0, 0.45],
        // i18n-ignore: anchor label
        label: 'Primary Seating Surface',
      },
      {
        id: 'companion_spot',
        offset: [0.8, 0, 0.45],
        // i18n-ignore: anchor label
        label: 'Companion Anchor',
      },
    ],
    ambientSoundId: 'gentle_breeze',
    sanctuaryScore: 96,
  },
  {
    id: 'struct-stargazing-deck',
    name: 'Celestial Stargazing Deck',
    category: STRUCTURE_CATEGORIES.OBSERVATION,
    badge: 'Night Sky Sanctuary',
    description:
      'Low-profile circular dark timber platform with sunken recliner lounges, brass meridian compass rose, and equatorial telescope pier.',
    footprint: { width: 11.0, length: 11.0, height: 1.8 },
    materials: [
      'dark_stained_teak',
      'brass_celestial_inlays',
      'low_lux_red_led_accents',
    ],
    amenities: [
      'Equatorial telescope mount pier',
      'Dual contoured zero-gravity chaise lounges',
      'Star chart storage locker & hot tea station',
      'Zero-light-pollution dark sky perimeter baffles',
    ],
    capacity: 6,
    suitableTerrain: [
      TERRAIN_SUITABILITY.RIDGE,
      TERRAIN_SUITABILITY.ALPINE_SUMMIT,
      TERRAIN_SUITABILITY.FOREST_CLEARING,
    ],
    anchorPoints: [
      {
        id: 'telescope_pier',
        offset: [0, 0, 1.2],
        // i18n-ignore: anchor label
        label: 'Telescope Equatorial Pier',
      },
      {
        id: 'lounger_left',
        offset: [-2.5, 0, 0.3],
        // i18n-ignore: anchor label
        label: 'Star Recliner West',
      },
      {
        id: 'lounger_right',
        offset: [2.5, 0, 0.3],
        // i18n-ignore: anchor label
        label: 'Star Recliner East',
      },
    ],
    ambientSoundId: 'celestial_dusk_ambience',
    sanctuaryScore: 99,
  },
  {
    id: 'struct-glass-skywalk',
    name: 'Suspended Glass Skywalk',
    category: STRUCTURE_CATEGORIES.OBSERVATION,
    badge: 'Canyon Suspension',
    description:
      'Dramatically cantilevered architectural glass floor protruding 15 meters out over the void with frameless glass railings.',
    footprint: { width: 4.5, length: 16.0, height: 3.2 },
    materials: [
      'triple_laminated_structural_glass',
      'tension_anchored_steel_truss',
      'titanium_hardware',
    ],
    amenities: [
      'Unobstructed vertical drop sightlines',
      'High-wind aerodynamic dampeners',
      'Discrete edge illumination fiber-optics',
    ],
    capacity: 10,
    suitableTerrain: [
      TERRAIN_SUITABILITY.CLIFF_EDGE,
      TERRAIN_SUITABILITY.RIDGE,
    ],
    anchorPoints: [
      {
        id: 'skywalk_apex',
        offset: [0, 8.0, 0],
        // i18n-ignore: anchor label
        label: 'Cantilever Terminal Vista',
      },
      {
        id: 'rock_abutment',
        offset: [0, -8.0, 0],
        // i18n-ignore: anchor label
        label: 'Bedrock Concrete Abutment',
      },
    ],
    ambientSoundId: 'canyon_draft',
    sanctuaryScore: 95,
  },
];

/**
 * Find structure blueprint by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getStructureById(id) {
  if (!id) return null;
  return STRUCTURE_CATALOG.find((s) => s.id === id) || null;
}

/**
 * Filter structures by category.
 * @param {string} category
 * @returns {Array<object>}
 */
export function getStructuresByCategory(category) {
  if (!category || category === 'ALL') return [...STRUCTURE_CATALOG];
  return STRUCTURE_CATALOG.filter((s) => s.category === category);
}

/**
 * Filter structures by terrain suitability.
 * @param {string} terrainType
 * @returns {Array<object>}
 */
export function getStructuresByTerrain(terrainType) {
  if (!terrainType) return [...STRUCTURE_CATALOG];
  return STRUCTURE_CATALOG.filter((s) =>
    s.suitableTerrain.includes(terrainType),
  );
}
