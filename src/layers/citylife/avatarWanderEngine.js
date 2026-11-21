/**
 * Avatar Wander & Autonomous Companion Co-Stroll Engine.
 * (Living World Sim: User Avatar WASD Ground Wander)
 *
 * Implements direct interactive locomotion and companion exploration:
 * - Direct WASD / Arrow Keys ground translation with sprint acceleration (1.2 to 6.0 m/s)
 * - Continuous camera yaw rotation (Q / E or mouse drag)
 * - User contact reticle (#06b6d4 14px dot + 1.7m cylinder collider)
 * - Dual camera modes: First-Person Eye Level (+1.7m AGL) & Isometric Chase (+4.5m trailing 8m)
 * - Autonomous Tethered Companion with elastic soft tether (3-8m)
 * - Ambient Autonomous Curiosity (companion explores nearby vantage points when user stops)
 * - Screen-space contextual thought bubbles & living sim interaction hooks
 */

import * as Cesium from 'cesium';
import {
  sampleActiveGroundHeight,
  createSurfaceTracker,
  isPhotoreal3DActive,
  pickActiveGroundPosition,
  subscribeToMapStack,
} from './surfaceHeight.js';
import { createUserAvatarDot } from './userAvatarDot.js';
import { createCompanionDot, getCompanionPersonaName } from './companionDot.js';
import { createThoughtBubbleOverlay } from '../../citylife/thoughtBubbleOverlay.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
  nudgeTilesetStreaming,
} from '../../renderGovernor.js';
import {
  resolveZeroCreditLocality,
  getGlobalDrawerCoordinator,
} from '../../ui/worldSimDock.js';

export const WANDER_CAMERA_MODES = Object.freeze({
  FIRST_PERSON: 'first_person',
  ISO_CHASE: 'iso_chase',
  HELI: 'heli',
  OVERVIEW: 'overview',
  FREE: 'free',
});

export function getDefaultPitchForMode(mode) {
  switch (mode) {
    case WANDER_CAMERA_MODES.FIRST_PERSON:
      return 0.0;
    case WANDER_CAMERA_MODES.ISO_CHASE:
      return -30.0;
    case WANDER_CAMERA_MODES.HELI:
      return -55.0;
    case WANDER_CAMERA_MODES.OVERVIEW:
      return -45.0;
    default:
      return -30.0;
  }
}

export function clampPitchForMode(mode, pitchDeg) {
  switch (mode) {
    case WANDER_CAMERA_MODES.FIRST_PERSON:
      return Math.max(-80.0, Math.min(85.0, pitchDeg));
    case WANDER_CAMERA_MODES.ISO_CHASE:
      return Math.max(-75.0, Math.min(-10.0, pitchDeg));
    case WANDER_CAMERA_MODES.HELI:
      return Math.max(-85.0, Math.min(-25.0, pitchDeg));
    case WANDER_CAMERA_MODES.OVERVIEW:
      return Math.max(-85.0, Math.min(-20.0, pitchDeg));
    default:
      return pitchDeg;
  }
}

export const WANDER_SPEED_TIERS = Object.freeze({
  STROLL: 1.2, // 1.2 m/s (~4.3 km/h)
  BRISK: 2.0, // 2.0 m/s (~7.2 km/h)
  JOG: 3.5, // 3.5 m/s (~12.6 km/h)
  SPRINT: 6.0, // 6.0 m/s (~21.6 km/h)
  SCOOTER: 6.7, // 6.7 m/s (~15.0 mph / 24.1 km/h) Electric Scooter Tour speed
  TURN_SPEED_DPS: 75.0, // 75 deg/second yaw rotation
});

export function createAvatarWanderEngine({
  viewer = null,
  container = null,
  localeClassifier = null,
} = {}) {
  let isWandering = false;
  let isDestroyed = false;

  let currentCameraMode = WANDER_CAMERA_MODES.ISO_CHASE;
  let cameraPitchDeg = getDefaultPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE);
  let companionEnabled = true;

  // Controllers
  let userAvatar = null;
  let companionDot = null;
  let thoughtBubble = null;

  // Active state
  let currentCoordinates = {
    lat: 33.749,
    lon: -84.388,
    height: 310,
    heading: 0,
  };
  let currentSpeedMs = 0;
  let currentFwdSpeedMs = 0;
  let currentStrafeSpeedMs = 0;
  let isSprinting = false;
  let walkSpeedOverride = null;
  let externalController = null;

  // Mouse look & Pointer Lock states
  let isPointerLocked = false;
  let justExitedPointerLock = false;
  let isTransitioning = false;
  let isRightMouseDown = false;
  let lastMousePos = { x: 0, y: 0 };
  let leftMouseDownPos = null;
  let leftMouseDragged = false;
  let currentLocality = null;
  const pointerLockListeners = new Set();

  function notifyPointerLockListeners() {
    for (const cb of pointerLockListeners) {
      try {
        cb(isPointerLocked);
      } catch {}
    }
  }

  // Input keystates
  const keyState = {
    forward: false,
    backward: false,
    strafeLeft: false,
    strafeRight: false,
    sprint: false,
    yawLeft: false,
    yawRight: false,
  };

  // Throttled, outlier-resistant dual-regime ground height tracker.
  // Never calls scene.sampleHeight() on every frame so Google 3D Tile GPU uploads aren't starved.
  const avatarGroundTracker = createSurfaceTracker({
    sampleIntervalMs: 220,
    slewMps: 6.5,
    snapMeters: 25.0,
    maxSpikeMeters: 14.0,
  });

  function clearInputState() {
    keyState.forward = false;
    keyState.backward = false;
    keyState.strafeLeft = false;
    keyState.strafeRight = false;
    keyState.sprint = false;
    keyState.yawLeft = false;
    keyState.yawRight = false;
    isRightMouseDown = false;
    leftMouseDownPos = null;
    leftMouseDragged = false;
    currentFwdSpeedMs = 0;
    currentStrafeSpeedMs = 0;
  }

  let preRenderListener = null;
  let clickHandler = null;
  let mapStackUnsubscribe = null;
  let lastTickTime = null;
  let onTelemetryCallback = null;

  /**
   * Checks whether an interactive text input element currently has focus.
   */
  function isTextInputFocused() {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName?.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      active.isContentEditable ||
      active.getAttribute?.('role') === 'textbox'
    );
  }

  function cancelSwoopTransition() {
    if (isTransitioning) {
      isTransitioning = false;
      if (typeof viewer?.camera?.cancelFlight === 'function') {
        try {
          viewer.camera.cancelFlight();
        } catch {}
      }
    }
  }

  function handleMouseDown(e) {
    if (!isWandering || isTextInputFocused()) return;
    if (isPointerLocked && e.button === 0) {
      justExitedPointerLock = true;
      exitPointerLock();
      return;
    }
    if (e.button === 2) {
      isRightMouseDown = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      cancelSwoopTransition();
    } else if (e.button === 0) {
      leftMouseDownPos = { x: e.clientX, y: e.clientY };
      leftMouseDragged = false;
    }
  }

  function handleMouseMove(e) {
    if (!isWandering) return;

    if (leftMouseDownPos && !leftMouseDragged) {
      const dist = Math.hypot(
        e.clientX - leftMouseDownPos.x,
        e.clientY - leftMouseDownPos.y,
      );
      if (dist > 5) {
        leftMouseDragged = true;
      }
    }

    if (isRightMouseDown) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;
      lastMousePos = { x: e.clientX, y: e.clientY };

      const yawDegPerPx = 0.2;
      const pitchDegPerPx = 0.2;

      currentCoordinates.heading =
        (currentCoordinates.heading + deltaX * yawDegPerPx + 360) % 360;
      cameraPitchDeg = clampPitchForMode(
        currentCameraMode,
        cameraPitchDeg - deltaY * pitchDegPerPx,
      );
      cancelSwoopTransition();
    }

    if (isPointerLocked) {
      const movementX = e.movementX ?? e.mozMovementX ?? e.webkitMovementX ?? 0;
      const movementY = e.movementY ?? e.mozMovementY ?? e.webkitMovementY ?? 0;

      const yawSensitivity = 0.15;
      const pitchSensitivity = 0.15;

      currentCoordinates.heading =
        (currentCoordinates.heading + movementX * yawSensitivity + 360) % 360;
      cameraPitchDeg = clampPitchForMode(
        currentCameraMode,
        cameraPitchDeg - movementY * pitchSensitivity,
      );
      cancelSwoopTransition();
    }
  }

  function handleMouseUp(e) {
    if (e.button === 2) {
      isRightMouseDown = false;
    } else if (e.button === 0) {
      leftMouseDownPos = null;
    }
  }

  function handleContextMenu(e) {
    if (isWandering) {
      e.preventDefault?.();
    }
  }

  function handleDblClick(e) {
    if (!isWandering || isTextInputFocused()) return;
    if (currentCameraMode === WANDER_CAMERA_MODES.FIRST_PERSON) {
      requestPointerLock();
    }
  }

  function requestPointerLock() {
    const canvas = viewer?.scene?.canvas;
    if (canvas && typeof canvas.requestPointerLock === 'function') {
      try {
        canvas.requestPointerLock();
        if (canvas._pointerLocked === true) {
          isPointerLocked = true;
          notifyPointerLockListeners();
        }
      } catch (err) {
        console.warn('Pointer lock request failed:', err);
      }
    }
  }

  function exitPointerLock() {
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch {}
    }
    const wasLocked = isPointerLocked;
    isPointerLocked = false;
    if (wasLocked) {
      notifyPointerLockListeners();
    }
  }

  function handlePointerLockChange() {
    if (typeof document === 'undefined') return;
    const canvas = viewer?.scene?.canvas;
    const nextLocked = Boolean(
      canvas && document.pointerLockElement === canvas,
    );
    const changed = nextLocked !== isPointerLocked;
    isPointerLocked = nextLocked;
    if (isPointerLocked) {
      cancelSwoopTransition();
    }
    if (changed) {
      notifyPointerLockListeners();
    }
  }

  function handleKeyDown(event) {
    if (!isWandering || isTextInputFocused()) return;

    // Never latch WASD / Shift when screenshot or OS/browser shortcut modifiers are held
    // (e.g., Win+Shift+S, Ctrl+Shift+S, Cmd+Shift+S, Alt+Tab).
    if (event.ctrlKey || event.metaKey || event.altKey) {
      clearInputState();
      return;
    }

    const code = event.code;
    const key = event.key?.toLowerCase();
    let handled = true;

    if (
      code === 'KeyW' ||
      key === 'w' ||
      code === 'ArrowUp' ||
      key === 'arrowup'
    ) {
      keyState.forward = true;
      cancelSwoopTransition();
    } else if (
      code === 'KeyS' ||
      key === 's' ||
      code === 'ArrowDown' ||
      key === 'arrowdown'
    ) {
      keyState.backward = true;
      cancelSwoopTransition();
    } else if (
      code === 'KeyA' ||
      key === 'a' ||
      code === 'ArrowLeft' ||
      key === 'arrowleft'
    ) {
      keyState.strafeLeft = true;
      cancelSwoopTransition();
    } else if (
      code === 'KeyD' ||
      key === 'd' ||
      code === 'ArrowRight' ||
      key === 'arrowright'
    ) {
      keyState.strafeRight = true;
      cancelSwoopTransition();
    } else if (
      code === 'KeyQ' ||
      key === 'q' ||
      code === 'Comma' ||
      key === ','
    ) {
      keyState.yawLeft = true;
      cancelSwoopTransition();
    } else if (
      code === 'KeyE' ||
      key === 'e' ||
      code === 'Period' ||
      key === '.'
    ) {
      keyState.yawRight = true;
      cancelSwoopTransition();
    } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
      keyState.sprint = true;
    } else if (code === 'KeyV' || key === 'v') {
      cycleCameraMode();
    } else if (code === 'KeyP' || key === 'p') {
      toggleCompanion();
    } else if (code === 'Escape' || key === 'escape') {
      if (isPointerLocked) {
        exitPointerLock();
      } else if (externalController) {
        clearInputState();
        if (typeof externalController.onManualInput === 'function') {
          externalController.onManualInput();
        }
      } else {
        stopWandering();
      }
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }

  function handleKeyUp(event) {
    const code = event.code;
    const key = event.key?.toLowerCase();

    if (
      code === 'KeyW' ||
      key === 'w' ||
      code === 'ArrowUp' ||
      key === 'arrowup'
    ) {
      keyState.forward = false;
    }
    if (
      code === 'KeyS' ||
      key === 's' ||
      code === 'ArrowDown' ||
      key === 'arrowdown'
    ) {
      keyState.backward = false;
    }
    if (
      code === 'KeyA' ||
      key === 'a' ||
      code === 'ArrowLeft' ||
      key === 'arrowleft'
    ) {
      keyState.strafeLeft = false;
    }
    if (
      code === 'KeyD' ||
      key === 'd' ||
      code === 'ArrowRight' ||
      key === 'arrowright'
    ) {
      keyState.strafeRight = false;
    }
    if (code === 'KeyQ' || key === 'q' || code === 'Comma' || key === ',') {
      keyState.yawLeft = false;
    }
    if (code === 'KeyE' || key === 'e' || code === 'Period' || key === '.') {
      keyState.yawRight = false;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight' || !event.shiftKey) {
      keyState.sprint = false;
    }
  }

  function handleWindowBlur() {
    clearInputState();
    if (viewer && !viewer.isDestroyed?.()) {
      nudgeTilesetStreaming('wander-window-blur', { force: true });
      governorRequestRender('wander-window-blur');
    }
  }

  function handleWindowFocus() {
    clearInputState();
    if (viewer && !viewer.isDestroyed?.()) {
      nudgeTilesetStreaming('wander-window-focus', { force: true });
      governorRequestRender('wander-window-focus');
    }
  }

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) {
      clearInputState();
    } else {
      handleWindowFocus();
    }
  }

  function installInputListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
    }
    const canvas = viewer?.scene?.canvas;
    if (canvas) {
      canvas.addEventListener?.('mousedown', handleMouseDown);
      canvas.addEventListener?.('contextmenu', handleContextMenu);
      canvas.addEventListener?.('dblclick', handleDblClick);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener?.('pointerlockchange', handlePointerLockChange);
      document.addEventListener?.('visibilitychange', handleVisibilityChange);
    }
  }

  function removeInputListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    }
    const canvas = viewer?.scene?.canvas;
    if (canvas) {
      canvas.removeEventListener?.('mousedown', handleMouseDown);
      canvas.removeEventListener?.('contextmenu', handleContextMenu);
      canvas.removeEventListener?.('dblclick', handleDblClick);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener?.(
        'pointerlockchange',
        handlePointerLockChange,
      );
      document.removeEventListener?.(
        'visibilitychange',
        handleVisibilityChange,
      );
    }
    exitPointerLock();
  }

  function cycleCameraMode() {
    const modes = [
      WANDER_CAMERA_MODES.ISO_CHASE,
      WANDER_CAMERA_MODES.FIRST_PERSON,
      WANDER_CAMERA_MODES.HELI,
      WANDER_CAMERA_MODES.OVERVIEW,
      WANDER_CAMERA_MODES.FREE,
    ];
    const currentIndex = modes.indexOf(currentCameraMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setCameraMode(modes[nextIndex]);
  }

  function setCameraMode(mode) {
    if (Object.values(WANDER_CAMERA_MODES).includes(mode)) {
      currentCameraMode = mode;
      cameraPitchDeg = getDefaultPitchForMode(mode);
      // In first person, user avatar contact dot is hidden (user IS the camera lens)
      if (mode === WANDER_CAMERA_MODES.FIRST_PERSON) {
        userAvatar?.setVisible?.(false);
      } else {
        userAvatar?.setVisible?.(true);
      }
      if (
        mode === WANDER_CAMERA_MODES.FREE &&
        viewer?.camera?.lookAtTransform
      ) {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
    }
  }

  function getCameraMode() {
    return currentCameraMode;
  }

  function toggleCompanion(forcedState = null) {
    companionEnabled =
      forcedState !== null ? Boolean(forcedState) : !companionEnabled;
    if (companionDot) {
      companionDot.setVisible(companionEnabled);
    } else if (companionEnabled && viewer) {
      companionDot = createCompanionDot({ viewer });
      companionDot.spawn(currentCoordinates);
    }
    if (!companionEnabled && thoughtBubble) {
      thoughtBubble.hide();
    }
    return companionEnabled;
  }

  function isCompanionActive() {
    return companionEnabled;
  }

  /**
   * Applies camera choreography based on current wander camera mode.
   */
  function applyCamera(cartesianPos, headingDeg, normal) {
    if (
      !viewer?.camera ||
      currentCameraMode === WANDER_CAMERA_MODES.FREE ||
      isTransitioning
    )
      return;

    const headingRad = Cesium.Math.toRadians(headingDeg);
    const clampedPitch = clampPitchForMode(currentCameraMode, cameraPitchDeg);
    cameraPitchDeg = clampedPitch;
    const pitchRad = Cesium.Math.toRadians(clampedPitch);

    // Compute surface tangents
    const eastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(
      cartesianPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Matrix4(),
    );

    const east = new Cesium.Cartesian3(
      eastNorthUp[0],
      eastNorthUp[1],
      eastNorthUp[2],
    );
    const north = new Cesium.Cartesian3(
      eastNorthUp[4],
      eastNorthUp[5],
      eastNorthUp[6],
    );

    Cesium.Cartesian3.normalize(east, east);
    Cesium.Cartesian3.normalize(north, north);

    // Forward horizontal vector along ground heading
    const forward = new Cesium.Cartesian3();
    const northComp = new Cesium.Cartesian3();
    const eastComp = new Cesium.Cartesian3();

    Cesium.Cartesian3.multiplyByScalar(north, Math.cos(headingRad), northComp);
    Cesium.Cartesian3.multiplyByScalar(east, Math.sin(headingRad), eastComp);
    Cesium.Cartesian3.add(northComp, eastComp, forward);
    Cesium.Cartesian3.normalize(forward, forward);

    // 3D Look Direction vector D = Fh * cos(phi) + U * sin(phi)
    const dir3D = new Cesium.Cartesian3();
    const fwdPart = new Cesium.Cartesian3();
    const upPart = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(forward, Math.cos(pitchRad), fwdPart);
    Cesium.Cartesian3.multiplyByScalar(normal, Math.sin(pitchRad), upPart);
    Cesium.Cartesian3.add(fwdPart, upPart, dir3D);
    Cesium.Cartesian3.normalize(dir3D, dir3D);

    const camPos = Cesium.Cartesian3.clone(cartesianPos);
    const lookTarget = Cesium.Cartesian3.clone(cartesianPos);

    const scratchFwd = new Cesium.Cartesian3();
    const scratchUp = new Cesium.Cartesian3();

    if (currentCameraMode === WANDER_CAMERA_MODES.FIRST_PERSON) {
      // First person eye level: +1.7m AGL, looking along 3D direction vector D
      Cesium.Cartesian3.multiplyByScalar(normal, 1.7, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(dir3D, 25.0, scratchFwd);
      Cesium.Cartesian3.add(camPos, scratchFwd, lookTarget);
    } else if (currentCameraMode === WANDER_CAMERA_MODES.ISO_CHASE) {
      // Third person isometric chase: spherical orbit around avatar at 8.0m
      const absPitch = -pitchRad;
      const distH = 8.0 * Math.cos(absPitch);
      const distV = 8.0 * Math.sin(absPitch) + 1.2;

      Cesium.Cartesian3.multiplyByScalar(forward, -distH, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, distV, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.0, scratchUp);
      Cesium.Cartesian3.multiplyByScalar(forward, 1.8, scratchFwd);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
    } else if (currentCameraMode === WANDER_CAMERA_MODES.HELI) {
      // Elevated heli view: +45m AGL, trailing 35m
      const absPitch = -pitchRad;
      const refAngle = Cesium.Math.toRadians(55.0);
      const distH = 35.0 * (Math.cos(absPitch) / Math.cos(refAngle));
      const distV = 45.0 * (Math.sin(absPitch) / Math.sin(refAngle));

      Cesium.Cartesian3.multiplyByScalar(forward, -distH, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, distV, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.0, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else if (currentCameraMode === WANDER_CAMERA_MODES.OVERVIEW) {
      // Dedicated Establishing Overview Camera: +120m AGL trailing 90m at -45 deg
      const absPitch = -pitchRad;
      const refAngle = Cesium.Math.toRadians(45.0);
      const distH = 90.0 * (Math.cos(absPitch) / Math.cos(refAngle));
      const distV = 120.0 * (Math.sin(absPitch) / Math.sin(refAngle));

      Cesium.Cartesian3.multiplyByScalar(forward, -distH, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, distV, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(normal, 1.0, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    }

    // Roof-safe dual-regime anti-subterranean floor (matches syntheticBusEngine / syntheticMetroEngine).
    // Never call scene.sampleHeight() behind the camera on 3D Tiles — raycasting roofs slams the camera
    // vertically and starves Cesium's JobScheduler GPU upload budget on every frame.
    const camCarto = Cesium.Cartographic.fromCartesian(
      camPos,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    if (camCarto) {
      const is3D = isPhotoreal3DActive(viewer);
      const globeH = !is3D
        ? (viewer.scene?.globe?.getHeight?.(camCarto) ?? null)
        : null;
      const baseFloorH = Number.isFinite(globeH)
        ? Math.max(currentCoordinates.height || 0, globeH)
        : currentCoordinates.height || 0;
      const minBuffer =
        currentCameraMode === WANDER_CAMERA_MODES.FIRST_PERSON ? 1.6 : 2.0;
      if (camCarto.height < baseFloorH + minBuffer) {
        camCarto.height = baseFloorH + minBuffer;
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

    if (typeof viewer.camera.setView === 'function') {
      viewer.camera.setView({
        destination: camPos,
        orientation: {
          direction,
          up: normal,
        },
      });
    }
  }

  /**
   * Main per-frame simulation loop.
   */
  function onTick() {
    if (!isWandering || isDestroyed || !viewer) return;

    const now = Date.now();
    const rawDt = lastTickTime ? (now - lastTickTime) / 1000.0 : 0.016;
    const dt = Math.min(Math.max(rawDt > 0 ? rawDt : 0.016, 0.001), 0.1);
    lastTickTime = now;

    // 1. Process continuous yaw rotation (only Q/E or ArrowLeft/ArrowRight)
    let yawDelta = 0;
    if (keyState.yawLeft) {
      yawDelta -= WANDER_SPEED_TIERS.TURN_SPEED_DPS * dt;
    }
    if (keyState.yawRight) {
      yawDelta += WANDER_SPEED_TIERS.TURN_SPEED_DPS * dt;
    }
    currentCoordinates.heading =
      (currentCoordinates.heading + yawDelta + 360) % 360;

    // 2. Process planar forward/backward & lateral strafe translation (or external Tour/Play controller)
    isSprinting = keyState.sprint;
    const defaultWalkSpeed =
      walkSpeedOverride !== null && Number.isFinite(walkSpeedOverride)
        ? walkSpeedOverride
        : WANDER_SPEED_TIERS.BRISK;
    const baseSpeed = isSprinting
      ? WANDER_SPEED_TIERS.SPRINT
      : defaultWalkSpeed;

    let fwdInput = 0;
    if (keyState.forward) fwdInput += 1;
    if (keyState.backward) fwdInput -= 1;

    let strafeInput = 0;
    if (keyState.strafeRight) strafeInput += 1;
    if (keyState.strafeLeft) strafeInput -= 1;

    const inputMag = Math.hypot(fwdInput, strafeInput);
    if (
      inputMag > 0.001 &&
      externalController &&
      typeof externalController.onManualInput === 'function'
    ) {
      externalController.onManualInput();
    }

    let externalBubbleSpec = null;
    if (
      externalController &&
      typeof externalController.update === 'function' &&
      (!externalController.isManualTakeover ||
        !externalController.isManualTakeover())
    ) {
      const extStep = externalController.update({
        coordinates: currentCoordinates,
        deltaTimeSeconds: dt,
        now,
      });
      if (extStep) {
        if (Number.isFinite(extStep.lat)) currentCoordinates.lat = extStep.lat;
        if (Number.isFinite(extStep.lon)) currentCoordinates.lon = extStep.lon;
        if (
          Number.isFinite(extStep.elev) &&
          (!Number.isFinite(currentCoordinates.height) ||
            (currentCoordinates.height === 0 &&
              avatarGroundTracker.height === null))
        ) {
          currentCoordinates.height = extStep.elev;
        }
        if (Number.isFinite(extStep.heading)) {
          currentCoordinates.heading = ((extStep.heading % 360) + 360) % 360;
        }
        if (Number.isFinite(extStep.speedMps)) {
          currentSpeedMs = extStep.speedMps;
          currentFwdSpeedMs = extStep.speedMps;
          currentStrafeSpeedMs = 0;
        }
        if (extStep.bubbleSpec) {
          externalBubbleSpec = extStep.bubbleSpec;
        }
      }
    } else {
      // Normalize directional input vector so diagonal movement isn't faster
      let targetFwdSpeedMs = 0;
      let targetStrafeSpeedMs = 0;
      if (inputMag > 0.001) {
        targetFwdSpeedMs = (fwdInput / inputMag) * baseSpeed;
        targetStrafeSpeedMs = (strafeInput / inputMag) * baseSpeed;
      }

      // Smooth speed interpolation (acceleration/braking)
      const accelRate = inputMag > 0 ? 6.0 : 9.0;
      currentFwdSpeedMs +=
        (targetFwdSpeedMs - currentFwdSpeedMs) * Math.min(1.0, accelRate * dt);
      currentStrafeSpeedMs +=
        (targetStrafeSpeedMs - currentStrafeSpeedMs) *
        Math.min(1.0, accelRate * dt);

      currentSpeedMs = Math.hypot(currentFwdSpeedMs, currentStrafeSpeedMs);

      if (currentSpeedMs > 0.02) {
        const headingRad = Cesium.Math.toRadians(currentCoordinates.heading);
        // Planar horizontal displacement in local tangent plane:
        // deltaNorth = (vFwd * cos(θ) - vStrafe * sin(θ)) * dt
        // deltaEast  = (vFwd * sin(θ) + vStrafe * cos(θ)) * dt
        const moveNorthMeters =
          (currentFwdSpeedMs * Math.cos(headingRad) -
            currentStrafeSpeedMs * Math.sin(headingRad)) *
          dt;
        const moveEastMeters =
          (currentFwdSpeedMs * Math.sin(headingRad) +
            currentStrafeSpeedMs * Math.cos(headingRad)) *
          dt;

        // Geodetic step
        const latDeltaDeg = moveNorthMeters / 111139.0;
        const cosLat = Math.cos(Cesium.Math.toRadians(currentCoordinates.lat));
        const lonDeltaDeg =
          moveEastMeters /
          (111139.0 * (Math.abs(cosLat) > 0.001 ? cosLat : 1.0));

        currentCoordinates.lat += latDeltaDeg;
        currentCoordinates.lon += lonDeltaDeg;
      }
    }

    // Throttled dual-regime surface height tracking (220ms interval with outlier-spike filter)
    // so Google 3D Tile glTF/texture JobScheduler uploads run unblocked on >90% of frames.
    const excludeEntities = [
      userAvatar?.getEntity(),
      companionDot?.getEntity(),
    ].filter(Boolean);
    const walkCarto = Cesium.Cartographic.fromDegrees(
      currentCoordinates.lon,
      currentCoordinates.lat,
      currentCoordinates.height || 0,
    );
    const walkH = avatarGroundTracker.update(viewer, walkCarto, now, {
      excludeEntities,
    });
    if (walkH !== null && Number.isFinite(walkH)) {
      currentCoordinates.height = walkH;
    }

    // Update zero-credit locality resolution (cached per ~220m cell)
    currentLocality = resolveZeroCreditLocality(
      currentCoordinates.lat,
      currentCoordinates.lon,
      {
        onResolved: (loc) => {
          currentLocality = loc;
        },
      },
    );

    // 3. Update User Avatar reticle & ground clamping (reuse throttled height to skip duplicate sampleHeight)
    let userCartesian = null;
    if (userAvatar) {
      userCartesian = userAvatar.updatePosition({
        ...currentCoordinates,
        forceSample: false,
      });
    } else {
      userAvatar = createUserAvatarDot({ viewer });
      userAvatar.spawn(currentCoordinates);
      userCartesian = userAvatar.getCartesian();
    }

    // 4. Update Companion Dot & soft tether kinematics
    let companionUpdate = null;
    if (companionEnabled) {
      if (!companionDot) {
        companionDot = createCompanionDot({ viewer });
        companionDot.spawn(currentCoordinates);
      }
      companionUpdate = companionDot.update({
        userCoordinates: currentCoordinates,
        userSpeed: Math.abs(currentSpeedMs),
        deltaTimeSeconds: dt,
        localeArchetype:
          localeClassifier?.getActiveArchetype?.() || 'DENSE_URBAN',
        now,
      });
    } else if (companionDot) {
      companionDot.setVisible(false);
    }

    // 5. Update Camera Choreography FIRST so screen-space thought bubbles project
    // against this frame's exact camera (preventing 1-frame lag/drift on turns & transit).
    if (userCartesian) {
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        userCartesian,
        new Cesium.Cartesian3(),
      );
      applyCamera(userCartesian, currentCoordinates.heading, normal);
    }

    // 6. Display landmark / play dialog bubble if active, otherwise companion thought bubble
    if (externalBubbleSpec && thoughtBubble && userCartesian) {
      thoughtBubble.show(externalBubbleSpec, userCartesian);
    } else if (
      companionEnabled &&
      companionUpdate?.thought &&
      thoughtBubble &&
      companionUpdate?.cartesian
    ) {
      const compName = getCompanionPersonaName();
      thoughtBubble.show(
        {
          name: compName,
          vibeColor: '#10b981',
          occupation: companionUpdate.isExploring
            ? 'Exploring Surroundings'
            : 'Autonomous Companion',
          thought: companionUpdate.thought,
          currentThought: companionUpdate.thought,
          city: currentLocality?.fullLabel || 'Local Sector',
          isCompanion: true,
        },
        companionUpdate.cartesian,
      );
    } else if (!companionEnabled) {
      thoughtBubble?.hide();
    }

    // 6. Telemetry Callback
    if (onTelemetryCallback) {
      onTelemetryCallback({
        coordinates: { ...currentCoordinates },
        lat: currentCoordinates.lat,
        lon: currentCoordinates.lon,
        height: currentCoordinates.height,
        heading: currentCoordinates.heading,
        speedMps: currentSpeedMs,
        speedMph: currentSpeedMs * 2.23694,
        isSprinting,
        cameraMode: currentCameraMode,
        isPointerLocked,
        companionActive: companionEnabled,
        companionName: getCompanionPersonaName(),
        companionThought: companionUpdate?.thought || null,
        companionExploring: companionUpdate?.isExploring || false,
        locationLabel: currentLocality?.fullLabel || '',
        shortHudLocation: currentLocality?.shortHudLabel || '',
      });
    }
  }

  function installClickHandler() {
    if (clickHandler || !viewer?.scene?.canvas) return;
    try {
      if (typeof Cesium.ScreenSpaceEventHandler === 'function') {
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((movement) => {
          if (!isWandering || isDestroyed || isTextInputFocused()) return;
          if (justExitedPointerLock) {
            justExitedPointerLock = false;
            return;
          }
          if (leftMouseDragged) return; // 5px movement deadzone filter
          // Refocusing the browser canvas by clicking during an active autonomous tour
          // must not teleport the avatar off the tour route.
          if (
            externalController &&
            (!externalController.isManualTakeover ||
              !externalController.isManualTakeover())
          ) {
            nudgeTilesetStreaming('wander-canvas-refocus', { force: true });
            return;
          }
          if (!movement?.position) return;
          relocateToScreenPosition(movement.position);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
    } catch {}
  }

  function removeClickHandler() {
    if (clickHandler) {
      try {
        clickHandler.destroy();
      } catch {}
      clickHandler = null;
    }
  }

  function relocateToScreenPosition(windowPosition) {
    if (!viewer?.scene) return false;
    const pickedCartesian = pickActiveGroundPosition(viewer, windowPosition);
    if (!pickedCartesian) return false;

    try {
      const carto = Cesium.Cartographic.fromCartesian(pickedCartesian);
      if (
        !carto ||
        !Number.isFinite(carto.latitude) ||
        !Number.isFinite(carto.longitude)
      ) {
        return false;
      }

      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const elev = Number.isFinite(carto.height) ? carto.height : null;

      // Ignore accidental far-horizon sky/ellipsoid clicks (> 800m from current avatar position)
      const cosLat = Math.max(
        0.1,
        Math.cos(Cesium.Math.toRadians(currentCoordinates.lat || lat)),
      );
      const dLatM = (lat - (currentCoordinates.lat || lat)) * 111139.0;
      const dLonM = (lon - (currentCoordinates.lon || lon)) * 111139.0 * cosLat;
      if (Math.hypot(dLatM, dLonM) > 800) {
        return false;
      }

      relocateTo({ lat, lon, elev });
      return true;
    } catch {
      return false;
    }
  }

  function relocateTo({
    lat,
    lon,
    elev = null,
    heading = null,
    preserveCameraMode = false,
  } = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    cancelSwoopTransition();
    clearInputState();
    avatarGroundTracker.reset();
    currentCoordinates.lat = lat;
    currentCoordinates.lon = lon;

    const excludeEntities = [
      userAvatar?.getEntity(),
      companionDot?.getEntity(),
    ].filter(Boolean);
    const relocCarto = Cesium.Cartographic.fromDegrees(
      lon,
      lat,
      Number.isFinite(elev) ? elev : currentCoordinates.height || 0,
    );
    const sampledH = avatarGroundTracker.update(
      viewer,
      relocCarto,
      Date.now(),
      {
        excludeEntities,
        intervalMs: 0,
      },
    );
    if (sampledH !== null && Number.isFinite(sampledH)) {
      currentCoordinates.height = sampledH;
    } else if (elev !== null && Number.isFinite(elev)) {
      currentCoordinates.height = elev;
    }

    if (heading !== null && Number.isFinite(heading)) {
      currentCoordinates.heading = heading;
    }
    currentFwdSpeedMs = 0;
    currentStrafeSpeedMs = 0;
    currentSpeedMs = 0;
    currentLocality = resolveZeroCreditLocality(lat, lon, {
      onResolved: (loc) => {
        currentLocality = loc;
      },
    });

    if (userAvatar) {
      userAvatar.updatePosition({
        ...currentCoordinates,
        forceSample: false,
      });
    }
    if (companionDot?.teleport) {
      companionDot.teleport({
        lat,
        lon,
        height: currentCoordinates.height,
        heading: currentCoordinates.heading,
      });
    }
    snapBack({ preserveCameraMode });
    nudgeTilesetStreaming('wander-relocate', { force: true });
    governorRequestRender('wander-relocate');
  }

  function handleMapRegimeChange() {
    if (!isWandering || isDestroyed || !viewer) return;
    avatarGroundTracker.reset();
    const excludeEntities = [
      userAvatar?.getEntity(),
      companionDot?.getEntity(),
    ].filter(Boolean);
    const curCarto = Cesium.Cartographic.fromDegrees(
      currentCoordinates.lon,
      currentCoordinates.lat,
      currentCoordinates.height || 0,
    );
    const newGroundH =
      avatarGroundTracker.update(viewer, curCarto, Date.now(), {
        excludeEntities,
        intervalMs: 0,
      }) ?? sampleActiveGroundHeight(viewer, curCarto, excludeEntities);
    if (Number.isFinite(newGroundH)) {
      currentCoordinates.height = newGroundH;
      if (userAvatar) {
        userAvatar.updatePosition({
          lat: currentCoordinates.lat,
          lon: currentCoordinates.lon,
          height: newGroundH,
          heading: currentCoordinates.heading,
          forceSample: false,
        });
      }
      if (companionDot?.teleport) {
        companionDot.teleport({
          lat: currentCoordinates.lat,
          lon: currentCoordinates.lon,
          height: newGroundH,
          heading: currentCoordinates.heading,
        });
      }
      snapBack({ preserveCameraMode: true });
    }
    nudgeTilesetStreaming('wander-regime-change', { force: true });
  }

  /**
   * Starts ground wander mode at the specified geographic coordinates.
   */
  function startWandering({
    lat = 33.749,
    lon = -84.388,
    elev = null,
    heading = 0,
    companion = true,
    cameraMode = WANDER_CAMERA_MODES.ISO_CHASE,
  } = {}) {
    if (!viewer || isDestroyed) return false;

    clearInputState();
    avatarGroundTracker.reset();

    // Sample initial surface elevation when uncalibrated, zero, or running in Photoreal 3D mode
    // (where catalog MSL elevation differs from Google 3D WGS84 ellipsoidal height).
    let startElev = elev;
    const initCarto = Cesium.Cartographic.fromDegrees(
      lon,
      lat,
      Number.isFinite(startElev) ? startElev : 0,
    );
    if (
      !Number.isFinite(startElev) ||
      startElev === 0 ||
      isPhotoreal3DActive(viewer)
    ) {
      const sampledInitH = avatarGroundTracker.update(
        viewer,
        initCarto,
        Date.now(),
        { intervalMs: 0 },
      );
      if (sampledInitH !== null && Number.isFinite(sampledInitH)) {
        startElev = sampledInitH;
      }
    }

    currentCoordinates = { lat, lon, height: startElev || 0, heading };
    currentSpeedMs = 0;
    currentFwdSpeedMs = 0;
    currentStrafeSpeedMs = 0;
    currentLocality = resolveZeroCreditLocality(lat, lon, {
      onResolved: (loc) => {
        currentLocality = loc;
      },
    });

    try {
      getGlobalDrawerCoordinator().notifySimulationStarted('wander');
    } catch {}
    holdContinuousRender('avatar-wander');

    // Reset any lingering camera orbit/lookAt transform or previous swoop flight
    cancelSwoopTransition();
    if (viewer?.camera?.lookAtTransform) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    // Check if entrance swoop should happen (> 30m AGL above start target when not driven by external Tour/Play controller)
    const camPosCarto = viewer?.camera?.positionCartographic;
    const currentAltitude = camPosCarto ? camPosCarto.height : null;
    const altitudeAboveGround =
      currentAltitude !== null ? currentAltitude - (startElev || 0) : 0;

    const shouldSwoop =
      !externalController &&
      altitudeAboveGround > 30.0 &&
      typeof viewer?.camera?.flyTo === 'function';

    if (shouldSwoop) {
      isTransitioning = true;
      const headingRad = Cesium.Math.toRadians(heading);
      const pitchRad = Cesium.Math.toRadians(-30.0);
      // Swoop to trailing ISO_CHASE position (~6.9m behind avatar, +5.2m AGL)
      // so the player dot is framed in center-bottom upon arrival instead of directly beneath the lens
      const trailMeters = 6.9;
      const latOffsetDeg = (-trailMeters * Math.cos(headingRad)) / 111139.0;
      const cosLat = Math.cos(Cesium.Math.toRadians(lat));
      const lonOffsetDeg =
        (-trailMeters * Math.sin(headingRad)) /
        (111139.0 * (Math.abs(cosLat) > 0.001 ? cosLat : 1.0));
      const targetCart = Cesium.Cartesian3.fromDegrees(
        lon + lonOffsetDeg,
        lat + latOffsetDeg,
        (startElev || 0) + 5.2,
        Cesium.Ellipsoid.WGS84,
      );

      viewer.camera.flyTo({
        destination: targetCart,
        orientation: {
          heading: headingRad,
          pitch: pitchRad,
          roll: 0.0,
        },
        duration: 1.8,
        easingFunction: Cesium.EasingFunction?.QUADRATIC_OUT,
        complete: () => {
          isTransitioning = false;
          const cart = userAvatar?.getCartesian?.();
          if (cart) {
            const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
              cart,
              new Cesium.Cartesian3(),
            );
            applyCamera(cart, currentCoordinates.heading, normal);
          }
        },
        cancel: () => {
          isTransitioning = false;
        },
      });
    } else {
      isTransitioning = false;
    }

    // Reset input keystates
    keyState.forward = false;
    keyState.backward = false;
    keyState.strafeLeft = false;
    keyState.strafeRight = false;
    keyState.yawLeft = false;
    keyState.yawRight = false;
    keyState.sprint = false;

    installInputListeners();
    installClickHandler();

    // Initialize user avatar
    if (!userAvatar) {
      userAvatar = createUserAvatarDot({ viewer });
    }
    userAvatar.spawn(currentCoordinates);

    // Apply active camera mode and reticle visibility invariant
    setCameraMode(cameraMode);

    // Initialize companion
    companionEnabled = companion;
    if (companionEnabled) {
      if (!companionDot) {
        companionDot = createCompanionDot({ viewer });
      }
      companionDot.spawn(currentCoordinates);
    }

    // Initialize thought bubble overlay
    if (!thoughtBubble && viewer) {
      thoughtBubble = createThoughtBubbleOverlay({
        viewer,
        container:
          container || (typeof document !== 'undefined' ? document.body : null),
      });
      thoughtBubble.onCameraMode?.((mode) => {
        if (Object.values(WANDER_CAMERA_MODES).includes(mode)) {
          setCameraMode(mode);
        }
      });
    }
    thoughtBubble?.resetDismissal?.();

    // Immediately position camera onto avatar when not swooping
    if (!shouldSwoop) {
      const initCart = userAvatar?.getCartesian?.();
      if (initCart) {
        const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
          initCart,
          new Cesium.Cartesian3(),
        );
        applyCamera(initCart, currentCoordinates.heading, normal);
      }
    }

    // Attach preRender simulation tick
    if (!preRenderListener && viewer.scene?.preRender) {
      lastTickTime = Date.now();
      preRenderListener = () => onTick();
      viewer.scene.preRender.addEventListener(preRenderListener);
    }

    // Subscribe to map style switch / surface regime changes
    if (!mapStackUnsubscribe) {
      mapStackUnsubscribe = subscribeToMapStack(viewer, handleMapRegimeChange);
    }

    isWandering = true;
    nudgeTilesetStreaming('wander-start', { force: true });
    governorRequestRender('wander-start');
    return true;
  }

  /**
   * Halts ground wander mode and cleans up listeners and camera locks.
   */
  function stopWandering() {
    isWandering = false;
    try {
      getGlobalDrawerCoordinator().notifySimulationStopped('wander');
    } catch {}
    releaseContinuousRender('avatar-wander');
    removeInputListeners();
    removeClickHandler();

    if (mapStackUnsubscribe) {
      try {
        mapStackUnsubscribe();
      } catch {}
      mapStackUnsubscribe = null;
    }

    if (preRenderListener && viewer?.scene?.preRender) {
      viewer.scene.preRender.removeEventListener(preRenderListener);
      preRenderListener = null;
    }

    if (thoughtBubble) {
      thoughtBubble.hide();
    }

    if (userAvatar) {
      userAvatar.destroy();
      userAvatar = null;
    }

    if (companionDot) {
      companionDot.destroy();
      companionDot = null;
    }

    if (viewer?.camera?.lookAtTransform) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    return true;
  }

  function snapBack({ preserveCameraMode = false } = {}) {
    if (!userAvatar || !viewer?.camera) return;
    if (!preserveCameraMode) {
      currentCameraMode = WANDER_CAMERA_MODES.ISO_CHASE;
      cameraPitchDeg = getDefaultPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE);
    }
    userAvatar?.setVisible?.(
      currentCameraMode !== WANDER_CAMERA_MODES.FIRST_PERSON,
    );
    if (viewer.camera.lookAtTransform) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    const cart = userAvatar.getCartesian();
    if (cart) {
      const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
        cart,
        new Cesium.Cartesian3(),
      );
      applyCamera(cart, currentCoordinates.heading, normal);
    }
  }

  function getTelemetry() {
    return {
      coordinates: { ...currentCoordinates },
      speedMps: currentSpeedMs,
      speedMph: currentSpeedMs * 2.23694,
      isSprinting,
      cameraMode: currentCameraMode,
      cameraPitchDeg,
      isPointerLocked,
      isTransitioning,
      companionActive: companionEnabled,
      companionName: getCompanionPersonaName(),
      locationLabel: currentLocality?.fullLabel || '',
      shortHudLocation: currentLocality?.shortHudLabel || '',
      isWandering,
    };
  }

  function showDialogBubble(spec, targetCartesian = null) {
    if (!thoughtBubble && viewer) {
      thoughtBubble = createThoughtBubbleOverlay({
        viewer,
        container:
          container || (typeof document !== 'undefined' ? document.body : null),
      });
    }
    const cart =
      targetCartesian ||
      userAvatar?.getCartesian?.() ||
      Cesium.Cartesian3.fromDegrees(
        currentCoordinates.lon,
        currentCoordinates.lat,
        (currentCoordinates.height || 0) + 1.8,
      );
    thoughtBubble?.resetDismissal?.();
    thoughtBubble?.show?.(spec, cart);
  }

  function hideDialogBubble() {
    thoughtBubble?.hide?.();
  }

  function destroy() {
    stopWandering();
    isDestroyed = true;
  }

  return {
    startWandering,
    stopWandering,
    relocateTo,
    setCameraMode,
    getCameraMode,
    cycleCameraMode,
    toggleCompanion,
    isCompanionActive,
    snapBack,
    getTelemetry,
    requestPointerLock,
    exitPointerLock,
    isPointerLocked: () => isPointerLocked,
    setWalkSpeedOverride: (spd) => {
      walkSpeedOverride =
        spd !== null && Number.isFinite(spd) ? Number(spd) : null;
    },
    getWalkSpeedOverride: () => walkSpeedOverride,
    setExternalController: (ctrl) => {
      externalController = ctrl || null;
    },
    getExternalController: () => externalController,
    showDialogBubble,
    hideDialogBubble,
    onPointerLockChange: (cb) => {
      if (typeof cb === 'function') {
        pointerLockListeners.add(cb);
        return () => pointerLockListeners.delete(cb);
      }
      return () => {};
    },
    getCameraPitch: () => cameraPitchDeg,
    setCameraPitch: (deg) => {
      cameraPitchDeg = clampPitchForMode(currentCameraMode, deg);
    },
    isTransitioning: () => isTransitioning,
    cancelSwoopTransition,
    onTelemetry: (cb) => {
      onTelemetryCallback = cb;
    },
    destroy,
    clearInputState,
    get isWandering() {
      return isWandering;
    },
    get isDestroyed() {
      return isDestroyed;
    },
    getUserAvatar: () => userAvatar,
    getCompanion: () => companionDot,
    getCompanionDot: () => companionDot,
    _handleKeyDown: handleKeyDown,
    _handleKeyUp: handleKeyUp,
    _handleWindowBlur: handleWindowBlur,
    _handleWindowFocus: handleWindowFocus,
    _handleMouseDown: handleMouseDown,
    _handleMouseMove: handleMouseMove,
    _handleMouseUp: handleMouseUp,
    _handleContextMenu: handleContextMenu,
    _handleDblClick: handleDblClick,
    _handlePointerLockChange: handlePointerLockChange,
  };
}
