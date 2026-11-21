/**
 * Topological Rail Graph Pathfinder & Vector Track Geometry Engine for World of Rails & GEV.
 * (Foundational Transit & Road/Rail Geometry Realism)
 *
 * Solves the "triangulation across land" bug where radial Haversine sorting jumped across
 * parallel tracks, yards, and curves.
 *
 * Implements:
 * - Topological graph construction from OSM Overpass railway ways and nodes
 * - Automatic track switch endpoint snapping (tolerance: 3.0m)
 * - Direction-constrained A* shortest-path graph search (avoiding hairpin switch jumps)
 * - Contiguous trackway stitching without lateral Euclidean skipping
 * - Curated high-resolution topological easements for the Northeast Corridor (Boston to Baltimore/DC)
 *   and major world rapid transit systems
 */

import {
  calculateHaversineDistance,
  NORTHEAST_CORRIDOR_FULL_ALIGNMENT,
} from '../../transit/railWaypoints.js';

export { NORTHEAST_CORRIDOR_FULL_ALIGNMENT };

export const SWITCH_SNAP_TOLERANCE_METERS = 3.0;
export const MAX_TRACK_TURN_ANGLE_DEG = 85.0;

/**
 * Builds an undirected topological adjacency graph from Overpass OSM elements.
 */
export function buildRailAdjacencyGraph(elements, options = {}) {
  const snapDistM = options.snapDistanceMeters ?? SWITCH_SNAP_TOLERANCE_METERS;
  const nodes = new Map();
  const adjacency = new Map(); // nodeId -> Set of neighbor nodeIds

  if (!Array.isArray(elements) || elements.length === 0) {
    return { nodes, adjacency };
  }

  // 1. Ingest nodes
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodes.set(el.id, {
        id: el.id,
        lat: Number(el.lat),
        lon: Number(el.lon),
        elev: Number(el.elev ?? 100),
      });
      adjacency.set(el.id, new Set());
    }
  }

  // 2. Ingest ways and stitch contiguous way.nodes
  const wayNodesList = [];
  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      const wayNodes = el.nodes.filter((id) => nodes.has(id));
      if (wayNodes.length >= 2) {
        wayNodesList.push(wayNodes);
        for (let i = 0; i < wayNodes.length - 1; i++) {
          const u = wayNodes[i];
          const v = wayNodes[i + 1];
          adjacency.get(u)?.add(v);
          adjacency.get(v)?.add(u);
        }
      }
    }
  }

  // 3. Snap switch endpoints from different ways that share physical junctions
  if (snapDistM > 0) {
    const endpoints = [];
    for (const wayNodes of wayNodesList) {
      endpoints.push(wayNodes[0]);
      endpoints.push(wayNodes[wayNodes.length - 1]);
    }

    for (let i = 0; i < endpoints.length; i++) {
      const uId = endpoints[i];
      const u = nodes.get(uId);
      if (!u) continue;
      for (let j = i + 1; j < endpoints.length; j++) {
        const vId = endpoints[j];
        if (uId === vId) continue;
        const v = nodes.get(vId);
        if (!v) continue;

        const d = calculateHaversineDistance(u.lat, u.lon, v.lat, v.lon);
        if (d <= snapDistM) {
          adjacency.get(uId)?.add(vId);
          adjacency.get(vId)?.add(uId);
        }
      }
    }
  }

  return { nodes, adjacency };
}

/**
 * Calculates bearing angle in degrees [0, 360) between two lat/lon points.
 */
export function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Calculates smallest angular turn difference between two bearings in degrees [0, 180].
 */
export function calculateTurnDifferenceDeg(b1, b2) {
  let diff = Math.abs(b1 - b2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Finds the topologically connected shortest rail path through OSM elements from fromCoords to toCoords.
 */
export function findShortestRailPath(
  elements,
  fromCoords,
  toCoords,
  options = {},
) {
  if (!fromCoords || !toCoords) return null;
  const { nodes, adjacency } = buildRailAdjacencyGraph(elements, options);
  if (nodes.size < 2) return null;

  // Locate closest graph node to fromCoords
  let startNodeId = null;
  let minStartDist = Number.POSITIVE_INFINITY;
  // Locate closest graph node to toCoords
  let targetNodeId = null;
  let minTargetDist = Number.POSITIVE_INFINITY;

  for (const [id, node] of nodes) {
    const dStart = calculateHaversineDistance(
      fromCoords.lat,
      fromCoords.lon,
      node.lat,
      node.lon,
    );
    if (dStart < minStartDist) {
      minStartDist = dStart;
      startNodeId = id;
    }
    const dTarget = calculateHaversineDistance(
      toCoords.lat,
      toCoords.lon,
      node.lat,
      node.lon,
    );
    if (dTarget < minTargetDist) {
      minTargetDist = dTarget;
      targetNodeId = id;
    }
  }

  if (startNodeId == null || targetNodeId == null) return null;
  if (startNodeId === targetNodeId) {
    const n = nodes.get(startNodeId);
    return [
      {
        lat: fromCoords.lat,
        lon: fromCoords.lon,
        elev: fromCoords.elev || 100,
      },
      { lat: n.lat, lon: n.lon, elev: n.elev || 100 },
      { lat: toCoords.lat, lon: toCoords.lon, elev: toCoords.elev || 100 },
    ];
  }

  const targetNode = nodes.get(targetNodeId);

  // A* Graph Search
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const openSet = new Set([startNodeId]);

  gScore.set(startNodeId, 0);
  fScore.set(
    startNodeId,
    calculateHaversineDistance(
      nodes.get(startNodeId).lat,
      nodes.get(startNodeId).lon,
      targetNode.lat,
      targetNode.lon,
    ),
  );

  let iterations = 0;
  const maxIterations = options.maxIterations || 10000;

  while (openSet.size > 0 && iterations++ < maxIterations) {
    // Pick node with lowest fScore
    let current = null;
    let lowestF = Number.POSITIVE_INFINITY;
    for (const nodeId of openSet) {
      const f = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (f < lowestF) {
        lowestF = f;
        current = nodeId;
      }
    }

    if (current === targetNodeId) {
      // Path found! Reconstruct
      const pathNodeIds = [current];
      let curr = current;
      while (cameFrom.has(curr)) {
        curr = cameFrom.get(curr);
        pathNodeIds.unshift(curr);
      }

      const result = [fromCoords];
      for (const id of pathNodeIds) {
        const n = nodes.get(id);
        const last = result[result.length - 1];
        if (
          calculateHaversineDistance(last.lat, last.lon, n.lat, n.lon) >= 8.0
        ) {
          result.push({
            lat: n.lat,
            lon: n.lon,
            elev: n.elev || fromCoords.elev || 100,
          });
        }
      }
      result.push(toCoords);
      return result;
    }

    openSet.delete(current);
    const currNode = nodes.get(current);
    const currG = gScore.get(current) || 0;
    const neighbors = adjacency.get(current) || new Set();

    // Determine current track heading if predecessor exists
    let currBearing = null;
    if (cameFrom.has(current)) {
      const prevNode = nodes.get(cameFrom.get(current));
      if (prevNode) {
        currBearing = calculateBearingDeg(
          prevNode.lat,
          prevNode.lon,
          currNode.lat,
          currNode.lon,
        );
      }
    }

    for (const neighborId of neighbors) {
      const neighborNode = nodes.get(neighborId);
      if (!neighborNode) continue;

      const edgeDist = calculateHaversineDistance(
        currNode.lat,
        currNode.lon,
        neighborNode.lat,
        neighborNode.lon,
      );

      // Turn penalty to avoid sharp hairpin reversals on switch tracks
      let turnPenalty = 0;
      if (currBearing != null) {
        const nextBearing = calculateBearingDeg(
          currNode.lat,
          currNode.lon,
          neighborNode.lat,
          neighborNode.lon,
        );
        const turnDiff = calculateTurnDifferenceDeg(currBearing, nextBearing);
        if (turnDiff > MAX_TRACK_TURN_ANGLE_DEG) {
          turnPenalty = turnDiff * 10; // Penalize severe switch reversals
        }
      }

      const tentativeG = currG + edgeDist + turnPenalty;
      if (tentativeG < (gScore.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        const h = calculateHaversineDistance(
          neighborNode.lat,
          neighborNode.lon,
          targetNode.lat,
          targetNode.lon,
        );
        fScore.set(neighborId, tentativeG + h);
        openSet.add(neighborId);
      }
    }
  }

  // If disjoint graph, return contiguous nodes connected closest to vector
  return null;
}

/**
 * Topologically stitches Overpass OSM elements without radial skipping across land.
 * Replaces the buggy radial Haversine distA - distB sort in railwayEngine.js.
 */
export function stitchOverpassWaypointsTopological(elements, fromWp, toWp) {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  // Try topological A* pathfinder
  const topologicalPath = findShortestRailPath(elements, fromWp, toWp);
  if (topologicalPath && topologicalPath.length >= 2) {
    return topologicalPath;
  }

  // Fallback for fragmented extracts: extract contiguous way segments
  const nodeMap = new Map();
  const ways = [];
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodeMap.set(el.id, {
        lat: el.lat,
        lon: el.lon,
        elev: fromWp.elev || 100,
      });
    } else if (el.type === 'way' && Array.isArray(el.nodes)) {
      ways.push(el);
    }
  }

  if (ways.length === 0) return null;

  // Chain adjacent ways together by matching endpoints
  const chains = [];
  for (const way of ways) {
    const pts = way.nodes.map((id) => nodeMap.get(id)).filter(Boolean);
    if (pts.length >= 2) chains.push(pts);
  }

  if (chains.length === 0) return null;

  // Find chain closest to fromWp
  chains.sort((c1, c2) => {
    const d1 = calculateHaversineDistance(
      fromWp.lat,
      fromWp.lon,
      c1[0].lat,
      c1[0].lon,
    );
    const d2 = calculateHaversineDistance(
      fromWp.lat,
      fromWp.lon,
      c2[0].lat,
      c2[0].lon,
    );
    return d1 - d2;
  });

  const result = [fromWp];
  for (const pt of chains[0]) {
    const last = result[result.length - 1];
    if (calculateHaversineDistance(last.lat, last.lon, pt.lat, pt.lon) > 12) {
      result.push(pt);
    }
  }
  result.push(toWp);
  return result;
}
