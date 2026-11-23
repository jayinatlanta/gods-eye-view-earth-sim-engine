/**
 * Living World Tour v2 Ambient Wikimedia Photo Billboards (`tour-poi`).
 *
 * Uses the zero-allocation WebGL/2D worldOverlay thumbnail lane + greedy screen-space
 * decluttering from cctvCards.js to surface crisp POI cards along any Tour v2 route
 * (Magic Kingdom, EPCOT World Showcase, classic city tours, custom tours).
 * Zero Cesium.Label APIs are ever touched.
 */

import * as Cesium from 'cesium';
import {
  setOverlayEntries,
  clearOverlaySource,
  hitTestWorldOverlay,
} from '../../overlays/worldOverlay.js';
import {
  createFrameSlot,
  applyFrameResult,
  cardFetchPolicy,
  cardScaleForAltitude,
  declutterCctvCards,
  createCctvThumbnailOverlayEntry,
  CCTV_FRAME_CANVAS_W,
  CCTV_FRAME_CANVAS_H,
} from '../../data/cctvCards.js';
import { getCompanionPersonaName } from './companionDot.js';

export const TOUR_POI_OVERLAY_SOURCE_ID = 'tour-poi';
export const TOUR_POI_MAX_VISIBLE_CARDS = 12;
export const TOUR_POI_MIN_SEPARATION_PX = 112;
export const TOUR_POI_PUMP_INTERVAL_MS = 260;

export const TOUR_POI_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: TOUR_POI_MAX_VISIBLE_CARDS,
  collisionCapacity: TOUR_POI_MAX_VISIBLE_CARDS,
  moving: true,
  solveIntervalMs: 125,
});

export function paintStopPlaceholderCanvas(stop, cityName = '') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Number.isFinite(CCTV_FRAME_CANVAS_W)
    ? CCTV_FRAME_CANVAS_W
    : 192;
  canvas.height = Number.isFinite(CCTV_FRAME_CANVAS_H)
    ? CCTV_FRAME_CANVAS_H
    : 108;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.55, '#1e1b4b');
  grad.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle =
    stop?.showcaseZone === 'world_showcase' ? '#f472b6' : '#38bdf8';
  ctx.fillRect(0, 0, w, 4);

  const iconText = String(stop?.icon || '📍').slice(0, 4);
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(iconText, w / 2, Math.round(h * 0.36));

  const title = String(stop?.name || 'Landmark').slice(0, 24);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(title, w / 2, Math.round(h * 0.66));

  const sub = String(stop?.land || stop?.category || cityName || '').slice(
    0,
    28,
  );
  if (sub) {
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(sub, w / 2, Math.round(h * 0.84));
  }

  return canvas;
}

export function renderThumbnailToFrameCanvas(img) {
  if (typeof document === 'undefined' || !img) return null;
  const iw = img.naturalWidth || img.width || 0;
  const ih = img.naturalHeight || img.height || 0;
  if (iw <= 0 || ih <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Number.isFinite(CCTV_FRAME_CANVAS_W)
    ? CCTV_FRAME_CANVAS_W
    : 192;
  canvas.height = Number.isFinite(CCTV_FRAME_CANVAS_H)
    ? CCTV_FRAME_CANVAS_H
    : 108;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.max(w / iw, h / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const dx = (w - drawW) / 2;
  const dy = (h - drawH) / 2;
  try {
    ctx.drawImage(img, dx, dy, drawW, drawH);
    return canvas;
  } catch {
    return null;
  }
}

export function createTourPoiCards({
  viewer = null,
  tourAndPlayEngine = null,
  sightseeingDrawer = null,
  fetchImpl = null,
  overlayApi = null,
  nowMs = () => Date.now(),
} = {}) {
  const overlay = overlayApi || {
    setOverlayEntries,
    clearOverlaySource,
    hitTestWorldOverlay,
  };

  const slotsById = new Map();
  const mediaById = new Map();
  const inFlightIds = new Set();
  const stopsById = new Map();
  let pendingQueue = [];
  let lastLaunchMs = 0;
  let pumpTimer = null;
  let cameraSyncTimer = null;
  let isDestroyed = false;
  let lastCityKey = '';

  function clearTimers() {
    if (pumpTimer) {
      clearTimeout(pumpTimer);
      pumpTimer = null;
    }
    if (cameraSyncTimer) {
      clearTimeout(cameraSyncTimer);
      cameraSyncTimer = null;
    }
  }

  function ensureFrameSlot(stop, cityName) {
    let slot = slotsById.get(stop.id);
    if (!slot) {
      slot = createFrameSlot();
      const placeholder = paintStopPlaceholderCanvas(stop, cityName);
      if (placeholder) {
        Object.assign(
          slot,
          applyFrameResult(slot, { ok: true, frame: placeholder }, nowMs()),
        );
      } else {
        slot.stamp = 1;
      }
      slotsById.set(stop.id, slot);
    }
    return slot;
  }

  function decodeAndApplyThumbnail(stop, thumbnailUrl) {
    if (!thumbnailUrl || typeof Image !== 'function') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isDestroyed) return;
      const canvas = renderThumbnailToFrameCanvas(img);
      const slot = slotsById.get(stop.id);
      if (canvas && slot) {
        Object.assign(
          slot,
          applyFrameResult(slot, { ok: true, frame: canvas }, nowMs()),
        );
        sync();
        viewer?.scene?.requestRender?.();
      }
    };
    img.onerror = () => {
      // Keep themed canvas placeholder silently
    };
    img.src = thumbnailUrl;
  }

  async function fetchStopMedia(stop, { userGesture = false } = {}) {
    if (!stop?.id || isDestroyed) return null;
    if (mediaById.has(stop.id)) return mediaById.get(stop.id);
    if (inFlightIds.has(stop.id)) return null;

    const effectiveFetch = fetchImpl || globalThis.fetch;
    if (typeof effectiveFetch !== 'function') {
      const fallback = {
        thumbnailUrl: '',
        originalUrl: '',
        extract: stop.lore || '',
        title: stop.name,
        url: stop.wikiTitle
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(stop.wikiTitle)}`
          : '',
      };
      mediaById.set(stop.id, fallback);
      return fallback;
    }

    inFlightIds.add(stop.id);
    if (!userGesture) {
      lastLaunchMs = nowMs();
    }
    try {
      const params = new URLSearchParams();
      if (stop.wikiTitle) params.set('title', stop.wikiTitle);
      params.set('query', stop.name || stop.wikiTitle || 'landmark');
      if (Number.isFinite(stop.lat)) params.set('lat', String(stop.lat));
      if (Number.isFinite(stop.lon)) params.set('lon', String(stop.lon));
      params.set('limit', '1');
      const res = await effectiveFetch(
        `/api/discovery/sightseeing?${params.toString()}`,
      );
      if (!res?.ok) throw new Error(`HTTP ${res?.status || 'error'}`);
      const json = await res.json();
      const top = Array.isArray(json?.billboards) ? json.billboards[0] : null;
      const record = {
        thumbnailUrl: String(top?.image_url || top?.thumbnailUrl || ''),
        originalUrl: String(top?.original_url || top?.originalUrl || ''),
        extract: String(top?.summary || top?.extract || stop.lore || ''),
        title: String(top?.title || stop.name || ''),
        url: String(
          top?.url ||
            (stop.wikiTitle
              ? `https://en.wikipedia.org/wiki/${encodeURIComponent(stop.wikiTitle)}`
              : ''),
        ),
      };
      mediaById.set(stop.id, record);
      if (record.thumbnailUrl) {
        decodeAndApplyThumbnail(stop, record.thumbnailUrl);
      }
      return record;
    } catch {
      const fallback = {
        thumbnailUrl: '',
        originalUrl: '',
        extract: stop.lore || '',
        title: stop.name,
        url: stop.wikiTitle
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(stop.wikiTitle)}`
          : '',
      };
      mediaById.set(stop.id, fallback);
      return fallback;
    } finally {
      inFlightIds.delete(stop.id);
      if (!isDestroyed && pendingQueue.length > 0 && !pumpTimer) {
        pumpTimer = setTimeout(() => {
          pumpTimer = null;
          pumpFetchQueue();
        }, TOUR_POI_PUMP_INTERVAL_MS);
      }
    }
  }

  function pumpFetchQueue() {
    if (isDestroyed || pendingQueue.length === 0) return;
    while (pendingQueue.length > 0) {
      const nextStop = pendingQueue[0];
      if (
        !nextStop?.id ||
        mediaById.has(nextStop.id) ||
        inFlightIds.has(nextStop.id)
      ) {
        pendingQueue.shift();
        continue;
      }
      const decision = cardFetchPolicy({
        coldFill: true,
        inFlight: inFlightIds.size,
        sinceLastLaunchMs: Math.max(0, nowMs() - lastLaunchMs),
      });
      if (!decision.launch) {
        if (!pumpTimer) {
          pumpTimer = setTimeout(() => {
            pumpTimer = null;
            pumpFetchQueue();
          }, TOUR_POI_PUMP_INTERVAL_MS);
        }
        return;
      }
      pendingQueue.shift();
      fetchStopMedia(nextStop).catch(() => {});
    }
  }

  function enqueueStopFetches(stops) {
    pendingQueue = stops.filter(
      (stop) =>
        stop?.id && !mediaById.has(stop.id) && !inFlightIds.has(stop.id),
    );
    pumpFetchQueue();
  }

  function projectStopToScreen(stop, index) {
    const position = Cesium.Cartesian3.fromDegrees(
      Number(stop.lon) || 0,
      Number(stop.lat) || 0,
      (Number(stop.elev) || 32) + 18,
    );
    let sx = 120 + (index % 5) * 160;
    let sy = 180 + Math.floor(index / 5) * 120;
    let inFrustum = true;

    const scene = viewer?.scene;
    if (
      scene &&
      typeof Cesium.SceneTransforms?.worldToWindowCoordinates === 'function'
    ) {
      try {
        const win = Cesium.SceneTransforms.worldToWindowCoordinates(
          scene,
          position,
        );
        if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
          inFrustum = false;
        } else {
          sx = win.x;
          sy = win.y;
          const w = Number(
            scene.canvas?.clientWidth || scene.canvas?.width || 1280,
          );
          const h = Number(
            scene.canvas?.clientHeight || scene.canvas?.height || 720,
          );
          if (sx < -160 || sx > w + 160 || sy < -140 || sy > h + 140) {
            inFrustum = false;
          }
        }
      } catch {
        // Fallback screen grid for mock scenes
      }
    }
    return { position, sx, sy, inFrustum };
  }

  function buildExperiencePayload(stop, status, media) {
    const waitMin = Number.isFinite(stop.estimatedWaitMin)
      ? stop.estimatedWaitMin
      : Number.isFinite(stop.waitTimeMin)
        ? stop.waitTimeMin
        : null;
    const snack = stop.snackNote || stop.snackTag || null;
    const zone = stop.showcaseZone || stop.dayChapter || null;
    return {
      isTourStop: true,
      cityId: status?.cityId || '',
      cityName: status?.cityName || '',
      tourScope: status?.tourScope || 'city',
      stopId: stop.id,
      name: stop.name,
      title: stop.name,
      icon: stop.icon || '📍',
      lat: stop.lat,
      lon: stop.lon,
      category: stop.category || 'Tour Landmark',
      land: stop.land || null,
      estimatedWaitMin: waitMin,
      waitTimeMin: waitMin,
      snackNote: snack,
      snackTag: snack,
      showcaseZone: zone,
      dayChapter: zone,
      lore: stop.lore || '',
      companionNote: stop.companionNote || '',
      companionName: getCompanionPersonaName(),
      wikiTitle: stop.wikiTitle || stop.name,
      youtubeVideoId: stop.youtubeVideoId || null,
      youtubeSearchQuery: stop.youtubeSearchQuery || `${stop.name} 4K tour`,
      thumbnailUrl: media?.thumbnailUrl || '',
      originalUrl: media?.originalUrl || '',
      extract: media?.extract || stop.lore || '',
      url:
        media?.url ||
        (stop.wikiTitle
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(stop.wikiTitle)}`
          : ''),
      onClose: () => {
        tourAndPlayEngine?.resumeFromMedia?.();
      },
    };
  }

  async function openExperienceCard(stopOrId) {
    if (isDestroyed) return { ok: false, reason: 'destroyed' };
    const status = tourAndPlayEngine?.getStatus?.();
    let stop = null;
    if (stopOrId && typeof stopOrId === 'object') {
      stop = stopOrId;
    } else if (typeof stopOrId === 'string' && stopOrId.trim()) {
      stop =
        stopsById.get(stopOrId) ||
        status?.landmarks?.find((l) => l.id === stopOrId) ||
        null;
    } else {
      stop = status?.currentLandmark || null;
    }
    if (!stop) return { ok: false, reason: 'no_stop' };

    tourAndPlayEngine?.pauseForMedia?.();

    const cachedMedia = mediaById.get(stop.id) || null;
    const payload = buildExperiencePayload(stop, status, cachedMedia);
    sightseeingDrawer?.show?.(payload);

    if (!cachedMedia) {
      fetchStopMedia(stop, { userGesture: true })
        .then((freshMedia) => {
          if (!isDestroyed && freshMedia && sightseeingDrawer?.isVisible?.()) {
            sightseeingDrawer?.show?.(
              buildExperiencePayload(
                stop,
                tourAndPlayEngine?.getStatus?.() || status,
                freshMedia,
              ),
            );
          }
        })
        .catch(() => {});
    }
    return { ok: true, stopId: stop.id };
  }

  function sync() {
    if (isDestroyed) return;
    const status = tourAndPlayEngine?.getStatus?.();
    if (
      !status?.isTour ||
      !Array.isArray(status.landmarks) ||
      status.landmarks.length === 0
    ) {
      stopsById.clear();
      pendingQueue = [];
      clearTimers();
      overlay.clearOverlaySource?.(TOUR_POI_OVERLAY_SOURCE_ID);
      return;
    }

    const tourKey = `${status.cityId || ''}:${status.tourMode || 'all'}:${status.landmarks.length}`;
    if (tourKey !== lastCityKey) {
      lastCityKey = tourKey;
      inFlightIds.clear();
      pendingQueue = [];
      lastLaunchMs = 0;
      if (pumpTimer) {
        clearTimeout(pumpTimer);
        pumpTimer = null;
      }
    }

    const currentId = status.currentLandmark?.id || null;
    const cameraHeightM = Number(viewer?.camera?.positionCartographic?.height);
    const { alpha: altAlpha } = cardScaleForAltitude(
      Number.isFinite(cameraHeightM) ? cameraHeightM : 180,
    );

    const candidates = [];
    const projectedById = new Map();
    stopsById.clear();

    status.landmarks.forEach((stop, index) => {
      if (
        !stop?.id ||
        !Number.isFinite(stop.lat) ||
        !Number.isFinite(stop.lon)
      ) {
        return;
      }
      stopsById.set(stop.id, stop);
      const proj = projectStopToScreen(stop, index);
      projectedById.set(stop.id, proj);
      if (proj.inFrustum || stop.id === currentId) {
        candidates.push({
          id: stop.id,
          sx: proj.sx,
          sy: proj.sy,
          distanceKm: stop.id === currentId ? 0 : index + 1,
          stop,
        });
      }
    });

    // If sync() ran synchronously on tour launch before the first WebGL frame at the new
    // destination updated scene.frameState, include nearby tour stops with synthetic grid
    // coordinates so worldOverlay projects all 3D Cartesian3 anchors on the very next frame.
    if (candidates.length < Math.min(4, stopsById.size)) {
      const existingIds = new Set(candidates.map((c) => c.id));
      let fallbackIdx = candidates.length;
      for (const [id, stop] of stopsById.entries()) {
        if (existingIds.has(id)) continue;
        candidates.push({
          id,
          sx: 120 + (fallbackIdx % 5) * 180,
          sy: 180 + Math.floor(fallbackIdx / 5) * 140,
          distanceKm: fallbackIdx + 1,
          stop,
        });
        fallbackIdx += 1;
      }
      scheduleCameraSync();
    }

    const declutteredIds = declutterCctvCards(candidates, {
      minSepPx: TOUR_POI_MIN_SEPARATION_PX,
      limit: TOUR_POI_MAX_VISIBLE_CARDS,
    });
    const visibleStops = [];
    for (const id of declutteredIds) {
      const stop = stopsById.get(id);
      if (stop) visibleStops.push(stop);
    }

    const entries = visibleStops.map((stop, rank) => {
      const proj = projectedById.get(stop.id);
      const slot = ensureFrameSlot(stop, status.cityName);
      const isCurrent = stop.id === currentId;
      const base = createCctvThumbnailOverlayEntry({
        id: stop.id,
        position: proj.position,
        gapPx: 14,
        title: `${stop.icon || '📍'} ${stop.name}`,
        frameSlot: slot,
        rank,
        pinned: isCurrent,
        active: isCurrent,
      });
      return {
        ...base,
        requireImage: false,
        selected: isCurrent,
        stopId: stop.id,
        accessibilityLabel: stop.name,
        activate: () => openExperienceCard(stop.id),
        thumbnailLeaderColor: isCurrent ? '#f472b6' : '#38bdf8',
        thumbnailRuleColor: isCurrent ? '#f472b6' : '#38bdf8',
        opacity: altAlpha,
      };
    });

    overlay.setOverlayEntries?.(
      TOUR_POI_OVERLAY_SOURCE_ID,
      entries,
      TOUR_POI_OVERLAY_SOURCE_OPTIONS,
    );
    viewer?.scene?.requestRender?.();
    const visibleIdSet = new Set(declutteredIds);
    const fetchOrder = [
      ...visibleStops,
      ...status.landmarks.filter((s) => s?.id && !visibleIdSet.has(s.id)),
    ];
    enqueueStopFetches(fetchOrder);
  }

  function scheduleCameraSync() {
    if (isDestroyed || cameraSyncTimer) return;
    cameraSyncTimer = setTimeout(() => {
      cameraSyncTimer = null;
      sync();
    }, 180);
    cameraSyncTimer?.unref?.();
  }

  let statusUnsub = null;
  if (typeof tourAndPlayEngine?.onStatusChange === 'function') {
    statusUnsub = tourAndPlayEngine.onStatusChange(() => {
      sync();
    });
  }

  let cameraRemoveListener = null;
  if (typeof viewer?.camera?.moveEnd?.addEventListener === 'function') {
    try {
      cameraRemoveListener = viewer.camera.moveEnd.addEventListener(() => {
        scheduleCameraSync();
      });
    } catch {}
  }

  let clickHandler = null;
  if (
    viewer?.scene?.canvas &&
    typeof Cesium.ScreenSpaceEventHandler === 'function'
  ) {
    try {
      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((movement) => {
        if (isDestroyed || !movement?.position) return;
        const hit = overlay.hitTestWorldOverlay?.(
          movement.position.x,
          movement.position.y,
          { sourceId: TOUR_POI_OVERLAY_SOURCE_ID },
        );
        if (hit?.entryId) {
          openExperienceCard(hit.entryId);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {
      clickHandler = null;
    }
  }

  function handleOverlayClick(x, y) {
    const hit = overlay.hitTestWorldOverlay?.(x, y, {
      sourceId: TOUR_POI_OVERLAY_SOURCE_ID,
    });
    if (hit?.entryId) {
      openExperienceCard(hit.entryId);
      return true;
    }
    return false;
  }

  function getMediaCache() {
    return new Map(mediaById);
  }

  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;
    clearTimers();
    try {
      statusUnsub?.();
    } catch {}
    try {
      cameraRemoveListener?.();
    } catch {}
    try {
      if (clickHandler && !clickHandler.isDestroyed?.()) {
        clickHandler.destroy?.();
      }
    } catch {}
    stopsById.clear();
    slotsById.clear();
    mediaById.clear();
    inFlightIds.clear();
    pendingQueue = [];
    overlay.clearOverlaySource?.(TOUR_POI_OVERLAY_SOURCE_ID);
  }

  // Initial sync if a tour is already active when instantiated
  sync();

  return {
    sync,
    openExperienceCard,
    handleOverlayClick,
    fetchStopMedia,
    getMediaCache,
    destroy,
  };
}
