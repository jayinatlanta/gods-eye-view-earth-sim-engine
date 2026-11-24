/**
 * World of Sails Simulator Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 180px`), fixed 350px vanilla-DOM
 * flyout, and polling HUD strip are retired in favor of the Sovereign Vue 3
 * `EarthSimRailPanel` (`VehiclesMobilityModule.vue`, Sail tab) and
 * `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevBoatDrawer`,
 * `agentBridge`, and `worldSimDock` with zero vanilla DOM.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createBoatDrawer({
  boatEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container && typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      isOpen: () => false,
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
    dock.notifyDrawerOpened('boat');
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'sail',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('boat');
    boatEngine?.cancelSplashdownClickMode?.();
  }

  dock.registerDrawer('boat', {
    open,
    close,
    isOpen: () => isOpenState,
    launcherEl: null,
    accentColor: '#38bdf8',
  });

  dock.registerSimulation('boat', {
    stop: () => {
      boatEngine?.clearActiveBoatRoute?.();
      dock.notifySimulationStopped('boat');
    },
    isActive: () => Boolean(boatEngine?.getActiveTelemetry?.()),
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterSimulation('boat');
    dock.unregisterDrawer('boat');
    boatEngine?.cancelSplashdownClickMode?.();
  }

  return {
    open,
    close,
    isOpen: () => isOpenState,
    destroy,
  };
}
