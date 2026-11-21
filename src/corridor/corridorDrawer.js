/**
 * Connect Places & Multi-Modal Corridor Explorer Drawer.
 * (Universal Place-to-Place Spatial Relationship & Multi-Modal Corridor Explorer)
 *
 * - Floating launcher at `bottom: 74px; right: 596px` (non-colliding, cyan #22d3ee)
 * - Global Drawer Coordinator mutual exclusion (`registerDrawer('corridor', ...)`)
 *   and Alt+H Hide-All HUD parity (`registerOverlayGroup('corridor-ui', ...)`)
 * - Hotkey `K` toggle (avoids `C` which toggles CCTV in cityDrawer / applicationShortcuts)
 * - URL deeplink support (`?connectFrom=...&connectTo=...` and `?relFrom=...&relTo=...`)
 * - 1-click simulation handoffs into Drive, Airbus H145, Jet Airliner, Rail, and Sail
 */

import * as Cesium from 'cesium';
import { analyzePlaceRelationship } from './placeRelationshipEngine.js';
import { evaluateCorridorModes } from './corridorFeasibility.js';
import {
  DOMICILE_TYPOLOGY_META,
  getAllDomiciles,
  onDomicileRegistryChange,
} from '../layers/estates/domicileCatalog.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

const PRESET_CORRIDORS = Object.freeze([
  {
    label: 'Austin ↔ San Antonio',
    from: 'Austin, TX',
    to: 'San Antonio, TX',
  },
  { label: 'Atlanta ↔ Tokyo', from: 'Atlanta, GA', to: 'Tokyo, Japan' },
  { label: 'Miami ↔ Nassau', from: 'Miami, FL', to: 'Nassau, Bahamas' },
]);

function formatDomicileDropdownEntries(estates = []) {
  const list = Array.isArray(estates) ? estates.slice(0, 12) : [];
  const titleCounts = new Map();
  for (const est of list) {
    const baseTitle = String(
      est?.title ||
        est?.name ||
        est?.shortLabel ||
        est?.address ||
        est?.id ||
        '',
    )
      .trim()
      .toLowerCase();
    if (baseTitle) {
      titleCounts.set(baseTitle, (titleCounts.get(baseTitle) || 0) + 1);
    }
  }

  return list.map((est) => {
    const typologyKey = String(est?.typology || '').toUpperCase();
    const icon =
      est?.icon || DOMICILE_TYPOLOGY_META?.[typologyKey]?.icon || '🏡';
    const baseTitle = String(
      est?.title ||
        est?.name ||
        est?.shortLabel ||
        est?.address ||
        est?.id ||
        '',
    ).trim();
    const locHint = String(est?.city || est?.address || '').trim();
    const coordHint =
      Number.isFinite(est?.lat) && Number.isFinite(est?.lon)
        ? `${Number(est.lat).toFixed(3)}, ${Number(est.lon).toFixed(3)}`
        : '';
    const isDuplicate = (titleCounts.get(baseTitle.toLowerCase()) || 0) > 1;
    const shortLoc =
      locHint && locHint.toLowerCase() !== baseTitle.toLowerCase()
        ? locHint
        : '';
    const disambiguator = shortLoc || coordHint;
    const value =
      isDuplicate && disambiguator
        ? `${baseTitle} (${disambiguator})`
        : baseTitle;
    const label = shortLoc
      ? `${icon} ${baseTitle} · ${shortLoc}`
      : isDuplicate && coordHint
        ? `${icon} ${baseTitle} · ${coordHint}`
        : `${icon} ${baseTitle}`;
    return { value, label };
  });
}

function buildEstateOptionsHtml(estates = []) {
  return formatDomicileDropdownEntries(estates)
    .map(
      ({ value, label }) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
    )
    .join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toEndpointPayload(endpoint) {
  if (!endpoint) return null;
  return {
    lat: endpoint.lat,
    lon: endpoint.lon,
    name: endpoint.name,
    shortLabel: endpoint.shortLabel || endpoint.name,
    elev: Number.isFinite(endpoint.elev) ? endpoint.elev : 0,
    ...(endpoint.code ? { code: endpoint.code } : {}),
  };
}

/**
 * Parse ?connectFrom=&connectTo= (and aliases ?relFrom=&relTo=) from URL query string.
 */
export function parseCorridorDeeplink(
  search = typeof window !== 'undefined' ? window.location?.search : '',
) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const from = (
    params.get('connectFrom') ||
    params.get('relFrom') ||
    ''
  ).trim();
  const to = (params.get('connectTo') || params.get('relTo') || '').trim();
  if (!from || !to) return null;
  return { from, to };
}

function getCameraCenterQuery(viewer) {
  const camera = viewer?.camera;
  if (!camera) return null;
  let carto = camera.positionCartographic;
  if (!carto && camera.position && Cesium.Cartographic?.fromCartesian) {
    try {
      carto = Cesium.Cartographic.fromCartesian(camera.position);
    } catch {
      carto = null;
    }
  }
  if (
    !carto ||
    !Number.isFinite(carto.latitude) ||
    !Number.isFinite(carto.longitude)
  ) {
    return null;
  }
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function modeBadgeStyle(mode) {
  if (
    mode.feasible &&
    (mode.status === 'viable' ||
      mode.status === 'ideal' ||
      mode.status === 'recommended' ||
      mode.status === 'realistic' ||
      mode.status === 'epic_overland' ||
      mode.status === 'short_hop')
  ) {
    return 'background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.55); color: #34d399;';
  }
  if (mode.feasible) {
    return 'background: rgba(245, 158, 11, 0.18); border: 1px solid rgba(245, 158, 11, 0.55); color: #fbbf24;';
  }
  return 'background: rgba(100, 116, 139, 0.18); border: 1px solid rgba(100, 116, 139, 0.45); color: #94a3b8;';
}

/**
 * Create and mount the Connect Places / Spatial Relationship Drawer.
 */
export function createCorridorDrawer({
  viewer = null,
  visualizer = null,
  driveEngine = null,
  flightEngine = null,
  railwayEngine = null,
  boatEngine = null,
  container = null,
  coordinator = null,
  fetchImpl = undefined,
  placeSearch = null,
  naturalRegionResolver = undefined,
  domiciles = null,
  autoRunDeeplink = true,
  onStateChange = null,
} = {}) {
  const dock = coordinator || getGlobalDrawerCoordinator();
  const mountTarget =
    container || (typeof document !== 'undefined' ? document.body : null);

  let isOpen = false;
  let destroyed = false;
  let isLoading = false;
  let activeRequestId = 0;
  let activeRelationship = null;
  let activeModes = null;
  let statusMessage = '';
  let statusTone = 'muted';

  const readCurrentEstates = () =>
    Array.isArray(domiciles)
      ? domiciles
      : typeof getAllDomiciles === 'function'
        ? getAllDomiciles()
        : [];
  const estateList = readCurrentEstates();

  if (!mountTarget || typeof document === 'undefined') {
    return {
      openDrawer: () => {},
      closeDrawer: () => {},
      toggleDrawer: () => {},
      isOpen: () => false,
      connectPlaces: async () => null,
      clear: () => {},
      frameCorridor: () => false,
      launchMode: async () => false,
      getState: () => ({
        isOpen: false,
        isLoading: false,
        relationship: activeRelationship,
        modes: activeModes,
        statusMessage,
      }),
      destroy: () => {},
    };
  }

  // Floating HUD Trigger Launcher at bottom: 74px; right: 596px (clear of Sandbox @ 544px)
  const launcherButton = document.createElement('button');
  launcherButton.type = 'button';
  launcherButton.className = 'gev-corridor-launcher-btn';
  launcherButton.title = 'Connect Places & Corridor Explorer (K)';
  launcherButton.setAttribute(
    'aria-label',
    'Connect Places & Corridor Explorer (K)',
  );
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 596px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.92);
    border: 1px solid rgba(34, 211, 238, 0.65);
    color: #22d3ee;
    font-size: 18px;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(34, 211, 238, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, border-color 0.2s;
  `;
  launcherButton.textContent = '🧭';

  // Main Glassmorphic Flyout Drawer
  const drawer = document.createElement('aside');
  drawer.className = 'gev-corridor-drawer';
  drawer.setAttribute(
    'aria-label',
    'Connect Places Spatial Relationship Drawer',
  );
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 20px;
    width: 396px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 160px);
    overflow-y: auto;
    background: rgba(13, 17, 23, 0.94);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(34, 211, 238, 0.38);
    border-radius: 12px;
    color: #e6edf3;
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.72);
    z-index: 9998;
    display: none;
    flex-direction: column;
  `;

  const estateOptionsHtml = buildEstateOptionsHtml(estateList);
  const estateSelectDisplay = estateOptionsHtml ? '' : 'display: none;';

  const presetChipsHtml = PRESET_CORRIDORS.map(
    (p) =>
      `<button type="button" class="gev-corridor-preset-btn" data-from="${escapeHtml(p.from)}" data-to="${escapeHtml(p.to)}" style="padding: 3px 7px; font-size: 10px; background: rgba(34, 211, 238, 0.08); border: 1px solid rgba(34, 211, 238, 0.28); color: #a5f3fc; border-radius: 999px; cursor: pointer;">${escapeHtml(p.label)}</button>`,
  ).join('');

  drawer.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid rgba(48, 54, 61, 0.85);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 17px;">🧭</span>
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #f0f6fc; letter-spacing: 0.02em;">Connect Places</div>
          <div style="font-size: 10px; color: #8b949e;">Spatial Relationship & Multi-Modal Corridor (K)</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button type="button" class="gev-corridor-clear-btn" title="Clear overlay" style="padding: 4px 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 5px; cursor: pointer;">Clear</button>
        <button type="button" class="gev-corridor-close-btn" title="Close drawer" aria-label="Close drawer" style="width: 26px; height: 26px; font-size: 12px; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 6px; cursor: pointer;">✕</button>
      </div>
    </div>

    <div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="font-size: 10px; font-weight: 700; color: #22d3ee; text-transform: uppercase;">Origin (A)</label>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="gev-corridor-cam-from-btn" style="padding: 2px 6px; font-size: 9px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">📍 Camera</button>
            <select class="gev-corridor-estate-from-select" style="max-width: 155px; padding: 2px 4px; font-size: 9px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; ${estateSelectDisplay}"><option value="">🏡 Estate...</option>${estateOptionsHtml}</select>
          </div>
        </div>
        <input type="text" class="gev-corridor-from-input" placeholder="City, landmark, estate, ICAO, or lat, lon" style="width: 100%; box-sizing: border-box; padding: 7px 9px; font-size: 12px; background: #0d1117; border: 1px solid #30363d; color: #f0f6fc; border-radius: 6px;" />
      </div>

      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="flex: 1; height: 1px; background: #21262d;"></div>
        <button type="button" class="gev-corridor-swap-btn" title="Swap Origin & Destination" style="padding: 3px 10px; font-size: 11px; font-weight: 700; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 999px; cursor: pointer;">⇄ Swap</button>
        <div style="flex: 1; height: 1px; background: #21262d;"></div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <label style="font-size: 10px; font-weight: 700; color: #f59e0b; text-transform: uppercase;">Destination (B)</label>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button type="button" class="gev-corridor-cam-to-btn" style="padding: 2px 6px; font-size: 9px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">📍 Camera</button>
            <select class="gev-corridor-estate-to-select" style="max-width: 155px; padding: 2px 4px; font-size: 9px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; ${estateSelectDisplay}"><option value="">🏡 Estate...</option>${estateOptionsHtml}</select>
          </div>
        </div>
        <input type="text" class="gev-corridor-to-input" placeholder="City, landmark, estate, ICAO, or lat, lon" style="width: 100%; box-sizing: border-box; padding: 7px 9px; font-size: 12px; background: #0d1117; border: 1px solid #30363d; color: #f0f6fc; border-radius: 6px;" />
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 5px;">
        ${presetChipsHtml}
      </div>

      <button type="button" class="gev-corridor-connect-btn" style="width: 100%; padding: 8px 12px; font-size: 12px; font-weight: 700; background: linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(14, 165, 233, 0.2)); border: 1px solid #22d3ee; color: #ecfeff; border-radius: 7px; cursor: pointer;">🔗 Connect Places</button>

      <div class="gev-corridor-status-banner" style="display: none; padding: 7px 9px; border-radius: 6px; font-size: 11px; line-height: 1.35;"></div>

      <div class="gev-corridor-results" style="display: flex; flex-direction: column; gap: 10px;"></div>
    </div>
  `;

  mountTarget.appendChild(launcherButton);
  mountTarget.appendChild(drawer);

  const fromInput = drawer.querySelector('.gev-corridor-from-input');
  const toInput = drawer.querySelector('.gev-corridor-to-input');
  const connectBtn = drawer.querySelector('.gev-corridor-connect-btn');
  const swapBtn = drawer.querySelector('.gev-corridor-swap-btn');
  const clearBtn = drawer.querySelector('.gev-corridor-clear-btn');
  const closeBtn = drawer.querySelector('.gev-corridor-close-btn');
  const camFromBtn = drawer.querySelector('.gev-corridor-cam-from-btn');
  const camToBtn = drawer.querySelector('.gev-corridor-cam-to-btn');
  const estateFromSelect = drawer.querySelector(
    '.gev-corridor-estate-from-select',
  );
  const estateToSelect = drawer.querySelector('.gev-corridor-estate-to-select');
  const statusBanner = drawer.querySelector('.gev-corridor-status-banner');
  const resultsEl = drawer.querySelector('.gev-corridor-results');

  function emitState() {
    onStateChange?.({
      isOpen,
      isLoading,
      relationship: activeRelationship,
      modes: activeModes,
      statusMessage,
    });
  }

  function setStatus(message, tone = 'muted') {
    statusMessage = message || '';
    statusTone = tone;
    if (!statusBanner) return;
    if (!statusMessage) {
      statusBanner.style.display = 'none';
      statusBanner.textContent = '';
      return;
    }
    statusBanner.style.display = 'block';
    statusBanner.textContent = statusMessage;
    if (tone === 'error') {
      statusBanner.style.background = 'rgba(239, 68, 68, 0.14)';
      statusBanner.style.border = '1px solid rgba(239, 68, 68, 0.45)';
      statusBanner.style.color = '#fca5a5';
    } else if (tone === 'success') {
      statusBanner.style.background = 'rgba(16, 185, 129, 0.14)';
      statusBanner.style.border = '1px solid rgba(16, 185, 129, 0.45)';
      statusBanner.style.color = '#6ee7b7';
    } else {
      statusBanner.style.background = 'rgba(34, 211, 238, 0.1)';
      statusBanner.style.border = '1px solid rgba(34, 211, 238, 0.3)';
      statusBanner.style.color = '#bae6fd';
    }
  }

  function renderResults() {
    if (!resultsEl) return;
    if (!activeRelationship) {
      resultsEl.innerHTML = '';
      return;
    }

    const rel = activeRelationship;
    const regions = [
      rel.physiographicContext?.originRegion,
      rel.physiographicContext?.midpointRegion,
      rel.physiographicContext?.destinationRegion,
    ].filter(Boolean);
    const uniqueRegions = [...new Set(regions)];

    const borderLabel = rel.isCrossBorder
      ? `Cross-Border (${rel.origin.countryName || rel.origin.countryCode || '?'} → ${rel.destination.countryName || rel.destination.countryCode || '?'})`
      : rel.origin.countryName ||
        rel.destination.countryName ||
        'Domestic / Regional';

    const modesList = activeModes?.modes || [];
    const modesHtml = modesList
      .map((mode) => {
        const disabledAttr = mode.feasible ? '' : 'disabled';
        const btnStyle = mode.feasible
          ? 'background: rgba(34, 211, 238, 0.16); border: 1px solid rgba(34, 211, 238, 0.45); color: #cffafe; cursor: pointer;'
          : 'background: #161b22; border: 1px solid #30363d; color: #6e7681; cursor: not-allowed; opacity: 0.65;';
        const distMetric = Number.isFinite(mode.distanceKm)
          ? `${mode.distanceKm.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`
          : '—';
        return `
          <div class="gev-corridor-mode-card" data-mode="${escapeHtml(mode.id)}" style="background: rgba(22, 27, 34, 0.78); border: 1px solid #30363d; border-radius: 8px; padding: 9px 10px; display: flex; flex-direction: column; gap: 5px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #f0f6fc;">
                <span>${escapeHtml(mode.icon)}</span>
                <span>${escapeHtml(mode.label)}</span>
              </div>
              <span style="padding: 2px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; ${modeBadgeStyle(mode)}">${escapeHtml(mode.badge)}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #8b949e;">
              <span>Dist: <strong style="color: #e6edf3;">${escapeHtml(distMetric)}</strong> · ETA: <strong style="color: #22d3ee;">${escapeHtml(mode.etaLabel || 'N/A')}</strong></span>
              <button type="button" class="gev-corridor-launch-btn" data-mode="${escapeHtml(mode.id)}" ${disabledAttr} style="padding: 3px 9px; font-size: 10px; font-weight: 700; border-radius: 5px; ${btnStyle}">Launch</button>
            </div>
            <div style="font-size: 10px; color: #8b949e; line-height: 1.35;">${escapeHtml(mode.reason)}</div>
          </div>
        `;
      })
      .join('');

    resultsEl.innerHTML = `
      <div class="gev-corridor-summary-card" style="background: rgba(22, 27, 34, 0.85); border: 1px solid rgba(34, 211, 238, 0.35); border-radius: 8px; padding: 10px 11px; display: flex; flex-direction: column; gap: 7px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="font-size: 11px; font-weight: 700; color: #f0f6fc;">
            <span style="color: #22d3ee;">A</span> ${escapeHtml(rel.origin.name)} → <span style="color: #f59e0b;">B</span> ${escapeHtml(rel.destination.name)}
          </div>
          <button type="button" class="gev-corridor-reframe-btn" style="padding: 2px 7px; font-size: 10px; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">🎯 Reframe</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 10px;">
          <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 5px; padding: 5px 6px;">
            <div style="color: #8b949e;">Great Circle</div>
            <div style="font-weight: 700; color: #22d3ee;">${rel.greatCircleKm.toLocaleString('en-US', { maximumFractionDigits: 1 })} km</div>
            <div style="color: #6e7681;">${rel.greatCircleMi.toLocaleString('en-US', { maximumFractionDigits: 0 })} mi · ${rel.greatCircleNm.toLocaleString('en-US', { maximumFractionDigits: 0 })} NM</div>
          </div>
          <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 5px; padding: 5px 6px;">
            <div style="color: #8b949e;">Bearing A → B</div>
            <div style="font-weight: 700; color: #f0f6fc;">${rel.initialBearingDeg}° ${escapeHtml(rel.initialCardinal)}</div>
            <div style="color: #6e7681;">Rev ${rel.reverseBearingDeg}° ${escapeHtml(rel.reverseCardinal)}</div>
          </div>
          <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 5px; padding: 5px 6px;">
            <div style="color: #8b949e;">Solar & Elev</div>
            <div style="font-weight: 700; color: #fbbf24;">${escapeHtml(rel.solarDeltaLabel)}</div>
            <div style="color: #6e7681;">Δ ${rel.elevationDeltaM >= 0 ? '+' : ''}${rel.elevationDeltaM} m (${escapeHtml(rel.elevationTrend)})</div>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; font-size: 10px; color: #8b949e;">
          <span>Midpoint: <strong style="color: #c9d1d9;">${rel.midpoint.lat.toFixed(3)}, ${rel.midpoint.lon.toFixed(3)}</strong></span>
          <span>Scope: <strong style="color: #c9d1d9;">${escapeHtml(borderLabel)}</strong></span>
        </div>
        ${
          uniqueRegions.length > 0
            ? `<div style="font-size: 10px; color: #8b949e;">Physiography: <strong style="color: #cbd5e1;">${escapeHtml(uniqueRegions.join(' · '))}</strong></div>`
            : ''
        }
      </div>

      <div style="font-size: 10px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Multi-Modal Feasibility</div>
      <div class="gev-corridor-modes-list" style="display: flex; flex-direction: column; gap: 7px;">
        ${modesHtml}
      </div>
    `;
  }

  function openDrawer() {
    if (destroyed || isOpen) return;
    isOpen = true;
    drawer.style.display = 'flex';
    dock.notifyDrawerOpened('corridor');
    emitState();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    drawer.style.display = 'none';
    dock.notifyDrawerClosed('corridor');
    emitState();
  }

  function toggleDrawer() {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function clear() {
    activeRelationship = null;
    activeModes = null;
    setStatus('');
    visualizer?.clear?.();
    renderResults();
    emitState();
  }

  function frameCorridor() {
    if (!activeRelationship) return false;
    if (visualizer?.renderRelationship) {
      visualizer.renderRelationship(activeRelationship, { flyCamera: true });
      return true;
    }
    return Boolean(visualizer?.frameCorridor?.(activeRelationship));
  }

  async function launchMode(modeId) {
    if (!activeRelationship) return false;
    const fromPayload = toEndpointPayload(activeRelationship.origin);
    const toPayload = toEndpointPayload(activeRelationship.destination);
    const modeInfo = activeModes?.byId?.[modeId] || null;

    if (modeInfo && !modeInfo.feasible) {
      setStatus(
        `${modeInfo.label} is unavailable for this corridor (${modeInfo.badge}).`,
        'error',
      );
      return false;
    }

    try {
      if (modeId === 'drive') {
        if (!driveEngine?.startRouteDrive) {
          throw new Error('Road Drive engine is not attached.');
        }
        visualizer?.clear?.();
        await driveEngine.startRouteDrive(fromPayload, toPayload, {
          useOsrm: true,
        });
        dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
        setStatus(
          `🚗 Launched Road Trip (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        return true;
      }

      if (modeId === 'h145') {
        if (!flightEngine?.spawnFlightRoute) {
          throw new Error('Synthetic Flight engine is not attached.');
        }
        visualizer?.clear?.();
        await flightEngine.spawnFlightRoute(fromPayload, toPayload, {
          aircraftType: 'h145',
          isRotorcraft: true,
        });
        setStatus(
          `🚁 Launched Airbus H145 flight (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        return true;
      }

      if (modeId === 'jet') {
        if (!flightEngine?.spawnFlightRoute) {
          throw new Error('Synthetic Flight engine is not attached.');
        }
        visualizer?.clear?.();
        await flightEngine.spawnFlightRoute(fromPayload, toPayload, {});
        setStatus(
          `✈️ Launched Jet Airliner flight (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        return true;
      }

      if (modeId === 'rail') {
        if (!railwayEngine?.spawnRailRoute) {
          throw new Error('World of Rails engine is not attached.');
        }
        visualizer?.clear?.();
        await railwayEngine.spawnRailRoute(fromPayload, toPayload, {
          corridorId:
            modeInfo?.matchedCorridorId || modeInfo?.corridorId || undefined,
        });
        dock.notifySimulationStarted('rail', { keepIds: ['composite'] });
        setStatus(
          `🚆 Launched Rail corridor (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        return true;
      }

      if (modeId === 'boat') {
        if (!boatEngine?.spawnBoatRoute) {
          throw new Error('World of Sails engine is not attached.');
        }
        visualizer?.clear?.();
        await boatEngine.spawnBoatRoute(fromPayload, toPayload, {});
        dock.notifySimulationStarted('boat', { keepIds: ['composite'] });
        setStatus(
          `⛵ Launched Maritime voyage (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        return true;
      }

      throw new Error(`Unknown corridor mode: ${modeId}`);
    } catch (err) {
      setStatus(
        `Failed to launch ${modeId}: ${err?.message || String(err)}`,
        'error',
      );
      return false;
    }
  }

  async function connectPlaces(
    fromQuery,
    toQuery,
    {
      openDrawerOnConnect = true,
      flyCamera = true,
      probeOsrm = true,
      probeOverpass = true,
    } = {},
  ) {
    if (destroyed) return null;
    const fromText =
      typeof fromQuery === 'string'
        ? fromQuery.trim()
        : fromQuery?.name ||
          (Number.isFinite(fromQuery?.lat) && Number.isFinite(fromQuery?.lon)
            ? `${fromQuery.lat.toFixed(4)}, ${fromQuery.lon.toFixed(4)}`
            : '');
    const toText =
      typeof toQuery === 'string'
        ? toQuery.trim()
        : toQuery?.name ||
          (Number.isFinite(toQuery?.lat) && Number.isFinite(toQuery?.lon)
            ? `${toQuery.lat.toFixed(4)}, ${toQuery.lon.toFixed(4)}`
            : '');

    if (fromInput && fromText) fromInput.value = fromText;
    if (toInput && toText) toInput.value = toText;

    if (!fromText || !toText) {
      setStatus('Enter both Origin and Destination places.', 'error');
      if (openDrawerOnConnect) openDrawer();
      return null;
    }

    const requestId = ++activeRequestId;
    isLoading = true;
    setStatus(`Resolving "${fromText}" → "${toText}"...`, 'muted');
    if (openDrawerOnConnect) openDrawer();
    emitState();

    try {
      const resolverOpts = {
        ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        ...(placeSearch ? { placeSearch } : {}),
        ...(naturalRegionResolver !== undefined
          ? { naturalRegionResolver }
          : {}),
        ...(Array.isArray(domiciles) ? { getDomiciles: () => domiciles } : {}),
      };

      const relationship = await analyzePlaceRelationship(
        fromQuery,
        toQuery,
        resolverOpts,
      );
      if (destroyed || requestId !== activeRequestId) return null;

      activeRelationship = relationship;
      activeModes = null;
      renderResults();
      visualizer?.renderRelationship?.(relationship, {
        flyCamera,
      });

      setStatus(
        'Evaluating road, rotorcraft, airliner, rail & marine feasibility...',
        'muted',
      );

      const modes = await evaluateCorridorModes(
        relationship.origin,
        relationship.destination,
        relationship,
        {
          ...resolverOpts,
          probeOsrm,
          probeOverpass,
        },
      );
      if (destroyed || requestId !== activeRequestId) return null;

      activeModes = modes;
      isLoading = false;
      setStatus('');
      visualizer?.updateRoadPreview?.(modes.byId?.drive);
      renderResults();
      emitState();

      return { relationship, modes };
    } catch (err) {
      if (destroyed || requestId !== activeRequestId) return null;
      isLoading = false;
      setStatus(err?.message || 'Unable to connect places.', 'error');
      emitState();
      return null;
    }
  }

  // Event Wiring
  function handleLauncherClick() {
    toggleDrawer();
  }

  function handleCloseClick() {
    closeDrawer();
  }

  function handleClearClick() {
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    clear();
  }

  function handleConnectClick() {
    connectPlaces(fromInput?.value || '', toInput?.value || '');
  }

  function handleSwapClick() {
    if (!fromInput || !toInput) return;
    const prevFrom = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = prevFrom;
    if (fromInput.value.trim() && toInput.value.trim()) {
      connectPlaces(fromInput.value, toInput.value);
    }
  }

  function handleCameraFrom() {
    const coords = getCameraCenterQuery(viewer);
    if (!coords) {
      setStatus('Camera position is unavailable.', 'error');
      return;
    }
    if (fromInput) fromInput.value = coords;
  }

  function handleCameraTo() {
    const coords = getCameraCenterQuery(viewer);
    if (!coords) {
      setStatus('Camera position is unavailable.', 'error');
      return;
    }
    if (toInput) toInput.value = coords;
  }

  function handleEstateFromChange() {
    if (estateFromSelect?.value && fromInput) {
      fromInput.value = estateFromSelect.value;
      estateFromSelect.value = '';
    }
  }

  function handleEstateToChange() {
    if (estateToSelect?.value && toInput) {
      toInput.value = estateToSelect.value;
      estateToSelect.value = '';
    }
  }

  function handleInputKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      connectPlaces(fromInput?.value || '', toInput?.value || '');
    }
  }

  function handleDrawerClick(e) {
    const presetBtn = e.target?.closest?.('.gev-corridor-preset-btn');
    if (presetBtn) {
      const f = presetBtn.getAttribute('data-from') || '';
      const t = presetBtn.getAttribute('data-to') || '';
      connectPlaces(f, t);
      return;
    }
    const reframeBtn = e.target?.closest?.('.gev-corridor-reframe-btn');
    if (reframeBtn) {
      frameCorridor();
      return;
    }
    const launchBtn = e.target?.closest?.('.gev-corridor-launch-btn');
    if (launchBtn && !launchBtn.disabled) {
      const modeId = launchBtn.getAttribute('data-mode');
      if (modeId) {
        launchMode(modeId);
      }
    }
  }

  function handleGlobalKeydown(e) {
    if (destroyed) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      toggleDrawer();
      return;
    }
    if (e.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  }

  function syncEstateDropdowns() {
    if (destroyed) return;
    const html = buildEstateOptionsHtml(readCurrentEstates());
    const hasEstates = Boolean(html);
    for (const sel of [estateFromSelect, estateToSelect]) {
      if (!sel) continue;
      sel.innerHTML = `<option value="">🏡 Estate...</option>${html}`;
      sel.value = '';
      sel.style.display = hasEstates ? '' : 'none';
    }
  }

  const unsubscribeDomiciles =
    !Array.isArray(domiciles) && typeof onDomicileRegistryChange === 'function'
      ? onDomicileRegistryChange(syncEstateDropdowns)
      : null;

  launcherButton.addEventListener('click', handleLauncherClick);
  closeBtn?.addEventListener('click', handleCloseClick);
  clearBtn?.addEventListener('click', handleClearClick);
  connectBtn?.addEventListener('click', handleConnectClick);
  swapBtn?.addEventListener('click', handleSwapClick);
  camFromBtn?.addEventListener('click', handleCameraFrom);
  camToBtn?.addEventListener('click', handleCameraTo);
  estateFromSelect?.addEventListener('change', handleEstateFromChange);
  estateToSelect?.addEventListener('change', handleEstateToChange);
  fromInput?.addEventListener('keydown', handleInputKeydown);
  toInput?.addEventListener('keydown', handleInputKeydown);
  drawer.addEventListener('click', handleDrawerClick);
  document.addEventListener('keydown', handleGlobalKeydown);

  dock.registerDrawer('corridor', {
    open: openDrawer,
    close: closeDrawer,
    isOpen: () => isOpen,
    launcherEl: launcherButton,
    accentColor: '#22d3ee',
  });
  dock.registerOverlayGroup('corridor-ui', {
    elements: [launcherButton, drawer],
  });

  if (autoRunDeeplink) {
    const deeplink = parseCorridorDeeplink();
    if (deeplink) {
      void connectPlaces(deeplink.from, deeplink.to, {
        openDrawerOnConnect: true,
        flyCamera: true,
      });
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    activeRequestId++;
    launcherButton.removeEventListener('click', handleLauncherClick);
    closeBtn?.removeEventListener('click', handleCloseClick);
    clearBtn?.removeEventListener('click', handleClearClick);
    connectBtn?.removeEventListener('click', handleConnectClick);
    swapBtn?.removeEventListener('click', handleSwapClick);
    camFromBtn?.removeEventListener('click', handleCameraFrom);
    camToBtn?.removeEventListener('click', handleCameraTo);
    estateFromSelect?.removeEventListener('change', handleEstateFromChange);
    estateToSelect?.removeEventListener('change', handleEstateToChange);
    fromInput?.removeEventListener('keydown', handleInputKeydown);
    toInput?.removeEventListener('keydown', handleInputKeydown);
    drawer.removeEventListener('click', handleDrawerClick);
    document.removeEventListener('keydown', handleGlobalKeydown);
    if (typeof unsubscribeDomiciles === 'function') {
      unsubscribeDomiciles();
    }

    dock.unregisterOverlayGroup('corridor-ui');
    dock.unregisterDrawer('corridor');
    launcherButton.remove();
    drawer.remove();
  }

  return {
    openDrawer,
    closeDrawer,
    toggleDrawer,
    isOpen: () => isOpen,
    connectPlaces,
    clear,
    frameCorridor,
    launchMode,
    getState: () => ({
      isOpen,
      isLoading,
      relationship: activeRelationship,
      modes: activeModes,
      statusMessage,
      statusTone,
    }),
    destroy,
  };
}
