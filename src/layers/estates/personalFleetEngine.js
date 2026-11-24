/**
 * Personal Multi-Tier Fleet Engine & Solo/Tandem Companion Mobility Matrix.
 * (Domiciles, Estates & Personal Fleet Terminal)
 *
 * Implements:
 * - 4 Personal Mobility Modes:
 *   1. WALK (Pedestrian sidewalk stroll ~1.2 m/s / 2.7 mph)
 *   2. BIKE (Cruiser bicycle ~5.5 m/s / 12.3 mph)
 *   3. SCOOTER (Electric scooter with thumb throttle ~7.0 m/s / 15.6 mph)
 *   4. EV (Dual-motor electric vehicle ~14.0 m/s / 31.3 mph)
 * - Solo vs. Tandem Mode Matrix:
 *   - SOLO_FOCUS (Quiet, contemplative solitary travel)
 *   - COMPANION_TANDEM (Companion alongside on matching bike/scooter, or passenger seat in EV)
 * - Unified Departure Handoff (Driveway-to-Infinite Drive, Doorstep-to-MARTA, Dock-to-Sails)
 * - Frame-by-frame surface height tracking & dynamic Cesium reticle updates
 * - Full telemetry export for GEV HUD (`DOMICILE · [Title] | FLEET [Mode] · [Speed]MPH`)
 */

import * as Cesium from 'cesium';
import { getDomicileById, getAllDomiciles } from './domicileCatalog.js';
import { trySampleSurfaceHeight } from '../citylife/surfaceHeight.js';
import { estimateWaypointElevation } from '../../drive/driveWaypoints.js';
import { createCameraAuthority } from '../../ui/sovereign/cameraControlBridge.js';
import { butterGoogle3DTiles } from '../../ui/sovereign/tilesetButter.js';

export const FLEET_MODES = Object.freeze({
  WALK: {
    id: 'walk',
    name: 'Pedestrian Stroll',
    shortName: 'Walk',
    icon: '🚶',
    speedMps: 1.2,
    speedMph: 2.7,
    sprintSpeedMps: 3.5,
    sprintSpeedMph: 7.8,
    accentHex: '#22d3ee',
    dimensions: { length: 0.6, width: 0.6, height: 1.75 },
    description: 'Casual neighborhood sidewalk stroll & coffee walk',
  },
  BIKE: {
    id: 'bike',
    name: 'Cruiser Bicycle',
    shortName: 'Bike',
    icon: '🚲',
    speedMps: 5.5,
    speedMph: 12.3,
    sprintSpeedMps: 8.5,
    sprintSpeedMph: 19.0,
    accentHex: '#10b981',
    dimensions: { length: 1.8, width: 0.7, height: 1.1 },
    description: 'Cruiser bicycle along neighborhood streets, trails & lanes',
  },
  SCOOTER: {
    id: 'scooter',
    name: 'Electric Scooter',
    shortName: 'Scooter',
    icon: '🛴',
    speedMps: 7.0,
    speedMph: 15.6,
    sprintSpeedMps: 10.0,
    sprintSpeedMph: 22.4,
    accentHex: '#f59e0b',
    dimensions: { length: 1.1, width: 0.5, height: 1.2 },
    description: 'Zippy personal e-scooter with responsive thumb throttle',
  },
  EV: {
    id: 'ev',
    name: 'Electric Sedan',
    shortName: 'EV Sedan',
    icon: '⚡',
    speedMps: 14.0,
    speedMph: 31.3,
    sprintSpeedMps: 28.0,
    sprintSpeedMph: 62.6,
    accentHex: '#818cf8',
    dimensions: { length: 4.8, width: 1.9, height: 1.45 },
    description:
      'Quiet dual-motor electric vehicle for arterial & highway runs',
  },
  H145: {
    id: 'h145',
    name: 'Airbus H145 (Fenestron)',
    shortName: 'H145 Copter',
    icon: '🚁',
    speedMps: 46.3, // ~90 knots / ~104 mph cruise
    speedMph: 104.0,
    sprintSpeedMps: 69.4, // ~135 knots / ~155 mph max cruise
    sprintSpeedMph: 155.0,
    hoverSpeedMps: 0.0,
    hoverSpeedMph: 0.0,
    cruiseAltMeters: 305, // ~1,000 ft AGL low-and-slow
    cruiseAltM: 305,
    accentHex: '#06b6d4', // cyan-500
    dimensions: { length: 13.0, width: 2.7, height: 4.0 },
    rotorDiameterM: 11.0,
    isRotorcraft: true,
    hasFenestron: true,
    modelUri: '/models/bell206.glb',
    features: [
      'Fenestron Ducted Anti-Torque Fan',
      'Helionix 4-Axis Autopilot Hover Hold',
      'Panoramic Chin-Bubble Downward Viewing Glass',
      'Low-and-Slow Scenic Flight Envelope (80-120 kts)',
    ],
    description:
      'User-owned twin-engine Airbus H145 with ducted Fenestron tail rotor for quiet, meditative flight',
  },
});

export const COMPANION_MODES = Object.freeze({
  SOLO_FOCUS: 'solo_focus',
  COMPANION_TANDEM: 'companion_tandem',
});

export function createPersonalFleetEngine({
  viewer = null,
  audioEngine = null,
  claimScout = null,
} = {}) {
  let activeMode = FLEET_MODES.WALK;
  let companionMode = COMPANION_MODES.COMPANION_TANDEM;
  let activeDomicile = getAllDomiciles()[0] || null;

  let currentLat = activeDomicile?.lat || 30.2672;
  let currentLon = activeDomicile?.lon || -97.7431;
  let currentElev = 0;
  let headingDeg = 0; // 0 = North, 90 = East, 180 = South, 270 = West
  let speedRatio = 0; // 0.0 to 1.0 (idle to cruise)
  let isSprinting = false;
  let isActive = false;
  let isHovering = false;
  let currentAlt = 0;
  let cameraMode = 'default';
  const cameraModeListeners = new Set();

  function notifyCameraModeListeners(mode) {
    for (const cb of cameraModeListeners) {
      try {
        cb(mode);
      } catch {
        /* ignore */
      }
    }
  }

  const cameraAuthority = createCameraAuthority({
    viewer,
    engineId: 'personal-fleet',
    identityMatrix4: Cesium.Matrix4.IDENTITY,
    onCameraModeApplied: notifyCameraModeListeners,
  });

  let playerEntity = null;
  let companionEntity = null;
  let animFrameId = null;
  let lastTickMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  function spawnAtDomicile(domicileOrId, { location = 'driveway' } = {}) {
    const dom =
      typeof domicileOrId === 'string'
        ? getDomicileById(domicileOrId)
        : domicileOrId || activeDomicile;
    if (!dom) return;

    activeDomicile = dom;
    if (location === 'frontDoor' && dom.frontDoorPoint) {
      currentLat = dom.frontDoorPoint.lat;
      currentLon = dom.frontDoorPoint.lon;
    } else if (dom.drivewayPoint) {
      currentLat = dom.drivewayPoint.lat;
      currentLon = dom.drivewayPoint.lon;
    } else {
      currentLat = dom.lat;
      currentLon = dom.lon;
    }

    headingDeg = 180; // Facing streetward
    speedRatio = 0;
    isActive = true;

    update3DEntities();
    butterGoogle3DTiles(viewer, 'fleet-spawn', { maxMs: 2400 });
  }

  function setFleetMode(modeKeyOrObj) {
    let target = null;
    if (typeof modeKeyOrObj === 'string') {
      const norm = modeKeyOrObj.toUpperCase();
      target =
        FLEET_MODES[norm] ||
        Object.values(FLEET_MODES).find(
          (m) => m.id.toLowerCase() === modeKeyOrObj.toLowerCase(),
        );
    } else if (modeKeyOrObj && modeKeyOrObj.id) {
      target = modeKeyOrObj;
    }

    if (target) {
      activeMode = target;
      if (target.isRotorcraft) {
        currentAlt = target.cruiseAltMeters || 305;
      } else {
        currentAlt = 0;
      }
      if (audioEngine?.setFleetMode) {
        audioEngine.setFleetMode(target.id);
      }
      update3DEntities();
    }
    return activeMode;
  }

  function setCompanionMode(mode) {
    if (
      mode === COMPANION_MODES.SOLO_FOCUS ||
      mode === COMPANION_MODES.COMPANION_TANDEM
    ) {
      companionMode = mode;
      update3DEntities();
    }
    return companionMode;
  }

  function toggleCompanionMode() {
    return setCompanionMode(
      companionMode === COMPANION_MODES.COMPANION_TANDEM
        ? COMPANION_MODES.SOLO_FOCUS
        : COMPANION_MODES.COMPANION_TANDEM,
    );
  }

  function setHover(bool) {
    if (!activeMode.isRotorcraft) return false;
    isHovering = Boolean(bool);
    if (isHovering) {
      speedRatio = 0.0;
      if (currentAlt === 0) currentAlt = activeMode.cruiseAltMeters || 305;
    } else {
      speedRatio = 1.0;
    }
    if (audioEngine?.setHover) {
      audioEngine.setHover(isHovering);
    }
    update3DEntities();
    return isHovering;
  }

  function toggleHover() {
    return setHover(!isHovering);
  }

  function applyFleetCamera(mode = cameraMode) {
    if (!viewer?.camera?.setView || mode === 'free') return;
    const altOffset =
      mode === 'first_person'
        ? 2.2
        : mode === 'overview'
          ? 140
          : activeMode.isRotorcraft
            ? Math.max(45, (currentAlt || 305) + 25)
            : 18;
    const pitchDeg =
      mode === 'first_person' ? -6 : mode === 'overview' ? -55 : -24;
    const trailM = mode === 'first_person' ? 0 : mode === 'overview' ? 70 : 22;
    const headingRad = Cesium.Math.toRadians(headingDeg);
    const cosLat = Math.max(0.2, Math.cos(Cesium.Math.toRadians(currentLat)));
    const camLat = currentLat - (trailM * Math.cos(headingRad)) / 111_139;
    const camLon =
      currentLon - (trailM * Math.sin(headingRad)) / (111_139 * cosLat);
    const camElev = (currentElev || activeDomicile?.elev || 0) + altOffset;
    try {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, camElev),
        orientation: {
          heading: headingRad,
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
      });
    } catch {
      /* ignore headless mock errors */
    }
  }

  function setCameraMode(mode) {
    cameraMode = mode || 'default';
    cameraAuthority.beginAtomicCameraSwitch({
      mode: cameraMode,
      clearTrackedEntity: true,
      resetLookAt: true,
      butter: true,
      butterReason: `fleet-cam-${cameraMode}`,
      butterMaxMs: 2200,
    });
    if (cameraMode !== 'free' && cameraMode !== 'default') {
      applyFleetCamera(cameraMode);
    }
    return cameraMode;
  }

  function snapBack(mode = 'chase') {
    return setCameraMode(mode);
  }

  function update3DEntities() {
    if (!viewer || !viewer.entities) return;

    try {
      const excludeList = [playerEntity, companionEntity].filter(Boolean);
      const carto = Cesium.Cartographic.fromDegrees(currentLon, currentLat);
      const sampledGround = trySampleSurfaceHeight(viewer, carto, excludeList);
      if (Number.isFinite(sampledGround)) {
        currentElev = sampledGround;
      } else {
        currentElev = estimateWaypointElevation(
          currentLat,
          currentLon,
          activeDomicile?.elev,
        );
      }

      const renderElev =
        currentElev +
        (activeMode.isRotorcraft && isActive
          ? currentAlt || activeMode.cruiseAltMeters
          : 1.0);
      const heightRef =
        activeMode.isRotorcraft && isActive
          ? Cesium.HeightReference.NONE
          : Cesium.HeightReference.CLAMP_TO_GROUND;

      if (!playerEntity) {
        playerEntity = viewer.entities.add({
          name: activeMode.isRotorcraft
            ? 'Airbus H145 Personal Rotorcraft'
            : 'Personal Fleet Operator',
          position: Cesium.Cartesian3.fromDegrees(
            currentLon,
            currentLat,
            renderElev,
          ),
          point: {
            pixelSize: activeMode.isRotorcraft ? 14 : 12,
            color: Cesium.Color.fromCssColorString(activeMode.accentHex),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: heightRef,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      } else {
        playerEntity.position = Cesium.Cartesian3.fromDegrees(
          currentLon,
          currentLat,
          renderElev,
        );
        if (playerEntity.point) {
          playerEntity.point.color = Cesium.Color.fromCssColorString(
            activeMode.accentHex,
          );
          playerEntity.point.heightReference = heightRef;
        }
      }

      // Companion Tandem Entity
      if (companionMode === COMPANION_MODES.COMPANION_TANDEM) {
        const offsetLat = currentLat;
        const offsetLon =
          currentLon +
          0.00003 * Math.cos((headingDeg * Math.PI) / 180 + Math.PI / 2);

        if (!companionEntity) {
          companionEntity = viewer.entities.add({
            name: 'Tandem Companion',
            position: Cesium.Cartesian3.fromDegrees(
              offsetLon,
              offsetLat,
              renderElev,
            ),
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString('#10b981'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: heightRef,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        } else {
          companionEntity.show = true;
          companionEntity.position = Cesium.Cartesian3.fromDegrees(
            offsetLon,
            offsetLat,
            renderElev,
          );
          if (companionEntity.point) {
            companionEntity.point.heightReference = heightRef;
          }
        }
      } else if (companionEntity) {
        companionEntity.show = false;
      }
    } catch {
      // ignore headless mock entity errors
    }
  }

  /**
   * Advances the vehicle along its heading vector.
   */
  function step(deltaSeconds) {
    if (!isActive || deltaSeconds <= 0) return;

    if (activeMode.isRotorcraft && isHovering) {
      // Helionix hover hold: rock-solid altitude, gradual gentle 360 yaw pan for meditation
      headingDeg = (headingDeg + 12 * deltaSeconds) % 360;
      if (audioEngine?.setEngineSpeed) {
        audioEngine.setEngineSpeed(0.5);
      }
      update3DEntities();
      return;
    }

    const baseSpeed = isSprinting
      ? activeMode.sprintSpeedMps
      : activeMode.speedMps;
    const currentSpeedMps = baseSpeed * speedRatio;

    if (currentSpeedMps > 0) {
      const rad = (headingDeg * Math.PI) / 180;
      const distMeters = currentSpeedMps * deltaSeconds;
      const metersPerDegLat = 111_139;
      const cosLat = Math.max(0.2, Math.cos((currentLat * Math.PI) / 180));
      const metersPerDegLon = 111_139 * cosLat;

      currentLat += (distMeters * Math.cos(rad)) / metersPerDegLat;
      currentLon += (distMeters * Math.sin(rad)) / metersPerDegLon;

      if (audioEngine?.setEngineSpeed) {
        audioEngine.setEngineSpeed(speedRatio);
      }
    }

    update3DEntities();
  }

  function start() {
    isActive = true;
    speedRatio = isHovering ? 0.0 : 1.0;
    if (activeMode.isRotorcraft) {
      currentAlt = activeMode.cruiseAltMeters || 305;
    }
    update3DEntities();
    butterGoogle3DTiles(viewer, 'fleet-start', { maxMs: 2400 });
  }

  function stop() {
    speedRatio = 0.0;
    isActive = false;
    isHovering = false;
    currentAlt = 0;
    if (audioEngine?.setEngineSpeed) {
      audioEngine.setEngineSpeed(0);
    }
    update3DEntities();
  }

  function getActiveTelemetry() {
    const baseSpeed = isSprinting
      ? activeMode.sprintSpeedMph
      : activeMode.speedMph;
    const currentSpeedMph = Number((baseSpeed * speedRatio).toFixed(1));

    return {
      simType: 'fleet',
      isActive,
      mode: activeMode.id,
      modeName: activeMode.name,
      shortModeName: activeMode.shortName,
      icon: activeMode.icon,
      speedMph: isHovering ? 0 : currentSpeedMph,
      speedRatio: isHovering ? 0 : speedRatio,
      isSprinting,
      isHovering,
      isRotorcraft: Boolean(activeMode.isRotorcraft),
      hasFenestron: Boolean(activeMode.hasFenestron),
      cameraMode,
      altitudeAglMeters:
        activeMode.isRotorcraft && isActive
          ? Math.round(currentAlt || activeMode.cruiseAltMeters)
          : 0,
      altitudeM:
        activeMode.isRotorcraft && isActive
          ? Math.round(currentAlt || activeMode.cruiseAltMeters)
          : 0,
      altitudeAglFt:
        activeMode.isRotorcraft && isActive
          ? Math.round((currentAlt || activeMode.cruiseAltMeters) * 3.28084)
          : 0,
      companionMode,
      activeDomicileId: activeDomicile?.id || '',
      activeDomicileTitle: activeDomicile?.title || 'Unclaimed',
      currentLat: Number(currentLat.toFixed(6)),
      currentLon: Number(currentLon.toFixed(6)),
      headingDeg: Math.round(headingDeg),
      hasWaterfrontDock: Boolean(activeDomicile?.hasWaterfrontDock),
      nearestTransitStation:
        activeDomicile?.nearestTransit?.stationName || null,
      highwayCorridor: activeDomicile?.highwayCorridor || null,
      features: activeMode.features || [],
    };
  }

  /**
   * Unified Departure Handoff 1: Driveway to Infinite Drive.
   */
  function handoffToInfiniteDrive() {
    if (!activeDomicile) return null;
    const rawOrigin = activeDomicile.drivewayPoint || {
      lat: activeDomicile.lat,
      lon: activeDomicile.lon,
    };
    const origin = {
      ...rawOrigin,
      elev: estimateWaypointElevation(
        rawOrigin.lat,
        rawOrigin.lon,
        rawOrigin.elev ?? activeDomicile.elev,
      ),
      name: activeDomicile.title || rawOrigin.label || 'Starting Domicile',
    };
    const rawDest = activeDomicile.highwayTarget || {
      lat: activeDomicile.lat + 0.015,
      lon: activeDomicile.lon + 0.015,
      label: 'Highway Corridor',
    };
    const destination = {
      ...rawDest,
      elev: estimateWaypointElevation(
        rawDest.lat,
        rawDest.lon,
        rawDest.elev ?? activeDomicile.elev,
      ),
      name: rawDest.label || 'Highway Corridor',
    };

    if (
      typeof window !== 'undefined' &&
      window.__gevDriveDrawer?.startCustomDrive
    ) {
      window.__gevDriveDrawer.startCustomDrive(origin, destination);
    } else if (
      typeof window !== 'undefined' &&
      window.__gevDriveEngine?.startDriveRoute
    ) {
      window.__gevDriveEngine.startDriveRoute(origin, destination);
    } else if (
      typeof window !== 'undefined' &&
      window.__gevDriveEngine?.startRouteDrive
    ) {
      window.__gevDriveEngine.startRouteDrive(origin, destination);
    }

    return {
      action: 'infinite_drive_handoff',
      origin,
      destination,
      domicile: activeDomicile.title,
    };
  }

  /**
   * Unified Departure Handoff 2: Doorstep to Rapid Transit (MARTA/Metro).
   */
  function handoffToRapidTransit() {
    if (!activeDomicile || !activeDomicile.nearestTransit) return null;
    const transit = activeDomicile.nearestTransit;

    if (typeof window !== 'undefined' && window.__gevTransitDrawer?.open) {
      window.__gevTransitDrawer.open();
    }
    if (typeof window !== 'undefined' && window.__gevMetroEngine?.followLine) {
      window.__gevMetroEngine.followLine(transit.lineId);
    }

    return {
      action: 'transit_handoff',
      station: transit.stationName,
      line: transit.lineName,
      distanceMiles: transit.distanceMiles,
      domicile: activeDomicile.title,
    };
  }

  /**
   * Unified Departure Handoff 3: Waterfront Dock to World of Sails.
   */
  function handoffToSails() {
    if (!activeDomicile || !activeDomicile.hasWaterfrontDock) return null;
    const dock = activeDomicile.dockPoint || {
      lat: activeDomicile.lat,
      lon: activeDomicile.lon,
    };
    const target = activeDomicile.waterwayTarget || dock;

    if (typeof window !== 'undefined' && window.__gevBoatDrawer?.open) {
      window.__gevBoatDrawer.open();
    }
    if (
      typeof window !== 'undefined' &&
      window.__gevBoatEngine?.spawnVesselAt
    ) {
      window.__gevBoatEngine.spawnVesselAt(target.lat, target.lon);
    }

    return {
      action: 'sails_handoff',
      dockPoint: dock,
      waterway: target.label || 'Waterway',
      domicile: activeDomicile.title,
    };
  }

  /**
   * Unified Departure Handoff 4: Doorstep Road Trip (Estate-to-Estate or Search Landmark).
   */
  function handoffToRoadTrip(destinationDomicileOrPoint) {
    if (!activeDomicile && !currentLat) return null;
    setFleetMode('ev');
    const rawOrigin = activeDomicile?.drivewayPoint || {
      lat: currentLat,
      lon: currentLon,
    };
    const origin = {
      ...rawOrigin,
      elev: estimateWaypointElevation(
        rawOrigin.lat,
        rawOrigin.lon,
        rawOrigin.elev ?? activeDomicile?.elev ?? currentElev,
      ),
      name: activeDomicile?.title || rawOrigin.label || 'Starting Domicile',
    };

    let destination = null;
    let destTitle = 'Destination';
    if (destinationDomicileOrPoint?.drivewayPoint) {
      const dp = destinationDomicileOrPoint.drivewayPoint;
      destination = {
        ...dp,
        elev: estimateWaypointElevation(
          dp.lat,
          dp.lon,
          dp.elev ?? destinationDomicileOrPoint.elev,
        ),
        name: destinationDomicileOrPoint.title || dp.label || 'Sanctuary',
      };
      destTitle = destinationDomicileOrPoint.title || 'Sanctuary';
    } else if (
      destinationDomicileOrPoint?.lat &&
      destinationDomicileOrPoint?.lon
    ) {
      destination = {
        lat: destinationDomicileOrPoint.lat,
        lon: destinationDomicileOrPoint.lon,
        elev: estimateWaypointElevation(
          destinationDomicileOrPoint.lat,
          destinationDomicileOrPoint.lon,
          destinationDomicileOrPoint.elev,
        ),
        name:
          destinationDomicileOrPoint.title ||
          destinationDomicileOrPoint.name ||
          'Custom Landmark',
      };
      destTitle =
        destinationDomicileOrPoint.title ||
        destinationDomicileOrPoint.name ||
        'Custom Landmark';
    } else {
      const ht = activeDomicile?.highwayTarget || {
        lat: currentLat + 0.02,
        lon: currentLon + 0.02,
      };
      destination = {
        ...ht,
        elev: estimateWaypointElevation(
          ht.lat,
          ht.lon,
          ht.elev ?? activeDomicile?.elev,
        ),
        name: ht.label || 'Highway Corridor',
      };
      destTitle = 'Highway Corridor';
    }

    if (
      typeof window !== 'undefined' &&
      window.__gevDriveDrawer?.startCustomDrive
    ) {
      window.__gevDriveDrawer.startCustomDrive(origin, destination);
    } else if (
      typeof window !== 'undefined' &&
      window.__gevDriveEngine?.startRouteDrive
    ) {
      window.__gevDriveEngine.startRouteDrive(origin, destination, {
        vehicleName: 'Electric Sedan',
      });
    }

    return {
      action: 'road_trip_handoff',
      origin,
      destination,
      fromEstate: activeDomicile?.title || 'Starting Domicile',
      toEstate: destTitle,
    };
  }

  /**
   * Unified Departure Handoff 5: Helipad & Airbus H145 Meditative Flight.
   */
  function handoffToHelicopterFlight(destinationPointOrHelipad) {
    setFleetMode('h145');
    const originPoint = { lat: currentLat, lon: currentLon };
    let destPoint = null;
    let destName = 'Helipad';

    if (destinationPointOrHelipad?.lat && destinationPointOrHelipad?.lon) {
      destPoint = {
        lat: destinationPointOrHelipad.lat,
        lon: destinationPointOrHelipad.lon,
      };
      destName =
        destinationPointOrHelipad.name ||
        destinationPointOrHelipad.title ||
        'Helipad Destination';
    } else {
      destPoint = { lat: currentLat + 0.05, lon: currentLon + 0.05 };
    }

    // Switch active fleet mode to H145
    setFleetMode('h145');

    if (
      typeof window !== 'undefined' &&
      window.__gevFlightEngine?.spawnFlightRoute
    ) {
      const fromQuery = `${currentLat},${currentLon}`;
      const toQuery = `${destPoint.lat},${destPoint.lon}`;
      window.__gevFlightEngine.spawnFlightRoute(fromQuery, toQuery, {
        isRotorcraft: true,
        aircraftType: 'h145',
        cruiseAlt: 305,
        callsign: 'N145FX',
        modelUri: '/models/bell206.glb',
      });
    }

    return {
      action: 'helicopter_flight_handoff',
      vehicle: 'Airbus H145 (Fenestron)',
      origin: originPoint,
      destination: destPoint,
      cruiseAltMeters: 305,
      fromEstate: activeDomicile?.title || 'Sanctuary',
      toDestination: destName,
    };
  }

  function destroy() {
    stop();
    if (playerEntity && viewer?.entities) {
      try {
        viewer.entities.remove(playerEntity);
      } catch {}
      playerEntity = null;
    }
    if (companionEntity && viewer?.entities) {
      try {
        viewer.entities.remove(companionEntity);
      } catch {}
      companionEntity = null;
    }
  }

  return {
    get activeMode() {
      return activeMode;
    },
    get companionMode() {
      return companionMode;
    },
    get activeDomicile() {
      return activeDomicile;
    },
    get isActive() {
      return isActive;
    },
    get isHovering() {
      return isHovering;
    },
    get currentAlt() {
      return currentAlt;
    },
    get currentCoords() {
      return { lat: currentLat, lon: currentLon };
    },
    get headingDeg() {
      return headingDeg;
    },
    spawnAtDomicile,
    setFleetMode,
    setCompanionMode,
    toggleCompanionMode,
    setHover,
    toggleHover,
    setCameraMode,
    snapBack,
    getCameraMode: () => cameraMode,
    onCameraModeChange: (cb) => {
      if (typeof cb === 'function') {
        cameraModeListeners.add(cb);
        return () => cameraModeListeners.delete(cb);
      }
      return () => {};
    },
    getCameraIntentSeq: () => cameraAuthority.getSeq(),
    start,
    stop,
    step,
    getActiveTelemetry,
    handoffToInfiniteDrive,
    handoffToRapidTransit,
    handoffToSails,
    handoffToRoadTrip,
    handoffToHelicopterFlight,
    destroy,
  };
}
