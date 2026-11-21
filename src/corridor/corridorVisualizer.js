/**
 * Macro Corridor & Spatial Relationship Visualizer.
 * (Universal Place-to-Place Spatial Relationship & Multi-Modal Corridor Explorer)
 *
 * Renders the spatial relationship overlay on the Cesium globe:
 * - Origin (A) & Destination (B) high-contrast pins (cyan & amber, depth-test disabled)
 * - Parabolic 3D geodesic arc with PolylineGlow styling
 * - Dashed surface ground-track polyline
 * - Geodesic midpoint badge showing distance + initial bearing
 * - Optional emerald OSRM road route preview polyline
 * - Proportional orbital camera framing (-62° pitch, cancelFlight + clear trackedEntity)
 *
 * Strictly one-shot discrete mutations routed through governorRequestRender() —
 * zero continuous render-loop holds.
 */

import * as Cesium from 'cesium';
import { greatCircleKm } from '../geoDistance.js';
import { governorRequestRender } from '../renderGovernor.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const ORIGIN_COLOR_HEX = '#22d3ee';
export const DEST_COLOR_HEX = '#f59e0b';
export const ARC_COLOR_HEX = '#22d3ee';
export const GROUND_TRACK_HEX = '#38bdf8';
export const ROAD_PREVIEW_HEX = '#10b981';

function toUnitVector(latDeg, lonDeg) {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

function fromUnitVector(x, y, z) {
  const hyp = Math.hypot(x, y);
  return {
    lat: Math.atan2(z, hyp) * RAD_TO_DEG,
    lon: Math.atan2(y, x) * RAD_TO_DEG,
  };
}

/**
 * Sample a smooth parabolic 3D geodesic arc between two geographic endpoints.
 * Pure spherical SLERP — safe in unit tests without terrain providers.
 */
export function buildGeodesicArcPositions(
  origin,
  destination,
  { steps = 48, peakAltitudeM = null } = {},
) {
  if (!origin || !destination) return [];
  const stepCount = Math.max(4, Math.round(steps));
  const distKm = greatCircleKm(origin, destination);
  const autoPeakM =
    Number.isFinite(peakAltitudeM) && peakAltitudeM >= 0
      ? peakAltitudeM
      : Math.min(320_000, Math.max(220, distKm * 90));

  const a = toUnitVector(origin.lat, origin.lon);
  const b = toUnitVector(destination.lat, destination.lon);
  const dot = Math.max(
    -1,
    Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  );
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const originElev = Number.isFinite(origin.elev) ? origin.elev : 0;
  const destElev = Number.isFinite(destination.elev) ? destination.elev : 0;

  const points = [];
  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;
    let x;
    let y;
    let z;
    if (sinOmega < 1e-6) {
      x = a[0] * (1 - t) + b[0] * t;
      y = a[1] * (1 - t) + b[1] * t;
      z = a[2] * (1 - t) + b[2] * t;
    } else {
      const k0 = Math.sin((1 - t) * omega) / sinOmega;
      const k1 = Math.sin(t * omega) / sinOmega;
      x = a[0] * k0 + b[0] * k1;
      y = a[1] * k0 + b[1] * k1;
      z = a[2] * k0 + b[2] * k1;
    }
    const { lat, lon } = fromUnitVector(x, y, z);
    const baseElev = originElev * (1 - t) + destElev * t;
    const altM = baseElev + 18 + 4 * t * (1 - t) * autoPeakM;
    points.push({
      lat,
      lon,
      altM,
      cartesian: Cesium.Cartesian3.fromDegrees(lon, lat, altM),
    });
  }
  return points;
}

/**
 * Compute proportional orbital camera framing for a spatial relationship.
 * Offsets camera latitude south of the midpoint so an oblique pitch (-62 deg)
 * aims its optical center directly at the corridor midpoint instead of north
 * of the corridor.
 */
export function computeOrbitalCameraPose(relationship) {
  if (!relationship) return null;
  const framing = relationship.framing || {};
  const centerLat = Number.isFinite(framing.centerLat)
    ? framing.centerLat
    : (relationship.midpoint?.lat ?? 0);
  const centerLon = Number.isFinite(framing.centerLon)
    ? framing.centerLon
    : (relationship.midpoint?.lon ?? 0);
  const km = Number.isFinite(relationship.greatCircleKm)
    ? relationship.greatCircleKm
    : 500;
  const altitudeM = Number.isFinite(framing.altitudeM)
    ? framing.altitudeM
    : Math.max(120_000, Math.min(18_000_000, Math.round(km * 1_650)));
  const pitchDeg = Number.isFinite(framing.pitchDeg) ? framing.pitchDeg : -62;

  const nadirRad = ((90 + pitchDeg) * Math.PI) / 180;
  const blend = km <= 4_500 ? 1 : Math.max(0.2, 4_500 / km);
  const southOffsetDeg = Math.min(
    55,
    ((altitudeM * Math.tan(nadirRad)) / 111_320) * blend,
  );
  const destinationLat = Math.max(
    -85,
    Math.min(85, centerLat - southOffsetDeg),
  );

  return {
    destinationLat,
    destinationLon: centerLon,
    centerLat,
    centerLon,
    altitudeM,
    headingDeg: 0,
    pitchDeg,
    rollDeg: 0,
  };
}

function escapeSvgText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPillBillboardImage(text, borderHex) {
  const safe = escapeSvgText(text);
  const width = Math.max(96, Math.min(360, safe.length * 7.2 + 24));
  const height = 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="6" ry="6" fill="rgba(15,23,42,0.92)" stroke="${borderHex}" stroke-width="1.5"/><text x="${width / 2}" y="17" text-anchor="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="12" font-weight="700" fill="#f8fafc">${safe}</text></svg>`;
  return {
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
  };
}

function buildMarkerOptions({
  id,
  name,
  badgePrefix,
  lat,
  lon,
  elev = 0,
  colorHex,
}) {
  const color = Cesium.Color.fromCssColorString(colorHex);
  const pillText = `${badgePrefix} · ${name}`;
  const pill = buildPillBillboardImage(pillText, colorHex);
  return {
    id,
    name: pillText,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, (elev || 0) + 25),
    point: {
      pixelSize: 12,
      color,
      outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
      outlineWidth: 2.5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    billboard: {
      image: pill.image,
      width: pill.width,
      height: pill.height,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  };
}

function buildRoadPreviewCartesians(roadMode) {
  if (!roadMode) return null;
  const cartesians = [];

  if (Array.isArray(roadMode.roadPoints) && roadMode.roadPoints.length >= 2) {
    for (const pt of roadMode.roadPoints) {
      const lat = Number(pt?.lat);
      const lon = Number(pt?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      cartesians.push(Cesium.Cartesian3.fromDegrees(lon, lat, 28));
    }
    return cartesians.length >= 2 ? cartesians : null;
  }

  const coords = Array.isArray(roadMode.geometry)
    ? roadMode.geometry
    : roadMode.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    cartesians.push(Cesium.Cartesian3.fromDegrees(lon, lat, 28));
  }
  return cartesians.length >= 2 ? cartesians : null;
}

/**
 * Create the 3D Globe Visualizer for Place-to-Place Spatial Relationships.
 */
export function createCorridorVisualizer({ viewer = null } = {}) {
  let dataSource = null;
  let ownsDataSource = false;
  let activeRelationship = null;
  let roadEntity = null;
  let destroyed = false;
  const fallbackEntities = [];

  function ensureEntityCollection() {
    if (!viewer || destroyed) return null;
    if (viewer.dataSources && typeof viewer.dataSources.add === 'function') {
      if (!dataSource) {
        dataSource = new Cesium.CustomDataSource('corridor-relationship');
        dataSource.show = true;
        ownsDataSource = true;
        Promise.resolve(viewer.dataSources.add(dataSource))
          .then(() => {
            if (!destroyed) {
              governorRequestRender('corridor-datasource-ready');
            }
          })
          .catch(() => null);
      }
      return dataSource.entities;
    }
    return viewer.entities || null;
  }

  function addEntity(spec) {
    const collection = ensureEntityCollection();
    if (!collection || typeof collection.add !== 'function') return null;
    const entity = collection.add(spec);
    if (!ownsDataSource) {
      fallbackEntities.push(entity);
    }
    return entity;
  }

  function removeEntity(entity) {
    if (!entity || !viewer) return;
    if (
      dataSource?.entities &&
      typeof dataSource.entities.remove === 'function'
    ) {
      dataSource.entities.remove(entity);
      return;
    }
    if (viewer.entities && typeof viewer.entities.remove === 'function') {
      viewer.entities.remove(entity);
    }
  }

  function clear() {
    roadEntity = null;
    activeRelationship = null;
    if (
      dataSource?.entities &&
      typeof dataSource.entities.removeAll === 'function'
    ) {
      dataSource.entities.removeAll();
    } else if (fallbackEntities.length > 0 && viewer?.entities?.remove) {
      while (fallbackEntities.length > 0) {
        const ent = fallbackEntities.pop();
        try {
          viewer.entities.remove(ent);
        } catch {
          /* ignore already-removed entity */
        }
      }
    }
    governorRequestRender('corridor-clear');
  }

  function updateRoadPreview(roadMode) {
    if (destroyed) return;
    if (roadEntity) {
      removeEntity(roadEntity);
      roadEntity = null;
    }
    const cartesians = buildRoadPreviewCartesians(roadMode);
    if (!cartesians) {
      governorRequestRender('corridor-road-clear');
      return;
    }
    roadEntity = addEntity({
      id: 'corridor-osrm-road-preview',
      name: 'Corridor Road Preview',
      polyline: {
        positions: cartesians,
        width: 3.5,
        clampToGround: true,
        material:
          Cesium.Color.fromCssColorString(ROAD_PREVIEW_HEX).withAlpha(0.9),
      },
    });
    governorRequestRender('corridor-road-preview');
  }

  function frameCorridor(
    relationship = activeRelationship,
    { duration = 1.4 } = {},
  ) {
    if (!viewer?.camera || !relationship || destroyed) return false;
    const pose = computeOrbitalCameraPose(relationship);
    if (!pose) return false;

    try {
      viewer.camera.cancelFlight?.();
    } catch {
      /* ignore cancelFlight errors in stubs */
    }
    if ('trackedEntity' in viewer) {
      viewer.trackedEntity = undefined;
    }

    if (
      typeof viewer.camera.flyToBoundingSphere === 'function' &&
      typeof Cesium.BoundingSphere?.fromPoints === 'function' &&
      typeof Cesium.HeadingPitchRange === 'function' &&
      relationship.origin &&
      relationship.destination
    ) {
      const originPt = Cesium.Cartesian3.fromDegrees(
        relationship.origin.lon,
        relationship.origin.lat,
        relationship.origin.elev || 0,
      );
      const destPt = Cesium.Cartesian3.fromDegrees(
        relationship.destination.lon,
        relationship.destination.lat,
        relationship.destination.elev || 0,
      );
      const baseSphere = Cesium.BoundingSphere.fromPoints([originPt, destPt]);
      const sphereRadius = Math.max(baseSphere.radius || 0, 25_000);
      const distKm = Number.isFinite(relationship.greatCircleKm)
        ? relationship.greatCircleKm
        : 500;
      const rangeM = Math.max(
        pose.altitudeM * 1.15,
        Math.min(20_000_000, sphereRadius * 4.0),
      );

      // Keep the corridor centered in the open canvas to the left of the
      // right-hand Connect Places drawer for regional/continental views.
      let targetCenter = baseSphere.center;
      if (distKm <= 3_500) {
        const cosLat = Math.max(
          0.25,
          Math.cos((pose.centerLat * Math.PI) / 180),
        );
        const eastShiftDeg =
          ((sphereRadius * 0.42) / (111_320 * cosLat)) *
          Math.min(1, 1_500 / Math.max(distKm, 250));
        const shiftedLon = pose.centerLon + eastShiftDeg;
        if (shiftedLon <= 180 && shiftedLon >= -180) {
          targetCenter = Cesium.Cartesian3.fromDegrees(
            shiftedLon,
            pose.centerLat,
            0,
          );
        }
      }

      const framingSphere = new Cesium.BoundingSphere(
        targetCenter,
        sphereRadius,
      );
      viewer.camera.flyToBoundingSphere(framingSphere, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(pose.headingDeg),
          Cesium.Math.toRadians(pose.pitchDeg),
          rangeM,
        ),
        duration,
      });
    } else {
      viewer.camera.flyTo?.({
        destination: Cesium.Cartesian3.fromDegrees(
          pose.destinationLon,
          pose.destinationLat,
          pose.altitudeM,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(pose.headingDeg),
          pitch: Cesium.Math.toRadians(pose.pitchDeg),
          roll: Cesium.Math.toRadians(pose.rollDeg),
        },
        duration,
      });
    }
    governorRequestRender('corridor-frame');
    return true;
  }

  function renderRelationship(
    relationship,
    { roadMode = null, flyCamera = true, duration = 1.4 } = {},
  ) {
    if (destroyed || !relationship?.origin || !relationship?.destination) {
      return null;
    }

    clear();
    activeRelationship = relationship;

    const { origin, destination, midpoint } = relationship;
    const arcSamples = buildGeodesicArcPositions(origin, destination);
    const arcCartesians = arcSamples.map((p) => p.cartesian);
    const groundCartesians = arcSamples.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 12),
    );
    const peakSample = arcSamples[Math.floor(arcSamples.length / 2)];
    const midpointAlt = peakSample ? peakSample.altM + 45 : 250;

    addEntity(
      buildMarkerOptions({
        id: 'corridor-origin-pin',
        name: origin.shortLabel || origin.name,
        badgePrefix: 'A',
        lat: origin.lat,
        lon: origin.lon,
        elev: origin.elev || 0,
        colorHex: ORIGIN_COLOR_HEX,
      }),
    );

    addEntity(
      buildMarkerOptions({
        id: 'corridor-destination-pin',
        name: destination.shortLabel || destination.name,
        badgePrefix: 'B',
        lat: destination.lat,
        lon: destination.lon,
        elev: destination.elev || 0,
        colorHex: DEST_COLOR_HEX,
      }),
    );

    addEntity({
      id: 'corridor-geodesic-arc',
      name: 'Geodesic Relationship Arc',
      polyline: {
        positions: arcCartesians,
        width: 4.5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          taperPower: 1.0,
          color: Cesium.Color.fromCssColorString(ARC_COLOR_HEX),
        }),
      },
    });

    addEntity({
      id: 'corridor-ground-track',
      name: 'Geodesic Ground Track',
      polyline: {
        positions: groundCartesians,
        width: 2.0,
        clampToGround: true,
        material: new Cesium.PolylineDashMaterialProperty({
          color:
            Cesium.Color.fromCssColorString(GROUND_TRACK_HEX).withAlpha(0.55),
          dashLength: 14,
        }),
      },
    });

    if (midpoint) {
      const badgeText = `${relationship.greatCircleKm.toLocaleString('en-US', { maximumFractionDigits: 1 })} km (${relationship.greatCircleMi.toLocaleString('en-US', { maximumFractionDigits: 0 })} mi) · ${relationship.initialBearingDeg}° ${relationship.initialCardinal}`;
      const badgePill = buildPillBillboardImage(badgeText, '#38bdf8');
      addEntity({
        id: 'corridor-midpoint-badge',
        name: badgeText,
        position: Cesium.Cartesian3.fromDegrees(
          midpoint.lon,
          midpoint.lat,
          midpointAlt,
        ),
        billboard: {
          image: badgePill.image,
          width: badgePill.width,
          height: badgePill.height,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    if (roadMode) {
      updateRoadPreview(roadMode);
    }

    if (flyCamera) {
      frameCorridor(relationship, { duration });
    } else {
      governorRequestRender('corridor-render');
    }

    return relationship;
  }

  function destroy() {
    if (destroyed) return;
    clear();
    destroyed = true;
    if (
      ownsDataSource &&
      dataSource &&
      viewer?.dataSources &&
      typeof viewer.dataSources.remove === 'function'
    ) {
      try {
        viewer.dataSources.remove(dataSource, true);
      } catch {
        /* ignore if viewer already tore down */
      }
    }
    dataSource = null;
    ownsDataSource = false;
  }

  return {
    renderRelationship,
    updateRoadPreview,
    frameCorridor,
    clear,
    destroy,
    getActiveRelationship: () => activeRelationship,
  };
}
