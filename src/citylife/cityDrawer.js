/**
 * Living World & City Simulator Compatibility Shim (Phase 1 `24.50a`).
 *
 * Legacy bottom-row charm launcher & fixed 376px vanilla-DOM flyout are retired
 * in favor of the Sovereign Vue 3 `EarthSimRailPanel` (`ExplorePlayModule.vue`)
 * and `ExperiencesExplorer.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevCityDrawer`,
 * `agentBridge`, stadium engine access, and `worldSimDock` mutual exclusion
 * without creating any legacy vanilla-DOM controls.
 */

import { createStadiumCrowdEngine } from '../layers/citylife/stadiumCrowdEngine.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createCityDrawer({
  cityEngine = null,
  wanderEngine = null,
  tourAndPlayEngine = null,
  agentForgePanel = null,
  stadiumEngine = null,
  viewer = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container && typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      updateArchetypeCard: () => {},
      getStadiumCrowdEngine: () => null,
    };
  }

  let isOpenState = false;
  let lastTypology = null;
  let destroyed = false;
  const dock = getGlobalDrawerCoordinator();
  const stadiumCrowdEngine =
    stadiumEngine || (viewer ? createStadiumCrowdEngine({ viewer }) : null);

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
    dock.notifyDrawerOpened('city');
    getStore()?.openModule('explore-play', {
      expandPanel: true,
      exploreTab: 'city',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('city');
  }

  function toggle() {
    if (isOpenState) close();
    else open();
  }

  function updateArchetypeCard(typology) {
    lastTypology = typology || null;
  }

  dock.registerDrawer('city', {
    open,
    close,
    isOpen: () => isOpenState,
    button: null,
    accentColor: '#06b6d4',
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterDrawer('city');
    if (!stadiumEngine && stadiumCrowdEngine?.destroy) {
      try {
        stadiumCrowdEngine.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpenState,
    updateArchetypeCard,
    getLastTypology: () => lastTypology,
    getStadiumCrowdEngine: () => stadiumCrowdEngine,
    getEngines: () => ({
      cityEngine,
      wanderEngine,
      tourAndPlayEngine,
      agentForgePanel,
      viewer,
    }),
    destroy,
  };
}
