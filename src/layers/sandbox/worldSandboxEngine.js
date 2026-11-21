/**
 * World Architect & World Sandbox - Scene Placement Engine
 * Modular Structures, Scenic Overlooks & Contemplative Sanctuaries
 */

import { getStructureById } from './structureCatalog.js';

const STORAGE_KEY_DEFAULT = 'gev_world_sandbox_structures';

/**
 * Creates the World Architect Sandbox Engine.
 * Manages placed structures, Cesium visual entities, sanctuary designations, and local storage.
 *
 * @param {object} options
 * @param {object} [options.viewer] Cesium viewer instance
 * @param {string} [options.storageKey] localStorage key
 * @param {Function} [options.onStateChange] callback fired when structures are modified
 * @returns {object} WorldSandboxEngine API
 */
export function createWorldSandboxEngine(options = {}) {
  const {
    viewer = null,
    storageKey = STORAGE_KEY_DEFAULT,
    onStateChange = null,
  } = options;

  let structures = loadPersistedStructures(storageKey);
  let activePlacement = null; // { catalogId, previewPosition: { lon, lat, height }, heading: 0 }
  let entityMap = new Map(); // structureId -> Cesium Entity
  let previewEntity = null;
  let companionOverlookId = null;

  // Initialize Cesium visual primitives if viewer is available
  syncEntitiesToViewer();

  function notifyChange() {
    persistStructures(storageKey, structures);
    syncEntitiesToViewer();
    if (typeof onStateChange === 'function') {
      try {
        onStateChange(getSnapshot());
      } catch (err) {
        console.error(
          '[WorldSandboxEngine] Error in onStateChange callback:',
          err,
        );
      }
    }
  }

  function getSnapshot() {
    return {
      count: structures.length,
      structures: [...structures],
      sanctuaries: structures.filter((s) => s.isSanctuary),
      companionOverlookId,
      isPlacing: Boolean(activePlacement),
      placementCatalogId: activePlacement ? activePlacement.catalogId : null,
    };
  }

  function syncEntitiesToViewer() {
    if (!viewer || !viewer.entities) return;

    // Remove obsolete entities
    for (const [id, entity] of entityMap.entries()) {
      if (!structures.some((s) => s.id === id)) {
        try {
          viewer.entities.remove(entity);
        } catch (_) {}
        entityMap.delete(id);
      }
    }

    // Add or update entities for each placed structure
    for (const item of structures) {
      if (!entityMap.has(item.id)) {
        try {
          const entity = createCesiumEntity(item);
          if (entity) {
            entityMap.set(item.id, entity);
          }
        } catch (e) {
          console.warn(
            '[WorldSandboxEngine] Failed to create Cesium entity for',
            item.id,
            e,
          );
        }
      }
    }
  }

  function createCesiumEntity(item) {
    if (!viewer || !viewer.entities || typeof Cesium === 'undefined')
      return null;

    const catalogItem = getStructureById(item.catalogId);
    const lon = item.position.longitude;
    const lat = item.position.latitude;
    const height = item.position.height || 0;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, height);

    const footprint = catalogItem
      ? catalogItem.footprint
      : { width: 10, length: 10, height: 5 };
    const boxDimensions = new Cesium.Cartesian3(
      footprint.width,
      footprint.length,
      footprint.height,
    );

    const color = item.isSanctuary
      ? Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.85) // amber sanctuary glow
      : Cesium.Color.fromCssColorString('#10b981').withAlpha(0.85); // emerald structure

    const entity = viewer.entities.add({
      id: `sandbox_${item.id}`,
      name: item.customName || (catalogItem ? catalogItem.name : 'Structure'),
      position,
      box: {
        dimensions: boxDimensions,
        material: color,
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
      },
      name: item.customName || (catalogItem ? catalogItem.name : 'Structure'),
    });

    return entity;
  }

  return {
    /**
     * Get all currently placed structures.
     * @returns {Array<object>}
     */
    getPlacedStructures() {
      return [...structures];
    },

    /**
     * Get structure by instance ID.
     * @param {string} id
     * @returns {object|null}
     */
    getStructure(id) {
      return structures.find((s) => s.id === id) || null;
    },

    /**
     * Place a new structure in the sandbox.
     * @param {object} params
     * @param {string} params.catalogId
     * @param {object} params.position { longitude, latitude, height, heading, pitch, roll }
     * @param {string} [params.customName]
     * @param {string} [params.notes]
     * @param {boolean} [params.isSanctuary=false]
     * @returns {object} Placed structure record
     */
    addStructure(params) {
      if (!params || !params.catalogId || !params.position) {
        throw new Error(
          '[WorldSandboxEngine] catalogId and position are required',
        );
      }

      const catalogItem = getStructureById(params.catalogId);
      const newId = `struct_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      const record = {
        id: newId,
        catalogId: params.catalogId,
        name: catalogItem ? catalogItem.name : 'Modular Structure',
        customName:
          params.customName ||
          (catalogItem ? catalogItem.name : 'Custom Structure'),
        category: catalogItem ? catalogItem.category : 'SHELTER',
        position: {
          longitude: Number(params.position.longitude),
          latitude: Number(params.position.latitude),
          height: Number(params.position.height || 0),
          heading: Number(params.position.heading || 0),
          pitch: Number(params.position.pitch || 0),
          roll: Number(params.position.roll || 0),
        },
        scale: Number(params.scale || 1.0),
        isSanctuary: Boolean(params.isSanctuary),
        notes: params.notes || '',
        createdAt: new Date().toISOString(),
      };

      structures.push(record);
      if (record.isSanctuary && !companionOverlookId) {
        companionOverlookId = record.id;
      }

      notifyChange();
      return record;
    },

    /**
     * Remove a placed structure.
     * @param {string} id
     * @returns {boolean}
     */
    removeStructure(id) {
      const idx = structures.findIndex((s) => s.id === id);
      if (idx === -1) return false;

      structures.splice(idx, 1);
      if (companionOverlookId === id) {
        const remainingSanctuary = structures.find((s) => s.isSanctuary);
        companionOverlookId = remainingSanctuary ? remainingSanctuary.id : null;
      }

      notifyChange();
      return true;
    },

    /**
     * Update an existing structure.
     * @param {string} id
     * @param {object} updates
     * @returns {object|null}
     */
    updateStructure(id, updates) {
      const target = structures.find((s) => s.id === id);
      if (!target) return null;

      if (updates.customName !== undefined)
        target.customName = updates.customName;
      if (updates.notes !== undefined) target.notes = updates.notes;
      if (updates.isSanctuary !== undefined)
        target.isSanctuary = Boolean(updates.isSanctuary);
      if (updates.scale !== undefined) target.scale = Number(updates.scale);
      if (updates.position) {
        target.position = {
          ...target.position,
          ...updates.position,
        };
      }

      notifyChange();
      return target;
    },

    /**
     * Toggle sanctuary designation for a structure.
     * @param {string} id
     * @param {boolean} [explicitState]
     * @returns {boolean} New sanctuary state
     */
    toggleSanctuary(id, explicitState) {
      const target = structures.find((s) => s.id === id);
      if (!target) return false;

      target.isSanctuary =
        explicitState !== undefined
          ? Boolean(explicitState)
          : !target.isSanctuary;
      if (target.isSanctuary && !companionOverlookId) {
        companionOverlookId = target.id;
      } else if (!target.isSanctuary && companionOverlookId === target.id) {
        const remainingSanctuary = structures.find((s) => s.isSanctuary);
        companionOverlookId = remainingSanctuary ? remainingSanctuary.id : null;
      }

      notifyChange();
      return target.isSanctuary;
    },

    /**
     * Set a structure as the primary companion overlook sanctuary.
     * @param {string} id
     * @returns {boolean}
     */
    setCompanionOverlook(id) {
      const target = structures.find((s) => s.id === id);
      if (!target) return false;

      target.isSanctuary = true;
      companionOverlookId = id;
      notifyChange();
      return true;
    },

    /**
     * Get the active companion overlook ID.
     * @returns {string|null}
     */
    getCompanionOverlookId() {
      return companionOverlookId;
    },

    /**
     * Get all designated sanctuaries.
     * @returns {Array<object>}
     */
    getSanctuaries() {
      return structures.filter((s) => s.isSanctuary);
    },

    /**
     * Fly camera to a placed structure.
     * @param {string} id
     */
    flyToStructure(id) {
      const target = structures.find((s) => s.id === id);
      if (!target || !viewer || typeof Cesium === 'undefined') return false;

      const pos = target.position;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          pos.longitude,
          pos.latitude,
          (pos.height || 0) + 120, // 120m overhead scenic pitch
        ),
        orientation: {
          heading: Cesium.Math.toRadians(pos.heading || 0),
          pitch: Cesium.Math.toRadians(-30.0),
          roll: 0.0,
        },
        duration: 2.2,
      });
      return true;
    },

    /**
     * Begin interactive placement mode for a catalog structure.
     * @param {string} catalogId
     */
    startPlacement(catalogId) {
      const catalogItem = getStructureById(catalogId);
      if (!catalogItem) {
        throw new Error(`[WorldSandboxEngine] Unknown catalogId: ${catalogId}`);
      }

      activePlacement = {
        catalogId,
        previewPosition: { longitude: 0, latitude: 0, height: 0 },
        heading: 0,
      };

      notifyChange();
      return activePlacement;
    },

    /**
     * Update placement cursor location.
     * @param {object} coords { longitude, latitude, height }
     */
    updatePlacementCursor(coords) {
      if (!activePlacement) return;
      activePlacement.previewPosition = {
        longitude: Number(coords.longitude),
        latitude: Number(coords.latitude),
        height: Number(coords.height || 0),
      };
      if (coords.heading !== undefined) {
        activePlacement.heading = Number(coords.heading);
      }
    },

    /**
     * Commit the active placement into a permanent placed structure.
     * @param {object} [customOverrides]
     * @returns {object|null}
     */
    commitPlacement(customOverrides = {}) {
      if (!activePlacement) return null;

      const placed = this.addStructure({
        catalogId: activePlacement.catalogId,
        position: {
          ...activePlacement.previewPosition,
          heading: activePlacement.heading,
        },
        ...customOverrides,
      });

      activePlacement = null;
      notifyChange();
      return placed;
    },

    /**
     * Cancel active placement mode.
     */
    cancelPlacement() {
      activePlacement = null;
      notifyChange();
    },

    /**
     * Export all sandbox structures to JSON string.
     * @returns {string}
     */
    exportSandboxLayout() {
      return JSON.stringify(
        {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          companionOverlookId,
          structures,
        },
        null,
        2,
      );
    },

    /**
     * Import sandbox structures from JSON string.
     * @param {string} jsonString
     * @param {boolean} [replace=false]
     * @returns {number} count of imported items
     */
    importSandboxLayout(jsonString, replace = false) {
      try {
        const parsed = JSON.parse(jsonString);
        const incoming = Array.isArray(parsed) ? parsed : parsed.structures;
        if (!Array.isArray(incoming)) {
          throw new Error(
            'Invalid sandbox layout format: expected array of structures',
          );
        }

        if (replace) {
          structures = [];
        }

        for (const item of incoming) {
          if (item.catalogId && item.position) {
            this.addStructure(item);
          }
        }

        if (parsed.companionOverlookId) {
          companionOverlookId = parsed.companionOverlookId;
        }

        notifyChange();
        return incoming.length;
      } catch (err) {
        console.error(
          '[WorldSandboxEngine] Failed to import sandbox layout:',
          err,
        );
        throw err;
      }
    },

    /**
     * Get current state snapshot.
     */
    getSnapshot,

    /**
     * Teardown engine and clean up viewer entities.
     */
    destroy() {
      if (viewer && viewer.entities) {
        for (const entity of entityMap.values()) {
          try {
            viewer.entities.remove(entity);
          } catch (_) {}
        }
        if (previewEntity) {
          try {
            viewer.entities.remove(previewEntity);
          } catch (_) {}
        }
      }
      entityMap.clear();
      activePlacement = null;
    },
  };
}

function loadPersistedStructures(key) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn(
      '[WorldSandboxEngine] Could not load persisted structures from localStorage:',
      e,
    );
    return [];
  }
}

function persistStructures(key, structures) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(structures));
  } catch (e) {
    console.warn(
      '[WorldSandboxEngine] Could not persist structures to localStorage:',
      e,
    );
  }
}
