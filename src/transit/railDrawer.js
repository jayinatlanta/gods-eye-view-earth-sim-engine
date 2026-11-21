/**
 * Standalone Drawer Modal for World of Rails Simulator.
 * (World of Rails Substrate Slice)
 *
 * Allows users to choose global rail corridors, switch between surface and transit tracks,
 * adjust locomotive cruising speed, toggle First-Person Cab Ride, Orbital Chase, and
 * Macro Establishing Overview cameras, and launch instant 3D simulated train runs
 * across planetary Cesium terrain with articulated consists and outlined reticles.
 */

import { RAIL_CORRIDORS } from './railWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createRailDrawer({
  railwayEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container || typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      isOpen: () => false,
    };
  }

  const drawer = document.createElement('div');
  drawer.className = 'gev-rail-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 360px;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(245, 158, 11, 0.4);
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
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(245, 158, 11, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🚆</span>
        <div>
          <strong style="font-size: 13px; letter-spacing: 0.5px; color: #fbbf24;">WORLD OF RAILS</strong>
          <div style="font-size: 10px; color: #8b949e;">Vector Transit & Heavy Rail Simulator</div>
        </div>
      </div>
      <button class="gev-rail-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Switcher: Preset Corridors vs Custom Route -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d;">
      <button class="gev-rail-tab-preset" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #fbbf24; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Preset Corridors
      </button>
      <button class="gev-rail-tab-custom" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Custom Coordinates
      </button>
    </div>

    <!-- Preset Corridors Section -->
    <div class="gev-rail-preset-section" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Rail Corridor</label>
        <select class="gev-rail-corridor-select" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          ${Object.entries(RAIL_CORRIDORS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === 'atlanta_marta_east' ? 'selected' : ''}>${v.name}</option>`,
            )
            .join('')}
        </select>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Track Profile / Alignment</label>
        <select class="gev-rail-track-select" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          <option value="csx_mainline" selected>CSX Surface Mainline (100% Photorealistic Open-Air)</option>
          <option value="marta_heavy_rail">MARTA Blue/Green Line (Subterranean Auto-Fallback)</option>
        </select>
      </div>
    </div>

    <!-- Custom Route Section (Initially Hidden) -->
    <div class="gev-rail-custom-section" style="display: none; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Origin Coordinates (Lat,Lon)</label>
        <input type="text" class="gev-rail-from-input" placeholder="e.g. 33.7561, -84.3403" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="33.7561, -84.3403" />
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Destination Coordinates (Lat,Lon)</label>
        <input type="text" class="gev-rail-to-input" placeholder="e.g. 33.7505, -84.3862" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="33.7505, -84.3862" />
      </div>
    </div>

    <!-- Speed Controls -->
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Cruising Speed</label>
        <span class="gev-rail-speed-label" style="font-size: 12px; font-weight: 700; color: #fbbf24;">45 mph</span>
      </div>
      <input type="range" class="gev-rail-speed-slider" min="15" max="175" step="5" value="45" style="width: 100%; accent-color: #fbbf24; cursor: pointer;" />
    </div>

    <!-- Camera Perspective Selector & Establishing Map -->
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Camera Perspective</label>
      <div class="gev-rail-cam-group" style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d; gap: 2px;">
        <button class="gev-rail-cam-btn" data-cam="cab" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #fbbf24; font-size: 11px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="First-Person Driver Cab View">
          💺 Cab
        </button>
        <button class="gev-rail-cam-btn" data-cam="chase" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="Trailing Orbital Chase View">
          🚆 Chase
        </button>
        <button class="gev-rail-cam-btn" data-cam="heli" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="Overhead Helicopter Tracking View">
          🚁 Heli
        </button>
        <button class="gev-rail-cam-btn" data-cam="overview" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="High Panoramic Regional Establishing Overview">
          🗺️ Overview
        </button>
        <button class="gev-rail-cam-btn" data-cam="free" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px 2px; cursor: pointer;" title="Free Camera to Pan Globe">
          🔓 Free
        </button>
      </div>
      <button class="gev-rail-snap-btn" style="display: none; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; border-radius: 6px; padding: 7px; font-size: 11px; font-weight: 700; cursor: pointer; text-align: center; margin-top: 2px;" title="Snap camera back to driver cab">
        🎯 Snap Back to Train
      </button>
    </div>

    <div class="gev-rail-status" style="font-size: 11px; color: #8b949e; min-height: 14px; text-align: center; line-height: 1.4;">Ready to launch train.</div>

    <div style="display: flex; gap: 8px; margin-top: 2px;">
      <button class="gev-rail-launch" style="flex: 1; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; border-radius: 8px; color: #0d1117; font-weight: 700; font-size: 13px; padding: 10px; cursor: pointer; transition: filter 0.15s ease;">
        🚀 Launch Train Run
      </button>
      <button class="gev-rail-clear" style="background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #8b949e; font-size: 12px; padding: 10px; cursor: pointer;" title="Stop active train">
        Stop
      </button>
    </div>
  `;

  container.appendChild(drawer);

  const closeBtn = drawer.querySelector('.gev-rail-close');
  const launchBtn = drawer.querySelector('.gev-rail-launch');
  const clearBtn = drawer.querySelector('.gev-rail-clear');
  const corridorSelect = drawer.querySelector('.gev-rail-corridor-select');
  const trackSelect = drawer.querySelector('.gev-rail-track-select');
  const fromInput = drawer.querySelector('.gev-rail-from-input');
  const toInput = drawer.querySelector('.gev-rail-to-input');
  const speedSlider = drawer.querySelector('.gev-rail-speed-slider');
  const speedLabel = drawer.querySelector('.gev-rail-speed-label');
  const tabPreset = drawer.querySelector('.gev-rail-tab-preset');
  const tabCustom = drawer.querySelector('.gev-rail-tab-custom');
  const presetSection = drawer.querySelector('.gev-rail-preset-section');
  const customSection = drawer.querySelector('.gev-rail-custom-section');
  const statusEl = drawer.querySelector('.gev-rail-status');
  const camBtns = drawer.querySelectorAll('.gev-rail-cam-btn');
  const snapBtn = drawer.querySelector('.gev-rail-snap-btn');

  let activeMode = 'preset';
  let selectedCamMode = 'cab';
  let telemInterval = null;

  function updateCamButtons(mode) {
    selectedCamMode = mode;
    camBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-cam') === mode;
      btn.style.background = isMatch ? '#21262d' : 'transparent';
      btn.style.color = isMatch ? '#fbbf24' : '#8b949e';
    });

    if (snapBtn) {
      snapBtn.style.display =
        mode === 'overview' || mode === 'free' ? 'block' : 'none';
    }
  }

  // Camera button clicks
  camBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-cam');
      if (!mode) return;
      updateCamButtons(mode);
      railwayEngine?.setCameraMode?.(mode);
    });
  });

  // Snap back button click
  snapBtn?.addEventListener('click', () => {
    updateCamButtons('cab');
    railwayEngine?.snapBack?.('cab');
    if (statusEl) statusEl.textContent = 'Camera snapped back to driver cab.';
  });

  // Dynamic corridor track profile population
  corridorSelect?.addEventListener('change', () => {
    const corridorId = corridorSelect.value;
    const corridor = RAIL_CORRIDORS[corridorId];
    if (corridor && trackSelect) {
      trackSelect.innerHTML = Object.entries(corridor.trackProfiles)
        .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
        .join('');
      if (corridor.defaultSpeedMph && speedSlider && speedLabel) {
        speedSlider.value = corridor.defaultSpeedMph;
        speedLabel.textContent = `${corridor.defaultSpeedMph} mph`;
      }
    }
  });

  speedSlider?.addEventListener('input', () => {
    if (speedLabel) speedLabel.textContent = `${speedSlider.value} mph`;
  });

  tabPreset?.addEventListener('click', () => {
    activeMode = 'preset';
    tabPreset.style.background = '#21262d';
    tabPreset.style.color = '#fbbf24';
    tabCustom.style.background = 'transparent';
    tabCustom.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'flex';
    if (customSection) customSection.style.display = 'none';
  });

  tabCustom?.addEventListener('click', () => {
    activeMode = 'custom';
    tabCustom.style.background = '#21262d';
    tabCustom.style.color = '#fbbf24';
    tabPreset.style.background = 'transparent';
    tabPreset.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'none';
    if (customSection) customSection.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => close());

  clearBtn?.addEventListener('click', () => {
    if (telemInterval) {
      clearInterval(telemInterval);
      telemInterval = null;
    }
    railwayEngine?.clearActiveRailRoute?.();
    dock.notifySimulationStopped('rail');
    updateCamButtons('cab');
    if (statusEl) statusEl.textContent = 'Train run stopped.';
  });

  function startTelemetryPolling() {
    if (telemInterval) clearInterval(telemInterval);
    telemInterval = setInterval(() => {
      if (drawer.style.display === 'none') return;
      const telem = railwayEngine?.getActiveTelemetry?.();
      if (telem && statusEl) {
        const nextInfo = telem.nextStation
          ? ` | Next: ${telem.nextStation}${telem.distToNextMi ? ` (${telem.distToNextMi}mi)` : ''}`
          : '';
        statusEl.innerHTML = `<span style="color: #fbbf24; font-weight: 600;">${telem.trainName}</span> (${telem.speedMph} mph)${nextInfo} | Trip ${telem.progressPct}%`;

        if (telem.cameraMode && telem.cameraMode !== selectedCamMode) {
          updateCamButtons(telem.cameraMode);
        }
      }
    }, 1000);
  }

  const dock = getGlobalDrawerCoordinator();

  launchBtn?.addEventListener('click', async () => {
    dock.notifySimulationStarted('rail');
    const isCabRide = selectedCamMode === 'cab';
    const speedMph = Number(speedSlider?.value) || 45;

    let fromQuery;
    let toQuery;
    let corridorProfile;

    if (activeMode === 'preset') {
      fromQuery = corridorSelect?.value || 'atlanta_marta_east';
      toQuery = null;
      corridorProfile = trackSelect?.value || 'csx_mainline';
    } else {
      fromQuery = fromInput?.value?.trim() || '33.7561, -84.3403';
      toQuery = toInput?.value?.trim() || '33.7505, -84.3862';
      corridorProfile = 'custom_mainline';
    }

    if (statusEl)
      statusEl.textContent = 'Engaging throttle and plotting rail line...';

    try {
      const route = await railwayEngine?.spawnRailRoute(fromQuery, toQuery, {
        corridor: corridorProfile,
        cabRide: isCabRide,
        speedMph,
        useOverpass: true,
      });

      if (route && statusEl) {
        const km = (route.corridor.totalDistanceMeters / 1000).toFixed(1);
        const carsTotal = (route.carsCount || 4) + 1;
        statusEl.textContent = `En route: ${km} km @ ${speedMph} mph | ${carsTotal}-car consist (ETA: ${route.durationSec}s)`;
        startTelemetryPolling();
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err?.message || err}`;
    }
  });

  function open() {
    dock.notifyDrawerOpened('rail');
    drawer.classList.remove('hidden');
    drawer.style.display = 'flex';
    drawer.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    });
    if (railwayEngine?.getActiveRoute?.()) {
      startTelemetryPolling();
    }
  }

  function close() {
    drawer.classList.add('hidden');
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    drawer.style.display = 'none';
    dock.notifyDrawerClosed('rail');
    if (telemInterval) {
      clearInterval(telemInterval);
      telemInterval = null;
    }
  }

  // Floating launch trigger button on HUD
  // Positioned at bottom: 74px, right: 76px (cleanly beside flight launcher ✈️ at right: 24px)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-rail-launcher-button';
  launcherButton.title = 'World of Rails Simulator';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 76px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.9);
    border: 1px solid rgba(245, 158, 11, 0.5);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    color: #fbbf24;
    font-size: 20px;
    cursor: pointer;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, border-color 0.2s ease;
    pointer-events: auto;
  `;
  launcherButton.innerHTML = '🚆';
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

  dock.registerDrawer('rail', {
    open: () => open(),
    close: () => close(),
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    launcherEl: launcherButton,
  });

  dock.registerSimulation('rail', {
    stop: () => {
      railwayEngine?.clearActiveRailRoute?.();
      dock.notifySimulationStopped('rail');
    },
    isActive: () => Boolean(railwayEngine?.getActiveRoute?.()),
  });

  const unsubscribeSimState = dock.onSimulationStateChange?.((evt) => {
    if (evt?.type === 'started' && evt.id === 'rail') {
      startTelemetryPolling();
    }
  });

  return {
    open,
    close,
    isOpen: () => !drawer.classList.contains('hidden'),
    destroy: () => {
      unsubscribeSimState?.();
      if (telemInterval) {
        clearInterval(telemInterval);
        telemInterval = null;
      }
      dock.unregisterSimulation('rail');
      dock.unregisterDrawer('rail');
      drawer.remove();
      launcherButton.remove();
    },
  };
}
