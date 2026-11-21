/**
 * Contextual Multi-Entity Synthetics & Mobility Spool for Living World Simulator.
 * (Universal Living Locales Capability + Route Slice)
 *
 * Spawns and manages specialized human, machinery, and fauna entities
 * tailored to the active settlement typology:
 *   - Coastal: Shrimpers, shrimp trawlers with outriggers, water taxis, golf carts, pelicans
 *   - Tribal Reservation: Rural citizens, work pickups, school buses, elder transit vans, horses/cattle
 *   - Farmland: Combines with dust ribbons, tractors down furrows, grain hopper trucks, cattle boids
 *   - Theme Park: Guest families, ride ops, 3D coaster trainsets, carousels, parking trams
 *
 * Strictly adheres to the Outlined Contact Reticle Invariant:
 * Every entity renders high-contrast outlined contact reticles with
 * disableDepthTestDistance: Number.POSITIVE_INFINITY and dynamic terrain clamping (+0.35m),
 * eliminating subsurface terrain occlusion and "ghost camera" empty air views.
 */

import * as Cesium from 'cesium';
import { sampleActiveGroundHeight } from './surfaceHeight.js';
import { SETTLEMENT_TYPOLOGIES } from './localeClassifier.js';
import { generateLocalePersona } from './localeThoughtMatrix.js';
import {
  generateMultiTopologyTrajectory,
  calculateCoasterKinematics,
  generatePastureWander,
  generateDollyTrackSpline,
  generateCraneSwingArc,
  generateFerrisWheelRing,
} from './multiTopologyPathing.js';

export const ENTITY_TYPES = Object.freeze({
  HUMAN: 'human',
  VEHICLE: 'vehicle',
  MACHINERY: 'machinery',
  KINETIC_RIDE: 'kinetic_ride',
  FAUNA: 'fauna',
});

export const FILMING_PROTOCOL_STATES = Object.freeze({
  REHEARSAL: 'REHEARSAL',
  ROLLING: 'ROLLING',
  CUT: 'CUT',
  COMPANY_MOVE: 'COMPANY_MOVE',
});

export const FILMING_STATE_BADGES = Object.freeze({
  [FILMING_PROTOCOL_STATES.REHEARSAL]: '📣 BLOCKING & LIGHTING · REHEARSAL',
  [FILMING_PROTOCOL_STATES.ROLLING]:
    '🎬 QUIET ON SET · CAMERA ROLLING · ACTION!',
  [FILMING_PROTOCOL_STATES.CUT]: '🔄 CUT! · BACK TO ONE · RESET MARKS',
  [FILMING_PROTOCOL_STATES.COMPANY_MOVE]: '🚚 COMPANY MOVE · NEXT STAGE SETUP',
});

const FILMING_STATE_ORDER = [
  FILMING_PROTOCOL_STATES.REHEARSAL,
  FILMING_PROTOCOL_STATES.ROLLING,
  FILMING_PROTOCOL_STATES.CUT,
  FILMING_PROTOCOL_STATES.COMPANY_MOVE,
];

/**
 * Creates the Contextual Multi-Entity Spool Engine.
 */
export function createContextualEntitySpool({ viewer = null } = {}) {
  let activeEntities = [];
  let latchedEntity = null;
  let latchedIndex = 0;
  let activeLocale = null;
  let activeTypology = SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL;
  let filmingStateIndex = 1; // Default to ROLLING for immediate live set energy
  let filmingTimerSec = 0;
  let isDestroyed = false;

  function getFilmingState() {
    return (
      FILMING_STATE_ORDER[filmingStateIndex] || FILMING_PROTOCOL_STATES.ROLLING
    );
  }

  function getFilmingStatusBadge() {
    const state = getFilmingState();
    return FILMING_STATE_BADGES[state] || FILMING_STATE_BADGES.ROLLING;
  }

  function advanceFilmingState() {
    filmingStateIndex = (filmingStateIndex + 1) % FILMING_STATE_ORDER.length;
    filmingTimerSec = 0;
    return getFilmingState();
  }

  /**
   * Samples terrain elevation at a cartographic position across Google 3D and terrain globe regimes.
   */
  function sampleTerrainHeight(carto) {
    if (!viewer) return carto?.height || 0;
    return sampleActiveGroundHeight(viewer, carto);
  }

  /**
   * Spawns specialized machinery or vehicles tailored to the active typology.
   */
  function spawnContextualMachines(locale, corridor) {
    const typology =
      locale.typology || SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL;
    const machines = [];

    if (typology === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER) {
      // 1. Shrimp Trawler idling along water docks
      const trawlerTraj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 8,
      });
      if (trawlerTraj.length > 0) {
        machines.push({
          id: `trawler_${machines.length}`,
          type: ENTITY_TYPES.VEHICLE,
          subType: 'shrimp_trawler',
          name: 'Shrimp Trawler "Miss Altamaha"',
          dimensions: { length: 16.0, width: 5.5, height: 6.0 },
          color: Cesium.Color.fromCssColorString('#1e3a8a').withAlpha(0.85),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 1.8, // ~3.5 knots
          trajectory: trawlerTraj,
          progress: 0.1,
          persona: {
            name: 'Captain Lamar McIntosh',
            occupation: 'Commercial Shrimper',
            thought: 'Outrigger boom cables greased and running smooth.',
            vibeColor: '#38bdf8',
            speedKmh: '6.5',
          },
        });
      }

      // 2. Island Electric Golf Cart
      if (corridor.type === 'rural_shoulder') {
        const cartTraj = generateMultiTopologyTrajectory(corridor, {
          sampleIntervalMeters: 4,
        });
        machines.push({
          id: `golf_cart_${machines.length}`,
          type: ENTITY_TYPES.VEHICLE,
          subType: 'golf_cart',
          name: 'Tidewater Golf Cart Shuttle',
          dimensions: { length: 2.5, width: 1.3, height: 1.8 },
          color: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.85),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 4.5, // ~10 mph
          trajectory: cartTraj,
          progress: 0.5,
          persona: {
            name: 'Sadie Lowther',
            occupation: 'Fish House Packer',
            thought: 'Heading up to Broad Street with fresh catch receipts.',
            vibeColor: '#22d3ee',
            speedKmh: '16.2',
          },
        });
      }
    } else if (typology === SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION) {
      // 1. Heavy-Duty Work Pickup with trailer
      const truckTraj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 6,
      });
      if (truckTraj.length > 0) {
        machines.push({
          id: `pickup_${machines.length}`,
          type: ENTITY_TYPES.VEHICLE,
          subType: 'work_pickup',
          name: 'Heavy-Duty 4x4 Ranch Pickup',
          dimensions: { length: 6.2, width: 2.2, height: 2.0 },
          color: Cesium.Color.fromCssColorString('#b45309').withAlpha(0.85),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 11.2, // ~25 mph
          trajectory: truckTraj,
          progress: 0.2,
          persona: {
            name: 'Micah Fife',
            occupation: 'Ranch Hand',
            thought: 'Hauling round bales out to the south section.',
            vibeColor: '#eab308',
            speedKmh: '40.3',
          },
        });
      }

      // 2. Tribal Elder Demand-Response Transit Shuttle
      machines.push({
        id: `tribal_van_${machines.length}`,
        type: ENTITY_TYPES.VEHICLE,
        subType: 'tribal_transit_van',
        name: 'Cherokee/Muscogee Elder Transit Van',
        dimensions: { length: 7.2, width: 2.4, height: 2.8 },
        color: Cesium.Color.fromCssColorString('#0284c7').withAlpha(0.85),
        reticleColor: Cesium.Color.WHITE,
        speedMs: 8.9, // ~20 mph
        trajectory: truckTraj,
        progress: 0.7,
        persona: {
          name: 'Thomas Checote',
          occupation: 'Transit Driver',
          thought: 'Next pickup on section line 240 for the Tahlequah clinic.',
          vibeColor: '#38bdf8',
          speedKmh: '32.0',
        },
      });
    } else if (typology === SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL) {
      // 1. Combine Harvester crawling across swaths
      const combineTraj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 5,
      });
      if (combineTraj.length > 0) {
        machines.push({
          id: `combine_${machines.length}`,
          type: ENTITY_TYPES.MACHINERY,
          subType: 'combine_harvester',
          name: 'Case IH Axial-Flow Combine',
          dimensions: { length: 9.5, width: 5.2, height: 4.4 },
          color: Cesium.Color.fromCssColorString('#b91c1c').withAlpha(0.85), // Red combine
          reticleColor: Cesium.Color.WHITE,
          speedMs: 2.2, // ~5 mph
          trajectory: combineTraj,
          progress: 0.05,
          persona: {
            name: 'Calvin Miller',
            occupation: 'Combine Operator',
            thought:
              'Corn moisture sensor reading 17.5%—yield is looking outstanding.',
            vibeColor: '#f59e0b',
            speedKmh: '7.9',
          },
        });
      }

      // 2. John Deere Tractor down furrow swaths
      machines.push({
        id: `tractor_${machines.length}`,
        type: ENTITY_TYPES.MACHINERY,
        subType: 'agricultural_tractor',
        name: 'John Deere 8R Heavy Tractor',
        dimensions: { length: 6.8, width: 3.4, height: 3.5 },
        color: Cesium.Color.fromCssColorString('#15803d').withAlpha(0.85), // John Deere Green
        reticleColor: Cesium.Color.WHITE,
        speedMs: 2.8, // ~6 mph
        trajectory: combineTraj,
        progress: 0.6,
        persona: {
          name: 'Dwight Hagedorn',
          occupation: 'Grain Farmer',
          thought:
            'Finishing the last headland turn on the north 80-acre parcel.',
          vibeColor: '#84cc16',
          speedKmh: '10.1',
        },
      });
    } else if (typology === SETTLEMENT_TYPOLOGIES.AMUSEMENT_THEME_PARK) {
      // 1. 3D Kinetic Roller Coaster Trainset
      if (corridor.type === 'coaster_spline') {
        const coasterTraj = calculateCoasterKinematics(corridor.waypoints, 2.5);
        machines.push({
          id: `coaster_train_${machines.length}`,
          type: ENTITY_TYPES.KINETIC_RIDE,
          subType: 'roller_coaster',
          name: 'Giga Coaster 4-Car Trainset',
          dimensions: { length: 14.0, width: 2.0, height: 1.6 },
          color: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.9), // Bright thrill orange
          reticleColor: Cesium.Color.WHITE,
          speedMs: 14.0,
          trajectory: coasterTraj,
          progress: 0.25,
          persona: {
            name: 'Chloe Jenkins',
            occupation: 'Lead Coaster Ride Operator',
            thought:
              'Dispatched on green light! Maximum speed 92 mph on the first plunge drop.',
            vibeColor: '#a855f7',
            speedKmh: '50.4',
          },
        });
      } else {
        // 2. Giant Observation Ferris Wheel Gondola Ring
        const wp0 = corridor.waypoints?.[0] || {
          lat: locale.lat,
          lon: locale.lon,
          elev: locale.elev || 30,
        };
        const wheelTraj = generateFerrisWheelRing(
          wp0.lat,
          wp0.lon,
          22.0,
          wp0.elev || locale.elev || 30,
        );
        machines.push({
          id: `ferris_wheel_${machines.length}`,
          type: ENTITY_TYPES.KINETIC_RIDE,
          subType: 'ferris_wheel',
          name: 'Giant Observation Ferris Wheel Gondola',
          dimensions: { length: 3.2, width: 3.2, height: 3.5 },
          color: Cesium.Color.fromCssColorString('#ec4899').withAlpha(0.9),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 2.2,
          trajectory: wheelTraj,
          progress: 0.4,
          persona: {
            name: 'Arthur Pendelton',
            occupation: 'Observation Wheel Master',
            thought:
              'Apex gondola reaching 150 feet—panoramic view across the entire resort castle hub.',
            vibeColor: '#ec4899',
            speedKmh: '7.9',
          },
        });

        // 3. Multi-Car Resort Parking Lot Tram
        const tramTraj = generateMultiTopologyTrajectory(corridor, {
          sampleIntervalMeters: 5,
        });
        if (tramTraj.length > 0) {
          machines.push({
            id: `parking_tram_${machines.length}`,
            type: ENTITY_TYPES.VEHICLE,
            subType: 'parking_tram',
            name: 'Multi-Car Resort Parking Lot Tram',
            dimensions: { length: 18.0, width: 2.4, height: 2.6 },
            color: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.88),
            reticleColor: Cesium.Color.WHITE,
            speedMs: 5.2,
            trajectory: tramTraj,
            progress: 0.65,
            persona: {
              name: 'Marcus Vance',
              occupation: 'Resort Tram Announcer',
              thought:
                'Clear on the right! Please keep arms and legs inside the tram—next stop Main Entrance Plaza.',
              vibeColor: '#3b82f6',
              speedKmh: '18.7',
            },
          });
        }
      }
    } else if (typology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
      const wp0 = corridor.waypoints?.[0] || {
        lat: locale.lat,
        lon: locale.lon,
        elev: locale.elev || 85,
      };
      if (corridor.type === 'dolly_track_spline') {
        // 1. Chapman / Technocrane Camera Dolly on precision steel tracks
        const dollyTraj =
          corridor.waypoints?.length >= 2
            ? generateMultiTopologyTrajectory(corridor, {
                sampleIntervalMeters: 2,
                speedMs: 1.4,
              })
            : generateDollyTrackSpline(
                wp0.lat,
                wp0.lon,
                28.0,
                locale.headingDeg || 90,
                wp0.elev || locale.elev || 85,
              );
        machines.push({
          id: `camera_dolly_${machines.length}`,
          type: ENTITY_TYPES.MACHINERY,
          subType: 'camera_dolly_crane',
          name: 'Chapman/Technocrane 50ft Camera Dolly',
          dimensions: { length: 4.5, width: 1.8, height: 3.2 },
          color: Cesium.Color.fromCssColorString('#eab308').withAlpha(0.92),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 1.4,
          trajectory: dollyTraj,
          progress: 0.15,
          persona: {
            name: 'Elena Vance, SOC',
            occupation: 'A-Camera / Technocrane Operator',
            thought:
              'Sound speed! Pushing in on the 50mm anamorphic prime—holding focus on lead talent mark.',
            vibeColor: '#eab308',
            speedKmh: '5.0',
          },
        });

        // 2. Elevated 18K HMI Soundstage Lighting Truss / Crane Boom
        const craneArc = generateCraneSwingArc(
          wp0.lat,
          wp0.lon,
          12.0,
          (wp0.elev || locale.elev || 85) + 4.0,
          (wp0.elev || locale.elev || 85) + 12.0,
        );
        machines.push({
          id: `lighting_truss_${machines.length}`,
          type: ENTITY_TYPES.MACHINERY,
          subType: 'soundstage_lighting_truss',
          name: '18K HMI Soundstage Lighting Truss',
          dimensions: { length: 6.0, width: 2.2, height: 4.8 },
          color: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.9),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 0.8,
          trajectory: craneArc,
          progress: 0.5,
          persona: {
            name: 'Dante Morales',
            occupation: 'Chief Lighting Technician (Gaffer)',
            thought:
              'Flying the 12x12 bleached muslin bounce and 18K Arrimax key light for golden-hour backlight.',
            vibeColor: '#38bdf8',
            speedKmh: '2.9',
          },
        });
      } else {
        // 3. Studio Production Runabout Golf Cart along backlot lane
        const laneTraj = generateMultiTopologyTrajectory(corridor, {
          sampleIntervalMeters: 4,
        });
        if (laneTraj.length > 0) {
          machines.push({
            id: `prod_cart_${machines.length}`,
            type: ENTITY_TYPES.VEHICLE,
            subType: 'production_golf_cart',
            name: 'Studio Production Runabout Cart',
            dimensions: { length: 2.8, width: 1.4, height: 1.85 },
            color: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.88),
            reticleColor: Cesium.Color.WHITE,
            speedMs: 4.8,
            trajectory: laneTraj,
            progress: 0.2,
            persona: {
              name: 'Jordan Sterling',
              occupation: 'First Assistant Director (1st AD)',
              thought:
                'Shutting down backlot Stage 14 alley—red warning bell flashing, picture is up!',
              vibeColor: '#f59e0b',
              speedKmh: '17.3',
            },
          });

          // 4. 40ft Grip & Electric Production Truck
          machines.push({
            id: `grip_truck_${machines.length}`,
            type: ENTITY_TYPES.VEHICLE,
            subType: 'grip_lighting_truck',
            name: '40ft Grip & Electric Production Truck',
            dimensions: { length: 12.2, width: 2.6, height: 3.8 },
            color: Cesium.Color.fromCssColorString('#64748b').withAlpha(0.9),
            reticleColor: Cesium.Color.WHITE,
            speedMs: 3.5,
            trajectory: laneTraj,
            progress: 0.75,
            persona: {
              name: 'Ray Kovacs',
              occupation: 'Key Grip',
              thought:
                'Unloading C-stands, apple boxes, and Matthews doorway dolly track outside Stage 5.',
              vibeColor: '#94a3b8',
              speedKmh: '12.6',
            },
          });
        }
      }
    } else if (typology === SETTLEMENT_TYPOLOGIES.SHOPPING_MALL_PROMENADE) {
      // 1. Mall Electric Security & Facilities Patrol Cart
      const cartTraj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 4,
        speedMs: 3.2,
      });
      if (cartTraj.length > 0) {
        machines.push({
          id: `mall_patrol_${machines.length}`,
          type: ENTITY_TYPES.VEHICLE,
          subType: 'mall_security_cart',
          name: 'Concourse Security Electric Patrol Cart',
          dimensions: { length: 2.6, width: 1.3, height: 1.8 },
          color: Cesium.Color.fromCssColorString('#ec4899').withAlpha(0.88),
          reticleColor: Cesium.Color.WHITE,
          speedMs: 3.2,
          trajectory: cartTraj,
          progress: 0.15,
          persona: {
            name: 'Officer Randy Vance',
            occupation: 'Promenade Security Specialist',
            thought:
              'Quiet Saturday morning. Checking the concourse exits and keeping pedestrian flow smooth near the central fountain.',
            vibeColor: '#ec4899',
            speedKmh: '11.5',
          },
        });
      }
    }

    return machines;
  }

  /**
   * Spawns fauna entities (cattle boids, pelicans, horses).
   */
  function spawnContextualFauna(locale, corridor) {
    const typology = locale.typology;
    const fauna = [];

    if (typology === SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER) {
      // Brown Pelican flock skimming the water
      const pelicanWps = (corridor.waypoints || []).map((wp) => ({
        ...wp,
        elev: (wp.elev || 0) + 14.0, // 14m AGL
        speedMs: 8.5, // ~19 mph flight
      }));
      fauna.push({
        id: `fauna_pelican_${fauna.length}`,
        type: ENTITY_TYPES.FAUNA,
        subType: 'brown_pelican',
        name: 'Brown Pelican (V-Formation Lead)',
        dimensions: { length: 1.4, width: 2.0, height: 0.6 },
        color: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.9),
        reticleColor: Cesium.Color.WHITE,
        speedMs: 8.5,
        trajectory: pelicanWps,
        progress: 0.3,
        persona: {
          name: 'Brown Pelican',
          occupation: 'Coastal Avian Fauna',
          thought:
            'Gliding along the estuary thermal looking for schooling menhaden.',
          vibeColor: '#94a3b8',
          speedKmh: '30.6',
        },
      });
    } else if (
      typology === SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL ||
      typology === SETTLEMENT_TYPOLOGIES.TRIBAL_RESERVATION
    ) {
      // Cattle Boid Herd in pasture
      const pastureWps = generatePastureWander(corridor.waypoints, 6, 777);
      fauna.push({
        id: `fauna_cattle_${fauna.length}`,
        type: ENTITY_TYPES.FAUNA,
        subType: 'black_angus_cattle',
        name: 'Black Angus Cow (Pasture Herd)',
        dimensions: { length: 2.2, width: 0.9, height: 1.4 },
        color: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.95), // Jet black
        reticleColor: Cesium.Color.WHITE,
        speedMs: 0.45,
        trajectory: pastureWps,
        progress: 0.1,
        persona: {
          name: 'Black Angus Cow #402',
          occupation: 'Pasture Herd Livestock',
          thought:
            'Chewing cud peacefully under the shade of the tall oak trees.',
          vibeColor: '#64748b',
          speedKmh: '1.6',
        },
      });
    }
    return fauna;
  }

  /**
   * Spawns the full contextual entity spool for a locale.
   */
  function spawnEntitiesForLocale(locale, density = 'lively') {
    clearEntities();
    activeLocale = locale;
    activeTypology =
      locale.typology || SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL;

    const corridors = locale.corridors || [];
    if (corridors.length === 0) return [];

    const entities = [];
    const countPerCorridor =
      density === 'calm' ? 6 : density === 'rush' ? 24 : 14;

    corridors.forEach((corridor, cIdx) => {
      // 1. Spawns contextual humans along the corridor
      const traj = generateMultiTopologyTrajectory(corridor, {
        sampleIntervalMeters: 4,
      });
      if (traj.length > 1) {
        for (let i = 0; i < countPerCorridor; i++) {
          const progress = (i / countPerCorridor + cIdx * 0.2) % 1.0;
          const persona = generateLocalePersona({
            lat: locale.lat,
            lon: locale.lon,
            typology: activeTypology,
            entityIndex: cIdx * 100 + i,
            speedMs: 0.38 + (i % 3) * 0.12,
          });

          entities.push({
            id: `human_${cIdx}_${i}`,
            type: ENTITY_TYPES.HUMAN,
            subType: 'citizen',
            name: persona.name,
            dimensions: { length: 0.6, width: 0.6, height: 1.8 },
            color: Cesium.Color.fromCssColorString(persona.vibeColor).withAlpha(
              0.85,
            ),
            reticleColor: Cesium.Color.WHITE,
            speedMs: persona.speedMs,
            trajectory: traj,
            progress,
            persona,
          });
        }
      }

      // 2. Spawns specialized machines & vehicles
      const machines = spawnContextualMachines(locale, corridor);
      entities.push(...machines);

      // 3. Spawns contextual fauna
      const fauna = spawnContextualFauna(locale, corridor);
      entities.push(...fauna);
    });

    // Wire Cesium scene entities with Contact Reticle Invariant
    if (viewer?.entities) {
      for (const ent of entities) {
        const startPt = ent.trajectory[0] || {
          lon: locale.lon,
          lat: locale.lat,
          elev: locale.elev,
        };
        const carto = Cesium.Cartographic.fromDegrees(
          startPt.lon,
          startPt.lat,
          startPt.elev,
        );
        const groundH = sampleTerrainHeight(carto);
        const position = Cesium.Cartesian3.fromDegrees(
          startPt.lon,
          startPt.lat,
          groundH + 0.35,
        );

        // Explicit Outlined Contact Reticle Point Entity
        const cesiumEntity = viewer.entities.add({
          name: ent.name,
          position,
          point: {
            pixelSize: ent.type === ENTITY_TYPES.HUMAN ? 10 : 16,
            color: ent.color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY, // Never occluded under terrain
          },
          properties: {
            spoolId: ent.id,
            spoolType: ent.type,
            spoolSubType: ent.subType,
            persona: ent.persona,
          },
        });
        ent.cesiumEntity = cesiumEntity;
      }
    }

    activeEntities = entities;
    latchedIndex = 0;
    latchedEntity = entities[0] || null;
    return activeEntities;
  }

  /**
   * Updates positions and kinematics along trajectories frame-by-frame.
   */
  function update(deltaTimeSec = 0.016) {
    if (isDestroyed || activeEntities.length === 0) return;

    if (activeTypology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
      filmingTimerSec += deltaTimeSec;
      if (filmingTimerSec >= 12.0) {
        advanceFilmingState();
      }
    }

    const curFilmingState = getFilmingState();

    for (const ent of activeEntities) {
      if (!ent.trajectory || ent.trajectory.length < 2) continue;

      // Apply filming protocol cadence modulation on studio movie lots
      let stateSpeedFactor = 1.0;
      if (activeTypology === SETTLEMENT_TYPOLOGIES.STUDIO_MOVIE_LOT) {
        if (curFilmingState === FILMING_PROTOCOL_STATES.REHEARSAL) {
          stateSpeedFactor = 0.55;
        } else if (curFilmingState === FILMING_PROTOCOL_STATES.CUT) {
          stateSpeedFactor = ent.subType === 'camera_dolly_crane' ? 1.35 : 0.25;
        }
      }

      // Kinematic progression along loop
      const totalDist = ent.trajectory.length;
      const speedNorm = (ent.speedMs * stateSpeedFactor * deltaTimeSec) / 4.0; // 4m sample spacing
      ent.progress = (ent.progress + speedNorm / totalDist) % 1.0;

      const floatIdx = ent.progress * (ent.trajectory.length - 1);
      const idx1 = Math.floor(floatIdx);
      const idx2 = Math.min(ent.trajectory.length - 1, idx1 + 1);
      const frac = floatIdx - idx1;

      const p1 = ent.trajectory[idx1];
      const p2 = ent.trajectory[idx2];
      const curLat = p1.lat + (p2.lat - p1.lat) * frac;
      const curLon = p1.lon + (p2.lon - p1.lon) * frac;
      const baseElev =
        (p1.elev || 0) + ((p2.elev || 0) - (p1.elev || 0)) * frac;

      if (ent.cesiumEntity) {
        const carto = Cesium.Cartographic.fromDegrees(curLon, curLat, baseElev);
        const groundH = sampleTerrainHeight(carto);
        const finalElev =
          ent.type === ENTITY_TYPES.FAUNA && ent.subType === 'brown_pelican'
            ? groundH + 16.0
            : ent.type === ENTITY_TYPES.KINETIC_RIDE ||
                ent.subType === 'soundstage_lighting_truss'
              ? baseElev
              : groundH + 0.35;

        const curPos = Cesium.Cartesian3.fromDegrees(curLon, curLat, finalElev);
        ent.currentPos = curPos;
        ent.cesiumEntity.position = curPos;

        // Calculate forward tangent for continuous camera follow
        const nextCarto = ent.trajectory[idx2] || ent.trajectory[idx1];
        if (nextCarto) {
          const nextPos = Cesium.Cartesian3.fromDegrees(
            nextCarto.lon,
            nextCarto.lat,
            finalElev,
          );
          const fwd = Cesium.Cartesian3.subtract(
            nextPos,
            curPos,
            new Cesium.Cartesian3(),
          );
          if (Cesium.Cartesian3.magnitudeSquared(fwd) > 1e-4) {
            Cesium.Cartesian3.normalize(fwd, fwd);
            ent.currentForward = fwd;
          }
        }
      }
    }
  }

  function clearEntities() {
    if (viewer?.entities) {
      for (const ent of activeEntities) {
        if (ent.cesiumEntity) {
          viewer.entities.remove(ent.cesiumEntity);
        }
      }
    }
    activeEntities = [];
    latchedEntity = null;
  }

  function cycleEntity(direction = 1) {
    if (activeEntities.length === 0) return null;
    latchedIndex =
      (latchedIndex + direction + activeEntities.length) %
      activeEntities.length;
    latchedEntity = activeEntities[latchedIndex];
    return latchedEntity;
  }

  function latchOntoEntity(ent) {
    if (!ent) return null;
    if (latchedEntity && latchedEntity.cesiumEntity?.point) {
      latchedEntity.cesiumEntity.point.pixelSize =
        latchedEntity.type === ENTITY_TYPES.HUMAN ? 10 : 16;
      latchedEntity.cesiumEntity.point.outlineWidth = 2.5;
    }
    latchedEntity = ent;
    latchedIndex = activeEntities.indexOf(ent);
    if (latchedIndex < 0) latchedIndex = 0;
    if (ent.cesiumEntity?.point) {
      ent.cesiumEntity.point.pixelSize =
        ent.type === ENTITY_TYPES.HUMAN ? 14 : 20;
      ent.cesiumEntity.point.outlineWidth = 3.5;
    }
    return latchedEntity;
  }

  return {
    spawnEntitiesForLocale,
    update,
    clearEntities,
    cycleEntity,
    latchOntoEntity,
    getActiveEntities: () => activeEntities,
    getEntityCount: () => activeEntities.length,
    getLatchedEntity: () => latchedEntity,
    getActiveTypology: () => activeTypology,
    getActiveLocale: () => activeLocale,
    getFilmingState,
    getFilmingStatusBadge,
    advanceFilmingState,
    getEntitiesByType: (type) => activeEntities.filter((e) => e.type === type),
    destroy: () => {
      isDestroyed = true;
      clearEntities();
    },
  };
}
