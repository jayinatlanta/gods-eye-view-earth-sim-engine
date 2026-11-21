/**
 * Live Pose — dynamic (per-frame) position & orientation for moving 3D contacts.
 *
 * WHY THIS EXISTS (Outlined Contact Reticle Invariant):
 * Cesium classifies a `box` entity whose position is a ConstantPositionProperty
 * as STATIC geometry. Every `setValue()` (or re-assignment) on that property
 * raises `definitionChanged`, which tears the geometry instance out of its
 * batch and rebuilds the primitive ASYNCHRONOUSLY. When that happens every
 * frame, the replacement primitive never becomes ready — so the outlined box
 * is either frozen where it spawned or never drawn at all, while `point`
 * entities (no geometry) keep tracking. That is exactly the "only the orbital
 * dot tracks, chase/iso/heli cameras show an empty road" symptom.
 *
 * A `CallbackPositionProperty` with `isConstant = false` makes BoxGeometryUpdater
 * treat the entity as DYNAMIC geometry: the primitive is built once and only its
 * model matrix is refreshed each frame (exactly how Infinite Drive's
 * `CallbackProperty` stalker box and rail's `SampledPositionProperty` work).
 */

import * as Cesium from 'cesium';

/**
 * Creates a mutable pose that a moving entity reads every frame.
 *
 * @param {Cesium.Cartesian3} initialPosition
 * @param {Cesium.Quaternion} [initialOrientation]
 * @returns {{
 *   position: Cesium.CallbackPositionProperty,
 *   orientation: Cesium.CallbackProperty,
 *   set: (position?: Cesium.Cartesian3, orientation?: Cesium.Quaternion) => void,
 *   get: () => { position: Cesium.Cartesian3, orientation: Cesium.Quaternion|undefined },
 * }}
 */
export function createLivePose(initialPosition, initialOrientation) {
  const state = {
    position: initialPosition,
    orientation: initialOrientation,
  };
  return {
    position: new Cesium.CallbackPositionProperty(() => state.position, false),
    orientation: new Cesium.CallbackProperty(() => state.orientation, false),
    set(position, orientation) {
      if (position) state.position = position;
      if (orientation) state.orientation = orientation;
    },
    get() {
      return state;
    },
  };
}
