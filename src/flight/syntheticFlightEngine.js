/**
 * Synthetic Great-Circle Flight Simulator Engine for God's Eye View.
 * (Synthetic Flight Capability + Route Slice)
 *
 * Simulates real-time airliner flights along great-circle geodesic trajectories (SLERP)
 * between global waypoints (airports / cities) with 3D Cesium glTF airliner entities,
 * smooth cruise altitude curves, front-end spawner modal, and Cockpit camera integration.
 *
 * Supports:
 * - Direct URL parameter trigger: ?flightFrom=ATL&flightTo=CLT (or ?flightFrom=JFK&flightTo=LHR)
 * - AgentBridge SSE dispatch: { action: 'fly_route', from: '...', to: '...', cruiseAlt: 10500 }
 * - Standalone interactive Flight Route Spawner Drawer / Button
 * - First-Person Cockpit Camera tracking lock
 */

import * as Cesium from 'cesium';
import { resolveHelipad } from './helipadCatalog.js';
import { aircraftIcon } from '../data/aircraftIcons.js';
import { courseScreenRotation } from '../data/screenRotation.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
  nudgeTilesetStreaming,
} from '../renderGovernor.js';
import {
  trySampleSurfaceHeight,
  isPhotoreal3DActive,
  subscribeToMapStack,
} from '../layers/citylife/surfaceHeight.js';
import { estimateWaypointElevation } from '../drive/driveWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { AIRPORT_WAYPOINTS } from './airportCatalog.js';
import { createCameraAuthority } from '../ui/sovereign/cameraControlBridge.js';
import { butterGoogle3DTiles } from '../ui/sovereign/tilesetButter.js';

export { AIRPORT_WAYPOINTS };

export const DEFAULT_CRUISE_ALTITUDE_METERS = 10668; // ~35,000 ft
export const DEFAULT_FLIGHT_DURATION_SECONDS = 180; // Legacy fallback when distance is zero
export const AIRLINER_CRUISE_KTS = 480;
export const AIRLINER_CRUISE_MS = AIRLINER_CRUISE_KTS / 1.94384;
export const DEFAULT_AIRLINER_MODEL_URI = '/models/fleet/aircraft/a320.glb';
export const DEFAULT_ROTORCRAFT_MODEL_URI =
  '/models/fleet/helicopters/ec45.glb';

/**
 * Builds a clean, axis-aligned OOB-style `[ ]` four-corner contact bracket SVG
 * matching `appendCornerBracket` in `src/data/detectionDraw.js`.
 */
export function buildContactBracketSvg(colorHex = '#38bdf8', sizePx = 46) {
  const s = Math.max(24, Math.round(sizePx));
  const m = 3;
  const arm = Math.max(7, Math.round(s * 0.24));
  const x0 = m;
  const y0 = m;
  const x1 = s - m;
  const y1 = s - m;
  const paths = [
    `M${x0},${y0 + arm} L${x0},${y0} L${x0 + arm},${y0}`,
    `M${x1 - arm},${y0} L${x1},${y0} L${x1},${y0 + arm}`,
    `M${x1},${y1 - arm} L${x1},${y1} L${x1 - arm},${y1}`,
    `M${x0 + arm},${y1} L${x0},${y1} L${x0},${y1 - arm}`,
  ].join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="display:block;overflow:visible;"><path d="${paths}" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="3.6" stroke-linecap="square" stroke-linejoin="miter"/><path d="${paths}" fill="none" stroke="${colorHex}" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
}

/**
 * Calculates Great-Circle SLERP interpolation between two WGS84 Cartesian3 positions.
 */
export function interpolateGreatCirclePoint(
  startCartesian,
  endCartesian,
  t,
  altitudeMeters = 0,
) {
  // Normalize vectors to unit sphere
  const startNorm = Cesium.Cartesian3.normalize(
    startCartesian,
    new Cesium.Cartesian3(),
  );
  const endNorm = Cesium.Cartesian3.normalize(
    endCartesian,
    new Cesium.Cartesian3(),
  );

  // Spherical linear interpolation on unit sphere
  const dot = Cesium.Math.clamp(
    Cesium.Cartesian3.dot(startNorm, endNorm),
    -1.0,
    1.0,
  );
  const theta = Math.acos(dot);

  let pointOnUnit;
  if (Math.abs(theta) < 1e-6) {
    pointOnUnit = startNorm;
  } else {
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1.0 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;

    const termA = Cesium.Cartesian3.multiplyByScalar(
      startNorm,
      a,
      new Cesium.Cartesian3(),
    );
    const termB = Cesium.Cartesian3.multiplyByScalar(
      endNorm,
      b,
      new Cesium.Cartesian3(),
    );
    pointOnUnit = Cesium.Cartesian3.add(termA, termB, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(pointOnUnit, pointOnUnit);
  }

  // Convert unit sphere point back to WGS84 Cartographic coordinates
  const cartographic = Cesium.Cartographic.fromCartesian(pointOnUnit);
  const startCarto = Cesium.Cartographic.fromCartesian(startCartesian);
  const endCarto = Cesium.Cartographic.fromCartesian(endCartesian);
  const startH = Number.isFinite(startCarto?.height) ? startCarto.height : 200;
  const endH = Number.isFinite(endCarto?.height) ? endCarto.height : 200;
  const baseElev = Math.max(200, startH * (1.0 - t) + endH * t);

  // Parabolic cruise altitude climb/descent curve: baseElev at ends, peaks at cruise altitude above base
  const altFactor = Math.sin(Math.PI * t);
  const currentAlt = altitudeMeters * altFactor + baseElev;

  return Cesium.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    currentAlt,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartesian3(),
  );
}

/**
 * Resolves waypoint coordinates from string query or IATA code.
 */
export function resolveWaypoint(query) {
  if (!query) return null;
  if (
    typeof query === 'object' &&
    Number.isFinite(Number(query.lat)) &&
    Number.isFinite(Number(query.lon))
  ) {
    const lat = Number(query.lat);
    const lon = Number(query.lon);
    const rawLabel = String(
      query.code || query.shortLabel || query.name || query.title || '',
    ).trim();
    const displayCode = rawLabel
      ? rawLabel.split(',')[0].trim().slice(0, 18).toUpperCase()
      : 'CUSTOM';
    return {
      code: displayCode,
      name:
        query.name ||
        query.title ||
        `Custom Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      lat,
      lon,
      elev: estimateWaypointElevation(lat, lon, query.elev),
      type: query.type,
    };
  }
  if (typeof query !== 'string') return null;
  const clean = query.trim().toUpperCase();

  if (AIRPORT_WAYPOINTS[clean]) {
    return { ...AIRPORT_WAYPOINTS[clean], code: clean };
  }

  // Handle US 4-letter ICAO codes starting with 'K' (e.g. KPDK -> PDK, KATL -> ATL)
  if (
    clean.length === 4 &&
    clean.startsWith('K') &&
    AIRPORT_WAYPOINTS[clean.slice(1)]
  ) {
    return { ...AIRPORT_WAYPOINTS[clean.slice(1)], code: clean.slice(1) };
  }

  // Check dedicated helipad network
  const helipad = resolveHelipad(query);
  if (helipad) {
    return { ...helipad, code: helipad.code || clean };
  }

  for (const [code, wp] of Object.entries(AIRPORT_WAYPOINTS)) {
    if (wp.name.toUpperCase().includes(clean)) {
      return { ...wp, code };
    }
  }

  // Fallback: check if query looks like "lat,lon" coordinates
  const coords = query.split(',').map((s) => parseFloat(s.trim()));
  if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
    return {
      code: 'CUSTOM',
      name: `Custom Location (${coords[0].toFixed(2)}, ${coords[1].toFixed(2)})`,
      lat: coords[0],
      lon: coords[1],
      elev: estimateWaypointElevation(coords[0], coords[1]),
    };
  }

  return null;
}

/**
 * Asynchronously resolves waypoint coordinates from string query or IATA code,
 * falling back to Nominatim place geocoding if unknown.
 */
export async function resolveWaypointAsync(
  query,
  fetchImpl = globalThis.fetch,
) {
  const syncWp = resolveWaypoint(query);
  if (syncWp) return syncWp;
  if (!query || typeof query !== 'string') return null;

  try {
    const res = await fetchImpl(
      `/api/geocode?q=${encodeURIComponent(query.trim())}`,
    );
    if (res.ok) {
      const data = await res.json();
      const first = data?.results?.[0];
      if (
        first &&
        Number.isFinite(Number(first.lat)) &&
        Number.isFinite(Number(first.lon))
      ) {
        const shortCode = query.slice(0, 4).toUpperCase();
        return {
          code: shortCode,
          name: first.name || first.display_name || query,
          lat: Number(first.lat),
          lon: Number(first.lon),
          elev: 50,
        };
      }
    }
  } catch {
    /* fallback */
  }

  return null;
}

export function calculateGreatCircleDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export const ROTORCRAFT_CRUISE_MS = 64 * 0.66;
export const ROTORCRAFT_CRUISE_KTS = Math.round(ROTORCRAFT_CRUISE_MS * 1.94384);

export const ROTORCRAFT_CAMERA_OFFSETS = Object.freeze({
  chase: new Cesium.Cartesian3(0.0, -55.0, 22.0),
  cockpit: new Cesium.Cartesian3(0.0, 1.2, 0.4),
  overview: new Cesium.Cartesian3(0.0, -250.0, 500.0),
  heli: new Cesium.Cartesian3(55.0, -35.0, 25.0),
});

export const AIRLINER_CAMERA_OFFSETS = Object.freeze({
  chase: new Cesium.Cartesian3(0.0, -220.0, 65.0),
  cockpit: new Cesium.Cartesian3(0.0, 22.0, 2.5),
  overview: new Cesium.Cartesian3(0.0, -1200.0, 2800.0),
  heli: new Cesium.Cartesian3(180.0, -120.0, 80.0),
});

/**
 * Applies per-frame camera follow tracking along the aircraft trajectory.
 * Bypasses Cesium's cached viewFrom matrix to enable dynamic, responsive angle changes.
 */
export function applyFlightCameraFollow(
  viewer,
  position,
  forwardVec,
  mode = 'chase',
  isRotorcraft = true,
  zoomScale = 1,
  excludeEntities = [],
) {
  if (!viewer?.camera || !position || !forwardVec) return;

  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    position,
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.cross(
    forwardVec,
    up,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(right, right);
  const forward = Cesium.Cartesian3.cross(up, right, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(forward, forward);

  const camPos = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
  const lookTarget = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
  const scratchFwd = new Cesium.Cartesian3();
  const scratchUp = new Cesium.Cartesian3();
  const scratchRight = new Cesium.Cartesian3();

  if (mode === 'cockpit') {
    // First-person nose/chin-bubble view. Rotorcraft cockpit sits 50 m above
    // the flight-path point so the ghost cam clears terrain and tree canopy.
    const fwdDist = isRotorcraft ? 1.8 : 22.0;
    const upDist = isRotorcraft ? 50.35 : 2.5;
    Cesium.Cartesian3.multiplyByScalar(forward, fwdDist, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, upDist, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    // Look 250m down the trajectory with a gentle downward tilt
    Cesium.Cartesian3.clone(camPos, lookTarget);
    Cesium.Cartesian3.multiplyByScalar(forward, 250.0, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, -2.5, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  } else if (mode === 'overview') {
    // High-altitude regional overview tracking aircraft from above
    const backDist = (isRotorcraft ? -400.0 : -1500.0) * zoomScale;
    const upDist = (isRotorcraft ? 550.0 : 2500.0) * zoomScale;
    Cesium.Cartesian3.multiplyByScalar(forward, backDist, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, upDist, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(
      forward,
      isRotorcraft ? 80.0 : 300.0,
      scratchFwd,
    );
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else if (mode === 'heli' || mode === 'orbit') {
    // Scenic 45° angle observation / news copter chase view
    const rightDist = (isRotorcraft ? 45.0 : 120.0) * zoomScale;
    const backDist = (isRotorcraft ? -40.0 : -100.0) * zoomScale;
    const upDist = (isRotorcraft ? 22.0 : 60.0) * zoomScale;
    Cesium.Cartesian3.multiplyByScalar(right, rightDist, scratchRight);
    Cesium.Cartesian3.multiplyByScalar(forward, backDist, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, upDist, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchRight, camPos);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(forward, 10.0, scratchFwd);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
  } else {
    // Default 'chase': classic third-person follow camera. Distances scale with
    // the user's wheel-zoom factor so the chase view can be pulled out or in.
    const backDist = (isRotorcraft ? -150.0 : -220.0) * zoomScale;
    const upDist = (isRotorcraft ? 65.0 : 65.0) * zoomScale;
    Cesium.Cartesian3.multiplyByScalar(forward, backDist, scratchFwd);
    Cesium.Cartesian3.multiplyByScalar(up, upDist, scratchUp);
    Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
    Cesium.Cartesian3.add(camPos, scratchUp, camPos);

    Cesium.Cartesian3.multiplyByScalar(
      forward,
      isRotorcraft ? 20.0 : 50.0,
      scratchFwd,
    );
    Cesium.Cartesian3.multiplyByScalar(up, 2.0, scratchUp);
    Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
  }

  // Anti-subterranean camera guarantee (Google 3D Tiles + 2D Terrain)
  // In Google 3D Tiles mode, skip per-frame scene.sampleHeight() here so Cesium's
  // jobScheduler is never disabled every frame during preRender.
  const camCarto = Cesium.Cartographic.fromCartesian(
    camPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (camCarto) {
    const is3D = isPhotoreal3DActive(viewer);
    const sampledGround = is3D
      ? null
      : trySampleSurfaceHeight(viewer, camCarto, excludeEntities);
    const globeGround = viewer.scene?.globe?.getHeight?.(camCarto);
    const groundH = Number.isFinite(sampledGround)
      ? sampledGround
      : globeGround;
    const minBuffer = mode === 'cockpit' ? 1.5 : 40.0;
    if (Number.isFinite(groundH) && camCarto.height < groundH + minBuffer) {
      camCarto.height = groundH + minBuffer;
      Cesium.Cartesian3.fromRadians(
        camCarto.longitude,
        camCarto.latitude,
        camCarto.height,
        Cesium.Ellipsoid.WGS84,
        camPos,
      );
    }
  }

  const direction = Cesium.Cartesian3.subtract(
    lookTarget,
    camPos,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(direction, direction);

  if (typeof viewer.camera?.setView === 'function') {
    viewer.camera.setView({
      destination: camPos,
      orientation: {
        direction,
        up,
      },
    });
  }
}

/**
 * Creates the Synthetic Flight Simulator Engine.
 */
export function createSyntheticFlightEngine(optionsOrViewer = {}) {
  const options =
    optionsOrViewer?.entities || optionsOrViewer?.clock
      ? { viewer: optionsOrViewer }
      : optionsOrViewer || {};
  const {
    viewer = null,
    operations = null,
    cockpitController = null,
    fetchImpl = globalThis.fetch,
  } = options;
  let activeFlightEntity = null;
  let activeRawFlightPositionProperty = null;
  let flightPathEntity = null;
  let clockTickListener = null;
  let preRenderRemover = null;
  let mapStackUnsub = null;
  let screenPointerHandler = null;
  let isDestroyed = false;
  let activeFlightData = null;
  let currentCameraMode = 'chase';
  let cameraZoomScale = 1;
  const cameraModeListeners = new Set();

  function notifyCameraModeListeners(mode) {
    for (const cb of cameraModeListeners) {
      try {
        cb(mode);
      } catch {
        /* ignore */
      }
    }
  }

  const cameraAuthority = createCameraAuthority({
    engineId: 'synthetic-flight',
    cancelCameraFlight: () => viewer?.camera?.cancelFlight?.(),
    resetCameraLookAt: () =>
      viewer?.camera?.lookAtTransform?.(Cesium.Matrix4.IDENTITY),
    clearTrackedEntity: () => {
      if (viewer && viewer.trackedEntity !== undefined) {
        viewer.trackedEntity = undefined;
      }
    },
    getTilesetPrimitives: () => viewer?.scene?.primitives || null,
    isRendererDestroyed: () => Boolean(isDestroyed || viewer?.isDestroyed?.()),
    onCameraModeApplied: notifyCameraModeListeners,
  });
  let telemetryTimer = null;
  let liveClampedFlightPos = null;
  let lastSampledFlightGroundM = null;
  let last3DFlightSampleMs = -Infinity;
  const FLIGHT_3D_SAMPLE_INTERVAL_MS = 320;

  const container =
    options.container ||
    (typeof document !== 'undefined' ? document.body : null);
  let hudStrip = null;
  let contactBracketOverlay = null;
  let contactBracketSvgHost = null;
  let contactBracketTagEl = null;
  let isReplacingFlight = false;
  const dock = getGlobalDrawerCoordinator();
  if (typeof document !== 'undefined' && container) {
    contactBracketOverlay = document.createElement('div');
    contactBracketOverlay.className = 'gev-flight-contact-bracket';
    contactBracketOverlay.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      transform: translate(-50%, -50%);
      display: none;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      z-index: 9998;
      will-change: left, top;
    `;
    contactBracketSvgHost = document.createElement('div');
    contactBracketSvgHost.className = 'gev-flight-contact-bracket-svg';
    contactBracketSvgHost.innerHTML = buildContactBracketSvg('#38bdf8', 48);
    contactBracketTagEl = document.createElement('div');
    contactBracketTagEl.className = 'gev-flight-contact-bracket-tag';
    contactBracketTagEl.style.cssText = `
      margin-top: 2px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(13, 17, 23, 0.78);
      border: 1px solid rgba(56, 189, 248, 0.45);
      color: #e6edf3;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      white-space: nowrap;
    `;
    contactBracketOverlay.appendChild(contactBracketSvgHost);
    contactBracketOverlay.appendChild(contactBracketTagEl);
    container.appendChild(contactBracketOverlay);

    hudStrip = document.createElement('div');
    hudStrip.className = 'gev-flight-hud-strip';
    hudStrip.style.cssText = `
      position: fixed;
      bottom: 132px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(13, 17, 23, 0.94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(6, 182, 212, 0.45);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75);
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
      <div style="display: flex; flex-direction: column;" class="gev-flight-hud-info">
        <div class="gev-flight-hud-title" style="font-size: 12px; font-weight: 700; color: #22d3ee; white-space: nowrap;">
          🚁 Rotorcraft Cruise
        </div>
        <div class="gev-flight-hud-sub" style="font-size: 10px; color: #8b949e; white-space: nowrap;">
          Telemetry syncing...
        </div>
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="gev-flight-hud-cockpit" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="First-person cockpit / chin-bubble view">
          💺 Cockpit
        </button>
        <button class="gev-flight-hud-chase" style="background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Third-person follow camera">
          🚁 Chase
        </button>
        <button class="gev-flight-hud-overview" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="High-altitude tactical overview">
          🛰️ Overview
        </button>
        <button class="gev-flight-hud-orbit" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Scenic 45° angle observation / news copter">
          🚁 Heli-Cam
        </button>
        <button class="gev-flight-hud-snap" style="background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4); border-radius: 6px; color: #67e8f9; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Re-lock camera onto aircraft">
          🎯 Snap Back
        </button>
        <div style="display: flex; gap: 3px; align-items: center; border-left: 1px solid rgba(255, 255, 255, 0.2); padding-left: 6px;">
          <button class="gev-flight-hud-speed" data-mult="1" style="background: #0284c7; border: 1px solid #38bdf8; border-radius: 4px; color: #ffffff; font-size: 10px; font-weight: 600; padding: 3px 6px; cursor: pointer;" title="1x Real-Time Authentic Cruise">1x</button>
          <button class="gev-flight-hud-speed" data-mult="2" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 3px 6px; cursor: pointer;" title="2x Cruise Simulation">2x</button>
          <button class="gev-flight-hud-speed" data-mult="4" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 3px 6px; cursor: pointer;" title="4x Fast-Forward Simulation">4x</button>
          <button class="gev-flight-hud-speed" data-mult="10" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 3px 6px; cursor: pointer;" title="10x Cruise Time-Warp">10x</button>
          <button class="gev-flight-hud-speed" data-mult="25" style="background: #21262d; border: 1px solid #30363d; border-radius: 4px; color: #8b949e; font-size: 10px; font-weight: 600; padding: 3px 6px; cursor: pointer;" title="25x Express Time-Warp">25x</button>
        </div>
        <button class="gev-flight-hud-stop" style="background: rgba(248, 81, 73, 0.15); border: 1px solid rgba(248, 81, 73, 0.5); border-radius: 6px; color: #f85149; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap;">
          ⏹️ Land
        </button>
      </div>
    `;
    container.appendChild(hudStrip);

    hudStrip
      .querySelector('.gev-flight-hud-cockpit')
      ?.addEventListener('click', () => setCameraMode('cockpit'));
    dock.registerOverlayGroup('flight-hud', {
      elements: [hudStrip, contactBracketOverlay].filter(Boolean),
    });
    hudStrip
      .querySelector('.gev-flight-hud-chase')
      ?.addEventListener('click', () => setCameraMode('chase'));
    hudStrip
      .querySelector('.gev-flight-hud-overview')
      ?.addEventListener('click', () => setCameraMode('overview'));
    hudStrip
      .querySelector('.gev-flight-hud-orbit')
      ?.addEventListener('click', () => setCameraMode('heli'));
    hudStrip
      .querySelector('.gev-flight-hud-snap')
      ?.addEventListener('click', () => setCameraMode(currentCameraMode));
    hudStrip
      .querySelector('.gev-flight-hud-stop')
      ?.addEventListener('click', () => clearActiveFlight());

    hudStrip.querySelectorAll('.gev-flight-hud-speed').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mult = Number(btn.getAttribute('data-mult')) || 1;
        setSimulationMultiplier(mult);
      });
    });
  }

  function setSimulationMultiplier(mult = 1) {
    if (viewer?.clock) {
      viewer.clock.multiplier = mult;
    }
    if (hudStrip) {
      hudStrip.querySelectorAll('.gev-flight-hud-speed').forEach((btn) => {
        const m = Number(btn.getAttribute('data-mult')) || 1;
        const isAct = m === mult;
        btn.style.background = isAct ? '#0284c7' : '#21262d';
        btn.style.color = isAct ? '#ffffff' : '#8b949e';
        btn.style.borderColor = isAct ? '#38bdf8' : '#30363d';
      });
    }
  }

  function updateHudCameraButtons(activeMode) {
    if (!hudStrip) return;
    const highlight = (btn, isAct) => {
      if (!btn) return;
      btn.style.background = isAct ? '#0284c7' : '#21262d';
      btn.style.color = isAct ? '#ffffff' : '#8b949e';
      btn.style.borderColor = isAct ? '#38bdf8' : '#30363d';
    };
    highlight(
      hudStrip.querySelector('.gev-flight-hud-cockpit'),
      activeMode === 'cockpit',
    );
    highlight(
      hudStrip.querySelector('.gev-flight-hud-chase'),
      activeMode === 'chase',
    );
    highlight(
      hudStrip.querySelector('.gev-flight-hud-overview'),
      activeMode === 'overview',
    );
    highlight(
      hudStrip.querySelector('.gev-flight-hud-orbit'),
      activeMode === 'heli',
    );
  }

  function unbindPreRenderCameraFollow() {
    if (preRenderRemover) {
      if (typeof preRenderRemover === 'function') {
        preRenderRemover();
      } else if (typeof preRenderRemover.remove === 'function') {
        preRenderRemover.remove();
      }
      preRenderRemover = null;
    }
    if (mapStackUnsub) {
      try {
        mapStackUnsub();
      } catch {
        /* ignore */
      }
      mapStackUnsub = null;
    }
  }

  function hideContactBracketOverlay() {
    if (contactBracketOverlay) {
      contactBracketOverlay.style.display = 'none';
    }
  }

  function updateContactBracketOverlay(worldPos) {
    if (!contactBracketOverlay) return;
    if (
      isDestroyed ||
      !activeFlightData ||
      !worldPos ||
      currentCameraMode === 'cockpit' ||
      dock?.isCustomUxCollapsed?.()
    ) {
      contactBracketOverlay.style.display = 'none';
      return;
    }
    const projFn =
      Cesium.SceneTransforms?.worldToWindowCoordinates ||
      Cesium.SceneTransforms?.wgs84ToWindowCoordinates;
    if (typeof projFn !== 'function' || !viewer?.scene) {
      contactBracketOverlay.style.display = 'none';
      return;
    }
    let win = null;
    try {
      win = projFn(viewer.scene, worldPos);
    } catch {
      win = null;
    }
    if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
      contactBracketOverlay.style.display = 'none';
      return;
    }
    const rect = viewer.scene?.canvas?.getBoundingClientRect?.() || {
      left: 0,
      top: 0,
      width: typeof window !== 'undefined' ? window.innerWidth : 1920,
      height: typeof window !== 'undefined' ? window.innerHeight : 1080,
    };
    const sx = rect.left + win.x;
    const sy = rect.top + win.y;
    const pad = 64;
    if (
      sx < rect.left - pad ||
      sy < rect.top - pad ||
      sx > rect.left + rect.width + pad ||
      sy > rect.top + rect.height + pad
    ) {
      contactBracketOverlay.style.display = 'none';
      return;
    }
    contactBracketOverlay.style.left = `${sx.toFixed(1)}px`;
    contactBracketOverlay.style.top = `${sy.toFixed(1)}px`;
    contactBracketOverlay.style.display = 'flex';
  }

  function syncFlightAndCameraPose() {
    if (isDestroyed || !activeFlightEntity || !activeFlightData || !viewer) {
      hideContactBracketOverlay();
      return;
    }

    const currentTime = viewer.clock?.currentTime;
    if (!currentTime) return;
    const rawProp =
      activeRawFlightPositionProperty || activeFlightEntity.position;
    const rawPos = rawProp?.getValue?.(currentTime);
    if (!rawPos) return;

    const excludeEntities = [activeFlightEntity, flightPathEntity].filter(
      Boolean,
    );
    const pos = Cesium.Cartesian3.clone(rawPos, new Cesium.Cartesian3());
    const flightCarto = Cesium.Cartographic.fromCartesian(
      pos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (flightCarto) {
      const is3D = isPhotoreal3DActive(viewer);
      const nowMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      let sampledGround = null;
      if (
        !is3D ||
        nowMs - last3DFlightSampleMs >= FLIGHT_3D_SAMPLE_INTERVAL_MS
      ) {
        if (is3D) last3DFlightSampleMs = nowMs;
        sampledGround = trySampleSurfaceHeight(
          viewer,
          flightCarto,
          excludeEntities,
        );
        if (Number.isFinite(sampledGround)) {
          lastSampledFlightGroundM = sampledGround;
        }
      }
      const globeGround = viewer.scene?.globe?.getHeight?.(flightCarto);
      const groundH = Number.isFinite(sampledGround)
        ? sampledGround
        : is3D && Number.isFinite(lastSampledFlightGroundM)
          ? lastSampledFlightGroundM
          : globeGround;
      const minClearance = activeFlightData.isRotorcraft ? 35.0 : 60.0;
      if (
        Number.isFinite(groundH) &&
        flightCarto.height < groundH + minClearance
      ) {
        flightCarto.height = groundH + minClearance;
        Cesium.Cartesian3.fromRadians(
          flightCarto.longitude,
          flightCarto.latitude,
          flightCarto.height,
          Cesium.Ellipsoid.WGS84,
          pos,
        );
      }
    }
    liveClampedFlightPos = Cesium.Cartesian3.clone(pos);

    if (currentCameraMode === 'free') {
      updateContactBracketOverlay(pos);
      return;
    }

    // Sample 0.25s ahead on trajectory for true forward heading
    const futureTime = Cesium.JulianDate.addSeconds(
      currentTime,
      0.25,
      new Cesium.JulianDate(),
    );
    const futurePos = rawProp?.getValue?.(futureTime);
    if (!futurePos) return;

    const forward = Cesium.Cartesian3.subtract(
      futurePos,
      rawPos,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(forward, forward);

    // Dynamically rotate the 2D billboard contact on-screen so its nose
    // points precisely forward along the flight trajectory with zero sideways drift
    if (activeFlightEntity.billboard && viewer?.scene) {
      const carto1 = Cesium.Cartographic.fromCartesian(pos);
      const carto2 = Cesium.Cartographic.fromCartesian(futurePos);
      if (carto1 && carto2) {
        const bearingDeg = calculateBearingDeg(
          Cesium.Math.toDegrees(carto1.latitude),
          Cesium.Math.toDegrees(carto1.longitude),
          Cesium.Math.toDegrees(carto2.latitude),
          Cesium.Math.toDegrees(carto2.longitude),
        );
        const cam = viewer.scene.camera;
        const rot =
          cam?.rightWC && cam?.upWC
            ? courseScreenRotation(
                { right: cam.rightWC, up: cam.upWC },
                pos,
                bearingDeg,
                activeFlightEntity.billboard.rotation?.getValue?.(
                  currentTime,
                ) ?? 0,
              )
            : null;
        if (rot !== null && Number.isFinite(rot)) {
          activeFlightEntity.billboard.rotation = rot;
        }
      }
    }

    applyFlightCameraFollow(
      viewer,
      pos,
      forward,
      currentCameraMode,
      activeFlightData.isRotorcraft,
      cameraZoomScale,
      excludeEntities,
    );
    updateContactBracketOverlay(pos);
  }

  function bindPreRenderCameraFollow() {
    unbindPreRenderCameraFollow();
    if (viewer?.scene?.preRender?.addEventListener) {
      preRenderRemover = viewer.scene.preRender.addEventListener(() => {
        syncFlightAndCameraPose();
      });
    }
    mapStackUnsub = subscribeToMapStack(() => {
      if (isDestroyed || !activeFlightData) return;
      lastSampledFlightGroundM = null;
      last3DFlightSampleMs = -Infinity;
      syncFlightAndCameraPose();
      nudgeTilesetStreaming('flight-map-stack-switch', { force: true });
      butterGoogle3DTiles(
        viewer?.scene?.primitives,
        'flight-map-stack-switch',
        { maxMs: 2400 },
      );
      viewer?.scene?.requestRender?.();
    });
  }

  function installPointerHandler() {
    if (!viewer?.scene?.canvas || screenPointerHandler) return;
    try {
      screenPointerHandler = new Cesium.ScreenSpaceEventHandler(
        viewer.scene.canvas,
      );
      const onUserInteraction = (movement) => {
        if (cameraAuthority.shouldIgnoreCanvasPointer(movement)) {
          return;
        }
        if (activeFlightData && currentCameraMode !== 'free') {
          currentCameraMode = 'free';
          if (viewer && viewer.trackedEntity) viewer.trackedEntity = undefined;
          updateHudCameraButtons('free');
          notifyCameraModeListeners('free');
        }
      };
      screenPointerHandler.setInputAction(
        onUserInteraction,
        Cesium.ScreenSpaceEventType.LEFT_DOWN,
      );
      screenPointerHandler.setInputAction(
        onUserInteraction,
        Cesium.ScreenSpaceEventType.RIGHT_DOWN,
      );
      screenPointerHandler.setInputAction(
        onUserInteraction,
        Cesium.ScreenSpaceEventType.PINCH_START,
      );
      // Mouse wheel pulls the follow camera in/out instead of being overridden
      // by the per-frame follow loop (scroll up = closer, down = farther).
      screenPointerHandler.setInputAction((delta) => {
        const d = typeof delta === 'number' ? delta : (delta?.y ?? 0);
        if (!d) return;
        cameraZoomScale = Math.min(
          25,
          Math.max(0.3, cameraZoomScale * (d > 0 ? 0.88 : 1.14)),
        );
        viewer.scene?.requestRender?.();
      }, Cesium.ScreenSpaceEventType.WHEEL);
    } catch {}
  }

  function setCameraMode(mode = 'chase') {
    currentCameraMode = mode;
    cameraZoomScale = 1;
    cameraAuthority.beginAtomicCameraSwitch({
      mode,
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: `flight-cam-${mode}`,
      butterMaxMs: 2200,
    });
    if (!activeFlightEntity) {
      updateHudCameraButtons(mode);
      return currentCameraMode;
    }
    if (mode === 'free') {
      if (viewer && viewer.trackedEntity) viewer.trackedEntity = undefined;
      updateHudCameraButtons('free');
      return currentCameraMode;
    }
    const offsets = activeFlightData?.isRotorcraft
      ? ROTORCRAFT_CAMERA_OFFSETS
      : AIRLINER_CAMERA_OFFSETS;
    const offset = offsets[mode] || offsets.chase;
    activeFlightEntity.viewFrom = offset.clone();

    const isCockpit = mode === 'cockpit';
    const isRotor = activeFlightData?.isRotorcraft;
    const showWireframeBox =
      !isCockpit && (mode === 'chase' || mode === 'heli');

    // In cockpit mode: Pure OOB Ghost Cam! Hide all entity visuals, the glowing
    // flight-path ribbon, the [ ] contact bracket, and clear trackedEntity so
    // Cesium never draws a selection box, dot, or line ahead of the windshield.
    if (activeFlightEntity.model) {
      activeFlightEntity.model.show = !isCockpit && !isRotor;
    }
    if (activeFlightEntity.box) {
      activeFlightEntity.box.show = showWireframeBox;
    }
    if (activeFlightEntity.billboard) {
      activeFlightEntity.billboard.show = !isCockpit;
    }
    if (activeFlightEntity.path) {
      activeFlightEntity.path.show = !isCockpit;
    }
    if (flightPathEntity) {
      flightPathEntity.show = !isCockpit;
    }
    if (isCockpit) {
      hideContactBracketOverlay();
    }

    updateHudCameraButtons(mode);
    // Apply exact camera pose synchronously FIRST (never fight Cesium trackedEntity transform)
    syncFlightAndCameraPose();
    if (viewer) {
      viewer.trackedEntity = isCockpit ? undefined : activeFlightEntity;
      viewer.scene?.requestRender?.();
    }
    return currentCameraMode;
  }

  function snapBack(mode = 'chase') {
    return setCameraMode(mode);
  }

  function startTelemetryTimer() {
    stopTelemetryTimer();
    if (hudStrip) {
      hudStrip.style.display = 'flex';
      updateHudCameraButtons(currentCameraMode);
    }
    telemetryTimer = setInterval(() => {
      if (!activeFlightData || !hudStrip) {
        stopTelemetryTimer();
        return;
      }
      const telem = getActiveTelemetry();
      if (!telem) return;
      const titleEl = hudStrip.querySelector('.gev-flight-hud-title');
      const subEl = hudStrip.querySelector('.gev-flight-hud-sub');
      if (titleEl) {
        titleEl.textContent = telem.isRotorcraft
          ? '🚁 Rotorcraft Cruise'
          : '✈️ Flight Cruise';
      }
      if (subEl) {
        const warpSuffix =
          telem.simMultiplier > 1 ? ` (${telem.simMultiplier}x)` : '';
        subEl.textContent = `${telem.fromCode} ➔ ${telem.toCode} · ${telem.speedText}${warpSuffix} · ${telem.altText} · ${telem.distTraveledMi}/${telem.totalDistMi} mi (${telem.progressPct}%)`;
      }
      if (contactBracketTagEl) {
        contactBracketTagEl.textContent = `${telem.callsign} · ${telem.altText} · ${telem.speedText}`;
      }
    }, 400);
  }

  function stopTelemetryTimer() {
    if (telemetryTimer) {
      clearInterval(telemetryTimer);
      telemetryTimer = null;
    }
  }

  /**
   * Spawns a real-time synthetic flight along the great-circle arc.
   */
  async function spawnFlightRoute(fromQueryOrOptions, toQuery, options = {}) {
    if (!viewer || isDestroyed) return null;

    let fromQuery = fromQueryOrOptions;
    let toQueryClean = toQuery;
    let opts = options;
    if (
      typeof fromQueryOrOptions === 'object' &&
      fromQueryOrOptions !== null &&
      !toQuery
    ) {
      fromQuery = fromQueryOrOptions.origin || fromQueryOrOptions.from;
      toQueryClean = fromQueryOrOptions.destination || fromQueryOrOptions.to;
      opts = fromQueryOrOptions;
    }

    let fromWp = resolveWaypoint(fromQuery);
    if (!fromWp) fromWp = await resolveWaypointAsync(fromQuery, fetchImpl);
    if (!fromWp) fromWp = AIRPORT_WAYPOINTS.ATL;

    let toWp = resolveWaypoint(toQueryClean);
    if (!toWp) toWp = await resolveWaypointAsync(toQueryClean, fetchImpl);
    if (!toWp) toWp = AIRPORT_WAYPOINTS.CLT;

    isReplacingFlight = true;
    try {
      clearActiveFlight();
    } finally {
      isReplacingFlight = false;
    }

    const isRotorcraft = Boolean(
      opts.isRotorcraft ||
      opts.aircraftType === 'helicopter' ||
      opts.aircraftType === 'h145' ||
      fromWp.type?.includes('helipad') ||
      toWp.type?.includes('helipad') ||
      (fromWp.code === 'PDK' && opts.aircraftType === 'h145'),
    );

    const defaultAlt = isRotorcraft ? 305 : DEFAULT_CRUISE_ALTITUDE_METERS;
    const cruiseAlt = opts.cruiseAlt || defaultAlt;
    const totalDistM = calculateGreatCircleDistanceMeters(
      fromWp.lat,
      fromWp.lon,
      toWp.lat,
      toWp.lon,
    );

    const explicitDuration = Number(opts.durationSec);
    const durationSec =
      Number.isFinite(explicitDuration) && explicitDuration > 0
        ? explicitDuration
        : Math.max(
            60,
            Math.round(
              totalDistM /
                (isRotorcraft ? ROTORCRAFT_CRUISE_MS : AIRLINER_CRUISE_MS),
            ),
          );

    const callsign =
      opts.callsign ||
      (isRotorcraft ? 'N145FX' : `MX-${Math.floor(100 + Math.random() * 899)}`);
    const aircraftModel =
      opts.modelUri ||
      (isRotorcraft
        ? DEFAULT_ROTORCRAFT_MODEL_URI
        : DEFAULT_AIRLINER_MODEL_URI);

    const startSurfaceSample = trySampleSurfaceHeight(
      viewer,
      Cesium.Cartographic.fromDegrees(fromWp.lon, fromWp.lat),
    );
    const endSurfaceSample = trySampleSurfaceHeight(
      viewer,
      Cesium.Cartographic.fromDegrees(toWp.lon, toWp.lat),
    );
    const startBaseElev = Math.max(
      100,
      (Number.isFinite(startSurfaceSample)
        ? startSurfaceSample
        : estimateWaypointElevation(fromWp.lat, fromWp.lon, fromWp.elev)) + 35,
    );
    const endBaseElev = Math.max(
      100,
      (Number.isFinite(endSurfaceSample)
        ? endSurfaceSample
        : estimateWaypointElevation(toWp.lat, toWp.lon, toWp.elev)) + 35,
    );

    const startCartesian = Cesium.Cartesian3.fromDegrees(
      fromWp.lon,
      fromWp.lat,
      startBaseElev,
    );
    const endCartesian = Cesium.Cartesian3.fromDegrees(
      toWp.lon,
      toWp.lat,
      endBaseElev,
    );

    // Compute sample times and positions
    const startTime = Cesium.JulianDate.now();
    const stopTime = Cesium.JulianDate.addSeconds(
      startTime,
      durationSec,
      new Cesium.JulianDate(),
    );

    const positionProperty = new Cesium.SampledPositionProperty();
    activeRawFlightPositionProperty = positionProperty;
    const orientationProperty = new Cesium.SampledProperty(Cesium.Quaternion);
    const arcSamples = 60;
    const trajectoryPositions = [];
    const cartos = [];

    for (let i = 0; i <= arcSamples; i++) {
      const t = i / arcSamples;
      const pos = interpolateGreatCirclePoint(
        startCartesian,
        endCartesian,
        t,
        cruiseAlt,
      );
      const carto = Cesium.Cartographic.fromCartesian(pos);
      const sampledAtArc = trySampleSurfaceHeight(viewer, carto);
      const globeAtArc = viewer.scene?.globe?.getHeight?.(carto);
      const groundAtArc = Number.isFinite(sampledAtArc)
        ? sampledAtArc
        : globeAtArc;
      const minClearance = isRotorcraft ? 35.0 : 60.0;
      if (
        Number.isFinite(groundAtArc) &&
        carto.height < groundAtArc + minClearance
      ) {
        carto.height = groundAtArc + minClearance;
        Cesium.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          carto.height,
          Cesium.Ellipsoid.WGS84,
          pos,
        );
      }
      cartos.push({
        pos,
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
      });
      trajectoryPositions.push(pos);
    }

    for (let i = 0; i <= arcSamples; i++) {
      const t = i / arcSamples;
      const time = Cesium.JulianDate.addSeconds(
        startTime,
        t * durationSec,
        new Cesium.JulianDate(),
      );
      positionProperty.addSample(time, cartos[i].pos);

      // Compute heading using Cesium's canonical ENU Z-up frame matching upstream
      // fleet models (`MODEL_HEADING_OFFSET_DEG = 180`: glTF nose -X -> Cesium local -Y,
      // wings -> local ±X, tail fin up -> local +Z).
      const curPt = cartos[i];
      const nextPt = i < arcSamples ? cartos[i + 1] : cartos[i];
      const prevPt = i < arcSamples ? curPt : cartos[i - 1];
      const bearingDeg = calculateBearingDeg(
        prevPt.lat,
        prevPt.lon,
        nextPt.lat,
        nextPt.lon,
      );
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(bearingDeg + 180),
        0,
        0,
      );
      const orient = Cesium.Transforms.headingPitchRollQuaternion(
        curPt.pos,
        hpr,
      );
      if (orient) {
        orientationProperty.addSample(time, orient);
      }
    }

    // Set viewer clock to track the flight
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 1.0;
    viewer.clock.shouldAnimate = true;

    // Camera Framing: resolve initial mode up front so cockpit spawns 100% dot/ribbon-free
    currentCameraMode = opts.cameraMode || (opts.cockpit ? 'cockpit' : 'chase');
    cameraZoomScale = 1;
    const isCockpit = currentCameraMode === 'cockpit';
    const showWireframeBox =
      !isCockpit &&
      (currentCameraMode === 'chase' || currentCameraMode === 'heli');
    const accentHex = isRotorcraft ? '#00ffcc' : '#38bdf8';

    if (contactBracketSvgHost) {
      contactBracketSvgHost.innerHTML = buildContactBracketSvg(accentHex, 48);
    }
    if (contactBracketTagEl) {
      contactBracketTagEl.style.borderColor = isRotorcraft
        ? 'rgba(0, 255, 204, 0.5)'
        : 'rgba(56, 189, 248, 0.5)';
      contactBracketTagEl.textContent = `${callsign} · ${fromWp.code} ➔ ${toWp.code}`;
    }

    // 1. Great-Circle Flight Path Ribbon / Polyline (hidden in pure OOB cockpit view)
    flightPathEntity = viewer.entities.add({
      name: `${callsign} Flight Path: ${fromWp.code} ➔ ${toWp.code}`,
      show: !isCockpit,
      polyline: {
        positions: trajectoryPositions,
        width: 3.5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          taperPower: 0.1,
          color: Cesium.Color.fromCssColorString('#00ffcc').withAlpha(0.85),
        }),
      },
    });

    // 2. 3D Aircraft Entity / Contact Representation
    // Respects OOB `[ ]` corner-bracket contact overlay + 3D wireframe contact box
    // in Chase/Heli, crisp aircraft silhouette in Overview/Orbital, zero raw dots,
    // and pure OOB Ghost Cam (all visuals & path ribbon hidden) in Cockpit.
    const dynamicFlightPosition = new Cesium.CallbackPositionProperty(
      (time, result) => {
        const evalTime = time || viewer.clock?.currentTime;
        if (
          liveClampedFlightPos &&
          evalTime &&
          viewer.clock?.currentTime &&
          Math.abs(
            Cesium.JulianDate.secondsDifference(
              evalTime,
              viewer.clock.currentTime,
            ),
          ) < 1e-4
        ) {
          return Cesium.Cartesian3.clone(
            liveClampedFlightPos,
            result || new Cesium.Cartesian3(),
          );
        }
        const raw = positionProperty.getValue(evalTime);
        if (!raw) return undefined;
        return Cesium.Cartesian3.clone(raw, result || new Cesium.Cartesian3());
      },
      false,
    );

    const entityConfig = {
      name: `${callsign} (${fromWp.code} ➔ ${toWp.code})`,
      position: dynamicFlightPosition,
      orientation: orientationProperty,
      box: {
        // Cesium glTF Z-up convention: local X = wingspan/beam, local Y = fuselage length, local Z = height
        dimensions: isRotorcraft
          ? new Cesium.Cartesian3(11.0, 13.0, 4.0)
          : new Cesium.Cartesian3(35.6, 37.6, 10.6),
        fill: false,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(accentHex).withAlpha(0.9),
        outlineWidth: 2,
        show: showWireframeBox,
      },
      billboard: {
        image: aircraftIcon(isRotorcraft ? 'h145' : 'airliner', 192),
        width: isRotorcraft ? 48 : 34,
        height: isRotorcraft ? 48 : 34,
        color: Cesium.Color.fromCssColorString(accentHex),
        scaleByDistance: isRotorcraft
          ? new Cesium.NearFarScalar(50, 1.25, 500000, 0.7)
          : new Cesium.NearFarScalar(900, 1.2, 8000000, 0.7),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          isRotorcraft ? 0.0 : 900.0,
          Number.MAX_VALUE,
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: !isCockpit,
      },
      path: {
        resolution: 1,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.15,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
        width: 2.0,
        leadTime: 0,
        trailTime: 45,
        show: !isCockpit,
      },
      gevTrackedId: callsign,
    };

    if (!isRotorcraft || opts.modelUri) {
      entityConfig.model = {
        uri: aircraftModel,
        minimumPixelSize: 56,
        maximumScale: 60,
        runAnimations: true,
        show: !isCockpit,
      };
    }

    activeFlightEntity = viewer.entities.add(entityConfig);

    activeFlightData = {
      callsign,
      from: fromWp,
      to: toWp,
      cruiseAlt,
      durationSec,
      startTime,
      entity: activeFlightEntity,
      isRotorcraft,
      aircraftType: isRotorcraft ? 'Airbus H145 / Helicopter' : 'Airliner',
      cruiseSpeedKts: isRotorcraft
        ? ROTORCRAFT_CRUISE_KTS
        : AIRLINER_CRUISE_KTS,
    };

    const offsets = isRotorcraft
      ? ROTORCRAFT_CAMERA_OFFSETS
      : AIRLINER_CAMERA_OFFSETS;
    activeFlightEntity.viewFrom = (
      offsets[currentCameraMode] || offsets.chase
    ).clone();

    if (isCockpit) {
      hideContactBracketOverlay();
    }

    viewer.trackedEntity = isCockpit ? undefined : activeFlightEntity;

    // Immediate Frame 0 sync + frame-by-frame camera follow loop & interaction handlers
    syncFlightAndCameraPose();
    bindPreRenderCameraFollow();
    installPointerHandler();
    setSimulationMultiplier(1);

    holdContinuousRender('flight-sim');
    nudgeTilesetStreaming('flight-sim-start', { force: true });
    butterGoogle3DTiles(viewer?.scene?.primitives, 'flight-sim-start', {
      maxMs: 2600,
    });
    governorRequestRender('flight-sim-start');
    viewer.scene?.requestRender?.();
    startTelemetryTimer();
    dock?.notifySimulationStarted?.('flight', { keepIds: ['composite'] });

    // Optional Cockpit lock
    if (options.cockpit && cockpitController) {
      setTimeout(() => {
        if (!isDestroyed && activeFlightEntity) {
          cockpitController.enter?.();
        }
      }, 1000);
    }

    return activeFlightData;
  }

  function clearActiveFlight() {
    stopTelemetryTimer();
    unbindPreRenderCameraFollow();
    hideContactBracketOverlay();
    liveClampedFlightPos = null;
    lastSampledFlightGroundM = null;
    last3DFlightSampleMs = -Infinity;
    activeRawFlightPositionProperty = null;
    if (screenPointerHandler) {
      try {
        screenPointerHandler.destroy();
      } catch {}
      screenPointerHandler = null;
    }
    if (viewer?.clock) viewer.clock.multiplier = 1.0;
    if (hudStrip) hudStrip.style.display = 'none';
    releaseContinuousRender('flight-sim');
    governorRequestRender('flight-sim-end');
    if (activeFlightEntity) {
      viewer?.entities?.remove(activeFlightEntity);
      activeFlightEntity = null;
    }
    if (flightPathEntity) {
      viewer?.entities?.remove(flightPathEntity);
      flightPathEntity = null;
    }
    if (viewer && viewer.trackedEntity === activeFlightEntity) {
      viewer.trackedEntity = undefined;
    }
    activeFlightData = null;
    if (!isReplacingFlight) {
      dock?.notifySimulationStopped?.('flight');
    }
  }

  function getActiveTelemetry() {
    if (!activeFlightData || !activeFlightEntity || !viewer?.clock) return null;
    const curTime = viewer.clock.currentTime;
    const curPos = activeFlightEntity.position?.getValue?.(curTime);
    if (!curPos) return null;

    const carto = Cesium.Cartographic.fromCartesian(curPos);
    const lat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4));
    const lon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4));
    const altM = Math.round(carto.height);
    const fl = `FL${Math.round(altM / 30.48 / 10) * 10}`;

    const startTime = activeFlightData.startTime;
    const durationSec = activeFlightData.durationSec || 1;
    const elapsedSec = Math.max(
      0,
      Cesium.JulianDate.secondsDifference(curTime, startTime),
    );
    const progressFrac = Math.min(1.0, Math.max(0.0, elapsedSec / durationSec));
    const progressPct = Math.round(progressFrac * 100);

    const fromWp = activeFlightData.from;
    const toWp = activeFlightData.to;
    const totalDistM = calculateGreatCircleDistanceMeters(
      fromWp.lat,
      fromWp.lon,
      toWp.lat,
      toWp.lon,
    );
    const totalDistKm = Math.round(totalDistM / 1000);
    const distTraveledKm = Math.round(totalDistKm * progressFrac);
    const distTraveledMi = Math.round(distTraveledKm * 0.621371);
    const totalDistMi = Math.round(totalDistKm * 0.621371);
    const mult = viewer?.clock?.multiplier || 1.0;
    const baseSpeedKts = activeFlightData.isRotorcraft
      ? activeFlightData.cruiseSpeedKts || ROTORCRAFT_CRUISE_KTS
      : Math.round((totalDistM / durationSec) * 1.94384);

    return {
      mode: activeFlightData.isRotorcraft
        ? 'ROTORCRAFT SIMULATOR'
        : 'FLIGHT SIMULATOR',
      callsign: activeFlightData.callsign,
      aircraftType: activeFlightData.aircraftType || 'Airliner',
      isRotorcraft: Boolean(activeFlightData.isRotorcraft),
      fromCode: fromWp.code || fromWp.name,
      toCode: toWp.code || toWp.name,
      fromName: fromWp.name,
      toName: toWp.name,
      currentLocation: `${activeFlightData.callsign} (${fromWp.code || fromWp.name} ➔ ${toWp.code || toWp.name})`,
      nextLocation: toWp.name || toWp.code,
      speedText: `${baseSpeedKts}KTS`,
      simMultiplier: mult,
      altText: fl,
      lat,
      lon,
      altM,
      progressPct,
      distTraveledMi,
      totalDistMi,
      distTraveledKm,
      totalDistKm,
      cameraMode: currentCameraMode,
    };
  }

  // Check URL query parameters ?flightFrom=...&flightTo=...
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const flightFrom = params.get('flightFrom') || params.get('flyFrom');
      const flightTo = params.get('flightTo') || params.get('flyTo');
      const cockpit =
        params.get('cockpit') === 'true' || params.get('cockpit') === '1';

      if (flightFrom && flightTo) {
        setTimeout(() => {
          spawnFlightRoute(flightFrom, flightTo, { cockpit });
        }, 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    spawnFlightRoute,
    clearActiveFlight,
    stopFlight: clearActiveFlight,
    setCameraMode,
    snapBack,
    getCameraMode: () => currentCameraMode,
    onCameraModeChange: (cb) => {
      if (typeof cb === 'function') {
        cameraModeListeners.add(cb);
        return () => cameraModeListeners.delete(cb);
      }
      return () => {};
    },
    getCameraIntentSeq: () => cameraAuthority.getSeq(),
    getActiveFlight: () => activeFlightData,
    getActiveTelemetry,
    resolveWaypoint,
    destroy: () => {
      isDestroyed = true;
      stopTelemetryTimer();
      hideContactBracketOverlay();
      dock.unregisterOverlayGroup('flight-hud');
      if (hudStrip) hudStrip.remove();
      if (contactBracketOverlay) contactBracketOverlay.remove();
      clearActiveFlight();
    },
  };
}
