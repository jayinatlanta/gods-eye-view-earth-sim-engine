/**
 * Custom Domiciles, Dynamic Property Claim & Personal Fleet UI Drawer.
 * (Domiciles, Estates & Personal Fleet Terminal)
 *
 * Implements:
 * - Floating HUD launcher button at `bottom: 74px; right: 440px` (accent #22d3ee)
 * - Single-active-flyout mutual exclusion via worldSimDock.js
 * - Keyboard hotkey navigation: 'H' toggles drawer
 * - Dynamic Viewport & Search Ownership Claim UI:
 *   - 1-Click claim from current viewport or search bar across 3 archetypes:
 *     1. [ 🏡 Own Home ] (Primary Residence)
 *     2. [ 🏖️ Own Vacation Property ] (Vacation Sanctuary)
 *     3. [ 🏢 Own Workplace ] (Virtual Venture HQ)
 * - Personal Multi-Tier Fleet Mode Selector (Walk, Cruiser Bike, E-Scooter, EV Sedan)
 * - Solo vs. Tandem Mode Switcher (SOLO_FOCUS vs COMPANION_TANDEM)
 * - Unified Departure Terminal actions (Driveway ➔ Drive, Doorstep ➔ MARTA, Dock ➔ Sails)
 * - Camera Perspective Suite (Overview, Doorstep, Driveway)
 * - URL Deeplink routing: ?domicile=..., ?claimDomicile=true, ?fleet=..., ?companionMode=...
 */

import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { getCompanionPersonaName } from '../layers/citylife/companionDot.js';
import {
  getAllDomiciles,
  getDomicileById,
  claimDomicileAtLocation,
  removeClaimedDomicile,
  renameDomicile,
  DOMICILE_TYPOLOGIES,
  DOMICILE_TYPOLOGY_META,
  onDomicileRegistryChange,
} from '../layers/estates/domicileCatalog.js';
import {
  FLEET_MODES,
  COMPANION_MODES,
} from '../layers/estates/personalFleetEngine.js';
import { getAllHelipads, getHelipadById } from '../flight/helipadCatalog.js';

// i18n-ignore: curated cities catalog
export const MAJOR_CITIES = Object.freeze({
  atlanta: {
    title: 'Atlanta Downtown (GA)',
    name: 'Atlanta Downtown (GA)',
    lat: 33.749,
    lon: -84.388,
    address: 'Downtown Atlanta, GA',
  },
  savannah: {
    title: 'Savannah Historic District (GA)',
    name: 'Savannah Historic District (GA)',
    lat: 32.0809,
    lon: -81.0912,
    address: 'Historic District, Savannah, GA',
  },
  mountain_overlook: {
    title: 'Mountain Overlook Ridge (GA)',
    name: 'Mountain Overlook Ridge (GA)',
    lat: 34.864,
    lon: -84.324,
    address: 'North Georgia Alpine Ridge',
  },
  charlotte: {
    title: 'Charlotte Center City (NC)',
    name: 'Charlotte Center City (NC)',
    lat: 35.2271,
    lon: -80.8431,
    address: 'Center City, Charlotte, NC',
  },
  nyc: {
    title: 'New York Manhattan (NY)',
    name: 'New York Manhattan (NY)',
    lat: 40.7128,
    lon: -74.006,
    address: 'Manhattan, New York, NY',
  },
  dc: {
    title: 'Washington DC National Mall',
    name: 'Washington DC National Mall',
    lat: 38.8951,
    lon: -77.0364,
    address: 'National Mall, Washington, DC',
  },
  miami: {
    title: 'Miami Beach Ocean Drive (FL)',
    name: 'Miami Beach Ocean Drive (FL)',
    lat: 25.7617,
    lon: -80.1918,
    address: 'Ocean Drive, Miami Beach, FL',
  },
  chicago: {
    title: 'Chicago The Loop (IL)',
    name: 'Chicago The Loop (IL)',
    lat: 41.8819,
    lon: -87.6278,
    address: 'The Loop, Chicago, IL',
  },
  la: {
    title: 'Los Angeles Downtown (CA)',
    name: 'Los Angeles Downtown (CA)',
    lat: 34.0522,
    lon: -118.2437,
    address: 'Downtown, Los Angeles, CA',
  },
  sf: {
    title: 'San Francisco Embarcadero (CA)',
    name: 'San Francisco Embarcadero (CA)',
    lat: 37.7952,
    lon: -122.3937,
    address: 'The Embarcadero, San Francisco, CA',
  },
});

export function createEstateDrawer({
  claimScout = null,
  fleetEngine = null,
  audioEngine = null,
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
  let activeTab = 'estate'; // 'estate' | 'fleet' | 'claim'
  let refreshTimer = null;
  let registryUnsub = null;

  // Root Drawer Container
  const drawer = document.createElement('div');
  drawer.className = 'gev-estate-drawer hidden';
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
    border: 1px solid rgba(34, 211, 238, 0.45);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(34, 211, 238, 0.25);
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
    <!-- Drawer Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(34, 211, 238, 0.25); padding-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🏡</span>
        <span style="font-weight: 700; font-size: 13px; color: #67e8f9; letter-spacing: 0.5px; text-transform: uppercase;">
          Custom Domiciles & Fleet
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="gev-estate-chimes-btn" title="Porch Wind Chimes" style="background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4); color: #67e8f9; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">🎐 Chimes</button>
        <button class="gev-estate-close-btn" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 15px; padding: 2px 6px;">✕</button>
      </div>
    </div>

    <!-- Active Domicile Card -->
    <div class="gev-estate-active-card" style="background: rgba(22, 27, 34, 0.95); border: 1px solid rgba(34, 211, 238, 0.5); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
          <span class="gev-estate-typology-icon" style="font-size: 14px;">🏡</span>
          <span class="gev-estate-title" style="font-size: 12px; font-weight: 700; color: #67e8f9; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">Civic District Residence</span>
          <button class="gev-estate-rename-btn" title="Rename Property" style="background: transparent; border: none; color: #38bdf8; cursor: pointer; font-size: 12px; padding: 0 4px; display: inline-flex; align-items: center;">✏️</button>
        </div>
        <span class="gev-estate-typology-badge" style="font-size: 8px; font-weight: 700; background: rgba(34, 211, 238, 0.2); color: #67e8f9; padding: 2px 5px; border-radius: 3px; white-space: nowrap;">PRIMARY RESIDENCE</span>
      </div>

      <!-- Inline Rename Form -->
      <div class="gev-estate-rename-form" style="display: none; gap: 4px; align-items: center; margin-top: 2px;">
        <input type="text" class="gev-estate-rename-input" placeholder="Property name (e.g. Lakeview Home)" style="flex: 1; background: #0d1117; border: 1px solid #22d3ee; border-radius: 4px; color: #e6edf3; font-size: 11px; padding: 3px 6px; outline: none;" />
        <button class="gev-estate-rename-save-btn" style="background: #0891b2; color: #fff; border: none; border-radius: 4px; font-size: 10px; padding: 3px 8px; cursor: pointer; font-weight: 600;">Save</button>
        <button class="gev-estate-rename-cancel-btn" style="background: #21262d; color: #8b949e; border: 1px solid #30363d; border-radius: 4px; font-size: 10px; padding: 3px 6px; cursor: pointer;">✕</button>
      </div>

      <div class="gev-estate-address" style="font-size: 10px; color: #8b949e;">Austin, TX</div>

      <!-- Quick Teleport Lens Row -->
      <div class="gev-estate-lens-row" style="display: flex; gap: 4px; margin-top: 4px;">
        <button class="gev-estate-fly-btn" data-mode="overview" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">🔭 Overview</button>
        <button class="gev-estate-fly-btn" data-mode="doorstep" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">🚪 Doorstep</button>
        <button class="gev-estate-fly-btn" data-mode="driveway" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">🚗 Driveway</button>
      </div>

      <!-- Empty State Claim Prompt Button -->
      <button class="gev-estate-go-claim-btn" style="display: none; padding: 6px; font-size: 10px; font-weight: 600; background: #0891b2; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; text-align: center; margin-top: 4px;">
        🗺️ Claim Current Viewport as Property
      </button>

      <!-- Infrastructure Connections -->
      <div class="gev-estate-infra-block" style="display: flex; flex-direction: column; gap: 3px; font-size: 9px; color: #c9d1d9; background: rgba(13, 17, 23, 0.7); padding: 6px; border-radius: 4px; margin-top: 2px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #8b949e;">Transit:</span>
          <span class="gev-estate-transit-val" style="color: #a5f3fc; font-weight: 600;">Connected</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #8b949e;">Highway:</span>
          <span class="gev-estate-highway-val" style="color: #cbd5e1; font-weight: 500;">Connected</span>
        </div>
      </div>
    </div>

    <!-- Mode Selector Tabs -->
    <div style="display: flex; gap: 6px; background: rgba(22, 27, 34, 0.8); padding: 3px; border-radius: 6px; border: 1px solid #30363d;">
      <button class="gev-estate-tab-btn" data-tab="estate" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600; background: #0891b2; color: #ffffff; border: none; border-radius: 4px; cursor: pointer;">
        🏡 Estates Roster
      </button>
      <button class="gev-estate-tab-btn" data-tab="fleet" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600; background: transparent; color: #8b949e; border: none; border-radius: 4px; cursor: pointer;">
        🚲 Personal Fleet
      </button>
      <button class="gev-estate-tab-btn" data-tab="claim" style="flex: 1; padding: 5px 8px; font-size: 10px; font-weight: 600; background: transparent; color: #8b949e; border: none; border-radius: 4px; cursor: pointer;">
        🗺️ Claim Viewport
      </button>
    </div>

    <!-- TAB 1: Estates Roster & Unified Departures -->
    <div class="gev-estate-tab-content gev-estate-content-estate" style="display: flex; flex-direction: column; gap: 8px;">
      <!-- Unified Departure Terminal -->
      <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(22, 27, 34, 0.7); border: 1px solid rgba(34, 211, 238, 0.25); border-radius: 6px; padding: 8px;">
        <span style="font-size: 9px; font-weight: 700; color: #67e8f9; text-transform: uppercase;">
          Unified Departure Terminal (Zero-Teleport)
        </span>
        <div style="display: flex; gap: 4px;">
          <button class="gev-estate-depart-drive-btn" style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4); color: #67e8f9; border-radius: 4px; cursor: pointer;">
            🚗 Hit Highway
          </button>
          <button class="gev-estate-depart-transit-btn" style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; border-radius: 4px; cursor: pointer;">
            🚊 Head to Metro
          </button>
          <button class="gev-estate-depart-sails-btn" style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; border-radius: 4px; cursor: pointer;">
            ⛵ Set Sail
          </button>
        </div>

        <!-- Road Trip & Multi-Modal Destination Routing -->
        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px dashed rgba(34, 211, 238, 0.25); padding-top: 6px; margin-top: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 8px; color: #8b949e; text-transform: uppercase; font-weight: 700;">Multi-Modal Travel & Heli-Hop:</span>
            <span style="font-size: 8px; color: #38bdf8; font-weight: 600;">Planetary Route</span>
          </div>
          <select class="gev-travel-dest-select" style="background: #0d1117; border: 1px solid #30363d; color: #e6edf3; font-size: 10px; padding: 4px 6px; border-radius: 4px; outline: none; width: 100%;">
            <option value="">Select Destination...</option>
          </select>
          <div class="gev-travel-custom-wrap" style="display: none; flex-direction: column; gap: 3px; margin-top: 2px;">
            <input type="text" class="gev-travel-custom-input" placeholder="Type city or lat,lon (e.g. 34.05, -118.24)" style="background: #0d1117; border: 1px solid #30363d; color: #e6edf3; font-size: 10px; padding: 4px 6px; border-radius: 4px; outline: none; width: 100%;" />
          </div>
          <div style="display: flex; gap: 4px; margin-top: 2px;">
            <button class="gev-estate-roadtrip-btn" disabled style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(129, 140, 248, 0.15); border: 1px solid rgba(129, 140, 248, 0.4); color: #c7d2fe; border-radius: 4px; cursor: not-allowed; opacity: 0.45;" title="Select destination first">
              🚗 Road Trip
            </button>
            <button class="gev-estate-helihop-btn" disabled style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); color: #67e8f9; border-radius: 4px; cursor: not-allowed; opacity: 0.45;" title="Select destination first">
              🚁 Heli-Hop
            </button>
            <button class="gev-estate-composite-btn" disabled style="flex: 1; padding: 5px; font-size: 9px; font-weight: 600; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fde68a; border-radius: 4px; cursor: not-allowed; opacity: 0.45;" title="Select destination first">
              🌐 5-Leg
            </button>
          </div>
        </div>
      </div>

      <!-- Owned Sanctuaries List -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">
          Owned Sanctuaries & Properties
        </span>
        <div class="gev-estate-roster-list" style="display: flex; flex-direction: column; gap: 5px; max-height: 180px; overflow-y: auto;">
          <!-- Populated dynamically -->
        </div>
      </div>
    </div>

    <!-- TAB 2: Personal Fleet Terminal -->
    <div class="gev-estate-tab-content gev-estate-content-fleet" style="display: none; flex-direction: column; gap: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">
          Select Vehicle & Mobility Mode
        </span>
        <button class="gev-estate-bell-btn" title="Bell / Horn" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer;">🔔 Ring Bell</button>
      </div>

      <!-- Fleet Modes Grid -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
        <button class="gev-fleet-mode-btn" data-mode="walk" style="padding: 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>🚶 Walk</span>
            <span style="color: #22d3ee; font-size: 9px;">2.7 mph</span>
          </div>
          <span style="font-size: 8px; color: #8b949e;">Sidewalk stroll</span>
        </button>
        <button class="gev-fleet-mode-btn" data-mode="bike" style="padding: 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>🚲 Cruiser Bike</span>
            <span style="color: #10b981; font-size: 9px;">12.3 mph</span>
          </div>
          <span style="font-size: 8px; color: #8b949e;">Cruiser bicycle</span>
        </button>
        <button class="gev-fleet-mode-btn" data-mode="scooter" style="padding: 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>🛴 E-Scooter</span>
            <span style="color: #f59e0b; font-size: 9px;">15.6 mph</span>
          </div>
          <span style="font-size: 8px; color: #8b949e;">Zippy throttle</span>
        </button>
        <button class="gev-fleet-mode-btn" data-mode="ev" style="padding: 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>⚡ EV Sedan</span>
            <span style="color: #818cf8; font-size: 9px;">31.3 mph</span>
          </div>
          <span style="font-size: 8px; color: #8b949e;">Quiet dual-motor</span>
        </button>
        <button class="gev-fleet-mode-btn" data-mode="h145" style="grid-column: span 2; padding: 8px; font-size: 10px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; justify-content: space-between;">
            <span>🚁 Airbus H145 (Fenestron)</span>
            <span style="color: #06b6d4; font-size: 9px;">104 mph · 1,000 ft</span>
          </div>
          <span style="font-size: 8px; color: #8b949e;">Ducted tail rotor · Helionix 4-axis hover hold · Chin bubble view</span>
        </button>
      </div>

      <!-- Helionix Hover Hold & Meditative Controls (Active when H145 is selected) -->
      <div class="gev-heli-controls" style="display: none; flex-direction: column; gap: 6px; background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.35); border-radius: 6px; padding: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 9px; font-weight: 700; color: #67e8f9; text-transform: uppercase;">
            Helionix Autopilot & Cockpit Suite
          </span>
          <button class="gev-heli-hover-btn" style="background: #21262d; border: 1px solid #06b6d4; color: #67e8f9; border-radius: 4px; padding: 2px 8px; font-size: 9px; font-weight: 600; cursor: pointer;">
            🛑 Hover Hold
          </button>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="gev-heli-cam-btn" data-cam="chin_bubble" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
            🧘 Chin-Bubble
          </button>
          <button class="gev-heli-cam-btn" data-cam="meditation_orbit" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
            🛰️ Orbit View
          </button>
          <button class="gev-heli-cam-btn" data-cam="heli_chase" style="flex: 1; padding: 4px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; cursor: pointer;">
            🚁 Chase View
          </button>
        </div>
      </div>

      <!-- Companion Mode Matrix -->
      <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(22, 27, 34, 0.7); border: 1px solid #30363d; border-radius: 6px; padding: 8px;">
        <span style="font-size: 9px; font-weight: 700; color: #8b949e; text-transform: uppercase;">
          Companion Matrix
        </span>
        <div style="display: flex; gap: 6px;">
          <button class="gev-companion-mode-btn" data-companion="solo_focus" style="flex: 1; padding: 6px; font-size: 9px; font-weight: 600; background: #21262d; border: 1px solid #30363d; color: #8b949e; border-radius: 4px; cursor: pointer;">
            🧘 Solo Focus
          </button>
          <button class="gev-companion-mode-btn" data-companion="companion_tandem" style="flex: 1; padding: 6px; font-size: 9px; font-weight: 600; background: #059669; border: 1px solid #10b981; color: #ffffff; border-radius: 4px; cursor: pointer;">
            👯 Tandem (${getCompanionPersonaName()})
          </button>
        </div>
      </div>

      <!-- Drive / Ride Action Button -->
      <button class="gev-estate-ride-btn" style="width: 100%; padding: 8px; font-size: 11px; font-weight: 700; background: #0891b2; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px;">
        <span>🚀 Embark from Domicile</span>
      </button>
    </div>

    <!-- TAB 3: Dynamic Property Claim (Viewport / Search) -->
    <div class="gev-estate-tab-content gev-estate-content-claim" style="display: none; flex-direction: column; gap: 8px;">
      <span style="font-size: 9px; font-weight: 700; color: #67e8f9; text-transform: uppercase;">
        Claim Location Anywhere on Earth
      </span>
      <div style="background: rgba(22, 27, 34, 0.7); border: 1px solid #30363d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span style="color: #8b949e;">Viewport Center:</span>
          <span class="gev-claim-viewport-coords" style="color: #67e8f9; font-weight: 600;">30.2672°, -97.7431°</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
          <label style="font-size: 9px; color: #8b949e; text-transform: uppercase; font-weight: 600;">Custom Property Name (Optional):</label>
          <input type="text" class="gev-claim-name-input" placeholder="e.g. Lakeview Home" style="background: #0d1117; border: 1px solid #30363d; color: #e6edf3; font-size: 11px; padding: 5px 8px; border-radius: 4px; outline: none;" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
          <button class="gev-claim-action-btn" data-typology="PRIMARY_RESIDENCE" style="padding: 7px; font-size: 10px; font-weight: 600; background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.5); color: #67e8f9; border-radius: 4px; cursor: pointer; text-align: left;">
            🏡 Own Home (Primary Residence)
          </button>
          <button class="gev-claim-action-btn" data-typology="VACATION_SANCTUARY" style="padding: 7px; font-size: 10px; font-weight: 600; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.5); color: #6ee7b7; border-radius: 4px; cursor: pointer; text-align: left;">
            🏖️ Own Vacation Property (Coastal / Mountain)
          </button>
          <button class="gev-claim-action-btn" data-typology="VENTURE_HQ" style="padding: 7px; font-size: 10px; font-weight: 600; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.5); color: #fde68a; border-radius: 4px; cursor: pointer; text-align: left;">
            🏢 Own Workplace / Venture Studio HQ
          </button>
        </div>
      </div>
      <div style="font-size: 9px; color: #8b949e; line-height: 1.4;">
        💡 Tip: Pan or fly anywhere on the 3D globe or search an address in the search bar, enter your custom property name, and click any claim button to establish your personal estate deed.
      </div>
    </div>
  `;

  // Floating HUD Trigger Button at `bottom: 74px; right: 440px` (accent #22d3ee)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-estate-launcher-btn';
  launcherButton.title = 'Custom Domiciles, Estates & Fleet (H)';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 440px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(13, 17, 23, 0.92);
    border: 1px solid rgba(34, 211, 238, 0.65);
    color: #67e8f9;
    font-size: 20px;
    cursor: pointer;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
    pointer-events: auto;
  `;
  launcherButton.innerHTML = `<span style="font-size: 20px; line-height: 1;">🏡</span>`;

  launcherButton.addEventListener('mouseenter', () => {
    launcherButton.style.transform = 'scale(1.08)';
    launcherButton.style.borderColor = '#22d3ee';
    launcherButton.style.boxShadow =
      '0 6px 20px rgba(0, 0, 0, 0.8), 0 0 12px rgba(34, 211, 238, 0.4)';
  });
  launcherButton.addEventListener('mouseleave', () => {
    if (!isOpen) {
      launcherButton.style.transform = 'scale(1.0)';
      launcherButton.style.borderColor = 'rgba(34, 211, 238, 0.55)';
      launcherButton.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.6)';
    }
  });

  const mountTarget = container || document.body;
  mountTarget.appendChild(drawer);
  mountTarget.appendChild(launcherButton);

  // Wire UI Elements
  const closeBtn = drawer.querySelector('.gev-estate-close-btn');
  const chimesBtn = drawer.querySelector('.gev-estate-chimes-btn');
  const bellBtn = drawer.querySelector('.gev-estate-bell-btn');
  const tabBtns = drawer.querySelectorAll('.gev-estate-tab-btn');
  const flyBtns = drawer.querySelectorAll('.gev-estate-fly-btn');
  const fleetModeBtns = drawer.querySelectorAll('.gev-fleet-mode-btn');
  const companionModeBtns = drawer.querySelectorAll('.gev-companion-mode-btn');
  const departDriveBtn = drawer.querySelector('.gev-estate-depart-drive-btn');
  const departTransitBtn = drawer.querySelector(
    '.gev-estate-depart-transit-btn',
  );
  const departSailsBtn = drawer.querySelector('.gev-estate-depart-sails-btn');
  const rideBtn = drawer.querySelector('.gev-estate-ride-btn');
  const claimActionBtns = drawer.querySelectorAll('.gev-claim-action-btn');
  const rosterList = drawer.querySelector('.gev-estate-roster-list');
  const viewportCoordsEl = drawer.querySelector('.gev-claim-viewport-coords');
  const claimTitleInput = drawer.querySelector('.gev-claim-name-input');
  const renameBtn = drawer.querySelector('.gev-estate-rename-btn');
  const renameForm = drawer.querySelector('.gev-estate-rename-form');
  const renameInput = drawer.querySelector('.gev-estate-rename-input');
  const renameSaveBtn = drawer.querySelector('.gev-estate-rename-save-btn');
  const renameCancelBtn = drawer.querySelector('.gev-estate-rename-cancel-btn');
  const goClaimBtn = drawer.querySelector('.gev-estate-go-claim-btn');
  const travelDestSelect = drawer.querySelector('.gev-travel-dest-select');
  const travelCustomWrap = drawer.querySelector('.gev-travel-custom-wrap');
  const travelCustomInput = drawer.querySelector('.gev-travel-custom-input');
  const roadTripBtn = drawer.querySelector('.gev-estate-roadtrip-btn');
  const heliHopBtn = drawer.querySelector('.gev-estate-helihop-btn');
  const compositeBtn = drawer.querySelector('.gev-estate-composite-btn');
  const heliControls = drawer.querySelector('.gev-heli-controls');
  const heliHoverBtn = drawer.querySelector('.gev-heli-hover-btn');
  const heliCamBtns = drawer.querySelectorAll('.gev-heli-cam-btn');

  function open() {
    if (isOpen) return;
    const coordinator = getGlobalDrawerCoordinator();
    coordinator.notifyDrawerOpened('estate');

    isOpen = true;
    drawer.style.display = 'flex';
    drawer.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0px)';
    });

    launcherButton.style.transform = 'scale(1.08)';
    launcherButton.style.borderColor = '#22d3ee';
    launcherButton.style.boxShadow =
      '0 6px 20px rgba(0, 0, 0, 0.8), 0 0 16px rgba(34, 211, 238, 0.5)';

    updateUI();
    refreshTimer = setInterval(updateViewportCoordinatesDisplay, 1000);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    setTimeout(() => {
      if (!isOpen) drawer.style.display = 'none';
    }, 250);

    launcherButton.style.transform = 'scale(1.0)';
    launcherButton.style.borderColor = 'rgba(34, 211, 238, 0.55)';
    launcherButton.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.6)';

    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }

    const coordinator = getGlobalDrawerCoordinator();
    coordinator.notifyDrawerClosed('estate');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // Register in mutual exclusion coordinator
  const coordinator = getGlobalDrawerCoordinator();
  coordinator.registerDrawer('estate', {
    open,
    close,
    isOpen: () => isOpen,
    button: launcherButton,
    accentColor: '#22d3ee',
  });

  launcherButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  chimesBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioEngine) {
      if (audioEngine.isMuted && audioEngine.setMuted) {
        audioEngine.setMuted(false);
      }
      if (audioEngine.playWindChimes) {
        audioEngine.playWindChimes({ force: true });
      }
      chimesBtn.style.transition = 'transform 0.15s ease, filter 0.15s ease';
      chimesBtn.style.transform = 'scale(1.18)';
      chimesBtn.style.filter = 'brightness(1.4)';
      setTimeout(() => {
        chimesBtn.style.transform = 'scale(1.0)';
        chimesBtn.style.filter = 'brightness(1.0)';
      }, 200);
    }
  });
  bellBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioEngine) {
      if (audioEngine.isMuted && audioEngine.setMuted) {
        audioEngine.setMuted(false);
      }
      if (audioEngine.playBicycleBell) {
        audioEngine.playBicycleBell({ force: true });
      }
    }
  });

  // Tab switching
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.getAttribute('data-tab');
      tabBtns.forEach((b) => {
        const isSelected = b.getAttribute('data-tab') === activeTab;
        b.style.background = isSelected ? '#0891b2' : 'transparent';
        b.style.color = isSelected ? '#ffffff' : '#8b949e';
      });
      drawer.querySelectorAll('.gev-estate-tab-content').forEach((content) => {
        content.style.display = content.classList.contains(
          `gev-estate-content-${activeTab}`,
        )
          ? 'flex'
          : 'none';
      });
      if (activeTab === 'claim') {
        updateViewportCoordinatesDisplay();
      }
    });
  });

  // Camera flying presets
  flyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') || 'overview';
      const current = claimScout?.getActiveDomicile() || getAllDomiciles()[0];
      if (current && claimScout?.flyToDomicile) {
        claimScout.flyToDomicile(current.id, { mode });
      }
    });
  });

  // Fleet mode selector
  fleetModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (fleetEngine?.setFleetMode) {
        fleetEngine.setFleetMode(mode);
        updateUI();
      }
    });
  });

  // Companion mode selector
  companionModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const comp = btn.getAttribute('data-companion');
      if (fleetEngine?.setCompanionMode) {
        fleetEngine.setCompanionMode(comp);
        updateUI();
      }
    });
  });

  // Departure Handoffs
  departDriveBtn?.addEventListener('click', () => {
    if (fleetEngine?.handoffToInfiniteDrive) {
      fleetEngine.handoffToInfiniteDrive();
      close();
    }
  });
  departTransitBtn?.addEventListener('click', () => {
    if (fleetEngine?.handoffToRapidTransit) {
      fleetEngine.handoffToRapidTransit();
      close();
    }
  });
  departSailsBtn?.addEventListener('click', () => {
    if (fleetEngine?.handoffToSails) {
      fleetEngine.handoffToSails();
      close();
    }
  });

  function resolveSelectedDestination() {
    const val = travelDestSelect?.value;
    if (!val) return null;

    if (val.startsWith('city:')) {
      const cityKey = val.replace('city:', '');
      return MAJOR_CITIES[cityKey] || null;
    }

    if (val === 'custom') {
      const text = travelCustomInput?.value?.trim();
      if (!text) return null;
      const match = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180
        ) {
          return {
            title: `Custom (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
            name: `Custom (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
            lat,
            lon,
            address: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
          };
        }
      }
      const lower = text.toLowerCase();
      for (const [key, city] of Object.entries(MAJOR_CITIES)) {
        if (
          key.includes(lower) ||
          city.title.toLowerCase().includes(lower) ||
          city.address.toLowerCase().includes(lower)
        ) {
          return city;
        }
      }
      return {
        title: text,
        name: text,
        lat: 33.749,
        lon: -84.388,
        address: text,
      };
    }

    return getDomicileById(val) || getHelipadById(val) || null;
  }

  function updateTravelButtonsState() {
    const dest = resolveSelectedDestination();
    const isEnabled = Boolean(dest);

    [roadTripBtn, heliHopBtn, compositeBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = !isEnabled;
      btn.style.opacity = isEnabled ? '1.0' : '0.45';
      btn.style.cursor = isEnabled ? 'pointer' : 'not-allowed';
      btn.title = isEnabled
        ? dest.title || 'Proceed to departure'
        : 'Select destination first';
    });
  }

  function flashDestinationRequired() {
    if (travelDestSelect) {
      const origBorder = travelDestSelect.style.borderColor;
      const origBoxShadow = travelDestSelect.style.boxShadow;
      travelDestSelect.style.borderColor = '#ef4444';
      travelDestSelect.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.6)';
      setTimeout(() => {
        travelDestSelect.style.borderColor = origBorder || '#30363d';
        travelDestSelect.style.boxShadow = origBoxShadow || 'none';
      }, 1500);
      travelDestSelect.focus();
    }
  }

  travelDestSelect?.addEventListener('change', () => {
    if (travelDestSelect.value === 'custom') {
      if (travelCustomWrap) travelCustomWrap.style.display = 'flex';
      travelCustomInput?.focus();
    } else {
      if (travelCustomWrap) travelCustomWrap.style.display = 'none';
    }
    updateTravelButtonsState();
  });

  travelCustomInput?.addEventListener('input', () => {
    updateTravelButtonsState();
  });

  // Multi-Modal Road Trip & Heli-Hop Departure Actions
  roadTripBtn?.addEventListener('click', () => {
    const target = resolveSelectedDestination();
    if (!target) {
      flashDestinationRequired();
      return;
    }
    if (fleetEngine?.handoffToRoadTrip) {
      fleetEngine.handoffToRoadTrip(target);
      close();
    }
  });

  heliHopBtn?.addEventListener('click', () => {
    const target = resolveSelectedDestination();
    if (!target) {
      flashDestinationRequired();
      return;
    }
    if (fleetEngine?.handoffToHelicopterFlight) {
      fleetEngine.handoffToHelicopterFlight(target);
      close();
    }
  });

  compositeBtn?.addEventListener('click', () => {
    const target = resolveSelectedDestination();
    if (!target) {
      flashDestinationRequired();
      return;
    }
    const all = getAllDomiciles();
    const curDom =
      claimScout?.getActiveDomicile() || fleetEngine?.activeDomicile || all[0];

    if (
      typeof window !== 'undefined' &&
      window.__gevCompositeTravel?.planCompositeJourney
    ) {
      window.__gevCompositeTravel.planCompositeJourney({
        originDomicile: curDom,
        destinationDomicileOrPoint: target,
        flightMode:
          fleetEngine?.activeMode?.id === 'h145' ? 'h145' : 'airliner',
      });
      window.__gevCompositeTravel.startJourney();
      close();
    }
  });

  heliHoverBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fleetEngine?.toggleHover) {
      const isHover = fleetEngine.toggleHover();
      heliHoverBtn.style.background = isHover ? '#059669' : '#21262d';
      heliHoverBtn.style.borderColor = isHover ? '#10b981' : '#06b6d4';
      heliHoverBtn.textContent = isHover ? '✓ Hover Active' : '🛑 Hover Hold';
    }
  });

  heliCamBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cam = btn.getAttribute('data-cam');
      if (fleetEngine?.setCameraMode) {
        fleetEngine.setCameraMode(cam);
        heliCamBtns.forEach((b) => {
          const isSel = b.getAttribute('data-cam') === cam;
          b.style.background = isSel ? '#0891b2' : '#21262d';
          b.style.color = isSel ? '#ffffff' : '#e6edf3';
        });
      }
    });
  });

  rideBtn?.addEventListener('click', () => {
    if (fleetEngine) {
      if (fleetEngine.isActive) {
        fleetEngine.stop();
        rideBtn.innerHTML = '<span>🚀 Embark from Domicile</span>';
        rideBtn.style.background = '#0891b2';
      } else {
        fleetEngine.start();
        rideBtn.innerHTML = '<span>⏹️ Return to Sanctuary</span>';
        rideBtn.style.background = '#e11d48';
      }
      updateUI();
    }
  });

  // Rename Property Form Handlers
  goClaimBtn?.addEventListener('click', () => {
    activeTab = 'claim';
    tabBtns[2]?.click();
  });

  function cancelRename() {
    if (renameForm) renameForm.style.display = 'none';
    const titleEl = drawer.querySelector('.gev-estate-title');
    if (titleEl) titleEl.style.display = 'inline';
    if (renameBtn) renameBtn.style.display = 'inline-flex';
  }

  function saveRename() {
    const all = getAllDomiciles();
    const current =
      claimScout?.getActiveDomicile() || fleetEngine?.activeDomicile || all[0];
    if (current && renameInput?.value?.trim()) {
      renameDomicile(current.id, renameInput.value.trim());
    }
    cancelRename();
    updateUI();
  }

  renameBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const all = getAllDomiciles();
    const current =
      claimScout?.getActiveDomicile() || fleetEngine?.activeDomicile || all[0];
    if (!current) return;
    if (renameForm && renameInput) {
      renameInput.value = current.title;
      renameForm.style.display = 'flex';
      const titleEl = drawer.querySelector('.gev-estate-title');
      if (titleEl) titleEl.style.display = 'none';
      renameBtn.style.display = 'none';
      renameInput.focus();
    }
  });

  renameSaveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveRename();
  });

  renameCancelBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelRename();
  });

  renameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  });

  // Claim Viewport actions
  claimActionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const typology =
        btn.getAttribute('data-typology') ||
        DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE;
      const customTitle = claimTitleInput?.value?.trim() || null;
      if (claimScout?.claimCurrentViewport) {
        const claimed = claimScout.claimCurrentViewport({
          typology,
          title: customTitle,
        });
        if (claimTitleInput) claimTitleInput.value = '';
        activeTab = 'estate';
        tabBtns[0].click();
        updateUI();
      }
    });
  });

  function updateViewportCoordinatesDisplay() {
    if (!viewportCoordsEl) return;
    const coords = claimScout?.getViewportCoordinates() || {
      lat: 30.2672,
      lon: -97.7431,
    };
    viewportCoordsEl.textContent = `${coords.lat.toFixed(4)}°, ${coords.lon.toFixed(4)}°`;
  }

  const estateRowsById = new Map();

  function applyEstateRowStyle(refs, isSelected) {
    if (!refs?.row) return;
    refs.row.style.background = isSelected
      ? 'rgba(34, 211, 238, 0.15)'
      : 'rgba(22, 27, 34, 0.6)';
    refs.row.style.borderColor = isSelected
      ? 'rgba(34, 211, 238, 0.5)'
      : '#30363d';
    refs.row.classList?.toggle?.('selected', isSelected);
    if (refs.titleEl) {
      refs.titleEl.style.color = isSelected ? '#67e8f9' : '#e6edf3';
    }
  }

  function bindEstateRosterDelegation() {
    if (!rosterList || rosterList._gevDelegatedBound) return;
    rosterList._gevDelegatedBound = true;
    rosterList.addEventListener('click', (e) => {
      const deleteBtn = e.target?.closest?.('.gev-estate-delete-btn');
      if (deleteBtn && rosterList.contains(deleteBtn)) {
        e.stopPropagation();
        const targetId = deleteBtn.getAttribute('data-id');
        if (targetId) {
          removeClaimedDomicile(targetId);
          updateUI();
        }
        return;
      }

      const renameBtn = e.target?.closest?.('.gev-roster-rename-btn');
      if (renameBtn && rosterList.contains(renameBtn)) {
        e.stopPropagation();
        const targetId = renameBtn.getAttribute('data-id');
        const targetDom = getAllDomiciles().find((d) => d.id === targetId);
        if (targetDom) {
          const entered =
            typeof window !== 'undefined' && window.prompt
              ? window.prompt('Rename Custom Domicile:', targetDom.title)
              : null;
          if (entered && entered.trim()) {
            renameDomicile(targetId, entered.trim());
            updateUI();
          }
        }
        return;
      }

      const row = e.target?.closest?.('.gev-estate-roster-row');
      if (!row || !rosterList.contains(row)) return;
      const domId = row.getAttribute('data-dom-id');
      if (!domId) return;
      for (const [id, refs] of estateRowsById.entries()) {
        applyEstateRowStyle(refs, id === domId);
      }
      const dom = getAllDomiciles().find((d) => d.id === domId);
      if (claimScout?.selectDomicile) {
        claimScout.selectDomicile(domId);
        if (claimScout.flyToDomicile) {
          claimScout.flyToDomicile(domId, { mode: 'overview' });
        }
        if (dom && fleetEngine?.spawnAtDomicile) {
          fleetEngine.spawnAtDomicile(dom);
        }
        updateUI();
      }
    });
  }

  function createEstateRosterRow(dom) {
    const row = document.createElement('div');
    row.className = 'gev-estate-roster-row';
    row.setAttribute('data-dom-id', dom.id);
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(22, 27, 34, 0.6);
      border: 1px solid #30363d;
      border-radius: 4px;
      padding: 5px 8px;
      cursor: pointer;
    `;
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; flex: 1; min-width: 0;">
        <span class="gev-estate-row-icon" style="font-size: 13px;"></span>
        <div style="display: flex; flex-direction: column; overflow: hidden;">
          <span class="gev-estate-row-title" style="font-size: 10px; font-weight: 600; color: #e6edf3; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;"></span>
          <span class="gev-estate-row-addr" style="font-size: 8px; color: #8b949e;"></span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="gev-roster-rename-btn" data-id="${dom.id}" style="background: transparent; border: none; color: #38bdf8; font-size: 11px; cursor: pointer; padding: 2px 4px;" title="Rename Property">✏️</button>
        <button class="gev-estate-delete-btn" data-id="${dom.id}" style="background: transparent; border: none; color: #ef4444; font-size: 11px; cursor: pointer; padding: 2px 4px;" title="Relinquish Deed">🗑️</button>
      </div>
    `;
    return {
      row,
      iconEl: row.querySelector('.gev-estate-row-icon'),
      titleEl: row.querySelector('.gev-estate-row-title'),
      addrEl: row.querySelector('.gev-estate-row-addr'),
    };
  }

  function renderRosterList(currentDomicile) {
    if (!rosterList) return;
    bindEstateRosterDelegation();
    const all = getAllDomiciles();

    if (all.length === 0) {
      estateRowsById.clear();
      if (!rosterList.querySelector('.gev-estate-empty-state')) {
        rosterList.innerHTML = `
          <div class="gev-estate-empty-state" style="padding: 14px 10px; text-align: center; color: #8b949e; font-size: 10px; line-height: 1.5; background: rgba(22, 27, 34, 0.4); border: 1px dashed #30363d; border-radius: 6px;">
            No properties claimed yet.<br/>Pan anywhere on Earth and open <strong>Claim Viewport</strong> to establish a permanent living world deed!
          </div>
        `;
      }
      return;
    }

    const emptyBanner = rosterList.querySelector('.gev-estate-empty-state');
    if (emptyBanner) emptyBanner.remove();

    const seenIds = new Set();
    all.forEach((dom) => {
      seenIds.add(dom.id);
      const isSelected = dom.id === currentDomicile?.id;
      const meta =
        DOMICILE_TYPOLOGY_META[dom.typology] ||
        DOMICILE_TYPOLOGY_META.PRIMARY_RESIDENCE;

      let refs = estateRowsById.get(dom.id);
      if (!refs) {
        refs = createEstateRosterRow(dom);
        estateRowsById.set(dom.id, refs);
      }
      if (refs.row.parentNode !== rosterList) {
        rosterList.appendChild(refs.row);
      }
      if (refs.iconEl && refs.iconEl.textContent !== meta.icon) {
        refs.iconEl.textContent = meta.icon;
      }
      if (refs.titleEl && refs.titleEl.textContent !== dom.title) {
        refs.titleEl.textContent = dom.title;
      }
      if (refs.addrEl && refs.addrEl.textContent !== dom.address) {
        refs.addrEl.textContent = dom.address;
      }
      applyEstateRowStyle(refs, isSelected);
    });

    for (const [id, refs] of estateRowsById.entries()) {
      if (!seenIds.has(id)) {
        refs.row.remove?.();
        estateRowsById.delete(id);
      }
    }
  }

  function updateUI() {
    const all = getAllDomiciles();
    const current =
      claimScout?.getActiveDomicile() ||
      fleetEngine?.activeDomicile ||
      all[0] ||
      null;

    const iconEl = drawer.querySelector('.gev-estate-typology-icon');
    const titleEl = drawer.querySelector('.gev-estate-title');
    const badgeEl = drawer.querySelector('.gev-estate-typology-badge');
    const addressEl = drawer.querySelector('.gev-estate-address');
    const transitEl = drawer.querySelector('.gev-estate-transit-val');
    const highwayEl = drawer.querySelector('.gev-estate-highway-val');
    const lensRow = drawer.querySelector('.gev-estate-lens-row');
    const infraBlock = drawer.querySelector('.gev-estate-infra-block');
    const emptyPromptBtn = drawer.querySelector('.gev-estate-go-claim-btn');

    if (!current) {
      if (iconEl) iconEl.textContent = '🗺️';
      if (titleEl) {
        titleEl.textContent = 'No Properties Claimed Yet';
        titleEl.style.display = 'inline';
      }
      if (renameBtn) renameBtn.style.display = 'none';
      if (renameForm) renameForm.style.display = 'none';
      if (badgeEl) {
        badgeEl.textContent = 'UNCLAIMED';
        badgeEl.style.color = '#8b949e';
      }
      if (addressEl) {
        addressEl.textContent =
          'Pan to your neighborhood and click Claim Viewport.';
      }
      if (lensRow) lensRow.style.display = 'none';
      if (infraBlock) infraBlock.style.display = 'none';
      if (emptyPromptBtn) emptyPromptBtn.style.display = 'block';
      if (departSailsBtn) {
        departSailsBtn.style.opacity = '0.4';
        departSailsBtn.style.pointerEvents = 'none';
      }
      renderRosterList(null);
      return;
    }

    if (lensRow) lensRow.style.display = 'flex';
    if (infraBlock) infraBlock.style.display = 'flex';
    if (emptyPromptBtn) emptyPromptBtn.style.display = 'none';
    if (renameBtn) renameBtn.style.display = 'inline-flex';

    const meta =
      DOMICILE_TYPOLOGY_META[current?.typology] ||
      DOMICILE_TYPOLOGY_META.PRIMARY_RESIDENCE;

    if (iconEl) iconEl.textContent = meta.icon;
    if (titleEl) {
      titleEl.textContent = current.title;
      if (renameForm?.style.display !== 'flex') {
        titleEl.style.display = 'inline';
      }
    }
    if (badgeEl) {
      badgeEl.textContent = meta.label.toUpperCase();
      badgeEl.style.color = meta.accentHex;
    }
    if (addressEl) addressEl.textContent = current.address;
    if (transitEl) {
      transitEl.textContent = current.nearestTransit
        ? `${current.nearestTransit.stationName} (${current.nearestTransit.distanceMiles} mi)`
        : 'Transit Connected';
    }
    if (highwayEl) {
      highwayEl.textContent = current.highwayCorridor || 'Highway Feeder';
    }

    // Sails button enabled state
    if (departSailsBtn) {
      departSailsBtn.style.opacity = current.hasWaterfrontDock ? '1.0' : '0.4';
      departSailsBtn.style.pointerEvents = current.hasWaterfrontDock
        ? 'auto'
        : 'none';
      departSailsBtn.title = current.hasWaterfrontDock
        ? 'Launch Watercraft from Dock'
        : 'Waterfront Dock Required';
    }

    // Fleet mode button styling
    const curFleetMode = fleetEngine?.activeMode?.id || 'walk';
    fleetModeBtns.forEach((b) => {
      const isSel = b.getAttribute?.('data-mode') === curFleetMode;
      b.style.borderColor = isSel ? '#22d3ee' : '#30363d';
      b.style.background = isSel ? 'rgba(34, 211, 238, 0.15)' : '#21262d';
    });

    // Helionix helicopter controls visibility
    if (heliControls) {
      heliControls.style.display = curFleetMode === 'h145' ? 'flex' : 'none';
    }

    // Helionix hover button styling
    if (heliHoverBtn && fleetEngine) {
      const isHover = Boolean(fleetEngine.isHovering);
      heliHoverBtn.style.background = isHover ? '#059669' : '#21262d';
      heliHoverBtn.style.borderColor = isHover ? '#10b981' : '#06b6d4';
      heliHoverBtn.textContent = isHover ? '✓ Hover Active' : '🛑 Hover Hold';
    }

    // Cockpit camera buttons styling
    const curCam = fleetEngine?.getCameraMode
      ? fleetEngine.getCameraMode()
      : fleetEngine?.cameraMode || 'chin_bubble';
    heliCamBtns.forEach((b) => {
      const isSel = b.getAttribute('data-cam') === curCam;
      b.style.background = isSel ? '#0891b2' : '#21262d';
      b.style.color = isSel ? '#ffffff' : '#e6edf3';
    });

    // Populate travel destination dropdown (Domiciles, Helipads, Cities & Custom)
    if (travelDestSelect) {
      const prevVal = travelDestSelect.value;
      travelDestSelect.innerHTML =
        '<option value="">Select Destination...</option>';

      // Custom Domiciles
      const otherDomiciles = all.filter((d) => d.id !== current?.id);
      if (otherDomiciles.length > 0) {
        const optGroupDom = document.createElement('optgroup');
        optGroupDom.label = '🏡 Custom Domiciles';
        otherDomiciles.forEach((dom) => {
          const opt = document.createElement('option');
          opt.value = dom.id;
          opt.textContent = `${dom.title} (${dom.address})`;
          optGroupDom.appendChild(opt);
        });
        travelDestSelect.appendChild(optGroupDom);
      }

      // Dedicated Helipads
      const helipads = getAllHelipads();
      if (helipads.length > 0) {
        const optGroupHeli = document.createElement('optgroup');
        optGroupHeli.label = '🚁 Dedicated Helipads';
        helipads.forEach((hp) => {
          const opt = document.createElement('option');
          opt.value = hp.id;
          const elevM = hp.elevM ?? hp.elev;
          opt.textContent = Number.isFinite(elevM)
            ? `${hp.name} (${elevM}m elev)`
            : hp.name;
          optGroupHeli.appendChild(opt);
        });
        travelDestSelect.appendChild(optGroupHeli);
      }

      // Major Cities & Hubs
      const optGroupCities = document.createElement('optgroup');
      optGroupCities.label = '🏙️ Major Cities & Hubs';
      Object.entries(MAJOR_CITIES).forEach(([key, city]) => {
        const opt = document.createElement('option');
        opt.value = `city:${key}`;
        opt.textContent = `${city.title}`;
        optGroupCities.appendChild(opt);
      });
      travelDestSelect.appendChild(optGroupCities);

      // Custom Location / Search...
      const optCustom = document.createElement('option');
      optCustom.value = 'custom';
      optCustom.textContent = '🔍 Custom Location / Search...';
      travelDestSelect.appendChild(optCustom);

      if (prevVal) {
        travelDestSelect.value = prevVal;
      }
      updateTravelButtonsState();
    }

    // Companion mode button styling
    const curCompanion =
      fleetEngine?.companionMode || COMPANION_MODES.COMPANION_TANDEM;
    companionModeBtns.forEach((b) => {
      const isSel = b.getAttribute?.('data-companion') === curCompanion;
      b.style.background = isSel ? '#059669' : '#21262d';
      b.style.borderColor = isSel ? '#10b981' : '#30363d';
      b.style.color = isSel ? '#ffffff' : '#8b949e';
    });

    renderRosterList(current);
  }

  registryUnsub = onDomicileRegistryChange(() => {
    updateUI();
  });

  // Global Keyboard Hotkey: 'H' toggles the drawer (unless inside an input field)
  function handleKeyDown(e) {
    if (
      e.key &&
      (e.key.toLowerCase() === 'h' || e.code === 'KeyH') &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      toggle();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
  }

  // URL Query Parameter Routing
  function parseUrlParameters() {
    if (typeof window === 'undefined' || !window.location) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const domParam = params.get('domicile') || params.get('estate');
      if (domParam) {
        claimScout?.selectDomicile(domParam);
        claimScout?.flyToDomicile(domParam, { mode: 'overview' });
        open();
      }

      const claimParam = params.get('claimDomicile');
      if (claimParam === 'true') {
        const lat = parseFloat(params.get('lat'));
        const lon = parseFloat(params.get('lon'));
        const typology =
          params.get('typology') || DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE;
        const title = params.get('title') || null;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          claimDomicileAtLocation({
            lat,
            lon,
            typology,
            title,
            source: 'deeplink',
          });
          open();
        }
      }

      const fleetParam = params.get('fleet');
      if (fleetParam && fleetEngine?.setFleetMode) {
        fleetEngine.setFleetMode(fleetParam);
      }

      const companionParam = params.get('companionMode');
      if (companionParam && fleetEngine?.setCompanionMode) {
        fleetEngine.setCompanionMode(companionParam);
      }
    } catch {}
  }

  parseUrlParameters();

  function destroy() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (registryUnsub) {
      registryUnsub();
      registryUnsub = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
    }
    coordinator.unregisterDrawer('estate');
    if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
    if (launcherButton.parentNode)
      launcherButton.parentNode.removeChild(launcherButton);
  }

  return {
    open,
    close,
    toggle,
    updateUI,
    isOpen: () => isOpen,
    destroy,
  };
}
