/**
 * Standalone Drawer Modal for World of Sails Simulator.
 * (World of Sails Capability + Route Slice)
 *
 * Allows users to choose global waterway presets (Savannah, Key West, Lake Lanier, Tahoe, etc.),
 * select vessel class (Sloop, Motorboat, Yacht), adjust nautical speed in knots,
 * toggle Helm, Chase, and Flybridge cameras, launch 3D simulated cruises, and
 * activate interactive Click-to-Splashdown anywhere on Earth.
 */

import { WATER_PRESETS, VESSEL_CLASSES } from './waterWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createBoatDrawer({
  boatEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container || typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
    };
  }

  const drawer = document.createElement('div');
  drawer.className = 'gev-boat-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 350px;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(14, 165, 233, 0.4);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    z-index: 10002;
    padding: 16px;
    display: none;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    pointer-events: none;
    opacity: 0;
    transform: translateY(16px);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(14, 165, 233, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">⛵</span>
        <div>
          <strong style="font-size: 13px; letter-spacing: 0.5px; color: #38bdf8;">WORLD OF SAILS</strong>
          <div style="font-size: 10px; color: #8b949e;">Hydrodynamic Boating & Sailing Engine</div>
        </div>
      </div>
      <button class="gev-boat-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Switcher: Preset Waterbodies vs Custom vs Click-to-Splashdown -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d;">
      <button class="gev-boat-tab-preset" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #38bdf8; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Presets
      </button>
      <button class="gev-boat-tab-custom" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Custom
      </button>
      <button class="gev-boat-tab-click" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;" title="Click anywhere on the globe to drop anchor">
        🎯 Splash
      </button>
    </div>

    <!-- Preset Waterbodies Section -->
    <div class="gev-boat-preset-section" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Waterway Destination</label>
        <select class="gev-boat-preset-select" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          ${Object.entries(WATER_PRESETS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === 'savannah_barrier_islands' ? 'selected' : ''}>${v.name} (${v.isOcean ? 'Sea Level' : 'Elev ' + v.nominalElevationM + 'm'})</option>`,
            )
            .join('')}
        </select>
      </div>
    </div>

    <!-- Custom Route Section (Initially Hidden) -->
    <div class="gev-boat-custom-section" style="display: none; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Departure Point (Lat,Lon or Name)</label>
        <input type="text" class="gev-boat-from-input" placeholder="e.g. 31.9565, -81.0425" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="31.9565, -81.0425" />
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Arrival Point (Lat,Lon or Name)</label>
        <input type="text" class="gev-boat-to-input" placeholder="e.g. 31.8950, -80.9350" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="31.8950, -80.9350" />
      </div>
    </div>

    <!-- Click-to-Splashdown Section (Initially Hidden) -->
    <div class="gev-boat-click-section" style="display: none; flex-direction: column; gap: 8px; background: rgba(14, 165, 233, 0.08); padding: 10px; border-radius: 8px; border: 1px dashed rgba(14, 165, 233, 0.3);">
      <div style="font-size: 11px; color: #38bdf8; font-weight: 600;">Interactive Map Splashdown:</div>
      <div style="font-size: 10px; color: #8b949e;">Click any lake, bay, or ocean on the 3D globe to spawn your vessel at that exact water coordinate.</div>
      <button class="gev-boat-start-click" style="background: #0284c7; border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 700; padding: 8px; cursor: pointer;">
        🎯 Activate Water Picker
      </button>
    </div>

    <!-- Vessel Class Selector -->
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Vessel Class & Hydrodynamics</label>
      <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d;">
        <button class="gev-boat-class-btn" data-class="sloop" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #38bdf8; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          ⛵ Sloop
        </button>
        <button class="gev-boat-class-btn" data-class="motorboat" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          🚤 Motorboat
        </button>
        <button class="gev-boat-class-btn" data-class="yacht" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          🛥️ Yacht
        </button>
      </div>
    </div>

    <!-- Speed / Throttle Slider -->
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Throttle / Cruising Speed</label>
        <span class="gev-boat-speed-label" style="font-size: 12px; font-weight: 700; color: #38bdf8;">5 knots (6 mph)</span>
      </div>
      <input type="range" class="gev-boat-speed-slider" min="2" max="28" step="1" value="5" style="width: 100%; accent-color: #38bdf8; cursor: pointer;" />
    </div>

    <!-- Camera Mode Selector -->
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Camera Perspective</label>
      <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d; gap: 2px;">
        <button class="gev-boat-cam-btn" data-mode="helm" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          💺 Helm
        </button>
        <button class="gev-boat-cam-btn" data-mode="chase" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #38bdf8; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          🌊 Chase
        </button>
        <button class="gev-boat-cam-btn" data-mode="flybridge" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;">
          🔭 Bridge
        </button>
        <button class="gev-boat-cam-btn" data-mode="overview" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="Tactical high-altitude satellite view">
          🛰️ Overview
        </button>
        <button class="gev-boat-cam-btn" data-mode="free" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="Free camera to pan globe while vessel continues cruising">
          🔓 Free Cam
        </button>
      </div>
      <button class="gev-boat-snap-btn" style="display: none; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; border-radius: 6px; padding: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-align: center; margin-top: 4px;">
        🎯 Snap Back to Vessel
      </button>
    </div>

    <div class="gev-boat-status" style="font-size: 11px; color: #8b949e; min-height: 14px; text-align: center;">Ready to cast off.</div>

    <div style="display: flex; gap: 8px; margin-top: 2px;">
      <button class="gev-boat-launch" style="flex: 1; background: linear-gradient(135deg, #0284c7, #0369a1); border: none; border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 13px; padding: 10px; cursor: pointer; transition: filter 0.15s ease;">
        ⚓ Splashdown & Cruise
      </button>
      <button class="gev-boat-clear" style="background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #8b949e; font-size: 12px; padding: 10px; cursor: pointer;" title="Dock / Stop vessel">
        Dock
      </button>
    </div>
  `;

  container.appendChild(drawer);

  const closeBtn = drawer.querySelector('.gev-boat-close');
  const launchBtn = drawer.querySelector('.gev-boat-launch');
  const clearBtn = drawer.querySelector('.gev-boat-clear');
  const presetSelect = drawer.querySelector('.gev-boat-preset-select');
  const fromInput = drawer.querySelector('.gev-boat-from-input');
  const toInput = drawer.querySelector('.gev-boat-to-input');
  const speedSlider = drawer.querySelector('.gev-boat-speed-slider');
  const speedLabel = drawer.querySelector('.gev-boat-speed-label');
  const tabPreset = drawer.querySelector('.gev-boat-tab-preset');
  const tabCustom = drawer.querySelector('.gev-boat-tab-custom');
  const tabClick = drawer.querySelector('.gev-boat-tab-click');
  const presetSection = drawer.querySelector('.gev-boat-preset-section');
  const customSection = drawer.querySelector('.gev-boat-custom-section');
  const clickSection = drawer.querySelector('.gev-boat-click-section');
  const startClickBtn = drawer.querySelector('.gev-boat-start-click');
  const classBtns = drawer.querySelectorAll('.gev-boat-class-btn');
  const camBtns = drawer.querySelectorAll('.gev-boat-cam-btn');
  const snapBtn = drawer.querySelector('.gev-boat-snap-btn');
  const statusEl = drawer.querySelector('.gev-boat-status');

  let activeMode = 'preset';
  let activeVesselClass = 'sloop';
  let activeCamMode = 'chase';

  function updateClassButtons(selectedClass) {
    activeVesselClass = selectedClass;
    classBtns.forEach((btn) => {
      const isSelected = btn.dataset.class === selectedClass;
      btn.style.background = isSelected ? '#21262d' : 'transparent';
      btn.style.color = isSelected ? '#38bdf8' : '#8b949e';
    });

    const spec = VESSEL_CLASSES[selectedClass];
    if (spec && speedSlider && speedLabel) {
      speedSlider.min = spec.minSpeedKnots;
      speedSlider.max = spec.maxSpeedKnots;
      speedSlider.value = spec.defaultSpeedKnots;
      const mph = Math.round(spec.defaultSpeedKnots * 1.15078);
      speedLabel.textContent = `${spec.defaultSpeedKnots} knots (${mph} mph)`;
    }
  }

  function updateCamButtons(selectedMode) {
    activeCamMode = selectedMode;
    camBtns.forEach((btn) => {
      const isSelected = btn.dataset.mode === selectedMode;
      btn.style.background = isSelected ? '#21262d' : 'transparent';
      btn.style.color = isSelected ? '#38bdf8' : '#8b949e';
    });
    if (snapBtn) {
      snapBtn.style.display =
        selectedMode === 'overview' || selectedMode === 'free'
          ? 'block'
          : 'none';
    }
    boatEngine?.setCameraMode(selectedMode);
  }

  snapBtn?.addEventListener('click', () => {
    if (boatEngine && typeof boatEngine.snapBack === 'function') {
      boatEngine.snapBack('chase');
    }
    updateCamButtons('chase');
  });

  classBtns.forEach((btn) => {
    btn.addEventListener('click', () => updateClassButtons(btn.dataset.class));
  });

  camBtns.forEach((btn) => {
    btn.addEventListener('click', () => updateCamButtons(btn.dataset.mode));
  });

  presetSelect?.addEventListener('change', () => {
    const presetId = presetSelect.value;
    const preset = WATER_PRESETS[presetId];
    if (preset) {
      updateClassButtons(preset.defaultVessel || 'sloop');
      if (preset.defaultSpeedKnots && speedSlider && speedLabel) {
        speedSlider.value = preset.defaultSpeedKnots;
        const mph = Math.round(preset.defaultSpeedKnots * 1.15078);
        speedLabel.textContent = `${preset.defaultSpeedKnots} knots (${mph} mph)`;
      }
    }
  });

  speedSlider?.addEventListener('input', () => {
    const knots = Number(speedSlider.value) || 5;
    const mph = Math.round(knots * 1.15078);
    if (speedLabel) speedLabel.textContent = `${knots} knots (${mph} mph)`;
    boatEngine?.setThrottle(knots);
  });

  tabPreset?.addEventListener('click', () => {
    activeMode = 'preset';
    tabPreset.style.background = '#21262d';
    tabPreset.style.color = '#38bdf8';
    tabCustom.style.background = 'transparent';
    tabCustom.style.color = '#8b949e';
    tabClick.style.background = 'transparent';
    tabClick.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'flex';
    if (customSection) customSection.style.display = 'none';
    if (clickSection) clickSection.style.display = 'none';
  });

  tabCustom?.addEventListener('click', () => {
    activeMode = 'custom';
    tabCustom.style.background = '#21262d';
    tabCustom.style.color = '#38bdf8';
    tabPreset.style.background = 'transparent';
    tabPreset.style.color = '#8b949e';
    tabClick.style.background = 'transparent';
    tabClick.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'none';
    if (customSection) customSection.style.display = 'flex';
    if (clickSection) clickSection.style.display = 'none';
  });

  tabClick?.addEventListener('click', () => {
    activeMode = 'click';
    tabClick.style.background = '#21262d';
    tabClick.style.color = '#38bdf8';
    tabPreset.style.background = 'transparent';
    tabPreset.style.color = '#8b949e';
    tabCustom.style.background = 'transparent';
    tabCustom.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'none';
    if (customSection) customSection.style.display = 'none';
    if (clickSection) clickSection.style.display = 'flex';
  });

  startClickBtn?.addEventListener('click', () => {
    if (statusEl) statusEl.textContent = 'Click any water on the 3D globe...';
    boatEngine?.startSplashdownClickMode(({ lat, lon }) => {
      if (statusEl)
        statusEl.textContent = `Water target acquired: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      if (fromInput) fromInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      if (toInput)
        toInput.value = `${(lat + 0.015).toFixed(4)}, ${(lon + 0.015).toFixed(4)}`;
      tabCustom?.click();
    });
  });

  closeBtn?.addEventListener('click', () => close());
  clearBtn?.addEventListener('click', () => {
    stopTelemetryTimer();
    hudStrip.style.display = 'none';
    boatEngine?.clearActiveBoatRoute();
    dock.notifySimulationStopped('boat');
    if (statusEl) statusEl.textContent = 'Vessel docked. Engine cold.';
  });

  launchBtn?.addEventListener('click', async () => {
    const speedKnots = Number(speedSlider?.value) || 5;

    let fromQuery;
    let toQuery;

    if (activeMode === 'preset') {
      fromQuery = presetSelect?.value || 'savannah_barrier_islands';
      toQuery = null;
    } else {
      fromQuery = fromInput?.value?.trim() || '31.9565, -81.0425';
      toQuery = toInput?.value?.trim() || '31.8950, -80.9350';
    }

    if (statusEl)
      statusEl.textContent =
        'Engaging throttle and plotting maritime course...';

    try {
      const route = await boatEngine?.spawnBoatRoute(fromQuery, toQuery, {
        vesselClass: activeVesselClass,
        speedKnots,
        cameraMode: activeCamMode,
      });

      if (route && statusEl) {
        dock.notifySimulationStarted('boat');
        statusEl.textContent = `Cruising: ${route.waterbody.totalDistanceNmi} NM @ ${speedKnots} kts (ETA: ${route.durationSec}s)`;
        startTelemetryTimer();
        updateTelemetryHud();
      } else if (route) {
        dock.notifySimulationStarted('boat');
        startTelemetryTimer();
        updateTelemetryHud();
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err?.message || err}`;
    }
  });

  // Floating Active Vessel Real-Time Telemetry HUD Strip
  const hudStrip = document.createElement('div');
  hudStrip.className = 'gev-boat-hud-strip';
  hudStrip.style.cssText = `
    position: fixed;
    bottom: 132px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(13, 17, 23, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(14, 165, 233, 0.45);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    z-index: 10002;
    padding: 8px 16px;
    display: none;
    align-items: center;
    gap: 14px;
    pointer-events: auto;
    transition: opacity 0.25s ease;
  `;
  hudStrip.innerHTML = `
    <div style="display: flex; flex-direction: column; cursor: pointer;" class="gev-boat-hud-info" title="Click to open World of Sails controls">
      <div class="gev-boat-hud-loc" style="font-size: 12px; font-weight: 700; color: #38bdf8; white-space: nowrap;">⛵ World of Sails</div>
      <div class="gev-boat-hud-sub" style="font-size: 10px; color: #8b949e; white-space: nowrap;">Telemetry syncing...</div>
    </div>
    <div style="display: flex; gap: 6px; align-items: center;">
      <button class="gev-boat-hud-helm" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="First-person helm perspective">
        💺 Helm
      </button>
      <button class="gev-boat-hud-chase" style="background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Third-person chase camera">
        🌊 Chase
      </button>
      <button class="gev-boat-hud-flybridge" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Flybridge elevated view">
        🔭 Bridge
      </button>
      <button class="gev-boat-hud-zoom" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Overview tactical view from 5.5km altitude">
        🛰️ Overview
      </button>
      <button class="gev-boat-hud-free" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Detach camera to freely pan the map">
        🔓 Free Cam
      </button>
      <button class="gev-boat-hud-snap" style="display: none; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 6px; color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 8px; cursor: pointer; white-space: nowrap;">
        🎯 Snap Back
      </button>
      <button class="gev-boat-hud-dock" style="background: rgba(248, 81, 73, 0.15); border: 1px solid rgba(248, 81, 73, 0.5); border-radius: 6px; color: #f85149; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Dock / Stop vessel">
        ⚓ Dock
      </button>
    </div>
  `;
  container.appendChild(hudStrip);

  hudStrip.querySelector('.gev-boat-hud-info')?.addEventListener('click', open);
  hudStrip
    .querySelector('.gev-boat-hud-helm')
    ?.addEventListener('click', () => updateCamButtons('helm'));
  hudStrip
    .querySelector('.gev-boat-hud-chase')
    ?.addEventListener('click', () => updateCamButtons('chase'));
  hudStrip
    .querySelector('.gev-boat-hud-flybridge')
    ?.addEventListener('click', () => updateCamButtons('flybridge'));
  hudStrip
    .querySelector('.gev-boat-hud-zoom')
    ?.addEventListener('click', () => updateCamButtons('overview'));
  hudStrip
    .querySelector('.gev-boat-hud-free')
    ?.addEventListener('click', () => updateCamButtons('free'));
  hudStrip
    .querySelector('.gev-boat-hud-snap')
    ?.addEventListener('click', () => {
      if (boatEngine && typeof boatEngine.snapBack === 'function') {
        boatEngine.snapBack('chase');
      }
      updateCamButtons('chase');
    });
  hudStrip
    .querySelector('.gev-boat-hud-dock')
    ?.addEventListener('click', () => {
      clearBtn?.click();
    });

  let telemetryTimer = null;

  function startTelemetryTimer() {
    stopTelemetryTimer();
    telemetryTimer = setInterval(updateTelemetryHud, 500);
    updateTelemetryHud();
  }

  function stopTelemetryTimer() {
    if (telemetryTimer) {
      clearInterval(telemetryTimer);
      telemetryTimer = null;
    }
  }

  function updateTelemetryHud() {
    if (!boatEngine) return;
    const telem = boatEngine.getActiveTelemetry?.();
    if (!telem) {
      hudStrip.style.display = 'none';
      return;
    }

    hudStrip.style.display = 'flex';
    const locEl = hudStrip.querySelector('.gev-boat-hud-loc');
    const subEl = hudStrip.querySelector('.gev-boat-hud-sub');
    const snapBtnHud = hudStrip.querySelector('.gev-boat-hud-snap');
    const zoomBtnHud = hudStrip.querySelector('.gev-boat-hud-zoom');
    const freeBtnHud = hudStrip.querySelector('.gev-boat-hud-free');
    const helmBtnHud = hudStrip.querySelector('.gev-boat-hud-helm');
    const chaseBtnHud = hudStrip.querySelector('.gev-boat-hud-chase');
    const bridgeBtnHud = hudStrip.querySelector('.gev-boat-hud-flybridge');

    if (locEl) {
      locEl.textContent = `⛵ ${telem.currentLocation} · ${telem.speedKnots} kts (${telem.speedMph} mph)`;
    }
    if (subEl) {
      const next = telem.nextLocation ? `Next: ${telem.nextLocation} · ` : '';
      subEl.textContent = `${next}Dist: ${telem.distTraveledNmi} of ${telem.totalDistNmi} NM (${telem.distTraveledMi}/${telem.totalDistMi} mi) · Progress: ${telem.progressPct}%`;
    }

    if (snapBtnHud) {
      snapBtnHud.style.display =
        telem.cameraMode === 'overview' || telem.cameraMode === 'free'
          ? 'inline-flex'
          : 'none';
    }

    const highlightHud = (btn, active) => {
      if (!btn) return;
      btn.style.background = active ? '#0284c7' : '#21262d';
      btn.style.color = active ? '#ffffff' : '#8b949e';
      btn.style.borderColor = active ? '#38bdf8' : '#30363d';
    };

    highlightHud(helmBtnHud, telem.cameraMode === 'helm');
    highlightHud(chaseBtnHud, telem.cameraMode === 'chase');
    highlightHud(bridgeBtnHud, telem.cameraMode === 'flybridge');
    highlightHud(zoomBtnHud, telem.cameraMode === 'overview');
    highlightHud(freeBtnHud, telem.cameraMode === 'free');
  }

  const dock = getGlobalDrawerCoordinator();

  function open() {
    dock.notifyDrawerOpened('boat');
    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
    drawer.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    });
  }

  function close() {
    drawer.classList.add('hidden');
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    drawer.style.display = 'none';
    dock.notifyDrawerClosed('boat');
    boatEngine?.cancelSplashdownClickMode();
  }

  // Floating launch trigger button on HUD
  // Positioned at bottom: 74px, right: 180px (stacked cleanly beside Drive 🚗 at 128px, Rails 🚆 at 76px, and Flight ✈️ at 24px)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-boat-launcher-button';
  launcherButton.title = 'World of Sails Simulator';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 180px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.9);
    border: 1px solid rgba(14, 165, 233, 0.5);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    color: #38bdf8;
    font-size: 20px;
    cursor: pointer;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, border-color 0.2s ease;
    pointer-events: auto;
  `;
  launcherButton.innerHTML = '⛵';
  launcherButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (
      drawer.classList.contains('hidden') ||
      drawer.style.display === 'none'
    ) {
      open();
    } else {
      close();
    }
  });

  container.appendChild(launcherButton);
  close(); // Start closed by default
  startTelemetryTimer();

  dock.registerDrawer('boat', {
    open: () => open(),
    close: () => close(),
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    launcherEl: launcherButton,
  });

  dock.registerSimulation('boat', {
    stop: () => {
      boatEngine?.clearActiveBoatRoute?.();
      dock.notifySimulationStopped('boat');
    },
    isActive: () => Boolean(boatEngine?.getActiveTelemetry?.()),
  });

  dock.registerOverlayGroup('boat-hud', {
    elements: [hudStrip],
  });

  const unsubscribeSimState = dock.onSimulationStateChange?.((evt) => {
    if (evt?.type === 'started' && evt.id === 'boat') {
      startTelemetryTimer();
    } else if (evt?.type === 'stopped' && evt.id === 'boat') {
      hudStrip.style.display = 'none';
    }
  });

  return {
    open,
    close,
    destroy: () => {
      stopTelemetryTimer();
      unsubscribeSimState?.();
      dock.unregisterOverlayGroup('boat-hud');
      dock.unregisterSimulation('boat');
      dock.unregisterDrawer('boat');
      hudStrip.remove();
      drawer.remove();
      launcherButton.remove();
      boatEngine?.cancelSplashdownClickMode();
    },
  };
}
