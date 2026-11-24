/**
 * Connect Places & Multi-Modal Corridor Explorer Compatibility Shim (Phase 2 `24.50b`).
 *
 * Legacy bottom-right charm launcher (`right: 596px`) & fixed 396px vanilla-DOM
 * flyout are retired in favor of the Sovereign Vue 3 `EarthSimRailPanel`
 * (`VehiclesMobilityModule.vue`, Corridors tab) and `ExperiencesExplorer.vue`.
 *
 * Retains 100% programmatic & Cesium-free compatibility for `window.__gevCorridorDrawer`,
 * `agentBridge` (`connect_places`), `K` hotkey, URL deeplinks (`?connectFrom=&connectTo=`),
 * live claimed domicile options (`formatDomicileDropdownEntries` / `getEstateOptions`),
 * and 1-click multi-modal simulation launches (`drive`, `h145`, `jet`, `rail`, `boat`).
 */

import { analyzePlaceRelationship } from './placeRelationshipEngine.js';
import { evaluateCorridorModes } from './corridorFeasibility.js';
import {
  DOMICILE_TYPOLOGY_META,
  getAllDomiciles,
  onDomicileRegistryChange,
} from '../layers/estates/domicileCatalog.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';

export function formatDomicileDropdownEntries(estates = []) {
  const list = Array.isArray(estates) ? estates.slice(0, 12) : [];
  const titleCounts = new Map();
  for (const est of list) {
    const baseTitle = String(
      est?.title ||
        est?.name ||
        est?.shortLabel ||
        est?.address ||
        est?.id ||
        '',
    )
      .trim()
      .toLowerCase();
    if (baseTitle) {
      titleCounts.set(baseTitle, (titleCounts.get(baseTitle) || 0) + 1);
    }
  }

  return list.map((est) => {
    const typologyKey = String(est?.typology || '').toUpperCase();
    const icon =
      est?.icon || DOMICILE_TYPOLOGY_META?.[typologyKey]?.icon || '🏡';
    const baseTitle = String(
      est?.title ||
        est?.name ||
        est?.shortLabel ||
        est?.address ||
        est?.id ||
        '',
    ).trim();
    const locHint = String(est?.city || est?.address || '').trim();
    const coordHint =
      Number.isFinite(est?.lat) && Number.isFinite(est?.lon)
        ? `${Number(est.lat).toFixed(3)}, ${Number(est.lon).toFixed(3)}`
        : '';
    const isDuplicate = (titleCounts.get(baseTitle.toLowerCase()) || 0) > 1;
    const shortLoc =
      locHint && locHint.toLowerCase() !== baseTitle.toLowerCase()
        ? locHint
        : '';
    const disambiguator = shortLoc || coordHint;
    const value =
      isDuplicate && disambiguator
        ? `${baseTitle} (${disambiguator})`
        : baseTitle;
    const label = shortLoc
      ? `${icon} ${baseTitle} · ${shortLoc}`
      : isDuplicate && coordHint
        ? `${icon} ${baseTitle} · ${coordHint}`
        : `${icon} ${baseTitle}`;
    return { value, label };
  });
}

function toEndpointPayload(endpoint) {
  if (!endpoint) return null;
  return {
    lat: endpoint.lat,
    lon: endpoint.lon,
    name: endpoint.name,
    shortLabel: endpoint.shortLabel || endpoint.name,
    elev: Number.isFinite(endpoint.elev) ? endpoint.elev : 0,
    ...(endpoint.code ? { code: endpoint.code } : {}),
  };
}

/**
 * Parse ?connectFrom=&connectTo= (and aliases ?relFrom=&relTo=) from URL query string.
 */
export function parseCorridorDeeplink(
  search = typeof window !== 'undefined' ? window.location?.search : '',
) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const from = (
    params.get('connectFrom') ||
    params.get('relFrom') ||
    ''
  ).trim();
  const to = (params.get('connectTo') || params.get('relTo') || '').trim();
  if (!from || !to) return null;
  return { from, to };
}

/**
 * Create the zero-vanilla-DOM Connect Places / Spatial Relationship controller.
 */
export function createCorridorDrawer({
  viewer = null,
  visualizer = null,
  driveEngine = null,
  flightEngine = null,
  railwayEngine = null,
  boatEngine = null,
  container = null,
  coordinator = null,
  fetchImpl = undefined,
  placeSearch = null,
  naturalRegionResolver = undefined,
  domiciles = null,
  autoRunDeeplink = true,
  onStateChange = null,
} = {}) {
  void viewer;
  const dock = coordinator || getGlobalDrawerCoordinator();
  const mountTarget =
    container || (typeof document !== 'undefined' ? document.body : null);

  let isOpen = false;
  let destroyed = false;
  let isLoading = false;
  let activeRequestId = 0;
  let activeRelationship = null;
  let activeModes = null;
  let statusMessage = '';
  let statusTone = 'muted';

  const readCurrentEstates = () =>
    Array.isArray(domiciles)
      ? domiciles
      : typeof getAllDomiciles === 'function'
        ? getAllDomiciles()
        : [];

  let estateEntries = formatDomicileDropdownEntries(readCurrentEstates());

  function getStore() {
    try {
      return useSovereignUiStore(applicationPinia());
    } catch {
      return null;
    }
  }

  function emitState() {
    const snapshot = {
      isOpen,
      isLoading,
      relationship: activeRelationship,
      modes: activeModes,
      statusMessage,
      statusTone,
      estateEntries,
    };
    onStateChange?.(snapshot);
    getStore()?.bumpTelemetry?.();
  }

  function setStatus(message, tone = 'muted') {
    statusMessage = message || '';
    statusTone = tone;
  }

  if (!mountTarget && typeof document === 'undefined') {
    return {
      openDrawer: () => {},
      closeDrawer: () => {},
      toggleDrawer: () => {},
      isOpen: () => false,
      connectPlaces: async () => null,
      clear: () => {},
      frameCorridor: () => false,
      launchMode: async () => false,
      getEstateOptions: () => [...estateEntries],
      getState: () => ({
        isOpen: false,
        isLoading: false,
        relationship: activeRelationship,
        modes: activeModes,
        statusMessage,
        statusTone,
      }),
      destroy: () => {},
    };
  }

  function openDrawer() {
    if (destroyed || isOpen) return;
    isOpen = true;
    dock.notifyDrawerOpened('corridor');
    getStore()?.openModule('vehicles-mobility', {
      expandPanel: true,
      mobilityTab: 'corridors',
    });
    emitState();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;
    dock.notifyDrawerClosed('corridor');
    emitState();
  }

  function toggleDrawer() {
    if (isOpen) closeDrawer();
    else openDrawer();
  }

  function clear() {
    activeRelationship = null;
    activeModes = null;
    setStatus('');
    visualizer?.clear?.();
    emitState();
  }

  function frameCorridor() {
    if (!activeRelationship) return false;
    if (visualizer?.renderRelationship) {
      visualizer.renderRelationship(activeRelationship, { flyCamera: true });
      return true;
    }
    return Boolean(visualizer?.frameCorridor?.(activeRelationship));
  }

  async function launchMode(modeId) {
    if (!activeRelationship) return false;
    const fromPayload = toEndpointPayload(activeRelationship.origin);
    const toPayload = toEndpointPayload(activeRelationship.destination);
    const modeInfo = activeModes?.byId?.[modeId] || null;

    if (modeInfo && !modeInfo.feasible) {
      setStatus(
        `${modeInfo.label} is unavailable for this corridor (${modeInfo.badge}).`,
        'error',
      );
      emitState();
      return false;
    }

    try {
      if (modeId === 'drive') {
        if (!driveEngine?.startRouteDrive) {
          throw new Error('Road Drive engine is not attached.');
        }
        visualizer?.clear?.();
        await driveEngine.startRouteDrive(fromPayload, toPayload, {
          useOsrm: true,
        });
        dock.notifySimulationStarted('drive', { keepIds: ['composite'] });
        setStatus(
          `Launched Road Trip (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        emitState();
        return true;
      }

      if (modeId === 'h145') {
        if (!flightEngine?.spawnFlightRoute) {
          throw new Error('Synthetic Flight engine is not attached.');
        }
        visualizer?.clear?.();
        await flightEngine.spawnFlightRoute(fromPayload, toPayload, {
          aircraftType: 'h145',
          isRotorcraft: true,
        });
        setStatus(
          `Launched Airbus H145 flight (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        emitState();
        return true;
      }

      if (modeId === 'jet') {
        if (!flightEngine?.spawnFlightRoute) {
          throw new Error('Synthetic Flight engine is not attached.');
        }
        visualizer?.clear?.();
        await flightEngine.spawnFlightRoute(fromPayload, toPayload, {});
        setStatus(
          `Launched Jet Airliner flight (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        emitState();
        return true;
      }

      if (modeId === 'rail') {
        if (!railwayEngine?.spawnRailRoute) {
          throw new Error('World of Rails engine is not attached.');
        }
        visualizer?.clear?.();
        await railwayEngine.spawnRailRoute(fromPayload, toPayload, {
          corridorId:
            modeInfo?.matchedCorridorId || modeInfo?.corridorId || undefined,
        });
        dock.notifySimulationStarted('rail', { keepIds: ['composite'] });
        setStatus(
          `Launched Rail corridor (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        emitState();
        return true;
      }

      if (modeId === 'boat') {
        if (!boatEngine?.spawnBoatRoute) {
          throw new Error('World of Sails engine is not attached.');
        }
        visualizer?.clear?.();
        await boatEngine.spawnBoatRoute(fromPayload, toPayload, {});
        dock.notifySimulationStarted('boat', { keepIds: ['composite'] });
        setStatus(
          `Launched Maritime voyage (${fromPayload.name} → ${toPayload.name}).`,
          'success',
        );
        emitState();
        return true;
      }

      throw new Error(`Unknown corridor mode: ${modeId}`);
    } catch (err) {
      setStatus(
        `Failed to launch ${modeId}: ${err?.message || String(err)}`,
        'error',
      );
      emitState();
      return false;
    }
  }

  async function connectPlaces(
    fromQuery,
    toQuery,
    {
      openDrawerOnConnect = true,
      flyCamera = true,
      probeOsrm = true,
      probeOverpass = true,
    } = {},
  ) {
    if (destroyed) return null;
    const fromText =
      typeof fromQuery === 'string'
        ? fromQuery.trim()
        : fromQuery?.name ||
          (Number.isFinite(fromQuery?.lat) && Number.isFinite(fromQuery?.lon)
            ? `${fromQuery.lat.toFixed(4)}, ${fromQuery.lon.toFixed(4)}`
            : '');
    const toText =
      typeof toQuery === 'string'
        ? toQuery.trim()
        : toQuery?.name ||
          (Number.isFinite(toQuery?.lat) && Number.isFinite(toQuery?.lon)
            ? `${toQuery.lat.toFixed(4)}, ${toQuery.lon.toFixed(4)}`
            : '');

    if (!fromText || !toText) {
      setStatus('Enter both Origin and Destination places.', 'error');
      if (openDrawerOnConnect) openDrawer();
      emitState();
      return null;
    }

    const requestId = ++activeRequestId;
    isLoading = true;
    setStatus(`Resolving "${fromText}" → "${toText}"...`, 'muted');
    if (openDrawerOnConnect) openDrawer();
    emitState();

    try {
      const resolverOpts = {
        ...(fetchImpl !== undefined ? { fetchImpl } : {}),
        ...(placeSearch ? { placeSearch } : {}),
        ...(naturalRegionResolver !== undefined
          ? { naturalRegionResolver }
          : {}),
        ...(Array.isArray(domiciles) ? { getDomiciles: () => domiciles } : {}),
      };

      const relationship = await analyzePlaceRelationship(
        fromQuery,
        toQuery,
        resolverOpts,
      );
      if (destroyed || requestId !== activeRequestId) return null;

      activeRelationship = relationship;
      activeModes = null;
      visualizer?.renderRelationship?.(relationship, { flyCamera });

      setStatus(
        'Evaluating road, rotorcraft, airliner, rail & marine feasibility...',
        'muted',
      );
      emitState();

      const modes = await evaluateCorridorModes(
        relationship.origin,
        relationship.destination,
        relationship,
        {
          ...resolverOpts,
          probeOsrm,
          probeOverpass,
        },
      );
      if (destroyed || requestId !== activeRequestId) return null;

      activeModes = modes;
      isLoading = false;
      setStatus('');
      visualizer?.updateRoadPreview?.(modes.byId?.drive);
      emitState();

      return { relationship, modes };
    } catch (err) {
      if (destroyed || requestId !== activeRequestId) return null;
      isLoading = false;
      setStatus(err?.message || 'Unable to connect places.', 'error');
      emitState();
      return null;
    }
  }

  function handleGlobalKeydown(e) {
    if (destroyed) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault?.();
      toggleDrawer();
      return;
    }
    if (e.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  }

  function syncEstateEntries() {
    if (destroyed) return;
    estateEntries = formatDomicileDropdownEntries(readCurrentEstates());
    emitState();
  }

  const unsubscribeDomiciles =
    !Array.isArray(domiciles) && typeof onDomicileRegistryChange === 'function'
      ? onDomicileRegistryChange(syncEstateEntries)
      : null;

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  dock.registerDrawer('corridor', {
    open: openDrawer,
    close: closeDrawer,
    isOpen: () => isOpen,
    launcherEl: null,
    accentColor: '#22d3ee',
  });

  if (autoRunDeeplink) {
    const deeplink = parseCorridorDeeplink();
    if (deeplink) {
      void connectPlaces(deeplink.from, deeplink.to, {
        openDrawerOnConnect: true,
        flyCamera: true,
      });
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    activeRequestId++;
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('keydown', handleGlobalKeydown);
    }
    if (typeof unsubscribeDomiciles === 'function') {
      unsubscribeDomiciles();
    }
    dock.unregisterDrawer('corridor');
  }

  return {
    openDrawer,
    closeDrawer,
    toggleDrawer,
    isOpen: () => isOpen,
    connectPlaces,
    clear,
    frameCorridor,
    launchMode,
    getEstateOptions: () => [...estateEntries],
    getState: () => ({
      isOpen,
      isLoading,
      relationship: activeRelationship,
      modes: activeModes,
      statusMessage,
      statusTone,
    }),
    destroy,
  };
}
