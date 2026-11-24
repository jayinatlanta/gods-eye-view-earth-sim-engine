/**
 * Just-In-Time Dynamic POI Billboard Synthesis Engine for God's Eye View.
 * Living World Sightseeing Engine
 *
 * Automatically synthesizes 3D photorealistic scenic billboards from Wikimedia Commons
 * when a user settles over camera-sparse destinations (e.g. Labadee Haiti, Bora Bora, Amalfi Coast).
 *
 * Features:
 * 1. 3.0s Camera Dwell Observer (moveEnd debounce / moveStart cancellation)
 * 2. CCTV Viewport Sparsity Detection (count == 0 trigger)
 * 3. 3D Terrain-Clamped Photo Plaque Materialization (Canvas texture, zero Cesium Labels)
 * 4. Click-to-Expand Context Drawer HUD Integration
 * 5. Direct AgentBridge / Slash Command & Deeplink execution (?discover=...)
 */

import * as Cesium from 'cesium';
import { createSightseeingDrawer } from './sightseeingDrawer.js';

export const DWELL_DEBOUNCE_MS = 3000;
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 220;

/**
 * Creates an elegant photorealistic plaque texture on an offscreen canvas.
 * Encapsulates the image, borders, drop-shadow, and title badge into a single
 * 2D texture, strictly avoiding new Cesium Label graphics.
 */
export function createPlaqueCanvas(billboard, imageElement) {
  if (typeof document === 'undefined') return billboard.image_url;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background rounded container
  const radius = 14;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(CANVAS_WIDTH - radius, 0);
  ctx.quadraticCurveTo(CANVAS_WIDTH, 0, CANVAS_WIDTH, radius);
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - radius);
  ctx.quadraticCurveTo(
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    CANVAS_WIDTH - radius,
    CANVAS_HEIGHT,
  );
  ctx.lineTo(radius, CANVAS_HEIGHT);
  ctx.quadraticCurveTo(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.clip();

  // Dark background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw hero image
  if (imageElement && imageElement.complete && imageElement.naturalWidth > 0) {
    ctx.drawImage(imageElement, 0, 0, CANVAS_WIDTH, 165);
  } else {
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 165);
  }

  // Gradient scrim for contrast
  const scrim = ctx.createLinearGradient(0, 110, 0, 165);
  scrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrim.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 110, CANVAS_WIDTH, 55);

  // Plaque footer / Title bar
  ctx.fillStyle = 'rgba(13, 17, 23, 0.96)';
  ctx.fillRect(0, 165, CANVAS_WIDTH, 55);

  // Accent line
  ctx.fillStyle = '#00e676';
  ctx.fillRect(0, 165, CANVAS_WIDTH, 2);

  // Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Inter", -apple-system, sans-serif';
  const displayTitle = (billboard.title || 'Scenic Discovery').slice(0, 32);
  ctx.fillText(`📍 ${displayTitle}`, 12, 192);

  // Subtitle / attribution badge
  ctx.fillStyle = '#8b949e';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('DISCOVERED SIGHTSEEING · WIKIMEDIA', 14, 209);

  ctx.restore();

  // Outer border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas;
}

export function createSightseeingEngine({
  viewer,
  dataManager = null,
  operations = null,
  fetchImpl = globalThis.fetch,
  container = typeof document !== 'undefined' ? document.body : null,
  isAmbientDwellSuppressed = null,
} = {}) {
  if (!viewer)
    throw new TypeError('Cesium viewer is required for SightseeingEngine');

  const drawer = createSightseeingDrawer({ container });
  const spawnedEntities = new Map();
  let dwellTimer = null;
  let isDestroyed = false;
  let lastDiscoveredQuery = null;

  // 1. Camera Dwell Observer & Motion Settlement
  function clearDwellTimer() {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }

  async function onCameraMoveEnd() {
    if (isDestroyed) return;
    clearDwellTimer();

    dwellTimer = setTimeout(async () => {
      dwellTimer = null;
      await evaluateDwellSettle();
    }, DWELL_DEBOUNCE_MS);
  }

  function onCameraMoveStart() {
    clearDwellTimer();
  }

  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(onCameraMoveEnd);
  const removeMoveStart =
    viewer.camera.moveStart.addEventListener(onCameraMoveStart);

  // 2. Camera Sparsity & Spatial Audit
  function isCctvSparse(targetLat, targetLon) {
    if (!dataManager) return true;
    const cctv = dataManager.layers?.get('cctv')?.module;
    if (!cctv) return true;
    const uiState = cctv.getUIState?.() || {};
    if (!uiState.enabled) return true;
    const cameras = Array.isArray(uiState.cameras) ? uiState.cameras : [];
    if (!cameras.length) return true;
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) {
      return cameras.length <= 1;
    }
    // Check if any active cameras are within 25 km of the target location
    let nearby = 0;
    for (const cam of cameras) {
      const cLat = Number(cam.lat);
      const cLon = Number(cam.lon);
      if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) continue;
      if (Math.abs(cLat - targetLat) > 0.3 || Math.abs(cLon - targetLon) > 0.3)
        continue;
      const dLat = ((cLat - targetLat) * Math.PI) / 180;
      const dLon = ((cLon - targetLon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((targetLat * Math.PI) / 180) *
          Math.cos((cLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distKm <= 25) {
        nearby++;
        if (nearby > 1) return false;
      }
    }
    return nearby <= 1;
  }

  async function evaluateDwellSettle() {
    if (isDestroyed) return;
    if (
      typeof isAmbientDwellSuppressed === 'function' &&
      isAmbientDwellSuppressed()
    ) {
      return;
    }

    // Pick camera center target on globe
    const canvas = viewer.canvas;
    if (!canvas) return;

    const center = new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );
    let cartesian = null;
    try {
      cartesian = viewer.scene?.globe?.pick(
        viewer.camera.getPickRay(center),
        viewer.scene,
      );
    } catch {
      /* ignore */
    }

    if (!cartesian) {
      try {
        cartesian = viewer.camera.pickEllipsoid(center);
      } catch {
        /* ignore */
      }
    }

    if (!cartesian) return;

    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);

    // Check CCTV count: only synthesize if CCTV is sparse near settled target (count <= 1)
    if (!isCctvSparse(lat, lon)) return;

    // Resolve reverse geocode place name
    let placeName = null;
    try {
      const geoRes = await fetchImpl(
        `/api/geocode?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`,
      );
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        placeName = geoData?.name || geoData?.city || geoData?.display_name;
      }
    } catch {
      /* fallback */
    }

    if (!placeName && operations?.lastSearchQuery) {
      placeName = operations.lastSearchQuery;
    }

    if (placeName && placeName !== lastDiscoveredQuery) {
      await discoverAndSpawn(placeName, { lat, lon, flyTo: false });
    }
  }

  // 3. Spawning 3D Billboard Plaque
  function spawnBillboard(billboard) {
    if (!billboard || !billboard.id || spawnedEntities.has(billboard.id))
      return;

    const lat = Number(billboard.lat);
    const lon = Number(billboard.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // Initial placeholder canvas while image loads
    const initialCanvas = createPlaqueCanvas(billboard, null);

    const entity = viewer.entities.add({
      id: billboard.id,
      name: billboard.title,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
      billboard: {
        image: initialCanvas,
        width: CANVAS_WIDTH / 2,
        height: CANVAS_HEIGHT / 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 60000, 0.4),
        translucencyByDistance: new Cesium.NearFarScalar(500, 1.0, 120000, 0.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      description: billboard.summary,
    });

    entity._sightseeingData = billboard;
    spawnedEntities.set(billboard.id, entity);

    // Asynchronously load image and redraw texture
    if (typeof Image !== 'undefined' && billboard.image_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!isDestroyed && entity.billboard) {
          const loadedCanvas = createPlaqueCanvas(billboard, img);
          entity.billboard.image = loadedCanvas;
        }
      };
      img.src = billboard.image_url;
    }
  }

  // 4. Discovery Query & Billboard Materialization
  async function discoverAndSpawn(
    query,
    { lat = null, lon = null, flyTo = false } = {},
  ) {
    if (!query) return { ok: false, error: 'Query required' };
    lastDiscoveredQuery = query;

    let url = `/api/discovery/sightseeing?query=${encodeURIComponent(query)}&limit=2`;
    if (lat !== null && lon !== null) {
      url += `&lat=${lat}&lon=${lon}`;
    }

    try {
      const res = await fetchImpl(url);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.billboards)) return data;

      for (const bb of data.billboards) {
        spawnBillboard(bb);
      }

      if (flyTo && data.billboards.length > 0) {
        const first = data.billboards[0];
        if (Number.isFinite(first.lat) && Number.isFinite(first.lon)) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              first.lon,
              first.lat,
              2500,
            ),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-28),
              roll: 0,
            },
            duration: 2.0,
          });
        }
      }

      return data;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // 5. Click Handler on 3D Entities
  let handler = null;
  if (typeof document !== 'undefined' && viewer.scene?.canvas) {
    try {
      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click) => {
        const pickedObject = viewer.scene.pick(click.position);
        const pickedEntity = pickedObject?.id;
        if (pickedEntity?._sightseeingData) {
          drawer.show(pickedEntity._sightseeingData);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      /* ignore in mock environments */
    }
  }

  function clearBillboards() {
    for (const [id, entity] of spawnedEntities.entries()) {
      viewer.entities.remove(entity);
    }
    spawnedEntities.clear();
  }

  // Check URL deeplink ?discover=... on start
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const discoverQuery = params.get('discover');
      if (discoverQuery) {
        setTimeout(() => {
          discoverAndSpawn(discoverQuery, { flyTo: true });
        }, 1200);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    discoverAndSpawn,
    clearBillboards,
    getBillboards: () =>
      Array.from(spawnedEntities.values()).map((e) => e._sightseeingData),
    getDrawer: () => drawer,
    evaluateDwellSettle,
    destroy: () => {
      isDestroyed = true;
      clearDwellTimer();
      removeMoveEnd();
      removeMoveStart();
      handler?.destroy();
      clearBillboards();
      drawer.destroy();
    },
  };
}
