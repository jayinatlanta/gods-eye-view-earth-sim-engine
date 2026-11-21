/**
 * Venue Landmark Geometries & Archetype Catalog for Living World Gameday Sim.
 * (Living World Sim: Stadium & Arena Gameday Spectacles)
 *
 * Curates geofenced boundaries, turnstile entrance gates, dedicated tailgate surfaces,
 * transit connections, and road congestion nodes for premier sports venues:
 *   - Atlanta:
 *       1. GSU Summerhill — Center Parc Stadium (Historic Centennial Olympic / Turner Field)
 *       2. GSU Convocation Center (Collegiate Basketball Arena at Capitol & Fulton)
 *       3. Mercedes-Benz Stadium & State Farm Arena (Downtown Atlanta Dome & Hawks Arena)
 *       4. Georgia Tech — Bobby Dodd Stadium at Historic Grant Field & McCamish Pavilion
 *   - Phoenix:
 *       1. State Farm Stadium (Glendale / Cardinals & Fiesta Bowl Great Lawn)
 *       2. Footprint Center & Chase Field (Downtown Phoenix Suns & D-backs)
 *       3. ASU Mountain America Stadium & Desert Financial Arena (Tempe Sun Devils & 'A' Mountain)
 *   - Tier-1 National Exemplars:
 *       1. Madison Square Garden & Penn Station (NYC)
 *       2. Hard Rock Stadium & Miami International Autodrome (Miami)
 */

export const STADIUM_ARCHETYPES = Object.freeze({
  PRO_FOOTBALL_OPEN: 'pro_football_open',
  PRO_DOME: 'pro_dome',
  PRO_ARENA: 'pro_arena',
  COLLEGE_FOOTBALL_HISTORIC: 'college_football_historic',
  COLLEGE_URBAN_ARENA: 'college_urban_arena',
  PRO_BALLPARK: 'pro_ballpark',
});

export const STADIUM_VENUES = Object.freeze({
  gsu_summerhill: {
    id: 'gsu_summerhill',
    name: 'GSU Summerhill — Center Parc Stadium (Football)',
    shortName: 'GSU Summerhill (Center Parc)',
    region: 'Summerhill, Atlanta, GA',
    metro: 'atlanta',
    lat: 33.7353,
    lon: -84.3894,
    elev: 300,
    defaultAlt: 180,
    headingDeg: 0,
    pitchDeg: -28,
    archetype: STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC,
    icon: '🏈',
    homeTeam: 'Georgia State Panthers',
    teamColors: {
      primary: '#0039A6', // GSU Royal Blue
      secondary: '#FFFFFF',
      accent: '#C8102E', // Panther Red
    },
    stadiumCapacity: 25000,
    historicNote:
      'Historic 1996 Olympic Centennial Stadium / former Atlanta Braves Turner Field site in Summerhill.',
    turnstiles: [
      {
        id: 'gsu_gate_a_hank_aaron',
        name: 'Gate A (Hank Aaron Drive Turnstiles)',
        lat: 33.736,
        lon: -84.3878,
        elev: 300,
      },
      {
        id: 'gsu_gate_b_fulton',
        name: 'Gate B (Fulton St Plaza Entry)',
        lat: 33.737,
        lon: -84.3894,
        elev: 300,
      },
      {
        id: 'gsu_gate_c_capitol',
        name: 'Gate C (Capitol Ave West Gate)',
        lat: 33.735,
        lon: -84.391,
        elev: 300,
      },
    ],
    tailgateLots: [
      {
        id: 'summerhill_green_lot',
        name: 'Green Lot (North Tailgate Lawn)',
        centerLat: 33.7368,
        centerLon: -84.3908,
        radiusMeters: 75,
        canopies: 32,
        grills: 16,
      },
      {
        id: 'summerhill_blue_lot',
        name: 'Blue Lot (South Surface Parking)',
        centerLat: 33.7342,
        centerLon: -84.3872,
        radiusMeters: 65,
        canopies: 24,
        grills: 12,
      },
      {
        id: 'summerhill_gold_lot',
        name: 'Gold Lot (Hank Aaron Dr Tailgate)',
        centerLat: 33.7375,
        centerLon: -84.3882,
        radiusMeters: 55,
        canopies: 20,
        grills: 10,
      },
    ],
    ingressCorridors: [
      {
        id: 'gsu_ingress_fulton',
        name: 'Fulton St Fan Walk',
        origin: { lat: 33.739, lon: -84.3894 },
        turnstileTarget: { lat: 33.737, lon: -84.3894 },
        widthMeters: 14.0,
      },
      {
        id: 'gsu_ingress_hank_aaron',
        name: 'Hank Aaron Dr Ingress',
        origin: { lat: 33.7335, lon: -84.3875 },
        turnstileTarget: { lat: 33.736, lon: -84.3878 },
        widthMeters: 12.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Georgia State MARTA Station',
        line: 'marta_blue',
        distanceMeters: 1800,
        shuttleRoute: 'GSU Panther Express Gameday Shuttle',
      },
    ],
    congestionRoads: [
      { street: 'Hank Aaron Dr SE', lat: 33.7355, lon: -84.3875 },
      { street: 'Capitol Ave SE', lat: 33.736, lon: -84.391 },
      { street: 'Fulton St SE', lat: 33.738, lon: -84.3895 },
    ],
  },

  gsu_convocation_center: {
    id: 'gsu_convocation_center',
    name: 'GSU Convocation Center (Basketball & Arena Events)',
    shortName: 'GSU Convocation Center',
    region: 'Summerhill / Downtown, Atlanta, GA',
    metro: 'atlanta',
    lat: 33.7431,
    lon: -84.3876,
    elev: 305,
    defaultAlt: 140,
    headingDeg: 340,
    pitchDeg: -25,
    archetype: STADIUM_ARCHETYPES.COLLEGE_URBAN_ARENA,
    icon: '🏀',
    homeTeam: 'Georgia State Panthers',
    teamColors: {
      primary: '#0039A6',
      secondary: '#FFFFFF',
      accent: '#C8102E',
    },
    stadiumCapacity: 8000,
    historicNote:
      'Modern multi-purpose arena at Capitol Ave & Fulton St hosting NCAA Division I Panthers basketball.',
    turnstiles: [
      {
        id: 'convo_gate_main_capitol',
        name: 'Capitol Ave Main Glass Atrium',
        lat: 33.7433,
        lon: -84.3875,
        elev: 305,
      },
      {
        id: 'convo_gate_fulton_plaza',
        name: 'Fulton St Plaza Entry',
        lat: 33.7428,
        lon: -84.3878,
        elev: 305,
      },
    ],
    tailgateLots: [
      {
        id: 'convo_deck_plaza',
        name: 'Capitol Deck & Urban Plaza Meetup',
        centerLat: 33.7435,
        centerLon: -84.3885,
        radiusMeters: 45,
        canopies: 14,
        grills: 6,
      },
    ],
    ingressCorridors: [
      {
        id: 'convo_ingress_capitol',
        name: 'Capitol Ave Urban Promenade',
        origin: { lat: 33.745, lon: -84.3876 },
        turnstileTarget: { lat: 33.7433, lon: -84.3875 },
        widthMeters: 10.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Georgia State MARTA Station',
        line: 'marta_blue',
        distanceMeters: 1000,
        shuttleRoute: 'Capitol Ave Gameday Transit',
      },
    ],
    congestionRoads: [
      { street: 'Capitol Ave SE', lat: 33.743, lon: -84.3876 },
      { street: 'Fulton St SE', lat: 33.742, lon: -84.388 },
    ],
  },

  mercedes_benz_stadium: {
    id: 'mercedes_benz_stadium',
    name: 'Mercedes-Benz Stadium & State Farm Arena',
    shortName: 'Mercedes-Benz Stadium',
    region: 'Downtown Atlanta, GA',
    metro: 'atlanta',
    lat: 33.7553,
    lon: -84.4008,
    elev: 310,
    defaultAlt: 220,
    headingDeg: 55,
    pitchDeg: -30,
    archetype: STADIUM_ARCHETYPES.PRO_DOME,
    icon: '🏟️',
    homeTeam: 'Atlanta Falcons & Atlanta United',
    teamColors: {
      primary: '#A71930', // Falcons Red
      secondary: '#000000', // Black
      accent: '#80000A', // Dark Maroon
    },
    stadiumCapacity: 75000,
    historicNote:
      'Architectural marvel featuring retractable pinwheel petal roof and 360-degree halo video board.',
    turnstiles: [
      {
        id: 'mbs_gate_1_north',
        name: 'Gate 1 (North Concourse Plaza)',
        lat: 33.757,
        lon: -84.4012,
        elev: 310,
      },
      {
        id: 'mbs_gate_2_marta',
        name: 'Gate 2 (GWCC/MARTA Elevated Bridge)',
        lat: 33.7565,
        lon: -84.3995,
        elev: 315,
      },
      {
        id: 'mbs_gate_3_backyard',
        name: 'Gate 3 (The Home Depot Backyard Plaza)',
        lat: 33.7548,
        lon: -84.4022,
        elev: 310,
      },
      {
        id: 'mbs_gate_4_mlk',
        name: 'Gate 4 (MLK Jr Dr Concourse)',
        lat: 33.7538,
        lon: -84.4005,
        elev: 310,
      },
    ],
    tailgateLots: [
      {
        id: 'mbs_home_depot_backyard',
        name: 'The Home Depot Backyard (11-Acre Tailgate)',
        centerLat: 33.7565,
        centerLon: -84.402,
        radiusMeters: 80,
        canopies: 38,
        grills: 18,
      },
      {
        id: 'mbs_gulch_lot',
        name: 'The Gulch / Centennial Yard Lots',
        centerLat: 33.754,
        centerLon: -84.396,
        radiusMeters: 70,
        canopies: 30,
        grills: 14,
      },
    ],
    ingressCorridors: [
      {
        id: 'mbs_ingress_gwcc_marta',
        name: 'GWCC / Mercedes-Benz Elevated MARTA Bridge',
        origin: { lat: 33.758, lon: -84.3975 },
        turnstileTarget: { lat: 33.7565, lon: -84.3995 },
        widthMeters: 16.0,
      },
      {
        id: 'mbs_ingress_backyard',
        name: 'Home Depot Backyard Fan Ingress',
        origin: { lat: 33.7575, lon: -84.4035 },
        turnstileTarget: { lat: 33.7548, lon: -84.4022 },
        widthMeters: 14.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'GWCC / Mercedes-Benz Dome MARTA Station',
        line: 'marta_blue',
        lat: 33.758,
        lon: -84.3975,
        distanceMeters: 120,
        elevatedPlaza: true,
      },
      {
        stationName: 'Vine City MARTA Station',
        line: 'marta_blue',
        lat: 33.7565,
        lon: -84.4042,
        distanceMeters: 220,
      },
    ],
    congestionRoads: [
      { street: 'Northside Dr NW', lat: 33.756, lon: -84.403 },
      { street: 'MLK Jr Dr SW', lat: 33.7535, lon: -84.4005 },
      { street: 'Centennial Olympic Park Dr NW', lat: 33.7575, lon: -84.396 },
    ],
  },

  georgia_tech_bobby_dodd: {
    id: 'georgia_tech_bobby_dodd',
    name: 'Georgia Tech — Bobby Dodd Stadium at Historic Grant Field',
    shortName: 'Georgia Tech (Bobby Dodd)',
    region: 'Midtown Atlanta, GA',
    metro: 'atlanta',
    lat: 33.7724,
    lon: -84.3928,
    elev: 285,
    defaultAlt: 160,
    headingDeg: 120,
    pitchDeg: -26,
    archetype: STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC,
    icon: '🐝',
    homeTeam: 'Georgia Tech Yellow Jackets',
    teamColors: {
      primary: '#B3A369', // Tech Gold
      secondary: '#003057', // Navy Blue
      accent: '#FFFFFF',
    },
    stadiumCapacity: 55000,
    historicNote:
      'Continuous FBS college football since 1913, framed by Midtown skyscrapers; adjacent to McCamish Pavilion basketball.',
    turnstiles: [
      {
        id: 'gt_gate_callaway_plaza',
        name: 'Callaway Plaza North Gate',
        lat: 33.7738,
        lon: -84.3928,
        elev: 285,
      },
      {
        id: 'gt_gate_techwood',
        name: 'Techwood Drive Student Turnstiles',
        lat: 33.7724,
        lon: -84.3916,
        elev: 285,
      },
      {
        id: 'gt_gate_bobby_dodd_way',
        name: 'Bobby Dodd Way South Gate',
        lat: 33.7712,
        lon: -84.3928,
        elev: 285,
      },
    ],
    tailgateLots: [
      {
        id: 'gt_techwood_lawn',
        name: 'Techwood Dr & Bobby Dodd Way Tailgates',
        centerLat: 33.7735,
        centerLon: -84.3915,
        radiusMeters: 60,
        canopies: 26,
        grills: 14,
      },
      {
        id: 'gt_peters_deck',
        name: 'Peters Parking Deck & Fowler St Plaza',
        centerLat: 33.7745,
        centerLon: -84.394,
        radiusMeters: 50,
        canopies: 20,
        grills: 8,
      },
    ],
    ingressCorridors: [
      {
        id: 'gt_ingress_techwood',
        name: 'Techwood Drive Student Walk-Up',
        origin: { lat: 33.7765, lon: -84.3915 },
        turnstileTarget: { lat: 33.7738, lon: -84.3928 },
        widthMeters: 12.0,
      },
      {
        id: 'gt_ingress_north_ave_marta',
        name: 'North Ave MARTA to Bobby Dodd Walk',
        origin: { lat: 33.7717, lon: -84.387 },
        turnstileTarget: { lat: 33.7712, lon: -84.3928 },
        widthMeters: 10.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'North Avenue MARTA Station',
        line: 'marta_red',
        lat: 33.7717,
        lon: -84.387,
        distanceMeters: 480,
        pedestrianRoute: 'North Ave west to Techwood Dr',
      },
    ],
    congestionRoads: [
      { street: 'Techwood Dr NW', lat: 33.773, lon: -84.3915 },
      { street: 'North Ave NW', lat: 33.771, lon: -84.3925 },
      { street: 'Fowler St NW', lat: 33.775, lon: -84.3935 },
    ],
  },

  state_farm_stadium_glendale: {
    id: 'state_farm_stadium_glendale',
    name: 'State Farm Stadium (Glendale / Cardinals)',
    shortName: 'State Farm Stadium (Glendale)',
    region: 'Glendale, Phoenix Metro, AZ',
    metro: 'phoenix',
    lat: 33.5276,
    lon: -112.2626,
    elev: 320,
    defaultAlt: 240,
    headingDeg: 180,
    pitchDeg: -32,
    archetype: STADIUM_ARCHETYPES.PRO_DOME,
    icon: '🌵',
    homeTeam: 'Arizona Cardinals',
    teamColors: {
      primary: '#97233F', // Cardinal Red
      secondary: '#FFFFFF',
      accent: '#FFB612', // Gold
    },
    stadiumCapacity: 68000,
    historicNote:
      'Home to the Arizona Cardinals & Fiesta Bowl with iconic roll-out natural grass field tray and the Great Lawn.',
    turnstiles: [
      {
        id: 'cardinals_gate_1_north',
        name: 'Gate 1 (Great Lawn North Pavilion)',
        lat: 33.5292,
        lon: -112.2626,
        elev: 320,
      },
      {
        id: 'cardinals_gate_2_east',
        name: 'Gate 2 (91st Ave East Plaza)',
        lat: 33.5276,
        lon: -112.2608,
        elev: 320,
      },
      {
        id: 'cardinals_gate_3_south',
        name: 'Gate 3 (Cardinals Way South Plaza)',
        lat: 33.5258,
        lon: -112.2626,
        elev: 320,
      },
    ],
    tailgateLots: [
      {
        id: 'glendale_great_lawn',
        name: 'The Great Lawn (8-Acre Tailgate & Live Stage)',
        centerLat: 33.5305,
        centerLon: -112.2626,
        radiusMeters: 110,
        canopies: 55,
        grills: 28,
      },
      {
        id: 'glendale_westgate_lots',
        name: 'Westgate Entertainment District Surface Lots',
        centerLat: 33.533,
        centerLon: -112.2605,
        radiusMeters: 80,
        canopies: 35,
        grills: 16,
      },
    ],
    ingressCorridors: [
      {
        id: 'glendale_ingress_great_lawn',
        name: 'Great Lawn Central Promenade',
        origin: { lat: 33.533, lon: -112.2626 },
        turnstileTarget: { lat: 33.5292, lon: -112.2626 },
        widthMeters: 18.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Westgate Park & Ride Express Bus',
        line: 'bus_express',
        distanceMeters: 600,
      },
    ],
    congestionRoads: [
      { street: 'Loop 101 (Agua Fria Fwy)', lat: 33.529, lon: -112.26 },
      { street: 'Cardinals Way', lat: 33.525, lon: -112.263 },
      { street: '91st Ave', lat: 33.5275, lon: -112.256 },
    ],
  },

  footprint_center_phoenix: {
    id: 'footprint_center_phoenix',
    name: 'Footprint Center & Chase Field',
    shortName: 'Footprint Center (Phoenix)',
    region: 'Downtown Phoenix, AZ',
    metro: 'phoenix',
    lat: 33.4457,
    lon: -112.0712,
    elev: 330,
    defaultAlt: 160,
    headingDeg: 45,
    pitchDeg: -28,
    archetype: STADIUM_ARCHETYPES.PRO_ARENA,
    icon: '☀️',
    homeTeam: 'Phoenix Suns & Arizona Diamondbacks',
    teamColors: {
      primary: '#1D1160', // Suns Purple
      secondary: '#E56020', // Suns Orange
      accent: '#63727A',
    },
    stadiumCapacity: 18000,
    historicNote:
      'Downtown Phoenix sports nexus featuring Footprint Center arena and adjacent Chase Field ballpark.',
    turnstiles: [
      {
        id: 'suns_pavilion_plaza',
        name: 'Footprint Center Pavilion (1st & Jefferson)',
        lat: 33.446,
        lon: -112.0712,
        elev: 330,
      },
      {
        id: 'chase_field_rotunda',
        name: 'Chase Field Main Rotunda (4th & Jefferson)',
        lat: 33.4455,
        lon: -112.067,
        elev: 330,
      },
    ],
    tailgateLots: [
      {
        id: 'phoenix_copper_square',
        name: 'Jefferson Street Fan Plazas & Patios',
        centerLat: 33.4462,
        centerLon: -112.069,
        radiusMeters: 50,
        canopies: 18,
        grills: 8,
      },
    ],
    ingressCorridors: [
      {
        id: 'phx_ingress_light_rail',
        name: '3rd St / Jefferson Light Rail Corridor',
        origin: { lat: 33.4465, lon: -112.0695 },
        turnstileTarget: { lat: 33.446, lon: -112.0712 },
        widthMeters: 12.0,
      },
    ],
    transitConnections: [
      {
        stationName: '3rd St / Jefferson Valley Metro Light Rail',
        line: 'phoenix_valley_metro',
        lat: 33.4465,
        lon: -112.0695,
        distanceMeters: 80,
        directPlatform: true,
      },
      {
        stationName: '3rd St / Washington Valley Metro Light Rail',
        line: 'phoenix_valley_metro',
        lat: 33.448,
        lon: -112.0695,
        distanceMeters: 180,
      },
    ],
    congestionRoads: [
      { street: 'E Jefferson St', lat: 33.446, lon: -112.071 },
      { street: 'S 1st St', lat: 33.445, lon: -112.072 },
      { street: 'S 3rd St', lat: 33.446, lon: -112.069 },
    ],
  },

  asu_tempe_stadium: {
    id: 'asu_tempe_stadium',
    name: 'ASU Mountain America Stadium & Desert Financial Arena',
    shortName: 'ASU Sun Devils (Tempe)',
    region: 'Tempe, Phoenix Metro, AZ',
    metro: 'phoenix',
    lat: 33.4264,
    lon: -111.9326,
    elev: 355,
    defaultAlt: 175,
    headingDeg: 200,
    pitchDeg: -27,
    archetype: STADIUM_ARCHETYPES.COLLEGE_FOOTBALL_HISTORIC,
    icon: '🔱',
    homeTeam: 'Arizona State Sun Devils',
    teamColors: {
      primary: '#8C1D40', // Maroon
      secondary: '#FFC627', // Gold
      accent: '#000000',
    },
    stadiumCapacity: 53599,
    historicNote:
      'Carved dramatically between the twin rocky buttes of "A" Mountain (Tempe Butte) in Tempe.',
    turnstiles: [
      {
        id: 'asu_gate_carson_north',
        name: 'Carson Student-Athlete Plaza (North Gate)',
        lat: 33.4278,
        lon: -111.9326,
        elev: 355,
      },
      {
        id: 'asu_gate_tillman_tunnel',
        name: 'Tillman Tunnel Walkway',
        lat: 33.4264,
        lon: -111.9338,
        elev: 355,
      },
      {
        id: 'asu_gate_desert_financial',
        name: 'Desert Financial Arena Concourse Entry',
        lat: 33.4252,
        lon: -111.9315,
        elev: 355,
      },
    ],
    tailgateLots: [
      {
        id: 'asu_packard_drive_lot',
        name: 'Packard Drive & College Ave Promenade Lots',
        centerLat: 33.4282,
        centerLon: -111.934,
        radiusMeters: 70,
        canopies: 30,
        grills: 15,
      },
    ],
    ingressCorridors: [
      {
        id: 'asu_ingress_college_ave',
        name: 'College Ave / Veterans Way Light Rail Ingress',
        origin: { lat: 33.4285, lon: -111.935 },
        turnstileTarget: { lat: 33.4278, lon: -111.9326 },
        widthMeters: 14.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Veterans Way / College Ave Light Rail Station',
        line: 'phoenix_valley_metro',
        lat: 33.4285,
        lon: -111.935,
        distanceMeters: 280,
        pedestrianRoute: 'College Ave south to Stadium Plaza',
      },
    ],
    congestionRoads: [
      { street: 'Veterans Way', lat: 33.428, lon: -111.9335 },
      { street: 'E Rio Salado Pkwy', lat: 33.43, lon: -111.932 },
      { street: 'Mill Ave', lat: 33.426, lon: -111.94 },
    ],
  },

  madison_square_garden: {
    id: 'madison_square_garden',
    name: 'Madison Square Garden & Penn Station',
    shortName: 'Madison Square Garden (NYC)',
    region: 'New York City, NY',
    metro: 'nyc',
    lat: 40.7505,
    lon: -73.9934,
    elev: 15,
    defaultAlt: 180,
    headingDeg: 30,
    pitchDeg: -35,
    archetype: STADIUM_ARCHETYPES.PRO_ARENA,
    icon: '🗽',
    homeTeam: 'New York Knicks & New York Rangers',
    teamColors: {
      primary: '#006BB6', // Knicks Blue
      secondary: '#F58426', // Knicks Orange
      accent: '#002B5C',
    },
    stadiumCapacity: 19500,
    historicNote:
      "The World's Most Famous Arena, sitting directly above the bustling subterranean Pennsylvania Station rail hub.",
    turnstiles: [
      {
        id: 'msg_chase_square_7th',
        name: 'Chase Square (7th Ave Main Concourse)',
        lat: 40.7505,
        lon: -73.9918,
        elev: 15,
      },
      {
        id: 'msg_8th_ave_concourse',
        name: '8th Ave West Concourse Entry',
        lat: 40.7505,
        lon: -73.9948,
        elev: 15,
      },
    ],
    tailgateLots: [
      {
        id: 'msg_urban_sports_lounges',
        name: '31st–33rd St Urban Fan Gathering Corridors',
        centerLat: 40.7512,
        centerLon: -73.9928,
        radiusMeters: 45,
        canopies: 10,
        grills: 0,
      },
    ],
    ingressCorridors: [
      {
        id: 'msg_ingress_7th_ave',
        name: '7th Ave Pedestrian Surge Corridor',
        origin: { lat: 40.7485, lon: -73.9918 },
        turnstileTarget: { lat: 40.7505, lon: -73.9918 },
        widthMeters: 14.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Penn Station / 34th St Transit Hub',
        line: 'subway_amtrak_lirr_njt',
        distanceMeters: 0,
        directUnderground: true,
      },
    ],
    congestionRoads: [
      { street: '7th Ave', lat: 40.75, lon: -73.992 },
      { street: '8th Ave', lat: 40.751, lon: -73.9945 },
      { street: 'W 34th St', lat: 40.752, lon: -73.993 },
    ],
  },

  hard_rock_stadium_miami: {
    id: 'hard_rock_stadium_miami',
    name: 'Hard Rock Stadium & Miami International Autodrome',
    shortName: 'Hard Rock Stadium (Miami)',
    region: 'Miami Gardens, FL',
    metro: 'miami',
    lat: 25.958,
    lon: -80.2389,
    elev: 5,
    defaultAlt: 220,
    headingDeg: 90,
    pitchDeg: -28,
    archetype: STADIUM_ARCHETYPES.PRO_FOOTBALL_OPEN,
    icon: '🐬',
    homeTeam: 'Miami Dolphins',
    teamColors: {
      primary: '#008E97', // Aqua
      secondary: '#FC4C02', // Orange
      accent: '#005778',
    },
    stadiumCapacity: 65326,
    historicNote:
      'Home of the Miami Dolphins, Miami Hurricanes, and the Formula 1 Miami Grand Prix street circuit.',
    turnstiles: [
      {
        id: 'hrs_gate_1_north',
        name: 'Gate 1 (North Concourse Plaza)',
        lat: 25.96,
        lon: -80.2389,
        elev: 5,
      },
      {
        id: 'hrs_gate_2_south',
        name: 'Gate 2 (South Plaza & F1 Paddock)',
        lat: 25.956,
        lon: -80.2389,
        elev: 5,
      },
    ],
    tailgateLots: [
      {
        id: 'hrs_orange_surface_lots',
        name: 'Orange Surface Parking Ring (Tailgates)',
        centerLat: 25.959,
        centerLon: -80.2415,
        radiusMeters: 85,
        canopies: 40,
        grills: 20,
      },
    ],
    ingressCorridors: [
      {
        id: 'hrs_ingress_north',
        name: 'North Lot Fan Ingress Walkway',
        origin: { lat: 25.962, lon: -80.2389 },
        turnstileTarget: { lat: 25.96, lon: -80.2389 },
        widthMeters: 16.0,
      },
    ],
    transitConnections: [
      {
        stationName: 'Hard Rock Stadium Park & Ride Shuttles',
        line: 'bus_express',
        distanceMeters: 400,
      },
    ],
    congestionRoads: [
      { street: 'FL-817 / NW 27th Ave', lat: 25.958, lon: -80.243 },
      { street: 'Florida Turnpike Concourse', lat: 25.961, lon: -80.234 },
    ],
  },
});

/**
 * Returns a stadium venue by identifier.
 */
export function getStadiumById(stadiumId) {
  if (!stadiumId) return null;
  const key = String(stadiumId).toLowerCase().trim();
  return STADIUM_VENUES[key] || null;
}

/**
 * Returns all registered stadiums as an array.
 */
export function getAllStadiums() {
  return Object.values(STADIUM_VENUES);
}

/**
 * Returns stadiums belonging to a given metropolitan region.
 */
export function getStadiumsByMetro(metroId) {
  if (!metroId) return [];
  const m = String(metroId).toLowerCase().trim();
  return Object.values(STADIUM_VENUES).filter((s) => s.metro === m);
}

/**
 * Returns team colorways for a venue.
 */
export function getStadiumColorways(stadiumId) {
  const stadium = getStadiumById(stadiumId);
  return (
    stadium?.teamColors || {
      primary: '#0039A6',
      secondary: '#FFFFFF',
      accent: '#FFB612',
    }
  );
}

/**
 * Finds the nearest stadium to a given lat/lon coordinate within maxDistMeters.
 */
export function findNearbyStadium(lat, lon, maxDistMeters = 3500) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  let closest = null;
  let minDist = Number.POSITIVE_INFINITY;

  for (const stadium of Object.values(STADIUM_VENUES)) {
    // Equirectangular approximation for fast distance check
    const dLat = (stadium.lat - lat) * 111320;
    const dLon =
      (stadium.lon - lon) *
      111320 *
      Math.cos(((stadium.lat + lat) / 2) * (Math.PI / 180));
    const dist = Math.hypot(dLat, dLon);

    if (dist <= maxDistMeters && dist < minDist) {
      minDist = dist;
      closest = { stadium, distanceMeters: dist };
    }
  }

  return closest;
}
