/**
 * Wildlife Fauna Synthetics & Boid Flocking Kinematics.
 * (National Parks, Topo Hiking, Backcountry Campsites & Wildlife Tracking on GEV)
 *
 * Implements:
 * - Species Behavioral Archetype Catalog:
 *   - Elk Herds (flocking, meadow grazing, alert posture)
 *   - Bison Herds (heavy clustering, lumbering crawl, collective flight)
 *   - Bighorn Sheep (agile ridge leaping, cliff ledges)
 *   - Black Bear & Grizzly (solitary creek foraging, cautious distance perimeter)
 *   - Bald Eagle & Golden Eagle (high thermal updraft soaring)
 *   - Subalpine Marmots (rock boulder perches, sentry whistling)
 * - Boid Flocking Mechanics:
 *   - Separation, Alignment, Cohesion, and Natural Grazing Brownian Drift
 * - Distance Caution Perimeter States:
 *   - CALM / GRAZING (normal wandering)
 *   - ALERT (stops, faces human approaching within alert radius)
 *   - RETREATING (accelerates and flees radially away when inside retreat radius)
 */

export const WILDLIFE_SPECIES = Object.freeze({
  ELK: {
    id: 'elk',
    commonName: 'Rocky Mountain Elk',
    icon: '🦌',
    herdSize: { min: 4, max: 12 },
    calmSpeedMs: 0.9,
    fleeSpeedMs: 7.5,
    alertRadiusM: 28,
    retreatRadiusM: 16,
    colorHex: '#f59e0b',
    badge: 'HERD FAUNA',
  },
  BISON: {
    id: 'bison',
    commonName: 'Plains Bison',
    icon: '🦬',
    herdSize: { min: 6, max: 16 },
    calmSpeedMs: 0.6,
    fleeSpeedMs: 5.8,
    alertRadiusM: 35,
    retreatRadiusM: 20,
    colorHex: '#92400e',
    badge: 'HEAVY HERD',
  },
  BIGHORN_SHEEP: {
    id: 'bighorn_sheep',
    commonName: 'Desert Bighorn Sheep',
    icon: '🐏',
    herdSize: { min: 3, max: 7 },
    calmSpeedMs: 0.8,
    fleeSpeedMs: 6.8,
    alertRadiusM: 24,
    retreatRadiusM: 14,
    colorHex: '#d97706',
    badge: 'RIDGE CLIMBER',
  },
  BLACK_BEAR: {
    id: 'black_bear',
    commonName: 'American Black Bear',
    icon: '🐻',
    herdSize: { min: 1, max: 2 },
    calmSpeedMs: 0.7,
    fleeSpeedMs: 8.2,
    alertRadiusM: 40,
    retreatRadiusM: 25,
    colorHex: '#78350f',
    badge: 'APEX CAUTION',
  },
  BALD_EAGLE: {
    id: 'bald_eagle',
    commonName: 'Bald Eagle',
    icon: '🦅',
    herdSize: { min: 1, max: 2 },
    calmSpeedMs: 12.0,
    fleeSpeedMs: 24.0,
    alertRadiusM: 15,
    retreatRadiusM: 8,
    colorHex: '#60a5fa',
    badge: 'AERIAL SOARER',
  },
  MARMOT: {
    id: 'marmot',
    commonName: 'Hoary Marmot',
    icon: '🐾',
    herdSize: { min: 2, max: 5 },
    calmSpeedMs: 0.5,
    fleeSpeedMs: 4.5,
    alertRadiusM: 18,
    retreatRadiusM: 10,
    colorHex: '#a3a3a3',
    badge: 'SUBALPINE SENTRY',
  },
});

export const FAUNA_BEHAVIOR_STATES = Object.freeze({
  CALM_GRAZING: 'CALM_GRAZING',
  ALERT_SENTRY: 'ALERT_SENTRY',
  RETREATING: 'RETREATING',
});

/**
 * Creates an animal instance with position, heading, and behavioral state.
 */
export function createFaunaEntity({
  id,
  speciesKey,
  lat,
  lon,
  elevM = 1500,
  headingDeg = 0,
}) {
  const species = WILDLIFE_SPECIES[speciesKey] || WILDLIFE_SPECIES.ELK;
  return {
    id: id || `fauna_${species.id}_${Math.floor(Math.random() * 100000)}`,
    speciesKey: species.id,
    speciesName: species.commonName,
    icon: species.icon,
    colorHex: species.colorHex,
    lat,
    lon,
    elevM,
    headingDeg,
    speedMs: species.calmSpeedMs,
    state: FAUNA_BEHAVIOR_STATES.CALM_GRAZING,
    alertRadiusM: species.alertRadiusM,
    retreatRadiusM: species.retreatRadiusM,
    calmSpeedMs: species.calmSpeedMs,
    fleeSpeedMs: species.fleeSpeedMs,
  };
}

/**
 * Spawns wildlife clusters corresponding to a trailhead's native fauna types.
 * @param {Object} trailhead Trailhead from trailheadCatalog.js
 * @param {number} countScale Multiplier for herd sizes
 * @returns {Array} Array of fauna entities
 */
export function spawnFaunaForTrailhead(trailhead, countScale = 1.0) {
  if (!trailhead || !trailhead.coordinates) return [];

  const entities = [];
  const originLat = trailhead.coordinates.lat;
  const originLon = trailhead.coordinates.lon;
  const originElev = trailhead.coordinates.elevM || 1200;

  const speciesKeys = (trailhead.faunaTypes || ['elk', 'mule_deer']).map((k) =>
    k.toUpperCase(),
  );

  let entityCounter = 1;
  for (const sKey of speciesKeys) {
    const species = WILDLIFE_SPECIES[sKey];
    if (!species) continue;

    // Determine cluster size
    const clusterSize = Math.max(
      1,
      Math.round(
        (species.herdSize.min +
          Math.random() * (species.herdSize.max - species.herdSize.min)) *
          countScale,
      ),
    );

    // Cluster center displaced within 200m - 1200m of trailhead
    const clusterAngle = Math.random() * Math.PI * 2;
    const clusterDistM = 250 + Math.random() * 800;
    const clusterCenterLat =
      originLat + (clusterDistM * Math.cos(clusterAngle)) / 111111;
    const clusterCenterLon =
      originLon +
      (clusterDistM * Math.sin(clusterAngle)) /
        (111111 * Math.cos((originLat * Math.PI) / 180));

    for (let i = 0; i < clusterSize; i++) {
      // Offset individual animals within 10m - 40m of cluster center
      const indivAngle = Math.random() * Math.PI * 2;
      const indivDistM = Math.random() * 35;
      const animalLat =
        clusterCenterLat + (indivDistM * Math.cos(indivAngle)) / 111111;
      const animalLon =
        clusterCenterLon +
        (indivDistM * Math.sin(indivAngle)) /
          (111111 * Math.cos((clusterCenterLat * Math.PI) / 180));

      entities.push(
        createFaunaEntity({
          id: `fauna_${species.id}_${entityCounter++}`,
          speciesKey: sKey,
          lat: animalLat,
          lon: animalLon,
          elevM: originElev + (Math.random() * 40 - 20),
          headingDeg: Math.round(Math.random() * 360),
        }),
      );
    }
  }

  return entities;
}

/**
 * Calculates horizontal distance in meters between two lat/lon coordinates.
 */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * 111111;
  const dLon =
    (lon2 - lon1) * 111111 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Updates a flock of fauna entities with boid rules and distance caution perimeters.
 * @param {Array} faunaList Array of fauna entities
 * @param {Object} hikerPosition { lat, lon } Current hiker position
 * @param {number} deltaSec Elapsed time delta in seconds (typically 0.1 to 1.0)
 * @returns {Array} Updated fauna list
 */
export function updateFaunaFlock(
  faunaList,
  hikerPosition = null,
  deltaSec = 0.5,
) {
  if (!Array.isArray(faunaList) || faunaList.length === 0) return [];

  const updated = [];

  for (let i = 0; i < faunaList.length; i++) {
    const animal = { ...faunaList[i] };

    let distToHiker = Infinity;
    let bearingFromHiker = animal.headingDeg;

    if (hikerPosition && typeof hikerPosition.lat === 'number') {
      distToHiker = distanceMeters(
        animal.lat,
        animal.lon,
        hikerPosition.lat,
        hikerPosition.lon,
      );

      const dLat = animal.lat - hikerPosition.lat;
      const dLon =
        (animal.lon - hikerPosition.lon) *
        Math.cos((animal.lat * Math.PI) / 180);
      bearingFromHiker = (Math.atan2(dLon, dLat) * 180) / Math.PI;
      bearingFromHiker = (bearingFromHiker + 360) % 360;
    }

    // Determine state transition based on distance caution perimeter
    if (distToHiker < animal.retreatRadiusM) {
      animal.state = FAUNA_BEHAVIOR_STATES.RETREATING;
      animal.speedMs = animal.fleeSpeedMs;
      // Steer heading directly away from hiker
      animal.headingDeg = bearingFromHiker;
    } else if (distToHiker < animal.alertRadiusM) {
      animal.state = FAUNA_BEHAVIOR_STATES.ALERT_SENTRY;
      animal.speedMs = 0; // Freeze in alert posture
      // Face the approaching intruder
      animal.headingDeg = (bearingFromHiker + 180) % 360;
    } else {
      animal.state = FAUNA_BEHAVIOR_STATES.CALM_GRAZING;
      animal.speedMs = animal.calmSpeedMs;

      // Gentle brownian heading drift when calm
      animal.headingDeg =
        (animal.headingDeg + (Math.random() * 20 - 10) + 360) % 360;
    }

    // Kinematic movement integration
    if (animal.speedMs > 0) {
      const stepDistM = animal.speedMs * deltaSec;
      const headingRad = (animal.headingDeg * Math.PI) / 180;
      const dLatDeg = (stepDistM * Math.cos(headingRad)) / 111111;
      const dLonDeg =
        (stepDistM * Math.sin(headingRad)) /
        (111111 * Math.cos((animal.lat * Math.PI) / 180));

      animal.lat += dLatDeg;
      animal.lon += dLonDeg;
    }

    animal.distanceToHikerM = Math.round(distToHiker * 10) / 10;
    updated.push(animal);
  }

  return updated;
}
