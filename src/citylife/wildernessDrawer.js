/**
 * Wilderness Ranger & Trailhead Explorer UI Drawer.
 * (National Parks, Topo Hiking, Backcountry Campsites & Wildlife Tracking on GEV)
 *
 * Implements:
 * - Floating HUD launcher button at `bottom: 74px; right: 492px` (accent #10b981)
 * - Single-active-flyout mutual exclusion via worldSimDock.js
 * - Keyboard hotkey navigation: 'N' toggles drawer
 * - 3 Tabbed Panels:
 *   1. [ 🌲 Trailheads & Parks ]: National park catalog, biome filters, elevation stats, 1-click fly-to
 *   2. [ 🥾 Hike Controller ]: Live cadence, Tobler slope speed, camera modes (First-person, Chase, Drone), Companion Tandem
 *   3. [ ⛺ Bivouac & Stargazing ]: Procedural campfire audio, celestial stargazing mode, active wildlife radar
 * - URL Deeplink routing: ?wilderness=true, ?trailhead=..., ?hike=true, ?camp=true
 */

import * as Cesium from 'cesium';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { trySampleSurfaceHeight } from '../layers/citylife/surfaceHeight.js';
import {
  getAllTrailheads,
  getTrailheadById,
  filterTrailheads,
  findNearbyTrailhead,
  BIOME_META,
  TRAIL_DIFFICULTIES,
} from '../layers/wilderness/trailheadCatalog.js';
import {
  createTrailNavigator,
  HIKE_PACES,
  TRAIL_CAMERA_MODES,
} from '../layers/wilderness/trailPathfinder.js';
import {
  spawnFaunaForTrailhead,
  updateFaunaFlock,
  WILDLIFE_SPECIES,
} from '../layers/wilderness/faunaEngine.js';
import { createProceduralCampfireAudio } from '../layers/wilderness/proceduralCampfireAudio.js';

export function createWildernessDrawer({
  viewer = null,
  container = null,
  audioEngine = null,
} = {}) {
  if (typeof document === 'undefined') {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      destroy: () => {},
      selectTrailhead: () => {},
    };
  }

  let isOpen = false;
  let activeTab = 'trailheads'; // 'trailheads' | 'controller' | 'bivouac'
  let activeTrailhead = getAllTrailheads()[0]; // Default Yosemite Half Dome
  let navigator = null;
  let activeFauna = [];
  let refreshTimer = null;

  const audio = audioEngine || createProceduralCampfireAudio();

  // Root Drawer Container
  const drawer = document.createElement('div');
  drawer.className = 'gev-wilderness-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 390px;
    max-height: min(580px, calc(100vh - 160px));
    max-width: calc(100vw - 32px);
    overflow-y: auto;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(16, 185, 129, 0.45);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(16, 185, 129, 0.25);
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
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(16, 185, 129, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🌲</span>
        <span style="font-weight: 700; font-size: 13px; color: #34d399; letter-spacing: 0.5px; text-transform: uppercase;">
          Wilderness Ranger & Trailheads
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="gev-wilderness-audio-btn" title="Ambient Sound" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">🔊 Sound</button>
        <button class="gev-wilderness-close-btn" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 15px; padding: 2px 6px;">✕</button>
      </div>
    </div>

    <!-- Active Trailhead Summary Card -->
    <div class="gev-wilderness-active-card" style="background: rgba(22, 27, 34, 0.95); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
          <span class="gev-active-biome-icon" style="font-size: 14px;">🏔️</span>
          <span class="gev-active-trail-title" style="font-size: 12px; font-weight: 700; color: #34d399; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">Half Dome & Mist Trail</span>
        </div>
        <span class="gev-active-diff-badge" style="font-size: 8px; font-weight: 700; background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 5px; border-radius: 3px; white-space: nowrap;">T3 ALPINE</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #8b949e;">
        <span class="gev-active-trail-park">Yosemite National Park, CA</span>
        <span class="gev-active-trail-stats" style="color: #6ee7b7; font-weight: 600;">22.8 km · +1474m gain</span>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div style="display: flex; gap: 4px; border-bottom: 1px solid #30363d; padding-bottom: 4px;">
      <button class="gev-wilderness-tab-btn active" data-tab="trailheads" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; border-radius: 4px; cursor: pointer;">
        🌲 Trailheads
      </button>
      <button class="gev-wilderness-tab-btn" data-tab="controller" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
        🥾 Hike Pace
      </button>
      <button class="gev-wilderness-tab-btn" data-tab="bivouac" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
        ⛺ Bivouac
      </button>
    </div>

    <!-- TAB 1: Trailheads & Parks -->
    <div class="gev-wilderness-tab-content gev-wilderness-content-trailheads" style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; gap: 6px;">
        <input type="text" class="gev-trail-search-input" placeholder="Search parks or trails..." style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #e6edf3; font-size: 10px; padding: 4px 8px; outline: none;" />
        <select class="gev-trail-diff-filter" style="background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #e6edf3; font-size: 10px; padding: 4px; outline: none;">
          <option value="">All Levels</option>
          <option value="HIKING">T1 Hiking</option>
          <option value="MOUNTAIN_HIKING">T2 Mountain</option>
          <option value="ALPINE_HIKING">T3 Alpine</option>
        </select>
      </div>
      <div class="gev-trail-roster-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto;">
        <!-- Injected via JavaScript -->
      </div>
    </div>

    <!-- TAB 2: Hike Controller -->
    <div class="gev-wilderness-tab-content gev-wilderness-content-controller" style="display: none; flex-direction: column; gap: 8px;">
      <!-- Real-Time Cadence Readout -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; background: rgba(22, 27, 34, 0.7); border: 1px solid #30363d; border-radius: 6px; padding: 8px;">
        <div style="display: flex; flex-direction: column; align-items: center;">
          <span style="font-size: 8px; color: #8b949e; text-transform: uppercase;">Speed</span>
          <span class="gev-hike-speed" style="font-size: 14px; font-weight: 700; color: #34d399;">3.1 mph</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center;">
          <span style="font-size: 8px; color: #8b949e; text-transform: uppercase;">Incline Slope</span>
          <span class="gev-hike-slope" style="font-size: 14px; font-weight: 700; color: #f59e0b;">+8.4°</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center;">
          <span style="font-size: 8px; color: #8b949e; text-transform: uppercase;">Progress</span>
          <span class="gev-hike-progress" style="font-size: 14px; font-weight: 700; color: #38bdf8;">0%</span>
        </div>
      </div>

      <!-- Pace Selector Grid -->
      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Locomotion Pace</span>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <button class="gev-pace-btn" data-pace="CASUAL" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          🚶 Casual (2.2 mph)
        </button>
        <button class="gev-pace-btn active" data-pace="BRISK" style="padding: 6px; font-size: 9px; font-weight: 600; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; border-radius: 4px; cursor: pointer;">
          🥾 Brisk (3.1 mph)
        </button>
        <button class="gev-pace-btn" data-pace="TRAIL_RUN" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          🏃 Run (5.8 mph)
        </button>
      </div>

      <!-- Camera Perspectives -->
      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Trail Perspective</span>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <button class="gev-cam-btn" data-cam="FIRST_PERSON" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
          👁️ Eye Level
        </button>
        <button class="gev-cam-btn active" data-cam="HIKER_CHASE" style="padding: 6px; font-size: 9px; font-weight: 600; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; border-radius: 4px; cursor: pointer;">
          🏃 Chase Cam
        </button>
        <button class="gev-cam-btn" data-cam="DRONE_VISTA" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
          🚁 Drone Vista
        </button>
      </div>

      <!-- Companion Mode Matrix -->
      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Companion Matrix</span>
      <div style="display: flex; gap: 6px;">
        <button class="gev-trail-companion-btn" data-companion="SOLO_FOCUS" style="flex: 1; padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
          🧘 Solitary Trek
        </button>
        <button class="gev-trail-companion-btn active" data-companion="COMPANION_TANDEM" style="flex: 1; padding: 6px; font-size: 9px; font-weight: 600; background: #059669; border: 1px solid #10b981; color: #ffffff; border-radius: 4px; cursor: pointer;">
          👯 Tandem Companion
        </button>
      </div>

      <!-- Hike Action Buttons -->
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button class="gev-hike-toggle-btn" style="flex: 2; padding: 8px; font-size: 11px; font-weight: 700; background: #059669; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;">
          ▶ Embark on Trail
        </button>
        <button class="gev-hike-reset-btn" style="flex: 1; padding: 8px; font-size: 11px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 6px; cursor: pointer;">
          ↺ Reset
        </button>
      </div>
    </div>

    <!-- TAB 3: Bivouac & Stargazing -->
    <div class="gev-wilderness-tab-content gev-wilderness-content-bivouac" style="display: none; flex-direction: column; gap: 8px;">
      <span style="font-size: 9px; font-weight: 700; color: #34d399; text-transform: uppercase;">
        Evening Bivouac & Stargazing
      </span>
      <div style="background: rgba(22, 27, 34, 0.7); border: 1px solid #30363d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; font-weight: 600;">🔥 Evening Campfire</span>
          <button class="gev-campfire-toggle-btn" style="padding: 4px 10px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
            Ignite Campfire
          </button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; font-weight: 600;">✨ Celestial Stargazing Mode</span>
          <button class="gev-stargazing-toggle-btn" style="padding: 4px 10px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
            Gaze Skyward
          </button>
        </div>
      </div>

      <!-- Wildlife Radar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">
          Wildlife Fauna Radar (2.5 km)
        </span>
        <span class="gev-fauna-count" style="font-size: 9px; color: #f59e0b; font-weight: 600;">0 Animals Detected</span>
      </div>
      <div class="gev-fauna-radar-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto;">
        <!-- Injected via JavaScript -->
      </div>
    </div>
  `;

  // Floating HUD Trigger Launcher Button at `bottom: 74px; right: 492px` (accent #10b981)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-wilderness-launcher-btn';
  launcherButton.title = 'Wilderness Ranger & Trailheads (N)';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 492px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.92);
    border: 1px solid rgba(16, 185, 129, 0.65);
    color: #34d399;
    font-size: 18px;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(16, 185, 129, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, border-color 0.2s;
  `;
  launcherButton.innerHTML = '🌲';

  const mountContainer =
    container || (typeof document !== 'undefined' ? document.body : null);
  if (mountContainer) {
    mountContainer.appendChild(launcherButton);
    mountContainer.appendChild(drawer);
  }

  // Register with Global Coordinator for single-active-flyout mutual exclusion
  const coordinator = getGlobalDrawerCoordinator();
  coordinator.registerDrawer('wilderness', {
    open: () => openDrawer(),
    close: () => closeDrawer(),
    isOpen: () => isOpen,
    launcherEl: launcherButton,
    accentColor: '#10b981',
  });

  const trailheadRowsById = new Map();
  const faunaRowsByKey = new Map();

  function applyTrailheadRowStyle(el, isActive) {
    if (!el) return;
    el.style.background = isActive
      ? 'rgba(16, 185, 129, 0.15)'
      : 'rgba(22, 27, 34, 0.6)';
    el.style.borderColor = isActive ? '#10b981' : '#30363d';
    el.classList?.toggle?.('active', isActive);
    const titleEl = el.querySelector('.gev-trailhead-name');
    if (titleEl) {
      titleEl.style.color = isActive ? '#34d399' : '#e6edf3';
    }
  }

  function bindTrailRosterDelegation(listEl) {
    if (!listEl || listEl._gevDelegatedBound) return;
    listEl._gevDelegatedBound = true;
    listEl.addEventListener('click', (e) => {
      const item = e.target?.closest?.('.gev-trailhead-item');
      if (!item || !listEl.contains(item)) return;
      const id = item.dataset?.id || item.getAttribute?.('data-id');
      if (!id) return;
      for (const [rowId, el] of trailheadRowsById.entries()) {
        applyTrailheadRowStyle(el, rowId === id);
      }
      selectTrailhead(id);
    });
  }

  function createTrailheadRow(th) {
    const biome = BIOME_META[th.biome] || { icon: '🌲', label: th.biome };
    const diff = TRAIL_DIFFICULTIES[th.difficulty] || {
      badge: th.difficulty,
      colorHex: '#10b981',
    };
    const item = document.createElement('div');
    item.className = 'gev-trailhead-item';
    item.setAttribute('data-id', th.id);
    item.style.cssText =
      'display: flex; flex-direction: column; gap: 4px; padding: 8px; background: rgba(22, 27, 34, 0.6); border: 1px solid #30363d; border-radius: 6px; cursor: pointer;';
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>${biome.icon}</span>
          <span class="gev-trailhead-name" style="font-weight: 700; font-size: 11px; color: #e6edf3;">${th.name}</span>
        </div>
        <span style="font-size: 8px; font-weight: 700; color: ${
          diff.colorHex
        }; background: rgba(255, 255, 255, 0.05); padding: 1px 4px; border-radius: 3px;">${
          diff.badge
        }</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #8b949e;">
        <span>${th.park}</span>
        <span style="color: #6ee7b7;">${th.trailLengthKm} km · +${th.elevationGainM}m</span>
      </div>
    `;
    return item;
  }

  function renderTrailheadRoster(filterText = '', diffFilter = '') {
    const listEl = drawer.querySelector('.gev-trail-roster-list');
    if (!listEl) return;
    bindTrailRosterDelegation(listEl);

    const trailheads = filterTrailheads({
      difficulty: diffFilter || null,
      search: filterText || '',
    });

    const visibleIds = new Set();
    for (const th of trailheads) {
      visibleIds.add(th.id);
      let item = trailheadRowsById.get(th.id);
      if (!item) {
        item = createTrailheadRow(th);
        trailheadRowsById.set(th.id, item);
      }
      if (item.parentNode !== listEl) {
        listEl.appendChild(item);
      }
      applyTrailheadRowStyle(item, th.id === activeTrailhead?.id);
    }

    for (const [id, item] of trailheadRowsById.entries()) {
      if (!visibleIds.has(id) && item.parentNode === listEl) {
        item.remove();
      }
    }
  }

  function renderFaunaRadar() {
    const listEl = drawer.querySelector('.gev-fauna-radar-list');
    const countEl = drawer.querySelector('.gev-fauna-count');
    if (!listEl) return;

    if (activeFauna.length === 0) {
      faunaRowsByKey.clear();
      if (!listEl.querySelector('.gev-fauna-empty-state')) {
        listEl.innerHTML = `
          <div class="gev-fauna-empty-state" style="font-size: 10px; color: #8b949e; text-align: center; padding: 8px;">
            No wildlife nearby. Move along the trail to encounter native species.
          </div>
        `;
      }
      if (countEl) countEl.textContent = '0 Animals Detected';
      return;
    }

    const emptyBanner = listEl.querySelector('.gev-fauna-empty-state');
    if (emptyBanner) emptyBanner.remove();

    if (countEl) countEl.textContent = `${activeFauna.length} Animals Detected`;

    const visibleKeys = new Set();
    activeFauna.slice(0, 10).forEach((animal, idx) => {
      const key = animal.id || `${animal.speciesName || 'fauna'}-${idx}`;
      visibleKeys.add(key);
      let refs = faunaRowsByKey.get(key);
      if (!refs) {
        const row = document.createElement('div');
        row.className = 'gev-fauna-radar-item';
        row.style.cssText =
          'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: rgba(22, 27, 34, 0.6); border: 1px solid #30363d; border-radius: 4px; font-size: 10px;';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="gev-fauna-icon"></span>
            <span class="gev-fauna-species" style="font-weight: 600;"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="gev-fauna-dist" style="font-size: 8px; color: #8b949e;"></span>
            <span class="gev-fauna-state" style="font-size: 7px; font-weight: 700; padding: 1px 4px; border-radius: 2px;"></span>
          </div>
        `;
        refs = {
          row,
          iconEl: row.querySelector('.gev-fauna-icon'),
          speciesEl: row.querySelector('.gev-fauna-species'),
          distEl: row.querySelector('.gev-fauna-dist'),
          stateEl: row.querySelector('.gev-fauna-state'),
        };
        faunaRowsByKey.set(key, refs);
      }
      if (refs.row.parentNode !== listEl) {
        listEl.appendChild(refs.row);
      }
      const distStr = animal.distanceToHikerM
        ? `${Math.round(animal.distanceToHikerM)}m away`
        : 'In meadow';
      if (refs.iconEl && refs.iconEl.textContent !== animal.icon) {
        refs.iconEl.textContent = animal.icon;
      }
      if (refs.speciesEl) {
        if (refs.speciesEl.textContent !== animal.speciesName) {
          refs.speciesEl.textContent = animal.speciesName;
        }
        refs.speciesEl.style.color = animal.colorHex;
      }
      if (refs.distEl && refs.distEl.textContent !== distStr) {
        refs.distEl.textContent = distStr;
      }
      if (refs.stateEl) {
        if (refs.stateEl.textContent !== animal.state) {
          refs.stateEl.textContent = animal.state;
        }
        if (animal.state === 'RETREATING') {
          refs.stateEl.style.background = 'rgba(239, 68, 68, 0.2)';
          refs.stateEl.style.color = '#f87171';
        } else if (animal.state === 'ALERT_SENTRY') {
          refs.stateEl.style.background = 'rgba(245, 158, 11, 0.2)';
          refs.stateEl.style.color = '#fde68a';
        } else {
          refs.stateEl.style.background = 'rgba(16, 185, 129, 0.2)';
          refs.stateEl.style.color = '#6ee7b7';
        }
      }
    });

    for (const [key, refs] of faunaRowsByKey.entries()) {
      if (!visibleKeys.has(key)) {
        refs.row.remove?.();
        faunaRowsByKey.delete(key);
      }
    }
  }

  function selectTrailhead(id) {
    const th = getTrailheadById(id);
    if (!th) return;

    activeTrailhead = th;
    activeFauna = spawnFaunaForTrailhead(th);

    // Update active card
    const titleEl = drawer.querySelector('.gev-active-trail-title');
    const parkEl = drawer.querySelector('.gev-active-trail-park');
    const statsEl = drawer.querySelector('.gev-active-trail-stats');
    const iconEl = drawer.querySelector('.gev-active-biome-icon');
    const badgeEl = drawer.querySelector('.gev-active-diff-badge');

    if (titleEl) titleEl.textContent = th.name;
    if (parkEl) parkEl.textContent = `${th.park}, ${th.state}`;
    if (statsEl)
      statsEl.textContent = `${th.trailLengthKm} km · +${th.elevationGainM}m gain`;

    const biome = BIOME_META[th.biome] || { icon: '🌲' };
    if (iconEl) iconEl.textContent = biome.icon;

    const diff = TRAIL_DIFFICULTIES[th.difficulty] || {
      badge: th.difficulty,
      colorHex: '#10b981',
    };
    if (badgeEl) {
      badgeEl.textContent = diff.badge;
      badgeEl.style.color = diff.colorHex;
    }

    // Re-instantiate navigator
    if (navigator) {
      navigator.destroy();
      coordinator.notifySimulationStopped('wilderness');
    }
    navigator = createTrailNavigator({
      trailhead: th,
      onProgress: (pose) => {
        updateProgressUI(pose);
      },
    });

    // Fly camera if viewer available
    if (viewer && viewer.camera) {
      try {
        viewer.camera.cancelFlight?.();
        const cesiumLib = viewer.Cesium || Cesium;
        const carto = cesiumLib.Cartographic?.fromDegrees?.(
          th.coordinates.lon,
          th.coordinates.lat,
        );
        const sampledSurface = carto
          ? trySampleSurfaceHeight(viewer, carto)
          : null;
        const catalogElev = th.coordinates.elevM;
        const isPlausibleSurface =
          Number.isFinite(sampledSurface) &&
          (catalogElev == null ||
            Math.abs(sampledSurface - catalogElev) <= 350);
        const baseElev = isPlausibleSurface
          ? sampledSurface
          : catalogElev || 1200;
        viewer.camera.flyTo({
          destination: cesiumLib?.Cartesian3?.fromDegrees
            ? cesiumLib.Cartesian3.fromDegrees(
                th.coordinates.lon,
                th.coordinates.lat,
                baseElev + 750,
              )
            : null,
          duration: 2.0,
        });
      } catch {}
    }

    renderTrailheadRoster();
    renderFaunaRadar();
  }

  function updateProgressUI(pose) {
    const speedEl = drawer.querySelector('.gev-hike-speed');
    const slopeEl = drawer.querySelector('.gev-hike-slope');
    const progressEl = drawer.querySelector('.gev-hike-progress');

    if (speedEl) speedEl.textContent = `${pose.speedMph} mph`;
    if (slopeEl)
      slopeEl.textContent = `${pose.slopeDeg >= 0 ? '+' : ''}${pose.slopeDeg}°`;
    if (progressEl) progressEl.textContent = `${pose.progressPercent}%`;

    // Update fauna boid behavior
    if (activeFauna.length > 0) {
      activeFauna = updateFaunaFlock(activeFauna, {
        lat: pose.lat,
        lon: pose.lon,
      });
      renderFaunaRadar();
    }
  }

  function openDrawer() {
    if (isOpen) return;
    coordinator.notifyDrawerOpened('wilderness');
    isOpen = true;
    drawer.style.display = 'flex';
    requestAnimationFrame(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    });
    launcherButton.style.borderColor = '#10b981';
    launcherButton.style.boxShadow =
      '0 4px 20px rgba(0, 0, 0, 0.8), 0 0 16px rgba(16, 185, 129, 0.45)';

    if (!navigator && activeTrailhead) {
      selectTrailhead(activeTrailhead.id);
    }
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    setTimeout(() => {
      if (!isOpen) drawer.style.display = 'none';
    }, 250);
    launcherButton.style.borderColor = 'rgba(16, 185, 129, 0.65)';
    launcherButton.style.boxShadow =
      '0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(16, 185, 129, 0.25)';
    coordinator.notifyDrawerClosed('wilderness');
  }

  function toggle() {
    if (isOpen) closeDrawer();
    else openDrawer();
  }

  // Event Listeners
  launcherButton.addEventListener('click', toggle);

  const closeBtn = drawer.querySelector('.gev-wilderness-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  const audioBtn = drawer.querySelector('.gev-wilderness-audio-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      const active = audio.toggleMute();
      audioBtn.textContent = active ? '🔊 Sound' : '🔇 Muted';
      audioBtn.style.color = active ? '#34d399' : '#8b949e';
    });
  }

  // Tab Switching
  drawer.querySelectorAll('.gev-wilderness-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      activeTab = tab;

      drawer.querySelectorAll('.gev-wilderness-tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(16, 185, 129, 0.2)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';

      drawer
        .querySelectorAll('.gev-wilderness-tab-content')
        .forEach((c) => (c.style.display = 'none'));
      const activeContent = drawer.querySelector(
        `.gev-wilderness-content-${tab}`,
      );
      if (activeContent) activeContent.style.display = 'flex';
    });
  });

  // Search and Difficulty Filters
  const searchInput = drawer.querySelector('.gev-trail-search-input');
  const diffFilter = drawer.querySelector('.gev-trail-diff-filter');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderTrailheadRoster(
        searchInput.value,
        diffFilter ? diffFilter.value : '',
      );
    });
  }
  if (diffFilter) {
    diffFilter.addEventListener('change', () => {
      renderTrailheadRoster(
        searchInput ? searchInput.value : '',
        diffFilter.value,
      );
    });
  }

  // Pace Buttons
  drawer.querySelectorAll('.gev-pace-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('.gev-pace-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#e6edf3';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(16, 185, 129, 0.2)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';

      if (navigator) navigator.setPace(btn.dataset.pace);
    });
  });

  // Camera Buttons
  drawer.querySelectorAll('.gev-cam-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('.gev-cam-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(16, 185, 129, 0.2)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';

      if (navigator) navigator.setCameraMode(btn.dataset.cam);
    });
  });

  // Companion Buttons
  drawer.querySelectorAll('.gev-trail-companion-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('.gev-trail-companion-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.classList.add('active');
      btn.style.background = '#059669';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#ffffff';

      if (navigator) navigator.setCompanionMode(btn.dataset.companion);
    });
  });

  // Hike Play/Pause & Reset
  const hikeToggleBtn = drawer.querySelector('.gev-hike-toggle-btn');
  const hikeResetBtn = drawer.querySelector('.gev-hike-reset-btn');
  if (hikeToggleBtn) {
    hikeToggleBtn.addEventListener('click', () => {
      if (!navigator) return;
      if (navigator.isNavigating()) {
        navigator.pause();
        coordinator.notifySimulationStopped('wilderness');
        hikeToggleBtn.textContent = '▶ Resume Trail Hike';
        hikeToggleBtn.style.background = '#059669';
      } else {
        coordinator.notifySimulationStarted('wilderness');
        navigator.start();
        hikeToggleBtn.textContent = '⏸ Pause Trail Hike';
        hikeToggleBtn.style.background = '#d97706';
      }
    });
  }
  if (hikeResetBtn) {
    hikeResetBtn.addEventListener('click', () => {
      if (!navigator) return;
      navigator.reset();
      coordinator.notifySimulationStopped('wilderness');
      if (hikeToggleBtn) {
        hikeToggleBtn.textContent = '▶ Embark on Trail';
        hikeToggleBtn.style.background = '#059669';
      }
      updateProgressUI(navigator.getCurrentPose());
    });
  }

  // Campfire Toggle
  const campfireBtn = drawer.querySelector('.gev-campfire-toggle-btn');
  let campfireActive = false;
  if (campfireBtn) {
    campfireBtn.addEventListener('click', () => {
      campfireActive = !campfireActive;
      audio.setCampfireActive(campfireActive);
      campfireBtn.textContent = campfireActive
        ? 'Extinguish Fire'
        : 'Ignite Campfire';
      campfireBtn.style.background = campfireActive ? '#dc2626' : '#21262d';
      campfireBtn.style.color = campfireActive ? '#ffffff' : '#8b949e';
    });
  }

  // Stargazing Toggle
  const stargazingBtn = drawer.querySelector('.gev-stargazing-toggle-btn');
  let stargazingActive = false;
  if (stargazingBtn) {
    stargazingBtn.addEventListener('click', () => {
      stargazingActive = !stargazingActive;
      audio.setStargazingMode(stargazingActive);
      stargazingBtn.textContent = stargazingActive
        ? 'Lower Gaze'
        : 'Gaze Skyward';
      stargazingBtn.style.background = stargazingActive ? '#4f46e5' : '#21262d';
      stargazingBtn.style.color = stargazingActive ? '#ffffff' : '#8b949e';
    });
  }

  // Hotkey 'N' (Nature / National Parks)
  function handleKeyDown(e) {
    if (
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable)
    ) {
      return;
    }
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      toggle();
    }
  }
  window.addEventListener('keydown', handleKeyDown);

  // Initial Render
  renderTrailheadRoster();

  // Deeplink URL Parser
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wilderness') === 'true') {
      openDrawer();
    }
    const thParam = params.get('trailhead');
    if (thParam) {
      selectTrailhead(thParam);
      openDrawer();
    }
    if (params.get('hike') === 'true' && navigator) {
      coordinator.notifySimulationStarted('wilderness');
      navigator.start();
    }
  }

  coordinator.registerSimulation('wilderness', {
    stop: () => {
      navigator?.pause?.();
      coordinator.notifySimulationStopped('wilderness');
    },
    isActive: () => Boolean(navigator?.isNavigating?.()),
  });

  function destroy() {
    window.removeEventListener('keydown', handleKeyDown);
    if (refreshTimer) clearInterval(refreshTimer);
    if (navigator) navigator.destroy();
    audio.destroy();
    coordinator.unregisterSimulation('wilderness');
    coordinator.unregisterDrawer('wilderness');
    launcherButton.remove();
    drawer.remove();
  }

  return {
    open: openDrawer,
    close: closeDrawer,
    toggle,
    isOpen: () => isOpen,
    selectTrailhead,
    getActiveTrailhead: () => activeTrailhead,
    getNavigator: () => navigator,
    getAudioEngine: () => audio,
    destroy,
  };
}
