/**
 * Custom Domiciles & Personal Fleet Compatibility Shim (Phase 1 `24.50a`).
 *
 * Legacy bottom-row charm launcher & fixed 390px vanilla-DOM flyout are retired
 * in favor of the Sovereign Vue 3 `EarthSimRailPanel` (`ExplorePlayModule.vue`)
 * and `ExperiencesExplorer.vue`.
 *
 * Preserves `MAJOR_CITIES` export, `H` hotkey, `window.__gevEstateDrawer`,
 * and `worldSimDock` mutual exclusion with zero vanilla-DOM controls.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { getDomicileById } from '../layers/estates/domicileCatalog.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

// i18n-ignore: curated cities catalog
export const MAJOR_CITIES = Object.freeze({
  atlanta: {
    title: 'Atlanta Downtown (GA)',
    name: 'Atlanta Downtown (GA)',
    lat: 33.749,
    lon: -84.388,
    address: 'Downtown Atlanta, GA',
  },
  savannah: {
    title: 'Savannah Historic District (GA)',
    name: 'Savannah Historic District (GA)',
    lat: 32.0809,
    lon: -81.0912,
    address: 'Historic District, Savannah, GA',
  },
  mountain_overlook: {
    title: 'Mountain Overlook Ridge (GA)',
    name: 'Mountain Overlook Ridge (GA)',
    lat: 34.864,
    lon: -84.324,
    address: 'North Georgia Alpine Ridge',
  },
  charlotte: {
    title: 'Charlotte Center City (NC)',
    name: 'Charlotte Center City (NC)',
    lat: 35.2271,
    lon: -80.8431,
    address: 'Center City, Charlotte, NC',
  },
  nyc: {
    title: 'New York Manhattan (NY)',
    name: 'New York Manhattan (NY)',
    lat: 40.7128,
    lon: -74.006,
    address: 'Manhattan, New York, NY',
  },
  dc: {
    title: 'Washington DC National Mall',
    name: 'Washington DC National Mall',
    lat: 38.8951,
    lon: -77.0364,
    address: 'National Mall, Washington, DC',
  },
  miami: {
    title: 'Miami Beach Ocean Drive (FL)',
    name: 'Miami Beach Ocean Drive (FL)',
    lat: 25.7617,
    lon: -80.1918,
    address: 'Ocean Drive, Miami Beach, FL',
  },
  chicago: {
    title: 'Chicago The Loop (IL)',
    name: 'Chicago The Loop (IL)',
    lat: 41.8819,
    lon: -87.6278,
    address: 'The Loop, Chicago, IL',
  },
  la: {
    title: 'Los Angeles Downtown (CA)',
    name: 'Los Angeles Downtown (CA)',
    lat: 34.0522,
    lon: -118.2437,
    address: 'Downtown, Los Angeles, CA',
  },
  sf: {
    title: 'San Francisco Embarcadero (CA)',
    name: 'San Francisco Embarcadero (CA)',
    lat: 37.7952,
    lon: -122.3937,
    address: 'The Embarcadero, San Francisco, CA',
  },
});

export function createEstateDrawer({
  claimScout = null,
  fleetEngine = null,
  audioEngine = null,
  viewer = null,
} = {}) {
  if (typeof document === 'undefined') {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      updateUI: () => {},
      isOpen: () => false,
      selectDomicile: () => null,
      destroy: () => {},
    };
  }

  let isOpenState = false;
  let destroyed = false;
  const dock = getGlobalDrawerCoordinator();

  function getStore() {
    try {
      return useSovereignUiStore(applicationPinia());
    } catch {
      return null;
    }
  }

  function open() {
    if (destroyed) return;
    isOpenState = true;
    dock.notifyDrawerOpened('estate');
    getStore()?.openModule('explore-play', {
      expandPanel: true,
      exploreTab: 'estate',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('estate');
  }

  function toggle() {
    if (isOpenState) close();
    else open();
  }

  function updateUI() {
    getStore()?.bumpTelemetry?.();
  }

  function selectDomicile(domicileId) {
    const dom = getDomicileById(domicileId);
    if (!dom) return null;
    fleetEngine?.spawnAtDomicile?.(dom.id);
    getStore()?.runtime?.syncActiveSimSnapshot?.('estate');
    updateUI();
    return dom;
  }

  function onKeyDown(event) {
    if (destroyed || !event) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      event.target?.isContentEditable
    ) {
      return;
    }
    if (event.key === 'h' || event.key === 'H') {
      toggle();
    }
  }

  dock.registerDrawer('estate', {
    open,
    close,
    isOpen: () => isOpenState,
    button: null,
    accentColor: '#22d3ee',
  });

  if (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    window.addEventListener('keydown', onKeyDown);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterDrawer('estate');
    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('keydown', onKeyDown);
    }
  }

  return {
    open,
    close,
    toggle,
    updateUI,
    isOpen: () => isOpenState,
    selectDomicile,
    getEngines: () => ({ claimScout, fleetEngine, audioEngine, viewer }),
    destroy,
  };
}
