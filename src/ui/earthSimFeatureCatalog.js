/**
 * Dynamic Earth Sim Engine Feature Catalog.
 *
 * Contract: Every interactive World/Earth Sim drawer registered via
 * `coordinator.registerDrawer('<id>', ...)` across `src/` MUST have a matching
 * entry in `EARTH_SIM_FEATURE_CATALOG`. This contract is verified by
 * `src/ui/earthSimFeatureCatalog.test.mjs` so newly added features appear
 * automatically in the scrollable Earth Sim welcome pop-over.
 */

import { msg } from '../i18n/index.js';

export const EARTH_SIM_CATALOG_VERSION = '2026.11';

export const EARTH_SIM_FEATURE_CATEGORIES = Object.freeze([
  { id: 'all', label: msg('All Features') },
  { id: 'living-world', label: msg('Living World') },
  { id: 'travel-mobility', label: msg('Travel & Fleet') },
  { id: 'charms-places', label: msg('Places & Sandbox') },
  { id: 'overlays-ai', label: msg('AI & Controls') },
]);

export const EARTH_SIM_FEATURE_CATALOG = Object.freeze([
  {
    id: 'city',
    drawerId: 'city',
    overlayGroupId: null,
    category: 'living-world',
    icon: '🏙️',
    title: msg('Living City Simulation'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Street-level pedestrians, weather adaptation, buses, regional rail, urban spectacles, and city ambience.',
    ),
  },
  {
    id: 'wander',
    drawerId: 'wander',
    overlayGroupId: null,
    category: 'living-world',
    icon: '🚶',
    title: msg('Avatar Wander & Scooter Tours'),
    hotkey: 'W',
    addedVersion: '2026.11',
    summary: msg(
      'Street-level walk or 15 mph electric scooter landmark tours with companion charm dot and local Play activities.',
    ),
  },
  {
    id: 'corridor',
    drawerId: 'corridor',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '🔗',
    title: msg('Place Relationship & Corridors'),
    hotkey: 'K',
    addedVersion: '2026.11',
    summary: msg(
      'Compare any two cities or domiciles with geodesic telemetry, time-zone delta, and 1-click multi-modal launches.',
    ),
  },
  {
    id: 'flight',
    drawerId: 'flight',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '✈️',
    title: msg('Flight Simulator & Airfields'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Fly custom point-to-point routes, rotorcraft hops, and regional jet corridors across live terrain and 3D cities.',
    ),
  },
  {
    id: 'drive',
    drawerId: 'drive',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '🚗',
    title: msg('Highway Cruiser & OSRM Routes'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Surface-clamped road drives, multi-leg OSRM subdivisions, chase/cockpit cameras, and live traffic latching.',
    ),
  },
  {
    id: 'rail',
    drawerId: 'rail',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '🚄',
    title: msg('High-Speed & Regional Rail'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Ride famous rail corridors and metro connectors with station stops, speed profiles, and cab views.',
    ),
  },
  {
    id: 'boat',
    drawerId: 'boat',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '⛵',
    title: msg('World of Sails & Waterways'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Hydrodynamic coastal passages, inland waterways, and harbor charters with zero-credit nautical telemetry.',
    ),
  },
  {
    id: 'transit',
    drawerId: 'transit',
    overlayGroupId: null,
    category: 'living-world',
    icon: '🚇',
    title: msg('Metro & Surface Transit Sim'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Interactive metro line controller with real-time station pacing, operator controls, and camera follow.',
    ),
  },
  {
    id: 'freight',
    drawerId: 'freight',
    overlayGroupId: null,
    category: 'travel-mobility',
    icon: '🚂',
    title: msg('Freight Logistics & Intermodal Yard'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Heavy-haul rail corridors, intermodal yards, and procedural diesel-electric locomotive audio.',
    ),
  },
  {
    id: 'estate',
    drawerId: 'estate',
    overlayGroupId: null,
    category: 'charms-places',
    icon: '🏡',
    title: msg('Domiciles, Estates & Personal Fleet'),
    hotkey: 'H',
    addedVersion: '2026.11',
    summary: msg(
      'Claim custom havens anywhere on Earth, switch walk/bike/scooter/EV modes, and ride solo or in tandem.',
    ),
  },
  {
    id: 'wilderness',
    drawerId: 'wilderness',
    overlayGroupId: null,
    category: 'charms-places',
    icon: '🏕️',
    title: msg('Wilderness Trails & Campfire'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Backcountry trail pathfinding, biome wildlife ambiance, and procedural campfire soundscapes.',
    ),
  },
  {
    id: 'sandbox',
    drawerId: 'sandbox',
    overlayGroupId: null,
    category: 'charms-places',
    icon: '🧱',
    title: msg('3D World Sandbox Builder'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Place 3D structures, overlooks, and custom scene props directly on Google 3D Tiles and terrain.',
    ),
  },
  {
    id: 'custom-ux-toggle',
    drawerId: null,
    overlayGroupId: 'custom-ux-toggle',
    category: 'overlays-ai',
    icon: '👁️',
    title: msg('Hide / Show Custom UI Toggle'),
    hotkey: 'Alt+H',
    addedVersion: '2026.11',
    summary: msg(
      'Collapse all Earth Sim launchers and overlays in one click (or Alt+H) while keeping active simulations running.',
    ),
  },
  {
    id: 'ai-assistant',
    drawerId: null,
    overlayGroupId: 'agent-forge',
    category: 'overlays-ai',
    icon: '🤖',
    title: msg('Multi-Provider AI Assistant & Guide'),
    hotkey: null,
    addedVersion: '2026.11',
    summary: msg(
      'Ask live Earth, city, and space questions via AGY, Claude Code, Codex, Gemini CLI, or GEV API keys.',
    ),
  },
]);

export function getEarthSimFeaturesByCategory(category = 'all') {
  const norm = String(category || 'all')
    .trim()
    .toLowerCase();
  if (!norm || norm === 'all') {
    return [...EARTH_SIM_FEATURE_CATALOG];
  }
  return EARTH_SIM_FEATURE_CATALOG.filter((item) => item.category === norm);
}

export function getCatalogDrawerIds() {
  return EARTH_SIM_FEATURE_CATALOG.map((item) => item.drawerId).filter(Boolean);
}

export function validateFeatureCatalogAgainstDrawers(registeredDrawerIds = []) {
  const catalogDrawers = new Set(getCatalogDrawerIds());
  const missing = [];
  for (const rawId of registeredDrawerIds) {
    const id = String(rawId || '').trim();
    if (id && !catalogDrawers.has(id)) {
      missing.push(id);
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    catalogCount: EARTH_SIM_FEATURE_CATALOG.length,
    coveredDrawerCount: catalogDrawers.size,
  };
}
