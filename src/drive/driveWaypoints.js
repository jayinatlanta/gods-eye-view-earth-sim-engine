/**
 * Iconic Driving Corridors, Curvature Dynamics & Route Resolution for Infinite Drive.
 * (Infinite Drive Autonomous Highway Cruiser & Traffic Follower)
 *
 * Provides transcontinental and regional highway corridor catalogs (including the
 * legendary Cannonball / Bullrun, Atlanta to Savannah I-16, Atlanta to Orlando Turnpike,
 * Miami to New Orleans Gulf Odyssey, Pacific Coast Highway, and Blue Ridge Parkway),
 * curvature-based speed limit calculations, traffic hesitation modeling, and OSRM
 * street network routing resolution.
 */

export const DRIVE_CORRIDORS = Object.freeze({
  cannonball_bullrun: {
    id: 'cannonball_bullrun',
    name: 'The Cannonball / Bullrun Transcontinental Sprint',
    description:
      'Legendary coast-to-coast sprint from Red Ball Garage (Manhattan, NYC) across I-80/I-70/I-15 to Portofino Hotel (Redondo Beach, CA).',
    from: {
      name: 'Red Ball Garage (Manhattan, NYC)',
      lat: 40.7431,
      lon: -73.9803,
      elev: 15,
    },
    to: {
      name: 'Portofino Hotel (Redondo Beach, CA)',
      lat: 33.8422,
      lon: -118.3934,
      elev: 5,
    },
    defaultSpeedMph: 95,
    waypoints: [
      {
        name: 'Red Ball Garage (East 31st St)',
        lat: 40.7441,
        lon: -73.9803,
        elev: 15,
      },
      {
        name: 'Manhattan 31st St & 5th Ave',
        lat: 40.7468,
        lon: -73.9868,
        elev: 16,
      },
      {
        name: 'Manhattan 31st St & 7th Ave (Penn Station)',
        lat: 40.7495,
        lon: -73.993,
        elev: 16,
      },
      {
        name: 'Manhattan 31st St & 9th Ave',
        lat: 40.7521,
        lon: -73.9995,
        elev: 14,
      },
      {
        name: '9th Ave & 34th St Lincoln Approach',
        lat: 40.7538,
        lon: -73.9984,
        elev: 13,
      },
      {
        name: 'Lincoln Tunnel Expressway (Dyer Ave)',
        lat: 40.7562,
        lon: -74.0005,
        elev: 11,
      },
      {
        name: 'Lincoln Tunnel Manhattan Portal',
        lat: 40.7583,
        lon: -74.0028,
        elev: 8,
      },
      {
        name: 'Lincoln Tunnel Under Hudson River (East Tube)',
        lat: 40.761,
        lon: -74.01,
        elev: -8,
      },
      {
        name: 'Lincoln Tunnel Mid-Hudson River Tube',
        lat: 40.7635,
        lon: -74.0175,
        elev: -14,
      },
      {
        name: 'Lincoln Tunnel New Jersey Portal (Weehawken)',
        lat: 40.7656,
        lon: -74.0242,
        elev: 8,
      },
      {
        name: 'Lincoln Tunnel Helix Loop 1 (Willow Ave)',
        lat: 40.7668,
        lon: -74.0268,
        elev: 22,
      },
      {
        name: 'Lincoln Tunnel Helix Loop 2 (Palisades Cliff Climb)',
        lat: 40.7675,
        lon: -74.0305,
        elev: 46,
      },
      {
        name: 'Cresting Palisades Helix to NJ-495',
        lat: 40.7672,
        lon: -74.0345,
        elev: 58,
      },
      {
        name: 'NJ-495 Westbound (Union City Viaduct)',
        lat: 40.7665,
        lon: -74.041,
        elev: 54,
      },
      { name: 'NJ-495 North Bergen Cut', lat: 40.766, lon: -74.055, elev: 35 },
      {
        name: 'NJ-495 Meadowlands Causeway',
        lat: 40.7655,
        lon: -74.072,
        elev: 8,
      },
      {
        name: 'NJ Turnpike Western Spur Ramp (I-95 South)',
        lat: 40.771,
        lon: -74.083,
        elev: 12,
      },
      {
        name: 'NJ Turnpike I-95 South (Secaucus)',
        lat: 40.755,
        lon: -74.098,
        elev: 9,
      },
      {
        name: 'NJ Turnpike Passaic River Crossing (Kearny)',
        lat: 40.738,
        lon: -74.12,
        elev: 14,
      },
      {
        name: 'NJ Turnpike Newark Airport (EWR) Interchange',
        lat: 40.69,
        lon: -74.18,
        elev: 12,
      },
      {
        name: 'I-78 West Express (Springfield Cut)',
        lat: 40.685,
        lon: -74.24,
        elev: 38,
      },
      {
        name: 'I-78 West (Watchung Mountain Pass)',
        lat: 40.695,
        lon: -74.38,
        elev: 110,
      },
      {
        name: 'I-78 West (Clinton Rolling Hills)',
        lat: 40.64,
        lon: -74.91,
        elev: 95,
      },
      {
        name: 'I-78 Delaware River Bridge (Phillipsburg into PA)',
        lat: 40.678,
        lon: -75.185,
        elev: 75,
      },
      {
        name: 'I-78 West (Allentown Bypass)',
        lat: 40.57,
        lon: -75.46,
        elev: 120,
      },
      {
        name: 'I-78 West (Fogelsville Ridge)',
        lat: 40.585,
        lon: -75.64,
        elev: 145,
      },
      {
        name: 'I-81 South Junction (Harrisburg Gateway)',
        lat: 40.38,
        lon: -76.62,
        elev: 135,
      },
      {
        name: 'I-81 Susquehanna River Bridge',
        lat: 40.26,
        lon: -76.88,
        elev: 105,
      },
      {
        name: 'I-76 Pennsylvania Turnpike Carlisle Interchange',
        lat: 40.215,
        lon: -77.16,
        elev: 140,
      },
      {
        name: 'PA Turnpike Blue Mountain Tunnel',
        lat: 40.16,
        lon: -77.72,
        elev: 310,
      },
      {
        name: 'PA Turnpike Kittatinny Mountain Tunnel',
        lat: 40.145,
        lon: -77.77,
        elev: 340,
      },
      {
        name: 'PA Turnpike Tuscarora Mountain Tunnel',
        lat: 40.09,
        lon: -77.92,
        elev: 380,
      },
      {
        name: 'PA Turnpike Sideling Hill Bypass',
        lat: 40.02,
        lon: -78.18,
        elev: 490,
      },
      {
        name: 'PA Turnpike Breezewood Interchange',
        lat: 40.005,
        lon: -78.24,
        elev: 410,
      },
      {
        name: 'PA Turnpike Allegheny Mountain Tunnel',
        lat: 40.025,
        lon: -78.75,
        elev: 710,
      },
      {
        name: 'PA Turnpike Somerset Plateau',
        lat: 40.01,
        lon: -79.08,
        elev: 680,
      },
      {
        name: 'PA Turnpike Donegal Descent',
        lat: 40.11,
        lon: -79.38,
        elev: 450,
      },
      {
        name: 'PA Turnpike Irwin / Pittsburgh South Bypass',
        lat: 40.32,
        lon: -79.7,
        elev: 340,
      },
      { name: 'I-70 West PA/Ohio Border', lat: 40.4, lon: -80.52, elev: 310 },
      { name: 'I-70 West (Cambridge, OH)', lat: 40.03, lon: -81.58, elev: 260 },
      {
        name: 'I-70 West (Zanesville Muskingum River)',
        lat: 39.94,
        lon: -82.01,
        elev: 220,
      },
      {
        name: 'I-70 West Columbus Core (Scioto River)',
        lat: 39.955,
        lon: -83.0,
        elev: 235,
      },
      {
        name: 'I-70 West (Springfield, OH)',
        lat: 39.91,
        lon: -83.82,
        elev: 290,
      },
      {
        name: 'I-70 West (Dayton North Crossroads)',
        lat: 39.85,
        lon: -84.2,
        elev: 275,
      },
      {
        name: 'I-70 West Richmond Indiana Gateway',
        lat: 39.84,
        lon: -84.9,
        elev: 305,
      },
      {
        name: 'I-70 West Indianapolis Downtown Loop',
        lat: 39.765,
        lon: -86.155,
        elev: 218,
      },
      {
        name: 'I-70 West Terre Haute (Wabash River)',
        lat: 39.44,
        lon: -87.41,
        elev: 155,
      },
      { name: 'I-70 West (Effingham, IL)', lat: 39.12, lon: -88.54, elev: 180 },
      {
        name: 'I-70 West (Vandalia Kaskaskia River)',
        lat: 38.96,
        lon: -89.1,
        elev: 150,
      },
      {
        name: 'I-70 Mississippi River Stan Musial Bridge (St. Louis Gateway Arch)',
        lat: 38.652,
        lon: -90.178,
        elev: 140,
      },
      {
        name: 'I-70 West St. Charles (Missouri River Bridge)',
        lat: 38.79,
        lon: -90.48,
        elev: 145,
      },
      { name: 'I-70 West (Columbia, MO)', lat: 38.97, lon: -92.33, elev: 235 },
      {
        name: 'I-70 West Boonville (Missouri River Crossing)',
        lat: 38.97,
        lon: -92.74,
        elev: 180,
      },
      {
        name: 'I-70 West Kansas City Downtown Loop',
        lat: 39.102,
        lon: -94.585,
        elev: 260,
      },
      {
        name: 'I-70 West Topeka Kansas River Corridor',
        lat: 39.04,
        lon: -95.69,
        elev: 280,
      },
      {
        name: 'I-70 West (Salina Great Plains Express)',
        lat: 38.84,
        lon: -97.61,
        elev: 375,
      },
      {
        name: 'I-70 West (Hays High Plains)',
        lat: 38.88,
        lon: -99.33,
        elev: 610,
      },
      {
        name: 'I-70 West (Colby Western Kansas High Speed)',
        lat: 39.39,
        lon: -101.05,
        elev: 965,
      },
      {
        name: 'I-70 West Kanorado (Colorado State Line)',
        lat: 39.34,
        lon: -102.04,
        elev: 1180,
      },
      {
        name: 'I-70 West (Limon Mile High Approach)',
        lat: 39.26,
        lon: -103.69,
        elev: 1635,
      },
      {
        name: 'I-70 West Denver Skyline Junction (I-25)',
        lat: 39.785,
        lon: -104.99,
        elev: 1609,
      },
      {
        name: 'I-70 West Golden (Rocky Mountain Gateway)',
        lat: 39.715,
        lon: -105.21,
        elev: 1750,
      },
      {
        name: 'I-70 Mount Vernon Canyon Climb',
        lat: 39.705,
        lon: -105.31,
        elev: 2150,
      },
      {
        name: 'I-70 Idaho Springs Clear Creek Canyon',
        lat: 39.742,
        lon: -105.515,
        elev: 2295,
      },
      {
        name: 'I-70 Georgetown Switchbacks',
        lat: 39.715,
        lon: -105.695,
        elev: 2600,
      },
      {
        name: 'Eisenhower-Johnson Memorial Tunnel (Continental Divide Peak)',
        lat: 39.6795,
        lon: -105.92,
        elev: 3401,
      },
      {
        name: 'I-70 Silverthorne Dillon Reservoir Basin',
        lat: 39.63,
        lon: -106.07,
        elev: 2760,
      },
      { name: 'I-70 Vail Pass Summit', lat: 39.53, lon: -106.22, elev: 3250 },
      {
        name: 'I-70 Glenwood Canyon Engineering Marvel (Colorado River)',
        lat: 39.56,
        lon: -107.28,
        elev: 1750,
      },
      {
        name: 'I-70 West Grand Junction Red Rocks Valley',
        lat: 39.09,
        lon: -108.57,
        elev: 1400,
      },
      {
        name: 'I-70 West Green River Utah Swell Gateway',
        lat: 38.99,
        lon: -110.16,
        elev: 1240,
      },
      {
        name: 'I-70 West San Rafael Reef / Swell S-Curves',
        lat: 38.85,
        lon: -110.84,
        elev: 1850,
      },
      {
        name: 'I-70 West Salina Canyon Descent',
        lat: 38.88,
        lon: -111.75,
        elev: 1650,
      },
      {
        name: 'I-15 South Junction (Cove Fort, UT)',
        lat: 38.64,
        lon: -112.58,
        elev: 1820,
      },
      {
        name: 'I-15 South (Cedar City Plateau)',
        lat: 37.68,
        lon: -113.06,
        elev: 1780,
      },
      {
        name: 'I-15 South St. George Red Cliffs',
        lat: 37.1,
        lon: -113.58,
        elev: 875,
      },
      {
        name: 'I-15 Virgin River Gorge (Arizona Scenic Corridor)',
        lat: 36.93,
        lon: -113.89,
        elev: 620,
      },
      {
        name: 'I-15 South Mesquite Nevada Gateway',
        lat: 36.8,
        lon: -114.07,
        elev: 490,
      },
      {
        name: 'I-15 South Las Vegas Strip Boulevard (Tropicana Ave)',
        lat: 36.101,
        lon: -115.174,
        elev: 615,
      },
      {
        name: 'I-15 South Primm Pass (California Border)',
        lat: 35.61,
        lon: -115.39,
        elev: 795,
      },
      {
        name: 'I-15 South Baker (Mojave Desert Valley)',
        lat: 35.27,
        lon: -116.07,
        elev: 290,
      },
      {
        name: 'I-15 South Barstow Crossroads',
        lat: 34.9,
        lon: -117.02,
        elev: 660,
      },
      {
        name: 'I-15 South Victorville High Desert',
        lat: 34.535,
        lon: -117.29,
        elev: 830,
      },
      {
        name: 'I-15 South Cajon Pass Summit (San Bernardino Mtns)',
        lat: 34.31,
        lon: -117.45,
        elev: 1150,
      },
      {
        name: 'I-15 South San Bernardino Valley',
        lat: 34.11,
        lon: -117.3,
        elev: 350,
      },
      {
        name: 'I-10 West Ontario Freeway Corridor',
        lat: 34.065,
        lon: -117.65,
        elev: 300,
      },
      {
        name: 'I-10 West Pomona / San Gabriel Valley',
        lat: 34.06,
        lon: -117.75,
        elev: 260,
      },
      {
        name: 'I-10 West Downtown Los Angeles Interchange',
        lat: 34.04,
        lon: -118.23,
        elev: 90,
      },
      {
        name: 'I-10 West Santa Monica Freeway Corridor',
        lat: 34.03,
        lon: -118.35,
        elev: 45,
      },
      {
        name: 'I-405 South San Diego Freeway (Culver City)',
        lat: 33.99,
        lon: -118.41,
        elev: 25,
      },
      {
        name: 'I-405 South El Segundo / LAX Air Corridor',
        lat: 33.94,
        lon: -118.39,
        elev: 22,
      },
      {
        name: 'Sepulveda Blvd Manhattan Beach / Hermosa Beach',
        lat: 33.88,
        lon: -118.4,
        elev: 15,
      },
      {
        name: 'Portofino Hotel Marina Gate (Redondo Beach, CA)',
        lat: 33.8422,
        lon: -118.3934,
        elev: 5,
      },
    ],
  },
  atlanta_savannah: {
    id: 'atlanta_savannah',
    name: 'Atlanta to Savannah (I-16 Coastal Run)',
    description:
      'Flat, scenic Georgia pine corridor connecting the Atlanta skyline down I-75 and across I-16 to historic River Street.',
    from: {
      name: 'Downtown Atlanta Core',
      lat: 33.749,
      lon: -84.388,
      elev: 320,
    },
    to: {
      name: 'Savannah River Street',
      lat: 32.0809,
      lon: -81.0912,
      elev: 8,
    },
    defaultSpeedMph: 75,
    waypoints: [
      {
        name: 'Downtown Atlanta (I-75/85 Connector)',
        lat: 33.749,
        lon: -84.388,
        elev: 320,
      },
      {
        name: 'I-75 South Hapeville / Airport East',
        lat: 33.655,
        lon: -84.382,
        elev: 295,
      },
      {
        name: 'I-75 South McDonough (Henry County)',
        lat: 33.435,
        lon: -84.185,
        elev: 260,
      },
      {
        name: 'I-75 South Forsyth (Monroe County)',
        lat: 33.025,
        lon: -83.928,
        elev: 205,
      },
      {
        name: 'I-75 South Macon Riverside Dr (Ocmulgee River)',
        lat: 32.855,
        lon: -83.662,
        elev: 115,
      },
      {
        name: 'Macon Interchange (I-75 to I-16 East Flyover)',
        lat: 32.8407,
        lon: -83.6324,
        elev: 116,
      },
      {
        name: 'I-16 East Ocmulgee River Bridge',
        lat: 32.835,
        lon: -83.595,
        elev: 95,
      },
      {
        name: 'I-16 East Twiggs County (Dry Branch)',
        lat: 32.785,
        lon: -83.475,
        elev: 125,
      },
      {
        name: 'I-16 East Jeffersonville',
        lat: 32.685,
        lon: -83.335,
        elev: 135,
      },
      {
        name: 'I-16 East Danville / Allentown',
        lat: 32.605,
        lon: -83.195,
        elev: 110,
      },
      {
        name: 'I-16 East Dublin (Oconee River Bridge)',
        lat: 32.5404,
        lon: -82.9038,
        elev: 68,
      },
      {
        name: 'I-16 East Rockledge (Laurens County)',
        lat: 32.485,
        lon: -82.725,
        elev: 75,
      },
      {
        name: 'I-16 East Soperton (Treutlen County)',
        lat: 32.435,
        lon: -82.585,
        elev: 85,
      },
      {
        name: 'I-16 East Oak Park (Emanuel County)',
        lat: 32.385,
        lon: -82.315,
        elev: 80,
      },
      {
        name: 'I-16 East Metter Pine Corridor (Candler County)',
        lat: 32.3977,
        lon: -82.0618,
        elev: 72,
      },
      {
        name: 'I-16 East Register / Statesboro Exit (Bulloch County)',
        lat: 32.355,
        lon: -81.875,
        elev: 65,
      },
      {
        name: 'I-16 East Brooklet / Nevils',
        lat: 32.285,
        lon: -81.655,
        elev: 45,
      },
      {
        name: 'I-16 East Pembroke / Black Creek (Bryan County)',
        lat: 32.195,
        lon: -81.475,
        elev: 28,
      },
      {
        name: 'I-16 East Pooler (I-95 Junction)',
        lat: 32.1205,
        lon: -81.2415,
        elev: 15,
      },
      {
        name: 'I-16 East Savannah Gateway / Chatham Pkwy',
        lat: 32.065,
        lon: -81.165,
        elev: 12,
      },
      {
        name: 'I-16 East Savannah Flyover Terminus (Montgomery St)',
        lat: 32.072,
        lon: -81.102,
        elev: 10,
      },
      {
        name: 'Savannah Historic River Street',
        lat: 32.0809,
        lon: -81.0912,
        elev: 8,
      },
    ],
  },
  atlanta_orlando: {
    id: 'atlanta_orlando',
    name: 'Atlanta to Orlando (Florida Turnpike Express)',
    description:
      'Southeast arterial running down I-75 through Valdosta and the Florida Turnpike to International Drive.',
    from: {
      name: 'Downtown Atlanta',
      lat: 33.749,
      lon: -84.388,
      elev: 320,
    },
    to: {
      name: 'Orlando International Drive',
      lat: 28.441,
      lon: -81.47,
      elev: 30,
    },
    defaultSpeedMph: 75,
    waypoints: [
      {
        name: 'Downtown Atlanta (I-75/85 Downtown Connector)',
        lat: 33.749,
        lon: -84.388,
        elev: 320,
      },
      {
        name: 'I-75 South (Turner Field / University Ave)',
        lat: 33.733,
        lon: -84.392,
        elev: 310,
      },
      {
        name: 'I-75 South Central Ave / Hapeville (Airport East)',
        lat: 33.655,
        lon: -84.382,
        elev: 295,
      },
      {
        name: 'I-75 South Forest Park (I-285 Interchange)',
        lat: 33.618,
        lon: -84.372,
        elev: 285,
      },
      {
        name: 'I-75 South Morrow / Southlake',
        lat: 33.582,
        lon: -84.341,
        elev: 280,
      },
      {
        name: 'I-75 South McDonough (Henry County)',
        lat: 33.435,
        lon: -84.185,
        elev: 260,
      },
      {
        name: 'I-75 South Locust Grove',
        lat: 33.342,
        lon: -84.112,
        elev: 250,
      },
      {
        name: 'I-75 South Jackson / High Falls',
        lat: 33.175,
        lon: -83.998,
        elev: 200,
      },
      {
        name: 'I-75 South Forsyth (Monroe County)',
        lat: 33.025,
        lon: -83.928,
        elev: 205,
      },
      {
        name: 'I-75 South Macon North (Bass Rd)',
        lat: 32.915,
        lon: -83.748,
        elev: 160,
      },
      {
        name: 'I-75 South Macon Riverside Dr (Ocmulgee River)',
        lat: 32.855,
        lon: -83.662,
        elev: 115,
      },
      {
        name: 'I-75 South Macon Bypass (I-16 Split)',
        lat: 32.812,
        lon: -83.655,
        elev: 110,
      },
      {
        name: 'I-75 South Byron (Peach County)',
        lat: 32.655,
        lon: -83.765,
        elev: 150,
      },
      {
        name: 'I-75 South Perry (Georgia National Fairgrounds)',
        lat: 32.445,
        lon: -83.738,
        elev: 110,
      },
      {
        name: 'I-75 South Henderson (Houston County)',
        lat: 32.325,
        lon: -83.775,
        elev: 120,
      },
      {
        name: 'I-75 South Vienna (Dooly County)',
        lat: 32.095,
        lon: -83.785,
        elev: 115,
      },
      {
        name: 'I-75 South Cordele (Crisp County)',
        lat: 31.962,
        lon: -83.775,
        elev: 100,
      },
      {
        name: 'I-75 South Arabi (Crisp/Turner Line)',
        lat: 31.832,
        lon: -83.738,
        elev: 120,
      },
      {
        name: 'I-75 South Ashburn (Turner County)',
        lat: 31.705,
        lon: -83.655,
        elev: 130,
      },
      {
        name: 'I-75 South Tifton (Agri-Center / ABAC)',
        lat: 31.455,
        lon: -83.518,
        elev: 108,
      },
      {
        name: 'I-75 South Lenox (Cook County)',
        lat: 31.272,
        lon: -83.468,
        elev: 88,
      },
      {
        name: 'I-75 South Adel (Cook County)',
        lat: 31.135,
        lon: -83.428,
        elev: 75,
      },
      {
        name: 'I-75 South Hahira (Lowndes County)',
        lat: 30.995,
        lon: -83.375,
        elev: 68,
      },
      {
        name: 'I-75 South Valdosta North',
        lat: 30.875,
        lon: -83.325,
        elev: 65,
      },
      {
        name: 'I-75 South Valdosta South (Twin Lakes)',
        lat: 30.735,
        lon: -83.255,
        elev: 52,
      },
      {
        name: 'I-75 South Georgia-Florida State Line',
        lat: 30.601,
        lon: -83.208,
        elev: 48,
      },
      {
        name: 'I-75 South Jennings, FL (Hamilton County)',
        lat: 30.565,
        lon: -83.185,
        elev: 45,
      },
      {
        name: 'I-75 South White Springs (Suwannee River Crossing)',
        lat: 30.342,
        lon: -82.795,
        elev: 38,
      },
      {
        name: 'I-75 South Lake City Interchange (I-10 Junction)',
        lat: 30.165,
        lon: -82.678,
        elev: 48,
      },
      {
        name: 'I-75 South Ellisville (Columbia County)',
        lat: 30.015,
        lon: -82.595,
        elev: 35,
      },
      {
        name: 'I-75 South High Springs (Santa Fe River Bridge)',
        lat: 29.832,
        lon: -82.575,
        elev: 22,
      },
      {
        name: 'I-75 South Alachua',
        lat: 29.775,
        lon: -82.495,
        elev: 38,
      },
      {
        name: 'I-75 South Gainesville (University of Florida / Archer Rd)',
        lat: 29.625,
        lon: -82.395,
        elev: 32,
      },
      {
        name: 'I-75 South Paynes Prairie Preserve',
        lat: 29.545,
        lon: -82.348,
        elev: 20,
      },
      {
        name: 'I-75 South Micanopy (Historic Live Oaks)',
        lat: 29.505,
        lon: -82.312,
        elev: 35,
      },
      {
        name: 'I-75 South Ocala North (Highway 326)',
        lat: 29.275,
        lon: -82.195,
        elev: 30,
      },
      {
        name: 'I-75 South Ocala Central (SR 40 Horse Country)',
        lat: 29.185,
        lon: -82.185,
        elev: 30,
      },
      {
        name: 'I-75 South Belleview / The Villages',
        lat: 29.035,
        lon: -82.165,
        elev: 25,
      },
      {
        name: 'I-75 South Wildwood (Florida Turnpike Interchange / Exit 328)',
        lat: 28.868,
        lon: -82.075,
        elev: 24,
      },
      {
        name: 'Florida Turnpike South (Okahumpka Service Plaza)',
        lat: 28.735,
        lon: -81.895,
        elev: 30,
      },
      {
        name: 'Florida Turnpike South (Leesburg / US-27 Interchange)',
        lat: 28.692,
        lon: -81.825,
        elev: 35,
      },
      {
        name: 'Florida Turnpike South (Minneola / Clermont Ridge)',
        lat: 28.585,
        lon: -81.715,
        elev: 65,
      },
      {
        name: 'Florida Turnpike South (Winter Garden / SR 429 Split)',
        lat: 28.535,
        lon: -81.615,
        elev: 42,
      },
      {
        name: 'Florida Turnpike South (Ocoee / SR 50 Interchange)',
        lat: 28.545,
        lon: -81.535,
        elev: 35,
      },
      {
        name: 'Florida Turnpike South (Gotha / West Orlando)',
        lat: 28.515,
        lon: -81.495,
        elev: 32,
      },
      {
        name: 'Florida Turnpike South (I-4 Interchange / Conroy Rd)',
        lat: 28.485,
        lon: -81.455,
        elev: 30,
      },
      {
        name: 'I-4 West Universal Orlando Resort (Kirkman Rd)',
        lat: 28.468,
        lon: -81.458,
        elev: 30,
      },
      {
        name: 'Orlando International Drive (Convention Center)',
        lat: 28.441,
        lon: -81.47,
        elev: 30,
      },
    ],
  },
  miami_new_orleans: {
    id: 'miami_new_orleans',
    name: 'Miami to New Orleans (Gulf Coast Odyssey)',
    description:
      'Coast-to-coast southern highway voyage via I-75 Alligator Alley, Tampa, I-10 Gulf Coast, Mobile Bay Jubilee Bridge to the French Quarter.',
    from: {
      name: 'South Beach Miami',
      lat: 25.7825,
      lon: -80.13,
      elev: 2,
    },
    to: {
      name: 'French Quarter New Orleans',
      lat: 29.9584,
      lon: -90.0644,
      elev: 1,
    },
    defaultSpeedMph: 75,
    waypoints: [
      {
        name: 'South Beach Miami (Ocean Drive)',
        lat: 25.7725,
        lon: -80.133,
        elev: 2,
      },
      {
        name: 'MacArthur Causeway (Biscayne Bay Bridge)',
        lat: 25.778,
        lon: -80.165,
        elev: 8,
      },
      {
        name: 'I-395 West Midtown Miami',
        lat: 25.788,
        lon: -80.198,
        elev: 12,
      },
      {
        name: 'I-95 North Golden Glades Interchange',
        lat: 25.928,
        lon: -80.208,
        elev: 6,
      },
      {
        name: 'Florida Turnpike / I-595 Westbound',
        lat: 26.085,
        lon: -80.275,
        elev: 5,
      },
      {
        name: 'I-75 South/West Sawgrass Interchange (Weston)',
        lat: 26.115,
        lon: -80.405,
        elev: 4,
      },
      {
        name: 'Alligator Alley Everglades Toll Plaza',
        lat: 26.142,
        lon: -80.485,
        elev: 3,
      },
      {
        name: 'Alligator Alley Miccosukee Indian Reservation Rest Area',
        lat: 26.155,
        lon: -80.725,
        elev: 3,
      },
      {
        name: 'Alligator Alley Big Cypress National Preserve Bridge',
        lat: 26.162,
        lon: -80.985,
        elev: 3,
      },
      {
        name: 'Alligator Alley Collier County Toll Plaza',
        lat: 26.168,
        lon: -81.495,
        elev: 4,
      },
      {
        name: 'Naples I-75 North Interchange (Golden Gate Blvd)',
        lat: 26.185,
        lon: -81.725,
        elev: 5,
      },
      {
        name: 'I-75 North Bonita Springs',
        lat: 26.335,
        lon: -81.775,
        elev: 6,
      },
      {
        name: 'I-75 North Fort Myers (RSW Airport)',
        lat: 26.525,
        lon: -81.785,
        elev: 7,
      },
      {
        name: 'I-75 North Fort Myers Caloosahatchee River Bridge',
        lat: 26.705,
        lon: -81.785,
        elev: 18,
      },
      {
        name: 'I-75 North Punta Gorda (Peace River Crossing)',
        lat: 26.965,
        lon: -82.025,
        elev: 12,
      },
      {
        name: 'I-75 North Port Charlotte',
        lat: 27.025,
        lon: -82.115,
        elev: 8,
      },
      {
        name: 'I-75 North North Port (Sarasota County)',
        lat: 27.085,
        lon: -82.255,
        elev: 9,
      },
      {
        name: 'I-75 North Venice / Laurel',
        lat: 27.165,
        lon: -82.415,
        elev: 10,
      },
      {
        name: 'I-75 North Sarasota (University Pkwy)',
        lat: 27.385,
        lon: -82.445,
        elev: 10,
      },
      {
        name: 'I-75 North Bradenton (Manatee River Bridge)',
        lat: 27.515,
        lon: -82.475,
        elev: 15,
      },
      {
        name: 'I-75 North Sun City Center',
        lat: 27.715,
        lon: -82.375,
        elev: 18,
      },
      {
        name: 'I-75 North Brandon / Tampa East',
        lat: 27.935,
        lon: -82.325,
        elev: 15,
      },
      {
        name: 'I-75 North Tampa Bypass Canal / I-4 Interchange',
        lat: 28.015,
        lon: -82.345,
        elev: 14,
      },
      {
        name: 'I-75 North New Tampa / Wesley Chapel',
        lat: 28.185,
        lon: -82.375,
        elev: 22,
      },
      {
        name: 'I-75 North San Antonio / St. Leo (Pasco Hills)',
        lat: 28.325,
        lon: -82.305,
        elev: 38,
      },
      {
        name: 'I-75 North Brooksville (Hernando County)',
        lat: 28.555,
        lon: -82.255,
        elev: 30,
      },
      {
        name: 'I-75 North Bushnell (Sumter County)',
        lat: 28.665,
        lon: -82.145,
        elev: 24,
      },
      {
        name: 'I-75 North Wildwood (Turnpike Junction)',
        lat: 28.868,
        lon: -82.075,
        elev: 24,
      },
      {
        name: 'I-75 North Ocala Horse Country',
        lat: 29.185,
        lon: -82.185,
        elev: 30,
      },
      {
        name: 'I-75 North Gainesville',
        lat: 29.625,
        lon: -82.395,
        elev: 32,
      },
      {
        name: 'I-75 North Alachua',
        lat: 29.775,
        lon: -82.495,
        elev: 38,
      },
      {
        name: 'I-75 North High Springs (Santa Fe River)',
        lat: 29.832,
        lon: -82.575,
        elev: 22,
      },
      {
        name: 'I-75 North Lake City (I-10 West Interchange)',
        lat: 30.165,
        lon: -82.678,
        elev: 48,
      },
      {
        name: 'I-10 West Live Oak (Suwannee County)',
        lat: 30.295,
        lon: -83.005,
        elev: 35,
      },
      {
        name: 'I-10 West Suwannee River Bridge (Ellaville)',
        lat: 30.385,
        lon: -83.175,
        elev: 28,
      },
      {
        name: 'I-10 West Madison (Madison County)',
        lat: 30.435,
        lon: -83.425,
        elev: 45,
      },
      {
        name: 'I-10 West Monticello (Jefferson County)',
        lat: 30.485,
        lon: -83.865,
        elev: 55,
      },
      {
        name: 'I-10 West Tallahassee North (Capital Circle / US-319)',
        lat: 30.505,
        lon: -84.225,
        elev: 62,
      },
      {
        name: 'I-10 West Quincy (Gadsden County)',
        lat: 30.565,
        lon: -84.585,
        elev: 68,
      },
      {
        name: 'I-10 West Apalachicola River Bridge (Chattahoochee)',
        lat: 30.685,
        lon: -84.875,
        elev: 25,
      },
      {
        name: 'I-10 West Marianna (Jackson County)',
        lat: 30.735,
        lon: -85.225,
        elev: 42,
      },
      {
        name: 'I-10 West Chipley (Washington County)',
        lat: 30.745,
        lon: -85.545,
        elev: 35,
      },
      {
        name: 'I-10 West DeFuniak Springs (Walton County)',
        lat: 30.715,
        lon: -86.115,
        elev: 65,
      },
      {
        name: 'I-10 West Crestview (Okaloosa County)',
        lat: 30.735,
        lon: -86.565,
        elev: 58,
      },
      {
        name: 'I-10 West Milton / Blackwater River (Santa Rosa County)',
        lat: 30.585,
        lon: -87.055,
        elev: 15,
      },
      {
        name: 'I-10 West Escambia Bay Bridge (Pensacola North)',
        lat: 30.515,
        lon: -87.165,
        elev: 12,
      },
      {
        name: 'I-10 West Pensacola Pine Forest',
        lat: 30.525,
        lon: -87.315,
        elev: 25,
      },
      {
        name: 'I-10 West Florida-Alabama Line (Perdido River Bridge)',
        lat: 30.535,
        lon: -87.425,
        elev: 15,
      },
      {
        name: 'I-10 West Baldwin County / Loxley',
        lat: 30.635,
        lon: -87.755,
        elev: 45,
      },
      {
        name: 'I-10 West Daphne / Spanish Fort (Mobile Bay East Bluff)',
        lat: 30.675,
        lon: -87.895,
        elev: 35,
      },
      {
        name: 'I-10 West Mobile Bay Jubilee Parkway Causeway',
        lat: 30.685,
        lon: -87.975,
        elev: 6,
      },
      {
        name: 'I-10 West Mobile Bay Jubilee Bridge Mid-Span',
        lat: 30.688,
        lon: -88.025,
        elev: 10,
      },
      {
        name: 'I-10 West George Wallace Tunnel (Under Mobile River)',
        lat: 30.689,
        lon: -88.042,
        elev: -5,
      },
      {
        name: 'I-10 West Downtown Mobile Skyline',
        lat: 30.685,
        lon: -88.055,
        elev: 8,
      },
      {
        name: "I-10 West Tillman's Corner",
        lat: 30.585,
        lon: -88.175,
        elev: 28,
      },
      {
        name: 'I-10 West Grand Bay (Mobile County)',
        lat: 30.495,
        lon: -88.345,
        elev: 25,
      },
      {
        name: 'I-10 West Alabama-Mississippi State Line',
        lat: 30.465,
        lon: -88.425,
        elev: 18,
      },
      {
        name: 'I-10 West Pascagoula River Bridge (Jackson County)',
        lat: 30.435,
        lon: -88.625,
        elev: 12,
      },
      {
        name: 'I-10 West Ocean Springs',
        lat: 30.435,
        lon: -88.815,
        elev: 10,
      },
      {
        name: "I-10 West Biloxi North (D'Iberville)",
        lat: 30.445,
        lon: -88.905,
        elev: 8,
      },
      {
        name: 'I-10 West Gulfport (US-49 Crossroads)',
        lat: 30.435,
        lon: -89.095,
        elev: 10,
      },
      {
        name: 'I-10 West Pass Christian / Long Beach',
        lat: 30.385,
        lon: -89.285,
        elev: 8,
      },
      {
        name: 'I-10 West Bay St. Louis / Kiln',
        lat: 30.395,
        lon: -89.445,
        elev: 12,
      },
      {
        name: 'I-10 West Pearl River Bridge (Mississippi-Louisiana Line)',
        lat: 30.345,
        lon: -89.655,
        elev: 8,
      },
      {
        name: 'I-10 West Slidell North (I-12 / I-59 Junction)',
        lat: 30.295,
        lon: -89.765,
        elev: 5,
      },
      {
        name: 'I-10 West Lake Pontchartrain North Approach',
        lat: 30.235,
        lon: -89.815,
        elev: 4,
      },
      {
        name: 'I-10 West Lake Pontchartrain Twin Span Bridge North',
        lat: 30.205,
        lon: -89.835,
        elev: 12,
      },
      {
        name: 'I-10 West Lake Pontchartrain Twin Span Bridge Mid-Lake',
        lat: 30.165,
        lon: -89.865,
        elev: 15,
      },
      {
        name: 'I-10 West Lake Pontchartrain Twin Span Bridge South',
        lat: 30.135,
        lon: -89.895,
        elev: 12,
      },
      {
        name: 'I-10 West New Orleans East (Chef Menteur)',
        lat: 30.085,
        lon: -89.925,
        elev: 3,
      },
      {
        name: 'I-10 West Industrial Canal High-Rise Bridge',
        lat: 30.005,
        lon: -90.015,
        elev: 25,
      },
      {
        name: 'I-10 West Claiborne Expressway (Treme / French Quarter View)',
        lat: 29.968,
        lon: -90.068,
        elev: 12,
      },
      {
        name: 'French Quarter New Orleans (Canal St & Decatur St)',
        lat: 29.9525,
        lon: -90.0645,
        elev: 2,
      },
    ],
  },
  princeton_baltimore: {
    id: 'princeton_baltimore',
    name: 'Princeton to Baltimore (Northeast Corridor I-95)',
    description:
      'High-density Mid-Atlantic interstate through Philadelphia, Delaware Memorial Bridge, and Fort McHenry Tunnel.',
    from: {
      name: 'Princeton, NJ',
      lat: 40.3573,
      lon: -74.6672,
      elev: 65,
    },
    to: {
      name: 'Inner Harbor Baltimore',
      lat: 39.2864,
      lon: -76.6122,
      elev: 5,
    },
    defaultSpeedMph: 70,
    waypoints: [
      {
        name: 'Princeton University Campus (Nassau St)',
        lat: 40.3573,
        lon: -74.6672,
        elev: 65,
      },
      {
        name: 'US-1 South Lawrenceville / I-295 Interchange',
        lat: 40.295,
        lon: -74.725,
        elev: 35,
      },
      {
        name: 'I-295 South Trenton (Delaware River Scudder Falls Bridge)',
        lat: 40.255,
        lon: -74.855,
        elev: 22,
      },
      {
        name: 'I-295 / I-95 South Yardley (Lower Makefield, PA)',
        lat: 40.225,
        lon: -74.885,
        elev: 30,
      },
      {
        name: 'I-95 South Langhorne / Penndel',
        lat: 40.165,
        lon: -74.925,
        elev: 28,
      },
      {
        name: 'I-95 South Bensalem (Bucks County)',
        lat: 40.095,
        lon: -74.975,
        elev: 18,
      },
      {
        name: 'I-95 South Philadelphia North (Cottman Ave Viaduct)',
        lat: 40.035,
        lon: -75.045,
        elev: 15,
      },
      {
        name: "I-95 South Philadelphia Center City (Penn's Landing Viaduct)",
        lat: 39.9526,
        lon: -75.142,
        elev: 18,
      },
      {
        name: 'I-95 South Philadelphia Sports Complex (Lincoln Financial Field)',
        lat: 39.905,
        lon: -75.172,
        elev: 8,
      },
      {
        name: 'I-95 South Philadelphia International Airport (PHL)',
        lat: 39.875,
        lon: -75.235,
        elev: 10,
      },
      {
        name: 'I-95 South Chester, PA (Commodore Barry Bridge View)',
        lat: 39.845,
        lon: -75.365,
        elev: 12,
      },
      {
        name: 'I-95 South Pennsylvania-Delaware State Line',
        lat: 39.815,
        lon: -75.435,
        elev: 20,
      },
      {
        name: 'I-95 South Wilmington Downtown Viaduct',
        lat: 39.745,
        lon: -75.555,
        elev: 25,
      },
      {
        name: 'I-95 South Christiana Mall / SR 1 Junction',
        lat: 39.665,
        lon: -75.645,
        elev: 22,
      },
      {
        name: 'I-95 South Newark, DE (University of Delaware)',
        lat: 39.645,
        lon: -75.745,
        elev: 28,
      },
      {
        name: 'I-95 South Delaware-Maryland State Line',
        lat: 39.625,
        lon: -75.785,
        elev: 32,
      },
      {
        name: 'I-95 South Elkton / North East, MD',
        lat: 39.595,
        lon: -75.945,
        elev: 25,
      },
      {
        name: 'I-95 South Susquehanna River Millard E. Tydings Memorial Bridge',
        lat: 39.5842,
        lon: -76.0821,
        elev: 32,
      },
      {
        name: 'I-95 South Aberdeen Proving Ground Exit',
        lat: 39.515,
        lon: -76.205,
        elev: 35,
      },
      {
        name: 'I-95 South Bel Air / Abingdon',
        lat: 39.465,
        lon: -76.315,
        elev: 38,
      },
      {
        name: 'I-95 South White Marsh (Baltimore County)',
        lat: 39.385,
        lon: -76.465,
        elev: 25,
      },
      {
        name: 'I-95 South Baltimore City Line',
        lat: 39.315,
        lon: -76.545,
        elev: 18,
      },
      {
        name: 'I-95 South Fort McHenry Tunnel (Under Baltimore Harbor)',
        lat: 39.265,
        lon: -76.582,
        elev: -15,
      },
      {
        name: 'Inner Harbor Baltimore (Pratt St & Light St)',
        lat: 39.2864,
        lon: -76.6122,
        elev: 5,
      },
    ],
  },
  pacific_coast_highway: {
    id: 'pacific_coast_highway',
    name: 'Pacific Coast Highway (California SR-1)',
    description:
      'Breathtaking coastal cliffs, ocean vistas, and Big Sur curves down to Santa Monica.',
    from: {
      name: 'Monterey Bay / Carmel',
      lat: 36.5552,
      lon: -121.9233,
      elev: 40,
    },
    to: {
      name: 'Santa Monica Pier',
      lat: 34.0099,
      lon: -118.4975,
      elev: 6,
    },
    defaultSpeedMph: 55,
    waypoints: [
      {
        name: 'Monterey / Carmel-by-the-Sea (Ocean Ave & CA-1)',
        lat: 36.5552,
        lon: -121.9233,
        elev: 40,
      },
      {
        name: 'Point Lobos State Natural Reserve',
        lat: 36.515,
        lon: -121.938,
        elev: 35,
      },
      {
        name: 'Garrapata State Park (Soberanes Point)',
        lat: 36.455,
        lon: -121.925,
        elev: 45,
      },
      {
        name: 'Rocky Creek Bridge',
        lat: 36.379,
        lon: -121.905,
        elev: 75,
      },
      {
        name: 'Bixby Creek Bridge (Iconic Concrete Arch)',
        lat: 36.3714,
        lon: -121.9018,
        elev: 85,
      },
      {
        name: 'Hurricane Point Coastal Vista',
        lat: 36.355,
        lon: -121.902,
        elev: 175,
      },
      {
        name: 'Point Sur Naval Facility / Lighthouse Turn',
        lat: 36.315,
        lon: -121.885,
        elev: 45,
      },
      {
        name: 'Big Sur River Valley (Pfeiffer Big Sur)',
        lat: 36.255,
        lon: -121.785,
        elev: 65,
      },
      {
        name: 'Coast Gallery / Castro Canyon',
        lat: 36.225,
        lon: -121.735,
        elev: 180,
      },
      {
        name: 'Julia Pfeiffer Burns State Park (McWay Falls Vista)',
        lat: 36.162,
        lon: -121.675,
        elev: 95,
      },
      {
        name: 'Slates Hot Springs / Esalen Institute',
        lat: 36.125,
        lon: -121.635,
        elev: 65,
      },
      {
        name: 'Lucia Coastal Lodge Curve',
        lat: 36.025,
        lon: -121.535,
        elev: 110,
      },
      {
        name: 'Pacific Valley Flat',
        lat: 35.935,
        lon: -121.495,
        elev: 55,
      },
      {
        name: 'Kirk Creek Campground & Ocean Bluff',
        lat: 35.895,
        lon: -121.465,
        elev: 45,
      },
      {
        name: 'Gorda Coastal Outpost',
        lat: 35.855,
        lon: -121.415,
        elev: 65,
      },
      {
        name: 'Cape San Martin',
        lat: 35.835,
        lon: -121.395,
        elev: 85,
      },
      {
        name: 'Ragged Point Inn (Gateway to Big Sur)',
        lat: 35.765,
        lon: -121.325,
        elev: 95,
      },
      {
        name: 'San Simeon Elephant Seal Rookery (Piedras Blancas)',
        lat: 35.665,
        lon: -121.255,
        elev: 15,
      },
      {
        name: 'San Simeon Bay / Hearst Castle Access',
        lat: 35.6441,
        lon: -121.1895,
        elev: 20,
      },
      {
        name: 'Cambria Coastal Pines',
        lat: 35.565,
        lon: -121.085,
        elev: 25,
      },
      {
        name: 'Harmony Historic Creamery Curve',
        lat: 35.505,
        lon: -121.025,
        elev: 35,
      },
      {
        name: 'Cayucos State Beach Pier',
        lat: 35.452,
        lon: -120.905,
        elev: 10,
      },
      {
        name: 'Morro Rock & Morro Bay Embarcadero',
        lat: 35.3722,
        lon: -120.8625,
        elev: 15,
      },
      {
        name: 'Los Osos Valley Rd / CA-1 South',
        lat: 35.315,
        lon: -120.765,
        elev: 45,
      },
      {
        name: 'San Luis Obispo (Madonna Rd / US-101 Merge)',
        lat: 35.265,
        lon: -120.675,
        elev: 75,
      },
      {
        name: 'Shell Beach Ocean Bluffs',
        lat: 35.175,
        lon: -120.665,
        elev: 35,
      },
      {
        name: 'Pismo Beach Pier / Price Canyon',
        lat: 35.145,
        lon: -120.645,
        elev: 15,
      },
      {
        name: 'Arroyo Grande (US-101 South)',
        lat: 35.115,
        lon: -120.575,
        elev: 35,
      },
      {
        name: 'Nipomo Mesa',
        lat: 35.035,
        lon: -120.495,
        elev: 95,
      },
      {
        name: 'Santa Maria Valley',
        lat: 34.955,
        lon: -120.435,
        elev: 70,
      },
      {
        name: 'Los Alamos Wine Country',
        lat: 34.745,
        lon: -120.275,
        elev: 180,
      },
      {
        name: 'Buellton / Solvang Gateway',
        lat: 34.615,
        lon: -120.195,
        elev: 110,
      },
      {
        name: 'Gaviota Pass & Tunnel (US-101)',
        lat: 34.505,
        lon: -120.225,
        elev: 85,
      },
      {
        name: 'Gaviota State Beach Ocean Curve',
        lat: 34.472,
        lon: -120.228,
        elev: 15,
      },
      {
        name: 'El Capitan State Beach Coastal Bluffs',
        lat: 34.462,
        lon: -120.025,
        elev: 25,
      },
      {
        name: 'Goleta / UC Santa Barbara Air Corridor',
        lat: 34.435,
        lon: -119.825,
        elev: 15,
      },
      {
        name: 'Santa Barbara Waterfront (Cabrillo Blvd / Stearns Wharf)',
        lat: 34.415,
        lon: -119.685,
        elev: 8,
      },
      {
        name: 'Montecito Coast (Channel Drive)',
        lat: 34.422,
        lon: -119.635,
        elev: 15,
      },
      {
        name: 'Summerland Ocean Lookout',
        lat: 34.422,
        lon: -119.595,
        elev: 25,
      },
      {
        name: 'Carpinteria Coastal Salt Marsh',
        lat: 34.398,
        lon: -119.518,
        elev: 10,
      },
      {
        name: 'Rincon Point (World-Famous Surf Break)',
        lat: 34.372,
        lon: -119.478,
        elev: 8,
      },
      {
        name: 'Ventura Coastal Freeway (Seaside Park)',
        lat: 34.275,
        lon: -119.295,
        elev: 12,
      },
      {
        name: 'Oxnard Plain / Port Hueneme Gateway',
        lat: 34.185,
        lon: -119.165,
        elev: 15,
      },
      {
        name: 'Point Mugu Rock (PCH Coastal Cut / US Navy Base)',
        lat: 34.095,
        lon: -119.065,
        elev: 8,
      },
      {
        name: 'Sycamore Cove / Thornhill Broome Beach',
        lat: 34.065,
        lon: -118.995,
        elev: 12,
      },
      {
        name: 'Leo Carrillo State Beach (Ventura-LA Line)',
        lat: 34.045,
        lon: -118.935,
        elev: 10,
      },
      {
        name: 'Malibu West / Zuma Beach',
        lat: 34.022,
        lon: -118.825,
        elev: 10,
      },
      {
        name: 'Point Dume / Malibu Kanan Dume Rd',
        lat: 34.015,
        lon: -118.785,
        elev: 25,
      },
      {
        name: 'Malibu Pier & Surfrider Beach',
        lat: 34.038,
        lon: -118.678,
        elev: 8,
      },
      {
        name: 'Topanga Beach Coastal Bend',
        lat: 34.041,
        lon: -118.585,
        elev: 8,
      },
      {
        name: 'Pacific Palisades Ocean Overlook',
        lat: 34.035,
        lon: -118.535,
        elev: 25,
      },
      {
        name: 'Santa Monica Pier / Ocean Ave',
        lat: 34.0099,
        lon: -118.4975,
        elev: 6,
      },
    ],
  },
  blue_ridge_parkway: {
    id: 'blue_ridge_parkway',
    name: 'Blue Ridge Parkway & Skyline Drive',
    description:
      'Appalachian mountain curves, ridge overlooks, and elevation climbs from Shenandoah to Great Smoky Mountains.',
    from: {
      name: 'Shenandoah National Park Skyline',
      lat: 38.032,
      lon: -78.865,
      elev: 580,
    },
    to: {
      name: 'Great Smoky Mountains National Park',
      lat: 35.565,
      lon: -83.498,
      elev: 620,
    },
    defaultSpeedMph: 45,
    waypoints: [
      {
        name: 'Shenandoah Skyline Drive (Rockfish Gap / Afton Mountain, VA)',
        lat: 38.032,
        lon: -78.865,
        elev: 580,
      },
      {
        name: 'Humpback Rocks Overlook',
        lat: 37.965,
        lon: -78.965,
        elev: 880,
      },
      {
        name: 'White Bank Overlook',
        lat: 37.845,
        lon: -79.125,
        elev: 780,
      },
      {
        name: 'James River Gorge Bridge (Lowest Parkway Point)',
        lat: 37.565,
        lon: -79.365,
        elev: 200,
      },
      {
        name: 'Peaks of Otter Ridge (Abbott Lake & Sharp Top)',
        lat: 37.4522,
        lon: -79.6085,
        elev: 960,
      },
      {
        name: 'Roanoke River Valley Overlook',
        lat: 37.271,
        lon: -79.9414,
        elev: 750,
      },
      {
        name: 'Bent Mountain Ridge',
        lat: 37.165,
        lon: -80.125,
        elev: 860,
      },
      {
        name: 'Rocky Knob Overlook',
        lat: 36.835,
        lon: -80.325,
        elev: 1070,
      },
      {
        name: 'Mabry Mill Historic Waterwheel',
        lat: 36.7501,
        lon: -80.4042,
        elev: 880,
      },
      {
        name: 'Groundhog Mountain Tower',
        lat: 36.645,
        lon: -80.555,
        elev: 920,
      },
      {
        name: 'Blue Ridge Music Center (VA-NC State Line)',
        lat: 36.565,
        lon: -80.845,
        elev: 820,
      },
      {
        name: 'Cumberland Knob (Milepost 217.5)',
        lat: 36.505,
        lon: -80.935,
        elev: 880,
      },
      {
        name: 'Doughton Park Meadow Bluffs',
        lat: 36.415,
        lon: -81.165,
        elev: 1150,
      },
      {
        name: 'Cascade Falls / E.B. Jeffress Park',
        lat: 36.265,
        lon: -81.425,
        elev: 1050,
      },
      {
        name: 'Blowing Rock Overlook',
        lat: 36.145,
        lon: -81.675,
        elev: 1100,
      },
      {
        name: 'Moses H. Cone Memorial Park',
        lat: 36.155,
        lon: -81.715,
        elev: 1120,
      },
      {
        name: 'Linn Cove Viaduct (Iconic S-Curve Mountain Bridge)',
        lat: 36.1042,
        lon: -81.8315,
        elev: 1320,
      },
      {
        name: 'Linville Falls Overlook',
        lat: 35.9521,
        lon: -81.8905,
        elev: 1150,
      },
      {
        name: 'Little Switzerland / Gillespie Gap',
        lat: 35.845,
        lon: -82.085,
        elev: 1020,
      },
      {
        name: 'Crabtree Falls',
        lat: 35.815,
        lon: -82.145,
        elev: 1150,
      },
      {
        name: 'Mount Mitchell State Park Overlook (Highest Peak East)',
        lat: 35.755,
        lon: -82.265,
        elev: 1600,
      },
      {
        name: 'Craggy Gardens Rhododendron Gap',
        lat: 35.705,
        lon: -82.385,
        elev: 1650,
      },
      {
        name: 'Folk Art Center (Asheville Valley)',
        lat: 35.5951,
        lon: -82.5115,
        elev: 680,
      },
      {
        name: 'French Broad River Crossing',
        lat: 35.535,
        lon: -82.595,
        elev: 620,
      },
      {
        name: 'Mount Pisgah Overlook / Pisgah Inn',
        lat: 35.415,
        lon: -82.755,
        elev: 1500,
      },
      {
        name: 'Graveyard Fields / Yellowstone Falls',
        lat: 35.325,
        lon: -82.845,
        elev: 1550,
      },
      {
        name: "Devil's Courthouse Ridge",
        lat: 35.305,
        lon: -82.895,
        elev: 1620,
      },
      {
        name: 'Richland Balsam Overlook (Highest Parkway Point: 6,053 ft)',
        lat: 35.375,
        lon: -82.995,
        elev: 1845,
      },
      {
        name: 'Waterrock Knob Visitor Center',
        lat: 35.465,
        lon: -83.135,
        elev: 1770,
      },
      {
        name: 'Soco Gap (US-19 Overpass)',
        lat: 35.485,
        lon: -83.165,
        elev: 1320,
      },
      {
        name: 'Great Smoky Mountains Park Boundary / Oconaluftee',
        lat: 35.565,
        lon: -83.498,
        elev: 620,
      },
    ],
  },
});

/**
 * Calculates Great-Circle Haversine distance in meters between two lat/lon points.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
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
 * Computes heading (bearing) in degrees [0, 360) from point 1 to point 2.
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
 * Computes total travel duration in seconds based on distance in meters and speed in mph.
 */
export function calculateTravelDurationSeconds(distanceMeters, speedMph) {
  const speedMps = Math.max(1, speedMph) * 0.44704;
  return Math.max(1, distanceMeters / speedMps);
}

/**
 * Computes cumulative distance along an array of waypoints in meters.
 */
export function calculateCorridorDistance(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += calculateHaversineDistance(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
    );
  }
  return total;
}

/**
 * Realistic Curvature Deceleration Calculator:
 * Computes heading deltas between consecutive highway segments.
 * Reduces cruising speed on sharp curves, cloverleafs, and highway on/off ramps.
 *
 * @param {Array<{lat:number, lon:number}>} waypoints
 * @param {number} baseSpeedMph
 * @returns {Array<number>} per-waypoint speed limit in mph
 */
export function calculateCurvatureSpeedLimits(waypoints, baseSpeedMph = 75) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];
  if (waypoints.length <= 2) return waypoints.map(() => baseSpeedMph);

  const speeds = [baseSpeedMph];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const pPrev = waypoints[i - 1];
    const pCurr = waypoints[i];
    const pNext = waypoints[i + 1];

    const headingIn = calculateHeadingDegrees(
      pPrev.lat,
      pPrev.lon,
      pCurr.lat,
      pCurr.lon,
    );
    const headingOut = calculateHeadingDegrees(
      pCurr.lat,
      pCurr.lon,
      pNext.lat,
      pNext.lon,
    );

    let deltaAngle = Math.abs(headingOut - headingIn);
    if (deltaAngle > 180) deltaAngle = 360 - deltaAngle;

    // Deceleration curve mapping
    let speed = baseSpeedMph;
    if (deltaAngle >= 50) {
      // Sharp cloverleaf / 90-degree corner
      speed = Math.max(20, baseSpeedMph * 0.35);
    } else if (deltaAngle >= 25) {
      // Moderate highway curve / ramp
      speed = Math.max(35, baseSpeedMph * 0.6);
    } else if (deltaAngle >= 12) {
      // Gentle sweeping turn
      speed = Math.max(50, baseSpeedMph * 0.85);
    }

    speeds.push(Math.round(speed));
  }

  // Final destination waypoint matches penultimate speed
  speeds.push(speeds[speeds.length - 1] || baseSpeedMph);
  return speeds;
}

/**
 * Resolves corridor from ID, name, or keywords.
 */
export function resolveDriveCorridor(query) {
  if (!query || typeof query !== 'string') return null;
  const clean = query.trim().toLowerCase();

  // Direct key match
  if (DRIVE_CORRIDORS[clean]) return DRIVE_CORRIDORS[clean];

  // Search by corridor ID, name, or keywords
  for (const [key, corridor] of Object.entries(DRIVE_CORRIDORS)) {
    if (
      key.includes(clean) ||
      corridor.name.toLowerCase().includes(clean) ||
      corridor.description.toLowerCase().includes(clean)
    ) {
      return corridor;
    }
  }

  // Aliases
  if (clean.includes('bullrun') || clean.includes('cannonball')) {
    return DRIVE_CORRIDORS.cannonball_bullrun;
  }
  if (clean.includes('savannah')) {
    return DRIVE_CORRIDORS.atlanta_savannah;
  }
  if (clean.includes('orlando') || clean.includes('disney')) {
    return DRIVE_CORRIDORS.atlanta_orlando;
  }
  if (
    clean.includes('nola') ||
    clean.includes('new orleans') ||
    clean.includes('miami')
  ) {
    return DRIVE_CORRIDORS.miami_new_orleans;
  }
  if (clean.includes('princeton') || clean.includes('baltimore')) {
    return DRIVE_CORRIDORS.princeton_baltimore;
  }
  if (
    clean.includes('pch') ||
    clean.includes('pacific coast') ||
    clean.includes('big sur')
  ) {
    return DRIVE_CORRIDORS.pacific_coast_highway;
  }
  if (clean.includes('blue ridge') || clean.includes('skyline')) {
    return DRIVE_CORRIDORS.blue_ridge_parkway;
  }

  return null;
}

export const MAX_OSRM_SUBLEG_KM = 450; // Safely below server ROUTE_MAX_LEG_KM = 600
export const MAX_OSRM_TOTAL_KM = 2500; // Matches server ROUTE_MAX_TOTAL_KM = 2500

const DEFAULT_OSRM_RETRY_DELAY_MS = 450;
const MAX_OSRM_RETRY_DELAY_MS = 2500;

/**
 * Estimates a realistic ground elevation (meters above WGS84 ellipsoid) for a coordinate
 * when no explicit elevation was supplied, by checking the nearest known corridor waypoint
 * within 120 km before falling back to 20m.
 */
export function estimateWaypointElevation(lat, lon, explicitElev) {
  if (Number.isFinite(Number(explicitElev))) {
    return Number(explicitElev);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return 20;
  }
  let bestDistM = 120000;
  let bestElev = null;
  for (const corridor of Object.values(DRIVE_CORRIDORS)) {
    const wps = corridor?.waypoints || [];
    for (const wp of wps) {
      if (
        !Number.isFinite(wp?.lat) ||
        !Number.isFinite(wp?.lon) ||
        !Number.isFinite(wp?.elev)
      ) {
        continue;
      }
      const d = calculateHaversineDistance(lat, lon, wp.lat, wp.lon);
      if (d < bestDistM) {
        bestDistM = d;
        bestElev = wp.elev;
      }
    }
  }
  return Number.isFinite(bestElev) ? bestElev : 20;
}

/**
 * Subdivides a driving leg whose straight-line span exceeds `maxSubLegKm`
 * into N equal chord sub-legs so every `/api/route` call remains safely under
 * the route server's `ROUTE_MAX_LEG_KM = 600` limit and stays symmetric in
 * both travel directions.
 */
export function subdivideDriveLeg(
  startWp,
  endWp,
  maxSubLegKm = MAX_OSRM_SUBLEG_KM,
) {
  if (!startWp || !endWp) return [];
  const startElev = estimateWaypointElevation(
    startWp.lat,
    startWp.lon,
    startWp.elev,
  );
  const endElev = estimateWaypointElevation(endWp.lat, endWp.lon, endWp.elev);
  const distKm =
    calculateHaversineDistance(startWp.lat, startWp.lon, endWp.lat, endWp.lon) /
    1000;

  if (!Number.isFinite(distKm) || distKm <= maxSubLegKm) {
    return [
      { ...startWp, elev: startElev },
      { ...endWp, elev: endElev },
    ];
  }

  const segments = Math.max(2, Math.ceil(distKm / maxSubLegKm));
  const out = [];
  for (let k = 0; k <= segments; k++) {
    if (k === 0) {
      out.push({ ...startWp, elev: startElev });
      continue;
    }
    if (k === segments) {
      out.push({ ...endWp, elev: endElev });
      continue;
    }
    const t = k / segments;
    const lat = Number(
      (startWp.lat + (endWp.lat - startWp.lat) * t).toFixed(6),
    );
    const lon = Number(
      (startWp.lon + (endWp.lon - startWp.lon) * t).toFixed(6),
    );
    const linearElev = startElev + (endElev - startElev) * t;
    const corridorElev = estimateWaypointElevation(lat, lon, undefined);
    const elev = corridorElev !== 20 ? corridorElev : linearElev;
    out.push({ lat, lon, elev });
  }
  return out;
}

function waitMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSameCoord(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(Number(a.lat) - Number(b.lat)) < 1e-6 &&
    Math.abs(Number(a.lon) - Number(b.lon)) < 1e-6
  );
}

async function fetchDriveRouteSegment(
  origin,
  destination,
  {
    fetchImpl = globalThis.fetch,
    profile = 'car',
    maxRetries = 2,
    retryDelayMs,
  } = {},
) {
  if (!origin || !destination) {
    return { points: null, ok: false, reason: 'invalid waypoints' };
  }
  const coords = `${origin.lon.toFixed(6)},${origin.lat.toFixed(6)};${destination.lon.toFixed(6)},${destination.lat.toFixed(6)}`;
  const url = `/api/route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coords)}&steps=1`;

  const startElev = estimateWaypointElevation(
    origin.lat,
    origin.lon,
    origin.elev,
  );
  const endElev = estimateWaypointElevation(
    destination.lat,
    destination.lon,
    destination.elev,
  );

  const attempts = Math.max(1, 1 + Math.max(0, Number(maxRetries) || 0));
  let lastReason = 'route proxy unavailable';

  for (let attempt = 0; attempt < attempts; attempt++) {
    let shouldRetry = false;
    let delayMs =
      typeof retryDelayMs === 'number'
        ? retryDelayMs
        : DEFAULT_OSRM_RETRY_DELAY_MS * (attempt + 1);

    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
      });

      if (res.status === 429 || res.status >= 500) {
        lastReason =
          res.status === 429
            ? 'Rate limited by routing service (429)'
            : `Route proxy error (HTTP ${res.status})`;
        if (res.status === 429 && typeof retryDelayMs !== 'number') {
          const retryAfterHeader = Number(res.headers?.get?.('retry-after'));
          if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
            delayMs = Math.min(
              MAX_OSRM_RETRY_DELAY_MS,
              Math.max(250, retryAfterHeader * 1000),
            );
          } else {
            delayMs = 1100;
          }
        }
        shouldRetry = attempt + 1 < attempts;
      } else if (!res.ok) {
        return {
          points: null,
          ok: false,
          reason: `Route proxy error (HTTP ${res.status})`,
        };
      } else {
        const payload = await res.json();
        if (
          payload?.ok &&
          Array.isArray(payload?.geometry) &&
          payload.geometry.length >= 2
        ) {
          const n = payload.geometry.length;
          const points = payload.geometry.map(([lon, lat], idx) => {
            const t = n > 1 ? idx / (n - 1) : 0;
            return {
              lat: Number(lat),
              lon: Number(lon),
              elev: startElev + (endElev - startElev) * t,
            };
          });
          return { points, ok: true, reason: null };
        }
        const errText = String(payload?.error || 'no route found');
        lastReason = errText;
        const lowerErr = errText.toLowerCase();
        if (
          (lowerErr.includes('rate limit') || lowerErr.includes('busy')) &&
          attempt + 1 < attempts
        ) {
          shouldRetry = true;
        } else {
          return { points: null, ok: false, reason: lastReason };
        }
      }
    } catch (err) {
      lastReason = err?.message || 'Network error querying route proxy';
      shouldRetry = attempt + 1 < attempts;
    }

    if (shouldRetry) {
      await waitMs(delayMs);
    }
  }

  return { points: null, ok: false, reason: lastReason };
}

/**
 * Attempts to fetch street-following geometry from GEV route proxy (/api/route).
 */
export async function fetchDriveRouteGeometry(
  origin,
  destination,
  options = {},
) {
  const result = await fetchDriveRouteSegment(origin, destination, options);
  return result.ok ? result.points : null;
}

function attachRouteMeta(points, meta) {
  if (!Array.isArray(points)) return points;
  Object.defineProperty(points, 'routeMeta', {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return points;
}

/**
 * Fetches and stitches street-level road network geometry across multi-leg corridors
 * or point-to-point routes, subdividing legs > 450 km so regional drives (e.g. >550 km)
 * follow real roads symmetrically without straight-line fallback, while exposing explicit
 * route provenance (`osrm` | `partial_osrm` | `straight_fallback`) and reason.
 */
export async function fetchMultiLegDriveRouteGeometry(
  waypoints,
  {
    fetchImpl = globalThis.fetch,
    profile = 'car',
    maxSubLegKm = MAX_OSRM_SUBLEG_KM,
    maxTotalKm = MAX_OSRM_TOTAL_KM,
    maxRetries = 2,
    retryDelayMs,
    paceMs,
    onRouteStatus,
  } = {},
) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;

  // Check total straight-line distance against server total limit (2,500 km)
  let totalChordKm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalChordKm +=
      calculateHaversineDistance(
        waypoints[i].lat,
        waypoints[i].lon,
        waypoints[i + 1].lat,
        waypoints[i + 1].lon,
      ) / 1000;
  }

  if (totalChordKm > maxTotalKm) {
    const fallbackPoints = waypoints.map((wp) => ({
      ...wp,
      elev: estimateWaypointElevation(wp.lat, wp.lon, wp.elev),
    }));
    const meta = {
      status: 'straight_fallback',
      reason: `Route exceeds ${maxTotalKm.toLocaleString()} km OSRM distance limit`,
      totalLegs: waypoints.length - 1,
      subLegCount: 0,
      osrmLegs: 0,
      fallbackLegs: waypoints.length - 1,
    };
    attachRouteMeta(fallbackPoints, meta);
    onRouteStatus?.(meta);
    return fallbackPoints;
  }

  const effectivePaceMs =
    typeof paceMs === 'number'
      ? paceMs
      : fetchImpl === globalThis.fetch
        ? 1050
        : 0;

  const allRoadPoints = [];
  let totalSubLegs = 0;
  let osrmLegs = 0;
  let fallbackLegs = 0;
  let firstFailureReason = null;
  let queriedAnySubLeg = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const subWaypoints = subdivideDriveLeg(
      waypoints[i],
      waypoints[i + 1],
      maxSubLegKm,
    );

    for (let k = 0; k < subWaypoints.length - 1; k++) {
      const startWp = subWaypoints[k];
      const endWp = subWaypoints[k + 1];
      const startElev = estimateWaypointElevation(
        startWp.lat,
        startWp.lon,
        startWp.elev,
      );
      const endElev = estimateWaypointElevation(
        endWp.lat,
        endWp.lon,
        endWp.elev,
      );
      totalSubLegs++;

      if (queriedAnySubLeg && effectivePaceMs > 0) {
        await waitMs(effectivePaceMs);
      }
      queriedAnySubLeg = true;

      const segmentRes = await fetchDriveRouteSegment(startWp, endWp, {
        fetchImpl,
        profile,
        maxRetries,
        retryDelayMs,
      });

      if (segmentRes.ok && segmentRes.points?.length >= 2) {
        osrmLegs++;
        const legGeometry = segmentRes.points;
        const n = legGeometry.length;
        for (let j = 0; j < n; j++) {
          const pt = legGeometry[j];
          if (
            allRoadPoints.length > 0 &&
            (j === 0 ||
              isSameCoord(allRoadPoints[allRoadPoints.length - 1], pt))
          ) {
            continue;
          }
          const t = n > 1 ? j / (n - 1) : 0;
          const ptElev = Number.isFinite(pt.elev)
            ? pt.elev
            : startElev + (endElev - startElev) * t;
          allRoadPoints.push({
            lat: pt.lat,
            lon: pt.lon,
            elev: ptElev,
          });
        }
      } else {
        fallbackLegs++;
        if (!firstFailureReason && segmentRes.reason) {
          firstFailureReason = segmentRes.reason;
        }
        if (
          allRoadPoints.length === 0 ||
          !isSameCoord(allRoadPoints[allRoadPoints.length - 1], startWp)
        ) {
          allRoadPoints.push({ ...startWp, elev: startElev });
        }
        if (!isSameCoord(allRoadPoints[allRoadPoints.length - 1], endWp)) {
          allRoadPoints.push({ ...endWp, elev: endElev });
        }
      }
    }
  }

  if (allRoadPoints.length < 2) return null;

  let status = 'straight_fallback';
  if (osrmLegs > 0 && fallbackLegs === 0) {
    status = 'osrm';
  } else if (osrmLegs > 0 && fallbackLegs > 0) {
    status = 'partial_osrm';
  }

  const meta = {
    status,
    reason: status === 'osrm' ? null : firstFailureReason || 'OSRM unavailable',
    totalLegs: waypoints.length - 1,
    subLegCount: totalSubLegs,
    osrmLegs,
    fallbackLegs,
  };
  attachRouteMeta(allRoadPoints, meta);
  onRouteStatus?.(meta);
  return allRoadPoints;
}

/**
 * Convenience wrapper returning explicit route geometry + provenance metadata.
 */
export async function fetchMultiLegDriveRouteWithStatus(
  waypoints,
  options = {},
) {
  const points = await fetchMultiLegDriveRouteGeometry(waypoints, options);
  if (!points) {
    return {
      points: null,
      status: 'straight_fallback',
      reason: 'invalid waypoints',
      totalLegs: 0,
      subLegCount: 0,
      osrmLegs: 0,
      fallbackLegs: 0,
    };
  }
  return {
    points,
    ...(points.routeMeta || {
      status: 'osrm',
      reason: null,
      totalLegs: Math.max(0, waypoints.length - 1),
      subLegCount: Math.max(0, waypoints.length - 1),
      osrmLegs: Math.max(0, waypoints.length - 1),
      fallbackLegs: 0,
    }),
  };
}

/**
 * Resolves drive route waypoints from preset IDs or custom coordinates.
 */
export function resolveDriveWaypoints(fromQuery, toQuery, options = {}) {
  // 1. Direct corridor ID match
  if (fromQuery && !toQuery) {
    const corridor = resolveDriveCorridor(fromQuery);
    if (corridor) return formatCorridorResult(corridor, options);
  }

  if (options.corridorId) {
    const corridor = resolveDriveCorridor(options.corridorId);
    if (corridor) return formatCorridorResult(corridor, options);
  }

  // 2. Preset match in fromQuery
  const fromCorridor = resolveDriveCorridor(fromQuery);
  if (fromCorridor && !toQuery) {
    return formatCorridorResult(fromCorridor, options);
  }

  // Smart origin/destination pairing check for transcontinental / iconic corridors
  if (fromQuery && toQuery) {
    const f = String(fromQuery).toLowerCase();
    const t = String(toQuery).toLowerCase();
    if (
      (f.includes('ny') || f.includes('new york') || f.includes('manhattan')) &&
      (t.includes('la') || t.includes('los angeles') || t.includes('redondo'))
    ) {
      return formatCorridorResult(DRIVE_CORRIDORS.cannonball_bullrun, options);
    }
    if (f.includes('atlanta') && t.includes('savannah')) {
      return formatCorridorResult(DRIVE_CORRIDORS.atlanta_savannah, options);
    }
    if (f.includes('atlanta') && t.includes('orlando')) {
      return formatCorridorResult(DRIVE_CORRIDORS.atlanta_orlando, options);
    }
    if (
      f.includes('miami') &&
      (t.includes('new orleans') || t.includes('nola'))
    ) {
      return formatCorridorResult(DRIVE_CORRIDORS.miami_new_orleans, options);
    }
    if (f.includes('princeton') && t.includes('baltimore')) {
      return formatCorridorResult(DRIVE_CORRIDORS.princeton_baltimore, options);
    }
    if (
      (f.includes('monterey') ||
        f.includes('carmel') ||
        f.includes('big sur')) &&
      (t.includes('santa monica') || t.includes('malibu') || t.includes('la'))
    ) {
      return formatCorridorResult(
        DRIVE_CORRIDORS.pacific_coast_highway,
        options,
      );
    }
    if (
      (f.includes('shenandoah') ||
        f.includes('skyline') ||
        f.includes('virginia')) &&
      (t.includes('smoky') || t.includes('asheville') || t.includes('cherokee'))
    ) {
      return formatCorridorResult(DRIVE_CORRIDORS.blue_ridge_parkway, options);
    }
  }

  // 3. Coordinate parsing fallback (e.g. "33.749,-84.388" or { lat, lon, elev, name } objects)
  const parseCoords = (val) => {
    if (!val) return null;
    if (
      typeof val === 'object' &&
      Number.isFinite(Number(val.lat)) &&
      Number.isFinite(Number(val.lon))
    ) {
      const lat = Number(val.lat);
      const lon = Number(val.lon);
      const elev = estimateWaypointElevation(lat, lon, val.elev);
      return {
        lat,
        lon,
        elev,
        name: typeof val.name === 'string' && val.name ? val.name : null,
      };
    }
    if (typeof val !== 'string') return null;
    const parts = val.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const lat = parts[0];
      const lon = parts[1];
      return {
        lat,
        lon,
        elev: estimateWaypointElevation(lat, lon, undefined),
        name: null,
      };
    }
    return null;
  };

  const fromCoords = parseCoords(fromQuery);
  const toCoords = parseCoords(toQuery);

  if (fromCoords && toCoords) {
    const originName = fromCoords.name || 'Origin Point';
    const destName = toCoords.name || 'Destination Point';
    const customCorridor = {
      id: 'custom_drive_corridor',
      isCustom: true,
      name: `Custom Drive: ${fromCoords.lat.toFixed(3)},${fromCoords.lon.toFixed(3)} ➔ ${toCoords.lat.toFixed(3)},${toCoords.lon.toFixed(3)}`,
      description: 'User-specified highway / street driving route.',
      from: {
        name: originName,
        lat: fromCoords.lat,
        lon: fromCoords.lon,
        elev: fromCoords.elev,
      },
      to: {
        name: destName,
        lat: toCoords.lat,
        lon: toCoords.lon,
        elev: toCoords.elev,
      },
      defaultSpeedMph: options.speedMph || 70,
      waypoints: [
        {
          name: originName,
          lat: fromCoords.lat,
          lon: fromCoords.lon,
          elev: fromCoords.elev,
        },
        {
          name: destName,
          lat: toCoords.lat,
          lon: toCoords.lon,
          elev: toCoords.elev,
        },
      ],
    };

    return formatCorridorResult(customCorridor, options);
  }

  // Canonical default: The Cannonball / Bullrun
  const fallback = formatCorridorResult(
    DRIVE_CORRIDORS.cannonball_bullrun,
    options,
  );
  fallback.isFallback = true;
  return fallback;
}

/**
 * Asynchronously resolves drive waypoints, geocoding city or place names via /api/geocode if needed.
 */
export async function resolveDriveWaypointsAsync(
  fromQuery,
  toQuery,
  { fetchImpl = globalThis.fetch, speedMph = 70 } = {},
) {
  // Try synchronous resolution first
  const sync = resolveDriveWaypoints(fromQuery, toQuery, { speedMph });
  if (sync && !sync.isFallback) {
    return sync;
  }

  // Geocode helper
  const geocode = async (q) => {
    if (!q || typeof q !== 'string') return null;
    try {
      const res = await fetchImpl(
        `/api/geocode?q=${encodeURIComponent(q.trim())}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const first = data?.results?.[0];
      if (
        first &&
        Number.isFinite(Number(first.lat)) &&
        Number.isFinite(Number(first.lon))
      ) {
        const lat = Number(first.lat);
        const lon = Number(first.lon);
        return {
          name: first.name || first.display_name || q,
          lat,
          lon,
          elev: estimateWaypointElevation(lat, lon, first.elev),
        };
      }
    } catch {
      /* fallback */
    }
    return null;
  };

  const [fromPoint, toPoint] = await Promise.all([
    geocode(fromQuery),
    geocode(toQuery),
  ]);

  if (fromPoint && toPoint) {
    const customCorridor = {
      id: 'custom_drive_corridor',
      isCustom: true,
      name: `Drive: ${fromPoint.name} ➔ ${toPoint.name}`,
      description: 'Geocoded custom driving route.',
      from: fromPoint,
      to: toPoint,
      defaultSpeedMph: speedMph,
      waypoints: [fromPoint, toPoint],
    };
    return formatCorridorResult(customCorridor, { speedMph });
  }

  return sync;
}

function formatCorridorResult(corridor, options = {}) {
  const waypoints = corridor.waypoints || [corridor.from, corridor.to];
  const totalMeters = calculateCorridorDistance(waypoints);
  const speedMph = Number(options.speedMph) || corridor.defaultSpeedMph || 75;
  const durationSec = calculateTravelDurationSeconds(totalMeters, speedMph);
  const curvatureSpeeds = calculateCurvatureSpeedLimits(waypoints, speedMph);

  return {
    ...corridor,
    waypoints,
    totalDistanceMeters: totalMeters,
    speedMph,
    durationSec,
    curvatureSpeeds,
  };
}
