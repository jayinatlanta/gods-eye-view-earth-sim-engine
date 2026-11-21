/**
 * Freight Camera Suite & Multi-Modal Tracking Choreography for God's Eye View.
 * (Transcontinental Freight & Intermodal Logistics Sim)
 *
 * Implements 5 dedicated operational perspectives:
 * 1. IN_CAB: Driver's seat perspective (+2.4m AGL, forward-facing windshield view over chrome hood)
 * 2. SEMI_CHASE: Third-person trailing chase (+4.5m AGL, trailing 14m behind 53ft trailer)
 * 3. APRON_TRANSLOAD: Elevated isometric cargo apron view (+6.5m AGL, framing ULD high-loaders and trailer bays)
 * 4. HELI_PATROL: Highway Patrol / News Copter lateral tracking shot (+48m AGL, flying alongside at speed)
 * 5. MACRO_ORBITAL: High-altitude satellite overview (+8,500m AGL, tracing continental supply splines)
 */

import * as Cesium from 'cesium';
import {
  createSurfaceTracker,
  trySampleSurfaceHeight,
} from '../citylife/surfaceHeight.js';

export const FREIGHT_CAMERA_MODES = Object.freeze({
  IN_CAB: 'IN_CAB',
  SEMI_CHASE: 'SEMI_CHASE',
  APRON_TRANSLOAD: 'APRON_TRANSLOAD',
  HELI_PATROL: 'HELI_PATROL',
  MACRO_ORBITAL: 'MACRO_ORBITAL',
});

export const FREIGHT_CAMERA_BADGES = Object.freeze({
  IN_CAB: '💺 In-Cab Windshield & Hood',
  SEMI_CHASE: '🚛 53ft Trailer Chase',
  APRON_TRANSLOAD: '🏗️ Apron Transload Cam',
  HELI_PATROL: '🚁 Highway Patrol Heli',
  MACRO_ORBITAL: '🛰️ Macro Orbital Overview',
});

// Relative offset vectors (X: right, Y: forward, Z: up) in vehicle local frame
export const FREIGHT_CAMERA_OFFSETS = Object.freeze({
  IN_CAB: { x: -0.65, y: 1.4, z: 2.45 }, // Inside windshield over steering wheel
  SEMI_CHASE: { x: 0.0, y: -38.0, z: 11.5 }, // Elevated behind 53ft trailer box (19m behind trailer rear)
  APRON_TRANSLOAD: { x: 22.0, y: -18.0, z: 14.0 }, // Elevated isometric dock framing
  HELI_PATROL: { x: -26.0, y: -45.0, z: 35.0 }, // High lateral chase matching highway cruising
  MACRO_ORBITAL: { x: 0.0, y: -4200.0, z: 6800.0 }, // Continental satellite perspective
});

/**
 * Computes forward and right basis vectors from position and forward heading vector.
 */
export function computeVehicleBasis(position, forwardHeading) {
  if (!position || !forwardHeading) return null;

  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    position,
    new Cesium.Cartesian3(),
  );

  const forward = Cesium.Cartesian3.normalize(
    forwardHeading,
    new Cesium.Cartesian3(),
  );

  // Compute right vector: forward x up
  const right = Cesium.Cartesian3.cross(forward, up, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(right, right);

  // Re-orthogonalize up vector: right x forward
  Cesium.Cartesian3.cross(right, forward, up);
  Cesium.Cartesian3.normalize(up, up);

  return { right, forward, up };
}

// Minimum clearance (metres) the eye must keep above the sampled surface.
const SURFACE_CLEARANCE = Object.freeze({
  IN_CAB: 2.0,
  SEMI_CHASE: 4.0,
  APRON_TRANSLOAD: 4.0,
  HELI_PATROL: 6.0,
  MACRO_ORBITAL: 50.0,
});

// Minimum clearance (metres) above the ROAD under the truck. This is the
// tile-agnostic hard floor: it holds even when no surface sample is available.
const ROAD_CLEARANCE = Object.freeze({
  IN_CAB: 2.0,
  SEMI_CHASE: 4.5,
  APRON_TRANSLOAD: 6.0,
  HELI_PATROL: 12.0,
  MACRO_ORBITAL: 500.0,
});

// Tractor center sits this far above the road surface (see TRACTOR_CENTER_HEIGHT_OFFSET).
const TRACTOR_CENTER_ABOVE_ROAD = 2.25;

// Per-viewer camera floor state: throttled/slew-limited surface tracker plus a
// "sticky" floor that descends slowly so the lens glides back down after an
// overpass or tree canopy instead of snapping.
const cameraFloorState = new WeakMap();
const FLOOR_DESCENT_MPS = 8.0;

function nowMs() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

/**
 * Raises `eyePos` in place so it never sits below (a) the road under the truck
 * or (b) the rendered surface (terrain DEM or Google 3D Tiles mesh) under the eye.
 */
function enforceCameraFloor(viewer, eyePos, truckPos, mode, excludeEntities) {
  const roadClear = ROAD_CLEARANCE[mode] ?? ROAD_CLEARANCE.SEMI_CHASE;
  const surfClear = SURFACE_CLEARANCE[mode] ?? SURFACE_CLEARANCE.SEMI_CHASE;

  const camCarto = Cesium.Cartographic.fromCartesian(
    eyePos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (!camCarto || !Number.isFinite(camCarto.height)) return;

  // (a) Tile-agnostic hard floor: road height under the truck + mode clearance.
  let floorH = -Infinity;
  const truckCarto = Cesium.Cartographic.fromCartesian(
    truckPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  if (truckCarto && Number.isFinite(truckCarto.height)) {
    floorH = truckCarto.height - TRACTOR_CENTER_ABOVE_ROAD + roadClear;
  }

  // (b) Rendered-surface floor under the eye (3D Tiles mesh or terrain DEM).
  if (viewer?.scene) {
    let state = cameraFloorState.get(viewer);
    if (!state) {
      state = {
        tracker: createSurfaceTracker({
          sampleIntervalMs: 100,
          slewMps: 12.0,
          snapMeters: 40.0,
        }),
        stickyFloor: null,
        lastMs: null,
      };
      cameraFloorState.set(viewer, state);
    }
    const t = nowMs();
    const surfaceH = state.tracker.update(viewer, camCarto, t, {
      excludeEntities,
    });
    if (surfaceH !== null) {
      floorH = Math.max(floorH, surfaceH + surfClear);
    }

    // Sticky descent: rise instantly, fall at FLOOR_DESCENT_MPS.
    if (Number.isFinite(floorH)) {
      const dt =
        state.lastMs === null
          ? 0
          : Math.max(0, Math.min(0.25, (t - state.lastMs) / 1000));
      if (state.stickyFloor !== null && surfaceH !== null) {
        floorH = Math.max(floorH, state.stickyFloor - FLOOR_DESCENT_MPS * dt);
      }
      state.stickyFloor = floorH;
    }
    state.lastMs = t;
  }

  if (Number.isFinite(floorH) && camCarto.height < floorH) {
    camCarto.height = floorH;
    Cesium.Cartesian3.fromRadians(
      camCarto.longitude,
      camCarto.latitude,
      camCarto.height,
      Cesium.Ellipsoid.WGS84,
      eyePos,
    );
  }
}

/**
 * Computes world camera position and look target in vehicle local coordinates.
 */
export function calculateFreightCameraTransform(
  position,
  forwardHeading,
  mode = FREIGHT_CAMERA_MODES.SEMI_CHASE,
  viewer = null,
  excludeEntities = [],
) {
  const basis = computeVehicleBasis(position, forwardHeading);
  if (!basis) return null;

  const offset =
    FREIGHT_CAMERA_OFFSETS[mode] || FREIGHT_CAMERA_OFFSETS.SEMI_CHASE;

  // Eye position: P + right*x + forward*y + up*z
  const eyePos = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());

  const xShift = Cesium.Cartesian3.multiplyByScalar(
    basis.right,
    offset.x,
    new Cesium.Cartesian3(),
  );
  const yShift = Cesium.Cartesian3.multiplyByScalar(
    basis.forward,
    offset.y,
    new Cesium.Cartesian3(),
  );
  const zShift = Cesium.Cartesian3.multiplyByScalar(
    basis.up,
    offset.z,
    new Cesium.Cartesian3(),
  );

  Cesium.Cartesian3.add(eyePos, xShift, eyePos);
  Cesium.Cartesian3.add(eyePos, yShift, eyePos);
  Cesium.Cartesian3.add(eyePos, zShift, eyePos);

  // ABSOLUTE ANTI-SUBTERRANEAN CAMERA GUARANTEE (dual-regime):
  // Never allow eyePos to sink into or below the terrain mesh OR the Google
  // Photorealistic 3D Tiles surface (where `globe.getHeight` is blind because
  // the globe is hidden).
  enforceCameraFloor(viewer, eyePos, position, mode, excludeEntities);

  // Look-at target
  let lookTarget = Cesium.Cartesian3.clone(position, new Cesium.Cartesian3());
  if (mode === FREIGHT_CAMERA_MODES.IN_CAB) {
    // In-cab: look forward along road 80 meters ahead
    const fwdLook = Cesium.Cartesian3.multiplyByScalar(
      basis.forward,
      80.0,
      new Cesium.Cartesian3(),
    );
    const upLook = Cesium.Cartesian3.multiplyByScalar(
      basis.up,
      1.5,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(lookTarget, fwdLook, lookTarget);
    Cesium.Cartesian3.add(lookTarget, upLook, lookTarget);
  } else if (mode === FREIGHT_CAMERA_MODES.SEMI_CHASE) {
    // Semi chase: look at fifth wheel hitch / trailer center (-6m behind tractor) +2.2m AGL
    const fwdLook = Cesium.Cartesian3.multiplyByScalar(
      basis.forward,
      -6.0,
      new Cesium.Cartesian3(),
    );
    const upLook = Cesium.Cartesian3.multiplyByScalar(
      basis.up,
      2.2,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(lookTarget, fwdLook, lookTarget);
    Cesium.Cartesian3.add(lookTarget, upLook, lookTarget);
  } else if (mode === FREIGHT_CAMERA_MODES.HELI_PATROL) {
    // Heli: look directly at truck consist from aerial angle
    const fwdLook = Cesium.Cartesian3.multiplyByScalar(
      basis.forward,
      -4.0,
      new Cesium.Cartesian3(),
    );
    const upLook = Cesium.Cartesian3.multiplyByScalar(
      basis.up,
      2.0,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(lookTarget, fwdLook, lookTarget);
    Cesium.Cartesian3.add(lookTarget, upLook, lookTarget);
  } else if (mode === FREIGHT_CAMERA_MODES.APRON_TRANSLOAD) {
    const upLook = Cesium.Cartesian3.multiplyByScalar(
      basis.up,
      2.5,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(lookTarget, upLook, lookTarget);
  }

  // Also clamp lookTarget above ground (terrain DEM or Google 3D Tiles) so the
  // camera does not look downward into subterranean rock
  if (viewer?.scene) {
    const targetCarto = Cesium.Cartographic.fromCartesian(
      lookTarget,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Cartographic(),
    );
    const targetGroundH = trySampleSurfaceHeight(
      viewer,
      targetCarto,
      excludeEntities,
    );
    if (
      Number.isFinite(targetGroundH) &&
      targetCarto.height < targetGroundH + 0.8
    ) {
      targetCarto.height = targetGroundH + 0.8;
      Cesium.Cartesian3.fromRadians(
        targetCarto.longitude,
        targetCarto.latitude,
        targetCarto.height,
        Cesium.Ellipsoid.WGS84,
        lookTarget,
      );
    }
  }

  return { eyePos, lookTarget, up: basis.up };
}

/**
 * Applies rock-solid deterministic camera framing for the active freight truck.
 */
export function applyFreightCameraFollow(
  viewer,
  position,
  forwardHeading,
  mode = FREIGHT_CAMERA_MODES.SEMI_CHASE,
  excludeEntities = [],
) {
  if (!viewer?.camera || !position || !forwardHeading) return;

  const transform = calculateFreightCameraTransform(
    position,
    forwardHeading,
    mode,
    viewer,
    excludeEntities,
  );
  if (!transform) return;

  // Compute camera direction
  const direction = Cesium.Cartesian3.subtract(
    transform.lookTarget,
    transform.eyePos,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(direction, direction);

  viewer.camera.setView({
    destination: transform.eyePos,
    orientation: {
      direction,
      up: transform.up,
    },
  });
}
