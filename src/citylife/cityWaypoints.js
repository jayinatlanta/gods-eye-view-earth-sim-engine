/**
 * Catalog of Global Living Cities, Sidewalk Offset Geometry & Kinematic Profiles.
 * (Living City Capability + Route Slice)
 *
 * Provides curated pedestrian corridors, park footways, coordinate centroids,
 * and pure geodetic sidewalk-projection vector math.
 */

import * as Cesium from 'cesium';

export const WALKER_SPEED_MIN_MS = 0.38;
export const WALKER_SPEED_MAX_MS = 0.58;
export const JOGGER_SPEED_MIN_MS = 0.85;
export const JOGGER_SPEED_MAX_MS = 1.15;

export const ALTITUDE_DEPTH_THRESHOLD_M = 1500;
export const ALTITUDE_EXIT_THRESHOLD_M = 2000;
export const SIMULATION_RADIUS_M = 1200;
export const CURB_DEFAULT_ELEV_M = 0.15;
export const SIDEWALK_DEFAULT_OFFSET_M = 4.5;

import { LIVING_CITIES } from './livingCitiesCatalog.js';
export { LIVING_CITIES };

/**
 * Calculates Great-Circle distance in meters between two lat/lon coordinates (WGS84).
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
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
 * Calculates initial bearing / heading in degrees (0-360) from point 1 to point 2.
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
 * Pure geodetic vector calculation: projects a point laterally onto the sidewalk
 * from a road centerline segment (P1 -> P2), offset by lateral meters and curb height.
 *
 * Vector formula:
 *   v = P2 - P1 (segment direction)
 *   u = geodetic surface normal at P1
 *   r = (v x u) / ||v x u|| (perpendicular right-hand vector)
 *   P_sidewalk = P1 + offsetMeters * r + curbElevMeters * u
 *
 * @param {Object} p1 - { lat, lon, elev }
 * @param {Object} p2 - { lat, lon, elev }
 * @param {number} offsetMeters - Lateral distance from road center (positive = right side, negative = left side)
 * @param {number} curbElevMeters - Height of curb above road mesh (default 0.15m)
 * @returns {Cesium.Cartesian3} WGS84 Cartesian position of the sidewalk point
 */
export function calculateSidewalkOffset(
  p1,
  p2,
  offsetMeters = SIDEWALK_DEFAULT_OFFSET_M,
  curbElevMeters = CURB_DEFAULT_ELEV_M,
) {
  const c1 = Cesium.Cartesian3.fromDegrees(p1.lon, p1.lat, p1.elev || 0);
  const c2 = Cesium.Cartesian3.fromDegrees(p2.lon, p2.lat, p2.elev || 0);

  // Segment forward direction
  const v = Cesium.Cartesian3.subtract(c2, c1, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(v) < 1e-6) {
    return Cesium.Cartesian3.fromDegrees(
      p1.lon,
      p1.lat,
      (p1.elev || 0) + curbElevMeters,
    );
  }

  // Geodetic surface normal at p1
  const u = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    c1,
    new Cesium.Cartesian3(),
  );

  // Perpendicular right-hand vector: r = normalize(v x u)
  const r = Cesium.Cartesian3.cross(v, u, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(r, r);

  // Sidewalk point: c1 + offsetMeters * r + curbElevMeters * u
  const scaledR = Cesium.Cartesian3.multiplyByScalar(
    r,
    offsetMeters,
    new Cesium.Cartesian3(),
  );
  const scaledU = Cesium.Cartesian3.multiplyByScalar(
    u,
    curbElevMeters,
    new Cesium.Cartesian3(),
  );

  const sidewalk = Cesium.Cartesian3.add(c1, scaledR, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(sidewalk, scaledU, sidewalk);
  return sidewalk;
}

/**
 * Finds the nearest living city in the catalog to a given lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @param {number} maxDistanceMeters - Maximum radius to match (default 35,000m / 35km)
 * @returns {Object|null} Matching city object or null
 */
export function findNearestCity(lat, lon, maxDistanceMeters = 35000) {
  let closest = null;
  let minDistance = Infinity;

  for (const city of Object.values(LIVING_CITIES)) {
    const dist = haversineDistanceMeters(lat, lon, city.lat, city.lon);
    if (dist < minDistance && dist <= maxDistanceMeters) {
      minDistance = dist;
      closest = { ...city, distanceMeters: dist };
    }
  }
  return closest;
}

export const CITY_QUERY_ALIASES = Object.freeze({
  la: 'los_angeles',
  'l.a.': 'los_angeles',
  hollywood: 'los_angeles',
  nyc: 'new_york',
  'new york city': 'new_york',
  sf: 'san_francisco',
  'cuidad de mexico': 'mexico_city',
  'ciudad de mexico': 'mexico_city',
  cdmx: 'mexico_city',
  'mexico city': 'mexico_city',
  mexico_city: 'mexico_city',
  df: 'mexico_city',
  hk: 'hong_kong',
  'hong kong': 'hong_kong',
  hong_kong: 'hong_kong',
  kowloon: 'hong_kong',
  'sao paulo': 'sao_paulo',
  sao_paulo: 'sao_paulo',
  'new delhi': 'delhi',
  new_delhi: 'delhi',
  delhi: 'delhi',
  'buenos aires': 'buenos_aires',
  buenos_aires: 'buenos_aires',
  mcmurdo: 'mcmurdo_station',
  antarctica: 'mcmurdo_station',
  mcmurdo_station: 'mcmurdo_station',
  'mcmurdo station': 'mcmurdo_station',
  'key largo': 'key_largo',
  key_largo: 'key_largo',
  'key loaner': 'key_largo',
  'key loaner house': 'key_largo',
  'florida keys': 'key_largo',
});

function normalizeCityQuery(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Resolves a city by ID or fuzzy text search.
 */
export function resolveCity(query) {
  if (!query) return LIVING_CITIES.atlanta;
  if (typeof query === 'object' && query.id && LIVING_CITIES[query.id]) {
    return LIVING_CITIES[query.id];
  }
  const clean = normalizeCityQuery(query);
  const underscoreClean = clean.replace(/[\s-]+/g, '_');
  const spaceClean = clean.replace(/[_-]+/g, ' ');

  const aliasedId =
    CITY_QUERY_ALIASES[clean] ||
    CITY_QUERY_ALIASES[underscoreClean] ||
    CITY_QUERY_ALIASES[spaceClean];
  if (aliasedId && LIVING_CITIES[aliasedId]) {
    return LIVING_CITIES[aliasedId];
  }

  if (LIVING_CITIES[clean]) return LIVING_CITIES[clean];
  if (LIVING_CITIES[underscoreClean]) return LIVING_CITIES[underscoreClean];

  for (const [id, city] of Object.entries(LIVING_CITIES)) {
    const normName = normalizeCityQuery(city.name);
    if (
      id.includes(underscoreClean) ||
      normName.includes(spaceClean) ||
      spaceClean.includes(normName)
    ) {
      return city;
    }
  }
  return LIVING_CITIES.atlanta;
}
