/**
 * Transit Controller & Motorman Sim Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 284px`) & fixed 380px vanilla-DOM
 * flyout are retired in favor of the Sovereign Vue 3 `EarthSimRailPanel`
 * (`VehiclesMobilityModule.vue`, Metro tab) and `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevTransitDrawer`,
 * `T` hotkey + Motorman driving hotkeys (`W`/`S`/`Space`/`D`/`K`/`H`),
 * persistent Bus + Metro coexistence (`startActiveTransit`, `switchMode`), and
 * `worldSimDock` with zero vanilla DOM.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export const SUPPORTED_TRANSIT_NETWORKS = Object.freeze([
  'atlanta',
  'los_angeles',
  'san_francisco',
  'washington_dc',
  'northeast_corridor',
  'wdw_monorail',
  'dlr_monorail',
  'wdw_mk_railroad',
  'dlr_railroad',
  'chicago',
  'new_york',
  'tokyo',
  'london',
]);

export function createTransitControllerDrawer({
  busEngine = null,
  metroEngine = null,
  passengerFlow = null,
  motormanControls = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container && typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      getActiveMode: () => 'bus',
      isLinesVisible: () => true,
      switchMode: () => {},
      startActiveTransit: () => {},
      getSupportedNetworks: () => [...SUPPORTED_TRANSIT_NETWORKS],
    };
  }

  const dock = getGlobalDrawerCoordinator();
  let isOpenState = false;
  let destroyed = false;
  let activeMode = 'bus'; // 'bus' | 'metro'
  let activeCityId = '';
  let showSystemLines = true;

  function getStore() {
    try {
      return useSovereignUiStore(applicationPinia());
    } catch {
      return null;
    }
  }

  function syncSystemLinesVisibility() {
    busEngine?.setRouteLinesVisible?.(showSystemLines);
    metroEngine?.setRouteLinesVisible?.(showSystemLines);
  }

  function updateCameraFocus() {
    if (activeMode === 'bus') {
      busEngine?.setCameraEnabled?.(true);
      metroEngine?.setCameraEnabled?.(false);
      let curBus = busEngine?.getActiveBus?.();
      if (!curBus && busEngine?.getFleet?.()?.length > 0) {
        curBus = busEngine.getFleet()[0];
        busEngine.setActiveBus?.(curBus.id);
      }
      if (curBus && motormanControls) {
        motormanControls.bindVehicle?.(curBus, 'bus');
      }
      if (curBus && busEngine?.snapBack) {
        busEngine.snapBack(busEngine.getCameraMode?.() || 'chase');
      }
    } else {
      metroEngine?.setCameraEnabled?.(true);
      busEngine?.setCameraEnabled?.(false);
      let curTrain = metroEngine?.getActiveTrain?.();
      if (!curTrain && metroEngine?.getTrains?.()?.length > 0) {
        curTrain = metroEngine.getTrains()[0];
        metroEngine.setActiveTrain?.(curTrain.id);
      }
      if (curTrain && motormanControls) {
        motormanControls.bindVehicle?.(curTrain, 'metro');
      }
      if (curTrain && metroEngine?.snapBack) {
        metroEngine.snapBack(metroEngine.getCameraMode?.() || 'chase');
      }
    }
  }

  function startActiveTransit(cityId, { preferredMode = null } = {}) {
    if (cityId) activeCityId = cityId;
    if (!activeCityId) activeCityId = 'atlanta';
    const isRailOnlyNetwork =
      activeCityId === 'wdw_monorail' ||
      activeCityId === 'dlr_monorail' ||
      activeCityId === 'wdw_mk_railroad' ||
      activeCityId === 'dlr_railroad' ||
      activeCityId === 'northeast_corridor';
    if (
      preferredMode === 'metro' ||
      (isRailOnlyNetwork && activeMode === 'bus')
    ) {
      activeMode = 'metro';
    } else if (preferredMode === 'bus' && !isRailOnlyNetwork) {
      activeMode = 'bus';
    }
    try {
      dock.notifySimulationStarted('transit');
    } catch {
      /* ignore */
    }
    if (isRailOnlyNetwork) {
      busEngine?.stopBusFleet?.();
    } else if (
      !busEngine?.isSimActive?.() ||
      busEngine?.getActiveCity?.() !== activeCityId
    ) {
      busEngine?.startBusFleet?.(activeCityId);
    }
    if (
      !metroEngine?.isSimActive?.() ||
      metroEngine?.getActiveCity?.() !== activeCityId
    ) {
      metroEngine?.startMetroSystem?.(activeCityId);
    }
    syncSystemLinesVisibility();
    updateCameraFocus();
    const store = getStore();
    store?.runtime?.syncActiveSimSnapshot?.('transit');
    store?.bumpTelemetry?.();
  }

  function switchMode(mode, userInitiated = false) {
    activeMode = mode === 'metro' ? 'metro' : 'bus';
    const isSimActive = Boolean(
      busEngine?.isSimActive?.() || metroEngine?.isSimActive?.(),
    );
    if (userInitiated && !isSimActive) {
      startActiveTransit(activeCityId || 'atlanta', {
        preferredMode: activeMode,
      });
    } else {
      updateCameraFocus();
      const store = getStore();
      store?.runtime?.syncActiveSimSnapshot?.('transit');
      store?.bumpTelemetry?.();
    }
  }

  function setLinesVisible(visible) {
    showSystemLines = Boolean(visible);
    syncSystemLinesVisibility();
    return showSystemLines;
  }

  function open() {
    if (destroyed) return;
    isOpenState = true;
    dock.notifyDrawerOpened('transit');
    const runningCity =
      busEngine?.getActiveCity?.() || metroEngine?.getActiveCity?.();
    if (runningCity) {
      activeCityId = runningCity;
    }
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'metro',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('transit');
  }

  function toggleDrawer() {
    if (isOpenState) close();
    else open();
  }

  function onKeyDown(e) {
    if (destroyed) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      e.target?.isContentEditable
    ) {
      return;
    }
    if (e.code === 'KeyT') {
      toggleDrawer();
      e.preventDefault?.();
      return;
    }
    if (isOpenState && motormanControls) {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        motormanControls.throttleUp?.();
        e.preventDefault?.();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        motormanControls.throttleDown?.();
        e.preventDefault?.();
      } else if (e.code === 'Space') {
        motormanControls.applyEmergencyBrake?.();
        e.preventDefault?.();
      } else if (e.code === 'KeyD') {
        motormanControls.toggleDoors?.();
        e.preventDefault?.();
      } else if (e.code === 'KeyH') {
        motormanControls.triggerHorn?.();
        e.preventDefault?.();
      }
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
  }

  if (typeof metroEngine?.onTrainSelected === 'function') {
    metroEngine.onTrainSelected(() => {
      getStore()?.bumpTelemetry?.();
    });
  }

  dock.registerDrawer('transit', {
    open,
    close,
    isOpen: () => isOpenState,
    launcherEl: null,
    accentColor: '#38bdf8',
  });

  dock.registerSimulation('transit', {
    stop: () => {
      busEngine?.stopBusFleet?.();
      metroEngine?.stopMetroSystem?.();
    },
    isActive: () =>
      Boolean(busEngine?.isSimActive?.() || metroEngine?.isSimActive?.()),
  });

  void passengerFlow;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    close();
    dock.unregisterSimulation('transit');
    dock.unregisterDrawer('transit');
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('keydown', onKeyDown);
    }
  }

  return {
    open,
    close,
    toggle: toggleDrawer,
    isOpen: () => isOpenState,
    getActiveMode: () => activeMode,
    getActiveCity: () => activeCityId,
    isLinesVisible: () => showSystemLines,
    setLinesVisible,
    switchMode,
    startActiveTransit,
    getSupportedNetworks: () => [...SUPPORTED_TRANSIT_NETWORKS],
    destroy,
  };
}
