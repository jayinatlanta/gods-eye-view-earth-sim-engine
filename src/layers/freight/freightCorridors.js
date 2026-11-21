/**
 * Transcontinental Freight & Quad-Modal Logistics Corridors Catalog for God's Eye View.
 * (Transcontinental Freight & Intermodal Logistics Sim)
 *
 * Implements:
 * - Curated transcontinental interstate highway corridors (I-40, I-55, I-65, I-75, I-85, I-95, I-16, I-10)
 * - Quad-modal global freight hubs (Air Cargo SuperHubs, Maritime Container Ports, Rail Intermodal Classification Yards)
 * - Authentic commercial cargo manifests (Weight lbs, Reefer Temps, Hazardous Tiers, Priority Logistics)
 * - High-density topological highway waypoints for continuous 18-wheeler vehicle simulation
 */

export const FREIGHT_HUB_TYPES = Object.freeze({
  AIR_CARGO_SUPERHUB: 'AIR_CARGO_SUPERHUB',
  MARITIME_CONTAINER_PORT: 'MARITIME_CONTAINER_PORT',
  RAIL_INTERMODAL_HUB: 'RAIL_INTERMODAL_HUB',
  DISTRIBUTION_CENTER: 'DISTRIBUTION_CENTER',
});

export const CARGO_TYPES = Object.freeze({
  PHARMACEUTICALS: 'PHARMACEUTICALS',
  PERISHABLE_REEFER: 'PERISHABLE_REEFER',
  INTERMODAL_CONTAINER: 'INTERMODAL_CONTAINER',
  AUTOMOTIVE_PARTS: 'AUTOMOTIVE_PARTS',
  AEROSPACE_EXPEDITE: 'AEROSPACE_EXPEDITE',
  CONSUMER_RETAIL: 'CONSUMER_RETAIL',
  HAZMAT_CHEMICALS: 'HAZMAT_CHEMICALS',
});

export const PRIORITY_TIERS = Object.freeze({
  CRITICAL_EXPEDITE: 'CRITICAL_EXPEDITE',
  HIGH_PRIORITY: 'HIGH_PRIORITY',
  STANDARD_FREIGHT: 'STANDARD_FREIGHT',
  BULK_INTERMODAL: 'BULK_INTERMODAL',
});

/**
 * Planetary Global Anchor Freight Hubs
 */
export const FREIGHT_HUBS = Object.freeze({
  memphis_kmem: {
    id: 'memphis_kmem',
    name: 'FedEx World Hub (KMEM)',
    city: 'Memphis',
    state: 'TN',
    type: FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB,
    lat: 35.0424,
    lon: -89.9767,
    elevationMeters: 104,
    description:
      'Busiest cargo airport in North America. Features nightly sorting banks, widebody freighters (B777F, MD-11F), apron scissor-lift high-loaders, and direct I-40/I-55 highway ramps.',
    primaryRunway: '36L/18R',
    capacityULDsPerHour: 1800,
  },
  louisville_ksdf: {
    id: 'louisville_ksdf',
    name: 'UPS Worldport (KSDF)',
    city: 'Louisville',
    state: 'KY',
    type: FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB,
    lat: 38.1744,
    lon: -85.736,
    elevationMeters: 152,
    description:
      '5.2 million sq ft automated sorting superhub handling 300+ daily cargo flights (B747-8F, A300-600F) directly feeding Midwest Interstate I-65.',
    primaryRunway: '17R/35L',
    capacityULDsPerHour: 2200,
  },
  cincinnati_kcvg: {
    id: 'cincinnati_kcvg',
    name: 'Amazon Air & DHL Americas Hub (KCVG)',
    city: 'Hebron / Cincinnati',
    state: 'KY/OH',
    type: FREIGHT_HUB_TYPES.AIR_CARGO_SUPERHUB,
    lat: 39.0461,
    lon: -84.6622,
    elevationMeters: 271,
    description:
      'Primary North American flight hub for Amazon Air and DHL Express Americas, connecting transcontinental freighters directly with I-71/I-75 trucking arteries.',
    primaryRunway: '18C/36C',
    capacityULDsPerHour: 1500,
  },
  savannah_port: {
    id: 'savannah_port',
    name: 'Port of Savannah (Garden City Terminal)',
    city: 'Savannah',
    state: 'GA',
    type: FREIGHT_HUB_TYPES.MARITIME_CONTAINER_PORT,
    lat: 32.1319,
    lon: -81.1444,
    elevationMeters: 12,
    description:
      'Largest single-terminal container facility in North America. STS gantry cranes hoist 20ft/40ft ISO containers from Post-Panamax ships directly onto drayage trailers and double-stack well cars.',
    berths: 9,
    craneCount: 36,
  },
  nola_port: {
    id: 'nola_port',
    name: 'Port of New Orleans (Napoleon Ave Terminal)',
    city: 'New Orleans',
    state: 'LA',
    type: FREIGHT_HUB_TYPES.MARITIME_CONTAINER_PORT,
    lat: 29.9197,
    lon: -90.1066,
    elevationMeters: 4,
    description:
      'Deep-water Mississippi River transshipment gateway linking ocean container vessels directly with Gulf Coast I-10 trucking and Class I river railheads.',
    berths: 4,
    craneCount: 6,
  },
  nynj_port: {
    id: 'nynj_port',
    name: 'Port of New York & New Jersey (Elizabeth Marine Terminal)',
    city: 'Elizabeth / Newark',
    state: 'NJ',
    type: FREIGHT_HUB_TYPES.MARITIME_CONTAINER_PORT,
    lat: 40.6698,
    lon: -74.156,
    elevationMeters: 5,
    description:
      'Eastern Seaboard premier maritime terminal feeding consumer goods and industrial machinery directly into the I-95 logistics corridor.',
    berths: 12,
    craneCount: 28,
  },
  lalb_port: {
    id: 'lalb_port',
    name: 'Port of Los Angeles / Long Beach (San Pedro Bay)',
    city: 'Los Angeles / Long Beach',
    state: 'CA',
    type: FREIGHT_HUB_TYPES.MARITIME_CONTAINER_PORT,
    lat: 33.7431,
    lon: -118.2673,
    elevationMeters: 3,
    description:
      'Transpacific container gateway handling over 18 million TEUs annually. Direct on-dock rail transfer to BNSF/UP and heavy trucking onto I-710/I-15.',
    berths: 22,
    craneCount: 72,
  },
  atlanta_inman: {
    id: 'atlanta_inman',
    name: 'Atlanta Inman Intermodal Classification Yard',
    city: 'Atlanta',
    state: 'GA',
    type: FREIGHT_HUB_TYPES.RAIL_INTERMODAL_HUB,
    lat: 33.7997,
    lon: -84.4403,
    elevationMeters: 298,
    description:
      'Norfolk Southern & CSX Southeastern intermodal cross-roads connecting double-stack rail container blocks directly with Southeast regional trucking fleets.',
    tracks: 28,
    storageTEU: 4500,
  },
  chicago_corwith: {
    id: 'chicago_corwith',
    name: 'Chicago Corwith Intermodal Yard (BNSF)',
    city: 'Chicago',
    state: 'IL',
    type: FREIGHT_HUB_TYPES.RAIL_INTERMODAL_HUB,
    lat: 41.8153,
    lon: -87.7122,
    elevationMeters: 182,
    description:
      'Historic Santa Fe/BNSF transcontinental intermodal terminal handling millions of transpacific container transfers between rail and highway trucks.',
    tracks: 32,
    storageTEU: 6200,
  },
});

/**
 * High-Value Commercial Cargo Manifests
 */
export const CARGO_MANIFESTS = Object.freeze({
  manifest_mem_atl_01: {
    id: 'manifest_mem_atl_01',
    corridorId: 'memphis_to_atlanta',
    originHubId: 'memphis_kmem',
    destinationHubId: 'atlanta_inman',
    description:
      'FedEx Flight 112 Air Cargo — Critical Oncology Pharmaceuticals & Biologics',
    cargoType: CARGO_TYPES.PHARMACEUTICALS,
    priority: PRIORITY_TIERS.CRITICAL_EXPEDITE,
    carrierLivery: 'FedEx Custom Critical',
    truckColor: '#4d148c', // FedEx Purple
    trailerColor: '#ff6600', // FedEx Orange trim
    grossWeightLbs: 38450,
    cargoValueUsd: 1450000,
    reeferTempF: 36,
    requiredHoursOfService: 6.5,
    transloadSource: 'B777F Nose High-Loader -> Bay 14',
  },
  manifest_mem_chi_02: {
    id: 'manifest_mem_chi_02',
    corridorId: 'memphis_to_chicago',
    originHubId: 'memphis_kmem',
    destinationHubId: 'chicago_corwith',
    description:
      'FedEx Flight 408 Air Cargo — Precision EV Battery Cells & Avionics Assemblies',
    cargoType: CARGO_TYPES.AEROSPACE_EXPEDITE,
    priority: PRIORITY_TIERS.HIGH_PRIORITY,
    carrierLivery: 'FedEx Freight',
    truckColor: '#4d148c',
    trailerColor: '#ffffff',
    grossWeightLbs: 64200,
    cargoValueUsd: 820000,
    reeferTempF: null,
    requiredHoursOfService: 8.5,
    transloadSource: 'MD-11F Cargo Door -> Sort Conveyor 4',
  },
  manifest_sdf_midwest_03: {
    id: 'manifest_sdf_midwest_03',
    corridorId: 'louisville_to_midwest',
    originHubId: 'louisville_ksdf',
    destinationHubId: 'cincinnati_kcvg',
    description:
      'UPS Worldport Next-Day Air — Medical Diagnostic Equipment & Precision Sensors',
    cargoType: CARGO_TYPES.PHARMACEUTICALS,
    priority: PRIORITY_TIERS.CRITICAL_EXPEDITE,
    carrierLivery: 'UPS Freight',
    truckColor: '#351c15', // UPS Pullman Brown
    trailerColor: '#ffb500', // UPS Gold
    grossWeightLbs: 41800,
    cargoValueUsd: 950000,
    reeferTempF: 68,
    requiredHoursOfService: 5.5,
    transloadSource: 'B747-8F Pallet Sorter -> Dock 9',
  },
  manifest_sav_atl_04: {
    id: 'manifest_sav_atl_04',
    corridorId: 'savannah_to_atlanta',
    originHubId: 'savannah_port',
    destinationHubId: 'atlanta_inman',
    description:
      'Maersk Deep-Water Import — 40ft ISO High-Cube Consumer Electronics Container',
    cargoType: CARGO_TYPES.INTERMODAL_CONTAINER,
    priority: PRIORITY_TIERS.STANDARD_FREIGHT,
    carrierLivery: 'Maersk Drayage Logistics',
    truckColor: '#42b0d5', // Maersk Sky Blue
    trailerColor: '#7dd3fc',
    grossWeightLbs: 72800,
    cargoValueUsd: 480000,
    reeferTempF: null,
    requiredHoursOfService: 4.5,
    transloadSource: 'STS Gantry Crane 12 -> Chassis 884',
  },
  manifest_sav_nola_05: {
    id: 'manifest_sav_nola_05',
    corridorId: 'savannah_to_nola',
    originHubId: 'savannah_port',
    destinationHubId: 'nola_port',
    description:
      'Gulf Coastal Carrier — Industrial Refinery Catalysts & Deep-Sea Rig Parts',
    cargoType: CARGO_TYPES.AUTOMOTIVE_PARTS,
    priority: PRIORITY_TIERS.HIGH_PRIORITY,
    carrierLivery: 'Schneider National',
    truckColor: '#ff6200', // Schneider Orange
    trailerColor: '#ff8533',
    grossWeightLbs: 76500,
    cargoValueUsd: 620000,
    reeferTempF: null,
    requiredHoursOfService: 10.0,
    transloadSource: 'Port Terminal Berth 3 -> Flatbed Semi',
  },
  manifest_nyc_atl_06: {
    id: 'manifest_nyc_atl_06',
    corridorId: 'nyc_to_atlanta',
    originHubId: 'nynj_port',
    destinationHubId: 'atlanta_inman',
    description:
      'Eastern Seaboard Trunkline — Mid-Atlantic High-End Retail & Apparel Consist',
    cargoType: CARGO_TYPES.CONSUMER_RETAIL,
    priority: PRIORITY_TIERS.STANDARD_FREIGHT,
    carrierLivery: 'JB Hunt Transport',
    truckColor: '#ffcc00', // JB Hunt Yellow
    trailerColor: '#ffffff',
    grossWeightLbs: 58200,
    cargoValueUsd: 380000,
    reeferTempF: null,
    requiredHoursOfService: 13.5,
    transloadSource: 'Port of NY/NJ Container Terminal -> Bay 22',
  },
  manifest_la_chi_07: {
    id: 'manifest_la_chi_07',
    corridorId: 'la_to_chicago',
    originHubId: 'lalb_port',
    destinationHubId: 'chicago_corwith',
    description:
      'Transpacific Overland Express — 53ft Intermodal Reefer Chilled Premium Seafood',
    cargoType: CARGO_TYPES.PERISHABLE_REEFER,
    priority: PRIORITY_TIERS.HIGH_PRIORITY,
    carrierLivery: 'Swift Refrigerated Logistics',
    truckColor: '#1d4ed8', // Swift Royal Blue
    trailerColor: '#ffffff',
    grossWeightLbs: 78900,
    cargoValueUsd: 710000,
    reeferTempF: -10,
    requiredHoursOfService: 32.0,
    transloadSource: 'Pier 400 Ocean Berth -> Reefer Semi 901',
  },
});

/**
 * High-Density Interstate Corridors
 * Each waypoint sequence defines the real highway alignment, mile markers,
 * and key transshipment interchanges.
 */
export const FREIGHT_CORRIDORS = Object.freeze({
  memphis_to_atlanta: {
    id: 'memphis_to_atlanta',
    name: 'Memphis SuperHub to Atlanta / Nashville Air-to-Highway Spine',
    highways: 'KMEM -> I-40 E -> I-24 E -> I-75 S',
    originHubId: 'memphis_kmem',
    destinationHubId: 'atlanta_inman',
    defaultManifestId: 'manifest_mem_atl_01',
    distanceMiles: 388,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.18, // Monteagle mountain pass penalty
    primaryCargoCategory: 'Air Cargo Express & Time-Critical Pharmaceuticals',
    waypoints: [
      {
        name: 'Memphis SuperHub Ramp (KMEM)',
        lat: 35.0424,
        lon: -89.9767,
        elev: 104,
        isHub: true,
      },
      {
        name: 'I-240 / I-40 E Interchange',
        lat: 35.1581,
        lon: -89.8732,
        elev: 85,
      },
      {
        name: 'Arlington / Fayette County I-40',
        lat: 35.2934,
        lon: -89.6582,
        elev: 110,
      },
      {
        name: 'Brownsville I-40 Weigh Station',
        lat: 35.5898,
        lon: -89.2612,
        elev: 118,
      },
      {
        name: 'Jackson, TN (Casey Jones Bypass)',
        lat: 35.6542,
        lon: -88.8415,
        elev: 142,
      },
      {
        name: 'Tennessee River Crossing (Cuba Landing)',
        lat: 35.8821,
        lon: -87.8924,
        elev: 125,
      },
      {
        name: 'Dickson I-40 East Mile 172',
        lat: 36.0612,
        lon: -87.3512,
        elev: 230,
      },
      {
        name: 'Nashville I-40 / I-24 West Split',
        lat: 36.1554,
        lon: -86.7912,
        elev: 165,
      },
      {
        name: 'Murfreesboro I-24 East',
        lat: 35.8342,
        lon: -86.3812,
        elev: 185,
      },
      {
        name: 'Manchester I-24 Mile 114',
        lat: 35.4812,
        lon: -86.0821,
        elev: 320,
      },
      {
        name: 'Monteagle Mountain Grade (Appalachian Incline)',
        lat: 35.2412,
        lon: -85.8421,
        elev: 590,
      },
      {
        name: 'Nickajack Lake / Marion County Bridge',
        lat: 35.0212,
        lon: -85.5512,
        elev: 200,
      },
      {
        name: 'Chattanooga I-24 / I-75 Ridge Cut',
        lat: 35.0412,
        lon: -85.2712,
        elev: 220,
      },
      {
        name: 'Georgia State Line / Ringgold I-75',
        lat: 34.9312,
        lon: -85.1212,
        elev: 245,
      },
      {
        name: 'Dalton Carpet Capital Bypass',
        lat: 34.7712,
        lon: -84.9712,
        elev: 235,
      },
      {
        name: 'Calhoun / Gordon County I-75',
        lat: 34.4912,
        lon: -84.9412,
        elev: 205,
      },
      {
        name: 'Cartersville / Allatoona Lake Pass',
        lat: 34.1712,
        lon: -84.7812,
        elev: 260,
      },
      {
        name: 'Marietta / Cobb County I-75 South',
        lat: 33.9512,
        lon: -84.5412,
        elev: 320,
      },
      {
        name: 'Atlanta Perimeter I-285 North Interchange',
        lat: 33.8821,
        lon: -84.4712,
        elev: 285,
      },
      {
        name: 'Atlanta Inman Yard Logistics Hub',
        lat: 33.7997,
        lon: -84.4403,
        elev: 298,
        isHub: true,
      },
    ],
  },

  memphis_to_chicago: {
    id: 'memphis_to_chicago',
    name: 'Memphis SuperHub to Chicago / St. Louis Corridor',
    highways: 'KMEM -> I-55 N',
    originHubId: 'memphis_kmem',
    destinationHubId: 'chicago_corwith',
    defaultManifestId: 'manifest_mem_chi_02',
    distanceMiles: 532,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.08,
    primaryCargoCategory: 'Automotive Assemblies, Electronics & Express Parcel',
    waypoints: [
      {
        name: 'Memphis SuperHub Ramp (KMEM)',
        lat: 35.0424,
        lon: -89.9767,
        elev: 104,
        isHub: true,
      },
      {
        name: 'I-55 Hernando de Soto River Bridge',
        lat: 35.1522,
        lon: -90.0612,
        elev: 85,
      },
      {
        name: 'Marion, AR / I-55 North Junction',
        lat: 35.2112,
        lon: -90.2012,
        elev: 75,
      },
      {
        name: 'Blytheville, AR (Mississippi County)',
        lat: 35.9212,
        lon: -89.9212,
        elev: 78,
      },
      {
        name: 'Missouri State Line / Hayti I-55',
        lat: 36.2312,
        lon: -89.7512,
        elev: 82,
      },
      {
        name: 'Sikeston, MO Intermodal Cross',
        lat: 36.8712,
        lon: -89.5812,
        elev: 98,
      },
      {
        name: 'Cape Girardeau / Mississippi River Bluffs',
        lat: 37.3112,
        lon: -89.5512,
        elev: 115,
      },
      { name: 'Perryville I-55 North', lat: 37.7212, lon: -89.8712, elev: 160 },
      {
        name: 'Festus / Jefferson County I-55',
        lat: 38.2212,
        lon: -90.3912,
        elev: 135,
      },
      {
        name: 'St. Louis Gateway Arch Corridor (I-55/I-64)',
        lat: 38.6182,
        lon: -90.1912,
        elev: 140,
      },
      {
        name: 'Stan Musial Veterans Memorial Bridge',
        lat: 38.6512,
        lon: -90.1712,
        elev: 130,
      },
      {
        name: 'Litchfield, IL I-55 North',
        lat: 39.1712,
        lon: -89.6512,
        elev: 205,
      },
      {
        name: 'Springfield, IL Capital Bypass',
        lat: 39.7812,
        lon: -89.6112,
        elev: 185,
      },
      {
        name: 'Bloomington-Normal Intermodal Junction',
        lat: 40.4812,
        lon: -88.9912,
        elev: 235,
      },
      {
        name: 'Pontiac, IL Route 66 Corridor',
        lat: 40.8812,
        lon: -88.6312,
        elev: 200,
      },
      {
        name: 'Joliet Mega Distribution Center District',
        lat: 41.5212,
        lon: -88.1112,
        elev: 175,
      },
      {
        name: 'I-55 Stevenson Expressway Mile 285',
        lat: 41.7412,
        lon: -87.8512,
        elev: 185,
      },
      {
        name: 'Chicago Corwith Intermodal Yard (BNSF)',
        lat: 41.8153,
        lon: -87.7122,
        elev: 182,
        isHub: true,
      },
    ],
  },

  louisville_to_midwest: {
    id: 'louisville_to_midwest',
    name: 'Louisville Worldport to Midwest Industrial Arterial',
    highways: 'KSDF -> I-65 N / I-71 N',
    originHubId: 'louisville_ksdf',
    destinationHubId: 'cincinnati_kcvg',
    defaultManifestId: 'manifest_sdf_midwest_03',
    distanceMiles: 112,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.12,
    primaryCargoCategory:
      'Next-Day Air Pharmaceuticals & High-Precision Tooling',
    waypoints: [
      {
        name: 'UPS Worldport Ramp (KSDF)',
        lat: 38.1744,
        lon: -85.736,
        elev: 152,
        isHub: true,
      },
      {
        name: 'I-65 Kennedy Memorial Bridge (Ohio River)',
        lat: 38.2612,
        lon: -85.7412,
        elev: 140,
      },
      {
        name: 'Jeffersonville, IN River Ridge Logistics Hub',
        lat: 38.3512,
        lon: -85.6912,
        elev: 155,
      },
      {
        name: 'Carrollton / Kentucky River I-71 Cut',
        lat: 38.6812,
        lon: -85.1612,
        elev: 210,
      },
      {
        name: 'Sparta / Kentucky Speedway Corridor',
        lat: 38.7212,
        lon: -84.9112,
        elev: 245,
      },
      {
        name: 'Walton I-71 / I-75 Confluence',
        lat: 38.8612,
        lon: -84.6112,
        elev: 285,
      },
      {
        name: "Florence Y'all Water Tower Bypass",
        lat: 38.9912,
        lon: -84.6312,
        elev: 270,
      },
      {
        name: 'Amazon Air & DHL Hub (KCVG)',
        lat: 39.0461,
        lon: -84.6622,
        elev: 271,
        isHub: true,
      },
    ],
  },

  savannah_to_atlanta: {
    id: 'savannah_to_atlanta',
    name: 'Savannah Port to Atlanta Container Corridor',
    highways: 'Port of Savannah -> I-16 W -> I-75 N',
    originHubId: 'savannah_port',
    destinationHubId: 'atlanta_inman',
    defaultManifestId: 'manifest_sav_atl_04',
    distanceMiles: 248,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.09,
    primaryCargoCategory:
      'Deep-Water Ocean Container Imports & Industrial Cargo',
    waypoints: [
      {
        name: 'Port of Savannah Garden City Terminal',
        lat: 32.1319,
        lon: -81.1444,
        elev: 12,
        isHub: true,
      },
      {
        name: 'Savannah River Drayage Gate 4',
        lat: 32.1152,
        lon: -81.1712,
        elev: 14,
      },
      {
        name: 'I-16 Westbound On-Ramp Mile 160',
        lat: 32.0812,
        lon: -81.2812,
        elev: 18,
      },
      {
        name: 'Statesboro / Bulloch County Bypass',
        lat: 32.3512,
        lon: -81.8212,
        elev: 48,
      },
      {
        name: 'Metter I-16 Weigh Station',
        lat: 32.4112,
        lon: -82.0912,
        elev: 65,
      },
      {
        name: 'Swainsboro / Emanuel County Trunk',
        lat: 32.5212,
        lon: -82.4112,
        elev: 82,
      },
      {
        name: 'Dublin / Oconee River Crossing',
        lat: 32.5312,
        lon: -82.8912,
        elev: 75,
      },
      {
        name: 'Macon I-16 to I-75 North Interchange',
        lat: 32.8412,
        lon: -83.6312,
        elev: 110,
      },
      {
        name: 'Forsyth / Monroe County I-75',
        lat: 33.0312,
        lon: -83.9412,
        elev: 215,
      },
      {
        name: 'Locust Grove Mega Logistics Distribution Belt',
        lat: 33.3412,
        lon: -84.1112,
        elev: 245,
      },
      {
        name: 'McDonough / Henry County I-75',
        lat: 33.4412,
        lon: -84.1512,
        elev: 260,
      },
      {
        name: 'Atlanta Southern Perimeter (I-285 Junction)',
        lat: 33.6212,
        lon: -84.3812,
        elev: 295,
      },
      {
        name: 'Atlanta Inman Yard Logistics Hub',
        lat: 33.7997,
        lon: -84.4403,
        elev: 298,
        isHub: true,
      },
    ],
  },

  savannah_to_nola: {
    id: 'savannah_to_nola',
    name: 'Savannah to New Orleans Gulf Coastal Corridor',
    highways: 'I-16 W -> I-75 S -> I-10 W',
    originHubId: 'savannah_port',
    destinationHubId: 'nola_port',
    defaultManifestId: 'manifest_sav_nola_05',
    distanceMiles: 642,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.05,
    primaryCargoCategory:
      'Maritime Vessel Parts, Petrochemicals & Coffee Commodities',
    waypoints: [
      {
        name: 'Port of Savannah Garden City Terminal',
        lat: 32.1319,
        lon: -81.1444,
        elev: 12,
        isHub: true,
      },
      {
        name: 'Macon I-75 South Split',
        lat: 32.8412,
        lon: -83.6312,
        elev: 110,
      },
      {
        name: 'Tifton, GA (Heart of South Georgia)',
        lat: 31.4512,
        lon: -83.5112,
        elev: 105,
      },
      {
        name: 'Valdosta Georgia/Florida Border',
        lat: 30.8312,
        lon: -83.2812,
        elev: 68,
      },
      {
        name: 'I-10 West / Suwannee River Junction',
        lat: 30.4312,
        lon: -83.4112,
        elev: 45,
      },
      {
        name: 'Tallahassee Florida Panhandle Trunk',
        lat: 30.4712,
        lon: -84.2812,
        elev: 55,
      },
      {
        name: 'Pensacola Bay I-10 Viaduct',
        lat: 30.5112,
        lon: -87.1812,
        elev: 15,
      },
      {
        name: 'Mobile Bay Jubilee Parkway Causeway',
        lat: 30.6812,
        lon: -87.9412,
        elev: 6,
      },
      {
        name: 'Biloxi / Gulfport Mississippi Coastline',
        lat: 30.4312,
        lon: -89.0912,
        elev: 8,
      },
      {
        name: 'Slidell, LA / Lake Pontchartrain Approach',
        lat: 30.2712,
        lon: -89.7812,
        elev: 4,
      },
      {
        name: 'I-10 Twin Span Bridge (Lake Pontchartrain)',
        lat: 30.1712,
        lon: -89.8512,
        elev: 5,
      },
      {
        name: 'New Orleans Port Napoleon Ave Terminal',
        lat: 29.9197,
        lon: -90.1066,
        elev: 4,
        isHub: true,
      },
    ],
  },

  nyc_to_atlanta: {
    id: 'nyc_to_atlanta',
    name: 'NYC to Atlanta Eastern Seaboard Trunk',
    highways: 'Port of NY/NJ -> I-95 S -> I-85 S',
    originHubId: 'nynj_port',
    destinationHubId: 'atlanta_inman',
    defaultManifestId: 'manifest_nyc_atl_06',
    distanceMiles: 855,
    speedMphGoverned: 68,
    speedLimitMph: 70,
    gradePenaltyFactor: 0.14,
    primaryCargoCategory:
      'Eastern Seaboard Consumer Retail & Priority Distribution',
    waypoints: [
      {
        name: 'Port of NY/NJ Elizabeth Marine Terminal',
        lat: 40.6698,
        lon: -74.156,
        elev: 5,
        isHub: true,
      },
      {
        name: 'New Jersey Turnpike South Mile 90',
        lat: 40.4812,
        lon: -74.4112,
        elev: 22,
      },
      {
        name: 'Delaware Memorial Bridge (I-95 South)',
        lat: 39.6912,
        lon: -75.5212,
        elev: 15,
      },
      {
        name: 'Baltimore Fort McHenry Tunnel (I-95)',
        lat: 39.2612,
        lon: -76.5812,
        elev: 10,
      },
      {
        name: 'Washington DC Capital Beltway (I-495/I-95)',
        lat: 38.7912,
        lon: -76.9912,
        elev: 35,
      },
      {
        name: 'Richmond, VA (I-95 / I-85 South Split)',
        lat: 37.5412,
        lon: -77.4412,
        elev: 52,
      },
      {
        name: 'Petersburg I-85 South Gateway',
        lat: 37.2212,
        lon: -77.4112,
        elev: 42,
      },
      {
        name: 'Raleigh-Durham Research Triangle Corridor',
        lat: 36.0112,
        lon: -78.9112,
        elev: 120,
      },
      {
        name: 'Greensboro Piedmont Triad Logistics Hub',
        lat: 36.0712,
        lon: -79.7912,
        elev: 260,
      },
      {
        name: 'Charlotte Queen City Beltway (I-85)',
        lat: 35.2512,
        lon: -80.8412,
        elev: 225,
      },
      {
        name: 'Greenville-Spartanburg BMW Automotive Belt',
        lat: 34.9512,
        lon: -82.2512,
        elev: 290,
      },
      {
        name: 'Georgia Border / Lake Hartwell Crossing',
        lat: 34.4812,
        lon: -83.0212,
        elev: 220,
      },
      {
        name: 'Atlanta Northeast Perimeter (I-85 / I-285)',
        lat: 33.8912,
        lon: -84.2612,
        elev: 310,
      },
      {
        name: 'Atlanta Inman Yard Logistics Hub',
        lat: 33.7997,
        lon: -84.4403,
        elev: 298,
        isHub: true,
      },
    ],
  },

  la_to_chicago: {
    id: 'la_to_chicago',
    name: 'LA / Long Beach to Chicago Transcontinental Bridge',
    highways: 'Port of LA/LB -> I-15 N -> I-40 E -> I-55 N',
    originHubId: 'lalb_port',
    destinationHubId: 'chicago_corwith',
    defaultManifestId: 'manifest_la_chi_07',
    distanceMiles: 2015,
    speedMphGoverned: 68,
    speedLimitMph: 75,
    gradePenaltyFactor: 0.25, // Cajon Pass & Flagstaff Continental Divide
    primaryCargoCategory:
      'Transpacific High-Volume Container Freight & Reefer Seafood',
    waypoints: [
      {
        name: 'Port of Los Angeles / Long Beach Terminal',
        lat: 33.7431,
        lon: -118.2673,
        elev: 3,
        isHub: true,
      },
      {
        name: 'San Bernardino / Cajon Pass Incline (4,190 ft)',
        lat: 34.3112,
        lon: -117.4412,
        elev: 1277,
      },
      {
        name: 'Barstow Mojave Desert Rail/Highway Hub',
        lat: 34.8912,
        lon: -117.0212,
        elev: 660,
      },
      {
        name: 'Needles / Colorado River California Border',
        lat: 34.8412,
        lon: -114.6112,
        elev: 155,
      },
      {
        name: 'Flagstaff Continental Divide Pass (6,900 ft)',
        lat: 35.1912,
        lon: -111.6512,
        elev: 2100,
      },
      {
        name: 'Gallup, NM Red Rocks Corridor',
        lat: 35.5212,
        lon: -108.7412,
        elev: 1980,
      },
      {
        name: 'Albuquerque / Rio Grande I-40 Cross',
        lat: 35.0812,
        lon: -106.6512,
        elev: 1510,
      },
      {
        name: 'Amarillo Texas Panhandle Cadillac Ranch',
        lat: 35.2212,
        lon: -101.8312,
        elev: 1110,
      },
      {
        name: 'Oklahoma City Crossroads (I-40 / I-35)',
        lat: 35.4612,
        lon: -97.5112,
        elev: 370,
      },
      {
        name: 'Joplin, MO Ozark Gateway',
        lat: 37.0812,
        lon: -94.5112,
        elev: 305,
      },
      {
        name: 'St. Louis Mississippi River Corridor',
        lat: 38.6182,
        lon: -90.1912,
        elev: 140,
      },
      {
        name: 'Bloomington, IL Prairie Heartland',
        lat: 40.4812,
        lon: -88.9912,
        elev: 235,
      },
      {
        name: 'Chicago Corwith Intermodal Yard (BNSF)',
        lat: 41.8153,
        lon: -87.7122,
        elev: 182,
        isHub: true,
      },
    ],
  },
});

/**
 * Calculates great-circle Haversine distance in miles between coordinates.
 */
export function calculateHaversineDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
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

export function getAllFreightCorridors() {
  return Object.values(FREIGHT_CORRIDORS);
}

export function getFreightCorridorById(id) {
  return FREIGHT_CORRIDORS[id] || null;
}

export function getAllFreightHubs() {
  return Object.values(FREIGHT_HUBS);
}

export function getFreightHubById(id) {
  return FREIGHT_HUBS[id] || null;
}

export function getAllCargoManifests() {
  return Object.values(CARGO_MANIFESTS);
}

export function getCargoManifestById(id) {
  return CARGO_MANIFESTS[id] || null;
}
