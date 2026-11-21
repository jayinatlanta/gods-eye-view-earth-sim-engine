/**
 * Universal Place Resolver & Macro Spatial Relationship Engine.
 * (Universal Place-to-Place Spatial Relationship & Multi-Modal Corridor Explorer)
 *
 * Zero-brittleness resolution for ANY pair of places on Earth across:
 * 1. Coordinate pairs ("lat, lon") & coordinate objects
 * 2. Claimed Custom Domiciles (domicileCatalog)
 * 3. Dedicated Helipad Network (helipadCatalog)
 * 4. Major Global Airport Hubs (AIRPORT_WAYPOINTS)
 * 5. Global Metropolitan Gazetteer (MAJOR_WORLD_METROS + aliases)
 * 6. Keyless /api/geocode?q=... (Nominatim proxy)
 *
 * Computes pure macro spatial relationship metrics: great-circle distance (km/mi/NM),
 * spherical geodesic midpoint, initial/reverse bearings + 16-point cardinal labels,
 * solar/timezone offset, elevation delta, domestic vs. cross-border classification,
 * offline Natural Earth physiographic context, and proportional orbital camera framing.
 */

import {
  greatCircleKm,
  greatCircleMeters,
  isGeoPoint,
} from '../geoDistance.js';
import { naturalRegionAtPoint } from '../data/naturalEarthRegions.js';
import { MAJOR_WORLD_METROS } from '../ui/worldSimDock.js';
import { AIRPORT_WAYPOINTS } from '../flight/syntheticFlightEngine.js';
import { HELIPAD_WAYPOINTS } from '../flight/helipadCatalog.js';
import { getAllDomiciles } from '../layers/estates/domicileCatalog.js';
import { estimateWaypointElevation } from '../drive/driveWaypoints.js';
import { geocodeKeyless } from '../keylessGeocoder.js';
import { placeBelow, searchPopulatedPlaceByName } from '../data/placeBelow.js';

const KM_TO_MILES = 0.62137119;
const KM_TO_NM = 0.5399568;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const CARDINAL_16 = Object.freeze([
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]);

const US_STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
]);

const CITY_ALIASES = Object.freeze({
  cdmx: 'mexico city',
  'ciudad de mexico': 'mexico city',
  'mexico df': 'mexico city',
  nyc: 'new york city',
  'new york': 'new york city',
  manhattan: 'new york city',
  la: 'los angeles',
  sf: 'san francisco',
  dc: 'washington',
  'washington dc': 'washington',
  'washington d c': 'washington',
  bengaluru: 'bangalore',
  kyiv: 'kiev',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  peking: 'beijing',
  saigon: 'ho chi minh city',
  mcmurdo: 'mcmurdo station',
});

const COUNTRY_CANONICAL_MAP = Object.freeze({
  usa: 'united states',
  us: 'united states',
  'u s a': 'united states',
  'united states of america': 'united states',
  'united states': 'united states',
  uk: 'united kingdom',
  'u k': 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  'united kingdom': 'united kingdom',
  uae: 'united arab emirates',
  'united arab emirates': 'united arab emirates',
  mexico: 'mexico',
  mx: 'mexico',
});

/**
 * Normalize a place query or name for diacritic-insensitive matching.
 */
export function normalizePlaceQuery(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9,.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(raw) {
  return normalizePlaceQuery(raw)
    .replace(/[.,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCountryName(country) {
  const token = normalizeToken(country);
  if (!token) return '';
  return COUNTRY_CANONICAL_MAP[token] || token;
}

function inferCountryFromRegion(region) {
  if (!region) return { country: null, countryCode: null };
  const clean = String(region).trim();
  const upper = clean.toUpperCase();
  if (US_STATE_CODES.has(upper)) {
    return { country: 'United States', countryCode: 'US' };
  }
  if (clean === 'UK') {
    return { country: 'United Kingdom', countryCode: 'GB' };
  }
  if (clean === 'UAE') {
    return { country: 'United Arab Emirates', countryCode: 'AE' };
  }
  return { country: clean, countryCode: null };
}

/**
 * Parse a coordinate string ("lat, lon") or coordinate object ({ lat, lon }).
 */
export function parseCoordinateQuery(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const lat = Number(raw.lat);
    const lon = Number(raw.lon ?? raw.lng);
    if (isGeoPoint({ lat, lon })) {
      return {
        name:
          raw.name ||
          raw.shortName ||
          raw.label ||
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        displayName:
          raw.displayName ||
          raw.name ||
          `Coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
        lat,
        lon,
        elev: estimateWaypointElevation(lat, lon, raw.elev),
        country: raw.country || null,
        countryCode: raw.countryCode || null,
        region: raw.region || null,
        source: raw.source || 'coordinates',
        code: raw.code || null,
        type: raw.type || null,
      };
    }
    return null;
  }

  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!isGeoPoint({ lat, lon })) return null;
  return {
    name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    displayName: `Coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    lat,
    lon,
    elev: estimateWaypointElevation(lat, lon, undefined),
    country: null,
    countryCode: null,
    region: null,
    source: 'coordinates',
    code: null,
    type: null,
  };
}

/**
 * Extract normalized endpoint data from /api/geocode (Nominatim) or mock payloads.
 */
export function extractGeocodeCandidate(payload, fallbackQuery = '') {
  const first = Array.isArray(payload?.results)
    ? payload.results[0]
    : Array.isArray(payload)
      ? payload[0]
      : payload;
  if (!first || typeof first !== 'object') return null;

  const loc = first.geometry?.location;
  const lat = Number(loc?.lat ?? first.lat);
  const lon = Number(loc?.lng ?? loc?.lon ?? first.lon ?? first.lng);
  if (!isGeoPoint({ lat, lon })) return null;

  const formatted = String(
    first.formatted_address || first.display_name || first.name || '',
  ).trim();
  const primaryComponent = first.address_components?.[0]?.long_name;
  const displayParts = formatted
    ? formatted
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const shortName = String(
    primaryComponent || first.name || displayParts[0] || fallbackQuery,
  ).trim();
  const addr = first.address || {};
  const components = Array.isArray(first.address_components)
    ? first.address_components
    : [];
  const findComponent = (type) =>
    components.find((c) => Array.isArray(c?.types) && c.types.includes(type));
  const countryComp = findComponent('country');
  const regionComp =
    findComponent('administrative_area_level_1') ||
    findComponent('administrative_area_level_2');

  const country =
    addr.country ||
    countryComp?.long_name ||
    first.country ||
    (displayParts.length >= 2 ? displayParts[displayParts.length - 1] : null) ||
    null;
  const rawCode =
    addr.country_code || countryComp?.short_name || first.countryCode || null;
  const countryCode = rawCode ? String(rawCode).toUpperCase() : null;
  const region =
    addr.state ||
    addr.province ||
    addr.region ||
    regionComp?.long_name ||
    first.region ||
    (displayParts.length >= 3 ? displayParts[displayParts.length - 2] : null) ||
    null;

  return {
    name: shortName || fallbackQuery || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    displayName: formatted || shortName || fallbackQuery,
    lat,
    lon,
    elev: estimateWaypointElevation(lat, lon, first.elev),
    country,
    countryCode,
    region,
    bounds: first.geometry?.viewport || first.geometry?.bounds || null,
    source: 'geocode',
    code: null,
    type: first.types?.[0] || first.type || null,
  };
}

function matchMetroGazetteer(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const commaIdx = raw.indexOf(',');
  const cityPartRaw = commaIdx >= 0 ? raw.slice(0, commaIdx) : raw;
  const qualPartRaw = commaIdx >= 0 ? raw.slice(commaIdx + 1) : '';
  const cityNorm = normalizeToken(cityPartRaw);
  const qualNorm = normalizeToken(qualPartRaw);
  const canonicalCity = CITY_ALIASES[cityNorm] || cityNorm;

  if (!canonicalCity) return null;

  for (const metro of MAJOR_WORLD_METROS || []) {
    const metroNameNorm = normalizeToken(metro.name);
    if (metroNameNorm !== canonicalCity) continue;

    if (qualNorm) {
      const regionNorm = normalizeToken(metro.region);
      const inferred = inferCountryFromRegion(metro.region);
      const inferredCountryNorm = normalizeToken(inferred.country);
      const inferredCodeNorm = normalizeToken(inferred.countryCode);
      const matchesQualifier =
        regionNorm === qualNorm ||
        inferredCountryNorm === qualNorm ||
        (inferredCodeNorm && inferredCodeNorm === qualNorm) ||
        (qualNorm === 'usa' && inferredCodeNorm === 'us');
      if (!matchesQualifier) {
        // Explicit qualifier ("Paris, TX" vs "Paris, France") -> let geocoder handle it
        return null;
      }
    }

    const { country, countryCode } = inferCountryFromRegion(metro.region);
    return {
      name: metro.name,
      displayName: metro.region ? `${metro.name}, ${metro.region}` : metro.name,
      lat: metro.lat,
      lon: metro.lon,
      elev: estimateWaypointElevation(metro.lat, metro.lon, undefined),
      country,
      countryCode,
      region: metro.region || null,
      source: 'gazetteer',
      code: null,
      type: 'city',
    };
  }
  return null;
}

function matchAirportOrHelipad(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();
  const norm = normalizeToken(trimmed);

  // 1. Helipad exact code / ID / name
  for (const pad of Object.values(HELIPAD_WAYPOINTS || {})) {
    if (
      pad.code?.toUpperCase() === upper ||
      pad.id?.toLowerCase() === trimmed.toLowerCase() ||
      normalizeToken(pad.shortName) === norm ||
      normalizeToken(pad.name) === norm
    ) {
      return {
        name: pad.shortName || pad.name,
        displayName: pad.name,
        lat: pad.lat,
        lon: pad.lon,
        elev: estimateWaypointElevation(pad.lat, pad.lon, pad.elev),
        country: 'United States',
        countryCode: 'US',
        region: pad.region || null,
        source: 'helipad',
        code: pad.code,
        type: pad.type || 'helipad',
      };
    }
  }

  // 2. Airport IATA / 4-letter US ICAO / exact name
  const iataKey =
    AIRPORT_WAYPOINTS[upper] !== undefined
      ? upper
      : upper.length === 4 &&
          upper.startsWith('K') &&
          AIRPORT_WAYPOINTS[upper.slice(1)]
        ? upper.slice(1)
        : null;

  if (iataKey && AIRPORT_WAYPOINTS[iataKey]) {
    const wp = AIRPORT_WAYPOINTS[iataKey];
    const usAirports = new Set([
      'ATL',
      'PDK',
      'CLT',
      'JFK',
      'LAX',
      'MIA',
      'EYW',
      'FLL',
      'MCO',
      'TPA',
      'RSW',
      'PBI',
      'SAV',
      'ORD',
      'SFO',
      'SEA',
    ]);
    return {
      name: `${wp.name} (${iataKey})`,
      displayName: `${wp.name} (${iataKey})`,
      lat: wp.lat,
      lon: wp.lon,
      elev: estimateWaypointElevation(wp.lat, wp.lon, wp.elev),
      country: usAirports.has(iataKey) ? 'United States' : null,
      countryCode: usAirports.has(iataKey) ? 'US' : null,
      region: null,
      source: 'airport',
      code: iataKey,
      type: 'airport',
    };
  }

  return null;
}

function matchDomicile(query, getDomiciles = getAllDomiciles) {
  if (
    !query ||
    typeof query !== 'string' ||
    typeof getDomiciles !== 'function'
  ) {
    return null;
  }
  const norm = normalizeToken(query);
  if (!norm) return null;
  let list = [];
  try {
    list = getDomiciles() || [];
  } catch {
    return null;
  }
  for (const d of list) {
    const primaryName = String(
      d.title || d.name || d.shortLabel || d.id || '',
    ).trim();
    const locationLabel = String(d.city || d.address || '').trim() || null;
    const coordLabel =
      Number.isFinite(d.lat) && Number.isFinite(d.lon)
        ? `${Number(d.lat).toFixed(3)}, ${Number(d.lon).toFixed(3)}`
        : null;
    const candidates = [
      d.id,
      d.title,
      d.name,
      d.shortLabel,
      locationLabel && primaryName ? `${primaryName} (${locationLabel})` : null,
      coordLabel && primaryName ? `${primaryName} (${coordLabel})` : null,
    ].filter(Boolean);

    if (candidates.some((c) => normalizeToken(c) === norm)) {
      const displayName =
        locationLabel &&
        !normalizeToken(primaryName).includes(normalizeToken(locationLabel))
          ? `${primaryName} (${locationLabel})`
          : primaryName;
      return {
        name: primaryName,
        displayName,
        lat: d.lat,
        lon: d.lon,
        elev: estimateWaypointElevation(d.lat, d.lon, d.elev),
        country: null,
        countryCode: null,
        region: locationLabel,
        source: 'domicile',
        code: null,
        type: 'domicile',
      };
    }
  }
  return null;
}

async function normalizeSearchCandidate(place, fallbackQuery, source) {
  if (!place || typeof place !== 'object') return null;
  const lat = Number(place.lat);
  const lon = Number(place.lng ?? place.lon);
  if (!isGeoPoint({ lat, lon })) return null;

  const label = String(place.label || place.name || fallbackQuery || '').trim();
  const labelParts = label
    ? label
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const shortName = String(place.name || labelParts[0] || fallbackQuery).trim();

  let country = null;
  let countryCode = null;
  let region = null;
  try {
    const below = await placeBelow(lat, lon);
    if (below?.kind === 'country') {
      country = below.name || null;
      countryCode = below.countryCode || null;
      region = below.division || null;
    }
  } catch {
    /* offline pack optional in constrained test sandboxes */
  }
  if (!country && labelParts.length >= 2) {
    country = labelParts[labelParts.length - 1];
  }
  if (!region && labelParts.length >= 3) {
    region = labelParts[labelParts.length - 2];
  }

  return {
    name: shortName || fallbackQuery || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    displayName: label || shortName || fallbackQuery,
    lat,
    lon,
    elev: estimateWaypointElevation(lat, lon, undefined),
    country,
    countryCode,
    region,
    bounds: place.viewport || null,
    source,
    code: null,
    type: Array.isArray(place.types) ? place.types[0] || null : null,
  };
}

async function resolveOfflinePopulatedPlace(
  query,
  { qualify = false, offlinePlaces = searchPopulatedPlaceByName } = {},
) {
  if (typeof offlinePlaces !== 'function') return null;
  try {
    const match = await offlinePlaces(query, { qualify });
    if (!match || !isGeoPoint({ lat: match.lat, lon: match.lon })) return null;
    const region = match.division || null;
    const country = match.country || null;
    const displayName = [match.name, region, country]
      .filter(Boolean)
      .join(', ');
    return {
      name: match.name,
      displayName: displayName || match.name,
      lat: match.lat,
      lon: match.lon,
      elev: estimateWaypointElevation(match.lat, match.lon, undefined),
      country,
      countryCode: match.countryCode || null,
      region,
      bounds: null,
      source: 'natural-earth-places',
      code: null,
      type: 'city',
    };
  } catch {
    return null;
  }
}

/**
 * Resolve any place query (name, city, IATA/ICAO code, helipad, claimed estate, or "lat, lon")
 * into a normalized geographic endpoint. Zero hardcoded city-pair assumptions.
 */
export async function resolvePlaceEndpoint(
  query,
  {
    fetchImpl = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null,
    signal,
    getDomiciles = getAllDomiciles,
    placeSearch = null,
    offlinePlaces = searchPopulatedPlaceByName,
  } = {},
) {
  if (!query) return null;

  // 1. Direct coordinates ("33.749, -84.388") or coordinate object
  const coordResult = parseCoordinateQuery(query);
  if (coordResult) {
    return coordResult;
  }

  if (typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 2. Claimed Custom Domiciles
  const domicileMatch = matchDomicile(trimmed, getDomiciles);
  if (domicileMatch) return domicileMatch;

  // 3. Dedicated Helipads & Airports (IATA / ICAO)
  const aviationMatch = matchAirportOrHelipad(trimmed);
  if (aviationMatch) return aviationMatch;

  // 4. Global Metropolitan Gazetteer
  const metroMatch = matchMetroGazetteer(trimmed);
  if (metroMatch) return metroMatch;

  // 5. Offline 7,342-city Natural Earth gazetteer for unqualified city names (no comma or digits)
  if (!trimmed.includes(',') && !/\d/.test(trimmed)) {
    const offlineCity = await resolveOfflinePopulatedPlace(trimmed, {
      qualify: false,
      offlinePlaces,
    });
    if (offlineCity) return offlineCity;
  }

  // 6. Unified App placeSearch pipeline (Google Geocoder -> Keyless Photon -> Local Nominatim)
  if (typeof placeSearch?.geocode === 'function') {
    try {
      const outcome = await placeSearch.geocode(trimmed, { signal });
      const normalized = await normalizeSearchCandidate(
        outcome?.place,
        trimmed,
        'placeSearch',
      );
      if (normalized) return normalized;
    } catch {
      if (signal?.aborted) throw signal.reason;
    }
  }

  // 7. Keyless Photon (global OSM geocoder) + /api/geocode?q=... fallback
  if (typeof fetchImpl === 'function') {
    try {
      const photonPlace = await geocodeKeyless(trimmed, {
        fetchImpl,
        signal,
        timeoutMs: 14_000,
      });
      const normalized = await normalizeSearchCandidate(
        photonPlace,
        trimmed,
        'photon',
      );
      if (normalized) return normalized;
    } catch {
      if (signal?.aborted) throw signal.reason;
    }

    try {
      const res = await fetchImpl(
        `/api/geocode?q=${encodeURIComponent(trimmed)}`,
        signal ? { signal } : undefined,
      );
      if (res?.ok) {
        const payload = await res.json();
        const candidate = extractGeocodeCandidate(payload, trimmed);
        if (candidate) return candidate;
      }
    } catch {
      if (signal?.aborted) throw signal.reason;
    }
  }

  // 8. Final offline comma-qualified fallback (e.g. "Aguascalientes, Mexico") if network is down
  if (trimmed.includes(',') && !/\d/.test(trimmed)) {
    const qualifiedOffline = await resolveOfflinePopulatedPlace(trimmed, {
      qualify: true,
      offlinePlaces,
    });
    if (qualifiedOffline) return qualifiedOffline;
  }

  return null;
}

/**
 * Compute initial true-north compass bearing in degrees [0, 360) from A to B.
 */
export function calculateInitialBearingDeg(from, to) {
  if (!isGeoPoint(from) || !isGeoPoint(to)) return 0;
  const phi1 = from.lat * DEG_TO_RAD;
  const phi2 = to.lat * DEG_TO_RAD;
  const deltaLambda = (to.lon - from.lon) * DEG_TO_RAD;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const brng = Math.atan2(y, x) * RAD_TO_DEG;
  return (brng + 360) % 360;
}

/**
 * Convert bearing degrees to 16-point compass cardinal label (N, NNE, NE, ...).
 */
export function bearingToCardinal16(deg) {
  if (!Number.isFinite(deg)) return 'N';
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return CARDINAL_16[idx];
}

/**
 * Compute spherical geodesic midpoint between two { lat, lon } endpoints (handles antimeridian).
 */
export function computeGeodesicMidpoint(from, to) {
  if (!isGeoPoint(from) || !isGeoPoint(to)) return { lat: 0, lon: 0 };
  const lat1 = from.lat * DEG_TO_RAD;
  const lon1 = from.lon * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const lon2 = to.lon * DEG_TO_RAD;

  const x1 = Math.cos(lat1) * Math.cos(lon1);
  const y1 = Math.cos(lat1) * Math.sin(lon1);
  const z1 = Math.sin(lat1);

  const x2 = Math.cos(lat2) * Math.cos(lon2);
  const y2 = Math.cos(lat2) * Math.sin(lon2);
  const z2 = Math.sin(lat2);

  const xm = x1 + x2;
  const ym = y1 + y2;
  const zm = z1 + z2;
  const mag = Math.hypot(xm, ym, zm);
  if (mag < 1e-9) {
    return {
      lat: (from.lat + to.lat) / 2,
      lon: (from.lon + to.lon) / 2,
    };
  }
  const latM = Math.atan2(zm, Math.hypot(xm, ym)) * RAD_TO_DEG;
  const lonM = Math.atan2(ym, xm) * RAD_TO_DEG;
  return {
    lat: Number(latM.toFixed(5)),
    lon: Number(lonM.toFixed(5)),
  };
}

/**
 * Compute shortest-wrap solar longitude time delta in hours (Destination - Origin).
 */
export function computeSolarTimeDeltaHours(fromLon, toLon) {
  if (!Number.isFinite(fromLon) || !Number.isFinite(toLon)) return 0;
  let deltaLon = toLon - fromLon;
  if (deltaLon > 180) deltaLon -= 360;
  if (deltaLon < -180) deltaLon += 360;
  return Number((deltaLon / 15).toFixed(1));
}

export function formatSolarOffset(deltaHours) {
  if (!Number.isFinite(deltaHours) || Math.abs(deltaHours) < 0.2) {
    return 'Same solar meridian';
  }
  const sign = deltaHours > 0 ? '+' : '';
  return `${sign}${deltaHours.toFixed(1)}h solar`;
}

/**
 * Compute proportional orbital camera framing altitude from great-circle distance.
 */
export function computeProportionalFramingAltitude(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 120_000;
  return Math.min(
    18_000_000,
    Math.max(120_000, Math.round(distanceKm * 1_650)),
  );
}

function determineCrossBorder(origin, destination) {
  const c1 = normalizeCountryName(origin?.countryCode || origin?.country || '');
  const c2 = normalizeCountryName(
    destination?.countryCode || destination?.country || '',
  );
  if (!c1 || !c2) return null;
  return c1 !== c2;
}

/**
 * Compute full macro spatial relationship metrics between two resolved endpoints.
 */
export async function analyzePlaceRelationship(
  originInput,
  destinationInput,
  {
    naturalRegionResolver = naturalRegionAtPoint,
    fetchImpl = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null,
    signal,
    getDomiciles = getAllDomiciles,
    placeSearch = null,
    offlinePlaces = searchPopulatedPlaceByName,
  } = {},
) {
  const resolveOpts = {
    fetchImpl,
    signal,
    getDomiciles,
    placeSearch,
    offlinePlaces,
  };
  const [origin, destination] = await Promise.all([
    isGeoPoint(originInput) && originInput?.name
      ? originInput
      : resolvePlaceEndpoint(originInput, resolveOpts),
    isGeoPoint(destinationInput) && destinationInput?.name
      ? destinationInput
      : resolvePlaceEndpoint(destinationInput, resolveOpts),
  ]);

  if (!origin) {
    throw new Error(
      `Could not resolve Origin: "${typeof originInput === 'string' ? originInput : 'input'}"`,
    );
  }
  if (!destination) {
    throw new Error(
      `Could not resolve Destination: "${typeof destinationInput === 'string' ? destinationInput : 'input'}"`,
    );
  }
  if (!isGeoPoint(origin) || !isGeoPoint(destination)) {
    throw new Error('Valid origin and destination coordinates are required');
  }

  const distKm = greatCircleKm(origin, destination);
  const distMeters = greatCircleMeters(origin, destination);
  const distMi = distKm * KM_TO_MILES;
  const distNm = distKm * KM_TO_NM;

  const midpoint = computeGeodesicMidpoint(origin, destination);
  const initialBearingDeg = Math.round(
    calculateInitialBearingDeg(origin, destination),
  );
  const reverseBearingDeg = Math.round(
    calculateInitialBearingDeg(destination, origin),
  );
  const initialCardinal = bearingToCardinal16(initialBearingDeg);
  const reverseCardinal = bearingToCardinal16(reverseBearingDeg);

  const solarDeltaHours = computeSolarTimeDeltaHours(
    origin.lon,
    destination.lon,
  );
  const solarDeltaLabel = formatSolarOffset(solarDeltaHours);

  const originElev = estimateWaypointElevation(
    origin.lat,
    origin.lon,
    origin.elev,
  );
  const destElev = estimateWaypointElevation(
    destination.lat,
    destination.lon,
    destination.elev,
  );
  const elevationDeltaM = Math.round(destElev - originElev);
  const elevationTrend =
    elevationDeltaM > 35
      ? 'climb'
      : elevationDeltaM < -35
        ? 'descent'
        : 'level';

  const isCrossBorder = determineCrossBorder(origin, destination);

  let originRegion = null;
  let destinationRegion = null;
  let midpointRegion = null;
  if (typeof naturalRegionResolver === 'function') {
    try {
      [originRegion, destinationRegion, midpointRegion] = await Promise.all([
        naturalRegionResolver(origin.lat, origin.lon).catch(() => null),
        naturalRegionResolver(destination.lat, destination.lon).catch(
          () => null,
        ),
        naturalRegionResolver(midpoint.lat, midpoint.lon).catch(() => null),
      ]);
    } catch {
      /* offline physiographic pack optional */
    }
  }

  const altitudeM = computeProportionalFramingAltitude(distKm);

  return {
    origin: { ...origin, elev: originElev },
    destination: { ...destination, elev: destElev },
    greatCircleKm: Number(distKm.toFixed(1)),
    greatCircleMi: Number(distMi.toFixed(1)),
    greatCircleNm: Number(distNm.toFixed(1)),
    greatCircleMeters: Math.round(distMeters),
    midpoint,
    initialBearingDeg,
    initialCardinal,
    reverseBearingDeg,
    reverseCardinal,
    solarDeltaHours,
    solarDeltaLabel,
    elevationDeltaM,
    elevationTrend,
    isCrossBorder,
    physiographicContext: {
      originRegion: originRegion?.region || null,
      originKind: originRegion?.kind || null,
      destinationRegion: destinationRegion?.region || null,
      destinationKind: destinationRegion?.kind || null,
      midpointRegion: midpointRegion?.region || null,
      midpointKind: midpointRegion?.kind || null,
    },
    framing: {
      centerLat: midpoint.lat,
      centerLon: midpoint.lon,
      altitudeM,
      pitchDeg: -62,
    },
  };
}
