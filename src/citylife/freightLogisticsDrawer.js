/**
 * Dedicated Freight & Intermodal Logistics UI Drawer for God's Eye View.
 * (Transcontinental Freight & Intermodal Logistics Sim)
 *
 * Implements:
 * - Floating HUD trigger button at `bottom: 74px; right: 232px` (accent #f97316)
 * - Single-active-flyout mutual exclusion via worldSimDock.js
 * - Keyboard hotkey navigation: 'F' toggles drawer
 * - Dual Engagement Modes:
 *   Mode A: Active Operations Dispatcher & Supply Chain Planner
 *   Mode B: Ambient Spectator & Convoy Tracker
 * - 5-Mode Camera Suite selection (In-Cab, 53ft Trailer Chase, Apron Transload, Heli Patrol, Orbital)
 * - Procedural Web Audio engine toggle (Diesel rumble, Air brakes, CB Radio)
 * - URL Deeplink parameter parsing: ?freight=true, ?corridor=..., ?truck=..., ?mode=..., ?camera=...
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import {
  getAllFreightCorridors,
  getAllFreightHubs,
  getAllCargoManifests,
} from '../layers/freight/freightCorridors.js';
import {
  TRANSLOAD_STATES,
  TRANSLOAD_STATE_BADGES,
} from '../layers/freight/freightSimEngine.js';
import {
  FREIGHT_CAMERA_MODES,
  FREIGHT_CAMERA_BADGES,
} from '../layers/freight/freightCameraSuite.js';

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

  let isOpen = false;
  let activeTab = 'spectator'; // 'spectator' | 'dispatcher'
  let refreshTimer = null;

  // Root Drawer Container
  const drawer = document.createElement('div');
  drawer.className = 'gev-freight-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 380px;
    max-height: min(560px, calc(100vh - 160px));
    max-width: calc(100vw - 32px);
    overflow-y: auto;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(249, 115, 22, 0.45);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(249, 115, 22, 0.25);
    z-index: 10002;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: none;
    flex-direction: column;
    padding: 14px;
    gap: 10px;
    box-sizing: border-box;
    opacity: 0;
    transform: translateY(16px);
    pointer-events: auto;
    transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(249, 115, 22, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🚛</span>
        <span style="font-weight: 700; font-size: 13px; color: #fb923c; letter-spacing: 0.5px; text-transform: uppercase;">
          Transcontinental Freight & Logistics
        </span>
      </div>
      <button class="gev-freight-close-btn" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 15px; padding: 2px 6px;">✕</button>
    </div>

    <!-- Active Latched Truck Telemetry & Manifest Card -->
    <div class="gev-freight-active-contact-card" style="background: rgba(22, 27, 34, 0.95); border: 1px solid rgba(249, 115, 22, 0.5); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span>
          <span class="gev-manifest-carrier" style="font-size: 11px; font-weight: 700; color: #fdba74;">FedEx Custom Critical (TRK-504)</span>
        </div>
        <span class="gev-manifest-priority" style="font-size: 8px; font-weight: 700; background: rgba(239, 68, 68, 0.25); color: #fca5a5; padding: 2px 5px; border-radius: 3px;">CRITICAL EXPEDITE</span>
      </div>
      <div class="gev-active-route" style="font-size: 9px; color: #38bdf8; font-weight: 600;">
        Memphis SuperHub (KMEM) ➔ Atlanta Inman Yard · I-40 / I-24 / I-75
      </div>
      <div class="gev-manifest-desc" style="font-size: 10px; color: #e2e8f0; line-height: 1.35;">
        FedEx Air Cargo — Critical Oncology Pharmaceuticals & Biologics
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 9px; color: #cbd5e1; background: #0d1117; padding: 6px; border-radius: 4px; margin-top: 2px;">
        <div>Weight: <strong class="gev-manifest-weight" style="color: #f1f5f9;">38,450 lbs</strong></div>
        <div>Value: <strong class="gev-manifest-val" style="color: #4ade80;">$1,450,000</strong></div>
        <div>Temp: <strong class="gev-manifest-temp" style="color: #67e8f9;">36°F</strong></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #30363d; padding-top: 5px;">
        <span class="gev-active-state-badge" style="color: #f97316; font-weight: 600;">🛣️ Interstate Highway Cruising</span>
        <span class="gev-active-telemetry" style="color: #38bdf8; font-weight: 600;">68 mph · 28% (279 mi left)</span>
      </div>
    </div>

    <!-- Mode Selector Tabs -->
    <div style="display: flex; gap: 6px; background: rgba(22, 27, 34, 0.8); padding: 3px; border-radius: 6px; border: 1px solid #30363d;">
      <button class="gev-freight-tab-btn" data-tab="spectator" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600; background: #ea580c; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;">
        👁️ Convoy Fleet Roster
      </button>
      <button class="gev-freight-tab-btn" data-tab="dispatcher" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600; background: transparent; color: #8b949e; border: none; border-radius: 4px; cursor: pointer;">
        📋 Dispatcher Radio & Actions
      </button>
    </div>

    <!-- Spectator Mode View -->
    <div class="gev-freight-spectator-panel" style="display: flex; flex-direction: column; gap: 8px;">
      <div style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">
        Active Interstate 18-Wheelers & Cargo Freighters
      </div>
      <div class="gev-freight-fleet-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
        <!-- Dynamically injected trucks -->
      </div>

      <!-- Camera Perspectives Bar -->
      <div style="background: rgba(22, 27, 34, 0.9); border: 1px solid #30363d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
        <div style="font-size: 9px; color: #fb923c; font-weight: 600; text-transform: uppercase;">
          Operational Camera Perspectives
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
          <button class="gev-freight-cam-btn" data-cam="IN_CAB" style="background: #21262d; border: 1px solid #30363d; color: #e6edf3; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">💺 In-Cab</button>
          <button class="gev-freight-cam-btn" data-cam="SEMI_CHASE" style="background: rgba(234, 88, 12, 0.3); border: 1px solid #ea580c; color: #fdba74; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">🚛 Chase</button>
          <button class="gev-freight-cam-btn" data-cam="APRON_TRANSLOAD" style="background: #21262d; border: 1px solid #30363d; color: #e6edf3; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">🏗️ Apron</button>
          <button class="gev-freight-cam-btn" data-cam="HELI_PATROL" style="background: #21262d; border: 1px solid #30363d; color: #e6edf3; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">🚁 Heli</button>
          <button class="gev-freight-cam-btn" data-cam="MACRO_ORBITAL" style="background: #21262d; border: 1px solid #30363d; color: #e6edf3; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">🛰️ Orbital</button>
          <button class="gev-freight-sound-btn" style="background: #21262d; border: 1px solid #30363d; color: #94a3b8; font-size: 9px; padding: 4px; border-radius: 4px; cursor: pointer;">🔇 Audio</button>
        </div>
      </div>
    </div>

    <!-- Dispatcher Mode View -->
    <div class="gev-freight-dispatcher-panel" style="display: none; flex-direction: column; gap: 8px;">
      <div style="background: rgba(22, 27, 34, 0.9); border: 1px solid #30363d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
        <div style="font-size: 9px; color: #fb923c; font-weight: 700; text-transform: uppercase;">
          Base Dispatch · Radio Channel 19
        </div>
        <div class="gev-freight-dispatcher-quote" style="font-size: 10px; color: #cbd5e1; font-style: italic; line-height: 1.35;">
          "Memphis ramp dispatch, FedEx Flight 112 just touched down on 36L. We've got semi #504 at Dock 14 ready to load the Nashville-Atlanta freight and roll out the gate in 35 minutes!"
        </div>
      </div>

      <!-- Active Manifest Card -->
      <div class="gev-freight-manifest-card" style="background: #161b22; border: 1px solid rgba(249, 115, 22, 0.35); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="gev-manifest-carrier" style="font-size: 10px; font-weight: 700; color: #fdba74;">FedEx Custom Critical</span>
          <span class="gev-manifest-priority" style="font-size: 8px; font-weight: 700; background: rgba(239, 68, 68, 0.25); color: #fca5a5; padding: 1px 4px; border-radius: 3px;">CRITICAL EXPEDITE</span>
        </div>
        <div class="gev-manifest-desc" style="font-size: 9px; color: #94a3b8;">Critical Oncology Pharmaceuticals & Biologics</div>
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: #cbd5e1; margin-top: 2px;">
          <span>Weight: <strong class="gev-manifest-weight">38,450 lbs</strong></span>
          <span>Value: <strong class="gev-manifest-val" style="color: #4ade80;">$1,450,000</strong></span>
          <span>Temp: <strong class="gev-manifest-temp">36°F</strong></span>
        </div>
      </div>

      <!-- Dispatch Action Triggers -->
      <div style="display: flex; gap: 6px;">
        <button class="gev-freight-action-fast-transload" style="flex: 1; background: #21262d; border: 1px solid #ea580c; color: #fed7aa; font-size: 9px; font-weight: 600; padding: 6px 4px; border-radius: 4px; cursor: pointer;">
          ⚡ Fast Transload ("Off We Go!")
        </button>
        <button class="gev-freight-action-weather-detour" style="flex: 1; background: #21262d; border: 1px solid #38bdf8; color: #bae6fd; font-size: 9px; font-weight: 600; padding: 6px 4px; border-radius: 4px; cursor: pointer;">
          ⛈️ Weather Detour
        </button>
      </div>
    </div>
  `;

  if (typeof document !== 'undefined') {
    document.body.appendChild(drawer);
  }

  // Floating HUD Trigger Button
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-freight-launcher-button';
  launcherButton.title = 'Transcontinental Freight & Logistics [F]';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 388px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.92);
    border: 1px solid rgba(249, 115, 22, 0.65);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10001;
    pointer-events: auto;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
  `;
  launcherButton.innerHTML = `<span style="font-size: 20px; line-height: 1;">🚛</span>`;

  if (typeof document !== 'undefined') {
    document.body.appendChild(launcherButton);
  }

  const dock = getGlobalDrawerCoordinator();

  function open() {
    dock.notifyDrawerOpened('freight');
    isOpen = true;
    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
    drawer.style.zIndex = '10002';
    drawer.style.pointerEvents = 'auto';
    launcherButton.style.transform = 'scale(1.08)';
    launcherButton.style.borderColor = '#ea580c';
    launcherButton.style.boxShadow = '0 0 16px rgba(249, 115, 22, 0.7)';

    if (freightEngine && typeof freightEngine.start === 'function') {
      freightEngine.start();
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        drawer.style.opacity = '1';
        drawer.style.transform = 'translateY(0)';
      });
    } else {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    }

    updateUI();
    if (!refreshTimer) {
      refreshTimer = setInterval(updateUI, 1200);
    }
  }

  function close() {
    isOpen = false;
    drawer.classList.add('hidden');
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    drawer.style.display = 'none';
    launcherButton.style.transform = 'scale(1.0)';
    launcherButton.style.borderColor = 'rgba(249, 115, 22, 0.55)';
    launcherButton.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.6)';

    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    dock.notifyDrawerClosed('freight');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // Register in dock coordinator
  dock.registerDrawer('freight', {
    open,
    close,
    isOpen: () => isOpen,
    button: launcherButton,
    accentColor: '#f97316',
  });

  launcherButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  const closeBtn = drawer.querySelector('.gev-freight-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  }

  // Tab switching
  const tabBtns = drawer.querySelectorAll('.gev-freight-tab-btn');
  const spectatorPanel = drawer.querySelector('.gev-freight-spectator-panel');
  const dispatcherPanel = drawer.querySelector('.gev-freight-dispatcher-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = btn.getAttribute('data-tab');
      activeTab = tab;

      tabBtns.forEach((b) => {
        const isSelected = b.getAttribute('data-tab') === tab;
        b.style.background = isSelected ? '#ea580c' : 'transparent';
        b.style.color = isSelected ? '#ffffff' : '#8b949e';
      });

      if (tab === 'spectator') {
        spectatorPanel.style.display = 'flex';
        dispatcherPanel.style.display = 'none';
      } else {
        spectatorPanel.style.display = 'none';
        dispatcherPanel.style.display = 'flex';
      }
      updateUI();
    });
  });

  // Camera buttons
  const camBtns = drawer.querySelectorAll('.gev-freight-cam-btn');
  camBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.getAttribute('data-cam');
      if (freightEngine && typeof freightEngine.setCameraMode === 'function') {
        freightEngine.setCameraMode(mode);
      }
      camBtns.forEach((b) => {
        const isSel = b.getAttribute('data-cam') === mode;
        b.style.background = isSel ? 'rgba(234, 88, 12, 0.3)' : '#21262d';
        b.style.borderColor = isSel ? '#ea580c' : '#30363d';
        b.style.color = isSel ? '#fdba74' : '#e6edf3';
      });
    });
  });

  // Audio button
  const soundBtn = drawer.querySelector('.gev-freight-sound-btn');
  if (soundBtn) {
    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const audio = freightEngine?.getAudioEngine?.();
      if (audio) {
        const unmuted = audio.toggleMute();
        soundBtn.textContent = unmuted ? '🔊 Audio' : '🔇 Audio';
        soundBtn.style.color = unmuted ? '#4ade80' : '#94a3b8';
        soundBtn.style.borderColor = unmuted ? '#22c55e' : '#30363d';
      }
    });
  }

  // Fast Transload Action Button
  const fastTransloadBtn = drawer.querySelector(
    '.gev-freight-action-fast-transload',
  );
  if (fastTransloadBtn) {
    fastTransloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      freightEngine?.fastForwardTransload?.();
      updateUI();
    });
  }

  // Weather Detour Action Button
  const weatherDetourBtn = drawer.querySelector(
    '.gev-freight-action-weather-detour',
  );
  if (weatherDetourBtn) {
    weatherDetourBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      freightEngine?.rerouteWeatherDetour?.();
      updateUI();
    });
  }

  const truckRowsById = new Map();

  function applyRowSelectionStyle(rowRefs, isSelected) {
    if (!rowRefs?.row) return;
    rowRefs.row.style.background = isSelected
      ? 'rgba(234, 88, 12, 0.18)'
      : '#161b22';
    rowRefs.row.style.borderColor = isSelected ? '#ea580c' : '#30363d';
    rowRefs.row.classList?.toggle?.('selected', isSelected);
    if (rowRefs.titleEl) {
      rowRefs.titleEl.style.color = isSelected ? '#fb923c' : '#e2e8f0';
    }
  }

  function createTruckRow(trk) {
    const row = document.createElement('div');
    row.className = 'gev-freight-truck-row';
    row.setAttribute('data-truck-id', trk.id);
    row.style.cssText = `
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      cursor: pointer;
    `;
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="gev-freight-truck-title" style="font-weight: 700; font-size: 10px; color: #e2e8f0;"></span>
        <span class="gev-freight-truck-speed" style="font-size: 9px; font-weight: 600; color: #38bdf8;"></span>
      </div>
      <div class="gev-freight-truck-corridor" style="font-size: 9px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #cbd5e1; margin-top: 1px;">
        <span class="gev-freight-truck-badge"></span>
        <span class="gev-freight-truck-miles"></span>
      </div>
    `;
    return {
      row,
      titleEl: row.querySelector('.gev-freight-truck-title'),
      speedEl: row.querySelector('.gev-freight-truck-speed'),
      corridorEl: row.querySelector('.gev-freight-truck-corridor'),
      badgeEl: row.querySelector('.gev-freight-truck-badge'),
      milesEl: row.querySelector('.gev-freight-truck-miles'),
    };
  }

  function bindFleetListDelegation(fleetList) {
    if (!fleetList || fleetList._gevDelegatedBound) return;
    fleetList._gevDelegatedBound = true;
    fleetList.addEventListener('click', (e) => {
      const row = e.target?.closest?.('.gev-freight-truck-row');
      if (!row || !fleetList.contains(row)) return;
      e.stopPropagation();
      const trkId = row.getAttribute('data-truck-id');
      if (!trkId) return;
      for (const [id, refs] of truckRowsById.entries()) {
        applyRowSelectionStyle(refs, id === trkId);
      }
      freightEngine?.selectTruck?.(trkId);
      updateUI();
    });
  }

  function updateUI() {
    if (!freightEngine) return;
    const trucks = freightEngine.getAllTrucks?.() || [];
    const latched = freightEngine.getLatchedTruck?.() || trucks[0] || null;
    const fleetList = drawer.querySelector('.gev-freight-fleet-list');

    if (fleetList) {
      bindFleetListDelegation(fleetList);
      const seenIds = new Set();

      for (const trk of trucks) {
        seenIds.add(trk.id);
        let refs = truckRowsById.get(trk.id);
        if (!refs) {
          refs = createTruckRow(trk);
          truckRowsById.set(trk.id, refs);
        }
        if (refs.row.parentNode !== fleetList) {
          fleetList.appendChild(refs.row);
        }

        const isSelected = Boolean(latched && latched.id === trk.id);
        const badge =
          TRANSLOAD_STATE_BADGES[trk.transloadState] || trk.transloadState;
        const pct = Math.round((trk.progress || 0) * 100);
        const titleText = `${trk.id} · ${trk.manifest?.carrierLivery || ''}`;
        const speedText = `${Math.round(trk.speedMph || 0)} mph · ${pct}%`;
        const corridorText = trk.corridor?.name || '';
        const milesText = `${Math.round(trk.milesRemaining || 0)} mi left`;

        if (refs.titleEl && refs.titleEl.textContent !== titleText) {
          refs.titleEl.textContent = titleText;
        }
        if (refs.speedEl && refs.speedEl.textContent !== speedText) {
          refs.speedEl.textContent = speedText;
        }
        if (refs.corridorEl && refs.corridorEl.textContent !== corridorText) {
          refs.corridorEl.textContent = corridorText;
        }
        if (refs.badgeEl && refs.badgeEl.textContent !== badge) {
          refs.badgeEl.textContent = badge;
        }
        if (refs.milesEl && refs.milesEl.textContent !== milesText) {
          refs.milesEl.textContent = milesText;
        }
        applyRowSelectionStyle(refs, isSelected);
      }

      for (const [id, refs] of truckRowsById.entries()) {
        if (!seenIds.has(id)) {
          refs.row.remove?.();
          truckRowsById.delete(id);
        }
      }
    }

    // Update Active Contact & Manifest Telemetry Card
    if (latched && latched.manifest) {
      const m = latched.manifest;
      const carrierEl = drawer.querySelector('.gev-manifest-carrier');
      const priorityEl = drawer.querySelector('.gev-manifest-priority');
      const descEl = drawer.querySelector('.gev-manifest-desc');
      const weightEl = drawer.querySelector('.gev-manifest-weight');
      const valEl = drawer.querySelector('.gev-manifest-val');
      const tempEl = drawer.querySelector('.gev-manifest-temp');
      const routeEl = drawer.querySelector('.gev-active-route');
      const stateBadgeEl = drawer.querySelector('.gev-active-state-badge');
      const telemetryEl = drawer.querySelector('.gev-active-telemetry');

      if (carrierEl)
        carrierEl.textContent = `${m.carrierLivery} (${latched.id})`;
      if (priorityEl) priorityEl.textContent = m.priority;
      if (descEl) descEl.textContent = m.description;
      if (weightEl)
        weightEl.textContent = `${m.grossWeightLbs.toLocaleString()} lbs`;
      if (valEl) valEl.textContent = `$${m.cargoValueUsd.toLocaleString()}`;
      if (tempEl)
        tempEl.textContent =
          m.reeferTempF !== null ? `${m.reeferTempF}°F` : 'Dry Van Ambient';

      if (routeEl && latched.corridor) {
        routeEl.textContent = `${latched.corridor.name} · ${latched.corridor.highways}`;
      }
      if (stateBadgeEl) {
        stateBadgeEl.textContent =
          TRANSLOAD_STATE_BADGES[latched.transloadState] ||
          latched.transloadState;
      }
      if (telemetryEl) {
        const pct = Math.round((latched.progress || 0) * 100);
        const mi = Math.round(latched.milesRemaining || 0);
        const mph = Math.round(latched.speedMph || 0);
        telemetryEl.textContent = `${mph} mph · ${pct}% (${mi} mi left)`;
      }
    }
  }

  // Keyboard navigation listener ('F' or 'L' toggles drawer with capture phase precedence)
  function onKeyDown(e) {
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
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      toggle();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown, true);
  }

  // URL Parameter Handling
  if (typeof window !== 'undefined' && window.location) {
    try {
      const url = new URL(window.location.href);
      const isFreight = url.searchParams.get('freight');
      const corridorParam = url.searchParams.get('corridor');
      const truckParam = url.searchParams.get('truck');
      const modeParam = url.searchParams.get('mode');
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
      if (modeParam === 'dispatcher') {
        const dispBtn = drawer.querySelector('[data-tab="dispatcher"]');
        if (dispBtn) dispBtn.click();
      }
      if (cameraParam && freightEngine?.setCameraMode) {
        const normCam = cameraParam.toUpperCase();
        if (FREIGHT_CAMERA_MODES[normCam]) {
          freightEngine.setCameraMode(normCam);
        }
      }
    } catch {}
  }

  return {
    open,
    close,
    toggle,
    updateUI,
    isOpen: () => isOpen,
    destroy: () => {
      close();
      dock.unregisterDrawer('freight');
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown, true);
      }
      if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
      if (launcherButton.parentNode)
        launcherButton.parentNode.removeChild(launcherButton);
    },
  };
}
