/**
 * Custom Domiciles Catalog, Dynamic Property Claim Scout & Geodetic Footprints.
 * (Domiciles, Estates & Personal Fleet Terminal)
 *
 * Implements:
 * - User-claimed Primary Residence, Vacation Sanctuary, and Venture Studio HQ
 * - Dynamic viewport / search / globe-click property claiming anywhere on Earth
 *   across 3 archetypes:
 *   1. PRIMARY_RESIDENCE ("Own Home")
 *   2. VACATION_SANCTUARY ("Own Vacation Property")
 *   3. VENTURE_HQ ("Own Workplace / Venture HQ")
 * - Automatic geodetic parcel boundary generation, driveway & doorstep anchor points,
 *   waterfront boat slip anchor, and nearest rapid transit station resolution
 * - Persistent browser localStorage registry (`gev_personal_estates_v1`) + listener hooks
 */

import { resolveZeroCreditLocality } from '../../ui/worldSimDock.js';
import { RAPID_TRANSIT_ROUTES } from '../citylife/metroNetworkCatalog.js';

export const STORAGE_KEY = 'gev_personal_estates_v1';

export const DOMICILE_TYPOLOGIES = Object.freeze({
  PRIMARY_RESIDENCE: 'PRIMARY_RESIDENCE',
  VACATION_SANCTUARY: 'VACATION_SANCTUARY',
  VENTURE_HQ: 'VENTURE_HQ',
});

export const DOMICILE_TYPOLOGY_META = Object.freeze({
  PRIMARY_RESIDENCE: {
    id: 'PRIMARY_RESIDENCE',
    label: 'Primary Residence',
    shortLabel: 'Home',
    actionLabel: '🏡 Own Home',
    icon: '🏡',
    accentHex: '#22d3ee',
    fillRgba: [34, 211, 238, 0.22],
    outlineHex: '#67e8f9',
    defaultSchedule:
      'Morning Coffee on Deck · Neighborhood Stroll · Evening Porch',
  },
  VACATION_SANCTUARY: {
    id: 'VACATION_SANCTUARY',
    label: 'Vacation Sanctuary',
    shortLabel: 'Vacation',
    actionLabel: '🏖️ Own Vacation Property',
    icon: '🏖️',
    accentHex: '#10b981',
    fillRgba: [16, 185, 129, 0.22],
    outlineHex: '#34d399',
    defaultSchedule:
      'Dockside Sunrise · Village Cruiser Ride · Sunset Campfire',
  },
  VENTURE_HQ: {
    id: 'VENTURE_HQ',
    label: 'Workplace / Venture HQ',
    shortLabel: 'Workplace',
    actionLabel: '🏢 Own Workplace / HQ',
    icon: '🏢',
    accentHex: '#f59e0b',
    fillRgba: [245, 158, 11, 0.24],
    outlineHex: '#fbbf24',
    defaultSchedule: '08:00 Strategy Briefing · Operations Wall · Studio Hub',
  },
});

/**
 * Generates a realistic 6-point geodetic parcel boundary polygon around (lat, lon)
 * along with frontDoorPoint, drivewayPoint, and optional dockPoint.
 */
export function generateParcelFootprint(
  lat,
  lon,
  typology = DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
) {
  const safeLat = Number.isFinite(lat) ? lat : 30.2672;
  const safeLon = Number.isFinite(lon) ? lon : -97.7431;
  const cosLat = Math.max(0.2, Math.cos((safeLat * Math.PI) / 180));

  // ~38m x 46m residential/estate lot (larger ~55m x 60m for Venture HQ)
  const halfLatDeg =
    typology === DOMICILE_TYPOLOGIES.VENTURE_HQ ? 0.00026 : 0.00019;
  const halfLonDeg =
    (typology === DOMICILE_TYPOLOGIES.VENTURE_HQ ? 0.00028 : 0.00021) / cosLat;

  const boundaryPolygon = [
    { lat: safeLat + halfLatDeg, lon: safeLon - halfLonDeg },
    { lat: safeLat + halfLatDeg, lon: safeLon + halfLonDeg * 0.85 },
    { lat: safeLat + halfLatDeg * 0.2, lon: safeLon + halfLonDeg },
    { lat: safeLat - halfLatDeg, lon: safeLon + halfLonDeg },
    { lat: safeLat - halfLatDeg, lon: safeLon - halfLonDeg },
    { lat: safeLat + halfLatDeg, lon: safeLon - halfLonDeg },
  ];

  const frontDoorPoint = {
    lat: Number((safeLat - halfLatDeg * 0.35).toFixed(6)),
    lon: Number((safeLon - halfLonDeg * 0.15).toFixed(6)),
  };

  const drivewayPoint = {
    lat: Number((safeLat - halfLatDeg * 0.85).toFixed(6)),
    lon: Number((safeLon + halfLonDeg * 0.35).toFixed(6)),
  };

  const streetJoinPoint = {
    lat: Number((safeLat - halfLatDeg * 1.45).toFixed(6)),
    lon: Number((safeLon + halfLonDeg * 0.35).toFixed(6)),
  };

  const dockPoint = {
    lat: Number((safeLat + halfLatDeg * 1.35).toFixed(6)),
    lon: Number((safeLon + halfLonDeg * 0.55).toFixed(6)),
  };

  return {
    boundaryPolygon,
    frontDoorPoint,
    drivewayPoint,
    streetJoinPoint,
    dockPoint,
  };
}

/**
 * Haversine distance in miles between two coordinates.
 */
export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolves the nearest rapid transit station across all cataloged metro networks.
 */
export function findNearestMetroStation(lat, lon) {
  let best = null;
  let bestDistMiles = Infinity;

  if (RAPID_TRANSIT_ROUTES && typeof RAPID_TRANSIT_ROUTES === 'object') {
    for (const [routeKey, route] of Object.entries(RAPID_TRANSIT_ROUTES)) {
      const stations = route?.stations || [];
      for (const st of stations) {
        if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
        const d = haversineMiles(lat, lon, st.lat, st.lon);
        if (d < bestDistMiles) {
          bestDistMiles = d;
          best = {
            stationName: st.name,
            lineId: route.id || routeKey,
            lineName: route.lineName || routeKey,
            regionKey: route.cityId || 'atlanta',
            regionName: route.operator || 'Rapid Transit',
            lat: st.lat,
            lon: st.lon,
            distanceMiles: Number(d.toFixed(2)),
          };
        }
      }
    }
  }

  if (!best) {
    return {
      stationName: 'Downtown Austin Station',
      lineId: 'capmetro_red',
      lineName: 'Capital MetroRail Red Line',
      regionKey: 'austin',
      regionName: 'Austin, TX',
      lat: 30.2649,
      lon: -97.7385,
      distanceMiles: Number(
        haversineMiles(lat, lon, 30.2649, -97.7385).toFixed(2),
      ),
    };
  }
  return best;
}

export const KEY_LOANER_HOUSE_ID = 'key_loaner_house';

const KEY_LOANER_HOUSE_LAT = 25.089;
const KEY_LOANER_HOUSE_LON = -80.449;
const KEY_LOANER_FOOTPRINT = {
  ...generateParcelFootprint(
    KEY_LOANER_HOUSE_LAT,
    KEY_LOANER_HOUSE_LON,
    DOMICILE_TYPOLOGIES.VACATION_SANCTUARY,
  ),
  // Bayside waterfront lot: entry lane approaches from SE, real wooden pier extends NW into Florida Bay
  frontDoorPoint: { lat: 25.08892, lon: -80.44892 },
  drivewayPoint: { lat: 25.08874, lon: -80.44874 },
  streetJoinPoint: { lat: 25.08852, lon: -80.44852 },
  dockPoint: { lat: 25.08942, lon: -80.44942 },
};

export const EXEMPLAR_DOMICILES = Object.freeze([
  Object.freeze({
    id: KEY_LOANER_HOUSE_ID,
    title: 'Key Loaner House',
    subtitle:
      'Vacation Sanctuary · Starter Keys Loaner — Walk, Scooter Tour, Drive, Boat, Fly, or Ask AI to Build Any Activity',
    typology: DOMICILE_TYPOLOGIES.VACATION_SANCTUARY,
    lat: KEY_LOANER_HOUSE_LAT,
    lon: KEY_LOANER_HOUSE_LON,
    address: 'Key Largo, FL (MM 99 Bayside Waterfront)',
    isExemplar: true,
    isEasterEgg: true,
    claimedAt: '2026-11-01T00:00:00.000Z',
    source: 'starter_easter_egg',
    hasWaterfrontDock: true,
    highwayCorridor: 'Overseas Hwy (US-1) ➔ Florida Keys Scenic Corridor',
    highwayTarget: {
      lat: 25.0985,
      lon: -80.436,
      label: 'Overseas Hwy (US-1) Northbound — Key Largo',
    },
    waterwayTarget: {
      lat: 25.0925,
      lon: -80.4585,
      label: 'Florida Bay & Blackwater Sound Channel',
    },
    nearestTransit: findNearestMetroStation(
      KEY_LOANER_HOUSE_LAT,
      KEY_LOANER_HOUSE_LON,
    ),
    ventureTelemetry: null,
    ...KEY_LOANER_FOOTPRINT,
  }),
]);

let customDomiciles = [];
const registryListeners = new Set();

function createStarterDomiciles() {
  return EXEMPLAR_DOMICILES.map((d) => ({
    ...d,
    boundaryPolygon: d.boundaryPolygon.map((pt) => ({ ...pt })),
    frontDoorPoint: { ...d.frontDoorPoint },
    drivewayPoint: { ...d.drivewayPoint },
    streetJoinPoint: { ...d.streetJoinPoint },
    dockPoint: { ...d.dockPoint },
    highwayTarget: { ...d.highwayTarget },
    waterwayTarget: { ...d.waterwayTarget },
    nearestTransit: d.nearestTransit ? { ...d.nearestTransit } : null,
  }));
}

function loadStoredDomiciles() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createStarterDomiciles();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return createStarterDomiciles();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let migrated = false;
    const starterById = new Map(
      createStarterDomiciles().map((item) => [item.id, item]),
    );
    const list = parsed.filter(Boolean).map((entry) => {
      const fresh = starterById.get(entry.id);
      if (
        fresh &&
        entry.source === 'starter_easter_egg' &&
        Math.abs(Number(entry.lat) - 25.0865) < 0.0005 &&
        Math.abs(Number(entry.lon) - -80.4473) < 0.0005
      ) {
        migrated = true;
        return {
          ...fresh,
          title: entry.title || fresh.title,
        };
      }
      return entry;
    });
    if (migrated) saveStoredDomiciles(list);
    return list;
  } catch {
    return createStarterDomiciles();
  }
}

function saveStoredDomiciles(list) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

customDomiciles = loadStoredDomiciles();

function emitRegistryChange() {
  const all = getAllDomiciles();
  for (const cb of registryListeners) {
    try {
      cb(all);
    } catch {
      // ignore listener errors
    }
  }
}

export function onDomicileRegistryChange(callback) {
  if (typeof callback !== 'function') return () => {};
  registryListeners.add(callback);
  return () => registryListeners.delete(callback);
}

export function getAllDomiciles() {
  return [...customDomiciles];
}

export function getDomicileById(id) {
  if (!id) return customDomiciles[0] || null;
  const normalized = String(id).trim().toLowerCase();
  const all = getAllDomiciles();
  return (
    all.find((d) => d.id.toLowerCase() === normalized) ||
    all.find((d) => d.id.toLowerCase().includes(normalized)) ||
    all.find((d) => d.title.toLowerCase().includes(normalized)) ||
    customDomiciles[0] ||
    null
  );
}

/**
 * Renames a claimed domicile with a custom user-specified title.
 * (e.g. 'Civic District Residence', 'Mountain Cabin', etc.)
 *
 * @param {string} id
 * @param {string} newTitle
 * @returns {boolean} Whether the update succeeded
 */
export function renameDomicile(id, newTitle) {
  if (!id || !newTitle || !String(newTitle).trim()) return false;
  const trimmed = String(newTitle).trim();
  const target = customDomiciles.find((d) => d.id === id);
  if (!target) return false;

  target.title = trimmed;
  const meta =
    DOMICILE_TYPOLOGY_META[target.typology] ||
    DOMICILE_TYPOLOGY_META.PRIMARY_RESIDENCE;
  target.subtitle = `${meta.label} · ${trimmed}`;
  saveStoredDomiciles(customDomiciles);
  emitRegistryChange();
  return true;
}

/**
 * Claims ownership of any place on Earth (from viewport, search bar, globe click,
 * or CLI command) and registers it as a Custom Domicile.
 *
 * @param {object} options
 * @param {number} options.lat
 * @param {number} options.lon
 * @param {string} [options.typology='PRIMARY_RESIDENCE']
 * @param {string} [options.title]
 * @param {string} [options.localityLabel]
 * @param {string} [options.source='viewport']
 * @returns {object} The newly claimed or updated CustomDomicile
 */
export function claimDomicileAtLocation({
  lat,
  lon,
  typology = DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
  title = null,
  localityLabel = null,
  source = 'viewport',
} = {}) {
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : 30.2672;
  const safeLon = Number.isFinite(Number(lon)) ? Number(lon) : -97.7431;

  const validTypology = DOMICILE_TYPOLOGY_META[typology]
    ? typology
    : DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE;
  const meta = DOMICILE_TYPOLOGY_META[validTypology];

  const locality = resolveZeroCreditLocality(safeLat, safeLon);
  const resolvedPlace =
    localityLabel ||
    locality?.shortLabel ||
    locality?.displayName ||
    `${safeLat.toFixed(4)}°, ${safeLon.toFixed(4)}°`;

  const cleanTitle =
    title ||
    (validTypology === DOMICILE_TYPOLOGIES.VACATION_SANCTUARY
      ? `${resolvedPlace} Vacation Sanctuary`
      : validTypology === DOMICILE_TYPOLOGIES.VENTURE_HQ
        ? `${resolvedPlace} Venture HQ`
        : `${resolvedPlace} Residence`);

  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 36);
  const id = `claimed_${slug}_${Math.abs(Math.round(safeLat * 1000))}_${Math.abs(Math.round(safeLon * 1000))}`;

  const footprint = generateParcelFootprint(safeLat, safeLon, validTypology);
  const nearestTransit = findNearestMetroStation(safeLat, safeLon);

  const cosLat = Math.max(0.2, Math.cos((safeLat * Math.PI) / 180));
  const highwayTarget = {
    lat: Number((safeLat + 0.012).toFixed(6)),
    lon: Number((safeLon + 0.015 / cosLat).toFixed(6)),
    label: `${resolvedPlace} Arterial Highway Corridor`,
  };

  const waterwayTarget = {
    lat: Number((safeLat + 0.008).toFixed(6)),
    lon: Number((safeLon + 0.012 / cosLat).toFixed(6)),
    label: `${resolvedPlace} Waterfront Channel`,
  };

  const newDomicile = {
    id,
    title: cleanTitle,
    subtitle: `${meta.label} · Claimed via ${source === 'search' ? 'Location Search' : source === 'command' ? 'Assistant Command' : source === 'globe_pick' ? 'Parcel Pick' : 'Active Viewport'}`,
    typology: validTypology,
    lat: Number(safeLat.toFixed(6)),
    lon: Number(safeLon.toFixed(6)),
    address: resolvedPlace,
    isExemplar: false,
    claimedAt: new Date().toISOString(),
    source,
    hasWaterfrontDock:
      validTypology === DOMICILE_TYPOLOGIES.VACATION_SANCTUARY ||
      /beach|coast|island|lake|bay|harbor|river|marsh|key|tahoe|miami|savannah|san diego|seattle/i.test(
        resolvedPlace,
      ),
    highwayCorridor: `${resolvedPlace} Feeder ➔ Regional Highway Network`,
    highwayTarget,
    waterwayTarget,
    nearestTransit,
    ventureTelemetry:
      validTypology === DOMICILE_TYPOLOGIES.VENTURE_HQ
        ? {
            activeVentures: 3,
            safetyChecks: 'ALL GATES PASSING',
            buildStatus: 'ALL CHECKS GREEN',
            studioMode: 'Startup Studio + Workspace',
          }
        : null,
    ...footprint,
  };

  // Deduplicate if claiming at nearly the exact same coordinate & typology
  customDomiciles = customDomiciles.filter(
    (d) =>
      d.id !== id &&
      !(
        d.typology === validTypology &&
        haversineMiles(d.lat, d.lon, safeLat, safeLon) < 0.05
      ),
  );
  customDomiciles.unshift(newDomicile);
  saveStoredDomiciles(customDomiciles);
  emitRegistryChange();

  return newDomicile;
}

export function removeClaimedDomicile(id) {
  const before = customDomiciles.length;
  customDomiciles = customDomiciles.filter((d) => d.id !== id);
  if (customDomiciles.length !== before) {
    saveStoredDomiciles(customDomiciles);
    emitRegistryChange();
    return true;
  }
  return false;
}

export function clearClaimedDomicilesForTest({ includeStarter = false } = {}) {
  customDomiciles = includeStarter ? createStarterDomiciles() : [];
  saveStoredDomiciles(customDomiciles);
  emitRegistryChange();
}
