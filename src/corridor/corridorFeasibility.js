/**
 * Dynamic Multi-Modal Corridor Feasibility Evaluator.
 * (Universal Place-to-Place Spatial Relationship & Multi-Modal Corridor Explorer)
 *
 * Evaluates physical & network realism for any pair of resolved endpoints across:
 * - Road Trip (OSRM /api/route car probe + MAX_OSRM_TOTAL_KM = 2500 km guard)
 * - Airbus H145 Helicopter (650 km single-tank / 1,400 km multi-hop operational envelope)
 * - Commercial / Private Jet Airliner (regional & transoceanic SLERP cruise)
 * - World of Rails / Transit (curated RAIL_CORRIDORS + Overpass rail presence + continental viability)
 * - World of Sails (conditional maritime visibility via Natural Earth marine polygons & WATER_PRESETS)
 */

import {
  MAX_OSRM_TOTAL_KM,
  MAX_OSRM_SUBLEG_KM,
  fetchMultiLegDriveRouteWithStatus,
  calculateHaversineDistance,
} from '../drive/driveWaypoints.js';
import { ROTORCRAFT_CRUISE_KTS } from '../flight/syntheticFlightEngine.js';
import { RAIL_CORRIDORS } from '../transit/railWaypoints.js';
import { WATER_PRESETS } from '../vessels/waterWaypoints.js';
import { naturalRegionAtPoint } from '../data/naturalEarthRegions.js';
import { greatCircleKm } from '../geoDistance.js';

export const H145_SINGLE_TANK_KM = 650;
export const H145_MULTI_HOP_MAX_KM = 1400;
export const H145_CRUISE_KMH = 240; // ~130 KTS real-world H145 cruise for realistic ETA
export const JET_CRUISE_KMH = 889; // ~480 KTS
export const JET_MIN_RECOMMENDED_KM = 120;
export const RAIL_MAX_VIABLE_KM = 2200;
export const RAIL_CRUISE_KMH = 115;
export const MARITIME_MAX_COASTAL_KM = 4500;
export const MARITIME_CRUISE_KMH = 38; // ~20.5 KTS

/**
 * Format duration in minutes into a crisp human-readable ETA ("5h 42m", "48m").
 */
export function formatEtaDuration(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '< 1m';
  const rounded = Math.max(1, Math.round(totalMinutes));
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  const mins = rounded % 60;
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

function isNoRouteReason(reason) {
  return /no\s*route|noroute|impossible|exceeds\s*[\d,]+\s*km/i.test(
    String(reason || ''),
  );
}

/**
 * Evaluate overland Road Trip feasibility via OSRM /api/route + 2,500 km cap.
 */
export async function evaluateRoadMode(
  origin,
  destination,
  relationship,
  {
    fetchImpl = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null,
    probeOsrm = true,
    osrmPaceMs,
    osrmRetryDelayMs,
    osrmMaxRetries = 1,
  } = {},
) {
  const straightKm = relationship.greatCircleKm;

  if (straightKm > MAX_OSRM_TOTAL_KM) {
    return {
      id: 'drive',
      label: 'Road Trip',
      icon: '🚗',
      status: 'unavailable',
      feasible: false,
      badge: 'Over 2,500 km Limit',
      distanceKm: null,
      distanceMi: null,
      detourRatio: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason: `Great-circle span (${Math.round(straightKm).toLocaleString()} km) exceeds the ${MAX_OSRM_TOTAL_KM.toLocaleString()} km overland OSRM envelope.`,
      roadPoints: null,
    };
  }

  if (!probeOsrm || typeof fetchImpl !== 'function') {
    const estKm = Number((straightKm * 1.22).toFixed(1));
    const etaMin = (estKm / 88) * 60;
    return {
      id: 'drive',
      label: 'Road Trip',
      icon: '🚗',
      status: straightKm <= 350 ? 'recommended' : 'realistic',
      feasible: true,
      badge: 'Estimated Overland',
      distanceKm: estKm,
      distanceMi: Number((estKm * 0.621371).toFixed(1)),
      detourRatio: 1.22,
      etaMinutes: Math.round(etaMin),
      etaLabel: formatEtaDuration(etaMin),
      reason: 'Estimated highway distance (live OSRM probe skipped).',
      roadPoints: null,
    };
  }

  try {
    const res = await fetchMultiLegDriveRouteWithStatus([origin, destination], {
      fetchImpl,
      profile: 'car',
      maxSubLegKm: MAX_OSRM_SUBLEG_KM,
      maxTotalKm: MAX_OSRM_TOTAL_KM,
      maxRetries: osrmMaxRetries,
      ...(Number.isFinite(osrmRetryDelayMs)
        ? { retryDelayMs: osrmRetryDelayMs }
        : {}),
      ...(Number.isFinite(osrmPaceMs) ? { paceMs: osrmPaceMs } : {}),
    });

    if (
      (res.status === 'osrm' || res.status === 'partial_osrm') &&
      Array.isArray(res.points) &&
      res.points.length >= 2
    ) {
      let roadMeters = 0;
      for (let i = 0; i < res.points.length - 1; i++) {
        roadMeters += calculateHaversineDistance(
          res.points[i].lat,
          res.points[i].lon,
          res.points[i + 1].lat,
          res.points[i + 1].lon,
        );
      }
      const roadKm = Number((roadMeters / 1000).toFixed(1));
      const detourRatio = Number(
        (roadKm / Math.max(0.5, straightKm)).toFixed(2),
      );
      const avgKmh = roadKm < 60 ? 58 : 88;
      const etaMinutes = Math.max(2, Math.round((roadKm / avgKmh) * 60));
      let status = 'realistic';
      let badge = 'Realistic Drive';
      if (roadKm <= 350) {
        status = 'recommended';
        badge = 'Recommended Drive';
      } else if (roadKm > 1150) {
        status = 'epic_overland';
        badge = 'Epic Overland';
      }

      return {
        id: 'drive',
        label: 'Road Trip',
        icon: '🚗',
        status,
        feasible: true,
        badge,
        distanceKm: roadKm,
        distanceMi: Number((roadKm * 0.621371).toFixed(1)),
        detourRatio,
        etaMinutes,
        etaLabel: formatEtaDuration(etaMinutes),
        reason: `Verified OSRM road route (${detourRatio.toFixed(2)}× straight-line).`,
        roadPoints: res.points,
        osrmStatus: res.status,
      };
    }

    if (isNoRouteReason(res.reason)) {
      return {
        id: 'drive',
        label: 'Road Trip',
        icon: '🚗',
        status: 'unavailable',
        feasible: false,
        badge: 'No Overland Road',
        distanceKm: null,
        distanceMi: null,
        detourRatio: null,
        etaMinutes: null,
        etaLabel: 'N/A',
        reason: `No drivable overland road link (${res.reason || 'water or disconnected barrier'}).`,
        roadPoints: null,
      };
    }

    // Transient / offline proxy fallback — still launchable
    const estKm = Number((straightKm * 1.22).toFixed(1));
    const etaMin = (estKm / 88) * 60;
    return {
      id: 'drive',
      label: 'Road Trip',
      icon: '🚗',
      status: 'unverified',
      feasible: true,
      badge: 'Route Unverified',
      distanceKm: estKm,
      distanceMi: Number((estKm * 0.621371).toFixed(1)),
      detourRatio: 1.22,
      etaMinutes: Math.round(etaMin),
      etaLabel: formatEtaDuration(etaMin),
      reason: `Highway probe unavailable (${res.reason || 'offline'}); launch attempts live road snap.`,
      roadPoints: null,
    };
  } catch (err) {
    const estKm = Number((straightKm * 1.22).toFixed(1));
    const etaMin = (estKm / 88) * 60;
    return {
      id: 'drive',
      label: 'Road Trip',
      icon: '🚗',
      status: 'unverified',
      feasible: true,
      badge: 'Route Unverified',
      distanceKm: estKm,
      distanceMi: Number((estKm * 0.621371).toFixed(1)),
      detourRatio: 1.22,
      etaMinutes: Math.round(etaMin),
      etaLabel: formatEtaDuration(etaMin),
      reason: `Highway probe skipped (${err?.message || 'network error'}).`,
      roadPoints: null,
    };
  }
}

/**
 * Evaluate Airbus H145 rotorcraft feasibility against operational range envelope.
 */
export function evaluateHelicopterMode(origin, destination, relationship) {
  const km = relationship.greatCircleKm;
  const etaMinutes = Math.max(4, Math.round((km / H145_CRUISE_KMH) * 60 + 8));

  if (km <= H145_SINGLE_TANK_KM) {
    return {
      id: 'h145',
      label: 'Airbus H145',
      icon: '🚁',
      status: 'ideal',
      feasible: true,
      badge: 'Ideal Single-Tank',
      distanceKm: km,
      distanceMi: relationship.greatCircleMi,
      etaMinutes,
      etaLabel: formatEtaDuration(etaMinutes),
      simCruiseKts: ROTORCRAFT_CRUISE_KTS,
      reason: `Within ${H145_SINGLE_TANK_KM} km H145 single-tank range (low-and-slow 1,000 ft AGL scenic flight).`,
    };
  }

  if (km <= H145_MULTI_HOP_MAX_KM) {
    return {
      id: 'h145',
      label: 'Airbus H145',
      icon: '🚁',
      status: 'multi_hop',
      feasible: true,
      badge: 'Multi-Hop Refuel',
      distanceKm: km,
      distanceMi: relationship.greatCircleMi,
      etaMinutes: etaMinutes + 25,
      etaLabel: formatEtaDuration(etaMinutes + 25),
      simCruiseKts: ROTORCRAFT_CRUISE_KTS,
      reason: `Exceeds ${H145_SINGLE_TANK_KM} km single-tank range; requires 1 mid-corridor fuel staging stop.`,
    };
  }

  return {
    id: 'h145',
    label: 'Airbus H145',
    icon: '🚁',
    status: 'unrealistic',
    feasible: false,
    badge: 'Beyond H145 Range',
    distanceKm: km,
    distanceMi: relationship.greatCircleMi,
    etaMinutes: null,
    etaLabel: 'N/A',
    simCruiseKts: ROTORCRAFT_CRUISE_KTS,
    reason: `Span (${Math.round(km).toLocaleString()} km) exceeds practical ${H145_MULTI_HOP_MAX_KM.toLocaleString()} km rotorcraft ferry envelope; use Airliner Jet.`,
  };
}

/**
 * Evaluate commercial / private jet airliner corridor feasibility.
 */
export function evaluateJetMode(origin, destination, relationship) {
  const km = relationship.greatCircleKm;
  const etaMinutes = Math.max(20, Math.round((km / JET_CRUISE_KMH) * 60 + 25));

  if (km < JET_MIN_RECOMMENDED_KM) {
    return {
      id: 'jet',
      label: 'Airliner Jet',
      icon: '✈️',
      status: 'short_hop',
      feasible: true,
      badge: 'Short Regional Hop',
      distanceKm: km,
      distanceMi: relationship.greatCircleMi,
      etaMinutes,
      etaLabel: formatEtaDuration(etaMinutes),
      reason: `Short ${Math.round(km)} km hop — H145 helicopter or Road Trip is typically faster door-to-door.`,
    };
  }

  return {
    id: 'jet',
    label: 'Airliner Jet',
    icon: '✈️',
    status: km > H145_SINGLE_TANK_KM ? 'recommended' : 'available',
    feasible: true,
    badge: km > H145_SINGLE_TANK_KM ? 'Recommended Air' : 'Jet Available',
    distanceKm: km,
    distanceMi: relationship.greatCircleMi,
    etaMinutes,
    etaLabel: formatEtaDuration(etaMinutes),
    reason: `Great-circle FL350 jet cruise (${Math.round(km).toLocaleString()} km / ${Math.round(relationship.greatCircleNm).toLocaleString()} NM).`,
  };
}

function findMatchingCuratedRailCorridor(origin, destination) {
  for (const corridor of Object.values(RAIL_CORRIDORS || {})) {
    if (!corridor?.from || !corridor?.to) continue;
    const dAA = greatCircleKm(origin, corridor.from);
    const dBB = greatCircleKm(destination, corridor.to);
    const dAB = greatCircleKm(origin, corridor.to);
    const dBA = greatCircleKm(destination, corridor.from);
    if ((dAA <= 40 && dBB <= 40) || (dAB <= 40 && dBA <= 40)) {
      return corridor;
    }
  }
  return null;
}

/**
 * Evaluate World of Rails / Transit feasibility via curated corridors, road barrier check,
 * and optional lightweight Overpass rail infrastructure probe.
 */
export async function evaluateRailMode(
  origin,
  destination,
  relationship,
  {
    fetchImpl = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null,
    probeOverpass = true,
    roadResult = null,
  } = {},
) {
  const km = relationship.greatCircleKm;

  const curated = findMatchingCuratedRailCorridor(origin, destination);
  if (curated) {
    const etaMinutes = Math.max(
      8,
      Math.round((km / ((curated.defaultSpeedMph || 55) * 1.60934)) * 60),
    );
    return {
      id: 'rail',
      label: 'World of Rails',
      icon: '🚆',
      status: 'viable',
      feasible: true,
      badge: 'Curated Rail Corridor',
      matchedCorridorId: curated.id,
      distanceKm: km,
      distanceMi: relationship.greatCircleMi,
      etaMinutes,
      etaLabel: formatEtaDuration(etaMinutes),
      reason: `Matched verified rail alignment: ${curated.name}.`,
    };
  }

  if (km > RAIL_MAX_VIABLE_KM) {
    return {
      id: 'rail',
      label: 'World of Rails',
      icon: '🚆',
      status: 'no_direct_rail',
      feasible: false,
      badge: 'No Direct Rail',
      matchedCorridorId: null,
      distanceKm: null,
      distanceMi: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason: `Span (${Math.round(km).toLocaleString()} km) exceeds practical ${RAIL_MAX_VIABLE_KM.toLocaleString()} km direct rail corridor range.`,
    };
  }

  if (
    roadResult?.status === 'unavailable' &&
    isNoRouteReason(roadResult?.reason)
  ) {
    return {
      id: 'rail',
      label: 'World of Rails',
      icon: '🚆',
      status: 'no_direct_rail',
      feasible: false,
      badge: 'No Direct Rail',
      matchedCorridorId: null,
      distanceKm: null,
      distanceMi: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason:
        'Disconnected landmass or water barrier prevents continuous overland rail.',
    };
  }

  let railVerified = null;
  if (probeOverpass && typeof fetchImpl === 'function') {
    try {
      const ql = `[out:json][timeout:6];(nwr(around:15000,${origin.lat.toFixed(4)},${origin.lon.toFixed(4)})["railway"~"^(rail|subway|light_rail)$"];nwr(around:15000,${destination.lat.toFixed(4)},${destination.lon.toFixed(4)})["railway"~"^(rail|subway|light_rail)$"];);out center 40;`;
      const res = await fetchImpl('/api/overpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(ql)}`,
      });
      if (res?.ok) {
        const data = await res.json();
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        let hasOriginRail = false;
        let hasDestRail = false;
        for (const el of elements) {
          const lat = Number(el?.lat ?? el?.center?.lat);
          const lon = Number(el?.lon ?? el?.center?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (greatCircleKm(origin, { lat, lon }) <= 20) hasOriginRail = true;
          if (greatCircleKm(destination, { lat, lon }) <= 20)
            hasDestRail = true;
        }
        railVerified = hasOriginRail && hasDestRail;
      }
    } catch {
      railVerified = null;
    }
  }

  if (railVerified === false) {
    return {
      id: 'rail',
      label: 'World of Rails',
      icon: '🚆',
      status: 'no_direct_rail',
      feasible: false,
      badge: 'No Direct Rail',
      matchedCorridorId: null,
      distanceKm: null,
      distanceMi: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason:
        'No active rail tracks detected near both endpoints via OpenStreetMap.',
    };
  }

  const estKm = Number((km * 1.15).toFixed(1));
  const etaMinutes = Math.max(10, Math.round((estKm / RAIL_CRUISE_KMH) * 60));
  return {
    id: 'rail',
    label: 'World of Rails',
    icon: '🚆',
    status: 'viable',
    feasible: true,
    badge: railVerified ? 'Rail Network Verified' : 'Continental Rail',
    matchedCorridorId: null,
    distanceKm: estKm,
    distanceMi: Number((estKm * 0.621371).toFixed(1)),
    etaMinutes,
    etaLabel: formatEtaDuration(etaMinutes),
    reason: railVerified
      ? 'Rail infrastructure verified near both origin and destination.'
      : 'Continental span viable for rail/transit simulation.',
  };
}

async function isCoastalOrMaritimePoint(
  point,
  naturalRegionResolver = naturalRegionAtPoint,
) {
  // 1. Proximity to curated coastal/inland waterway presets
  for (const preset of Object.values(WATER_PRESETS || {})) {
    if (
      (preset.from && greatCircleKm(point, preset.from) <= 40) ||
      (preset.to && greatCircleKm(point, preset.to) <= 40)
    ) {
      return { coastal: true, waterName: preset.name };
    }
  }

  // 2. Offline Natural Earth marine polygon check within ~28 km (0.25 deg)
  if (typeof naturalRegionResolver === 'function') {
    const offsets = [
      [0, 0],
      [0.25, 0],
      [-0.25, 0],
      [0, 0.25],
      [0, -0.25],
    ];
    for (const [dLat, dLon] of offsets) {
      const lat = Math.max(-89.9, Math.min(89.9, point.lat + dLat));
      let lon = point.lon + dLon;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      try {
        const hit = await naturalRegionResolver(lat, lon);
        if (hit?.kind === 'marine') {
          return { coastal: true, waterName: hit.region || 'Coastal Waters' };
        }
      } catch {
        /* ignore optional data failure */
      }
    }
  }

  return { coastal: false, waterName: null };
}

/**
 * Evaluate conditional World of Sails feasibility (surfaces only when both endpoints are coastal/water-adjacent).
 */
export async function evaluateMaritimeMode(
  origin,
  destination,
  relationship,
  { naturalRegionResolver = naturalRegionAtPoint } = {},
) {
  const km = relationship.greatCircleKm;
  if (km > MARITIME_MAX_COASTAL_KM) {
    return {
      id: 'boat',
      label: 'World of Sails',
      icon: '⛵',
      visible: false,
      status: 'unavailable',
      feasible: false,
      badge: 'Beyond Coastal Span',
      distanceKm: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason: 'Exceeds coastal maritime voyage span.',
    };
  }

  const [originCoast, destCoast] = await Promise.all([
    isCoastalOrMaritimePoint(origin, naturalRegionResolver),
    isCoastalOrMaritimePoint(destination, naturalRegionResolver),
  ]);

  if (!originCoast.coastal || !destCoast.coastal) {
    return {
      id: 'boat',
      label: 'World of Sails',
      icon: '⛵',
      visible: false,
      status: 'inland',
      feasible: false,
      badge: 'Inland Corridor',
      distanceKm: null,
      etaMinutes: null,
      etaLabel: 'N/A',
      reason: 'Inland endpoints — maritime mode tucked.',
    };
  }

  const etaMinutes = Math.max(15, Math.round((km / MARITIME_CRUISE_KMH) * 60));
  return {
    id: 'boat',
    label: 'World of Sails',
    icon: '⛵',
    visible: true,
    status: 'viable',
    feasible: true,
    badge: 'Coastal / Marine Corridor',
    distanceKm: km,
    distanceMi: relationship.greatCircleMi,
    etaMinutes,
    etaLabel: formatEtaDuration(etaMinutes),
    reason: `Coastal corridor (${originCoast.waterName} → ${destCoast.waterName}).`,
  };
}

/**
 * Evaluate all transport modes concurrently for a resolved spatial relationship.
 */
export async function evaluateCorridorModes(
  origin,
  destination,
  relationship,
  options = {},
) {
  const road = await evaluateRoadMode(
    origin,
    destination,
    relationship,
    options,
  );

  const [rail, boat] = await Promise.all([
    evaluateRailMode(origin, destination, relationship, {
      ...options,
      roadResult: road,
    }),
    evaluateMaritimeMode(origin, destination, relationship, options),
  ]);

  const h145 = evaluateHelicopterMode(origin, destination, relationship);
  const jet = evaluateJetMode(origin, destination, relationship);

  const modes = [road, h145, jet, rail];
  if (boat.visible) modes.push(boat);

  return {
    modes,
    byId: {
      drive: road,
      h145,
      jet,
      rail,
      boat,
    },
  };
}
