/**
 * Wilderness Ranger & Trailhead Explorer Compatibility Shim (Phase 1 `24.50a`).
 *
 * Legacy bottom-row charm launcher & fixed 390px vanilla-DOM flyout are retired
 * in favor of the Sovereign Vue 3 `EarthSimRailPanel` (`ExplorePlayModule.vue`)
 * and `ExperiencesExplorer.vue`.
 *
 * Preserves `selectTrailhead(id)` (with 3D Tiles outlier spike rejection,
 * `cancelFlight`, and `butterGoogle3DTiles`), `getActiveTrailhead()`, `N`
 * hotkey, `window.__gevWildernessDrawer`, and `worldSimDock` registration
 * with zero vanilla-DOM controls.
 */

import * as Cesium from 'cesium';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { trySampleSurfaceHeight } from '../layers/citylife/surfaceHeight.js';
import {
  getAllTrailheads,
  getTrailheadById,
} from '../layers/wilderness/trailheadCatalog.js';
import { createProceduralCampfireAudio } from '../layers/wilderness/proceduralCampfireAudio.js';
import { butterGoogle3DTiles } from '../ui/sovereign/tilesetButter.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function createWildernessDrawer({
  viewer = null,
  audioEngine = null,
} = {}) {
  let isOpenState = false;
  let activeTrailhead = getAllTrailheads()[0] || null;
  let destroyed = false;
  const dock = getGlobalDrawerCoordinator();
  const ownedAudio = !audioEngine;
  const audio = audioEngine || createProceduralCampfireAudio();

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
    dock.notifyDrawerOpened('wilderness');
    getStore()?.openModule('explore-play', {
      expandPanel: true,
      exploreTab: 'wilderness',
    });
  }

  function close() {
    if (!isOpenState) return;
    isOpenState = false;
    dock.notifyDrawerClosed('wilderness');
  }

  function toggle() {
    if (isOpenState) close();
    else open();
  }

  function selectTrailhead(trailheadIdOrObj) {
    const trail =
      typeof trailheadIdOrObj === 'string'
        ? getTrailheadById(trailheadIdOrObj)
        : trailheadIdOrObj;
    if (!trail) return null;
    activeTrailhead = trail;

    if (viewer?.camera) {
      viewer.camera.cancelFlight?.();
      const trailLat = trail.coordinates?.lat ?? trail.lat;
      const trailLon = trail.coordinates?.lon ?? trail.lon;
      const rawElev = trail.coordinates?.elevM ?? trail.elev;
      const catalogElev = Number.isFinite(rawElev) ? rawElev : 1000;
      let groundElev = catalogElev;
      try {
        const carto = Cesium.Cartographic.fromDegrees(trailLon, trailLat);
        const sampled = trySampleSurfaceHeight(viewer, carto);
        if (
          Number.isFinite(sampled) &&
          Math.abs(sampled - catalogElev) <= 350
        ) {
          groundElev = sampled;
        }
      } catch {
        /* fallback to catalog elevation */
      }

      if (typeof viewer.camera.flyTo === 'function') {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            trailLon,
            trailLat,
            groundElev + 320,
          ),
          orientation: {
            heading: Cesium.Math.toRadians(trail.headingDeg || 25),
            pitch: Cesium.Math.toRadians(-35),
            roll: 0,
          },
          duration: 1.6,
        });
      }
      butterGoogle3DTiles(viewer?.scene?.primitives, `wilderness-${trail.id}`, {
        maxMs: 2600,
      });
    }
    getStore()?.bumpTelemetry?.();
    return activeTrailhead;
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
    if (event.key === 'n' || event.key === 'N') {
      toggle();
    }
  }

  dock.registerDrawer('wilderness', {
    open,
    close,
    isOpen: () => isOpenState,
    button: null,
    accentColor: '#10b981',
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
    dock.unregisterDrawer('wilderness');
    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('keydown', onKeyDown);
    }
    if (ownedAudio) {
      audio?.destroy?.();
    }
  }

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpenState,
    selectTrailhead,
    getActiveTrailhead: () => activeTrailhead,
    getAudioEngine: () => audio,
    destroy,
  };
}
