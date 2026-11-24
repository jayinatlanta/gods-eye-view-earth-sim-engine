/**
 * Ground Explorer & Companion (Wander) Dedicated Flyout Drawer UI.
 *
 * Separates Player Ground Wander (WASD + Autonomous Companion) from Living World
 * Sim (NPC crowd observation) into a dedicated first-class experience:
 * - Zero-credit live municipality / street / neighborhood location banner
 * - Non-destructive browsing (never teleports to Atlanta on open)
 * - Synchronized Pointer Lock ("Mouse Look") button + top-center release pill
 *   that updates immediately on ESC or canvas left-click
 * - Coordinated single-flyout mutual exclusion via worldSimDock
 */

import * as Cesium from 'cesium';
import { WANDER_CAMERA_MODES } from '../layers/citylife/avatarWanderEngine.js';
import {
  getCompanionPersonaName,
  setCompanionPersonaName,
} from '../layers/citylife/companionDot.js';
import {
  METRO_LANDMARK_CATALOG,
  METRO_TOUR_METADATA,
  TOUR_OR_PLAY_STATES,
  TOUR_STOP_CATEGORIES,
  resolveTourOrPlayContext,
  getPlayActivitiesForEnvironment,
  getCustomToursRegistry,
  getCustomStopsForCity,
  getLandmarksForCity,
  validateTourStopDraft,
  validateCustomTourDraft,
  createCustomTour,
  addTourStop,
  removeCustomTourStop,
  removeCustomTour,
  exportTourAsContractJson,
  onCustomToursChange,
  inferContinentFromCoords,
  getAllTourCatalogEntries,
  getRuntimeBuiltTours,
  isConcreteCatalogPlaceName,
  getCachedCatalogPlaceAt,
  resolveCatalogPlaceAt,
  isResortStayId,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  getTempBasecamp,
  checkInTempBasecamp,
  checkOutTempBasecamp,
  onTempBasecampChange,
} from '../layers/estates/domicileCatalog.js';
import { pickActiveGroundPosition } from '../layers/citylife/surfaceHeight.js';
import { EXEMPLAR_LOCALES } from '../layers/citylife/localeClassifier.js';
import { LIVING_CITIES } from './cityWaypoints.js';
import {
  getGlobalDrawerCoordinator,
  onLocalityResolved,
  resolveZeroCreditLocality,
} from '../ui/worldSimDock.js';

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
  container = null,
} = {}) {
  const host =
    container || (typeof document !== 'undefined' ? document.body : null);
  let isOpen = false;
  let launcherBtn = null;
  let drawerEl = null;
  let pointerLockBannerEl = null;
  let tourResumePillEl = null;
  let selectedTourMode = 'all';
  let selectedResortTransitMode = 'walk_midway';
  let unsubscribePointerLock = null;
  let unsubscribeLocality = null;
  let unsubscribeTourStatus = null;
  let unsubscribeCustomTours = null;
  let unsubscribeAgentCaps = null;
  let unsubscribeParkAdventures = null;
  let unsubscribeParkFireworks = null;
  let unsubscribeTempBasecamp = null;
  let wanderCatalogLookupGen = 0;
  let activeWanderCatalogPlace = null;
  let isWizardOpen = false;
  let wizardMode = 'stop'; // 'stop' | 'tour'
  let wizardPin = null; // { lat, lon, elev, heading, localityLabel, countryHint }
  let isGlobePickMode = false;
  let wizardPickHandler = null;
  let wizardFeedbackTimer = null;
  const dock = getGlobalDrawerCoordinator();

  function getEffectiveAgentPanel() {
    if (agentForgePanel) return agentForgePanel;
    if (typeof window !== 'undefined' && window.__gevAgentForgePanel) {
      return window.__gevAgentForgePanel;
    }
    return null;
  }

  function canBuildTourWithForge() {
    return Boolean(getEffectiveAgentPanel()?.canBuildTourWithForge?.());
  }

  function escapeHtml(raw) {
    return String(raw ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function copyTextSafe(text) {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand?.('copy');
        ta.remove();
        return Boolean(ok);
      }
    } catch {}
    return false;
  }

  function getCameraGroundTarget() {
    const camPos = cityEngine?.getCurrentCameraGroundPosition?.();
    if (camPos && Number.isFinite(camPos.lat) && Number.isFinite(camPos.lon)) {
      let headingDeg = 0;
      if (Number.isFinite(viewer?.camera?.heading)) {
        headingDeg = Cesium.Math.toDegrees(viewer.camera.heading);
      }
      return {
        lat: camPos.lat,
        lon: camPos.lon,
        elev: Number.isFinite(camPos.elev) ? camPos.elev : null,
        heading: ((headingDeg % 360) + 360) % 360,
      };
    }

    const carto = viewer?.camera?.positionCartographic;
    if (
      carto &&
      Number.isFinite(carto.latitude) &&
      Number.isFinite(carto.longitude)
    ) {
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const heading = Number.isFinite(viewer?.camera?.heading)
        ? ((Cesium.Math.toDegrees(viewer.camera.heading) % 360) + 360) % 360
        : 0;
      return { lat, lon, elev: null, heading };
    }

    return { lat: 33.785, lon: -84.373, elev: null, heading: 0 };
  }

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('gev-wander-drawer-styles')) return;

    const style = document.createElement('style');
    style.id = 'gev-wander-drawer-styles';
    style.textContent = `
      .gev-wander-launcher-btn {
        position: fixed;
        bottom: 74px;
        right: 336px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(10, 16, 28, 0.85);
        border: 1px solid rgba(6, 182, 212, 0.45);
        color: #22d3ee;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10001;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        transition: all 0.2s ease;
      }
      .gev-wander-launcher-btn:hover,
      .gev-wander-launcher-btn.dock-open {
        background: rgba(6, 182, 212, 0.25);
        border-color: #22d3ee;
        transform: scale(1.06);
        box-shadow: 0 0 16px rgba(6, 182, 212, 0.45);
      }
      .gev-wander-launcher-btn.sim-running {
        border-color: #10b981;
        box-shadow: 0 0 14px rgba(16, 185, 129, 0.55);
      }

      .gev-wander-drawer {
        position: fixed;
        bottom: 128px;
        right: 24px;
        width: min(356px, calc(100vw - 32px));
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 160px);
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
        background: rgba(9, 14, 24, 0.94);
        border: 1px solid rgba(6, 182, 212, 0.38);
        border-radius: 14px;
        padding: 16px;
        color: #e2e8f0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        z-index: 10002;
        backdrop-filter: blur(16px);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.72);
        display: none;
        flex-direction: column;
        gap: 12px;
      }
      .gev-wander-drawer.open {
        display: flex;
      }

      .gev-wander-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        padding-bottom: 10px;
      }
      .gev-wander-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #22d3ee;
      }
      .gev-wander-subtitle {
        font-size: 10.5px;
        color: #94a3b8;
        margin-top: 2px;
      }
      .gev-wander-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .gev-wander-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }

      .gev-wander-loc-card {
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(6, 182, 212, 0.28);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .gev-wander-loc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        font-weight: 700;
      }
      .gev-wander-loc-badge {
        font-size: 9.5px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.15);
        color: #94a3b8;
      }
      .gev-wander-loc-badge.active {
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.4);
      }
      .gev-wander-loc-name {
        font-size: 13px;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.35;
      }
      .gev-wander-loc-coords {
        font-size: 11px;
        color: #38bdf8;
        font-family: 'JetBrains Mono', monospace;
      }

      .gev-wander-primary-row {
        display: flex;
        gap: 8px;
      }
      .gev-wander-start-btn {
        flex: 2;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid rgba(6, 182, 212, 0.55);
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.28), rgba(59, 130, 246, 0.22));
        color: #ecfeff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gev-wander-start-btn:hover {
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.45), rgba(59, 130, 246, 0.35));
      }
      .gev-wander-start-btn.active {
        background: linear-gradient(135deg, #06b6d4, #2563eb);
        color: #fff;
        border-color: #67e8f9;
        box-shadow: 0 0 14px rgba(6, 182, 212, 0.4);
      }
      .gev-wander-exit-btn {
        flex: 1;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: rgba(30, 41, 59, 0.7);
        color: #fca5a5;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .gev-wander-exit-btn:hover {
        background: rgba(239, 68, 68, 0.22);
        border-color: #f87171;
      }

      .gev-wander-section-label {
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
        margin-bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .gev-wander-cam-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .gev-wander-mode-btn {
        padding: 7px 6px;
        border-radius: 7px;
        background: rgba(30, 41, 59, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .gev-wander-mode-btn:hover {
        background: rgba(51, 65, 85, 0.85);
        color: #fff;
      }
      .gev-wander-mode-btn.active {
        background: rgba(6, 182, 212, 0.24);
        border-color: #22d3ee;
        color: #fff;
      }
      .gev-wander-mode-btn.lock-active {
        background: rgba(16, 185, 129, 0.25);
        border-color: #10b981;
        color: #ecfdf5;
      }

      .gev-wander-companion-card {
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(16, 185, 129, 0.28);
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .gev-wander-companion-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .gev-wander-comp-toggle {
        flex: 1;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid rgba(16, 185, 129, 0.45);
        background: rgba(16, 185, 129, 0.2);
        color: #d1fae5;
      }
      .gev-wander-comp-toggle.off {
        border-color: rgba(148, 163, 184, 0.25);
        background: rgba(30, 41, 59, 0.6);
        color: #94a3b8;
      }
      .gev-wander-comp-input {
        width: 115px;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(9, 14, 24, 0.9);
        color: #f8fafc;
        font-size: 11px;
      }
      .gev-wander-comp-thought {
        font-size: 11px;
        font-style: italic;
        color: #a7f3d0;
        line-height: 1.35;
        padding: 6px 8px;
        background: rgba(6, 78, 59, 0.25);
        border-left: 2px solid #10b981;
        border-radius: 4px;
      }

      .gev-wander-jump-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .gev-wander-jump-select {
        flex: 1 1 0%;
        width: 0;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 7px;
        padding: 7px 8px;
        color: #f8fafc;
        font-size: 11.5px;
      }
      .gev-wander-jump-btn {
        flex: 0 0 auto;
        flex-shrink: 0;
        white-space: nowrap;
        box-sizing: border-box;
        padding: 7px 12px;
        border-radius: 7px;
        border: 1px solid rgba(6, 182, 212, 0.45);
        background: rgba(6, 182, 212, 0.18);
        color: #22d3ee;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .gev-wander-jump-btn:hover {
        background: rgba(6, 182, 212, 0.32);
        color: #fff;
      }

      .gev-wander-help {
        font-size: 10.5px;
        color: #94a3b8;
        line-height: 1.4;
        background: rgba(15, 23, 42, 0.55);
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.12);
      }

      .gev-pointer-lock-banner {
        position: fixed;
        top: 66px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(6, 78, 59, 0.92);
        border: 1px solid #10b981;
        color: #ecfdf5;
        padding: 7px 16px;
        border-radius: 999px;
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 12px;
        font-weight: 600;
        z-index: 10010;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
        display: none;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }
      .gev-pointer-lock-banner.visible {
        display: flex;
      }
      .gev-tour-resume-pill {
        position: fixed;
        bottom: 144px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.94);
        border: 1px solid rgba(56, 189, 248, 0.55);
        color: #f8fafc;
        padding: 7px 12px;
        border-radius: 999px;
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 12px;
        display: none;
        align-items: center;
        gap: 8px;
        z-index: 10015;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
      }
      .gev-tour-resume-pill.visible {
        display: flex;
      }
      .gev-tour-resume-pill-label {
        color: #cbd5e1;
        font-weight: 600;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gev-tour-resume-btn {
        border: 1px solid rgba(56, 189, 248, 0.45);
        background: rgba(14, 116, 144, 0.35);
        color: #e0f2fe;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-resume-btn:hover {
        background: rgba(6, 182, 212, 0.45);
      }
      .gev-tour-resume-next-btn {
        border-color: rgba(244, 114, 182, 0.55);
        background: rgba(190, 24, 93, 0.35);
        color: #fce7f3;
      }
      .gev-tour-mode-bar {
        display: flex;
        gap: 4px;
        margin-top: 6px;
        flex-wrap: wrap;
      }
      .gev-tour-mode-btn {
        flex: 1 1 auto;
        padding: 4px 7px;
        border-radius: 6px;
        border: 1px solid rgba(56, 189, 248, 0.3);
        background: rgba(15, 23, 42, 0.72);
        color: #cbd5e1;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-mode-btn.active {
        border-color: #f472b6;
        background: rgba(236, 72, 153, 0.25);
        color: #fdf2f8;
      }

      .gev-tour-passport-strip,
      .gev-tour-npc-strip,
      .gev-tour-hopper-bar {
        display: none;
        flex-direction: column;
        gap: 5px;
        background: rgba(9, 14, 24, 0.72);
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 8px;
        padding: 7px 8px;
      }
      .gev-tour-passport-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10.5px;
        font-weight: 700;
        color: #fde047;
      }
      .gev-tour-passport-bar-wrap {
        height: 5px;
        border-radius: 999px;
        background: rgba(30, 41, 59, 0.9);
        overflow: hidden;
      }
      .gev-tour-passport-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #fbbf24, #34d399);
        transition: width 0.2s ease;
      }
      .gev-tour-passport-stamps {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        font-size: 12px;
      }
      .gev-tour-secrets-details summary {
        font-size: 10px;
        color: #94a3b8;
        cursor: pointer;
        user-select: none;
      }
      .gev-tour-secrets-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 5px;
        max-height: 112px;
        overflow-y: auto;
      }
      .gev-tour-secret-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 5px;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.2);
        font-size: 10px;
        color: #e2e8f0;
      }
      .gev-tour-secret-row.collected {
        border-color: rgba(16, 185, 129, 0.45);
        color: #a7f3d0;
      }
      .gev-tour-secret-btn {
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid rgba(251, 191, 36, 0.55);
        background: rgba(251, 191, 36, 0.16);
        color: #fef3c7;
        font-size: 9.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-npc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10.5px;
        font-weight: 700;
        color: #7dd3fc;
      }
      .gev-tour-npc-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .gev-tour-npc-btn {
        padding: 4px 7px;
        border-radius: 6px;
        border: 1px solid rgba(56, 189, 248, 0.32);
        background: rgba(15, 23, 42, 0.88);
        color: #e0f2fe;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
      }
      .gev-tour-npc-btn.near,
      .gev-tour-npc-btn.active {
        border-color: #fde047;
        background: rgba(251, 191, 36, 0.22);
        color: #fef9c3;
      }
      .gev-tour-npc-dialogue {
        font-size: 10.5px;
        line-height: 1.35;
        color: #cbd5e1;
        background: rgba(15, 23, 42, 0.78);
        padding: 5px 7px;
        border-radius: 6px;
        border-left: 2px solid #38bdf8;
      }
      .gev-tour-hopper-header {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #c084fc;
      }
      .gev-tour-hopper-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .gev-tour-hopper-btn {
        flex: 1 1 auto;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(192, 132, 252, 0.48);
        background: linear-gradient(135deg, rgba(147, 51, 234, 0.28), rgba(14, 165, 233, 0.22));
        color: #f3e8ff;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        text-align: left;
      }
      .gev-tour-hopper-btn:hover {
        border-color: #e879f9;
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(56, 189, 248, 0.35));
      }
      .gev-tour-hopper-ride-btn {
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(56, 189, 248, 0.65);
        background: linear-gradient(135deg, rgba(2, 132, 199, 0.4), rgba(14, 165, 233, 0.3));
        color: #e0f2fe;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-hopper-ride-btn:hover {
        border-color: #7dd3fc;
        background: linear-gradient(135deg, rgba(2, 132, 199, 0.65), rgba(56, 189, 248, 0.5));
        color: #ffffff;
      }
      .gev-tour-fireworks-btn {
        border-color: rgba(244, 114, 182, 0.55);
        background: rgba(190, 24, 93, 0.22);
        color: #fce7f3;
      }
      .gev-tour-fireworks-btn.active {
        border-color: #fde047;
        background: linear-gradient(135deg, rgba(236, 72, 153, 0.45), rgba(245, 158, 11, 0.35));
        color: #fff;
        box-shadow: 0 0 12px rgba(244, 114, 182, 0.45);
      }
      .gev-tour-firepit-btn {
        border-color: rgba(245, 158, 11, 0.58);
        background: rgba(180, 83, 9, 0.24);
        color: #fef3c7;
      }
      .gev-tour-firepit-btn.active {
        border-color: #fde047;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.5), rgba(234, 88, 12, 0.42));
        color: #ffffff;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
      }
      .gev-resort-transit-bar {
        display: none;
        gap: 4px;
        align-items: center;
        flex-wrap: wrap;
      }
      .gev-resort-transit-btn {
        flex: 1 1 0;
        padding: 4px 6px;
        border-radius: 6px;
        border: 1px solid rgba(52, 211, 153, 0.35);
        background: rgba(15, 23, 42, 0.72);
        color: #cbd5e1;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-resort-transit-btn.active {
        border-color: #34d399;
        background: rgba(16, 185, 129, 0.25);
        color: #ecfdf5;
      }
      .gev-resort-checkin-bar {
        display: none;
        gap: 6px;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.72);
        border: 1px solid rgba(251, 191, 36, 0.38);
      }
      .gev-resort-checkin-btn {
        flex: 1;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(251, 191, 36, 0.55);
        background: rgba(217, 119, 6, 0.22);
        color: #fef3c7;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .gev-resort-checkin-btn.checked-in {
        border-color: #34d399;
        background: rgba(16, 185, 129, 0.25);
        color: #d1fae5;
      }
      .gev-resort-open-basecamp-btn {
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(34, 211, 238, 0.5);
        background: rgba(8, 145, 178, 0.25);
        color: #a5f3fc;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }

      .gev-tour-play-card {
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(168, 85, 247, 0.42);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        box-sizing: border-box;
      }
      .gev-tour-play-card.play-mode {
        border-color: rgba(245, 158, 11, 0.45);
      }
      .gev-tour-play-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #c084fc;
      }
      .gev-tour-play-card.play-mode .gev-tour-play-header {
        color: #fbbf24;
      }
      .gev-tour-play-badge {
        font-size: 9px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(168, 85, 247, 0.2);
        color: #e9d5ff;
        border: 1px solid rgba(168, 85, 247, 0.4);
      }
      .gev-tour-play-status {
        font-size: 11px;
        color: #e2e8f0;
        line-height: 1.35;
        background: rgba(9, 14, 24, 0.65);
        padding: 6px 8px;
        border-radius: 6px;
        border-left: 2px solid #a855f7;
      }
      .gev-tour-play-row {
        display: flex;
        gap: 6px;
        align-items: center;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
      .gev-tour-city-select {
        flex: 1 1 0%;
        width: 0;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-sizing: border-box;
        background: rgba(9, 14, 24, 0.92);
        border: 1px solid rgba(168, 85, 247, 0.35);
        border-radius: 6px;
        padding: 6px 8px;
        color: #f8fafc;
        font-size: 11px;
      }
      .gev-tour-start-btn {
        flex: 0 0 auto;
        flex-shrink: 0;
        box-sizing: border-box;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.65);
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(6, 182, 212, 0.28));
        color: #faf5ff;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-start-btn:hover {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.55), rgba(6, 182, 212, 0.42));
      }
      .gev-tour-action-btn {
        flex: 1;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid rgba(16, 185, 129, 0.48);
        background: rgba(16, 185, 129, 0.18);
        color: #d1fae5;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .gev-tour-action-btn.continue {
        border-color: rgba(6, 182, 212, 0.55);
        background: rgba(6, 182, 212, 0.22);
        color: #cffafe;
      }
      .gev-play-activities-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 5px;
      }
      .gev-play-act-btn {
        padding: 6px 7px;
        border-radius: 6px;
        background: rgba(30, 41, 59, 0.78);
        border: 1px solid rgba(245, 158, 11, 0.3);
        color: #fef3c7;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gev-play-act-btn:hover,
      .gev-play-act-btn.active {
        background: rgba(245, 158, 11, 0.28);
        border-color: #fbbf24;
        color: #fff;
      }

      .gev-tour-wizard-open-btn {
        flex: 0 0 auto;
        flex-shrink: 0;
        box-sizing: border-box;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid rgba(16, 185, 129, 0.55);
        background: rgba(16, 185, 129, 0.16);
        color: #6ee7b7;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-wizard-open-btn:hover,
      .gev-tour-wizard-open-btn.active {
        background: rgba(16, 185, 129, 0.32);
        border-color: #34d399;
        color: #fff;
      }

      .gev-tour-no-tour-cta {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        background: rgba(168, 85, 247, 0.12);
        border: 1px dashed rgba(168, 85, 247, 0.45);
        border-radius: 7px;
        padding: 6px 8px;
      }
      .gev-tour-no-tour-cta-text {
        font-size: 10px;
        color: #ddd6fe;
        line-height: 1.3;
      }
      .gev-tour-forge-build-btn,
      .gev-tour-wizard-new-tour-btn {
        flex: 0 0 auto;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.65);
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(16, 185, 129, 0.28));
        color: #faf5ff;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-tour-forge-build-btn:hover,
      .gev-tour-wizard-new-tour-btn:hover {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.55), rgba(16, 185, 129, 0.45));
      }

      .gev-tour-wizard-panel {
        display: none;
        flex-direction: column;
        gap: 7px;
        margin-top: 2px;
        padding: 9px 10px;
        background: rgba(9, 14, 24, 0.9);
        border: 1px solid rgba(34, 211, 238, 0.4);
        border-radius: 9px;
        box-sizing: border-box;
        min-width: 0;
      }
      .gev-tour-wizard-panel.open {
        display: flex;
      }
      .gev-wizard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .gev-wizard-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #67e8f9;
        text-transform: uppercase;
      }
      .gev-wizard-mode-pills {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .gev-wizard-mode-btn {
        padding: 3px 7px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(30, 41, 59, 0.8);
        color: #cbd5e1;
        font-size: 9.5px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-wizard-mode-btn.active {
        border-color: #22d3ee;
        background: rgba(6, 182, 212, 0.28);
        color: #ecfeff;
      }
      .gev-wizard-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 13px;
        cursor: pointer;
        padding: 1px 4px;
        border-radius: 4px;
      }
      .gev-wizard-close-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
      .gev-wizard-pin-card {
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid rgba(56, 189, 248, 0.28);
        border-radius: 7px;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .gev-wizard-pin-label {
        font-size: 10.5px;
        font-weight: 700;
        color: #f8fafc;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gev-wizard-pin-coords {
        font-size: 9.5px;
        color: #38bdf8;
        font-family: 'JetBrains Mono', monospace;
      }
      .gev-wizard-pin-actions {
        display: flex;
        gap: 5px;
      }
      .gev-wizard-mini-btn {
        flex: 1;
        padding: 4px 6px;
        border-radius: 5px;
        border: 1px solid rgba(56, 189, 248, 0.35);
        background: rgba(30, 41, 59, 0.85);
        color: #bae6fd;
        font-size: 9.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .gev-wizard-mini-btn:hover {
        background: rgba(56, 189, 248, 0.22);
        color: #fff;
      }
      .gev-wizard-mini-btn.pick-active {
        border-color: #fbbf24;
        background: rgba(245, 158, 11, 0.25);
        color: #fef3c7;
      }
      .gev-wizard-field-label {
        font-size: 9.5px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .gev-wizard-input,
      .gev-wizard-select,
      .gev-wizard-textarea {
        width: 100%;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 6px;
        padding: 6px 8px;
        color: #f8fafc;
        font-size: 11px;
        font-family: inherit;
        outline: none;
      }
      .gev-wizard-input:focus,
      .gev-wizard-select:focus,
      .gev-wizard-textarea:focus {
        border-color: #22d3ee;
      }
      .gev-wizard-textarea {
        resize: vertical;
        min-height: 46px;
        line-height: 1.35;
      }
      .gev-wizard-contract-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 9.5px;
      }
      .gev-wizard-contract-status {
        font-weight: 700;
        color: #fbbf24;
      }
      .gev-wizard-contract-status.ready {
        color: #34d399;
      }
      .gev-wizard-json-details {
        font-size: 9.5px;
        color: #94a3b8;
      }
      .gev-wizard-json-details summary {
        cursor: pointer;
        color: #67e8f9;
        font-weight: 600;
      }
      .gev-wizard-json-pre {
        margin: 5px 0 4px;
        padding: 6px;
        border-radius: 6px;
        background: rgba(2, 6, 23, 0.92);
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #a5f3fc;
        font-family: 'JetBrains Mono', monospace;
        font-size: 9px;
        max-height: 110px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .gev-wizard-feedback {
        display: none;
        font-size: 10px;
        padding: 5px 7px;
        border-radius: 5px;
        line-height: 1.3;
      }
      .gev-wizard-feedback.visible {
        display: block;
      }
      .gev-wizard-feedback.ok {
        background: rgba(16, 185, 129, 0.16);
        border: 1px solid rgba(16, 185, 129, 0.45);
        color: #a7f3d0;
      }
      .gev-wizard-feedback.error {
        background: rgba(239, 68, 68, 0.16);
        border: 1px solid rgba(239, 68, 68, 0.45);
        color: #fecaca;
      }
      .gev-wizard-save-row {
        display: flex;
        gap: 6px;
      }
      .gev-wizard-save-btn {
        flex: 1;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid rgba(16, 185, 129, 0.55);
        background: rgba(16, 185, 129, 0.22);
        color: #d1fae5;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .gev-wizard-save-btn:hover {
        background: rgba(16, 185, 129, 0.36);
        color: #fff;
      }
      .gev-wizard-save-start-btn {
        flex: 1.25;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.65);
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(6, 182, 212, 0.32));
        color: #faf5ff;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .gev-wizard-save-start-btn:hover {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.6), rgba(6, 182, 212, 0.48));
      }
      .gev-wizard-custom-list-wrap {
        display: none;
        flex-direction: column;
        gap: 5px;
        padding-top: 6px;
        border-top: 1px solid rgba(148, 163, 184, 0.16);
      }
      .gev-wizard-custom-list-wrap.visible {
        display: flex;
      }
      .gev-wizard-custom-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 112px;
        overflow-y: auto;
      }
      .gev-wizard-custom-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 5px;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.18);
        font-size: 10px;
      }
      .gev-wizard-custom-row-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #e2e8f0;
      }
      .gev-wizard-row-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 1px 4px;
        border-radius: 4px;
      }
      .gev-wizard-row-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    `;
    document.head.appendChild(style);
  }

  function syncPointerLockUI(locked) {
    if (!drawerEl) return;
    const lockBtn = drawerEl.querySelector('[data-wmode="fps_lock"]');
    if (lockBtn) {
      lockBtn.classList.toggle('lock-active', Boolean(locked));
      lockBtn.textContent = locked ? '🔓 Exit Look (ESC)' : '🖱️ Mouse Look';
    }
    if (pointerLockBannerEl) {
      pointerLockBannerEl.classList.toggle('visible', Boolean(locked));
    }
  }

  function syncDrawerState(telemetry = null) {
    if (!drawerEl) return;
    const active = Boolean(wanderEngine?.isWandering);
    const telem = telemetry || wanderEngine?.getTelemetry?.() || null;

    if (launcherBtn) {
      launcherBtn.classList.toggle('sim-running', active);
    }

    const badgeEl = drawerEl.querySelector('.gev-wander-loc-badge');
    if (badgeEl) {
      badgeEl.classList.toggle('active', active);
      badgeEl.textContent = active ? 'WANDERING LIVE' : 'STANDBY';
    }

    const startBtn = drawerEl.querySelector('.gev-wander-start-btn');
    if (startBtn) {
      startBtn.classList.toggle('active', active);
      startBtn.textContent = active
        ? '📍 Re-Center Here (WASD)'
        : '🚶 Wander Here (WASD)';
    }

    // Location & coordinates
    const telemCoords =
      telem?.coordinates ||
      (Number.isFinite(telem?.lat) && Number.isFinite(telem?.lon)
        ? {
            lat: telem.lat,
            lon: telem.lon,
            height: telem.height || 0,
          }
        : null);
    const target =
      active && telemCoords
        ? {
            lat: telemCoords.lat,
            lon: telemCoords.lon,
            height: telemCoords.height,
            speedMph: telem?.speedMph || 0,
          }
        : (() => {
            const g = getCameraGroundTarget();
            return {
              lat: g.lat,
              lon: g.lon,
              height: g.elev || 0,
              speedMph: 0,
            };
          })();

    const locInfo = resolveZeroCreditLocality(target.lat, target.lon, {
      onResolved: (updated) => {
        const locNameEl = drawerEl?.querySelector('.gev-wander-loc-name');
        if (locNameEl && updated?.fullLabel) {
          locNameEl.textContent = `📍 ${updated.fullLabel}`;
        }
      },
    });

    const locNameEl = drawerEl.querySelector('.gev-wander-loc-name');
    if (locNameEl) {
      locNameEl.textContent = `📍 ${locInfo.fullLabel}`;
    }

    const locCoordsEl = drawerEl.querySelector('.gev-wander-loc-coords');
    if (
      locCoordsEl &&
      Number.isFinite(target.lat) &&
      Number.isFinite(target.lon)
    ) {
      const altM = Math.round(target.height || 0);
      const spd = Math.round(target.speedMph || 0);
      locCoordsEl.textContent = `${target.lat.toFixed(5)}°, ${target.lon.toFixed(5)}° · ALT ${altM}m · ${spd} MPH`;
    }

    // Camera buttons
    const curMode =
      telem?.cameraMode ||
      wanderEngine?.getCameraMode?.() ||
      WANDER_CAMERA_MODES.ISO_CHASE;
    drawerEl.querySelectorAll('[data-wmode]').forEach((btn) => {
      const m = btn.getAttribute('data-wmode');
      if (m === 'snap' || m === 'fps_lock') return;
      btn.classList.toggle('active', m === curMode);
    });

    syncPointerLockUI(Boolean(wanderEngine?.isPointerLocked?.()));

    // Companion status
    const compActive = Boolean(wanderEngine?.isCompanionActive?.() ?? true);
    const compName = getCompanionPersonaName();
    const compBtn = drawerEl.querySelector('.gev-wander-comp-toggle');
    if (compBtn) {
      compBtn.classList.toggle('off', !compActive);
      compBtn.textContent = compActive
        ? `👯 ${compName}: Active [P]`
        : `👯 ${compName}: Off [P]`;
    }

    const thoughtEl = drawerEl.querySelector('.gev-wander-comp-thought');
    if (thoughtEl && telemetry?.companionThought) {
      thoughtEl.textContent = `"${telemetry.companionThought}"`;
    }

    syncTourAndPlayUI(target);
  }

  function syncTourAndPlayUI(targetCoords = null) {
    if (!drawerEl) return;
    const cardEl = drawerEl.querySelector('.gev-tour-play-card');
    if (!cardEl) return;

    const coords = targetCoords || getCameraGroundTarget();
    const ctx =
      tourAndPlayEngine?.resolveContext?.(
        coords.lat,
        coords.lon,
        coords.height || coords.elev || 0,
      ) ||
      resolveTourOrPlayContext(
        coords.lat,
        coords.lon,
        coords.height || coords.elev || 0,
      );

    const status = tourAndPlayEngine?.getStatus?.() || {
      state: TOUR_OR_PLAY_STATES.IDLE,
      mode: null,
    };

    const isPlayMode =
      status.mode === 'play' || (status.mode !== 'tour' && ctx.mode === 'play');
    cardEl.classList.toggle('play-mode', isPlayMode);

    const titleEl = cardEl.querySelector('.gev-tour-play-title');
    const badgeEl = cardEl.querySelector('.gev-tour-play-badge');
    const statusEl = cardEl.querySelector('.gev-tour-play-status');
    const tourControlsEl = cardEl.querySelector('.gev-tour-controls');
    const playControlsEl = cardEl.querySelector('.gev-play-controls');
    const activeTourActionsEl = cardEl.querySelector(
      '.gev-tour-active-actions',
    );
    const continueBtn = cardEl.querySelector('.gev-tour-continue-btn');

    const selCityVal = cardEl.querySelector('.gev-tour-city-select')?.value;
    const allMetaMap = getAllTourCatalogEntries().metadataByCityId;
    const targetMeta =
      (selCityVal && selCityVal !== 'auto'
        ? allMetaMap[selCityVal] || METRO_TOUR_METADATA[selCityVal]
        : status.isTour && status.cityId
          ? allMetaMap[status.cityId] || METRO_TOUR_METADATA[status.cityId]
          : ctx?.metadata) ||
      (status.cityId
        ? allMetaMap[status.cityId] || METRO_TOUR_METADATA[status.cityId]
        : null);
    const isResortStay = Boolean(
      (status.isTour && status.venueCategory === 'resort_stay') ||
      (!status.isTour && targetMeta?.venueCategory === 'resort_stay') ||
      (!status.isTour && ctx?.venueCategory === 'resort_stay'),
    );

    if (titleEl) {
      const isVenueDay =
        status.isTour && status.cityId
          ? status.tourScope === 'venue'
          : targetMeta?.tourScope === 'venue' || ctx.tourScope === 'venue';
      const activeVenueCat =
        status.isTour && status.cityId
          ? status.venueCategory
          : targetMeta?.venueCategory || ctx.venueCategory || null;
      const cardTitleText = isPlayMode
        ? `🏖️ LIVING WORLD PLAY (${ctx.label || 'Local Biome'})`
        : isResortStay
          ? `🏨 RESORT DAY OFF · WALK / E-SCOOTER / GOLF CART`
          : activeVenueCat === 'water_park'
            ? `🌊 WATER PARK DAY · LAZY RIVER / CHAIRLIFT / WALK`
            : activeVenueCat === 'state_park'
              ? `🏞️ STATE PARK DAY · TRAILS, LAKE & OVERLOOKS`
              : activeVenueCat === 'mountain_adventure'
                ? `🏔️ MOUNTAIN ADVENTURE · TRAM, VILLAGE & TRAILS`
                : activeVenueCat === 'boardwalk_strip'
                  ? `🎡 BOARDWALK & STRIP TOUR · PROMENADE & NEON`
                  : isVenueDay
                    ? `🎢 THEME PARK DAY · WALK MIDWAY`
                    : `🛴 CITY SCOOTER TOUR (15 MPH · RANDOMIZED)`;
      titleEl.textContent = cardTitleText;
    }

    if (badgeEl) {
      if (status.state === TOUR_OR_PLAY_STATES.TOUR_TRANSIT) {
        const modeTag =
          status.transitMode === 'aerial_tram'
            ? 'AERIAL'
            : status.transitMode === 'lazy_river_tube'
              ? 'FLOAT'
              : status.transitMode === 'resort_cart'
                ? 'GOLF CART'
                : status.transitMode === 'walk_midway'
                  ? 'WALK'
                  : 'SCOOTER';
        badgeEl.textContent = `${modeTag} ${status.landmarkIndex + 1}/${status.totalLandmarks}`;
      } else if (status.state === TOUR_OR_PLAY_STATES.TOUR_DWELL) {
        badgeEl.textContent = `DWELL ${Math.ceil(status.dwellRemainingSec || 0)}s`;
      } else if (status.state === TOUR_OR_PLAY_STATES.USER_TAKEOVER) {
        badgeEl.textContent = 'WALKING TAKEOVER';
      } else if (status.state === TOUR_OR_PLAY_STATES.PLAY_ACTIVE) {
        badgeEl.textContent = 'PLAYING LIVE';
      } else {
        badgeEl.textContent = isPlayMode
          ? 'PLAY MODE'
          : isResortStay
            ? 'RESORT READY'
            : 'TOUR READY';
      }
    }

    if (statusEl) {
      const isWalkMidway = status.transitMode === 'walk_midway';
      const isResortCart = status.transitMode === 'resort_cart';
      const isAerialTram = status.transitMode === 'aerial_tram';
      const isLazyRiver = status.transitMode === 'lazy_river_tube';
      if (
        status.state === TOUR_OR_PLAY_STATES.TOUR_TRANSIT &&
        status.currentLandmark
      ) {
        const walkPathLabel = isResortStay ? 'resort paths' : 'midway';
        statusEl.textContent = isAerialTram
          ? `🚡 Gliding by aerial cable/lift to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`
          : isLazyRiver
            ? `🛟 Floating along water route to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`
            : isResortCart
              ? `⛳ Cruising by Golf Cart to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`
              : isWalkMidway
                ? `🚶 Walking ${walkPathLabel} to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`
                : `🛴 E-Scootering (15 mph) to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`;
      } else if (
        status.state === TOUR_OR_PLAY_STATES.TOUR_DWELL &&
        status.currentLandmark
      ) {
        statusEl.textContent = `${isResortStay ? '🏨' : '🏛️'} ${status.currentLandmark.name} (${Math.ceil(status.dwellRemainingSec || 0)}s autonomous walk) — "${status.currentLandmark.lore}"`;
      } else if (status.state === TOUR_OR_PLAY_STATES.USER_TAKEOVER) {
        statusEl.textContent = `🚶 Normal Walking Take-Over (1.2 m/s). Explore freely with WASD, then Rejoin Stop or jump Next Stop!`;
      } else if (
        status.state === TOUR_OR_PLAY_STATES.PLAY_ACTIVE &&
        status.activePlayActivity
      ) {
        statusEl.textContent = `${status.activePlayActivity.icon} ${status.activePlayActivity.label}: "${status.activePlayActivity.lore}"`;
      } else if (isPlayMode) {
        statusEl.textContent = `Non-metro / tourist environment detected (${ctx.typologyName || ctx.label}). Pick an environment hike or leisure activity:`;
      } else if (isResortStay) {
        statusEl.textContent = `Unhurried Day Off on property · Walk, E-Scooter, or auto Golf Cart on fairways · 5 hidden secrets, resort staff NPCs, sunset fire pit & excursion shuttles.`;
      } else {
        statusEl.textContent = `Randomized landmark order every run · 15 mph electric scooter transit · 20s autonomous walking dwell + lore bubble at each stop.`;
      }
    }

    const resortTransitBarEl = cardEl.querySelector('.gev-resort-transit-bar');
    if (resortTransitBarEl) {
      resortTransitBarEl.style.display = isResortStay ? 'flex' : 'none';
      const activeResortMode =
        status.isTour && status.venueCategory === 'resort_stay'
          ? status.transitModeOverride ||
            status.effectiveTransitMode ||
            'walk_midway'
          : selectedResortTransitMode;
      resortTransitBarEl
        .querySelectorAll('.gev-resort-transit-btn')
        .forEach((btn) => {
          btn.classList.toggle(
            'active',
            btn.getAttribute('data-resort-transit') === activeResortMode,
          );
        });
    }

    const resortCheckInBarEl = cardEl.querySelector('.gev-resort-checkin-bar');
    if (resortCheckInBarEl) {
      const resortMetaForCheckIn = isResortStay
        ? (status.isTour && status.venueCategory === 'resort_stay'
            ? status.metadata
            : targetMeta?.venueCategory === 'resort_stay'
              ? targetMeta
              : ctx?.metadata) || null
        : null;
      const showCheckIn = Boolean(resortMetaForCheckIn?.id);
      resortCheckInBarEl.style.display = showCheckIn ? 'flex' : 'none';
      if (showCheckIn) {
        const currentTemp = getTempBasecamp();
        const isCheckedInHere =
          currentTemp?.resortId === resortMetaForCheckIn.id;
        const checkInBtn = resortCheckInBarEl.querySelector(
          '.gev-resort-checkin-btn',
        );
        const openBasecampBtn = resortCheckInBarEl.querySelector(
          '.gev-resort-open-basecamp-btn',
        );
        if (checkInBtn) {
          checkInBtn.setAttribute('data-resort-id', resortMetaForCheckIn.id);
          checkInBtn.classList.toggle('checked-in', isCheckedInHere);
          checkInBtn.textContent = isCheckedInHere
            ? '✅ Checked In (Basecamp) · Check Out'
            : '🏨 Check In (Temp Basecamp)';
        }
        if (openBasecampBtn) {
          openBasecampBtn.style.display = isCheckedInHere
            ? 'inline-block'
            : 'none';
        }
      }
    }

    const modeBarEl = cardEl.querySelector('.gev-tour-mode-bar');
    if (modeBarEl) {
      const supportedModes = Array.isArray(targetMeta?.supportedModes)
        ? targetMeta.supportedModes
        : ['all'];
      const supportsMultiMode = supportedModes.length > 1;
      modeBarEl.style.display =
        !isPlayMode && supportsMultiMode ? 'flex' : 'none';
      if (supportsMultiMode) {
        const defaultLabels = {
          all: '🌐 All 18',
          front_of_park: '🚀 Front of Park (7)',
          world_showcase: '🌍 11 Countries (11)',
        };
        const modeLabels = targetMeta?.modeLabels || defaultLabels;
        const nextSig = `${targetMeta?.id || ''}:${supportedModes.join(',')}`;
        if (modeBarEl.getAttribute('data-mode-sig') !== nextSig) {
          modeBarEl.setAttribute('data-mode-sig', nextSig);
          modeBarEl.innerHTML = supportedModes
            .map(
              (m) =>
                `<button class="gev-tour-mode-btn" data-tour-mode="${escapeHtml(m)}" type="button">${escapeHtml(modeLabels[m] || m)}</button>`,
            )
            .join('');
        }
      }
      const activeMode =
        status.isTour && status.cityId === targetMeta?.id
          ? status.tourMode || 'all'
          : selectedTourMode;
      modeBarEl.querySelectorAll('.gev-tour-mode-btn').forEach((btn) => {
        btn.classList.toggle(
          'active',
          btn.getAttribute('data-tour-mode') === activeMode,
        );
      });
    }

    if (tourResumePillEl) {
      const showResumePill = Boolean(
        status.isTour && status.state === TOUR_OR_PLAY_STATES.USER_TAKEOVER,
      );
      tourResumePillEl.classList.toggle('visible', showResumePill);
      if (showResumePill) {
        const pillLabelEl = tourResumePillEl.querySelector(
          '.gev-tour-resume-pill-label',
        );
        if (pillLabelEl) {
          const stopTitle =
            status.currentLandmark?.name || status.cityName || 'Current Stop';
          const nearNpc = parkAdventures?.getNearestInteractableNpc?.();
          pillLabelEl.textContent = nearNpc
            ? `🚶 Free Roam near ${stopTitle} · [E] Chat ${nearNpc.name}`
            : `🚶 Free Roam near ${stopTitle}`;
        }
      }
    }

    if (tourControlsEl) {
      // Keep the Resort Stays / Theme Park Days / City Tours selector always accessible
      // even when the camera is currently over a non-metro Play Mode location.
      tourControlsEl.style.display = 'flex';
    }
    if (playControlsEl) {
      playControlsEl.style.display = isPlayMode ? 'grid' : 'none';
      // Populate play buttons dynamically for current environment if needed
      const activities =
        ctx.playActivities ||
        getPlayActivitiesForEnvironment({
          typology: ctx.typology,
          lat: coords.lat,
          lon: coords.lon,
          elevationMeters: coords.height || 0,
        });
      const existingIds = Array.from(
        playControlsEl.querySelectorAll('.gev-play-act-btn'),
      )
        .map((b) => b.getAttribute('data-play-id'))
        .join(',');
      const nextIds = activities.map((a) => a.id).join(',');
      if (existingIds !== nextIds) {
        playControlsEl.innerHTML = activities
          .map(
            (act) =>
              `<button class="gev-play-act-btn ${status.activePlayActivity?.id === act.id ? 'active' : ''}" data-play-id="${act.id}" title="${act.lore}">${act.icon} ${act.label}</button>`,
          )
          .join('');
        playControlsEl.querySelectorAll('.gev-play-act-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const actId = btn.getAttribute('data-play-id');
            const g = getCameraGroundTarget();
            tourAndPlayEngine?.startPlayActivity?.(actId, {
              lat: g.lat,
              lon: g.lon,
              elev: g.elev || 0,
              typology: ctx.typology,
            });
            syncDrawerState();
          });
        });
      } else {
        playControlsEl.querySelectorAll('.gev-play-act-btn').forEach((btn) => {
          const actId = btn.getAttribute('data-play-id');
          btn.classList.toggle(
            'active',
            status.activePlayActivity?.id === actId,
          );
        });
      }
    }

    if (activeTourActionsEl) {
      const showActions = status.state !== TOUR_OR_PLAY_STATES.IDLE;
      activeTourActionsEl.style.display = showActions ? 'flex' : 'none';
    }
    if (continueBtn) {
      continueBtn.style.display =
        status.mode === 'tour' && status.state !== TOUR_OR_PLAY_STATES.IDLE
          ? 'inline-block'
          : 'none';
    }

    const firepitBtn = cardEl.querySelector('.gev-tour-firepit-btn');
    if (firepitBtn) {
      const showFirePit = Boolean(
        status.isTour && status.venueCategory === 'resort_stay',
      );
      const fpActive = Boolean(parkFireworks?.isFirePitActive?.());
      firepitBtn.style.display = showFirePit ? 'inline-block' : 'none';
      firepitBtn.classList.toggle('active', fpActive);
      firepitBtn.textContent = fpActive ? '🔥 Fire Pit ON' : '🔥 Fire Pit';
    }

    const fireworksBtn = cardEl.querySelector('.gev-tour-fireworks-btn');
    if (fireworksBtn) {
      const isResortActive = status.venueCategory === 'resort_stay';
      const hasNearbyFw = Boolean(status.nearbyFireworksView);
      const showFw = Boolean(
        status.isTour &&
        status.tourScope === 'venue' &&
        (!isResortActive || hasNearbyFw),
      );
      const fwActive = Boolean(
        parkFireworks?.isFireworksActive?.() ??
        (parkFireworks?.isActive?.() && !parkFireworks?.isFirePitActive?.()),
      );
      fireworksBtn.style.display = showFw ? 'inline-block' : 'none';
      fireworksBtn.classList.toggle('active', fwActive);
      fireworksBtn.textContent = fwActive
        ? '🎆 Fireworks ON'
        : isResortActive
          ? '🎆 Nearby Fireworks'
          : '🎆 Fireworks';
      if (isResortActive && status.nearbyFireworksView?.label) {
        fireworksBtn.title = `Toggle ${status.nearbyFireworksView.label}`;
      }
    }

    const adventureState = parkAdventures?.getState?.() || null;
    const passportStripEl = cardEl.querySelector('.gev-tour-passport-strip');
    if (passportStripEl) {
      const p = adventureState?.passport;
      const showPassport = Boolean(status.isTour && p && p.total > 0);
      passportStripEl.style.display = showPassport ? 'flex' : 'none';
      if (showPassport) {
        const pTitle = passportStripEl.querySelector(
          '.gev-tour-passport-title',
        );
        const pCount = passportStripEl.querySelector(
          '.gev-tour-passport-count',
        );
        const pBar = passportStripEl.querySelector('.gev-tour-passport-bar');
        const pStamps = passportStripEl.querySelector(
          '.gev-tour-passport-stamps',
        );
        const pList = passportStripEl.querySelector('.gev-tour-secrets-list');
        if (pTitle) {
          let passportHeading = '💎 Hidden City Gems';
          if (status.venueCategory === 'resort_stay') {
            passportHeading = '🏨 Resort Passport';
          } else if (status.tourScope === 'venue') {
            passportHeading = '🛂 Day Passport';
          }
          pTitle.textContent = passportHeading;
        }
        if (pCount) {
          pCount.textContent = `${p.collected}/${p.total} (${p.percent}%)`;
        }
        if (pBar) {
          pBar.style.width = `${p.percent}%`;
        }
        if (pStamps) {
          const collectedSet = new Set(p.collectedIds || []);
          pStamps.innerHTML = (adventureState.secrets || [])
            .map((s) => {
              const got = collectedSet.has(s.id);
              return `<span title="${escapeHtml(s.title)}" style="opacity:${got ? '1' : '0.35'};">${got ? escapeHtml(s.icon) : '⭕'}</span>`;
            })
            .join('');
        }
        if (pList) {
          const collectedSet = new Set(p.collectedIds || []);
          pList.innerHTML = (adventureState.secrets || [])
            .map((s) => {
              const got = collectedSet.has(s.id);
              return `
                <div class="gev-tour-secret-row ${got ? 'collected' : ''}" data-secret-id="${escapeHtml(s.id)}">
                  <div style="min-width:0; flex:1;">
                    <div><strong>${escapeHtml(s.icon)} ${escapeHtml(s.title)}</strong></div>
                    <div style="font-size:9px; color:#94a3b8;">${escapeHtml(got ? s.story : s.hint)}</div>
                  </div>
                  ${got ? '<span>✅</span>' : `<button class="gev-tour-secret-btn" data-secret-id="${escapeHtml(s.id)}" type="button">Collect</button>`}
                </div>
              `;
            })
            .join('');
        }
      }
    }

    const npcStripEl = cardEl.querySelector('.gev-tour-npc-strip');
    if (npcStripEl) {
      const npcs = adventureState?.npcs || [];
      const showNpcs = Boolean(
        status.isTour && status.tourScope === 'venue' && npcs.length > 0,
      );
      npcStripEl.style.display = showNpcs ? 'flex' : 'none';
      if (showNpcs) {
        const npcHeaderLabel = npcStripEl.querySelector(
          '.gev-tour-npc-header > span',
        );
        if (npcHeaderLabel) {
          npcHeaderLabel.textContent =
            status.venueCategory === 'resort_stay'
              ? '🗣️ Resort Staff & Guest Clues'
              : '🗣️ Park Cast & Insider Clues';
        }
        const chipsEl = npcStripEl.querySelector('.gev-tour-npc-chips');
        const diagEl = npcStripEl.querySelector('.gev-tour-npc-dialogue');
        const activeNpcId = adventureState?.activeDialogue?.npcId || null;
        const nearNpcId = adventureState?.nearestNpcId || null;
        if (chipsEl) {
          chipsEl.innerHTML = npcs
            .map((n) => {
              const cls = [
                'gev-tour-npc-btn',
                n.id === nearNpcId ? 'near' : '',
                n.id === activeNpcId ? 'active' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return `<button class="${cls}" data-npc-id="${escapeHtml(n.id)}" type="button" title="${escapeHtml(`${n.roleLabel} near ${n.anchorStopName}`)}">${escapeHtml(n.icon)} ${escapeHtml(n.name)}</button>`;
            })
            .join('');
        }
        if (diagEl) {
          const dlg = adventureState?.activeDialogue;
          diagEl.innerHTML = dlg
            ? `<b>${escapeHtml(dlg.icon)} ${escapeHtml(dlg.npcName)} (${escapeHtml(dlg.roleLabel)}):</b> ${escapeHtml(dlg.greeting)} <i>${escapeHtml(dlg.tip)}</i><br><span style="color:#fde047;">${escapeHtml(dlg.clue)}</span><br><span style="color:#a7f3d0;">${escapeHtml(dlg.companionBanter)}</span>`
            : 'Press <b>[E]</b> or click any cast badge above for insider ride/snack hints & scavenger clues!';
        }
      }
    }

    const hopperBarEl = cardEl.querySelector('.gev-tour-hopper-bar');
    if (hopperBarEl) {
      const bridges = Array.isArray(status.parkHopperBridges)
        ? status.parkHopperBridges
        : [];
      const showHopper = Boolean(status.isTour && bridges.length > 0);
      hopperBarEl.style.display = showHopper ? 'flex' : 'none';
      if (showHopper) {
        const headerEl = hopperBarEl.querySelector('.gev-tour-hopper-header');
        if (headerEl) {
          headerEl.textContent =
            status.venueCategory === 'resort_stay'
              ? '🚌 Resort Excursions & Shuttles'
              : '🚝 Resort Park-Hopper Transit';
        }
        const listEl = hopperBarEl.querySelector('.gev-tour-hopper-list');
        if (listEl) {
          listEl.innerHTML = bridges
            .map((b) => {
              const rideLabel =
                b.rideButtonLabel || `${b.icon || '🚝'} Ride 3D`;
              const rideBtn =
                b.rideableTransit && b.railCorridorId
                  ? `<button class="gev-tour-hopper-ride-btn" data-target-city-id="${escapeHtml(b.toCityId)}" data-bridge-id="${escapeHtml(b.id)}" data-corridor-id="${escapeHtml(b.railCorridorId)}" data-profile-id="${escapeHtml(b.railProfileId || '')}" data-arrival-stop-id="${escapeHtml(b.arrivalStopId || '')}" data-speed-mph="${escapeHtml(String(b.railSpeedMph || 45))}" type="button" title="${escapeHtml(b.durationNote || `Ride the 3D ${b.transitLabel}`)}">${escapeHtml(rideLabel)}</button>`
                  : '';
              if (b.isInParkLoop && rideBtn) {
                return `<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;"><span style="font-size:10px; color:#cbd5e1; font-weight:600; padding:0 4px;" title="${escapeHtml(b.durationNote || '')}">${escapeHtml(b.icon)} ${escapeHtml(b.transitLabel)}</span>${rideBtn}</div>`;
              }
              return `<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;"><button class="gev-tour-hopper-btn" data-target-city-id="${escapeHtml(b.toCityId)}" data-bridge-id="${escapeHtml(b.id)}" type="button" title="${escapeHtml(b.durationNote)}">${escapeHtml(b.icon)} ${escapeHtml(b.transitLabel)} → ${escapeHtml(b.toParkName)}</button>${rideBtn}</div>`;
            })
            .join('');
        }
      }
    }

    const noTourCtaEl = cardEl.querySelector('.gev-tour-no-tour-cta');
    const noTourCtaTextEl = cardEl.querySelector('.gev-tour-no-tour-cta-text');
    const forgeBuildBtn = cardEl.querySelector('.gev-tour-forge-build-btn');
    const forgeAllowed = canBuildTourWithForge();
    let resolvedCatalogPlace = null;

    if (forgeAllowed && !ctx.hasCuratedOrCustomTour) {
      if (
        ctx.isDynamicPlaceholder &&
        isConcreteCatalogPlaceName(ctx.cityName)
      ) {
        resolvedCatalogPlace = {
          name: ctx.cityName,
          displayName: ctx.cityName,
          cityId: ctx.cityId,
          lat: coords.lat,
          lon: coords.lon,
          source: 'major-world-metros',
          isCatalogPlace: true,
        };
      } else {
        const cached = getCachedCatalogPlaceAt(coords.lat, coords.lon);
        if (cached?.name && isConcreteCatalogPlaceName(cached.name)) {
          resolvedCatalogPlace = cached;
        } else if (!cached) {
          const myGen = ++wanderCatalogLookupGen;
          void resolveCatalogPlaceAt(coords.lat, coords.lon)
            .then((found) => {
              if (myGen !== wanderCatalogLookupGen || !found || !isOpen) return;
              syncTourAndPlayUI();
            })
            .catch(() => {});
        }
      }
    }

    activeWanderCatalogPlace = resolvedCatalogPlace;
    const showForgeBuildBtn = Boolean(forgeAllowed && resolvedCatalogPlace);
    if (forgeBuildBtn) {
      forgeBuildBtn.style.display = showForgeBuildBtn ? 'inline-block' : 'none';
      if (showForgeBuildBtn) {
        forgeBuildBtn.textContent = `🛠️ Build: Tour ${resolvedCatalogPlace.name}`;
      }
    }
    if (noTourCtaTextEl) {
      noTourCtaTextEl.textContent = showForgeBuildBtn
        ? `No curated tour for ${resolvedCatalogPlace.name} yet — synthesize with Dev Forge or create one:`
        : 'No tour here yet — know this spot personally?';
    }
    if (noTourCtaEl) {
      noTourCtaEl.style.display =
        isPlayMode || showForgeBuildBtn ? 'flex' : 'none';
    }

    const wizardOpenBtn = cardEl.querySelector('.gev-tour-wizard-open-btn');
    if (wizardOpenBtn) {
      wizardOpenBtn.classList.toggle('active', isWizardOpen);
    }

    if (isWizardOpen) {
      syncWizardUI();
    }
  }

  function buildTourCityOptionsHtml({
    includeAuto = true,
    dynamicCityId = null,
    dynamicCityName = null,
  } = {}) {
    const reg = getCustomToursRegistry();
    const runtimeBuilt = getRuntimeBuiltTours();
    const customEntries = Object.entries(reg.customTours || {})
      .filter(([, entry]) => entry?.metadata)
      .map(([id, entry]) => {
        const count = Array.isArray(entry.stops) ? entry.stops.length : 0;
        const cont = entry.metadata.continent
          ? ` [${entry.metadata.continent}]`
          : '';
        return `<option value="${escapeHtml(id)}">⭐ ${escapeHtml(entry.metadata.name)}${escapeHtml(cont)} (${count} ${count === 1 ? 'stop' : 'stops'} · Custom)</option>`;
      })
      .join('');

    const dynamicExtraIds = Object.keys(reg.extraStopsByCityId || {}).filter(
      (k) =>
        !METRO_LANDMARK_CATALOG[k] &&
        !runtimeBuilt[k] &&
        !reg.customTours?.[k] &&
        Array.isArray(reg.extraStopsByCityId[k]) &&
        reg.extraStopsByCityId[k].length > 0,
    );
    if (
      dynamicCityId &&
      dynamicCityId !== 'auto' &&
      !METRO_LANDMARK_CATALOG[dynamicCityId] &&
      !runtimeBuilt[dynamicCityId] &&
      !reg.customTours?.[dynamicCityId] &&
      !dynamicExtraIds.includes(dynamicCityId)
    ) {
      dynamicExtraIds.unshift(dynamicCityId);
    }

    const dynamicEntries = dynamicExtraIds
      .map((cityKey) => {
        const stops = getLandmarksForCity(cityKey);
        const extraCount = (reg.extraStopsByCityId?.[cityKey] || []).length;
        const label =
          (cityKey === dynamicCityId && dynamicCityName) ||
          cityKey
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        const customTag = extraCount > 0 ? ` · +${extraCount} custom` : '';
        return `<option value="${escapeHtml(cityKey)}">🛴 ${escapeHtml(label)} (${stops.length} stops${escapeHtml(customTag)})</option>`;
      })
      .join('');

    const builtInKeys = Object.entries(METRO_LANDMARK_CATALOG);
    const runtimeKeys = Object.entries(runtimeBuilt).filter(
      ([cityKey]) =>
        !METRO_LANDMARK_CATALOG[cityKey] && !reg.customTours?.[cityKey],
    );
    const formatCatalogOption = (
      [cityKey, stopsOrEntry],
      isRuntime = false,
    ) => {
      const stops = isRuntime
        ? stopsOrEntry?.landmarks || []
        : stopsOrEntry || [];
      const extraCount = (reg.extraStopsByCityId?.[cityKey] || []).length;
      const total = stops.length + extraCount;
      const meta = isRuntime
        ? stopsOrEntry?.metadata
        : METRO_TOUR_METADATA[cityKey];
      const label =
        meta?.name ||
        cityKey
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      const continent = meta?.continent;
      const continentTag = continent ? ` [${continent}]` : '';
      const customTag = extraCount > 0 ? ` · +${extraCount} custom` : '';
      const icon =
        meta?.venueCategory === 'resort_stay' || isResortStayId(cityKey)
          ? '🏨'
          : meta?.venueCategory === 'water_park'
            ? '🌊'
            : meta?.venueCategory === 'state_park'
              ? '🏞️'
              : meta?.venueCategory === 'mountain_adventure'
                ? '🏔️'
                : meta?.venueCategory === 'boardwalk_strip'
                  ? '🎡'
                  : meta?.tourScope === 'venue'
                    ? '🎢'
                    : '🛴';
      return `<option value="${escapeHtml(cityKey)}">${icon} ${escapeHtml(label)}${escapeHtml(continentTag)} (${total} stops${escapeHtml(customTag)})</option>`;
    };

    const isResortEntry = (cityKey, meta) =>
      meta?.venueCategory === 'resort_stay' || isResortStayId(cityKey);
    const isOutdoorParkEntry = (meta) =>
      meta?.venueCategory === 'state_park' ||
      meta?.venueCategory === 'mountain_adventure';
    const isWaterOrBoardwalkEntry = (meta) =>
      meta?.venueCategory === 'water_park' ||
      meta?.venueCategory === 'boardwalk_strip';

    const resortStayEntries = [
      ...builtInKeys
        .filter(([cityKey]) =>
          isResortEntry(cityKey, METRO_TOUR_METADATA[cityKey]),
        )
        .map((entry) => formatCatalogOption(entry, false)),
      ...runtimeKeys
        .filter(([cityKey, entry]) => isResortEntry(cityKey, entry?.metadata))
        .map((entry) => formatCatalogOption(entry, true)),
    ].join('');
    const outdoorParkEntries = [
      ...builtInKeys
        .filter(([cityKey]) => isOutdoorParkEntry(METRO_TOUR_METADATA[cityKey]))
        .map((entry) => formatCatalogOption(entry, false)),
      ...runtimeKeys
        .filter(([, entry]) => isOutdoorParkEntry(entry?.metadata))
        .map((entry) => formatCatalogOption(entry, true)),
    ].join('');
    const waterBoardwalkEntries = [
      ...builtInKeys
        .filter(([cityKey]) =>
          isWaterOrBoardwalkEntry(METRO_TOUR_METADATA[cityKey]),
        )
        .map((entry) => formatCatalogOption(entry, false)),
      ...runtimeKeys
        .filter(([, entry]) => isWaterOrBoardwalkEntry(entry?.metadata))
        .map((entry) => formatCatalogOption(entry, true)),
    ].join('');
    const parkDayEntries = [
      ...builtInKeys
        .filter(
          ([cityKey]) =>
            METRO_TOUR_METADATA[cityKey]?.tourScope === 'venue' &&
            !isResortEntry(cityKey, METRO_TOUR_METADATA[cityKey]) &&
            !isOutdoorParkEntry(METRO_TOUR_METADATA[cityKey]) &&
            !isWaterOrBoardwalkEntry(METRO_TOUR_METADATA[cityKey]),
        )
        .map((entry) => formatCatalogOption(entry, false)),
      ...runtimeKeys
        .filter(
          ([cityKey, entry]) =>
            entry?.metadata?.tourScope === 'venue' &&
            !isResortEntry(cityKey, entry?.metadata) &&
            !isOutdoorParkEntry(entry?.metadata) &&
            !isWaterOrBoardwalkEntry(entry?.metadata),
        )
        .map((entry) => formatCatalogOption(entry, true)),
    ].join('');
    const cityEntries = [
      ...builtInKeys
        .filter(
          ([cityKey]) => METRO_TOUR_METADATA[cityKey]?.tourScope !== 'venue',
        )
        .map((entry) => formatCatalogOption(entry, false)),
      ...runtimeKeys
        .filter(([, entry]) => entry?.metadata?.tourScope !== 'venue')
        .map((entry) => formatCatalogOption(entry, true)),
    ].join('');

    const customGroupHtml = customEntries
      ? `<optgroup label="✨ Custom Tours">${customEntries}</optgroup>`
      : '';
    const resortGroupHtml = resortStayEntries
      ? `<optgroup label="🏨 Resort Stays">${resortStayEntries}</optgroup>`
      : '';
    const outdoorParkGroupHtml = outdoorParkEntries
      ? `<optgroup label="🏞️ State Parks & Mountain Adventures">${outdoorParkEntries}</optgroup>`
      : '';
    const waterBoardwalkGroupHtml = waterBoardwalkEntries
      ? `<optgroup label="🎡 Water Parks, Boardwalks & Strips">${waterBoardwalkEntries}</optgroup>`
      : '';
    const parkGroupHtml = parkDayEntries
      ? `<optgroup label="🎢 Theme Park Days">${parkDayEntries}</optgroup>`
      : '';
    const cityGroupHtml = cityEntries
      ? `<optgroup label="🏙️ City Tours">${cityEntries}</optgroup>`
      : '';

    const autoOpt = includeAuto
      ? '<option value="auto">📍 Nearest Metro / Current View</option>'
      : '';
    return `${autoOpt}${resortGroupHtml}${outdoorParkGroupHtml}${waterBoardwalkGroupHtml}${parkGroupHtml}${customGroupHtml}${dynamicEntries}${cityGroupHtml}`;
  }

  function syncTourCitySelectOptions(
    preferredCityId = null,
    preferredCityName = null,
  ) {
    if (!drawerEl) return;
    const tourCitySelect = drawerEl.querySelector('.gev-tour-city-select');
    if (tourCitySelect) {
      const prevVal = preferredCityId || tourCitySelect.value || 'auto';
      tourCitySelect.innerHTML = buildTourCityOptionsHtml({
        includeAuto: true,
        dynamicCityId: preferredCityId,
        dynamicCityName: preferredCityName,
      });
      if (Array.from(tourCitySelect.options).some((o) => o.value === prevVal)) {
        tourCitySelect.value = prevVal;
      }
    }

    const targetSelect = drawerEl.querySelector(
      '.gev-wizard-target-tour-select',
    );
    if (targetSelect) {
      const prevTarget = preferredCityId || targetSelect.value || '';
      targetSelect.innerHTML = buildTourCityOptionsHtml({
        includeAuto: false,
        dynamicCityId: preferredCityId,
        dynamicCityName: preferredCityName,
      });
      if (
        prevTarget &&
        Array.from(targetSelect.options).some((o) => o.value === prevTarget)
      ) {
        targetSelect.value = prevTarget;
      }
    }
  }

  function captureCurrentViewPin({ overwriteTourDefaults = false } = {}) {
    const g = getCameraGroundTarget();
    const loc = resolveZeroCreditLocality(g.lat, g.lon, {
      onResolved: (updated) => {
        if (!wizardPin) return;
        if (updated?.fullLabel || updated?.shortLabel) {
          wizardPin.localityLabel = updated.fullLabel || updated.shortLabel;
          wizardPin.countryHint = updated.country || wizardPin.countryHint;
          if (isWizardOpen) {
            updateWizardPinDisplay();
          }
        }
      },
    });
    const localityLabel =
      loc?.fullLabel ||
      loc?.shortLabel ||
      `${g.lat.toFixed(4)}°, ${g.lon.toFixed(4)}°`;
    wizardPin = {
      lat: Number(g.lat.toFixed(6)),
      lon: Number(g.lon.toFixed(6)),
      elev: Math.round(Number.isFinite(g.elev) ? g.elev : 50),
      heading: Math.round(Number.isFinite(g.heading) ? g.heading : 90),
      localityLabel,
      countryHint: loc?.country || loc?.region || '',
    };

    if (overwriteTourDefaults && drawerEl) {
      const tourNameInput = drawerEl.querySelector('.gev-wizard-tour-name');
      const tourCountryInput = drawerEl.querySelector(
        '.gev-wizard-tour-country',
      );
      if (tourNameInput && !tourNameInput.value.trim()) {
        const cleanTitle = (loc?.shortLabel || localityLabel || 'Local Area')
          .split(',')[0]
          .trim();
        tourNameInput.value = cleanTitle
          ? `${cleanTitle} Local Tour`
          : 'My Local Tour';
      }
      if (tourCountryInput && !tourCountryInput.value.trim() && loc?.country) {
        tourCountryInput.value = loc.country;
      }
    }
    updateWizardPinDisplay();
    syncWizardContractPreview();
  }

  function updateWizardPinDisplay() {
    if (!drawerEl || !wizardPin) return;
    const labelEl = drawerEl.querySelector('.gev-wizard-pin-label');
    const coordsEl = drawerEl.querySelector('.gev-wizard-pin-coords');
    if (labelEl) {
      labelEl.textContent = isGlobePickMode
        ? '🎯 Click anywhere on the 3D globe to drop this stop pin...'
        : `📌 Pin: ${wizardPin.localityLabel || 'Current Camera Target'}`;
    }
    if (coordsEl) {
      coordsEl.textContent = `${wizardPin.lat.toFixed(5)}°, ${wizardPin.lon.toFixed(5)}° · ALT ${wizardPin.elev}m · HDG ${wizardPin.heading}°`;
    }
  }

  function stopGlobePickMode() {
    isGlobePickMode = false;
    if (wizardPickHandler) {
      try {
        wizardPickHandler.destroy?.();
      } catch {}
      wizardPickHandler = null;
    }
    const pickBtn = drawerEl?.querySelector('.gev-wizard-pick-btn');
    if (pickBtn) {
      pickBtn.classList.remove('pick-active');
      pickBtn.textContent = '🎯 Pick Globe';
    }
    updateWizardPinDisplay();
  }

  function startGlobePickMode() {
    if (isGlobePickMode) {
      stopGlobePickMode();
      return;
    }
    if (
      !viewer?.scene?.canvas ||
      typeof Cesium.ScreenSpaceEventHandler !== 'function'
    ) {
      captureCurrentViewPin();
      setWizardFeedback(
        'Captured live camera center pin (globe click picker unavailable here).',
        'ok',
      );
      return;
    }
    isGlobePickMode = true;
    const pickBtn = drawerEl?.querySelector('.gev-wizard-pick-btn');
    if (pickBtn) {
      pickBtn.classList.add('pick-active');
      pickBtn.textContent = '✕ Cancel Pick';
    }
    updateWizardPinDisplay();

    try {
      wizardPickHandler = new Cesium.ScreenSpaceEventHandler(
        viewer.scene.canvas,
      );
      wizardPickHandler.setInputAction((movement) => {
        if (!movement?.position) {
          stopGlobePickMode();
          return;
        }
        const picked = pickActiveGroundPosition(viewer, movement.position);
        if (picked) {
          try {
            const carto = Cesium.Cartographic.fromCartesian(picked);
            if (
              carto &&
              Number.isFinite(carto.latitude) &&
              Number.isFinite(carto.longitude)
            ) {
              const lat = Number(
                Cesium.Math.toDegrees(carto.latitude).toFixed(6),
              );
              const lon = Number(
                Cesium.Math.toDegrees(carto.longitude).toFixed(6),
              );
              const elev = Number.isFinite(carto.height)
                ? Math.round(carto.height)
                : (wizardPin?.elev ?? 50);
              const loc = resolveZeroCreditLocality(lat, lon);
              wizardPin = {
                lat,
                lon,
                elev,
                heading: wizardPin?.heading ?? 90,
                localityLabel:
                  loc?.fullLabel ||
                  loc?.shortLabel ||
                  `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
                countryHint: loc?.country || wizardPin?.countryHint || '',
              };
              setWizardFeedback(
                `Pin moved to ${wizardPin.localityLabel} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°).`,
                'ok',
              );
            }
          } catch {}
        }
        stopGlobePickMode();
        syncWizardContractPreview();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      stopGlobePickMode();
    }
  }

  function setWizardFeedback(msg = '', kind = 'ok') {
    const fbEl = drawerEl?.querySelector('.gev-wizard-feedback');
    if (!fbEl) return;
    if (wizardFeedbackTimer) {
      clearTimeout(wizardFeedbackTimer);
      wizardFeedbackTimer = null;
    }
    if (!msg) {
      fbEl.textContent = '';
      fbEl.className = 'gev-wizard-feedback';
      return;
    }
    fbEl.textContent = msg;
    fbEl.className = `gev-wizard-feedback visible ${kind === 'error' ? 'error' : 'ok'}`;
    if (kind === 'ok') {
      wizardFeedbackTimer = setTimeout(() => {
        if (fbEl) {
          fbEl.className = 'gev-wizard-feedback';
        }
      }, 4500);
    }
  }

  function getActiveTargetCityIdForWizard() {
    if (!drawerEl) return 'los_angeles';
    const targetSelect = drawerEl.querySelector(
      '.gev-wizard-target-tour-select',
    );
    const citySelect = drawerEl.querySelector('.gev-tour-city-select');
    if (targetSelect?.value) return targetSelect.value;
    if (citySelect?.value && citySelect.value !== 'auto')
      return citySelect.value;
    const pin = wizardPin || getCameraGroundTarget();
    const ctx =
      tourAndPlayEngine?.resolveContext?.(pin.lat, pin.lon, pin.elev || 0) ||
      resolveTourOrPlayContext(pin.lat, pin.lon, pin.elev || 0);
    return ctx?.cityId || 'los_angeles';
  }

  function readWizardDrafts() {
    const pin = wizardPin || getCameraGroundTarget();
    const targetCityId = getActiveTargetCityIdForWizard();
    const stopName =
      drawerEl?.querySelector('.gev-wizard-stop-name')?.value || '';
    const category =
      drawerEl?.querySelector('.gev-wizard-stop-category')?.value ||
      'Local Secret';
    const lore = drawerEl?.querySelector('.gev-wizard-stop-lore')?.value || '';
    const companionNote =
      drawerEl?.querySelector('.gev-wizard-stop-companion')?.value || '';
    const tourName =
      drawerEl?.querySelector('.gev-wizard-tour-name')?.value || '';
    const tourCountry =
      drawerEl?.querySelector('.gev-wizard-tour-country')?.value || '';

    const stopDraft = {
      name: stopName,
      lat: pin.lat,
      lon: pin.lon,
      elev: pin.elev ?? 50,
      category,
      lore,
      companionNote,
      streetBearingDeg: pin.heading ?? 90,
    };
    const tourDraft = {
      name: tourName,
      country: tourCountry || pin.countryHint || 'Local Area',
      continent: inferContinentFromCoords(pin.lat, pin.lon),
      centerLat: pin.lat,
      centerLon: pin.lon,
    };
    return { targetCityId, stopDraft, tourDraft };
  }

  function syncWizardContractPreview() {
    if (!drawerEl) return;
    const { targetCityId, stopDraft, tourDraft } = readWizardDrafts();
    const stopCheck = validateTourStopDraft(stopDraft, {
      cityId: wizardMode === 'tour' ? tourDraft.name || 'custom' : targetCityId,
    });
    const tourCheck =
      wizardMode === 'tour'
        ? validateCustomTourDraft(tourDraft)
        : { valid: true, errors: [], normalized: null };

    const allErrors = [...tourCheck.errors, ...stopCheck.errors];
    const isReady = allErrors.length === 0;
    const statusEl = drawerEl.querySelector('.gev-wizard-contract-status');
    if (statusEl) {
      statusEl.classList.toggle('ready', isReady);
      statusEl.textContent = isReady
        ? '✅ Tour Data Contract Ready'
        : `⚠️ ${allErrors[0]}`;
    }

    const previewEl = drawerEl.querySelector('.gev-wizard-json-pre');
    if (previewEl) {
      const previewPayload =
        wizardMode === 'tour'
          ? {
              metadata: tourCheck.normalized || {
                ...tourDraft,
                pendingValidation: tourCheck.errors,
              },
              landmarks: [
                stopCheck.normalized || {
                  ...stopDraft,
                  pendingValidation: stopCheck.errors,
                },
              ],
            }
          : {
              cityId: targetCityId,
              stop: stopCheck.normalized || {
                ...stopDraft,
                pendingValidation: stopCheck.errors,
              },
            };
      previewEl.textContent = JSON.stringify(previewPayload, null, 2);
    }
  }

  function renderCustomStopsList() {
    if (!drawerEl) return;
    const wrapEl = drawerEl.querySelector('.gev-wizard-custom-list-wrap');
    const listEl = drawerEl.querySelector('.gev-wizard-custom-list');
    const deleteTourBtn = drawerEl.querySelector('.gev-wizard-delete-tour-btn');
    if (!wrapEl || !listEl) return;

    const targetCityId = getActiveTargetCityIdForWizard();
    const reg = getCustomToursRegistry();
    const isCustomTour = Boolean(reg.customTours?.[targetCityId]);
    const customStops = getCustomStopsForCity(targetCityId);

    if (deleteTourBtn) {
      deleteTourBtn.style.display = isCustomTour ? 'inline-block' : 'none';
    }

    if (customStops.length === 0 && !isCustomTour) {
      wrapEl.classList.remove('visible');
      listEl.innerHTML = '';
      return;
    }

    wrapEl.classList.add('visible');
    listEl.innerHTML =
      customStops.length === 0
        ? '<div style="font-size:10px; color:#94a3b8;">No custom stops yet in this tour.</div>'
        : customStops
            .map(
              (s) => `
          <div class="gev-wizard-custom-row" data-stop-id="${escapeHtml(s.id)}" data-city-id="${escapeHtml(targetCityId)}">
            <span class="gev-wizard-custom-row-title" title="${escapeHtml(s.lore)}">${escapeHtml(s.icon || '📍')} <b>${escapeHtml(s.name)}</b> · ${escapeHtml(s.category)}</span>
            <button class="gev-wizard-row-btn gev-wizard-fly-stop-btn" data-stop-id="${escapeHtml(s.id)}" title="Center camera on stop">🎯</button>
            <button class="gev-wizard-row-btn gev-wizard-del-stop-btn" data-stop-id="${escapeHtml(s.id)}" title="Remove custom stop">🗑️</button>
          </div>
        `,
            )
            .join('');
  }

  function syncWizardUI() {
    if (!drawerEl) return;
    const panelEl = drawerEl.querySelector('.gev-tour-wizard-panel');
    if (panelEl) {
      panelEl.classList.toggle('open', isWizardOpen);
    }

    drawerEl.querySelectorAll('.gev-wizard-mode-btn').forEach((btn) => {
      const m = btn.getAttribute('data-wiz-mode');
      btn.classList.toggle('active', m === wizardMode);
    });

    const targetRow = drawerEl.querySelector('.gev-wizard-target-tour-row');
    const newTourFields = drawerEl.querySelector('.gev-wizard-new-tour-fields');
    const saveBtn = drawerEl.querySelector('.gev-wizard-save-btn');
    if (targetRow) {
      targetRow.style.display = wizardMode === 'stop' ? 'flex' : 'none';
    }
    if (newTourFields) {
      newTourFields.style.display = wizardMode === 'tour' ? 'flex' : 'none';
    }
    if (saveBtn) {
      saveBtn.textContent =
        wizardMode === 'tour' ? '💾 Save Tour & Stop' : '💾 Save Stop';
    }

    updateWizardPinDisplay();
    syncWizardContractPreview();
    renderCustomStopsList();
  }

  function setWizardMode(nextMode) {
    wizardMode = nextMode === 'tour' ? 'tour' : 'stop';
    if (wizardMode === 'tour' && drawerEl) {
      const tourNameInput = drawerEl.querySelector('.gev-wizard-tour-name');
      const tourCountryInput = drawerEl.querySelector(
        '.gev-wizard-tour-country',
      );
      if (tourNameInput && !tourNameInput.value.trim() && wizardPin) {
        const cleanTitle = (wizardPin.localityLabel || 'Local Area')
          .split(',')[0]
          .trim();
        tourNameInput.value = cleanTitle
          ? `${cleanTitle} Local Tour`
          : 'My Local Tour';
      }
      if (
        tourCountryInput &&
        !tourCountryInput.value.trim() &&
        wizardPin?.countryHint
      ) {
        tourCountryInput.value = wizardPin.countryHint;
      }
    }
    syncWizardUI();
  }

  function openWizard(preferredMode = null) {
    if (!drawerEl) return;
    captureCurrentViewPin({ overwriteTourDefaults: true });
    const pin = wizardPin || getCameraGroundTarget();
    const ctx =
      tourAndPlayEngine?.resolveContext?.(pin.lat, pin.lon, pin.elev || 0) ||
      resolveTourOrPlayContext(pin.lat, pin.lon, pin.elev || 0);

    const chosenMode =
      preferredMode === 'tour' || preferredMode === 'stop'
        ? preferredMode
        : ctx.mode === 'tour'
          ? 'stop'
          : 'tour';

    syncTourCitySelectOptions(ctx.cityId || null, ctx.cityName || null);
    if (ctx.cityId) {
      const targetSelect = drawerEl.querySelector(
        '.gev-wizard-target-tour-select',
      );
      if (
        targetSelect &&
        Array.from(targetSelect.options).some((o) => o.value === ctx.cityId)
      ) {
        targetSelect.value = ctx.cityId;
      }
    }

    isWizardOpen = true;
    setWizardMode(chosenMode);
    setWizardFeedback('');
    syncDrawerState();
  }

  function closeWizard() {
    isWizardOpen = false;
    stopGlobePickMode();
    const panelEl = drawerEl?.querySelector('.gev-tour-wizard-panel');
    if (panelEl) {
      panelEl.classList.remove('open');
    }
    const openBtn = drawerEl?.querySelector('.gev-tour-wizard-open-btn');
    if (openBtn) {
      openBtn.classList.remove('active');
    }
  }

  function clearWizardStopInputs() {
    if (!drawerEl) return;
    const stopNameEl = drawerEl.querySelector('.gev-wizard-stop-name');
    const loreEl = drawerEl.querySelector('.gev-wizard-stop-lore');
    const compEl = drawerEl.querySelector('.gev-wizard-stop-companion');
    if (stopNameEl) stopNameEl.value = '';
    if (loreEl) loreEl.value = '';
    if (compEl) compEl.value = '';
  }

  function handleSaveWizard({ startImmediately = false } = {}) {
    if (!drawerEl) return;
    const { targetCityId, stopDraft, tourDraft } = readWizardDrafts();

    let result = null;
    let savedCityId = targetCityId;
    if (wizardMode === 'tour') {
      result = createCustomTour({ tour: tourDraft, firstStop: stopDraft });
      if (result.ok) {
        savedCityId = result.tourId;
      }
    } else {
      result = addTourStop({ cityId: targetCityId, stop: stopDraft });
      if (result.ok) {
        savedCityId = result.cityId;
      }
    }

    if (!result?.ok) {
      setWizardFeedback(
        (result?.errors || ['Please complete the required stop fields.']).join(
          ' ',
        ),
        'error',
      );
      syncWizardContractPreview();
      return;
    }

    syncTourCitySelectOptions(savedCityId);
    const tourCitySelect = drawerEl.querySelector('.gev-tour-city-select');
    if (tourCitySelect) {
      tourCitySelect.value = savedCityId;
    }
    const targetSelect = drawerEl.querySelector(
      '.gev-wizard-target-tour-select',
    );
    if (targetSelect) {
      targetSelect.value = savedCityId;
    }

    clearWizardStopInputs();

    if (wizardMode === 'tour') {
      // After creating a new tour, flip wizard to '+ Tour Stop' so user can rapidly add more stops to it!
      wizardMode = 'stop';
    }

    const savedStopName = result.stop?.name || 'Stop';
    setWizardFeedback(
      `Saved "${savedStopName}" (${result.totalStops} total stops). Add another stop or start tour!`,
      'ok',
    );

    if (startImmediately && tourAndPlayEngine?.startCityTour) {
      closeWizard();
      tourAndPlayEngine.startCityTour({
        cityId: savedCityId,
        startStopId: result.stop?.id || null,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
    } else {
      syncWizardUI();
    }
    syncDrawerState();
  }

  function startWanderAtCurrentView() {
    if (!wanderEngine) return;
    if (tourAndPlayEngine?.getStatus?.()?.isActive) {
      tourAndPlayEngine.stop?.();
    }
    const target = getCameraGroundTarget();
    wanderEngine.startWandering({
      lat: target.lat,
      lon: target.lon,
      elev: target.elev,
      heading: target.heading,
      companion: wanderEngine.isCompanionActive?.() ?? true,
      cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
    });
    syncDrawerState();
  }

  function buildJumpOptionsHtml() {
    const resortOpts = Object.values(METRO_TOUR_METADATA || {})
      .filter((m) => m?.venueCategory === 'resort_stay')
      .map(
        (r) =>
          `<option value="resort:${escapeHtml(r.id)}">🏨 ${escapeHtml(r.name)} (${escapeHtml(r.cityLabel || r.country || '')})</option>`,
      )
      .join('');
    const outdoorOpts = Object.values(METRO_TOUR_METADATA || {})
      .filter(
        (m) =>
          m?.venueCategory === 'state_park' ||
          m?.venueCategory === 'mountain_adventure',
      )
      .map(
        (p) =>
          `<option value="park:${escapeHtml(p.id)}">${p.venueCategory === 'state_park' ? '🏞️' : '🏔️'} ${escapeHtml(p.name)}</option>`,
      )
      .join('');
    const waterBoardwalkOpts = Object.values(METRO_TOUR_METADATA || {})
      .filter(
        (m) =>
          m?.venueCategory === 'water_park' ||
          m?.venueCategory === 'boardwalk_strip',
      )
      .map(
        (p) =>
          `<option value="park:${escapeHtml(p.id)}">${p.venueCategory === 'water_park' ? '🌊' : '🎡'} ${escapeHtml(p.name)}</option>`,
      )
      .join('');
    const parkOpts = Object.values(METRO_TOUR_METADATA || {})
      .filter(
        (m) =>
          m?.tourScope === 'venue' &&
          m?.venueCategory !== 'resort_stay' &&
          m?.venueCategory !== 'state_park' &&
          m?.venueCategory !== 'mountain_adventure' &&
          m?.venueCategory !== 'water_park' &&
          m?.venueCategory !== 'boardwalk_strip',
      )
      .map(
        (p) =>
          `<option value="park:${escapeHtml(p.id)}">🎢 ${escapeHtml(p.name)}</option>`,
      )
      .join('');
    const localeOpts = Object.values(EXEMPLAR_LOCALES || {})
      .map(
        (loc) =>
          `<option value="locale:${loc.id}">🌍 ${loc.name} (${loc.region || ''})</option>`,
      )
      .join('');
    const cityOpts = Object.values(LIVING_CITIES || {})
      .map(
        (c) =>
          `<option value="city:${c.id}">🏙️ ${c.name} — ${c.landmarks?.[0] || c.country || ''}</option>`,
      )
      .join('');
    return `
      <option value="">Select a destination to jump...</option>
      ${resortOpts ? `<optgroup label="🏨 Resort Stays (Day Off)">${resortOpts}</optgroup>` : ''}
      ${outdoorOpts ? `<optgroup label="🏞️ State Parks & Mountain Adventures">${outdoorOpts}</optgroup>` : ''}
      ${waterBoardwalkOpts ? `<optgroup label="🎡 Water Parks, Boardwalks & Strips">${waterBoardwalkOpts}</optgroup>` : ''}
      ${parkOpts ? `<optgroup label="🎢 Theme Park Days">${parkOpts}</optgroup>` : ''}
      <optgroup label="World Exemplar Locales">
        ${localeOpts}
      </optgroup>
      <optgroup label="Featured Neighborhoods">
        ${cityOpts}
      </optgroup>
    `;
  }

  function buildDOM() {
    if (!host || typeof document === 'undefined') return;
    ensureStyles();

    launcherBtn = document.createElement('button');
    launcherBtn.id = 'gev-wander-launcher-button';
    launcherBtn.className = 'gev-wander-launcher-btn';
    launcherBtn.title = 'Ground Explorer & Companion Wander (WASD)';
    launcherBtn.setAttribute(
      'aria-label',
      'Ground Explorer & Companion Wander',
    );
    launcherBtn.textContent = '🚶';
    launcherBtn.addEventListener('click', () => toggle());
    host.appendChild(launcherBtn);

    pointerLockBannerEl = document.createElement('div');
    pointerLockBannerEl.id = 'gev-pointer-lock-banner';
    pointerLockBannerEl.className = 'gev-pointer-lock-banner';
    pointerLockBannerEl.innerHTML =
      '<span>🖱️ <b>Mouse Look Active</b> — Click anywhere or press <b>ESC</b> to release cursor</span>';
    host.appendChild(pointerLockBannerEl);

    tourResumePillEl = document.createElement('div');
    tourResumePillEl.id = 'gev-tour-resume-pill';
    tourResumePillEl.className = 'gev-tour-resume-pill';
    tourResumePillEl.innerHTML = `
      <span class="gev-tour-resume-pill-label">🚶 Free Roam</span>
      <button class="gev-tour-resume-btn gev-tour-resume-current-btn" type="button" title="Rejoin current stop in autonomous tour">↩ Rejoin Stop</button>
      <button class="gev-tour-resume-btn gev-tour-resume-next-btn" type="button" title="Resume tour and advance to the next stop">▶ Next Stop</button>
    `;
    host.appendChild(tourResumePillEl);

    drawerEl = document.createElement('div');
    drawerEl.id = 'gev-wander-drawer';
    drawerEl.className = 'gev-wander-drawer';
    drawerEl.innerHTML = `
      <div class="gev-wander-header">
        <div>
          <div class="gev-wander-title">🚶 GROUND EXPLORER & COMPANION</div>
          <div class="gev-wander-subtitle">Direct WASD Street Stroll & Co-Explorer</div>
        </div>
        <button class="gev-wander-close" title="Close">✕</button>
      </div>

      <div class="gev-wander-loc-card">
        <div class="gev-wander-loc-header">
          <span>Where You Are (Zero-Credit)</span>
          <span class="gev-wander-loc-badge">STANDBY</span>
        </div>
        <div class="gev-wander-loc-name">📍 Resolving local sector...</div>
        <div class="gev-wander-loc-coords">--.-----°, --.-----° · ALT 0m · 0 MPH</div>
      </div>

      <div class="gev-wander-primary-row">
        <button class="gev-wander-start-btn">🚶 Wander Here (WASD)</button>
        <button class="gev-wander-exit-btn">⏹️ Exit</button>
      </div>

      <div class="gev-tour-play-card">
        <div class="gev-tour-play-header">
          <span class="gev-tour-play-title">🛴 CITY SCOOTER TOUR (15 MPH · RANDOMIZED)</span>
          <span class="gev-tour-play-badge">TOUR READY</span>
        </div>
        <div class="gev-tour-play-status">
          Randomized landmark order every run · 15 mph electric scooter transit · 20s autonomous walking dwell + lore bubble at each stop.
        </div>
        <div class="gev-tour-play-row gev-tour-controls">
          <select class="gev-tour-city-select" aria-label="Select City for Scooter Tour">
            ${buildTourCityOptionsHtml({ includeAuto: true })}
          </select>
          <button class="gev-tour-start-btn" title="Start Randomized Electric Scooter Landmark Tour">🛴 Start Tour</button>
          <button class="gev-tour-wizard-open-btn" title="Quick Wizard: Add a stop to this tour or create a new local tour">+ Stop</button>
        </div>
        <div class="gev-tour-mode-bar" style="display: none;">
          <button class="gev-tour-mode-btn active" data-tour-mode="all" type="button">🌐 All 18</button>
          <button class="gev-tour-mode-btn" data-tour-mode="front_of_park" type="button">🚀 Front of Park (7)</button>
          <button class="gev-tour-mode-btn" data-tour-mode="world_showcase" type="button">🌍 11 Countries (11)</button>
        </div>
        <div class="gev-resort-transit-bar" style="display: none;" aria-label="Resort Day Transit Mode">
          <button class="gev-resort-transit-btn active" data-resort-transit="walk_midway" type="button" title="Stroll resort paths (3.2 m/s; auto Golf Cart on fairways)">🚶 Walk</button>
          <button class="gev-resort-transit-btn" data-resort-transit="scooter" type="button" title="Cruise resort loops by E-Scooter (6.7 m/s)">🛴 E-Scooter</button>
          <button class="gev-resort-transit-btn" data-resort-transit="resort_cart" type="button" title="Resort Golf Cart cruiser (5.5 m/s)">⛳ Golf Cart</button>
        </div>
        <div class="gev-resort-checkin-bar" style="display: none;">
          <button class="gev-resort-checkin-btn" type="button" title="Check into this resort as a temporary home base without altering your claimed estates">🏨 Check In (Temp Basecamp)</button>
          <button class="gev-resort-open-basecamp-btn" type="button" style="display: none;" title="Open Estates & Fleet Drawer to depart by Drive, Transit, or Heli">🏡 Basecamp</button>
        </div>
        <div class="gev-play-activities-grid gev-play-controls" style="display: none;"></div>
        <div class="gev-tour-no-tour-cta">
          <span class="gev-tour-no-tour-cta-text">No tour here yet — know this spot personally?</span>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">
            <button class="gev-tour-forge-build-btn" type="button" style="display: none; border-color: rgba(245, 158, 11, 0.72); background: linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(245, 158, 11, 0.35));" title="Synthesize a real Tour v2 landmark tour here using Dev Forge">🛠️ Build: Tour Here</button>
            <button class="gev-tour-wizard-new-tour-btn" title="Guided Wizard to create a local tour & stop here">✨ + Create Tour Here</button>
          </div>
        </div>
        <div class="gev-tour-wizard-panel" aria-label="Quick Tour & Stop Wizard">
          <div class="gev-wizard-header">
            <span class="gev-wizard-title">✨ Quick Tour Wizard</span>
            <div class="gev-wizard-mode-pills">
              <button class="gev-wizard-mode-btn active" data-wiz-mode="stop" type="button">+ Tour Stop</button>
              <button class="gev-wizard-mode-btn" data-wiz-mode="tour" type="button">+ New Tour</button>
              <button class="gev-wizard-close-btn" type="button" title="Close Wizard">✕</button>
            </div>
          </div>

          <div class="gev-wizard-pin-card">
            <div class="gev-wizard-pin-label">📌 Pin: Current Camera Target</div>
            <div class="gev-wizard-pin-coords">--.-----°, --.-----° · ALT 50m · HDG 90°</div>
            <div class="gev-wizard-pin-actions">
              <button class="gev-wizard-mini-btn gev-wizard-snap-btn" type="button" title="Capture current camera center as this stop location">📍 Snap View</button>
              <button class="gev-wizard-mini-btn gev-wizard-pick-btn" type="button" title="Click anywhere on the 3D globe to drop this stop pin">🎯 Pick Globe</button>
            </div>
          </div>

          <div class="gev-wizard-target-tour-row" style="display: flex; flex-direction: column; gap: 3px;">
            <label class="gev-wizard-field-label">Target Tour</label>
            <select class="gev-wizard-select gev-wizard-target-tour-select" aria-label="Target Tour for New Stop">
              ${buildTourCityOptionsHtml({ includeAuto: false })}
            </select>
          </div>

          <div class="gev-wizard-new-tour-fields" style="display: none; flex-direction: column; gap: 5px;">
            <div>
              <label class="gev-wizard-field-label">Tour Name *</label>
              <input type="text" class="gev-wizard-input gev-wizard-tour-name" placeholder="e.g. Dahlonega Historic Square" />
            </div>
            <div>
              <label class="gev-wizard-field-label">Country / Region</label>
              <input type="text" class="gev-wizard-input gev-wizard-tour-country" placeholder="Auto-detected from view (optional)" />
            </div>
          </div>

          <div>
            <label class="gev-wizard-field-label">Stop Name *</label>
            <input type="text" class="gev-wizard-input gev-wizard-stop-name" placeholder="e.g. Hidden Brick Alley Bakery" />
          </div>

          <div>
            <label class="gev-wizard-field-label">Category / Vibe</label>
            <select class="gev-wizard-select gev-wizard-stop-category" aria-label="Stop Category">
              ${TOUR_STOP_CATEGORIES.map(
                (cat) =>
                  `<option value="${escapeHtml(cat.id)}" title="${escapeHtml(cat.hint)}">${escapeHtml(cat.icon)} ${escapeHtml(cat.label)}</option>`,
              ).join('')}
            </select>
          </div>

          <div>
            <label class="gev-wizard-field-label">Insider Story / Lore *</label>
            <textarea class="gev-wizard-textarea gev-wizard-stop-lore" rows="2" placeholder="What makes this stop special? Share local history, a tip, or what to look for..."></textarea>
          </div>

          <div>
            <label class="gev-wizard-field-label">Companion Line (Optional)</label>
            <input type="text" class="gev-wizard-input gev-wizard-stop-companion" placeholder="Leave blank to auto-draft from your story" />
          </div>

          <div class="gev-wizard-contract-row">
            <span class="gev-wizard-contract-status">⚠️ Needs Stop Name & Story</span>
          </div>

          <details class="gev-wizard-json-details">
            <summary>Contract Preview (JSON)</summary>
            <pre class="gev-wizard-json-pre"></pre>
            <button class="gev-wizard-mini-btn gev-wizard-copy-json-btn" type="button">📋 Copy Contract JSON</button>
          </details>

          <div class="gev-wizard-feedback" role="status"></div>

          <div class="gev-wizard-save-row">
            <button class="gev-wizard-save-btn" type="button">💾 Save Stop</button>
            <button class="gev-wizard-save-start-btn" type="button">🛴 Save & Start Tour</button>
          </div>

          <div class="gev-wizard-custom-list-wrap">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span class="gev-wizard-field-label" style="margin:0;">Your Custom Stops</span>
              <div style="display: flex; gap: 4px;">
                <button class="gev-wizard-mini-btn gev-wizard-export-tour-btn" type="button" style="flex:0 0 auto; padding: 2px 6px;">📤 Export</button>
                <button class="gev-wizard-mini-btn gev-wizard-delete-tour-btn" type="button" style="flex:0 0 auto; padding: 2px 6px; border-color: rgba(239,68,68,0.45); color:#fca5a5; display:none;">🗑️ Tour</button>
              </div>
            </div>
            <div class="gev-wizard-custom-list"></div>
          </div>
        </div>
        <div class="gev-tour-passport-strip">
          <div class="gev-tour-passport-header">
            <span class="gev-tour-passport-title">🛂 Day Passport</span>
            <span class="gev-tour-passport-count">0/0 (0%)</span>
          </div>
          <div class="gev-tour-passport-bar-wrap">
            <div class="gev-tour-passport-bar"></div>
          </div>
          <div class="gev-tour-passport-stamps"></div>
          <details class="gev-tour-secrets-details">
            <summary>🗺️ Off-Route Clues & Stamps ▾</summary>
            <div class="gev-tour-secrets-list"></div>
          </details>
        </div>
        <div class="gev-tour-npc-strip">
          <div class="gev-tour-npc-header">
            <span>🗣️ Park Cast & Insider Clues</span>
            <button class="gev-tour-npc-btn gev-tour-npc-chat-e-btn" type="button" title="Chat with nearest park NPC [E]">💬 Chat [E]</button>
          </div>
          <div class="gev-tour-npc-chips"></div>
          <div class="gev-tour-npc-dialogue"></div>
        </div>
        <div class="gev-tour-hopper-bar">
          <div class="gev-tour-hopper-header">🚝 Resort Park-Hopper Transit</div>
          <div class="gev-tour-hopper-list"></div>
        </div>
        <div class="gev-tour-play-row gev-tour-active-actions" style="display: none;">
          <button class="gev-tour-action-btn gev-tour-open-card-btn" type="button" title="Open Wikimedia Photo & 4K POV Experience Card">🎬 Card</button>
          <button class="gev-tour-action-btn gev-tour-firepit-btn" type="button" style="display: none;" title="Toggle Lakeside Fire Pit & Acoustic Sunset Lounge">🔥 Fire Pit</button>
          <button class="gev-tour-action-btn gev-tour-fireworks-btn" type="button" style="display: none;" title="Toggle Procedural Dusk Fireworks Finale">🎆 Fireworks</button>
          <button class="gev-tour-action-btn gev-tour-takeover-btn" title="Take over at normal walking wander speed (1.2 m/s)">🚶 Walk Here (1.2 m/s)</button>
          <button class="gev-tour-action-btn continue gev-tour-continue-btn" title="Resume scooter tour to next randomized landmark">🛴 Continue Tour ▶</button>
          <button class="gev-wander-exit-btn gev-tour-stop-btn" style="flex: 0 0 auto; padding: 6px 8px;" title="Stop Tour / Play">⏹️</button>
        </div>
      </div>

      <div>
        <div class="gev-wander-section-label">
          <span>Camera Perspective [V]</span>
          <span style="font-size:9.5px; color:#64748b;">Right-Drag to Look</span>
        </div>
        <div class="gev-wander-cam-grid">
          <button class="gev-wander-mode-btn active" data-wmode="iso_chase">🎥 Iso Chase</button>
          <button class="gev-wander-mode-btn" data-wmode="first_person">👁️ 1st Person</button>
          <button class="gev-wander-mode-btn" data-wmode="heli">🚁 Heli</button>
          <button class="gev-wander-mode-btn" data-wmode="overview">🛰️ Overview</button>
          <button class="gev-wander-mode-btn" data-wmode="snap">🎯 Snap Back</button>
          <button class="gev-wander-mode-btn" data-wmode="fps_lock" title="Lock mouse for free look (Click or press ESC to exit)">🖱️ Mouse Look</button>
        </div>
      </div>

      <div class="gev-wander-companion-card">
        <div class="gev-wander-section-label" style="margin-bottom:0;">
          <span>Autonomous Co-Stroller</span>
          <span style="font-size:9.5px; color:#10b981;">Soft Tether 3–8m</span>
        </div>
        <div class="gev-wander-companion-row">
          <button class="gev-wander-comp-toggle">👯 ${getCompanionPersonaName()}: Active [P]</button>
          <input type="text" class="gev-wander-comp-input" value="${getCompanionPersonaName()}" placeholder="Companion Name" title="Companion Persona Name" />
        </div>
        <div class="gev-wander-comp-thought">"Ready to explore the neighborhood together."</div>
      </div>

      <div>
        <div class="gev-wander-section-label">
          <span>Optional Destination Jump</span>
        </div>
        <div class="gev-wander-jump-row">
          <select class="gev-wander-jump-select" aria-label="Select destination to jump">
            ${buildJumpOptionsHtml()}
          </select>
          <button class="gev-wander-jump-btn">Jump</button>
        </div>
      </div>

      <div class="gev-wander-help">
        <b>Controls:</b> <b>W/A/S/D</b> Walk & Strafe · <b>Shift</b> Sprint · <b>Q/E</b> Turn · <b>Right-Drag</b> Orbit/Look · <b>Left-Click Ground</b> Relocate
      </div>
    `;

    drawerEl
      .querySelector('.gev-wander-close')
      ?.addEventListener('click', () => close());

    drawerEl
      .querySelector('.gev-wander-start-btn')
      ?.addEventListener('click', () => {
        startWanderAtCurrentView();
      });

    drawerEl
      .querySelector('.gev-wander-exit-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.stop?.();
        wanderEngine?.stopWandering?.();
        syncDrawerState();
      });

    const tourStartBtn = drawerEl.querySelector('.gev-tour-start-btn');
    const tourCitySelect = drawerEl.querySelector('.gev-tour-city-select');
    tourStartBtn?.addEventListener('click', () => {
      if (!tourAndPlayEngine) return;
      const selVal = tourCitySelect?.value || 'auto';
      const camPos = cityEngine?.getCurrentCameraGroundPosition?.();
      const carto = viewer?.camera?.positionCartographic;
      const hasLiveCameraCoords = Boolean(
        (camPos &&
          Number.isFinite(camPos.lat) &&
          Number.isFinite(camPos.lon)) ||
        (carto &&
          Number.isFinite(carto.latitude) &&
          Number.isFinite(carto.longitude)),
      );
      const telemCoords = wanderEngine?.getTelemetry?.()?.coordinates;
      const g =
        !hasLiveCameraCoords &&
        wanderEngine?.isWandering &&
        Number.isFinite(telemCoords?.lat) &&
        Number.isFinite(telemCoords?.lon)
          ? {
              lat: telemCoords.lat,
              lon: telemCoords.lon,
              elev: telemCoords.height || 0,
            }
          : getCameraGroundTarget();
      if (selVal === 'auto') {
        const ctx = tourAndPlayEngine.resolveContext?.(
          g.lat,
          g.lon,
          g.elev || 0,
        );
        const autoIsResort =
          ctx?.venueCategory === 'resort_stay' || isResortStayId(ctx?.cityId);
        tourAndPlayEngine.startCityTour({
          cityId: ctx?.cityId || null,
          lat: g.lat,
          lon: g.lon,
          elev: g.elev || 0,
          tourMode: selectedTourMode,
          ...(autoIsResort && selectedResortTransitMode !== 'walk_midway'
            ? { transitMode: selectedResortTransitMode }
            : {}),
          cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
        });
      } else {
        const selIsResort =
          METRO_TOUR_METADATA[selVal]?.venueCategory === 'resort_stay' ||
          isResortStayId(selVal);
        tourAndPlayEngine.startCityTour({
          cityId: selVal,
          tourMode: selectedTourMode,
          ...(selIsResort && selectedResortTransitMode !== 'walk_midway'
            ? { transitMode: selectedResortTransitMode }
            : {}),
          cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
        });
      }
      syncDrawerState();
    });

    tourCitySelect?.addEventListener('change', () => {
      selectedTourMode = 'all';
      syncTourAndPlayUI();
    });

    drawerEl
      .querySelector('.gev-tour-mode-bar')
      ?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.gev-tour-mode-btn');
        if (!btn) return;
        const nextMode = btn.getAttribute('data-tour-mode') || 'all';
        selectedTourMode = nextMode;
        const st = tourAndPlayEngine?.getStatus?.();
        if (
          st?.isTour &&
          st.cityId &&
          METRO_TOUR_METADATA[st.cityId]?.supportedModes?.length > 1
        ) {
          tourAndPlayEngine.startCityTour({
            cityId: st.cityId,
            tourMode: selectedTourMode,
            cameraMode: st.cameraMode || WANDER_CAMERA_MODES.ISO_CHASE,
          });
        }
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-secrets-list')
      ?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.gev-tour-secret-btn');
        if (!btn) return;
        const sid = btn.getAttribute('data-secret-id');
        if (sid) {
          parkAdventures?.collectSecretById?.(sid);
          syncDrawerState();
        }
      });

    drawerEl
      .querySelector('.gev-tour-npc-strip')
      ?.addEventListener('click', (e) => {
        const chatBtn = e.target?.closest?.('.gev-tour-npc-chat-e-btn');
        if (chatBtn) {
          parkAdventures?.interactWithNearestNpc?.();
          syncDrawerState();
          return;
        }
        const npcBtn = e.target?.closest?.('.gev-tour-npc-btn[data-npc-id]');
        if (npcBtn) {
          const nid = npcBtn.getAttribute('data-npc-id');
          if (nid) {
            parkAdventures?.interactWithNpc?.(nid);
            syncDrawerState();
          }
        }
      });

    drawerEl
      .querySelector('.gev-tour-hopper-list')
      ?.addEventListener('click', (e) => {
        const rideBtn = e.target?.closest?.('.gev-tour-hopper-ride-btn');
        if (rideBtn) {
          const corridorId = rideBtn.getAttribute('data-corridor-id');
          const profileId = rideBtn.getAttribute('data-profile-id');
          const targetCityId = rideBtn.getAttribute('data-target-city-id');
          const arrivalStopId = rideBtn.getAttribute('data-arrival-stop-id');
          const speedMph = Number(rideBtn.getAttribute('data-speed-mph')) || 45;
          const activeRailEngine =
            railwayEngine ||
            (typeof window !== 'undefined' ? window.__gevRailEngine : null);
          const activeRailDrawer =
            railDrawer ||
            (typeof window !== 'undefined' ? window.__gevRailDrawer : null);
          if (activeRailEngine?.spawnRailRoute && corridorId) {
            tourAndPlayEngine?.stop?.();
            activeRailDrawer?.selectCorridor?.(corridorId, profileId);
            activeRailDrawer?.open?.();
            dock.notifySimulationStarted('rail');
            void activeRailEngine.spawnRailRoute(corridorId, null, {
              corridor: profileId || undefined,
              cameraMode: 'chase',
              cabRide: false,
              speedMph,
              useOverpass: false,
              onArrival: () => {
                if (!targetCityId) return;
                activeRailEngine.clearActiveRailRoute?.();
                dock.notifySimulationStopped('rail');
                selectedTourMode = 'all';
                open();
                tourAndPlayEngine?.startCityTour?.({
                  cityId: targetCityId,
                  startStopId: arrivalStopId || null,
                  tourMode: 'all',
                  cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
                });
                syncDrawerState();
              },
            });
            syncDrawerState();
            return;
          }
        }
        const hopBtn = e.target?.closest?.('.gev-tour-hopper-btn');
        if (!hopBtn) return;
        const targetCityId = hopBtn.getAttribute('data-target-city-id');
        const bridgeId = hopBtn.getAttribute('data-bridge-id');
        if (targetCityId || bridgeId) {
          selectedTourMode = 'all';
          tourAndPlayEngine?.hopToLinkedPark?.(targetCityId, { bridgeId });
          syncDrawerState();
        }
      });

    drawerEl
      .querySelector('.gev-resort-transit-bar')
      ?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.gev-resort-transit-btn');
        if (!btn) return;
        const nextTransit =
          btn.getAttribute('data-resort-transit') || 'walk_midway';
        selectedResortTransitMode = nextTransit;
        const st = tourAndPlayEngine?.getStatus?.();
        if (st?.isTour && st.venueCategory === 'resort_stay') {
          // Selecting Walk restores default promenade + auto Golf Cart on fairways;
          // E-Scooter or Golf Cart pins that mode across resort stops.
          tourAndPlayEngine.setTransitMode?.(
            nextTransit === 'walk_midway' ? 'auto' : nextTransit,
          );
        }
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-resort-checkin-btn')
      ?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const resortId = btn?.getAttribute?.('data-resort-id');
        if (!resortId) return;
        const currentTemp = getTempBasecamp();
        if (currentTemp?.resortId === resortId) {
          checkOutTempBasecamp();
        } else {
          const allMetaMap = getAllTourCatalogEntries().metadataByCityId;
          const meta = allMetaMap[resortId] || METRO_TOUR_METADATA[resortId];
          if (meta) {
            checkInTempBasecamp(meta);
          }
        }
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-resort-open-basecamp-btn')
      ?.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.__gevEstateDrawer?.open) {
          window.__gevEstateDrawer.open();
        } else {
          dock.openDrawer?.('estate');
        }
      });

    drawerEl
      .querySelector('.gev-tour-firepit-btn')
      ?.addEventListener('click', () => {
        if (parkFireworks?.toggleFirePit) {
          parkFireworks.toggleFirePit();
        } else {
          parkFireworks?.toggle?.('fire_pit_lounge');
        }
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-fireworks-btn')
      ?.addEventListener('click', () => {
        if (parkFireworks?.toggleFireworks) {
          parkFireworks.toggleFireworks();
        } else {
          parkFireworks?.toggle?.();
        }
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-open-card-btn')
      ?.addEventListener('click', () => {
        const st = tourAndPlayEngine?.getStatus?.();
        tourPoiCards?.openExperienceCard?.(st?.currentLandmark || null);
      });

    tourResumePillEl
      ?.querySelector('.gev-tour-resume-current-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.continueTour?.({
          advanceToNext: false,
          resumeFromCurrent: true,
        });
        syncDrawerState();
      });

    tourResumePillEl
      ?.querySelector('.gev-tour-resume-next-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.continueTour?.({ advanceToNext: true });
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-takeover-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.takeOverAtLandmark?.();
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-continue-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.continueTour?.();
        syncDrawerState();
      });

    drawerEl
      .querySelector('.gev-tour-stop-btn')
      ?.addEventListener('click', () => {
        tourAndPlayEngine?.stop?.();
        syncDrawerState();
      });

    drawerEl.querySelectorAll('[data-wmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-wmode');
        if (!wanderEngine) return;
        if (mode === 'snap') {
          wanderEngine.snapBack?.();
        } else if (mode === 'fps_lock') {
          if (wanderEngine.isPointerLocked?.()) {
            wanderEngine.exitPointerLock?.();
          } else {
            if (!wanderEngine.isWandering) {
              startWanderAtCurrentView();
            }
            wanderEngine.requestPointerLock?.();
          }
        } else {
          wanderEngine.setCameraMode?.(mode);
        }
        syncDrawerState();
      });
    });

    drawerEl
      .querySelector('.gev-wander-comp-toggle')
      ?.addEventListener('click', () => {
        if (!wanderEngine) return;
        wanderEngine.toggleCompanion?.();
        syncDrawerState();
      });

    const nameInput = drawerEl.querySelector('.gev-wander-comp-input');
    nameInput?.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        setCompanionPersonaName(val);
        syncDrawerState();
      }
    });

    const jumpSelect = drawerEl.querySelector('.gev-wander-jump-select');
    const jumpBtn = drawerEl.querySelector('.gev-wander-jump-btn');
    jumpBtn?.addEventListener('click', () => {
      const raw = jumpSelect?.value || '';
      if (!raw || !wanderEngine) return;
      if (tourAndPlayEngine?.getStatus?.()?.isActive) {
        tourAndPlayEngine.stop?.();
      }
      if (tourCitySelect) {
        tourCitySelect.value = 'auto';
      }
      const [kind, id] = raw.split(':');
      if (kind === 'resort' || kind === 'park') {
        if (tourAndPlayEngine?.startCityTour) {
          if (tourCitySelect) {
            tourCitySelect.value = id;
          }
          tourAndPlayEngine.startCityTour({
            cityId: id,
            tourMode: 'all',
            ...(kind === 'resort' && selectedResortTransitMode !== 'walk_midway'
              ? { transitMode: selectedResortTransitMode }
              : {}),
            cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
          });
        } else {
          const meta = METRO_TOUR_METADATA?.[id];
          if (
            meta &&
            Number.isFinite(meta.centerLat) &&
            Number.isFinite(meta.centerLon)
          ) {
            wanderEngine.startWandering({
              lat: meta.centerLat,
              lon: meta.centerLon,
              elev: null,
              heading: 0,
              companion: wanderEngine.isCompanionActive?.() ?? true,
              cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
            });
          }
        }
      } else if (kind === 'locale') {
        const loc =
          EXEMPLAR_LOCALES?.[id] ||
          Object.values(EXEMPLAR_LOCALES || {}).find((l) => l.id === id);
        if (loc) {
          wanderEngine.startWandering({
            lat: loc.lat,
            lon: loc.lon,
            elev: loc.groundElevationMeters || null,
            heading: loc.headingDeg || 0,
            companion: wanderEngine.isCompanionActive?.() ?? true,
            cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
          });
        }
      } else if (kind === 'city') {
        const city =
          LIVING_CITIES?.[id] ||
          Object.values(LIVING_CITIES || {}).find((c) => c.id === id);
        if (city) {
          wanderEngine.startWandering({
            lat: city.lat,
            lon: city.lon,
            elev: city.groundElevationMeters || null,
            heading: city.headingDeg || 0,
            companion: wanderEngine.isCompanionActive?.() ?? true,
            cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
          });
        }
      }
      if (jumpSelect) jumpSelect.value = '';
      syncDrawerState();
    });

    drawerEl
      .querySelector('.gev-tour-wizard-open-btn')
      ?.addEventListener('click', () => {
        if (isWizardOpen) closeWizard();
        else openWizard('stop');
      });

    drawerEl
      .querySelector('.gev-tour-forge-build-btn')
      ?.addEventListener('click', () => {
        if (!activeWanderCatalogPlace) return;
        const coords = getCameraGroundTarget();
        if (typeof onRequestTourBuild === 'function') {
          void onRequestTourBuild(activeWanderCatalogPlace, coords);
          return;
        }
        if (
          typeof window !== 'undefined' &&
          window.__gevCityDrawer?.triggerBuildTourForPlace
        ) {
          void window.__gevCityDrawer.triggerBuildTourForPlace(
            activeWanderCatalogPlace,
            coords,
          );
        }
      });

    drawerEl
      .querySelector('.gev-tour-wizard-new-tour-btn')
      ?.addEventListener('click', () => {
        openWizard('tour');
      });

    drawerEl
      .querySelector('.gev-wizard-close-btn')
      ?.addEventListener('click', () => {
        closeWizard();
        syncDrawerState();
      });

    drawerEl.querySelectorAll('.gev-wizard-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-wiz-mode');
        setWizardMode(mode);
      });
    });

    drawerEl
      .querySelector('.gev-wizard-snap-btn')
      ?.addEventListener('click', () => {
        stopGlobePickMode();
        captureCurrentViewPin();
        setWizardFeedback('Pin snapped to your current camera view.', 'ok');
      });

    drawerEl
      .querySelector('.gev-wizard-pick-btn')
      ?.addEventListener('click', () => {
        startGlobePickMode();
      });

    drawerEl
      .querySelector('.gev-wizard-target-tour-select')
      ?.addEventListener('change', () => {
        syncWizardContractPreview();
        renderCustomStopsList();
      });

    [
      '.gev-wizard-tour-name',
      '.gev-wizard-tour-country',
      '.gev-wizard-stop-name',
      '.gev-wizard-stop-category',
      '.gev-wizard-stop-lore',
      '.gev-wizard-stop-companion',
    ].forEach((sel) => {
      const el = drawerEl.querySelector(sel);
      el?.addEventListener('input', () => syncWizardContractPreview());
      el?.addEventListener('change', () => syncWizardContractPreview());
    });

    drawerEl
      .querySelector('.gev-wizard-copy-json-btn')
      ?.addEventListener('click', async () => {
        const pre = drawerEl.querySelector('.gev-wizard-json-pre');
        const ok = await copyTextSafe(pre?.textContent || '');
        setWizardFeedback(
          ok
            ? 'Copied stop/tour contract JSON to clipboard.'
            : 'Clipboard unavailable in this context.',
          ok ? 'ok' : 'error',
        );
      });

    drawerEl
      .querySelector('.gev-wizard-save-btn')
      ?.addEventListener('click', () => {
        handleSaveWizard({ startImmediately: false });
      });

    drawerEl
      .querySelector('.gev-wizard-save-start-btn')
      ?.addEventListener('click', () => {
        handleSaveWizard({ startImmediately: true });
      });

    drawerEl
      .querySelector('.gev-wizard-export-tour-btn')
      ?.addEventListener('click', async () => {
        const targetCityId = getActiveTargetCityIdForWizard();
        const json = exportTourAsContractJson(targetCityId);
        const ok = await copyTextSafe(json || '');
        setWizardFeedback(
          ok
            ? `Exported "${targetCityId}" tour contract JSON to clipboard.`
            : 'Clipboard unavailable for export.',
          ok ? 'ok' : 'error',
        );
      });

    drawerEl
      .querySelector('.gev-wizard-delete-tour-btn')
      ?.addEventListener('click', () => {
        const targetCityId = getActiveTargetCityIdForWizard();
        if (removeCustomTour(targetCityId)) {
          syncTourCitySelectOptions('auto');
          setWizardFeedback('Removed custom tour.', 'ok');
          syncWizardUI();
          syncDrawerState();
        }
      });

    drawerEl
      .querySelector('.gev-wizard-custom-list')
      ?.addEventListener('click', (e) => {
        const row = e.target?.closest?.('.gev-wizard-custom-row');
        if (!row) return;
        const stopId = row.getAttribute('data-stop-id');
        const cityId = row.getAttribute('data-city-id');
        if (e.target?.closest?.('.gev-wizard-del-stop-btn')) {
          if (removeCustomTourStop(cityId, stopId)) {
            syncTourCitySelectOptions(cityId);
            setWizardFeedback('Removed custom stop.', 'ok');
            syncWizardUI();
            syncDrawerState();
          }
          return;
        }
        if (e.target?.closest?.('.gev-wizard-fly-stop-btn')) {
          const stop = getLandmarksForCity(cityId).find((s) => s.id === stopId);
          if (stop) {
            if (wanderEngine?.isWandering) {
              wanderEngine.relocateTo?.({
                lat: stop.lat,
                lon: stop.lon,
                elev: stop.elev || 50,
                heading: stop.streetBearingDeg ?? 90,
                preserveCameraMode: true,
              });
            } else if (viewer?.camera?.flyTo) {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  stop.lon,
                  stop.lat,
                  (stop.elev || 50) + 180,
                ),
                duration: 1.2,
              });
            }
          }
        }
      });

    host.appendChild(drawerEl);

    if (wanderEngine?.onPointerLockChange) {
      unsubscribePointerLock = wanderEngine.onPointerLockChange((locked) => {
        syncPointerLockUI(locked);
      });
    }

    unsubscribeLocality = onLocalityResolved(() => {
      if (isOpen) {
        syncDrawerState();
      }
    });

    unsubscribeCustomTours = onCustomToursChange(() => {
      const st = tourAndPlayEngine?.getStatus?.();
      syncTourCitySelectOptions(st?.isTour ? st.cityId : null);
      if (isOpen) {
        syncDrawerState();
      }
    });

    unsubscribeAgentCaps = getEffectiveAgentPanel()?.onCapabilitiesChange?.(
      () => {
        if (isOpen) {
          syncDrawerState();
        }
      },
    );

    if (wanderEngine?.onTelemetry) {
      wanderEngine.onTelemetry((telem) => {
        if (isOpen || launcherBtn) {
          syncDrawerState(telem);
        }
      });
    }

    if (tourAndPlayEngine?.onStatusChange) {
      unsubscribeTourStatus = tourAndPlayEngine.onStatusChange(() => {
        if (isOpen || launcherBtn || tourResumePillEl) {
          syncDrawerState();
        }
      });
    }

    if (parkAdventures?.onStateChange) {
      unsubscribeParkAdventures = parkAdventures.onStateChange(() => {
        if (isOpen || tourResumePillEl) {
          syncDrawerState();
        }
      });
    }

    if (parkFireworks?.onStateChange) {
      unsubscribeParkFireworks = parkFireworks.onStateChange(() => {
        if (isOpen) {
          syncDrawerState();
        }
      });
    }

    unsubscribeTempBasecamp = onTempBasecampChange(() => {
      if (isOpen) {
        syncDrawerState();
      }
    });

    dock.registerDrawer('wander', {
      open: () => open(),
      close: () => close(),
      isOpen: () => isOpen,
      launcherEl: launcherBtn,
    });

    dock.registerSimulation('wander', {
      stop: () => {
        tourAndPlayEngine?.stop?.();
        if (wanderEngine?.isWandering) {
          wanderEngine.stopWandering();
          syncDrawerState();
        }
        dock.notifySimulationStopped('wander');
      },
      isActive: () =>
        Boolean(
          wanderEngine?.isWandering ||
          tourAndPlayEngine?.getStatus?.()?.isActive,
        ),
    });

    dock.registerOverlayGroup('wander-banner', {
      elements: [pointerLockBannerEl, tourResumePillEl],
    });
  }

  function open() {
    if (!drawerEl) return;
    dock.notifyDrawerOpened('wander');
    isOpen = true;
    drawerEl.classList.add('open');
    launcherBtn?.classList.add('dock-open');
    syncTourCitySelectOptions();
    syncDrawerState();
  }

  function close() {
    if (!drawerEl) return;
    stopGlobePickMode();
    isOpen = false;
    drawerEl.classList.remove('open');
    launcherBtn?.classList.remove('dock-open');
    dock.notifyDrawerClosed('wander');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function destroy() {
    close();
    closeWizard();
    if (wizardFeedbackTimer) {
      clearTimeout(wizardFeedbackTimer);
      wizardFeedbackTimer = null;
    }
    dock.unregisterOverlayGroup('wander-banner');
    dock.unregisterSimulation('wander');
    dock.unregisterDrawer('wander');
    unsubscribePointerLock?.();
    unsubscribeLocality?.();
    unsubscribeTourStatus?.();
    unsubscribeCustomTours?.();
    unsubscribeAgentCaps?.();
    unsubscribeParkAdventures?.();
    unsubscribeParkFireworks?.();
    unsubscribeTempBasecamp?.();
    launcherBtn?.remove();
    drawerEl?.remove();
    pointerLockBannerEl?.remove();
    tourResumePillEl?.remove();
  }

  buildDOM();

  return {
    open,
    close,
    toggle,
    destroy,
    syncDrawerState,
    openWizard,
    closeWizard,
    isOpen: () => isOpen,
    isWizardOpen: () => isWizardOpen,
    getElement: () => drawerEl,
    getLauncherButton: () => launcherBtn,
  };
}
