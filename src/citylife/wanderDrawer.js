/**
 * Ground Explorer & Companion (Wander) Compatibility Shim (Phase 1 `24.50a`).
 *
 * Legacy bottom-row charm launcher & fixed 350px vanilla-DOM flyout are retired
 * in favor of the Sovereign Vue 3 `EarthSimRailPanel` (`ExplorePlayModule.vue`),
 * `ExperiencesExplorer.vue`, and `ActiveSimMicroHud.vue`.
 *
 * Retains full programmatic compatibility for `window.__gevWanderDrawer`,
 * `agentBridge`, keyboard shortcut `W`, and `worldSimDock` mutual exclusion
 * without creating any legacy vanilla-DOM controls.
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createWanderDrawer({
  wanderEngine = null,
  cityEngine = null,
  tourAndPlayEngine = null,
  tourPoiCards = null,
  parkAdventures = null,
  parkFireworks = null,
  agentForgePanel = null,
  railwayEngine = null,
  railDrawer = null,
  onRequestTourBuild = null,
  viewer = null,
} = {}) {
  let isOpenState = false;
  let wizardOpenState = false;
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
    dock.notifyDrawerOpened('wander');
    getStore()?.openModule('explore-play', {
      expandPanel: true,
      exploreTab: 'tour',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    wizardOpenState = false;
    dock.notifyDrawerClosed('wander');
  }

  function toggle() {
    if (isOpenState) close();
    else open();
  }

  function openWizard() {
    wizardOpenState = true;
    open();
  }

  function closeWizard() {
    wizardOpenState = false;
  }

  function startTour(cityId, opts = {}) {
    if (!tourAndPlayEngine?.startCityTour) return null;
    const res = tourAndPlayEngine.startCityTour({ cityId, ...opts });
    getStore()?.runtime?.syncActiveSimSnapshot?.('tour');
    return res;
  }

  function launchHopperBridge(bridge) {
    if (!bridge) return false;
    const targetCityId = bridge.targetCityId || bridge.toCityId;
    const targetStopId = bridge.targetStopId || bridge.arrivalStopId;
    const railCorridor = bridge.railProfileId || bridge.railRouteId;
    const onArrival = targetCityId
      ? () =>
          tourAndPlayEngine?.startCityTour?.({
            cityId: targetCityId,
            startStopId: targetStopId,
          })
      : undefined;
    if (bridge.railCorridorId && railwayEngine?.spawnRailRoute) {
      railwayEngine.spawnRailRoute(
        bridge.railCorridorId,
        bridge.railCorridorId,
        {
          corridor: railCorridor,
          onArrival,
        },
      );
      return true;
    }
    if (bridge.railCorridorId && railwayEngine?.spawnTrain) {
      railwayEngine.spawnTrain(bridge.railCorridorId, {
        corridor: railCorridor,
        onArrival,
      });
      return true;
    }
    if (targetCityId && tourAndPlayEngine?.hopToLinkedPark) {
      tourAndPlayEngine.hopToLinkedPark(targetCityId);
      return true;
    }
    return false;
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
    if (event.key === 'w' || event.key === 'W') {
      if (wanderEngine?.isWandering) return;
      toggle();
    }
  }

  dock.registerDrawer('wander', {
    open,
    close,
    isOpen: () => isOpenState,
    button: null,
    accentColor: '#06b6d4',
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
    wizardOpenState = false;
    dock.unregisterDrawer('wander');
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
    isOpen: () => isOpenState,
    openWizard,
    closeWizard,
    isWizardOpen: () => wizardOpenState,
    startTour,
    launchHopperBridge,
    getElement: () =>
      typeof document !== 'undefined'
        ? document.getElementById('earth-sim-panel')
        : null,
    getEngines: () => ({
      wanderEngine,
      cityEngine,
      tourAndPlayEngine,
      tourPoiCards,
      parkAdventures,
      parkFireworks,
      agentForgePanel,
      railwayEngine,
      railDrawer,
      onRequestTourBuild,
      viewer,
    }),
    destroy,
  };
}
