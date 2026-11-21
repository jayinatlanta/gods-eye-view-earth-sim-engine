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
} from '../layers/citylife/tourAndPlayEngine.js';
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
  viewer = null,
  container = null,
} = {}) {
  const host =
    container || (typeof document !== 'undefined' ? document.body : null);
  let isOpen = false;
  let launcherBtn = null;
  let drawerEl = null;
  let pointerLockBannerEl = null;
  let unsubscribePointerLock = null;
  let unsubscribeLocality = null;
  let unsubscribeTourStatus = null;
  let unsubscribeCustomTours = null;
  let isWizardOpen = false;
  let wizardMode = 'stop'; // 'stop' | 'tour'
  let wizardPin = null; // { lat, lon, elev, heading, localityLabel, countryHint }
  let isGlobePickMode = false;
  let wizardPickHandler = null;
  let wizardFeedbackTimer = null;
  const dock = getGlobalDrawerCoordinator();

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

    if (titleEl) {
      titleEl.textContent = isPlayMode
        ? `🏖️ LIVING WORLD PLAY (${ctx.label || 'Local Biome'})`
        : `🛴 CITY SCOOTER TOUR (15 MPH · RANDOMIZED)`;
    }

    if (badgeEl) {
      if (status.state === TOUR_OR_PLAY_STATES.TOUR_TRANSIT) {
        badgeEl.textContent = `SCOOTER ${status.landmarkIndex + 1}/${status.totalLandmarks}`;
      } else if (status.state === TOUR_OR_PLAY_STATES.TOUR_DWELL) {
        badgeEl.textContent = `DWELL ${Math.ceil(status.dwellRemainingSec || 0)}s`;
      } else if (status.state === TOUR_OR_PLAY_STATES.USER_TAKEOVER) {
        badgeEl.textContent = 'WALKING TAKEOVER';
      } else if (status.state === TOUR_OR_PLAY_STATES.PLAY_ACTIVE) {
        badgeEl.textContent = 'PLAYING LIVE';
      } else {
        badgeEl.textContent = isPlayMode ? 'PLAY MODE' : 'TOUR READY';
      }
    }

    if (statusEl) {
      if (
        status.state === TOUR_OR_PLAY_STATES.TOUR_TRANSIT &&
        status.currentLandmark
      ) {
        statusEl.textContent = `🛴 Scootering (15 mph) to Stop #${status.landmarkIndex + 1}: ${status.currentLandmark.icon || '📍'} ${status.currentLandmark.name}`;
      } else if (
        status.state === TOUR_OR_PLAY_STATES.TOUR_DWELL &&
        status.currentLandmark
      ) {
        statusEl.textContent = `🏛️ ${status.currentLandmark.name} (${Math.ceil(status.dwellRemainingSec || 0)}s autonomous walk) — "${status.currentLandmark.lore}"`;
      } else if (status.state === TOUR_OR_PLAY_STATES.USER_TAKEOVER) {
        statusEl.textContent = `🚶 Normal Walking Take-Over (1.2 m/s). Explore freely with WASD, then click Continue Tour when ready!`;
      } else if (
        status.state === TOUR_OR_PLAY_STATES.PLAY_ACTIVE &&
        status.activePlayActivity
      ) {
        statusEl.textContent = `${status.activePlayActivity.icon} ${status.activePlayActivity.label}: "${status.activePlayActivity.lore}"`;
      } else if (isPlayMode) {
        statusEl.textContent = `Non-metro / tourist environment detected (${ctx.typologyName || ctx.label}). Pick an environment hike or leisure activity:`;
      } else {
        statusEl.textContent = `Randomized landmark order every run · 15 mph electric scooter transit · 20s autonomous walking dwell + lore bubble at each stop.`;
      }
    }

    if (tourControlsEl) {
      tourControlsEl.style.display = isPlayMode ? 'none' : 'flex';
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

    const noTourCtaEl = cardEl.querySelector('.gev-tour-no-tour-cta');
    if (noTourCtaEl) {
      noTourCtaEl.style.display = isPlayMode ? 'flex' : 'none';
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
        !reg.customTours?.[k] &&
        Array.isArray(reg.extraStopsByCityId[k]) &&
        reg.extraStopsByCityId[k].length > 0,
    );
    if (
      dynamicCityId &&
      dynamicCityId !== 'auto' &&
      !METRO_LANDMARK_CATALOG[dynamicCityId] &&
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

    const builtInEntries = Object.entries(METRO_LANDMARK_CATALOG)
      .map(([cityKey, stops]) => {
        const extraCount = (reg.extraStopsByCityId?.[cityKey] || []).length;
        const total = stops.length + extraCount;
        const label =
          METRO_TOUR_METADATA[cityKey]?.name ||
          cityKey
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        const continent = METRO_TOUR_METADATA[cityKey]?.continent;
        const continentTag = continent ? ` [${continent}]` : '';
        const customTag = extraCount > 0 ? ` · +${extraCount} custom` : '';
        return `<option value="${escapeHtml(cityKey)}">🛴 ${escapeHtml(label)}${escapeHtml(continentTag)} (${total} stops${escapeHtml(customTag)})</option>`;
      })
      .join('');

    const autoOpt = includeAuto
      ? '<option value="auto">📍 Nearest Metro / Current View</option>'
      : '';
    return `${autoOpt}${customEntries}${dynamicEntries}${builtInEntries}`;
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
        <div class="gev-play-activities-grid gev-play-controls" style="display: none;"></div>
        <div class="gev-tour-no-tour-cta">
          <span class="gev-tour-no-tour-cta-text">No tour here yet — know this spot personally?</span>
          <button class="gev-tour-wizard-new-tour-btn" title="Guided Wizard to create a local tour & stop here">✨ + Create Tour Here</button>
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
        <div class="gev-tour-play-row gev-tour-active-actions" style="display: none;">
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
        tourAndPlayEngine.startCityTour({
          cityId: ctx?.cityId || null,
          lat: g.lat,
          lon: g.lon,
          elev: g.elev || 0,
          cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
        });
      } else {
        tourAndPlayEngine.startCityTour({
          cityId: selVal,
          cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
        });
      }
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
      if (kind === 'locale') {
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
      syncTourCitySelectOptions();
      if (isOpen) {
        syncDrawerState();
      }
    });

    if (wanderEngine?.onTelemetry) {
      wanderEngine.onTelemetry((telem) => {
        if (isOpen || launcherBtn) {
          syncDrawerState(telem);
        }
      });
    }

    if (tourAndPlayEngine?.onStatusChange) {
      unsubscribeTourStatus = tourAndPlayEngine.onStatusChange(() => {
        if (isOpen || launcherBtn) {
          syncDrawerState();
        }
      });
    }

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
      elements: [pointerLockBannerEl],
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
    launcherBtn?.remove();
    drawerEl?.remove();
    pointerLockBannerEl?.remove();
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
