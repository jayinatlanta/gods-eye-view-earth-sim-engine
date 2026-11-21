/**
 * User Avatar Contact Reticle & Dynamic Geodetic Ground Clamping.
 * (Living World Sim: User Avatar WASD Ground Wander)
 *
 * Provides unmistakable visual representation of the active player:
 * - 14px Electric cyan / cobalt blue player contact dot (#06b6d4 / #0284c7)
 * - Bold 3.0px white outline (outlineColor: Cesium.Color.WHITE)
 * - disableDepthTestDistance: Number.POSITIVE_INFINITY (never occluded by terrain/buildings)
 * - Dynamic geodetic ground clamping to globe.getHeight(carto) + 0.15m
 * - Heading-aligned forward contact reticle with terrain lock
 */

import * as Cesium from 'cesium';
import { sampleActiveGroundHeight } from './surfaceHeight.js';

export const USER_AVATAR_DEFAULTS = Object.freeze({
  PIXEL_SIZE: 14,
  COLOR: '#06b6d4',
  ACCENT_COLOR: '#0284c7',
  OUTLINE_COLOR: '#ffffff',
  OUTLINE_WIDTH: 3.0,
  GROUND_OFFSET_METERS: 0.15,
  AVATAR_HEIGHT_METERS: 1.7,
});

/**
 * Creates and manages the active user avatar dot in the Cesium scene.
 *
 * @param {Object} options
 * @param {Cesium.Viewer} options.viewer - Active Cesium Viewer instance
 * @returns {Object} User Avatar Controller
 */
export function createUserAvatarDot({ viewer = null } = {}) {
  let entity = null;
  let currentCoordinates = null; // { lat, lon, height, heading }
  let currentCartesian = null;
  let isDestroyed = false;
  let isVisible = true;

  /**
   * Samples terrain height at given cartographic coordinate, clamping above ground.
   * Uses dual-regime ground resolver (sampleHeight on 3D tiles, globe.getHeight on 2D terrain).
   */
  function sampleTerrainHeight(carto) {
    if (!viewer) return carto?.height || 0;
    const exclude = entity ? [entity] : [];
    return sampleActiveGroundHeight(viewer, carto, exclude);
  }

  function removeEntity() {
    if (entity && viewer?.entities?.remove) {
      viewer.entities.remove(entity);
      entity = null;
    }
  }

  /**
   * Spawns the user avatar entity at the specified coordinates.
   */
  function spawn({ lat, lon, height = null, heading = 0 } = {}) {
    if (!viewer) return null;
    isDestroyed = false;
    if (entity) removeEntity();

    const fallbackH =
      height !== null && Number.isFinite(height)
        ? height
        : currentCoordinates?.height || 0;
    const carto = Cesium.Cartographic.fromDegrees(lon, lat, fallbackH);
    const groundH =
      height !== null && Number.isFinite(height) && height !== 0
        ? height
        : sampleTerrainHeight(carto);
    const clampedH = groundH + USER_AVATAR_DEFAULTS.GROUND_OFFSET_METERS;

    currentCoordinates = { lat, lon, height: clampedH, heading };
    currentCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, clampedH);

    // Compute heading orientation quaternion
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(heading),
      0,
      0,
    );
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      currentCartesian,
      hpr,
    );

    entity = viewer.entities.add({
      name: 'User Avatar (Player)',
      position: new Cesium.ConstantPositionProperty(currentCartesian),
      orientation: new Cesium.ConstantProperty(orientation),
      point: {
        pixelSize: USER_AVATAR_DEFAULTS.PIXEL_SIZE,
        color: Cesium.Color.fromCssColorString(
          USER_AVATAR_DEFAULTS.COLOR,
        ).withAlpha(0.95),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: USER_AVATAR_DEFAULTS.OUTLINE_WIDTH,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        isUserAvatar: true,
        role: 'player',
      },
    });

    entity.show = isVisible;
    return entity;
  }

  /**
   * Updates avatar position and heading dynamically with geodetic terrain clamping.
   */
  function updatePosition({
    lat,
    lon,
    height = null,
    heading = null,
    forceSample = false,
  } = {}) {
    if (!entity || isDestroyed) return null;

    const newHeading =
      heading !== null && Number.isFinite(heading)
        ? heading
        : currentCoordinates?.heading || 0;

    const fallbackH =
      height !== null && Number.isFinite(height) && height !== 0
        ? height
        : currentCoordinates?.height || 0;
    const carto = Cesium.Cartographic.fromDegrees(lon, lat, fallbackH);
    const groundH =
      !forceSample && height !== null && Number.isFinite(height) && height !== 0
        ? height
        : sampleTerrainHeight(carto);
    const clampedH = groundH + USER_AVATAR_DEFAULTS.GROUND_OFFSET_METERS;

    currentCoordinates = { lat, lon, height: clampedH, heading: newHeading };
    currentCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, clampedH);

    if (entity.position) {
      entity.position.setValue(currentCartesian);
    }

    if (entity.orientation) {
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(newHeading),
        0,
        0,
      );
      const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        currentCartesian,
        hpr,
      );
      entity.orientation.setValue(orientation);
    }

    return currentCartesian;
  }

  function setVisible(val) {
    isVisible = Boolean(val);
    if (entity) {
      entity.show = isVisible;
    }
  }

  function getEntity() {
    return entity;
  }

  function getCoordinates() {
    return currentCoordinates ? { ...currentCoordinates } : null;
  }

  function getCartesian() {
    return currentCartesian ? Cesium.Cartesian3.clone(currentCartesian) : null;
  }

  function destroy() {
    removeEntity();
    currentCoordinates = null;
    currentCartesian = null;
    isDestroyed = true;
  }

  return {
    spawn,
    updatePosition,
    setVisible,
    getEntity,
    getCoordinates,
    getCartesian,
    destroy,
    get isDestroyed() {
      return isDestroyed;
    },
    get isVisible() {
      return isVisible;
    },
  };
}
