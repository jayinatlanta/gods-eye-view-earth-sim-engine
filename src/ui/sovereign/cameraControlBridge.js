/**
 * Shared Sovereign Camera Control Bridge & Authority Contract.
 *
 * Eliminates multi-click tray camera button race conditions across every
 * simulation engine by guaranteeing that every camera-mode switch executes
 * atomically on Click #1:
 *  1. Increments a monotonic `cameraIntentSeq` (invalidating stale async
 *     `flyTo` completion callbacks and delayed ground re-clamps).
 *  2. Synchronously cancels active flights & lookAt transforms
 *     (`cancelSwoopTransition`, `viewer.camera.cancelFlight()`,
 *     `lookAtTransform(IDENTITY)`, clears conflicting `viewer.trackedEntity`).
 *  3. Guards canvas free-cam pointer triggers (`LEFT_DOWN`, `RIGHT_DOWN`,
 *     `PINCH_START`) with a short post-command grace window (~180ms) and
 *     ignores pointer events originating inside `[data-sovereign-ui]` containers.
 *  4. Immediately triggers Google 3D tile buttering (`butterGoogle3DTiles`) so
 *     altitude transitions snap sharp without melted low-LOD tiles.
 */

import { governorRequestRender } from '../../renderGovernor.js';
import { butterGoogle3DTiles } from './tilesetButter.js';

export const CAMERA_COMMAND_GRACE_MS = 180;

// Identity 4x4 matrix fallback when Cesium is not directly imported (keeps this module Cesium-free).
const IDENTITY_MATRIX4 = Object.freeze({
  0: 1,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 1,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 1,
  11: 0,
  12: 0,
  13: 0,
  14: 0,
  15: 1,
});

function nowMs() {
  return typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Returns true if the DOM event (or element target) originated inside a
 * Sovereign UI container, preventing Cesium canvas handlers from racing with
 * camera-bar or rail-panel clicks.
 */
export function isEventInsideSovereignUi(eventOrTarget) {
  const target = eventOrTarget?.target ?? eventOrTarget;
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest(
      '[data-sovereign-ui], #earth-sim-panel, #gev-active-sim-hud, #gev-experiences-explorer, #gev-experiences-entry, #gev-sovereign-hide-pill',
    ),
  );
}

/**
 * Stops pointerdown / mousedown / touchstart propagation on interactive
 * Sovereign camera controls so Cesium canvas handlers never steal the click.
 */
export function isolatePointerEvent(event) {
  event?.stopPropagation?.();
}

/**
 * Creates a per-engine monotonic camera authority controller.
 *
 * @param {object} options
 * @param {object|null} [options.viewer] Cesium Viewer
 * @param {string} [options.engineId='sovereign'] Diagnostic prefix
 * @param {object|null} [options.identityMatrix4] Optional Cesium.Matrix4.IDENTITY
 * @param {Function|null} [options.onCameraModeApplied] Optional reactive sink
 */
export function createCameraAuthority({
  viewer = null,
  engineId = 'sovereign',
  identityMatrix4 = null,
  onCameraModeApplied = null,
} = {}) {
  let intentSeq = 0;
  let lastCommandAtMs = -Infinity;

  function nextIntent() {
    intentSeq += 1;
    lastCommandAtMs = nowMs();
    return intentSeq;
  }

  function getSeq() {
    return intentSeq;
  }

  function isCurrentIntent(seq) {
    return seq === intentSeq;
  }

  function isWithinCommandGraceWindow(graceMs = CAMERA_COMMAND_GRACE_MS) {
    return nowMs() - lastCommandAtMs < graceMs;
  }

  function shouldIgnoreCanvasPointer(
    event = null,
    graceMs = CAMERA_COMMAND_GRACE_MS,
  ) {
    if (isWithinCommandGraceWindow(graceMs)) return true;
    if (event && isEventInsideSovereignUi(event)) return true;
    return false;
  }

  /**
   * Synchronously prepares the camera for an atomic mode switch or teleport:
   * increments `cameraIntentSeq`, cancels in-flight transitions/swoops, clears
   * conflicting trackedEntity/lookAtTransform, and kicks off 3D tile buttering.
   */
  function beginAtomicCameraSwitch({
    mode = null,
    cancelSwoop = null,
    clearTrackedEntity = true,
    resetLookAt = true,
    butter = true,
    butterReason = `${engineId}-cam-${mode || 'switch'}`,
    butterMaxMs = 2200,
    onSettled = null,
  } = {}) {
    const seq = nextIntent();

    try {
      cancelSwoop?.();
    } catch {
      /* ignore */
    }

    if (viewer && !viewer.isDestroyed?.()) {
      try {
        viewer.camera?.cancelFlight?.();
      } catch {
        /* ignore */
      }
      if (resetLookAt && typeof viewer.camera?.lookAtTransform === 'function') {
        try {
          viewer.camera.lookAtTransform(identityMatrix4 || IDENTITY_MATRIX4);
        } catch {
          /* ignore */
        }
      }
      if (clearTrackedEntity && viewer.trackedEntity !== undefined) {
        try {
          viewer.trackedEntity = undefined;
        } catch {
          /* ignore */
        }
      }
    }

    if (mode !== null && typeof onCameraModeApplied === 'function') {
      try {
        onCameraModeApplied(mode, seq);
      } catch {
        /* ignore */
      }
    }

    if (butter && viewer && !viewer.isDestroyed?.()) {
      butterGoogle3DTiles(viewer, butterReason, {
        maxMs: butterMaxMs,
        cameraIntentGuard: () => isCurrentIntent(seq),
        onSettled,
      });
    } else {
      governorRequestRender(butterReason);
    }

    return {
      seq,
      isCurrent: () => isCurrentIntent(seq),
    };
  }

  return {
    nextIntent,
    getSeq,
    isCurrentIntent,
    isWithinCommandGraceWindow,
    shouldIgnoreCanvasPointer,
    beginAtomicCameraSwitch,
  };
}
