/**
 * Standalone Drawer Modal & HUD Launcher for Living World & City Simulator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Implements the floating HUD launcher button (bottom: 74px, right: 232px),
 * ambient living depth action pill (<= 1500m AGL trigger with 'C' shortcut),
 * tabbed UI drawer (Living Locales, Pedestrian Strolls, Urban Spectacles, City Hop),
 * archetype inspector & override picker, spatial soundscape volume,
 * density sliders, camera mode selectors, and URL query parameter routing.
 */

import * as Cesium from 'cesium';
import { LIVING_CITIES, resolveCity } from './cityWaypoints.js';
import { URBAN_EVENTS } from '../layers/citylife/urbanEvents.js';
import {
  getCompanionPersonaName,
  setCompanionPersonaName,
} from '../layers/citylife/companionDot.js';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
  EXEMPLAR_LOCALES,
  resolveExemplarLocale,
  classifySettlementTypology,
} from '../layers/citylife/localeClassifier.js';
import {
  pickActiveGroundPosition,
  sampleActiveGroundHeight,
} from '../layers/citylife/surfaceHeight.js';
import {
  getStadiumById,
  getAllStadiums,
  STADIUM_VENUES,
} from '../layers/citylife/stadiumCatalog.js';
import {
  createStadiumCrowdEngine,
  GAMEDAY_STATES,
  GAMEDAY_STATE_BADGES,
  GAMEDAY_CAMERA_MODES,
} from '../layers/citylife/stadiumCrowdEngine.js';
import { resolveTourOrPlayContext } from '../layers/citylife/tourAndPlayEngine.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export function createCityDrawer({
  cityEngine = null,
  wanderEngine = null,
  tourAndPlayEngine = null,
  stadiumEngine = null,
  viewer = null,
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

  // Main drawer container
  const drawer = document.createElement('div');
  drawer.className = 'gev-city-drawer hidden';

  const stadiumCrowdEngine =
    stadiumEngine || (viewer ? createStadiumCrowdEngine({ viewer }) : null);

  // Dynamically derive catalog sections from canonical registries so Dev Forge /
  // contributors can add new venues, studios, parks, or malls strictly in data
  // (`STADIUM_VENUES` / `EXEMPLAR_LOCALES`) without editing drawer markup.
  const escapeAttr = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const formatMetroLabel = (metroKey) =>
    String(metroKey || 'other')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  const compactVenueLabel = (venue) => {
    const raw = String(
      venue?.shortName || venue?.name || venue?.id || '',
    ).trim();
    return raw.length > 20 ? `${raw.slice(0, 19)}…` : raw;
  };
  const allExemplarLocales = Object.values(EXEMPLAR_LOCALES);
  const studioParkLocales = allExemplarLocales.filter(
    (loc) =>
      loc.typology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT ||
      loc.typology === SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK,
  );
  const mallLocales = allExemplarLocales.filter(
    (loc) => loc.typology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
  );
  const allStadiums = getAllStadiums();
  const stadiumMetros = [
    ...new Set(
      allStadiums
        .map((s) =>
          String(s.metro || 'other')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  const renderStadiumButtonsHtml = (metroFilter = 'all') => {
    const normFilter = String(metroFilter || 'all').toLowerCase();
    const list =
      normFilter === 'all'
        ? allStadiums
        : allStadiums.filter(
            (s) =>
              String(s.metro || 'other')
                .trim()
                .toLowerCase() === normFilter,
          );
    return list
      .map((venue) => {
        const accent =
          venue.teamColors?.accent || venue.teamColors?.primary || '#38bdf8';
        const title = `${venue.name || venue.shortName || venue.id}${venue.region ? ` (${venue.region})` : ''}`;
        return `<button class="gev-stadium-preset-btn" data-stadium-id="${escapeAttr(venue.id)}" data-metro="${escapeAttr(venue.metro || 'other')}" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: ${escapeAttr(accent)}; font-size: 9px; padding: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeAttr(title)}">${venue.icon || '🏟️'} ${escapeAttr(compactVenueLabel(venue))}</button>`;
      })
      .join('');
  };

  drawer.style.cssText = `
    position: fixed;
    bottom: 128px;
    right: 24px;
    width: 376px;
    max-height: calc(100vh - 156px);
    overflow: hidden;
    background: rgba(13, 17, 23, 0.96);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(6, 182, 212, 0.45);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    z-index: 10002;
    padding: 14px;
    display: none;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    pointer-events: none;
    opacity: 0;
    transform: translateY(16px);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(6, 182, 212, 0.25); padding-bottom: 8px; flex-shrink: 0;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🌍</span>
        <div>
          <strong style="font-size: 13px; letter-spacing: 0.5px; color: #22d3ee;">LIVING WORLD SIM</strong>
          <div style="font-size: 10px; color: #8b949e;">Universal Locale Synthetics & Contextual Ecology</div>
        </div>
      </div>
      <button class="gev-city-close" style="background: transparent; border: none; color: #8b949e; cursor: pointer; font-size: 18px; padding: 0 4px;" title="Close">✕</button>
    </div>

    <!-- Mode Tabs: Locales vs Strolls vs Urban Events vs City Hop -->
    <div style="display: flex; background: #161b22; border-radius: 8px; padding: 2px; border: 1px solid #30363d; gap: 2px; flex-shrink: 0;">
      <button class="gev-city-tab-locales" style="flex: 1; background: #21262d; border: none; border-radius: 6px; color: #22d3ee; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🌍 Locales
      </button>
      <button class="gev-city-tab-ped" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🚶 Strolls
      </button>
      <button class="gev-city-tab-events" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🏎️ Events
      </button>
      <button class="gev-city-tab-hop" style="flex: 1; background: transparent; border: none; border-radius: 6px; color: #8b949e; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer;">
        🌐 Cities
      </button>
    </div>

    <!-- Scrollable Drawer Body (keeps header & tabs pinned inside viewport) -->
    <div class="gev-city-scroll-body" style="flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 10px;">
    <!-- Tab 1: Living World Locales Content -->
    <div class="gev-city-content-locales" style="display: flex; flex-direction: column; gap: 10px;">
      <!-- Archetype Status Card -->
      <div class="gev-archetype-card" style="background: #161b22; border: 1px solid rgba(6, 182, 212, 0.35); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Active Archetype</span>
          <span class="gev-archetype-badge" style="font-size: 9px; background: rgba(6, 182, 212, 0.2); color: #22d3ee; border-radius: 4px; padding: 2px 6px;">DYNAMIC</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="gev-archetype-icon" style="font-size: 22px;">🦐</span>
          <div style="min-width: 0; flex: 1;">
            <strong class="gev-archetype-name" style="font-size: 12px; color: #f0f6fc;">Coastal Tidewater Harbor</strong>
            <div class="gev-archetype-transit" style="font-size: 9px; color: #38bdf8; margin-top: 1px;">Transit: Water Taxis & Golf Carts</div>
          </div>
        </div>
        <div class="gev-archetype-desc" style="font-size: 10px; color: #8b949e; margin-top: 2px;">
          Estuary deltas, wooden shrimping docks, salt marshes, and oyster-shell shoulders.
        </div>
        <div class="gev-archetype-coords" style="font-size: 9px; color: #8b949e; margin-top: 2px;">
          📍 Camera: Live Location
        </div>
        <div class="gev-filming-status-badge" style="display: none; font-size: 9px; font-weight: 700; background: rgba(234, 179, 8, 0.2); border: 1px solid rgba(234, 179, 8, 0.45); color: #fde047; border-radius: 4px; padding: 3px 6px; margin-top: 2px; text-align: center;">
          🎬 QUIET ON SET · CAMERA ROLLING · ACTION!
        </div>
        <div class="gev-gameday-status-badge" style="display: none; font-size: 9px; font-weight: 700; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.45); color: #7dd3fc; border-radius: 4px; padding: 3px 6px; margin-top: 2px; text-align: center;">
          🍖 PREGAME TAILGATE · CANOPIES & SMOKERS BURNING
        </div>
        <div class="gev-mall-status-badge" style="display: none; font-size: 9px; font-weight: 700; background: rgba(236, 72, 153, 0.2); border: 1px solid rgba(236, 72, 153, 0.45); color: #f472b6; border-radius: 4px; padding: 3px 6px; margin-top: 2px; text-align: center;">
          🛍️ PEAK MALL PROMENADE · MARBLE ATRIUM & CONCOURSE
        </div>
        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <button class="gev-locale-step-here-btn" style="flex: 2; background: linear-gradient(135deg, #0891b2, #0284c7); border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 700; padding: 7px 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(6, 182, 212, 0.35);">
            <span>🌍</span>
            <span class="gev-step-here-label">Step into Living World Here</span>
          </button>
          <button class="gev-locale-tour-play-here-btn" style="flex: 1.3; background: linear-gradient(135deg, #9333ea, #2563eb); border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 700; padding: 7px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 8px rgba(168, 85, 247, 0.35);" title="Start Randomized City Scooter Tour or Non-Metro Play Activity Here">
            <span class="gev-tour-play-here-icon">🛴</span>
            <span class="gev-tour-play-here-label">Tour Here</span>
          </button>
        </div>
      </div>

      <!-- Studio Sets & Theme Parks (Dynamically Rendered from EXEMPLAR_LOCALES) -->
      <details class="gev-studio-park-presets" style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 7px 9px;">
        <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
          <span style="font-size: 10px; color: #eab308; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;">🎬 Studio Sets & 🎢 Theme Parks</span>
          <span style="font-size: 9px; color: #8b949e;">${studioParkLocales.length} Locales ▾</span>
        </summary>
        <div class="gev-studio-park-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; max-height: 140px; overflow-y: auto;">
          ${studioParkLocales
            .map((loc) => {
              const isStudio =
                loc.typology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT;
              const tint = isStudio ? '#fde047' : '#f472b6';
              return `<button class="gev-studio-park-preset-btn" data-locale-id="${escapeAttr(loc.id)}" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: ${tint}; font-size: 9px; padding: 4px 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;" title="${escapeAttr(`${loc.name} (${loc.region})`)}">${loc.icon || (isStudio ? '🎬' : '🎢')} ${escapeAttr(compactVenueLabel(loc))}</button>`;
            })
            .join('')}
        </div>
      </details>

      <!-- Gameday Spectacles (Dynamically Rendered from STADIUM_VENUES with Auto Region Filter) -->
      <details class="gev-stadium-presets" style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 7px 9px;">
        <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
          <span style="font-size: 10px; color: #38bdf8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;">🏟️ Gameday Spectacles</span>
          <span style="font-size: 9px; color: #8b949e;">${allStadiums.length} Venues ▾</span>
        </summary>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 9px; color: #8b949e; white-space: nowrap;">Region:</label>
            <select class="gev-stadium-metro-filter" style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; padding: 3px 6px; font-size: 10px; outline: none;">
              <option value="all">All Regions (${allStadiums.length})</option>
              ${stadiumMetros
                .map((m) => {
                  const count = allStadiums.filter(
                    (s) =>
                      String(s.metro || 'other')
                        .trim()
                        .toLowerCase() === m,
                  ).length;
                  return `<option value="${escapeAttr(m)}">${escapeAttr(formatMetroLabel(m))} (${count})</option>`;
                })
                .join('')}
            </select>
          </div>
          <div class="gev-stadium-preset-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-height: 148px; overflow-y: auto;">
            ${renderStadiumButtonsHtml('all')}
          </div>
          <!-- Gameday Camera Suite & Match Lifecycle Trigger -->
          <div class="gev-gameday-camera-bar" style="display: flex; flex-direction: column; gap: 4px; padding-top: 5px; border-top: 1px solid #21262d;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; color: #8b949e;">🎥 Gameday Cam Suite:</span>
              <button class="gev-gameday-cycle-state-btn" style="background: #21262d; border: 1px solid #38bdf8; border-radius: 3px; color: #38bdf8; font-size: 8.5px; padding: 1px 5px; cursor: pointer;" title="Advance to Next Match Lifecycle Phase">⏭️ Next Phase</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px;">
              <button class="gev-gameday-cam-btn active" data-cam-mode="blimp_aerial" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 3px; color: #38bdf8; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Blimp Aerial Orbit (+220m)">🎈 Blimp</button>
              <button class="gev-gameday-cam-btn" data-cam-mode="main_gate_ingress" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Main Gate Turnstiles (+3.5m)">🎟️ Gate</button>
              <button class="gev-gameday-cam-btn" data-cam-mode="tailgate_roam" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Tailgate Lot Lawn (+1.8m)">🍖 Tailgate</button>
              <button class="gev-gameday-cam-btn" data-cam-mode="upper_deck_balcony" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Upper Deck Balcony (+45m)">🏟️ Balcony</button>
            </div>
          </div>
        </div>
      </details>

      <!-- Peak Mall Promenades (Dynamically Rendered from EXEMPLAR_LOCALES) -->
      <details class="gev-mall-presets" style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 7px 9px;">
        <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
          <span style="font-size: 10px; color: #ec4899; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;">🛍️ Peak Mall Promenades</span>
          <span style="font-size: 9px; color: #8b949e;">${mallLocales.length} Promenades ▾</span>
        </summary>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
          <div class="gev-mall-preset-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-height: 120px; overflow-y: auto;">
            ${mallLocales
              .map(
                (loc) =>
                  `<button class="gev-mall-preset-btn" data-locale-id="${escapeAttr(loc.id)}" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #f472b6; font-size: 9px; padding: 4px 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;" title="${escapeAttr(`${loc.name} (${loc.region})`)}">${loc.icon || '🛍️'} ${escapeAttr(compactVenueLabel(loc))}</button>`,
              )
              .join('')}
          </div>
          <!-- Mall Promenade Camera Suite & Wander Toggle -->
          <div class="gev-mall-camera-bar" style="display: flex; flex-direction: column; gap: 4px; padding-top: 5px; border-top: 1px solid #21262d;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; color: #8b949e;">🎥 Promenade Watch & Wander:</span>
              <button class="gev-mall-wander-btn" style="background: #21262d; border: 1px solid #ec4899; border-radius: 3px; color: #f472b6; font-size: 8.5px; padding: 1px 5px; cursor: pointer;" title="Step Down & Wander Concourse with Companion">🚶 Wander 1:1</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px;">
              <button class="gev-mall-cam-btn active" data-cam-mode="atrium_skylight" style="background: rgba(236, 72, 153, 0.2); border: 1px solid #ec4899; border-radius: 3px; color: #f472b6; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Atrium Skylight Blimp (+45m)">🪟 Atrium</button>
              <button class="gev-mall-cam-btn" data-cam-mode="central_fountain" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Central Fountain & Duck Pond (+2.2m)">⛲ Fountain</button>
              <button class="gev-mall-cam-btn" data-cam-mode="food_court_balcony" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Food Court Mezzanine Balcony (+7.5m)">🍕 Food Court</button>
              <button class="gev-mall-cam-btn" data-cam-mode="anchor_colonnade" style="background: #21262d; border: 1px solid #30363d; border-radius: 3px; color: #c9d1d9; font-size: 8.5px; padding: 3px; cursor: pointer;" title="Anchor Wing Colonnade (+3.5m)">🏛️ Colonnade</button>
            </div>
          </div>
        </div>
      </details>

      <!-- Manual Archetype Override Picker -->
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">Archetype Override:</label>
        <select class="gev-archetype-select" style="width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; padding: 6px; font-size: 12px; outline: none;">
          <option value="AUTO">🤖 Auto-Detect (Geospatial & OSM)</option>
          ${Object.values(TYPOLOGY_METADATA)
            .map((t) => `<option value="${t.id}">${t.icon} ${t.name}</option>`)
            .join('')}
        </select>
      </div>

      <!-- Ambient Audio Soundscape Volume & Mute -->
      <div style="display: flex; align-items: center; justify-content: space-between; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 6px 10px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 14px;">🔊</span>
          <span style="font-size: 11px; color: #c9d1d9;">Audio Soundscape</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="range" class="gev-soundscape-volume" min="0" max="100" value="80" style="width: 70px; height: 4px; accent-color: #06b6d4; cursor: pointer;">
          <button class="gev-soundscape-mute-btn" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #38bdf8; font-size: 10px; padding: 2px 6px; cursor: pointer;">Mute</button>
        </div>
      </div>

      <!-- Density Selector -->
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">Entity Density:</label>
        <div style="display: flex; gap: 6px;">
          <button class="gev-locale-density-btn" data-density="calm" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🍃 Calm</button>
          <button class="gev-locale-density-btn active" data-density="lively" style="flex: 1; background: rgba(6, 182, 212, 0.2); border: 1px solid #06b6d4; border-radius: 6px; color: #22d3ee; font-size: 10px; font-weight: 600; padding: 5px; cursor: pointer;">🚶 Lively</button>
          <button class="gev-locale-density-btn" data-density="rush" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">⚡ Rush</button>
        </div>
      </div>

      <!-- Curated Exemplar Presets -->
      <details open style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 7px 9px;">
        <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none;">
          <span style="font-size: 10px; color: #22d3ee; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;">🌐 Curated Living Locales</span>
          <span style="font-size: 9px; color: #8b949e;">${allExemplarLocales.length} Locales ▾</span>
        </summary>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; margin-top: 6px;">
          ${allExemplarLocales
            .map(
              (loc) => `
              <div class="gev-locale-card" data-locale-id="${loc.id}" style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; transition: border-color 0.15s ease;">
                <div style="min-width: 0; flex: 1; margin-right: 8px;">
                  <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                    <span style="flex-shrink: 0;">${loc.icon}</span>
                    <strong style="font-size: 11px; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${loc.name}</strong>
                  </div>
                  <div style="font-size: 9px; color: #8b949e; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${loc.region} · ${loc.landmarks[0]}</div>
                </div>
                <button class="gev-locale-step-btn" data-locale-id="${loc.id}" style="background: #0891b2; border: none; border-radius: 4px; color: #ffffff; font-size: 10px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap; flex-shrink: 0;">
                  🌍 Step In
                </button>
              </div>
            `,
            )
            .join('')}
        </div>
      </details>
    </div>

    <!-- Tab 2: Pedestrians / Strolls Content -->
    <div class="gev-city-content-ped" style="display: none; flex-direction: column; gap: 10px;">
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">City Crowd Experience:</label>
        <select class="gev-city-select" style="width: 100%; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; padding: 6px; font-size: 12px; outline: none;">
          <option value="">Select an experience...</option>
          <option value="current">📍 Current Camera Location (Spawn Crowd Here)</option>
          ${Object.values(LIVING_CITIES)
            .map(
              (c) =>
                `<option value="${c.id}">${c.name} (${c.country}) — ${c.landmarks[0]}</option>`,
            )
            .join('')}
        </select>
      </div>

      <!-- Density Selector -->
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">Pedestrian Density:</label>
        <div style="display: flex; gap: 6px;">
          <button class="gev-density-btn" data-density="calm" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🍃 Calm (40)</button>
          <button class="gev-density-btn active" data-density="lively" style="flex: 1; background: rgba(6, 182, 212, 0.2); border: 1px solid #06b6d4; border-radius: 6px; color: #22d3ee; font-size: 10px; font-weight: 600; padding: 5px; cursor: pointer;">🚶 Lively (90)</button>
          <button class="gev-density-btn" data-density="rush" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">⚡ Rush (160)</button>
        </div>
      </div>

      <!-- Stroller Navigator & Thought Inspector -->
      <div class="gev-ped-navigator" style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Active Stroller</span>
          <div style="display: flex; gap: 4px;">
            <button class="gev-ped-prev-btn" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; font-size: 10px; padding: 2px 8px; cursor: pointer;" title="Previous Citizen">◀ Prev</button>
            <button class="gev-ped-next-btn" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; font-size: 10px; padding: 2px 8px; cursor: pointer;" title="Next Citizen">Next ▶</button>
          </div>
        </div>
        <div class="gev-stroller-info" style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <strong class="gev-stroller-name" style="color: #22d3ee; font-size: 11px;">Click 'Step In' to spawn citizens</strong>
          <span class="gev-stroller-speed" style="color: #8b949e; font-size: 10px;"></span>
        </div>
      </div>

      <!-- Stroll Pace Selector -->
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">Walking Cadence:</label>
        <div style="display: flex; gap: 6px;">
          <button class="gev-pace-btn" data-pace="0.6" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="Slow window-shopping stroll (0.6x)">🐌 Leisurely</button>
          <button class="gev-pace-btn active" data-pace="1.0" style="flex: 1; background: rgba(6, 182, 212, 0.2); border: 1px solid #06b6d4; border-radius: 6px; color: #22d3ee; font-size: 10px; font-weight: 600; padding: 5px; cursor: pointer;" title="Standard relaxed human stroll (1.0x)">🚶 Stroll</button>
          <button class="gev-pace-btn" data-pace="1.5" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="Brisk commuter walk (1.5x)">⚡ Brisk</button>
        </div>
      </div>

      <!-- Camera Perspectives -->
      <div>
        <label style="font-size: 11px; color: #8b949e; display: block; margin-bottom: 4px;">Camera Perspective:</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
          <button class="gev-cam-btn active" data-cam="companion" style="background: rgba(6, 182, 212, 0.2); border: 1px solid #06b6d4; border-radius: 6px; color: #22d3ee; font-size: 10px; padding: 5px; cursor: pointer;">🚶 Eye-Level</button>
          <button class="gev-cam-btn" data-cam="flaneur" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">☕ Flâneur</button>
          <button class="gev-cam-btn" data-cam="balcony" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🏢 Balcony</button>
          <button class="gev-cam-btn" data-cam="overview" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🛰️ High Angle</button>
          <button class="gev-cam-btn" data-cam="city_map" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🗺️ City Map</button>
          <button class="gev-cam-btn" data-cam="free" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;">🔓 Free Cam</button>
        </div>
      </div>

      <!-- Dedicated Ground Explorer Handoff Card -->
      <div style="background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; color: #22d3ee; font-weight: 600; text-transform: uppercase;">🚶 Player Ground Wander (WASD)</span>
          <span style="font-size: 9px; color: #34d399;">Dedicated Panel</span>
        </div>
        <div style="font-size: 10px; color: #8b949e; line-height: 1.35;">
          Walk anywhere on Earth with your Companion using the dedicated <b>Ground Explorer</b> panel (so NPC city crowd controls never interrupt your walk).
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="gev-open-wander-drawer-btn" style="flex: 2; background: linear-gradient(135deg, #0891b2, #2563eb); border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 600; padding: 6px 8px; cursor: pointer;" title="Open the dedicated Ground Explorer & Companion panel">
            🚶 Open Ground Explorer
          </button>
          <button class="gev-wander-launch-btn" style="flex: 1; background: #161b22; border: 1px solid #06b6d4; border-radius: 6px; color: #22d3ee; font-size: 10px; font-weight: 600; padding: 6px; cursor: pointer;" title="Quick-start Wander right here">
            ▶ Start Here
          </button>
          <button class="gev-wander-stop-btn" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #ef4444; font-size: 10px; font-weight: 600; padding: 6px 8px; cursor: pointer;" title="Exit Wander Mode (Esc)">
            ⏹️
          </button>
        </div>
        <div style="display: none; gap: 4px; flex-wrap: wrap;">
          <button class="gev-wander-companion-btn">👯 ${getCompanionPersonaName()} [P]</button>
          <input class="gev-wander-companion-name" type="text" value="${getCompanionPersonaName()}" />
          <button class="gev-wander-cam-btn" data-wcam="iso_chase">🎥 Iso Chase</button>
          <button class="gev-wander-cam-btn" data-wcam="first_person">👁️ 1st Person</button>
          <button class="gev-wander-cam-btn" data-wcam="heli">🚁 Heli</button>
          <button class="gev-wander-cam-btn" data-wcam="overview">🛰️ Overview</button>
          <button class="gev-wander-cam-btn" data-wcam="fps_lock">🖱️ FPS Look</button>
          <button class="gev-wander-cam-btn" data-wcam="snap">🎯 Snap</button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 6px; padding-top: 4px;">
        <button class="gev-city-launch-btn" style="flex: 2; background: #0891b2; border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 600; padding: 7px; cursor: pointer;" title="Step down into street-level sidewalk stroll">
          🚶 Step In
        </button>
        <button class="gev-city-map-btn" style="flex: 2; background: #2563eb; border: none; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 600; padding: 7px; cursor: pointer;" title="Panoramic Whole-City Overview Map">
          🗺️ City Map
        </button>
        <button class="gev-city-rain-btn" style="flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #38bdf8; font-size: 11px; padding: 7px; cursor: pointer;" title="Toggle Rain Pace & Umbrellas">
          ☂️ Rain
        </button>
        <button class="gev-city-stop-btn" style="flex: 1; background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #ef4444; font-size: 11px; padding: 7px; cursor: pointer;" title="Sleep & Prune Simulation">
          ⏹️ Sleep
        </button>
      </div>
    </div>

    <!-- Tab 3: Urban Events Content -->
    <div class="gev-city-content-events" style="display: none; flex-direction: column; gap: 8px;">
      <div style="font-size: 11px; color: #8b949e;">Select a live urban spectacle:</div>
      <div style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;">
        ${Object.values(URBAN_EVENTS)
          .map(
            (ev) => `
            <div class="gev-event-card" data-event-id="${ev.id}" style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 8px; cursor: pointer; transition: border-color 0.15s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 11px; color: #f0f6fc;">${ev.name}</strong>
                <span style="font-size: 9px; background: #21262d; color: #38bdf8; border-radius: 4px; padding: 1px 4px;">${ev.type.toUpperCase()}</span>
              </div>
              <div style="font-size: 10px; color: #8b949e; margin-top: 2px;">
                ${ev.type === 'race' ? `🏎️ ${ev.carCount} Cars · Top Speed ${ev.topSpeedKmh} km/h` : ev.type === 'festival' ? `🎪 ${ev.crowdMultiplier}x Crowd Density` : '🚨 Code 3 Emergency'}
              </div>
            </div>
          `,
          )
          .join('')}
      </div>
      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button class="gev-event-start-btn" style="flex: 2; background: #ea580c; border: none; border-radius: 6px; color: #ffffff; font-size: 12px; font-weight: 600; padding: 8px; cursor: pointer;">
          🏁 Start Spectacle
        </button>
        <button class="gev-event-stop-btn" style="flex: 1; background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #ef4444; font-size: 11px; padding: 8px; cursor: pointer;">
          ⏹️ Stop
        </button>
      </div>

      <!-- Event Camera Controls -->
      <div class="gev-event-cam-section" style="margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
        <label style="font-size: 11px; color: #8b949e; display: block;">Spectacle Camera:</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
          <button class="gev-event-cam-btn active" data-cam="chase" style="background: rgba(234, 88, 12, 0.2); border: 1px solid #ea580c; border-radius: 6px; color: #fb923c; font-size: 10px; padding: 5px; cursor: pointer;" title="Dynamic helicopter trailing follow">🚁 Heli Chase</button>
          <button class="gev-event-cam-btn" data-cam="overview" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="High-altitude panoramic view of the entire circuit">🛰️ Track Overview</button>
          <button class="gev-event-cam-btn" data-cam="cockpit" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="Low hood-level racing view">🏎️ Cockpit</button>
          <button class="gev-event-cam-btn" data-cam="grandstand" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="Trackside broadcast corner camera">🏁 Grandstand</button>
          <button class="gev-event-cam-btn" data-cam="free" style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 10px; padding: 5px; cursor: pointer;" title="Free camera rotation & pan">🔓 Free Cam</button>
          <button class="gev-event-cam-snap" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #f59e0b; font-size: 10px; font-weight: 600; padding: 5px; cursor: pointer;">🎯 Snap Back</button>
        </div>
      </div>
    </div>

    <!-- Tab 4: City Hop Content -->
    <div class="gev-city-content-hop" style="display: none; flex-direction: column; gap: 8px;">
      <div style="font-size: 11px; color: #8b949e;">Quick-hop to global living megacities across every continent:</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 220px; overflow-y: auto;">
        ${Object.values(LIVING_CITIES)
          .map(
            (c) => `
            <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-weight: 600; font-size: 11px; color: #22d3ee;">${c.name}</span>
                <span style="font-size: 9px; color: #8b949e;">${c.country}</span>
              </div>
              <div style="display: flex; gap: 4px; margin-top: 2px;">
                <button class="gev-city-hop-stroll-btn" data-city-id="${c.id}" style="flex: 1; background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #38bdf8; font-size: 9px; padding: 3px 4px; cursor: pointer;" title="Step into pedestrian stroll">🚶 Stroll</button>
                <button class="gev-city-hop-tour-btn" data-city-id="${c.id}" style="flex: 1; background: #21262d; border: 1px solid rgba(168, 85, 247, 0.45); border-radius: 4px; color: #c084fc; font-size: 9px; padding: 3px 4px; cursor: pointer;" title="Start 15 mph randomized scooter landmark tour">🛴 Tour</button>
                <button class="gev-city-hop-map-btn" data-city-id="${c.id}" style="flex: 1; background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #a78bfa; font-size: 9px; padding: 3px 4px; cursor: pointer;" title="Panoramic city map view">🗺️ Map</button>
              </div>
            </div>
          `,
          )
          .join('')}
      </div>
    </div>
    </div>
  `;

  // Floating Ambient Action Pills Container (Below 1500m AGL, responsive collision-free)
  const ambientPill = document.createElement('div');
  ambientPill.className = 'gev-city-ambient-container';
  ambientPill.innerHTML = `
    <button class="gev-ambient-living-btn" title="Activate Living World Pedestrians, Traffic & Events [C]">
      <span>🏙️</span>
      <span class="gev-ambient-city-label">Living World (Atlanta)</span>
      <kbd style="color: #38bdf8;">C</kbd>
    </button>
    <button class="gev-ambient-wander-btn" title="Wander here as player avatar dot with optional autonomous companion [WASD]">
      <span>🚶</span>
      <span>Wander Here</span>
      <kbd style="color: #34d399;">WASD</kbd>
    </button>
    <button class="gev-ambient-tour-play-btn" title="Start randomized City Scooter Tour or Non-Metro Play Activity [T]">
      <span class="gev-ambient-tour-play-icon">🛴</span>
      <span class="gev-ambient-tour-play-label">Tour City</span>
      <kbd style="color: #c084fc;">T</kbd>
    </button>
  `;

  // Floating HUD Trigger Launcher Button
  // Positioned at bottom: 74px, right: 232px (52px spacing from boat ⛵ at 180px)
  const launcherButton = document.createElement('button');
  launcherButton.className = 'gev-city-launcher-button';
  launcherButton.title = 'Living World Simulation (Shortcut: C)';
  launcherButton.style.cssText = `
    position: fixed;
    bottom: 74px;
    right: 232px;
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
  launcherButton.innerHTML = '🌍';

  container.appendChild(drawer);
  container.appendChild(ambientPill);
  container.appendChild(launcherButton);

  const dock = getGlobalDrawerCoordinator();
  let selectedCityId = '';
  let selectedLocaleId = 'darien_ga';
  let selectedEventId = 'monaco_gp';
  let activeTypologyKey = SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER;
  let ambientPillDismissTimer = null;
  let currentPillTarget = null;
  let lastCityDepthTarget = null;

  function isAnyCustomCapabilityActive() {
    if (cityEngine?.isSimActive && cityEngine.isSimActive()) return true;
    if (wanderEngine?.isWandering) return true;
    if (tourAndPlayEngine?.getStatus?.()?.isActive) return true;
    if (dock.hasActiveSimulation?.({ excludeIds: ['city'] })) return true;
    if (dock.getActiveDrawerId?.()) return true;
    return false;
  }

  function syncAmbientVisibility() {
    if (isAnyCustomCapabilityActive()) {
      hideAmbientPill();
      return;
    }
    if (lastCityDepthTarget) {
      showAmbientPill(lastCityDepthTarget);
    }
  }

  function syncCameraArchetype() {
    const v =
      viewer ||
      cityEngine?.viewer ||
      window.__gevCityEngine?.viewer ||
      window.__gevViewer ||
      null;
    if (!v) return;

    let lat = null;
    let lon = null;
    let groundElev = 0;

    try {
      const scene = v.scene;
      const camera = scene?.camera || v.camera;
      if (scene?.canvas?.clientWidth && camera) {
        const centerPos = new Cesium.Cartesian2(
          scene.canvas.clientWidth / 2,
          scene.canvas.clientHeight / 2,
        );
        const pickPos = pickActiveGroundPosition(v, centerPos);
        if (pickPos) {
          const pickCarto = Cesium.Cartographic.fromCartesian(pickPos);
          lat = Cesium.Math.toDegrees(pickCarto.latitude);
          lon = Cesium.Math.toDegrees(pickCarto.longitude);
          groundElev = pickCarto.height;
        }
      }
      if ((lat === null || lon === null) && camera) {
        const camCarto = Cesium.Cartographic.fromCartesian(
          camera.positionWC || camera.position,
        );
        lat = Cesium.Math.toDegrees(camCarto.latitude);
        lon = Cesium.Math.toDegrees(camCarto.longitude);
        groundElev = sampleActiveGroundHeight(v, camCarto);
      }
    } catch {
      /* ignore */
    }

    if (typeof lat === 'number' && typeof lon === 'number') {
      const classification = classifySettlementTypology({
        lat,
        lon,
        elevationMeters: groundElev,
      });
      updateArchetypeCard(classification.typology, false);

      const coordsEl = drawer.querySelector('.gev-archetype-coords');
      const stepHereLabel = drawer.querySelector('.gev-step-here-label');
      if (coordsEl) {
        coordsEl.textContent = `📍 Camera: ${lat.toFixed(3)}°, ${lon.toFixed(3)}° (${classification.name})`;
      }
      if (stepHereLabel) {
        stepHereLabel.textContent = `Step into ${classification.name} Here`;
      }

      const tourPlayCtx =
        tourAndPlayEngine?.resolveContext?.(lat, lon, groundElev) ||
        resolveTourOrPlayContext(lat, lon, groundElev);
      const tourPlayIconEl = drawer.querySelector('.gev-tour-play-here-icon');
      const tourPlayLabelEl = drawer.querySelector('.gev-tour-play-here-label');
      if (tourPlayIconEl && tourPlayLabelEl) {
        if (tourPlayCtx.mode === 'tour') {
          tourPlayIconEl.textContent = '🛴';
          tourPlayLabelEl.textContent = `Tour ${tourPlayCtx.cityName || 'City'}`;
        } else {
          tourPlayIconEl.textContent = '🏖️';
          tourPlayLabelEl.textContent = 'Play Here';
        }
      }
    }
  }

  function updateArchetypeCard(typologyKey, isOverride = false) {
    const meta =
      TYPOLOGY_METADATA[typologyKey] || TYPOLOGY_METADATA.COASTAL_TIDEWATER;
    activeTypologyKey = typologyKey;

    const iconEl = drawer.querySelector('.gev-archetype-icon');
    const nameEl = drawer.querySelector('.gev-archetype-name');
    const descEl = drawer.querySelector('.gev-archetype-desc');
    const badgeEl = drawer.querySelector('.gev-archetype-badge');
    const transitEl = drawer.querySelector('.gev-archetype-transit');

    if (iconEl) iconEl.textContent = meta.icon;
    if (nameEl) nameEl.textContent = meta.name;
    if (descEl) descEl.textContent = meta.description;
    if (badgeEl) {
      badgeEl.textContent = isOverride ? 'OVERRIDE' : 'DYNAMIC';
      badgeEl.style.background = isOverride
        ? 'rgba(234, 88, 12, 0.25)'
        : 'rgba(6, 182, 212, 0.2)';
      badgeEl.style.color = isOverride ? '#fb923c' : '#22d3ee';
    }
    if (transitEl) {
      const transitLabel = (meta.primaryTransit || '')
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
      transitEl.textContent = `Transit: ${transitLabel}`;
    }
    const filmingBadgeEl = drawer.querySelector('.gev-filming-status-badge');
    if (filmingBadgeEl) {
      if (typologyKey === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
        filmingBadgeEl.style.display = 'block';
        const spoolBadge = cityEngine
          ?.getContextualSpool?.()
          ?.getFilmingStatusBadge?.();
        filmingBadgeEl.textContent =
          spoolBadge || '🎬 QUIET ON SET · CAMERA ROLLING · ACTION!';
      } else {
        filmingBadgeEl.style.display = 'none';
      }
    }
    const gamedayBadgeEl = drawer.querySelector('.gev-gameday-status-badge');
    if (gamedayBadgeEl) {
      if (typologyKey === SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX) {
        gamedayBadgeEl.style.display = 'block';
        const badgeText =
          stadiumCrowdEngine?.getGamedayStatusBadge?.() ||
          '🍖 PREGAME TAILGATE · CANOPIES & SMOKERS BURNING';
        gamedayBadgeEl.textContent = badgeText;
      } else {
        gamedayBadgeEl.style.display = 'none';
      }
    }
    const mallBadgeEl = drawer.querySelector('.gev-mall-status-badge');
    if (mallBadgeEl) {
      if (typologyKey === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE) {
        mallBadgeEl.style.display = 'block';
        mallBadgeEl.textContent =
          '🛍️ PEAK MALL PROMENADE · MARBLE ATRIUM & CONCOURSE';
      } else {
        mallBadgeEl.style.display = 'none';
      }
    }
  }

  function open() {
    dock.notifyDrawerOpened('city');
    syncCameraArchetype();
    drawer.style.display = 'flex';
    drawer.classList.remove('hidden');
    requestAnimationFrame(() => {
      drawer.style.pointerEvents = 'auto';
      drawer.style.opacity = '1';
      drawer.style.transform = 'translateY(0)';
    });
  }

  function close() {
    drawer.style.opacity = '0';
    drawer.style.transform = 'translateY(16px)';
    drawer.style.pointerEvents = 'none';
    drawer.classList.add('hidden');
    dock.notifyDrawerClosed('city');
    setTimeout(() => {
      if (drawer.classList.contains('hidden')) {
        drawer.style.display = 'none';
      }
    }, 250);
  }

  function showAmbientPill(entityOrCity) {
    if (isAnyCustomCapabilityActive()) {
      hideAmbientPill();
      return;
    }
    currentPillTarget = entityOrCity;
    const label = ambientPill.querySelector('.gev-ambient-city-label');
    if (label)
      label.textContent = `Living World (${entityOrCity?.name || 'Atlanta'})`;

    const tpIcon = ambientPill.querySelector('.gev-ambient-tour-play-icon');
    const tpLabel = ambientPill.querySelector('.gev-ambient-tour-play-label');
    if (tpIcon && tpLabel) {
      const lat = entityOrCity?.lat ?? 33.749;
      const lon = entityOrCity?.lon ?? -84.388;
      const elev = entityOrCity?.elev ?? 0;
      const ctx =
        tourAndPlayEngine?.resolveContext?.(lat, lon, elev) ||
        resolveTourOrPlayContext(lat, lon, elev);
      if (ctx.mode === 'tour') {
        tpIcon.textContent = '🛴';
        tpLabel.textContent = `Tour ${ctx.cityName || entityOrCity?.name || 'City'}`;
      } else {
        tpIcon.textContent = '🏖️';
        tpLabel.textContent = `Play (${ctx.playActivities?.[0]?.label || 'Here'})`;
      }
    }

    ambientPill.style.display = 'flex';
    requestAnimationFrame(() => {
      ambientPill.classList.add('visible');
      ambientPill.style.opacity = '1';
    });
  }

  function hideAmbientPill() {
    ambientPill.classList.remove('visible');
    ambientPill.style.opacity = '0';
    setTimeout(() => {
      if (
        !ambientPill.classList.contains('visible') &&
        ambientPill.style.opacity === '0'
      ) {
        ambientPill.style.display = 'none';
      }
    }, 250);
  }

  // Bind depth callbacks
  if (cityEngine?.onCityDepth) {
    cityEngine.onCityDepth((city) => {
      selectedCityId = city.id;
      lastCityDepthTarget = city;
      showAmbientPill(city);
    });
  }
  if (cityEngine?.onCityDepthExit) {
    cityEngine.onCityDepthExit(() => {
      lastCityDepthTarget = null;
      hideAmbientPill();
    });
  }

  // Wire Tab Buttons
  const tabLocales = drawer.querySelector('.gev-city-tab-locales');
  const tabPed = drawer.querySelector('.gev-city-tab-ped');
  const tabEvents = drawer.querySelector('.gev-city-tab-events');
  const tabHop = drawer.querySelector('.gev-city-tab-hop');

  const contentLocales = drawer.querySelector('.gev-city-content-locales');
  const contentPed = drawer.querySelector('.gev-city-content-ped');
  const contentEvents = drawer.querySelector('.gev-city-content-events');
  const contentHop = drawer.querySelector('.gev-city-content-hop');

  function switchTab(activeTab, activeContent) {
    [tabLocales, tabPed, tabEvents, tabHop].forEach((t) => {
      if (t) {
        t.style.background = 'transparent';
        t.style.color = '#8b949e';
      }
    });
    [contentLocales, contentPed, contentEvents, contentHop].forEach((c) => {
      if (c) {
        c.style.display = 'none';
      }
    });
    if (activeTab) {
      activeTab.style.background = '#21262d';
      activeTab.style.color = '#22d3ee';
    }
    if (activeContent) {
      activeContent.style.display = 'flex';
    }
  }

  tabLocales?.addEventListener('click', () =>
    switchTab(tabLocales, contentLocales),
  );
  tabPed?.addEventListener('click', () => switchTab(tabPed, contentPed));
  tabEvents?.addEventListener('click', () =>
    switchTab(tabEvents, contentEvents),
  );
  tabHop?.addEventListener('click', () => switchTab(tabHop, contentHop));

  // Step in at Current Location Button
  const stepHereBtn = drawer.querySelector('.gev-locale-step-here-btn');
  stepHereBtn?.addEventListener('click', () => {
    hideAmbientPill();
    dock.notifySimulationStarted('city');
    cityEngine?.stepIntoCurrentLocation?.({
      typology: activeTypologyKey,
    });
  });

  function launchContextualTourOrPlay(overrideCityId = null) {
    hideAmbientPill();
    const coords = getGroundTargetCoordinates();
    const ctx =
      tourAndPlayEngine?.resolveContext?.(
        coords.lat,
        coords.lon,
        coords.elev,
      ) || resolveTourOrPlayContext(coords.lat, coords.lon, coords.elev);

    if (overrideCityId || ctx.mode === 'tour') {
      tourAndPlayEngine?.startCityTour?.({
        cityId: overrideCityId || ctx.cityId || selectedCityId || null,
        lat: coords.lat,
        lon: coords.lon,
        elev: coords.elev,
        cameraMode: 'iso_chase',
      });
    } else {
      const firstAct = ctx.playActivities?.[0]?.id || 'visit_beach';
      tourAndPlayEngine?.startPlayActivity?.(firstAct, {
        lat: coords.lat,
        lon: coords.lon,
        elev: coords.elev,
        typology: ctx.typology || activeTypologyKey,
        cameraMode: 'iso_chase',
      });
    }
    dock.openDrawer('wander');
  }

  const tourPlayHereBtn = drawer.querySelector(
    '.gev-locale-tour-play-here-btn',
  );
  tourPlayHereBtn?.addEventListener('click', () => {
    launchContextualTourOrPlay();
  });

  // Exemplar Locales Step Buttons & Studio/Park/Mall Quick-Jump Presets
  const localeStepBtns = drawer.querySelectorAll(
    '.gev-locale-step-btn, .gev-studio-park-preset-btn, .gev-mall-preset-btn',
  );
  localeStepBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const locId = btn.getAttribute('data-locale-id');
      selectedLocaleId = locId;
      hideAmbientPill();
      dock.notifySimulationStarted('city');
      const loc = EXEMPLAR_LOCALES[locId];
      if (loc) {
        updateArchetypeCard(loc.typology, false);
      }
      cityEngine?.stepIntoLocale?.(locId);
    });
  });

  // Gameday Spectacle Preset Buttons (delegated + dynamic region filter)
  const activateStadiumVenue = (stadiumId) => {
    const stadium = getStadiumById(stadiumId);
    if (!stadium) return;
    selectedLocaleId = stadiumId;
    hideAmbientPill();
    dock.notifySimulationStarted('city');
    updateArchetypeCard(SETTLEMENT_TYPOLOGIES.STADIUM_SPORTS_COMPLEX, false);
    stadiumCrowdEngine?.setActiveStadium(stadium);
    if (viewer?.camera) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          stadium.lon,
          stadium.lat,
          (stadium.elev || 0) + (stadium.defaultAlt || 180),
        ),
        orientation: {
          heading: Cesium.Math.toRadians(stadium.headingDeg || 0),
          pitch: Cesium.Math.toRadians(stadium.pitchDeg || -28),
          roll: 0.0,
        },
        duration: 2.0,
      });
    }
  };
  const stadiumGridEl = drawer.querySelector('.gev-stadium-preset-grid');
  stadiumGridEl?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.gev-stadium-preset-btn');
    if (!btn) return;
    activateStadiumVenue(btn.getAttribute('data-stadium-id'));
  });
  const stadiumMetroFilter = drawer.querySelector('.gev-stadium-metro-filter');
  stadiumMetroFilter?.addEventListener('change', () => {
    if (stadiumGridEl) {
      stadiumGridEl.innerHTML = renderStadiumButtonsHtml(
        stadiumMetroFilter.value,
      );
    }
  });

  // Gameday Match Lifecycle Phase Advancer Button
  const cycleGamedayStateBtn = drawer.querySelector(
    '.gev-gameday-cycle-state-btn',
  );
  cycleGamedayStateBtn?.addEventListener('click', () => {
    stadiumCrowdEngine?.advanceGamedayState();
    const badgeEl = drawer.querySelector('.gev-gameday-status-badge');
    if (badgeEl && stadiumCrowdEngine) {
      badgeEl.textContent = stadiumCrowdEngine.getGamedayStatusBadge();
    }
  });

  // Gameday Camera Suite Mode Buttons
  const gamedayCamBtns = drawer.querySelectorAll('.gev-gameday-cam-btn');
  gamedayCamBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      gamedayCamBtns.forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#c9d1d9';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(56, 189, 248, 0.2)';
      btn.style.borderColor = '#38bdf8';
      btn.style.color = '#38bdf8';

      const mode = btn.getAttribute('data-cam-mode');
      stadiumCrowdEngine?.setCameraMode(mode);
    });
  });

  function applyMallCamera(mode) {
    if (!viewer?.camera) return;
    const mall =
      EXEMPLAR_LOCALES[selectedLocaleId] ||
      Object.values(EXEMPLAR_LOCALES).find(
        (loc) => loc.typology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      ) ||
      EXEMPLAR_LOCALES.phipps_plaza;

    if (!mall) return;
    const camPreset = mall.watchCameras?.[mode];
    if (camPreset) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          camPreset.lon,
          camPreset.lat,
          (mall.elev || 0) + (camPreset.altOffset || 40),
        ),
        orientation: {
          heading: Cesium.Math.toRadians(camPreset.headingDeg || 0),
          pitch: Cesium.Math.toRadians(camPreset.pitchDeg || -30),
          roll: 0.0,
        },
        duration: 1.8,
      });
    }
  }

  function startMallWander() {
    const mall =
      EXEMPLAR_LOCALES[selectedLocaleId] ||
      Object.values(EXEMPLAR_LOCALES).find(
        (loc) => loc.typology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE,
      ) ||
      EXEMPLAR_LOCALES.phipps_plaza;

    if (!mall) return;
    const corridor = mall.corridors?.[0];
    const spawnPt = corridor?.waypoints?.[1] ||
      corridor?.waypoints?.[0] || {
        lat: mall.lat,
        lon: mall.lon,
        elev: mall.elev || 0,
      };

    if (wanderEngine?.startWandering) {
      dock.notifySimulationStarted('wander');
      wanderEngine.startWandering({
        lat: spawnPt.lat,
        lon: spawnPt.lon,
        headingDeg: mall.headingDeg || 0,
        cameraMode: 'first_person',
      });
    }
  }

  // Peak Mall Camera Suite Mode Buttons
  const mallCamBtns = drawer.querySelectorAll('.gev-mall-cam-btn');
  mallCamBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      mallCamBtns.forEach((b) => {
        b.classList.remove('active');
        b.style.background = '#21262d';
        b.style.borderColor = '#30363d';
        b.style.color = '#c9d1d9';
      });
      btn.classList.add('active');
      btn.style.background = 'rgba(236, 72, 153, 0.2)';
      btn.style.borderColor = '#ec4899';
      btn.style.color = '#f472b6';

      const mode = btn.getAttribute('data-cam-mode');
      applyMallCamera(mode);
    });
  });

  // Mall Promenade Wander 1:1 Button
  const mallWanderBtn = drawer.querySelector('.gev-mall-wander-btn');
  mallWanderBtn?.addEventListener('click', () => {
    startMallWander();
  });

  // Archetype Override Select Dropdown
  const archetypeSelect = drawer.querySelector('.gev-archetype-select');
  archetypeSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'AUTO') {
      syncCameraArchetype();
      if (cityEngine?.setTypologyOverride) {
        cityEngine.setTypologyOverride(activeTypologyKey);
      }
    } else if (SETTLEMENT_TYPOLOGIES[val]) {
      updateArchetypeCard(val, true);
      if (cityEngine?.setTypologyOverride) {
        cityEngine.setTypologyOverride(val);
      }
    }
  });

  // Audio Soundscape Volume Slider & Mute
  const soundscapeVolumeSlider = drawer.querySelector('.gev-soundscape-volume');
  soundscapeVolumeSlider?.addEventListener('input', (e) => {
    const volume = Number(e.target.value) / 100.0;
    cityEngine?.getAmbientSoundscape?.()?.setVolume(volume);
  });

  const soundscapeMuteBtn = drawer.querySelector('.gev-soundscape-mute-btn');
  let isMuted = false;
  soundscapeMuteBtn?.addEventListener('click', () => {
    isMuted = !isMuted;
    soundscapeMuteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    soundscapeMuteBtn.style.color = isMuted ? '#ef4444' : '#38bdf8';
    cityEngine?.getAmbientSoundscape?.()?.toggleMute();
  });

  // Locale Density Selector
  const localeDensityBtns = drawer.querySelectorAll('.gev-locale-density-btn');
  localeDensityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      localeDensityBtns.forEach((b) => {
        b.style.background = '#161b22';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.style.background = 'rgba(6, 182, 212, 0.2)';
      btn.style.borderColor = '#06b6d4';
      btn.style.color = '#22d3ee';
      const density = btn.getAttribute('data-density');
      cityEngine?.setDensity?.(density);
    });
  });

  // City Select Dropdown (Strolls Tab)
  const citySelect = drawer.querySelector('.gev-city-select');
  citySelect?.addEventListener('change', (e) => {
    selectedCityId = e.target.value;
  });

  // Pedestrian Density Buttons
  const densityBtns = drawer.querySelectorAll('.gev-density-btn');
  densityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      densityBtns.forEach((b) => {
        b.style.background = '#161b22';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.style.background = 'rgba(6, 182, 212, 0.2)';
      btn.style.borderColor = '#06b6d4';
      btn.style.color = '#22d3ee';
      const density = btn.getAttribute('data-density');
      cityEngine?.setDensity?.(density);
    });
  });

  // Camera Mode Buttons
  const camBtns = drawer.querySelectorAll('.gev-cam-btn');
  camBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      camBtns.forEach((b) => {
        b.style.background = '#161b22';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.style.background = 'rgba(6, 182, 212, 0.2)';
      btn.style.borderColor = '#06b6d4';
      btn.style.color = '#22d3ee';
      const cam = btn.getAttribute('data-cam');
      cityEngine?.setCameraMode?.(cam);
    });
  });

  // Snap Back Button
  const snapBtn = drawer.querySelector('.gev-cam-snap');
  snapBtn?.addEventListener('click', () => {
    cityEngine?.snapBack?.();
  });

  // Stroller Navigator Controls
  const prevStrollerBtn = drawer.querySelector('.gev-ped-prev-btn');
  const nextStrollerBtn = drawer.querySelector('.gev-ped-next-btn');
  const strollerNameEl = drawer.querySelector('.gev-stroller-name');
  const strollerSpeedEl = drawer.querySelector('.gev-stroller-speed');

  function updateStrollerCard(ped) {
    if (!ped || !ped.persona) return;
    if (strollerNameEl) {
      strollerNameEl.textContent = `${ped.persona.name} (${ped.persona.occupation})`;
    }
    if (strollerSpeedEl) {
      strollerSpeedEl.textContent = `${ped.persona.speedKmh} km/h`;
    }
  }

  prevStrollerBtn?.addEventListener('click', () => {
    const ped = cityEngine?.cyclePedestrian?.(-1);
    updateStrollerCard(ped);
  });

  nextStrollerBtn?.addEventListener('click', () => {
    const ped = cityEngine?.cyclePedestrian?.(1);
    updateStrollerCard(ped);
  });

  if (cityEngine?.onPedestrianLatched) {
    cityEngine.onPedestrianLatched((ped) => {
      updateStrollerCard(ped);
    });
  }

  // Stroll Pace Buttons
  const paceBtns = drawer.querySelectorAll('.gev-pace-btn');
  paceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      paceBtns.forEach((b) => {
        b.style.background = '#161b22';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.style.background = 'rgba(6, 182, 212, 0.2)';
      btn.style.borderColor = '#06b6d4';
      btn.style.color = '#22d3ee';
      const pace = parseFloat(btn.getAttribute('data-pace')) || 1.0;
      cityEngine?.setSpeedMultiplier?.(pace);
    });
  });

  // Launch Stroll
  const launchBtn = drawer.querySelector('.gev-city-launch-btn');
  launchBtn?.addEventListener('click', () => {
    hideAmbientPill();
    dock.notifySimulationStarted('city');
    if (!selectedCityId || selectedCityId === 'current') {
      cityEngine?.stepIntoCurrentLocation?.({
        typology: activeTypologyKey,
      });
    } else {
      cityEngine?.stepIntoCity?.(selectedCityId);
    }
  });

  // Launch Panoramic City Map
  const cityMapBtn = drawer.querySelector('.gev-city-map-btn');
  cityMapBtn?.addEventListener('click', () => {
    hideAmbientPill();
    dock.notifySimulationStarted('city');
    if (!selectedCityId || selectedCityId === 'current') {
      cityEngine?.stepIntoCurrentLocation?.({
        typology: activeTypologyKey,
      });
      cityEngine?.setCameraMode?.('city_map');
    } else {
      cityEngine?.showCityMap?.(selectedCityId);
    }
  });

  // Rain Toggle
  const rainBtn = drawer.querySelector('.gev-city-rain-btn');
  let rainActive = false;
  rainBtn?.addEventListener('click', () => {
    rainActive = !rainActive;
    rainBtn.style.background = rainActive
      ? 'rgba(56, 189, 248, 0.25)'
      : '#161b22';
    rainBtn.style.borderColor = rainActive ? '#38bdf8' : '#30363d';
    cityEngine?.toggleRain?.(rainActive);
  });

  // Stop Simulation
  const stopBtn = drawer.querySelector('.gev-city-stop-btn');
  stopBtn?.addEventListener('click', () => {
    cityEngine?.clearPedestrians?.();
    cityEngine?.getUrbanEvents?.()?.stopUrbanEvent?.();
    wanderEngine?.stopWandering?.();
  });

  function getGroundTargetCoordinates() {
    let targetLat = currentPillTarget?.lat || 33.749;
    let targetLon = currentPillTarget?.lon || -84.388;
    let targetElev = currentPillTarget?.elev || 300;

    if (viewer?.camera && viewer?.scene?.canvas) {
      const canvas = viewer.scene.canvas;
      if (canvas.clientWidth && canvas.clientHeight) {
        try {
          const centerPos = new Cesium.Cartesian2(
            canvas.clientWidth / 2,
            canvas.clientHeight / 2,
          );
          const centerCart = pickActiveGroundPosition(viewer, centerPos);
          if (centerCart) {
            const carto = Cesium.Cartographic.fromCartesian(centerCart);
            if (
              Number.isFinite(carto.latitude) &&
              Number.isFinite(carto.longitude)
            ) {
              targetLat = Cesium.Math.toDegrees(carto.latitude);
              targetLon = Cesium.Math.toDegrees(carto.longitude);
              targetElev = Number.isFinite(carto.height) ? carto.height : 0;
              return { lat: targetLat, lon: targetLon, elev: targetElev };
            }
          }
        } catch {}
      }
    }

    if (viewer?.camera?.positionCartographic) {
      const c = viewer.camera.positionCartographic;
      if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        targetLat = Cesium.Math.toDegrees(c.latitude);
        targetLon = Cesium.Math.toDegrees(c.longitude);
        targetElev = sampleActiveGroundHeight(viewer, c);
      }
    }

    return { lat: targetLat, lon: targetLon, elev: targetElev };
  }

  // Player Ground Wander & Companion Controls
  const openWanderDrawerBtn = drawer.querySelector(
    '.gev-open-wander-drawer-btn',
  );
  openWanderDrawerBtn?.addEventListener('click', () => {
    hideAmbientPill();
    dock.openDrawer('wander');
  });

  const wanderLaunchBtn = drawer.querySelector('.gev-wander-launch-btn');
  wanderLaunchBtn?.addEventListener('click', () => {
    hideAmbientPill();
    const coords = getGroundTargetCoordinates();
    wanderEngine?.startWandering?.({
      lat: coords.lat,
      lon: coords.lon,
      elev: coords.elev,
      heading: viewer?.camera?.heading
        ? Cesium.Math.toDegrees(viewer.camera.heading)
        : 0,
      companion: wanderEngine?.isCompanionActive
        ? wanderEngine.isCompanionActive()
        : true,
    });
    dock.openDrawer('wander');
  });

  const wanderStopBtn = drawer.querySelector('.gev-wander-stop-btn');
  wanderStopBtn?.addEventListener('click', () => {
    wanderEngine?.stopWandering?.();
  });

  const companionNameInput = drawer.querySelector('.gev-wander-companion-name');
  const wanderCompanionBtn = drawer.querySelector('.gev-wander-companion-btn');

  function refreshCompanionButton(active) {
    const compName = getCompanionPersonaName();
    if (wanderCompanionBtn) {
      wanderCompanionBtn.style.background = active ? '#059669' : '#374151';
      wanderCompanionBtn.textContent = active
        ? `👯 ${compName} [P]`
        : '👤 Solo [P]';
    }
  }

  companionNameInput?.addEventListener('input', (e) => {
    const val = e.target.value;
    setCompanionPersonaName(val);
    const active = wanderEngine?.isCompanionActive
      ? wanderEngine.isCompanionActive()
      : true;
    refreshCompanionButton(active);
  });

  wanderCompanionBtn?.addEventListener('click', () => {
    const active = wanderEngine?.toggleCompanion?.();
    refreshCompanionButton(active);
  });

  const wanderCamBtns = drawer.querySelectorAll('.gev-wander-cam-btn');
  wanderCamBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const wcam = btn.getAttribute('data-wcam');
      if (wcam === 'snap') {
        wanderEngine?.snapBack?.();
        wanderCamBtns.forEach((b) => {
          if (b.getAttribute('data-wcam') === 'fps_lock') return;
          b.style.background = '#161b22';
          b.style.borderColor = '#30363d';
          b.style.color = '#8b949e';
        });
        const isoBtn = drawer.querySelector(
          '.gev-wander-cam-btn[data-wcam="iso_chase"]',
        );
        if (isoBtn) {
          isoBtn.style.background = 'rgba(6, 182, 212, 0.2)';
          isoBtn.style.borderColor = '#06b6d4';
          isoBtn.style.color = '#22d3ee';
        }
      } else if (wcam === 'fps_lock') {
        if (wanderEngine?.isPointerLocked?.()) {
          wanderEngine.exitPointerLock?.();
          btn.style.background = '#161b22';
          btn.style.borderColor = '#30363d';
          btn.style.color = '#8b949e';
          btn.textContent = '🖱️ FPS Look';
        } else {
          wanderEngine?.requestPointerLock?.();
          btn.style.background = 'rgba(16, 185, 129, 0.2)';
          btn.style.borderColor = '#10b981';
          btn.style.color = '#34d399';
          btn.textContent = '🔓 Exit Look';
        }
      } else if (wcam) {
        wanderEngine?.setCameraMode?.(wcam);
        wanderCamBtns.forEach((b) => {
          if (b.getAttribute('data-wcam') === 'fps_lock') return;
          b.style.background = '#161b22';
          b.style.borderColor = '#30363d';
          b.style.color = '#8b949e';
        });
        btn.style.background = 'rgba(6, 182, 212, 0.2)';
        btn.style.borderColor = '#06b6d4';
        btn.style.color = '#22d3ee';
      }
    });
  });

  if (wanderEngine?.onPointerLockChange) {
    wanderEngine.onPointerLockChange((locked) => {
      const fpsBtn = drawer.querySelector(
        '.gev-wander-cam-btn[data-wcam="fps_lock"]',
      );
      if (!fpsBtn) return;
      if (locked) {
        fpsBtn.style.background = 'rgba(16, 185, 129, 0.2)';
        fpsBtn.style.borderColor = '#10b981';
        fpsBtn.style.color = '#34d399';
        fpsBtn.textContent = '🔓 Exit Look';
      } else {
        fpsBtn.style.background = '#161b22';
        fpsBtn.style.borderColor = '#30363d';
        fpsBtn.style.color = '#8b949e';
        fpsBtn.textContent = '🖱️ FPS Look';
      }
    });
  }

  // Urban Spectacle Cards
  const eventCards = drawer.querySelectorAll('.gev-event-card');
  eventCards.forEach((card) => {
    card.addEventListener('click', () => {
      eventCards.forEach((c) => {
        c.style.borderColor = '#30363d';
      });
      card.style.borderColor = '#ea580c';
      selectedEventId = card.getAttribute('data-event-id');
    });
  });

  // Start & Stop Urban Event
  const startEventBtn = drawer.querySelector('.gev-event-start-btn');
  startEventBtn?.addEventListener('click', () => {
    hideAmbientPill();
    cityEngine?.getUrbanEvents?.()?.startUrbanEvent?.(selectedEventId);
  });

  const stopEventBtn = drawer.querySelector('.gev-event-stop-btn');
  stopEventBtn?.addEventListener('click', () => {
    cityEngine?.getUrbanEvents?.()?.stopUrbanEvent?.();
  });

  // Spectacle Camera Mode Buttons
  const eventCamBtns = drawer.querySelectorAll('.gev-event-cam-btn');
  eventCamBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      eventCamBtns.forEach((b) => {
        b.style.background = '#161b22';
        b.style.borderColor = '#30363d';
        b.style.color = '#8b949e';
      });
      btn.style.background = 'rgba(234, 88, 12, 0.2)';
      btn.style.borderColor = '#ea580c';
      btn.style.color = '#fb923c';
      const cam = btn.getAttribute('data-cam');
      cityEngine?.getUrbanEvents?.()?.setCameraMode?.(cam);
    });
  });

  const eventSnapBtn = drawer.querySelector('.gev-event-cam-snap');
  eventSnapBtn?.addEventListener('click', () => {
    cityEngine?.getUrbanEvents?.()?.snapBack?.();
  });

  // City Hop Buttons (Dual Mode: Stroll vs Panoramic Map)
  const hopStrollBtns = drawer.querySelectorAll('.gev-city-hop-stroll-btn');
  hopStrollBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cityId = btn.getAttribute('data-city-id');
      selectedCityId = cityId;
      if (citySelect) citySelect.value = cityId;
      hideAmbientPill();
      cityEngine?.stepIntoCity?.(cityId);
    });
  });

  const hopMapBtns = drawer.querySelectorAll('.gev-city-hop-map-btn');
  hopMapBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cityId = btn.getAttribute('data-city-id');
      selectedCityId = cityId;
      if (citySelect) citySelect.value = cityId;
      hideAmbientPill();
      cityEngine?.showCityMap?.(cityId);
    });
  });

  const hopTourBtns = drawer.querySelectorAll('.gev-city-hop-tour-btn');
  hopTourBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cityId = btn.getAttribute('data-city-id');
      selectedCityId = cityId;
      if (citySelect) citySelect.value = cityId;
      launchContextualTourOrPlay(cityId);
    });
  });

  // Ambient Pills Click Triggers
  ambientPill
    .querySelector('.gev-ambient-living-btn')
    ?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideAmbientPill();
      if (currentPillTarget?.isDynamic || currentPillTarget?.lat != null) {
        cityEngine?.stepIntoCurrentLocation?.(currentPillTarget);
      } else {
        cityEngine?.stepIntoCity?.(selectedCityId);
      }
    });

  ambientPill
    .querySelector('.gev-ambient-wander-btn')
    ?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideAmbientPill();
      const coords = getGroundTargetCoordinates();
      wanderEngine?.startWandering?.({
        lat: coords.lat,
        lon: coords.lon,
        elev: coords.elev,
        heading: viewer?.camera?.heading
          ? Cesium.Math.toDegrees(viewer.camera.heading)
          : 0,
        companion: wanderEngine?.isCompanionActive
          ? wanderEngine.isCompanionActive()
          : true,
      });
      dock.openDrawer('wander');
    });

  ambientPill
    .querySelector('.gev-ambient-tour-play-btn')
    ?.addEventListener('click', (e) => {
      e.stopPropagation();
      launchContextualTourOrPlay();
    });

  // Launcher Button Click Trigger
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

  // Close Button
  drawer.querySelector('.gev-city-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  // Keyboard 'C' Shortcut Listener
  function handleKeyDown(e) {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      return;
    if (e.key === 'c' || e.key === 'C') {
      const isPillActive =
        ambientPill.classList.contains('visible') ||
        (ambientPill.style.display === 'flex' &&
          ambientPill.style.opacity === '1');
      if (isPillActive) {
        hideAmbientPill();
        if (currentPillTarget?.isDynamic || currentPillTarget?.lat != null) {
          cityEngine?.stepIntoCurrentLocation?.(currentPillTarget);
        } else {
          cityEngine?.stepIntoCity?.(selectedCityId);
        }
      } else {
        if (
          drawer.classList.contains('hidden') ||
          drawer.style.display === 'none'
        ) {
          open();
        } else {
          close();
        }
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
  }

  // URL query parameter routing: ?livingWorld=true, ?locale=darien_ga, ?city=atlanta, or ?urbanEvent=monaco_gp
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const localeParam = params.get('locale') || params.get('livingLocale');
      const isLivingWorld =
        params.get('livingWorld') === 'true' ||
        params.get('livingWorld') === '1';
      const cityParam = params.get('city') || params.get('livingCity');
      const eventParam = params.get('urbanEvent') || params.get('event');
      const isCityLife =
        params.get('cityLife') === 'true' || params.get('cityLife') === '1';

      if (localeParam || isLivingWorld) {
        setTimeout(() => {
          cityEngine?.stepIntoLocale?.(localeParam || 'darien_ga');
        }, 1200);
      } else if (eventParam && URBAN_EVENTS[eventParam]) {
        setTimeout(() => {
          cityEngine?.getUrbanEvents?.()?.startUrbanEvent?.(eventParam);
        }, 1200);
      } else if (cityParam || isCityLife) {
        setTimeout(() => {
          cityEngine?.stepIntoCity?.(cityParam || 'atlanta');
        }, 1200);
      }

      const wanderParam =
        params.get('wander') === 'true' ||
        params.get('wander') === '1' ||
        params.get('explore') === 'true';
      const companionParam = params.get('companion');
      const modeParam = params.get('mode') || params.get('camera');

      if (wanderParam) {
        setTimeout(() => {
          const city = resolveCity(cityParam || 'atlanta');
          wanderEngine?.startWandering?.({
            lat: city?.lat || 33.749,
            lon: city?.lon || -84.388,
            elev: city?.elev || 300,
            heading: city?.headingDeg || 0,
            companion: companionParam !== 'false',
            cameraMode: modeParam || 'iso_chase',
          });
        }, 1200);
      }
    } catch {
      /* ignore */
    }
  }

  close(); // Start closed by default

  dock.registerDrawer('city', {
    open: () => open(),
    close: () => close(),
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    launcherEl: launcherButton,
  });

  dock.registerSimulation('city', {
    stop: () => {
      cityEngine?.clearPedestrians?.();
      cityEngine?.getUrbanEvents?.()?.stopUrbanEvent?.();
      dock.notifySimulationStopped('city');
    },
    isActive: () => Boolean(cityEngine?.isSimActive?.()),
  });

  dock.registerOverlayGroup('city-ambient', {
    elements: [ambientPill],
  });

  const unsubscribeSimState = dock.onSimulationStateChange?.(() =>
    syncAmbientVisibility(),
  );
  const unsubscribeDrawerState = dock.onDrawerStateChange?.(() =>
    syncAmbientVisibility(),
  );

  // Reactive Command Dock & Popover Collision-Avoidance Observer
  function syncAmbientDockState() {
    if (!ambientPill) return;
    const commandDock =
      typeof document !== 'undefined'
        ? document.getElementById('command-dock')
        : null;
    const controlPanel =
      typeof document !== 'undefined'
        ? document.getElementById('control-panel')
        : null;
    const locationBar =
      typeof document !== 'undefined'
        ? document.getElementById('location-bar')
        : null;

    const isControlPanelOpen =
      controlPanel &&
      (!controlPanel.classList.contains('collapsed') ||
        controlPanel.classList.contains('dock-pinned'));
    const isLocationBarOpen =
      locationBar &&
      (!locationBar.classList.contains('collapsed') ||
        locationBar.classList.contains('dock-pinned'));
    const hasPinnedTray =
      commandDock &&
      (commandDock.classList.contains('dock-has-pinned-tray') ||
        commandDock.classList.contains('dock-has-two-pinned-trays'));

    if (isControlPanelOpen || isLocationBarOpen || hasPinnedTray) {
      ambientPill.classList.add('dock-active');
    } else {
      ambientPill.classList.remove('dock-active');
    }
  }

  let dockObserver = null;
  if (
    typeof document !== 'undefined' &&
    typeof MutationObserver !== 'undefined'
  ) {
    const commandDock = document.getElementById('command-dock');
    if (commandDock) {
      dockObserver = new MutationObserver(() => syncAmbientDockState());
      dockObserver.observe(commandDock, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
      });

      commandDock.addEventListener('mouseenter', () => {
        ambientPill?.classList.add('dock-hover');
      });
      commandDock.addEventListener('mouseleave', () => {
        ambientPill?.classList.remove('dock-hover');
        syncAmbientDockState();
      });
    }
  }

  return {
    open,
    close,
    isOpen: () =>
      !drawer.classList.contains('hidden') && drawer.style.display !== 'none',
    updateArchetypeCard,
    getWanderEngine: () => wanderEngine,
    getTourAndPlayEngine: () => tourAndPlayEngine,
    getStadiumEngine: () => stadiumCrowdEngine,
    destroy: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
      dockObserver?.disconnect();
      if (ambientPillDismissTimer) clearTimeout(ambientPillDismissTimer);
      unsubscribeSimState?.();
      unsubscribeDrawerState?.();
      dock.unregisterOverlayGroup('city-ambient');
      dock.unregisterSimulation('city');
      dock.unregisterDrawer('city');
      stadiumCrowdEngine?.destroy?.();
      drawer.remove();
      ambientPill.remove();
      launcherButton.remove();
    },
  };
}
