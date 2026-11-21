/**
 * World Sim Flyout Coordinator & Zero-Credit Deterministic Locality Resolver.
 * (Lead UI Designer Architecture — Single-Active-Flyout Mutual Exclusion & Live Municipality Readout)
 *
 * Guarantees:
 * 1. Mutual Exclusion for Flyout Drawers: Opening any World Sim drawer (Wander, Living World,
 *    Transit, Sails, Drive, Rails, Flight) automatically closes all other open drawers so
 *    panels never stack or collide behind one another.
 * 2. Non-Destructive Browsing vs. Explicit Engagement: Opening a drawer to browse options
 *    never destroys an active simulation. Only when a new simulation explicitly engages
 *    (`notifySimulationStarted`) are competing camera-lock simulations cleanly halted.
 * 3. Zero-Credit Municipality & Street Resolution: Resolves human-readable City/Municipality,
 *    Region/State, and Street/Landmark using local curated gazetteers + keyless Nominatim
 *    reverse geocoding cached per ~200m cell (0 generative AI credits).
 */

import { CITY_POIS } from '../cityPois.js';
import { LIVING_CITIES } from '../citylife/cityWaypoints.js';
import { EXEMPLAR_LOCALES } from '../layers/citylife/localeClassifier.js';
import { msg, t } from '../i18n/index.js';

const LOCALITY_CACHE = new Map();
const LOCALITY_IN_FLIGHT = new Map();
const LOCALITY_WAITERS = new Map();
const LOCALITY_FAILED_AT = new Map();
const LOCALITY_GLOBAL_LISTENERS = new Set();
const MAX_CACHE_ENTRIES = 256;
const CELL_DEG = 0.002; // ~220m grid resolution
const FAILED_RETRY_COOLDOWN_MS = 30_000;

/**
 * Built-in zero-credit instant offline gazetteer covering major US & global
 * metropolitan centers (~28km metro radius) for immediate Frame-0 identification
 * before or without network reverse-geocoding.
 */
export const MAJOR_WORLD_METROS = [
  // United States — Major Metros
  {
    name: 'Houston',
    region: 'TX',
    lat: 29.7604,
    lon: -95.3698,
    landmark: 'Downtown / Discovery Green',
  },
  {
    name: 'Dallas',
    region: 'TX',
    lat: 32.7767,
    lon: -96.797,
    landmark: 'Downtown Dallas',
  },
  {
    name: 'Austin',
    region: 'TX',
    lat: 30.2672,
    lon: -97.7431,
    landmark: 'Congress Ave / Lady Bird Lake',
  },
  {
    name: 'San Antonio',
    region: 'TX',
    lat: 29.4241,
    lon: -98.4936,
    landmark: 'River Walk',
  },
  {
    name: 'Fort Worth',
    region: 'TX',
    lat: 32.7555,
    lon: -97.3308,
    landmark: 'Sundance Square',
  },
  {
    name: 'El Paso',
    region: 'TX',
    lat: 31.7619,
    lon: -106.485,
    landmark: 'Downtown El Paso',
  },
  {
    name: 'Los Angeles',
    region: 'CA',
    lat: 34.0522,
    lon: -118.2437,
    landmark: 'Downtown LA',
  },
  {
    name: 'San Diego',
    region: 'CA',
    lat: 32.7157,
    lon: -117.1611,
    landmark: 'Gaslamp / Balboa Park',
  },
  {
    name: 'San Jose',
    region: 'CA',
    lat: 37.3382,
    lon: -121.8863,
    landmark: 'Silicon Valley',
  },
  {
    name: 'San Francisco',
    region: 'CA',
    lat: 37.7749,
    lon: -122.4194,
    landmark: 'Market St / Embarcadero',
  },
  {
    name: 'Sacramento',
    region: 'CA',
    lat: 38.5816,
    lon: -121.4944,
    landmark: 'Capitol Mall',
  },
  {
    name: 'Oakland',
    region: 'CA',
    lat: 37.8044,
    lon: -122.2712,
    landmark: 'Lake Merritt / Jack London Sq',
  },
  {
    name: 'New York City',
    region: 'NY',
    lat: 40.7128,
    lon: -74.006,
    landmark: 'Manhattan',
  },
  {
    name: 'Buffalo',
    region: 'NY',
    lat: 42.8864,
    lon: -78.8784,
    landmark: 'Canalside',
  },
  {
    name: 'Chicago',
    region: 'IL',
    lat: 41.8781,
    lon: -87.6298,
    landmark: 'The Loop / Grant Park',
  },
  {
    name: 'Phoenix',
    region: 'AZ',
    lat: 33.4484,
    lon: -112.074,
    landmark: 'Downtown Phoenix',
  },
  {
    name: 'Tucson',
    region: 'AZ',
    lat: 32.2226,
    lon: -110.9747,
    landmark: 'Downtown Tucson',
  },
  {
    name: 'Philadelphia',
    region: 'PA',
    lat: 39.9526,
    lon: -75.1652,
    landmark: 'Center City',
  },
  {
    name: 'Pittsburgh',
    region: 'PA',
    lat: 40.4406,
    lon: -79.9959,
    landmark: 'Golden Triangle',
  },
  {
    name: 'Miami',
    region: 'FL',
    lat: 25.7617,
    lon: -80.1918,
    landmark: 'Biscayne Bay / Brickell',
  },
  {
    name: 'Key Largo',
    region: 'FL',
    lat: 25.089,
    lon: -80.449,
    landmark: 'Key Loaner House / Overseas Hwy MM 99 Bayside',
  },
  {
    name: 'Orlando',
    region: 'FL',
    lat: 28.5383,
    lon: -81.3792,
    landmark: 'Lake Eola',
  },
  {
    name: 'Tampa',
    region: 'FL',
    lat: 27.9506,
    lon: -82.4572,
    landmark: 'Tampa Riverwalk',
  },
  {
    name: 'Jacksonville',
    region: 'FL',
    lat: 30.3322,
    lon: -81.6557,
    landmark: 'St. Johns Riverfront',
  },
  {
    name: 'Atlanta',
    region: 'GA',
    lat: 33.749,
    lon: -84.388,
    landmark: 'Midtown / Piedmont Park',
  },
  {
    name: 'Savannah',
    region: 'GA',
    lat: 32.0809,
    lon: -81.0912,
    landmark: 'Historic District',
  },
  {
    name: 'Seattle',
    region: 'WA',
    lat: 47.6062,
    lon: -122.3321,
    landmark: 'Elliott Bay / Pike Place',
  },
  {
    name: 'Portland',
    region: 'OR',
    lat: 45.5152,
    lon: -122.6784,
    landmark: 'Willamette Riverfront',
  },
  {
    name: 'Denver',
    region: 'CO',
    lat: 39.7392,
    lon: -104.9903,
    landmark: 'Union Station / Civic Center',
  },
  {
    name: 'Salt Lake City',
    region: 'UT',
    lat: 40.7608,
    lon: -111.891,
    landmark: 'Temple Square',
  },
  {
    name: 'Las Vegas',
    region: 'NV',
    lat: 36.1699,
    lon: -115.1398,
    landmark: 'Las Vegas Strip',
  },
  {
    name: 'Albuquerque',
    region: 'NM',
    lat: 35.0844,
    lon: -106.6504,
    landmark: 'Old Town',
  },
  {
    name: 'Washington',
    region: 'DC',
    lat: 38.9072,
    lon: -77.0369,
    landmark: 'National Mall',
  },
  {
    name: 'Baltimore',
    region: 'MD',
    lat: 39.2904,
    lon: -76.6122,
    landmark: 'Inner Harbor',
  },
  {
    name: 'Boston',
    region: 'MA',
    lat: 42.3601,
    lon: -71.0589,
    landmark: 'Boston Common / Back Bay',
  },
  {
    name: 'Detroit',
    region: 'MI',
    lat: 42.3314,
    lon: -83.0458,
    landmark: 'Campus Martius',
  },
  {
    name: 'Minneapolis',
    region: 'MN',
    lat: 44.9778,
    lon: -93.265,
    landmark: 'Mill District',
  },
  {
    name: 'St. Louis',
    region: 'MO',
    lat: 38.627,
    lon: -90.1994,
    landmark: 'Gateway Arch',
  },
  {
    name: 'Kansas City',
    region: 'MO',
    lat: 39.0997,
    lon: -94.5786,
    landmark: 'Power & Light District',
  },
  {
    name: 'New Orleans',
    region: 'LA',
    lat: 29.9511,
    lon: -90.0715,
    landmark: 'French Quarter',
  },
  {
    name: 'Nashville',
    region: 'TN',
    lat: 36.1627,
    lon: -86.7816,
    landmark: 'Cumberland Riverfront',
  },
  {
    name: 'Memphis',
    region: 'TN',
    lat: 35.1495,
    lon: -90.049,
    landmark: 'Beale Street',
  },
  {
    name: 'Charlotte',
    region: 'NC',
    lat: 35.2271,
    lon: -80.8431,
    landmark: 'Uptown Charlotte',
  },
  {
    name: 'Raleigh',
    region: 'NC',
    lat: 35.7796,
    lon: -78.6382,
    landmark: 'Fayetteville Street',
  },
  {
    name: 'Charleston',
    region: 'SC',
    lat: 32.7765,
    lon: -79.9311,
    landmark: 'The Battery',
  },
  {
    name: 'Columbus',
    region: 'OH',
    lat: 39.9612,
    lon: -82.9988,
    landmark: 'Scioto Mile',
  },
  {
    name: 'Cleveland',
    region: 'OH',
    lat: 41.4993,
    lon: -81.6944,
    landmark: 'Public Square',
  },
  {
    name: 'Cincinnati',
    region: 'OH',
    lat: 39.1031,
    lon: -84.512,
    landmark: 'Smale Riverfront Park',
  },
  {
    name: 'Indianapolis',
    region: 'IN',
    lat: 39.7684,
    lon: -86.1581,
    landmark: 'Monument Circle',
  },
  {
    name: 'Milwaukee',
    region: 'WI',
    lat: 43.0389,
    lon: -87.9065,
    landmark: 'Historic Third Ward',
  },
  {
    name: 'Louisville',
    region: 'KY',
    lat: 38.2527,
    lon: -85.7585,
    landmark: 'Waterfront Park',
  },
  {
    name: 'Birmingham',
    region: 'AL',
    lat: 33.5186,
    lon: -86.8104,
    landmark: 'Railroad Park',
  },
  {
    name: 'Oklahoma City',
    region: 'OK',
    lat: 35.4676,
    lon: -97.5164,
    landmark: 'Bricktown',
  },
  {
    name: 'Tulsa',
    region: 'OK',
    lat: 36.154,
    lon: -95.9928,
    landmark: 'Gathering Place',
  },
  {
    name: 'Omaha',
    region: 'NE',
    lat: 41.2565,
    lon: -95.9345,
    landmark: 'Old Market',
  },
  {
    name: 'Honolulu',
    region: 'HI',
    lat: 21.3069,
    lon: -157.8583,
    landmark: 'Waikiki / Ala Moana',
  },
  {
    name: 'Anchorage',
    region: 'AK',
    lat: 61.2181,
    lon: -149.9003,
    landmark: 'Town Square',
  },

  // Canada, Mexico & Latin America
  {
    name: 'Toronto',
    region: 'Canada',
    lat: 43.6532,
    lon: -79.3832,
    landmark: 'Harbourfront / CN Tower',
  },
  {
    name: 'Montreal',
    region: 'Canada',
    lat: 45.5017,
    lon: -73.5673,
    landmark: 'Old Montreal',
  },
  {
    name: 'Vancouver',
    region: 'Canada',
    lat: 49.2827,
    lon: -123.1207,
    landmark: 'Coal Harbour / Stanley Park',
  },
  {
    name: 'Calgary',
    region: 'Canada',
    lat: 51.0447,
    lon: -114.0719,
    landmark: 'Bow River',
  },
  {
    name: 'Ottawa',
    region: 'Canada',
    lat: 45.4215,
    lon: -75.6972,
    landmark: 'Parliament Hill',
  },
  {
    name: 'Mexico City',
    region: 'Mexico',
    lat: 19.4326,
    lon: -99.1332,
    landmark: 'Zócalo / Chapultepec',
  },
  {
    name: 'Guadalajara',
    region: 'Mexico',
    lat: 20.6597,
    lon: -103.3496,
    landmark: 'Centro Histórico',
  },
  {
    name: 'Monterrey',
    region: 'Mexico',
    lat: 25.6866,
    lon: -100.3161,
    landmark: 'Macroplaza',
  },
  {
    name: 'São Paulo',
    region: 'Brazil',
    lat: -23.5505,
    lon: -46.6333,
    landmark: 'Avenida Paulista',
  },
  {
    name: 'Rio de Janeiro',
    region: 'Brazil',
    lat: -22.9068,
    lon: -43.1729,
    landmark: 'Copacabana / Centro',
  },
  {
    name: 'Buenos Aires',
    region: 'Argentina',
    lat: -34.6037,
    lon: -58.3816,
    landmark: 'Puerto Madero / Obelisco',
  },
  {
    name: 'Santiago',
    region: 'Chile',
    lat: -33.4489,
    lon: -70.6693,
    landmark: 'Plaza de Armas',
  },
  {
    name: 'Bogotá',
    region: 'Colombia',
    lat: 4.711,
    lon: -74.0721,
    landmark: 'La Candelaria',
  },
  {
    name: 'Lima',
    region: 'Peru',
    lat: -12.0464,
    lon: -77.0428,
    landmark: 'Miraflores / Centro',
  },

  // Europe
  {
    name: 'London',
    region: 'UK',
    lat: 51.5074,
    lon: -0.1278,
    landmark: 'Westminster / South Bank',
  },
  {
    name: 'Edinburgh',
    region: 'UK',
    lat: 55.9533,
    lon: -3.1883,
    landmark: 'Royal Mile',
  },
  {
    name: 'Manchester',
    region: 'UK',
    lat: 53.4808,
    lon: -2.2426,
    landmark: 'Deansgate',
  },
  {
    name: 'Dublin',
    region: 'Ireland',
    lat: 53.3498,
    lon: -6.2603,
    landmark: 'River Liffey / Temple Bar',
  },
  {
    name: 'Paris',
    region: 'France',
    lat: 48.8566,
    lon: 2.3522,
    landmark: 'Seine Riverbanks',
  },
  {
    name: 'Lyon',
    region: 'France',
    lat: 45.764,
    lon: 4.8357,
    landmark: 'Presqu’île',
  },
  {
    name: 'Marseille',
    region: 'France',
    lat: 43.2965,
    lon: 5.3698,
    landmark: 'Vieux-Port',
  },
  {
    name: 'Madrid',
    region: 'Spain',
    lat: 40.4168,
    lon: -3.7038,
    landmark: 'Puerta del Sol / Retiro',
  },
  {
    name: 'Barcelona',
    region: 'Spain',
    lat: 41.3874,
    lon: 2.1686,
    landmark: 'Eixample / Gothic Quarter',
  },
  {
    name: 'Lisbon',
    region: 'Portugal',
    lat: 38.7223,
    lon: -9.1393,
    landmark: 'Baixa / Chiado',
  },
  {
    name: 'Berlin',
    region: 'Germany',
    lat: 52.52,
    lon: 13.405,
    landmark: 'Mitte / Tiergarten',
  },
  {
    name: 'Munich',
    region: 'Germany',
    lat: 48.1351,
    lon: 11.582,
    landmark: 'Marienplatz',
  },
  {
    name: 'Frankfurt',
    region: 'Germany',
    lat: 50.1109,
    lon: 8.6821,
    landmark: 'Römerberg / Main River',
  },
  {
    name: 'Hamburg',
    region: 'Germany',
    lat: 53.5511,
    lon: 9.9937,
    landmark: 'HafenCity',
  },
  {
    name: 'Amsterdam',
    region: 'Netherlands',
    lat: 52.3676,
    lon: 4.9041,
    landmark: 'Canal Ring',
  },
  {
    name: 'Brussels',
    region: 'Belgium',
    lat: 50.8503,
    lon: 4.3517,
    landmark: 'Grand-Place',
  },
  {
    name: 'Zurich',
    region: 'Switzerland',
    lat: 47.3769,
    lon: 8.5417,
    landmark: 'Limmatquai',
  },
  {
    name: 'Geneva',
    region: 'Switzerland',
    lat: 46.2044,
    lon: 6.1432,
    landmark: 'Lake Geneva Jet d’Eau',
  },
  {
    name: 'Vienna',
    region: 'Austria',
    lat: 48.2082,
    lon: 16.3738,
    landmark: 'Innere Stadt',
  },
  {
    name: 'Rome',
    region: 'Italy',
    lat: 41.9028,
    lon: 12.4964,
    landmark: 'Centro Storico',
  },
  {
    name: 'Milan',
    region: 'Italy',
    lat: 45.4642,
    lon: 9.19,
    landmark: 'Piazza del Duomo',
  },
  {
    name: 'Florence',
    region: 'Italy',
    lat: 43.7696,
    lon: 11.2558,
    landmark: 'Ponte Vecchio',
  },
  {
    name: 'Venice',
    region: 'Italy',
    lat: 45.4408,
    lon: 12.3155,
    landmark: 'Piazza San Marco',
  },
  {
    name: 'Prague',
    region: 'Czechia',
    lat: 50.0755,
    lon: 14.4378,
    landmark: 'Charles Bridge / Old Town',
  },
  {
    name: 'Warsaw',
    region: 'Poland',
    lat: 52.2297,
    lon: 21.0122,
    landmark: 'Vistula Boulevards',
  },
  {
    name: 'Budapest',
    region: 'Hungary',
    lat: 47.4979,
    lon: 19.0402,
    landmark: 'Danube Promenade',
  },
  {
    name: 'Athens',
    region: 'Greece',
    lat: 37.9838,
    lon: 23.7275,
    landmark: 'Acropolis / Plaka',
  },
  {
    name: 'Stockholm',
    region: 'Sweden',
    lat: 59.3293,
    lon: 18.0686,
    landmark: 'Gamla Stan',
  },
  {
    name: 'Oslo',
    region: 'Norway',
    lat: 59.9139,
    lon: 10.7522,
    landmark: 'Aker Brygge',
  },
  {
    name: 'Copenhagen',
    region: 'Denmark',
    lat: 55.6761,
    lon: 12.5683,
    landmark: 'Nyhavn',
  },
  {
    name: 'Helsinki',
    region: 'Finland',
    lat: 60.1699,
    lon: 24.9384,
    landmark: 'Senate Square',
  },
  {
    name: 'Istanbul',
    region: 'Turkey',
    lat: 41.0082,
    lon: 28.9784,
    landmark: 'Sultanahmet / Karaköy',
  },

  // Middle East, Asia & Oceania
  {
    name: 'Dubai',
    region: 'UAE',
    lat: 25.2048,
    lon: 55.2708,
    landmark: 'Downtown Dubai',
  },
  {
    name: 'Abu Dhabi',
    region: 'UAE',
    lat: 24.4539,
    lon: 54.3773,
    landmark: 'Corniche',
  },
  {
    name: 'Doha',
    region: 'Qatar',
    lat: 25.2854,
    lon: 51.531,
    landmark: 'Doha Corniche',
  },
  {
    name: 'Riyadh',
    region: 'Saudi Arabia',
    lat: 24.7136,
    lon: 46.6753,
    landmark: 'Olaya / KAFD',
  },
  {
    name: 'Tel Aviv',
    region: 'Israel',
    lat: 32.0853,
    lon: 34.7818,
    landmark: 'Rothschild Blvd',
  },
  {
    name: 'Cairo',
    region: 'Egypt',
    lat: 30.0444,
    lon: 31.2357,
    landmark: 'Nile Corniche',
  },
  {
    name: 'Mumbai',
    region: 'India',
    lat: 19.076,
    lon: 72.8777,
    landmark: 'Marine Drive / Colaba',
  },
  {
    name: 'New Delhi',
    region: 'India',
    lat: 28.6139,
    lon: 77.209,
    landmark: 'Connaught Place',
  },
  {
    name: 'Bengaluru',
    region: 'India',
    lat: 12.9716,
    lon: 77.5946,
    landmark: 'Cubbon Park / MG Road',
  },
  {
    name: 'Bangkok',
    region: 'Thailand',
    lat: 13.7563,
    lon: 100.5018,
    landmark: 'Chao Phraya / Sukhumvit',
  },
  {
    name: 'Singapore',
    region: 'Singapore',
    lat: 1.3521,
    lon: 103.8198,
    landmark: 'Marina Bay',
  },
  {
    name: 'Kuala Lumpur',
    region: 'Malaysia',
    lat: 3.139,
    lon: 101.6869,
    landmark: 'KLCC Park',
  },
  {
    name: 'Jakarta',
    region: 'Indonesia',
    continent: 'Asia',
    lat: -6.2088,
    lon: 106.8456,
    landmark: 'Merdeka Square',
  },
  {
    name: 'Dhaka',
    region: 'Bangladesh',
    continent: 'Asia',
    lat: 23.8103,
    lon: 90.4125,
    landmark: 'Ramna / Sadarghat',
  },
  {
    name: 'Manila',
    region: 'Philippines',
    lat: 14.5995,
    lon: 120.9842,
    landmark: 'Rizal Park / BGC',
  },
  {
    name: 'Hong Kong',
    region: 'HK',
    continent: 'Asia',
    lat: 22.3193,
    lon: 114.1694,
    landmark: 'Victoria Harbour',
  },
  {
    name: 'Taipei',
    region: 'Taiwan',
    lat: 25.033,
    lon: 121.5654,
    landmark: 'Xinyi District',
  },
  {
    name: 'Seoul',
    region: 'South Korea',
    continent: 'Asia',
    lat: 37.5665,
    lon: 126.978,
    landmark: 'Gwanghwamun / Hongdae',
  },
  {
    name: 'Tokyo',
    region: 'Japan',
    continent: 'Asia',
    lat: 35.6762,
    lon: 139.6503,
    landmark: 'Shibuya / Marunouchi',
  },
  {
    name: 'Osaka',
    region: 'Japan',
    lat: 34.6937,
    lon: 135.5023,
    landmark: 'Dotonbori / Namba',
  },
  {
    name: 'Kyoto',
    region: 'Japan',
    lat: 35.0116,
    lon: 135.7681,
    landmark: 'Gion / Kamogawa',
  },
  {
    name: 'Shanghai',
    region: 'China',
    continent: 'Asia',
    lat: 31.2304,
    lon: 121.4737,
    landmark: 'The Bund / Lujiazui',
  },
  {
    name: 'Beijing',
    region: 'China',
    continent: 'Asia',
    lat: 39.9042,
    lon: 116.4074,
    landmark: 'Dongcheng',
  },
  {
    name: 'Chongqing',
    region: 'China',
    continent: 'Asia',
    lat: 29.563,
    lon: 106.5516,
    landmark: 'Jiefangbei / Hongyadong',
  },
  {
    name: 'Shenzhen',
    region: 'China',
    continent: 'Asia',
    lat: 22.5431,
    lon: 114.0579,
    landmark: 'Futian / Shenzhen Bay',
  },
  {
    name: 'Guangzhou',
    region: 'China',
    continent: 'Asia',
    lat: 23.1291,
    lon: 113.2644,
    landmark: 'Canton Tower / Zhujiang New Town',
  },
  // Africa
  {
    name: 'Lagos',
    region: 'Nigeria',
    continent: 'Africa',
    lat: 6.4541,
    lon: 3.3947,
    landmark: 'Victoria Island / Marina',
  },
  {
    name: 'Kinshasa',
    region: 'DR Congo',
    continent: 'Africa',
    lat: -4.3224,
    lon: 15.307,
    landmark: 'Gombe / Congo Riverfront',
  },
  {
    name: 'Johannesburg',
    region: 'South Africa',
    continent: 'Africa',
    lat: -26.2041,
    lon: 28.0473,
    landmark: 'Sandton / Maboneng',
  },
  {
    name: 'Nairobi',
    region: 'Kenya',
    continent: 'Africa',
    lat: -1.2921,
    lon: 36.8219,
    landmark: 'Kenyatta Plaza / Uhuru Park',
  },
  // Oceania & Antarctica
  {
    name: 'Sydney',
    region: 'Australia',
    continent: 'Oceania',
    lat: -33.8688,
    lon: 151.2093,
    landmark: 'Circular Quay',
  },
  {
    name: 'Melbourne',
    region: 'Australia',
    continent: 'Oceania',
    lat: -37.8136,
    lon: 144.9631,
    landmark: 'Yarra River / Federation Sq',
  },
  {
    name: 'Brisbane',
    region: 'Australia',
    lat: -27.4705,
    lon: 153.026,
    landmark: 'South Bank',
  },
  {
    name: 'Auckland',
    region: 'New Zealand',
    lat: -36.8485,
    lon: 174.7633,
    landmark: 'Viaduct Harbour',
  },
  {
    name: 'McMurdo Station',
    region: 'Antarctica',
    continent: 'Antarctica',
    lat: -77.8419,
    lon: 166.6863,
    landmark: 'Observation Hill / Hut Point',
  },
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Synchronously resolves nearest known city/locale/POI within local metro/landmark range,
 * returning null if outside known curated areas.
 */
export function resolveKnownLocalGazetteer(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // 1. Check Exemplar Locales (within 8 km)
  let bestLocale = null;
  let bestLocaleDist = Infinity;
  for (const loc of Object.values(EXEMPLAR_LOCALES || {})) {
    const d = haversineKm(lat, lon, loc.lat, loc.lon);
    if (d < bestLocaleDist) {
      bestLocaleDist = d;
      bestLocale = loc;
    }
  }
  if (bestLocale && bestLocaleDist <= 8.0) {
    return {
      city: bestLocale.name,
      region: bestLocale.region || '',
      street: bestLocale.landmarks?.[0] || '',
      fullLabel: bestLocale.region
        ? `${bestLocale.name} (${bestLocale.region})`
        : bestLocale.name,
      shortHudLabel: bestLocale.name.toUpperCase(),
      source: 'exemplar',
    };
  }

  // 2. Check City POIs (within 25 km)
  let bestPoi = null;
  let bestPoiDist = Infinity;
  for (const cityObj of Object.values(CITY_POIS || {})) {
    for (const poi of cityObj.pois || []) {
      const d = haversineKm(lat, lon, poi.lat, poi.lon);
      if (d < bestPoiDist) {
        bestPoiDist = d;
        bestPoi = { city: cityObj.name, poi: poi.name, distKm: d };
      }
    }
  }
  if (bestPoi && bestPoiDist <= 25.0) {
    const label =
      bestPoiDist <= 3.0
        ? `${bestPoi.city} — ${bestPoi.poi}`
        : `${bestPoi.city} (Near ${bestPoi.poi})`;
    return {
      city: bestPoi.city,
      region: '',
      street: bestPoi.poi,
      fullLabel: label,
      shortHudLabel:
        bestPoiDist <= 3.0
          ? `${bestPoi.city.toUpperCase()} · ${bestPoi.poi.toUpperCase()}`
          : bestPoi.city.toUpperCase(),
      source: 'poi',
    };
  }

  // 3. Check Living Cities (within 25 km)
  let bestCity = null;
  let bestCityDist = Infinity;
  for (const c of Object.values(LIVING_CITIES || {})) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < bestCityDist) {
      bestCityDist = d;
      bestCity = c;
    }
  }
  if (bestCity && bestCityDist <= 25.0) {
    return {
      city: bestCity.name,
      region: bestCity.country || '',
      street: bestCity.landmarks?.[0] || '',
      fullLabel: `${bestCity.name}, ${bestCity.country}`,
      shortHudLabel: `${bestCity.name.toUpperCase()}, ${(bestCity.country || '').toUpperCase()}`,
      source: 'living_city',
    };
  }

  // 4. Check Major World & US Metros (within 28 km)
  let bestMetro = null;
  let bestMetroDist = Infinity;
  for (const metro of MAJOR_WORLD_METROS) {
    const d = haversineKm(lat, lon, metro.lat, metro.lon);
    if (d < bestMetroDist) {
      bestMetroDist = d;
      bestMetro = metro;
    }
  }
  if (bestMetro && bestMetroDist <= 28.0) {
    const primary = bestMetro.region
      ? `${bestMetro.name}, ${bestMetro.region}`
      : bestMetro.name;
    const isDowntownCore = bestMetroDist <= 4.0 && bestMetro.landmark;
    return {
      city: bestMetro.name,
      region: bestMetro.region || '',
      street: isDowntownCore ? bestMetro.landmark : '',
      fullLabel: isDowntownCore
        ? `${primary} — ${bestMetro.landmark}`
        : primary,
      shortHudLabel: primary.toUpperCase(),
      source: 'major_metro',
    };
  }

  return null;
}

function cellCacheKey(lat, lon) {
  return `${Math.round(lat / CELL_DEG)}:${Math.round(lon / CELL_DEG)}`;
}

/**
 * Registers a listener invoked whenever any async locality cell resolution completes.
 */
export function onLocalityResolved(listener) {
  if (typeof listener !== 'function') return () => {};
  LOCALITY_GLOBAL_LISTENERS.add(listener);
  return () => {
    LOCALITY_GLOBAL_LISTENERS.delete(listener);
  };
}

/**
 * Clears cached locality entries (used by unit tests).
 */
export function clearLocalityCacheForTests() {
  LOCALITY_CACHE.clear();
  LOCALITY_IN_FLIGHT.clear();
  LOCALITY_WAITERS.clear();
  LOCALITY_FAILED_AT.clear();
}

function parseDisplayParts(displayStr) {
  if (!displayStr || typeof displayStr !== 'string') return null;
  const parts = displayStr
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^\d{4,6}(-\d{4})?$/.test(s));
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { locality: parts[0], region: '', street: '' };
  }
  if (parts.length === 2) {
    return { locality: parts[0], region: parts[1], street: '' };
  }
  // Typical Nominatim display_name:
  // "Brown Foundation Promenade, Downtown, Houston, Harris County, Texas, 77010, United States"
  const street = parts[0];
  const nonCounty = parts.filter((p) => !/\bcounty\b|\bparish\b/i.test(p));
  const country = nonCounty[nonCounty.length - 1] || '';
  const stateOrRegion =
    nonCounty.length >= 3 ? nonCounty[nonCounty.length - 2] : country;
  const cityCandidate =
    nonCounty.length >= 4
      ? nonCounty[nonCounty.length - 3]
      : nonCounty[1] || nonCounty[0];
  const neighborhood =
    nonCounty.length >= 5 && nonCounty[1] !== cityCandidate ? nonCounty[1] : '';
  return {
    locality: cityCandidate,
    region: stateOrRegion,
    street:
      neighborhood && street && street !== neighborhood
        ? `${street} (${neighborhood})`
        : street || neighborhood,
  };
}

export function formatReversePlace(raw) {
  if (!raw) return null;

  // Support Photon GeoJSON FeatureCollection: { features: [{ properties: {...} }] }
  if (Array.isArray(raw.features) && raw.features.length > 0) {
    const p = raw.features[0]?.properties || {};
    const locality =
      p.city ||
      p.town ||
      p.village ||
      p.municipality ||
      p.district ||
      p.county ||
      p.name ||
      '';
    const region = p.state || p.country || '';
    const district =
      p.district && p.district !== locality ? p.district : p.suburb || '';
    const streetBase =
      p.street || (p.name && p.name !== locality ? p.name : '');
    const street =
      streetBase && district && !streetBase.includes(district)
        ? `${streetBase} (${district})`
        : streetBase || district;

    if (locality || region) {
      const primary =
        locality && region && locality !== region
          ? `${locality}, ${region}`
          : locality || region;
      const fullLabel =
        street && street !== locality ? `${primary} — ${street}` : primary;
      const shortHudLabel = district
        ? `${primary.toUpperCase()} (${district.toUpperCase()})`
        : streetBase && streetBase !== locality
          ? `${primary.toUpperCase()} (${streetBase.toUpperCase()})`
          : primary.toUpperCase();
      return {
        city: locality || primary,
        region,
        street,
        fullLabel,
        shortHudLabel,
        source: 'reverse_geocode',
      };
    }
  }

  // Support array response from /api/geocode?q=lat,lon or { results: [...] }
  const place = Array.isArray(raw)
    ? raw[0]
    : Array.isArray(raw.results) && raw.results.length > 0
      ? raw.results[0]
      : raw;

  if (!place || typeof place !== 'object') return null;

  const addr = place.address || {};
  let locality =
    place.locality ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    addr.suburb ||
    addr.county ||
    '';
  let region =
    place.region ||
    addr.state ||
    addr.State ||
    addr.province ||
    addr.country_code?.toUpperCase() ||
    place.country ||
    '';
  const suburb =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    '';
  const road =
    place.streetLabels?.[0] ||
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    (place.name && place.name !== locality ? place.name : '') ||
    '';
  let street =
    road && suburb && road !== suburb && suburb !== locality
      ? `${road} (${suburb})`
      : road || (suburb !== locality ? suburb : '');

  const displayStr =
    place.display_name ||
    place.formatted_address ||
    place.formattedAddress ||
    '';

  if (!locality && displayStr) {
    const parsed = parseDisplayParts(displayStr);
    if (parsed) {
      locality = parsed.locality || locality;
      region = parsed.region || region;
      street = street || parsed.street || '';
    }
  }

  if (!locality && place.name) {
    locality = place.name;
  }

  if (!locality && !region && !displayStr) return null;

  const primary =
    locality && region && locality !== region
      ? `${locality}, ${region}`
      : locality || region || displayStr;
  const fullLabel =
    street && street !== locality ? `${primary} — ${street}` : primary;
  const hudDetail = suburb && suburb !== locality ? suburb : road;
  const shortHudLabel =
    hudDetail && hudDetail !== locality
      ? `${primary.toUpperCase()} (${hudDetail.toUpperCase()})`
      : primary.toUpperCase();

  return {
    city: locality || primary,
    region,
    street,
    fullLabel,
    shortHudLabel,
    source: 'reverse_geocode',
  };
}

/**
 * Resolves municipality/city and street label with zero generative AI credits.
 * Returns cached/synchronous result immediately, and triggers a non-blocking
 * reverse-geocode lookup if not yet cached for this ~220m cell.
 */
export function resolveZeroCreditLocality(
  lat,
  lon,
  { placeSearch = null, fetchImpl = null, onResolved = null } = {},
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      city: 'Unknown Sector',
      region: '',
      street: '',
      fullLabel: 'Unknown Sector',
      shortHudLabel: 'UNKNOWN SECTOR',
      source: 'none',
    };
  }

  const key = cellCacheKey(lat, lon);
  if (LOCALITY_CACHE.has(key)) {
    return LOCALITY_CACHE.get(key);
  }

  const syncMatch = resolveKnownLocalGazetteer(lat, lon);
  const latTag = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonTag = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  const fallback = syncMatch || {
    city: `Sector ${latTag}, ${lonTag}`,
    region: '',
    street: '',
    fullLabel: `Sector ${latTag}, ${lonTag}`,
    shortHudLabel: `SECTOR ${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`,
    source: 'coordinates',
  };

  if (typeof onResolved === 'function') {
    if (!LOCALITY_WAITERS.has(key)) {
      LOCALITY_WAITERS.set(key, new Set());
    }
    LOCALITY_WAITERS.get(key).add(onResolved);
  }

  const lastFailedAt = LOCALITY_FAILED_AT.get(key) || 0;
  if (lastFailedAt && Date.now() - lastFailedAt < FAILED_RETRY_COOLDOWN_MS) {
    return fallback;
  }

  // Trigger non-blocking keyless reverse geocode if available
  const effectivePlaceSearch =
    placeSearch ||
    (typeof window !== 'undefined' && window.__godsEyeView?.placeSearch) ||
    null;
  const effectiveFetch =
    fetchImpl ||
    (typeof window !== 'undefined' && typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : null);

  if (
    !LOCALITY_IN_FLIGHT.has(key) &&
    (typeof effectivePlaceSearch?.reverseGeocode === 'function' ||
      effectiveFetch)
  ) {
    const promise = (async () => {
      let formatted = null;
      try {
        if (typeof effectivePlaceSearch?.reverseGeocode === 'function') {
          const place = await effectivePlaceSearch.reverseGeocode(lat, lon);
          formatted = formatReversePlace(place);
        }

        // Tier 1: Local GEV proxy `/api/geocode?q=<lat>,<lon>` (or custom mock fetch)
        if (!formatted && effectiveFetch) {
          try {
            const qParams = new URLSearchParams({
              q: `${lat.toFixed(5)},${lon.toFixed(5)}`,
              lat: String(lat),
              lon: String(lon),
            });
            const res = await effectiveFetch(`/api/geocode?${qParams}`);
            if (res?.ok) {
              const data = await res.json();
              formatted = formatReversePlace(data);
            }
          } catch {
            /* try next keyless tier */
          }
        }

        // Tier 2: Keyless Photon Reverse Geocoder (direct CORS-enabled OSM endpoint)
        if (!formatted && effectiveFetch) {
          try {
            const photonUrl = `https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
            const res = await effectiveFetch(photonUrl);
            if (res?.ok) {
              const data = await res.json();
              formatted = formatReversePlace(data);
            }
          } catch {
            /* ignore network error */
          }
        }

        if (formatted) {
          LOCALITY_FAILED_AT.delete(key);
          LOCALITY_CACHE.set(key, formatted);
          if (LOCALITY_CACHE.size > MAX_CACHE_ENTRIES) {
            const oldestKey = LOCALITY_CACHE.keys().next().value;
            LOCALITY_CACHE.delete(oldestKey);
          }
          const waiters = LOCALITY_WAITERS.get(key);
          LOCALITY_WAITERS.delete(key);
          if (waiters) {
            for (const cb of waiters) {
              try {
                cb(formatted);
              } catch {}
            }
          }
          for (const listener of LOCALITY_GLOBAL_LISTENERS) {
            try {
              listener({ key, lat, lon, locality: formatted });
            } catch {}
          }
          return formatted;
        }
        LOCALITY_FAILED_AT.set(key, Date.now());
      } catch {
        LOCALITY_FAILED_AT.set(key, Date.now());
      } finally {
        LOCALITY_IN_FLIGHT.delete(key);
        LOCALITY_WAITERS.delete(key);
      }
      return null;
    })();
    LOCALITY_IN_FLIGHT.set(key, promise);
  }

  return fallback;
}

/**
 * Creates a coordinator that enforces single-active-flyout mutual exclusion
 * across all World Sim drawers and coordinates simulation handoffs.
 */
export function createWorldSimDockCoordinator() {
  const drawers = new Map(); // id -> { close, open, isOpen, button, accentColor }
  const simulations = new Map(); // id -> { stop, isActive }
  const overlayGroups = new Map(); // id -> { elements, getElements, hide, show }
  const collapseListeners = new Set();
  const simulationListeners = new Set();
  const drawerListeners = new Set();
  let activeDrawerId = null;
  let customUxCollapsed = false;
  let toggleButtonEl = null;
  let recallButtonEl = null;
  let dockBarEl = null;
  let toggleCleanup = null;

  function emitSimulationStateChange(detail) {
    for (const listener of simulationListeners) {
      try {
        listener(detail);
      } catch {}
    }
  }

  function emitDrawerStateChange(detail) {
    for (const listener of drawerListeners) {
      try {
        listener(detail);
      } catch {}
    }
  }

  function ensureCollapseStyles(
    doc = typeof document !== 'undefined' ? document : null,
  ) {
    if (!doc?.head || typeof doc.createElement !== 'function') return;
    if (doc.getElementById?.('gev-world-sim-dock-collapse-styles')) return;
    const style = doc.createElement('style');
    style.id = 'gev-world-sim-dock-collapse-styles';
    style.textContent = `
      .gev-ux-hidden {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      .gev-custom-ux-dock-bar {
        position: fixed;
        bottom: 14px;
        left: 16px;
        z-index: 10002;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        pointer-events: none;
      }
      .gev-custom-ux-master-toggle,
      .gev-earth-sim-intro-recall {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 11px;
        border-radius: 999px;
        border: 1px solid rgba(56, 189, 248, 0.45);
        background: rgba(10, 16, 28, 0.88);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        pointer-events: auto;
        touch-action: manipulation;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
      }
      .gev-custom-ux-master-toggle:hover,
      .gev-earth-sim-intro-recall:hover {
        border-color: #22d3ee;
        background: rgba(14, 24, 42, 0.96);
        transform: translateY(-1px);
      }
      .gev-custom-ux-master-toggle.is-collapsed {
        border-color: rgba(245, 158, 11, 0.65);
        color: #fde68a;
        background: rgba(15, 23, 42, 0.94);
      }
      .gev-earth-sim-intro-recall {
        border-color: rgba(34, 211, 238, 0.45);
        color: #bae6fd;
      }
      @media (max-width: 720px) {
        .gev-custom-ux-dock-bar {
          bottom: 64px;
          left: 12px;
        }
        .gev-custom-ux-master-toggle,
        .gev-earth-sim-intro-recall {
          padding: 6px 10px;
          font-size: 10.5px;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  function applyCollapsedClass(el, collapsed) {
    if (!el) return;
    if (el.classList?.toggle) {
      el.classList.toggle('gev-ux-hidden', Boolean(collapsed));
    }
    if (typeof el.setAttribute === 'function') {
      if (collapsed) {
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.removeAttribute?.('aria-hidden');
      }
    }
  }

  function applyOverlayGroupState(entry, collapsed) {
    if (!entry) return;
    const list = [];
    if (Array.isArray(entry.elements)) list.push(...entry.elements);
    if (typeof entry.getElements === 'function') {
      try {
        const dynamicEls = entry.getElements();
        if (Array.isArray(dynamicEls)) list.push(...dynamicEls);
      } catch {}
    }
    for (const el of list) {
      applyCollapsedClass(el, collapsed);
    }
    if (collapsed && typeof entry.hide === 'function') {
      try {
        entry.hide();
      } catch {}
    } else if (!collapsed && typeof entry.show === 'function') {
      try {
        entry.show();
      } catch {}
    }
  }

  function syncToggleButton() {
    if (!toggleButtonEl) return;
    toggleButtonEl.classList?.toggle?.('is-collapsed', customUxCollapsed);
    toggleButtonEl.setAttribute?.('aria-pressed', String(customUxCollapsed));
    toggleButtonEl.textContent = customUxCollapsed
      ? t(msg('🎛️ Sim UI'))
      : t(msg('👁️ Hide Custom UI'));
    toggleButtonEl.title = customUxCollapsed
      ? t(msg('Restore custom GEV simulation launchers & overlays (Alt+H)'))
      : t(
          msg(
            'Collapse all custom GEV overlays & launchers without stopping sims (Alt+H)',
          ),
        );
  }

  function registerDrawer(
    id,
    {
      open = null,
      close,
      isOpen = null,
      button = null,
      launcherEl = null,
      accentColor = '#22d3ee',
    } = {},
  ) {
    if (!id || typeof close !== 'function') return;
    const resolvedBtn = button || launcherEl;
    drawers.set(id, {
      open,
      close,
      isOpen,
      button: resolvedBtn,
      accentColor,
    });
    if (customUxCollapsed && resolvedBtn) {
      applyCollapsedClass(resolvedBtn, true);
    }
  }

  function openDrawer(id) {
    if (customUxCollapsed) {
      setCustomUxCollapsed(false);
    }
    const entry = drawers.get(id);
    if (entry && typeof entry.open === 'function') {
      entry.open();
      return true;
    }
    return false;
  }

  function closeDrawer(id) {
    const entry = drawers.get(id);
    if (entry && typeof entry.close === 'function') {
      entry.close();
      return true;
    }
    return false;
  }

  function unregisterDrawer(id) {
    const entry = drawers.get(id);
    if (entry?.button) {
      applyCollapsedClass(entry.button, false);
    }
    drawers.delete(id);
    if (activeDrawerId === id) activeDrawerId = null;
  }

  function registerOverlayGroup(
    id,
    { elements = [], getElements = null, hide = null, show = null } = {},
  ) {
    if (!id) return;
    const entry = {
      elements: Array.isArray(elements) ? elements.filter(Boolean) : [],
      getElements,
      hide,
      show,
    };
    overlayGroups.set(id, entry);
    if (customUxCollapsed) {
      applyOverlayGroupState(entry, true);
    }
  }

  function unregisterOverlayGroup(id) {
    const entry = overlayGroups.get(id);
    if (entry) {
      applyOverlayGroupState(entry, false);
    }
    overlayGroups.delete(id);
  }

  function notifyDrawerOpened(openedId) {
    if (customUxCollapsed) {
      setCustomUxCollapsed(false);
    }
    activeDrawerId = openedId;
    for (const [id, entry] of drawers.entries()) {
      if (id !== openedId) {
        try {
          entry.close();
        } catch {}
        if (entry.button?.style) {
          entry.button.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.6)';
          entry.button.style.transform = 'scale(1.0)';
        }
      } else if (entry.button?.style) {
        entry.button.style.boxShadow = `0 0 18px ${entry.accentColor || '#22d3ee'}`;
        entry.button.style.transform = 'scale(1.08)';
      }
    }
    emitDrawerStateChange({ type: 'opened', id: openedId });
  }

  function notifyDrawerClosed(closedId) {
    if (activeDrawerId === closedId) {
      activeDrawerId = null;
    }
    const entry = drawers.get(closedId);
    if (entry?.button?.style) {
      entry.button.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.6)';
      entry.button.style.transform = 'scale(1.0)';
    }
    emitDrawerStateChange({ type: 'closed', id: closedId });
  }

  function registerSimulation(id, { stop, isActive = null } = {}) {
    if (!id || typeof stop !== 'function') return;
    simulations.set(id, {
      stop,
      isActive: typeof isActive === 'function' ? isActive : null,
    });
  }

  function unregisterSimulation(id) {
    if (!id) return;
    simulations.delete(id);
    emitSimulationStateChange({ type: 'unregistered', id });
  }

  function getActiveSimulationIds({ excludeIds = [] } = {}) {
    const excluded = new Set(excludeIds || []);
    const activeIds = [];
    for (const [id, sim] of simulations.entries()) {
      if (excluded.has(id) || typeof sim.isActive !== 'function') continue;
      try {
        if (sim.isActive()) {
          activeIds.push(id);
        }
      } catch {}
    }
    return activeIds;
  }

  function hasActiveSimulation({ excludeIds = [] } = {}) {
    return getActiveSimulationIds({ excludeIds }).length > 0;
  }

  /**
   * Called ONLY when a user explicitly launches/engages a simulation
   * (never when merely opening a flyout drawer to browse).
   */
  function notifySimulationStarted(startedSimId, { keepIds = [] } = {}) {
    const keepSet = new Set([startedSimId, ...keepIds]);
    for (const [id, sim] of simulations.entries()) {
      if (!keepSet.has(id)) {
        try {
          sim.stop();
        } catch {}
      }
    }
    emitSimulationStateChange({ type: 'started', id: startedSimId });
  }

  function notifySimulationStopped(stoppedSimId = null) {
    emitSimulationStateChange({ type: 'stopped', id: stoppedSimId });
  }

  function onSimulationStateChange(cb) {
    if (typeof cb !== 'function') return () => {};
    simulationListeners.add(cb);
    return () => simulationListeners.delete(cb);
  }

  function onDrawerStateChange(cb) {
    if (typeof cb !== 'function') return () => {};
    drawerListeners.add(cb);
    return () => drawerListeners.delete(cb);
  }

  function closeAllDrawers() {
    for (const [id, entry] of drawers.entries()) {
      try {
        entry.close();
      } catch {}
      notifyDrawerClosed(id);
    }
    activeDrawerId = null;
  }

  function setCustomUxCollapsed(collapsed) {
    const next = Boolean(collapsed);
    customUxCollapsed = next;
    if (next) {
      closeAllDrawers();
    }
    for (const entry of drawers.values()) {
      if (entry.button) {
        applyCollapsedClass(entry.button, next);
      }
    }
    for (const entry of overlayGroups.values()) {
      applyOverlayGroupState(entry, next);
    }
    syncToggleButton();
    for (const listener of collapseListeners) {
      try {
        listener(next);
      } catch {}
    }
    return next;
  }

  function toggleCustomUxCollapsed() {
    return setCustomUxCollapsed(!customUxCollapsed);
  }

  function onCustomUxCollapseChange(cb) {
    if (typeof cb !== 'function') return () => {};
    collapseListeners.add(cb);
    return () => collapseListeners.delete(cb);
  }

  function mountCustomUxToggle({
    container = typeof document !== 'undefined' ? document.body : null,
    documentRef = typeof document !== 'undefined' ? document : null,
    onRecallEarthSimIntro = null,
  } = {}) {
    if (!container || !documentRef) {
      return { element: null, recallElement: null, destroy: () => {} };
    }
    ensureCollapseStyles(documentRef);
    if (toggleButtonEl && toggleButtonEl.parentNode) {
      syncToggleButton();
      return {
        element: toggleButtonEl,
        recallElement: recallButtonEl,
        destroy: () => toggleCleanup?.(),
      };
    }

    const bar = documentRef.createElement('div');
    bar.id = 'gev-custom-ux-dock-bar';
    bar.className = 'gev-custom-ux-dock-bar';

    const btn = documentRef.createElement('button');
    btn.id = 'gev-custom-ux-master-toggle';
    btn.type = 'button';
    btn.className = 'gev-custom-ux-master-toggle';

    const recallBtn = documentRef.createElement('button');
    recallBtn.id = 'gev-earth-sim-intro-recall';
    recallBtn.type = 'button';
    recallBtn.className = 'gev-earth-sim-intro-recall';
    recallBtn.textContent = t(msg('✨ Earth Sim'));
    recallBtn.title = t(msg('Open Earth Sim Engine Feature Catalog & Tour'));
    recallBtn.setAttribute?.(
      'aria-label',
      t(msg('Open Earth Sim Engine Feature Catalog')),
    );

    const onClick = (e) => {
      e?.stopPropagation?.();
      toggleCustomUxCollapsed();
    };
    const win =
      documentRef.defaultView ||
      (typeof window !== 'undefined' ? window : null);
    const onRecallClick = (e) => {
      e?.stopPropagation?.();
      onRecallEarthSimIntro?.();
      try {
        const Ev = win?.CustomEvent || globalThis?.CustomEvent;
        if (Ev && win?.dispatchEvent) {
          win.dispatchEvent(new Ev('gev:open-earth-sim-intro'));
        }
      } catch {}
    };
    const onKeyDown = (e) => {
      if (!e?.altKey || (e.key !== 'h' && e.key !== 'H')) return;
      const tag = e.target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        e.target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      toggleCustomUxCollapsed();
    };
    btn.addEventListener('click', onClick);
    recallBtn.addEventListener('click', onRecallClick);
    win?.addEventListener?.('keydown', onKeyDown);
    bar.appendChild(btn);
    bar.appendChild(recallBtn);
    container.appendChild(bar);
    dockBarEl = bar;
    toggleButtonEl = btn;
    recallButtonEl = recallBtn;
    syncToggleButton();

    toggleCleanup = () => {
      btn.removeEventListener('click', onClick);
      recallBtn.removeEventListener('click', onRecallClick);
      win?.removeEventListener?.('keydown', onKeyDown);
      bar.remove?.();
      if (dockBarEl === bar) dockBarEl = null;
      if (toggleButtonEl === btn) toggleButtonEl = null;
      if (recallButtonEl === recallBtn) recallButtonEl = null;
      toggleCleanup = null;
    };

    return {
      element: btn,
      recallElement: recallBtn,
      destroy: toggleCleanup,
    };
  }

  return {
    registerDrawer,
    unregisterDrawer,
    registerOverlayGroup,
    unregisterOverlayGroup,
    openDrawer,
    closeDrawer,
    notifyDrawerOpened,
    notifyDrawerClosed,
    registerSimulation,
    unregisterSimulation,
    notifySimulationStarted,
    notifySimulationStopped,
    getActiveSimulationIds,
    hasActiveSimulation,
    onSimulationStateChange,
    onDrawerStateChange,
    closeAllDrawers,
    setCustomUxCollapsed,
    toggleCustomUxCollapsed,
    isCustomUxCollapsed: () => customUxCollapsed,
    onCustomUxCollapseChange,
    mountCustomUxToggle,
    getActiveDrawerId: () => activeDrawerId,
    getRegisteredDrawerIds: () => [...drawers.keys()],
    getRegisteredOverlayGroupIds: () => [...overlayGroups.keys()],
  };
}

let fallbackCoordinator = null;

export function getGlobalDrawerCoordinator() {
  if (typeof window !== 'undefined') {
    if (!window.__gevDrawerCoordinator) {
      window.__gevDrawerCoordinator = createWorldSimDockCoordinator();
    }
    return window.__gevDrawerCoordinator;
  }
  if (!fallbackCoordinator) {
    fallbackCoordinator = createWorldSimDockCoordinator();
  }
  return fallbackCoordinator;
}
