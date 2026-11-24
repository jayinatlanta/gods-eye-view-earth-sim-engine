/**
 * Earth Sim Intro & Experiences Explorer Router Shim (Phase 1 `24.50a`).
 *
 * Retires the legacy vanilla-DOM modal in favor of `ExperiencesExplorer.vue`
 * (with optional `?intro=1` welcome banner) while strictly preserving
 * `?intro=0`, share link (`?s=` / `?share`), `localStorage` dismissal, and
 * `navigator.webdriver` CI auto-open suppression.
 */

import { EARTH_SIM_FEATURE_CATALOG } from './earthSimFeatureCatalog.js';
import { getGlobalDrawerCoordinator } from './worldSimDock.js';
import { applicationPinia } from './vueRuntime.js';
import { useSovereignUiStore } from './stores/sovereignUi.js';

export const EARTH_SIM_INTRO_STORAGE_KEY = 'gev:earth-sim-intro:v1';
export const EARTH_SIM_INTRO_EVENT = 'gev:open-earth-sim-intro';

function readDismissedStorage() {
  try {
    return (
      globalThis?.localStorage?.getItem?.(EARTH_SIM_INTRO_STORAGE_KEY) ===
      'dismissed'
    );
  } catch {
    return false;
  }
}

export function shouldAutoShowEarthSimIntro({
  search = typeof window !== 'undefined' ? window.location?.search || '' : '',
  dismissed = readDismissedStorage(),
  isAutomatedBrowser = Boolean(globalThis?.navigator?.webdriver),
} = {}) {
  const params = new URLSearchParams(String(search || ''));
  const introParam = params.get('intro');
  if (introParam === '0' || introParam === 'false') return false;
  if (introParam === '1' || introParam === 'true') return true;
  if (isAutomatedBrowser) return false;
  if (params.has('s') || params.has('share')) return false;
  return !dismissed;
}

export function createEarthSimTourOverlay({
  coordinator = getGlobalDrawerCoordinator(),
  agentPanel = null,
  windowRef = typeof window !== 'undefined' ? window : null,
  autoShowOnMount = true,
  search,
} = {}) {
  let openState = false;
  let destroyed = false;

  function getStore() {
    try {
      return useSovereignUiStore(applicationPinia());
    } catch {
      return null;
    }
  }

  function open({ intro = true } = {}) {
    if (destroyed) return;
    openState = true;
    const store = getStore();
    if (store) {
      store.openExplorer({ intro: Boolean(intro) });
    }
  }

  function close() {
    openState = false;
    const store = getStore();
    if (store?.explorerOpen) {
      store.closeExplorer();
    }
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function isOpen() {
    const store = getStore();
    if (store && store.mounted) {
      return Boolean(store.explorerOpen);
    }
    return openState;
  }

  function launchFeature(featureId) {
    const feature = EARTH_SIM_FEATURE_CATALOG.find((f) => f.id === featureId);
    if (!feature) return false;
    close();
    if (feature.drawerId) {
      if (coordinator?.isCustomUxCollapsed?.()) {
        coordinator.setCustomUxCollapsed(false);
      }
      return Boolean(coordinator?.openDrawer?.(feature.drawerId));
    }
    if (feature.id === 'ai-assistant') {
      if (coordinator?.isCustomUxCollapsed?.()) {
        coordinator.setCustomUxCollapsed(false);
      }
      agentPanel?.open?.();
      return true;
    }
    if (feature.id === 'custom-ux-toggle') {
      coordinator?.toggleCustomUxCollapsed?.();
      return true;
    }
    return false;
  }

  const onRecallEvent = () => open({ intro: true });
  windowRef?.addEventListener?.(EARTH_SIM_INTRO_EVENT, onRecallEvent);

  if (autoShowOnMount && shouldAutoShowEarthSimIntro({ search })) {
    open({ intro: true });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    openState = false;
    windowRef?.removeEventListener?.(EARTH_SIM_INTRO_EVENT, onRecallEvent);
  }

  return {
    open,
    close,
    toggle,
    isOpen,
    launchFeature,
    getVisibleFeatureCount: () => EARTH_SIM_FEATURE_CATALOG.length,
    destroy,
  };
}
