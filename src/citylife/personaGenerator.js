/**
 * Deterministic Zero-Token Demographic Persona & Thought Generator.
 * (Living City Capability + Route Slice)
 *
 * Generates culturally grounded demographic identities, occupations, destinations,
 * and emotional thought states using a seeded PRNG based on coordinate hash.
 * Adapts dynamically to local weather conditions (rain umbrellas & speed boosts)
 * with zero cloud LLM API cost or network latency.
 */

import {
  WALKER_SPEED_MIN_MS,
  WALKER_SPEED_MAX_MS,
  JOGGER_SPEED_MIN_MS,
  JOGGER_SPEED_MAX_MS,
  resolveCity,
} from './cityWaypoints.js';

/**
 * Fast 32-bit integer hash for coordinates and seeds.
 */
export function hashCoordinate(lat, lon, seed = 0) {
  const str = `${lat.toFixed(6)}:${lon.toFixed(6)}:${seed}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 seeded pseudo-random number generator.
 */
export function createPRNG(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VIBE_PROFILES = [
  { id: 'calm', label: 'Calm & Relaxed', icon: '😊', color: '#10b981' },
  { id: 'rush', label: 'In a Rush', icon: '⚡', color: '#f59e0b' },
  {
    id: 'caffeinated',
    label: 'Caffeinated & Focused',
    icon: '☕',
    color: '#06b6d4',
  },
  {
    id: 'headphones',
    label: 'In the Zone (Headphones)',
    icon: '🎧',
    color: '#8b5cf6',
  },
  { id: 'cardio', label: 'Cardio Flow', icon: '🏃', color: '#ef4444' },
  { id: 'food', label: 'Food Hunting', icon: '🍕', color: '#f97316' },
  { id: 'reflective', label: 'Reflective Walk', icon: '🌿', color: '#14b8a6' },
];

export const CITY_DICTIONARIES = {
  atlanta: {
    names: [
      'Marcus',
      'Nia',
      'Jamal',
      'Sarah',
      'Trey',
      'Elena',
      'DeAndre',
      'Chloe',
      'Austin',
      'Keisha',
      'Brandon',
      'Maya',
      'Tyler',
      'Jasmine',
      'Darius',
    ],
    occupations: [
      'Tech Founder',
      'CDC Epidemiologist',
      'Music Producer',
      'Product Designer',
      'Film Crew Assistant',
      'University Professor',
      'Barista',
      'Civil Engineer',
      'Delta Flight Attendant',
      'Architectural Drafter',
      'Fintech Dev',
      'Landscape Architect',
    ],
    thoughts: [
      'Grabbing an iced matcha at Ponce City Market before standup',
      'Heading to MARTA Midtown for the afternoon sprint',
      'Piedmont Park run before the summer humidity kicks in',
      'Scouting soundstage locations near West Midtown',
      'Meeting the team for lunch at Colony Square food hall',
      'Taking the BeltLine south toward Krog Street Market',
      'Hoping the Downtown Connector traffic stays light on 10th',
      'Catching the golden hour over the Midtown skyline',
      'Listening to a deep podcast on spatial world models',
    ],
    rainThoughts: [
      'Good thing I packed an umbrella for this ATL deluge',
      'Ducking into the coffee shop until the thunder rolls past',
      'BeltLine is completely peaceful in the rain',
      'MARTA train will be packed with commuters dodging puddles',
    ],
    destinations: [
      'Ponce City Market',
      'MARTA Midtown Station',
      'Piedmont Park Meadow',
      'Colony Square',
      'High Museum of Art',
      'Tech Square',
      'Krog Street Tunnel',
    ],
  },
  new_york: {
    names: [
      'Julian',
      'Aria',
      'Mateo',
      'Emma',
      'Dante',
      'Zoe',
      'Leo',
      'Fatima',
      'Ethan',
      'Sienna',
      'Noah',
      'Ava',
      'Lucas',
      'Mia',
      'Kai',
    ],
    occupations: [
      'Fintech Quant',
      'Broadway Stage Manager',
      'Gallery Curator',
      'Journalist',
      'Software Architect',
      'Fashion Stylist',
      'Public Health Analyst',
      'Sous Chef',
      'Industrial Designer',
      'Audiobook Narrator',
      'Venture Associate',
      'Urban Planner',
    ],
    thoughts: [
      'Cutting through Central Park toward the Upper West Side',
      'Grabbing an espresso on 8th Ave before the morning briefing',
      'Dodging slow walkers on the Broadway plaza',
      'Catching the express train at Columbus Circle',
      'Checking out the new contemporary installation at MoMA',
      'Reviewing the architectural model for the Hudson Yards build',
      'Hoping the rehearsal schedule runs on time today',
      'Fresh autumn breeze coming off the reservoir',
    ],
    rainThoughts: [
      'Subway grates are slick — stepping carefully down 7th Ave',
      'Classic yellow cab splashing puddles along the curb',
      'Central Park trees make a natural canopy in the drizzle',
      'Rain jacket hood up, earbuds in, full NYC cadence',
    ],
    destinations: [
      'Columbus Circle',
      'MoMA',
      'Bryant Park Reading Room',
      'Times Square Plaza',
      'Bethesda Fountain',
      'Lincoln Center',
      'Grand Central Terminal',
    ],
  },
  tokyo: {
    names: [
      'Kenji',
      'Yuka',
      'Daiki',
      'Sakura',
      'Ren',
      'Mei',
      'Haruto',
      'Aoi',
      'Sota',
      'Hina',
      'Riku',
      'Yui',
      'Kaito',
      'Nanami',
      'Kazuki',
    ],
    occupations: [
      'Robotics Engineer',
      'UI/UX Designer',
      'Shinkansen Rail Officer',
      'Anime Animator',
      'Ramen Chef',
      'Game Developer',
      'University Researcher',
      'Convenience Store Manager',
      'Sound Designer',
      'High School Instructor',
      'Fintech Strategist',
      'Photographer',
    ],
    thoughts: [
      'Crossing Shibuya scramble toward Miyashita Park rooftop',
      'Stopping by Lawson for warm onigiri and boss black coffee',
      'Testing the new AR vision pipeline on pedestrian crowd flows',
      'Quiet moment under the torii gates at Meiji Jingu',
      'Meeting a colleague at a kissaten in Harajuku',
      'Evening sprint deadline at Cerulean Tower office',
      'Tokyo evening neon reflecting in the train window',
    ],
    rainThoughts: [
      'Clear vinyl umbrella deployed — classic Shibuya rainy crossing',
      'Neon reflections in Tokyo asphalt look like an anime frame',
      'Train platforms will be orderly despite the downpour',
    ],
    destinations: [
      'Shibuya Scramble',
      'Hachiko Plaza',
      'Miyashita Park',
      'Meiji Jingu Shrine',
      'Yoyogi Park',
      'Cerulean Tower',
      'Omotesando Hills',
    ],
  },
  london: {
    names: [
      'Oliver',
      'Charlotte',
      'Harry',
      'Amara',
      'George',
      'Freya',
      'Arthur',
      'Priya',
      'Leo',
      'Isla',
      'James',
      'Mia',
      'Alfie',
      'Poppy',
    ],
    occupations: [
      'Fintech Developer',
      'BBC Producer',
      'Architect',
      'NHS Resident',
      'Museum Conservator',
      'Barista',
      'Graphic Novelist',
      'Civil Barrister',
      'Acoustic Engineer',
      'TfL Operations Analyst',
    ],
    thoughts: [
      'Brisk stroll along South Bank past the National Theatre',
      'Grabbing a flat white near Borough Market',
      'Checking the Thames tide before heading to Westminster',
      'Covent Garden street performers warming up',
      'Walking across Waterloo Bridge with the skyline in view',
    ],
    rainThoughts: [
      'Proper London drizzle — umbrella up and collar turned',
      'Reflections of the London Eye shimmering on wet flagstones',
      'Heading down into the Tube to stay out of the rain',
    ],
    destinations: [
      'South Bank Centre',
      'Tate Modern',
      'Covent Garden Piazza',
      'Borough Market',
      'Waterloo Station',
      'St Paul’s Cathedral',
    ],
  },
  paris: {
    names: [
      'Gabriel',
      'Camille',
      'Louis',
      'Inès',
      'Raphaël',
      'Léa',
      'Arthur',
      'Manon',
      'Jules',
      'Chloé',
      'Hugo',
      'Zoé',
      'Théo',
    ],
    occupations: [
      'Landscape Architect',
      'Fashion Designer',
      'Sorbonne Scholar',
      'Pastry Chef',
      'Digital Illustrator',
      'Museum Guide',
      'Software Engineer',
      'Sommelier',
    ],
    thoughts: [
      'Flâneur walk along Quais de Seine admiring the bouquinistes',
      'Warm croissant and café crème on Rue de Rivoli',
      'Crossing the Pont des Arts toward the Institut de France',
      'Afternoon quiet in the Jardin des Tuileries',
    ],
    rainThoughts: [
      'Paris sous la pluie — cobblestones shining in the grey light',
      'Ducking under the arcade near the Louvre courtyard',
      'Steam rising from the metro entrance on Saint-Germain',
    ],
    destinations: [
      'Quais de Seine',
      'Jardin des Tuileries',
      'Louvre Courtyard',
      'Place de la Concorde',
      'Boulevard Saint-Germain',
    ],
  },
  san_francisco: {
    names: [
      'Liam',
      'Avery',
      'Devon',
      'Sierra',
      'Kai',
      'Phoebe',
      'Marcus',
      'Maya',
      'Nico',
      'Sloan',
    ],
    occupations: [
      'AI Research Scientist',
      'Biotech Geneticist',
      'Sourdough Baker',
      'Clean Energy PM',
      'Coffee Roaster',
      'Sound Engineer',
      'Robotics Tech',
    ],
    thoughts: [
      'Jog along the Embarcadero with the Bay Bridge ahead',
      'Grabbing pour-over coffee at the Ferry Building',
      'Testing local LLM embeddings while taking a fresh air walk',
      'Brisk Pacific breeze sweeping through the piers',
    ],
    rainThoughts: [
      'Bay fog turning into heavy coastal rain',
      'Ferry horns echoing through the misty rain',
    ],
    destinations: [
      'Ferry Building Marketplace',
      'Pier 14 Boardwalk',
      'Salesforce Park',
      'Rincon Park Cupids Span',
    ],
  },
  monaco: {
    names: [
      'Alexandre',
      'Elena',
      'Gianni',
      'Sophie',
      'Matteo',
      'Claire',
      'Valentin',
      'Beatrice',
    ],
    occupations: [
      'Yacht Broker',
      'F1 Telemetry Engineer',
      'Private Wealth Advisor',
      'Hospitality Director',
      'Oceanographer',
      'Luxury Watchmaker',
    ],
    thoughts: [
      'Walking down Quai des États-Unis admiring the superyachts',
      'Inspecting the curbing at Fairmont Hairpin before the weekend',
      'Espresso terrace overlooking Casino Square',
      'Breeze off the Mediterranean carrying sea salt',
    ],
    rainThoughts: [
      'Rain washing over the harbor stone — yachts tucked into slips',
      'Puddles reflecting the palace ramparts above the rock',
    ],
    destinations: [
      'Port Hercule Marina',
      'Casino Square Gardens',
      'Fairmont Chicane',
      'Yacht Club de Monaco',
    ],
  },
  singapore: {
    names: [
      'Wei',
      'Cheryl',
      'Arun',
      'Priya',
      'Jun',
      'Mei Ling',
      'Zack',
      'Farhan',
      'Nadia',
    ],
    occupations: [
      'Fintech Architect',
      'Urban Botanist',
      'Semiconductor Engineer',
      'Logistics Director',
      'Maritime Officer',
      'Food Culture Host',
    ],
    thoughts: [
      'Evening loop around Marina Bay as the lights ignite',
      'Breeze through the Supertree Grove at Gardens by the Bay',
      'Grabbing iced teh tarik near Raffles Place',
    ],
    rainThoughts: [
      'Tropical afternoon thunderstorm — sheltered walkway path saves the day',
      'Rain pouring into the Marina Bay reservoir with thunder',
    ],
    destinations: [
      'Marina Bay Promenade',
      'Supertree Grove Walk',
      'Merlion Park',
      'Helix Bridge',
    ],
  },
  chicago: {
    names: [
      'Patrick',
      'Nora',
      'Malik',
      'Claire',
      'Devin',
      'Hannah',
      'Derrick',
      'Grace',
      'Anthony',
    ],
    occupations: [
      'Architectural Historian',
      'Commodities Trader',
      'Blues Musician',
      'Data Scientist',
      'Hospitality Lead',
      'Industrial Brewer',
    ],
    thoughts: [
      'Walking past Cloud Gate watching the skyline reflection',
      'Brisk wind off Lake Michigan along Michigan Avenue',
      'Taking the Chicago Riverwalk down toward the lake',
    ],
    rainThoughts: [
      'Lake effect rain blowing down Michigan Ave',
      'The Bean looks surreal in grey misty rain',
    ],
    destinations: [
      'Millennium Park Cloud Gate',
      'Chicago Riverwalk',
      'Lurie Garden',
      'Art Institute Steps',
    ],
  },
  sydney: {
    names: [
      'Jack',
      'Ruby',
      'Lachlan',
      'Chloe',
      'Cooper',
      'Matilda',
      'Noah',
      'Zara',
      'Flynn',
    ],
    occupations: [
      'Marine Biologist',
      'Solar Engineer',
      'Surf Photographer',
      'Barista',
      'Software Engineer',
      'Harbour Pilot',
    ],
    thoughts: [
      'Boardwalk stroll from Circular Quay to the Opera House',
      'Watching the ferries glide across Sydney Harbour',
      'Sunny morning walk before heading into the tech hub',
    ],
    rainThoughts: [
      'Harbour rain rolling in past the Heads',
      'Ducking under the Opera House sails to wait out the shower',
    ],
    destinations: [
      'Sydney Opera House Forecourt',
      'Circular Quay Ferry Wharf',
      'The Rocks Historic Lane',
      'Harbour Bridge Walk',
    ],
  },
};

/**
 * Deterministically generates a demographic persona and thought for a coordinate.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Object} options
 * @param {string} [options.city='atlanta'] - City key
 * @param {number} [options.seed=0] - Additional entropy seed
 * @param {boolean} [options.isRaining=false] - Whether precipitation is present
 * @param {boolean} [options.isJogger=false] - Force jogger speed profile
 * @returns {Object} Complete persona record
 */
export function generatePersona(lat, lon, options = {}) {
  const cityKey = (options.city || 'atlanta').toLowerCase();
  const city = resolveCity(cityKey);
  const dict = CITY_DICTIONARIES[city.id] || CITY_DICTIONARIES.atlanta;

  const baseHash = hashCoordinate(lat, lon, options.seed || 0);
  const prng = createPRNG(baseHash);

  const name = dict.names[Math.floor(prng() * dict.names.length)];
  const occupation =
    dict.occupations[Math.floor(prng() * dict.occupations.length)];
  const age = Math.floor(prng() * 48) + 20; // 20 to 68

  const vibe = VIBE_PROFILES[Math.floor(prng() * VIBE_PROFILES.length)];
  const destination =
    dict.destinations[Math.floor(prng() * dict.destinations.length)];

  const isRaining = Boolean(options.isRaining);
  const thoughtsPool = isRaining ? dict.rainThoughts : dict.thoughts;
  const thought = thoughtsPool[Math.floor(prng() * thoughtsPool.length)];

  // Kinematics: 85% walkers, 15% joggers unless forced
  const isJogger =
    options.isJogger !== undefined ? options.isJogger : prng() > 0.85;
  let speedMs;
  if (isJogger) {
    speedMs =
      JOGGER_SPEED_MIN_MS +
      prng() * (JOGGER_SPEED_MAX_MS - JOGGER_SPEED_MIN_MS);
  } else {
    speedMs =
      WALKER_SPEED_MIN_MS +
      prng() * (WALKER_SPEED_MAX_MS - WALKER_SPEED_MIN_MS);
  }

  // Rain speed boost: pedestrians walk ~15% faster to reach shelter
  if (isRaining) {
    speedMs *= 1.15;
  }

  const speedKmh = Number((speedMs * 3.6).toFixed(1));

  return {
    id: `ped_${baseHash.toString(16)}`,
    name,
    age,
    occupation,
    city: city.name,
    country: city.country,
    vibeId: vibe.id,
    vibeLabel: vibe.label,
    vibeIcon: vibe.icon,
    vibeColor: vibe.color,
    thought,
    destination,
    isRaining,
    isJogger,
    walkingSpeedMs: Number(speedMs.toFixed(2)),
    speedKmh,
    lat,
    lon,
    seed: options.seed || 0,
  };
}
