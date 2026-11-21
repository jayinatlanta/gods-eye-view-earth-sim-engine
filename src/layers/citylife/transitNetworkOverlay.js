import * as Cesium from 'cesium';

/**
 * Create mutable state for batched transit route corridor & station/stop primitives.
 */
export function createRouteOverlayState() {
  return {
    polylineCollection: null,
    pointCollection: null,
    points: [],
    visible: true,
  };
}

export function setRouteOverlayVisible(overlay, visible) {
  if (!overlay) return;
  overlay.visible = Boolean(visible);
  if (overlay.polylineCollection) {
    overlay.polylineCollection.show = overlay.visible;
  }
  if (overlay.pointCollection) {
    overlay.pointCollection.show = overlay.visible;
  }
}

export function createSafeColorMaterial(color) {
  if (typeof Cesium.Material?.fromType !== 'function') return undefined;
  try {
    return Cesium.Material.fromType('Color', { color });
  } catch {
    return undefined;
  }
}

/**
 * Append a transit route corridor polyline and optional station/stop markers to the
 * shared batched GPU primitive collections without allocating extra Cesium entities.
 */
export function appendRouteOverlay(
  overlay,
  viewer,
  {
    positions = [],
    stops = [],
    liveryColor = '#38bdf8',
    elevOffsetMeters = 0,
  } = {},
) {
  if (!overlay) return;
  for (const p of positions) {
    if (p) overlay.points.push(p);
  }
  if (!viewer?.scene?.primitives?.add) return;

  const baseColor = Cesium.Color.fromCssColorString(liveryColor || '#38bdf8');

  if (
    positions.length >= 2 &&
    typeof Cesium.PolylineCollection === 'function'
  ) {
    try {
      if (!overlay.polylineCollection) {
        overlay.polylineCollection = new Cesium.PolylineCollection();
        overlay.polylineCollection.show = overlay.visible !== false;
        viewer.scene.primitives.add(overlay.polylineCollection);
      }
      const mat = createSafeColorMaterial(baseColor.withAlpha(0.82));
      overlay.polylineCollection.add({
        positions,
        width: 3.0,
        ...(mat ? { material: mat } : {}),
        show: true,
      });
    } catch {
      /* headless / non-DOM environments without HTMLCanvasElement skip WebGL Material setup */
    }
  }

  if (
    stops &&
    stops.length > 0 &&
    typeof Cesium.PointPrimitiveCollection === 'function'
  ) {
    try {
      if (!overlay.pointCollection) {
        overlay.pointCollection = new Cesium.PointPrimitiveCollection();
        overlay.pointCollection.show = overlay.visible !== false;
        viewer.scene.primitives.add(overlay.pointCollection);
      }
      const outlineColor = Cesium.Color.fromCssColorString('#f8fafc');
      for (const s of stops) {
        if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lon)) continue;
        const pos = Cesium.Cartesian3.fromDegrees(
          s.lon,
          s.lat,
          (s.elev || 0) + (elevOffsetMeters || 0) + 1.5,
        );
        overlay.points.push(pos);
        overlay.pointCollection.add({
          position: pos,
          pixelSize: 5.5,
          color: baseColor.withAlpha(0.95),
          outlineColor,
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    } catch {
      /* headless / non-DOM safety */
    }
  }
}

/**
 * Remove batched route corridor and station/stop primitives from the scene.
 */
export function clearRouteOverlay(overlay, viewer) {
  if (!overlay) return;
  if (viewer?.scene?.primitives?.remove) {
    if (overlay.polylineCollection) {
      try {
        viewer.scene.primitives.remove(overlay.polylineCollection);
      } catch {}
    }
    if (overlay.pointCollection) {
      try {
        viewer.scene.primitives.remove(overlay.pointCollection);
      } catch {}
    }
  }
  overlay.polylineCollection = null;
  overlay.pointCollection = null;
  overlay.points = [];
}

/**
 * Frame the entire active city transit network (routes, stops, and live contacts)
 * centered in an oblique macro overview so all system contacts remain in view.
 */
export function flyCameraToTransitNetwork(
  viewer,
  {
    overlayPoints = [],
    contactPositions = [],
    fallbackCenter = { lat: 33.754, lon: -84.3915, elev: 310 },
  } = {},
) {
  if (!viewer?.camera) return;

  const samplePts = [];
  for (const p of overlayPoints) {
    if (p) samplePts.push(p);
  }
  for (const p of contactPositions) {
    if (p) samplePts.push(p);
  }
  if (samplePts.length === 0) {
    samplePts.push(
      Cesium.Cartesian3.fromDegrees(
        fallbackCenter.lon,
        fallbackCenter.lat,
        fallbackCenter.elev || 0,
      ),
    );
  }

  let centerPos = samplePts[0];
  let radiusMeters = 1800;
  if (
    samplePts.length >= 2 &&
    typeof Cesium.BoundingSphere?.fromPoints === 'function'
  ) {
    const sphere = Cesium.BoundingSphere.fromPoints(samplePts);
    if (sphere?.center) {
      centerPos = sphere.center;
      radiusMeters = Math.max(900, sphere.radius || 1800);
    }
  }

  const centerCarto = Cesium.Cartographic.fromCartesian(
    centerPos,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Cartographic(),
  );
  const centerLon = Cesium.Math.toDegrees(centerCarto.longitude);
  const centerLat = Cesium.Math.toDegrees(centerCarto.latitude);
  const baseHeight = Math.max(
    0,
    centerCarto.height || fallbackCenter.elev || 0,
  );

  // Altitude scales cleanly with system span so downtown loops, city-wide metros,
  // and intercity corridors all fit inside the viewport.
  const altAboveNetMeters = Math.max(
    3600,
    Math.min(950000, radiusMeters * 2.1),
  );
  const headingDeg = 12;
  const headingRad = Cesium.Math.toRadians(headingDeg);
  const pitchRad = Cesium.Math.toRadians(-62);
  const groundBackMeters =
    altAboveNetMeters / Math.tan(Cesium.Math.toRadians(62));

  // Shift camera slightly behind the heading vector so the pitched camera aims at network center.
  const metersPerDegLat = 111320;
  const metersPerDegLon = Math.max(
    25000,
    Math.cos(centerCarto.latitude) * 111320,
  );
  const dLat = -(Math.cos(headingRad) * groundBackMeters) / metersPerDegLat;
  const dLon = -(Math.sin(headingRad) * groundBackMeters) / metersPerDegLon;

  const dest = Cesium.Cartesian3.fromDegrees(
    centerLon + dLon,
    centerLat + dLat,
    baseHeight + altAboveNetMeters,
  );

  if (typeof viewer.camera.flyTo === 'function') {
    viewer.camera.flyTo({
      destination: dest,
      orientation: {
        heading: headingRad,
        pitch: pitchRad,
        roll: 0,
      },
      duration: 1.6,
    });
  }
}
