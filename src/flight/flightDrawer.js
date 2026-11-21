/**
 * Standalone Drawer Modal for Great-Circle Flight Simulator.
 * Allows users to choose departure and arrival waypoints, create custom routes,
 * toggle Cockpit camera, and launch instant 3D simulated flights across the globe.
 */

import { AIRPORT_WAYPOINTS } from './syntheticFlightEngine.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createFlightDrawer({
  flightEngine = null,
  container = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  if (!container || typeof document === 'undefined') {
    return { destroy: () => {}, open: () => {}, close: () => {} };
  }

  const drawer = document.createElement('div');
  drawer.className = 'gev-flight-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 340px;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(0, 255, 204, 0.4);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
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
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">✈️</span>
        <strong style="font-size: 14px; letter-spacing: 0.5px; color: #00ffcc;">FLIGHT SIMULATOR</strong>
      </div>
      <button class="gev-flight-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Switcher: Preset Hubs vs Custom Flight -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d;">
      <button class="gev-flight-tab-preset" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #00ffcc; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Preset Hubs
      </button>
      <button class="gev-flight-tab-custom" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        Custom Route
      </button>
    </div>

    <!-- Preset Hubs Section -->
    <div class="gev-flight-preset-section" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Origin Hub</label>
        <select class="gev-flight-from-preset" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          ${Object.entries(AIRPORT_WAYPOINTS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === 'ATL' ? 'selected' : ''}>${k} - ${v.name}</option>`,
            )
            .join('')}
        </select>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Destination Hub</label>
        <select class="gev-flight-to-preset" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;">
          ${Object.entries(AIRPORT_WAYPOINTS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === 'MIA' ? 'selected' : ''}>${k} - ${v.name}</option>`,
            )
            .join('')}
        </select>
      </div>
    </div>

    <!-- Custom Route Section (Initially Hidden) -->
    <div class="gev-flight-custom-section" style="display: none; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Custom Departure</label>
        <input type="text" class="gev-flight-from-input" placeholder="e.g. MIA, Key West, 25.76,-80.19" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="MIA" />
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Custom Destination</label>
        <input type="text" class="gev-flight-to-input" placeholder="e.g. EYW, Key West, London, JFK" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 12px; outline: none;" value="EYW" />
      </div>
    </div>

    <!-- Flight Parameters: Altitude & Speed -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 10px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Altitude</label>
        <select class="gev-flight-alt" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 6px; font-size: 11px; outline: none;">
          <option value="10668" selected>35k ft (Cruise)</option>
          <option value="4572">15k ft (Medium)</option>
          <option value="1524">5k ft (Scenic)</option>
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 10px; text-transform: uppercase; color: #8b949e; font-weight: 600;">Pace / Duration</label>
        <select class="gev-flight-duration" style="background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 6px; font-size: 11px; outline: none;">
          <option value="auto" selected>Real-Time (1x Authentic)</option>
          <option value="300">300s (Preview)</option>
          <option value="180">180s (Fast)</option>
          <option value="60">60s (Express)</option>
        </select>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 8px;">
      <input type="checkbox" id="gev-flight-cockpit-toggle" style="cursor: pointer; accent-color: #00ffcc;" checked>
      <label for="gev-flight-cockpit-toggle" style="font-size: 12px; color: #c9d1d9; cursor: pointer;">First-Person Cockpit View</label>
    </div>

    <div class="gev-flight-status" style="font-size: 11px; color: #8b949e; min-height: 14px; text-align: center;"></div>

    <div style="display: flex; gap: 8px; margin-top: 2px;">
      <button class="gev-flight-launch" style="flex: 1; background: linear-gradient(135deg, #00ffcc, #0284c7); border: none; border-radius: 8px; color: #0d1117; font-weight: 700; font-size: 13px; padding: 10px; cursor: pointer; transition: filter 0.15s ease;">
        🚀 Launch Flight
      </button>
      <button class="gev-flight-clear" style="background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #8b949e; font-size: 12px; padding: 10px; cursor: pointer;" title="Stop active flight">
        Stop
      </button>
    </div>
  `;

  container.appendChild(drawer);

  const closeBtn = drawer.querySelector('.gev-flight-close');
  const launchBtn = drawer.querySelector('.gev-flight-launch');
  const clearBtn = drawer.querySelector('.gev-flight-clear');
  const fromPreset = drawer.querySelector('.gev-flight-from-preset');
  const toPreset = drawer.querySelector('.gev-flight-to-preset');
  const fromInput = drawer.querySelector('.gev-flight-from-input');
  const toInput = drawer.querySelector('.gev-flight-to-input');
  const altSelect = drawer.querySelector('.gev-flight-alt');
  const durationSelect = drawer.querySelector('.gev-flight-duration');
  const cockpitCheckbox = drawer.querySelector('#gev-flight-cockpit-toggle');
  const tabPreset = drawer.querySelector('.gev-flight-tab-preset');
  const tabCustom = drawer.querySelector('.gev-flight-tab-custom');
  const presetSection = drawer.querySelector('.gev-flight-preset-section');
  const customSection = drawer.querySelector('.gev-flight-custom-section');
  const statusEl = drawer.querySelector('.gev-flight-status');

  let activeMode = 'preset';

  tabPreset?.addEventListener('click', () => {
    activeMode = 'preset';
    tabPreset.style.background = '#21262d';
    tabPreset.style.color = '#00ffcc';
    tabCustom.style.background = 'transparent';
    tabCustom.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'flex';
    if (customSection) customSection.style.display = 'none';
  });

  tabCustom?.addEventListener('click', () => {
    activeMode = 'custom';
    tabCustom.style.background = '#21262d';
    tabCustom.style.color = '#00ffcc';
    tabPreset.style.background = 'transparent';
    tabPreset.style.color = '#8b949e';
    if (presetSection) presetSection.style.display = 'none';
    if (customSection) customSection.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => close());
  clearBtn?.addEventListener('click', () => {
    flightEngine?.clearActiveFlight();
    if (statusEl) statusEl.textContent = 'Flight cleared.';
  });

  const dock = getGlobalDrawerCoordinator();

  launchBtn?.addEventListener('click', async () => {
    dock.notifySimulationStarted('flight');
    const from =
      activeMode === 'preset'
        ? fromPreset?.value || 'ATL'
        : fromInput?.value?.trim() || 'MIA';
    const to =
      activeMode === 'preset'
        ? toPreset?.value || 'MIA'
        : toInput?.value?.trim() || 'EYW';
    const cockpit = cockpitCheckbox?.checked || false;
    const cruiseAlt = Number(altSelect?.value) || 10668;
    const rawDuration = durationSelect?.value;
    const parsedDuration =
      rawDuration && rawDuration !== 'auto' ? Number(rawDuration) : undefined;
    const durationSec =
      Number.isFinite(parsedDuration) && parsedDuration > 0
        ? parsedDuration
        : undefined;

    if (statusEl) statusEl.textContent = `Plotting route: ${from} ➔ ${to}...`;

    try {
      const flight = await flightEngine?.spawnFlightRoute(from, to, {
        cockpit,
        cruiseAlt,
        durationSec,
      });
      if (flight && statusEl) {
        statusEl.textContent = `En route: ${flight.from.code} ➔ ${flight.to.code}`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err?.message || err}`;
    }
  });

  function open() {
    dock.notifyDrawerOpened('flight');
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
    dock.notifyDrawerClosed('flight');
  }

  // Standalone floating launch trigger button on HUD
  // Shifted up by 50px (bottom: 74px) to avoid overlapping the bottom-right language selector (#corner-actions)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-flight-launcher-button';
  launcherButton.title = 'Synthetic Great-Circle Flight Simulator';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.9);
    border: 1px solid rgba(0, 255, 204, 0.5);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    color: #00ffcc;
    font-size: 20px;
    cursor: pointer;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, border-color 0.2s ease;
    pointer-events: auto;
  `;
  launcherButton.innerHTML = '✈️';
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

  dock.registerDrawer('flight', {
    open: () => open(),
    close: () => close(),
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    launcherEl: launcherButton,
  });

  dock.registerSimulation('flight', {
    stop: () => flightEngine?.clearActiveFlight?.(),
    isActive: () => Boolean(flightEngine?.getActiveFlight?.()),
  });

  return {
    open,
    close,
    destroy: () => {
      dock.unregisterSimulation('flight');
      drawer.remove();
      launcherButton.remove();
    },
  };
}
