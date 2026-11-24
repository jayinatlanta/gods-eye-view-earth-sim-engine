/**
 * Living World Park Days: Hidden Secrets Scavenger Hunt, Day Passport,
 * Transferable Hidden City Gems, and Mulberry32 Clue-Giving Park NPCs.
 *
 * Strictly zero Cesium.Label APIs (uses memoized SVG data-URI billboards on a
 * dedicated CustomDataSource), zero per-frame allocations, and deterministic
 * teardown on tour stop, park switch, or destroy().
 */

import * as Cesium from 'cesium';
import { haversineDistanceMeters } from '../../citylife/cityWaypoints.js';
import { getCompanionPersonaName } from './companionDot.js';
import { STAGE3_THEME_PARK_LANDMARKS } from './themeParkCatalog.js';
import {
  RESORT_HIDDEN_SECRETS_CATALOG,
  isResortStayId,
} from './resortStayCatalog.js';
import {
  NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG,
  NEXT_EXPERIENCE_METADATA,
  NEXT_EXPERIENCE_ALIASES,
  isNextExperienceId,
} from './nextExperiencesCatalog.js';

export const PASSPORT_STORAGE_KEY = 'gev_tour_passport_v1';
export const SECRET_COLLECT_RADIUS_METERS = 24;
export const NPC_INTERACT_RADIUS_METERS = 45;

const METERS_PER_DEG_LAT = 111139.0;

/**
 * FNV-1a string hash producing an unsigned 32-bit seed for Mulberry32.
 */
export function hashStringToSeed(raw) {
  const str = String(raw || 'gev_default_seed');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic 32-bit Mulberry32 PRNG returning floats in [0, 1).
 */
export function createMulberry32(seed = 1) {
  let a = Number(seed) >>> 0;
  if (a === 0) a = 1;
  return function nextRandom() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offsetLatLonByMeters(lat, lon, bearingDeg, distanceMeters) {
  const rad = (Number(bearingDeg) * Math.PI) / 180;
  const northM = Math.cos(rad) * Number(distanceMeters);
  const eastM = Math.sin(rad) * Number(distanceMeters);
  const nextLat = lat + northM / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCos = Math.abs(cosLat) > 0.01 ? cosLat : 0.01;
  const nextLon = lon + eastM / (METERS_PER_DEG_LAT * safeCos);
  return {
    lat: Number(nextLat.toFixed(6)),
    lon: Number(nextLon.toFixed(6)),
  };
}

function compassCardinal(fromLat, fromLon, toLat, toLon) {
  const dLat = toLat - fromLat;
  const cosLat = Math.cos((fromLat * Math.PI) / 180);
  const dLon = (toLon - fromLon) * (Math.abs(cosLat) > 0.01 ? cosLat : 1);
  const angleDeg = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(angleDeg / 45) % 8];
}

function makeOffRouteSecret({
  id,
  title,
  icon = '🪙',
  hint,
  story,
  anchorLat,
  anchorLon,
  anchorElev = 32,
  bearingDeg = 45,
  distanceMeters = 52,
  land = '',
  kind = 'park_secret',
}) {
  const pos = offsetLatLonByMeters(
    anchorLat,
    anchorLon,
    bearingDeg,
    distanceMeters,
  );
  return {
    id,
    title,
    icon,
    hint,
    story,
    lat: pos.lat,
    lon: pos.lon,
    elev: anchorElev,
    land,
    kind,
  };
}

// Anchors for Stage 1 parks (MK + EPCOT) & transferable cities (Paris, Tokyo, Atlanta)
// matched directly against tourAndPlayEngine's METRO_LANDMARK_CATALOG stops so every
// token sits cleanly 35-85m off main midways for WASD Free-Roam detours.
const STAGE1_AND_CITY_ANCHORS = {
  wdw_magic_kingdom: [
    { lat: 28.4194, lon: -81.5812, elev: 57, land: 'Fantasyland Hub' },
    { lat: 28.4181, lon: -81.5841, elev: 31, land: 'Adventureland' },
    { lat: 28.4204, lon: -81.583, elev: 34, land: 'Liberty Square' },
    { lat: 28.4205, lon: -81.5802, elev: 38, land: 'Fantasyland' },
    { lat: 28.4191, lon: -81.5772, elev: 55, land: 'Tomorrowland' },
    { lat: 28.4203, lon: -81.5847, elev: 45, land: 'Frontierland' },
  ],
  wdw_epcot: [
    { lat: 28.3753, lon: -81.5494, elev: 56, land: 'World Celebration' },
    { lat: 28.3712, lon: -81.5469, elev: 31, land: 'Mexico Pavilion' },
    { lat: 28.3674, lon: -81.551, elev: 32, land: 'Japan Pavilion' },
    { lat: 28.3683, lon: -81.552, elev: 31, land: 'Morocco Pavilion' },
    { lat: 28.3694, lon: -81.5526, elev: 31, land: 'France Pavilion' },
    { lat: 28.3714, lon: -81.5508, elev: 33, land: 'Canada Pavilion' },
  ],
  paris: [
    { lat: 48.8584, lon: 2.2945, elev: 33, land: 'Champ de Mars' },
    { lat: 48.8606, lon: 2.3376, elev: 34, land: 'Cour Napoléon' },
    { lat: 48.853, lon: 2.3499, elev: 35, land: 'Île de la Cité' },
    { lat: 48.8738, lon: 2.295, elev: 56, land: 'Champs-Élysées' },
  ],
  tokyo: [
    { lat: 35.6595, lon: 139.7005, elev: 20, land: 'Shibuya' },
    { lat: 35.6764, lon: 139.6993, elev: 32, land: 'Meiji Jingu' },
    { lat: 35.7148, lon: 139.7967, elev: 6, land: 'Asakusa' },
    { lat: 35.6586, lon: 139.7454, elev: 22, land: 'Shiba Park' },
  ],
  atlanta: [
    { lat: 33.7851, lon: -84.3733, elev: 286, land: 'Piedmont Park' },
    { lat: 33.7726, lon: -84.3655, elev: 296, land: 'BeltLine Eastside' },
    { lat: 33.7725, lon: -84.3856, elev: 304, land: 'Peachtree St' },
    { lat: 33.7603, lon: -84.3935, elev: 298, land: 'Centennial Park' },
    { lat: 33.7548, lon: -84.3733, elev: 299, land: 'Sweet Auburn' },
  ],
};

function buildParkSecretTemplates(cityId, stops, specs) {
  return specs.map((spec, idx) => {
    const anchor = stops[spec.stopIdx % stops.length] || stops[0];
    return makeOffRouteSecret({
      id: `${cityId}_secret_${idx + 1}`,
      title: spec.title,
      icon: spec.icon || '🪙',
      hint: spec.hint,
      story: spec.story,
      anchorLat: anchor.lat,
      anchorLon: anchor.lon,
      anchorElev: anchor.elev || 32,
      bearingDeg: spec.bearingDeg,
      distanceMeters: spec.distanceMeters,
      land: anchor.land || spec.land || '',
      kind: spec.kind || 'park_secret',
    });
  });
}

export const HIDDEN_SECRETS_CATALOG = Object.freeze({
  wdw_magic_kingdom: buildParkSecretTemplates(
    'wdw_magic_kingdom',
    STAGE1_AND_CITY_ANCHORS.wdw_magic_kingdom,
    [
      {
        stopIdx: 0,
        title: 'Cinderella’s Wishing Well Alcove',
        icon: '🪙',
        bearingDeg: 95,
        distanceMeters: 54,
        hint: 'Slip down the shaded cobblestone side-path east of the Castle arches.',
        story:
          'Quiet storybook alcove beside the eastern moat wall framed by bronze woodland doves.',
      },
      {
        stopIdx: 1,
        title: 'Pirate Spyglass Tidepool',
        icon: '🧭',
        bearingDeg: 225,
        distanceMeters: 48,
        hint: 'Detour southwest past the Adventureland bamboo archway.',
        story:
          'Carved wooden compass marker tucked beside the Caribbean cannon embrasure.',
      },
      {
        stopIdx: 2,
        title: 'Liberty Tree Lantern Marker',
        icon: '🏮',
        bearingDeg: 185,
        distanceMeters: 52,
        hint: 'Check under the giant live oak south of the Haunted Mansion gate.',
        story:
          'Thirteen colonial glass lanterns honor the original states along the brick promenade.',
      },
      {
        stopIdx: 3,
        title: 'Mine-Cart Gem Cache',
        icon: '💎',
        bearingDeg: 35,
        distanceMeters: 58,
        hint: 'Roam northeast behind the Seven Dwarfs timber switchbacks.',
        story:
          'Uncut emerald and ruby props nestled beside an abandoned prospector ore chute.',
      },
      {
        stopIdx: 4,
        title: 'Tomorrowland Starport Skywalk Plaque',
        icon: '🛰️',
        bearingDeg: 145,
        distanceMeters: 62,
        hint: 'Step southeast beneath the elevated PeopleMover pylon.',
        story:
          'Retro-futuristic bronze star-chart plaque celebrating 1975 Starport architecture.',
      },
      {
        stopIdx: 5,
        title: 'Big Thunder Geyser Overlook',
        icon: '⛏️',
        bearingDeg: 300,
        distanceMeters: 55,
        hint: 'Follow the boardwalk northwest along the Rivers of America bend.',
        story:
          'Quiet wooden rail looking directly across at Tumbleweed’s bubbling thermal pools.',
      },
    ],
  ),

  wdw_epcot: buildParkSecretTemplates(
    'wdw_epcot',
    STAGE1_AND_CITY_ANCHORS.wdw_epcot,
    [
      {
        stopIdx: 0,
        title: 'Geodesic Prism Garden',
        icon: '🔷',
        bearingDeg: 85,
        distanceMeters: 58,
        hint: 'Wander east into the glowing Dreamers Point flower terraces.',
        story:
          'Hidden triangular tile mosaic echoing Spaceship Earth’s 11,324 aluminum facets.',
      },
      {
        stopIdx: 1,
        title: 'Aztec Obsidian Sundial',
        icon: '☀️',
        bearingDeg: 65,
        distanceMeters: 52,
        hint: 'Explore the jungle stone ruins east of the Mexican step pyramid.',
        story:
          'Carved basalt calendar stone tucked among tropical palm fronds beside the lagoon.',
      },
      {
        stopIdx: 2,
        title: 'Katsura Upper Koi Waterfall',
        icon: '🎏',
        bearingDeg: 155,
        distanceMeters: 48,
        hint: 'Climb the winding bamboo garden path south of the pagoda.',
        story:
          'Tranquil stone lantern beside spring-fed koi pools overlooking the red torii gate.',
      },
      {
        stopIdx: 3,
        title: 'Fez Zellige Courtyard Niche',
        icon: '🏺',
        bearingDeg: 250,
        distanceMeters: 46,
        hint: 'Slip deep west into the tiled Moroccan medina passageways.',
        story:
          'Hand-laid geometric mosaic bench hidden two turns off the main lagoon walkway.',
      },
      {
        stopIdx: 4,
        title: 'Impressionist Seine Bookstall',
        icon: '🎨',
        bearingDeg: 305,
        distanceMeters: 52,
        hint: 'Walk northwest along the Parisian canal toward the Ratatouille fountain.',
        story:
          'Vintage green zinc kiosk painted with mini sketches of Paris’s Eiffel Tower vista.',
      },
      {
        stopIdx: 5,
        title: 'Butchart Canyon Totem View',
        icon: '🍁',
        bearingDeg: 20,
        distanceMeters: 54,
        hint: 'Step north behind the stone staircase of Victoria Gardens.',
        story:
          'Misty stone overlook hiding right behind the roar of the 30-foot Canadian waterfall.',
      },
    ],
  ),

  wdw_hollywood_studios: buildParkSecretTemplates(
    'wdw_hollywood_studios',
    STAGE3_THEME_PARK_LANDMARKS.wdw_hollywood_studios,
    [
      {
        stopIdx: 0,
        title: 'Gertie’s Lakeside Footprint Plaque',
        icon: '🦕',
        bearingDeg: 115,
        distanceMeters: 58,
        hint: 'Check the Echo Lake shoreline east of Hollywood Boulevard.',
        story:
          'Cement tribute to Winsor McCay’s 1914 animated pioneer right beside the lake wall.',
      },
      {
        stopIdx: 1,
        title: 'Hollywood Tower Courtyard Key',
        icon: '🗝️',
        bearingDeg: 140,
        distanceMeters: 52,
        hint: 'Search the overgrown cypress garden southeast of the hotel porte-cochère.',
        story:
          'Brass Room 1301 luggage tag forgotten in the 1939 mist gardens.',
      },
      {
        stopIdx: 3,
        title: 'Andy’s Giant Checkerboard Tile',
        icon: '🎲',
        bearingDeg: 215,
        distanceMeters: 48,
        hint: 'Peek southwest beside the oversized Tinkertoy bridge pillars.',
        story:
          'Hand-painted toy block stamped with vintage 1995 Pixar alley trivia.',
      },
      {
        stopIdx: 5,
        title: 'Batuu Black Spire Holocron',
        icon: '🔮',
        bearingDeg: 120,
        distanceMeters: 54,
        hint: 'Walk east past the parked X-Wing toward the petrified black rock spire.',
        story:
          'Glowing Kyber-etched stone marking the historic trading post center of Batuu.',
      },
      {
        stopIdx: 7,
        title: 'Echo Lake Indiana Rope Crate',
        icon: '📦',
        bearingDeg: 45,
        distanceMeters: 46,
        hint: 'Look northeast near the palm-lined stunt amphitheater fountain.',
        story:
          'Stenciled "MARCUS BRODY EXPEDITION — HANDLE WITH CARE" prop crate.',
      },
    ],
  ),

  wdw_animal_kingdom: buildParkSecretTemplates(
    'wdw_animal_kingdom',
    STAGE3_THEME_PARK_LANDMARKS.wdw_animal_kingdom,
    [
      {
        stopIdx: 0,
        title: 'Otter Grotto Bark Carving',
        icon: '🦦',
        bearingDeg: 155,
        distanceMeters: 50,
        hint: 'Detour southeast onto the shady Discovery Island root trail.',
        story:
          'Concealed woodpecker and sea-otter reliefs tucked underneath the eastern canopy.',
      },
      {
        stopIdx: 1,
        title: 'Harambe Baobab Brass Compass',
        icon: '🧭',
        bearingDeg: 260,
        distanceMeters: 55,
        hint: 'Check the sandy safari trail edge west of Harambe Market.',
        story:
          'Field conservation log box recording white-rhino migration sightings.',
      },
      {
        stopIdx: 2,
        title: 'Serka Zong Yeti Prayer Stone',
        icon: '🏔️',
        bearingDeg: 95,
        distanceMeters: 52,
        hint: 'Look east across the stone courtyard beside the Everest glacier base.',
        story:
          'Carved snow-lion tablet warning climbers of the Guardian of the Forbidden Mountain.',
      },
      {
        stopIdx: 3,
        title: 'Mo’ara Bioluminescent Moss Arch',
        icon: '🌿',
        bearingDeg: 280,
        distanceMeters: 56,
        hint: 'Wander west under the dripping floating-mountain stone bridge.',
        story:
          'Rare glowing Flaska Reclinata pod echoing softly when hikers step close.',
      },
      {
        stopIdx: 7,
        title: 'Anandapur Royal Tiger Mural',
        icon: '🐅',
        bearingDeg: 40,
        distanceMeters: 48,
        hint: 'Step northeast into the ruined courtyard pavilion arches.',
        story:
          'Intricately restored 17th-century Mughal fresco hidden off the main walkway.',
      },
    ],
  ),

  dlr_disneyland: buildParkSecretTemplates(
    'dlr_disneyland',
    STAGE3_THEME_PARK_LANDMARKS.dlr_disneyland,
    [
      {
        stopIdx: 0,
        title: 'Firehouse Apartment Window Lamp',
        icon: '🏮',
        bearingDeg: 270,
        distanceMeters: 48,
        hint: 'Look along the west side of Town Square by the vintage red firehouse.',
        story:
          'Tribute corner celebrating Walt Disney’s personal second-floor Main Street apartment.',
      },
      {
        stopIdx: 1,
        title: 'Snow White Grotto Wishing Cascade',
        icon: '🐚',
        bearingDeg: 85,
        distanceMeters: 46,
        hint: 'Slip east of Sleeping Beauty Castle moat onto the hidden rose terrace.',
        story:
          'Carved Italian marble statues beside Adriana Caselotti’s echoing wishing well.',
      },
      {
        stopIdx: 2,
        title: '21 Royal Street Courtyard Staircase',
        icon: '⚜️',
        bearingDeg: 135,
        distanceMeters: 44,
        hint: 'Explore the wrought-iron French Quarter balcony alleys southeast of Pirates.',
        story:
          'Ornate cast-iron stair landing overlooking New Orleans Square’s quiet lamp courtyard.',
      },
      {
        stopIdx: 5,
        title: 'Matterhorn Half-Court Climbing Bell',
        icon: '🧗',
        bearingDeg: 50,
        distanceMeters: 54,
        hint: 'Peer northeast along the icy alpine waterfall slope.',
        story:
          'Commemorative plaque honoring Disneyland’s iconic Matterhorn mountain climbers.',
      },
      {
        stopIdx: 6,
        title: 'Rainbow Ridge Old Mine Caboose',
        icon: '🛤️',
        bearingDeg: 325,
        distanceMeters: 58,
        hint: 'Walk northwest along the Big Thunder Trail forest bend.',
        story:
          'Miniature frontier desert town facade preserved from 1956 Nature’s Wonderland.',
      },
    ],
  ),

  dlr_dca: buildParkSecretTemplates(
    'dlr_dca',
    STAGE3_THEME_PARK_LANDMARKS.dlr_dca,
    [
      {
        stopIdx: 0,
        title: 'Carthay Circle Golden Rose Medallion',
        icon: '🌹',
        bearingDeg: 75,
        distanceMeters: 52,
        hint: 'Stroll east of the Carthay Circle fountain plaza.',
        story:
          '1937 Hollywood premiere tribute embedded in the Mission Revival courtyard.',
      },
      {
        stopIdx: 1,
        title: 'Tivan Vault Artifact Crate',
        icon: '📦',
        bearingDeg: 95,
        distanceMeters: 50,
        hint: 'Check behind the metallic garden gates east of the Collector’s Fortress.',
        story:
          'Cracked containment pod stamped "TERRAN MUSICAL ARCHIVE — FRAGILE."',
      },
      {
        stopIdx: 3,
        title: 'Ornament Valley Waterfall Overlook',
        icon: '🏜️',
        bearingDeg: 110,
        distanceMeters: 62,
        hint: 'Follow the red-rock canyon trail east beside Radiator Springs.',
        story:
          'Classic chrome Cadillac tailfin stone spires framing the dusty canyon raceway.',
      },
      {
        stopIdx: 5,
        title: 'Pixar Pier Lighthouse Lantern',
        icon: '🏮',
        bearingDeg: 215,
        distanceMeters: 54,
        hint: 'Walk southwest along the wooden boardwalk railing past the launch tube.',
        story:
          'Victorian coastal brass lantern reflecting off Paradise Bay’s evening waves.',
      },
      {
        stopIdx: 7,
        title: 'Redwood Creek Ranger Lookout',
        icon: '🌲',
        bearingDeg: 300,
        distanceMeters: 55,
        hint: 'Veer northwest into the shady pine trees by Grizzly Peak.',
        story:
          'Crisp Sierra mountain trail marker overlooking the vintage aviation hangar.',
      },
    ],
  ),

  uor_universal_florida: buildParkSecretTemplates(
    'uor_universal_florida',
    STAGE3_THEME_PARK_LANDMARKS.uor_universal_florida,
    [
      {
        stopIdx: 1,
        title: 'Knockturn Alley Dark-Arts Lantern',
        icon: '🕯️',
        bearingDeg: 315,
        distanceMeters: 48,
        hint: 'Duck northwest into the shadowed covered passage beside Diagon Alley.',
        story:
          'Perpetually twilight cobblestone alley whispering spell clues near Borgin & Burkes.',
      },
      {
        stopIdx: 3,
        title: '12 Grimmauld Place Window Sighting',
        icon: '🏠',
        bearingDeg: 65,
        distanceMeters: 50,
        hint: 'Check the London terraced townhouses east of King’s Cross Station.',
        story:
          'Keep watching the second-floor lace curtains—magical movement appears every few moments.',
      },
      {
        stopIdx: 4,
        title: 'Museum of Antiquities Scarab Seal',
        icon: '🪲',
        bearingDeg: 245,
        distanceMeters: 52,
        hint: 'Inspect the stone archways southwest of the New York museum facade.',
        story:
          'Gilded Egyptian relief marking Imhotep’s 1930s film excavation vault.',
      },
      {
        stopIdx: 7,
        title: 'World Expo 1964 Twin-Tower Plaque',
        icon: '🛸',
        bearingDeg: 90,
        distanceMeters: 54,
        hint: 'Detour east behind the concrete World Expo saucer canopy.',
        story:
          'Retro-space-age plaque commemorating the fictional 1964 Universe and You pavilion.',
      },
      {
        stopIdx: 8,
        title: 'Delancey Street Fire Escape Prop',
        icon: '🎷',
        bearingDeg: 210,
        distanceMeters: 46,
        hint: 'Turn southwest down the classic New York brownstone side alley.',
        story:
          'Vintage black-and-white Bluesmobile tuning ledger left by Jake and Elwood.',
      },
    ],
  ),

  uor_islands_of_adventure: buildParkSecretTemplates(
    'uor_islands_of_adventure',
    STAGE3_THEME_PARK_LANDMARKS.uor_islands_of_adventure,
    [
      {
        stopIdx: 0,
        title: 'Port of Entry Explorer Telescope',
        icon: '🔭',
        bearingDeg: 185,
        distanceMeters: 50,
        hint: 'Walk south out onto the stone harbor pier beneath the Pharos beacon.',
        story:
          'Engraved brass spyglass aimed straight across the Inland Sea toward Hogwarts turrets.',
      },
      {
        stopIdx: 1,
        title: 'Banner’s Gamma Lab Blueprint',
        icon: '⚛️',
        bearingDeg: 295,
        distanceMeters: 52,
        hint: 'Check the waterfront walkway northwest of the green coaster tube.',
        story:
          'Comic-style schematic detailing the uphill accelerator coil energy draw.',
      },
      {
        stopIdx: 3,
        title: 'Amber Fossil Ridge Bench',
        icon: '🦟',
        bearingDeg: 165,
        distanceMeters: 48,
        hint: 'Slip south beside the VelociCoaster lagoon rocks.',
        story:
          'Polished golden amber dome enshrining a prehistoric Isla Nublar fossil prop.',
      },
      {
        stopIdx: 5,
        title: 'Three Broomsticks Owlery Perch',
        icon: '🦉',
        bearingDeg: 270,
        distanceMeters: 46,
        hint: 'Stroll west under the timber rafters overlooking Hogsmeade rooftops.',
        story:
          'Quiet stone eaves where roosting owls hoot above the cobbled snow village.',
      },
      {
        stopIdx: 9,
        title: 'Sneetch Beach Palm Curve',
        icon: '🌴',
        bearingDeg: 35,
        distanceMeters: 52,
        hint: 'Explore northeast along the pastel waterfront lagoon edge.',
        story:
          'Star-bellied beach marker nestled beneath Seuss Landing’s famously curving palms.',
      },
    ],
  ),

  uor_epic_universe: buildParkSecretTemplates(
    'uor_epic_universe',
    STAGE3_THEME_PARK_LANDMARKS.uor_epic_universe,
    [
      {
        stopIdx: 0,
        title: 'Celestial Starlight Astrolabe',
        icon: '🔭',
        bearingDeg: 45,
        distanceMeters: 52,
        hint: 'Detour northeast into the terraced water gardens around Chronos.',
        story:
          'Spinning gilded celestial armillary dial charting every portal constellation.',
      },
      {
        stopIdx: 2,
        title: 'Hidden 8-Bit Pixel Block',
        icon: '🟨',
        bearingDeg: 310,
        distanceMeters: 48,
        hint: 'Explore northwest behind the colorful Mushroom Kingdom upper terrace.',
        story:
          'Secret golden coin relief tucking retro 1985 arcade tribute art into the stonework.',
      },
      {
        stopIdx: 5,
        title: 'Place Cachée Owl-Post Kiosk',
        icon: '📜',
        bearingDeg: 75,
        distanceMeters: 50,
        hint: 'Walk east down the quiet 1920s Parisian flower-market side street.',
        story:
          'Art Nouveau wrought-iron kiosk stamped with wizarding Parisian newspapers.',
      },
      {
        stopIdx: 7,
        title: 'Darkmoor Staked Lantern Crypt',
        icon: '🦇',
        bearingDeg: 235,
        distanceMeters: 54,
        hint: 'Check the misty stone churchyard southwest of Burning Blade Tavern.',
        story:
          'Iron hound lantern marking the ancient cobblestone border of Darkmoor.',
      },
      {
        stopIdx: 9,
        title: 'Isle of Berk Night Fury Alcove',
        icon: '🐉',
        bearingDeg: 135,
        distanceMeters: 56,
        hint: 'Follow the wooden Viking sea-dock southeast around Berk’s harbor basin.',
        story:
          'Carved wooden dragon-scale shield hidden overlooking the towering sea stacks.',
      },
    ],
  ),

  ush_hollywood: buildParkSecretTemplates(
    'ush_hollywood',
    STAGE3_THEME_PARK_LANDMARKS.ush_hollywood,
    [
      {
        stopIdx: 0,
        title: 'Golden Age Camera Tripod Marker',
        icon: '📽️',
        bearingDeg: 45,
        distanceMeters: 52,
        hint: 'Wander northeast past the classic Art Deco studio gates.',
        story:
          'Bronze 1915 silent-era motion picture camera marker celebrating Universal City’s founding.',
      },
      {
        stopIdx: 1,
        title: 'Hogsmeade Canyon Overlook',
        icon: '🦉',
        bearingDeg: 155,
        distanceMeters: 54,
        hint: 'Step southeast onto the stone terrace beside Three Broomsticks.',
        story:
          'Rare sightline where snowy Hogwarts rooftops frame real Burbank soundstages below.',
      },
      {
        stopIdx: 5,
        title: '1964 Glamour Tram Bell',
        icon: '🔔',
        bearingDeg: 115,
        distanceMeters: 54,
        hint: 'Check the eastern canyon overlook beside the Studio Tour boarding ramps.',
        story:
          'Original brass dispatch bell celebrating sixty years of working movie backlot tours.',
      },
      {
        stopIdx: 6,
        title: 'Hill Valley 1.21-Gigawatt Cable Marker',
        icon: '⚡',
        bearingDeg: 155,
        distanceMeters: 50,
        hint: 'Inspect the lamppost south of the Courthouse Square clocktower steps.',
        story:
          'Historic cinema marker remembering the exact clocktower lightning hook sequence.',
      },
      {
        stopIdx: 8,
        title: 'Starway Lower Lot Soundstage Plaque',
        icon: '🎬',
        bearingDeg: 205,
        distanceMeters: 52,
        hint: 'Detour southwest along the base of the hillside Starway escalators.',
        story:
          'Studio production map charting active soundstages surrounding the Lower Lot.',
      },
    ],
  ),

  tdr_disneyland: buildParkSecretTemplates(
    'tdr_disneyland',
    STAGE3_THEME_PARK_LANDMARKS.tdr_disneyland,
    [
      {
        stopIdx: 0,
        title: 'World Bazaar Brass Bandstand',
        icon: '🎺',
        bearingDeg: 215,
        distanceMeters: 48,
        hint: 'Walk southwest beneath the side arcade arches near Penny Arcade.',
        story:
          'Victorian cast-iron gazebo corner where Tokyo Disneyland’s Bicycle Piano performs.',
      },
      {
        stopIdx: 1,
        title: 'Walt & Mickey Partners Rose Terrace',
        icon: '🌹',
        bearingDeg: 110,
        distanceMeters: 50,
        hint: 'Check the manicured rose bed east of Cinderella Castle Plaza.',
        story:
          'Peaceful floral border framing the towering turquoise castle spires over Tokyo Bay.',
      },
      {
        stopIdx: 2,
        title: 'Maurice’s Cottage Waterwheel',
        icon: '⚙️',
        bearingDeg: 320,
        distanceMeters: 52,
        hint: 'Stroll northwest behind Belle’s pink alpine village lanes.',
        story:
          'Creaking wooden waterwheel and provincial inventor signs tucked behind La Taverne de Gaston.',
      },
      {
        stopIdx: 6,
        title: 'Big Thunder Coyote Mesa Arch',
        icon: '🏜️',
        bearingDeg: 295,
        distanceMeters: 54,
        hint: 'Detour northwest along the Rivers of America wooden boardwalk.',
        story:
          'Weathered western ore cart resting opposite Mark Twain steamboat landing.',
      },
      {
        stopIdx: 8,
        title: 'Monstropolis CDA Hardhat Locker',
        icon: '👷',
        bearingDeg: 120,
        distanceMeters: 50,
        hint: 'Peek southeast beside the Monsters, Inc. company brick alley.',
        story:
          'Numbered yellow Child Detection Agency locker engraved with Tokyo easter eggs.',
      },
    ],
  ),

  tdr_disneysea: buildParkSecretTemplates(
    'tdr_disneysea',
    STAGE3_THEME_PARK_LANDMARKS.tdr_disneysea,
    [
      {
        stopIdx: 0,
        title: 'Fortress Explorations Leonardo Astrolabe',
        icon: '🧭',
        bearingDeg: 255,
        distanceMeters: 56,
        hint: 'Cross west to the Renaissance stone ramparts along Mediterranean Harbor.',
        story:
          'Working Renaissance navigation dome and Foucault pendulum inside S.E.A. headquarters.',
      },
      {
        stopIdx: 2,
        title: 'Captain Nemo’s Nautilus Brass Hatch',
        icon: '⚙️',
        bearingDeg: 335,
        distanceMeters: 50,
        hint: 'Explore the north catwalk beneath Mount Prometheus’s caldera waterfall.',
        story:
          'Rivet-studded brass submersible hatch hissing gentle steam beside the emerald lagoon.',
      },
      {
        stopIdx: 5,
        title: 'Hightower Hotel Explorers’ Ledger',
        icon: '📔',
        bearingDeg: 55,
        distanceMeters: 52,
        hint: 'Walk northeast through Liberty Square gardens beside Hotel Hightower.',
        story:
          'Stone pedestal recounting Harrison Hightower III’s fateful 1899 Congo expedition.',
      },
      {
        stopIdx: 7,
        title: 'Lost River Steamship Mail Box',
        icon: '✉️',
        bearingDeg: 185,
        distanceMeters: 54,
        hint: 'Follow the jungle riverbank south past the Aztec step pyramid.',
        story:
          'Mossy 1930s jungle outpost dispatch box beside the DisneySea Electric Railway viaduct.',
      },
      {
        stopIdx: 9,
        title: 'Rapunzel’s Corona Stone Lantern',
        icon: '🏮',
        bearingDeg: 120,
        distanceMeters: 52,
        hint: 'Detour southeast around the rock-carved waterfalls of Fantasy Springs.',
        story:
          'Hand-carved golden sun emblem illuminating the quiet riverside path below Corona Tower.',
      },
    ],
  ),

  dlp_disneyland: buildParkSecretTemplates(
    'dlp_disneyland',
    STAGE3_THEME_PARK_LANDMARKS.dlp_disneyland,
    [
      {
        stopIdx: 0,
        title: 'Discovery Arcade Edison Inventor Alcove',
        icon: '💡',
        bearingDeg: 65,
        distanceMeters: 48,
        hint: 'Step east into the covered Victorian stained-glass Discovery Arcade.',
        story:
          '19th-century patent diorama cases celebrating Verne-era flying machines and lamps.',
      },
      {
        stopIdx: 1,
        title: 'Square-Pruned Château Terrace',
        icon: '🌳',
        bearingDeg: 25,
        distanceMeters: 50,
        hint: 'Wander northeast behind the pink castle spires past the stone bridge.',
        story:
          'Inspired directly by Medieval French illuminated manuscripts where trees are sculpted into geometric cubes.',
      },
      {
        stopIdx: 2,
        title: 'Boot Hill Beating-Heart Tombstone',
        icon: '🖤',
        bearingDeg: 215,
        distanceMeters: 46,
        hint: 'Explore the hilltop cemetery southwest of Phantom Manor’s porch.',
        story:
          'Engraved stone tomb echoing a faint rhythmic thump into the quiet Frontierland dusk.',
      },
      {
        stopIdx: 5,
        title: 'Ben Gunn’s Lantern Cave',
        icon: '⚓',
        bearingDeg: 145,
        distanceMeters: 52,
        hint: 'Slip southeast off the Adventure Isle suspension rope trail.',
        story:
          'Echoing hollow boulder gallery concealing stacked pirate barrels and lantern reflections.',
      },
      {
        stopIdx: 9,
        title: 'Columbiad Space Cannon Brass Sight',
        icon: '🔭',
        bearingDeg: 155,
        distanceMeters: 54,
        hint: 'Step southeast beneath the copper ribs of Discoveryland’s grand dome.',
        story:
          'Jules Verne astrolabe engraving aligned straight along the uphill cannon launch track.',
      },
    ],
  ),

  // Transferable Hidden City Gems (Paris, Tokyo, Atlanta)
  paris: buildParkSecretTemplates('paris', STAGE1_AND_CITY_ANCHORS.paris, [
    {
      stopIdx: 0,
      title: 'Champ de Mars Cast-Iron Gazebo',
      icon: '💎',
      bearingDeg: 120,
      distanceMeters: 58,
      hint: 'Stroll southeast off the main gravel axis under the linden trees.',
      story:
        'Romantic 19th-century wrought-iron kiosk framing the Eiffel Tower legs through tree branches.',
      kind: 'city_gem',
    },
    {
      stopIdx: 1,
      title: 'Louvre Cour Carrée Sunset Fountain',
      icon: '⛲',
      bearingDeg: 85,
      distanceMeters: 62,
      hint: 'Walk east through the Renaissance archway from the Glass Pyramid.',
      story:
        'Quiet octagonal stone courtyard echoing softly far away from the main museum crowds.',
      kind: 'city_gem',
    },
    {
      stopIdx: 2,
      title: 'Square Jean XXIII Flying-Buttress Garden',
      icon: '🌹',
      bearingDeg: 140,
      distanceMeters: 54,
      hint: 'Slip behind the apse southeast of Notre-Dame parvis.',
      story:
        'Intimate Seine-side rose garden offering the cleanest upward angle of Gothic stone arches.',
      kind: 'city_gem',
    },
    {
      stopIdx: 2,
      title: 'Bouquiniste Green Bookstall #42',
      icon: '📚',
      bearingDeg: 295,
      distanceMeters: 60,
      hint: 'Follow the stone parapet northwest along the Left Bank quay.',
      story:
        'Century-old UNESCO heritage padlocked green box stocked with rare Paris lithographs.',
      kind: 'city_gem',
    },
    {
      stopIdx: 3,
      title: 'Avenue Foch Triumph Perspective Bench',
      icon: '🏛️',
      bearingDeg: 255,
      distanceMeters: 64,
      hint: 'Detour slightly west onto the wide tree-canopied side boulevard.',
      story:
        'Golden-hour axis line revealing Haussmann’s twelve-spoke urban star without traffic clutter.',
      kind: 'city_gem',
    },
  ]),

  tokyo: buildParkSecretTemplates('tokyo', STAGE1_AND_CITY_ANCHORS.tokyo, [
    {
      stopIdx: 0,
      title: 'Nonbei Yokocho Lantern Alley',
      icon: '🏮',
      bearingDeg: 35,
      distanceMeters: 62,
      hint: 'Step northeast off Shibuya scramble past the rail viaduct.',
      story:
        'Narrow Showa-era lane strung with warm paper lanterns beside tiny five-seat yakitori counters.',
      kind: 'city_gem',
    },
    {
      stopIdx: 1,
      title: 'Meiji Forest Sake Barrel Wall',
      icon: '🍶',
      bearingDeg: 135,
      distanceMeters: 55,
      hint: 'Explore the shaded gravel path southeast inside the cypress grove.',
      story:
        'Towering rainbow mosaic of straw-wrapped kazaridaru barrels gifted from brewers across Japan.',
      kind: 'city_gem',
    },
    {
      stopIdx: 2,
      title: 'Denboin Cedar Street Overlook',
      icon: '⛩️',
      bearingDeg: 245,
      distanceMeters: 58,
      hint: 'Duck west off Nakamise-dori onto Edo-styled wooden storefront row.',
      story:
        'Quiet lantern lane framing Tokyo Skytree rising sharply over 17th-century tiled gables.',
      kind: 'city_gem',
    },
    {
      stopIdx: 2,
      title: 'Asakusa Five-Story Pagoda Koi Bridge',
      icon: '🎏',
      bearingDeg: 295,
      distanceMeters: 52,
      hint: 'Look northwest around the tranquil temple pond west of the main hall.',
      story:
        'Reflected vermilion pagoda eaves hovering calmly above bright koi.',
      kind: 'city_gem',
    },
    {
      stopIdx: 3,
      title: 'Zojo-ji Temple Black Gate Pine Walk',
      icon: '🌲',
      bearingDeg: 20,
      distanceMeters: 60,
      hint: 'Walk north across the temple terrace toward Tokyo Tower’s legs.',
      story:
        'Dramatic contrast of Edo-era timber roofs foregrounding the bright orange 1958 steel spire.',
      kind: 'city_gem',
    },
  ]),

  atlanta: buildParkSecretTemplates(
    'atlanta',
    STAGE1_AND_CITY_ANCHORS.atlanta,
    [
      {
        stopIdx: 0,
        title: 'Clara Meer Stone Pavilion Pier',
        icon: '💎',
        bearingDeg: 120,
        distanceMeters: 55,
        hint: 'Walk southeast down to the granite lakeside gazebo.',
        story:
          '1912 Olmsted-designed water overlook framing Midtown’s glass skyline over still reflections.',
        kind: 'city_gem',
      },
      {
        stopIdx: 1,
        title: 'BeltLine Tiny Doorway & Mural',
        icon: '🎨',
        bearingDeg: 170,
        distanceMeters: 50,
        hint: 'Look along the brick rail abutment south of Ponce City Market.',
        story:
          'Miniature six-inch hand-crafted Atlanta street art portal tucked right beside the paved trail.',
        kind: 'city_gem',
      },
      {
        stopIdx: 2,
        title: 'Fox Arcade Moorish Copper Lantern',
        icon: '🏮',
        bearingDeg: 230,
        distanceMeters: 48,
        hint: 'Walk under the shaded Peachtree colonnade southwest of the marquee.',
        story:
          'Ornately pierced 1929 Alhambra brass sconce glowing softly under the theater arcade.',
        kind: 'city_gem',
      },
      {
        stopIdx: 3,
        title: '1996 Centennial Flame Torch',
        icon: '🔥',
        bearingDeg: 35,
        distanceMeters: 56,
        hint: 'Follow the brick amphitheater steps northeast above the Fountain of Rings.',
        story:
          'Commemorative Olympic cauldrons and brick plaza marking Atlanta’s 1996 Summer Games heart.',
        kind: 'city_gem',
      },
      {
        stopIdx: 4,
        title: 'Sweet Auburn Heritage Curbstone',
        icon: '🕊️',
        bearingDeg: 85,
        distanceMeters: 54,
        hint: 'Stroll east past the brick historic row along Auburn Avenue.',
        story:
          'Preserved neighborhood markers tracing the civic leaders and churches of Sweet Auburn.',
        kind: 'city_gem',
      },
    ],
  ),
  ...RESORT_HIDDEN_SECRETS_CATALOG,
  ...NEXT_EXPERIENCE_HIDDEN_SECRETS_CATALOG,
});

/**
 * Returns curated Hidden Secrets (for all 13 Theme Park Days) or Hidden City Gems
 * (for Paris, Tokyo, Atlanta + deterministic Mulberry32 off-route gems on any other tour).
 */
export function getHiddenSecretsForTour(cityId, landmarks = []) {
  const key = String(cityId || '')
    .trim()
    .toLowerCase();
  if (key && HIDDEN_SECRETS_CATALOG[key]) {
    return HIDDEN_SECRETS_CATALOG[key].map((s) => ({ ...s }));
  }
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  const rng = createMulberry32(hashStringToSeed(`gems:${key || 'city'}`));
  const count = Math.min(5, Math.max(3, landmarks.length));
  const gems = [];
  for (let i = 0; i < count; i += 1) {
    const anchor = landmarks[i % landmarks.length];
    const bearingDeg = Math.round(rng() * 360);
    const distanceMeters = Math.round(45 + rng() * 35);
    const cardinal = compassCardinal(
      anchor.lat,
      anchor.lon,
      ...Object.values(
        offsetLatLonByMeters(
          anchor.lat,
          anchor.lon,
          bearingDeg,
          distanceMeters,
        ),
      ),
    );
    gems.push(
      makeOffRouteSecret({
        id: `${key || 'city'}_gem_${i + 1}`,
        title: `${anchor.name} Hidden Gem`,
        icon: '💎',
        hint: `Detour ~${distanceMeters}m ${cardinal} off ${anchor.name}.`,
        story: `Off-route local discovery tucked quietly off ${anchor.name}.`,
        anchorLat: anchor.lat,
        anchorLon: anchor.lon,
        anchorElev: anchor.elev || 32,
        bearingDeg,
        distanceMeters,
        land: anchor.land || anchor.category || '',
        kind: 'city_gem',
      }),
    );
  }
  return gems;
}

// ---------- Day Passport Persistence ----------

const memoryPassportFallback = { collectedByCity: {} };
const passportListeners = new Set();

function emitPassportChange() {
  const snapshot = loadDayPassport();
  for (const cb of passportListeners) {
    try {
      cb(snapshot);
    } catch {}
  }
}

export function loadDayPassport() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PASSPORT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.collectedByCity === 'object') {
          return {
            collectedByCity: { ...parsed.collectedByCity },
          };
        }
      }
    }
  } catch {}
  return {
    collectedByCity: { ...memoryPassportFallback.collectedByCity },
  };
}

function saveDayPassport(passport) {
  const safe = {
    collectedByCity: passport?.collectedByCity || {},
  };
  memoryPassportFallback.collectedByCity = { ...safe.collectedByCity };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(safe));
    }
  } catch {}
}

export function collectHiddenSecret(cityId, secret) {
  const key = String(cityId || '')
    .trim()
    .toLowerCase();
  const secretId = typeof secret === 'string' ? secret : secret?.id;
  if (!key || !secretId) {
    return { ok: false, newlyCollected: false, passport: loadDayPassport() };
  }
  const passport = loadDayPassport();
  const existing = Array.isArray(passport.collectedByCity[key])
    ? [...passport.collectedByCity[key]]
    : [];
  if (existing.includes(secretId)) {
    return { ok: true, newlyCollected: false, secretId, passport };
  }
  existing.push(secretId);
  passport.collectedByCity[key] = existing;
  saveDayPassport(passport);
  emitPassportChange();
  return { ok: true, newlyCollected: true, secretId, passport };
}

export function getPassportProgress(cityId, secrets = []) {
  const key = String(cityId || '')
    .trim()
    .toLowerCase();
  const passport = loadDayPassport();
  const collectedIds = new Set(passport.collectedByCity[key] || []);
  const list = Array.isArray(secrets) ? secrets : [];
  const total = list.length;
  const collectedSecrets = list.filter((s) => collectedIds.has(s.id));
  const uncollectedSecrets = list.filter((s) => !collectedIds.has(s.id));
  const collected = collectedSecrets.length;
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  return {
    cityId: key,
    collected,
    total,
    percent,
    complete: total > 0 && collected >= total,
    collectedIds: Array.from(collectedIds),
    collectedSecrets,
    uncollectedSecrets,
  };
}

export function clearDayPassportForTest() {
  memoryPassportFallback.collectedByCity = {};
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PASSPORT_STORAGE_KEY);
    }
  } catch {}
  emitPassportChange();
}

export function onPassportChange(cb) {
  if (typeof cb !== 'function') return () => {};
  passportListeners.add(cb);
  return () => passportListeners.delete(cb);
}

// ---------- Interactive Clue-Giving Park NPCs (Mulberry32) ----------

export const PARK_NPC_ROLES = Object.freeze([
  {
    id: 'ride_op',
    roleLabel: 'Ride Operator',
    icon: '🎢',
    colorHex: '#38bdf8',
    names: ['Maya', 'Devon', 'Kenji', 'Camille', 'Samir', 'Elena'],
    greetings: [
      'All clear on the load platform! Welcome back to the midway.',
      'Just finished safety dispatch—glad you two caught us at golden pacing.',
      'Standby line is humming smoothly right now; perfect window to explore.',
    ],
  },
  {
    id: 'street_performer',
    roleLabel: 'Street Performer',
    icon: '🎭',
    colorHex: '#f472b6',
    names: ['Julian', 'Clara', 'Ren', 'Matteo', 'Nadia', 'Theo'],
    greetings: [
      'Encore set starts in ten! You’ve got front-row acoustics right here.',
      'Love seeing folks slow down off the main path to catch a street tune.',
      'The courtyard echoes carry every brass note—stick around a moment!',
    ],
  },
  {
    id: 'food_vendor',
    roleLabel: 'Food Cart Vendor',
    icon: '🍿',
    colorHex: '#fbbf24',
    names: [
      'Chef Rosa',
      'Chef Ken',
      'Chef Marie',
      'Chef Omar',
      'Chef Leo',
      'Chef Hana',
    ],
    greetings: [
      'Fresh batch just hit the warmer—can you smell that cinnamon sugar from here?',
      'Best snack window of the day right between meal rushes!',
      'Cold brew and warm pastries just came out; grab something for the walk!',
    ],
  },
  {
    id: 'fellow_fan',
    roleLabel: 'Fellow Park Fan',
    icon: '🎒',
    colorHex: '#34d399',
    names: ['Alex', 'Priya', 'Noah', 'Sora', 'Lucas', 'Mina'],
    greetings: [
      'Pin-traded my way across half the park since rope drop—how’s your Passport?',
      'Wait until you see the architectural details tucked behind these side walkways!',
      'I’ve walked this loop a dozen times and still spot new details every visit.',
    ],
  },
]);

export const RESORT_NPC_ROLES = Object.freeze([
  {
    id: 'concierge',
    roleLabel: 'Resort Concierge',
    icon: '🛎️',
    colorHex: '#38bdf8',
    names: ['Elena', 'Marcus', 'Claire', 'Tariq', 'Hannah', 'Julian'],
    greetings: [
      'Welcome home to the resort! Taking a well-earned Day Off on property?',
      'Fresh towels, paddleboats, and evening fire pits are all lined up for you today.',
      'Whenever you’re ready to head out to the parks or downtown, our shuttle desk has you covered.',
    ],
  },
  {
    id: 'poolside_server',
    roleLabel: 'Poolside Server',
    icon: '🍹',
    colorHex: '#f59e0b',
    names: ['Sofia', 'Kai', 'Mateo', 'Leilani', 'Devon', 'Nadia'],
    greetings: [
      'Sun’s warm and the lagoon breeze is perfect—can I bring something chilled to your cabana?',
      'Best poolside hour right before golden hour hits the water!',
      'Fresh coastal seafood bites and citrus refreshers just came off the terrace grill.',
    ],
  },
  {
    id: 'golf_pro',
    roleLabel: 'Resort Golf Pro',
    icon: '⛳',
    colorHex: '#34d399',
    names: [
      'Coach Owen',
      'Coach Priya',
      'Coach Grant',
      'Coach Lin',
      'Coach Cole',
      'Coach Tessa',
    ],
    greetings: [
      'Fairways are rolling fast this afternoon—golf carts are charged and ready at the bag drop!',
      'If you’re cruising the course loop, watch how the breeze shifts near the water hazards.',
      'Even a nine-hole casual loop or a bucket at the range makes a great Day Off.',
    ],
  },
  {
    id: 'fellow_guest',
    roleLabel: 'Fellow Resort Guest',
    icon: '🧳',
    colorHex: '#f472b6',
    names: ['Jordan', 'Mina', 'Samir', 'Tess', 'Lucas', 'Chloe'],
    greetings: [
      'We skipped the early park rush today to enjoy the resort pools—zero regrets!',
      'Wait until dusk hits the fire pit lawn; it’s the best hidden view on the whole property.',
      'Have you spotted all the off-path resort gems yet? There’s a quiet overlook just past the deck.',
    ],
  },
]);

export const WATER_PARK_NPC_ROLES = Object.freeze([
  {
    id: 'lifeguard',
    roleLabel: 'Alpine Lifeguard',
    icon: '🛟',
    colorHex: '#0284c7',
    names: ['Kendra', 'Toby', 'Marisol', 'Owen', 'Nadia', 'Caleb'],
    greetings: [
      'Cross Country Creek water temp is dialed to perfection today—hop in a tube!',
      'Heads up: Summit Plummet hits nearly 60 mph down the ski jump!',
      'Check the sandy edge of Melt-Away Bay if you are hunting hidden park markers.',
    ],
  },
  {
    id: 'lift_attendant',
    roleLabel: 'Chairlift Operator',
    icon: '🚡',
    colorHex: '#38bdf8',
    names: ['Gavin', 'Rory', 'Tessa', 'Miles', 'Hana', 'Devon'],
    greetings: [
      'Mount Gushmore Chairlift is running smooth—best aerial views in Orlando!',
      'Step right onto the loading carpet; umbrellas overhead keep the Florida sun off.',
      'From the top of Green Slope you can spot EPCOT and Animal Kingdom on the horizon!',
    ],
  },
  {
    id: 'chalet_server',
    roleLabel: 'Chalet Snack Host',
    icon: '🍨',
    colorHex: '#f59e0b',
    names: ['Bree', 'Mateo', 'Clara', 'Jules', 'Sienna', 'Theo'],
    greetings: [
      'Fresh cinnamon mini donuts just came out warm by the Beach Haus!',
      'Save room for a Sand Pail Sundae on the Lottawatta Lodge deck at golden hour.',
      'Ice-cold tropical smoothies are ready right beside the lazy river exit!',
    ],
  },
  {
    id: 'fellow_tuber',
    roleLabel: 'Lazy River Regular',
    icon: '🏖️',
    colorHex: '#a78bfa',
    names: ['Sam', 'Ari', 'Noah', 'Maya', 'Leo', 'Zoe'],
    greetings: [
      'Pro tip: do one full lazy river float first to scope out every slope from below!',
      'Watch out for the melting icicle drip inside the Mount Gushmore cave—brrr!',
      'Have you found Ice Gator’s hidden footprint marker behind the Beach Haus yet?',
    ],
  },
]);

export const OUTDOOR_PARK_NPC_ROLES = Object.freeze([
  {
    id: 'park_ranger',
    roleLabel: 'State Park Ranger',
    icon: '🌲',
    colorHex: '#15803d',
    names: [
      'Ranger Clay',
      'Ranger Hannah',
      'Ranger Cole',
      'Ranger Mae',
      'Ranger Boone',
      'Ranger Avery',
    ],
    greetings: [
      'Welcome out on the trails! Keep an eye out for historic stonework and lakeside vistas.',
      'Golden hour hits the water and mountain ridges right around 6 PM—stick around for campfire dusk!',
      'We tucked five local heritage markers just off the main trail for curious walkers.',
    ],
  },
  {
    id: 'adventure_guide',
    roleLabel: 'Trail & River Guide',
    icon: '🛶',
    colorHex: '#0ea5e9',
    names: ['Sierra', 'Garrett', 'Lydia', 'Wyatt', 'Kira', 'Ben'],
    greetings: [
      'Water clarity is awesome today—ideal conditions for tubing, paddling, or mountain biking!',
      'Check out the canopy ziplines and ridge views before heading down toward the lakefront.',
      'Ask around near the trailheads—locals love pointing out the best valley sightlines!',
    ],
  },
  {
    id: 'local_historian',
    roleLabel: 'Valley Historian',
    icon: '🏛️',
    colorHex: '#d97706',
    names: ['Evelyn', 'Arthur', 'Nora', 'Walter', 'June', 'Calvin'],
    greetings: [
      'Every trail grade and timber blockhouse out here carries centuries of Appalachian & Piedmont stories.',
      'Step just 40 meters off the main walk and you’ll spot historic plaques most day-trippers miss!',
      'Take a slow pause at the overlook—this valley has welcomed travelers for generations.',
    ],
  },
  {
    id: 'fellow_hiker',
    roleLabel: 'Fellow Explorer',
    icon: '🥾',
    colorHex: '#a855f7',
    names: ['Parker', 'Riley', 'Morgan', 'Drew', 'Quinn', 'Casey'],
    greetings: [
      'Hands down one of the most varied outdoor parks in the Southeast—so much packed into one loop!',
      'Wait until you see the sunset reflections off the water—totally worth the detour.',
      'Did you spot the hidden scenic bench off the side path? Best photo angle in the park!',
    ],
  },
]);

export const BOARDWALK_STRIP_NPC_ROLES = Object.freeze([
  {
    id: 'boardwalk_historian',
    roleLabel: 'Neon & Landmark Guide',
    icon: '🎩',
    colorHex: '#f59e0b',
    names: ['Sal', 'Lorraine', 'Vinnie', 'Gloria', 'Frankie', 'Margo'],
    greetings: [
      'Welcome to the bright lights! Every corner out here has a century of showbiz and boardwalk lore.',
      'Look closely at the street signs and vintage marquees—there are hidden Easter eggs tucked off the boulevard!',
      'Stick around past sunset when the neon reflections light up the whole promenade.',
    ],
  },
  {
    id: 'show_concierge',
    roleLabel: 'Entertainment Concierge',
    icon: '✨',
    colorHex: '#ec4899',
    names: ['Celeste', 'Dante', 'Valerie', 'Roman', 'Bianca', 'Gabe'],
    greetings: [
      'Tonight’s light and fountain show timing is spot-on—grab a rail spot right before dusk!',
      'Want a fast skyline view? Hop the elevated 3D ride or observation wheel!',
      'Between vintage downtown neon and the main promenade, you get two completely different worlds.',
    ],
  },
  {
    id: 'treat_vendor',
    roleLabel: 'Promenade Treat Vendor',
    icon: '🎡',
    colorHex: '#38bdf8',
    names: ['Lou', 'Rosa', 'Mikey', 'Nina', 'Eddie', 'Talia'],
    greetings: [
      'Salt water taffy, warm churros, or espresso gelato—you can’t stroll the strip empty-handed!',
      'Classic snacks taste twice as good right beside the surf or dancing fountains.',
      'Check behind the plaza arches—there’s a cool historic plaque hiding right off the walkway!',
    ],
  },
  {
    id: 'fellow_stroller',
    roleLabel: 'Night-Walk Regular',
    icon: '🎆',
    colorHex: '#a78bfa',
    names: ['Kieran', 'Sasha', 'Devon', 'Mina', 'Theo', 'Lola'],
    greetings: [
      'Best walking spectacle on Earth once twilight rolls in and every tower lights up!',
      'Don’t skip the historic side streets—half the fun is spotting the classic landmarks off the main strip.',
      'Have you collected all five passport secrets on this promenade yet?',
    ],
  },
]);

export function generateParkNpcsForTour(
  cityId,
  landmarks = [],
  secrets = [],
  { venueCategory = null } = {},
) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  const key = String(cityId || '')
    .trim()
    .toLowerCase();
  const resolvedCategory =
    venueCategory ||
    (isResortStayId(key)
      ? 'resort_stay'
      : isNextExperienceId(key)
        ? NEXT_EXPERIENCE_METADATA[NEXT_EXPERIENCE_ALIASES[key] || key]
            ?.venueCategory || null
        : null);
  const rolePool =
    resolvedCategory === 'resort_stay'
      ? RESORT_NPC_ROLES
      : resolvedCategory === 'water_park'
        ? WATER_PARK_NPC_ROLES
        : resolvedCategory === 'state_park' ||
            resolvedCategory === 'mountain_adventure'
          ? OUTDOOR_PARK_NPC_ROLES
          : resolvedCategory === 'boardwalk_strip'
            ? BOARDWALK_STRIP_NPC_ROLES
            : PARK_NPC_ROLES;
  const rng = createMulberry32(hashStringToSeed(`npcs:${key}`));
  const step = Math.max(1, Math.floor(landmarks.length / rolePool.length));

  return rolePool.map((role, idx) => {
    const stopIndex = Math.min(landmarks.length - 1, idx * step);
    const stop = landmarks[stopIndex] || landmarks[0];
    const bearingDeg = Math.round((idx * 85 + 25 + rng() * 40) % 360);
    const distM = Math.round(18 + rng() * 14);
    const pos = offsetLatLonByMeters(stop.lat, stop.lon, bearingDeg, distM);
    const npcName = role.names[Math.floor(rng() * role.names.length)];
    const greeting = role.greetings[Math.floor(rng() * role.greetings.length)];
    const targetSecret =
      secrets.length > 0 ? secrets[idx % secrets.length] : null;
    const insiderTip =
      (role.id === 'food_vendor' || role.id === 'poolside_server') &&
      stop.snackNote
        ? `Local dining tip near ${stop.name}: ask for "${stop.snackNote}".`
        : role.id === 'golf_pro' && stop.amenityTag
          ? `Course & amenity tip near ${stop.name}: ${stop.amenityTag} — switch to Golf Cart mode for the fairway loop!`
          : role.id === 'ride_op' && Number.isFinite(stop.estimatedWaitMin)
            ? `Current pacing around ${stop.name}: ~${stop.estimatedWaitMin} min posted wait.`
            : `Insider detail near ${stop.name}: ${stop.companionNote || stop.lore || 'Enjoy the atmosphere!'}`;

    return {
      id: `${key}_npc_${role.id}`,
      role: role.id,
      roleLabel: role.roleLabel,
      icon: role.icon,
      colorHex: role.colorHex,
      name: npcName,
      greeting,
      insiderTip,
      anchorStopId: stop.id,
      anchorStopName: stop.name,
      anchorLand: stop.land || '',
      targetSecretId: targetSecret?.id || null,
      lat: pos.lat,
      lon: pos.lon,
      elev: stop.elev || 32,
      seed: hashStringToSeed(`${key}:${role.id}`),
      isResortNpc: resolvedCategory === 'resort_stay',
    };
  });
}

export function buildNpcDialogue(
  npc,
  {
    uncollectedSecrets = [],
    companionName = getCompanionPersonaName(),
    interactionCount = 0,
  } = {},
) {
  if (!npc) return null;
  const rng = createMulberry32(
    (npc.seed || 1) + Math.max(0, Number(interactionCount) || 0) * 977,
  );
  const targetSecret =
    uncollectedSecrets.find((s) => s.id === npc.targetSecretId) ||
    uncollectedSecrets[Math.floor(rng() * uncollectedSecrets.length)] ||
    null;

  let clue =
    'Every hidden secret in this park is stamped in your Day Passport—amazing exploring!';
  if (targetSecret) {
    const dist = Math.round(
      haversineDistanceMeters(
        npc.lat,
        npc.lon,
        targetSecret.lat,
        targetSecret.lon,
      ),
    );
    const dir = compassCardinal(
      npc.lat,
      npc.lon,
      targetSecret.lat,
      targetSecret.lon,
    );
    clue = `Scavenger Clue: "${targetSecret.title}" (${targetSecret.icon}) is ~${dist}m ${dir} from here — ${targetSecret.hint}`;
  }

  const banterPool = [
    `${companionName}: "Love talking with park regulars like ${npc.name}—let's check out that ${targetSecret ? targetSecret.title : 'next view'}!"`,
    `${companionName}: "Added ${npc.name}'s tip straight to our notebook—good thing we slowed down off the main path!"`,
    `${companionName}: "${npc.role === 'food_vendor' ? 'Now I definitely want that snack break!' : 'Such a cool hidden detail—let’s scout it on foot!'}"`,
  ];
  const companionBanter = banterPool[Math.floor(rng() * banterPool.length)];

  return {
    npcId: npc.id,
    npcName: npc.name,
    role: npc.role,
    roleLabel: npc.roleLabel,
    icon: npc.icon,
    greeting: npc.greeting,
    tip: npc.insiderTip,
    clue,
    targetSecretId: targetSecret?.id || null,
    companionBanter,
    fullMessage: `${npc.greeting} ${npc.insiderTip} ${clue}`,
  };
}

// ---------- Memoized SVG Billboard Textures (Zero Cesium.Label) ----------

const billboardUriCache = new Map();

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSecretBillboardUri(secret, collected) {
  const icon = String(secret?.icon || '🪙').slice(0, 4);
  const cacheKey = `secret:${icon}:${collected ? '1' : '0'}`;
  if (billboardUriCache.has(cacheKey)) return billboardUriCache.get(cacheKey);
  const ring = collected ? '#10b981' : '#fbbf24';
  const fill = collected ? '#064e3b' : '#451a03';
  const badge = collected ? '✓' : escapeXml(icon);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="19" fill="${fill}" fill-opacity="0.92" stroke="${ring}" stroke-width="3"/>
    <text x="22" y="27" text-anchor="middle" font-size="18" font-family="sans-serif" fill="#ffffff">${badge}</text>
  </svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  billboardUriCache.set(cacheKey, uri);
  return uri;
}

function getNpcBillboardUri(npc, highlighted) {
  const icon = String(npc?.icon || '🎭').slice(0, 4);
  const color = npc?.colorHex || '#38bdf8';
  const cacheKey = `npc:${npc?.role || 'npc'}:${highlighted ? '1' : '0'}`;
  if (billboardUriCache.has(cacheKey)) return billboardUriCache.get(cacheKey);
  const stroke = highlighted ? '#fde047' : color;
  const width = highlighted ? 3.5 : 2.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <rect x="4" y="4" width="40" height="40" rx="14" fill="#0f172a" fill-opacity="0.94" stroke="${stroke}" stroke-width="${width}"/>
    <text x="24" y="30" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#f8fafc">${escapeXml(icon)}</text>
  </svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  billboardUriCache.set(cacheKey, uri);
  return uri;
}

function playSecretChimeSafe() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const freqs = [587.33, 880.0];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.08);
      gain.gain.setValueAtTime(0.06, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
    setTimeout(() => {
      ctx.close?.().catch?.(() => {});
    }, 450);
  } catch {}
}

// ---------- Park Adventure Controller ----------

export function createParkAdventureController({
  viewer = null,
  tourAndPlayEngine = null,
  wanderEngine = null,
} = {}) {
  let activeCityId = null;
  let activeTourScope = null;
  let activeSecrets = [];
  let activeNpcs = [];
  let nearestNpcId = null;
  let activeDialogue = null;
  let lastCollectedBanner = null;
  const npcInteractionCounts = new Map();
  let isDestroyed = false;
  let dataSource = null;
  let clickHandler = null;
  let telemetryPollTimer = null;
  const stateListeners = new Set();

  function notifyListeners() {
    const snap = getState();
    for (const cb of stateListeners) {
      try {
        cb(snap);
      } catch {}
    }
  }

  function ensureDataSource() {
    if (isDestroyed || !viewer?.dataSources?.add) return null;
    if (!dataSource) {
      try {
        dataSource = new Cesium.CustomDataSource('gev-park-adventures');
        viewer.dataSources.add(dataSource);
      } catch {
        dataSource = null;
      }
    }
    return dataSource;
  }

  function clearEntities() {
    if (dataSource?.entities?.removeAll) {
      try {
        dataSource.entities.removeAll();
      } catch {}
    }
  }

  function syncEntities() {
    if (isDestroyed) return;
    if (
      !activeCityId ||
      (activeSecrets.length === 0 && activeNpcs.length === 0)
    ) {
      clearEntities();
      return;
    }
    const ds = ensureDataSource();
    if (!ds?.entities?.add) return;
    ds.entities.removeAll();

    const progress = getPassportProgress(activeCityId, activeSecrets);
    const collectedSet = new Set(progress.collectedIds);

    for (const secret of activeSecrets) {
      const collected = collectedSet.has(secret.id);
      const ent = ds.entities.add({
        id: `gev-secret-${secret.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          secret.lon,
          secret.lat,
          (secret.elev || 32) + 2.4,
        ),
        billboard: {
          image: getSecretBillboardUri(secret, collected),
          width: collected ? 26 : 32,
          height: collected ? 26 : 32,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      if (ent) {
        ent._gevSecretId = secret.id;
      }
    }

    for (const npc of activeNpcs) {
      const isNear = npc.id === nearestNpcId;
      const ent = ds.entities.add({
        id: `gev-npc-${npc.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          npc.lon,
          npc.lat,
          (npc.elev || 32) + 2.6,
        ),
        billboard: {
          image: getNpcBillboardUri(npc, isNear),
          width: isNear ? 38 : 32,
          height: isNear ? 38 : 32,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      if (ent) {
        ent._gevNpcId = npc.id;
      }
    }

    viewer?.scene?.requestRender?.();
  }

  function stopTelemetryPoll() {
    if (telemetryPollTimer) {
      clearInterval(telemetryPollTimer);
      telemetryPollTimer = null;
    }
  }

  function ensureTelemetryPoll() {
    if (isDestroyed || telemetryPollTimer || !wanderEngine?.getTelemetry)
      return;
    telemetryPollTimer = setInterval(() => {
      if (isDestroyed || !activeCityId) {
        stopTelemetryPoll();
        return;
      }
      const coords = wanderEngine.getTelemetry?.()?.coordinates;
      if (
        coords &&
        Number.isFinite(coords.lat) &&
        Number.isFinite(coords.lon)
      ) {
        checkProximityAt(coords.lat, coords.lon);
      }
    }, 350);
    telemetryPollTimer?.unref?.();
  }

  function sync() {
    if (isDestroyed) return getState();
    const status = tourAndPlayEngine?.getStatus?.();
    if (!status?.isTour || !status.cityId) {
      const hadActive = Boolean(activeCityId);
      activeCityId = null;
      activeTourScope = null;
      activeSecrets = [];
      activeNpcs = [];
      nearestNpcId = null;
      activeDialogue = null;
      stopTelemetryPoll();
      clearEntities();
      if (hadActive) notifyListeners();
      return getState();
    }

    const nextCity = String(status.cityId).trim().toLowerCase();
    const nextScope = status.tourScope || 'city';
    const landmarks = Array.isArray(status.landmarks) ? status.landmarks : [];

    if (nextCity !== activeCityId || nextScope !== activeTourScope) {
      activeCityId = nextCity;
      activeTourScope = nextScope;
      activeSecrets = getHiddenSecretsForTour(nextCity, landmarks);
      activeNpcs =
        nextScope === 'venue'
          ? generateParkNpcsForTour(nextCity, landmarks, activeSecrets, {
              venueCategory: status.venueCategory || null,
            })
          : [];
      nearestNpcId = null;
      activeDialogue = null;
      lastCollectedBanner = null;
      syncEntities();
      ensureTelemetryPoll();
      notifyListeners();
    }
    return getState();
  }

  function collectSecretById(secretId) {
    if (isDestroyed || !activeCityId) return { ok: false };
    const secret = activeSecrets.find((s) => s.id === secretId);
    if (!secret) return { ok: false };
    const res = collectHiddenSecret(activeCityId, secret);
    if (res.newlyCollected) {
      playSecretChimeSafe();
      lastCollectedBanner = `${secret.icon} Found Secret: ${secret.title}!`;
      const progress = getPassportProgress(activeCityId, activeSecrets);
      wanderEngine?.showDialogBubble?.({
        name: `${secret.icon} Secret Discovered: ${secret.title}`,
        vibeColor: '#fbbf24',
        occupation: `Day Passport ${progress.collected}/${progress.total}`,
        thought: `${secret.story} — ${getCompanionPersonaName()}: "Nice detour off the main path!"`,
        currentThought: `${secret.story} — ${getCompanionPersonaName()}: "Nice detour off the main path!"`,
        city: activeCityId,
        isCompanion: true,
      });
      syncEntities();
      notifyListeners();
    }
    return {
      ok: true,
      secret,
      newlyCollected: res.newlyCollected,
      progress: getPassportProgress(activeCityId, activeSecrets),
    };
  }

  function interactWithNpc(npcId) {
    if (isDestroyed || !activeCityId) return { ok: false };
    const npc = activeNpcs.find((n) => n.id === npcId);
    if (!npc) return { ok: false };
    const count = (npcInteractionCounts.get(npc.id) || 0) + 1;
    npcInteractionCounts.set(npc.id, count);
    const progress = getPassportProgress(activeCityId, activeSecrets);
    const dialogue = buildNpcDialogue(npc, {
      uncollectedSecrets: progress.uncollectedSecrets,
      companionName: getCompanionPersonaName(),
      interactionCount: count,
    });
    activeDialogue = dialogue;
    wanderEngine?.showDialogBubble?.({
      name: `${npc.icon} ${npc.name} (${npc.roleLabel})`,
      vibeColor: npc.colorHex,
      occupation: npc.anchorStopName,
      thought: `${dialogue.fullMessage} — ${dialogue.companionBanter}`,
      currentThought: `${dialogue.fullMessage} — ${dialogue.companionBanter}`,
      city: activeCityId,
      isCompanion: true,
    });
    notifyListeners();
    return { ok: true, npc, dialogue };
  }

  function getNearestInteractableNpc() {
    if (!nearestNpcId) return null;
    return activeNpcs.find((n) => n.id === nearestNpcId) || null;
  }

  function interactWithNearestNpc() {
    const nearest = getNearestInteractableNpc();
    if (nearest) return interactWithNpc(nearest.id);
    const status = tourAndPlayEngine?.getStatus?.();
    const curStopId = status?.currentLandmark?.id;
    const matched =
      activeNpcs.find((n) => n.anchorStopId === curStopId) || activeNpcs[0];
    if (!matched) return { ok: false };
    return interactWithNpc(matched.id);
  }

  function checkProximityAt(lat, lon) {
    if (
      isDestroyed ||
      !activeCityId ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return { collected: [], nearestNpc: null };
    }
    const newlyCollected = [];
    for (const secret of activeSecrets) {
      const dist = haversineDistanceMeters(lat, lon, secret.lat, secret.lon);
      if (dist <= SECRET_COLLECT_RADIUS_METERS) {
        const res = collectSecretById(secret.id);
        if (res.newlyCollected) {
          newlyCollected.push(secret);
        }
      }
    }

    let bestNpc = null;
    let bestNpcDist = Infinity;
    for (const npc of activeNpcs) {
      const dist = haversineDistanceMeters(lat, lon, npc.lat, npc.lon);
      if (dist <= NPC_INTERACT_RADIUS_METERS && dist < bestNpcDist) {
        bestNpcDist = dist;
        bestNpc = npc;
      }
    }
    const nextNearId = bestNpc?.id || null;
    if (nextNearId !== nearestNpcId) {
      nearestNpcId = nextNearId;
      syncEntities();
      notifyListeners();
    }
    return { collected: newlyCollected, nearestNpc: bestNpc };
  }

  function handleKeyDown(e) {
    if (isDestroyed || !activeCityId || activeTourScope !== 'venue') return;
    if (activeNpcs.length === 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const tag = e.target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      e.target?.isContentEditable
    ) {
      return;
    }
    if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
      const status = tourAndPlayEngine?.getStatus?.();
      const nearNpc = getNearestInteractableNpc();
      const isFreeRoam = status?.state === 'user_takeover';
      // Yield 'E' back to avatarWanderEngine yaw-right during free-roam unless standing next to an NPC
      if (isFreeRoam && !nearNpc) return;
      const target = nearNpc || interactWithNearestNpc()?.npc || activeNpcs[0];
      if (!target) return;
      interactWithNpc(target.id);
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown, true);
  }

  if (
    viewer?.scene?.canvas &&
    typeof Cesium.ScreenSpaceEventHandler === 'function'
  ) {
    try {
      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((movement) => {
        if (isDestroyed || !movement?.position || !viewer?.scene?.pick) return;
        let picked = null;
        try {
          picked = viewer.scene.pick(movement.position);
        } catch {
          picked = null;
        }
        const entity = picked?.id;
        if (entity?._gevSecretId) {
          collectSecretById(entity._gevSecretId);
        } else if (entity?._gevNpcId) {
          interactWithNpc(entity._gevNpcId);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      clickHandler = null;
    }
  }

  const unsubTour = tourAndPlayEngine?.onStatusChange?.(() => {
    sync();
  });

  const unsubPassport = onPassportChange(() => {
    if (!isDestroyed && activeCityId) {
      syncEntities();
      notifyListeners();
    }
  });

  function getState() {
    return {
      cityId: activeCityId,
      tourScope: activeTourScope,
      secrets: activeSecrets.map((s) => ({ ...s })),
      npcs: activeNpcs.map((n) => ({ ...n })),
      nearestNpcId,
      nearestNpc: getNearestInteractableNpc(),
      activeDialogue: activeDialogue ? { ...activeDialogue } : null,
      lastCollectedBanner,
      passport: activeCityId
        ? getPassportProgress(activeCityId, activeSecrets)
        : {
            cityId: null,
            collected: 0,
            total: 0,
            percent: 0,
            complete: false,
            collectedIds: [],
            collectedSecrets: [],
            uncollectedSecrets: [],
          },
    };
  }

  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;
    stopTelemetryPoll();
    try {
      unsubTour?.();
    } catch {}
    try {
      unsubPassport?.();
    } catch {}
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown, true);
    }
    try {
      if (clickHandler && !clickHandler.isDestroyed?.()) {
        clickHandler.destroy?.();
      }
    } catch {}
    clearEntities();
    if (dataSource && viewer?.dataSources?.remove) {
      try {
        viewer.dataSources.remove(dataSource, true);
      } catch {}
    }
    dataSource = null;
    stateListeners.clear();
  }

  sync();

  return {
    sync,
    getState,
    getSecrets: () => activeSecrets.map((s) => ({ ...s })),
    getNpcs: () => activeNpcs.map((n) => ({ ...n })),
    getPassportProgress: () =>
      activeCityId
        ? getPassportProgress(activeCityId, activeSecrets)
        : getPassportProgress('', []),
    collectSecretById,
    interactWithNpc,
    interactWithNearestNpc,
    getNearestInteractableNpc,
    checkProximityAt,
    onStateChange: (cb) => {
      if (typeof cb !== 'function') return () => {};
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    destroy,
  };
}
