/**
 * Composite Multi-Modal Planetary Journey Coordinator for God's Eye View.
 * (Multi-Modal Planetary Travel & Meditative Rotorcraft Simulator)
 *
 * Implements a 5-phase sequential journey orchestrator linking:
 * 1. LEG_1_GROUND_DRIVEWAY: Driveway EV/Fleet surface street departure to departure airfield/helipad.
 * 2. LEG_2_AIRFIELD_BOARDING: FBO / helipad / ramp boarding & pre-flight checklist.
 * 3. LEG_3_AIRBORNE_CRUISE: Meditative rotorcraft (Airbus H145) or Great-Circle airliner flight.
 * 4. LEG_4_ARRIVAL_TRANSFER: Airfield touchdown, deplaning, and transfer to local destination ground fleet.
 * 5. LEG_5_DESTINATION_ARRIVAL: Surface navigation pulling into destination driveway/porte-cochère.
 */

import * as Cesium from 'cesium';
import { findNearestHelipad, HELIPAD_WAYPOINTS } from './helipadCatalog.js';
import { AIRPORT_WAYPOINTS } from './syntheticFlightEngine.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { trySampleSurfaceHeight } from '../layers/citylife/surfaceHeight.js';
import { estimateWaypointElevation } from '../drive/driveWaypoints.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

export const COMPOSITE_LEG_STATES = Object.freeze({
  IDLE: 'idle',
  LEG_1_GROUND_DRIVEWAY: 'ground_driveway_departure',
  LEG_2_AIRFIELD_BOARDING: 'airfield_boarding_transfer',
  LEG_3_AIRBORNE_CRUISE: 'airborne_cruise',
  LEG_4_ARRIVAL_TRANSFER: 'destination_transfer',
  LEG_5_DESTINATION_ARRIVAL: 'destination_arrival',
  COMPLETED: 'journey_completed',
});

export const TRAVEL_LEGS = COMPOSITE_LEG_STATES;

export const LEG_SEQUENCE = Object.freeze([
  COMPOSITE_LEG_STATES.LEG_1_GROUND_DRIVEWAY,
  COMPOSITE_LEG_STATES.LEG_2_AIRFIELD_BOARDING,
  COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE,
  COMPOSITE_LEG_STATES.LEG_4_ARRIVAL_TRANSFER,
  COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL,
  COMPOSITE_LEG_STATES.COMPLETED,
]);

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function createCompositeTravelEngine(optionsOrViewer = {}) {
  const options =
    optionsOrViewer?.entities || optionsOrViewer?.clock
      ? { viewer: optionsOrViewer }
      : optionsOrViewer || {};

  const viewer = options.viewer || null;
  const flightEngine =
    options.flightEngine || options.syntheticFlight || options.flight || null;
  const driveEngine = options.driveEngine || options.drive || null;
  const fleetEngine = options.fleetEngine || options.fleet || null;
  const container =
    options.container ||
    (typeof document !== 'undefined' ? document.body : null);

  let activeJourney = null;
  let currentLegIndex = 0;
  let status = COMPOSITE_LEG_STATES.IDLE;
  let currentCameraMode = 'chase';

  function resolvePointGroundHeight(pt) {
    if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) return 200;
    const carto = Cesium.Cartographic.fromDegrees(pt.lon, pt.lat);
    const sampled = trySampleSurfaceHeight(viewer, carto);
    if (Number.isFinite(sampled)) return sampled;
    if (viewer?.scene?.globe?.getHeight) {
      const gh = viewer.scene.globe.getHeight(carto);
      if (Number.isFinite(gh)) return gh;
    }
    return estimateWaypointElevation(pt.lat, pt.lon, pt.elev);
  }

  const LEG_SHORT_LABELS = [
    'Ground',
    'Boarding',
    'Cruise',
    'Transfer',
    'Arrival',
  ];
  const LEG_ICONS = ['🚗', '🛫', '🚁', '🛬', '🏡'];

  // Journey Floating HUD Strip at top of screen
  const dock = getGlobalDrawerCoordinator();
  let hudStrip = null;
  if (typeof document !== 'undefined' && container) {
    hudStrip = document.createElement('div');
    hudStrip.className = 'gev-composite-hud-strip';
    hudStrip.style.cssText = `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(13, 17, 23, 0.94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(245, 158, 11, 0.5);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75);
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      z-index: 10003;
      padding: 8px 16px;
      display: none;
      align-items: center;
      gap: 14px;
      pointer-events: auto;
      transition: opacity 0.25s ease;
      max-width: 90vw;
    `;
    hudStrip.innerHTML = `
      <div style="display: flex; flex-direction: column;" class="gev-comp-hud-info">
        <div class="gev-comp-hud-title" style="font-size: 12px; font-weight: 700; color: #fbbf24; white-space: nowrap;">
          🧳 Leg 1/5: Doorstep Ground Departure
        </div>
        <div class="gev-comp-hud-sub" style="font-size: 10px; color: #8b949e; white-space: nowrap;">
          Initializing itinerary...
        </div>
      </div>
      <div class="gev-comp-stepper" style="display: flex; gap: 4px; align-items: center;"></div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button class="gev-comp-hud-cockpit" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Cockpit / driver perspective">
          💺 Cockpit
        </button>
        <button class="gev-comp-hud-chase" style="background: #d97706; border: 1px solid #f59e0b; border-radius: 6px; color: #ffffff; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Third-person follow camera">
          🚗 Chase
        </button>
        <button class="gev-comp-hud-overview" style="background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Tactical overview / orbit camera">
          🛰️ Overview
        </button>
        <button class="gev-comp-hud-snap" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 6px; color: #fde68a; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Re-lock camera onto active transport">
          🎯 Snap Back
        </button>
        <button class="gev-comp-hud-next" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 6px; color: #6ee7b7; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="Advance to next leg immediately">
          ⏭️ Next Leg
        </button>
        <button class="gev-comp-hud-stop" style="background: rgba(248, 81, 73, 0.15); border: 1px solid rgba(248, 81, 73, 0.5); border-radius: 6px; color: #f85149; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; white-space: nowrap;" title="End journey">
          ⏹️ End
        </button>
      </div>
    `;
    container.appendChild(hudStrip);

    hudStrip
      .querySelector('.gev-comp-hud-cockpit')
      ?.addEventListener('click', () => setCameraMode('cockpit'));
    hudStrip
      .querySelector('.gev-comp-hud-chase')
      ?.addEventListener('click', () => setCameraMode('chase'));
    hudStrip
      .querySelector('.gev-comp-hud-overview')
      ?.addEventListener('click', () => setCameraMode('overview'));
    hudStrip
      .querySelector('.gev-comp-hud-snap')
      ?.addEventListener('click', () => setCameraMode(currentCameraMode));
    dock.registerOverlayGroup('composite-hud', {
      elements: [hudStrip],
    });
    hudStrip
      .querySelector('.gev-comp-hud-next')
      ?.addEventListener('click', () => advanceLeg());
    hudStrip
      .querySelector('.gev-comp-hud-stop')
      ?.addEventListener('click', () => cancelJourney());
  }

  function updateHudCameraButtons(activeMode) {
    if (!hudStrip) return;
    const highlight = (btn, isAct) => {
      if (!btn) return;
      btn.style.background = isAct ? '#d97706' : '#21262d';
      btn.style.color = isAct ? '#ffffff' : '#8b949e';
      btn.style.borderColor = isAct ? '#f59e0b' : '#30363d';
    };
    highlight(
      hudStrip.querySelector('.gev-comp-hud-cockpit'),
      activeMode === 'cockpit',
    );
    highlight(
      hudStrip.querySelector('.gev-comp-hud-chase'),
      activeMode === 'chase',
    );
    highlight(
      hudStrip.querySelector('.gev-comp-hud-overview'),
      activeMode === 'overview',
    );
  }

  function updateHudDisplay() {
    if (!hudStrip || !activeJourney) return;
    const titleEl = hudStrip.querySelector('.gev-comp-hud-title');
    const subEl = hudStrip.querySelector('.gev-comp-hud-sub');
    const stepperEl = hudStrip.querySelector('.gev-comp-stepper');
    const chaseBtn = hudStrip.querySelector('.gev-comp-hud-chase');
    const nextBtn = hudStrip.querySelector('.gev-comp-hud-next');

    const curLeg =
      currentLegIndex < activeJourney.legs.length
        ? activeJourney.legs[currentLegIndex]
        : null;

    if (!curLeg || status === COMPOSITE_LEG_STATES.COMPLETED) {
      if (titleEl)
        titleEl.textContent = '🎉 5-Leg Planetary Journey Completed!';
      if (subEl)
        subEl.textContent = `Arrived at ${activeJourney.destination.title || 'Sanctuary'}`;
      if (stepperEl) {
        stepperEl.innerHTML = activeJourney.legs
          .map(
            (_, i) => `
          <div style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #6ee7b7;">
            ✓ ${LEG_SHORT_LABELS[i]}
          </div>
        `,
          )
          .join('');
      }
      if (nextBtn) {
        nextBtn.textContent = '🎉 Arrived';
        nextBtn.style.opacity = '0.5';
        nextBtn.style.pointerEvents = 'none';
      }
      return;
    }

    if (titleEl) {
      titleEl.textContent = `🧳 Leg ${curLeg.legNumber}/5: ${curLeg.title}`;
    }
    if (subEl) {
      subEl.textContent = `${curLeg.from} ➔ ${curLeg.to} (${curLeg.distanceMi} mi) • ${curLeg.mode}`;
    }

    if (chaseBtn) {
      if (curLeg.state === COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE) {
        chaseBtn.textContent = curLeg.mode.includes('H145')
          ? '🚁 Chase'
          : '✈️ Chase';
      } else if (
        curLeg.state === COMPOSITE_LEG_STATES.LEG_2_AIRFIELD_BOARDING ||
        curLeg.state === COMPOSITE_LEG_STATES.LEG_4_ARRIVAL_TRANSFER
      ) {
        chaseBtn.textContent = '👁️ Ramp Cam';
      } else {
        chaseBtn.textContent = '🚗 Chase';
      }
    }

    if (stepperEl) {
      stepperEl.innerHTML = activeJourney.legs
        .map((l, i) => {
          const isCurrent = i === currentLegIndex;
          const isPast = i < currentLegIndex;
          const bg = isCurrent
            ? 'rgba(245, 158, 11, 0.25)'
            : isPast
              ? 'rgba(16, 185, 129, 0.15)'
              : '#21262d';
          const border = isCurrent ? '#f59e0b' : isPast ? '#10b981' : '#30363d';
          const color = isCurrent ? '#fde68a' : isPast ? '#6ee7b7' : '#8b949e';
          const prefix = isPast ? '✓ ' : `${i + 1}. `;
          const icon = l.icon || LEG_ICONS[i];
          return `
            <div style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${bg}; border: 1px solid ${border}; color: ${color}; white-space: nowrap; font-weight: ${isCurrent ? '700' : '500'};">
              ${prefix}${icon} ${LEG_SHORT_LABELS[i]}
            </div>
          `;
        })
        .join('');
    }

    if (nextBtn) {
      nextBtn.style.opacity = '1.0';
      nextBtn.style.pointerEvents = 'auto';
      nextBtn.textContent =
        currentLegIndex === 4 ? '🏁 Finalize' : '⏭️ Next Leg';
    }

    updateHudCameraButtons(currentCameraMode);
  }

  function setCameraMode(mode = 'chase') {
    currentCameraMode = mode;
    updateHudCameraButtons(mode);
    const curLeg = activeJourney?.legs?.[currentLegIndex];
    if (!curLeg) return;

    if (
      curLeg.state === COMPOSITE_LEG_STATES.LEG_1_GROUND_DRIVEWAY ||
      curLeg.state === COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL
    ) {
      if (driveEngine?.setCameraMode) {
        driveEngine.setCameraMode(
          mode === 'cockpit'
            ? 'cockpit'
            : mode === 'overview'
              ? 'overview'
              : 'chase',
        );
      } else if (
        typeof window !== 'undefined' &&
        window.__gevDriveEngine?.setCameraMode
      ) {
        window.__gevDriveEngine.setCameraMode(
          mode === 'cockpit'
            ? 'cockpit'
            : mode === 'overview'
              ? 'overview'
              : 'chase',
        );
      }
    } else if (curLeg.state === COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE) {
      const activeFlt =
        flightEngine ||
        (typeof window !== 'undefined' ? window.__gevFlightEngine : null);
      if (activeFlt?.setCameraMode) {
        activeFlt.setCameraMode(
          mode === 'cockpit'
            ? 'cockpit'
            : mode === 'overview'
              ? 'overview'
              : mode === 'heli'
                ? 'heli'
                : 'chase',
        );
      }
    } else if (viewer?.camera && curLeg.originCoords) {
      try {
        const groundH = resolvePointGroundHeight(curLeg.originCoords);
        const center = Cesium.Cartesian3.fromDegrees(
          curLeg.originCoords.lon,
          curLeg.originCoords.lat,
          groundH + 40.0,
        );
        const range =
          mode === 'cockpit' ? 50.0 : mode === 'overview' ? 750.0 : 180.0;
        const pitch = mode === 'overview' ? -75.0 : -35.0;
        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(center, range),
          {
            offset: new Cesium.HeadingPitchRange(
              0.0,
              Cesium.Math.toRadians(pitch),
              range,
            ),
            duration: 1.2,
          },
        );
      } catch {
        /* fallback */
      }
    }

    if (mode === 'snap' && viewer) {
      if (curLeg.state === COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE) {
        const activeFlt =
          flightEngine ||
          (typeof window !== 'undefined' ? window.__gevFlightEngine : null);
        const fltEnt = activeFlt?.getActiveFlightEntity?.();
        if (fltEnt) viewer.trackedEntity = fltEnt;
      }
    }
    viewer?.scene?.requestRender?.();
  }

  function planCompositeJourney({
    originDomicile = null,
    destinationDomicileOrPoint = null,
    flightMode = 'h145', // 'h145' | 'airliner'
  } = {}) {
    const origin = originDomicile || {
      lat: 30.2672,
      lon: -97.7431,
      title: 'Civic District Residence',
    };
    const dest = destinationDomicileOrPoint || {
      lat: 34.864,
      lon: -84.324,
      title: 'Mountain Overlook Cabin',
    };

    const isHeli = flightMode === 'h145';

    // 1. Resolve Departure Waypoint
    const depWay = isHeli
      ? findNearestHelipad(origin.lat, origin.lon)
      : AIRPORT_WAYPOINTS.ATL;

    // 2. Resolve Arrival Waypoint
    const arrWay = isHeli
      ? findNearestHelipad(dest.lat, dest.lon)
      : AIRPORT_WAYPOINTS.CLT;

    const ground1DistKm = calculateDistanceKm(
      origin.lat,
      origin.lon,
      depWay.lat,
      depWay.lon,
    );
    const airDistKm = calculateDistanceKm(
      depWay.lat,
      depWay.lon,
      arrWay.lat,
      arrWay.lon,
    );
    const ground2DistKm = calculateDistanceKm(
      arrWay.lat,
      arrWay.lon,
      dest.lat,
      dest.lon,
    );
    const totalDistKm = Math.round(ground1DistKm + airDistKm + ground2DistKm);

    const legs = [
      {
        legNumber: 1,
        id: COMPOSITE_LEG_STATES.LEG_1_GROUND_DRIVEWAY,
        state: COMPOSITE_LEG_STATES.LEG_1_GROUND_DRIVEWAY,
        title: 'Doorstep Ground Departure',
        mode: 'Electric Sedan',
        icon: '🚗',
        from: origin.title || 'Starting Estate',
        to: depWay.name || depWay.shortName || 'Airfield / Helipad',
        originCoords: {
          lat: origin.lat,
          lon: origin.lon,
          elev: estimateWaypointElevation(origin.lat, origin.lon, origin.elev),
        },
        destCoords: {
          lat: depWay.lat,
          lon: depWay.lon,
          elev: estimateWaypointElevation(depWay.lat, depWay.lon, depWay.elev),
        },
        distanceKm: Math.round(ground1DistKm * 10) / 10,
        distanceMi: Math.round(ground1DistKm * 0.621371 * 10) / 10,
        instructions: `Back out of driveway and drive surface streets to ${depWay.shortName || depWay.name}.`,
      },
      {
        legNumber: 2,
        id: COMPOSITE_LEG_STATES.LEG_2_AIRFIELD_BOARDING,
        state: COMPOSITE_LEG_STATES.LEG_2_AIRFIELD_BOARDING,
        title: 'Airfield Ramp & Helipad Transfer',
        mode: 'FBO Pre-Flight Protocol',
        icon: '🛫',
        from: depWay.name || depWay.shortName,
        to: isHeli ? 'Airbus H145 Helipad' : 'Terminal Gate',
        originCoords: {
          lat: depWay.lat,
          lon: depWay.lon,
          elev: estimateWaypointElevation(depWay.lat, depWay.lon, depWay.elev),
        },
        destCoords: {
          lat: depWay.lat,
          lon: depWay.lon,
          elev: estimateWaypointElevation(depWay.lat, depWay.lon, depWay.elev),
        },
        distanceKm: 0.2,
        distanceMi: 0.1,
        instructions: isHeli
          ? 'Enter corporate hangar ramp and board personal Airbus H145 with Fenestron.'
          : 'Check in at terminal and proceed to gate.',
      },
      {
        legNumber: 3,
        id: COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE,
        state: COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE,
        title: isHeli
          ? 'Meditative Rotorcraft Cruise'
          : 'Great-Circle Aerial Cruise',
        mode: isHeli ? 'Airbus H145 (Fenestron)' : 'Great-Circle Flight',
        icon: isHeli ? '🚁' : '✈️',
        from: depWay.name || depWay.shortName,
        to: arrWay.name || arrWay.shortName,
        originCoords: {
          lat: depWay.lat,
          lon: depWay.lon,
          elev: estimateWaypointElevation(depWay.lat, depWay.lon, depWay.elev),
        },
        destCoords: {
          lat: arrWay.lat,
          lon: arrWay.lon,
          elev: estimateWaypointElevation(arrWay.lat, arrWay.lon, arrWay.elev),
        },
        distanceKm: Math.round(airDistKm * 10) / 10,
        distanceMi: Math.round(airDistKm * 0.621371 * 10) / 10,
        cruiseAltMeters: isHeli ? 305 : 10668,
        instructions: isHeli
          ? `Low-and-slow flight at 1,000 ft AGL with Helionix autopilot to ${arrWay.shortName || arrWay.name}.`
          : `High-altitude cruise along great-circle geodesic to ${arrWay.shortName || arrWay.name}.`,
      },
      {
        legNumber: 4,
        id: COMPOSITE_LEG_STATES.LEG_4_ARRIVAL_TRANSFER,
        state: COMPOSITE_LEG_STATES.LEG_4_ARRIVAL_TRANSFER,
        title: 'Destination Touchdown & Ground Transfer',
        mode: 'Fleet Transfer',
        icon: '🛬',
        from: arrWay.name || arrWay.shortName,
        to: 'Local Fleet Staging',
        originCoords: {
          lat: arrWay.lat,
          lon: arrWay.lon,
          elev: estimateWaypointElevation(arrWay.lat, arrWay.lon, arrWay.elev),
        },
        destCoords: {
          lat: arrWay.lat,
          lon: arrWay.lon,
          elev: estimateWaypointElevation(arrWay.lat, arrWay.lon, arrWay.elev),
        },
        distanceKm: 0.2,
        distanceMi: 0.1,
        instructions: `Touchdown at ${arrWay.shortName || arrWay.name} and transfer to local destination vehicle.`,
      },
      {
        legNumber: 5,
        id: COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL,
        state: COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL,
        title: 'Arrival at Destination Sanctuary',
        mode: 'Personal Fleet Sedan',
        icon: '🏡',
        from: arrWay.name || arrWay.shortName,
        to: dest.title || 'Destination Sanctuary',
        originCoords: {
          lat: arrWay.lat,
          lon: arrWay.lon,
          elev: estimateWaypointElevation(arrWay.lat, arrWay.lon, arrWay.elev),
        },
        destCoords: {
          lat: dest.lat,
          lon: dest.lon,
          elev: estimateWaypointElevation(dest.lat, dest.lon, dest.elev),
        },
        distanceKm: Math.round(ground2DistKm * 10) / 10,
        distanceMi: Math.round(ground2DistKm * 0.621371 * 10) / 10,
        instructions: `Pull up surface streets into ${dest.title || 'destination'} driveway / portico.`,
      },
    ];

    activeJourney = {
      id: `journey_${Date.now()}`,
      origin,
      destination: dest,
      originDomicile: origin,
      destinationDomicileOrPoint: dest,
      flightMode,
      departureFacility: depWay,
      arrivalFacility: arrWay,
      totalDistanceKm: totalDistKm,
      totalDistanceMi: Math.round(totalDistKm * 0.621371),
      totalDistanceMiles: Math.round(totalDistKm * 0.621371),
      legs,
    };

    currentLegIndex = 0;
    status = COMPOSITE_LEG_STATES.IDLE;
    return activeJourney;
  }

  function startJourney() {
    if (!activeJourney) {
      planCompositeJourney();
    }
    currentLegIndex = 0;
    status = LEG_SEQUENCE[0];
    holdContinuousRender('composite-journey');

    if (hudStrip) {
      hudStrip.style.display = 'flex';
      hudStrip.style.opacity = '1.0';
    }

    // Trigger Leg 1 in fleet / drive engine if available
    const leg1 = activeJourney.legs[0];
    if (
      typeof window !== 'undefined' &&
      window.__gevDriveDrawer?.startCustomDrive
    ) {
      window.__gevDriveDrawer.startCustomDrive(
        leg1.originCoords,
        leg1.destCoords,
      );
    } else if (fleetEngine?.handoffToRoadTrip) {
      fleetEngine.handoffToRoadTrip({
        lat: leg1.destCoords.lat,
        lon: leg1.destCoords.lon,
        title: leg1.to,
      });
    } else if (driveEngine?.startRouteDrive) {
      driveEngine.startRouteDrive(leg1.originCoords, leg1.destCoords, {
        vehicleName: leg1.mode,
      });
    }

    updateHudDisplay();
    dock.notifySimulationStarted('composite', { keepIds: ['drive', 'flight'] });
    viewer?.scene?.requestRender?.();
    return getActiveTelemetry();
  }

  function advanceLeg() {
    if (!activeJourney) return null;

    // Clean up current transport mode before advancing
    const prevLeg = activeJourney.legs[currentLegIndex];
    if (prevLeg) {
      if (
        prevLeg.state === COMPOSITE_LEG_STATES.LEG_1_GROUND_DRIVEWAY ||
        prevLeg.state === COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL
      ) {
        if (driveEngine?.stopDrive) driveEngine.stopDrive();
        else if (
          typeof window !== 'undefined' &&
          window.__gevDriveEngine?.stopDrive
        ) {
          window.__gevDriveEngine.stopDrive();
        }
      } else if (prevLeg.state === COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE) {
        const activeFlt =
          flightEngine ||
          (typeof window !== 'undefined' ? window.__gevFlightEngine : null);
        if (activeFlt?.stopFlight) activeFlt.stopFlight();
      }
    }

    currentLegIndex = Math.min(activeJourney.legs.length, currentLegIndex + 1);

    if (currentLegIndex >= activeJourney.legs.length) {
      status = COMPOSITE_LEG_STATES.COMPLETED;
      releaseContinuousRender('composite-journey');
      dock.notifySimulationStopped('composite');
      if (viewer?.camera && activeJourney.destination) {
        try {
          const destCoords = activeJourney.destination;
          const groundH = resolvePointGroundHeight(destCoords);
          const center = Cesium.Cartesian3.fromDegrees(
            destCoords.lon,
            destCoords.lat,
            groundH + 50.0,
          );
          viewer.camera.flyToBoundingSphere(
            new Cesium.BoundingSphere(center, 280.0),
            {
              offset: new Cesium.HeadingPitchRange(
                0.0,
                Cesium.Math.toRadians(-45.0),
                280.0,
              ),
              duration: 2.0,
            },
          );
        } catch {
          /* fallback */
        }
      }
    } else {
      status = LEG_SEQUENCE[currentLegIndex];
      const curLeg = activeJourney.legs[currentLegIndex];

      // Execute leg transition action
      if (curLeg.state === COMPOSITE_LEG_STATES.LEG_2_AIRFIELD_BOARDING) {
        if (viewer?.camera && curLeg.originCoords) {
          try {
            const groundH = resolvePointGroundHeight(curLeg.originCoords);
            const center = Cesium.Cartesian3.fromDegrees(
              curLeg.originCoords.lon,
              curLeg.originCoords.lat,
              groundH + 40.0,
            );
            viewer.camera.flyToBoundingSphere(
              new Cesium.BoundingSphere(center, 180.0),
              {
                offset: new Cesium.HeadingPitchRange(
                  0.0,
                  Cesium.Math.toRadians(-35.0),
                  180.0,
                ),
                duration: 1.5,
              },
            );
          } catch {
            /* fallback */
          }
        }
      } else if (curLeg.state === COMPOSITE_LEG_STATES.LEG_3_AIRBORNE_CRUISE) {
        const activeFlt =
          flightEngine ||
          (typeof window !== 'undefined' ? window.__gevFlightEngine : null);
        if (activeFlt?.spawnFlightRoute) {
          const fromQ = `${curLeg.originCoords.lat},${curLeg.originCoords.lon}`;
          const toQ = `${curLeg.destCoords.lat},${curLeg.destCoords.lon}`;
          activeFlt.spawnFlightRoute(fromQ, toQ, {
            isRotorcraft: activeJourney.flightMode === 'h145',
            aircraftType: activeJourney.flightMode,
            cruiseAlt: curLeg.cruiseAltMeters,
            callsign: activeJourney.flightMode === 'h145' ? 'N145FX' : 'MX-88',
          });
        }
      } else if (curLeg.state === COMPOSITE_LEG_STATES.LEG_4_ARRIVAL_TRANSFER) {
        if (viewer?.camera && curLeg.originCoords) {
          try {
            const groundH = resolvePointGroundHeight(curLeg.originCoords);
            const center = Cesium.Cartesian3.fromDegrees(
              curLeg.originCoords.lon,
              curLeg.originCoords.lat,
              groundH + 40.0,
            );
            viewer.camera.flyToBoundingSphere(
              new Cesium.BoundingSphere(center, 180.0),
              {
                offset: new Cesium.HeadingPitchRange(
                  0.0,
                  Cesium.Math.toRadians(-35.0),
                  180.0,
                ),
                duration: 1.5,
              },
            );
          } catch {
            /* fallback */
          }
        }
      } else if (
        curLeg.state === COMPOSITE_LEG_STATES.LEG_5_DESTINATION_ARRIVAL
      ) {
        if (
          typeof window !== 'undefined' &&
          window.__gevDriveDrawer?.startCustomDrive
        ) {
          window.__gevDriveDrawer.startCustomDrive(
            curLeg.originCoords,
            curLeg.destCoords,
          );
        } else if (driveEngine?.startRouteDrive) {
          driveEngine.startRouteDrive(curLeg.originCoords, curLeg.destCoords, {
            vehicleName: curLeg.mode,
          });
        } else if (fleetEngine?.handoffToRoadTrip) {
          fleetEngine.handoffToRoadTrip({
            lat: curLeg.destCoords.lat,
            lon: curLeg.destCoords.lon,
            title: curLeg.to,
          });
        }
      }
    }

    updateHudDisplay();
    viewer?.scene?.requestRender?.();
    return getActiveTelemetry();
  }

  function cancelJourney() {
    releaseContinuousRender('composite-journey');
    if (driveEngine?.stopDrive) driveEngine.stopDrive();
    else if (
      typeof window !== 'undefined' &&
      window.__gevDriveEngine?.stopDrive
    ) {
      window.__gevDriveEngine.stopDrive();
    }
    const activeFlt =
      flightEngine ||
      (typeof window !== 'undefined' ? window.__gevFlightEngine : null);
    if (activeFlt?.stopFlight) activeFlt.stopFlight();

    if (hudStrip) {
      hudStrip.style.display = 'none';
    }
    status = COMPOSITE_LEG_STATES.IDLE;
    currentLegIndex = 0;
    activeJourney = null;
    dock.notifySimulationStopped('composite');
    viewer?.scene?.requestRender?.();
  }

  function getActiveTelemetry() {
    if (!activeJourney) return null;
    const curLeg =
      currentLegIndex < activeJourney.legs.length
        ? activeJourney.legs[currentLegIndex]
        : null;

    return {
      journeyId: activeJourney.id,
      status,
      currentLegIndex: currentLegIndex + 1,
      totalLegs: activeJourney.legs.length,
      activeLeg: curLeg,
      origin: activeJourney.origin.title,
      destination: activeJourney.destination.title,
      flightMode: activeJourney.flightMode,
      totalDistanceMi: activeJourney.totalDistanceMi,
      isTraveling:
        status !== COMPOSITE_LEG_STATES.IDLE &&
        status !== COMPOSITE_LEG_STATES.COMPLETED,
      isCompleted: status === COMPOSITE_LEG_STATES.COMPLETED,
    };
  }

  dock.registerSimulation('composite', {
    stop: () => cancelJourney(),
    isActive: () => Boolean(getActiveTelemetry()?.isTraveling),
  });

  return {
    planCompositeJourney,
    startJourney,
    advanceLeg,
    cancelJourney,
    stopJourney: cancelJourney,
    setCameraMode,
    getCameraMode: () => currentCameraMode,
    getActiveTelemetry,
    getActiveJourney: () => activeJourney,
    getStatus: () => status,
    destroy: () => {
      cancelJourney();
      dock.unregisterSimulation('composite');
      dock.unregisterOverlayGroup('composite-hud');
      hudStrip?.remove?.();
    },
  };
}
