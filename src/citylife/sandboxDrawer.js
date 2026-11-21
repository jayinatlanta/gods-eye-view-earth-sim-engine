/**
 * World Architect & World Sandbox UI Drawer.
 * (Click-to-Place Modular Structures, Overlooks & Scenic Sanctuaries on GEV)
 *
 * Implements:
 * - Floating HUD launcher button at `bottom: 74px; right: 544px` (accent #f59e0b)
 * - Single-active-flyout mutual exclusion via worldSimDock.js
 * - Keyboard hotkey navigation: 'B' (Build / Blueprint) toggles drawer
 * - 3 Tabbed Panels:
 *   1. [ 🏛️ Placed & Sanctuaries ]: Placed structures roster, fly-to, toggle sanctuary, companion rendezvous point
 *   2. [ 📐 Blueprints Catalog ]: Modular catalog (Shelter, Observation, Waterfront, Rest Point) with specs, footprint, and placement
 *   3. [ 🌟 Atmosphere & Export ]: Sanctuary lighting/atmosphere presets, JSON export & import
 * - URL Deeplink routing: ?sandbox=true, ?blueprint=..., ?sanctuary=...
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import {
  STRUCTURE_CATALOG,
  STRUCTURE_CATEGORIES,
  getStructureById,
  getStructuresByCategory,
} from '../layers/sandbox/structureCatalog.js';
import { createWorldSandboxEngine } from '../layers/sandbox/worldSandboxEngine.js';

export function createSandboxDrawer({
  viewer = null,
  container = null,
  sandboxEngine = null,
} = {}) {
  if (typeof document === 'undefined') {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      destroy: () => {},
      selectBlueprint: () => {},
    };
  }

  let isOpen = false;
  let activeTab = 'placed'; // 'placed' | 'blueprints' | 'atmosphere'
  let selectedBlueprint = STRUCTURE_CATALOG[0]; // Default Modern Hillside Cabin

  const engine =
    sandboxEngine ||
    createWorldSandboxEngine({
      viewer,
      onStateChange: () => {
        renderPlacedRoster();
      },
    });

  // Root Drawer Container
  const drawer = document.createElement('div');
  drawer.className = 'gev-sandbox-drawer hidden';
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
    border: 1px solid rgba(245, 158, 11, 0.45);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(245, 158, 11, 0.25);
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
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(245, 158, 11, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🏛️</span>
        <span style="font-weight: 700; font-size: 13px; color: #fbbf24; letter-spacing: 0.5px; text-transform: uppercase;">
          World Architect & Sandbox
        </span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="gev-sandbox-close-btn" style="background: none; border: none; color: #8b949e; cursor: pointer; font-size: 14px; padding: 2px 6px;">✕</button>
      </div>
    </div>

    <!-- Tab Strip -->
    <div style="display: flex; gap: 4px; border-bottom: 1px solid #21262d; padding-bottom: 6px;">
      <button class="gev-sandbox-tab-btn active" data-tab="placed" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; border-radius: 4px; cursor: pointer;">
        🏛️ Placed
      </button>
      <button class="gev-sandbox-tab-btn" data-tab="blueprints" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
        📐 Blueprints
      </button>
      <button class="gev-sandbox-tab-btn" data-tab="atmosphere" style="flex: 1; padding: 6px 4px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
        🌟 Sanctuary Ops
      </button>
    </div>

    <!-- TAB 1: Placed Structures & Sanctuaries -->
    <div class="gev-sandbox-tab-content gev-sandbox-content-placed" style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">
          World Structures
        </span>
        <span class="gev-placed-count" style="font-size: 9px; color: #fbbf24; font-weight: 600;">0 Placed</span>
      </div>

      <div class="gev-placed-roster-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto;">
        <!-- Injected via JavaScript -->
      </div>
    </div>

    <!-- TAB 2: Blueprints Catalog -->
    <div class="gev-sandbox-tab-content gev-sandbox-content-blueprints" style="display: none; flex-direction: column; gap: 8px;">
      <div style="display: flex; gap: 6px;">
        <select class="gev-blueprint-category-filter" style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #e6edf3; font-size: 10px; padding: 4px; outline: none;">
          <option value="ALL">All Categories</option>
          <option value="SHELTER">Shelters & Cabins</option>
          <option value="OBSERVATION">Observation & Skywalks</option>
          <option value="WATERFRONT">Waterfront & Docks</option>
          <option value="REST_POINT">Rest Points & Benches</option>
        </select>
      </div>

      <div class="gev-blueprint-roster-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;">
        <!-- Injected via JavaScript -->
      </div>

      <!-- Selected Blueprint Card -->
      <div class="gev-selected-blueprint-card" style="background: rgba(22, 27, 34, 0.8); border: 1px solid #30363d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="gev-blueprint-name" style="font-weight: 700; font-size: 12px; color: #fbbf24;">Modern Hillside Cabin</span>
          <span class="gev-blueprint-score" style="font-size: 9px; color: #34d399; font-weight: 600;">Sanctuary Score 98</span>
        </div>
        <span class="gev-blueprint-desc" style="font-size: 10px; color: #8b949e; line-height: 1.3;">Cantilevered cedar and architectural glass retreat.</span>
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: #8b949e; margin-top: 2px;">
          <span class="gev-blueprint-dims">14m × 18m × 7.2m</span>
          <span class="gev-blueprint-capacity">Capacity: 6</span>
        </div>
        <button class="gev-place-blueprint-btn" style="margin-top: 6px; padding: 8px; font-size: 11px; font-weight: 700; background: #d97706; border: 1px solid #f59e0b; color: #ffffff; border-radius: 6px; cursor: pointer;">
          📍 Place at Current Camera Position
        </button>
      </div>
    </div>

    <!-- TAB 3: Sanctuary Atmosphere & Ops -->
    <div class="gev-sandbox-tab-content gev-sandbox-content-atmosphere" style="display: none; flex-direction: column; gap: 8px;">
      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Atmosphere & Lighting Presets</span>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
        <button class="gev-atmo-preset-btn" data-preset="DAWN" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          🌅 Dawn Mist
        </button>
        <button class="gev-atmo-preset-btn active" data-preset="GOLDEN" style="padding: 6px; font-size: 9px; font-weight: 600; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; border-radius: 4px; cursor: pointer;">
          🌇 Golden Hour
        </button>
        <button class="gev-atmo-preset-btn" data-preset="STARGAZING" style="padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          🌌 Dark Sky
        </button>
      </div>

      <div style="border-top: 1px solid #21262d; margin: 4px 0;"></div>

      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Companion Overlook Status</span>
      <div class="gev-companion-status-card" style="background: rgba(22, 27, 34, 0.6); border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 10px; color: #8b949e;">
        No active companion overlook selected. Click the 🌟 icon on any placed structure to designate a rendezvous point.
      </div>

      <div style="border-top: 1px solid #21262d; margin: 4px 0;"></div>

      <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">Sandbox State Exchange</span>
      <div style="display: flex; gap: 6px;">
        <button class="gev-export-layout-btn" style="flex: 1; padding: 6px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          💾 Copy Layout JSON
        </button>
        <button class="gev-sample-layout-btn" style="flex: 1; padding: 6px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
          ✨ Spawn Scenic Sample
        </button>
      </div>
    </div>
  `;

  // Floating HUD Trigger Launcher Button at `bottom: 74px; right: 544px` (accent #f59e0b)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-sandbox-launcher-btn';
  launcherButton.title = 'World Architect & Sandbox (B)';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 544px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.92);
    border: 1px solid rgba(245, 158, 11, 0.65);
    color: #fbbf24;
    font-size: 18px;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(245, 158, 11, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, border-color 0.2s;
  `;
  launcherButton.innerHTML = '🏛️';

  const mountContainer =
    container || (typeof document !== 'undefined' ? document.body : null);
  if (mountContainer) {
    mountContainer.appendChild(launcherButton);
    mountContainer.appendChild(drawer);
  }

  // Register with Global Coordinator for single-active-flyout mutual exclusion
  const coordinator = getGlobalDrawerCoordinator();
  coordinator.registerDrawer('sandbox', {
    open: () => openDrawer(),
    close: () => closeDrawer(),
    isOpen: () => isOpen,
    launcherEl: launcherButton,
    accentColor: '#f59e0b',
  });

  function renderPlacedRoster() {
    const listEl = drawer.querySelector('.gev-placed-roster-list');
    const countEl = drawer.querySelector('.gev-placed-count');
    const overlookStatusEl = drawer.querySelector('.gev-companion-status-card');
    if (!listEl) return;

    const placed = engine.getPlacedStructures();
    if (countEl) countEl.textContent = `${placed.length} Placed`;

    const overlookId = engine.getCompanionOverlookId();
    if (overlookStatusEl) {
      if (overlookId) {
        const target = placed.find((s) => s.id === overlookId);
        overlookStatusEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 14px;">🌟</span>
            <div>
              <span style="font-weight: 700; color: #fbbf24;">Companion Overlook Active:</span>
              <span style="color: #e6edf3;"> ${target ? target.customName : 'Sanctuary'}</span>
            </div>
          </div>
        `;
      } else {
        overlookStatusEl.textContent =
          'No active companion overlook selected. Click the 🌟 icon on any placed structure to designate a rendezvous point.';
      }
    }

    if (placed.length === 0) {
      listEl.innerHTML = `
        <div style="font-size: 10px; color: #8b949e; text-align: center; padding: 16px 8px; background: rgba(22, 27, 34, 0.4); border: 1px dashed #30363d; border-radius: 6px;">
          No structures placed yet.<br>Go to the <b>Blueprints</b> tab to erect your first overlook sanctuary.
        </div>
      `;
      return;
    }

    listEl.innerHTML = placed
      .map((item) => {
        const isCompanionOverlook = item.id === overlookId;
        return `
        <div class="gev-placed-item" data-id="${item.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(22, 27, 34, 0.6); border: 1px solid ${
          item.isSanctuary ? '#f59e0b' : '#30363d'
        }; border-radius: 6px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700; font-size: 11px; color: ${
                item.isSanctuary ? '#fbbf24' : '#e6edf3'
              };">${item.customName}</span>
              ${
                isCompanionOverlook
                  ? '<span style="font-size: 8px; background: #d97706; color: #fff; padding: 1px 4px; border-radius: 2px; font-weight: 700;">COMPANION VISTA</span>'
                  : ''
              }
            </div>
            <span style="font-size: 9px; color: #8b949e;">${item.name} · ${item.position.longitude.toFixed(
              3,
            )}°, ${item.position.latitude.toFixed(3)}°</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="gev-fly-btn" data-id="${item.id}" title="Fly Camera Here" style="background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 3px 6px; font-size: 10px; cursor: pointer;">✈️</button>
            <button class="gev-sanctuary-btn" data-id="${item.id}" title="Toggle Sanctuary / Companion Overlook" style="background: ${
              item.isSanctuary ? 'rgba(245, 158, 11, 0.2)' : '#21262d'
            }; border: 1px solid ${
              item.isSanctuary ? '#f59e0b' : '#30363d'
            }; color: ${item.isSanctuary ? '#fbbf24' : '#8b949e'}; border-radius: 4px; padding: 3px 6px; font-size: 10px; cursor: pointer;">🌟</button>
            <button class="gev-delete-btn" data-id="${item.id}" title="Dismantle Structure" style="background: #21262d; border: 1px solid #30363d; color: #f87171; border-radius: 4px; padding: 3px 6px; font-size: 10px; cursor: pointer;">✕</button>
          </div>
        </div>
      `;
      })
      .join('');

    // Wire Item Event Handlers
    listEl.querySelectorAll('.gev-fly-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        engine.flyToStructure(btn.dataset.id);
      });
    });

    listEl.querySelectorAll('.gev-sanctuary-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentItem = engine.getStructure(id);
        if (currentItem && !currentItem.isSanctuary) {
          engine.setCompanionOverlook(id);
        } else {
          engine.toggleSanctuary(id);
        }
      });
    });

    listEl.querySelectorAll('.gev-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        engine.removeStructure(btn.dataset.id);
      });
    });
  }

  function renderBlueprintRoster(categoryFilter = 'ALL') {
    const listEl = drawer.querySelector('.gev-blueprint-roster-list');
    if (!listEl) return;

    const blueprints = getStructuresByCategory(categoryFilter);

    listEl.innerHTML = blueprints
      .map((bp) => {
        const isSelected = bp.id === selectedBlueprint?.id;
        return `
        <div class="gev-blueprint-item" data-id="${bp.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: ${
          isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(22, 27, 34, 0.6)'
        }; border: 1px solid ${
          isSelected ? '#f59e0b' : '#30363d'
        }; border-radius: 4px; cursor: pointer;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600; font-size: 11px; color: ${
              isSelected ? '#fbbf24' : '#e6edf3'
            };">${bp.name}</span>
            <span style="font-size: 8px; color: #8b949e;">${bp.badge} · ${bp.category}</span>
          </div>
          <span style="font-size: 8px; color: #34d399; font-weight: 600;">Score ${bp.sanctuaryScore}</span>
        </div>
      `;
      })
      .join('');

    listEl.querySelectorAll('.gev-blueprint-item').forEach((el) => {
      el.addEventListener('click', () => {
        selectBlueprint(el.dataset.id);
      });
    });
  }

  function selectBlueprint(id) {
    const bp = getStructureById(id);
    if (!bp) return;

    selectedBlueprint = bp;

    const nameEl = drawer.querySelector('.gev-blueprint-name');
    const scoreEl = drawer.querySelector('.gev-blueprint-score');
    const descEl = drawer.querySelector('.gev-blueprint-desc');
    const dimsEl = drawer.querySelector('.gev-blueprint-dims');
    const capEl = drawer.querySelector('.gev-blueprint-capacity');

    if (nameEl) nameEl.textContent = bp.name;
    if (scoreEl) scoreEl.textContent = `Sanctuary Score ${bp.sanctuaryScore}`;
    if (descEl) descEl.textContent = bp.description;
    if (dimsEl)
      dimsEl.textContent = `${bp.footprint.width}m × ${bp.footprint.length}m × ${bp.footprint.height}m`;
    if (capEl) capEl.textContent = `Capacity: ${bp.capacity}`;

    renderBlueprintRoster(
      drawer.querySelector('.gev-blueprint-category-filter')?.value || 'ALL',
    );
  }

  function openDrawer() {
    if (isOpen) return;
    coordinator.notifyDrawerOpened('sandbox');
    isOpen = true;
    drawer.style.display = 'flex';
    requestAnimationFrame(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    });
    launcherButton.style.borderColor = '#f59e0b';
    launcherButton.style.boxShadow =
      '0 4px 20px rgba(0, 0, 0, 0.8), 0 0 16px rgba(245, 158, 11, 0.45)';

    renderPlacedRoster();
    renderBlueprintRoster();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    setTimeout(() => {
      if (!isOpen) drawer.style.display = 'none';
    }, 250);
    launcherButton.style.borderColor = 'rgba(245, 158, 11, 0.65)';
    launcherButton.style.boxShadow =
      '0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px rgba(245, 158, 11, 0.25)';
    coordinator.notifyDrawerClosed('sandbox');
  }

  function toggle() {
    if (isOpen) closeDrawer();
    else openDrawer();
  }

  // Event Listeners
  launcherButton.addEventListener('click', toggle);

  const closeBtn = drawer.querySelector('.gev-sandbox-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  // Tab Switching
  drawer.querySelectorAll('.gev-sandbox-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      activeTab = tab;

      drawer.querySelectorAll('.gev-sandbox-tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(245, 158, 11, 0.2)';
      btn.style.borderColor = '#f59e0b';
      btn.style.color = '#fbbf24';

      drawer
        .querySelectorAll('.gev-sandbox-tab-content')
        .forEach((c) => (c.style.display = 'none'));
      const activeContent = drawer.querySelector(`.gev-sandbox-content-${tab}`);
      if (activeContent) activeContent.style.display = 'flex';
    });
  });

  // Blueprint Category Filter
  const categoryFilterEl = drawer.querySelector(
    '.gev-blueprint-category-filter',
  );
  if (categoryFilterEl) {
    categoryFilterEl.addEventListener('change', () => {
      renderBlueprintRoster(categoryFilterEl.value);
    });
  }

  // Place Blueprint Button
  const placeBtn = drawer.querySelector('.gev-place-blueprint-btn');
  if (placeBtn) {
    placeBtn.addEventListener('click', () => {
      if (!selectedBlueprint) return;

      let lon = -119.5383; // Default Yosemite Half Dome
      let lat = 37.7456;
      let height = 2694;

      if (viewer && viewer.camera && typeof Cesium !== 'undefined') {
        const carto = Cesium.Cartographic.fromCartesian(viewer.camera.position);
        if (carto) {
          lon = Cesium.Math.toDegrees(carto.longitude);
          lat = Cesium.Math.toDegrees(carto.latitude);
          height = Math.max(0, carto.height - 150);
        }
      }

      engine.addStructure({
        catalogId: selectedBlueprint.id,
        position: {
          longitude: lon,
          latitude: lat,
          height,
          heading: 0,
        },
        customName: selectedBlueprint.name,
        isSanctuary: true,
      });

      // Switch to Placed Tab
      const placedTabBtn = drawer.querySelector(
        '.gev-sandbox-tab-btn[data-tab="placed"]',
      );
      if (placedTabBtn) placedTabBtn.click();
    });
  }

  // Export Layout JSON
  const exportBtn = drawer.querySelector('.gev-export-layout-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = engine.exportSandboxLayout();
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(json);
        exportBtn.textContent = '✓ Copied to Clipboard!';
        setTimeout(() => {
          exportBtn.textContent = '💾 Copy Layout JSON';
        }, 2000);
      }
    });
  }

  // Sample Layout Spawn
  const sampleBtn = drawer.querySelector('.gev-sample-layout-btn');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      // Spawn two scenic structures near Yosemite Half Dome & Glacier Point
      engine.addStructure({
        catalogId: 'struct-fire-lookout',
        position: { longitude: -119.5383, latitude: 37.7456, height: 2694 },
        customName: 'Half Dome Sentinel Lookout',
        isSanctuary: true,
      });
      engine.addStructure({
        catalogId: 'struct-overlook-bench',
        position: { longitude: -119.5734, latitude: 37.7274, height: 2199 },
        customName: 'Glacier Point Sunset Bench',
        isSanctuary: true,
      });
      renderPlacedRoster();
      const placedTabBtn = drawer.querySelector(
        '.gev-sandbox-tab-btn[data-tab="placed"]',
      );
      if (placedTabBtn) placedTabBtn.click();
    });
  }

  // Atmosphere Presets
  drawer.querySelectorAll('.gev-atmo-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('.gev-atmo-preset-btn').forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#e6edf3';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(245, 158, 11, 0.2)';
      btn.style.borderColor = '#f59e0b';
      btn.style.color = '#fbbf24';

      const preset = btn.dataset.preset;
      if (viewer && viewer.clock && typeof Cesium !== 'undefined') {
        if (preset === 'DAWN') {
          viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
            '2026-11-02T06:45:00Z',
          );
        } else if (preset === 'GOLDEN') {
          viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
            '2026-11-02T17:30:00Z',
          );
        } else if (preset === 'STARGAZING') {
          viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
            '2026-11-02T23:00:00Z',
          );
        }
      }
    });
  });

  // Hotkey 'B' (Build / Blueprints)
  function handleKeyDown(e) {
    if (
      e.target &&
      (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable)
    ) {
      return;
    }
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      toggle();
    }
  }
  window.addEventListener('keydown', handleKeyDown);

  // Initial Renders
  renderPlacedRoster();
  renderBlueprintRoster();

  // Deeplink URL Parser
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sandbox') === 'true') {
      openDrawer();
    }
    const bpParam = params.get('blueprint');
    if (bpParam) {
      selectBlueprint(bpParam);
      openDrawer();
    }
  }

  function destroy() {
    window.removeEventListener('keydown', handleKeyDown);
    engine.destroy();
    coordinator.unregisterDrawer('sandbox');
    launcherButton.remove();
    drawer.remove();
  }

  return {
    open: openDrawer,
    close: closeDrawer,
    toggle,
    isOpen: () => isOpen,
    selectBlueprint,
    getEngine: () => engine,
    destroy,
  };
}
