import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef } from 'vue';

export const ACTIVE_MODULE_STORAGE_KEY = 'gev:earth-sim:active-module:v1';
export const EXPLORER_FEED_WIDTH_STORAGE_KEY = 'gev:earth-sim:exp-feed-w:v1';

function resolveCoordinator(rt) {
  return rt?.coordinator || globalThis?.window?.__gevDrawerCoordinator || null;
}

const LEGACY_DRAWER_TO_EXPLORE_TAB = Object.freeze({
  wander: 'tour',
  city: 'city',
  estate: 'estate',
  wilderness: 'wilderness',
});

function readStoredModuleId() {
  try {
    return globalThis?.localStorage?.getItem?.(ACTIVE_MODULE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredModuleId(id) {
  try {
    if (id) {
      globalThis?.localStorage?.setItem?.(
        ACTIVE_MODULE_STORAGE_KEY,
        String(id),
      );
    }
  } catch {
    /* ignore storage disabled */
  }
}

/**
 * Sovereign Earth Sim UI store (100% Cesium-free).
 *
 * Owns:
 * - Single extensible `#earth-sim-panel` active module + tab routing
 * - Sibling Stories-style `Experiences` Card + Pin Explorer state
 * - Bidirectional synchronization with `getGlobalDrawerCoordinator()` for
 *   `"Hide Custom UI"` (`Alt+H`) and upstream `EXCLUSIVE_SURFACE_CLASSES`
 * - Synchronous reactive `activeSim` snapshot for `ActiveSimMicroHud`
 *   (zero polling lag on camera-mode clicks)
 */
export const useSovereignUiStore = defineStore('gev-sovereign-ui', () => {
  /** Whether the Cesium-backed Sovereign Vue root is mounted on this page. */
  const mounted = ref(false);

  /** Whether user toggled `"Hide Custom UI"` (`Alt+H`). */
  const customUiHidden = ref(false);

  /** Whether an exclusive upstream surface (`stories-mode`, `cockpit-mode`, `ui-clean-view`, `recording-mode`, `scene-playback-mode`) owns the screen. */
  const exclusiveUpstreamSurface = ref(false);

  /** Active registered module inside `#earth-sim-panel`. */
  const activeModuleId = ref(readStoredModuleId() || 'explore-play');

  /** Active sub-tab inside `ExplorePlayModule` (`tour` | `city` | `estate` | `wilderness`). */
  const activeExploreTab = ref('tour');

  /** Full-screen sibling `ExperiencesExplorer` visibility and filters. */
  const explorerOpen = ref(false);
  const explorerIntroMode = ref(false);
  const explorerQuery = ref('');
  const explorerChips = ref([]);
  const explorerSort = ref('featured');
  const explorerPickedId = ref(null);

  /**
   * Synchronous reactive snapshot of the active simulation for `ActiveSimMicroHud`.
   * Shape: {
   *   kind: 'wander' | 'tour' | 'city' | 'estate' | 'wilderness' | 'flight' | 'rail' | 'drive' | 'boat' | 'transit' | 'freight',
   *   title: string,
   *   subtitle?: string,
   *   locationLabel?: string,
   *   speedLabel?: string,
   *   cameraMode: string,
   *   cameraModes: Array<{ id: string, label: string, icon?: string }>,
   *   paused?: boolean,
   *   canStep?: boolean,
   *   canResume?: boolean,
   *   stepLabel?: string,
   *   meta?: object,
   * } | null
   */
  const activeSim = ref(null);

  /** Active autonomous Dev Forge job status (`Build: Tour [Place]`, etc.). */
  const activeForgeJob = ref(null);

  /** Whether the `ActiveSimMicroHud` pill is auto-folded. */
  const microHudFolded = ref(false);

  /** Raw engine / shell runtime handles attached by `src/app/sovereignTools.js`. */
  const runtime = shallowRef(null);

  /** Monotonic revision bumped whenever engines emit status updates. */
  const telemetryRevision = ref(0);

  let unsubCoordinatorCollapse = null;
  let syncingCollapse = false;

  const earthSimTabAvailable = computed(
    () =>
      mounted.value && !customUiHidden.value && !exclusiveUpstreamSurface.value,
  );

  const chromeSuppressed = computed(
    () => customUiHidden.value || exclusiveUpstreamSurface.value,
  );

  function syncBodyHiddenClass(hidden) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('gev-custom-ux-hidden', Boolean(hidden));
  }

  function notifyLayoutCornersChanged() {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new window.Event('resize'));
    } catch {
      /* ignore in headless tests */
    }
  }

  function applyCustomUiHidden(nextHidden, { fromCoordinator = false } = {}) {
    const next = Boolean(nextHidden);
    customUiHidden.value = next;
    syncBodyHiddenClass(next);
    if (next) {
      explorerOpen.value = false;
      explorerIntroMode.value = false;
      const styleManager = runtime.value?.styleManager;
      if (typeof styleManager?.setPanelCollapsed === 'function') {
        try {
          styleManager.setPanelCollapsed('earth-sim-panel', true, {
            persist: false,
            syncShare: false,
          });
        } catch {
          /* ignore */
        }
      } else if (typeof document !== 'undefined') {
        document
          .getElementById?.('earth-sim-panel')
          ?.classList?.add('collapsed');
      }
    }
    if (!fromCoordinator && !syncingCollapse) {
      syncingCollapse = true;
      try {
        const coordinator = resolveCoordinator(runtime.value);
        if (coordinator && coordinator.isCustomUxCollapsed() !== next) {
          coordinator.setCustomUxCollapsed(next);
        }
      } finally {
        syncingCollapse = false;
      }
    }
    notifyLayoutCornersChanged();
    return next;
  }

  function setCustomUiHidden(hidden) {
    return applyCustomUiHidden(hidden, { fromCoordinator: false });
  }

  function toggleCustomUiHidden() {
    return applyCustomUiHidden(!customUiHidden.value, {
      fromCoordinator: false,
    });
  }

  function setExclusiveUpstreamSurface(active) {
    const next = Boolean(active);
    if (exclusiveUpstreamSurface.value === next) return;
    exclusiveUpstreamSurface.value = next;
    if (next && explorerOpen.value) {
      explorerOpen.value = false;
    }
  }

  function setActiveModule(moduleId) {
    if (!moduleId) return;
    activeModuleId.value = String(moduleId);
    writeStoredModuleId(activeModuleId.value);
  }

  function setActiveExploreTab(tabId) {
    if (['tour', 'city', 'estate', 'wilderness'].includes(tabId)) {
      activeExploreTab.value = tabId;
    }
  }

  function expandEarthSimPanel() {
    if (customUiHidden.value) {
      setCustomUiHidden(false);
    }
    const isMobile =
      typeof document !== 'undefined' &&
      document.body?.classList?.contains('mobile-shell');
    if (isMobile) {
      const tab = document.querySelector(
        '#mobile-tab-bar [data-mobile-sheet="earth-sim"]',
      );
      if (tab && tab.getAttribute('aria-expanded') !== 'true') {
        tab.click();
        return;
      }
    }
    const styleManager = runtime.value?.styleManager;
    if (typeof styleManager?.setPanelCollapsed === 'function') {
      styleManager.setPanelCollapsed('earth-sim-panel', false, {
        explicit: true,
      });
    } else if (typeof document !== 'undefined') {
      document
        .getElementById?.('earth-sim-panel')
        ?.classList?.remove('collapsed');
    }
  }

  function collapseEarthSimPanel() {
    const styleManager = runtime.value?.styleManager;
    if (typeof styleManager?.setPanelCollapsed === 'function') {
      styleManager.setPanelCollapsed('earth-sim-panel', true, {
        explicit: true,
      });
    } else if (typeof document !== 'undefined') {
      document.getElementById?.('earth-sim-panel')?.classList?.add('collapsed');
    }
  }

  function openModule(
    moduleId = activeModuleId.value || 'explore-play',
    { expandPanel = true, exploreTab = null } = {},
  ) {
    if (customUiHidden.value) {
      setCustomUiHidden(false);
    }
    setActiveModule(moduleId);
    if (exploreTab) {
      setActiveExploreTab(exploreTab);
    }
    if (expandPanel) {
      expandEarthSimPanel();
    }
  }

  function openLegacyDrawer(legacyId) {
    const exploreTab = LEGACY_DRAWER_TO_EXPLORE_TAB[legacyId];
    if (exploreTab) {
      openModule('explore-play', { expandPanel: true, exploreTab });
      return true;
    }
    const coordinator = resolveCoordinator(runtime.value);
    if (!coordinator) return false;
    if (coordinator.isCustomUxCollapsed()) {
      setCustomUiHidden(false);
    }
    return coordinator.openDrawer(legacyId);
  }

  function openExplorer({
    query = null,
    chips = null,
    pickedId = null,
    intro = false,
  } = {}) {
    if (customUiHidden.value) {
      setCustomUiHidden(false);
    }
    if (query !== null) explorerQuery.value = String(query);
    if (Array.isArray(chips)) explorerChips.value = [...chips];
    if (pickedId !== null) explorerPickedId.value = pickedId;
    explorerIntroMode.value = Boolean(intro);
    explorerOpen.value = true;
    notifyLayoutCornersChanged();
  }

  function closeExplorer() {
    explorerOpen.value = false;
    explorerIntroMode.value = false;
    notifyLayoutCornersChanged();
  }

  function setActiveSim(snapshot) {
    activeSim.value = snapshot ? { ...snapshot } : null;
    if (snapshot) {
      microHudFolded.value = false;
    }
  }

  function patchActiveSimCameraMode(mode, { kind = null } = {}) {
    if (!activeSim.value) return;
    if (kind && activeSim.value.kind !== kind) return;
    activeSim.value = {
      ...activeSim.value,
      cameraMode: mode,
    };
  }

  function clearActiveSim(kind = null) {
    if (!activeSim.value) return;
    if (kind && activeSim.value.kind !== kind) return;
    activeSim.value = null;
  }

  function setActiveForgeJob(job) {
    activeForgeJob.value = job ? { ...job } : null;
  }

  function bumpTelemetry() {
    telemetryRevision.value += 1;
  }

  function connectRuntime(ctx) {
    disconnectRuntime();
    runtime.value = ctx ? markRaw(ctx) : null;
    mounted.value = Boolean(ctx);
    const coordinator = resolveCoordinator(ctx);
    customUiHidden.value = Boolean(coordinator?.isCustomUxCollapsed?.());
    syncBodyHiddenClass(customUiHidden.value);
    if (typeof coordinator?.onCustomUxCollapseChange === 'function') {
      unsubCoordinatorCollapse = coordinator.onCustomUxCollapseChange(
        (collapsed) => {
          if (syncingCollapse) return;
          applyCustomUiHidden(collapsed, { fromCoordinator: true });
        },
      );
    }
  }

  function disconnectRuntime() {
    unsubCoordinatorCollapse?.();
    unsubCoordinatorCollapse = null;
    runtime.value = null;
    mounted.value = false;
    explorerOpen.value = false;
    explorerIntroMode.value = false;
    activeSim.value = null;
    activeForgeJob.value = null;
    syncBodyHiddenClass(false);
  }

  return {
    mounted,
    customUiHidden,
    exclusiveUpstreamSurface,
    earthSimTabAvailable,
    chromeSuppressed,
    activeModuleId,
    activeExploreTab,
    explorerOpen,
    explorerIntroMode,
    explorerQuery,
    explorerChips,
    explorerSort,
    explorerPickedId,
    activeSim,
    activeForgeJob,
    microHudFolded,
    runtime,
    telemetryRevision,
    connectRuntime,
    disconnectRuntime,
    setCustomUiHidden,
    toggleCustomUiHidden,
    setExclusiveUpstreamSurface,
    setActiveModule,
    setActiveExploreTab,
    expandEarthSimPanel,
    collapseEarthSimPanel,
    openModule,
    openLegacyDrawer,
    openExplorer,
    closeExplorer,
    setActiveSim,
    patchActiveSimCameraMode,
    clearActiveSim,
    setActiveForgeJob,
    bumpTelemetry,
  };
});
