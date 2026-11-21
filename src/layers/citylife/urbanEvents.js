/**
 * Urban Spectacles Engine for Living City Simulation.
 * (Living City Capability + Route Slice)
 *
 * Implements Street Grand Prix closed-loop street circuits (Monaco, Vegas Strip, Long Beach)
 * with multi-car grid packs, broadcast chase cams, and lap telemetry;
 * Street festivals & cultural celebrations (Atlanta Dogwood, Shibuya Saturday Night);
 * and Emergency City Pulse first-responder runs with alternating strobe reticles.
 */

import * as Cesium from 'cesium';

export const URBAN_EVENTS = {
  monaco_gp: {
    id: 'monaco_gp',
    name: 'Monaco Grand Prix Circuit',
    type: 'race',
    cityId: 'monaco',
    totalLaps: 12,
    lapDistanceMeters: 3337,
    carCount: 12,
    topSpeedKmh: 280,
    minSpeedKmh: 65,
    cameraOffset: { x: 0, y: -45, z: 35 }, // Broadcast helicopter view
    trackOverviewCamera: {
      lon: 7.426,
      lat: 43.738,
      height: 1150,
      heading: 25,
      pitch: -52,
    },
    grandstandCamera: {
      lon: 7.4308,
      lat: 43.7383,
      height: 35,
      heading: 310,
      pitch: -18,
    },
    waypoints: [
      {
        name: 'Pit Straight',
        lat: 43.7362,
        lon: 7.4225,
        elev: 6,
        targetSpeedKmh: 260,
      },
      {
        name: 'Sainte-Dévote',
        lat: 43.7375,
        lon: 7.4215,
        elev: 8,
        targetSpeedKmh: 95,
      },
      {
        name: 'Beau Rivage Climb',
        lat: 43.7392,
        lon: 7.4242,
        elev: 22,
        targetSpeedKmh: 235,
      },
      {
        name: 'Massenet',
        lat: 43.7401,
        lon: 7.4268,
        elev: 35,
        targetSpeedKmh: 140,
      },
      {
        name: 'Casino Square',
        lat: 43.7398,
        lon: 7.4282,
        elev: 36,
        targetSpeedKmh: 165,
      },
      {
        name: 'Mirabeau Haute',
        lat: 43.739,
        lon: 7.4295,
        elev: 30,
        targetSpeedKmh: 90,
      },
      {
        name: 'Fairmont Hairpin',
        lat: 43.7385,
        lon: 7.4305,
        elev: 24,
        targetSpeedKmh: 65,
      },
      {
        name: 'Mirabeau Bas',
        lat: 43.7388,
        lon: 7.4312,
        elev: 16,
        targetSpeedKmh: 110,
      },
      {
        name: 'Portier',
        lat: 43.7395,
        lon: 7.4325,
        elev: 10,
        targetSpeedKmh: 85,
      },
      {
        name: 'The Tunnel Entry',
        lat: 43.739,
        lon: 7.4315,
        elev: 8,
        targetSpeedKmh: 245,
      },
      {
        name: 'The Tunnel Exit',
        lat: 43.7378,
        lon: 7.429,
        elev: 7,
        targetSpeedKmh: 280,
      },
      {
        name: 'Nouvelle Chicane',
        lat: 43.7368,
        lon: 7.4272,
        elev: 6,
        targetSpeedKmh: 90,
      },
      {
        name: 'Tabac Corner',
        lat: 43.7355,
        lon: 7.4258,
        elev: 6,
        targetSpeedKmh: 170,
      },
      {
        name: 'Louis Chiron Chicane',
        lat: 43.7345,
        lon: 7.4245,
        elev: 6,
        targetSpeedKmh: 195,
      },
      {
        name: 'Swimming Pool',
        lat: 43.7338,
        lon: 7.4238,
        elev: 6,
        targetSpeedKmh: 130,
      },
      {
        name: 'La Rascasse',
        lat: 43.7348,
        lon: 7.4228,
        elev: 6,
        targetSpeedKmh: 75,
      },
      {
        name: 'Anthony Noghès',
        lat: 43.7355,
        lon: 7.4222,
        elev: 6,
        targetSpeedKmh: 95,
      },
      {
        name: 'Pit Straight',
        lat: 43.7362,
        lon: 7.4225,
        elev: 6,
        targetSpeedKmh: 260,
      }, // Loop closure
    ],
    teams: [
      { name: 'Scuderia Red', color: '#ef4444', driver: 'Leclerc' },
      { name: 'Silver Arrows', color: '#94a3b8', driver: 'Hamilton' },
      { name: 'Bulls Racing', color: '#1e3a8a', driver: 'Verstappen' },
      { name: 'Papaya Orange', color: '#f97316', driver: 'Norris' },
      { name: 'Emerald Speed', color: '#059669', driver: 'Alonso' },
      { name: 'Alpine Cyan', color: '#06b6d4', driver: 'Gasly' },
      { name: 'Midnight Blue', color: '#3b82f6', driver: 'Russell' },
      { name: 'Prancing Stallion', color: '#dc2626', driver: 'Sainz' },
      { name: 'Neon Papaya', color: '#fb923c', driver: 'Piastri' },
      { name: 'Racing Bull Gold', color: '#eab308', driver: 'Tsunoda' },
      { name: 'Stealth Carbon', color: '#475569', driver: 'Hülkenberg' },
      { name: 'Williams Azure', color: '#38bdf8', driver: 'Albon' },
    ],
  },

  vegas_gp: {
    id: 'vegas_gp',
    name: 'Las Vegas Strip Street Circuit',
    type: 'race',
    cityId: 'las_vegas',
    totalLaps: 10,
    lapDistanceMeters: 6201,
    carCount: 12,
    topSpeedKmh: 340,
    minSpeedKmh: 80,
    cameraOffset: { x: 0, y: -65, z: 50 },
    trackOverviewCamera: {
      lon: -115.165,
      lat: 36.115,
      height: 1900,
      heading: 0,
      pitch: -48,
    },
    grandstandCamera: {
      lon: -115.163,
      lat: 36.1205,
      height: 635,
      heading: 210,
      pitch: -16,
    },
    waypoints: [
      {
        name: 'Pit Straight (Koval Lane)',
        lat: 36.115,
        lon: -115.161,
        elev: 610,
        targetSpeedKmh: 270,
      },
      {
        name: 'Turn 1 Hairpin',
        lat: 36.1185,
        lon: -115.1612,
        elev: 610,
        targetSpeedKmh: 95,
      },
      {
        name: 'Sphere Chicane',
        lat: 36.1215,
        lon: -115.1625,
        elev: 610,
        targetSpeedKmh: 145,
      },
      {
        name: 'Sands Avenue Blast',
        lat: 36.1248,
        lon: -115.1665,
        elev: 610,
        targetSpeedKmh: 290,
      },
      {
        name: 'Las Vegas Blvd Entry',
        lat: 36.1245,
        lon: -115.1715,
        elev: 610,
        targetSpeedKmh: 110,
      },
      {
        name: 'The Strip Straight (Bellagio)',
        lat: 36.118,
        lon: -115.1725,
        elev: 610,
        targetSpeedKmh: 340,
      },
      {
        name: 'The Strip Straight (Caesars)',
        lat: 36.112,
        lon: -115.1732,
        elev: 610,
        targetSpeedKmh: 340,
      },
      {
        name: 'Harmon Avenue Turn',
        lat: 36.1085,
        lon: -115.173,
        elev: 610,
        targetSpeedKmh: 90,
      },
      {
        name: 'Harmon Ave Straight',
        lat: 36.1088,
        lon: -115.165,
        elev: 610,
        targetSpeedKmh: 280,
      },
      {
        name: 'Koval Lane Return',
        lat: 36.1115,
        lon: -115.1615,
        elev: 610,
        targetSpeedKmh: 190,
      },
      {
        name: 'Pit Straight (Koval Lane)',
        lat: 36.115,
        lon: -115.161,
        elev: 610,
        targetSpeedKmh: 270,
      }, // Loop closure
    ],
    teams: [
      { name: 'Scuderia Red', color: '#ef4444', driver: 'Leclerc' },
      { name: 'Silver Arrows', color: '#94a3b8', driver: 'Hamilton' },
      { name: 'Bulls Racing', color: '#1e3a8a', driver: 'Verstappen' },
      { name: 'Papaya Orange', color: '#f97316', driver: 'Norris' },
      { name: 'Emerald Speed', color: '#059669', driver: 'Alonso' },
      { name: 'Alpine Cyan', color: '#06b6d4', driver: 'Gasly' },
      { name: 'Midnight Blue', color: '#3b82f6', driver: 'Russell' },
      { name: 'Prancing Stallion', color: '#dc2626', driver: 'Sainz' },
      { name: 'Neon Papaya', color: '#fb923c', driver: 'Piastri' },
      { name: 'Racing Bull Gold', color: '#eab308', driver: 'Tsunoda' },
      { name: 'Stealth Carbon', color: '#475569', driver: 'Hülkenberg' },
      { name: 'Williams Azure', color: '#38bdf8', driver: 'Albon' },
    ],
  },

  atlanta_dogwood: {
    id: 'atlanta_dogwood',
    name: 'Atlanta Dogwood Festival (Piedmont Park)',
    type: 'festival',
    cityId: 'atlanta',
    crowdMultiplier: 4,
    center: { lat: 33.7845, lon: -84.3715, elev: 287 },
    overviewCamera: {
      lon: -84.3715,
      lat: 33.7845,
      height: 480,
      heading: 15,
      pitch: -35,
    },
    promenadeCamera: {
      lon: -84.3725,
      lat: 33.784,
      height: 289,
      heading: 45,
      pitch: -10,
    },
    balconyCamera: {
      lon: -84.3745,
      lat: 33.7832,
      height: 335,
      heading: 60,
      pitch: -22,
    },
    kiosks: [
      { name: 'Artisan Pavilion', lat: 33.784, lon: -84.3722, elev: 287 },
      { name: 'Main Meadow Stage', lat: 33.7852, lon: -84.3708, elev: 288 },
      { name: 'Food Truck Alley', lat: 33.786, lon: -84.373, elev: 287 },
      { name: 'Clara Meer Boardwalk', lat: 33.7832, lon: -84.374, elev: 286 },
    ],
  },

  shibuya_halloween: {
    id: 'shibuya_halloween',
    name: 'Shibuya Crossing Saturday Night Rush',
    type: 'festival',
    cityId: 'tokyo',
    crowdMultiplier: 5,
    center: { lat: 35.6595, lon: 139.7005, elev: 20 },
    overviewCamera: {
      lon: 139.7005,
      lat: 35.6595,
      height: 380,
      heading: 0,
      pitch: -40,
    },
    promenadeCamera: {
      lon: 139.7002,
      lat: 35.6591,
      height: 22,
      heading: 45,
      pitch: -8,
    },
    balconyCamera: {
      lon: 139.6995,
      lat: 35.6605,
      height: 65,
      heading: 160,
      pitch: -28,
    },
    kiosks: [
      {
        name: 'Hachiko Plaza Gathering',
        lat: 35.6591,
        lon: 139.7002,
        elev: 20,
      },
      { name: 'Miyashita Footbridge', lat: 35.6608, lon: 139.702, elev: 24 },
      { name: 'Center-Gai Entrance', lat: 35.6598, lon: 139.6995, elev: 20 },
    ],
  },

  emergency_pulse: {
    id: 'emergency_pulse',
    name: 'Emergency City Pulse (Code 3 First Responders)',
    type: 'emergency',
    cityId: 'atlanta',
    speedMph: 65,
    vehicles: [
      {
        id: 'police_1',
        label: 'APD Cruiser 104',
        type: 'police',
        color: '#2563eb',
        strobe: ['#2563eb', '#dc2626'],
      },
      {
        id: 'fire_1',
        label: 'Engine 11 Heavy Rescue',
        type: 'fire',
        color: '#dc2626',
        strobe: ['#dc2626', '#f59e0b'],
      },
      {
        id: 'ems_1',
        label: 'Grady EMS Unit 42',
        type: 'ems',
        color: '#ffffff',
        strobe: ['#dc2626', '#ffffff'],
      },
    ],
  },
};

/**
 * Pure helper function to generate equidistant Cartesian trajectory points
 * along a closed-loop circuit with smooth cubic interpolation.
 */
export function generateCircuitTrajectory(
  waypoints,
  sampleIntervalMeters = 15,
) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return [];

  const points = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    const c1 = Cesium.Cartesian3.fromDegrees(
      p1.lon,
      p1.lat,
      (p1.elev || 0) + 0.35,
    );
    const c2 = Cesium.Cartesian3.fromDegrees(
      p2.lon,
      p2.lat,
      (p2.elev || 0) + 0.35,
    );

    const dist = Cesium.Cartesian3.distance(c1, c2);
    const steps = Math.max(1, Math.ceil(dist / sampleIntervalMeters));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const pt = Cesium.Cartesian3.lerp(c1, c2, t, new Cesium.Cartesian3());
      points.push(pt);
    }
  }

  // Include final point
  const last = waypoints[waypoints.length - 1];
  points.push(
    Cesium.Cartesian3.fromDegrees(last.lon, last.lat, (last.elev || 0) + 0.35),
  );

  // Precompute cumulative arc distances along circuit
  const cumDists = [0];
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segDist = Cesium.Cartesian3.distance(points[i], points[i + 1]);
    totalDist += segDist;
    cumDists.push(totalDist);
  }
  points.cumulativeDistances = cumDists;
  points.totalDistance = Math.max(totalDist, 1);

  return points;
}

/**
 * Samples a position and forward tangent along a closed-loop circuit trajectory.
 */
function sampleCircuitAtDistance(points, distMeters) {
  const cumDists = points.cumulativeDistances || [0, 1];
  const totalDist = points.totalDistance || 1;

  let d = distMeters % totalDist;
  if (d < 0) d += totalDist;

  let segIdx = 0;
  for (let i = 0; i < cumDists.length - 1; i++) {
    if (d >= cumDists[i] && d <= cumDists[i + 1]) {
      segIdx = i;
      break;
    }
  }

  const p1 = points[segIdx] || points[0];
  const p2 = points[segIdx + 1] || p1;
  const segLen = cumDists[segIdx + 1] - cumDists[segIdx] || 1e-4;
  const t = Math.max(0, Math.min(1, (d - cumDists[segIdx]) / segLen));

  const pos = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
  const forward = Cesium.Cartesian3.subtract(p2, p1, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(forward) > 1e-6) {
    Cesium.Cartesian3.normalize(forward, forward);
  } else {
    Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z, forward);
  }

  return { pos, forward, segIdx };
}

/**
 * Creates the Urban Spectacles simulation engine.
 */
export function createUrbanEventsEngine({ viewer = null } = {}) {
  let activeEvent = null;
  let eventEntities = [];
  let preRenderListener = null;
  let activeTelemetry = null;
  let isDestroyed = false;
  let currentCameraMode = 'chase';
  let isTransitioning = false;
  let onEventStartedCallback = null;

  function stopUrbanEvent() {
    isTransitioning = false;
    if (viewer?.camera && typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    if (preRenderListener && viewer?.scene?.preRender) {
      preRenderListener();
      preRenderListener = null;
    }

    if (viewer?.entities) {
      for (const entity of eventEntities) {
        try {
          viewer.entities.remove(entity);
        } catch {
          /* ignore */
        }
      }
    }
    eventEntities = [];
    activeEvent = null;
    activeTelemetry = null;
  }

  function applyRaceCameraFollow(leader, mode, spec) {
    if (!viewer?.camera || !leader?.currentPos || !leader?.currentForward)
      return;
    if (mode === 'free' || mode === 'overview') return;

    const leaderPos = leader.currentPos;
    const forwardVec = leader.currentForward;

    if (typeof viewer.camera.lookAtTransform === 'function') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }

    const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      leaderPos,
      new Cesium.Cartesian3(),
    );
    const right = Cesium.Cartesian3.cross(
      forwardVec,
      normal,
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
      Cesium.Cartesian3.normalize(right, right);
    }
    const trueForward = Cesium.Cartesian3.cross(
      normal,
      right,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(trueForward, trueForward);

    const camPos = Cesium.Cartesian3.clone(leaderPos, new Cesium.Cartesian3());
    const lookTarget = Cesium.Cartesian3.clone(
      leaderPos,
      new Cesium.Cartesian3(),
    );
    const scratchFwd = new Cesium.Cartesian3();
    const scratchUp = new Cesium.Cartesian3();
    const scratchRight = new Cesium.Cartesian3();

    if (mode === 'cockpit' || mode === 'nose' || mode === 'bumper') {
      // Low hood / nose cam 1.1m up, 1.8m forward
      Cesium.Cartesian3.multiplyByScalar(trueForward, 1.8, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 1.1, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(trueForward, 75.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, -1.2, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    } else if (mode === 'grandstand') {
      // Fixed trackside camera pointing dynamically at the passing cars
      const gs = spec.grandstandCamera;
      if (gs) {
        Cesium.Cartesian3.fromDegrees(
          gs.lon,
          gs.lat,
          gs.height,
          Cesium.Ellipsoid.WGS84,
          camPos,
        );
        Cesium.Cartesian3.clone(leaderPos, lookTarget);
      } else {
        Cesium.Cartesian3.multiplyByScalar(right, 35.0, scratchRight);
        Cesium.Cartesian3.multiplyByScalar(normal, 18.0, scratchUp);
        Cesium.Cartesian3.add(camPos, scratchRight, camPos);
        Cesium.Cartesian3.add(camPos, scratchUp, camPos);
        Cesium.Cartesian3.clone(leaderPos, lookTarget);
      }
    } else {
      // Default 'chase': Broadcast helicopter chase cam (24m up, 42m trailing)
      Cesium.Cartesian3.multiplyByScalar(trueForward, -42.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 24.0, scratchUp);
      Cesium.Cartesian3.add(camPos, scratchFwd, camPos);
      Cesium.Cartesian3.add(camPos, scratchUp, camPos);

      Cesium.Cartesian3.multiplyByScalar(trueForward, 18.0, scratchFwd);
      Cesium.Cartesian3.multiplyByScalar(normal, 1.5, scratchUp);
      Cesium.Cartesian3.add(lookTarget, scratchFwd, lookTarget);
      Cesium.Cartesian3.add(lookTarget, scratchUp, lookTarget);
    }

    if (viewer.scene?.globe?.getHeight) {
      const camCarto = Cesium.Cartographic.fromCartesian(
        camPos,
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartographic(),
      );
      const groundH = viewer.scene.globe.getHeight(camCarto);
      const minH = mode === 'cockpit' ? 1.0 : 3.0;
      if (Number.isFinite(groundH) && camCarto.height < groundH + minH) {
        camCarto.height = groundH + minH;
        Cesium.Cartesian3.fromRadians(
          camCarto.longitude,
          camCarto.latitude,
          camCarto.height,
          Cesium.Ellipsoid.WGS84,
          camPos,
        );
      }
    }

    const direction = Cesium.Cartesian3.subtract(
      lookTarget,
      camPos,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.normalize(direction, direction);

    if (typeof viewer.camera.setView === 'function') {
      viewer.camera.setView({
        destination: camPos,
        orientation: {
          direction,
          up: normal,
        },
      });
    }
  }

  function setCameraMode(mode) {
    currentCameraMode = mode;
    if (!activeEvent || !viewer?.camera) return;

    if (mode === 'overview') {
      const target =
        activeEvent.trackOverviewCamera || activeEvent.overviewCamera;
      if (target) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            target.lon,
            target.lat,
            target.height,
          ),
          orientation: {
            heading: Cesium.Math.toRadians(target.heading || 0),
            pitch: Cesium.Math.toRadians(target.pitch || -45),
            roll: 0,
          },
          duration: 1.5,
        });
      }
    } else if (mode === 'free') {
      if (viewer.trackedEntity) viewer.trackedEntity = undefined;
    } else if (mode === 'grandstand' && activeEvent.grandstandCamera) {
      const gs = activeEvent.grandstandCamera;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, gs.height),
        orientation: {
          heading: Cesium.Math.toRadians(gs.heading || 0),
          pitch: Cesium.Math.toRadians(gs.pitch || -15),
          roll: 0,
        },
        duration: 1.5,
      });
    }
  }

  function snapBack(mode = currentCameraMode) {
    setCameraMode(mode);
  }

  function startUrbanEvent(eventId, options = {}) {
    if (!viewer || isDestroyed) return null;
    stopUrbanEvent();

    if (onEventStartedCallback) {
      onEventStartedCallback(eventId);
    }

    const spec = URBAN_EVENTS[eventId] || URBAN_EVENTS.monaco_gp;
    activeEvent = { ...spec, startTime: Date.now() };
    currentCameraMode = options.cameraMode || 'chase';

    if (spec.type === 'race') {
      const trajectory = generateCircuitTrajectory(spec.waypoints, 10);
      if (trajectory.length < 5) return null;

      const cars = [];
      const teams = spec.teams || [];
      const totalDist = trajectory.totalDistance;

      // Spawn 12 race cars with staggered grid offsets
      for (let i = 0; i < spec.carCount; i++) {
        const team = teams[i % teams.length];
        const gridOffsetDist = (i * 24.0) % totalDist;
        const { pos: initialPos, forward: initialForward } =
          sampleCircuitAtDistance(trajectory, gridOffsetDist);

        const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
          initialPos,
          new Cesium.Cartesian3(),
        );
        const right = Cesium.Cartesian3.cross(
          initialForward,
          normal,
          new Cesium.Cartesian3(),
        );
        let orientationProp = undefined;
        if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
          Cesium.Cartesian3.normalize(right, right);
          const trueForward = Cesium.Cartesian3.cross(
            normal,
            right,
            new Cesium.Cartesian3(),
          );
          Cesium.Cartesian3.normalize(trueForward, trueForward);
          const rotMat = new Cesium.Matrix3(
            right.x,
            trueForward.x,
            normal.x,
            right.y,
            trueForward.y,
            normal.y,
            right.z,
            trueForward.z,
            normal.z,
          );
          const quat = Cesium.Quaternion.fromRotationMatrix(
            rotMat,
            new Cesium.Quaternion(),
          );
          orientationProp = new Cesium.ConstantProperty(quat);
        }

        // Luminous glowing wireframe racing reticle with team color
        const carEntity = viewer.entities.add({
          name: `${team.name} (#${i + 1} - ${team.driver})`,
          position: new Cesium.ConstantPositionProperty(initialPos),
          orientation: orientationProp,
          box: {
            dimensions: new Cesium.Cartesian3(4.5, 1.9, 1.1),
            fill: true,
            material: Cesium.Color.fromCssColorString(team.color).withAlpha(
              0.85,
            ),
            outline: true,
            outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
            outlineWidth: 2,
          },
        });

        eventEntities.push(carEntity);
        cars.push({
          entity: carEntity,
          progressMeters: gridOffsetDist,
          currentPos: initialPos,
          currentForward: initialForward,
          speedFraction: 1.0 + (i === 0 ? 0.05 : -0.02 * (i / spec.carCount)),
          team,
          lap: 1,
        });
      }

      // Initial camera positioning
      isTransitioning = true;
      let initialDest;
      let initialOrientation;

      if (currentCameraMode === 'overview' && spec.trackOverviewCamera) {
        const ov = spec.trackOverviewCamera;
        initialDest = Cesium.Cartesian3.fromDegrees(ov.lon, ov.lat, ov.height);
        initialOrientation = {
          heading: Cesium.Math.toRadians(ov.heading || 0),
          pitch: Cesium.Math.toRadians(ov.pitch || -45),
          roll: 0,
        };
      } else if (currentCameraMode === 'grandstand' && spec.grandstandCamera) {
        const gs = spec.grandstandCamera;
        initialDest = Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, gs.height);
        initialOrientation = {
          heading: Cesium.Math.toRadians(gs.heading || 0),
          pitch: Cesium.Math.toRadians(gs.pitch || -15),
          roll: 0,
        };
      } else {
        const firstWp = spec.waypoints[0];
        initialDest = Cesium.Cartesian3.fromDegrees(
          firstWp.lon,
          firstWp.lat,
          (firstWp.elev || 0) + 120,
        );
        initialOrientation = {
          heading: Cesium.Math.toRadians(spec.cameraOffset?.heading || 30),
          pitch: Cesium.Math.toRadians(-25),
          roll: 0,
        };
      }

      viewer.camera.flyTo({
        destination: initialDest,
        orientation: initialOrientation,
        duration: options.duration ?? 1.8,
        complete: () => {
          isTransitioning = false;
        },
        cancel: () => {
          isTransitioning = false;
        },
      });

      // Frame-by-frame race motion simulation loop
      let stepAccumulator = 0;
      let lastFrameTime = null;
      preRenderListener = viewer.scene.preRender.addEventListener(() => {
        if (!activeEvent || isDestroyed || isTransitioning) return;
        stepAccumulator++;

        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = lastFrameTime
          ? Math.min((now - lastFrameTime) / 1000, 0.05)
          : 0.016;
        lastFrameTime = now;

        const baseSpeedMps = (spec.topSpeedKmh || 260) / 3.6;

        for (const car of cars) {
          const speedMps = baseSpeedMps * car.speedFraction;
          car.progressMeters += speedMps * dt;
          if (car.progressMeters >= totalDist) {
            car.progressMeters %= totalDist;
            car.lap = Math.min(spec.totalLaps, car.lap + 1);
          }

          const { pos, forward } = sampleCircuitAtDistance(
            trajectory,
            car.progressMeters,
          );

          // Anti-subterranean ground clamp
          if (viewer.scene?.globe?.getHeight) {
            const carto = Cesium.Cartographic.fromCartesian(
              pos,
              Cesium.Ellipsoid.WGS84,
              new Cesium.Cartographic(),
            );
            const groundH = viewer.scene.globe.getHeight(carto);
            if (Number.isFinite(groundH)) {
              carto.height = groundH + 0.6;
              Cesium.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                carto.height,
                Cesium.Ellipsoid.WGS84,
                pos,
              );
            }
          }

          car.currentPos = pos;
          car.currentForward = forward;
          car.entity.position = new Cesium.ConstantPositionProperty(pos);

          // Orient car box along track tangent
          const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
            pos,
            new Cesium.Cartesian3(),
          );
          const right = Cesium.Cartesian3.cross(
            forward,
            normal,
            new Cesium.Cartesian3(),
          );
          if (Cesium.Cartesian3.magnitudeSquared(right) > 1e-6) {
            Cesium.Cartesian3.normalize(right, right);
            const trueForward = Cesium.Cartesian3.cross(
              normal,
              right,
              new Cesium.Cartesian3(),
            );
            Cesium.Cartesian3.normalize(trueForward, trueForward);
            const rotMat = new Cesium.Matrix3(
              right.x,
              trueForward.x,
              normal.x,
              right.y,
              trueForward.y,
              normal.y,
              right.z,
              trueForward.z,
              normal.z,
            );
            const quat = Cesium.Quaternion.fromRotationMatrix(
              rotMat,
              new Cesium.Quaternion(),
            );
            car.entity.orientation = new Cesium.ConstantProperty(quat);
          }
        }

        // Camera follow according to active mode
        if (options.followLeader !== false && cars.length > 0) {
          const leader = cars[0];
          applyRaceCameraFollow(leader, currentCameraMode, spec);
        }

        const leader = cars[0];
        const lapInfo = `LAP ${leader.lap}/${spec.totalLaps}`;
        const speedMph = Math.round(
          spec.topSpeedKmh *
            0.621371 *
            (0.8 + 0.2 * Math.sin(stepAccumulator * 0.05)),
        );

        activeTelemetry = {
          isActive: true,
          isSpectacle: true,
          eventId: spec.id,
          eventName: spec.name,
          currentLocation: spec.waypoints[0].name,
          lapInfo,
          speedMph,
          leaderName: leader.team.driver,
          leaderTeam: leader.team.name,
          carCount: spec.carCount,
          cameraMode: currentCameraMode,
        };
      });
    } else if (spec.type === 'festival') {
      // Reset any dirty camera transform
      if (typeof viewer.camera.lookAtTransform === 'function') {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }

      // Spawn festival pavilions & crowd clusters
      for (const kiosk of spec.kiosks || []) {
        const kioskPos = Cesium.Cartesian3.fromDegrees(
          kiosk.lon,
          kiosk.lat,
          kiosk.elev || 0,
        );
        const entity = viewer.entities.add({
          name: kiosk.name,
          position: kioskPos,
          cylinder: {
            length: 4.0,
            topRadius: 3.5,
            bottomRadius: 3.5,
            material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.7),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
          },
        });
        eventEntities.push(entity);
      }

      // Scenic oblique overview 140m south, 75m elevated, looking north at festival grounds
      const camPos = Cesium.Cartesian3.fromDegrees(
        spec.center.lon,
        spec.center.lat - 0.0014,
        (spec.center.elev || 0) + 75,
      );

      viewer.camera.flyTo({
        destination: camPos,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-26),
          roll: 0,
        },
        duration: 2.0,
      });

      activeTelemetry = {
        isActive: true,
        isSpectacle: true,
        eventId: spec.id,
        eventName: spec.name,
        currentLocation: spec.name,
        lapInfo: 'LIVE FESTIVAL',
        crowdMultiplier: spec.crowdMultiplier,
        cameraMode: currentCameraMode,
      };
    }

    return activeEvent;
  }

  return {
    startUrbanEvent,
    stopUrbanEvent,
    getActiveEvent: () => activeEvent,
    getActiveTelemetry: () => activeTelemetry,
    setCameraMode,
    getCameraMode: () => currentCameraMode,
    snapBack,
    onEventStarted: (cb) => {
      onEventStartedCallback = cb;
    },
    destroy: () => {
      isDestroyed = true;
      stopUrbanEvent();
    },
  };
}
