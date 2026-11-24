/**
 * Pure Cesium-Free Airport & Iconic Flight Corridor Catalog.
 *
 * Shared by `syntheticFlightEngine.js`, `VehiclesMobilityModule.vue`, and
 * `experiencesCatalogAdapter.js` so Sovereign UI & unit tests remain 100%
 * decoupled from Cesium imports.
 */

export const AIRPORT_WAYPOINTS = Object.freeze({
  ATL: {
    name: 'Atlanta (Hartsfield-Jackson)',
    lon: -84.4281,
    lat: 33.6407,
    elev: 313,
  },
  PDK: {
    name: 'Peachtree DeKalb Airport (Atlanta)',
    lon: -84.302,
    lat: 33.8756,
    elev: 306,
  },
  CLT: {
    name: 'Charlotte Douglas Intl',
    lon: -80.9431,
    lat: 35.214,
    elev: 228,
  },
  JFK: {
    name: 'New York (John F. Kennedy)',
    lon: -73.7781,
    lat: 40.6413,
    elev: 4,
  },
  LHR: { name: 'London Heathrow', lon: -0.4543, lat: 51.47, elev: 25 },
  LAX: { name: 'Los Angeles Intl', lon: -118.4085, lat: 33.9416, elev: 38 },
  HND: { name: 'Tokyo Haneda', lon: 139.7798, lat: 35.5494, elev: 11 },
  CDG: {
    name: 'Paris Charles de Gaulle',
    lon: 2.5479,
    lat: 49.0097,
    elev: 119,
  },
  DXB: { name: 'Dubai Intl', lon: 55.3644, lat: 25.2532, elev: 19 },
  MIA: { name: 'Miami Intl', lon: -80.287, lat: 25.7959, elev: 3 },
  EYW: { name: 'Key West International', lon: -81.7596, lat: 24.5559, elev: 1 },
  FLL: {
    name: 'Fort Lauderdale-Hollywood',
    lon: -80.1528,
    lat: 26.0742,
    elev: 3,
  },
  MCO: { name: 'Orlando International', lon: -81.3089, lat: 28.4294, elev: 29 },
  TPA: { name: 'Tampa International', lon: -82.5332, lat: 27.9755, elev: 8 },
  RSW: {
    name: 'Southwest Florida (Fort Myers)',
    lon: -81.7552,
    lat: 26.5362,
    elev: 9,
  },
  PBI: {
    name: 'Palm Beach International',
    lon: -80.0956,
    lat: 26.6832,
    elev: 6,
  },
  SAV: { name: 'Savannah/Hilton Head', lon: -81.2021, lat: 32.1276, elev: 15 },
  ORD: { name: "Chicago O'Hare", lon: -87.9073, lat: 41.9742, elev: 204 },
  SFO: { name: 'San Francisco Intl', lon: -122.3789, lat: 37.6213, elev: 4 },
  SEA: { name: 'Seattle-Tacoma Intl', lon: -122.3088, lat: 47.4502, elev: 132 },
});

/**
 * Curated flagship flight & helicopter routes for Experiences Explorer.
 * Coordinates derive strictly from `AIRPORT_WAYPOINTS` (zero duplication).
 */
export const ICONIC_FLIGHT_ROUTES = Object.freeze([
  Object.freeze({
    id: 'mia_eyw_scenic',
    title: 'Miami to Key West — Overseas Scenic Hop',
    shortTitle: 'MIA → EYW',
    fromCode: 'MIA',
    toCode: 'EYW',
    region: 'Florida Keys, USA',
    summary:
      'Low-altitude scenic island-hopping approach along the Florida Keys reef chain.',
    cruiseAlt: 1524,
    isRotorcraft: false,
    aircraftType: 'airliner',
    tags: ['Flight', 'Scenic', 'Florida Keys', 'Coastal'],
  }),
  Object.freeze({
    id: 'pdk_atl_h145',
    title: 'Atlanta Skyline — Airbus H145 Heli Tour',
    shortTitle: 'H145 Atlanta',
    fromCode: 'PDK',
    toCode: 'ATL',
    region: 'Atlanta, GA · USA',
    summary:
      'Twin-engine Airbus H145 helicopter corridor from Peachtree DeKalb over Midtown to Hartsfield-Jackson.',
    cruiseAlt: 450,
    isRotorcraft: true,
    aircraftType: 'h145',
    tags: ['Helicopter', 'H145', 'Skyline', 'Atlanta'],
  }),
  Object.freeze({
    id: 'atl_mia_express',
    title: 'Atlanta to Miami — Southeast Jet Corridor',
    shortTitle: 'ATL → MIA',
    fromCode: 'ATL',
    toCode: 'MIA',
    region: 'Southeast USA',
    summary:
      'High-frequency commercial jet trunk linking Atlanta Hartsfield-Jackson to Miami International.',
    cruiseAlt: 10668,
    isRotorcraft: false,
    aircraftType: 'airliner',
    tags: ['Flight', 'Airliner', 'Southeast', 'Jet'],
  }),
  Object.freeze({
    id: 'lax_sfo_coastal',
    title: 'Los Angeles to San Francisco — Pacific Coast Jet',
    shortTitle: 'LAX → SFO',
    fromCode: 'LAX',
    toCode: 'SFO',
    region: 'California, USA',
    summary:
      'Iconic West Coast shuttle climbing out of LAX over Santa Monica Bay toward Golden Gate.',
    cruiseAlt: 9144,
    isRotorcraft: false,
    aircraftType: 'airliner',
    tags: ['Flight', 'California', 'Coastal', 'Jet'],
  }),
  Object.freeze({
    id: 'jfk_lhr_transatlantic',
    title: 'New York JFK to London Heathrow — Transatlantic',
    shortTitle: 'JFK → LHR',
    fromCode: 'JFK',
    toCode: 'LHR',
    region: 'North Atlantic',
    summary:
      'Flagship North Atlantic great-circle crossing from New York to London Heathrow.',
    cruiseAlt: 10668,
    isRotorcraft: false,
    aircraftType: 'airliner',
    tags: ['Flight', 'Transatlantic', 'International', 'Jet'],
  }),
  Object.freeze({
    id: 'hnd_lax_pacific',
    title: 'Tokyo Haneda to Los Angeles — Transpacific',
    shortTitle: 'HND → LAX',
    fromCode: 'HND',
    toCode: 'LAX',
    region: 'Pacific Rim',
    summary:
      'Long-haul great-circle crossing departing Tokyo Bay across the Pacific to Southern California.',
    cruiseAlt: 10668,
    isRotorcraft: false,
    aircraftType: 'airliner',
    tags: ['Flight', 'Transpacific', 'Tokyo', 'International'],
  }),
]);
