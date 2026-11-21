/**
 * Zero-Token Localized Monologues & Cultural Persona Generator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Implements deterministic Mulberry32 pseudo-random inner monologues
 * and regional persona synthesis grounded in local culture, geography,
 * dialect, and daily rhythms without external LLM token consumption.
 */

import { SETTLEMENT_TYPOLOGIES } from './localeClassifier.js';

/**
 * Deterministic Mulberry32 32-bit PRNG generator.
 */
export function createMulberry32(seed = 1337) {
  let s = Math.floor(Math.abs(seed)) || 1337;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hashes coordinate and temporal parameters into an integer seed.
 */
export function hashCoordinateSeed(
  lat = 0,
  lon = 0,
  typology = '',
  entityIndex = 0,
) {
  const str = `${lat.toFixed(4)}_${lon.toFixed(4)}_${typology}_${entityIndex}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1234567;
}

/**
 * Culturally grounded monologue dictionaries per settlement typology.
 */
export const LOCALE_THOUGHT_DICTIONARIES = Object.freeze({
  [SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER]: [
    "Checking the tide tables—low tide's at 3:15, won't get the skiff out till sunset.",
    'Shrimp harvest was strong yesterday; need another half-ton of crushed ice at the packing dock.',
    "Wind's picking up from the southeast; afternoon thunderstorm brewing off the sound.",
    'Heading over to Skippers for fried flounder and hushpuppies before the evening rush.',
    "Outrigger boom cables need greasing before tomorrow morning's 4 AM trawler run.",
    'Brown pelicans skimming the mudbanks in tight formation; menhaden must be schooling.',
    'Tabby ruins on Broad Street look peaceful under the live oaks and Spanish moss.',
    'Water taxi from Sapelo Island just docked at the municipal landing with the afternoon mail.',
    'Net mending on the stern deck goes faster when the breeze keeps the gnats down.',
    'High tide will cover the salt marsh grass right up to the pier pilings by five.',
  ],
  [SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION]: [
    'Need to pick up the elder care package at the tribal community complex this afternoon.',
    "Barbed wire's down on the north section line; gotta splice it before the yearlings wander.",
    "Wind's blowing steady out of the south at 25 mph; typical Oklahoma tallgrass afternoon.",
    'Practicing the stomp dance songs and rhythms for next weekend ceremonial gathering.',
    'McGirt tribal jurisdiction signs look clean along the county boundary line.',
    'Tribal elder transit van is coming down the section line to pick up grandmother for the clinic.',
    'Council oak tree has stood in this soil since the forced removal; always pause when passing.',
    'Checking the galvanized stock tank float valve; cattle will drink it dry in this dry heat.',
    'Red dirt dust plume down the caliche drive—looks like uncle pulling in with the horse trailer.',
    'Quarter horses grazing peaceful by the post oaks near the ceremonial grounds.',
  ],
  [SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL]: [
    "Moisture sensor's reading 18% on the south 40; couple more sunny days before combining.",
    'Checking the Chicago Board of Trade grain futures—December corn bumped up four cents.',
    'Hydraulic fitting blew on the tractor planter; hoping the dealer in town has the replacement.',
    'Weather radar shows rain moving in by Tuesday; need to get the winter wheat drilled.',
    "Combine hopper's almost full; radioing the 18-wheel grain hopper truck to pull up along the headland.",
    'Black Angus cattle herd is clustered under the cottonwoods chewing cud in the shade.',
    'Auger elevator belt needs tightening before the afternoon harvest loads start rolling in.',
    'Turn soil smells rich after that morning drizzle; field headlands are drying out nicely.',
    'Diesel tank on the service truck is topped off for a long evening in the furrows.',
    'Center-pivot irrigation circle is keeping the eastern parcel green despite the dry spell.',
  ],
  [SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK]: [
    'Front row on Millennium Force is worth every minute of this 45-minute wait.',
    'Lightning Lane window for Space Mountain opens at 2:15—gotta hustle across the central hub.',
    'Smell that fresh funnel cake, kettle corn, and cinnamon churros over by the carousel... lunch can wait!',
    'Feet are aching, but the kids promised they would stay awake for the night fireworks spectacle.',
    'Ride ops had to pause the top coaster because wind gusts over the lake hit 35 mph.',
    'Ring toss is definitely rigged, but look at the size of that giant plush shark!',
    'Remember we parked in Dragon Row 14; driver said the last parking tram runs 60 min after close.',
    'Checking the mobile wait times—the giga coaster line just dropped to 25 minutes!',
    'Calliope carousel organ waltz makes you feel like you stepped back into 1920.',
    'Track roar and echoing rider screams on that 80-degree vertical plunge never get old.',
  ],
  [SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT]: [
    'Lodge ski shuttle arrives in 5 minutes; gotta clip in before the morning peak lift rush.',
    'First tracks on the upper bowl after 10 inches of fresh dry champagne powder overnight.',
    'Gondola ride gives the most breathtaking panoramic view of the snow-covered pine valley.',
    'Hot spiced cider and raclette by the stone chalet fireplace after the final run.',
  ],
  [SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK]: [
    'Guide says the morning game drive rover departs at 6:00 AM sharp for the river crossing.',
    'Dust plume on the horizon—might be a pride of lions moving near the acacia grove.',
    'Pelicans and storks circling the waterhole while the zebras take turns drinking.',
    'Open-top rover suspension handled that rutted game trail surprisingly smoothly.',
  ],
  [SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER]: [
    "Kids' yellow school bus is turning the corner down Elm Street right on time.",
    'Rideshare driver is 3 minutes away in a silver hybrid crossover.',
    'Stopping by the local farmer market stand for fresh tomatoes on the way home.',
    'Checking the lawn sprinkler timers before the afternoon heat.',
  ],
  [SETTLEMENT_TYPOLOGIES.WILDERNESS_SANCTUARY]: [
    'Quiet forest canopy with only the sound of mountain wind and rustling aspen leaves.',
    'Crystal clear river water running cold over granite river stones.',
    'Red-tailed hawk soaring high on a warm thermal above the ridge.',
  ],
  [SETTLEMENT_TYPOLOGIES.DENSE_URBAN]: [
    'Catching the uptown express subway before the 9 AM morning standup.',
    'Grabbing a black cold brew and blueberry scone from the corner cart.',
    'Pedestrian signal countdown is at 8 seconds; brisk walk across the avenue.',
    'Towering glass facades reflecting the morning sun across the plaza.',
  ],
  [SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT]: [
    'Pictures up! Red warning bell is flashing outside Stage 14—holding all foot traffic in the backlot alley.',
    'Sound speed! Scene 42 Alpha, Take 7—A-camera rolling on the 50mm anamorphic prime.',
    'Flying the 12x12 bleached muslin diffusion silk and 18K HMI key light before golden hour fades.',
    'Resetting the Chapman Technocrane back to Mark 1; dolly grip is feathering the track stop.',
    'Running late to wardrobe fitting at the costume annex—period 1940s fedora and wool trench coat.',
    'Craft services just put out hot espresso and breakfast burritos behind the grip & electric truck.',
    'First AD called a 10-minute lighting turnaround; gaffer is swapping the scrim on the sky panel.',
    'Steadicam rig is balanced and ready for the single-take oner down the New York Street facade.',
    'Background extras holding at the basecamp honeywagon until the second AD calls us to set.',
    'Checking the wireless video village monitor—the backlight haze through the studio arch looks cinematic.',
  ],
  [SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX]: [
    'Smell that hickory smoke from the tailgate smokers—kickoff is in 90 minutes!',
    'Gates just opened; security turnstile lines are moving fast through the main plaza.',
    'Fourth quarter and we are driving down the field; crowd noise is hitting 112 decibels!',
    'Taking the transit platform express back home after an incredible double-overtime victory.',
    'Cornhole bags flying in the parking lot; everyone is in team colors under the canopies.',
    'Marching band drumline cadence reverberating through the concourse tunnels.',
    'Halftime concession run for hot pretzels, craft cider, and nachos before the second half kickoff.',
    'Upper deck view gives you the entire field plus the city downtown skyline in one frame.',
    'Student section has been on their feet chanting since pregame warmups.',
    'Postgame egress surge—thousands of fans streaming towards the rapid rail station.',
  ],
  [SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE]: [
    'Morning power-walkers completing their third lap in orthopedic sneakers on the polished marble.',
    "NorthPark duck pond: 'Look at the turtles sunning on the brick planter ledge while the mallards dive!'",
    "Warm Cinnabon & Auntie Anne's pretzel aroma wafting from around the corner... irresistible.",
    'Checking the new release cassette and CD wall at Sam Goody / Suncoast Motion Picture Co.',
    "Phipps Plaza: 'Heading past the marble colonnade to Saks for the autumn fragrance showcase.'",
    'Tossing a shiny penny into the central tiered fountain wishing well.',
    'Grabbing a table by the mezzanine railing with an Orange Julius and a steaming slice of Sbarro.',
    "Savannah Mall: 'Watching the nostalgic double-decker Venetian carousel turn under the glass atrium skylight.'",
    "Quaker Bridge: 'Picking up coffee before heading down the Route 1 corridor to Princeton.'",
    'Browsing the Sharper Image and Brookstone display floor testing the massage chairs.',
  ],
});

export const STADIUM_SPECIFIC_THOUGHTS = Object.freeze({
  gsu_summerhill: [
    'Hank Aaron Dr traffic is wild today—tailgating in the Green Lot is already hopping!',
    'Centennial Olympic history everywhere you look here in Summerhill; smell that smoked barbecue!',
    'Panther Express gameday shuttle just dropped off another big wave of fans from downtown.',
    'Summerhill neighborhood has completely revitalized around Center Parc Stadium!',
    'Grilling out with cornhole boards set up behind the pickup truck before kickoff.',
    'Blue Lot tailgate canopy is up; marching band brass section just started practicing.',
  ],
  gsu_convocation_center: [
    "Convocation Center looks incredible under the lights along Capitol Ave for tonight's basketball matchup.",
    'Urban arena concourse buzzing; Panthers student section filling the lower bowl.',
    'Fulton Street crosswalk is packed with fans heading from Summerhill to the arena.',
    'Alley-oop dunk got the entire Convocation Center crowd on their feet!',
  ],
  mercedes_benz_stadium: [
    'Riding the Blue Line straight to GWCC/Dome station; elevated pedestrian bridge is packed red and black!',
    'Home Depot Backyard tailgates are rocking; that giant falcon statue is lit up.',
    'State Farm Arena concourse is buzzing before Hawks tip-off.',
    'Roof petal camera just opened up; sunset over the downtown Atlanta skyline looks unbelievable.',
    'Halo board 360-degree replay looked incredible from the 200 level.',
  ],
  georgia_tech_bobby_dodd: [
    "Ramblin' Wreck leading the team parade down Techwood Drive right now!",
    'Bobby Dodd Way tailgates under the Midtown Atlanta skyscrapers never get old.',
    'Steam whistle just blew across campus—time to pack into Historic Grant Field!',
    'MARTA North Avenue station is going to be packed yellow and navy after the 4th quarter.',
    'Up 14 at the half—fight song echoing off the Tech Tower.',
  ],
  state_farm_stadium_glendale: [
    'Great Lawn tailgate in Glendale is sprawling across 8 acres—smokers, canopy tents, and cornhole everywhere!',
    'Loop 101 traffic is backing up near Cardinals Way, glad we arrived early for the pregame.',
    'Westgate Entertainment District patios are packed with red and white jerseys.',
    'Roll-out natural grass field tray is getting prepped under the desert sun.',
  ],
  footprint_center_phoenix: [
    'Taking Valley Metro Light Rail straight to 3rd & Jefferson for the Suns game!',
    'Chase Field retractable roof is open tonight—desert breeze feels great.',
    'Copper Square sports lounges are spilling out onto the sidewalks.',
    'Downtown Phoenix arena energy is electric after that clutch three-pointer!',
  ],
  asu_tempe_stadium: [
    "Sun Devils pregame under 'A' Mountain—College Ave and Mill Ave are alive with maroon and gold!",
    'Light rail from Veterans Way station is running every 8 minutes packed with students.',
    'Desert Financial Arena floor is shaking after that alley-oop dunk!',
    'Valley heat is cooling down just in time for the 7 PM kickoff.',
  ],
  madison_square_garden: [
    'Stepping right off the Long Island Rail Road into Chase Square at the Garden.',
    'Knicks defense chants echoing down 7th Avenue all the way to 34th Street!',
    'MSG ceiling lights looking iconic for tonight playoff atmosphere.',
  ],
  hard_rock_stadium_miami: [
    'Canopy shade keeping the stadium breeze cool; smell the Cuban sandwiches in the orange lot!',
    'F1 Miami Grand Prix paddock garages look unbelievable next to the south gate.',
  ],
});

/**
 * Regional persona demographic profiles per typology.
 */
export const LOCALE_PERSONA_PROFILES = Object.freeze({
  [SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER]: [
    {
      name: 'Captain Lamar McIntosh',
      role: 'Commercial Shrimper',
      outfit: 'White rubber shrimping boots, oilskin apron & salt-stained cap',
      vibeColor: '#38bdf8',
    },
    {
      name: 'Miss Sadie Lowther',
      role: 'Fish House Packer',
      outfit: 'High-vis mesh vest, heavy gloves & insulated boots',
      vibeColor: '#22d3ee',
    },
    {
      name: 'Ezekiel Singleton',
      role: 'DNR Marine Patrol Officer',
      outfit: 'Navy DNR uniform, badge & polarized sunglasses',
      vibeColor: '#0284c7',
    },
    {
      name: 'Clara Deloach',
      role: 'Historic Tabby Historian',
      outfit: 'Linen sunshirt, canvas field tote & binoculars',
      vibeColor: '#34d399',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION]: [
    {
      name: 'Thomas Checote',
      role: 'Tribal Council Liaison',
      outfit: 'Denim pearl-snap shirt, silver buckle & beaded bolo tie',
      vibeColor: '#f97316',
    },
    {
      name: 'Grandmother Evelyn Tiger',
      role: 'Elder & Weaver',
      outfit:
        'Traditional ribbon coat, turquoise necklace & comfortable moccasins',
      vibeColor: '#ec4899',
    },
    {
      name: 'Jesse Harjo',
      role: 'Tribal Lighthorse Officer',
      outfit: 'Tactical patrol uniform, patch badge & utility belt',
      vibeColor: '#06b6d4',
    },
    {
      name: 'Micah Fife',
      role: 'Ranch Hand & Horse Trainer',
      outfit: 'Worn leather chaps, work boots & Stetson hat',
      vibeColor: '#eab308',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL]: [
    {
      name: 'Dwight Hagedorn',
      role: 'Grain & Livestock Farmer',
      outfit: 'Denim overalls, flannel shirt & John Deere ballcap',
      vibeColor: '#84cc16',
    },
    {
      name: 'Sarah Lindquist',
      role: 'Agronomist & Soil Specialist',
      outfit: 'Field khakis, moisture probe holster & composite work boots',
      vibeColor: '#10b981',
    },
    {
      name: 'Calvin Miller',
      role: 'Combine Harvester Operator',
      outfit: 'Hi-vis safety t-shirt, ear defenders & grease-stained jeans',
      vibeColor: '#f59e0b',
    },
    {
      name: 'Wayne Peterson',
      role: 'Grain Hopper Truck Driver',
      outfit: 'Western denim jacket, radio headset & steel-toe boots',
      vibeColor: '#6366f1',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK]: [
    {
      name: 'Braden & Family',
      role: 'Thrill Park Guests',
      outfit: 'Coaster tour t-shirt, lanyard pass & roller sneakers',
      vibeColor: '#f43f5e',
    },
    {
      name: 'Chloe Jenkins',
      role: 'Lead Coaster Ride Operator',
      outfit: 'Color-coded park polo, dispatch whistle & safety harness key',
      vibeColor: '#a855f7',
    },
    {
      name: 'Mateo & Sofia',
      role: 'Arcade Prize Champions',
      outfit: 'Summer shorts, Mickey ears & oversized plush shark',
      vibeColor: '#3b82f6',
    },
    {
      name: 'Arthur Pendelton',
      role: 'Carousel Master',
      outfit: 'Vintage brass-buttoned vest, bowtie & calliope tuning wrench',
      vibeColor: '#d97706',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT]: [
    {
      name: 'Hans Meier',
      role: 'Ski Patrol Guide',
      outfit: 'Red Gore-Tex shell with white cross & helmet',
      vibeColor: '#ef4444',
    },
    {
      name: 'Elena Vane',
      role: 'Lodge Shuttle Driver',
      outfit: 'Heavy fleece jacket, insulated gloves & snow boots',
      vibeColor: '#06b6d4',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.SAFARI_WILDLIFE_PARK]: [
    {
      name: 'Kiprotich Sang',
      role: 'Head Safari Guide',
      outfit: 'Khaki field uniform, bush hat & binoculars',
      vibeColor: '#d97706',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.SUBURBAN_COMMUTER]: [
    {
      name: 'Dave Morrison',
      role: 'Neighborhood Resident',
      outfit: 'Casual hoodie, running shoes & dog leash',
      vibeColor: '#64748b',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.WILDERNESS_SANCTUARY]: [
    {
      name: 'Ranger Morgan Vance',
      role: 'Park Ranger',
      outfit: 'Forest green ranger uniform & field hat',
      vibeColor: '#059669',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.DENSE_URBAN]: [
    {
      name: 'Marcus Chen',
      role: 'Software Architect',
      outfit: 'Tailored blazer, wireless earbuds & sleek backpack',
      vibeColor: '#06b6d4',
    },
    {
      name: 'Elena Rostova',
      role: 'Urban Flâneuse',
      outfit: 'Trench coat, dark sunglasses & leather shoulder bag',
      vibeColor: '#8b5cf6',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT]: [
    {
      name: 'Jordan Sterling',
      role: 'First Assistant Director (1st AD)',
      outfit: 'Production headset, call sheet clipboard & utility vest',
      vibeColor: '#f59e0b',
    },
    {
      name: 'Elena Vance, SOC',
      role: 'Steadicam & Dolly Camera Operator',
      outfit: 'Carbon-fiber iso-elastic Steadicam vest & wireless follow-focus',
      vibeColor: '#eab308',
    },
    {
      name: 'Dante Morales',
      role: 'Key Grip & Lighting Gaffer',
      outfit: 'Leather rigger gloves, C-stand wrench belt & light meter',
      vibeColor: '#38bdf8',
    },
    {
      name: 'Vivian Mercer',
      role: 'Costumed Feature Extra',
      outfit: '1940s period cinema wardrobe, production badge & script sides',
      vibeColor: '#ec4899',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX]: [
    {
      name: 'Big Mike Sterling',
      role: 'Tailgate Grillmaster',
      outfit: 'Team gameday jersey, canvas apron, grill tongs & canopy flag',
      vibeColor: '#f97316',
    },
    {
      name: 'DeShawn & Marcus',
      role: 'Panther Marching Band Boosters',
      outfit: 'Royal blue team windbreakers & brass section spirit gear',
      vibeColor: '#0039A6',
    },
    {
      name: 'Sarah Vance',
      role: 'Yellow Jackets Student Section Leader',
      outfit: 'Tech gold stripes, navy overalls & gameday face paint',
      vibeColor: '#B3A369',
    },
    {
      name: 'Carlos Mendez',
      role: 'Red Sea Cardinals Season Ticket Holder',
      outfit: 'Cardinal red #1 jersey, desert sun visor & folding chair',
      vibeColor: '#97233F',
    },
    {
      name: 'Maya Rodriguez',
      role: 'Phoenix Suns Sixth Man Fan',
      outfit: 'Classic purple & orange sunburst jersey & snapback cap',
      vibeColor: '#E56020',
    },
    {
      name: 'Tyler & Jordan',
      role: 'ASU Sun Devils The Inferno Section',
      outfit: 'Maroon & gold tees, sunglasses & foam pitchfork',
      vibeColor: '#8C1D40',
    },
  ],
  [SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE]: [
    {
      name: 'Evelyn Sterling',
      role: 'Morning Promenade Power-Walker',
      outfit: 'Pastel track jacket, orthopedic walking sneakers & pedometer',
      vibeColor: '#ec4899',
    },
    {
      name: 'Tyler & Dylan',
      role: 'Food Court & Arcade Regulars',
      outfit: 'Graphic tees, baggy jeans & arcade token cups',
      vibeColor: '#38bdf8',
    },
    {
      name: 'Victoria Vance',
      role: 'Luxury Boutique Fashion Concierge',
      outfit: 'Cashmere coat, designer sunglasses & Saks boutique tote',
      vibeColor: '#eab308',
    },
    {
      name: 'Marcus Nasher',
      role: 'CenterPark Modern Art Connoisseur',
      outfit: 'Linen button-down, tortoiseshell spectacles & sketchbook',
      vibeColor: '#10b981',
    },
  ],
});

/**
 * Generates a localized persona and inner monologue for an entity.
 */
export function generateLocalePersona({
  lat = 31.3702,
  lon = -81.434,
  typology = SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
  entityIndex = 0,
  speedMs = 0.45,
  venueId = null,
} = {}) {
  const seed = hashCoordinateSeed(lat, lon, typology, entityIndex);
  const rand = createMulberry32(seed);

  // Pick persona profile
  const profiles =
    LOCALE_PERSONA_PROFILES[typology] ||
    LOCALE_PERSONA_PROFILES[SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL];
  const profileIdx = Math.floor(rand() * profiles.length);
  const profile = profiles[profileIdx] || profiles[0];

  // Pick localized thought (favoring venue-specific thoughts if venueId matches)
  const venueThoughts = venueId ? STADIUM_SPECIFIC_THOUGHTS[venueId] : null;
  const thoughts =
    venueThoughts ||
    LOCALE_THOUGHT_DICTIONARIES[typology] ||
    LOCALE_THOUGHT_DICTIONARIES[SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL];
  const thoughtIdx = Math.floor(rand() * thoughts.length);
  const thoughtText = thoughts[thoughtIdx] || thoughts[0];

  const speedKmh = (speedMs * 3.6).toFixed(1);

  return {
    name: profile.name,
    occupation: profile.role,
    outfit: profile.outfit,
    vibeColor: profile.vibeColor,
    thought: thoughtText,
    speedMs,
    speedKmh,
    typology,
    seed,
  };
}
