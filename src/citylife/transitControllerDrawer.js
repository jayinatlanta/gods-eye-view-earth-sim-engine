/**
 * Standalone Drawer Modal & HUD Launcher for Transit Controller & Motorman Sim.
 * (Public Transit & Transit Controller)
 *
 * Implements:
 * - Floating HUD trigger button at `bottom: 74px; right: 284px` with 'T' keyboard shortcut
 * - Tab 1: Fleet & Live Tracker (Bus fleet, Metro heavy rail, camera latches, passenger telemetry)
 * - Tab 2: Playable Motorman Driving Sim (Throttle/Brake notches, Door interlocks, Kneel, Live scoring)
 * - Tab 3: Central Transit Dispatcher (Anti-bunching radar, Headway spacing, Hold/Express dispatch orders)
 */

import { MUNICIPAL_BUS_ROUTES } from '../layers/citylife/syntheticBusEngine.js';
import { RAPID_TRANSIT_ROUTES } from '../layers/citylife/syntheticMetroEngine.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createTransitControllerDrawer({
  busEngine = null,
  metroEngine = null,
  passengerFlow = null,
  motormanControls = null,
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

  const dock = getGlobalDrawerCoordinator();
  let isOpen = false;
  let activeTab = 'fleet'; // 'fleet', 'motorman', 'dispatcher'
  let activeMode = 'bus'; // 'bus' or 'metro'
  let activeCityId = '';
  let activeLineFilter = 'all';
  let showSystemLines = true;
  let refreshInterval = null;

  // Drawer Shell
  const drawer = document.createElement('div');
  drawer.className = 'gev-transit-drawer hidden';
  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 380px;
    max-width: calc(100vw - 32px);
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(56, 189, 248, 0.45);
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
    overflow-x: hidden;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    pointer-events: none;
    opacity: 0;
    transform: translateY(16px);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🚊</span>
        <div>
          <strong style="font-size: 13px; letter-spacing: 0.5px; color: #38bdf8;">TRANSIT CONTROLLER & MOTORMAN</strong>
          <div style="font-size: 10px; color: #8b949e;">Synthetic Public Transit & Multi-Line Metro</div>
        </div>
      </div>
      <button class="gev-transit-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Tabs: Fleet vs Motorman vs Dispatcher -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d; width: 100%; box-sizing: border-box;">
      <button class="gev-transit-tab-fleet" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #38bdf8; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🚌 Bus Fleet
      </button>
      <button class="gev-transit-tab-motorman" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🕹️ Motorman
      </button>
      <button class="gev-transit-tab-dispatcher" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        📡 Dispatcher
      </button>
    </div>

    <!-- Tab 1: Fleet & Live Tracker -->
    <div class="gev-transit-panel-fleet" style="display: flex; flex-direction: column; gap: 10px; width: 100%; box-sizing: border-box;">
      <!-- City / Network Dropdown (Full Width) -->
      <div style="width: 100%; box-sizing: border-box;">
        <select class="gev-transit-city-select" style="width: 100%; box-sizing: border-box; background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; font-size: 11px; outline: none; cursor: pointer; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
          <option value="">Select a transit network...</option>
          <option value="atlanta">🍑 Atlanta (MARTA — 4 Rail Lines & Streetcar)</option>
          <option value="los_angeles">🌴 Los Angeles (LA Metro — 6 Lines)</option>
          <option value="san_francisco">🌁 San Francisco (BART & SF Muni)</option>
          <option value="washington_dc">🏛️ Washington, D.C. (WMATA — 6 Lines)</option>
          <option value="northeast_corridor">🚄 Northeast Corridor (Amtrak NEC: Boston ↔ DC)</option>
          <option value="chicago">🏙️ Chicago (CTA The Loop & Red/Blue)</option>
          <option value="new_york">🗽 New York (MTA Subways — Multi-Line)</option>
          <option value="tokyo">🗾 Tokyo (JR Yamanote & Metro Lines)</option>
          <option value="london">🎡 London (TfL Underground — Multi-Line)</option>
        </select>
      </div>

      <!-- Mode Switcher: Municipal Bus vs Rapid Transit Metro (Dedicated Full-Width Row) -->
      <div class="gev-transit-mode-switcher" style="display: flex; background: #161b22; border-radius: 8px; padding: 3px; border: 1px solid #30363d; box-sizing: border-box; width: 100%; gap: 4px;">
        <button class="gev-transit-mode-bus" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: #21262d; border: 1px solid #38bdf8; border-radius: 6px; color: #38bdf8; font-size: 11px; font-weight: 700; padding: 6px 8px; cursor: pointer; box-sizing: border-box; transition: all 0.15s ease; box-shadow: 0 2px 6px rgba(56, 189, 248, 0.25);" title="Switch to Municipal Bus Fleet & Cameras">
          <span style="font-size: 13px;">🚌</span>
          <span>Bus Fleet</span>
        </button>
        <button class="gev-transit-mode-metro" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 700; padding: 6px 8px; cursor: pointer; box-sizing: border-box; transition: all 0.15s ease;" title="Switch to Rapid Transit Metro & Multi-Line Trains">
          <span style="font-size: 13px;">🚆</span>
          <span>Metro Rail</span>
        </button>
      </div>

      <!-- Line Filter Pill Bar (Metro Mode) -->
      <div class="gev-transit-line-filters" style="display: none; gap: 4px; overflow-x: auto; padding-bottom: 2px;">
        <!-- Injected via updateFleetUI() -->
      </div>

      <!-- Explicit Engage / Map / Lines / Snap / Stop Controls -->
      <div style="display: flex; gap: 5px;">
        <button class="gev-transit-btn-engage" style="flex: 1.25; background: linear-gradient(135deg, #0284c7, #2563eb); border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; font-size: 10px; font-weight: 700; padding: 5px 6px; cursor: pointer; white-space: nowrap;" title="Launch transit network in selected city">
          🚀 Engage
        </button>
        <button class="gev-transit-btn-overview" style="flex: 0.9; background: #1e293b; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; color: #38bdf8; font-size: 10px; font-weight: 600; padding: 5px 4px; cursor: pointer; white-space: nowrap;" title="Fly to full transit network map overview">
          🗺️ Map
        </button>
        <button class="gev-transit-btn-lines" aria-pressed="true" style="flex: 0.9; background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; font-size: 10px; font-weight: 700; padding: 5px 4px; cursor: pointer; white-space: nowrap;" title="Show or hide system route lines & station stops">
          🛤️ Lines
        </button>
        <button class="gev-transit-btn-snapback" style="flex: 0.9; background: #1e293b; border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; color: #4ade80; font-size: 10px; font-weight: 600; padding: 5px 4px; cursor: pointer; white-space: nowrap;" title="Snap camera back to active latched vehicle">
          🎯 Snap
        </button>
        <button class="gev-transit-btn-stop" style="background: #21262d; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; color: #fca5a5; font-size: 10px; font-weight: 600; padding: 5px 7px; cursor: pointer;" title="Stop active transit simulation">
          ⏹️
        </button>
      </div>

      <div class="gev-transit-fleet-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 230px; overflow-y: auto; padding-right: 4px;">
        <!-- Injected via updateFleetUI() -->
      </div>
    </div>

    <!-- Tab 2: Motorman Sim -->
    <div class="gev-transit-panel-motorman" style="display: none; flex-direction: column; gap: 10px;">
      <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-size: 11px; color: #8b949e;">CAB SPEEDOMETER</span>
          <span class="gev-motorman-speed" style="font-size: 20px; font-weight: 700; color: #38bdf8; font-family: monospace;">0 MPH</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #8b949e;">
          <span>THROTTLE: <strong class="gev-motorman-throttle" style="color: #22c55e;">NOTCH 0</strong></span>
          <span>BRAKE: <strong class="gev-motorman-brake" style="color: #ef4444;">RELEASED</strong></span>
          <span>DOORS: <strong class="gev-motorman-doors" style="color: #eab308;">CLOSED</strong></span>
        </div>
      </div>

      <!-- Controls Row -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button class="gev-btn-throttle-up" style="background: #065f46; border: 1px solid #059669; border-radius: 6px; color: #a7f3d0; font-size: 11px; font-weight: 600; padding: 8px; cursor: pointer;">▲ Throttle (W)</button>
        <button class="gev-btn-brake-up" style="background: #7f1d1d; border: 1px solid #b91c1c; border-radius: 6px; color: #fecaca; font-size: 11px; font-weight: 600; padding: 8px; cursor: pointer;">▼ Brake (S)</button>
        <button class="gev-btn-doors" style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: 600; padding: 8px; cursor: pointer;">🚪 Doors (D)</button>
        <button class="gev-btn-horn" style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #cbd5e1; font-size: 11px; font-weight: 600; padding: 8px; cursor: pointer;">📢 Horn (H)</button>
      </div>

      <!-- Live Score Badge -->
      <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: #38bdf8;">OPERATOR SCORE:</span>
        <strong class="gev-motorman-score" style="font-size: 16px; color: #ffffff;">500 PTS</strong>
      </div>
      <div class="gev-motorman-toast" style="font-size: 10px; color: #8b949e; min-height: 14px; text-align: center;">Controls ready. Use W/S for throttle & brake, Space for emergency brake.</div>
    </div>

    <!-- Tab 3: Central Dispatcher -->
    <div class="gev-transit-panel-dispatcher" style="display: none; flex-direction: column; gap: 10px;">
      <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-size: 11px; color: #8b949e;">HEADWAY RADAR</span>
          <span style="font-size: 10px; color: #22c55e;">TARGET: 5.0 MIN SPACING</span>
        </div>
        <div class="gev-dispatcher-radar-bar" style="height: 12px; background: #0f172a; border-radius: 6px; border: 1px solid #334155; position: relative; overflow: hidden;">
          <div style="position: absolute; left: 35%; top: 0; bottom: 0; width: 30%; background: rgba(34, 197, 94, 0.3);"></div>
        </div>
      </div>

      <div class="gev-dispatcher-alerts" style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
        <!-- Injected via updateDispatcherUI() -->
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <button class="gev-btn-dispatch-hold" style="background: #1e293b; border: 1px solid #38bdf8; border-radius: 6px; color: #38bdf8; font-size: 10px; font-weight: 600; padding: 6px; cursor: pointer;">⏸️ Hold Station (60s)</button>
        <button class="gev-btn-dispatch-express" style="background: #1e293b; border: 1px solid #f59e0b; border-radius: 6px; color: #f59e0b; font-size: 10px; font-weight: 600; padding: 6px; cursor: pointer;">⚡ Run Express</button>
      </div>
    </div>
  `;

  // Floating HUD Trigger Button at bottom: 74px; right: 284px
  const triggerBtn = document.createElement('button');
  triggerBtn.className = 'gev-transit-trigger';
  triggerBtn.title = 'Transit Controller & Motorman Sim (T)';
  triggerBtn.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 284px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.85);
    border: 1px solid rgba(56, 189, 248, 0.6);
    color: #e6edf3;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, box-shadow 0.2s ease;
  `;
  triggerBtn.innerHTML = '🚊';

  triggerBtn.addEventListener('mouseenter', () => {
    triggerBtn.style.transform = 'scale(1.08)';
    triggerBtn.style.borderColor = '#38bdf8';
    triggerBtn.style.boxShadow = '0 6px 16px rgba(56, 189, 248, 0.4)';
  });
  triggerBtn.addEventListener('mouseleave', () => {
    triggerBtn.style.transform = 'scale(1.0)';
    triggerBtn.style.borderColor = 'rgba(56, 189, 248, 0.6)';
    triggerBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
  });

  triggerBtn.addEventListener('click', toggleDrawer);
  drawer.querySelector('.gev-transit-close').addEventListener('click', close);

  // Tab Switching
  const tabFleet = drawer.querySelector('.gev-transit-tab-fleet');
  const tabMotorman = drawer.querySelector('.gev-transit-tab-motorman');
  const tabDispatcher = drawer.querySelector('.gev-transit-tab-dispatcher');
  const panelFleet = drawer.querySelector('.gev-transit-panel-fleet');
  const panelMotorman = drawer.querySelector('.gev-transit-panel-motorman');
  const panelDispatcher = drawer.querySelector('.gev-transit-panel-dispatcher');

  function switchTab(tab) {
    activeTab = tab;
    tabFleet.style.background = tab === 'fleet' ? '#21262d' : 'transparent';
    tabFleet.style.color = tab === 'fleet' ? '#38bdf8' : '#8b949e';
    tabMotorman.style.background =
      tab === 'motorman' ? '#21262d' : 'transparent';
    tabMotorman.style.color = tab === 'motorman' ? '#38bdf8' : '#8b949e';
    tabDispatcher.style.background =
      tab === 'dispatcher' ? '#21262d' : 'transparent';
    tabDispatcher.style.color = tab === 'dispatcher' ? '#38bdf8' : '#8b949e';

    panelFleet.style.display = tab === 'fleet' ? 'flex' : 'none';
    panelMotorman.style.display = tab === 'motorman' ? 'flex' : 'none';
    panelDispatcher.style.display = tab === 'dispatcher' ? 'flex' : 'none';

    if (tab === 'motorman') {
      const activeV =
        activeMode === 'bus'
          ? busEngine?.getActiveBus?.()
          : metroEngine?.getActiveTrain?.();
      if (activeV && motormanControls) {
        motormanControls.bindVehicle(activeV, activeMode);
      }
    } else if (tab === 'dispatcher') {
      motormanControls?.setDispatcherMode?.(true);
    }
  }

  tabFleet.addEventListener('click', () => switchTab('fleet'));
  tabMotorman.addEventListener('click', () => switchTab('motorman'));
  tabDispatcher.addEventListener('click', () => switchTab('dispatcher'));

  // City Selector (Non-destructive selection; user can select or click Engage)
  const citySelect = drawer.querySelector('.gev-transit-city-select');
  citySelect.addEventListener('change', (e) => {
    activeCityId = e.target.value;
    if (activeCityId) {
      startActiveTransit(activeCityId);
    } else {
      updateUI();
    }
  });

  const btnEngage = drawer.querySelector('.gev-transit-btn-engage');
  if (btnEngage) {
    btnEngage.addEventListener('click', () => {
      const targetCity = activeCityId || citySelect?.value || 'atlanta';
      if (citySelect && !citySelect.value) {
        citySelect.value = targetCity;
      }
      startActiveTransit(targetCity);
    });
  }

  const btnStopTransit = drawer.querySelector('.gev-transit-btn-stop');
  if (btnStopTransit) {
    btnStopTransit.addEventListener('click', () => {
      busEngine?.stopBusFleet?.();
      metroEngine?.stopMetroSystem?.();
      dock.notifySimulationStopped('transit');
      updateUI();
    });
  }

  // Mode Switchers
  const btnModeBus = drawer.querySelector('.gev-transit-mode-bus');
  const btnModeMetro = drawer.querySelector('.gev-transit-mode-metro');

  function updateModeButtonStyles() {
    if (btnModeBus) {
      const isBus = activeMode === 'bus';
      btnModeBus.style.background = isBus ? '#21262d' : 'transparent';
      btnModeBus.style.borderColor = isBus ? '#38bdf8' : 'transparent';
      btnModeBus.style.color = isBus ? '#38bdf8' : '#8b949e';
      btnModeBus.style.boxShadow = isBus
        ? '0 2px 6px rgba(56, 189, 248, 0.25)'
        : 'none';
    }
    if (btnModeMetro) {
      const isMetro = activeMode === 'metro';
      btnModeMetro.style.background = isMetro ? '#21262d' : 'transparent';
      btnModeMetro.style.borderColor = isMetro ? '#38bdf8' : 'transparent';
      btnModeMetro.style.color = isMetro ? '#38bdf8' : '#8b949e';
      btnModeMetro.style.boxShadow = isMetro
        ? '0 2px 6px rgba(56, 189, 248, 0.25)'
        : 'none';
    }
    if (tabFleet) {
      tabFleet.innerHTML =
        activeMode === 'bus' ? '🚌 Bus Fleet' : '🚆 Metro Fleet';
    }
  }

  function switchMode(mode, userInitiated = false) {
    activeMode = mode;
    activeLineFilter = 'all';
    updateModeButtonStyles();

    const isSimActive = Boolean(
      busEngine?.isSimActive?.() || metroEngine?.isSimActive?.(),
    );

    // If user explicitly clicked the mode button and simulation is not running yet,
    // auto-engage transit for the selected/default city so they see live vehicles immediately!
    if (userInitiated && !isSimActive) {
      const targetCity = activeCityId || citySelect?.value || 'atlanta';
      if (citySelect && !citySelect.value) {
        citySelect.value = targetCity;
      }
      startActiveTransit(targetCity);
    } else {
      updateCameraFocus();
      updateUI();
    }
  }

  btnModeBus.addEventListener('mouseenter', () => {
    if (activeMode !== 'bus') {
      btnModeBus.style.background = '#161b22';
      btnModeBus.style.color = '#e6edf3';
      btnModeBus.style.borderColor = '#30363d';
    }
  });
  btnModeBus.addEventListener('mouseleave', () => {
    if (activeMode !== 'bus') {
      btnModeBus.style.background = 'transparent';
      btnModeBus.style.color = '#8b949e';
      btnModeBus.style.borderColor = 'transparent';
    }
  });

  btnModeMetro.addEventListener('mouseenter', () => {
    if (activeMode !== 'metro') {
      btnModeMetro.style.background = '#161b22';
      btnModeMetro.style.color = '#e6edf3';
      btnModeMetro.style.borderColor = '#30363d';
    }
  });
  btnModeMetro.addEventListener('mouseleave', () => {
    if (activeMode !== 'metro') {
      btnModeMetro.style.background = 'transparent';
      btnModeMetro.style.color = '#8b949e';
      btnModeMetro.style.borderColor = 'transparent';
    }
  });

  btnModeBus.addEventListener('click', () => switchMode('bus', true));
  btnModeMetro.addEventListener('click', () => switchMode('metro', true));

  // Macro Overview & Snap Back Handlers
  const btnOverview = drawer.querySelector('.gev-transit-btn-overview');
  if (btnOverview) {
    btnOverview.addEventListener('click', () => {
      if (activeMode === 'bus') {
        metroEngine?.setCameraEnabled?.(false);
        busEngine?.showTransitMap?.();
      } else {
        busEngine?.setCameraEnabled?.(false);
        metroEngine?.showTransitMap?.();
      }
      updateFleetListUI();
    });
  }

  const btnLines = drawer.querySelector('.gev-transit-btn-lines');
  function syncLinesButtonStyle() {
    if (!btnLines) return;
    btnLines.style.background = showSystemLines ? '#0284c7' : '#161b22';
    btnLines.style.borderColor = showSystemLines ? '#38bdf8' : '#30363d';
    btnLines.style.color = showSystemLines ? '#ffffff' : '#8b949e';
    btnLines.style.fontWeight = showSystemLines ? '700' : '500';
    btnLines.setAttribute?.('aria-pressed', String(showSystemLines));
  }
  function syncSystemLinesVisibility() {
    busEngine?.setRouteLinesVisible?.(showSystemLines);
    metroEngine?.setRouteLinesVisible?.(showSystemLines);
    syncLinesButtonStyle();
  }
  if (btnLines) {
    btnLines.addEventListener('click', () => {
      showSystemLines = !showSystemLines;
      syncSystemLinesVisibility();
    });
  }

  const btnSnapback = drawer.querySelector('.gev-transit-btn-snapback');
  if (btnSnapback) {
    btnSnapback.addEventListener('click', () => {
      if (activeMode === 'bus') {
        metroEngine?.setCameraEnabled?.(false);
        busEngine?.setCameraEnabled?.(true);
        busEngine?.snapBack?.('chase');
      } else {
        busEngine?.setCameraEnabled?.(false);
        metroEngine?.setCameraEnabled?.(true);
        metroEngine?.snapBack?.('chase');
      }
      updateFleetListUI();
    });
  }

  // Motorman Control Buttons
  drawer.querySelector('.gev-btn-throttle-up').addEventListener('click', () => {
    motormanControls?.throttleUp?.();
  });
  drawer.querySelector('.gev-btn-brake-up').addEventListener('click', () => {
    motormanControls?.applyBrake?.();
  });
  drawer.querySelector('.gev-btn-doors').addEventListener('click', () => {
    motormanControls?.toggleDoors?.();
  });
  drawer.querySelector('.gev-btn-horn').addEventListener('click', () => {
    motormanControls?.triggerHorn?.();
  });

  // Dispatcher Buttons
  drawer
    .querySelector('.gev-btn-dispatch-hold')
    .addEventListener('click', () => {
      const v =
        activeMode === 'bus'
          ? busEngine?.getActiveBus?.()
          : metroEngine?.getActiveTrain?.();
      if (v) motormanControls?.issueHoldOrder?.(v.id, 60);
    });
  drawer
    .querySelector('.gev-btn-dispatch-express')
    .addEventListener('click', () => {
      const v =
        activeMode === 'bus'
          ? busEngine?.getActiveBus?.()
          : metroEngine?.getActiveTrain?.();
      if (v) motormanControls?.issueExpressOrder?.(v.id);
    });

  // Keyboard Navigation Listener
  function onKeyDown(e) {
    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'SELECT' ||
      e.target.tagName === 'TEXTAREA'
    ) {
      return;
    }

    if (e.code === 'KeyT') {
      toggleDrawer();
      e.preventDefault();
      return;
    }

    if (isOpen && activeTab === 'motorman') {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        motormanControls?.throttleUp?.();
        e.preventDefault();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        motormanControls?.throttleDown?.();
        e.preventDefault();
      } else if (e.code === 'Space') {
        motormanControls?.applyEmergencyBrake?.();
        e.preventDefault();
      } else if (e.code === 'KeyD') {
        motormanControls?.toggleDoors?.();
        e.preventDefault();
      } else if (e.code === 'KeyK') {
        motormanControls?.toggleKneeling?.();
        e.preventDefault();
      } else if (e.code === 'KeyH') {
        motormanControls?.triggerHorn?.();
        e.preventDefault();
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);

  if (typeof metroEngine?.onTrainSelected === 'function') {
    metroEngine.onTrainSelected(() => {
      if (isOpen) updateUI();
    });
  }

  function startActiveTransit(cityId) {
    if (cityId) activeCityId = cityId;
    if (!activeCityId) activeCityId = 'atlanta';
    try {
      dock.notifySimulationStarted('transit');
    } catch {}
    // Both transit systems operate persistently together in the active city
    if (
      !busEngine?.isSimActive?.() ||
      busEngine?.getActiveCity?.() !== activeCityId
    ) {
      busEngine?.startBusFleet?.(activeCityId);
    }
    if (
      !metroEngine?.isSimActive?.() ||
      metroEngine?.getActiveCity?.() !== activeCityId
    ) {
      metroEngine?.startMetroSystem?.(activeCityId);
    }
    syncSystemLinesVisibility();
    updateCameraFocus();
    updateUI();
  }

  function updateCameraFocus() {
    if (activeMode === 'bus') {
      busEngine?.setCameraEnabled?.(true);
      metroEngine?.setCameraEnabled?.(false);
      let curBus = busEngine?.getActiveBus?.();
      if (!curBus && busEngine?.getFleet?.()?.length > 0) {
        curBus = busEngine.getFleet()[0];
        busEngine.setActiveBus?.(curBus.id);
      }
      if (curBus && motormanControls) {
        motormanControls.bindVehicle(curBus, 'bus');
      }
      if (curBus && busEngine?.snapBack) {
        busEngine.snapBack(busEngine.getCameraMode?.() || 'chase');
      }
    } else {
      metroEngine?.setCameraEnabled?.(true);
      busEngine?.setCameraEnabled?.(false);
      let curTrain = metroEngine?.getActiveTrain?.();
      if (!curTrain && metroEngine?.getTrains?.()?.length > 0) {
        curTrain = metroEngine.getTrains()[0];
        metroEngine.setActiveTrain?.(curTrain.id);
      }
      if (curTrain && motormanControls) {
        motormanControls.bindVehicle(curTrain, 'metro');
      }
      if (curTrain && metroEngine?.snapBack) {
        metroEngine.snapBack(metroEngine.getCameraMode?.() || 'chase');
      }
    }
  }

  function updateUI() {
    if (!isOpen) return;

    if (activeTab === 'fleet') {
      updateFleetListUI();
    } else if (activeTab === 'motorman') {
      updateMotormanUI();
    } else if (activeTab === 'dispatcher') {
      updateDispatcherUI();
    }
  }

  let lastFilterFingerprint = null;
  let lastFleetFingerprint = null;

  function normalizeDrawerCamMode(mode) {
    if (mode === 'lead_cab' || mode === 'cab') return 'cab';
    if (mode === 'passenger_window' || mode === 'door') return 'door';
    if (mode === 'copter' || mode === 'heli') return 'heli';
    if (mode === 'overview' || mode === 'elevated_overview') return 'overview';
    if (mode === 'free') return 'free';
    return 'chase';
  }

  function applyVehicleCameraAction(id, action) {
    if (!id) return;
    const isBus = activeMode === 'bus';
    const targetEngine = isBus ? busEngine : metroEngine;
    const otherEngine = isBus ? metroEngine : busEngine;
    otherEngine?.setCameraEnabled?.(false);

    if (isBus) {
      busEngine?.setActiveBus?.(id);
      const busObj = busEngine?.getActiveBus?.();
      if (busObj && motormanControls) {
        motormanControls.bindVehicle?.(busObj, 'bus');
      }
      if (action === 'select') {
        const cur = busEngine?.getCameraMode?.();
        busEngine?.snapBack?.(
          !cur || cur === 'overview' || cur === 'free' ? 'chase' : cur,
        );
      } else if (action === 'cab') {
        busEngine?.setCameraMode?.('cab');
      } else if (action === 'chase') {
        busEngine?.setCameraMode?.('chase');
      } else if (action === 'door') {
        busEngine?.setCameraMode?.('door');
      } else if (action === 'heli') {
        busEngine?.setCameraMode?.('heli');
      } else if (action === 'overview') {
        busEngine?.showTransitMap?.();
      }
    } else {
      metroEngine?.setActiveTrain?.(id);
      const trainObj = metroEngine?.getActiveTrain?.();
      if (trainObj && motormanControls) {
        motormanControls.bindVehicle?.(trainObj, 'metro');
      }
      if (action === 'select') {
        const cur = normalizeDrawerCamMode(metroEngine?.getCameraMode?.());
        metroEngine?.snapBack?.(
          !metroEngine?.isCameraEnabled?.() ||
            cur === 'overview' ||
            cur === 'free'
            ? 'chase'
            : cur,
        );
      } else if (action === 'cab') {
        metroEngine?.setCameraMode?.('lead_cab');
      } else if (action === 'chase') {
        metroEngine?.setCameraMode?.('chase');
      } else if (action === 'door') {
        metroEngine?.setCameraMode?.('passenger_window');
      } else if (action === 'heli') {
        metroEngine?.setCameraMode?.('heli');
      } else if (action === 'overview') {
        metroEngine?.showTransitMap?.();
      }
    }
    void targetEngine;
    updateFleetListUI();
  }

  function updateFleetListUI() {
    const fleetContainer = drawer.querySelector('.gev-transit-fleet-list');
    if (!fleetContainer) return;

    const lineFilterContainer = drawer.querySelector(
      '.gev-transit-line-filters',
    );
    const vehicles =
      activeMode === 'bus'
        ? busEngine?.getFleet?.() || []
        : metroEngine?.getTrains?.() || [];

    if (lineFilterContainer && !lineFilterContainer._gevDelegatedBound) {
      lineFilterContainer._gevDelegatedBound = true;
      lineFilterContainer.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.gev-line-filter-btn') || e.target;
        const lineId = btn?.getAttribute?.('data-line');
        if (!lineId) return;
        activeLineFilter = lineId;
        lastFilterFingerprint = null;
        lastFleetFingerprint = null;
        updateFleetListUI();
      });
    }

    if (activeMode === 'metro') {
      const distinctRoutes = new Map();
      for (const t of vehicles) {
        if (t.route && !distinctRoutes.has(t.route.id)) {
          distinctRoutes.set(t.route.id, t.route);
        }
      }

      if (lineFilterContainer) {
        if (distinctRoutes.size > 1) {
          lineFilterContainer.style.display = 'flex';
          const filterFp = `${activeLineFilter}|${vehicles.length}|${[...distinctRoutes.keys()].join(',')}`;
          if (lastFilterFingerprint !== filterFp) {
            lastFilterFingerprint = filterFp;
            let pillsHtml = `<button class="gev-line-filter-btn" data-line="all" style="background: ${activeLineFilter === 'all' ? '#38bdf8' : '#21262d'}; color: ${activeLineFilter === 'all' ? '#0d1117' : '#cbd5e1'}; border: 1px solid #30363d; border-radius: 4px; padding: 2px 7px; font-size: 9.5px; font-weight: 700; cursor: pointer; white-space: nowrap;">All (${vehicles.length})</button>`;

            for (const [rId, route] of distinctRoutes) {
              const isSelected = activeLineFilter === rId;
              const lineNameShort = route.lineName
                .replace(
                  /^(MARTA|LA Metro|BART|WMATA|CTA|MTA|TfL|JR|Amtrak)\s*/i,
                  '',
                )
                .split('(')[0]
                .trim();
              pillsHtml += `<button class="gev-line-filter-btn" data-line="${rId}" style="background: ${isSelected ? route.liveryColor : '#161b22'}; color: ${isSelected ? '#ffffff' : route.liveryColor}; border: 1px solid ${route.liveryColor}; border-radius: 4px; padding: 2px 7px; font-size: 9.5px; font-weight: 700; cursor: pointer; white-space: nowrap;">${lineNameShort}</button>`;
            }
            lineFilterContainer.innerHTML = pillsHtml;
          }
        } else {
          lineFilterContainer.style.display = 'none';
          lastFilterFingerprint = null;
        }
      }
    } else if (lineFilterContainer) {
      lineFilterContainer.style.display = 'none';
      lastFilterFingerprint = null;
    }

    if (!fleetContainer._gevDelegatedBound) {
      fleetContainer._gevDelegatedBound = true;
      fleetContainer.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-cam-action]') || e.target;
        const action = btn?.getAttribute?.('data-cam-action');
        const id = btn?.getAttribute?.('data-id');
        if (!action || !id) return;
        applyVehicleCameraAction(id, action);
      });
    }

    if (vehicles.length === 0) {
      if (lastFleetFingerprint !== '__empty__') {
        lastFleetFingerprint = '__empty__';
        fleetContainer.innerHTML = `<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 16px; background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 8px; line-height: 1.45;">Select a transit network above or click <b>🚀 Engage Transit</b> to launch live municipal buses &amp; metro rail without interrupting your current view until you engage.</div>`;
      }
      return;
    }

    let displayedVehicles = vehicles;
    if (activeMode === 'metro' && activeLineFilter !== 'all') {
      displayedVehicles = vehicles.filter(
        (v) => v.route?.id === activeLineFilter,
      );
    }

    const activeEngine = activeMode === 'bus' ? busEngine : metroEngine;
    const curActiveId =
      activeMode === 'bus'
        ? busEngine?.getActiveBus?.()?.id
        : metroEngine?.getActiveTrain?.()?.id;
    const curCamEnabled = activeEngine?.isCameraEnabled?.() !== false;
    const curCamMode = normalizeDrawerCamMode(activeEngine?.getCameraMode?.());
    const isMapOverview =
      activeEngine?.getCameraMode?.() === 'overview' ||
      activeEngine?.getCameraMode?.() === 'elevated_overview';

    if (btnOverview) {
      btnOverview.style.background = isMapOverview ? '#0284c7' : '#1e293b';
      btnOverview.style.borderColor = isMapOverview
        ? '#38bdf8'
        : 'rgba(56, 189, 248, 0.4)';
      btnOverview.style.color = isMapOverview ? '#ffffff' : '#38bdf8';
    }

    const pillStyle = (isSelected) =>
      isSelected
        ? 'background: #0284c7; border: 1px solid #38bdf8; color: #ffffff; font-weight: 700;'
        : 'background: #21262d; border: 1px solid #30363d; color: #cbd5e1; font-weight: 500;';

    const fleetFingerprint = `${activeMode}|${activeLineFilter}|${displayedVehicles.map((v) => v.id).join(',')}`;

    // Preserve DOM button nodes across 800ms telemetry refreshes so clicks on Cab/Chase/Door/Heli
    // are never lost mid-interaction by innerHTML replacement.
    const existingCards = fleetContainer.querySelectorAll?.(
      '[data-vehicle-card]',
    );
    if (
      lastFleetFingerprint === fleetFingerprint &&
      existingCards &&
      existingCards.length === displayedVehicles.length
    ) {
      for (let i = 0; i < displayedVehicles.length; i++) {
        const v = displayedVehicles[i];
        const card = existingCards[i];
        if (!card) continue;
        const speedMph = Math.round(v.speedMs * 2.23694);
        const capPct = Math.round((v.passengers / v.capacity) * 100);
        const stateColor = v.doorsOpen
          ? '#22c55e'
          : v.speedMs > 1
            ? '#38bdf8'
            : '#eab308';
        const nextName =
          v.nextStop?.name || v.nextStation?.name || 'In Transit';
        const isCurrent = curActiveId === v.id;
        const activeCam = isCurrent && curCamEnabled ? curCamMode : null;

        card.style.background = isCurrent ? '#1c2433' : '#161b22';
        card.style.borderColor = isCurrent ? '#38bdf8' : '#30363d';

        const stateEl = card.querySelector('.gev-card-state');
        if (stateEl) {
          stateEl.textContent = `${v.state} · ${speedMph} MPH`;
          stateEl.style.color = stateColor;
        }
        const nextEl = card.querySelector('.gev-card-next');
        if (nextEl) {
          nextEl.innerHTML = `Next: <strong style="color: #cbd5e1;">${nextName}</strong> (${v.nextStopDistMeters || v.nextStationDistMeters || 0}m)`;
        }
        const barEl = card.querySelector('.gev-card-bar');
        if (barEl) {
          barEl.style.width = `${capPct}%`;
          barEl.style.background = capPct > 90 ? '#ef4444' : '#38bdf8';
        }
        const occEl = card.querySelector('.gev-card-occ');
        if (occEl) {
          occEl.textContent = `${v.passengers}/${v.capacity} (${capPct}%)`;
        }

        const pillMap = [
          ['.gev-latch-cab', activeCam === 'cab'],
          ['.gev-latch-chase', activeCam === 'chase'],
          ['.gev-latch-door', activeCam === 'door'],
          ['.gev-latch-heli', activeCam === 'heli'],
        ];
        for (const [sel, lit] of pillMap) {
          const btn = card.querySelector(sel);
          if (!btn) continue;
          btn.style.background = lit ? '#0284c7' : '#21262d';
          btn.style.borderColor = lit ? '#38bdf8' : '#30363d';
          btn.style.color = lit ? '#ffffff' : '#cbd5e1';
          btn.style.fontWeight = lit ? '700' : '500';
        }
      }
      return;
    }

    lastFleetFingerprint = fleetFingerprint;
    fleetContainer.innerHTML = displayedVehicles
      .map((v) => {
        const speedMph = Math.round(v.speedMs * 2.23694);
        const capPct = Math.round((v.passengers / v.capacity) * 100);
        const stateColor = v.doorsOpen
          ? '#22c55e'
          : v.speedMs > 1
            ? '#38bdf8'
            : '#eab308';
        const nextName =
          v.nextStop?.name || v.nextStation?.name || 'In Transit';
        const isCurrent = curActiveId === v.id;
        const activeCam = isCurrent && curCamEnabled ? curCamMode : null;
        const routeBadge = v.route
          ? `<span style="background: ${v.route.liveryColor || '#38bdf8'}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${v.route.lineName || v.route.id}</span>`
          : '';

        return `
          <div data-vehicle-card="${v.id}" style="background: ${isCurrent ? '#1c2433' : '#161b22'}; border: 1px solid ${isCurrent ? '#38bdf8' : '#30363d'}; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
            <div data-id="${v.id}" data-cam-action="select" title="Select ${v.id} as active transit contact" style="display: flex; justify-content: space-between; align-items: center; gap: 6px; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                ${routeBadge}
                <span style="font-size: 11px; font-weight: 700; color: #f0f6fc;">${v.id}</span>
              </div>
              <span class="gev-card-state" style="font-size: 10px; color: ${stateColor}; font-weight: 600; white-space: nowrap;">${v.state} · ${speedMph} MPH</span>
            </div>
            <div class="gev-card-next" style="font-size: 10px; color: #8b949e;">
              Next: <strong style="color: #cbd5e1;">${nextName}</strong> (${v.nextStopDistMeters || v.nextStationDistMeters || 0}m)
            </div>
            <!-- Occupancy bar -->
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="flex: 1; height: 6px; background: #0f172a; border-radius: 3px; overflow: hidden;">
                <div class="gev-card-bar" style="width: ${capPct}%; height: 100%; background: ${capPct > 90 ? '#ef4444' : '#38bdf8'};"></div>
              </div>
              <span class="gev-card-occ" style="font-size: 9px; color: #8b949e; font-family: monospace;">${v.passengers}/${v.capacity} (${capPct}%)</span>
            </div>
            <!-- Mutually Exclusive Radio Camera Pills -->
            <div style="display: flex; gap: 4px; margin-top: 4px;">
              <button class="gev-latch-cab" data-id="${v.id}" data-cam-action="cab" style="flex: 1; ${pillStyle(activeCam === 'cab')} border-radius: 4px; font-size: 9px; padding: 3px; cursor: pointer;">💺 Cab</button>
              <button class="gev-latch-chase" data-id="${v.id}" data-cam-action="chase" style="flex: 1; ${pillStyle(activeCam === 'chase')} border-radius: 4px; font-size: 9px; padding: 3px; cursor: pointer;">🎥 Chase</button>
              <button class="gev-latch-door" data-id="${v.id}" data-cam-action="door" style="flex: 1; ${pillStyle(activeCam === 'door')} border-radius: 4px; font-size: 9px; padding: 3px; cursor: pointer;">🚪 Door</button>
              <button class="gev-latch-heli" data-id="${v.id}" data-cam-action="heli" style="flex: 1; ${pillStyle(activeCam === 'heli')} border-radius: 4px; font-size: 9px; padding: 3px; cursor: pointer;">🚁 Heli</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function updateMotormanUI() {
    const state = motormanControls?.getState?.();
    if (!state) return;

    const speedEl = drawer.querySelector('.gev-motorman-speed');
    const throttleEl = drawer.querySelector('.gev-motorman-throttle');
    const brakeEl = drawer.querySelector('.gev-motorman-brake');
    const doorsEl = drawer.querySelector('.gev-motorman-doors');
    const scoreEl = drawer.querySelector('.gev-motorman-score');
    const toastEl = drawer.querySelector('.gev-motorman-toast');

    if (speedEl) speedEl.textContent = `${state.speedMph} MPH`;
    if (throttleEl) throttleEl.textContent = `NOTCH ${state.throttleNotch}`;
    if (brakeEl) {
      brakeEl.textContent = state.isEmergencyBrake
        ? 'EMERGENCY'
        : state.brakeNotch > 0
          ? `BRAKE ${state.brakeNotch}`
          : 'RELEASED';
    }
    if (doorsEl) {
      doorsEl.textContent = state.doorsOpen ? 'OPEN' : 'CLOSED';
      doorsEl.style.color = state.doorsOpen ? '#22c55e' : '#eab308';
    }
    if (scoreEl) scoreEl.textContent = `${state.currentScore} PTS`;

    if (toastEl && state.lastScoreEvent) {
      toastEl.textContent = state.lastScoreEvent.message;
      toastEl.style.color =
        state.lastScoreEvent.deltaScore < 0 ? '#ef4444' : '#22c55e';
    }
  }

  function updateDispatcherUI() {
    const alertsContainer = drawer.querySelector('.gev-dispatcher-alerts');
    if (!alertsContainer) return;

    const fleet =
      activeMode === 'bus'
        ? busEngine?.getFleet?.() || []
        : metroEngine?.getTrains?.() || [];
    const alerts = motormanControls?.evaluateFleetHeadways?.(fleet) || [];

    if (alerts.length === 0) {
      alertsContainer.innerHTML = `
        <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 8px; font-size: 10px; color: #86efac; text-align: center;">
          ✅ Headway nominal: all transit lines operating within balanced 4.0–6.0 min spacing.
        </div>
      `;
    } else {
      alertsContainer.innerHTML = alerts
        .map(
          (a) => `
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 6px 8px; font-size: 10px; color: #fca5a5;">
            ${a.message}
          </div>
        `,
        )
        .join('');
    }
  }

  function open() {
    dock.notifyDrawerOpened('transit');
    isOpen = true;
    drawer.style.display = 'flex';
    drawer.classList?.remove?.('hidden');
    const animate =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => fn();
    animate(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
      drawer.style.pointerEvents = 'auto';
    });

    // Check if an engine already has an active city running
    const runningCity =
      busEngine?.getActiveCity?.() || metroEngine?.getActiveCity?.();
    if (runningCity) {
      activeCityId = runningCity;
      if (citySelect) {
        citySelect.value = runningCity;
      }
    }

    updateModeButtonStyles();

    if (!refreshInterval) {
      refreshInterval = setInterval(updateUI, 800);
    }
    updateUI();
  }

  function close() {
    isOpen = false;
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    dock.notifyDrawerClosed('transit');
    setTimeout(() => {
      if (!isOpen) drawer.style.display = 'none';
    }, 250);

    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function toggleDrawer() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  container.appendChild(drawer);
  container.appendChild(triggerBtn);

  dock.registerDrawer('transit', {
    open: () => open(),
    close: () => close(),
    isOpen: () => isOpen,
    launcherEl: triggerBtn,
  });

  dock.registerSimulation('transit', {
    stop: () => {
      busEngine?.stopBusFleet?.();
      metroEngine?.stopMetroSystem?.();
    },
    isActive: () =>
      Boolean(busEngine?.isSimActive?.() || metroEngine?.isSimActive?.()),
  });

  return {
    open,
    close,
    toggle: toggleDrawer,
    isOpen: () => isOpen,
    getActiveMode: () => activeMode,
    isLinesVisible: () => showSystemLines,
    switchMode,
    startActiveTransit,
    getDrawerElement: () => drawer,
    destroy: () => {
      close();
      dock.unregisterSimulation('transit');
      dock.unregisterDrawer('transit');
      window.removeEventListener('keydown', onKeyDown);
      if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
      if (triggerBtn.parentNode) triggerBtn.parentNode.removeChild(triggerBtn);
    },
  };
}
