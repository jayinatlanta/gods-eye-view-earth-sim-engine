/**
 * Living World City Scooter Tour & Non-Metro Contextual 'Play' Engine.
 * (Metro Landmark Scooter Tours & Environment-Aware Play Mode)
 *
 * Implements:
 * 1. Major Metro 'Tour' Mode:
 *    - Curated landmark catalogs for major cities (Los Angeles, Atlanta, NYC, SF,
 *      Chicago, London, Paris, Tokyo, Monaco, Singapore, Sydney, plus dynamic synthesis
 *      for any MAJOR_WORLD_METROS city).
 *    - Mandatory Fisher-Yates randomization of landmark order every time a tour starts.
 *    - Electric scooter transit speed (6.7 m/s / ~15 mph) between landmarks using the
 *      Wander engine, user dot (#06b6d4), companion dot (#ec4899), and all 5 Wander cameras.
 *    - 20-second autonomous walking wander dwell (1.2 m/s) at each landmark with
 *      dialog bubble lore & companion commentary.
 *    - Seamless 'Take Over' at normal walking wander speed (1.2 m/s) at any landmark
 *      before continuing to the next stop.
 * 2. Non-Metro / Tourist 'Play' Mode:
 *    - Reuses Living World environmental classification (localeClassifier.js) to surface
 *      environment-suggested activities (Mountain Hike, Farmland Hike, Harbor Boardwalk,
 *      Prairie Trail, Midway Play) alongside classic leisure activities:
 *      Visit the Beach, See a Movie, Go Out to Eat, Go Shopping.
 */

import * as Cesium from 'cesium';
import {
  LIVING_CITIES,
  haversineDistanceMeters,
  calculateHeadingDegrees,
} from '../../citylife/cityWaypoints.js';
import {
  getGlobalDrawerCoordinator,
  MAJOR_WORLD_METROS,
  resolveKnownLocalGazetteer,
  onLocalityResolved,
} from '../../ui/worldSimDock.js';
import { nearPlaceRecord, placeBelow } from '../../data/placeBelow.js';
import {
  findPlaceAreaContainingPoint,
  findNeighborhoodAreaContainingPoint,
} from '../../data/placeBoundaries.js';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
  EXEMPLAR_LOCALES,
  classifySettlementTypology,
} from './localeClassifier.js';
import {
  WANDER_SPEED_TIERS,
  WANDER_CAMERA_MODES,
} from './avatarWanderEngine.js';
import { getCompanionPersonaName } from './companionDot.js';
import { calculateShoulderOffset } from './multiTopologyPathing.js';
import { snapRouteToRoads } from '../../drive/roadGeometrySnapper.js';
import {
  STAGE3_THEME_PARK_LANDMARKS,
  STAGE3_THEME_PARK_METADATA,
  STAGE3_THEME_PARK_ALIASES,
  RESORT_PARK_HOPPER_BRIDGES,
  getParkHopperBridgesForPark,
  ALL_CURATED_THEME_PARK_IDS,
} from './themeParkCatalog.js';
import {
  RESORT_STAY_LANDMARKS,
  RESORT_STAY_METADATA,
  RESORT_STAY_ALIASES,
  RESORT_EXCURSION_BRIDGES,
  ALL_CURATED_RESORT_STAY_IDS,
  isResortStayId,
  getExcursionBridgesForResort,
} from './resortStayCatalog.js';

export {
  RESORT_PARK_HOPPER_BRIDGES,
  getParkHopperBridgesForPark,
  ALL_CURATED_THEME_PARK_IDS,
  RESORT_STAY_LANDMARKS,
  RESORT_STAY_METADATA,
  RESORT_EXCURSION_BRIDGES,
  ALL_CURATED_RESORT_STAY_IDS,
  isResortStayId,
  getExcursionBridgesForResort,
};

export const TOUR_SCOOTER_SPEED_MPS = WANDER_SPEED_TIERS.SCOOTER || 6.7; // ~15 mph electric scooter
export const TOUR_WALK_DWELL_SPEED_MPS = WANDER_SPEED_TIERS.STROLL || 1.2; // ~2.7 mph normal walking wander
export const TOUR_WALK_MIDWAY_SPEED_MPS = 3.2; // Brisk park promenade walk (~3.2 m/s)
export const TOUR_RESORT_CART_SPEED_MPS = 5.5; // ~12.3 mph resort golf cart cruiser
export const TOUR_LANDMARK_DWELL_SECONDS = 20; // 20s autonomous walking wander at each landmark
export const METRO_TOUR_RADIUS_METERS = 32000; // 32km metro detection radius
export const VENUE_TOUR_DEFAULT_RADIUS_METERS = 2500; // Tight theme-park/campus venue detection
export const TOUR_SIDEWALK_OFFSET_METERS = 3.5; // +3.5m right-hand pedestrian sidewalk offset from street centerline
export const TOUR_APPROACH_CORRIDOR_MAX_METERS = 260; // Max direct scooter distance before staging on the landmark's street corridor
export const TOUR_WALK_MIDWAY_CORRIDOR_MAX_METERS = 650; // Continuous mid-park walkway leg threshold before corridor staging
export const TOUR_RESORT_CART_CORRIDOR_MAX_METERS = 900; // Continuous resort golf cart fairway/path leg threshold
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const TOUR_PLAY_STATES = Object.freeze({
  IDLE: 'idle',
  SCOOTER_TRANSIT: 'scooter_transit',
  TOUR_TRANSIT: 'scooter_transit',
  LANDMARK_DWELL: 'landmark_dwell',
  TOUR_DWELL: 'landmark_dwell',
  USER_TAKEOVER: 'user_takeover',
  PLAY_ACTIVE: 'play_active',
});
export const TOUR_OR_PLAY_STATES = TOUR_PLAY_STATES;

/**
 * Curated Major City Landmark Catalog with coordinates, elevation, and dialog bubble lore.
 */
export const METRO_LANDMARK_CATALOG = Object.freeze({
  los_angeles: [
    {
      id: 'la_hollywood_blvd',
      name: 'Hollywood Blvd & Walk of Fame',
      lat: 34.1016,
      lon: -118.3267,
      elev: 115,
      category: 'Iconic Boulevard',
      lore: 'Home to over 2,700 brass-and-terrazzo stars and the 1927 TCL Chinese Theatre forecourt footprints.',
      companionNote:
        'Look at the terrazzo stars under our feet—classic Hollywood neon all the way down the boulevard!',
    },
    {
      id: 'la_griffith_park',
      name: 'Griffith Park & Observatory',
      lat: 34.1184,
      lon: -118.3004,
      elev: 346,
      category: 'Mountain Overlook & Science',
      lore: 'Opened in 1935 on the south slope of Mount Hollywood, commanding panoramic views from Downtown LA to the Pacific.',
      companionNote:
        'Those three copper Art Deco domes and the view of the Hollywood Sign across the canyon never get old.',
    },
    {
      id: 'la_old_city_hall',
      name: 'Los Angeles Old City Hall',
      lat: 34.0537,
      lon: -118.2427,
      elev: 88,
      category: 'Historic Civic Architecture',
      lore: 'Completed in 1928 using concrete mixed with sand from all 58 California counties and water from all 21 historic missions.',
      companionNote:
        'The stepped pyramid tower at the top was modeled after the Mausoleum at Halicarnassus!',
    },
    {
      id: 'la_chinatown',
      name: 'Chinatown Central Plaza',
      lat: 34.0639,
      lon: -118.2383,
      elev: 96,
      category: 'Cultural Quarter',
      lore: 'Dedicated in 1938 as one of the first planned Chinatown plazas in America, framed by neon pagoda roofs and dragon gates.',
      companionNote:
        'Red lanterns overhead, wishing wells, and the aroma of fresh dim sum and roasted chestnuts.',
    },
    {
      id: 'la_disney_hall',
      name: 'Walt Disney Concert Hall',
      lat: 34.0553,
      lon: -118.2498,
      elev: 108,
      category: 'Modernist Architecture',
      lore: "Frank Gehry's 2003 masterpiece of curving stainless-steel sails and Douglas fir acoustic panels on Bunker Hill.",
      companionNote:
        'The way the California sunlight reflects off those curving steel sails looks like a ship in full wind.',
    },
    {
      id: 'la_santa_monica_pier',
      name: 'Santa Monica Pier & Route 66 End',
      lat: 34.0092,
      lon: -118.4976,
      elev: 8,
      category: 'Coastal Landmark',
      lore: 'Historic 1909 double-jointed wooden pier featuring the world’s first solar-powered Ferris wheel and the End of the Trail sign.',
      companionNote:
        'Pacific ocean breeze, arcade chimes, and the official western finish line of Route 66!',
    },
  ],
  atlanta: [
    {
      id: 'atl_piedmont_park',
      name: 'Piedmont Park & Lake Clara Meer',
      lat: 33.7851,
      lon: -84.3733,
      elev: 286,
      category: 'Urban Sanctuary',
      lore: 'Redesigned by the Olmsted Brothers in 1912 after hosting the 1895 Cotton States and International Exposition.',
      companionNote:
        'Midtown’s skyline reflecting right across Lake Clara Meer—best breeze in the city.',
    },
    {
      id: 'atl_ponce_beltline',
      name: 'Ponce City Market & BeltLine Eastside',
      lat: 33.7726,
      lon: -84.3655,
      elev: 296,
      category: 'Adaptive Reuse & Trail',
      lore: 'Built in 1926 as the massive Sears, Roebuck & Co. regional distribution hub directly along the historic rail corridor.',
      companionNote:
        'From historic railroad freight corridor to the liveliest promenade in Atlanta!',
    },
    {
      id: 'atl_fox_theatre',
      name: 'The Fabulous Fox Theatre',
      lat: 33.7725,
      lon: -84.3856,
      elev: 304,
      category: 'Historic Movie Palace',
      lore: 'Opened in 1929 with Moorish domes, trompe-l’œil twilight stars on the ceiling, and the 3,622-pipe Mighty Mo organ.',
      companionNote:
        'That glowing Peachtree Street marquee is pure 1920s theatrical magic.',
    },
    {
      id: 'atl_centennial_park',
      name: 'Centennial Olympic Park',
      lat: 33.7603,
      lon: -84.3935,
      elev: 298,
      category: 'Olympic Legacy Plaza',
      lore: 'Created as the 22-acre gathering heart of the 1996 Summer Olympics, anchored by the interactive Fountain of Rings.',
      companionNote:
        'Look at the engraved commemorative bricks and the SkyView Ferris wheel turning overhead.',
    },
    {
      id: 'atl_mlk_historic',
      name: 'Sweet Auburn & MLK Jr. Historical Park',
      lat: 33.7548,
      lon: -84.3733,
      elev: 299,
      category: 'National Historical Park',
      lore: 'Preserves Ebenezer Baptist Church, the Eternal Flame at The King Center, and Dr. King’s birth home on Auburn Avenue.',
      companionNote:
        'Standing along historic Sweet Auburn Avenue—so much courage and history in every block.',
    },
  ],
  new_york: [
    {
      id: 'nyc_times_square',
      name: 'Times Square & Duffy Steps',
      lat: 40.758,
      lon: -73.9855,
      elev: 15,
      category: 'Theater District Crossroads',
      lore: 'Named after The New York Times moved to Longacre Square in 1904; the glowing red TKTS glass steps anchor the bowtie plaza.',
      companionNote:
        'Multi-story LED canyons, Broadway marquees, and energy pulsing at every hour!',
    },
    {
      id: 'nyc_bethesda_terrace',
      name: 'Central Park Bethesda Terrace',
      lat: 40.7738,
      lon: -73.9708,
      elev: 23,
      category: 'Olmsted & Vaux Masterpiece',
      lore: 'Completed in 1867 with Minton encaustic ceiling tiles and Emma Stebbins’ Angel of the Waters bronze fountain.',
      companionNote:
        'Acoustic buskers under the Minton tile arcade and rowboats drifting across the Lake.',
    },
    {
      id: 'nyc_grand_central',
      name: 'Grand Central Terminal Viaduct',
      lat: 40.7527,
      lon: -73.9772,
      elev: 16,
      category: 'Beaux-Arts Rail Cathedral',
      lore: 'Opened in 1913 with a 13-foot Tiffany glass clock, sculpted Mercury facade, and vaulted turquoise zodiac ceiling.',
      companionNote:
        'The four-faced brass clock inside the main concourse is the ultimate New York meeting point.',
    },
    {
      id: 'nyc_bryant_park',
      name: 'Bryant Park & NY Public Library',
      lat: 40.7536,
      lon: -73.9832,
      elev: 18,
      category: 'Midtown Literary Green',
      lore: 'Guarded by the marble lions Patience and Fortitude since 1911 above the old Croton Distributing Reservoir foundation.',
      companionNote:
        'French bistro chairs on the lawn right behind the Rose Main Reading Room.',
    },
    {
      id: 'nyc_flatiron',
      name: 'Flatiron Building & Madison Sq',
      lat: 40.7411,
      lon: -73.9897,
      elev: 13,
      category: 'Early Skyscraper Icon',
      lore: 'Daniel Burnham’s 1902 triangular steel-frame wedge where Fifth Avenue crosses Broadway at 23rd Street.',
      companionNote:
        'Only 6.5 feet wide at the rounded prow—like the bow of a limestone ocean liner!',
    },
  ],
  san_francisco: [
    {
      id: 'sf_ferry_building',
      name: 'Ferry Building & Embarcadero',
      lat: 37.7955,
      lon: -122.3937,
      elev: 4,
      category: 'Waterfront Marketplace',
      lore: 'Survived both the 1906 and 1989 earthquakes; its 245-foot clock tower was modeled after the 12th-century Giralda bell tower in Seville.',
      companionNote:
        'Artisan sourdough, espresso, and views straight out to the Bay Bridge spans.',
    },
    {
      id: 'sf_fishermans_wharf',
      name: 'Fisherman’s Wharf & Pier 39',
      lat: 37.8087,
      lon: -122.4098,
      elev: 5,
      category: 'Historic Maritime Pier',
      lore: 'Home to San Francisco’s Dungeness crab fleet since the 1880s and the famous K-Dock California sea lion colony.',
      companionNote:
        'You can hear the sea lions barking with Alcatraz Island sitting right out in the bay!',
    },
    {
      id: 'sf_lombard_street',
      name: 'Lombard Street Hairpin Block',
      lat: 37.8021,
      lon: -122.4187,
      elev: 68,
      category: 'Russian Hill Switchbacks',
      lore: 'Designed in 1922 with eight red-brick hairpin switchbacks to tame Russian Hill’s steep 27% natural grade.',
      companionNote:
        'Hydrangea flowerbeds frame every brick switchback—and look at that Coit Tower view!',
    },
    {
      id: 'sf_chinatown_gate',
      name: 'Chinatown Dragon Gate & Grant Ave',
      lat: 37.7907,
      lon: -122.4056,
      elev: 26,
      category: 'Historic Cultural Enclave',
      lore: 'The oldest Chinatown in North America (established 1848), entered through the green-tiled Dragon Gate at Bush and Grant.',
      companionNote:
        'Fortune cookie factory alleys and lanterns strung all the way up Grant Avenue.',
    },
  ],
  chicago: [
    {
      id: 'chi_cloud_gate',
      name: 'Millennium Park & Cloud Gate (The Bean)',
      lat: 41.8826,
      lon: -87.6233,
      elev: 182,
      category: 'Public Art & Lakefront Park',
      lore: 'Anish Kapoor’s 110-ton seamless polished stainless-steel sculpture inspired by liquid mercury reflecting the Michigan Ave skyline.',
      companionNote:
        'Every skyscraper on Michigan Avenue bends into a funhouse mirror across the steel arch!',
    },
    {
      id: 'chi_riverwalk',
      name: 'Chicago Riverwalk & Bascule Bridges',
      lat: 41.8886,
      lon: -87.6244,
      elev: 179,
      category: 'Architectural Canyon',
      lore: 'Waterfront pedestrian concourse winding beneath Chicago’s movable trunnion bascule bridges and the Wrigley Building.',
      companionNote:
        'Emerald river water below and the greatest 20th-century architecture canyon above.',
    },
    {
      id: 'chi_navy_pier',
      name: 'Navy Pier & Lake Michigan Promenade',
      lat: 41.8917,
      lon: -87.6063,
      elev: 180,
      category: 'Lakefront Pier',
      lore: 'Built in 1916 as part of Daniel Burnham’s Plan of Chicago, stretching 3,300 feet out into Lake Michigan.',
      companionNote:
        'Freshwater lake swells as far as the horizon and the Centennial Wheel glowing over the water.',
    },
    {
      id: 'chi_art_institute',
      name: 'Art Institute of Chicago Bronze Lions',
      lat: 41.8796,
      lon: -87.6237,
      elev: 182,
      category: 'World-Class Museum',
      lore: 'Flanked since 1894 by Edward Kemeys’ bronze lions on Michigan Avenue, marking the eastern start of historic Route 66.',
      companionNote:
        'From Grant Wood’s American Gothic inside to the Route 66 Begin sign right outside!',
    },
  ],
  london: [
    {
      id: 'lon_trafalgar_sq',
      name: 'Trafalgar Square & National Gallery',
      lat: 51.508,
      lon: -0.1281,
      elev: 14,
      category: 'Civic Square',
      lore: 'Anchored by the 169-foot Nelson’s Column and Sir Edwin Landseer’s four bronze lions at the heart of Westminster.',
      companionNote:
        'Red double-decker buses circling the fountains in front of the National Gallery portico.',
    },
    {
      id: 'lon_westminster',
      name: 'Westminster Bridge & Elizabeth Tower (Big Ben)',
      lat: 51.5007,
      lon: -0.1246,
      elev: 9,
      category: 'Royal & Parliamentary Icon',
      lore: 'Augustus Pugin’s 1859 Gothic Revival clock tower housing the 13.5-ton Great Bell beside the Houses of Parliament.',
      companionNote:
        'Hearing the Westminster chimes ring out across the Thames is pure London.',
    },
    {
      id: 'lon_covent_garden',
      name: 'Covent Garden Piazza & Market Hall',
      lat: 51.5117,
      lon: -0.1232,
      elev: 21,
      category: 'Historic Market & Street Performers',
      lore: 'Inigo Jones’ 17th-century Italianate piazza and Charles Fowler’s 1830 neoclassical glass-and-iron market hall.',
      companionNote:
        'Opera singers and street acrobats performing on the cobblestones right outside the Apple Market!',
    },
    {
      id: 'lon_south_bank',
      name: 'South Bank Queen’s Walk & London Eye',
      lat: 51.5033,
      lon: -0.1195,
      elev: 9,
      category: 'Thames Promenade',
      lore: 'Car-free riverside stroll linking Jubilee Gardens and the 135-meter cantilevered observation wheel.',
      companionNote:
        'Thames river clippers gliding past while the glass capsules rise above the rooftops.',
    },
  ],
  paris: [
    {
      id: 'par_eiffel_tower',
      name: 'Tour Eiffel & Champ de Mars',
      lat: 48.8584,
      lon: 2.2945,
      elev: 33,
      category: 'World Landmark',
      lore: 'Gustave Eiffel’s 1889 wrought-iron lattice tower built for the Exposition Universelle from 18,038 puddle-iron parts.',
      companionNote:
        'The iron latticework up close is breathtaking—especially when the golden lights sparkle.',
    },
    {
      id: 'par_louvre',
      name: 'Pyramide du Louvre & Cour Napoléon',
      lat: 48.8606,
      lon: 2.3376,
      elev: 34,
      category: 'Palace & Museum Courtyard',
      lore: 'I. M. Pei’s 1989 glass-and-metal pyramid rising from fountains in the historic courtyard of the Palais du Louvre.',
      companionNote:
        'Renaissance limestone wings framing modern geometric glass along the historical axis.',
    },
    {
      id: 'par_notre_dame',
      name: 'Île de la Cité & Cathédrale Notre-Dame',
      lat: 48.853,
      lon: 2.3499,
      elev: 35,
      category: 'Medieval Island Heart',
      lore: 'Begun in 1163 on the natural island in the Seine; Point Zéro on the parvis marks the official center from which all French roads are measured.',
      companionNote:
        'Look at the flying buttresses and the green bouquiniste bookstalls lining the Seine quays.',
    },
    {
      id: 'par_arc_triomphe',
      name: 'Arc de Triomphe & Champs-Élysées',
      lat: 48.8738,
      lon: 2.295,
      elev: 56,
      category: 'Grand Haussmann Star',
      lore: 'Stands at the center of Place Charles de Gaulle where twelve tree-lined Haussmann avenues radiate outward like a star.',
      companionNote:
        'Watching the twelve avenues converge around the arch is mesmerizing.',
    },
  ],
  tokyo: [
    {
      id: 'tyo_shibuya',
      name: 'Shibuya Scramble Crossing & Hachiko',
      lat: 35.6595,
      lon: 139.7005,
      elev: 20,
      category: 'Neon Crossroads',
      lore: 'Up to 3,000 pedestrians cross simultaneously on every green cycle beside the bronze statue of loyal Akita dog Hachiko.',
      companionNote:
        'All walk signals turn green at once—like stepping into a choreographed neon tide!',
    },
    {
      id: 'tyo_meiji_jingu',
      name: 'Meiji Jingu Sacred Forest & Torii',
      lat: 35.6764,
      lon: 139.6993,
      elev: 32,
      category: 'Shinto Forest Sanctuary',
      lore: 'Dedicated in 1920 amidst a 170-acre evergreen forest of 100,000 trees donated from across Japan, entered via towering cypress torii gates.',
      companionNote:
        'Crunching gravel underfoot, stacked sake barrels, and peaceful cypress shade right in the middle of Tokyo.',
    },
    {
      id: 'tyo_sensoji',
      name: 'Senso-ji Kaminarimon (Asakusa)',
      lat: 35.7148,
      lon: 139.7967,
      elev: 6,
      category: 'Ancient Buddhist Temple',
      lore: 'Tokyo’s oldest temple (founded 645 AD), approached through the Thunder Gate’s giant 700-kg red paper lantern and Nakamise market street.',
      companionNote:
        'Warm ningyo-yaki sponge cakes along Nakamise-dori and the five-story pagoda ahead!',
    },
    {
      id: 'tyo_tokyo_tower',
      name: 'Tokyo Tower & Shiba Park',
      lat: 35.6586,
      lon: 139.7454,
      elev: 22,
      category: 'Showa-Era Skyline Icon',
      lore: 'Completed in 1958 at 333 meters in international orange and white steel above historic Zojo-ji temple grounds.',
      companionNote:
        'That warm orange-and-white lattice glowing over the temple pines is iconic.',
    },
  ],
  monaco: [
    {
      id: 'mco_casino_square',
      name: 'Place du Casino de Monte-Carlo',
      lat: 43.7392,
      lon: 7.4278,
      elev: 48,
      category: 'Belle Époque Glamour',
      lore: 'Charles Garnier’s 1879 Beaux-Arts casino and opera house overlooking mirrored fountains and Café de Paris terraces.',
      companionNote:
        'Supercars parked around the mirror sculpture and Mediterranean palms swaying in the breeze.',
    },
    {
      id: 'mco_port_hercule',
      name: 'Port Hercule Superyacht Quay',
      lat: 43.7365,
      lon: 7.4215,
      elev: 6,
      category: 'Deep-Water Harbor',
      lore: 'Ancient natural bay used by Greeks and Romans, now hosting superyachts and the Grand Prix swimming pool chicane.',
      companionNote:
        'You can trace the exact Formula 1 harbor chicane painted right onto the quay asphalt!',
    },
    {
      id: 'mco_princes_palace',
      name: 'Palais Princier on Le Rocher',
      lat: 43.7314,
      lon: 7.4201,
      elev: 62,
      category: 'Cliffside Fortress',
      lore: 'Founded as a Genoese fortress in 1191 atop the Rock of Monaco with sweeping views over Port Hercule and Fontvieille.',
      companionNote:
        'Looking straight down from the cliffside cannons onto two harbors at once.',
    },
    {
      id: 'mco_fairmont_hairpin',
      name: 'Fairmont Hairpin & Sun Casino Turn',
      lat: 43.7401,
      lon: 7.4292,
      elev: 24,
      category: 'Motorsport Landmark',
      lore: 'The slowest, tightest hairpin in Formula 1 wrapping right beneath terrace hotels toward the Mediterranean tunnel approach.',
      companionNote:
        'Tracing the tight apex where Formula 1 cars crawl at 30 mph around the hotel facade!',
    },
  ],
  singapore: [
    {
      id: 'sin_marina_bay',
      name: 'Marina Bay Waterfront Promenade',
      lat: 1.2842,
      lon: 103.8585,
      elev: 5,
      category: 'Futuristic Bayfront',
      lore: 'Framed by Moshe Safdie’s three-tower SkyPark ship deck and the lotus-shaped ArtScience Museum.',
      companionNote:
        'Warm tropical evening breeze and the whole Marina Bay skyline shimmering on the water.',
    },
    {
      id: 'sin_supertree_grove',
      name: 'Gardens by the Bay Supertree Grove',
      lat: 1.2816,
      lon: 103.8636,
      elev: 6,
      category: 'Vertical Biophilic Gardens',
      lore: 'Eighteen vertical gardens rising up to 50 meters tall, clad in 162,900 bromeliads, orchids, and tropical ferns.',
      companionNote:
        'The OCBC Skyway suspended between giant glowing botanical trees feels like sci-fi!',
    },
    {
      id: 'sin_merlion_park',
      name: 'Merlion Park Pier',
      lat: 1.2868,
      lon: 103.8545,
      elev: 5,
      category: 'National Emblem',
      lore: 'Home to Lim Nang Seng’s 8.6-meter spouting Merlion statue honoring Singapore’s history as Temasek (Sea Town) and Singapura (Lion City).',
      companionNote:
        'Classic view right across the water to the Marina Bay Sands towers.',
    },
    {
      id: 'sin_clarke_quay_hawker',
      name: 'Clarke Quay & Lau Pa Sat Heritage Hawker Pavilion',
      lat: 1.2889,
      lon: 103.8465,
      elev: 6,
      category: 'River Quay & UNESCO Food Heritage',
      lore: 'Pastel colonial godowns lining the Singapore River beside Asia’s Victorian cast-iron hawker market celebrated by UNESCO.',
      companionNote:
        'Neon riverfront bumboats gliding past the heritage quay and midnight satay smoke!',
    },
  ],
  sydney: [
    {
      id: 'syd_opera_house',
      name: 'Sydney Opera House Forecourt',
      lat: -33.8568,
      lon: 151.2153,
      elev: 8,
      category: 'UNESCO Architectural Icon',
      lore: 'Jørn Utzon’s spherical concrete shell sails clad in over one million Swedish ceramic tiles on Bennelong Point.',
      companionNote:
        'Seeing theglazed white-and-cream tiles up close on the harbour boardwalk is unforgettable.',
    },
    {
      id: 'syd_circular_quay',
      name: 'Circular Quay Ferry Wharves',
      lat: -33.8615,
      lon: 151.2115,
      elev: 6,
      category: 'Harbour Transit Hub',
      lore: 'Where green-and-gold Manly ferries depart Sydney Cove between the Opera House and the Harbour Bridge.',
      companionNote:
        'Harbour ferries pulling in and buskers playing didgeridoo along the seawall.',
    },
    {
      id: 'syd_the_rocks',
      name: 'The Rocks Historic Laneways',
      lat: -33.8591,
      lon: 151.2085,
      elev: 14,
      category: 'Sandstone Heritage Quarter',
      lore: 'Sydney’s oldest colonial neighborhood of 19th-century sandstone warehouses, cobbled alleys, and harbourside pubs.',
      companionNote:
        'Sandstone steps leading straight up under the massive southern approach of the Harbour Bridge!',
    },
    {
      id: 'syd_harbour_bridge_pylon',
      name: 'Sydney Harbour Bridge South-East Pylon Lookout',
      lat: -33.8543,
      lon: 151.2098,
      elev: 48,
      category: 'Harbour Arch Bridge',
      lore: 'Riveted steel arch spanning Port Jackson since 1932, nicknamed the Coathanger with panoramic views over Opera House Cove.',
      companionNote:
        'Looking down from the granite pylon right onto the white Opera House sails and Pacific ferries!',
    },
  ],
  chongqing: [
    {
      id: 'cq_hongyadong',
      name: 'Hongyadong Cliffside Stilted Complex',
      lat: 29.5625,
      lon: 106.5796,
      elev: 225,
      category: '3D Mountain-City Skyline',
      lore: 'Eleven-story traditional Bayu stilted timber complex built straight into the vertical sandstone cliff above the Jialing River.',
      companionNote:
        'Stepping off the 11th-floor plaza and still finding a street below—Chongqing is pure vertical cyberpunk!',
    },
    {
      id: 'cq_jiefangbei',
      name: 'Jiefangbei People’s Liberation Monument',
      lat: 29.5572,
      lon: 106.577,
      elev: 258,
      category: 'Skyscraper Heart',
      lore: 'The 1945 octagonal clock tower at the center of Yuzhong Peninsula’s dense canyon of supertall commercial towers.',
      companionNote:
        'Chongqing is the largest city proper in the world by population—over 32 million people across its municipal hills!',
    },
    {
      id: 'cq_chaotianmen',
      name: 'Raffles City & Chaotianmen Confluence',
      lat: 29.5673,
      lon: 106.5877,
      elev: 215,
      category: 'River Confluence Landmark',
      lore: 'Moshe Safdie’s eight curved towers crowned by The Crystal skybridge spanning 250 meters above where the Jialing meets the Yangtze.',
      companionNote:
        'Look at the two distinct river colors swirling together right beneath that horizontal skybridge!',
    },
    {
      id: 'cq_liziba_monorail',
      name: 'Liziba Through-Building Monorail Viewpoint',
      lat: 29.5553,
      lon: 106.5393,
      elev: 230,
      category: 'Engineering Marvel',
      lore: 'Line 2 straddle-beam monorail gliding seamlessly through floors 6 to 8 of a 19-story residential apartment tower above the river.',
      companionNote:
        'Wait for the train—it disappears right inside the sixth floor of the apartment building!',
    },
  ],
  jakarta: [
    {
      id: 'jkt_monas',
      name: 'Monas National Monument & Merdeka Square',
      lat: -6.1754,
      lon: 106.8272,
      elev: 8,
      category: 'National Monument',
      lore: 'The 132-meter marble obelisk crowned by a 50-kg gold-leaf flame inside one of the world’s largest central civic squares.',
      companionNote:
        'Recent UN urban definitions rank Greater Jakarta (~42M) as the most populous urban agglomeration on Earth!',
    },
    {
      id: 'jkt_kota_tua',
      name: 'Kota Tua Fatahillah Square',
      lat: -6.1352,
      lon: 106.8133,
      elev: 5,
      category: 'Historic Old Town',
      lore: '1710 cobbled plaza anchored by the former Batavia Stadhuis and Dutch East India era spice-trade warehouses.',
      companionNote:
        'Brightly painted vintage bicycles cruising around the historic white colonnades of Old Batavia.',
    },
    {
      id: 'jkt_bundaran_hi',
      name: 'Bundaran HI & Jalan M.H. Thamrin',
      lat: -6.195,
      lon: 106.823,
      elev: 9,
      category: 'Modern Financial Spine',
      lore: 'Selamat Datang bronze welcoming monument encircled by Jakarta’s grand skyscraper boulevard and pedestrian skybridges.',
      companionNote:
        'Modern glass towers reflecting in the fountain ring right down Thamrin Avenue.',
    },
    {
      id: 'jkt_sunda_kelapa',
      name: 'Sunda Kelapa Schooner Harbor',
      lat: -6.1257,
      lon: 106.8095,
      elev: 3,
      category: 'Maritime Heritage',
      lore: 'Centuries-old working wooden port where towering Bugis Pinisi wooden cargo schooners still moor side by side.',
      companionNote:
        'Rows of tall wooden Phinisi masts rising along the old harbor pier—like stepping back centuries!',
    },
  ],
  hong_kong: [
    {
      id: 'hk_victoria_harbour',
      name: 'Tsim Sha Tsui Victoria Harbour Promenade',
      lat: 22.2933,
      lon: 114.1725,
      elev: 6,
      category: 'World Skyscraper Panorama',
      lore: 'Overlooks the densest high-rise skyline on Earth—Hong Kong holds more skyscrapers over 150 meters (550+) than any other city.',
      companionNote:
        'Look across Victoria Harbour: more skyscrapers packed along one waterfront than anywhere else on the planet!',
    },
    {
      id: 'hk_central_ifc',
      name: 'Central Harbourfront & Two IFC',
      lat: 22.2852,
      lon: 114.1582,
      elev: 8,
      category: 'Vertical Financial Core',
      lore: 'César Pelli’s 412-meter Two International Finance Centre rising above the Star Ferry piers and elevated pedestrian walkways.',
      companionNote:
        'Green-and-white Star Ferries gliding past glass canyons and double-decker trams.',
    },
    {
      id: 'hk_bank_of_china',
      name: 'Bank of China Tower & Statue Square',
      lat: 22.2793,
      lon: 114.1615,
      elev: 18,
      category: 'Structural Icon',
      lore: 'I. M. Pei’s 1990 triangular glass-and-steel diagonal-braced tower rising beside historic legislative stone colonnades.',
      companionNote:
        'Those sharp triangular crystal facets catch the afternoon sunlight from every angle.',
    },
    {
      id: 'hk_victoria_peak',
      name: 'Victoria Peak Sky Terrace 428',
      lat: 22.271,
      lon: 114.1501,
      elev: 396,
      category: 'Mountain Summit Overlook',
      lore: 'Summited since 1888 by the steep Peak Tram funicular, offering a sweeping eagle’s-eye amphitheater over Hong Kong Island and Kowloon.',
      companionNote:
        'From up here you can see hundreds of pencil-thin towers clinging to the emerald mountain slopes!',
    },
    {
      id: 'hk_mong_kok',
      name: 'Mong Kok Ladies Market & Neon Quarter',
      lat: 22.3189,
      lon: 114.1704,
      elev: 9,
      category: 'Dense Street Culture',
      lore: 'One of the highest-density urban neighborhoods on Earth, buzzing with street markets, dai pai dong stalls, and glowing signage.',
      companionNote:
        'Street food sizzling, dense high-rises overhead, and electric Kowloon energy down every block.',
    },
  ],
  shanghai: [
    {
      id: 'sha_the_bund',
      name: 'The Bund (Waitan) Waterfront Promenade',
      lat: 31.2397,
      lon: 121.4903,
      elev: 6,
      category: 'Historic Waterfront',
      lore: 'Mile-long stone embankment lined with 52 classic 1920s Art Deco and Neoclassical banking palaces facing futuristic Pudong.',
      companionNote:
        '1920s stone domes on one side of the Huangpu River and space-age megatall spires right across the water!',
    },
    {
      id: 'sha_lujiazui',
      name: 'Lujiazui & Shanghai Tower Skyscraper Trio',
      lat: 31.2352,
      lon: 121.5056,
      elev: 7,
      category: 'Supertall Financial Hub',
      lore: 'Anchored by the twisting 632-meter Shanghai Tower—the world’s third-tallest skyscraper—alongside the Jin Mao and SWFC bottle-opener towers.',
      companionNote:
        'Standing beneath three intertwined supertalls twisting straight into the clouds.',
    },
    {
      id: 'sha_nanjing_road',
      name: 'Nanjing Road East Pedestrian Mall',
      lat: 31.2356,
      lon: 121.4776,
      elev: 6,
      category: 'Iconic Shopping Boulevard',
      lore: 'China’s premier century-old commercial boulevard connecting People’s Square to the Huangpu Riverfront under neon canopies.',
      companionNote:
        'Wide granite pedestrian promenade packed with historic department stores and street energy.',
    },
    {
      id: 'sha_yu_garden',
      name: 'Yu Garden & Nine-Turn Zigzag Bridge',
      lat: 31.2272,
      lon: 121.4921,
      elev: 6,
      category: 'Ming Dynasty Garden',
      lore: '1559 classical Ming garden of dragon walls, koi ponds, and the Huxinting Teahouse amidst upturned-eave bazaar lanes.',
      companionNote:
        'Curved Ming rooftops and tranquil koi ponds tucked right inside a 25-million-person megacity.',
    },
  ],
  beijing: [
    {
      id: 'bjs_forbidden_city',
      name: 'Forbidden City Meridian Gate & Jingshan',
      lat: 39.9163,
      lon: 116.3972,
      elev: 44,
      category: 'Imperial Palace Complex',
      lore: 'Constructed between 1406 and 1420 with 980 timber-and-glazed-tile buildings inside a 52-meter-wide ceremonial moat.',
      companionNote:
        'Golden glazed imperial roofs stretching along Beijing’s ancient central axis.',
    },
    {
      id: 'bjs_tiananmen',
      name: 'Tiananmen Square & Qianmen Arrow Tower',
      lat: 39.9037,
      lon: 116.3976,
      elev: 44,
      category: 'Grand Civic Axis',
      lore: 'Expansive stone ceremonial plaza linking the Gate of Heavenly Peace to the historic 1439 Qianmen city gatehouse.',
      companionNote:
        'The sheer scale of Beijing’s central meridian axis feels monumental.',
    },
    {
      id: 'bjs_temple_heaven',
      name: 'Temple of Heaven Hall of Prayer',
      lat: 39.8822,
      lon: 116.4066,
      elev: 43,
      category: 'UNESCO Sacred Architecture',
      lore: '1420 triple-gabled circular timber sanctuary built completely without nails inside a sprawling ancient cypress grove.',
      companionNote:
        'Deep cobalt-blue roof tiles framed by centuries-old cypresses and morning tai chi groups.',
    },
    {
      id: 'bjs_wangfujing',
      name: 'Wangfujing Pedestrian Boulevard',
      lat: 39.9136,
      lon: 116.4109,
      elev: 45,
      category: 'Historic Commercial Avenue',
      lore: 'Car-free Beijing promenade famous since the Ming dynasty, featuring St. Joseph’s Romanesque church and bustling snack alleys.',
      companionNote:
        'Wide open stone boulevard—perfect for gliding past bookshops and glowing evening storefronts.',
    },
  ],
  shenzhen: [
    {
      id: 'szx_ping_an',
      name: 'Ping An Finance Centre & Futian CBD',
      lat: 22.5333,
      lon: 114.0553,
      elev: 15,
      category: 'Hardware Silicon Valley',
      lore: 'Soaring 599-meter stainless-steel obelisk at the heart of Shenzhen’s rapid transformation from fishing village to tech megacity.',
      companionNote:
        'China’s second-tallest skyscraper soaring straight out of Futian’s LED-lit plazas!',
    },
    {
      id: 'szx_lianhuashan',
      name: 'Lianhuashan Park Summit & Civic Axis',
      lat: 22.5535,
      lon: 114.0577,
      elev: 98,
      category: 'Urban Ridge Overlook',
      lore: 'Breezy kite-flying meadow and hilltop plaza looking straight down Shenzhen’s symmetrical modern skyline spine.',
      companionNote:
        'Look straight south from the hilltop plaza—the whole glass canyon lines up like a circuit board!',
    },
    {
      id: 'szx_shenzhen_bay',
      name: 'Shenzhen Bay Coastal Park Promenade',
      lat: 22.5177,
      lon: 113.9491,
      elev: 4,
      category: 'Bayfront Greenbelt',
      lore: '15-kilometer mangrove and seafront promenade overlooking Deep Bay toward the hills of Hong Kong.',
      companionNote:
        'Coastal mangrove boardwalk with Hong Kong’s northern hills visible right across the bay.',
    },
    {
      id: 'szx_oct_loft',
      name: 'OCT-LOFT Creative Art District',
      lat: 22.5389,
      lon: 113.9922,
      elev: 18,
      category: 'Design & Maker Campus',
      lore: 'Former 1980s electronics factories reborn as banyan-shaded galleries, indie bookshops, and design studios.',
      companionNote:
        'Banyan tree roots weaving right around brick industrial galleries and cafés.',
    },
  ],
  delhi: [
    {
      id: 'del_india_gate',
      name: 'India Gate & Kartavya Path',
      lat: 28.6129,
      lon: 77.2295,
      elev: 216,
      category: 'Ceremonial Boulevard',
      lore: 'Edwin Lutyens’ 42-meter sandstone triumphal arch anchoring New Delhi’s tree-lined reflecting pool promenade.',
      companionNote:
        'Warm sandstone glowing against wide emerald lawns along Kartavya Path.',
    },
    {
      id: 'del_red_fort',
      name: 'Red Fort (Lal Qila) Lahori Gate',
      lat: 28.6562,
      lon: 77.241,
      elev: 218,
      category: 'Mughal Citadel',
      lore: 'Emperor Shah Jahan’s 1648 red sandstone imperial fortress beside the bustling historic markets of Chandni Chowk.',
      companionNote:
        'Massive red sandstone ramparts rising right above Old Delhi’s vibrant bazaar streets!',
    },
    {
      id: 'del_connaught_place',
      name: 'Connaught Place Circular Colonnade',
      lat: 28.6315,
      lon: 77.2167,
      elev: 219,
      category: 'Historic Market Ring',
      lore: 'Concentric white Georgian-style arcaded rings surrounding Central Park at the commercial crossroads of Delhi.',
      companionNote:
        'Sweeping white colonnades wrapping all the way around Central Park.',
    },
    {
      id: 'del_humayun_tomb',
      name: 'Humayun’s Tomb Charbagh Gardens',
      lat: 28.5933,
      lon: 77.2507,
      elev: 210,
      category: 'UNESCO Mughal Garden',
      lore: '1570 red sandstone and white marble double-domed garden tomb that directly inspired the Taj Mahal.',
      companionNote:
        'Symmetrical sandstone water channels and shaded palm paths.',
    },
  ],
  mumbai: [
    {
      id: 'bom_gateway_india',
      name: 'Gateway of India & Apollo Bunder',
      lat: 18.922,
      lon: 72.8347,
      elev: 8,
      category: 'Harbour Archway',
      lore: '26-meter Indo-Saracenic basalt arch completed in 1924 overlooking Mumbai Harbour beside the grand Taj Mahal Palace dome.',
      companionNote:
        'Sea breeze off the Arabian Sea with wooden harbor launches bobbing beside the basalt arch.',
    },
    {
      id: 'bom_marine_drive',
      name: 'Marine Drive (Queen’s Necklace) Promenade',
      lat: 18.9388,
      lon: 72.8235,
      elev: 9,
      category: 'Art Deco Coastal Curve',
      lore: '3-kilometer sweeping C-shaped Arabian Sea seawall flanked by Mumbai’s UNESCO-listed 1930s Art Deco apartments.',
      companionNote:
        'Sitting on the wide seawall tetrapods watching waves roll across Back Bay.',
    },
    {
      id: 'bom_csmt',
      name: 'Chhatrapati Shivaji Maharaj Terminus',
      lat: 18.9398,
      lon: 72.8355,
      elev: 12,
      category: 'UNESCO Rail Cathedral',
      lore: '1888 Venetian-Gothic and Indian stone masterpiece with carved peacocks, stained glass, and bustling suburban platforms.',
      companionNote:
        'Every spire and stone gargoyle on that station facade looks like a medieval palace.',
    },
    {
      id: 'bom_kala_ghoda',
      name: 'Kala Ghoda Heritage Art Precinct',
      lat: 18.9278,
      lon: 72.8325,
      elev: 11,
      category: 'Cultural Art Quarter',
      lore: 'Crescent-shaped South Mumbai enclave of Victorian stone libraries, galleries, and shady banyan café courtyards.',
      companionNote:
        'Banyan shade, Gothic Revival clock towers, and lively street-side cafés.',
    },
  ],
  seoul: [
    {
      id: 'sel_gyeongbokgung',
      name: 'Gyeongbokgung Palace & Gwanghwamun Gate',
      lat: 37.5759,
      lon: 126.9768,
      elev: 38,
      category: 'Joseon Royal Palace',
      lore: 'Built in 1395 as the principal royal palace of the Joseon Dynasty beneath the granite crags of Mount Bugaksan.',
      companionNote:
        'Six-hundred-year-old Joseon palace roofs framed by sharp granite mountain peaks!',
    },
    {
      id: 'sel_cheonggyecheon',
      name: 'Cheonggyecheon Sunken Stream Walk',
      lat: 37.5691,
      lon: 126.9784,
      elev: 34,
      category: 'Daylighted Urban River',
      lore: '11-kilometer sunken stone stream promenade created by tearing down an elevated concrete expressway in 2005.',
      companionNote:
        'Stepping stones over clear running stream water tucked right below Seoul’s skyscrapers.',
    },
    {
      id: 'sel_namsan_tower',
      name: 'N Seoul Tower & Namsan Fortress Ridge',
      lat: 37.5512,
      lon: 126.9882,
      elev: 243,
      category: 'Skyline Mountain Beacon',
      lore: '236-meter communication tower atop 262-meter Namsan peak along Seoul’s 1396 Hanyangdoseong city wall.',
      companionNote:
        '360-degree view from ancient stone fortress ramparts over the Han River!',
    },
    {
      id: 'sel_bukchon',
      name: 'Bukchon Hanok Village Lanes',
      lat: 37.5826,
      lon: 126.983,
      elev: 52,
      category: 'Traditional Courtyard Quarter',
      lore: '600-year-old residential hillside preserving hundreds of curved-tile hanok wooden courtyard homes.',
      companionNote:
        'Looking down the sloping tiled rooftops straight toward N Seoul Tower in the distance.',
    },
  ],
  dhaka: [
    {
      id: 'dac_parliament',
      name: 'Jatiya Sangsad Bhaban (National Parliament)',
      lat: 23.7623,
      lon: 90.3785,
      elev: 10,
      category: 'Modernist Masterpiece',
      lore: 'Louis Kahn’s monumental 1982 concrete-and-marble geometric citadel rising out of a shimmering crescent reflection lake.',
      companionNote:
        'Those colossal circles and triangles cut into raw concrete above the water—and Dhaka has surged into the world’s top 5 metro areas (~36.6M UN urban agglomeration)!',
    },
    {
      id: 'dac_lalbagh_fort',
      name: 'Lalbagh Fort Mughal Gardens',
      lat: 23.7189,
      lon: 90.3882,
      elev: 9,
      category: '17th-Century Citadel',
      lore: 'Incomplete 1678 Mughal fortress complex in Old Dhaka enclosing the marble Tomb of Pari Bibi and reflecting fountains.',
      companionNote:
        'Quiet terracotta Mughal arches and manicured lawns amidst Old Dhaka’s energetic streets.',
    },
    {
      id: 'dac_ahsan_manzil',
      name: 'Ahsan Manzil Pink Palace & Sadarghat',
      lat: 23.7086,
      lon: 90.406,
      elev: 8,
      category: 'Riverfront Palace',
      lore: '1872 rose-pink domed palace overlooking the Buriganga River where hundreds of colorful wooden country boats cross.',
      companionNote:
        'That bright rose-pink dome glowing right above the busy Buriganga riverfront!',
    },
    {
      id: 'dac_hatirjheel',
      name: 'Hatirjheel Lakeside Overpass Promenade',
      lat: 23.758,
      lon: 90.4098,
      elev: 9,
      category: 'Lakeside Greenbelt',
      lore: 'Restored urban wetland, curved illuminated bridges, and amphitheater promenade curving through central Dhaka.',
      companionNote:
        'Wide lakeside paths and sweeping arched bridges curving across the water.',
    },
    {
      id: 'dac_curzon_hall',
      name: 'Curzon Hall & Shahbagh Cultural Axis',
      lat: 23.7271,
      lon: 90.4006,
      elev: 9,
      category: 'Heritage & Academic Heart',
      lore: '1904 Indo-Saracenic red-brick landmark of Dhaka University along the green tree-lined cultural corridor of Ramna and Shahbagh.',
      companionNote:
        'Dhaka has surged into the world’s top 5 largest metro areas (~36.6M UN urban agglomeration)—and Shahbagh is its intellectual heart!',
    },
  ],
  mexico_city: [
    {
      id: 'cdmx_zocalo',
      name: 'Zócalo & Catedral Metropolitana',
      lat: 19.4326,
      lon: -99.1332,
      elev: 2240,
      category: 'Ancient Imperial Plaza',
      lore: 'Built directly over the ceremonial core of Aztec Tenochtitlan beside the Templo Mayor pyramids and 1573 Baroque cathedral.',
      companionNote:
        'Ciudad de México sits at 2,240 meters elevation—and right beneath this plaza lie the stones of Tenochtitlan!',
    },
    {
      id: 'cdmx_bellas_artes',
      name: 'Palacio de Bellas Artes & Alameda Central',
      lat: 19.4352,
      lon: -99.1412,
      elev: 2240,
      category: 'Art Nouveau & Art Deco Palace',
      lore: 'Carrara marble opera palace crowned by golden Art Nouveau domes beside the Americas’ oldest public park (1592).',
      companionNote:
        'Look at that golden-orange tiled dome gleaming above the trees of Alameda Central!',
    },
    {
      id: 'cdmx_angel_reforma',
      name: 'El Ángel de la Independencia (Paseo de la Reforma)',
      lat: 19.427,
      lon: -99.1677,
      elev: 2238,
      category: 'Grand Boulevard Monument',
      lore: '1910 winged bronze Victory column standing 45 meters tall down Maximilian’s grand tree-lined Paseo de la Reforma.',
      companionNote:
        'Wide cycleways, jacaranda trees, and skyscrapers framing the golden Winged Victory!',
    },
    {
      id: 'cdmx_chapultepec',
      name: 'Castillo de Chapultepec & Forest Park',
      lat: 19.4204,
      lon: -99.1819,
      elev: 2325,
      category: 'Hilltop Castle & Urban Forest',
      lore: 'North America’s only true royal hill castle rising inside 1,695-acre Bosque de Chapultepec overlooking the entire Valley of Mexico.',
      companionNote:
        'A real hilltop castle with terraced views straight down Paseo de la Reforma!',
    },
    {
      id: 'cdmx_coyoacan',
      name: 'Coyoacán Plaza Hidalgo & Jardín Centenario',
      lat: 19.3497,
      lon: -99.1621,
      elev: 2248,
      category: 'Bohemian Colonial Quarter',
      lore: 'Cobblestone squares, coyote fountains, and vibrant cobalt-and-ochre mansions surrounding Frida Kahlo’s neighborhood.',
      companionNote:
        'Churros, shaded colonial arcades, and acoustic guitars strumming under the plaza trees.',
    },
  ],
  sao_paulo: [
    {
      id: 'gru_paulista',
      name: 'Avenida Paulista & MASP Suspended Museum',
      lat: -23.5614,
      lon: -46.6559,
      elev: 815,
      category: 'Financial & Cultural Ridge',
      lore: 'Lina Bo Bardi’s 1968 modernist glass-and-concrete museum suspended between four bold red pillars atop São Paulo’s crest.',
      companionNote:
        'Largest city in South America and the Southern Hemisphere—and Avenida Paulista feels unstoppable!',
    },
    {
      id: 'gru_ibirapuera',
      name: 'Parque Ibirapuera & Niemeyer Marquise',
      lat: -23.5874,
      lon: -46.6576,
      elev: 760,
      category: 'Modernist Urban Park',
      lore: 'Oscar Niemeyer’s sweeping curving concrete canopy linking lakes, auditoriums, and Brazil’s premier art pavilions.',
      companionNote:
        'Skateboarders, cyclists, and Oscar Niemeyer’s white modernist curves around the reflecting lakes.',
    },
    {
      id: 'gru_praca_se',
      name: 'Catedral da Sé & Pátio do Colégio',
      lat: -23.5513,
      lon: -46.6343,
      elev: 758,
      category: 'Founding Historic Core',
      lore: 'Neo-Gothic twin-tower cathedral beside the 1554 Jesuit courtyard where São Paulo was originally founded.',
      companionNote:
        'Right at Marco Zero where the entire metropolis radiated outward from 1554.',
    },
    {
      id: 'gru_batman_alley',
      name: 'Beco do Batman (Vila Madalena)',
      lat: -23.5567,
      lon: -46.6866,
      elev: 765,
      category: 'Open-Air Street Art Gallery',
      lore: 'Tightly curving cobblestone alleyway completely blanketed from curb to cornice in evolving Brazilian street murals.',
      companionNote:
        'Every square inch of brickwork here bursts with color and Brazilian street art!',
    },
  ],
  buenos_aires: [
    {
      id: 'bue_obelisco',
      name: 'El Obelisco & Avenida 9 de Julio',
      lat: -34.6037,
      lon: -58.3816,
      elev: 25,
      category: 'Grand Avenue Monument',
      lore: '67.5-meter white stone obelisk built in 1936 at the intersection of Corrientes’ theater strip and the 140-meter-wide 9 de Julio.',
      companionNote:
        'One of the widest avenues in the world—and midnight theater marquees glowing along Corrientes!',
    },
    {
      id: 'bue_plaza_mayo',
      name: 'Plaza de Mayo & Casa Rosada',
      lat: -34.6083,
      lon: -58.3712,
      elev: 18,
      category: 'Historic Political Heart',
      lore: 'Surrounded since 1580 by the iconic rose-pink Presidential Palace balconies, the Cabildo, and the Metropolitan Cathedral.',
      companionNote:
        'Jacaranda blossoms framing the rose-pink Casa Rosada across Plaza de Mayo.',
    },
    {
      id: 'bue_puerto_madero',
      name: 'Puerto Madero & Puente de la Mujer',
      lat: -34.608,
      lon: -58.3649,
      elev: 10,
      category: 'Waterfront Docklands',
      lore: 'Santiago Calatrava’s rotating white cable-stayed tango-inspired footbridge spanning restored 19th-century red-brick port docks.',
      companionNote:
        'That crisp white cantilevered bridge looks just like a couple mid-tango across the dock!',
    },
    {
      id: 'bue_caminito',
      name: 'La Boca Caminito Alley',
      lat: -34.6394,
      lon: -58.3627,
      elev: 8,
      category: 'Painted Port Quarter',
      lore: 'Brightly painted corrugated-zinc immigrant tenements along the Riachuelo bend where tango music echoes down cobblestone alleys.',
      companionNote:
        'Primary-colored zinc balconies, street tango dancers, and old port spirit!',
    },
  ],
  cairo: [
    {
      id: 'cai_tahrir_nile',
      name: 'Tahrir Square & Qasr El Nil Bridge',
      lat: 30.0444,
      lon: 31.2357,
      elev: 23,
      category: 'Nile Metropolis Core',
      lore: 'Bronze lion guardians framing Qasr El Nil Bridge across the timeless Nile River beside Zamalek’s leafy island towers.',
      companionNote:
        'White-sailed feluccas drifting past the bronze lions on Qasr El Nil Bridge!',
    },
    {
      id: 'cai_khan_el_khalili',
      name: 'Al-Muizz Street & Khan el-Khalili',
      lat: 30.0477,
      lon: 31.2623,
      elev: 27,
      category: 'Medieval Islamic Bazaar',
      lore: '14th-century caravanserai souk and stone-paved Al-Muizz corridor boasting the densest concentration of Mamluk architecture.',
      companionNote:
        'Brass lanterns glowing under stone arches that have welcomed travelers since the 1300s.',
    },
    {
      id: 'cai_citadel',
      name: 'Saladin Citadel & Alabaster Mosque',
      lat: 30.0287,
      lon: 31.2599,
      elev: 88,
      category: 'Limestone Fortress Terrace',
      lore: '1176 hilltop limestone fortress commanding views over Cairo’s thousand minarets all the way to the Giza Pyramids.',
      companionNote:
        'On a clear afternoon from this citadel terrace you can spot the Pyramids across the Nile!',
    },
    {
      id: 'cai_giza_plateau',
      name: 'Giza Plateau & Great Sphinx Overlook',
      lat: 29.9753,
      lon: 31.1376,
      elev: 62,
      category: 'Ancient World Wonder',
      lore: '4,500-year-old Great Pyramid of Khufu and carved limestone Sphinx standing directly along Greater Cairo’s urban desert edge.',
      companionNote:
        'Standing right beside a 4,500-year-old Wonder of the Ancient World on the edge of Africa’s largest metro!',
    },
  ],
  lagos: [
    {
      id: 'los_tbs_marina',
      name: 'Tafawa Balewa Square & Lagos Marina',
      lat: 6.4474,
      lon: 3.4017,
      elev: 6,
      category: 'Civic Lagoon Heritage',
      lore: 'Historic 1960 Independence ceremonial square flanked by Lagos Island’s bustling commercial waterfront and National Museum.',
      companionNote:
        'From the historic independence square out to the energetic Lagos Lagoon waterfront!',
    },
    {
      id: 'los_lekki_ikoyi',
      name: 'Lekki-Ikoyi Cable-Stayed Link Bridge',
      lat: 6.4475,
      lon: 3.4712,
      elev: 14,
      category: 'Lagoon Skyline Crossing',
      lore: '1.36-kilometer white cable-stayed bridge arching over Five Cowrie Creek, linking upscale Ikoyi Island with fast-growing Lekki.',
      companionNote:
        'Breezy lagoon crossing with boats cutting wakes below and Ikoyi’s towers behind us!',
    },
    {
      id: 'los_national_theatre',
      name: 'National Arts Theatre Iganmu',
      lat: 6.4765,
      lon: 3.3688,
      elev: 8,
      category: 'Cultural Icon',
      lore: '1976 circular sculpted concrete monument shaped like a traditional military cap, home to Nigerian music, cinema, and theater.',
      companionNote:
        'Iconic modernist cultural centerpiece of Africa’s most dynamic creative & Afrobeats capital.',
    },
    {
      id: 'los_victoria_island',
      name: 'Victoria Island Ahmadu Bello Oceanfront',
      lat: 6.4253,
      lon: 3.4219,
      elev: 5,
      category: 'Atlantic Coast & Eko',
      lore: 'Atlantic beachfront boulevard overlooking rising Eko Atlantic towers and rolling Gulf of Guinea surf.',
      companionNote:
        'Atlantic rollers crashing just off Victoria Island beside rising new oceanfront towers!',
    },
  ],
  istanbul: [
    {
      id: 'ist_sultanahmet',
      name: 'Hagia Sophia & Sultanahmet Square',
      lat: 41.0086,
      lon: 28.9802,
      elev: 37,
      category: 'Transcontinental Imperial Core',
      lore: 'Emperor Justinian’s 537 AD soaring pendentive dome facing the six-minaret Blue Mosque across the ancient Byzantine Hippodrome.',
      companionNote:
        'Fifteen centuries of Roman, Byzantine, and Ottoman domes all in one square—Europe’s largest megacity!',
    },
    {
      id: 'ist_galata_tower',
      name: 'Galata Tower & Karaköy Quay',
      lat: 41.0256,
      lon: 28.9744,
      elev: 54,
      category: 'Genoese Watchtower',
      lore: '1348 cylindrical stone watchtower crowned by a conical cap overlooking the Golden Horn and Bosphorus Strait ferries.',
      companionNote:
        'Cobblestone hillside streets spiraling down toward the ferries crossing between Europe and Asia!',
    },
    {
      id: 'ist_grand_bazaar',
      name: 'Grand Bazaar & Spice Quarter',
      lat: 41.0107,
      lon: 28.9681,
      elev: 48,
      category: '15th-Century Covered Market',
      lore: '61 vaulted streets and over 4,000 artisan shops operating continuously under painted stone arches since 1461.',
      companionNote:
        'Mosaic glass lamps, saffron mounds, and centuries of vaulted market passageways.',
    },
    {
      id: 'ist_ortakoy',
      name: 'Ortaköy Mosque & Bosphorus Bridge',
      lat: 41.0473,
      lon: 29.027,
      elev: 6,
      category: 'Two-Continent Strait',
      lore: '1856 Neo-Baroque waterside mosque perched right on the European shore beneath the suspension bridge connecting to Asia.',
      companionNote:
        'Standing in Europe looking straight across the Bosphorus Strait to the Asian shoreline!',
    },
  ],
  melbourne: [
    {
      id: 'mel_fed_square',
      name: 'Federation Square & Flinders Street Station',
      lat: -37.8179,
      lon: 144.969,
      elev: 14,
      category: 'Civic Crossroads',
      lore: '1910 Edwardian copper-domed train station under the clocks facing Federation Square’s fractured sandstone-and-zinc plaza.',
      companionNote:
        'Meeting under the iconic Flinders Street Station clocks while green-and-gold trams chime past!',
    },
    {
      id: 'mel_southbank',
      name: 'Southbank Yarra River Promenade',
      lat: -37.8205,
      lon: 144.9648,
      elev: 8,
      category: 'Riverfront Promenade',
      lore: 'Car-free riverfront boardwalk flanked by Eureka Tower, pedestrian footbridges, and shaded plane trees.',
      companionNote:
        'Rowing sculls gliding down the Yarra right under the towering Melbourne skyline.',
    },
    {
      id: 'mel_hosier_lane',
      name: 'Hosier Lane & Laneway Café Culture',
      lat: -37.8166,
      lon: 144.9692,
      elev: 15,
      category: 'Street Art Laneway',
      lore: 'Bluestone cobblestone alleyway world-famous for floor-to-cornice street murals and specialty flat-white espresso bars.',
      companionNote:
        'Bluestone cobbles, vibrant street art layers, and Melbourne’s legendary espresso aroma!',
    },
    {
      id: 'mel_shrine',
      name: 'Royal Botanic Gardens & Shrine of Remembrance',
      lat: -37.8305,
      lon: 144.9734,
      elev: 34,
      category: 'Monument & Gardens',
      lore: '1934 stepped classical Doric monument overlooking Swanston Street’s axial vista and 38 hectares of native and exotic gardens.',
      companionNote:
        'Looking straight north from the stone balcony down St Kilda Road into the city towers.',
    },
  ],
  mcmurdo_station: [
    {
      id: 'aq_obs_hill',
      name: 'Observation Hill & Vince Cross',
      lat: -77.8495,
      lon: 166.691,
      elev: 230,
      category: 'Antarctic Summit Overlook',
      lore: '230-meter volcanic scoria cone overlooking Ross Island, the Ross Ice Shelf, and Mount Erebus’ steaming summit plume.',
      companionNote:
        'Antarctica’s largest scientific settlement—and from Observation Hill you can see Mount Erebus smoking!',
    },
    {
      id: 'aq_hut_point',
      name: 'Scott’s Discovery Hut (Hut Point)',
      lat: -77.8458,
      lon: 166.642,
      elev: 6,
      category: 'Heroic Age Historic Site',
      lore: '1902 timber expedition shelter erected by Robert Falcon Scott’s Discovery team, naturally preserved in sub-zero Antarctic air.',
      companionNote:
        'Timber planks preserved since 1902 right out on the basalt peninsula above McMurdo Sound.',
    },
    {
      id: 'aq_crary_lab',
      name: 'Albert P. Crary Science & Engineering Center',
      lat: -77.8469,
      lon: 166.6683,
      elev: 18,
      category: 'Polar Research Hub',
      lore: 'Main laboratory complex of McMurdo Station supporting marine biology, glaciology, and long-duration stratospheric balloons.',
      companionNote:
        'Polar researchers gearing up beside tracked Hägglunds and Ivan the Terra Bus!',
    },
    {
      id: 'aq_ice_pier',
      name: 'McMurdo Sound Sea-Ice Pier Overlook',
      lat: -77.8475,
      lon: 166.652,
      elev: 4,
      category: 'Ross Island Coastline',
      lore: 'Engineered floating ice-and-steel port along Winter Quarters Bay looking out toward the Royal Society Range.',
      companionNote:
        'Weddell seals sunning on the pack ice with the Transantarctic Mountains gleaming across the sound!',
    },
  ],
  key_largo: [
    {
      id: 'kl_key_loaner_house',
      name: 'Key Loaner House (MM 99 Bayside Pier)',
      lat: 25.089,
      lon: -80.449,
      elev: 2,
      category: 'Starter Easter Egg Sanctuary',
      lore: 'A sun-bleached Florida Keys coastal stilt house loaned out free to every Earth Sim explorer—launch straight onto a scooter, car, boat, or helicopter, or ask the built-in AI Agent to invent any new activity.',
      companionNote:
        'Keys on the counter, dock out back, and the whole island waiting—want to scooter Overseas Highway or grab a boat?',
    },
    {
      id: 'kl_caribbean_club',
      name: 'Caribbean Club & Bayside Sunset Dock',
      lat: 25.1462,
      lon: -80.3987,
      elev: 2,
      category: 'Classic Keys Waterfront',
      lore: 'Legendary Mile Marker 104 bayside roadhouse and boat landing overlooking Blackwater Sound, famous since the 1948 classic film Key Largo.',
      companionNote:
        'Pull up by the seawall—you can watch the pelicans glide right across Blackwater Sound at golden hour!',
    },
    {
      id: 'kl_fisheries_marina',
      name: 'Key Largo Fisheries Backyard Marina',
      lat: 25.0827,
      lon: -80.4366,
      elev: 2,
      category: 'Working Harbor & Seafood Dock',
      lore: 'Bustling Atlantic-side fish house and marina on Ocean Bay Drive where charter boats unload fresh yellowtail snapper and Florida lobster.',
      companionNote:
        'Tarpon hovering right under the dock lights—smells like salt air and fresh stone crab!',
    },
    {
      id: 'kl_pennekamp_park',
      name: 'John Pennekamp Coral Reef State Park',
      lat: 25.1268,
      lon: -80.4083,
      elev: 2,
      category: 'Marine Sanctuary & Reef Harbor',
      lore: 'America’s first undersea state park, gateway to living coral reefs, glass-bottom boats, and crystal-clear mangrove paddling trails.',
      companionNote:
        'Look at that turquoise channel water winding straight through the red mangroves toward the reef!',
    },
    {
      id: 'kl_african_queen_canal',
      name: 'African Queen Canal & Key Largo Marina',
      lat: 25.0919,
      lon: -80.4418,
      elev: 2,
      category: 'Historic Canal & Boat Basin',
      lore: 'Home berth of the original 1912 steamboat African Queen right beside Mile Marker 100 along the Key Largo canal basin.',
      companionNote:
        'A real century-old steamboat moored right off the highway—only in the Florida Keys!',
    },
    {
      id: 'kl_rowells_waterfront',
      name: "Rowell's Waterfront Park & Mile 104 Bayfront",
      lat: 25.1545,
      lon: -80.3924,
      elev: 2,
      category: 'Island Park & Launch Ramp',
      lore: 'Open bayfront shoreline park on the northern tip of Key Largo with sweeping views across Barnes Sound and the Keys mangrove archipelago.',
      companionNote:
        'Trade wind right off the bay, wide-open sky, and zero traffic—perfect spot for a sunset cruise or chopper lift-off!',
    },
  ],
  wdw_magic_kingdom: [
    {
      id: 'mk_main_street_train_station',
      name: 'Main Street U.S.A. Station',
      lat: 28.4163,
      lon: -81.5812,
      elev: 32,
      category: 'Park Entrance',
      land: 'Main Street, U.S.A.',
      estimatedWaitMin: 10,
      snackNote: 'Confectionery Cotton Candy & Mickey Cinnamon Roll',
      wikiTitle: 'Walt_Disney_World_Railroad',
      youtubeSearchQuery:
        'Walt Disney World Railroad Main Street Station 4K POV Magic Kingdom',
      streetBearingDeg: 0,
      icon: '🚂',
      lore: 'Turn-of-the-century Victorian brick depot overlooking Town Square where narrow-gauge steam locomotives depart on a 1.5-mile perimeter loop.',
      companionNote:
        'Step under the arches onto Main Street and catch that fresh waffle-cone scent drifting down toward the hub!',
    },
    {
      id: 'mk_cinderella_castle',
      name: 'Cinderella Castle Hub',
      lat: 28.4194,
      lon: -81.5812,
      elev: 57,
      category: 'Castle Icon',
      land: 'Fantasyland Hub',
      estimatedWaitMin: 0,
      snackNote: 'Sleepy Hollow Fresh Fruit Waffle & Dole Whip Float Nearby',
      wikiTitle: 'Cinderella_Castle',
      youtubeSearchQuery: 'Cinderella Castle Walkthrough 4K Magic Kingdom WDW',
      streetBearingDeg: 0,
      icon: '🏰',
      lore: '189-foot forced-perspective Gothic and Renaissance spire serving as the compass rose linking all six themed lands of Magic Kingdom.',
      companionNote:
        'Every spire narrows toward the sky to look twice as tall—best photo angle is slightly left of the Partners statue!',
    },
    {
      id: 'mk_pirates_of_the_caribbean',
      name: 'Pirates of the Caribbean',
      lat: 28.4181,
      lon: -81.5841,
      elev: 31,
      category: 'Dark Boat Ride',
      land: 'Adventureland',
      estimatedWaitMin: 30,
      snackNote: 'Aloha Isle Pineapple Dole Whip Soft Serve',
      wikiTitle: 'Pirates_of_the_Caribbean_(attraction)',
      youtubeVideoId: 'Ocek9XbtG00',
      youtubeSearchQuery: 'Pirates of the Caribbean 4K POV Magic Kingdom WDW',
      streetBearingDeg: 270,
      icon: '🏴‍☠️',
      lore: 'Cool bromine-scented sea fortress plunging guests down a misty waterfall into 17th-century coastal raids and cavern treasure rooms.',
      companionNote:
        'Nothing beats escaping Florida afternoon sun into Castillo del Morro’s cool queue—keep an eye out for the chess-playing skeletons!',
    },
    {
      id: 'mk_jungle_cruise',
      name: 'Jungle Cruise Boathouse',
      lat: 28.4178,
      lon: -81.5835,
      elev: 31,
      category: 'Scenic River Boat',
      land: 'Adventureland',
      estimatedWaitMin: 45,
      snackNote: 'Sunshine Tree Terrace Citrus Swirl',
      wikiTitle: 'Jungle_Cruise',
      youtubeSearchQuery: 'Jungle Cruise 4K Full Ride POV Magic Kingdom WDW',
      streetBearingDeg: 255,
      icon: '🚤',
      lore: 'Canopy boat expedition winding past Nile hippos, temple ruins, and Schweitzer Falls powered by pun-slinging skippers since opening day 1971.',
      companionNote:
        'Back side of water joke incoming—plus the night sailings turn Adventureland’s lanterns downright atmospheric!',
    },
    {
      id: 'mk_tianas_bayou_adventure',
      name: "Tiana's Bayou Adventure",
      lat: 28.4193,
      lon: -81.585,
      elev: 40,
      category: 'Log Flume',
      land: 'Frontierland',
      estimatedWaitMin: 55,
      snackNote: 'Golden Oak Outpost Tiana’s Famous Beignets',
      wikiTitle: "Tiana's_Bayou_Adventure",
      youtubeSearchQuery:
        "Tiana's Bayou Adventure 4K Front Row POV Magic Kingdom WDW",
      streetBearingDeg: 315,
      icon: '🎺',
      lore: 'Cypress-draped New Orleans salt dome culminating in a 50-foot splashdown plunge before Mardi Gras bayou celebration scenes.',
      companionNote:
        'Hold onto your sunglasses on that final briar-crest drop—front row guarantees a proper splash!',
    },
    {
      id: 'mk_big_thunder_mountain',
      name: 'Big Thunder Mountain Railroad',
      lat: 28.4203,
      lon: -81.5847,
      elev: 45,
      category: 'Mine Train Coaster',
      land: 'Frontierland',
      estimatedWaitMin: 40,
      snackNote: 'Pecos Bill Churro & Cornbread Bites',
      wikiTitle: 'Big_Thunder_Mountain_Railroad',
      youtubeSearchQuery:
        'Big Thunder Mountain Railroad 4K Night POV Magic Kingdom WDW',
      streetBearingDeg: 25,
      icon: '⛏️',
      lore: 'Red-rock Monument Valley mesas racing runaway ore trains past subterranean bat caverns, geysers, and wooden trestles along the Rivers of America.',
      companionNote:
        'Sit in the very last row for maximum whip over the dips—this is truly the wildest ride in the wilderness!',
    },
    {
      id: 'mk_haunted_mansion',
      name: 'The Haunted Mansion',
      lat: 28.4204,
      lon: -81.583,
      elev: 34,
      category: 'Omnimover Dark Ride',
      land: 'Liberty Square',
      estimatedWaitMin: 35,
      snackNote:
        'Liberty Square Market Pickle & Columbia Harbour House Cobbler',
      wikiTitle: 'The_Haunted_Mansion',
      youtubeVideoId: '4RyfWkUvas0',
      youtubeSearchQuery:
        'The Haunted Mansion 4K Full Ride POV Magic Kingdom WDW',
      streetBearingDeg: 10,
      icon: '👻',
      lore: 'Brick Hudson River Gothic manor hosting 999 happy haunts with Pepper’s Ghost ballroom waltzers and endless corridor illusions.',
      companionNote:
        'Step into the Stretching Room and look straight up when the lightning cracks—magic at dusk!',
    },
    {
      id: 'mk_seven_dwarfs_mine_train',
      name: 'Seven Dwarfs Mine Train',
      lat: 28.4205,
      lon: -81.5802,
      elev: 38,
      category: 'Swinging Coaster',
      land: 'Fantasyland',
      estimatedWaitMin: 65,
      snackNote: 'Gaston’s Tavern Warm Cinnamon Roll & LeFou’s Brew',
      wikiTitle: 'Seven_Dwarfs_Mine_Train',
      youtubeVideoId: 'sf8NARziZZM',
      youtubeSearchQuery:
        'Seven Dwarfs Mine Train 4K Front Row POV Magic Kingdom WDW',
      streetBearingDeg: 75,
      icon: '💎',
      lore: 'Cradled mine-cart coaster swinging gently around craggy Fantasyland peaks before drifting through the glowing jewel vault of the Seven Dwarfs.',
      companionNote:
        'Rock the car side-to-side during the lift hill—plus peek left on the cottage curve at the end!',
    },
    {
      id: 'mk_peter_pans_flight',
      name: "Peter Pan's Flight",
      lat: 28.42,
      lon: -81.5819,
      elev: 33,
      category: 'Suspended Dark Ride',
      land: 'Fantasyland',
      estimatedWaitMin: 60,
      snackNote: 'Friar’s Nook Tots & Pinocchio Village Haus Flatbread',
      wikiTitle: "Peter_Pan's_Flight",
      youtubeSearchQuery: "Peter Pan's Flight 4K Ride POV Magic Kingdom WDW",
      streetBearingDeg: 190,
      icon: '✨',
      lore: 'Ceiling-suspended galleons gliding high above miniature glowing London streets, Big Ben, and moonlit Never Land lagoons.',
      companionNote:
        'That silent takeoff out the Darling nursery window over tiny London headlights never gets old!',
    },
    {
      id: 'mk_its_a_small_world',
      name: "It's a Small World",
      lat: 28.4208,
      lon: -81.582,
      elev: 32,
      category: 'Canal Boat Classic',
      land: 'Fantasyland',
      estimatedWaitMin: 20,
      snackNote: 'Cheshire Café Cheshire Cat Tail Pastry',
      wikiTitle: "It's_a_Small_World",
      youtubeSearchQuery:
        "It's a Small World 4K Full Ride POV Magic Kingdom WDW",
      streetBearingDeg: 350,
      icon: '⛵',
      lore: 'Mary Blair-styled pastel clockwork facade opening onto pastel paper-cut continents united by Richard and Robert Sherman’s timeless anthem.',
      companionNote:
        'Try spotting the hidden hippo and Pinocchio marionettes—and yes, that melody is staying with us till fireworks!',
    },
    {
      id: 'mk_space_mountain',
      name: 'Space Mountain',
      lat: 28.4191,
      lon: -81.5772,
      elev: 55,
      category: 'Indoor Dark Coaster',
      land: 'Tomorrowland',
      estimatedWaitMin: 45,
      snackNote: 'Auntie Gravity’s Galactic Smoothie',
      wikiTitle: 'Space_Mountain_(Magic_Kingdom)',
      youtubeSearchQuery:
        'Space Mountain Alpha Omega 4K Lights On POV Magic Kingdom',
      streetBearingDeg: 90,
      icon: '🚀',
      lore: 'Soaring white ribbed Starport cone housing twin pitch-black Alpha and Omega steel coaster tracks hurtling past starfields since 1975.',
      companionNote:
        'Classic Star Tunnel escalator soundtrack sets the mood instantly—Alpha and Omega have subtle airtime differences!',
    },
    {
      id: 'mk_tron_lightcycle_run',
      name: 'TRON Lightcycle / Run',
      lat: 28.4204,
      lon: -81.5762,
      elev: 52,
      category: 'LSM Launch Coaster',
      land: 'Tomorrowland',
      estimatedWaitMin: 70,
      snackNote: 'Energy Bytes Digital Dumplings & Joffrey’s Nitro Cold Brew',
      wikiTitle: 'Tron_Lightcycle_Power_Run',
      youtubeVideoId: '9vAnkhwK6NY',
      youtubeSearchQuery:
        'TRON Lightcycle Run 4K Front Row Night POV Magic Kingdom WDW',
      streetBearingDeg: 45,
      icon: '🏍️',
      lore: 'Sweeping neon Upload Conduit canopy propelling straddle-seat Lightcycles at 59 mph beneath Tomorrowland’s glowing blue waveform.',
      companionNote:
        'Hit this canopy once dusk drops so the illuminated waveform arches mirror off every helmet visor!',
    },
  ],
  wdw_epcot: [
    {
      id: 'epcot_spaceship_earth',
      name: 'Spaceship Earth',
      lat: 28.3753,
      lon: -81.5494,
      elev: 56,
      category: 'Geodesic Icon',
      land: 'World Celebration',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 15,
      snackNote: 'Connections Café Liège Waffle & Cold Brew',
      wikiTitle: 'Spaceship_Earth_(Epcot)',
      youtubeVideoId: '8AI0yNMpt1E',
      youtubeSearchQuery: 'Spaceship Earth 4K Full Ride POV EPCOT WDW',
      streetBearingDeg: 180,
      icon: '🌐',
      lore: '18-story Alucobond geodesic sphere housing a slow spiral time-machine chronicle of human communication from Lascaux caves to silicon networks.',
      companionNote:
        'Nothing signals EPCOT day like hearing the Phoenix library embers crackle before rotating backward toward glowing Earth!',
    },
    {
      id: 'epcot_journey_of_water',
      name: 'Journey of Water',
      lat: 28.374,
      lon: -81.5504,
      elev: 31,
      category: 'Interactive Garden',
      land: 'World Nature',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 0,
      snackNote: 'Coral Reef Sea Salt Caramel Tarts Nearby',
      wikiTitle: 'Journey_of_Water',
      youtubeSearchQuery:
        'Journey of Water Inspired by Moana 4K Walkthrough EPCOT',
      streetBearingDeg: 210,
      icon: '💧',
      lore: 'Lush botanical walkway inspired by Moana where motion-responsive streams leap over stepping stones and chime like musical harp strings.',
      companionNote:
        'Wave across the mist curtains to trigger Te Fiti’s rainbow spray—super refreshing midway breather!',
    },
    {
      id: 'epcot_soarin_around_the_world',
      name: "Soarin' Around the World",
      lat: 28.3738,
      lon: -81.5522,
      elev: 34,
      category: 'Flying Theater',
      land: 'World Nature',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 35,
      snackNote: 'Sunshine Seasons Strawberry Shortcake',
      wikiTitle: "Soarin'_Around_the_World",
      youtubeVideoId: '84t8ltZ6nhI',
      youtubeSearchQuery: "Soarin' Around the World 4K Center Row B1 POV EPCOT",
      streetBearingDeg: 240,
      icon: '🪂',
      lore: '80-foot domed laser projection hang-glider flight sweeping over Matterhorn icefields, Kilimanjaro elephants, and the Taj Mahal with live scent cues.',
      companionNote:
        'Pro tip: request Concourse B, Row 1 from the cast member—dead-center, zero dangling feet above you!',
    },
    {
      id: 'epcot_living_with_the_land',
      name: 'Living with the Land',
      lat: 28.3741,
      lon: -81.5518,
      elev: 31,
      category: 'Greenhouse Boat Ride',
      land: 'World Nature',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 15,
      snackNote: 'Sunshine Seasons Fresh-Harvested Salad & Cookie',
      wikiTitle: 'Living_with_the_Land',
      youtubeSearchQuery: 'Living with the Land 4K Full Ride POV EPCOT WDW',
      streetBearingDeg: 245,
      icon: '🌱',
      lore: 'Calm indoor barge cruise floating past rainforest biomes and EPCOT’s real NASA-inspired hydroponic, vertical-trellis, and aquaponic greenhouses.',
      companionNote:
        'Ask anyone who visits EPCOT often—hidden Mickey pumpkins and nine-pound lemons make this quietly elite!',
    },
    {
      id: 'epcot_seas_with_nemo',
      name: 'The Seas Pavilion & Reef',
      lat: 28.3752,
      lon: -81.5512,
      elev: 31,
      category: 'Oceanarium & Dark Ride',
      land: 'World Nature',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 15,
      snackNote: 'Joffrey’s Shakin’ Jamaican Cold Brew Outside Plaza',
      wikiTitle: 'The_Seas_with_Nemo_&_Friends',
      youtubeSearchQuery:
        'The Seas with Nemo and Friends 4K Full Ride POV EPCOT',
      streetBearingDeg: 280,
      icon: '🐠',
      lore: '5.7-million-gallon saltwater oceanarium housing eagle rays, sea turtles, sharks, and rescued manatees inside an East Australian Current shell ride.',
      companionNote:
        'Spend five quiet minutes at the second-floor observation windows after disembarking—the sea turtles love hovering right there.',
    },
    {
      id: 'epcot_mission_space',
      name: 'Mission: SPACE',
      lat: 28.3738,
      lon: -81.5471,
      elev: 34,
      category: 'Centrifuge Flight Sim',
      land: 'World Discovery',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 25,
      snackNote: 'Space 220 Lounge Astro-Fizz Mocktail & Bites',
      wikiTitle: 'Mission:_Space',
      youtubeSearchQuery: 'Mission Space Orange & Green 4K POV EPCOT WDW',
      streetBearingDeg: 100,
      icon: '🛰️',
      lore: 'Multi-arm NASA-calibrated centrifuge simulator blasting four-person flight crews to Mars (Orange 2.5G) or orbital Earth loop (Green).',
      companionNote:
        'Orange Mission brings genuine liftoff G-forces—keep eyes locked forward on your cockpit monitor during boost!',
    },
    {
      id: 'epcot_cosmic_rewind',
      name: 'Guardians of the Galaxy: Cosmic Rewind',
      lat: 28.3754,
      lon: -81.5476,
      elev: 40,
      category: 'Reverse Omnicoaster',
      land: 'World Discovery',
      showcaseZone: 'front_of_park',
      estimatedWaitMin: 65,
      snackNote: 'Test Track Cool Wash Slushie Outside Wonders Pavilion',
      wikiTitle: 'Guardians_of_the_Galaxy:_Cosmic_Rewind',
      youtubeVideoId: 'w5JmLk1F6jQ',
      youtubeSearchQuery:
        'Guardians of the Galaxy Cosmic Rewind 4K Front Seat POV EPCOT',
      streetBearingDeg: 65,
      icon: '🌌',
      lore: 'Disney’s first reverse-launch indoor omnicoaster spinning each Xandarian Nova Corps shuttle dynamically toward celestial jump points and mixtapes.',
      companionNote:
        'Hands up—spinning smoothly into a surprise 80s needle-drop around the Moon makes this the smoothest coaster on Earth!',
    },
    {
      id: 'epcot_mexico_pavilion',
      name: 'Mexico Pavilion (World Showcase)',
      lat: 28.3712,
      lon: -81.5469,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · Mexico',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 15,
      snackNote: 'La Cava del Tequila Avocado Margarita & Choza Empanadas',
      wikiTitle: 'Mexico_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT Mexico Pavilion & Gran Fiesta Tour 4K Walkthrough POV',
      streetBearingDeg: 165,
      icon: '🇲🇽',
      lore: 'Pre-Columbian Mesoamerican step pyramid opening into a perpetual twilight plaza, San Ángel folk market, and Three Caballeros boat ride.',
      companionNote:
        'First stop clockwise around the lagoon—slip inside the cool twilight market next to the glowing smoking volcano!',
    },
    {
      id: 'epcot_norway_pavilion',
      name: 'Norway Pavilion (World Showcase)',
      lat: 28.3703,
      lon: -81.5462,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · Norway',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 55,
      snackNote: 'Kringla Bakeri School Bread (Cardamom Bun + Custard)',
      wikiTitle: 'Norway_Pavilion_at_Epcot',
      youtubeSearchQuery: 'Frozen Ever After & Norway Pavilion 4K POV EPCOT',
      streetBearingDeg: 185,
      icon: '🇳🇴',
      lore: 'Akerhus fortress stone arches, turf-roofed stave church replica, and Frozen Ever After’s glacier fjord boat adventure.',
      companionNote:
        'Zero debate: grab a coconut-topped School Bread at Kringla Bakeri before cruising through North Mountain!',
    },
    {
      id: 'epcot_china_pavilion',
      name: 'China Pavilion (World Showcase)',
      lat: 28.369,
      lon: -81.5461,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · China',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote:
        'Joy of Tea Honey Hibiscus Boba & House of Good Fortune Treats',
      wikiTitle: 'China_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT China Pavilion Temple of Heaven 4K Walkthrough',
      streetBearingDeg: 205,
      icon: '🇨🇳',
      lore: 'Crimson triple-eaved Temple of Heaven courtyard flanked by koi lotus ponds, miniature terracotta warriors, and 360-degree Wondrous China cinema.',
      companionNote:
        'Stand dead-center on the stone echo disc inside the Hall of Prayer for Good Harvests and clap once—pure acoustics!',
    },
    {
      id: 'epcot_germany_pavilion',
      name: 'Germany Pavilion (World Showcase)',
      lat: 28.3679,
      lon: -81.5469,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · Germany',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote: 'Karamell-Küche Fresh Warm Caramel Popcorn & Pretzel',
      wikiTitle: 'Germany_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT Germany Pavilion Karamell Kuche & Train Village 4K',
      streetBearingDeg: 235,
      icon: '🇩🇪',
      lore: 'Timber-framed Bavarian market square anchored by a roaring St. George fountain, glockenspiel tower, and G-scale Alpine garden railway.',
      companionNote:
        'Follow your nose straight into Karamell-Küche for warm Werther’s butter-caramel popcorn, then check the tiny mountain trains!',
    },
    {
      id: 'epcot_italy_pavilion',
      name: 'Italy Pavilion (World Showcase)',
      lat: 28.3673,
      lon: -81.5479,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · Italy',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote: 'Via Napoli Wood-Fired Margherita Slice & Gelateria Tiramisu',
      wikiTitle: 'Italy_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT Italy Pavilion Piazza San Marco 4K Walkthrough',
      streetBearingDeg: 255,
      icon: '🇮🇹',
      lore: 'Scaled Venetian Campanile bell tower and Doge’s Palace loggia overlooking gondolas moored along World Showcase Lagoon.',
      companionNote:
        'Tuck out onto the lagoon-side Isola plaza bridge for the cleanest panoramic view back toward Spaceship Earth!',
    },
    {
      id: 'epcot_american_adventure',
      name: 'The American Adventure (World Showcase)',
      lat: 28.3671,
      lon: -81.5494,
      elev: 33,
      category: 'World Showcase Host Pavilion',
      land: 'World Showcase · USA',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 20,
      snackNote: 'Regal Eagle Smokehouse BBQ & Banana Pudding',
      wikiTitle: 'The_American_Adventure_(Epcot)',
      youtubeSearchQuery: 'The American Adventure & Voices of Liberty 4K EPCOT',
      streetBearingDeg: 270,
      icon: '🇺🇸',
      lore: 'Georgian Colonial brick rotunda centered on the South shore housing 35 Audio-Animatronics and the acappella Voices of Liberty Choir under the dome.',
      companionNote:
        'Wait 5 minutes on the marble floor before seating so you hear Voices of Liberty echo straight up into the rotunda!',
    },
    {
      id: 'epcot_japan_pavilion',
      name: 'Japan Pavilion (World Showcase)',
      lat: 28.3674,
      lon: -81.551,
      elev: 32,
      category: 'World Showcase Country',
      land: 'World Showcase · Japan',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote: 'Kabuki Cafe Kakigori Shaved Ice & Mitsukoshi Treats',
      wikiTitle: 'Japan_Pavilion_at_Epcot',
      youtubeSearchQuery: 'EPCOT Japan Pavilion Katsura Grill & Koi Gardens 4K',
      streetBearingDeg: 295,
      icon: '🇯🇵',
      lore: 'Five-story vermilion Gojunoto pagoda beside tiered Katsura hill gardens, rushing stone waterfalls, and a floating red Shinto torii gate.',
      companionNote:
        'Walk all the way up past the koi stream behind Mitsukoshi—one of the quietest garden pockets in Orlando.',
    },
    {
      id: 'epcot_morocco_pavilion',
      name: 'Morocco Pavilion (World Showcase)',
      lat: 28.3683,
      lon: -81.552,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · Morocco',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote: 'Tangierine Café Pistachio Baklava & Fresh Mint Tea',
      wikiTitle: 'Morocco_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT Morocco Pavilion Medina Tilework 4K Walkthrough',
      streetBearingDeg: 320,
      icon: '🇲🇦',
      lore: 'Authentic hand-cut Fez zellige mosaic fountains and winding medina alleys crafted directly by royal Moroccan artisans beneath a Koutoubia minaret.',
      companionNote:
        'Wander deep into the shaded Fez Courtyard tile fountain—zero crowds and craftsmanship you can admire inches away.',
    },
    {
      id: 'epcot_france_pavilion',
      name: 'France Pavilion (World Showcase)',
      lat: 28.3694,
      lon: -81.5526,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · France',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 50,
      snackNote:
        'Les Halles Boulangerie Warm Baguette & Creperie Buckwheat Galette',
      wikiTitle: 'France_Pavilion_at_Epcot',
      youtubeVideoId: 'RrPw9CyuBJg',
      youtubeSearchQuery:
        "Remy's Ratatouille Adventure & France Pavilion 4K POV EPCOT",
      streetBearingDeg: 345,
      icon: '🇫🇷',
      lore: 'Haussmann Parisian rooftops crowned by an engineered Eiffel Tower replica leading back into Gusteau’s rat-scaled kitchen trackless ride.',
      companionNote:
        'Grab a warm Napoleon or ham-cheese baguette in Les Halles—it beats waiting till dinner every single time!',
    },
    {
      id: 'epcot_united_kingdom_pavilion',
      name: 'United Kingdom Pavilion (World Showcase)',
      lat: 28.3706,
      lon: -81.5519,
      elev: 31,
      category: 'World Showcase Country',
      land: 'World Showcase · United Kingdom',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 10,
      snackNote: 'Yorkshire County Fish Shop Crispy Fish & Chips',
      wikiTitle: 'United_Kingdom_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT United Kingdom Pavilion Hedge Maze & Courtyard 4K',
      streetBearingDeg: 25,
      icon: '🇬🇧',
      lore: 'Thatched Cotswold cottage gardens, red K6 phone boxes, hedge-maze courtyard, and Victorian Rose & Crown pub overlooking the International Gateway.',
      companionNote:
        'Take your fish-and-chips basket down the stone steps beside the pub right onto the waterfront seawall!',
    },
    {
      id: 'epcot_canada_pavilion',
      name: 'Canada Pavilion (World Showcase)',
      lat: 28.3714,
      lon: -81.5508,
      elev: 33,
      category: 'World Showcase Country',
      land: 'World Showcase · Canada',
      showcaseZone: 'world_showcase',
      estimatedWaitMin: 15,
      snackNote:
        'Popcorn Cart Maple Popcorn & Le Cellier Cheddar Soup at Festivals',
      wikiTitle: 'Canada_Pavilion_at_Epcot',
      youtubeSearchQuery:
        'EPCOT Canada Pavilion Waterfall Canyon & Butchart Gardens 4K',
      streetBearingDeg: 55,
      icon: '🇨🇦',
      lore: 'Château-style Hotel du Canada turrets rising behind a cedar totem square, Victoria Butchart terraced gardens, and a 30-foot canyon waterfall.',
      companionNote:
        'All eleven nations stamped on the loop—step behind the roaring stone falls and grab maple popcorn for the twilight lagoon walk!',
    },
  ],
  ...STAGE3_THEME_PARK_LANDMARKS,
  ...RESORT_STAY_LANDMARKS,
});

/**
 * Continent, country, and demographic metadata for all curated Metro Scooter Tours.
 */
export const METRO_TOUR_METADATA = Object.freeze({
  los_angeles: {
    id: 'los_angeles',
    name: 'Los Angeles',
    continent: 'North America',
    country: 'USA',
    populationNote: '2nd-largest US metro (~13.2M)',
  },
  atlanta: {
    id: 'atlanta',
    name: 'Atlanta',
    continent: 'North America',
    country: 'USA',
    populationNote: 'Southeast US capital (~6.3M)',
  },
  new_york: {
    id: 'new_york',
    name: 'New York',
    continent: 'North America',
    country: 'USA',
    populationNote: 'Largest US megacity (~19.6M)',
  },
  san_francisco: {
    id: 'san_francisco',
    name: 'San Francisco',
    continent: 'North America',
    country: 'USA',
    populationNote: 'Bay Area tech & maritime hub (~4.6M)',
  },
  chicago: {
    id: 'chicago',
    name: 'Chicago',
    continent: 'North America',
    country: 'USA',
    populationNote: '3rd-largest US metro (~9.4M)',
  },
  mexico_city: {
    id: 'mexico_city',
    name: 'Ciudad de México (Mexico City)',
    continent: 'North America',
    country: 'Mexico',
    populationNote: 'Largest Spanish-speaking megacity (~22.5M)',
  },
  sao_paulo: {
    id: 'sao_paulo',
    name: 'São Paulo',
    continent: 'South America',
    country: 'Brazil',
    populationNote: 'Largest city in Southern Hemisphere (~22.8M)',
  },
  buenos_aires: {
    id: 'buenos_aires',
    name: 'Buenos Aires',
    continent: 'South America',
    country: 'Argentina',
    populationNote: 'Rioplatense cultural capital (~15.6M)',
  },
  london: {
    id: 'london',
    name: 'London',
    continent: 'Europe',
    country: 'UK',
    populationNote: 'Largest Western European metro (~14.9M)',
  },
  paris: {
    id: 'paris',
    name: 'Paris',
    continent: 'Europe',
    country: 'France',
    populationNote: 'Île-de-France cultural capital (~11.3M)',
  },
  monaco: {
    id: 'monaco',
    name: 'Monaco',
    continent: 'Europe',
    country: 'Monaco',
    populationNote: 'Mediterranean principality',
  },
  istanbul: {
    id: 'istanbul',
    name: 'Istanbul',
    continent: 'Europe',
    country: 'Turkey',
    populationNote: 'Europe’s largest transcontinental megacity (~16.0M)',
  },
  cairo: {
    id: 'cairo',
    name: 'Cairo',
    continent: 'Africa',
    country: 'Egypt',
    populationNote: 'Largest city in North Africa & Arab world (~22.6M)',
  },
  lagos: {
    id: 'lagos',
    name: 'Lagos',
    continent: 'Africa',
    country: 'Nigeria',
    populationNote: 'Largest sub-Saharan African megacity (~16.5M)',
  },
  chongqing: {
    id: 'chongqing',
    name: 'Chongqing',
    continent: 'Asia',
    country: 'China',
    populationNote: "World's largest city proper (~32.0M)",
  },
  jakarta: {
    id: 'jakarta',
    name: 'Jakarta',
    continent: 'Asia',
    country: 'Indonesia',
    populationNote: "World's largest urban agglomeration (~42.0M)",
  },
  hong_kong: {
    id: 'hong_kong',
    name: 'Hong Kong',
    continent: 'Asia',
    country: 'China (SAR)',
    populationNote: "World's largest collection of skyscrapers (550+)",
  },
  shanghai: {
    id: 'shanghai',
    name: 'Shanghai',
    continent: 'Asia',
    country: 'China',
    populationNote: 'China’s financial & supertall powerhouse (~29.9M)',
  },
  beijing: {
    id: 'beijing',
    name: 'Beijing',
    continent: 'Asia',
    country: 'China',
    populationNote: 'Historic & imperial capital of China (~22.2M)',
  },
  shenzhen: {
    id: 'shenzhen',
    name: 'Shenzhen',
    continent: 'Asia',
    country: 'China',
    populationNote: 'Global hardware & supertall innovation hub (~17.8M)',
  },
  tokyo: {
    id: 'tokyo',
    name: 'Tokyo',
    continent: 'Asia',
    country: 'Japan',
    populationNote: 'Global megacity powerhouse (~37.1M)',
  },
  singapore: {
    id: 'singapore',
    name: 'Singapore',
    continent: 'Asia',
    country: 'Singapore',
    populationNote: 'Equatorial garden city-state (~6.0M)',
  },
  delhi: {
    id: 'delhi',
    name: 'Delhi',
    continent: 'Asia',
    country: 'India',
    populationNote: 'World-leading South Asian megacity (~33.8M)',
  },
  mumbai: {
    id: 'mumbai',
    name: 'Mumbai',
    continent: 'Asia',
    country: 'India',
    populationNote: 'Financial & Bollywood capital of India (~21.7M)',
  },
  seoul: {
    id: 'seoul',
    name: 'Seoul',
    continent: 'Asia',
    country: 'South Korea',
    populationNote: 'Korean cultural & tech capital (~26.0M metro)',
  },
  dhaka: {
    id: 'dhaka',
    name: 'Dhaka',
    continent: 'Asia',
    country: 'Bangladesh',
    populationNote:
      'Top-5 global megacity (~36.6M UN urban agglomeration / ~24M core)',
  },
  sydney: {
    id: 'sydney',
    name: 'Sydney',
    continent: 'Oceania',
    country: 'Australia',
    populationNote: 'Largest city in Oceania (~5.5M)',
  },
  melbourne: {
    id: 'melbourne',
    name: 'Melbourne',
    continent: 'Oceania',
    country: 'Australia',
    populationNote: 'Cultural & sporting capital of Australia (~5.3M)',
  },
  mcmurdo_station: {
    id: 'mcmurdo_station',
    name: 'McMurdo Station',
    continent: 'Antarctica',
    country: 'Antarctica',
    populationNote: 'Largest settlement on the Antarctic continent (~1,000)',
  },
  key_largo: {
    id: 'key_largo',
    name: 'Key Largo',
    continent: 'North America',
    country: 'USA',
    populationNote: 'Upper Florida Keys · Starter Easter Egg Island',
  },
  wdw_magic_kingdom: {
    id: 'wdw_magic_kingdom',
    name: 'Magic Kingdom (WDW)',
    continent: 'North America',
    country: 'USA',
    tourScope: 'venue',
    transitMode: 'walk_midway',
    itineraryPolicy: 'random',
    dayCycleEnabled: true,
    supportedModes: ['all'],
    dayCycle: {
      startLocalHour: 9.0,
      advanceHoursPerStop: 0.75,
      utcOffsetHours: -4,
    },
    centerLat: 28.4187,
    centerLon: -81.5818,
    radiusMeters: 2500,
    populationNote: 'Walt Disney World · 6 Lands · 12 Iconic Attractions',
  },
  wdw_epcot: {
    id: 'wdw_epcot',
    name: 'EPCOT (WDW)',
    continent: 'North America',
    country: 'USA',
    tourScope: 'venue',
    transitMode: 'walk_midway',
    itineraryPolicy: 'epcot_showcase_loop',
    dayCycleEnabled: true,
    supportedModes: ['all', 'front_of_park', 'world_showcase'],
    dayCycle: {
      startLocalHour: 9.5,
      advanceHoursPerStop: 0.65,
      utcOffsetHours: -4,
    },
    centerLat: 28.3747,
    centerLon: -81.5494,
    radiusMeters: 2500,
    populationNote: 'Walt Disney World · 11-Country World Showcase · 18 Stops',
  },
  ...STAGE3_THEME_PARK_METADATA,
  ...RESORT_STAY_METADATA,
});

const METRO_TOUR_CITY_ALIASES = Object.freeze({
  la: 'los_angeles',
  'l.a.': 'los_angeles',
  los_angeles: 'los_angeles',
  hollywood: 'los_angeles',
  nyc: 'new_york',
  new_york: 'new_york',
  new_york_city: 'new_york',
  sf: 'san_francisco',
  san_francisco: 'san_francisco',
  cuidad_de_mexico: 'mexico_city',
  ciudad_de_mexico: 'mexico_city',
  cdmx: 'mexico_city',
  mexico_city: 'mexico_city',
  df: 'mexico_city',
  hk: 'hong_kong',
  hong_kong: 'hong_kong',
  kowloon: 'hong_kong',
  sao_paulo: 'sao_paulo',
  new_delhi: 'delhi',
  delhi: 'delhi',
  buenos_aires: 'buenos_aires',
  mcmurdo: 'mcmurdo_station',
  antarctica: 'mcmurdo_station',
  mcmurdo_station: 'mcmurdo_station',
  key_largo: 'key_largo',
  key_loaner: 'key_largo',
  key_loaner_house: 'key_largo',
  florida_keys: 'key_largo',
  wdw_magic_kingdom: 'wdw_magic_kingdom',
  magic_kingdom: 'wdw_magic_kingdom',
  walt_disney_world_magic_kingdom: 'wdw_magic_kingdom',
  disney_magic_kingdom: 'wdw_magic_kingdom',
  wdw_epcot: 'wdw_epcot',
  epcot: 'wdw_epcot',
  walt_disney_world_epcot: 'wdw_epcot',
  disney_epcot: 'wdw_epcot',
  world_showcase: 'wdw_epcot',
  ...STAGE3_THEME_PARK_ALIASES,
  ...RESORT_STAY_ALIASES,
});

function stripTourDiacritics(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export const CUSTOM_TOURS_STORAGE_KEY = 'gev_custom_tours_v1';
export const CUSTOM_TOUR_RADIUS_METERS = 20000;

export const TOUR_STOP_CATEGORIES = Object.freeze([
  {
    id: 'Historic Landmark',
    label: 'Historic Landmark',
    icon: '🏛️',
    hint: 'Heritage buildings, monuments, civic squares, or local history',
  },
  {
    id: 'Local Secret',
    label: 'Local Secret',
    icon: '💎',
    hint: 'Insider neighborhood gems only locals know about',
  },
  {
    id: 'Scenic Overlook',
    label: 'Scenic Overlook',
    icon: '🔭',
    hint: 'Skyline views, sunset lookouts, hills, or bridges',
  },
  {
    id: 'Food & Café',
    label: 'Food & Café',
    icon: '🍽️',
    hint: 'Iconic bakeries, cafés, markets, or favorite dining spots',
  },
  {
    id: 'Art & Culture',
    label: 'Art & Culture',
    icon: '🎨',
    hint: 'Murals, galleries, music venues, or indie bookstores',
  },
  {
    id: 'Park & Trail',
    label: 'Park & Trail',
    icon: '🌿',
    hint: 'Greenways, botanical gardens, trails, or quiet groves',
  },
  {
    id: 'Architecture',
    label: 'Architecture',
    icon: '🏗️',
    hint: 'Distinctive homes, bridges, towers, or mid-century designs',
  },
  {
    id: 'Waterfront & Harbor',
    label: 'Waterfront & Harbor',
    icon: '⚓',
    hint: 'Piers, marinas, creek crossings, or lakeside boardwalks',
  },
]);

function generateTourSlug(raw, fallback = 'spot') {
  const clean = stripTourDiacritics(raw)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return clean || fallback;
}

export function inferContinentFromCoords(lat, lon) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) {
    return 'North America';
  }
  if (safeLat <= -60) return 'Antarctica';
  if (safeLon >= -170 && safeLon <= -25) {
    return safeLat >= 12 ? 'North America' : 'South America';
  }
  if (safeLon > -25 && safeLon <= 60) {
    if (safeLat >= 35) return 'Europe';
    return 'Africa';
  }
  if (safeLat < -10 && safeLon >= 110) return 'Oceania';
  return 'Asia';
}

export function generateDefaultCompanionNote({
  name = 'this spot',
  category = 'Local Secret',
  lore = '',
} = {}) {
  const cleanName = String(name || 'this spot').trim() || 'this spot';
  const cleanLore = String(lore || '').trim();
  const firstClause = cleanLore
    ? cleanLore.split(/[.!?]/)[0].trim().slice(0, 110)
    : '';
  if (firstClause && firstClause.length >= 12) {
    const lowerFirst =
      firstClause.charAt(0).toLowerCase() + firstClause.slice(1);
    return `Wait until you see ${cleanName}—${lowerFirst}!`;
  }
  return `Such a great ${String(category || 'local').toLowerCase()} stop at ${cleanName}—glad you showed me this place!`;
}

function getCategoryIcon(category) {
  const clean = stripTourDiacritics(category);
  const found = TOUR_STOP_CATEGORIES.find(
    (c) => stripTourDiacritics(c.id) === clean,
  );
  return found?.icon || '📍';
}

export function validateTourStopDraft(
  draft = {},
  { cityId = 'custom', existingIds = [] } = {},
) {
  const errors = [];
  const warnings = [];
  const name = String(draft?.name || '').trim();
  const lat = Number(draft?.lat);
  const lon = Number(draft?.lon);
  const rawElev = draft?.elev;
  const elev =
    rawElev === null || rawElev === undefined || rawElev === ''
      ? 50
      : Number(rawElev);
  const category = String(draft?.category || 'Local Secret').trim();
  const lore = String(draft?.lore || '').trim();
  const rawCompanionNote = String(draft?.companionNote || '').trim();
  const rawBearing = draft?.streetBearingDeg;
  const streetBearingDeg = Number.isFinite(Number(rawBearing))
    ? ((Number(rawBearing) % 360) + 360) % 360
    : 90;
  const wikiTitle = String(draft?.wikiTitle || '').trim() || null;
  const rawYoutubeVideoId = String(draft?.youtubeVideoId || '').trim();
  const youtubeSearchQuery =
    String(draft?.youtubeSearchQuery || '').trim() || null;
  const land = String(draft?.land || '').trim() || null;
  const rawWaitMin =
    draft?.estimatedWaitMin !== undefined && draft?.estimatedWaitMin !== null
      ? draft.estimatedWaitMin
      : draft?.waitTimeMin;
  const estimatedWaitMin =
    rawWaitMin === null || rawWaitMin === undefined || rawWaitMin === ''
      ? null
      : Number(rawWaitMin);
  const snackNote =
    String(draft?.snackNote || draft?.snackTag || '').trim() || null;
  const showcaseZone =
    String(draft?.showcaseZone || draft?.dayChapter || '').trim() || null;

  if (name.length < 2) {
    errors.push('Stop name must be at least 2 characters.');
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.push('Latitude must be a valid coordinate between -90 and 90.');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    errors.push('Longitude must be a valid coordinate between -180 and 180.');
  }
  if (!Number.isFinite(elev)) {
    errors.push('Elevation must be a valid number in meters.');
  }
  if (rawYoutubeVideoId && !YOUTUBE_VIDEO_ID_PATTERN.test(rawYoutubeVideoId)) {
    errors.push(
      'youtubeVideoId must be a valid 11-character YouTube video ID.',
    );
  }
  if (
    estimatedWaitMin !== null &&
    (!Number.isFinite(estimatedWaitMin) || estimatedWaitMin < 0)
  ) {
    errors.push('estimatedWaitMin must be a non-negative number.');
  }
  if (lore.length < 6) {
    errors.push(
      'Insider story (lore) must be at least 6 characters so tour bubbles have useful detail.',
    );
  }
  if (!rawCompanionNote) {
    warnings.push(
      'Companion commentary auto-drafted from your stop details to fulfill the tour contract.',
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, normalized: null };
  }

  const cityPrefix = generateTourSlug(cityId, 'custom').slice(0, 16);
  const stopSlug = generateTourSlug(name, 'stop');
  let id = String(draft?.id || '').trim() || `custom_${cityPrefix}_${stopSlug}`;
  const taken = new Set(existingIds || []);
  if (taken.has(id)) {
    let idx = 2;
    while (taken.has(`${id}_${idx}`)) idx += 1;
    id = `${id}_${idx}`;
  }

  const companionNote =
    rawCompanionNote ||
    generateDefaultCompanionNote({
      name,
      category: category || 'Local Secret',
      lore,
    });

  const normalized = {
    id,
    name,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    elev: Math.round(elev),
    category: category || 'Local Secret',
    lore,
    companionNote,
    streetBearingDeg: Math.round(streetBearingDeg),
    icon: String(draft?.icon || '').trim() || getCategoryIcon(category),
    ...(wikiTitle ? { wikiTitle } : {}),
    ...(rawYoutubeVideoId ? { youtubeVideoId: rawYoutubeVideoId } : {}),
    ...(youtubeSearchQuery ? { youtubeSearchQuery } : {}),
    ...(land ? { land } : {}),
    ...(estimatedWaitMin !== null
      ? {
          estimatedWaitMin: Math.round(estimatedWaitMin),
          waitTimeMin: Math.round(estimatedWaitMin),
        }
      : {}),
    ...(snackNote ? { snackNote, snackTag: snackNote } : {}),
    ...(showcaseZone ? { showcaseZone, dayChapter: showcaseZone } : {}),
    isCustom: true,
    createdAt: draft?.createdAt || new Date().toISOString(),
  };

  return { valid: true, errors: [], warnings, normalized };
}

export function validateCustomTourDraft(draft = {}, { existingIds = [] } = {}) {
  const errors = [];
  const name = String(draft?.name || '').trim();
  const centerLat = Number(draft?.centerLat ?? draft?.lat);
  const centerLon = Number(draft?.centerLon ?? draft?.lon);
  const country = String(draft?.country || 'Local Area').trim() || 'Local Area';
  const continent =
    String(draft?.continent || '').trim() ||
    inferContinentFromCoords(centerLat, centerLon);
  const radiusMeters = Number.isFinite(Number(draft?.radiusMeters))
    ? Math.max(1000, Number(draft.radiusMeters))
    : CUSTOM_TOUR_RADIUS_METERS;

  if (name.length < 2) {
    errors.push('Tour name must be at least 2 characters.');
  }
  if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) {
    errors.push('Tour anchor latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(centerLon) || centerLon < -180 || centerLon > 180) {
    errors.push('Tour anchor longitude must be between -180 and 180.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, normalized: null };
  }

  const baseSlug = `custom_${generateTourSlug(name, 'local_tour')}`;
  const taken = new Set([
    ...Object.keys(METRO_LANDMARK_CATALOG),
    ...Object.keys(METRO_TOUR_CITY_ALIASES),
    ...(existingIds || []),
  ]);
  let id = String(draft?.id || '').trim() || baseSlug;
  if (taken.has(id)) {
    let idx = 2;
    while (taken.has(`${baseSlug}_${idx}`)) idx += 1;
    id = `${baseSlug}_${idx}`;
  }

  const rawTourScope = String(draft?.tourScope || '').trim();
  const tourScope =
    rawTourScope === 'venue' ||
    rawTourScope === 'city' ||
    rawTourScope === 'metro'
      ? rawTourScope
      : null;
  const rawTransitMode = String(draft?.transitMode || '').trim();
  const transitMode =
    rawTransitMode === 'walk_midway' ||
    rawTransitMode === 'scooter' ||
    rawTransitMode === 'resort_cart'
      ? rawTransitMode
      : null;
  const itineraryPolicy = String(draft?.itineraryPolicy || '').trim() || null;
  const dayCycleEnabled =
    typeof draft?.dayCycleEnabled === 'boolean'
      ? draft.dayCycleEnabled
      : Boolean(draft?.dayCycle && typeof draft.dayCycle === 'object');
  const rawDayCycle =
    draft?.dayCycle && typeof draft.dayCycle === 'object'
      ? draft.dayCycle
      : null;

  const normalized = {
    id,
    name,
    continent,
    country,
    populationNote:
      String(draft?.populationNote || '').trim() ||
      'User-Curated Local Insider Tour',
    centerLat: Number(centerLat.toFixed(6)),
    centerLon: Number(centerLon.toFixed(6)),
    radiusMeters,
    ...(tourScope ? { tourScope } : {}),
    ...(transitMode ? { transitMode } : {}),
    ...(itineraryPolicy ? { itineraryPolicy } : {}),
    ...(dayCycleEnabled ? { dayCycleEnabled: true } : {}),
    ...(rawDayCycle ? { dayCycle: { ...rawDayCycle } } : {}),
    isCustom: true,
    createdAt: draft?.createdAt || new Date().toISOString(),
  };

  return { valid: true, errors: [], normalized };
}

let customToursRegistry = {
  version: 1,
  customTours: {},
  extraStopsByCityId: {},
};
let customToursLoaded = false;
const customTourListeners = new Set();
const runtimeBuiltTours = new Map();
const runtimeBuiltAliases = new Map();

const CATALOG_PLACE_CACHE = new Map();
const CATALOG_PLACE_IN_FLIGHT = new Map();
const ZERO_CREDIT_LOCALITY_MIRROR = new Map();
const CATALOG_PLACE_CACHE_MAX = 256;

function catalogPlaceCellKey(lat, lon) {
  return `${Math.round(Number(lat) * 200)}_${Math.round(Number(lon) * 200)}`;
}

onLocalityResolved(({ lat, lon, locality }) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !locality) return;
  const key = catalogPlaceCellKey(lat, lon);
  if (ZERO_CREDIT_LOCALITY_MIRROR.size >= CATALOG_PLACE_CACHE_MAX) {
    const oldest = ZERO_CREDIT_LOCALITY_MIRROR.keys().next().value;
    ZERO_CREDIT_LOCALITY_MIRROR.delete(oldest);
  }
  ZERO_CREDIT_LOCALITY_MIRROR.set(key, locality);
});

const NON_CONCRETE_MARINE_RE =
  /(?:^|\s)(?:pacific|atlantic|indian|arctic|southern)\s+ocean$/i;
const NON_CONCRETE_SEA_RE =
  /(?:^|\s)(?:mediterranean|caribbean|bering|tasman|arabian|coral|red|black|baltic|north|south china|east china|philippine|adriatic|aegean|caspian|sargasso|chukchi|beaufort|hudson|baffin)\s+sea$/i;
const NON_CONCRETE_WATER_PREFIX_RE =
  /^(?:bay|gulf|sea|strait|channel|sound)\s+of\b/i;
const NON_CONCRETE_WATER_SUFFIX_RE = /\b(?:ocean|sea|gulf|strait)\s*$/i;

/**
 * Normalizes Tour Framework v2 metadata across built-in, custom, and runtime-built
 * tours so every catalog entry carries `tourScope`, `radiusMeters`, and `transitMode`.
 */
export function normalizeTourV2Metadata(
  meta = {},
  cityId = '',
  landmarks = [],
) {
  const id =
    String(cityId || meta?.id || '').trim() ||
    generateTourSlug(meta?.name || 'tour', 'tour');
  const rawScope = String(meta?.tourScope || '').trim();
  const tourScope =
    rawScope === 'venue' || rawScope === 'city' || rawScope === 'metro'
      ? rawScope
      : 'metro';
  const rawTransit = String(meta?.transitMode || '').trim();
  const transitMode =
    rawTransit === 'walk_midway' ||
    rawTransit === 'scooter' ||
    rawTransit === 'resort_cart'
      ? rawTransit
      : tourScope === 'venue'
        ? 'walk_midway'
        : 'scooter';
  const venueCategory =
    meta?.venueCategory === 'resort_stay' || isResortStayId(id)
      ? 'resort_stay'
      : tourScope === 'venue'
        ? 'theme_park'
        : null;
  const defaultRadius =
    tourScope === 'venue'
      ? VENUE_TOUR_DEFAULT_RADIUS_METERS
      : meta?.isCustom
        ? CUSTOM_TOUR_RADIUS_METERS
        : METRO_TOUR_RADIUS_METERS;
  const minRadiusMeters = tourScope === 'venue' ? 250 : 1000;
  const radiusMeters = Number.isFinite(Number(meta?.radiusMeters))
    ? Math.max(minRadiusMeters, Number(meta.radiusMeters))
    : defaultRadius;

  const cityAnchor = LIVING_CITIES[id] || null;
  let centerLat = Number(meta?.centerLat ?? meta?.lat ?? cityAnchor?.lat);
  let centerLon = Number(meta?.centerLon ?? meta?.lon ?? cityAnchor?.lon);
  if (
    (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) &&
    Array.isArray(landmarks) &&
    landmarks.length > 0
  ) {
    const validStops = landmarks.filter(
      (s) => Number.isFinite(Number(s?.lat)) && Number.isFinite(Number(s?.lon)),
    );
    if (validStops.length > 0) {
      centerLat =
        validStops.reduce((sum, s) => sum + Number(s.lat), 0) /
        validStops.length;
      centerLon =
        validStops.reduce((sum, s) => sum + Number(s.lon), 0) /
        validStops.length;
    }
  }
  if (!Number.isFinite(centerLat)) centerLat = 0;
  if (!Number.isFinite(centerLon)) centerLon = 0;

  const name =
    String(meta?.name || cityAnchor?.name || '').trim() ||
    id
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const continent =
    String(meta?.continent || '').trim() ||
    inferContinentFromCoords(centerLat, centerLon);
  const country =
    String(meta?.country || cityAnchor?.country || 'Local Area').trim() ||
    'Local Area';

  return {
    ...meta,
    id,
    name,
    continent,
    country,
    tourScope,
    ...(venueCategory ? { venueCategory } : {}),
    radiusMeters,
    transitMode,
    centerLat: Number(centerLat.toFixed(6)),
    centerLon: Number(centerLon.toFixed(6)),
  };
}

/**
 * Registers or updates a Dev-Forge built tour in active RAM so `startCityTour`,
 * `resolveTourOrPlayContext`, `wanderDrawer`, `tourPoiCards`, and `sightseeingDrawer`
 * immediately activate Tour v2 stops and metadata without a page reload.
 */
export function registerBuiltTourRuntime(
  cityId,
  metadata = {},
  landmarks = [],
) {
  const key = generateTourSlug(
    cityId || metadata?.id || metadata?.name || '',
    '',
  );
  if (!key) {
    return {
      ok: false,
      errors: ['Tour cityId or name is required for runtime registration.'],
      cityId: null,
      metadata: null,
      landmarks: [],
    };
  }
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return {
      ok: false,
      errors: ['At least one valid tour landmark stop is required.'],
      cityId: key,
      metadata: null,
      landmarks: [],
    };
  }

  const displayName =
    String(metadata?.name || '').trim() ||
    key
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const validatedStops = [];
  const existingIds = [];
  const errors = [];

  for (let i = 0; i < landmarks.length; i += 1) {
    const rawStop = landmarks[i];
    const check = validateTourStopDraft(rawStop, {
      cityId: key,
      existingIds,
    });
    if (!check.valid || !check.normalized) {
      errors.push(`Stop #${i + 1}: ${(check.errors || []).join('; ')}`);
      continue;
    }
    existingIds.push(check.normalized.id);
    const cleanedStop = { ...check.normalized };
    delete cleanedStop.isCustom;
    cleanedStop.isRuntimeBuilt = true;
    validatedStops.push(enrichStopMediaMetadata(cleanedStop, displayName));
  }

  if (errors.length > 0 || validatedStops.length === 0) {
    return {
      ok: false,
      errors: errors.length > 0 ? errors : ['No valid tour landmarks found.'],
      cityId: key,
      metadata: null,
      landmarks: [],
    };
  }

  const normalizedMeta = normalizeTourV2Metadata(
    {
      ...metadata,
      id: key,
      name: displayName,
      isRuntimeBuilt: true,
    },
    key,
    validatedStops,
  );

  runtimeBuiltTours.set(key, {
    metadata: normalizedMeta,
    landmarks: validatedStops,
  });

  const registerAlias = (rawAlias) => {
    const clean = stripTourDiacritics(rawAlias);
    if (!clean) return;
    runtimeBuiltAliases.set(clean, key);
    runtimeBuiltAliases.set(clean.replace(/[\s-]+/g, '_'), key);
  };
  registerAlias(key);
  registerAlias(displayName);
  if (Array.isArray(normalizedMeta.aliases)) {
    for (const alias of normalizedMeta.aliases) {
      registerAlias(alias);
    }
  }

  emitCustomToursChange();

  return {
    ok: true,
    errors: [],
    cityId: key,
    metadata: { ...normalizedMeta },
    landmarks: validatedStops.map((s) => ({ ...s })),
  };
}

export function getRuntimeBuiltTours() {
  const out = {};
  for (const [id, entry] of runtimeBuiltTours.entries()) {
    out[id] = {
      metadata: { ...entry.metadata },
      landmarks: entry.landmarks.map((s) => ({ ...s })),
    };
  }
  return out;
}

export function clearRuntimeBuiltToursForTest() {
  runtimeBuiltTours.clear();
  runtimeBuiltAliases.clear();
  emitCustomToursChange();
}

const GENERIC_BIOME_PLACE_LABELS = new Set([
  'unknown sector',
  'earth',
  'current location',
  'local area',
  'living world',
  'dense urban',
  'urban',
  'urban core',
  'suburban',
  'suburban neighborhood',
  'rural',
  'farmland',
  'agricultural',
  'coastline',
  'coastal',
  'open ocean',
  'wilderness',
  'desert',
  'high desert',
  'rainforest',
  'tundra',
]);

const COORD_PAIR_NAME_RE =
  /^\s*-?\d+(?:\.\d+)?°?\s*[ns]?\s*[,/\s]+\s*-?\d+(?:\.\d+)?°?\s*[ew]?\s*$/i;

export function isConcreteCatalogPlaceName(name) {
  const raw = String(name ?? '').trim();
  if (raw.length < 2) return false;
  const lower = raw.toLowerCase();
  if (GENERIC_BIOME_PLACE_LABELS.has(lower)) {
    return false;
  }
  if (
    /^sector\b/i.test(raw) ||
    /\d+\.\d+°/.test(raw) ||
    COORD_PAIR_NAME_RE.test(raw)
  ) {
    return false;
  }
  for (const meta of Object.values(TYPOLOGY_METADATA || {})) {
    if (meta?.name && meta.name.toLowerCase() === lower) {
      return false;
    }
  }
  if (
    NON_CONCRETE_MARINE_RE.test(raw) ||
    NON_CONCRETE_SEA_RE.test(raw) ||
    NON_CONCRETE_WATER_PREFIX_RE.test(raw) ||
    NON_CONCRETE_WATER_SUFFIX_RE.test(raw)
  ) {
    return false;
  }
  return true;
}

export function getCachedCatalogPlaceAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = catalogPlaceCellKey(lat, lon);
  return CATALOG_PLACE_CACHE.has(key) ? CATALOG_PLACE_CACHE.get(key) : null;
}

export function clearCatalogPlaceCacheForTest() {
  CATALOG_PLACE_CACHE.clear();
  CATALOG_PLACE_IN_FLIGHT.clear();
  ZERO_CREDIT_LOCALITY_MIRROR.clear();
}

function storeCatalogPlaceCache(key, value) {
  if (CATALOG_PLACE_CACHE.size >= CATALOG_PLACE_CACHE_MAX) {
    const oldestKey = CATALOG_PLACE_CACHE.keys().next().value;
    CATALOG_PLACE_CACHE.delete(oldestKey);
  }
  CATALOG_PLACE_CACHE.set(key, value);
}

/**
 * Resolves a concrete settlement / neighborhood name from GEV's bundled offline
 * place-name catalogs (`us_census_places/`, `populated_places.json`,
 * `MAJOR_WORLD_METROS`, `wof_neighborhoods/`, or cached zero-credit locality).
 * Returns `null` over open ocean, rural biome expanses, or generic sector labels.
 */
export async function resolveCatalogPlaceAt(
  lat,
  lon,
  { radiusKm = 18, cachedLocality = null, lookupFns = null } = {},
) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return null;
  }
  const cellKey = catalogPlaceCellKey(lat, lon);
  const useCache = !lookupFns && !cachedLocality;
  if (useCache && CATALOG_PLACE_CACHE.has(cellKey)) {
    return CATALOG_PLACE_CACHE.get(cellKey);
  }
  if (useCache && CATALOG_PLACE_IN_FLIGHT.has(cellKey)) {
    return CATALOG_PLACE_IN_FLIGHT.get(cellKey);
  }

  const findPlaceAreaFn =
    lookupFns?.findPlaceAreaContainingPoint || findPlaceAreaContainingPoint;
  const placeBelowFn = lookupFns?.placeBelow || placeBelow;
  const nearPlaceRecordFn = lookupFns?.nearPlaceRecord || nearPlaceRecord;
  const findNeighborhoodFn =
    lookupFns?.findNeighborhoodAreaContainingPoint ||
    findNeighborhoodAreaContainingPoint;
  const majorMetros = lookupFns?.majorWorldMetros || MAJOR_WORLD_METROS || [];

  const run = async () => {
    let below = null;

    // Tier 1: US Census Places (incorporated cities, towns, CDPs)
    try {
      const censusArea = await findPlaceAreaFn(lat, lon);
      if (censusArea?.name) {
        const cleanName = String(censusArea.name)
          .replace(/\s+CDP$/i, '')
          .trim();
        if (isConcreteCatalogPlaceName(cleanName)) {
          const regionLabel = censusArea.regionCode || censusArea.region || '';
          return {
            name: cleanName,
            displayName: regionLabel
              ? `${cleanName}, ${regionLabel}`
              : cleanName,
            cityId: generateTourSlug(cleanName, 'local_place'),
            lat,
            lon,
            country: censusArea.country || 'United States of America',
            region: censusArea.region || '',
            regionCode: censusArea.regionCode || '',
            source: 'us-census',
            isCatalogPlace: true,
          };
        }
      }
    } catch {
      /* ignore pack miss */
    }

    // Tier 2: Natural Earth Countries / Marine + 7,342 Populated Places
    try {
      below = await placeBelowFn(lat, lon, { nearKm: null });
      if (below?.kind === 'ocean' || below?.kind === 'sea') {
        return null;
      }
      const nearRec = await nearPlaceRecordFn(lat, lon, radiusKm);
      if (nearRec?.name && isConcreteCatalogPlaceName(nearRec.name)) {
        const country = below?.kind === 'country' ? below.name : '';
        const division = below?.division || '';
        return {
          name: nearRec.name,
          displayName: [nearRec.name, division, country]
            .filter(Boolean)
            .join(', '),
          cityId: generateTourSlug(nearRec.name, 'local_place'),
          lat: nearRec.lat,
          lon: nearRec.lon,
          country,
          region: division,
          source: 'populated-places',
          isCatalogPlace: true,
        };
      }
    } catch {
      /* ignore pack miss */
    }

    // Tier 3: Bundled MAJOR_WORLD_METROS (138 entries within 25km)
    let bestMetro = null;
    let bestMetroDist = Infinity;
    for (const metro of majorMetros) {
      if (
        !metro ||
        !Number.isFinite(metro.lat) ||
        !Number.isFinite(metro.lon)
      ) {
        continue;
      }
      const dist = haversineDistanceMeters(lat, lon, metro.lat, metro.lon);
      if (dist <= 25000 && dist < bestMetroDist) {
        bestMetroDist = dist;
        bestMetro = metro;
      }
    }
    if (bestMetro?.name && isConcreteCatalogPlaceName(bestMetro.name)) {
      return {
        name: bestMetro.name,
        displayName: [bestMetro.name, bestMetro.region, bestMetro.country]
          .filter(Boolean)
          .join(', '),
        cityId: generateTourSlug(bestMetro.name, 'local_place'),
        lat: bestMetro.lat,
        lon: bestMetro.lon,
        country:
          bestMetro.country || (below?.kind === 'country' ? below.name : ''),
        region: bestMetro.region || below?.division || '',
        source: 'major-world-metros',
        isCatalogPlace: true,
      };
    }

    // Tier 4: Who's On First Neighborhoods
    try {
      const nb = await findNeighborhoodFn(lat, lon);
      if (nb?.name && isConcreteCatalogPlaceName(nb.name)) {
        const country =
          (below?.kind === 'country' ? below.name : '') || nb.country || '';
        return {
          name: nb.name,
          displayName: [nb.name, below?.division, country]
            .filter(Boolean)
            .join(', '),
          cityId: generateTourSlug(nb.name, 'local_place'),
          lat,
          lon,
          country,
          region: below?.division || '',
          source: 'wof',
          isCatalogPlace: true,
        };
      }
    } catch {
      /* ignore pack miss */
    }

    // Tier 5: Cached Zero-Credit Locality / Local Gazetteer
    const zeroCredit =
      cachedLocality ||
      ZERO_CREDIT_LOCALITY_MIRROR.get(cellKey) ||
      resolveKnownLocalGazetteer(lat, lon) ||
      null;
    if (
      zeroCredit?.city &&
      (zeroCredit.source === 'reverse_geocode' ||
        zeroCredit.source === 'gazetteer') &&
      isConcreteCatalogPlaceName(zeroCredit.city)
    ) {
      return {
        name: zeroCredit.city,
        displayName: zeroCredit.fullLabel || zeroCredit.city,
        cityId: generateTourSlug(zeroCredit.city, 'local_place'),
        lat,
        lon,
        country: zeroCredit.country || '',
        region: zeroCredit.region || '',
        source: 'zero-credit-locality',
        isCatalogPlace: true,
      };
    }

    return null;
  };

  const pending = run()
    .then((result) => {
      if (useCache) storeCatalogPlaceCache(cellKey, result);
      return result;
    })
    .finally(() => {
      if (useCache) CATALOG_PLACE_IN_FLIGHT.delete(cellKey);
    });

  if (useCache) {
    CATALOG_PLACE_IN_FLIGHT.set(cellKey, pending);
  }
  return pending;
}

function cloneCustomRegistry(reg = customToursRegistry) {
  const customTours = {};
  for (const [id, entry] of Object.entries(reg.customTours || {})) {
    customTours[id] = {
      metadata: entry?.metadata ? { ...entry.metadata } : null,
      stops: Array.isArray(entry?.stops)
        ? entry.stops.map((s) => ({ ...s }))
        : [],
    };
  }
  const extraStopsByCityId = {};
  for (const [cityId, stops] of Object.entries(reg.extraStopsByCityId || {})) {
    extraStopsByCityId[cityId] = Array.isArray(stops)
      ? stops.map((s) => ({ ...s }))
      : [];
  }
  return { version: 1, customTours, extraStopsByCityId };
}

function loadCustomToursRegistry() {
  if (customToursLoaded) return customToursRegistry;
  customToursLoaded = true;
  if (typeof localStorage === 'undefined') return customToursRegistry;
  try {
    const raw = localStorage.getItem(CUSTOM_TOURS_STORAGE_KEY);
    if (!raw) return customToursRegistry;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      customToursRegistry = {
        version: 1,
        customTours:
          parsed.customTours && typeof parsed.customTours === 'object'
            ? parsed.customTours
            : {},
        extraStopsByCityId:
          parsed.extraStopsByCityId &&
          typeof parsed.extraStopsByCityId === 'object'
            ? parsed.extraStopsByCityId
            : {},
      };
    }
  } catch {
    // Ignore storage read/parse errors and fall back to empty registry
  }
  return customToursRegistry;
}

function saveCustomToursRegistry() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      CUSTOM_TOURS_STORAGE_KEY,
      JSON.stringify(customToursRegistry),
    );
  } catch {
    // Ignore quota or disabled localStorage errors
  }
}

function emitCustomToursChange() {
  const snapshot = getCustomToursRegistry();
  for (const cb of customTourListeners) {
    try {
      cb(snapshot);
    } catch {}
  }
}

export function getCustomToursRegistry() {
  loadCustomToursRegistry();
  return cloneCustomRegistry(customToursRegistry);
}

export function onCustomToursChange(cb) {
  if (typeof cb !== 'function') return () => {};
  customTourListeners.add(cb);
  return () => customTourListeners.delete(cb);
}

export function clearCustomToursForTest() {
  customToursLoaded = true;
  customToursRegistry = {
    version: 1,
    customTours: {},
    extraStopsByCityId: {},
  };
  saveCustomToursRegistry();
  emitCustomToursChange();
}

function resolveCanonicalOrDynamicCityKey(cityIdOrQuery) {
  const clean = stripTourDiacritics(cityIdOrQuery);
  if (!clean || clean === 'auto') return null;

  const reg = loadCustomToursRegistry();
  const underscored = clean.replace(/[\s-]+/g, '_');
  if (reg.customTours[underscored]) return underscored;
  if (reg.customTours[clean]) return clean;
  for (const [id, entry] of Object.entries(reg.customTours)) {
    const nameClean = stripTourDiacritics(entry?.metadata?.name);
    if (nameClean && (nameClean === clean || nameClean.includes(clean))) {
      return id;
    }
  }

  if (runtimeBuiltTours.has(underscored)) return underscored;
  if (runtimeBuiltTours.has(clean)) return clean;
  if (runtimeBuiltAliases.has(underscored)) {
    return runtimeBuiltAliases.get(underscored);
  }
  if (runtimeBuiltAliases.has(clean)) {
    return runtimeBuiltAliases.get(clean);
  }
  for (const [id, entry] of runtimeBuiltTours.entries()) {
    const nameClean = stripTourDiacritics(entry?.metadata?.name);
    if (nameClean && (nameClean === clean || nameClean.includes(clean))) {
      return id;
    }
  }

  if (METRO_LANDMARK_CATALOG[underscored]) {
    return underscored;
  }
  if (METRO_TOUR_CITY_ALIASES[underscored]) {
    return METRO_TOUR_CITY_ALIASES[underscored];
  }
  if (METRO_TOUR_CITY_ALIASES[clean]) {
    return METRO_TOUR_CITY_ALIASES[clean];
  }

  for (const key of Object.keys(METRO_LANDMARK_CATALOG)) {
    const keyWords = key.replace(/_/g, ' ');
    if (clean.includes(keyWords) || underscored.includes(key)) {
      return key;
    }
  }
  for (const [alias, canonical] of Object.entries(METRO_TOUR_CITY_ALIASES)) {
    const aliasWords = alias.replace(/_/g, ' ');
    if (clean.includes(aliasWords) && METRO_LANDMARK_CATALOG[canonical]) {
      return canonical;
    }
  }
  return null;
}

export function getCustomStopsForCity(cityId) {
  const reg = loadCustomToursRegistry();
  const key = resolveCanonicalOrDynamicCityKey(cityId) || String(cityId || '');
  if (reg.customTours[key]) {
    return (reg.customTours[key].stops || []).map((s) => ({ ...s }));
  }
  return (reg.extraStopsByCityId[key] || []).map((s) => ({ ...s }));
}

export function getAllTourCatalogEntries() {
  const reg = loadCustomToursRegistry();
  const catalogByCityId = {};
  const metadataByCityId = {};
  const customCityIds = [];
  const runtimeBuiltCityIds = [];

  for (const [cityKey, builtInStops] of Object.entries(
    METRO_LANDMARK_CATALOG,
  )) {
    const extra = reg.extraStopsByCityId[cityKey] || [];
    const rawMeta = METRO_TOUR_METADATA[cityKey] || {
      id: cityKey,
      name: cityKey,
    };
    const mergedStops = [
      ...builtInStops.map((s) =>
        enrichStopMediaMetadata(s, rawMeta?.name || cityKey),
      ),
      ...extra.map((s) => enrichStopMediaMetadata(s, rawMeta?.name || cityKey)),
    ];
    catalogByCityId[cityKey] = mergedStops;
    metadataByCityId[cityKey] = normalizeTourV2Metadata(
      rawMeta,
      cityKey,
      mergedStops,
    );
  }

  for (const [runtimeId, entry] of runtimeBuiltTours.entries()) {
    if (!entry?.metadata) continue;
    runtimeBuiltCityIds.push(runtimeId);
    const extra = reg.extraStopsByCityId[runtimeId] || [];
    const mergedStops = [
      ...(entry.landmarks || []).map((s) =>
        enrichStopMediaMetadata(s, entry.metadata.name || runtimeId),
      ),
      ...extra.map((s) =>
        enrichStopMediaMetadata(s, entry.metadata.name || runtimeId),
      ),
    ];
    catalogByCityId[runtimeId] = mergedStops;
    metadataByCityId[runtimeId] = normalizeTourV2Metadata(
      entry.metadata,
      runtimeId,
      mergedStops,
    );
  }

  for (const [customId, entry] of Object.entries(reg.customTours || {})) {
    if (!entry?.metadata) continue;
    customCityIds.push(customId);
    const stops = (entry.stops || []).map((s) =>
      enrichStopMediaMetadata(s, entry.metadata.name || customId),
    );
    catalogByCityId[customId] = stops;
    metadataByCityId[customId] = normalizeTourV2Metadata(
      entry.metadata,
      customId,
      stops,
    );
  }

  return {
    catalogByCityId,
    metadataByCityId,
    customCityIds,
    runtimeBuiltCityIds,
  };
}

export function createCustomTour({ tour = {}, firstStop = {} } = {}) {
  const reg = loadCustomToursRegistry();
  const tourValidation = validateCustomTourDraft(tour, {
    existingIds: Object.keys(reg.customTours || {}),
  });
  if (!tourValidation.valid) {
    return {
      ok: false,
      errors: tourValidation.errors,
      tourId: null,
      metadata: null,
      stop: null,
    };
  }

  const stopValidation = validateTourStopDraft(firstStop, {
    cityId: tourValidation.normalized.id,
    existingIds: [],
  });
  if (!stopValidation.valid) {
    return {
      ok: false,
      errors: stopValidation.errors,
      tourId: null,
      metadata: null,
      stop: null,
    };
  }

  const tourId = tourValidation.normalized.id;
  reg.customTours[tourId] = {
    metadata: tourValidation.normalized,
    stops: [stopValidation.normalized],
  };
  saveCustomToursRegistry();
  emitCustomToursChange();

  return {
    ok: true,
    errors: [],
    warnings: stopValidation.warnings,
    tourId,
    metadata: { ...tourValidation.normalized },
    stop: { ...stopValidation.normalized },
    totalStops: 1,
  };
}

export function addTourStop({ cityId, stop = {} } = {}) {
  const reg = loadCustomToursRegistry();
  const rawCityId = String(cityId || '').trim();
  const resolvedKey =
    resolveCanonicalOrDynamicCityKey(rawCityId) ||
    generateTourSlug(rawCityId, '');

  if (!resolvedKey) {
    return {
      ok: false,
      errors: ['Select an existing tour or create a new local tour first.'],
      cityId: null,
      stop: null,
    };
  }

  const isCustomTour = Boolean(reg.customTours[resolvedKey]);
  const existingStops = isCustomTour
    ? reg.customTours[resolvedKey].stops || []
    : [
        ...(METRO_LANDMARK_CATALOG[resolvedKey] || []),
        ...(reg.extraStopsByCityId[resolvedKey] || []),
      ];

  const stopValidation = validateTourStopDraft(stop, {
    cityId: resolvedKey,
    existingIds: existingStops.map((s) => s.id),
  });
  if (!stopValidation.valid) {
    return {
      ok: false,
      errors: stopValidation.errors,
      cityId: resolvedKey,
      stop: null,
    };
  }

  if (isCustomTour) {
    reg.customTours[resolvedKey].stops.push(stopValidation.normalized);
  } else {
    if (!Array.isArray(reg.extraStopsByCityId[resolvedKey])) {
      reg.extraStopsByCityId[resolvedKey] = [];
    }
    reg.extraStopsByCityId[resolvedKey].push(stopValidation.normalized);
  }

  saveCustomToursRegistry();
  emitCustomToursChange();

  const totalStops = isCustomTour
    ? reg.customTours[resolvedKey].stops.length
    : (METRO_LANDMARK_CATALOG[resolvedKey]?.length || 0) +
      (reg.extraStopsByCityId[resolvedKey]?.length || 0);

  return {
    ok: true,
    errors: [],
    warnings: stopValidation.warnings,
    cityId: resolvedKey,
    stop: { ...stopValidation.normalized },
    totalStops,
  };
}

export function removeCustomTourStop(cityId, stopId) {
  const reg = loadCustomToursRegistry();
  const key = resolveCanonicalOrDynamicCityKey(cityId) || String(cityId || '');
  if (!key || !stopId) return false;

  if (reg.customTours[key]) {
    const before = reg.customTours[key].stops.length;
    reg.customTours[key].stops = reg.customTours[key].stops.filter(
      (s) => s.id !== stopId,
    );
    if (reg.customTours[key].stops.length !== before) {
      saveCustomToursRegistry();
      emitCustomToursChange();
      return true;
    }
    return false;
  }

  if (Array.isArray(reg.extraStopsByCityId[key])) {
    const before = reg.extraStopsByCityId[key].length;
    reg.extraStopsByCityId[key] = reg.extraStopsByCityId[key].filter(
      (s) => s.id !== stopId,
    );
    if (reg.extraStopsByCityId[key].length === 0) {
      delete reg.extraStopsByCityId[key];
    }
    if (
      before !==
      (reg.extraStopsByCityId[key] ? reg.extraStopsByCityId[key].length : 0)
    ) {
      saveCustomToursRegistry();
      emitCustomToursChange();
      return true;
    }
  }
  return false;
}

export function removeCustomTour(tourId) {
  const reg = loadCustomToursRegistry();
  const key = String(tourId || '').trim();
  if (!key || !reg.customTours[key]) return false;
  delete reg.customTours[key];
  saveCustomToursRegistry();
  emitCustomToursChange();
  return true;
}

export function exportTourAsContractJson(cityId) {
  const reg = loadCustomToursRegistry();
  const key = resolveCanonicalOrDynamicCityKey(cityId) || String(cityId || '');
  if (!key) return null;
  const landmarks = getLandmarksForCity(key);
  const rawMetadata = reg.customTours[key]?.metadata ||
    runtimeBuiltTours.get(key)?.metadata ||
    METRO_TOUR_METADATA[key] || {
      id: key,
      name: key,
      isCustom: Boolean(reg.customTours[key]),
    };
  const metadata = normalizeTourV2Metadata(rawMetadata, key, landmarks);
  return JSON.stringify(
    {
      schemaVersion: 2,
      cityId: key,
      metadata,
      landmarks,
    },
    null,
    2,
  );
}

/**
 * Normalizes any city ID, display name, accented spelling, or typo/alias
 * (e.g., "Cuidad de Mexico", "Ciudad de México", "CDMX", "São Paulo", "Hong Kong")
 * to its canonical METRO_LANDMARK_CATALOG or custom tour key when curated.
 */
export function normalizeMetroTourCityKey(cityIdOrQuery) {
  return resolveCanonicalOrDynamicCityKey(cityIdOrQuery);
}

/**
 * Unbiased Fisher-Yates shuffle returning a new randomized landmark array.
 * Guarantees that every tour initiation randomizes landmark order to prevent boredom.
 */
export function shuffleLandmarks(landmarks, rng = Math.random) {
  if (!Array.isArray(landmarks)) return [];
  const copy = landmarks.map((lm) => ({ ...lm }));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Ensures every tour stop carries non-mutating Tour v2 media defaults
 * (`wikiTitle` and evergreen `youtubeSearchQuery`) so both Theme Park Days
 * and classic city tours light up with Wikimedia cards and POV links.
 */
export function enrichStopMediaMetadata(stop, cityName = '') {
  if (!stop || typeof stop !== 'object') return stop;
  const cleanName = String(stop.name || 'Landmark').trim();
  const cleanCity = String(cityName || '').trim();
  const wikiTitle = String(stop.wikiTitle || '').trim() || cleanName;
  const rawYtId = String(stop.youtubeVideoId || '').trim();
  const youtubeVideoId = YOUTUBE_VIDEO_ID_PATTERN.test(rawYtId)
    ? rawYtId
    : null;
  const youtubeSearchQuery =
    String(stop.youtubeSearchQuery || '').trim() ||
    (cleanCity
      ? `${cleanName} ${cleanCity} 4K walking tour`
      : `${cleanName} 4K tour`);
  const waitVal = Number.isFinite(stop.estimatedWaitMin)
    ? stop.estimatedWaitMin
    : Number.isFinite(stop.waitTimeMin)
      ? stop.waitTimeMin
      : null;
  const snackVal = String(stop.snackNote || stop.snackTag || '').trim() || null;
  const zoneVal =
    String(stop.showcaseZone || stop.dayChapter || '').trim() || null;
  return {
    ...stop,
    wikiTitle,
    ...(youtubeVideoId ? { youtubeVideoId } : {}),
    youtubeSearchQuery,
    ...(waitVal !== null
      ? { estimatedWaitMin: waitVal, waitTimeMin: waitVal }
      : {}),
    ...(snackVal ? { snackNote: snackVal, snackTag: snackVal } : {}),
    ...(zoneVal ? { showcaseZone: zoneVal, dayChapter: zoneVal } : {}),
  };
}

/**
 * Filters a stop catalog by tourMode (e.g. 'all', 'front_of_park', 'world_showcase')
 * and optionally shuffles the resulting itinerary via Fisher-Yates.
 * For full-park EPCOT runs ('all'), shuffles the 7 front-of-park headliners for
 * morning/midday and randomly chooses clockwise (Mexico -> Canada),
 * counterclockwise (Canada -> Mexico), or full shuffle across the 11 World Showcase
 * countries for golden hour and dusk.
 */
export function buildTourItinerary(
  landmarks,
  { tourMode = 'all', rng = Math.random, shuffle = true } = {},
) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return [];
  const normalizedMode = String(tourMode || 'all')
    .trim()
    .toLowerCase();
  let filtered = landmarks;
  if (normalizedMode && normalizedMode !== 'all') {
    const modeMatches = landmarks.filter(
      (stop) =>
        String(stop?.showcaseZone || stop?.dayChapter || '')
          .trim()
          .toLowerCase() === normalizedMode,
    );
    if (modeMatches.length > 0) {
      filtered = modeMatches;
    }
  }
  if (!shuffle) {
    return filtered.map((lm) => ({ ...lm }));
  }

  if (!normalizedMode || normalizedMode === 'all') {
    const frontStops = filtered.filter(
      (s) =>
        String(s?.showcaseZone || s?.dayChapter || '')
          .trim()
          .toLowerCase() === 'front_of_park',
    );
    const showcaseStops = filtered.filter(
      (s) =>
        String(s?.showcaseZone || s?.dayChapter || '')
          .trim()
          .toLowerCase() === 'world_showcase',
    );
    if (
      frontStops.length > 0 &&
      showcaseStops.length > 0 &&
      frontStops.length + showcaseStops.length === filtered.length
    ) {
      const shuffledFront = shuffleLandmarks(frontStops, rng);
      const roll = rng();
      let orderedShowcase;
      if (roll < 0.34) {
        orderedShowcase = showcaseStops.map((lm) => ({ ...lm }));
      } else if (roll < 0.67) {
        orderedShowcase = showcaseStops
          .slice()
          .reverse()
          .map((lm) => ({ ...lm }));
      } else {
        orderedShowcase = shuffleLandmarks(showcaseStops, rng);
      }
      return [...shuffledFront, ...orderedShowcase];
    }

    const eveningCapstones = filtered.filter((s) =>
      Boolean(s?.isEveningCapstone),
    );
    if (
      eveningCapstones.length > 0 &&
      eveningCapstones.length < filtered.length
    ) {
      const morningStops = filtered.filter(
        (s) =>
          !s?.isEveningCapstone &&
          String(s?.dayChapter || '')
            .trim()
            .toLowerCase() === 'morning_arrival',
      );
      const middayStops = filtered.filter(
        (s) =>
          !s?.isEveningCapstone &&
          String(s?.dayChapter || '')
            .trim()
            .toLowerCase() !== 'morning_arrival',
      );
      return [
        ...morningStops.map((lm) => ({ ...lm })),
        ...shuffleLandmarks(middayStops, rng),
        ...eveningCapstones.map((lm) => ({ ...lm })),
      ];
    }
  }

  return shuffleLandmarks(filtered, rng);
}

/**
 * Computes the solar clock state for a stop along a day-cycle venue tour
 * so sunlight progresses gracefully from morning rope-drop toward dusk.
 */
export function computeDayCycleSolarState({
  dayCycle = null,
  stopIndex = 0,
  totalStops = 1,
  nowDate = new Date(),
} = {}) {
  const startLocalHour = Number.isFinite(dayCycle?.startLocalHour)
    ? dayCycle.startLocalHour
    : 9.0;
  const advanceHoursPerStop = Number.isFinite(dayCycle?.advanceHoursPerStop)
    ? dayCycle.advanceHoursPerStop
    : 0.75;
  const utcOffsetHours = Number.isFinite(dayCycle?.utcOffsetHours)
    ? dayCycle.utcOffsetHours
    : -4;
  const safeIdx = Math.max(0, Number(stopIndex) || 0);
  const localHour = Math.min(
    20.5,
    Math.max(6.0, startLocalHour + safeIdx * advanceHoursPerStop),
  );
  const utcHour = localHour - utcOffsetHours;
  const refDate =
    nowDate instanceof Date && !Number.isNaN(nowDate.getTime())
      ? nowDate
      : new Date('2026-06-21T12:00:00.000Z');
  const utcMidnightMs = Date.UTC(
    refDate.getUTCFullYear(),
    refDate.getUTCMonth(),
    refDate.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const targetDate = new Date(
    utcMidnightMs + Math.round(utcHour * 3600 * 1000),
  );
  const isoString = targetDate.toISOString();
  let julianDate = null;
  try {
    julianDate = Cesium.JulianDate.fromIso8601(isoString);
  } catch {
    julianDate = null;
  }
  return {
    stopIndex: safeIdx,
    totalStops: Math.max(1, Number(totalStops) || 1),
    localHour,
    utcHour,
    isoString,
    julianDate,
  };
}

/**
 * Finds the nearest curated tight-radius venue tour (e.g. WDW Magic Kingdom or EPCOT)
 * within its configured venue radius. Keeps theme parks out of LIVING_CITIES.
 */
export function findNearestVenueTour(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  let bestDist = Infinity;
  const venueCandidates = [
    ...Object.values(METRO_TOUR_METADATA || {}),
    ...Array.from(runtimeBuiltTours.values()).map((entry) => entry?.metadata),
  ];
  for (const meta of venueCandidates) {
    if (
      meta?.tourScope !== 'venue' ||
      !Number.isFinite(meta.centerLat) ||
      !Number.isFinite(meta.centerLon)
    ) {
      continue;
    }
    const radius = Number.isFinite(meta.radiusMeters)
      ? meta.radiusMeters
      : VENUE_TOUR_DEFAULT_RADIUS_METERS;
    const dist = haversineDistanceMeters(
      lat,
      lon,
      meta.centerLat,
      meta.centerLon,
    );
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = {
        ...normalizeTourV2Metadata(meta, meta.id),
        distanceMeters: dist,
        landmarks: getLandmarksForCity(meta.id),
      };
    }
  }
  return best;
}

function findNearestRuntimeBuiltTour(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const [id, entry] of runtimeBuiltTours.entries()) {
    const meta = entry?.metadata;
    const stops = Array.isArray(entry?.landmarks) ? entry.landmarks : [];
    if (!meta || stops.length === 0) continue;
    const anchorLat = Number.isFinite(meta.centerLat)
      ? meta.centerLat
      : stops[0]?.lat;
    const anchorLon = Number.isFinite(meta.centerLon)
      ? meta.centerLon
      : stops[0]?.lon;
    if (!Number.isFinite(anchorLat) || !Number.isFinite(anchorLon)) continue;
    const dist = haversineDistanceMeters(lat, lon, anchorLat, anchorLon);
    const radius = meta.radiusMeters || METRO_TOUR_RADIUS_METERS;
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = {
        cityId: id,
        cityName: meta.name || id,
        metadata: normalizeTourV2Metadata(meta, id, stops),
        landmarks: getLandmarksForCity(id),
        distanceMeters: dist,
      };
    }
  }
  return best;
}

/**
 * Synthesizes a 4-landmark metro tour for any city in MAJOR_WORLD_METROS
 * that does not have a hand-authored entry in METRO_LANDMARK_CATALOG.
 */
export function buildDynamicMetroLandmarks(metro) {
  const baseLat = metro.lat;
  const baseLon = metro.lon;
  const cityName = metro.name || 'Metro';
  const mainLandmark = metro.landmark || `${cityName} Civic Plaza`;

  return [
    {
      id: `${cityName.toLowerCase().replace(/\s+/g, '_')}_landmark_1`,
      name: `${mainLandmark} (${cityName})`,
      lat: baseLat,
      lon: baseLon,
      elev: 50,
      category: 'Signature Landmark',
      lore: `Historic heart of ${cityName}, anchoring the downtown pedestrian promenade and civic skyline.`,
      companionNote: `Right in the heart of ${cityName} at ${mainLandmark}!`,
    },
    {
      id: `${cityName.toLowerCase().replace(/\s+/g, '_')}_landmark_2`,
      name: `${cityName} Old City Hall & Historic Square`,
      lat: baseLat + 0.0042,
      lon: baseLon - 0.0035,
      elev: 50,
      category: 'Historic Civic Core',
      lore: `Landmark municipal plaza and heritage architecture preserving ${cityName}'s foundational era.`,
      companionNote: `Love the classic stone architecture around ${cityName}'s historic civic square.`,
    },
    {
      id: `${cityName.toLowerCase().replace(/\s+/g, '_')}_landmark_3`,
      name: `${cityName} Cultural & Arts District`,
      lat: baseLat - 0.0038,
      lon: baseLon + 0.0045,
      elev: 50,
      category: 'Arts & Dining Quarter',
      lore: `Vibrant gallery row, historic theaters, and open-air street murals celebrating ${cityName} culture.`,
      companionNote: `Great street energy here—cafés, murals, and theater marquees everywhere.`,
    },
    {
      id: `${cityName.toLowerCase().replace(/\s+/g, '_')}_landmark_4`,
      name: `${cityName} Central Park & Overlook`,
      lat: baseLat + 0.0055,
      lon: baseLon + 0.0048,
      elev: 55,
      category: 'Scenic Parkland',
      lore: `Tree-canopied urban greenway and fountain promenade offering panoramic views of the ${cityName} skyline.`,
      companionNote: `Such a peaceful green oasis looking back at the ${cityName} towers.`,
    },
  ];
}

function findNearestCustomTour(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const reg = loadCustomToursRegistry();
  let best = null;
  let bestDist = Infinity;
  for (const [id, entry] of Object.entries(reg.customTours || {})) {
    const stops = Array.isArray(entry?.stops) ? entry.stops : [];
    const meta = entry?.metadata;
    if (!meta || stops.length === 0) continue;
    const anchorLat = Number.isFinite(meta.centerLat)
      ? meta.centerLat
      : stops[0]?.lat;
    const anchorLon = Number.isFinite(meta.centerLon)
      ? meta.centerLon
      : stops[0]?.lon;
    if (!Number.isFinite(anchorLat) || !Number.isFinite(anchorLon)) continue;
    const dist = haversineDistanceMeters(lat, lon, anchorLat, anchorLon);
    const radius = meta.radiusMeters || CUSTOM_TOUR_RADIUS_METERS;
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = {
        cityId: id,
        cityName: meta.name || id,
        metadata: meta,
        landmarks: stops.map((s) => ({ ...s })),
        distanceMeters: dist,
      };
    }
  }
  return best;
}

/**
 * Resolves the closest major metro (and its landmark list) for a coordinate pair,
 * even when the coordinate is outside the 25km metro core (e.g. "Nearest Metro / Current View").
 */
export function resolveNearestMetroForTour(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      cityId: 'los_angeles',
      cityName: 'Los Angeles',
      landmarks: getLandmarksForCity('los_angeles'),
    };
  }

  const nearestCustom = findNearestCustomTour(lat, lon);
  const nearestVenue = findNearestVenueTour(lat, lon);
  const nearestRuntime = findNearestRuntimeBuiltTour(lat, lon);

  let bestCity = null;
  let bestCityDist = Infinity;
  for (const city of Object.values(LIVING_CITIES || {})) {
    const dist = haversineDistanceMeters(lat, lon, city.lat, city.lon);
    if (
      dist < bestCityDist &&
      (METRO_LANDMARK_CATALOG[city.id] || runtimeBuiltTours.has(city.id))
    ) {
      bestCityDist = dist;
      bestCity = city;
    }
  }

  let bestMetro = null;
  let bestMetroDist = Infinity;
  for (const metro of MAJOR_WORLD_METROS || []) {
    const dist = haversineDistanceMeters(lat, lon, metro.lat, metro.lon);
    if (dist < bestMetroDist) {
      bestMetroDist = dist;
      bestMetro = metro;
    }
  }

  if (
    nearestCustom &&
    (!nearestVenue ||
      nearestCustom.distanceMeters <= nearestVenue.distanceMeters) &&
    (!nearestRuntime ||
      nearestCustom.distanceMeters <= nearestRuntime.distanceMeters) &&
    nearestCustom.distanceMeters <= bestCityDist &&
    nearestCustom.distanceMeters <= bestMetroDist
  ) {
    return {
      cityId: nearestCustom.cityId,
      cityName: nearestCustom.cityName,
      landmarks: nearestCustom.landmarks,
      isCustomTour: true,
      metadata: normalizeTourV2Metadata(
        nearestCustom.metadata,
        nearestCustom.cityId,
        nearestCustom.landmarks,
      ),
    };
  }

  if (nearestVenue) {
    return {
      cityId: nearestVenue.id,
      cityName: nearestVenue.name,
      landmarks: nearestVenue.landmarks,
      tourScope: 'venue',
      metadata: nearestVenue,
    };
  }

  if (
    nearestRuntime &&
    nearestRuntime.distanceMeters <= bestCityDist &&
    (nearestRuntime.distanceMeters <= bestMetroDist ||
      nearestRuntime.distanceMeters <= METRO_TOUR_RADIUS_METERS)
  ) {
    return {
      cityId: nearestRuntime.cityId,
      cityName: nearestRuntime.cityName,
      landmarks: nearestRuntime.landmarks,
      tourScope: nearestRuntime.metadata?.tourScope || 'metro',
      isRuntimeBuilt: true,
      metadata: nearestRuntime.metadata,
    };
  }

  if (
    bestCity &&
    (bestCityDist <= METRO_TOUR_RADIUS_METERS || bestCityDist <= bestMetroDist)
  ) {
    return {
      cityId: bestCity.id,
      cityName: METRO_TOUR_METADATA[bestCity.id]?.name || bestCity.name,
      landmarks: getLandmarksForCity(bestCity.id),
    };
  }

  if (bestMetro) {
    const canonicalKey = normalizeMetroTourCityKey(bestMetro.name);
    if (
      canonicalKey &&
      (METRO_LANDMARK_CATALOG[canonicalKey] ||
        runtimeBuiltTours.has(canonicalKey))
    ) {
      return {
        cityId: canonicalKey,
        cityName:
          runtimeBuiltTours.get(canonicalKey)?.metadata?.name ||
          METRO_TOUR_METADATA[canonicalKey]?.name ||
          bestMetro.name,
        landmarks: getLandmarksForCity(canonicalKey),
      };
    }

    const cityKey = stripTourDiacritics(bestMetro.name).replace(/\s+/g, '_');
    return {
      cityId: cityKey,
      cityName: bestMetro.name,
      landmarks: getLandmarksForCity(cityKey),
    };
  }

  return {
    cityId: 'los_angeles',
    cityName: 'Los Angeles',
    landmarks: getLandmarksForCity('los_angeles'),
  };
}

/**
 * Resolves the landmark list for a given city ID or coordinate pair,
 * merging built-in catalog/dynamic/runtime stops with any user-authored custom stops.
 */
export function getLandmarksForCity(cityIdOrQuery, lat = null, lon = null) {
  const reg = loadCustomToursRegistry();
  const finalizeStops = (stops, cityLabel = '') =>
    (Array.isArray(stops) ? stops : []).map((s) =>
      enrichStopMediaMetadata(s, cityLabel),
    );
  if (
    typeof cityIdOrQuery === 'string' &&
    cityIdOrQuery.trim() &&
    cityIdOrQuery.trim().toLowerCase() !== 'auto'
  ) {
    const canonicalKey = normalizeMetroTourCityKey(cityIdOrQuery);
    if (canonicalKey && reg.customTours[canonicalKey]) {
      const cityLabel =
        reg.customTours[canonicalKey].metadata?.name || canonicalKey;
      return finalizeStops(reg.customTours[canonicalKey].stops, cityLabel);
    }
    if (canonicalKey && runtimeBuiltTours.has(canonicalKey)) {
      const entry = runtimeBuiltTours.get(canonicalKey);
      const extra = reg.extraStopsByCityId[canonicalKey] || [];
      const cityLabel = entry.metadata?.name || canonicalKey;
      return finalizeStops([...entry.landmarks, ...extra], cityLabel);
    }
    if (canonicalKey && METRO_LANDMARK_CATALOG[canonicalKey]) {
      const extra = reg.extraStopsByCityId[canonicalKey] || [];
      const cityLabel =
        METRO_TOUR_METADATA[canonicalKey]?.name ||
        LIVING_CITIES[canonicalKey]?.name ||
        canonicalKey;
      return finalizeStops(
        [...METRO_LANDMARK_CATALOG[canonicalKey], ...extra],
        cityLabel,
      );
    }

    const clean = stripTourDiacritics(cityIdOrQuery);
    const underscored = clean.replace(/[\s-]+/g, '_');
    if (reg.customTours[underscored]) {
      const cityLabel =
        reg.customTours[underscored].metadata?.name || underscored;
      return finalizeStops(reg.customTours[underscored].stops, cityLabel);
    }
    if (runtimeBuiltTours.has(underscored)) {
      const entry = runtimeBuiltTours.get(underscored);
      const extra = reg.extraStopsByCityId[underscored] || [];
      const cityLabel = entry.metadata?.name || underscored;
      return finalizeStops([...entry.landmarks, ...extra], cityLabel);
    }
    const matchedMetro = (MAJOR_WORLD_METROS || []).find((m) => {
      const metroClean = stripTourDiacritics(m.name);
      return metroClean.replace(/\s+/g, '_') === clean || metroClean === clean;
    });
    if (matchedMetro) {
      const dynamicStops = buildDynamicMetroLandmarks(matchedMetro);
      const extra =
        reg.extraStopsByCityId[underscored] ||
        reg.extraStopsByCityId[clean] ||
        [];
      return finalizeStops(
        [...dynamicStops, ...extra],
        matchedMetro.name || '',
      );
    }
    if (
      Array.isArray(reg.extraStopsByCityId[underscored]) &&
      reg.extraStopsByCityId[underscored].length > 0
    ) {
      return finalizeStops(reg.extraStopsByCityId[underscored], underscored);
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return resolveNearestMetroForTour(lat, lon).landmarks;
  }

  const laExtra = reg.extraStopsByCityId.los_angeles || [];
  return finalizeStops(
    [...METRO_LANDMARK_CATALOG.los_angeles, ...laExtra],
    'Los Angeles',
  );
}

/**
 * Generates environment-aware 'Play' activities for non-metro / tourist / biome locations,
 * combining Living World environmental suggestions (Mountain Hike, Farmland Hike, Harbor Pier,
 * Prairie Trek, Theme Park Midway) with classic tourist leisure (Visit the Beach, See a Movie,
 * Go Out to Eat, Go Shopping).
 */
export function getPlayActivitiesForEnvironment({
  typology = null,
  lat = 33.749,
  lon = -84.388,
  elevationMeters = 0,
} = {}) {
  const effectiveTypology =
    typology ||
    classifySettlementTypology({ lat, lon, elevationMeters }).typology;
  const meta =
    TYPOLOGY_METADATA[effectiveTypology] ||
    TYPOLOGY_METADATA[SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER];

  const environmentalActivities = [];

  if (
    effectiveTypology === SETTLEMENT_TYPOLOGIES.WILDERNESS_SANCTUARY ||
    effectiveTypology === SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT ||
    effectiveTypology === 'alpine_village' ||
    elevationMeters >= 850
  ) {
    environmentalActivities.push(
      {
        id: 'mountain_hike',
        name: 'Mountain Ridge & Trailhead Hike',
        label: 'Mountain Ridge & Trailhead Hike',
        icon: '🥾',
        isEnvironmentSuggested: true,
        environmentBadge: `${meta.icon} Living World Suggestion`,
        speedMps: 1.45,
        lore: 'Ascending the scenic mountain trailhead through pine switchbacks and rocky overlooks as crisp alpine air sweeps across the ridge.',
        companionNote:
          'The elevation gain is worth every step—look at that panoramic mountain vista opening up!',
      },
      {
        id: 'campfire_overlook',
        name: 'Scenic Overlook & Campfire Rest',
        label: 'Scenic Overlook & Campfire Rest',
        icon: '🔥',
        isEnvironmentSuggested: true,
        environmentBadge: `${meta.icon} Living World Suggestion`,
        speedMps: 1.1,
        lore: 'Pausing at a timber-and-stone backcountry overlook where hikers gather around a warm evening fire ring.',
        companionNote:
          'Crackling pine embers, mountain breeze, and zero city noise.',
      },
    );
  } else if (
    effectiveTypology === SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL ||
    effectiveTypology === 'agricultural_heartland'
  ) {
    environmentalActivities.push(
      {
        id: 'farmland_hike',
        name: 'Farmland Hedgerow & Country Lane Hike',
        label: 'Farmland Hedgerow & Country Lane Hike',
        icon: '🌾',
        isEnvironmentSuggested: true,
        environmentBadge: '🌽 Living World Suggestion',
        speedMps: 1.35,
        lore: 'Trekking along unpaved country section lanes bordered by golden crop fields, windbreak oaks, and historic farm silos.',
        companionNote:
          'Open skies, meadowlarks singing on the fenceposts, and miles of peaceful countryside.',
      },
      {
        id: 'farm_stand_market',
        name: 'Roadside Orchard & Farm Stand Visit',
        label: 'Roadside Orchard & Farm Stand Visit',
        icon: '🧺',
        isEnvironmentSuggested: true,
        environmentBadge: '🌽 Living World Suggestion',
        speedMps: 1.15,
        lore: 'Browsing heirloom produce crates, local wildflower honey jars, and cold-pressed cider at a timber farm stand.',
        companionNote:
          'Nothing beats fresh-picked orchard fruit right off a country lane!',
      },
    );
  } else if (effectiveTypology === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER) {
    environmentalActivities.push({
      id: 'coastal_dock_hike',
      name: 'Working Harbor Pier & Salt-Marsh Walk',
      label: 'Working Harbor Pier & Salt-Marsh Walk',
      icon: '🦐',
      isEnvironmentSuggested: true,
      environmentBadge: '🦐 Living World Suggestion',
      speedMps: 1.25,
      lore: 'Strolling weathered timber shrimping docks, oyster-shell paths, and tidal marsh boardwalks as gulls wheel overhead.',
      companionNote:
        'Look at the shrimp trawlers rigging their outriggers along the tidal creek!',
    });
  } else if (effectiveTypology === SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION) {
    environmentalActivities.push({
      id: 'prairie_ridge_hike',
      name: 'Tallgrass Prairie & Red-Clay Trail Hike',
      label: 'Tallgrass Prairie & Red-Clay Trail Hike',
      icon: '🪶',
      isEnvironmentSuggested: true,
      environmentBadge: '🪶 Living World Suggestion',
      speedMps: 1.35,
      lore: 'Walking open tallgrass prairie ridges and shaded cottonwood creek bottoms across historic trust lands.',
      companionNote:
        'Warm prairie wind rippling through the bluestem grass as far as the eye can see.',
    });
  } else if (effectiveTypology === SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK) {
    environmentalActivities.push({
      id: 'safari_overlook_walk',
      name: 'Wildlife Waterhole & Bush Trail Trek',
      label: 'Wildlife Waterhole & Bush Trail Trek',
      icon: '🦁',
      isEnvironmentSuggested: true,
      environmentBadge: '🦁 Living World Suggestion',
      speedMps: 1.25,
      lore: 'Following the raised timber safari boardwalk overlooking the acacia savanna and wildlife watering hole.',
      companionNote:
        'Keep your eyes on the treeline by the waterhole—the herds are gathering!',
    });
  } else if (effectiveTypology === SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK) {
    environmentalActivities.push({
      id: 'theme_park_midway',
      name: 'Theme Park Midway & Coaster Plaza',
      label: 'Theme Park Midway & Coaster Plaza',
      icon: '🎢',
      isEnvironmentSuggested: true,
      environmentBadge: '🎢 Living World Suggestion',
      speedMps: 1.3,
      lore: 'Wandering the car-free theme park midway beneath roaring steel coaster inversions, calliope music, and festival banners.',
      companionNote:
        'Hear that coaster drop roar overhead? Let’s grab front-row seats on the next train!',
    });
  } else if (effectiveTypology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
    environmentalActivities.push({
      id: 'studio_backlot_stroll',
      name: 'Soundstage Alley & Backlot Set Walk',
      label: 'Soundstage Alley & Backlot Set Walk',
      icon: '🎬',
      isEnvironmentSuggested: true,
      environmentBadge: '🎬 Living World Suggestion',
      speedMps: 1.25,
      lore: 'Exploring active studio soundstages, Period New York facade streets, lighting trusses, and camera dolly tracks.',
      companionNote: 'Red filming light is flashing on Stage 4—quiet on set!',
    });
  }

  // Core Tourist & Non-Metro Play Activities (Beach, Movie, Dine Out, Shopping)
  const coreTouristActivities = [
    {
      id: 'visit_beach',
      name: 'Visit the Beach & Shoreline Stroll',
      label: 'Visit the Beach & Shoreline Stroll',
      icon: '🏖️',
      isEnvironmentSuggested:
        effectiveTypology === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
      environmentBadge:
        effectiveTypology === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER
          ? '🏖️ Coastal Match'
          : 'Tourist Play',
      speedMps: 1.2,
      lore: 'Walking barefoot along the sunlit shoreline and timber boardwalk while rhythmic ocean swells roll across the sand.',
      companionNote:
        'Warm sand, salt spray in the air, and the sound of waves rolling in—pure vacation mode!',
    },
    {
      id: 'see_movie',
      name: 'See a Movie at the Local Cinema',
      label: 'See a Movie at the Local Cinema',
      icon: '🍿',
      isEnvironmentSuggested: false,
      environmentBadge: 'Tourist Play',
      speedMps: 1.15,
      lore: 'Stepping beneath the glowing vintage marquee of the local theater—buttered popcorn, velvet curtains, and a classic feature on the big screen.',
      companionNote:
        'Nothing beats a glowing neon movie marquee and a giant tub of popcorn!',
    },
    {
      id: 'go_out_to_eat',
      name: 'Go Out to Eat (Patio Bistro & Local Fare)',
      label: 'Go Out to Eat (Patio Bistro & Local Fare)',
      icon: '🍽️',
      isEnvironmentSuggested: false,
      environmentBadge: 'Tourist Play',
      speedMps: 1.1,
      lore: 'Pulling up a chair under string lights on a lively outdoor café patio—clinking glasses, coastal catch of the day, and warm evening conversation.',
      companionNote:
        'Grabbed us the best corner table on the patio under the string lights!',
    },
    {
      id: 'go_shopping',
      name: 'Go Shopping (Main Street & Boutiques)',
      label: 'Go Shopping (Main Street & Boutiques)',
      icon: '🛍️',
      isEnvironmentSuggested:
        effectiveTypology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      environmentBadge:
        effectiveTypology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE
          ? '🛍️ Promenade Match'
          : 'Tourist Play',
      speedMps: 1.2,
      lore: 'Window-shopping along charming local storefronts, bookshops, and artisan boutiques with bags in hand.',
      companionNote:
        'Let’s check out that indie bookshop and the vintage record store on the corner!',
    },
  ];

  return [...environmentalActivities, ...coreTouristActivities];
}

/**
 * Determines whether a given coordinate is a Major Metro ('tour' mode)
 * or a Non-Metro / Tourist / Environmental location ('play' mode).
 */
export function resolveTourOrPlayContext(lat, lon, elevationMeters = 0) {
  const safeLat = Number.isFinite(lat) ? lat : 34.0522;
  const safeLon = Number.isFinite(lon) ? lon : -118.2437;

  // 0. Check user-authored custom tours, tight-radius curated venues (e.g. Theme Park Days),
  // and Dev-Forge runtime-registered tours
  const nearestCustom = findNearestCustomTour(safeLat, safeLon);
  const nearestVenue = findNearestVenueTour(safeLat, safeLon);
  const nearestRuntime = findNearestRuntimeBuiltTour(safeLat, safeLon);

  let nearestCity = null;
  let minCityDist = Infinity;
  for (const city of Object.values(LIVING_CITIES || {})) {
    const dist = haversineDistanceMeters(safeLat, safeLon, city.lat, city.lon);
    if (dist <= METRO_TOUR_RADIUS_METERS && dist < minCityDist) {
      minCityDist = dist;
      nearestCity = city;
    }
  }

  let nearestMetro = null;
  let minMetroDist = Infinity;
  for (const metro of MAJOR_WORLD_METROS || []) {
    const dist = haversineDistanceMeters(
      safeLat,
      safeLon,
      metro.lat,
      metro.lon,
    );
    if (dist <= METRO_TOUR_RADIUS_METERS && dist < minMetroDist) {
      minMetroDist = dist;
      nearestMetro = metro;
    }
  }

  if (
    nearestCustom &&
    (!nearestVenue ||
      nearestCustom.distanceMeters <= nearestVenue.distanceMeters) &&
    (nearestCustom.distanceMeters <= Math.min(minCityDist, minMetroDist) ||
      nearestCustom.distanceMeters <= 8000)
  ) {
    const customMeta = normalizeTourV2Metadata(
      nearestCustom.metadata,
      nearestCustom.cityId,
      nearestCustom.landmarks,
    );
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: true,
      isCustomTour: true,
      isDynamicPlaceholder: false,
      tourScope: customMeta.tourScope,
      radiusMeters: customMeta.radiusMeters,
      transitMode: customMeta.transitMode,
      title: `${nearestCustom.cityName} Electric Scooter Tour`,
      label: nearestCustom.cityName,
      actionButtonLabel: `🛴 Tour ${nearestCustom.cityName}`,
      cityId: nearestCustom.cityId,
      cityName: nearestCustom.cityName,
      landmarks: nearestCustom.landmarks,
      metadata: customMeta,
    };
  }

  if (nearestVenue) {
    const isResortStay =
      nearestVenue.venueCategory === 'resort_stay' ||
      isResortStayId(nearestVenue.id);
    const shortVenueName =
      (isResortStay && nearestVenue.shortName) ||
      String(nearestVenue.name || '')
        .replace(/\s*\((?:WDW|DLR|UOR|USH|TDR|DLP)\)$/i, '')
        .trim();
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: true,
      isCustomTour: false,
      isDynamicPlaceholder: false,
      tourScope: 'venue',
      venueCategory: isResortStay ? 'resort_stay' : 'theme_park',
      radiusMeters:
        nearestVenue.radiusMeters || VENUE_TOUR_DEFAULT_RADIUS_METERS,
      transitMode: nearestVenue.transitMode || 'walk_midway',
      supportedTransitModes:
        nearestVenue.supportedTransitModes ||
        (isResortStay
          ? ['walk_midway', 'scooter', 'resort_cart']
          : ['walk_midway']),
      supportedModes: nearestVenue.supportedModes || ['all'],
      title: isResortStay
        ? `${nearestVenue.name} Resort Day`
        : `${nearestVenue.name} Park Day Tour`,
      label: nearestVenue.name,
      actionButtonLabel: isResortStay
        ? `🏨 Resort Day: ${shortVenueName || nearestVenue.name}`
        : `🎢 Park Day: ${shortVenueName || nearestVenue.name}`,
      cityId: nearestVenue.id,
      cityName: nearestVenue.name,
      landmarks: nearestVenue.landmarks,
      metadata: nearestVenue,
    };
  }

  if (nearestRuntime && nearestRuntime.distanceMeters <= 5000) {
    const rtMeta = nearestRuntime.metadata;
    const isVenue = rtMeta?.tourScope === 'venue';
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: true,
      isCustomTour: false,
      isRuntimeBuilt: true,
      isDynamicPlaceholder: false,
      tourScope: rtMeta?.tourScope || 'metro',
      radiusMeters: rtMeta?.radiusMeters || METRO_TOUR_RADIUS_METERS,
      transitMode: rtMeta?.transitMode || 'scooter',
      supportedModes: rtMeta?.supportedModes || ['all'],
      title: isVenue
        ? `${nearestRuntime.cityName} Park Day Tour`
        : `${nearestRuntime.cityName} Electric Scooter Tour`,
      label: nearestRuntime.cityName,
      actionButtonLabel: isVenue
        ? `🎢 Park Day: ${nearestRuntime.cityName}`
        : `🛴 Tour ${nearestRuntime.cityName}`,
      cityId: nearestRuntime.cityId,
      cityName: nearestRuntime.cityName,
      landmarks: nearestRuntime.landmarks,
      metadata: rtMeta,
    };
  }

  // 1. Check if inside a curated non-metro exemplar locale (e.g. Darien GA, Cedar Point, Aspen, Yellowstone)
  for (const loc of Object.values(EXEMPLAR_LOCALES || {})) {
    const dist = haversineDistanceMeters(safeLat, safeLon, loc.lat, loc.lon);
    if (
      dist <= (loc.radiusMeters || 6000) &&
      loc.typology !== SETTLEMENT_TYPOLOGIES.DENSE_URBAN
    ) {
      const activities = getPlayActivitiesForEnvironment({
        typology: loc.typology,
        lat: safeLat,
        lon: safeLon,
        elevationMeters,
      });
      return {
        mode: 'play',
        hasExistingTour: false,
        hasCuratedOrCustomTour: false,
        isDynamicPlaceholder: false,
        title: `Play in ${loc.name}`,
        label: loc.name,
        typologyName: TYPOLOGY_METADATA[loc.typology]?.name || loc.name,
        actionButtonLabel: `🏖️ Play (${loc.name})`,
        typology: loc.typology,
        typologyMeta: TYPOLOGY_METADATA[loc.typology],
        locale: loc,
        activities,
        playActivities: activities,
        recommendedActivity: activities[0],
      };
    }
  }

  if (nearestRuntime) {
    const rtMeta = nearestRuntime.metadata;
    const isVenue = rtMeta?.tourScope === 'venue';
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: true,
      isCustomTour: false,
      isRuntimeBuilt: true,
      isDynamicPlaceholder: false,
      tourScope: rtMeta?.tourScope || 'metro',
      radiusMeters: rtMeta?.radiusMeters || METRO_TOUR_RADIUS_METERS,
      transitMode: rtMeta?.transitMode || 'scooter',
      supportedModes: rtMeta?.supportedModes || ['all'],
      title: isVenue
        ? `${nearestRuntime.cityName} Park Day Tour`
        : `${nearestRuntime.cityName} Electric Scooter Tour`,
      label: nearestRuntime.cityName,
      actionButtonLabel: isVenue
        ? `🎢 Park Day: ${nearestRuntime.cityName}`
        : `🛴 Tour ${nearestRuntime.cityName}`,
      cityId: nearestRuntime.cityId,
      cityName: nearestRuntime.cityName,
      landmarks: nearestRuntime.landmarks,
      metadata: rtMeta,
    };
  }

  // 2. Check if inside a major LIVING_CITIES metro
  if (nearestCity) {
    const landmarks = getLandmarksForCity(nearestCity.id, safeLat, safeLon);
    const isAuthored = Boolean(
      METRO_LANDMARK_CATALOG[nearestCity.id] ||
      runtimeBuiltTours.has(nearestCity.id),
    );
    const rawMeta = runtimeBuiltTours.get(nearestCity.id)?.metadata ||
      METRO_TOUR_METADATA[nearestCity.id] || {
        id: nearestCity.id,
        name: nearestCity.name,
        centerLat: nearestCity.lat,
        centerLon: nearestCity.lon,
      };
    const meta = normalizeTourV2Metadata(rawMeta, nearestCity.id, landmarks);
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: isAuthored,
      isDynamicPlaceholder: !isAuthored,
      isCustomTour: false,
      tourScope: meta.tourScope,
      radiusMeters: meta.radiusMeters,
      transitMode: meta.transitMode,
      title: `${nearestCity.name} Electric Scooter Tour`,
      label: nearestCity.name,
      actionButtonLabel: `🛴 Tour ${nearestCity.name}`,
      cityId: nearestCity.id,
      cityName: nearestCity.name,
      landmarks,
      metadata: meta,
    };
  }

  // 3. Check if inside any MAJOR_WORLD_METROS city
  if (nearestMetro) {
    const canonicalKey = normalizeMetroTourCityKey(nearestMetro.name);
    const runtimeEntry = canonicalKey
      ? runtimeBuiltTours.get(canonicalKey)
      : null;
    const isAuthored = Boolean(
      canonicalKey && (METRO_LANDMARK_CATALOG[canonicalKey] || runtimeEntry),
    );
    const cityKey = isAuthored
      ? canonicalKey
      : stripTourDiacritics(nearestMetro.name).replace(/\s+/g, '_');
    const landmarks = getLandmarksForCity(cityKey, safeLat, safeLon);
    const rawMeta =
      runtimeEntry?.metadata ||
      (isAuthored ? METRO_TOUR_METADATA[canonicalKey] : null) ||
      null;
    const meta = rawMeta
      ? normalizeTourV2Metadata(rawMeta, cityKey, landmarks)
      : null;
    const displayName = meta?.name || nearestMetro.name;
    return {
      mode: 'tour',
      hasExistingTour: true,
      hasCuratedOrCustomTour: isAuthored,
      isDynamicPlaceholder: !isAuthored,
      isCustomTour: false,
      isRuntimeBuilt: Boolean(runtimeEntry),
      tourScope: meta?.tourScope || 'metro',
      radiusMeters: meta?.radiusMeters || METRO_TOUR_RADIUS_METERS,
      transitMode: meta?.transitMode || 'scooter',
      title: `${displayName} Electric Scooter Tour`,
      label: displayName,
      actionButtonLabel: `🛴 Tour ${displayName}`,
      cityId: cityKey,
      cityName: displayName,
      landmarks,
      ...(meta ? { metadata: meta } : {}),
    };
  }

  // 4. Otherwise: Non-Metro / Tourist / Environmental location -> 'Play' mode!
  const classification = classifySettlementTypology({
    lat: safeLat,
    lon: safeLon,
    elevationMeters,
  });
  const activities = getPlayActivitiesForEnvironment({
    typology: classification.typology,
    lat: safeLat,
    lon: safeLon,
    elevationMeters,
  });

  return {
    mode: 'play',
    hasExistingTour: false,
    hasCuratedOrCustomTour: false,
    isDynamicPlaceholder: false,
    title: `Play — ${classification.name}`,
    label: classification.name,
    typologyName: classification.name,
    actionButtonLabel: `🏖️ Play Here (${activities[0]?.icon || '🏖️'} ${activities[0]?.name.split(' ')[0] || 'Explore'})`,
    typology: classification.typology,
    typologyMeta: TYPOLOGY_METADATA[classification.typology],
    activities,
    playActivities: activities,
    recommendedActivity: activities[0],
  };
}

/**
 * Smoothly interpolates between two compass headings (degrees 0..360) via the shortest angular arc.
 */
export function lerpHeadingDegrees(fromDeg, toDeg, maxDeltaDeg = 180) {
  const a = (((Number(fromDeg) || 0) % 360) + 360) % 360;
  const b = (((Number(toDeg) || 0) % 360) + 360) % 360;
  let diff = ((b - a + 540) % 360) - 180;
  if (Math.abs(diff) <= maxDeltaDeg) {
    return b;
  }
  const step = Math.sign(diff) * maxDeltaDeg;
  return (((a + step) % 360) + 360) % 360;
}

/**
 * Projects a sequence of road centerline waypoints onto the right-hand pedestrian sidewalk
 * (+3.5m lateral curb offset) so user & companion dots travel along sidewalks instead of
 * road centerlines or through buildings.
 */
export function projectRouteToSidewalk(
  roadWaypoints = [],
  sidewalkOffsetMeters = TOUR_SIDEWALK_OFFSET_METERS,
) {
  if (!Array.isArray(roadWaypoints) || roadWaypoints.length < 2) {
    return Array.isArray(roadWaypoints) ? [...roadWaypoints] : [];
  }

  const projected = [];
  for (let i = 0; i < roadWaypoints.length; i++) {
    const pCurr = roadWaypoints[i];
    const pNext =
      i < roadWaypoints.length - 1 ? roadWaypoints[i + 1] : roadWaypoints[i];
    const pPrev = i > 0 ? roadWaypoints[i - 1] : pCurr;

    const segStart = i < roadWaypoints.length - 1 ? pCurr : pPrev;
    const segEnd = i < roadWaypoints.length - 1 ? pNext : pCurr;

    const offsetPt = calculateShoulderOffset(
      segStart,
      segEnd,
      sidewalkOffsetMeters,
      0.15,
    );

    if (i < roadWaypoints.length - 1) {
      projected.push({
        lat: offsetPt.lat,
        lon: offsetPt.lon,
        elev: pCurr.elev ?? 20,
        isSidewalk: true,
      });
    } else {
      // For final destination waypoint, project pCurr using the incoming segment direction
      const dLat = segEnd.lat - segStart.lat;
      const dLon = segEnd.lon - segStart.lon;
      const startShifted = calculateShoulderOffset(
        segStart,
        segEnd,
        sidewalkOffsetMeters,
        0.15,
      );
      projected.push({
        lat: startShifted.lat + dLat,
        lon: startShifted.lon + dLon,
        elev: pCurr.elev ?? 20,
        isSidewalk: true,
      });
    }
  }
  return projected;
}

/**
 * Infers the primary street-grid orientation (degrees) for a city landmark so scooter
 * approaches align with real boulevards and cross-streets rather than slicing diagonally
 * through building blocks.
 */
function resolveLandmarkStreetBearingDeg(landmark) {
  if (Number.isFinite(landmark?.streetBearingDeg)) {
    return landmark.streetBearingDeg;
  }
  const id = String(landmark?.id || '').toLowerCase();
  // Manhattan avenue grid (~29 deg NE)
  if (id.startsWith('nyc_')) return 29;
  // San Francisco Market / Embarcadero grid (~45 deg NE)
  if (id.startsWith('sf_')) return 45;
  // LA Downtown Historic Core (~36 deg NE) vs East-West Boulevards (Hollywood Blvd, Sunset, Wilshire = 90 deg E)
  if (
    id === 'la_old_city_hall' ||
    id === 'la_chinatown' ||
    id === 'la_disney_hall'
  ) {
    return 36;
  }
  if (id.startsWith('la_')) return 90;
  // Chicago / Atlanta / Tokyo orthogonal N-S / E-W grids
  if (id.startsWith('chi_') || id.startsWith('atl_')) return 0;
  return 90;
}

/**
 * Builds a multi-segment street & sidewalk route approaching `targetLandmark`.
 * - If `startCoord` is missing or farther than `TOUR_APPROACH_CORRIDOR_MAX_METERS` (260m),
 *   stages the scooter departure on the landmark's local cross-street / boulevard approach
 *   corridor (~145m out along the street grid) so there is NEVER a high-speed rocket flight
 *   across the city.
 * - Offsets all road segments by `+3.5m` onto the right-hand pedestrian sidewalk.
 */
export function buildStreetAndSidewalkRoute(
  startCoord,
  targetLandmark,
  {
    sidewalkOffsetMeters = null,
    approachCorridorMaxMeters = null,
    transitMode = 'scooter',
  } = {},
) {
  if (!targetLandmark) return [];

  const effectiveCorridorMax = Number.isFinite(approachCorridorMaxMeters)
    ? approachCorridorMaxMeters
    : transitMode === 'resort_cart'
      ? TOUR_RESORT_CART_CORRIDOR_MAX_METERS
      : transitMode === 'walk_midway'
        ? TOUR_WALK_MIDWAY_CORRIDOR_MAX_METERS
        : TOUR_APPROACH_CORRIDOR_MAX_METERS;
  const effectiveSidewalkOffset = Number.isFinite(sidewalkOffsetMeters)
    ? sidewalkOffsetMeters
    : transitMode === 'walk_midway' || transitMode === 'resort_cart'
      ? 0
      : TOUR_SIDEWALK_OFFSET_METERS;

  const targetLat = Number(targetLandmark.lat) || 34.1016;
  const targetLon = Number(targetLandmark.lon) || -118.3267;
  const targetElev = Number.isFinite(targetLandmark.elev)
    ? targetLandmark.elev
    : 50;
  const cosLat = Math.max(
    0.01,
    Math.abs(Math.cos((targetLat * Math.PI) / 180)),
  );

  const moveMeters = (baseLat, baseLon, bearingDeg, distMeters) => {
    const rad = (bearingDeg * Math.PI) / 180;
    const dNorth = distMeters * Math.cos(rad);
    const dEast = distMeters * Math.sin(rad);
    return {
      lat: baseLat + dNorth / 111139.0,
      lon: baseLon + dEast / (111139.0 * cosLat),
      elev: targetElev,
    };
  };

  const streetBearingDeg = resolveLandmarkStreetBearingDeg(targetLandmark);
  const reverseBoulevardDeg = (streetBearingDeg + 180) % 360;
  const crossStreetDeg = (streetBearingDeg + 270) % 360; // 90-deg perpendicular cross street

  const startDistMeters =
    startCoord &&
    Number.isFinite(startCoord.lat) &&
    Number.isFinite(startCoord.lon)
      ? haversineDistanceMeters(
          startCoord.lat,
          startCoord.lon,
          targetLat,
          targetLon,
        )
      : Infinity;
  const hasCloseStart =
    startDistMeters <= effectiveCorridorMax && startDistMeters >= 18;
  const hasVeryCloseStart = startDistMeters < 18;

  let roadCenterlinePoints = [];

  if (hasVeryCloseStart) {
    roadCenterlinePoints = [
      {
        lat: startCoord.lat,
        lon: startCoord.lon,
        elev: startCoord.elev ?? targetElev,
      },
      {
        lat: (startCoord.lat + targetLat) * 0.5,
        lon: (startCoord.lon + targetLon) * 0.5,
        elev: targetElev,
      },
      { lat: targetLat, lon: targetLon, elev: targetElev },
    ];
  } else if (hasCloseStart) {
    // Project an orthogonal L-turn along the local street axes from startCoord to targetLandmark
    // with a chamfered intersection corner so the scooter follows streets instead of cutting diagonally.
    const dNorthTotal = (targetLat - startCoord.lat) * 111139.0;
    const dEastTotal = (targetLon - startCoord.lon) * 111139.0 * cosLat;
    const axisRad = (streetBearingDeg * Math.PI) / 180;
    const mainDirN = Math.cos(axisRad);
    const mainDirE = Math.sin(axisRad);
    const crossDirN = -Math.sin(axisRad);
    const crossDirE = Math.cos(axisRad);

    const alongMain = dNorthTotal * mainDirN + dEastTotal * mainDirE;
    const alongCross = dNorthTotal * crossDirN + dEastTotal * crossDirE;

    const cornerBeforeTurn = {
      lat: startCoord.lat + (alongCross * 0.85 * crossDirN) / 111139.0,
      lon:
        startCoord.lon + (alongCross * 0.85 * crossDirE) / (111139.0 * cosLat),
      elev: targetElev,
    };
    const cornerAfterTurn = {
      lat:
        startCoord.lat +
        (alongCross * crossDirN + alongMain * 0.18 * mainDirN) / 111139.0,
      lon:
        startCoord.lon +
        (alongCross * crossDirE + alongMain * 0.18 * mainDirE) /
          (111139.0 * cosLat),
      elev: targetElev,
    };
    const midBoulevard = {
      lat:
        startCoord.lat +
        (alongCross * crossDirN + alongMain * 0.6 * mainDirN) / 111139.0,
      lon:
        startCoord.lon +
        (alongCross * crossDirE + alongMain * 0.6 * mainDirE) /
          (111139.0 * cosLat),
      elev: targetElev,
    };

    roadCenterlinePoints = [
      {
        lat: startCoord.lat,
        lon: startCoord.lon,
        elev: startCoord.elev ?? targetElev,
      },
      cornerBeforeTurn,
      cornerAfterTurn,
      midBoulevard,
      { lat: targetLat, lon: targetLon, elev: targetElev },
    ];
  } else {
    // Stage a scenic ~145m street-grid approach corridor (cross-street -> 90° intersection -> main boulevard)
    // so every landmark transition rides smoothly at 15 mph without any supersonic cross-city jump!
    const intersectionPt = moveMeters(
      targetLat,
      targetLon,
      reverseBoulevardDeg,
      95,
    );
    const crossStreetStartPt = moveMeters(
      intersectionPt.lat,
      intersectionPt.lon,
      crossStreetDeg,
      45,
    );
    const preTurnCurbPt = moveMeters(
      intersectionPt.lat,
      intersectionPt.lon,
      crossStreetDeg,
      8,
    );
    const postTurnBoulevardPt = moveMeters(
      targetLat,
      targetLon,
      reverseBoulevardDeg,
      82,
    );
    const midBlockBoulevardPt = moveMeters(
      targetLat,
      targetLon,
      reverseBoulevardDeg,
      40,
    );

    roadCenterlinePoints = [
      crossStreetStartPt,
      preTurnCurbPt,
      postTurnBoulevardPt,
      midBlockBoulevardPt,
      { lat: targetLat, lon: targetLon, elev: targetElev },
    ];
  }

  return projectRouteToSidewalk(roadCenterlinePoints, effectiveSidewalkOffset);
}

/**
 * Creates the stateful Tour & Play Engine wired to the Avatar Wander Engine.
 */
export function createTourAndPlayEngine({
  wanderEngine = null,
  cityEngine = null,
  viewer = null,
  dwellDurationSeconds = TOUR_LANDMARK_DWELL_SECONDS,
  scooterSpeedMps = TOUR_SCOOTER_SPEED_MPS,
  walkSpeedMps = TOUR_WALK_DWELL_SPEED_MPS,
  rng = Math.random,
  fetchImpl = null,
} = {}) {
  let state = TOUR_PLAY_STATES.IDLE;
  let activeViewer = viewer;
  let activeCityId = null;
  let activeCityName = '';
  let activeTourScope = 'city';
  let activeVenueCategory = null;
  let activeTransitMode = 'scooter';
  let transitModeOverride = null;
  let activeTourMode = 'all';
  let activeTourMetadata = null;
  let mediaPaused = false;
  let savedClockState = null;
  let lastSolarState = null;
  let tourOrder = []; // Randomized array of landmarks for the current tour
  let currentLandmarkIndex = 0;
  let dwellRemainingSec = 0;
  let dwellElapsedSec = 0;
  let dwellAnchorHeadingDeg = 90; // Steady, non-spinning camera heading during landmark dwell
  let transitElapsedSec = 0;
  let activeRouteWaypoints = []; // Street & sidewalk waypoints for current scooter leg
  let currentRouteWaypointIndex = 0;
  let routeGenerationToken = 0;
  let activePlayActivity = null;
  let playOrigin = null;
  let playElapsedSec = 0;
  let lastShuffledSignature = '';
  let activeTourCompanion = true;
  let activeTourCameraMode = WANDER_CAMERA_MODES.ISO_CHASE;
  const stateListeners = new Set();

  function getEffectiveTransitMode(
    targetStop = tourOrder[currentLandmarkIndex],
  ) {
    if (
      transitModeOverride === 'walk_midway' ||
      transitModeOverride === 'scooter' ||
      transitModeOverride === 'resort_cart'
    ) {
      return transitModeOverride;
    }
    if (
      activeVenueCategory === 'resort_stay' &&
      targetStop?.isGolfZone === true
    ) {
      return 'resort_cart';
    }
    return activeTransitMode;
  }

  function getActiveTransitSpeedMps(
    targetStop = tourOrder[currentLandmarkIndex],
  ) {
    const mode = getEffectiveTransitMode(targetStop);
    if (mode === 'walk_midway') return TOUR_WALK_MIDWAY_SPEED_MPS;
    if (mode === 'resort_cart') return TOUR_RESORT_CART_SPEED_MPS;
    return scooterSpeedMps;
  }

  function getActiveCorridorMaxMeters(
    targetStop = tourOrder[currentLandmarkIndex],
  ) {
    const mode = getEffectiveTransitMode(targetStop);
    if (mode === 'resort_cart') return TOUR_RESORT_CART_CORRIDOR_MAX_METERS;
    if (mode === 'walk_midway') return TOUR_WALK_MIDWAY_CORRIDOR_MAX_METERS;
    return TOUR_APPROACH_CORRIDOR_MAX_METERS;
  }

  function buildTransitBubbleSpec(target, stopIndex = currentLandmarkIndex) {
    if (!target) return null;
    const mode = getEffectiveTransitMode(target);
    const isResort = activeVenueCategory === 'resort_stay';
    const isWalk = mode === 'walk_midway';
    const isCart = mode === 'resort_cart';
    const prefix = isCart
      ? '⛳ Golf Cart to'
      : isWalk
        ? '🚶 Walking to'
        : '🛴 E-Scootering to';
    const pathDesc = isCart
      ? 'along resort golf cart path'
      : isWalk
        ? isResort
          ? 'along resort promenade'
          : 'along park midway'
        : isResort
          ? 'via resort loop path'
          : 'via street & sidewalk';
    return {
      name: `${prefix} ${target.name}`,
      vibeColor: isCart ? '#34d399' : '#22d3ee',
      occupation: `Stop ${stopIndex + 1} of ${tourOrder.length} · ${pathDesc}`,
      thought: `Next ${isResort ? 'Resort Stop' : 'Landmark'}: ${target.name} (${target.category}). ${target.companionNote}`,
      currentThought: `Next ${isResort ? 'Resort Stop' : 'Landmark'}: ${target.name} (${target.category}). ${target.companionNote}`,
      city: `${activeCityName} ${isCart ? 'Resort Golf Cart' : isWalk ? (isResort ? 'Resort Day Walk' : 'Park Day Walk') : 'E-Scooter Tour'}`,
      isCompanion: true,
    };
  }

  function applyDayCycleClockForStop(stopIndex) {
    const rawDayCycle = activeTourMetadata?.dayCycle;
    const isEnabled =
      Boolean(rawDayCycle) || activeTourMetadata?.dayCycleEnabled === true;
    if (!isEnabled) {
      lastSolarState = null;
      return;
    }
    const approxLon =
      Number(activeTourMetadata?.centerLon) ||
      Number(tourOrder[stopIndex]?.lon) ||
      -81.55;
    const dayCycle = rawDayCycle || {
      startLocalHour: 9.0,
      advanceHoursPerStop: 0.75,
      utcOffsetHours: Math.round(approxLon / 15),
    };
    const solar = computeDayCycleSolarState({
      dayCycle,
      stopIndex,
      totalStops: tourOrder.length || 1,
    });
    lastSolarState = solar;
    const clock = activeViewer?.clock;
    if (!clock || !solar?.julianDate) return;
    try {
      if (!savedClockState) {
        savedClockState = {
          currentTime: clock.currentTime
            ? Cesium.JulianDate.clone(clock.currentTime)
            : null,
          shouldAnimate: Boolean(clock.shouldAnimate),
          multiplier: Number.isFinite(clock.multiplier) ? clock.multiplier : 1,
        };
      }
      if (clock.currentTime && Cesium.JulianDate.clone) {
        Cesium.JulianDate.clone(solar.julianDate, clock.currentTime);
      } else {
        clock.currentTime = solar.julianDate;
      }
      clock.shouldAnimate = false;
      clock.multiplier = 1;
    } catch {
      // Safe no-op for lightweight headless mocks
    }
  }

  function restoreDayCycleClock() {
    const clock = activeViewer?.clock;
    if (clock && savedClockState) {
      try {
        if (savedClockState.currentTime) {
          if (clock.currentTime && Cesium.JulianDate.clone) {
            Cesium.JulianDate.clone(
              savedClockState.currentTime,
              clock.currentTime,
            );
          } else {
            clock.currentTime = savedClockState.currentTime;
          }
        }
        clock.shouldAnimate = savedClockState.shouldAnimate;
        clock.multiplier = savedClockState.multiplier;
      } catch {
        // Safe no-op for lightweight headless mocks
      }
    }
    savedClockState = null;
    lastSolarState = null;
  }

  function notifyListeners() {
    const snapshot = getStatus();
    for (const cb of stateListeners) {
      try {
        cb(snapshot);
      } catch {}
    }
  }

  function buildLandmarkBubbleSpec(landmark, phaseLabel) {
    const compName = getCompanionPersonaName();
    return {
      name: `📍 ${landmark.name}`,
      vibeColor: '#06b6d4',
      occupation: phaseLabel,
      thought: `${landmark.lore} — ${compName}: "${landmark.companionNote}"`,
      currentThought: `${landmark.lore} — ${compName}: "${landmark.companionNote}"`,
      city: activeCityName || landmark.category || 'City Landmark Tour',
      isCompanion: true,
    };
  }

  function buildPlayBubbleSpec(activity) {
    const compName = getCompanionPersonaName();
    return {
      name: `${activity.icon} ${activity.name}`,
      vibeColor: '#10b981',
      occupation: activity.environmentBadge || 'Living World Play',
      thought: `${activity.lore} — ${compName}: "${activity.companionNote}"`,
      currentThought: `${activity.lore} — ${compName}: "${activity.companionNote}"`,
      city: 'Living World Play Mode',
      isCompanion: true,
    };
  }

  /**
   * Computes remaining polyline distance (meters) from current position through remaining
   * street & sidewalk waypoints to the current landmark.
   */
  function computeRemainingRouteDistanceMeters(lat, lon, target) {
    if (
      !Array.isArray(activeRouteWaypoints) ||
      activeRouteWaypoints.length === 0 ||
      currentRouteWaypointIndex >= activeRouteWaypoints.length
    ) {
      return haversineDistanceMeters(lat, lon, target.lat, target.lon);
    }
    let total = haversineDistanceMeters(
      lat,
      lon,
      activeRouteWaypoints[currentRouteWaypointIndex].lat,
      activeRouteWaypoints[currentRouteWaypointIndex].lon,
    );
    for (
      let i = currentRouteWaypointIndex;
      i < activeRouteWaypoints.length - 1;
      i++
    ) {
      total += haversineDistanceMeters(
        activeRouteWaypoints[i].lat,
        activeRouteWaypoints[i].lon,
        activeRouteWaypoints[i + 1].lat,
        activeRouteWaypoints[i + 1].lon,
      );
    }
    return total;
  }

  /**
   * Prepares a street-and-sidewalk route to `targetLandmark`, staging at the landmark's
   * approaching street corridor if the landmark is distant (> 260m) so scooter transit
   * always glides smoothly at 15 mph without any high-speed takeoff burst.
   */
  function prepareScooterTransitToLandmark(
    targetLandmark,
    { currentCoord = null, isInitialSpawn = false, skipRelocate = false } = {},
  ) {
    if (!targetLandmark) return null;
    transitElapsedSec = 0;

    const currentDist =
      currentCoord &&
      Number.isFinite(currentCoord.lat) &&
      Number.isFinite(currentCoord.lon)
        ? haversineDistanceMeters(
            currentCoord.lat,
            currentCoord.lon,
            targetLandmark.lat,
            targetLandmark.lon,
          )
        : Infinity;

    const effectiveMode = getEffectiveTransitMode(targetLandmark);
    const corridorMaxMeters = getActiveCorridorMaxMeters(targetLandmark);
    const needsCorridorStaging =
      isInitialSpawn || currentDist > corridorMaxMeters;
    const isZeroOffsetMode =
      effectiveMode === 'walk_midway' || effectiveMode === 'resort_cart';

    const route = buildStreetAndSidewalkRoute(
      needsCorridorStaging ? null : currentCoord,
      targetLandmark,
      {
        transitMode: effectiveMode,
        approachCorridorMaxMeters: corridorMaxMeters,
        sidewalkOffsetMeters: isZeroOffsetMode
          ? 0
          : TOUR_SIDEWALK_OFFSET_METERS,
      },
    );

    activeRouteWaypoints = route;
    currentRouteWaypointIndex = route.length > 1 ? 1 : 0;

    const startWp = route[0] || {
      lat: targetLandmark.lat - 0.0008,
      lon: targetLandmark.lon - 0.0005,
      elev: targetLandmark.elev || 50,
    };
    const nextWp = route[1] || targetLandmark;
    const initialHeading = calculateHeadingDegrees(
      startWp.lat,
      startWp.lon,
      nextWp.lat,
      nextWp.lon,
    );

    if (
      !skipRelocate &&
      needsCorridorStaging &&
      !isInitialSpawn &&
      wanderEngine?.relocateTo
    ) {
      wanderEngine.relocateTo({
        lat: startWp.lat,
        lon: startWp.lon,
        elev: startWp.elev ?? targetLandmark.elev ?? 50,
        heading: initialHeading,
        preserveCameraMode: true,
      });
    }

    // Optional async OSRM road-geometry snap upgrade when /api/route is reachable
    const activeToken = ++routeGenerationToken;
    const effectiveFetch = fetchImpl || globalThis.fetch;
    if (typeof effectiveFetch === 'function' && route.length >= 2) {
      snapRouteToRoads([startWp, targetLandmark], {
        profile: 'foot',
        fetchImpl: effectiveFetch,
      })
        .then((snappedRoadPts) => {
          if (
            activeToken !== routeGenerationToken ||
            state !== TOUR_PLAY_STATES.SCOOTER_TRANSIT ||
            !Array.isArray(snappedRoadPts) ||
            snappedRoadPts.length < 3
          ) {
            return;
          }
          const sidewalkPts = projectRouteToSidewalk(
            snappedRoadPts,
            isZeroOffsetMode ? 0 : TOUR_SIDEWALK_OFFSET_METERS,
          );
          if (sidewalkPts.length >= 3 && transitElapsedSec < 0.35) {
            activeRouteWaypoints = sidewalkPts;
            currentRouteWaypointIndex = 1;
          }
        })
        .catch(() => {});
    }

    return {
      startLat: startWp.lat,
      startLon: startWp.lon,
      startElev: startWp.elev ?? targetLandmark.elev ?? 50,
      initialHeading,
      route,
    };
  }

  /**
   * Per-frame kinematic step injected into avatarWanderEngine.
   */
  function updateStep({ coordinates, deltaTimeSeconds = 0.016 } = {}) {
    const dt = Math.min(Math.max(deltaTimeSeconds, 0.001), 0.25);

    if (
      mediaPaused &&
      (state === TOUR_PLAY_STATES.SCOOTER_TRANSIT ||
        state === TOUR_PLAY_STATES.LANDMARK_DWELL)
    ) {
      return {
        lat: coordinates.lat,
        lon: coordinates.lon,
        elev: coordinates.height ?? 50,
        heading: coordinates.heading ?? dwellAnchorHeadingDeg,
        speedMps: 0,
      };
    }

    if (state === TOUR_PLAY_STATES.SCOOTER_TRANSIT) {
      const target = tourOrder[currentLandmarkIndex];
      if (!target) {
        stop();
        return null;
      }

      // Ensure street & sidewalk route is initialized and never attempts a cross-city supersonic leap
      const corridorMaxMeters = getActiveCorridorMaxMeters();
      const directDistToTarget = haversineDistanceMeters(
        coordinates.lat,
        coordinates.lon,
        target.lat,
        target.lon,
      );
      if (
        activeRouteWaypoints.length === 0 ||
        directDistToTarget > corridorMaxMeters * 1.35
      ) {
        const staged = prepareScooterTransitToLandmark(target, {
          currentCoord: coordinates,
          isInitialSpawn: false,
        });
        if (staged && directDistToTarget > corridorMaxMeters) {
          coordinates = {
            ...coordinates,
            lat: staged.startLat,
            lon: staged.startLon,
            heading: staged.initialHeading,
          };
        }
      }

      transitElapsedSec += dt;

      // Smooth ease-in takeoff over the first 1.5s and gentle arrival slowdown over the final 15m.
      // Respects walk_midway (2.0 m/s) or scooter (6.7 m/s)!
      const activeTransitSpeedMps = getActiveTransitSpeedMps();
      const accelT = Math.min(1.0, transitElapsedSec / 1.5);
      const smoothAccel = accelT * accelT * (3 - 2 * accelT);
      const remainingDistMeters = computeRemainingRouteDistanceMeters(
        coordinates.lat,
        coordinates.lon,
        target,
      );
      const decelFactor =
        remainingDistMeters < 15.0
          ? Math.max(0.25, remainingDistMeters / 15.0)
          : 1.0;
      const effectiveSpeedMps = Math.min(
        activeTransitSpeedMps,
        walkSpeedMps +
          (activeTransitSpeedMps - walkSpeedMps) * smoothAccel * decelFactor,
      );

      // Advance along street & sidewalk polyline waypoints
      let wpIndex = Math.min(
        currentRouteWaypointIndex,
        Math.max(0, activeRouteWaypoints.length - 1),
      );
      let activeWp = activeRouteWaypoints[wpIndex] || target;
      let distToWp = haversineDistanceMeters(
        coordinates.lat,
        coordinates.lon,
        activeWp.lat,
        activeWp.lon,
      );

      const stepMeters = effectiveSpeedMps * dt;
      while (
        wpIndex < activeRouteWaypoints.length - 1 &&
        distToWp <= Math.max(3.5, stepMeters * 1.35)
      ) {
        wpIndex += 1;
        currentRouteWaypointIndex = wpIndex;
        activeWp = activeRouteWaypoints[wpIndex];
        distToWp = haversineDistanceMeters(
          coordinates.lat,
          coordinates.lon,
          activeWp.lat,
          activeWp.lon,
        );
      }

      const isFinalWaypoint = wpIndex >= activeRouteWaypoints.length - 1;
      const targetSegmentBearingDeg = calculateHeadingDegrees(
        coordinates.lat,
        coordinates.lon,
        activeWp.lat,
        activeWp.lon,
      );

      // Smoothly turn heading at street intersections (~85 deg/sec max turn rate)
      const prevHeading = Number.isFinite(coordinates.heading)
        ? coordinates.heading
        : targetSegmentBearingDeg;
      const smoothHeadingDeg = lerpHeadingDegrees(
        prevHeading,
        targetSegmentBearingDeg,
        85.0 * dt,
      );

      if (isFinalWaypoint && distToWp <= Math.max(4.5, stepMeters * 1.25)) {
        // Arrived at landmark sidewalk curb! Settle calmly into 20s autonomous landmark dwell
        state = TOUR_PLAY_STATES.LANDMARK_DWELL;
        dwellRemainingSec = dwellDurationSeconds;
        dwellElapsedSec = 0;
        dwellAnchorHeadingDeg = smoothHeadingDeg;
        const bubbleSpec = buildLandmarkBubbleSpec(
          target,
          `🚶 Autonomous Landmark Stroll (${Math.ceil(dwellRemainingSec)}s) · Stop ${currentLandmarkIndex + 1}/${tourOrder.length}`,
        );
        wanderEngine?.showDialogBubble?.(bubbleSpec);
        notifyListeners();
        return {
          lat: activeWp.lat,
          lon: activeWp.lon,
          elev: activeWp.elev ?? target.elev ?? 50,
          heading: dwellAnchorHeadingDeg,
          speedMps: walkSpeedMps * 0.4,
          bubbleSpec,
        };
      }

      // Step directly toward active street/sidewalk waypoint while orienting camera smoothly
      const moveRad = (targetSegmentBearingDeg * Math.PI) / 180;
      const actualStep = Math.min(stepMeters, distToWp);
      const dNorth = actualStep * Math.cos(moveRad);
      const dEast = actualStep * Math.sin(moveRad);
      const nextLat = coordinates.lat + dNorth / 111139.0;
      const cosLat = Math.cos((coordinates.lat * Math.PI) / 180);
      const nextLon =
        coordinates.lon +
        dEast / (111139.0 * (Math.abs(cosLat) > 0.001 ? cosLat : 1.0));

      const bubbleSpec = {
        name: `🛴 Scootering to ${target.name}`,
        vibeColor: '#22d3ee',
        occupation: `Stop ${currentLandmarkIndex + 1} of ${tourOrder.length} · ${Math.round(remainingDistMeters)}m via street & sidewalk`,
        thought: `Next Landmark: ${target.name} (${target.category}). ${target.companionNote}`,
        currentThought: `Next Landmark: ${target.name} (${target.category}). ${target.companionNote}`,
        city: `${activeCityName} Scooter Tour`,
        isCompanion: true,
      };

      return {
        lat: nextLat,
        lon: nextLon,
        elev: activeWp.elev ?? target.elev ?? 50,
        heading: smoothHeadingDeg,
        speedMps: effectiveSpeedMps,
        bubbleSpec,
      };
    }

    if (state === TOUR_PLAY_STATES.LANDMARK_DWELL) {
      const target = tourOrder[currentLandmarkIndex];
      if (!target) {
        stop();
        return null;
      }

      dwellElapsedSec += dt;
      dwellRemainingSec = Math.max(0, dwellDurationSeconds - dwellElapsedSec);

      if (dwellRemainingSec <= 0) {
        // Advance to next landmark in randomized sequence (loops back to 0 when complete)
        currentLandmarkIndex = (currentLandmarkIndex + 1) % tourOrder.length;
        state = TOUR_PLAY_STATES.SCOOTER_TRANSIT;
        applyDayCycleClockForStop(currentLandmarkIndex);
        const nextTarget = tourOrder[currentLandmarkIndex];
        const staged = prepareScooterTransitToLandmark(nextTarget, {
          currentCoord: coordinates,
          isInitialSpawn: false,
        });
        const nextBubbleSpec = buildTransitBubbleSpec(
          nextTarget,
          currentLandmarkIndex,
        );
        if (nextBubbleSpec) {
          wanderEngine?.showDialogBubble?.(nextBubbleSpec);
        }
        notifyListeners();
        return {
          lat: staged ? staged.startLat : coordinates.lat,
          lon: staged ? staged.startLon : coordinates.lon,
          elev: staged
            ? staged.startElev
            : (nextTarget?.elev ?? coordinates.height ?? 50),
          heading: staged ? staged.initialHeading : dwellAnchorHeadingDeg,
          speedMps: walkSpeedMps,
          bubbleSpec: nextBubbleSpec,
        };
      }

      // Calm, non-spinning landmark sidewalk dwell (modeled on companion autonomous stroll):
      // - Camera heading (`dwellAnchorHeadingDeg`) remains completely steady (zero spinning!).
      // - User avatar gently settles down at the landmark sidewalk, alternating between calm
      //   stationary observation pauses (`speedMps < 0.15`, which triggers companionDot's
      //   autonomous curiosity stroll around the landmark!) and slow, unhurried sidewalk steps
      //   along `dwellAnchorHeadingDeg`.
      const cyclePosSec = dwellElapsedSec % 7.0;
      const isGentleStrollPhase = cyclePosSec < 2.2;
      const calmStrollSpeedMps = isGentleStrollPhase
        ? walkSpeedMps * 0.55
        : 0.05;
      const moveMeters = isGentleStrollPhase ? calmStrollSpeedMps * dt : 0;

      const walkHeadingRad = (dwellAnchorHeadingDeg * Math.PI) / 180;
      const nextLat =
        coordinates.lat + (moveMeters * Math.cos(walkHeadingRad)) / 111139.0;
      const cosLat = Math.cos((coordinates.lat * Math.PI) / 180);
      const nextLon =
        coordinates.lon +
        (moveMeters * Math.sin(walkHeadingRad)) /
          (111139.0 * (Math.abs(cosLat) > 0.001 ? cosLat : 1.0));

      const bubbleSpec = buildLandmarkBubbleSpec(
        target,
        `🚶 Landmark Wander (${Math.ceil(dwellRemainingSec)}s left) · Stop ${currentLandmarkIndex + 1}/${tourOrder.length}`,
      );

      return {
        lat: nextLat,
        lon: nextLon,
        elev: target.elev ?? coordinates.height ?? 50,
        heading: dwellAnchorHeadingDeg,
        speedMps: calmStrollSpeedMps,
        bubbleSpec,
      };
    }

    if (state === TOUR_PLAY_STATES.PLAY_ACTIVE && activePlayActivity) {
      playElapsedSec += dt;
      const baseSpd = activePlayActivity.speedMps || walkSpeedMps;
      // Calm, comfortable trail/beach/promenade stroll with steady camera heading
      // and natural companion-like pause/stroll cadence (no dizzying yaw swings).
      const baseHeading = playOrigin?.heading ?? 45;
      const subtleDriftDeg = Math.sin(playElapsedSec * 0.12) * 1.5;
      const headingDeg = (baseHeading + subtleDriftDeg + 360) % 360;
      const headingRad = (headingDeg * Math.PI) / 180;

      const cycleSec = playElapsedSec % 9.0;
      const effectivePlaySpeed = cycleSec < 6.5 ? baseSpd : 0.08;
      const stepMeters = cycleSec < 6.5 ? effectivePlaySpeed * dt : 0;

      const nextLat =
        coordinates.lat + (stepMeters * Math.cos(headingRad)) / 111139.0;
      const cosLat = Math.cos((coordinates.lat * Math.PI) / 180);
      const nextLon =
        coordinates.lon +
        (stepMeters * Math.sin(headingRad)) /
          (111139.0 * (Math.abs(cosLat) > 0.001 ? cosLat : 1.0));

      const bubbleSpec = buildPlayBubbleSpec(activePlayActivity);
      return {
        lat: nextLat,
        lon: nextLon,
        heading: headingDeg,
        speedMps: effectivePlaySpeed,
        bubbleSpec,
      };
    }

    return null;
  }

  function ensureWanderControllerActive({
    lat,
    lon,
    elev,
    heading,
    preserveCameraMode = true,
    forceRelocate = false,
  } = {}) {
    if (!wanderEngine) return;
    wanderEngine.clearInputState?.();
    wanderEngine.setWalkSpeedOverride?.(walkSpeedMps);
    wanderEngine.setExternalController?.({
      update: updateStep,
      isManualTakeover: () => state === TOUR_PLAY_STATES.USER_TAKEOVER,
      onManualInput: () => {
        if (
          state === TOUR_PLAY_STATES.LANDMARK_DWELL ||
          state === TOUR_PLAY_STATES.SCOOTER_TRANSIT ||
          state === TOUR_PLAY_STATES.PLAY_ACTIVE
        ) {
          takeOverAtLandmark();
        }
      },
    });

    const userAvatar = wanderEngine.getUserAvatar?.();
    const companionDot =
      wanderEngine.getCompanion?.() || wanderEngine.getCompanionDot?.();
    const needsRestart =
      !wanderEngine.isWandering ||
      !userAvatar ||
      userAvatar.isDestroyed ||
      (activeTourCompanion && (!companionDot || companionDot.isDestroyed));

    if (needsRestart) {
      wanderEngine.startWandering?.({
        lat,
        lon,
        elev,
        heading,
        companion: activeTourCompanion,
        cameraMode: activeTourCameraMode || WANDER_CAMERA_MODES.ISO_CHASE,
      });
      wanderEngine.relocateTo?.({
        lat,
        lon,
        elev,
        heading,
        preserveCameraMode: true,
      });
    } else if (forceRelocate) {
      wanderEngine.relocateTo?.({
        lat,
        lon,
        elev,
        heading,
        preserveCameraMode,
      });
    }

    const activeAvatar = wanderEngine.getUserAvatar?.();
    const activeCompanion =
      wanderEngine.getCompanion?.() || wanderEngine.getCompanionDot?.();
    const currentCam =
      wanderEngine.getCameraMode?.() || WANDER_CAMERA_MODES.ISO_CHASE;
    if (
      activeAvatar?.setVisible &&
      currentCam !== WANDER_CAMERA_MODES.FIRST_PERSON
    ) {
      activeAvatar.setVisible(true);
    }
    if (activeTourCompanion && activeCompanion?.setVisible) {
      activeCompanion.setVisible(true);
    }
  }

  /**
   * Starts a randomized electric scooter landmark tour for a major city.
   */
  function startCityTour({
    cityId = null,
    lat = null,
    lon = null,
    cameraMode = WANDER_CAMERA_MODES.ISO_CHASE,
    companion = true,
    startStopId = null,
    tourMode = 'all',
    transitMode = null,
    viewer: overrideViewer = null,
  } = {}) {
    if (overrideViewer) activeViewer = overrideViewer;
    activeTourCompanion = companion;
    activeTourCameraMode = cameraMode || WANDER_CAMERA_MODES.ISO_CHASE;
    const effectiveTourMode =
      String(tourMode || 'all')
        .trim()
        .toLowerCase() || 'all';
    let effectiveCityId =
      typeof cityId === 'string' && cityId.trim().toLowerCase() !== 'auto'
        ? normalizeMetroTourCityKey(cityId.trim()) || cityId.trim()
        : null;
    let nearestMetroInfo = null;
    if (!effectiveCityId && Number.isFinite(lat) && Number.isFinite(lon)) {
      nearestMetroInfo = resolveNearestMetroForTour(lat, lon);
      effectiveCityId = nearestMetroInfo.cityId;
    }

    const rawLandmarks =
      nearestMetroInfo?.landmarks ||
      getLandmarksForCity(effectiveCityId, lat, lon);
    let shuffled = buildTourItinerary(rawLandmarks, {
      tourMode: effectiveTourMode,
      rng,
      shuffle: true,
    });

    if (startStopId) {
      const idx = shuffled.findIndex((l) => l.id === startStopId);
      if (idx > 0) {
        const [featured] = shuffled.splice(idx, 1);
        shuffled.unshift(featured);
      }
    } else if (shuffled.length > 1) {
      // Ensure two consecutive tour starts don't accidentally produce the exact same order
      const sig = shuffled.map((l) => l.id).join(',');
      if (sig === lastShuffledSignature) {
        const first = shuffled.shift();
        shuffled.push(first);
      }
      lastShuffledSignature = shuffled.map((l) => l.id).join(',');
    }

    tourOrder = shuffled;
    currentLandmarkIndex = 0;
    activePlayActivity = null;

    const reg = loadCustomToursRegistry();
    const normalizedKey = normalizeMetroTourCityKey(effectiveCityId);
    const customMeta =
      reg.customTours?.[normalizedKey]?.metadata ||
      reg.customTours?.[effectiveCityId]?.metadata ||
      null;
    const runtimeMeta =
      runtimeBuiltTours.get(normalizedKey)?.metadata ||
      runtimeBuiltTours.get(effectiveCityId)?.metadata ||
      null;
    const resolvedCity =
      (normalizedKey && LIVING_CITIES[normalizedKey]) ||
      (effectiveCityId && LIVING_CITIES[effectiveCityId.toLowerCase()]) ||
      Object.values(LIVING_CITIES).find((c) => c.id === effectiveCityId) ||
      null;
    activeCityId =
      customMeta?.id ||
      runtimeMeta?.id ||
      resolvedCity?.id ||
      normalizedKey ||
      effectiveCityId ||
      'los_angeles';
    activeCityName =
      nearestMetroInfo?.cityName ||
      customMeta?.name ||
      runtimeMeta?.name ||
      METRO_TOUR_METADATA[activeCityId]?.name ||
      resolvedCity?.name ||
      (activeCityId === 'los_angeles'
        ? 'Los Angeles'
        : activeCityId
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '));
    activeTourMetadata =
      customMeta ||
      runtimeMeta ||
      METRO_TOUR_METADATA[activeCityId] ||
      nearestMetroInfo?.metadata ||
      null;
    activeTourScope = activeTourMetadata?.tourScope || 'city';
    activeVenueCategory =
      activeTourMetadata?.venueCategory ||
      (isResortStayId(activeCityId)
        ? 'resort_stay'
        : activeTourScope === 'venue'
          ? 'theme_park'
          : null);
    activeTransitMode = activeTourMetadata?.transitMode || 'scooter';
    transitModeOverride =
      transitMode === 'walk_midway' ||
      transitMode === 'scooter' ||
      transitMode === 'resort_cart'
        ? transitMode
        : null;
    activeTourMode = effectiveTourMode;
    mediaPaused = false;

    const firstStop = tourOrder[0];
    state = TOUR_PLAY_STATES.SCOOTER_TRANSIT;
    dwellRemainingSec = 0;
    dwellElapsedSec = 0;
    applyDayCycleClockForStop(0);

    // Build street & sidewalk approach route for Landmark #1
    const staged = prepareScooterTransitToLandmark(firstStop, {
      currentCoord: null,
      isInitialSpawn: true,
    });
    const startLat = staged?.startLat ?? (firstStop?.lat || 34.1016) - 0.00065;
    const startLon =
      staged?.startLon ?? (firstStop?.lon || -118.3267) - 0.00045;
    const startElev = staged?.startElev ?? (firstStop?.elev || 100);
    const initialHeading = staged?.initialHeading ?? 90;
    dwellAnchorHeadingDeg = initialHeading;

    if (wanderEngine) {
      wanderEngine.clearInputState?.();
      wanderEngine.setWalkSpeedOverride?.(walkSpeedMps);
      wanderEngine.setExternalController?.({
        update: updateStep,
        isManualTakeover: () => state === TOUR_PLAY_STATES.USER_TAKEOVER,
        onManualInput: () => {
          if (
            state === TOUR_PLAY_STATES.LANDMARK_DWELL ||
            state === TOUR_PLAY_STATES.SCOOTER_TRANSIT ||
            state === TOUR_PLAY_STATES.PLAY_ACTIVE
          ) {
            takeOverAtLandmark();
          }
        },
      });

      wanderEngine.startWandering?.({
        lat: startLat,
        lon: startLon,
        elev: startElev,
        heading: initialHeading,
        companion,
        cameraMode,
      });

      wanderEngine.relocateTo?.({
        lat: startLat,
        lon: startLon,
        elev: startElev,
        heading: initialHeading,
        preserveCameraMode: true,
      });

      if (firstStop) {
        wanderEngine.showDialogBubble?.(buildTransitBubbleSpec(firstStop, 0));
      }
    }

    notifyListeners();
    return getStatus();
  }

  /**
   * Lets the user take over at NORMAL walking wander speed (1.2 m/s) at the current landmark
   * (or during Play mode), pausing the tour timer until they choose to continue.
   */
  function takeOverAtLandmark() {
    if (state === TOUR_PLAY_STATES.IDLE) return getStatus();
    state = TOUR_PLAY_STATES.USER_TAKEOVER;
    wanderEngine?.setWalkSpeedOverride?.(walkSpeedMps);

    const activeStop = tourOrder[currentLandmarkIndex];
    if (activeStop) {
      wanderEngine?.showDialogBubble?.(
        buildLandmarkBubbleSpec(
          activeStop,
          '🎮 Manual Walking Take-Over (1.2 m/s WASD) · Click Continue Tour when ready',
        ),
      );
    } else if (activePlayActivity) {
      wanderEngine?.showDialogBubble?.({
        ...buildPlayBubbleSpec(activePlayActivity),
        occupation: '🎮 Manual Walking Take-Over (1.2 m/s WASD)',
      });
    }
    notifyListeners();
    return getStatus();
  }

  /**
   * Resumes the electric scooter tour from user take-over (or skips the remaining dwell)
   * and heads to the next landmark in the randomized itinerary along streets and sidewalks.
   */
  function continueTour(options = {}) {
    if (!tourOrder.length) return getStatus();
    const { advanceToNext, resumeFromCurrent = true } = options || {};
    const hasExplicitAdvance = typeof advanceToNext === 'boolean';
    const hasExplicitResumeOnly =
      !hasExplicitAdvance &&
      options &&
      Object.prototype.hasOwnProperty.call(options, 'resumeFromCurrent') &&
      options.resumeFromCurrent === true;
    const shouldAdvance = hasExplicitAdvance
      ? advanceToNext
      : !hasExplicitResumeOnly;

    wanderEngine?.clearInputState?.();
    mediaPaused = false;
    if (shouldAdvance) {
      currentLandmarkIndex = (currentLandmarkIndex + 1) % tourOrder.length;
    }
    state = TOUR_PLAY_STATES.SCOOTER_TRANSIT;
    dwellRemainingSec = 0;
    dwellElapsedSec = 0;
    applyDayCycleClockForStop(currentLandmarkIndex);

    const nextStop = tourOrder[currentLandmarkIndex];
    const currentTelemetry = wanderEngine?.isWandering
      ? wanderEngine?.getTelemetry?.()
      : null;
    const wasMissingAvatar =
      !wanderEngine?.isWandering ||
      !wanderEngine?.getUserAvatar?.() ||
      wanderEngine?.getUserAvatar?.()?.isDestroyed;

    const staged = prepareScooterTransitToLandmark(nextStop, {
      currentCoord:
        resumeFromCurrent !== false
          ? currentTelemetry?.coordinates || null
          : null,
      isInitialSpawn: wasMissingAvatar,
      skipRelocate: true,
    });

    const targetLat =
      staged?.startLat ??
      currentTelemetry?.coordinates?.lat ??
      nextStop?.lat ??
      34.1016;
    const targetLon =
      staged?.startLon ??
      currentTelemetry?.coordinates?.lon ??
      nextStop?.lon ??
      -118.3267;
    const targetElev =
      staged?.startElev ??
      currentTelemetry?.coordinates?.height ??
      nextStop?.elev ??
      50;
    const targetHeading =
      staged?.initialHeading ?? currentTelemetry?.coordinates?.heading ?? 90;
    const preserveCameraMode =
      wanderEngine?.getCameraMode?.() !== WANDER_CAMERA_MODES.FREE;

    ensureWanderControllerActive({
      lat: targetLat,
      lon: targetLon,
      elev: targetElev,
      heading: targetHeading,
      preserveCameraMode,
      forceRelocate: true,
    });

    if (nextStop) {
      wanderEngine?.showDialogBubble?.(
        buildTransitBubbleSpec(nextStop, currentLandmarkIndex),
      );
    }

    notifyListeners();
    return getStatus();
  }

  function pauseForMedia() {
    if (state === TOUR_PLAY_STATES.IDLE) return getStatus();
    mediaPaused = true;
    notifyListeners();
    return getStatus();
  }

  function resumeFromMedia() {
    if (!mediaPaused) return getStatus();
    mediaPaused = false;
    notifyListeners();
    return getStatus();
  }

  /**
   * Immediately arrives at the current landmark and starts the 20s autonomous walking dwell
   * (useful for testing and instant landmark inspection).
   */
  function arriveAtCurrentLandmarkNow() {
    const target = tourOrder[currentLandmarkIndex];
    if (!target) return getStatus();
    state = TOUR_PLAY_STATES.LANDMARK_DWELL;
    dwellRemainingSec = dwellDurationSeconds;
    dwellElapsedSec = 0;
    dwellAnchorHeadingDeg = resolveLandmarkStreetBearingDeg(target);
    const curbRoute = buildStreetAndSidewalkRoute(null, target);
    const arrivalCurb =
      curbRoute.length > 0 ? curbRoute[curbRoute.length - 1] : target;
    wanderEngine?.relocateTo?.({
      lat: arrivalCurb.lat,
      lon: arrivalCurb.lon,
      elev: target.elev,
      heading: dwellAnchorHeadingDeg,
      preserveCameraMode: true,
    });
    const bubbleSpec = buildLandmarkBubbleSpec(
      target,
      `🚶 Autonomous Landmark Stroll (${Math.ceil(dwellRemainingSec)}s) · Stop ${currentLandmarkIndex + 1}/${tourOrder.length}`,
    );
    wanderEngine?.showDialogBubble?.(bubbleSpec);
    notifyListeners();
    return getStatus();
  }

  /**
   * Starts a Non-Metro / Tourist / Environmental 'Play' activity.
   * Supports both `startPlayActivity('mountain_hike', opts)` and `startPlayActivity({ activityId: 'mountain_hike', ... })`.
   */
  function startPlayActivity(arg1 = {}, arg2 = {}) {
    const opts =
      typeof arg1 === 'string'
        ? { ...arg2, activityId: arg1 }
        : { ...(arg1 || {}) };
    const {
      activityId = null,
      lat = 33.749,
      lon = -84.388,
      elev = 0,
      heading = 45,
      typology = null,
      cameraMode = WANDER_CAMERA_MODES.ISO_CHASE,
      companion = true,
    } = opts;

    const activities = getPlayActivitiesForEnvironment({
      typology,
      lat,
      lon,
      elevationMeters: elev,
    });
    const chosen = activities.find((a) => a.id === activityId) || activities[0];

    activePlayActivity = chosen;
    playOrigin = { lat, lon, elev, heading };
    playElapsedSec = 0;
    tourOrder = [];
    activeRouteWaypoints = [];
    state = TOUR_PLAY_STATES.PLAY_ACTIVE;

    if (wanderEngine) {
      wanderEngine.setWalkSpeedOverride?.(walkSpeedMps);
      wanderEngine.setExternalController?.({
        update: updateStep,
        isManualTakeover: () => state === TOUR_PLAY_STATES.USER_TAKEOVER,
        onManualInput: () => {
          if (state === TOUR_PLAY_STATES.PLAY_ACTIVE) {
            takeOverAtLandmark();
          }
        },
      });

      wanderEngine.startWandering?.({
        lat,
        lon,
        elev,
        heading,
        companion,
        cameraMode,
      });
      wanderEngine.showDialogBubble?.(buildPlayBubbleSpec(chosen));
    }

    if (cityEngine?.getAmbientSoundscape) {
      cityEngine.getAmbientSoundscape()?.start?.();
    }

    notifyListeners();
    try {
      getGlobalDrawerCoordinator().notifySimulationStarted('wander');
    } catch {}
    return getStatus();
  }

  function stop() {
    restoreDayCycleClock();
    state = TOUR_PLAY_STATES.IDLE;
    tourOrder = [];
    activeRouteWaypoints = [];
    currentRouteWaypointIndex = 0;
    currentLandmarkIndex = 0;
    dwellRemainingSec = 0;
    dwellElapsedSec = 0;
    transitElapsedSec = 0;
    activePlayActivity = null;
    activeTourScope = 'city';
    activeVenueCategory = null;
    activeTransitMode = 'scooter';
    transitModeOverride = null;
    activeTourMode = 'all';
    activeTourMetadata = null;
    mediaPaused = false;
    if (wanderEngine) {
      wanderEngine.setExternalController?.(null);
      wanderEngine.setWalkSpeedOverride?.(null);
      wanderEngine.stopWandering?.();
    }
    notifyListeners();
    try {
      getGlobalDrawerCoordinator().notifySimulationStopped('wander');
    } catch {}
    return getStatus();
  }

  function destroy() {
    stop();
    stateListeners.clear();
  }

  function setTransitMode(mode = null) {
    const clean = String(mode || '')
      .trim()
      .toLowerCase();
    if (clean === 'auto' || clean === '') {
      transitModeOverride = null;
    } else if (
      clean === 'walk_midway' ||
      clean === 'scooter' ||
      clean === 'resort_cart'
    ) {
      transitModeOverride = clean;
    } else {
      return getStatus();
    }
    const target = tourOrder[currentLandmarkIndex];
    if (state === TOUR_PLAY_STATES.SCOOTER_TRANSIT && target) {
      wanderEngine?.showDialogBubble?.(
        buildTransitBubbleSpec(target, currentLandmarkIndex),
      );
    }
    notifyListeners();
    return getStatus();
  }

  function getLinkedParkHops() {
    const parkBridges = getParkHopperBridgesForPark(activeCityId);
    const resortBridges = getExcursionBridgesForResort(activeCityId);
    return [...parkBridges, ...resortBridges];
  }

  function hopToLinkedPark(targetCityId = null, { bridgeId = null } = {}) {
    const bridges = getLinkedParkHops();
    const normalizedTarget = normalizeMetroTourCityKey(targetCityId);
    const bridge =
      bridges.find(
        (b) =>
          (bridgeId && b.id === bridgeId) ||
          (targetCityId &&
            (b.toCityId === targetCityId || b.toCityId === normalizedTarget)),
      ) || (!targetCityId && !bridgeId ? bridges[0] : null);
    if (!bridge) {
      return { ok: false, reason: 'no_bridge', bridges };
    }
    if (
      bridge.kind === 'drive_excursion' &&
      Number.isFinite(bridge.targetLat) &&
      Number.isFinite(bridge.targetLon)
    ) {
      const originName = activeCityName || 'Resort';
      stop();
      wanderEngine?.startWandering?.({
        lat: bridge.targetLat,
        lon: bridge.targetLon,
        elev: bridge.targetElev || 15,
        heading: 45,
        companion: activeTourCompanion,
        cameraMode: activeTourCameraMode || WANDER_CAMERA_MODES.ISO_CHASE,
      });
      wanderEngine?.relocateTo?.({
        lat: bridge.targetLat,
        lon: bridge.targetLon,
        elev: bridge.targetElev || 15,
        heading: 45,
        preserveCameraMode: true,
      });
      wanderEngine?.showDialogBubble?.({
        name: `${bridge.icon} ${bridge.transitLabel} ➔ ${bridge.toParkName}`,
        vibeColor: '#34d399',
        occupation: `${originName} Excursion · ${bridge.durationNote}`,
        thought: `Arrived at ${bridge.toParkName} via ${bridge.transitLabel}! Explore freely or hop back to your Resort Basecamp anytime.`,
        currentThought: `Arrived at ${bridge.toParkName} via ${bridge.transitLabel}! Explore freely or hop back to your Resort Basecamp anytime.`,
        city: bridge.toParkName,
        isCompanion: true,
      });
      return { ok: true, bridge, excursion: true, status: getStatus() };
    }
    wanderEngine?.showDialogBubble?.({
      name: `${bridge.icon} Boarding ${bridge.transitLabel}`,
      vibeColor: '#38bdf8',
      occupation: bridge.durationNote,
      thought: `Next stop: ${bridge.toParkName} via ${bridge.transitLabel}!`,
      currentThought: `Next stop: ${bridge.toParkName} via ${bridge.transitLabel}!`,
      city: bridge.toParkName,
      isCompanion: true,
    });
    const status = startCityTour({
      cityId: bridge.toCityId,
      startStopId: bridge.arrivalStopId,
      tourMode: 'all',
      cameraMode: activeTourCameraMode || WANDER_CAMERA_MODES.ISO_CHASE,
      companion: activeTourCompanion,
    });
    return { ok: true, bridge, status };
  }

  function getStatus() {
    const currentStop = tourOrder[currentLandmarkIndex] || null;
    const nextStop =
      tourOrder.length > 0
        ? tourOrder[(currentLandmarkIndex + 1) % tourOrder.length]
        : null;
    const isTour =
      state === TOUR_PLAY_STATES.SCOOTER_TRANSIT ||
      state === TOUR_PLAY_STATES.LANDMARK_DWELL ||
      (state === TOUR_PLAY_STATES.USER_TAKEOVER && tourOrder.length > 0);
    const isPlay =
      state === TOUR_PLAY_STATES.PLAY_ACTIVE ||
      (state === TOUR_PLAY_STATES.USER_TAKEOVER && Boolean(activePlayActivity));
    const parkHopperBridges = isTour ? getLinkedParkHops() : [];
    const resortExcursionBridges = isTour
      ? getExcursionBridgesForResort(activeCityId)
      : [];
    const effectiveTransitMode = getEffectiveTransitMode(currentStop);
    const isFinalEveningStop = Boolean(
      isTour &&
      activeTourScope === 'venue' &&
      tourOrder.length > 0 &&
      (currentLandmarkIndex >= tourOrder.length - 1 ||
        Boolean(currentStop?.isEveningCapstone) ||
        (lastSolarState?.localHour ?? 0) >= 19.25),
    );
    return {
      ok: true,
      state,
      mode: isTour ? 'tour' : isPlay ? 'play' : null,
      isActive: state !== TOUR_PLAY_STATES.IDLE,
      isTour,
      isPlay,
      cityId: activeCityId,
      cityName: activeCityName,
      tourScope: activeTourScope,
      venueCategory: activeVenueCategory,
      transitMode: effectiveTransitMode,
      baseTransitMode: activeTransitMode,
      effectiveTransitMode,
      transitModeOverride,
      supportedTransitModes:
        activeTourMetadata?.supportedTransitModes ||
        (activeVenueCategory === 'resort_stay'
          ? ['walk_midway', 'scooter', 'resort_cart']
          : [activeTransitMode]),
      tourMode: activeTourMode,
      supportedModes: activeTourMetadata?.supportedModes || ['all'],
      dayCycle: lastSolarState,
      isFinalEveningStop,
      eveningAmbianceMode:
        activeTourMetadata?.eveningAmbianceMode ||
        (activeVenueCategory === 'resort_stay'
          ? 'fire_pit_lounge'
          : 'fireworks'),
      nearbyFireworksView: activeTourMetadata?.nearbyFireworksView || null,
      parkHopperBridges,
      resortExcursionBridges,
      mediaPaused,
      canResume:
        state === TOUR_PLAY_STATES.USER_TAKEOVER && tourOrder.length > 0,
      metadata: activeTourMetadata ? { ...activeTourMetadata } : null,
      landmarks: tourOrder.map((l) => ({ ...l })),
      tourOrder: tourOrder.map((l) => ({ ...l })),
      landmarkIndex: currentLandmarkIndex,
      currentLandmarkIndex,
      totalLandmarks: tourOrder.length,
      currentLandmark: currentStop,
      nextLandmark: nextStop,
      activeRouteWaypoints: activeRouteWaypoints.map((wp) => ({ ...wp })),
      currentRouteWaypointIndex,
      dwellRemainingSec: Math.ceil(dwellRemainingSec),
      dwellDurationSeconds,
      dwellAnchorHeadingDeg,
      scooterSpeedMps: getActiveTransitSpeedMps(currentStop),
      walkSpeedMps,
      activePlayActivity,
      activity: activePlayActivity,
      cameraMode:
        wanderEngine?.getCameraMode?.() || WANDER_CAMERA_MODES.ISO_CHASE,
    };
  }

  return {
    startCityTour,
    startPlayActivity,
    setTransitMode,
    takeOverAtLandmark,
    continueTour,
    hopToLinkedPark,
    getLinkedParkHops,
    pauseForMedia,
    resumeFromMedia,
    arriveAtCurrentLandmarkNow,
    resolveContext: resolveTourOrPlayContext,
    stop,
    destroy,
    getStatus,
    onStatusChange: (cb) => {
      if (typeof cb === 'function') {
        stateListeners.add(cb);
        return () => stateListeners.delete(cb);
      }
      return () => {};
    },
    _updateStep: updateStep,
  };
}
