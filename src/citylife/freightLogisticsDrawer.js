/**
 * Freight & Intermodal Logistics Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 388px`) & fixed 380px vanilla-DOM
 * flyout are retired in favor of the Sovereign Vue 3 `EarthSimRailPanel`
 * (`VehiclesMobilityModule.vue`, Freight tab) and `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevFreightDrawer`,
 * `F`/`L` hotkeys, URL deeplinks (`?freight=true&corridor=...&truck=...&camera=...`),
 * and `worldSimDock` with zero vanilla DOM.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { FREIGHT_CAMERA_MODES } from '../layers/freight/freightCameraSuite.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createFreightLogisticsDrawer({
  freightEngine = null,
  viewer = null,
  container = null,
} = {}) {
  if (typeof document === 'undefined') {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      updateUI: () => {},
      isOpen: () => false,
      destroy: () => {},
    };
  }

  void viewer;
  void container;

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

  function updateUI() {
    getStore()?.bumpTelemetry?.();
  }

  function open() {
    if (destroyed) return;
    isOpenState = true;
    dock.notifyDrawerOpened('freight');
    if (freightEngine && typeof freightEngine.start === 'function') {
      freightEngine.start();
    }
    const store = getStore();
    store?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'freight',
    });
    store?.runtime?.syncActiveSimSnapshot?.('freight');
    updateUI();
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('freight');
  }

  function toggle() {
    if (isOpenState) close();
    else open();
  }

  dock.registerDrawer('freight', {
    open,
    close,
    isOpen: () => isOpenState,
    button: null,
    accentColor: '#f97316',
  });

  dock.registerSimulation('freight', {
    stop: () => freightEngine?.stop?.(),
    isActive: () => Boolean(freightEngine?.isSimActive?.()),
  });

  function onKeyDown(e) {
    if (destroyed) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable)
    ) {
      return;
    }
    if (e.key === 'f' || e.key === 'F' || e.key === 'l' || e.key === 'L') {
      e.preventDefault?.();
      e.stopPropagation?.();
      e.stopImmediatePropagation?.();
      toggle();
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown, true);
  }

  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      const url = new URL(window.location.href);
      const isFreight = url.searchParams.get('freight');
      const corridorParam = url.searchParams.get('corridor');
      const truckParam = url.searchParams.get('truck');
      const cameraParam = url.searchParams.get('camera');

      if (isFreight === 'true') {
        open();
      }
      if (corridorParam && freightEngine?.spawnTruck) {
        freightEngine.spawnTruck({ corridorId: corridorParam });
      }
      if (truckParam && freightEngine?.selectTruck) {
        freightEngine.selectTruck(truckParam);
      }
      if (cameraParam && freightEngine?.setCameraMode) {
        const normCam = cameraParam.toUpperCase();
        if (FREIGHT_CAMERA_MODES[normCam]) {
          freightEngine.setCameraMode(normCam);
        }
      }
    } catch {
      /* ignore invalid URL */
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    close();
    dock.unregisterSimulation('freight');
    dock.unregisterDrawer('freight');
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('keydown', onKeyDown, true);
    }
  }

  return {
    open,
    close,
    toggle,
    updateUI,
    isOpen: () => isOpenState,
    destroy,
  };
}
