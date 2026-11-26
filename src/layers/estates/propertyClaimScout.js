/**
 * Property Claim Scout & 3D Parcel Visualizer.
 * (Custom Domiciles, Estates & Personal Fleet Terminal)
 *
 * Implements:
 * - 3D Cesium parcel boundary polygons clamped to ground/3D tiles
 * - Doorstep, driveway, and waterfront boat dock anchor point markers
 * - Hovering property deed billboard plaque with typology badge
 * - Dynamic Viewport Center coordinate extraction
 * - Globe Pick ground coordinate resolution
 * - Smooth camera flight suite (Overview, Doorstep, Driveway)
 * - 1-Click claim integration for Viewport, Search, and Command routes
 */

import * as Cesium from 'cesium';
import {
  getAllDomiciles,
  getDomicileById,
  claimDomicileAtLocation,
  removeClaimedDomicile,
  DOMICILE_TYPOLOGIES,
  DOMICILE_TYPOLOGY_META,
  onDomicileRegistryChange,
} from './domicileCatalog.js';
import {
  trySampleSurfaceHeight,
  pickActiveGroundPosition,
} from '../citylife/surfaceHeight.js';
import { estimateWaypointElevation } from '../../drive/driveWaypoints.js';
import { getGlobalDrawerCoordinator } from '../../ui/worldSimDock.js';
import { butterGoogle3DTiles } from '../../ui/sovereign/tilesetButter.js';

export function createPropertyClaimScout({ viewer = null } = {}) {
  let activeDomicileId = getAllDomiciles()[0]?.id || null;
  const entityMap = new Map(); // domicile.id -> [Cesium.Entity]
  let registryUnsub = null;
  let isDestroyed = false;
  let screenHandler = null;
  let postRenderRemover = null;

  // Screen-space DOM badges for active domicile anchor points
  let badgeContainer = null;
  let centerBadge = null;
  let doorBadge = null;
  let drivewayBadge = null;
  let dockBadge = null;
  const scratchWindowPos = new Cesium.Cartesian2();

  function initDomBadges() {
    if (typeof document === 'undefined') return;
    badgeContainer = document.createElement('div');
    badgeContainer.className = 'gev-domicile-badges-container';
    badgeContainer.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 10000;
      overflow: hidden;
    `;

    function makeBadge(iconText, accentColor) {
      const b = document.createElement('button');
      b.style.cssText = `
        position: fixed;
        display: none;
        align-items: center;
        gap: 5px;
        background: rgba(13, 17, 23, 0.90);
        backdrop-filter: blur(8px);
        border: 1px solid ${accentColor};
        border-radius: 12px;
        color: #e6edf3;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        transform: translate(-50%, -100%);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65), 0 0 8px ${accentColor}40;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        white-space: nowrap;
        transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      `;
      b.innerHTML = iconText;
      b.addEventListener('mouseenter', () => {
        b.style.transform = 'translate(-50%, -100%) scale(1.08)';
        b.style.background = 'rgba(22, 27, 34, 0.98)';
      });
      b.addEventListener('mouseleave', () => {
        b.style.transform = 'translate(-50%, -100%) scale(1.0)';
        b.style.background = 'rgba(13, 17, 23, 0.90)';
      });
      return b;
    }

    centerBadge = makeBadge('🏡 Deed', '#22d3ee');
    centerBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeDomicileId) {
        flyToDomicile(activeDomicileId, { mode: 'overview' });
        try {
          getGlobalDrawerCoordinator()?.openDrawer?.('estate');
        } catch {}
      }
    });

    doorBadge = makeBadge('🚪 Front Doorstep', '#22d3ee');
    doorBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeDomicileId)
        flyToDomicile(activeDomicileId, { mode: 'doorstep' });
    });

    drivewayBadge = makeBadge('🚗 Driveway', '#f59e0b');
    drivewayBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeDomicileId)
        flyToDomicile(activeDomicileId, { mode: 'driveway' });
    });

    dockBadge = makeBadge('⛵ Boat Slip', '#10b981');
    dockBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeDomicileId)
        flyToDomicile(activeDomicileId, { mode: 'driveway' });
    });

    badgeContainer.appendChild(centerBadge);
    badgeContainer.appendChild(doorBadge);
    badgeContainer.appendChild(drivewayBadge);
    badgeContainer.appendChild(dockBadge);

    const mountParent = viewer?.container || document.body;
    mountParent.appendChild(badgeContainer);
  }

  function hideAllBadges() {
    if (centerBadge) centerBadge.style.display = 'none';
    if (doorBadge) doorBadge.style.display = 'none';
    if (drivewayBadge) drivewayBadge.style.display = 'none';
    if (dockBadge) dockBadge.style.display = 'none';
  }

  function updateBadgePositions() {
    if (
      isDestroyed ||
      !viewer ||
      !viewer.scene ||
      !viewer.camera ||
      !badgeContainer
    ) {
      return;
    }

    const domicile = getActiveDomicile();
    if (!domicile) {
      hideAllBadges();
      return;
    }

    // Hide badges when zoomed far away (> 2500m)
    const centerPos = Cesium.Cartesian3.fromDegrees(domicile.lon, domicile.lat);
    const cameraDist = Cesium.Cartesian3.distance(
      viewer.camera.position,
      centerPos,
    );
    if (cameraDist > 2500) {
      hideAllBadges();
      return;
    }

    function positionBadge(badge, lon, lat, labelHtml) {
      if (!badge) return;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        badge.style.display = 'none';
        return;
      }
      const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat);
      const winPos = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        cartesian,
        scratchWindowPos,
      );
      if (!winPos || winPos.x < 0 || winPos.y < 0) {
        badge.style.display = 'none';
        return;
      }
      if (labelHtml) badge.innerHTML = labelHtml;
      badge.style.display = 'inline-flex';
      badge.style.left = `${Math.round(winPos.x)}px`;
      badge.style.top = `${Math.round(winPos.y - 12)}px`;
    }

    const meta =
      DOMICILE_TYPOLOGY_META[domicile.typology] ||
      DOMICILE_TYPOLOGY_META.PRIMARY_RESIDENCE;
    const cleanTitle = domicile.title || 'Deed';

    positionBadge(
      centerBadge,
      domicile.lon,
      domicile.lat,
      `${meta.icon} ${cleanTitle}`,
    );
    if (domicile.frontDoorPoint) {
      positionBadge(
        doorBadge,
        domicile.frontDoorPoint.lon,
        domicile.frontDoorPoint.lat,
        '🚪 Doorstep',
      );
    } else if (doorBadge) {
      doorBadge.style.display = 'none';
    }

    if (domicile.drivewayPoint) {
      positionBadge(
        drivewayBadge,
        domicile.drivewayPoint.lon,
        domicile.drivewayPoint.lat,
        '🚗 Driveway',
      );
    } else if (drivewayBadge) {
      drivewayBadge.style.display = 'none';
    }

    if (domicile.hasWaterfrontDock && domicile.dockPoint) {
      positionBadge(
        dockBadge,
        domicile.dockPoint.lon,
        domicile.dockPoint.lat,
        '⛵ Boat Slip',
      );
    } else if (dockBadge) {
      dockBadge.style.display = 'none';
    }
  }

  initDomBadges();

  if (viewer && viewer.scene && viewer.scene.postRender) {
    postRenderRemover =
      viewer.scene.postRender.addEventListener(updateBadgePositions);
  }

  // Cesium canvas picking & pointer cursor
  if (
    viewer &&
    viewer.scene &&
    viewer.scene.canvas &&
    Cesium.ScreenSpaceEventHandler
  ) {
    try {
      screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      screenHandler.setInputAction((movement) => {
        try {
          const picked = viewer.scene.pick(movement.endPosition);
          if (picked?.id?.domicileAnchor) {
            viewer.scene.canvas.style.cursor = 'pointer';
          } else if (viewer.scene.canvas.style.cursor === 'pointer') {
            viewer.scene.canvas.style.cursor = 'default';
          }
        } catch {}
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      screenHandler.setInputAction((click) => {
        try {
          const picked = viewer.scene.pick(click.position);
          if (picked?.id?.domicileAnchor && picked.id.domicileId) {
            selectDomicile(picked.id.domicileId);
            flyToDomicile(picked.id.domicileId, {
              mode: 'overview',
            });
            try {
              getGlobalDrawerCoordinator()?.openDrawer?.('estate');
            } catch {}
          }
        } catch {}
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch {}
  }

  function clearEntities() {
    if (viewer && viewer.entities) {
      for (const entities of entityMap.values()) {
        for (const ent of entities) {
          try {
            viewer.entities.remove(ent);
          } catch {
            // ignore removal errors
          }
        }
      }
    }
    entityMap.clear();
  }

  function updateEntities() {
    if (isDestroyed || !viewer || !viewer.entities) return;

    clearEntities();
    const domiciles = getAllDomiciles();

    for (const domicile of domiciles) {
      const isSelected = domicile.id === activeDomicileId;
      const meta =
        DOMICILE_TYPOLOGY_META[domicile.typology] ||
        DOMICILE_TYPOLOGY_META.PRIMARY_RESIDENCE;
      const domicileEntities = [];

      try {
        // 1. Parcel boundary polygon
        const positions = (domicile.boundaryPolygon || []).map((pt) =>
          Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat),
        );

        if (positions.length >= 3) {
          const polyEntity = viewer.entities.add({
            name: `${domicile.title} (Parcel Boundary)`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              material: Cesium.Color.fromCssColorString(
                meta.accentHex,
              ).withAlpha(isSelected ? 0.36 : 0.18),
              outline: true,
              outlineColor: isSelected
                ? Cesium.Color.WHITE
                : Cesium.Color.fromCssColorString(meta.outlineHex),
              outlineWidth: isSelected ? 3 : 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          domicileEntities.push(polyEntity);
        }

        // 2. Deed Center Marker & Title Label
        const centerPos = Cesium.Cartesian3.fromDegrees(
          domicile.lon,
          domicile.lat,
        );
        const centerEntity = viewer.entities.add({
          name: `${domicile.title} (Deed Center)`,
          position: centerPos,
          point: {
            pixelSize: isSelected ? 14 : 10,
            color: Cesium.Color.fromCssColorString(meta.accentHex),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        centerEntity.domicileAnchor = 'overview';
        centerEntity.domicileId = domicile.id;
        domicileEntities.push(centerEntity);

        // 3. Front Doorstep Marker
        if (domicile.frontDoorPoint) {
          const doorEntity = viewer.entities.add({
            name: `${domicile.title} (Front Door)`,
            position: Cesium.Cartesian3.fromDegrees(
              domicile.frontDoorPoint.lon,
              domicile.frontDoorPoint.lat,
            ),
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString('#22d3ee'),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          doorEntity.domicileAnchor = 'doorstep';
          doorEntity.domicileId = domicile.id;
          domicileEntities.push(doorEntity);
        }

        // 4. Driveway / Garage Marker
        if (domicile.drivewayPoint) {
          const drivewayEntity = viewer.entities.add({
            name: `${domicile.title} (Driveway Terminal)`,
            position: Cesium.Cartesian3.fromDegrees(
              domicile.drivewayPoint.lon,
              domicile.drivewayPoint.lat,
            ),
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString('#f59e0b'),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          drivewayEntity.domicileAnchor = 'driveway';
          drivewayEntity.domicileId = domicile.id;
          domicileEntities.push(drivewayEntity);
        }

        // 5. Waterfront Dock Marker (if applicable)
        if (domicile.hasWaterfrontDock && domicile.dockPoint) {
          const dockEntity = viewer.entities.add({
            name: `${domicile.title} (Boat Slip)`,
            position: Cesium.Cartesian3.fromDegrees(
              domicile.dockPoint.lon,
              domicile.dockPoint.lat,
            ),
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString('#10b981'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          dockEntity.domicileAnchor = 'driveway';
          dockEntity.domicileId = domicile.id;
          domicileEntities.push(dockEntity);
        }

        entityMap.set(domicile.id, domicileEntities);
      } catch {
        // gracefully handle missing WebGL context or entity add errors in tests
      }
    }
  }

  // Subscribe to registry changes so claiming/removing properties updates 3D globe immediately
  registryUnsub = onDomicileRegistryChange(() => {
    updateEntities();
  });

  // Initial draw
  updateEntities();

  function selectDomicile(id) {
    const domicile = getDomicileById(id);
    if (domicile) {
      activeDomicileId = domicile.id;
      updateEntities();
    }
    return domicile;
  }

  function getActiveDomicile() {
    return getDomicileById(activeDomicileId);
  }

  /**
   * Reads current camera viewport center coordinates.
   */
  function getViewportCoordinates() {
    if (viewer && viewer.camera) {
      try {
        const canvas = viewer.scene.canvas;
        const centerPt = new Cesium.Cartesian2(
          canvas.width / 2,
          canvas.height / 2,
        );
        let cartesian = pickActiveGroundPosition(viewer, centerPt);
        if (!cartesian) {
          const centerRay = viewer.camera.getPickRay(centerPt);
          cartesian = viewer.scene.globe?.pick?.(centerRay, viewer.scene);
        }
        if (!cartesian) {
          cartesian = viewer.camera.pickEllipsoid(centerPt);
        }
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const lat = Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6));
          const lon = Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6));
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { lat, lon };
          }
        }
      } catch {
        // fallback to camera cartographic
        try {
          const carto = viewer.camera.positionCartographic;
          if (carto) {
            return {
              lat: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
              lon: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
            };
          }
        } catch {}
      }
    }

    const current = getActiveDomicile();
    return { lat: current.lat, lon: current.lon };
  }

  /**
   * Raycasts a ground coordinate from a screen window pixel position.
   */
  function pickCoordinate(windowPosition) {
    if (viewer && viewer.scene && windowPosition) {
      try {
        const cartesian =
          pickActiveGroundPosition(viewer, windowPosition) ||
          viewer.scene.pickPosition?.(windowPosition) ||
          viewer.camera.pickEllipsoid?.(windowPosition);
        if (cartesian) {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          return {
            lat: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
            lon: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
          };
        }
      } catch {}
    }
    return getViewportCoordinates();
  }

  /**
   * Flies the camera to frame the specified domicile across 3 perspective modes.
   */
  function flyToDomicile(id, { mode = 'overview', duration = 1.8 } = {}) {
    const domicile = getDomicileById(id);
    if (!domicile) return null;
    activeDomicileId = domicile.id;
    updateEntities();

    let targetLat = domicile.lat;
    let targetLon = domicile.lon;
    let rangeM = 950; // Clean, spacious framing of parcel + neighborhood context
    let pitchDeg = -45;

    if (mode === 'doorstep' && domicile.frontDoorPoint) {
      targetLat = domicile.frontDoorPoint.lat;
      targetLon = domicile.frontDoorPoint.lon;
      rangeM = 50;
      pitchDeg = -20;
    } else if (mode === 'driveway' && domicile.drivewayPoint) {
      targetLat = domicile.drivewayPoint.lat;
      targetLon = domicile.drivewayPoint.lon;
      rangeM = 75;
      pitchDeg = -25;
    }

    if (!viewer || !viewer.camera) {
      return { domicile, mode, targetLat, targetLon, rangeM, pitchDeg };
    }

    try {
      if (viewer.trackedEntity !== undefined) {
        viewer.trackedEntity = undefined;
      }
      viewer.camera.cancelFlight?.();
      viewer.camera.lookAtTransform?.(Cesium.Matrix4.IDENTITY);
      const heading = Number.isFinite(viewer.camera.heading)
        ? viewer.camera.heading
        : 0;
      const carto = Cesium.Cartographic.fromDegrees(targetLon, targetLat);
      const sampledSurface = trySampleSurfaceHeight(viewer, carto);
      const globeSurface = viewer.scene?.globe?.getHeight?.(carto);
      const surfaceHeight = Number.isFinite(sampledSurface)
        ? sampledSurface
        : Number.isFinite(globeSurface)
          ? globeSurface
          : estimateWaypointElevation(targetLat, targetLon, domicile.elev);
      const center = Cesium.Cartesian3.fromDegrees(
        targetLon,
        targetLat,
        Math.max(0, surfaceHeight),
      );

      if (typeof viewer.camera.flyToBoundingSphere === 'function') {
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(center, 30),
          {
            offset: new Cesium.HeadingPitchRange(
              heading,
              Cesium.Math.toRadians(pitchDeg),
              rangeM,
            ),
            duration,
          },
        );
      } else if (typeof viewer.camera.flyTo === 'function') {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            targetLon,
            targetLat,
            Math.max(surfaceHeight + rangeM * 0.7, 250),
          ),
          orientation: {
            heading,
            pitch: Cesium.Math.toRadians(pitchDeg),
            roll: 0.0,
          },
          duration,
        });
      }
      butterGoogle3DTiles(
        viewer?.scene?.primitives,
        `domicile-visit-${domicile.id}`,
        { maxMs: 2600 },
      );
    } catch {
      // ignore camera animation errors in tests
    }

    return { domicile, mode, targetLat, targetLon, rangeM, pitchDeg };
  }

  /**
   * 1-Click action to claim the current viewport center as a Custom Domicile.
   */
  function claimCurrentViewport({
    typology = DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
    title = null,
    localityLabel = null,
  } = {}) {
    const coords = getViewportCoordinates();
    const claimed = claimDomicileAtLocation({
      lat: coords.lat,
      lon: coords.lon,
      typology,
      title,
      localityLabel,
      source: 'viewport',
    });
    activeDomicileId = claimed.id;
    updateEntities();
    return claimed;
  }

  /**
   * Claims a searched location as a Custom Domicile.
   */
  function claimSearchedLocation({
    lat,
    lon,
    localityLabel = null,
    typology = DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE,
    title = null,
  } = {}) {
    const claimed = claimDomicileAtLocation({
      lat,
      lon,
      typology,
      title,
      localityLabel,
      source: 'search',
    });
    activeDomicileId = claimed.id;
    updateEntities();
    return claimed;
  }

  function destroy() {
    isDestroyed = true;
    if (registryUnsub) {
      registryUnsub();
      registryUnsub = null;
    }
    if (postRenderRemover) {
      postRenderRemover();
      postRenderRemover = null;
    }
    if (screenHandler) {
      try {
        screenHandler.destroy();
      } catch {}
      screenHandler = null;
    }
    if (badgeContainer && badgeContainer.parentNode) {
      badgeContainer.parentNode.removeChild(badgeContainer);
      badgeContainer = null;
    }
    clearEntities();
  }

  return {
    selectDomicile,
    getActiveDomicile,
    getViewportCoordinates,
    pickCoordinate,
    flyToDomicile,
    claimCurrentViewport,
    claimSearchedLocation,
    updateEntities,
    clearEntities,
    destroy,
  };
}
