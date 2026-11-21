/**
 * Idle render governor — the wave-2 flagship of the 2026-08-05 perf
 * investigation.
 *
 * The problem: Cesium's default render loop repaints every vsync forever, so
 * the app burned ~60% GPU + ~54% of a core with ZERO layers enabled and a
 * parked camera. The fix: flip the scene into Cesium's `requestRenderMode`
 * whenever nothing animates per frame, and return to the continuous loop the
 * moment something does.
 *
 * Architecture — a binary mode driven by ref-counted holds:
 *
 * - **Continuous mode** (`requestRenderMode = false`, today's behavior)
 *   while ANY hold is registered. Every per-frame animator — fleet
 *   interpolation, traffic sim, satellite motion, tracked-entity follow,
 *   style crossfades, CCTV projection — registers a hold for exactly the
 *   lifetime of its scene-loop listener or animation. While one is active,
 *   behavior is byte-identical to pre-governor main: the locked
 *   interpolation/tracking invariants are preserved by construction.
 * - **Idle mode** (`requestRenderMode = true`) when zero holds. Cesium
 *   auto-renders on camera input and tile loads; every other scene mutation
 *   must call `governorRequestRender()` for its one frame. Discrete
 *   mutators (layer poll ticks, slider writes, annotation changes) route
 *   through that.
 *
 * Holds are identity-keyed (a Set of owner ids), NOT a counter — a module
 * that double-holds or double-releases cannot corrupt the mode. Owners are
 * short stable strings ('flights', 'traffic', 'style-anim', …) so the
 * diagnostics read like a story.
 *
 * The governor is O(1) passive: no per-frame work of its own, ever.
 */

let _viewer = null;
let _installed = false;
const _holds = new Set();

/** Debug trail of the most recent one-shot render requests (idle mode only). */
const _recentRequests = [];
const RECENT_REQUEST_CAP = 16;

const TILESET_STREAMING_HOLD = 'tileset-streaming';
const TILESET_SETTLE_HOLD = 'tileset-settle';
const TILESET_STREAM_MAX_MS = 4500;
const TILESET_SETTLE_MS = 350;

let _tilesetSubscriptions = new Map();
let _sceneRemovers = [];
let _streamingWatchdog = null;
let _settleTimer = null;
let _postIdleTimer = null;

function clearPumpTimers() {
  if (_streamingWatchdog) {
    clearTimeout(_streamingWatchdog);
    _streamingWatchdog = null;
  }
  if (_settleTimer) {
    clearTimeout(_settleTimer);
    _settleTimer = null;
  }
  if (_postIdleTimer) {
    clearTimeout(_postIdleTimer);
    _postIdleTimer = null;
  }
}

function detachAllTilesetSubscriptions() {
  clearPumpTimers();
  for (const unsub of _tilesetSubscriptions.values()) {
    unsub();
  }
  _tilesetSubscriptions.clear();
  for (const remove of _sceneRemovers.splice(0)) {
    remove();
  }
}

function hasVisibleUnloadedTileset(viewer) {
  const primitives = viewer?.scene?.primitives;
  if (!primitives || typeof primitives.length !== 'number') return false;
  for (let i = 0; i < primitives.length; i++) {
    const p = primitives.get?.(i);
    if (
      p &&
      p.show !== false &&
      (p.loadProgress || p.tileLoad || p.allTilesLoaded) &&
      p.tilesLoaded !== true
    ) {
      return true;
    }
  }
  return false;
}

function bumpTilesetSettle(reason = 'tileset-settle') {
  if (!_installed || !_viewer?.scene) return;
  if (_settleTimer) clearTimeout(_settleTimer);
  holdContinuousRender(TILESET_SETTLE_HOLD);
  governorRequestRender(reason);
  _settleTimer = setTimeout(() => {
    _settleTimer = null;
    releaseContinuousRender(TILESET_SETTLE_HOLD);
    governorRequestRender(`${reason}-done`);
  }, TILESET_SETTLE_MS);
}

function attachTilesetPump(primitive) {
  if (!primitive || _tilesetSubscriptions.has(primitive)) return;
  const hasEvents =
    typeof primitive.loadProgress?.addEventListener === 'function' ||
    typeof primitive.tileLoad?.addEventListener === 'function' ||
    typeof primitive.allTilesLoaded?.addEventListener === 'function';
  if (!hasEvents) return;

  // Ensure live Google 3D / 3D Tiles primitives refine promptly during street-level motion
  // instead of waiting on foveation delays or aggressively culling moving-camera requests.
  if ('foveatedTimeDelay' in primitive) {
    primitive.foveatedTimeDelay = 0.0;
  }
  if (
    typeof primitive.cullRequestsWhileMovingMultiplier === 'number' &&
    primitive.cullRequestsWhileMovingMultiplier > 18.0
  ) {
    primitive.cullRequestsWhileMovingMultiplier = 18.0;
  }

  const removers = [];
  if (typeof primitive.loadProgress?.addEventListener === 'function') {
    const off = primitive.loadProgress.addEventListener(
      (pending = 0, processing = 0) => {
        if (!_installed) return;
        if (primitive.show === false) {
          releaseContinuousRender(TILESET_STREAMING_HOLD);
          return;
        }
        if (pending > 0 || processing > 0) {
          if (_postIdleTimer) {
            clearTimeout(_postIdleTimer);
            _postIdleTimer = null;
          }
          if (_streamingWatchdog) clearTimeout(_streamingWatchdog);
          holdContinuousRender(TILESET_STREAMING_HOLD);
          // Bounded safety release so an unreachable/stalled tile server never pins GPU forever.
          _streamingWatchdog = setTimeout(() => {
            _streamingWatchdog = null;
            releaseContinuousRender(TILESET_STREAMING_HOLD);
            governorRequestRender('tileset-watchdog');
          }, TILESET_STREAM_MAX_MS);
        } else {
          if (_streamingWatchdog) {
            clearTimeout(_streamingWatchdog);
            _streamingWatchdog = null;
          }
          releaseContinuousRender(TILESET_STREAMING_HOLD);
          governorRequestRender('tileset-idle');
          // Async Model/glTF image decoding can settle one tick after counts drop to 0;
          // request one bounded follow-up render if the tileset isn't allTilesLoaded yet.
          if (primitive.tilesLoaded === false && !_postIdleTimer) {
            _postIdleTimer = setTimeout(() => {
              _postIdleTimer = null;
              governorRequestRender('tileset-post-idle');
            }, 120);
          }
        }
      },
    );
    if (typeof off === 'function') removers.push(off);
  }
  if (typeof primitive.tileLoad?.addEventListener === 'function') {
    const off = primitive.tileLoad.addEventListener(() => {
      if (!_installed || primitive.show === false) return;
      governorRequestRender('tileset-tile-load');
    });
    if (typeof off === 'function') removers.push(off);
  }
  if (typeof primitive.allTilesLoaded?.addEventListener === 'function') {
    const off = primitive.allTilesLoaded.addEventListener(() => {
      if (!_installed) return;
      if (_streamingWatchdog) {
        clearTimeout(_streamingWatchdog);
        _streamingWatchdog = null;
      }
      if (_postIdleTimer) {
        clearTimeout(_postIdleTimer);
        _postIdleTimer = null;
      }
      if (_settleTimer) {
        clearTimeout(_settleTimer);
        _settleTimer = null;
      }
      releaseContinuousRender(TILESET_SETTLE_HOLD);
      releaseContinuousRender(TILESET_STREAMING_HOLD);
      governorRequestRender('tileset-all-loaded');
    });
    if (typeof off === 'function') removers.push(off);
  }

  _tilesetSubscriptions.set(primitive, () => {
    for (const r of removers) r();
  });
}

function installSceneTilesetMonitor(viewer) {
  detachAllTilesetSubscriptions();
  const primitives = viewer?.scene?.primitives;
  if (primitives) {
    if (
      typeof primitives.length === 'number' &&
      typeof primitives.get === 'function'
    ) {
      for (let i = 0; i < primitives.length; i++) {
        attachTilesetPump(primitives.get(i));
      }
    }
    if (typeof primitives.primitiveAdded?.addEventListener === 'function') {
      const offAdd = primitives.primitiveAdded.addEventListener((primitive) => {
        attachTilesetPump(primitive);
        if (primitive?.show !== false && primitive?.tilesLoaded !== true) {
          bumpTilesetSettle('tileset-added');
        }
      });
      if (typeof offAdd === 'function') _sceneRemovers.push(offAdd);
    }
    if (typeof primitives.primitiveRemoved?.addEventListener === 'function') {
      const offRem = primitives.primitiveRemoved.addEventListener(
        (primitive) => {
          const unsub = _tilesetSubscriptions.get(primitive);
          if (unsub) {
            unsub();
            _tilesetSubscriptions.delete(primitive);
          }
        },
      );
      if (typeof offRem === 'function') _sceneRemovers.push(offRem);
    }
  }
  if (typeof viewer?.camera?.moveEnd?.addEventListener === 'function') {
    const offMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
      if (hasVisibleUnloadedTileset(viewer)) {
        bumpTilesetSettle('camera-move-end');
      }
    });
    if (typeof offMoveEnd === 'function') _sceneRemovers.push(offMoveEnd);
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    const win = window;
    const onStackChanged = (evt) => {
      const detail = evt?.detail;
      if (detail?.status === 'ready' && viewer?.scene?.globe?.show === false) {
        bumpTilesetSettle('map-stack-changed');
      }
    };
    win.addEventListener('gev:map-stack-changed', onStackChanged);
    _sceneRemovers.push(() =>
      win?.removeEventListener?.('gev:map-stack-changed', onStackChanged),
    );
  }
  if (hasVisibleUnloadedTileset(viewer)) {
    bumpTilesetSettle('tileset-init');
  }
}

function applyMode() {
  if (!_installed || !_viewer?.scene) return;
  const continuous = _holds.size > 0;
  const scene = _viewer.scene;
  if (scene.requestRenderMode === !continuous) return;
  scene.requestRenderMode = !continuous;
  if (!continuous) {
    // Entering idle: render one settling frame so anything the last
    // continuous frame mutated is on screen before the loop stops.
    scene.requestRender?.();
  }
}

/**
 * Install the governor on the viewer. Idempotent. Before install,
 * hold/release still record into the holds set (and apply at install time);
 * requests are safe no-ops — so modules can call all three unconditionally
 * in tests without a viewer.
 * @param {Cesium.Viewer} viewer
 * @returns {void}
 */
export function installRenderGovernor(viewer) {
  if (!viewer?.scene)
    throw new TypeError('installRenderGovernor requires a Cesium viewer');
  _viewer = viewer;
  _installed = true;
  // Never let Cesium re-render on simulation-time deltas behind our back —
  // idle means idle. All re-renders are camera/tiles (Cesium-native) or
  // explicit requests.
  viewer.scene.maximumRenderTimeChange = Infinity;
  applyMode();
  installSceneTilesetMonitor(viewer);
}

/**
 * Nudge active 3D tilesets through a brief continuous-render settle burst
 * so post-flight/post-switch LOD refinement does not stall in requestRenderMode.
 */
export function nudgeTilesetStreaming(
  reason = 'tileset-nudge',
  { force = false } = {},
) {
  if (!_installed || !_viewer?.scene) return;
  if (force || hasVisibleUnloadedTileset(_viewer)) {
    bumpTilesetSettle(reason);
  } else {
    governorRequestRender(reason);
  }
}

/**
 * Register a continuous-render hold. Idempotent per owner.
 * Call where the owner's per-frame work BEGINS (scene listener installed,
 * animation starts, tracking begins).
 * @param {string} ownerId Short stable id, e.g. 'flights', 'traffic'.
 * @returns {void}
 */
export function holdContinuousRender(ownerId) {
  if (!ownerId) return;
  _holds.add(ownerId);
  applyMode();
}

/**
 * Release a hold. Safe when never held.
 * Call where the owner's per-frame work ENDS (listener removed, animation
 * settled, tracking stopped, layer disabled).
 * @param {string} ownerId
 * @returns {void}
 */
export function releaseContinuousRender(ownerId) {
  if (!ownerId) return;
  _holds.delete(ownerId);
  applyMode();
}

/**
 * One-shot render request for a discrete scene mutation (layer tick, slider
 * write, annotation change). Always forwards to scene.requestRender() — in
 * continuous mode that is a harmless flag set (and forwarding closes the
 * request-then-last-release race); only idle-mode requests are recorded in
 * diagnostics. Cheap enough to call unconditionally after any mutation.
 * @param {string} [reason] For diagnostics only.
 * @returns {void}
 */
export function governorRequestRender(reason = 'unspecified') {
  if (!_installed || !_viewer?.scene) return;
  if (_holds.size === 0) {
    _recentRequests.push({ reason, at: Date.now() });
    if (_recentRequests.length > RECENT_REQUEST_CAP) _recentRequests.shift();
  }
  _viewer.scene.requestRender?.();
}

/**
 * @returns {{installed: boolean, mode: 'continuous'|'idle', holds: string[],
 *   recentRequests: Array<{reason: string, at: number}>}}
 */
export function getRenderGovernorDiagnostics() {
  return {
    installed: _installed,
    mode: _holds.size > 0 ? 'continuous' : 'idle',
    holds: [..._holds].sort(),
    recentRequests: [..._recentRequests],
  };
}

/** Release the installed viewer after its animation owners have stopped. */
export function uninstallRenderGovernor(viewer) {
  if (_viewer !== viewer) return;
  detachAllTilesetSubscriptions();
  _viewer = null;
  _installed = false;
  _holds.clear();
  _recentRequests.length = 0;
}

/** Test seam: reset module state between unit tests. */
export function _resetRenderGovernorForTest() {
  detachAllTilesetSubscriptions();
  _viewer = null;
  _installed = false;
  _holds.clear();
  _recentRequests.length = 0;
}
