/**
 * Great-Circle Flight Simulator Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right circular charm launcher (`right: 24px`) & fixed 340px
 * vanilla-DOM flyout are retired in favor of the Sovereign Vue 3
 * `EarthSimRailPanel` (`VehiclesMobilityModule.vue`, Flight tab) and
 * `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `agentBridge`, `worldSimDock`
 * simulation registration, and `open()` / `close()` routing with zero vanilla DOM.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createFlightDrawer({
  flightEngine = null,
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
    dock.notifyDrawerOpened('flight');
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'flight',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('flight');
  }

  dock.registerDrawer('flight', {
    open,
    close,
    isOpen: () => isOpenState,
    launcherEl: null,
    accentColor: '#00ffcc',
  });

  dock.registerSimulation('flight', {
    stop: () => flightEngine?.clearActiveFlight?.(),
    isActive: () => Boolean(flightEngine?.getActiveFlight?.()),
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterSimulation('flight');
    dock.unregisterDrawer('flight');
  }

  return {
    open,
    close,
    isOpen: () => isOpenState,
    destroy,
  };
}
