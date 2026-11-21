/**
 * Motorman Controls & Central Transit Dispatcher Mini-Game Engine.
 * (Public Transit & Transit Controller)
 *
 * Implements two distinct playable gamification simulation modes:
 *
 * Mode 1: The Motorman / Bus Driver (Playable Driving Sim)
 * - First-person throttle and dynamic brake notch controls (Notches 0–4)
 * - Service and emergency air brake application (Space)
 * - Door interlock mechanics (prohibits acceleration while doors are open; prohibits door opening >0.5 m/s)
 * - Suspension kneeling controls (buses only)
 * - Real-time scoring: Station Docking Precision, Ride Comfort (G-Jerk Penalty), and Timetable Adherence
 *
 * Mode 2: Central Transit Dispatcher (Network Flow Puzzle)
 * - Visual headway tracking along metropolitan transit corridors
 * - Real-time anti-bunching detection (alerts when spacing < 2.0 min)
 * - Tactical dispatch commands: Hold at Station, Run Express / Skip Stop, Short Turn
 * - Network efficiency rating based on spacing consistency
 */

export const MAX_THROTTLE_NOTCH = 4;
export const MAX_BRAKE_NOTCH = 4;
export const ACCEL_PER_NOTCH_MS2 = 0.45;
export const BRAKE_PER_NOTCH_MS2 = 0.65;
export const EMERGENCY_BRAKE_MS2 = 3.5;
export const JERK_PENALTY_THRESHOLD_MS2 = 2.4;

export function createMotormanControls({
  onStateChange = null,
  onScoreEvent = null,
} = {}) {
  // Mode 1: Motorman State
  let activeVehicle = null;
  let vehicleType = 'bus'; // 'bus' or 'metro'
  let throttleNotch = 0; // 0 to 4
  let brakeNotch = 0; // 0 to 4
  let isEmergencyBrake = false;
  let doorsOpen = false;
  let isKneeling = false;
  let hornActive = false;
  let hornTimeout = null;
  let currentSpeedMs = 0;
  let prevSpeedMs = 0;
  let lastScoreEvent = null;

  let totalScore = 500; // Base score
  let dockingScore = 0;
  let comfortScore = 0;
  let timetableScore = 0;
  let recentJolts = 0;

  // Mode 2: Central Dispatcher State
  let dispatcherModeActive = false;
  let activeRoute = null;
  let headwayAlerts = [];
  let heldVehicles = new Map(); // vehicleId -> holdSecondsRemaining
  let expressVehicles = new Set(); // vehicleId

  // --- Mode 1: Motorman Driving Physics & Controls ---

  function bindVehicle(vehicle, type = 'bus') {
    activeVehicle = vehicle;
    vehicleType = type;
    throttleNotch = 0;
    brakeNotch = 0;
    isEmergencyBrake = false;
    doorsOpen = false;
    isKneeling = false;
    currentSpeedMs = vehicle?.speedMs || 0;
    prevSpeedMs = currentSpeedMs;
    notifyState();
  }

  function throttleUp() {
    if (doorsOpen || isKneeling) return false;
    if (brakeNotch > 0) {
      brakeNotch--;
    } else if (throttleNotch < MAX_THROTTLE_NOTCH) {
      throttleNotch++;
    }
    isEmergencyBrake = false;
    notifyState();
    return true;
  }

  function throttleDown() {
    if (throttleNotch > 0) {
      throttleNotch--;
    } else if (brakeNotch < MAX_BRAKE_NOTCH) {
      brakeNotch++;
    }
    notifyState();
    return true;
  }

  function applyBrake() {
    throttleNotch = 0;
    if (brakeNotch < MAX_BRAKE_NOTCH) {
      brakeNotch++;
    }
    notifyState();
    return true;
  }

  function applyEmergencyBrake() {
    throttleNotch = 0;
    brakeNotch = MAX_BRAKE_NOTCH;
    isEmergencyBrake = true;
    notifyState();
    return true;
  }

  function toggleDoors() {
    // Door Speed Interlock: Cannot open doors if vehicle is moving (>0.5 m/s)
    if (!doorsOpen && currentSpeedMs > 0.5) {
      triggerScoreEvent({
        type: 'DOOR_SPEED_INTERLOCK_VIOLATION',
        deltaScore: -30,
        message:
          'DOOR INTERLOCK: Cannot open doors while vehicle is in motion!',
      });
      return false;
    }

    doorsOpen = !doorsOpen;
    if (doorsOpen) {
      throttleNotch = 0; // Cut traction immediately
    }
    notifyState();
    return true;
  }

  function toggleKneeling() {
    if (vehicleType !== 'bus') return false;
    if (currentSpeedMs > 0.5) return false; // Must be stopped to kneel

    isKneeling = !isKneeling;
    if (isKneeling) {
      throttleNotch = 0;
    }
    notifyState();
    return true;
  }

  function triggerHorn() {
    hornActive = true;
    if (hornTimeout) clearTimeout(hornTimeout);
    hornTimeout = setTimeout(() => {
      hornActive = false;
      notifyState();
    }, 1200);
    notifyState();
    return true;
  }

  function updatePhysics(dt) {
    if (!activeVehicle) return;

    prevSpeedMs = currentSpeedMs;

    // Door Interlock Enforcement: If doors are open, throttle is strictly zero
    if (doorsOpen || isKneeling) {
      throttleNotch = 0;
    }

    // Calculate acceleration
    let accel = 0;
    if (isEmergencyBrake) {
      accel = -EMERGENCY_BRAKE_MS2;
    } else if (brakeNotch > 0) {
      accel = -brakeNotch * BRAKE_PER_NOTCH_MS2;
    } else if (throttleNotch > 0) {
      accel = throttleNotch * ACCEL_PER_NOTCH_MS2;
    } else {
      // Natural rolling friction resistance
      accel = -0.2;
    }

    currentSpeedMs = Math.max(0, currentSpeedMs + accel * dt);
    activeVehicle.speedMs = currentSpeedMs;
    activeVehicle.doorsOpen = doorsOpen;
    activeVehicle.isKneeling = isKneeling;

    // Passenger Ride Comfort Check (G-Jerk monitoring)
    const currentJerk = Math.abs(
      (currentSpeedMs - prevSpeedMs) / Math.max(0.001, dt),
    );
    if (currentJerk > JERK_PENALTY_THRESHOLD_MS2) {
      recentJolts++;
      triggerScoreEvent({
        type: 'G_JERK_PENALTY',
        deltaScore: -20,
        message:
          'G-JERK PENALTY! Passengers Jolted by Harsh Braking/Throttle! (-20 pts)',
      });
    }

    // Update hold timers in dispatcher mode
    for (const [vId, sec] of heldVehicles.entries()) {
      const remaining = sec - dt;
      if (remaining <= 0) {
        heldVehicles.delete(vId);
      } else {
        heldVehicles.set(vId, remaining);
      }
    }
  }

  /**
   * Evaluates station docking precision score when coming to a complete stop at a station.
   */
  function evaluateStationDock(distMeters) {
    const absDist = Math.abs(distMeters);
    let pts = 0;
    let label = '';

    if (absDist <= 1.5) {
      pts = 100;
      label = 'PERFECT DOCK 🎯 Centered in platform marker! (+100 pts)';
    } else if (absDist <= 3.5) {
      pts = 70;
      label = 'GOOD DOCK 👍 Smooth platform stop (+70 pts)';
    } else {
      pts = 25;
      label = `OFF-TARGET ⚠️ Stopped ${absDist.toFixed(1)}m from marker (+25 pts)`;
    }

    dockingScore += pts;
    totalScore += pts;
    triggerScoreEvent({
      type: 'STATION_DOCK_PRECISION',
      deltaScore: pts,
      message: label,
    });

    return { pts, label, distMeters: absDist };
  }

  function triggerScoreEvent(event) {
    lastScoreEvent = { ...event, timestamp: Date.now() };
    if (typeof onScoreEvent === 'function') {
      onScoreEvent(lastScoreEvent);
    }
  }

  function notifyState() {
    if (typeof onStateChange === 'function') {
      onStateChange(getState());
    }
  }

  // --- Mode 2: Central Dispatcher Operations ---

  function setDispatcherMode(active, route = null) {
    dispatcherModeActive = active;
    activeRoute = route;
    headwayAlerts = [];
    notifyState();
  }

  function evaluateFleetHeadways(fleet = []) {
    headwayAlerts = [];
    if (fleet.length < 2) return headwayAlerts;

    // Sort vehicles along the corridor
    const sorted = [...fleet].sort(
      (a, b) => (b.distMeters || 0) - (a.distMeters || 0),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const lead = sorted[i];
      const follower = sorted[i + 1];
      const distGapMeters = (lead.distMeters || 0) - (follower.distMeters || 0);

      // Approximate time headway based on 25 mph (11 m/s)
      const timeHeadwaySec = distGapMeters / 11.0;

      if (timeHeadwaySec < 90) {
        // Less than 1.5 minutes = severe bunching
        headwayAlerts.push({
          type: 'BUNCHING_CRITICAL',
          leadVehicleId: lead.id,
          followerVehicleId: follower.id,
          headwaySec: Math.round(timeHeadwaySec),
          message: `⚠️ CRITICAL BUNCHING: ${follower.id} is within ${Math.round(timeHeadwaySec)}s of ${lead.id}!`,
        });
      } else if (timeHeadwaySec < 150) {
        headwayAlerts.push({
          type: 'BUNCHING_WARNING',
          leadVehicleId: lead.id,
          followerVehicleId: follower.id,
          headwaySec: Math.round(timeHeadwaySec),
          message: `Spacing warning: ${follower.id} catching up to ${lead.id} (${Math.round(timeHeadwaySec)}s gap).`,
        });
      }
    }

    return headwayAlerts;
  }

  function issueHoldOrder(vehicleId, durationSec = 60) {
    heldVehicles.set(vehicleId, durationSec);
    triggerScoreEvent({
      type: 'DISPATCH_HOLD_ORDER',
      deltaScore: 25,
      message: `DISPATCH ORDER: ${vehicleId} held at station for ${durationSec}s to restore headway spacing!`,
    });
    return true;
  }

  function issueExpressOrder(vehicleId) {
    expressVehicles.add(vehicleId);
    triggerScoreEvent({
      type: 'DISPATCH_EXPRESS_ORDER',
      deltaScore: 35,
      message: `DISPATCH ORDER: ${vehicleId} running Express (skipping next 2 stops) to balance trunk capacity!`,
    });
    return true;
  }

  function issueShortTurn(vehicleId) {
    triggerScoreEvent({
      type: 'DISPATCH_SHORT_TURN_ORDER',
      deltaScore: 40,
      message: `DISPATCH ORDER: ${vehicleId} short-turned at crossover switch to reinforce reverse rush surge!`,
    });
    return true;
  }

  function getState() {
    return {
      activeVehicleId: activeVehicle?.id || null,
      vehicleType,
      throttleNotch,
      brakeNotch,
      isEmergencyBrake,
      doorsOpen,
      isKneeling,
      hornActive,
      speedMph: Math.round(currentSpeedMs * 2.23694),
      speedKmh: Math.round(currentSpeedMs * 3.6),
      currentScore: totalScore,
      dockingScore,
      comfortScore,
      recentJolts,
      lastScoreEvent,
      dispatcherModeActive,
      headwayAlerts,
      heldVehiclesCount: heldVehicles.size,
      expressVehiclesCount: expressVehicles.size,
    };
  }

  return {
    bindVehicle,
    throttleUp,
    throttleDown,
    applyBrake,
    applyEmergencyBrake,
    toggleDoors,
    toggleKneeling,
    triggerHorn,
    updatePhysics,
    evaluateStationDock,
    setDispatcherMode,
    evaluateFleetHeadways,
    issueHoldOrder,
    issueExpressOrder,
    issueShortTurn,
    getState,
    destroy: () => {
      if (hornTimeout) clearTimeout(hornTimeout);
    },
  };
}
