/**
 * Extensible Sovereign Earth Sim Module Registry.
 *
 * Adding any future Earth Sim capability requires only adding one Vue module
 * entry here — zero edits to upstream `LayerPanelsView.vue`, `PanelRailView.vue`,
 * `mobileSheets.js`, or `PanelChrome`.
 *
 * Phase 1 (`24.50a`) registers `explore-play`.
 * Phase 2 (`24.50b`) registers `vehicles-mobility`.
 * Phase 3 (`24.50c`) will register `sandbox-creator` and `ai-forge`.
 */

import { defineAsyncComponent } from 'vue';
import { msg } from '../../i18n/index.js';

export const EARTH_SIM_MODULE_GROUPS = Object.freeze([
  { id: 'explore', label: msg('Explore & Play') },
  { id: 'mobility', label: msg('Vehicles & Corridors') },
  { id: 'create', label: msg('Create & AI') },
]);

/**
 * Canonical registry of mounted Sovereign Vue modules inside `#earth-sim-panel`.
 * Legacy drawer IDs covered by each module are listed in `coversLegacyDrawers`
 * so `earthSimFeatureCatalog.test.mjs` can validate full capability coverage.
 */
export const EARTH_SIM_MODULES = Object.freeze([
  Object.freeze({
    id: 'explore-play',
    group: 'explore',
    icon: 'travel_explore',
    label: msg('Explore & Play'),
    summary: msg(
      'Guided tours, theme parks, resorts, living cities, domiciles & wilderness trails.',
    ),
    hotkey: 'W',
    component: defineAsyncComponent(
      () => import('./modules/ExplorePlayModule.vue'),
    ),
    coversLegacyDrawers: Object.freeze([
      'wander',
      'city',
      'estate',
      'wilderness',
    ]),
    badges: Object.freeze(['Tours v2', 'Cities', 'Domiciles', 'Trails']),
  }),
  Object.freeze({
    id: 'vehicles-mobility',
    group: 'mobility',
    icon: 'navigation',
    label: msg('Vehicles & Corridors'),
    summary: msg(
      'Flight, World of Rails, Infinite Drive, World of Sails, Metro/Bus, Freight & Connect Places.',
    ),
    hotkey: 'T',
    component: defineAsyncComponent(
      () => import('./modules/VehiclesMobilityModule.vue'),
    ),
    coversLegacyDrawers: Object.freeze([
      'flight',
      'rail',
      'drive',
      'boat',
      'transit',
      'freight',
      'corridor',
    ]),
    badges: Object.freeze([
      'Flight',
      'Rail',
      'Drive',
      'Sail',
      'Metro',
      'Freight',
      'Corridors',
    ]),
  }),
]);

export function getEarthSimModuleById(id) {
  return (
    EARTH_SIM_MODULES.find((m) => m.id === id) || EARTH_SIM_MODULES[0] || null
  );
}

export function getEarthSimModulesByGroup(groupId) {
  if (!groupId || groupId === 'all') return [...EARTH_SIM_MODULES];
  return EARTH_SIM_MODULES.filter((m) => m.group === groupId);
}

/**
 * Returns every legacy drawer ID explicitly migrated into the Sovereign Vue
 * module registry.
 */
export function getMigratedLegacyDrawerIds() {
  const ids = new Set();
  for (const mod of EARTH_SIM_MODULES) {
    for (const legacyId of mod.coversLegacyDrawers || []) {
      ids.add(legacyId);
    }
  }
  return [...ids].sort();
}

/**
 * Validates that every registered module carries required metadata and unique IDs.
 */
export function validateModuleRegistry(modules = EARTH_SIM_MODULES) {
  const errors = [];
  const seen = new Set();
  const validGroups = new Set(EARTH_SIM_MODULE_GROUPS.map((g) => g.id));

  for (const mod of modules) {
    if (!mod?.id || typeof mod.id !== 'string') {
      errors.push('Module missing string id');
      continue;
    }
    if (seen.has(mod.id)) errors.push(`Duplicate module id: ${mod.id}`);
    seen.add(mod.id);
    if (!validGroups.has(mod.group)) {
      errors.push(`Invalid group "${mod.group}" on module "${mod.id}"`);
    }
    if (!mod.icon || typeof mod.icon !== 'string') {
      errors.push(`Missing Material icon on module "${mod.id}"`);
    }
    if (!mod.label || typeof mod.label !== 'string') {
      errors.push(`Missing label on module "${mod.id}"`);
    }
    if (!mod.component) {
      errors.push(`Missing Vue component on module "${mod.id}"`);
    }
  }

  return { ok: errors.length === 0, errors };
}
