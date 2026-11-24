/**
 * World of Rails Simulator Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 76px`) & fixed 360px vanilla-DOM
 * flyout are retired in favor of the Sovereign Vue 3 `EarthSimRailPanel`
 * (`VehiclesMobilityModule.vue`, Rail tab) and `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevRailDrawer`,
 * `selectCorridor(...)`, `agentBridge`, and `worldSimDock` with zero vanilla DOM.
 */

import { RAIL_CORRIDORS } from './railWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createRailDrawer({
  railwayEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container && typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      isOpen: () => false,
      selectCorridor: () => null,
      getSelectedCorridor: () => null,
    };
  }

  let isOpenState = false;
  let destroyed = false;
  let selectedCorridorId = 'atlanta_marta_east';
  let selectedProfileId = 'csx_mainline';
  let selectedSpeedMph = 45;
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
    dock.notifyDrawerOpened('rail');
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'rail',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('rail');
  }

  function selectCorridor(corridorId, profileId = null) {
    const corridor = RAIL_CORRIDORS[corridorId];
    if (!corridor) return null;
    selectedCorridorId = corridorId;
    selectedProfileId =
      profileId && corridor.trackProfiles?.[profileId]
        ? profileId
        : corridor.defaultCorridor;
    if (corridor.defaultSpeedMph) {
      selectedSpeedMph = corridor.defaultSpeedMph;
    }
    return {
      corridorId: selectedCorridorId,
      profileId: selectedProfileId,
      speedMph: selectedSpeedMph,
    };
  }

  dock.registerDrawer('rail', {
    open,
    close,
    isOpen: () => isOpenState,
    launcherEl: null,
    accentColor: '#fbbf24',
  });

  dock.registerSimulation('rail', {
    stop: () => {
      railwayEngine?.clearActiveRailRoute?.();
      dock.notifySimulationStopped('rail');
    },
    isActive: () => Boolean(railwayEngine?.getActiveRoute?.()),
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterSimulation('rail');
    dock.unregisterDrawer('rail');
  }

  return {
    open,
    close,
    isOpen: () => isOpenState,
    selectCorridor,
    getSelectedCorridor: () => ({
      corridorId: selectedCorridorId,
      profileId: selectedProfileId,
      speedMph: selectedSpeedMph,
    }),
    destroy,
  };
}
