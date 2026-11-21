/**
 * Dual-Regime Surface Height & Depth-Buffer Ground Raycasting Engine.
 * (Living World Sim: Dual-Regime 3D Surface & Camera Grounding)
 *
 * Provides unified, polymorphic elevation sampling and raycasting across both:
 * 1. Google Photorealistic 3D Tiles (globe hidden, depth buffer & Cesium3DTileset mesh)
 * 2. 2D Terrain Globe (Esri satellite, Bing, OSM draped across DEM elevation)
 */

import * as Cesium from 'cesium';

/**
 * Checks whether Google Photorealistic 3D Tiles is actively rendering
 * (indicated canonically across GEV by scene.globe.show === false).
 *
 * @param {Cesium.Viewer} viewer
 * @returns {boolean}
 */
export function isPhotoreal3DActive(viewer) {
  return Boolean(viewer?.scene?.globe && viewer.scene.globe.show === false);
}

/**
 * Samples the ground height (metres above WGS84 ellipsoid) at given cartographic coordinate.
 * Polymorphically selects between 3D tileset mesh sampling and globe DEM elevation.
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartographic} carto
 * @param {Array<object>} [excludeEntities=[]] - Entities or primitives to exclude from sampling
 * @returns {number} Ellipsoidal height in metres
 */
export function sampleActiveGroundHeight(viewer, carto, excludeEntities = []) {
  if (!viewer?.scene || !carto) return carto?.height || 0;
  const sampled = trySampleSurfaceHeight(viewer, carto, excludeEntities);
  if (sampled !== null) return sampled;

  // Fallback to existing cartographic height or 0
  return Number.isFinite(carto.height) ? carto.height : 0;
}

/**
 * Samples the rendered surface height, returning `null` (instead of a made-up
 * fallback) when nothing is sampleable yet. Callers that apply clearance
 * buffers (camera floors, vehicle ride height) MUST use this rather than
 * `sampleActiveGroundHeight`, whose fallback echoes the input height and would
 * otherwise be mistaken for real ground.
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartographic} carto
 * @param {Array<object>} [excludeEntities=[]]
 * @returns {number|null} Ellipsoidal height in metres, or null if unavailable
 */
export function trySampleSurfaceHeight(viewer, carto, excludeEntities = []) {
  if (!viewer?.scene || !carto) return null;
  const scene = viewer.scene;
  const is3D = isPhotoreal3DActive(viewer);

  // 1. If in Google 3D Tiles mode (globe hidden), query 3D tileset mesh depth
  if (
    is3D &&
    scene.sampleHeightSupported &&
    typeof scene.sampleHeight === 'function'
  ) {
    try {
      const meshH = scene.sampleHeight(carto, excludeEntities);
      if (
        typeof meshH === 'number' &&
        Number.isFinite(meshH) &&
        meshH >= -500 &&
        meshH <= 9000
      ) {
        return meshH;
      }
    } catch {
      /* not sampleable yet */
    }
  }

  // 2. If in 2D Terrain Globe mode (or 3D sample fallback), query DEM terrain elevation
  if (scene.globe?.getHeight) {
    try {
      const globeH = scene.globe.getHeight(carto);
      if (typeof globeH === 'number' && Number.isFinite(globeH)) {
        return globeH;
      }
    } catch {
      /* terrain tile unrendered */
    }
  }

  return null;
}

/**
 * Creates a throttled, slew-limited surface-height tracker for a moving contact
 * or camera. Raw `scene.sampleHeight` on Google 3D Tiles is expensive (a depth
 * pick per call) and returns tree-canopy / overpass spikes; this wrapper
 * (a) samples at most once per `sampleIntervalMs`, (b) snaps on first
 * acquisition or large discontinuities (tiles just streamed in), and
 * (c) otherwise glides toward new samples at `slewMps` so a canopy spike does
 * not yank the contact or camera vertically.
 *
 * @param {object} [options]
 * @param {number} [options.sampleIntervalMs=200]
 * @param {number} [options.slewMps=3]
 * @param {number} [options.snapMeters=25]
 */
export function createSurfaceTracker({
  sampleIntervalMs = 200,
  slewMps = 3,
  snapMeters = 25,
  maxSpikeMeters = Infinity,
} = {}) {
  let height = null;
  let target = null;
  let pendingSpike = null;
  let lastSampleMs = -Infinity;
  let lastUpdateMs = null;

  return {
    /**
     * @param {Cesium.Viewer} viewer
     * @param {Cesium.Cartographic} carto
     * @param {number} nowMs
     * @param {{ excludeEntities?: object[], intervalMs?: number }} [opts]
     * @returns {number|null} Tracked surface height, or null if never sampled
     */
    update(viewer, carto, nowMs, opts = {}) {
      const interval = opts.intervalMs ?? sampleIntervalMs;
      if (nowMs - lastSampleMs >= interval) {
        lastSampleMs = nowMs;
        const sample = trySampleSurfaceHeight(
          viewer,
          carto,
          opts.excludeEntities || [],
        );
        if (sample !== null) {
          const isOutlierSpike =
            height !== null &&
            Number.isFinite(maxSpikeMeters) &&
            sample - height > maxSpikeMeters &&
            (pendingSpike === null || Math.abs(sample - pendingSpike) > 8);

          if (isOutlierSpike) {
            // Transient rooftop/overpass outlier on 3D Tiles: wait for a
            // second corroborating sample before committing the jump.
            pendingSpike = sample;
          } else {
            pendingSpike = null;
            if (height === null || Math.abs(sample - height) > snapMeters) {
              height = sample;
            }
            target = sample;
          }
        }
      }

      const dt =
        lastUpdateMs === null
          ? 0
          : Math.max(0, Math.min(0.25, (nowMs - lastUpdateMs) / 1000));
      lastUpdateMs = nowMs;

      if (height !== null && target !== null && height !== target) {
        const step = slewMps * dt;
        const delta = target - height;
        height += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
      }
      return height;
    },
    get height() {
      return height;
    },
    reset() {
      height = null;
      target = null;
      pendingSpike = null;
      lastSampleMs = -Infinity;
      lastUpdateMs = null;
    },
  };
}

/**
 * Casts a ray or samples the depth buffer at windowPosition, returning the exact Cartesian3 ground hit.
 * Works on Google 3D Tiles, terrain globe meshes, and flat ellipsoid alike.
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cartesian2} windowPosition
 * @returns {Cesium.Cartesian3|null} Ground intersection Cartesian3 or null
 */
export function pickActiveGroundPosition(viewer, windowPosition) {
  if (!viewer?.scene || !windowPosition) return null;
  const scene = viewer.scene;

  // 1. Depth buffer pick (works on Google 3D Tiles AND terrain globe meshes alike)
  if (scene.pickPositionSupported && typeof scene.pickPosition === 'function') {
    try {
      const picked = scene.pickPosition(windowPosition);
      if (picked && Number.isFinite(picked.x) && !Number.isNaN(picked.x)) {
        const carto = Cesium.Cartographic.fromCartesian(
          picked,
          Cesium.Ellipsoid.WGS84,
        );
        if (
          carto &&
          Number.isFinite(carto.latitude) &&
          Number.isFinite(carto.longitude) &&
          Number.isFinite(carto.height)
        ) {
          // Plausible ellipsoidal land altitude (-500m Dead Sea to 9000m Everest)
          if (carto.height >= -500 && carto.height <= 9000) {
            return picked;
          }
        }
      }
    } catch {
      /* fallback to ray */
    }
  }

  // 2. Globe raycast pick (for standard 2D terrain)
  if (scene.globe && viewer.camera) {
    try {
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) {
        const globeCart = scene.globe.pick(ray, scene);
        if (globeCart && Number.isFinite(globeCart.x)) {
          return globeCart;
        }
      }
    } catch {
      /* fallback */
    }
  }

  // 3. Ellipsoid mathematical intersection fallback
  if (viewer.camera) {
    try {
      const ellipCart = viewer.camera.pickEllipsoid(
        windowPosition,
        Cesium.Ellipsoid.WGS84,
      );
      if (ellipCart && Number.isFinite(ellipCart.x)) {
        return ellipCart;
      }
    } catch {
      /* null */
    }
  }

  return null;
}

/**
 * Calculates true camera height above ground level (AGL) in metres,
 * preventing altitude-gate traps in elevated cities.
 *
 * @param {Cesium.Viewer} viewer
 * @returns {number} True AGL distance in metres
 */
export function calculateTrueAGL(viewer) {
  if (!viewer?.scene?.canvas || !viewer?.camera) return 999999;
  const canvas = viewer.scene.canvas;
  const center = new Cesium.Cartesian2(
    (canvas.clientWidth || canvas.width || 800) / 2,
    (canvas.clientHeight || canvas.height || 600) / 2,
  );
  const groundPos = pickActiveGroundPosition(viewer, center);
  const camPos = viewer.camera.positionWC || viewer.camera.position;
  if (groundPos && camPos) {
    return Cesium.Cartesian3.distance(camPos, groundPos);
  }
  const carto = viewer.camera.positionCartographic;
  if (carto) {
    const surfaceH = sampleActiveGroundHeight(viewer, carto);
    return Math.max(0, carto.height - surfaceH);
  }
  return 999999;
}

/**
 * Subscribes to map style switches / surface regime flips (Google 3D vs 2D globe).
 *
 * @param {Cesium.Viewer} viewer
 * @param {Function} onRegimeChange - Callback receiving { isPhotoreal3D, globeShown }
 * @returns {Function} Unsubscribe teardown function
 */
export function subscribeToMapStack(viewer, onRegimeChange) {
  if (!viewer?.scene?.globe || typeof onRegimeChange !== 'function') {
    return () => {};
  }
  let lastState = viewer.scene.globe.show;
  const removeListener = viewer.scene.preRender.addEventListener(() => {
    const currentState = viewer.scene.globe.show;
    if (currentState !== lastState) {
      lastState = currentState;
      try {
        onRegimeChange({
          isPhotoreal3D: currentState === false,
          globeShown: currentState,
        });
      } catch (err) {
        console.warn('[surfaceHeight] onRegimeChange callback error:', err);
      }
    }
  });
  return removeListener;
}
