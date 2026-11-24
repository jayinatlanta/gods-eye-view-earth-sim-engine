/**
 * Helipad Network & Dedicated Rotorcraft Waypoint Catalog.
 * (Multi-Modal Planetary Travel & Meditative Rotorcraft Simulator)
 *
 * Catalogs dedicated rotorcraft landing facilities across North America:
 * - General Aviation & Corporate Ramps (KPDK Epps/Signature)
 * - Skyscraper & Urban Rooftops (191 Peachtree Tower, Manhattan 6N5)
 * - Trauma Centers & Emergency Pads (Emory / Grady Level 1)
 * - Regional & Sanctuary Helipads (Civic Overlook, Alpine Ridge, Coastal Marsh)
 */

export const HELIPAD_WAYPOINTS = Object.freeze({
  PDK_PAD: {
    id: 'helipad_pdk_epps',
    code: 'PDK_PAD',
    name: 'KPDK Signature/Epps Helipad (Atlanta)',
    shortName: 'KPDK Helipad',
    lat: 33.876,
    lon: -84.3035,
    elev: 306,
    type: 'airport_helipad',
    region: 'Atlanta, GA',
    description:
      'Peachtree DeKalb Airport corporate ramp & personal fleet rotorcraft base',
  },
  '191_ATL': {
    id: 'helipad_downtown_atl',
    code: '191_ATL',
    name: '191 Peachtree Rooftop Heliport (Atlanta)',
    shortName: '191 Peachtree',
    lat: 33.7588,
    lon: -84.3876,
    elev: 480,
    type: 'rooftop_helipad',
    region: 'Downtown Atlanta',
    description: 'Towering downtown skyline helipad above Peachtree Street',
  },
  GRADY_PAD: {
    id: 'helipad_emory_grady',
    code: 'GRADY_PAD',
    name: 'Grady / Emory Trauma Center Helipad',
    shortName: 'Grady Trauma Pad',
    lat: 33.7512,
    lon: -84.3828,
    elev: 330,
    type: 'hospital_helipad',
    region: 'Atlanta, GA',
    description: 'Level 1 Trauma Center emergency life-flight helipad',
  },
  CIVIC_PAD: {
    id: 'helipad_civic_district',
    code: 'CIVIC_PAD',
    name: 'Austin Zilker Overlook Helipad',
    shortName: 'Zilker Overlook Pad',
    lat: 30.2672,
    lon: -97.7431,
    elev: 165,
    type: 'estate_helipad',
    region: 'Central Texas Overlook',
    description: 'Parkside landing clearing near scenic riverfront quarter',
  },
  ALPINE_RIDGE_PAD: {
    id: 'helipad_alpine_ridge',
    code: 'ALPINE_RIDGE_PAD',
    name: 'Alpine Ridge Sanctuary Helipad',
    shortName: 'Alpine Ridge Pad',
    lat: 34.864,
    lon: -84.324,
    elev: 540,
    type: 'mountain_helipad',
    region: 'North Georgia Mountains',
    description: 'Scenic alpine meadow pad with mountain overlook windsock',
  },
  COASTAL_MARSH_PAD: {
    id: 'helipad_coastal_marsh',
    code: 'COASTAL_MARSH_PAD',
    name: 'Coastal Tidal Marsh Helipad',
    shortName: 'Coastal Marsh Pad',
    lat: 31.954,
    lon: -81.042,
    elev: 8,
    type: 'coastal_helipad',
    region: 'Savannah Coast, GA',
    description: 'Salt-marsh dock landing platform on the Georgia tidal coast',
  },
  '6N5': {
    id: 'helipad_manhattan_east_river',
    code: '6N5',
    name: 'Manhattan 34th St Heliport (6N5)',
    shortName: 'Manhattan 34th St',
    lat: 40.7425,
    lon: -73.9719,
    elev: 4,
    type: 'urban_heliport',
    region: 'New York City, NY',
    description: 'Iconic East River heliport serving Manhattan skyline',
  },
  STAR_ISLAND_PAD: {
    id: 'helipad_star_island_orlando',
    code: 'STAR_ISLAND_PAD',
    name: 'Lake Cecile Resort Helipad (Kissimmee / Orlando)',
    shortName: 'Lake Cecile Helipad',
    lat: 28.3312,
    lon: -81.4845,
    elev: 27,
    type: 'resort_helipad',
    region: 'Kissimmee / Orlando, FL',
    description:
      'Lakeside resort helipad off Avenue of the Stars serving Orlando & Walt Disney World rotorcraft hops',
  },
});

export function getAllHelipads() {
  return Object.values(HELIPAD_WAYPOINTS);
}

export function getHelipadById(id) {
  if (!id) return null;
  const clean = String(id).trim().toLowerCase();
  return (
    getAllHelipads().find(
      (h) => h.id.toLowerCase() === clean || h.code.toLowerCase() === clean,
    ) || null
  );
}

export function resolveHelipad(query) {
  if (!query || typeof query !== 'string') return null;
  const clean = query.trim().toUpperCase();

  if (HELIPAD_WAYPOINTS[clean]) {
    return HELIPAD_WAYPOINTS[clean];
  }

  for (const pad of getAllHelipads()) {
    if (
      pad.code.toUpperCase() === clean ||
      pad.id.toUpperCase() === clean ||
      pad.name.toUpperCase().includes(clean) ||
      pad.shortName.toUpperCase().includes(clean)
    ) {
      return pad;
    }
  }

  return null;
}

export function findNearestHelipad(lat, lon) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return HELIPAD_WAYPOINTS.PDK_PAD;
  }
  let best = null;
  let minDistanceSq = Number.POSITIVE_INFINITY;

  for (const pad of getAllHelipads()) {
    const dLat = pad.lat - lat;
    const dLon = pad.lon - lon;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      best = pad;
    }
  }

  return best || HELIPAD_WAYPOINTS.PDK_PAD;
}
