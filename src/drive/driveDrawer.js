/**
 * Infinite Drive Simulator Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 128px`), fixed 350px vanilla-DOM
 * flyout, and polling HUD strip are retired in favor of the Sovereign Vue 3
 * `EarthSimRailPanel` (`VehiclesMobilityModule.vue`, Drive tab) and
 * `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevDriveDrawer`,
 * `startCustomDrive(...)`, `onTrafficLatched(...)`, `agentBridge`, and
 * `worldSimDock` with zero vanilla DOM.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createDriveDrawer({
  driveEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container && typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      isOpen: () => false,
      startCustomDrive: async () => null,
      onTrafficLatched: () => {},
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
    dock.notifyDrawerOpened('drive');
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'drive',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('drive');
  }

  function onTrafficLatched() {
    dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
    const store = getStore();
    store?.runtime?.syncActiveSimSnapshot?.('drive');
    store?.bumpTelemetry?.();
  }

  if (driveEngine && typeof driveEngine.onTrafficLatched === 'function') {
    driveEngine.onTrafficLatched(onTrafficLatched);
  }

  async function startCustomDrive(origin, destination, options = {}) {
    if (!driveEngine) return null;
    const fromStr =
      typeof origin === 'string' ? origin : `${origin.lat},${origin.lon}`;
    const toStr =
      typeof destination === 'string'
        ? destination
        : `${destination.lat},${destination.lon}`;
    const speedMph = options.speedMph || 75;
    const activeCamera =
      options.cameraMode || driveEngine.getCameraMode?.() || 'chase';
    const res = await driveEngine.startRouteDrive(fromStr, toStr, {
      speedMph,
      cameraMode: activeCamera,
      seat: activeCamera === 'seat',
      vehicleName: options.vehicleName || 'Electric Sedan',
      useOsrm: true,
      ...options,
    });
    if (res) {
      dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
      const store = getStore();
      store?.runtime?.syncActiveSimSnapshot?.('drive');
      store?.bumpTelemetry?.();
    }
    return res;
  }

  dock.registerDrawer('drive', {
    open,
    close,
    isOpen: () => isOpenState,
    launcherEl: null,
    accentColor: '#22d3ee',
  });

  dock.registerSimulation('drive', {
    stop: () => {
      driveEngine?.clearActiveDrive?.();
      dock.notifySimulationStopped('drive');
    },
    isActive: () => {
      const telem = driveEngine?.getActiveTelemetry?.();
      return Boolean(telem && !telem.isParked);
    },
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    isOpenState = false;
    dock.unregisterSimulation('drive');
    dock.unregisterDrawer('drive');
  }

  return {
    open,
    close,
    isOpen: () => isOpenState,
    startCustomDrive,
    onTrafficLatched,
    destroy,
  };
}
