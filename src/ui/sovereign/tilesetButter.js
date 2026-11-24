/**
 * Universal Google Photorealistic 3D Tiles "Buttering" Engine.
 *
 * Ensures that after any teleport, experience launch, stop jump, or camera mode
 * switch, Cesium's `requestRenderMode` does not stall mid-octree refinement and
 * leave melted/fuzzy low-LOD tiles on screen.
 *
 * Guarantees:
 * - Safely traverses `viewer.scene.primitives` including nested `PrimitiveCollection`s.
 * - Sets `foveatedTimeDelay = 0.0` on active 3D tilesets without modifying user
 *   quality (`maximumScreenSpaceError`) settings.
 * - Holds continuous rendering (`'tileset-butter'`) until EITHER all visible 3D
 *   tilesets report `tilesLoaded === true` with zero pending/processing tiles for
 *   2 consecutive checks OR a bounded safety timeout elapses (`default: 2400ms`,
 *   hard cap `3500ms`), guaranteeing zero GPU idle hold leaks.
 * - Optional post-settle ground re-clamp callback guarded by `cameraIntentGuard`
 *   so stale teleports never override a newer user camera move.
 */

import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../../renderGovernor.js';

export const TILESET_BUTTER_HOLD = 'tileset-butter';
export const DEFAULT_BUTTER_MAX_MS = 2400;
export const MAX_BUTTER_CAP_MS = 3500;
export const DEFAULT_BUTTER_POLL_MS = 120;

let activeButterSession = null;

function isLikely3DTileset(primitive) {
  if (!primitive || typeof primitive !== 'object') return false;
  if (typeof primitive.isDestroyed === 'function' && primitive.isDestroyed()) {
    return false;
  }
  return (
    'tilesLoaded' in primitive ||
    'maximumScreenSpaceError' in primitive ||
    Boolean(primitive.tileLoadProgressEvent)
  );
}

/**
 * Safely collects all visible, non-destroyed Cesium3DTileset primitives from a
 * viewer's scene primitives, recursing into nested PrimitiveCollections.
 * Returns `[]` cleanly in stub/headless unit test environments.
 */
export function collectActive3DTilesets(viewer) {
  const result = [];
  const root = viewer?.scene?.primitives;
  if (!root || typeof root.length !== 'number') return result;

  const visited = new Set();
  const visit = (collection) => {
    if (!collection || visited.has(collection)) return;
    visited.add(collection);
    const len = typeof collection.length === 'number' ? collection.length : 0;
    for (let i = 0; i < len; i += 1) {
      let item = null;
      try {
        item =
          typeof collection.get === 'function'
            ? collection.get(i)
            : collection[i];
      } catch {
        continue;
      }
      if (!item || item.show === false) continue;
      if (isLikely3DTileset(item)) {
        result.push(item);
      } else if (
        typeof item.length === 'number' &&
        typeof item.get === 'function'
      ) {
        visit(item);
      }
    }
  };

  visit(root);
  return result;
}

/**
 * Checks whether all visible 3D tilesets report loaded with zero pending work.
 */
export function areActiveTilesetsSettled(viewer, progressState = null) {
  const tilesets = collectActive3DTilesets(viewer);
  if (tilesets.length === 0) return true;

  for (const ts of tilesets) {
    if (ts.tilesLoaded === false) return false;
    const stats = ts._statistics || ts.statistics || null;
    if (stats) {
      const pending =
        Number(stats.numberOfPendingRequests || 0) +
        Number(stats.numberOfTilesProcessing || 0);
      if (pending > 0) return false;
    }
    if (progressState && progressState.has(ts)) {
      const tracked = progressState.get(ts);
      if (tracked.pending > 0 || tracked.processing > 0) return false;
    }
  }
  return true;
}

/**
 * Cancels any in-flight buttering session and immediately releases the
 * `'tileset-butter'` continuous-render hold.
 */
export function cancelGoogle3DTilesButter() {
  if (!activeButterSession) return;
  const session = activeButterSession;
  activeButterSession = null;
  session.cancel();
}

/**
 * Holds continuous rendering until visible Google Photorealistic 3D Tiles
 * settle cleanly (2 consecutive zero-pending checks) or `maxMs` elapses.
 *
 * @param {object|null} viewer Cesium Viewer (no-op safe when null/stubbed)
 * @param {string} [reason='sovereign-butter'] Diagnostic render reason
 * @param {object} [options]
 * @param {number} [options.maxMs=2400] Bounded safety cap (ms, <=3500)
 * @param {number} [options.pollIntervalMs=120] Settle poll cadence (ms)
 * @param {Function|null} [options.onSettled] Callback invoked after settle if intent guard passes
 * @param {Function|null} [options.cameraIntentGuard] Returns false if superseded by a newer camera intent
 * @returns {{ cancel: Function, reason: string, maxMs: number }}
 */
export function butterGoogle3DTiles(
  viewer,
  reason = 'sovereign-butter',
  {
    maxMs = DEFAULT_BUTTER_MAX_MS,
    pollIntervalMs = DEFAULT_BUTTER_POLL_MS,
    onSettled = null,
    cameraIntentGuard = null,
  } = {},
) {
  cancelGoogle3DTilesButter();

  const safeMaxMs = Math.max(
    120,
    Math.min(MAX_BUTTER_CAP_MS, Number(maxMs) || DEFAULT_BUTTER_MAX_MS),
  );
  const safePollMs = Math.max(
    40,
    Math.min(300, Number(pollIntervalMs) || DEFAULT_BUTTER_POLL_MS),
  );

  const tilesets = collectActive3DTilesets(viewer);
  const progressState = new Map();
  const progressRemovers = [];

  for (const ts of tilesets) {
    // Ensure instant center-frustum refinement without altering user quality settings.
    if ('foveatedTimeDelay' in ts) {
      try {
        ts.foveatedTimeDelay = 0.0;
      } catch {
        /* read-only mock */
      }
    }
    const ev = ts.tileLoadProgressEvent;
    if (ev && typeof ev.addEventListener === 'function') {
      const handler = (pending, processing) => {
        progressState.set(ts, {
          pending: Number(pending) || 0,
          processing: Number(processing) || 0,
        });
      };
      try {
        const remove = ev.addEventListener(handler);
        progressRemovers.push(() => {
          if (typeof remove === 'function') {
            remove();
          } else if (typeof ev.removeEventListener === 'function') {
            ev.removeEventListener(handler);
          }
        });
      } catch {
        /* ignore mock event errors */
      }
    }
  }

  // If no 3D tilesets are active (2D/stub/unit test without tileset), request one
  // render frame and fire onSettled asynchronously without holding GPU idle loop.
  if (tilesets.length === 0) {
    governorRequestRender(reason);
    let cancelled = false;
    const handle = {
      reason,
      maxMs: safeMaxMs,
      cancel() {
        cancelled = true;
        clearTimeout(quickTimer);
        if (activeButterSession === handle) {
          activeButterSession = null;
        }
      },
    };
    const quickTimer = setTimeout(() => {
      if (cancelled) return;
      if (activeButterSession === handle) {
        activeButterSession = null;
      }
      if (!cameraIntentGuard || cameraIntentGuard()) {
        try {
          onSettled?.({ settledEarly: true, reason, tilesetCount: 0 });
        } catch {
          /* ignore */
        }
      }
    }, 0);
    activeButterSession = handle;
    return handle;
  }

  let finished = false;
  let consecutiveSettled = 0;
  let pollTimer = null;
  let maxTimer = null;

  const cleanup = () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    for (const remove of progressRemovers.splice(0)) {
      try {
        remove();
      } catch {
        /* ignore */
      }
    }
  };

  const finish = (settledEarly) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (activeButterSession === handle) {
      activeButterSession = null;
    }
    releaseContinuousRender(TILESET_BUTTER_HOLD);
    governorRequestRender(`${reason}-settled`);
    if (!cameraIntentGuard || cameraIntentGuard()) {
      try {
        onSettled?.({
          settledEarly,
          reason,
          tilesetCount: tilesets.length,
        });
      } catch {
        /* ignore */
      }
    }
  };

  const handle = {
    reason,
    maxMs: safeMaxMs,
    cancel() {
      if (finished) return;
      finished = true;
      cleanup();
      releaseContinuousRender(TILESET_BUTTER_HOLD);
    },
  };

  activeButterSession = handle;
  holdContinuousRender(TILESET_BUTTER_HOLD);
  governorRequestRender(reason);

  pollTimer = setInterval(() => {
    if (finished) return;
    if (areActiveTilesetsSettled(viewer, progressState)) {
      consecutiveSettled += 1;
      if (consecutiveSettled >= 2) {
        finish(true);
      }
    } else {
      consecutiveSettled = 0;
      governorRequestRender(`${reason}-refine`);
    }
  }, safePollMs);

  maxTimer = setTimeout(() => finish(false), safeMaxMs);

  return handle;
}

/** Diagnostic snapshot for QA & Chromium audits. */
export function getTilesetButterState() {
  return {
    active: Boolean(activeButterSession),
    reason: activeButterSession?.reason || null,
    maxMs: activeButterSession?.maxMs || null,
  };
}
