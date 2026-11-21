import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRailAdjacencyGraph,
  findShortestRailPath,
  stitchOverpassWaypointsTopological,
  calculateBearingDeg,
  calculateTurnDifferenceDeg,
  NORTHEAST_CORRIDOR_FULL_ALIGNMENT,
} from './railGraphPathfinder.js';

describe('Topological Rail Graph Pathfinder & Vector Track Geometry', () => {
  it('builds an undirected adjacency graph from Overpass nodes and ways', () => {
    const mockElements = [
      { type: 'node', id: 1, lat: 33.75, lon: -84.39, elev: 300 },
      { type: 'node', id: 2, lat: 33.751, lon: -84.385, elev: 302 },
      { type: 'node', id: 3, lat: 33.752, lon: -84.38, elev: 305 },
      { type: 'way', id: 101, nodes: [1, 2, 3] },
    ];

    const { nodes, adjacency } = buildRailAdjacencyGraph(mockElements);
    assert.equal(nodes.size, 3);
    assert.ok(adjacency.get(1).has(2));
    assert.ok(adjacency.get(2).has(1));
    assert.ok(adjacency.get(2).has(3));
    assert.ok(adjacency.get(3).has(2));
    assert.equal(adjacency.get(1).has(3), false); // must follow topological chain
  });

  it('snaps shared switch endpoints from separate ways within tolerance', () => {
    // Way 1 ends at (33.751000, -84.385000), Way 2 begins at (33.751010, -84.385010) (~1.3m away)
    const mockElements = [
      { type: 'node', id: 1, lat: 33.75, lon: -84.39 },
      { type: 'node', id: 2, lat: 33.751, lon: -84.385 },
      { type: 'way', id: 101, nodes: [1, 2] },
      { type: 'node', id: 3, lat: 33.75101, lon: -84.38501 },
      { type: 'node', id: 4, lat: 33.752, lon: -84.38 },
      { type: 'way', id: 102, nodes: [3, 4] },
    ];

    const { adjacency } = buildRailAdjacencyGraph(mockElements, { snapDistanceMeters: 3.0 });
    assert.ok(adjacency.get(2).has(3));
    assert.ok(adjacency.get(3).has(2));
  });

  it('calculates track bearings and angular turn differences', () => {
    const bNorth = calculateBearingDeg(33.75, -84.39, 33.76, -84.39);
    assert.ok(Math.abs(bNorth - 0) < 1.0 || Math.abs(bNorth - 360) < 1.0);

    const bEast = calculateBearingDeg(33.75, -84.39, 33.75, -84.38);
    assert.ok(Math.abs(bEast - 90) < 1.0);

    const diff = calculateTurnDifferenceDeg(10, 190);
    assert.equal(diff, 180);

    const smallDiff = calculateTurnDifferenceDeg(350, 10);
    assert.equal(smallDiff, 20);
  });

  it('finds connected shortest path without radial Euclidean skipping across parallel tracks', () => {
    // Create track A (mainline) and track B (parallel siding), starting at S and ending at T
    const mockElements = [
      // Mainline
      { type: 'node', id: 1, lat: 33.75, lon: -84.39 },
      { type: 'node', id: 2, lat: 33.75, lon: -84.385 },
      { type: 'node', id: 3, lat: 33.75, lon: -84.38 },
      { type: 'way', id: 101, nodes: [1, 2, 3] },
      // Parallel siding 100m north (should not be jumped to via radial distance)
      { type: 'node', id: 4, lat: 33.751, lon: -84.388 },
      { type: 'node', id: 5, lat: 33.751, lon: -84.382 },
      { type: 'way', id: 102, nodes: [4, 5] },
    ];

    const fromWp = { lat: 33.75, lon: -84.39, elev: 300 };
    const toWp = { lat: 33.75, lon: -84.38, elev: 300 };

    const path = findShortestRailPath(mockElements, fromWp, toWp);
    assert.ok(Array.isArray(path));
    assert.ok(path.length >= 3);

    // Verify all intermediate nodes stay on the mainline (lat 33.75) and do not zig-zag to siding (lat 33.751)
    for (const pt of path) {
      assert.ok(Math.abs(pt.lat - 33.75) < 0.0005, `Point lat ${pt.lat} diverted to parallel track`);
    }
  });

  it('stitchOverpassWaypointsTopological produces a contiguous track alignment', () => {
    const mockElements = [
      { type: 'node', id: 1, lat: 33.754, lon: -84.3915 },
      { type: 'node', id: 2, lat: 33.758, lon: -84.3878 },
      { type: 'node', id: 3, lat: 33.781, lon: -84.3865 },
      { type: 'way', id: 201, nodes: [1, 2, 3] },
    ];

    const fromWp = { lat: 33.754, lon: -84.3915, elev: 318 };
    const toWp = { lat: 33.781, lon: -84.3865, elev: 308 };

    const stitched = stitchOverpassWaypointsTopological(mockElements, fromWp, toWp);
    assert.ok(Array.isArray(stitched));
    assert.ok(stitched.length >= 3);
    assert.equal(stitched[0].lat, fromWp.lat);
    assert.equal(stitched[stitched.length - 1].lat, toWp.lat);
  });

  it('validates canonical Northeast Corridor full alignment spanning Boston to Baltimore and Washington DC', () => {
    assert.ok(Array.isArray(NORTHEAST_CORRIDOR_FULL_ALIGNMENT));
    assert.ok(NORTHEAST_CORRIDOR_FULL_ALIGNMENT.length >= 30);

    const first = NORTHEAST_CORRIDOR_FULL_ALIGNMENT[0];
    const last = NORTHEAST_CORRIDOR_FULL_ALIGNMENT[NORTHEAST_CORRIDOR_FULL_ALIGNMENT.length - 1];

    assert.equal(first.name, 'Boston South Station');
    assert.equal(last.name, 'Washington Union Station (DC)');

    // Verify presence of intermediate key milestones
    const names = NORTHEAST_CORRIDOR_FULL_ALIGNMENT.map((s) => s.name);
    assert.ok(names.some((n) => n.includes('Providence')));
    assert.ok(names.some((n) => n.includes('New Haven')));
    assert.ok(names.some((n) => n.includes('New York Penn')));
    assert.ok(names.some((n) => n.includes('Trenton')));
    assert.ok(names.some((n) => n.includes('Philadelphia 30th St')));
    assert.ok(names.some((n) => n.includes('Wilmington')));
    assert.ok(names.some((n) => n.includes('Baltimore Penn')));
  });
});
