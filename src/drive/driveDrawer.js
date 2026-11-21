/**
 * Standalone Drawer Modal for Infinite Drive Simulator.
 * (Infinite Drive Autonomous Highway Cruiser & Traffic Follower)
 *
 * Allows users to choose iconic highway corridors (Bullrun, Atlanta-Savannah, PCH, etc.),
 * enter custom point-to-point coordinates, latch onto synthetic traffic, adjust cruising
 * speeds, toggle First-Person Driver's Seat / Cockpit, Chase, and News Copter cameras, and
 * launch instant 3D simulated drives across planetary Cesium terrain.
 */

import { DRIVE_CORRIDORS } from './driveWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createDriveDrawer({
  driveEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container || typeof document === 'undefined') {
    return {
      destroy: () => {},
      open: () => {},
      close: () => {},
      onTrafficLatched: () => {},
    };
  }

  const drawer = document.createElement('div');
  drawer.className = 'gev-drive-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 350px;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(6, 182, 212, 0.4);
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
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(6, 182, 212, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🚗</span>
        <div>
          <strong style="font-size: 13px; letter-spacing: 0.5px; color: #22d3ee;">INFINITE DRIVE</strong>
          <div style="font-size: 10px; color: #8b949e;">Highway Cruiser & Traffic Follower</div>
        </div>
      </div>
      <button class="gev-drive-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Switcher: Presets vs Custom vs Traffic Stalker -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d;">
      <button class="gev-drive-tab-preset" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #22d3ee; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Presets
      </button>
      <button class="gev-drive-tab-custom" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Custom
      </button>
      <button class="gev-drive-tab-stalker" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Traffic Follow
      </button>
    </div>

    <!-- Preset Corridors Section -->
    <div class="gev-drive-preset-section" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Highway Corridor</label>
        <select class="gev-drive-corridor-select" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          ${Object.entries(DRIVE_CORRIDORS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === 'cannonball_bullrun' ? 'selected' : ''}>${v.name}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="gev-drive-corridor-desc" style="font-size: 11px; color: #8b949e; line-height: 1.4; background: #161b22; padding: 8px; border-radius: 6px; border-left: 2px solid #22d3ee;">
        ${DRIVE_CORRIDORS.cannonball_bullrun.description}
      </div>
    </div>

    <!-- Custom Route Section (Initially Hidden) -->
    <div class="gev-drive-custom-section" style="display: none; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Origin Coordinates (Lat,Lon)</label>
        <input type="text" class="gev-drive-from-input" placeholder="e.g. 33.7490, -84.3880" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="33.7490, -84.3880" />
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Destination Coordinates (Lat,Lon)</label>
        <input type="text" class="gev-drive-to-input" placeholder="e.g. 32.0809, -81.0912" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="32.0809, -81.0912" />
      </div>
    </div>

    <!-- Traffic Stalker Section (Initially Hidden) -->
    <div class="gev-drive-stalker-section" style="display: none; flex-direction: column; gap: 10px;">
      <div style="font-size: 11px; color: #8b949e; line-height: 1.4; background: #161b22; padding: 8px; border-radius: 6px; border-left: 2px solid #f59e0b;">
        Click any traffic dot directly on the map to latch and follow it, or click below to lock onto the traffic contact closest to your view center.
      </div>
      <button class="gev-drive-latch-btn" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
        <span>🎯</span> Latch Onto Nearest Traffic Dot
      </button>
    </div>

    <!-- Speed Slider -->
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #8b949e; font-weight: 600;">
        <span>CRUISING SPEED</span>
        <span class="gev-drive-speed-val" style="color: #22d3ee;">95 MPH</span>
      </div>
      <input type="range" class="gev-drive-speed-slider" min="25" max="140" value="95" step="5" style="width: 100%; accent-color: #06b6d4; cursor: pointer;" />
    </div>

    <!-- Camera View Mode Buttons -->
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Camera View Mode</label>
      <div style="display: flex; gap: 4px;">
        <button class="gev-drive-cam-chase" style="flex: 1; background: #0284c7; color: #ffffff; border: 1px solid #38bdf8; border-radius: 6px; padding: 6px 2px; font-size: 10px; font-weight: 600; cursor: pointer;">
          🚗 Chase
        </button>
        <button class="gev-drive-cam-seat" style="flex: 1; background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 6px; padding: 6px 2px; font-size: 10px; font-weight: 600; cursor: pointer;">
          💺 Cockpit
        </button>
        <button class="gev-drive-cam-copter" style="flex: 1; background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 6px; padding: 6px 2px; font-size: 10px; font-weight: 600; cursor: pointer;">
          🚁 Copter
        </button>
        <button class="gev-drive-cam-overview" style="flex: 1; background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 6px; padding: 6px 2px; font-size: 10px; font-weight: 600; cursor: pointer;" title="Tactical high-altitude satellite view">
          🛰️ Overview
        </button>
        <button class="gev-drive-cam-free" style="flex: 1; background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 6px; padding: 6px 2px; font-size: 10px; font-weight: 600; cursor: pointer;" title="Free camera to pan globe while car continues cruising">
          🔓 Free Cam
        </button>
      </div>
      <button class="gev-drive-snap-btn" style="display: none; background: rgba(34, 211, 238, 0.2); border: 1px solid #22d3ee; color: #22d3ee; border-radius: 6px; padding: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-align: center; margin-top: 4px;">
        🎯 Snap Back to Car
      </button>
    </div>

    <!-- Hesitation & Slowdown Checkbox -->
    <div style="display: flex; align-items: center; gap: 8px;">
      <input type="checkbox" id="gev-drive-hesitation" class="gev-drive-hesitation" checked style="accent-color: #06b6d4; cursor: pointer;" />
      <label for="gev-drive-hesitation" style="font-size: 11px; color: #e6edf3; cursor: pointer;">
        Realistic Curve Slowdowns & Traffic Hesitation
      </label>
    </div>

    <!-- Status & Telemetry Readout -->
    <div class="gev-drive-status" style="font-size: 11px; color: #8b949e; min-height: 16px;">
      Ready to cruise.
    </div>

    <!-- Action Buttons -->
    <div style="display: flex; gap: 8px; margin-top: 4px;">
      <button class="gev-drive-start-btn" style="flex: 2; background: #0284c7; border: 1px solid #38bdf8; border-radius: 8px; color: #ffffff; font-size: 12px; font-weight: 600; padding: 10px; cursor: pointer; transition: background 0.15s ease;">
        🚀 Start Drive
      </button>
      <button class="gev-drive-stop-btn" style="flex: 1; background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #f85149; font-size: 12px; font-weight: 600; padding: 10px; cursor: pointer; transition: background 0.15s ease;">
        ⏹️ Pull Over
      </button>
    </div>
  `;

  container.appendChild(drawer);

  // Tab switching logic
  const tabPreset = drawer.querySelector('.gev-drive-tab-preset');
  const tabCustom = drawer.querySelector('.gev-drive-tab-custom');
  const tabStalker = drawer.querySelector('.gev-drive-tab-stalker');
  const presetSection = drawer.querySelector('.gev-drive-preset-section');
  const customSection = drawer.querySelector('.gev-drive-custom-section');
  const stalkerSection = drawer.querySelector('.gev-drive-stalker-section');
  const startBtn = drawer.querySelector('.gev-drive-start-btn');
  const stopBtn = drawer.querySelector('.gev-drive-stop-btn');
  const latchBtn = drawer.querySelector('.gev-drive-latch-btn');
  const statusEl = drawer.querySelector('.gev-drive-status');
  const closeBtn = drawer.querySelector('.gev-drive-close');
  const hesitationCheckbox = drawer.querySelector('.gev-drive-hesitation');

  let activeMode = 'preset'; // 'preset' | 'custom' | 'stalker'
  let activeCamera = 'chase'; // 'chase' (default) | 'seat' | 'copter'

  function switchTab(mode) {
    activeMode = mode;
    tabPreset.style.background = mode === 'preset' ? '#21262d' : 'transparent';
    tabPreset.style.color = mode === 'preset' ? '#22d3ee' : '#8b949e';

    tabCustom.style.background = mode === 'custom' ? '#21262d' : 'transparent';
    tabCustom.style.color = mode === 'custom' ? '#22d3ee' : '#8b949e';

    tabStalker.style.background =
      mode === 'stalker' ? '#21262d' : 'transparent';
    tabStalker.style.color = mode === 'stalker' ? '#fbbf24' : '#8b949e';

    presetSection.style.display = mode === 'preset' ? 'flex' : 'none';
    customSection.style.display = mode === 'custom' ? 'flex' : 'none';
    stalkerSection.style.display = mode === 'stalker' ? 'flex' : 'none';

    if (mode === 'stalker') {
      startBtn.innerHTML = '🎯 Latch Traffic';
    } else {
      startBtn.innerHTML = '🚀 Start Drive';
    }
  }

  tabPreset.addEventListener('click', () => switchTab('preset'));
  tabCustom.addEventListener('click', () => switchTab('custom'));
  tabStalker.addEventListener('click', () => switchTab('stalker'));

  // Camera button switching logic
  const camSeatBtn = drawer.querySelector('.gev-drive-cam-seat');
  const camChaseBtn = drawer.querySelector('.gev-drive-cam-chase');
  const camCopterBtn = drawer.querySelector('.gev-drive-cam-copter');
  const camOverviewBtn = drawer.querySelector('.gev-drive-cam-overview');
  const camFreeBtn = drawer.querySelector('.gev-drive-cam-free');
  const snapBtn = drawer.querySelector('.gev-drive-snap-btn');

  function switchCamera(cam) {
    activeCamera = cam;
    const highlight = (btn, active) => {
      if (!btn) return;
      btn.style.background = active ? '#0284c7' : '#21262d';
      btn.style.color = active ? '#ffffff' : '#8b949e';
      btn.style.borderColor = active ? '#38bdf8' : '#30363d';
    };
    highlight(camChaseBtn, cam === 'chase');
    highlight(camSeatBtn, cam === 'seat');
    highlight(camCopterBtn, cam === 'copter');
    highlight(camOverviewBtn, cam === 'overview');
    highlight(camFreeBtn, cam === 'free');

    if (snapBtn) {
      snapBtn.style.display =
        cam === 'overview' || cam === 'free' ? 'block' : 'none';
    }

    if (driveEngine && typeof driveEngine.setCameraMode === 'function') {
      driveEngine.setCameraMode(cam);
    }
  }

  camChaseBtn?.addEventListener('click', () => switchCamera('chase'));
  camSeatBtn?.addEventListener('click', () => switchCamera('seat'));
  camCopterBtn?.addEventListener('click', () => switchCamera('copter'));
  camOverviewBtn?.addEventListener('click', () => switchCamera('overview'));
  camFreeBtn?.addEventListener('click', () => switchCamera('free'));
  snapBtn?.addEventListener('click', () => {
    if (driveEngine && typeof driveEngine.snapBack === 'function') {
      driveEngine.snapBack('chase');
    }
    switchCamera('chase');
  });

  // Corridor select change
  const corridorSelect = drawer.querySelector('.gev-drive-corridor-select');
  const corridorDesc = drawer.querySelector('.gev-drive-corridor-desc');
  const speedSlider = drawer.querySelector('.gev-drive-speed-slider');
  const speedVal = drawer.querySelector('.gev-drive-speed-val');

  corridorSelect.addEventListener('change', () => {
    const corridor = DRIVE_CORRIDORS[corridorSelect.value];
    if (corridor) {
      corridorDesc.textContent = corridor.description;
      speedSlider.value = String(corridor.defaultSpeedMph || 75);
      speedVal.textContent = `${speedSlider.value} MPH`;
    }
  });

  speedSlider.addEventListener('input', () => {
    speedVal.textContent = `${speedSlider.value} MPH`;
  });

  closeBtn.addEventListener('click', () => close());

  stopBtn.addEventListener('click', () => {
    stopTelemetryTimer();
    hudStrip.style.display = 'none';
    if (driveEngine && typeof driveEngine.pullOver === 'function') {
      const res = driveEngine.pullOver();
      if (res?.status === 'parked') {
        statusEl.textContent = 'Vehicle pulled over & parked. Camera released.';
        stopBtn.innerHTML = '🗑️ Clear Car';
        stopBtn.style.color = '#f59e0b';
      } else {
        statusEl.textContent = 'Drive halted. Parked.';
        stopBtn.innerHTML = '⏹️ Pull Over';
        stopBtn.style.color = '#f85149';
      }
    } else if (driveEngine && typeof driveEngine.stopDrive === 'function') {
      driveEngine.stopDrive();
      statusEl.textContent = 'Drive halted. Parked.';
    }
    dock.notifySimulationStopped('drive');
  });

  function formatDriveRouteBadge(
    routeStatus,
    routeFallbackReason,
    compact = false,
  ) {
    if (routeStatus === 'osrm') {
      return compact ? '🛣️ OSRM' : '🛣️ OSRM Road Route';
    }
    if (routeStatus === 'partial_osrm') {
      const reason = routeFallbackReason ? ` (${routeFallbackReason})` : '';
      return compact ? `⚠️ Partial OSRM${reason}` : `⚠️ Partial OSRM${reason}`;
    }
    if (routeStatus === 'straight_fallback') {
      const reason = routeFallbackReason ? ` (${routeFallbackReason})` : '';
      return compact
        ? `⚠️ Straight Fallback${reason}`
        : `⚠️ Straight-Line Fallback${reason}`;
    }
    return '';
  }

  async function launchDrive() {
    if (!driveEngine) return;
    statusEl.textContent = 'Preparing highway cruiser...';
    stopBtn.innerHTML = '⏹️ Pull Over';
    stopBtn.style.color = '#f85149';

    const speedMph = Number(speedSlider.value);
    const hesitation = hesitationCheckbox.checked;

    try {
      if (activeMode === 'preset') {
        const corridorKey = corridorSelect.value;
        statusEl.textContent =
          'Snapping highway corridor to real OSRM roads...';
        const res = await driveEngine.startRouteDrive(corridorKey, null, {
          speedMph,
          hesitation,
          cameraMode: activeCamera,
          seat: activeCamera === 'seat',
        });
        if (res) {
          dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
          const badge = formatDriveRouteBadge(
            res.routeStatus,
            res.routeFallbackReason,
          );
          statusEl.textContent = badge
            ? `${badge} · [${res.corridor.name}] at ${res.speedMph} mph`
            : `Cruising [${res.corridor.name}] at ${res.speedMph} mph`;
          startTelemetryTimer();
        }
      } else if (activeMode === 'custom') {
        const fromInput = drawer.querySelector('.gev-drive-from-input').value;
        const toInput = drawer.querySelector('.gev-drive-to-input').value;
        const res = await driveEngine.startRouteDrive(fromInput, toInput, {
          speedMph,
          hesitation,
          cameraMode: activeCamera,
          seat: activeCamera === 'seat',
        });
        if (res) {
          dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
          const badge = formatDriveRouteBadge(
            res.routeStatus,
            res.routeFallbackReason,
          );
          statusEl.textContent = badge
            ? `${badge} · Cruising at ${res.speedMph} mph`
            : `Cruising custom route at ${res.speedMph} mph`;
          startTelemetryTimer();
        }
      } else if (activeMode === 'stalker') {
        const res = driveEngine.latchOntoTraffic(null, {
          speedMph,
          cameraMode: activeCamera,
          seat: activeCamera === 'seat',
        });
        if (res) {
          dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
          statusEl.textContent = res.isTrafficStalker
            ? `Latched on VEH-${String(res.dotId).padStart(4, '0')} (${res.speedMph} mph)`
            : `Cruising along road network at ${res.speedMph} mph`;
          startTelemetryTimer();
        }
      }
    } catch (err) {
      statusEl.textContent = `Error: ${err?.message || err}`;
    }
  }

  startBtn.addEventListener('click', launchDrive);
  latchBtn.addEventListener('click', () => {
    switchTab('stalker');
    launchDrive();
  });

  function onTrafficLatched(dot, res) {
    switchTab('stalker');
    dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
    const vehId = `VEH-${String(dot.id).padStart(4, '0')}`;
    const speed = res?.speedMph || Math.round((dot.mps || 18) * 2.23694);
    statusEl.textContent = `Latched on ${vehId} · Cruising with traffic at ${speed} mph`;
    speedSlider.value = String(Math.max(25, Math.min(140, speed)));
    speedVal.textContent = `${speedSlider.value} MPH`;
    stopBtn.innerHTML = '⏹️ Pull Over';
    stopBtn.style.color = '#f85149';
    startTelemetryTimer();
  }

  if (driveEngine && typeof driveEngine.onTrafficLatched === 'function') {
    driveEngine.onTrafficLatched(onTrafficLatched);
  }

  // Floating Active Drive Real-Time Telemetry HUD Strip
  const hudStrip = document.createElement('div');
  hudStrip.className = 'gev-drive-hud-strip';
  hudStrip.style.cssText = `
    position: fixed;
    bottom: 132px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(13, 17, 23, 0.92);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(6, 182, 212, 0.4);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    z-index: 10001;
    padding: 8px 16px;
    display: none;
    align-items: center;
    gap: 14px;
    pointer-events: auto;
    transition: opacity 0.25s ease;
  `;
  hudStrip.innerHTML = `
    <div style="display: flex; flex-direction: column; cursor: pointer;" class="gev-drive-hud-info" title="Click to open Drive controls">
      <div class="gev-drive-hud-loc" style="font-size: 12px; font-weight: 700; color: #22d3ee; white-space: nowrap;">🚗 Highway Cruiser</div>
      <div class="gev-drive-hud-sub" style="font-size: 10px; color: #8b949e; white-space: nowrap;">Telemetry syncing...</div>
    </div>
    <div style="display: flex; gap: 6px; align-items: center;">
      <button class="gev-drive-hud-seat" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="First-person driver's seat">
        💺 Cockpit
      </button>
      <button class="gev-drive-hud-chase" style="background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Third-person chase camera">
        🚗 Chase
      </button>
      <button class="gev-drive-hud-zoom" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Overview tactical view from 12km altitude">
        🛰️ Zoom Out
      </button>
      <button class="gev-drive-hud-free" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Detach camera to freely pan the map">
        🔓 Free Cam
      </button>
      <button class="gev-drive-hud-snap" style="display: none; background: rgba(34, 211, 238, 0.2); border: 1px solid #22d3ee; border-radius: 6px; color: #22d3ee; font-size: 11px; font-weight: 700; padding: 4px 8px; cursor: pointer; white-space: nowrap;">
        🎯 Snap Back
      </button>
      <button class="gev-drive-hud-stop" style="background: rgba(248, 81, 73, 0.15); border: 1px solid rgba(248, 81, 73, 0.5); border-radius: 6px; color: #f85149; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap;">
        ⏹️ Pull Over
      </button>
    </div>
  `;
  container.appendChild(hudStrip);

  hudStrip
    .querySelector('.gev-drive-hud-info')
    ?.addEventListener('click', open);
  hudStrip
    .querySelector('.gev-drive-hud-seat')
    ?.addEventListener('click', () => switchCamera('seat'));
  hudStrip
    .querySelector('.gev-drive-hud-chase')
    ?.addEventListener('click', () => switchCamera('chase'));
  hudStrip
    .querySelector('.gev-drive-hud-zoom')
    ?.addEventListener('click', () => switchCamera('overview'));
  hudStrip
    .querySelector('.gev-drive-hud-free')
    ?.addEventListener('click', () => switchCamera('free'));
  hudStrip
    .querySelector('.gev-drive-hud-snap')
    ?.addEventListener('click', () => {
      if (driveEngine && typeof driveEngine.snapBack === 'function') {
        driveEngine.snapBack('chase');
      }
      switchCamera('chase');
    });
  hudStrip
    .querySelector('.gev-drive-hud-stop')
    ?.addEventListener('click', () => {
      stopBtn.click();
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
    if (!driveEngine) return;
    const telem = driveEngine.getActiveTelemetry?.();
    if (!telem || telem.isParked) {
      hudStrip.style.display = 'none';
      return;
    }

    hudStrip.style.display = 'flex';
    const locEl = hudStrip.querySelector('.gev-drive-hud-loc');
    const subEl = hudStrip.querySelector('.gev-drive-hud-sub');
    const snapBtnHud = hudStrip.querySelector('.gev-drive-hud-snap');
    const zoomBtnHud = hudStrip.querySelector('.gev-drive-hud-zoom');
    const freeBtnHud = hudStrip.querySelector('.gev-drive-hud-free');
    const seatBtnHud = hudStrip.querySelector('.gev-drive-hud-seat');
    const chaseBtnHud = hudStrip.querySelector('.gev-drive-hud-chase');

    if (locEl) {
      locEl.textContent = `🚗 ${telem.currentLocation} · ${telem.speedMph} mph`;
    }
    if (subEl) {
      if (telem.isTrafficStalker) {
        subEl.textContent = `Traffic Follow VEH-${String(telem.dotId).padStart(4, '0')} · Camera: ${telem.cameraMode.toUpperCase()}`;
      } else {
        const next = telem.nextLocation
          ? `Next: ${telem.nextLocation} (${telem.distToNextMi} mi) · `
          : '';
        const badge = formatDriveRouteBadge(
          telem.routeStatus,
          telem.routeFallbackReason,
          true,
        );
        const routePrefix = badge ? `${badge} · ` : '';
        subEl.textContent = `${routePrefix}${next}Mile ${telem.distTraveledMi} of ${telem.totalDistMi} mi · Progress: ${telem.progressPct}%`;
      }
    }

    if (snapBtnHud) {
      snapBtnHud.style.display =
        telem.cameraMode === 'overview' || telem.cameraMode === 'free'
          ? 'inline-flex'
          : 'none';
    }
    if (zoomBtnHud) {
      zoomBtnHud.style.background =
        telem.cameraMode === 'overview' ? '#0284c7' : '#21262d';
      zoomBtnHud.style.color =
        telem.cameraMode === 'overview' ? '#ffffff' : '#8b949e';
    }
    if (freeBtnHud) {
      freeBtnHud.style.background =
        telem.cameraMode === 'free' ? '#0284c7' : '#21262d';
      freeBtnHud.style.color =
        telem.cameraMode === 'free' ? '#ffffff' : '#8b949e';
    }
    if (seatBtnHud) {
      seatBtnHud.style.background =
        telem.cameraMode === 'seat' ? '#0284c7' : '#21262d';
      seatBtnHud.style.color =
        telem.cameraMode === 'seat' ? '#ffffff' : '#8b949e';
    }
    if (chaseBtnHud) {
      chaseBtnHud.style.background =
        telem.cameraMode === 'chase' ? '#0284c7' : '#21262d';
      chaseBtnHud.style.color =
        telem.cameraMode === 'chase' ? '#ffffff' : '#8b949e';
    }

    if (statusEl) {
      if (telem.isTrafficStalker) {
        statusEl.textContent = `Following VEH-${String(telem.dotId).padStart(4, '0')} at ${telem.speedMph} mph`;
      } else {
        const badge = formatDriveRouteBadge(
          telem.routeStatus,
          telem.routeFallbackReason,
        );
        const prefix = badge ? `${badge} · ` : '';
        statusEl.textContent = `${prefix}${telem.currentLocation} · Next: ${telem.nextLocation} (${telem.distToNextMi} mi) · ${telem.speedMph} mph · Progress: ${telem.progressPct}%`;
      }
    }
  }

  const dock = getGlobalDrawerCoordinator();

  function open() {
    dock.notifyDrawerOpened('drive');
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
    dock.notifyDrawerClosed('drive');
  }

  // Floating launch trigger button on HUD
  // Positioned at bottom: 74px, right: 128px (cleanly between rails 🚆 at 76px and flight ✈️ at 24px)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-drive-launcher-button';
  launcherButton.title = 'Infinite Drive Simulator';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 128px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.9);
    border: 1px solid rgba(6, 182, 212, 0.5);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    color: #22d3ee;
    font-size: 20px;
    cursor: pointer;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, border-color 0.2s ease;
    pointer-events: auto;
  `;
  launcherButton.innerHTML = '🚗';
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

  dock.registerDrawer('drive', {
    open: () => open(),
    close: () => close(),
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    launcherEl: launcherButton,
  });

  dock.registerSimulation('drive', {
    stop: () => {
      driveEngine?.clearActiveDrive?.();
      dock.notifySimulationStopped('drive');
    },
    isActive: () => {
      const telem = driveEngine?.getActiveTelemetry?.();
      return Boolean(telem && !telem.isParked);
    },
  });

  dock.registerOverlayGroup('drive-hud', {
    elements: [hudStrip],
  });

  // Sync the Drive telemetry & camera HUD strip whenever any external caller
  // (e.g. Connect Places, Estate departure, deeplink, AgentBridge) launches a drive.
  const unsubscribeSimState = dock.onSimulationStateChange?.((evt) => {
    if (evt?.type === 'started' && evt.id === 'drive') {
      startTelemetryTimer();
    } else if (evt?.type === 'stopped' && evt.id === 'drive') {
      stopTelemetryTimer();
      hudStrip.style.display = 'none';
    }
  });

  async function startCustomDrive(origin, destination, options = {}) {
    if (!driveEngine) return null;
    const fromStr =
      typeof origin === 'string' ? origin : `${origin.lat},${origin.lon}`;
    const toStr =
      typeof destination === 'string'
        ? destination
        : `${destination.lat},${destination.lon}`;
    const speedMph = options.speedMph || 75;
    const res = await driveEngine.startRouteDrive(fromStr, toStr, {
      speedMph,
      cameraMode: activeCamera || 'chase',
      seat: activeCamera === 'seat',
      vehicleName: options.vehicleName || 'Electric Sedan',
      useOsrm: true,
      ...options,
    });
    if (res) {
      dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
      const badge = formatDriveRouteBadge(
        res.routeStatus,
        res.routeFallbackReason,
      );
      statusEl.textContent = badge
        ? `${badge} · Cruising road trip at ${res.speedMph} mph`
        : `Cruising road trip at ${res.speedMph} mph`;
      startTelemetryTimer();
    }
    return res;
  }

  return {
    open,
    close,
    startCustomDrive,
    onTrafficLatched,
    destroy: () => {
      stopTelemetryTimer();
      unsubscribeSimState?.();
      dock.unregisterOverlayGroup('drive-hud');
      dock.unregisterSimulation('drive');
      dock.unregisterDrawer('drive');
      hudStrip.remove();
      drawer.remove();
      launcherButton.remove();
    },
  };
}
