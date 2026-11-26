<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { msg, t } from '../../../i18n/index.js';
import UiButton from '../../kit/UiButton.vue';
import UiCheckbox from '../../kit/UiCheckbox.vue';
import UiIcon from '../../kit/UiIcon.vue';
import UiSegmented from '../../kit/UiSegmented.vue';
import UiSelect from '../../kit/UiSelect.js';
import UiSlider from '../../kit/UiSlider.js';
import { useSovereignUiStore } from '../../stores/sovereignUi.js';
import { AIRPORT_WAYPOINTS } from '../../../flight/airportCatalog.js';
import { RAIL_CORRIDORS } from '../../../transit/railWaypoints.js';
import { DRIVE_CORRIDORS } from '../../../drive/driveWaypoints.js';
import {
  VESSEL_CLASSES,
  WATER_PRESETS,
} from '../../../vessels/waterWaypoints.js';
import {
  DOMICILE_TYPOLOGY_META,
  getAllDomiciles,
  onDomicileRegistryChange,
} from '../../../layers/estates/domicileCatalog.js';
import { isolatePointerEvent } from '../cameraControlBridge.js';
import SearchablePlacePicker from '../components/SearchablePlacePicker.vue';

const FREIGHT_CAM_OPTIONS = Object.freeze([
  { id: 'IN_CAB', label: msg('In-Cab') },
  { id: 'SEMI_CHASE', label: msg('Chase') },
  { id: 'APRON_TRANSLOAD', label: msg('Apron') },
  { id: 'HELI_PATROL', label: msg('Heli') },
  { id: 'MACRO_ORBITAL', label: msg('Orbital') },
]);

const FREIGHT_STATE_LABELS = Object.freeze({
  INBOUND_APPROACH: 'Inbound Approach',
  APRON_ARRIVAL: 'Apron Arrival',
  ULD_GANTRY_OFFLOAD: 'ULD Crane Offload',
  FREIGHT_SORT_BAY: 'Sortation Bay',
  TRAILER_COUPLING: '53ft Trailer Coupling',
  GATE_CLEARANCE: 'Gate Clearance',
  HIGHWAY_DISPATCH: 'Highway Dispatch',
  HIGHWAY_CRUISE: 'Interstate Cruising',
});

/**
 * Unified Vehicles & Corridors Sovereign Vue Module.
 *
 * Replaces all 7 legacy bottom-right vehicle & corridor drawers:
 * - Flight (`flightDrawer.js`)
 * - Rail (`railDrawer.js`)
 * - Drive (`driveDrawer.js`)
 * - Sail (`boatDrawer.js`)
 * - Metro / Bus / Motorman (`transitControllerDrawer.js`)
 * - Freight & Intermodal (`freightLogisticsDrawer.js`)
 * - Connect Places & Corridors (`corridorDrawer.js`)
 */
const store = useSovereignUiStore();
const { activeMobilityTab, telemetryRevision, corridorPrefillOrigin } =
  storeToRefs(store);

const rt = computed(() => store.runtime || {});

const mobilityTabOptions = computed(() => [
  { value: 'flight', label: t('Flight') },
  { value: 'rail', label: t('Rail') },
  { value: 'drive', label: t('Drive') },
  { value: 'sail', label: t('Sail') },
  { value: 'metro', label: t('Metro') },
  { value: 'freight', label: t('Freight') },
  { value: 'corridors', label: t('Corridors') },
]);

const activeTab = computed({
  get: () => activeMobilityTab.value || 'flight',
  set: (val) => store.setActiveMobilityTab(val),
});

// ── Shared Live Telemetry Poll (lightweight, only refreshes reactive tick) ──
const liveTick = ref(0);
const domicilesTick = ref(0);
let pollTimer = null;
let unsubDomiciles = null;

function isAnyVehicleActive() {
  const r = rt.value;
  return Boolean(
    r.flightEngine?.getActiveFlight?.() ||
    r.railwayEngine?.getActiveRoute?.() ||
    r.driveEngine?.getActiveDrive?.() ||
    r.boatEngine?.getActiveTelemetry?.() ||
    r.busEngine?.isSimActive?.() ||
    r.metroEngine?.isSimActive?.() ||
    r.freightEngine?.isRunning?.(),
  );
}

// ── 1. FLIGHT STATE ──────────────────────────────────────────────────────────
const flightMode = ref('preset'); // 'preset' | 'custom'
const flightOrigin = ref('ATL');
const flightDest = ref('MIA');
const flightCustomFrom = ref('MIA');
const flightCustomTo = ref('EYW');
const flightAircraft = ref('airliner'); // 'airliner' | 'h145'
const flightAlt = ref('10668');
const flightDuration = ref('auto');
const flightCockpit = ref(true);
const flightStatus = ref('');

const flightModeOptions = computed(() => [
  { value: 'preset', label: t('Preset Hubs') },
  { value: 'custom', label: t('Custom Route') },
]);

const flightAircraftOptions = computed(() => [
  { value: 'airliner', label: t('Jet Airliner') },
  { value: 'h145', label: t('Airbus H145') },
]);

const flightAltOptions = computed(() => [
  { value: '10668', label: t('35k ft (Cruise)') },
  { value: '4572', label: t('15k ft (Medium)') },
  { value: '1524', label: t('5k ft (Scenic)') },
]);

const flightDurationOptions = computed(() => [
  { value: 'auto', label: t('Real-Time (1x)') },
  { value: '300', label: t('300s (Preview)') },
  { value: '180', label: t('180s (Fast)') },
  { value: '60', label: t('60s (Express)') },
]);

const airportPickerOptions = computed(() =>
  Object.entries(AIRPORT_WAYPOINTS).map(([code, wp]) => ({
    value: code,
    label: `${code} — ${wp.name}`,
    subtitle: `${wp.lat.toFixed(2)}°, ${wp.lon.toFixed(2)}° · ${wp.elev}m`,
    badge: code,
    keywords: [code, wp.name],
  })),
);

const flightTelemetry = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.flightEngine?.getActiveTelemetry?.() || null;
});

async function launchFlight() {
  const engine = rt.value.flightEngine;
  if (!engine) return;
  const from =
    flightMode.value === 'preset'
      ? flightOrigin.value || 'ATL'
      : flightCustomFrom.value.trim() || 'MIA';
  const to =
    flightMode.value === 'preset'
      ? flightDest.value || 'MIA'
      : flightCustomTo.value.trim() || 'EYW';
  const isRotor = flightAircraft.value === 'h145';
  const cruiseAlt = isRotor ? 450 : Number(flightAlt.value) || 10668;
  const rawDuration = flightDuration.value;
  const parsedDuration =
    rawDuration && rawDuration !== 'auto' ? Number(rawDuration) : undefined;
  const durationSec =
    Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : undefined;

  flightStatus.value = `${t('Plotting route')}: ${from} → ${to}...`;
  try {
    rt.value.coordinator?.notifySimulationStarted?.('flight');
    const flight = await engine.spawnFlightRoute(from, to, {
      cockpit: flightCockpit.value,
      cruiseAlt,
      durationSec,
      aircraftType: isRotor ? 'h145' : undefined,
      isRotorcraft: isRotor,
    });
    if (flight) {
      flightStatus.value = `${t('En route')}: ${flight.from?.code || from} → ${flight.to?.code || to}`;
      rt.value.syncActiveSimSnapshot?.('flight');
    }
  } catch (err) {
    flightStatus.value = `${t('Error')}: ${err?.message || err}`;
  }
  store.bumpTelemetry();
}

function stopFlight() {
  rt.value.flightEngine?.clearActiveFlight?.();
  rt.value.coordinator?.notifySimulationStopped?.('flight');
  store.clearActiveSim('flight');
  flightStatus.value = t('Flight cleared.');
  store.bumpTelemetry();
}

function setFlightCamera(mode) {
  store.patchActiveSimCameraMode(mode, { kind: 'flight' });
  rt.value.flightEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

// ── 2. RAIL STATE ────────────────────────────────────────────────────────────
const railMode = ref('preset'); // 'preset' | 'custom'
const railCorridorId = ref('atlanta_marta_east');
const railTrackProfileId = ref('csx_mainline');
const railCustomFrom = ref('33.7561, -84.3403');
const railCustomTo = ref('33.7505, -84.3862');
const railSpeedMph = ref(45);
const railCameraMode = ref('cab');
const railStatus = ref('');

const railModeOptions = computed(() => [
  { value: 'preset', label: t('Preset Corridors') },
  { value: 'custom', label: t('Custom Coords') },
]);

const railCorridorOptions = computed(() =>
  Object.entries(RAIL_CORRIDORS).map(([id, c]) => ({
    value: id,
    label: c.name,
    subtitle: c.city || `${c.from?.name || ''} → ${c.to?.name || ''}`,
    badge: `${c.defaultSpeedMph || 45} mph`,
    keywords: [id, c.name, c.city || '', c.from?.name || '', c.to?.name || ''],
  })),
);

const railTrackProfileOptions = computed(() => {
  const corridor = RAIL_CORRIDORS[railCorridorId.value];
  const profiles = corridor?.trackProfiles || {};
  return Object.entries(profiles).map(([id, prof]) => ({
    value: id,
    label: prof.name,
    subtitle: prof.description || '',
    badge: prof.vehicleMode || (prof.subterranean ? 'Tunnel' : 'Surface'),
  }));
});

watch(railCorridorId, (nextId) => {
  const corridor = RAIL_CORRIDORS[nextId];
  if (!corridor) return;
  const profileKeys = Object.keys(corridor.trackProfiles || {});
  railTrackProfileId.value =
    corridor.defaultCorridor &&
    corridor.trackProfiles?.[corridor.defaultCorridor]
      ? corridor.defaultCorridor
      : profileKeys[0] || '';
  if (corridor.defaultSpeedMph) {
    railSpeedMph.value = corridor.defaultSpeedMph;
  }
});

const railTelemetry = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.railwayEngine?.getActiveTelemetry?.() || null;
});

async function launchRail() {
  const engine = rt.value.railwayEngine;
  if (!engine) return;
  railStatus.value = t('Engaging throttle and plotting rail line...');
  try {
    rt.value.coordinator?.notifySimulationStarted?.('rail');
    const fromQuery =
      railMode.value === 'preset'
        ? railCorridorId.value
        : railCustomFrom.value.trim() || '33.7561, -84.3403';
    const toQuery =
      railMode.value === 'preset'
        ? null
        : railCustomTo.value.trim() || '33.7505, -84.3862';
    const corridorProfile =
      railMode.value === 'preset'
        ? railTrackProfileId.value || 'csx_mainline'
        : 'custom_mainline';
    const route = await engine.spawnRailRoute(fromQuery, toQuery, {
      corridor: corridorProfile,
      cabRide: railCameraMode.value === 'cab',
      cameraMode: railCameraMode.value,
      speedMph: Number(railSpeedMph.value) || 45,
      useOverpass: true,
    });
    if (route) {
      const km = (route.corridor.totalDistanceMeters / 1000).toFixed(1);
      railStatus.value = `${t('En route')}: ${km} km @ ${railSpeedMph.value} mph`;
      rt.value.syncActiveSimSnapshot?.('rail');
    }
  } catch (err) {
    railStatus.value = `${t('Error')}: ${err?.message || err}`;
  }
  store.bumpTelemetry();
}

function stopRail() {
  rt.value.railwayEngine?.clearActiveRailRoute?.();
  rt.value.coordinator?.notifySimulationStopped?.('rail');
  store.clearActiveSim('rail');
  railStatus.value = t('Train run stopped.');
  store.bumpTelemetry();
}

function setRailCamera(mode) {
  railCameraMode.value = mode;
  store.patchActiveSimCameraMode(mode, { kind: 'rail' });
  rt.value.railwayEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

function snapRailBack() {
  railCameraMode.value = 'cab';
  store.patchActiveSimCameraMode('cab', { kind: 'rail' });
  rt.value.railwayEngine?.snapBack?.('cab');
  store.bumpTelemetry();
}

// ── 3. DRIVE STATE ───────────────────────────────────────────────────────────
const driveMode = ref('preset'); // 'preset' | 'custom' | 'stalker'
const driveCorridorId = ref('cannonball_bullrun');
const driveCustomFrom = ref('33.7490, -84.3880');
const driveCustomTo = ref('32.0809, -81.0912');
const driveSpeedMph = ref(95);
const driveCameraMode = ref('chase');
const driveHesitation = ref(true);
const driveStatus = ref('');

const driveModeOptions = computed(() => [
  { value: 'preset', label: t('Presets') },
  { value: 'custom', label: t('Custom') },
  { value: 'stalker', label: t('Traffic') },
]);

const driveCorridorOptions = computed(() =>
  Object.entries(DRIVE_CORRIDORS).map(([id, c]) => ({
    value: id,
    label: c.name,
    subtitle: `${c.from?.name || ''} → ${c.to?.name || ''}`,
    badge: `${c.defaultSpeedMph || 75} mph`,
    keywords: [
      id,
      c.name,
      c.description || '',
      c.from?.name || '',
      c.to?.name || '',
    ],
  })),
);

const activeDriveCorridor = computed(
  () => DRIVE_CORRIDORS[driveCorridorId.value] || null,
);

watch(driveCorridorId, (nextId) => {
  const c = DRIVE_CORRIDORS[nextId];
  if (c?.defaultSpeedMph) {
    driveSpeedMph.value = c.defaultSpeedMph;
  }
});

const driveTelemetry = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.driveEngine?.getActiveTelemetry?.() || null;
});

async function launchDrive() {
  const engine = rt.value.driveEngine;
  if (!engine) return;
  const speedMph = Number(driveSpeedMph.value) || 75;
  const hesitation = driveHesitation.value;
  driveStatus.value = t('Preparing highway cruiser...');
  try {
    let res = null;
    if (driveMode.value === 'preset') {
      res = await engine.startRouteDrive(driveCorridorId.value, null, {
        speedMph,
        hesitation,
        cameraMode: driveCameraMode.value,
        seat: driveCameraMode.value === 'seat',
      });
    } else if (driveMode.value === 'custom') {
      res = await engine.startRouteDrive(
        driveCustomFrom.value.trim() || '33.7490, -84.3880',
        driveCustomTo.value.trim() || '32.0809, -81.0912',
        {
          speedMph,
          hesitation,
          cameraMode: driveCameraMode.value,
          seat: driveCameraMode.value === 'seat',
        },
      );
    } else {
      res = engine.latchOntoTraffic?.(null, {
        speedMph,
        cameraMode: driveCameraMode.value,
        seat: driveCameraMode.value === 'seat',
      });
    }
    if (res) {
      rt.value.coordinator?.notifySimulationStarted?.('drive', {
        keepIds: ['composite'],
      });
      driveStatus.value = res.isTrafficStalker
        ? `${t('Following traffic')} · ${res.speedMph} mph`
        : `${t('Cruising')} · ${res.corridor?.name || t('Custom Route')} @ ${res.speedMph} mph`;
      rt.value.syncActiveSimSnapshot?.('drive');
    }
  } catch (err) {
    driveStatus.value = `${t('Error')}: ${err?.message || err}`;
  }
  store.bumpTelemetry();
}

function pullOverDrive() {
  const engine = rt.value.driveEngine;
  if (!engine) return;
  if (typeof engine.pullOver === 'function') {
    const res = engine.pullOver();
    if (res?.status === 'parked') {
      driveStatus.value = t(
        'Vehicle pulled over & parked. Camera remains switchable.',
      );
      rt.value.syncActiveSimSnapshot?.('drive');
    } else {
      driveStatus.value = t('Drive cleared.');
      rt.value.coordinator?.notifySimulationStopped?.('drive');
      store.clearActiveSim('drive');
    }
  } else {
    engine.clearActiveDrive?.();
    rt.value.coordinator?.notifySimulationStopped?.('drive');
    store.clearActiveSim('drive');
    driveStatus.value = t('Drive stopped.');
  }
  store.bumpTelemetry();
}

function setDriveCamera(mode) {
  driveCameraMode.value = mode;
  store.patchActiveSimCameraMode(mode, { kind: 'drive' });
  rt.value.driveEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

function snapDriveBack() {
  driveCameraMode.value = 'chase';
  store.patchActiveSimCameraMode('chase', { kind: 'drive' });
  // Single atomic call (fixes legacy double-call in driveDrawer.js:491-495)
  rt.value.driveEngine?.snapBack?.('chase');
  store.bumpTelemetry();
}

// ── 4. SAIL / BOAT STATE ─────────────────────────────────────────────────────
const sailMode = ref('preset'); // 'preset' | 'custom' | 'click'
const sailPresetId = ref('savannah_barrier_islands');
const sailCustomFrom = ref('31.9565, -81.0425');
const sailCustomTo = ref('31.8950, -80.9350');
const sailVesselClass = ref('sloop');
const sailSpeedKnots = ref(5);
const sailCameraMode = ref('chase');
const sailStatus = ref('');

const sailModeOptions = computed(() => [
  { value: 'preset', label: t('Presets') },
  { value: 'custom', label: t('Custom') },
  { value: 'click', label: t('Splash') },
]);

const vesselClassOptions = computed(() => [
  { value: 'sloop', label: t('Sloop') },
  { value: 'motorboat', label: t('Motorboat') },
  { value: 'yacht', label: t('Yacht') },
]);

const waterPresetOptions = computed(() =>
  Object.entries(WATER_PRESETS).map(([id, w]) => ({
    value: id,
    label: w.name,
    subtitle: `${w.region || ''} · ${w.isOcean ? t('Sea Level') : `${w.nominalElevationM}m`}`,
    badge: `${w.defaultSpeedKnots || 5} kts`,
    keywords: [
      id,
      w.name,
      w.region || '',
      w.from?.name || '',
      w.to?.name || '',
    ],
  })),
);

const activeVesselSpec = computed(
  () => VESSEL_CLASSES[sailVesselClass.value] || VESSEL_CLASSES.sloop,
);

watch(sailPresetId, (nextId) => {
  const preset = WATER_PRESETS[nextId];
  if (!preset) return;
  if (preset.defaultVessel && VESSEL_CLASSES[preset.defaultVessel]) {
    sailVesselClass.value = preset.defaultVessel;
  }
  if (preset.defaultSpeedKnots) {
    sailSpeedKnots.value = preset.defaultSpeedKnots;
  }
});

watch(sailVesselClass, (cls) => {
  const spec = VESSEL_CLASSES[cls];
  if (!spec) return;
  if (
    sailSpeedKnots.value < spec.minSpeedKnots ||
    sailSpeedKnots.value > spec.maxSpeedKnots
  ) {
    sailSpeedKnots.value = spec.defaultSpeedKnots;
  }
});

const boatTelemetry = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.boatEngine?.getActiveTelemetry?.() || null;
});

function onBoatSpeedChange(val) {
  sailSpeedKnots.value = Number(val) || 5;
  rt.value.boatEngine?.setThrottle?.(sailSpeedKnots.value);
}

function activateWaterSplashdown() {
  sailStatus.value = t('Click any water on the 3D globe...');
  rt.value.boatEngine?.startSplashdownClickMode?.(({ lat, lon }) => {
    sailCustomFrom.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    sailCustomTo.value = `${(lat + 0.015).toFixed(4)}, ${(lon + 0.015).toFixed(4)}`;
    sailMode.value = 'custom';
    sailStatus.value = `${t('Water target acquired')}: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  });
}

async function launchSail() {
  const engine = rt.value.boatEngine;
  if (!engine) return;
  const speedKnots = Number(sailSpeedKnots.value) || 5;
  const fromQuery =
    sailMode.value === 'preset'
      ? sailPresetId.value
      : sailCustomFrom.value.trim() || '31.9565, -81.0425';
  const toQuery =
    sailMode.value === 'preset'
      ? null
      : sailCustomTo.value.trim() || '31.8950, -80.9350';
  sailStatus.value = t('Engaging throttle and plotting maritime course...');
  try {
    const route = await engine.spawnBoatRoute(fromQuery, toQuery, {
      vesselClass: sailVesselClass.value,
      speedKnots,
      cameraMode: sailCameraMode.value,
    });
    if (route) {
      rt.value.coordinator?.notifySimulationStarted?.('boat');
      sailStatus.value = `${t('Cruising')}: ${route.waterbody?.totalDistanceNmi || '—'} NM @ ${speedKnots} kts`;
      rt.value.syncActiveSimSnapshot?.('boat');
    }
  } catch (err) {
    sailStatus.value = `${t('Error')}: ${err?.message || err}`;
  }
  store.bumpTelemetry();
}

function dockBoat() {
  rt.value.boatEngine?.clearActiveBoatRoute?.();
  rt.value.boatEngine?.cancelSplashdownClickMode?.();
  rt.value.coordinator?.notifySimulationStopped?.('boat');
  store.clearActiveSim('boat');
  sailStatus.value = t('Vessel docked.');
  store.bumpTelemetry();
}

function setBoatCamera(mode) {
  sailCameraMode.value = mode;
  store.patchActiveSimCameraMode(mode, { kind: 'boat' });
  rt.value.boatEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

function snapBoatBack() {
  sailCameraMode.value = 'chase';
  store.patchActiveSimCameraMode('chase', { kind: 'boat' });
  rt.value.boatEngine?.snapBack?.('chase');
  store.bumpTelemetry();
}

// ── 5. METRO / BUS / MOTORMAN STATE ──────────────────────────────────────────
const transitSubTab = ref('fleet'); // 'fleet' | 'motorman' | 'dispatcher'
const transitMode = ref('metro'); // 'bus' | 'metro'
const transitCityId = ref('atlanta');
const transitLineFilter = ref('all');
const transitShowLines = ref(true);

const transitSubTabOptions = computed(() => [
  { value: 'fleet', label: t('Fleet') },
  { value: 'motorman', label: t('Motorman') },
  { value: 'dispatcher', label: t('Dispatch') },
]);

const transitModeOptions = computed(() => [
  { value: 'bus', label: t('Bus Fleet') },
  { value: 'metro', label: t('Metro Rail') },
]);

const TRANSIT_NETWORK_OPTIONS = Object.freeze([
  {
    value: 'atlanta',
    // i18n-ignore: proper transit network name
    label: 'Atlanta (MARTA — 4 Rail Lines & Streetcar)',
    badge: 'ATL',
  },
  {
    value: 'los_angeles',
    // i18n-ignore: proper transit network name
    label: 'Los Angeles (LA Metro — 6 Lines)',
    badge: 'LAX',
  },
  {
    value: 'san_francisco',
    // i18n-ignore: proper transit network name
    label: 'San Francisco (BART & SF Muni)',
    badge: 'SFO',
  },
  {
    value: 'washington_dc',
    // i18n-ignore: proper transit network name
    label: 'Washington, D.C. (WMATA — 6 Lines)',
    badge: 'DCA',
  },
  {
    value: 'northeast_corridor',
    // i18n-ignore: proper transit network name
    label: 'Northeast Corridor (Amtrak NEC: Boston ↔ DC)',
    badge: 'NEC',
  },
  {
    value: 'wdw_monorail',
    // i18n-ignore: proper transit network name
    label: 'Walt Disney World Monorail (Lagoon & EPCOT)',
    badge: 'WDW',
  },
  {
    value: 'dlr_monorail',
    // i18n-ignore: proper transit network name
    label: 'Disneyland Monorail (Anaheim Beamway)',
    badge: 'DLR',
  },
  {
    value: 'wdw_mk_railroad',
    // i18n-ignore: proper transit network name
    label: 'Walt Disney World Railroad (MK Steam Loop)',
    badge: 'MK',
  },
  {
    value: 'dlr_railroad',
    // i18n-ignore: proper transit network name
    label: 'Disneyland Railroad (Anaheim Steam Loop)',
    badge: 'DLR',
  },
  {
    value: 'chicago',
    // i18n-ignore: proper transit network name
    label: 'Chicago (CTA The Loop & Red/Blue)',
    badge: 'CHI',
  },
  {
    value: 'new_york',
    // i18n-ignore: proper transit network name
    label: 'New York (MTA Subways — Multi-Line)',
    badge: 'NYC',
  },
  {
    value: 'tokyo',
    // i18n-ignore: proper transit network name
    label: 'Tokyo (JR Yamanote & Metro Lines)',
    badge: 'TYO',
  },
  {
    value: 'london',
    // i18n-ignore: proper transit network name
    label: 'London (TfL Underground — Multi-Line)',
    badge: 'LON',
  },
]);

const transitVehicles = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  const list =
    transitMode.value === 'bus'
      ? rt.value.busEngine?.getFleet?.() || []
      : rt.value.metroEngine?.getTrains?.() || [];
  if (transitMode.value === 'metro' && transitLineFilter.value !== 'all') {
    return list.filter(
      (v) => (v.route?.id || v.routeId) === transitLineFilter.value,
    );
  }
  return list;
});

const transitLineFilters = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  if (transitMode.value !== 'metro') return [];
  const trains = rt.value.metroEngine?.getTrains?.() || [];
  const seen = new Map();
  for (const tr of trains) {
    const id = tr.route?.id || tr.routeId;
    if (id && !seen.has(id)) {
      seen.set(id, tr.route?.lineName || id);
    }
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
});

const activeTransitVehicleId = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return transitMode.value === 'bus'
    ? rt.value.busEngine?.getActiveBus?.()?.id || null
    : rt.value.metroEngine?.getActiveTrain?.()?.id || null;
});

const activeTransitCamMode = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  const eng =
    transitMode.value === 'bus' ? rt.value.busEngine : rt.value.metroEngine;
  if (!eng?.isCameraEnabled?.()) return null;
  return eng.getCameraMode?.() || 'chase';
});

const motormanState = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.motormanControls?.getState?.() || null;
});

const dispatcherAlerts = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  const fleet =
    transitMode.value === 'bus'
      ? rt.value.busEngine?.getFleet?.() || []
      : rt.value.metroEngine?.getTrains?.() || [];
  return rt.value.motormanControls?.evaluateFleetHeadways?.(fleet) || [];
});

function engageTransit(cityId = transitCityId.value || 'atlanta') {
  transitCityId.value = cityId;
  transitLineFilter.value = 'all';
  if (rt.value.transitDrawer?.startActiveTransit) {
    rt.value.transitDrawer.startActiveTransit(cityId, {
      preferredMode: transitMode.value,
    });
    const actualMode = rt.value.transitDrawer.getActiveMode?.();
    if (actualMode) transitMode.value = actualMode;
  } else {
    rt.value.coordinator?.notifySimulationStarted?.('transit');
    rt.value.metroEngine?.startMetroSystem?.(cityId);
  }
  rt.value.syncActiveSimSnapshot?.('transit');
  store.bumpTelemetry();
}

function onTransitModeSwitch(nextMode) {
  transitMode.value = nextMode;
  transitLineFilter.value = 'all';
  rt.value.transitDrawer?.switchMode?.(nextMode, true);
  rt.value.syncActiveSimSnapshot?.('transit');
  store.bumpTelemetry();
}

function showTransitOverview() {
  if (transitMode.value === 'bus') {
    rt.value.metroEngine?.setCameraEnabled?.(false);
    rt.value.busEngine?.showTransitMap?.();
  } else {
    rt.value.busEngine?.setCameraEnabled?.(false);
    rt.value.metroEngine?.showTransitMap?.();
  }
  store.patchActiveSimCameraMode('overview', { kind: 'transit' });
  store.bumpTelemetry();
}

function toggleTransitLines() {
  transitShowLines.value = !transitShowLines.value;
  rt.value.busEngine?.setRouteLinesVisible?.(transitShowLines.value);
  rt.value.metroEngine?.setRouteLinesVisible?.(transitShowLines.value);
  store.bumpTelemetry();
}

function snapTransitBack() {
  if (transitMode.value === 'bus') {
    rt.value.metroEngine?.setCameraEnabled?.(false);
    rt.value.busEngine?.setCameraEnabled?.(true);
    rt.value.busEngine?.snapBack?.('chase');
  } else {
    rt.value.busEngine?.setCameraEnabled?.(false);
    rt.value.metroEngine?.setCameraEnabled?.(true);
    rt.value.metroEngine?.snapBack?.('chase');
  }
  store.patchActiveSimCameraMode('chase', { kind: 'transit' });
  store.bumpTelemetry();
}

function stopTransit() {
  rt.value.busEngine?.stopBusFleet?.();
  rt.value.metroEngine?.stopMetroSystem?.();
  rt.value.coordinator?.notifySimulationStopped?.('transit');
  store.clearActiveSim('transit');
  store.bumpTelemetry();
}

function latchTransitVehicle(vehicleId, camMode = 'chase') {
  if (transitMode.value === 'bus') {
    rt.value.metroEngine?.setCameraEnabled?.(false);
    rt.value.busEngine?.setActiveBus?.(vehicleId);
    rt.value.busEngine?.setCameraEnabled?.(true);
    rt.value.busEngine?.setCameraMode?.(camMode);
    const activeV = rt.value.busEngine?.getActiveBus?.();
    if (activeV) rt.value.motormanControls?.bindVehicle?.(activeV, 'bus');
  } else {
    rt.value.busEngine?.setCameraEnabled?.(false);
    rt.value.metroEngine?.setActiveTrain?.(vehicleId);
    rt.value.metroEngine?.setCameraEnabled?.(true);
    rt.value.metroEngine?.setCameraMode?.(camMode);
    const activeV = rt.value.metroEngine?.getActiveTrain?.();
    if (activeV) rt.value.motormanControls?.bindVehicle?.(activeV, 'metro');
  }
  store.patchActiveSimCameraMode(camMode, { kind: 'transit' });
  rt.value.syncActiveSimSnapshot?.('transit');
  store.bumpTelemetry();
}

function dispatchTransitOrder(kind) {
  const v =
    transitMode.value === 'bus'
      ? rt.value.busEngine?.getActiveBus?.()
      : rt.value.metroEngine?.getActiveTrain?.();
  if (!v) return;
  if (kind === 'hold') {
    rt.value.motormanControls?.issueHoldOrder?.(v.id, 60);
  } else {
    rt.value.motormanControls?.issueExpressOrder?.(v.id);
  }
  store.bumpTelemetry();
}

// ── 6. FREIGHT STATE ─────────────────────────────────────────────────────────
const freightSubTab = ref('spectator'); // 'spectator' | 'dispatcher'
const freightAudioUnmuted = ref(false);

const freightSubTabOptions = computed(() => [
  { value: 'spectator', label: t('Convoy Fleet') },
  { value: 'dispatcher', label: t('Dispatcher') },
]);

const freightCamOptions = FREIGHT_CAM_OPTIONS;

const freightTrucks = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.freightEngine?.getAllTrucks?.() || [];
});

const freightLatched = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return (
    rt.value.freightEngine?.getLatchedTruck?.() ||
    freightTrucks.value[0] ||
    null
  );
});

const freightCameraMode = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.freightEngine?.getCameraMode?.() || 'SEMI_CHASE';
});

function startFreight() {
  rt.value.coordinator?.notifySimulationStarted?.('freight');
  rt.value.freightEngine?.start?.();
  rt.value.syncActiveSimSnapshot?.('freight');
  store.bumpTelemetry();
}

function stopFreight() {
  rt.value.freightEngine?.stop?.();
  rt.value.coordinator?.notifySimulationStopped?.('freight');
  store.clearActiveSim('freight');
  store.bumpTelemetry();
}

function selectFreightTruck(truckId) {
  rt.value.freightEngine?.selectTruck?.(truckId);
  rt.value.syncActiveSimSnapshot?.('freight');
  store.bumpTelemetry();
}

function setFreightCamera(mode) {
  store.patchActiveSimCameraMode(mode, { kind: 'freight' });
  rt.value.freightEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

function toggleFreightAudio() {
  const audio = rt.value.freightEngine?.getAudioEngine?.();
  if (!audio) return;
  freightAudioUnmuted.value = Boolean(audio.toggleMute?.());
}

function triggerFreightAction(action) {
  if (action === 'fast-transload') {
    rt.value.freightEngine?.fastForwardTransload?.();
  } else if (action === 'weather-detour') {
    rt.value.freightEngine?.rerouteWeatherDetour?.();
  }
  store.bumpTelemetry();
}

// ── 7. CORRIDORS (CONNECT PLACES) STATE ──────────────────────────────────────
const corridorFrom = ref('Austin, TX');
const corridorTo = ref('San Antonio, TX');

const CORRIDOR_PRESETS = Object.freeze([
  // i18n-ignore: proper corridor pair
  { label: 'Austin ↔ San Antonio', from: 'Austin, TX', to: 'San Antonio, TX' },
  // i18n-ignore: proper corridor pair
  { label: 'Atlanta ↔ Tokyo', from: 'Atlanta, GA', to: 'Tokyo, Japan' },
  // i18n-ignore: proper corridor pair
  { label: 'Miami ↔ Nassau', from: 'Miami, FL', to: 'Nassau, Bahamas' },
]);

const corridorPlaceOptions = computed(() => {
  void domicilesTick.value;
  const opts = [];
  const seen = new Set();
  const pushOpt = (opt) => {
    if (!opt?.value || seen.has(opt.value)) return;
    seen.add(opt.value);
    opts.push(opt);
  };

  for (const dom of getAllDomiciles().slice(0, 16)) {
    const typ =
      DOMICILE_TYPOLOGY_META[String(dom.typology || '').toUpperCase()];
    const title = String(dom.title || dom.name || dom.id || '').trim();
    if (!title) continue;
    pushOpt({
      value: title,
      label: title,
      subtitle: dom.city || dom.address || typ?.shortLabel || t('Domicile'),
      badge: 'Estate',
      keywords: [
        title,
        dom.city || '',
        dom.address || '',
        'estate',
        'domicile',
      ],
    });
  }

  for (const p of [
    {
      value: 'Austin, TX',
      // i18n-ignore: proper place name
      label: 'Austin, TX',
      // i18n-ignore: proper place name
      subtitle: 'Texas, USA',
      badge: 'City',
    },
    {
      value: 'San Antonio, TX',
      // i18n-ignore: proper place name
      label: 'San Antonio, TX',
      // i18n-ignore: proper place name
      subtitle: 'Texas, USA',
      badge: 'City',
    },
    {
      value: 'Atlanta, GA',
      // i18n-ignore: proper place name
      label: 'Atlanta, GA',
      // i18n-ignore: proper place name
      subtitle: 'Georgia, USA',
      badge: 'City',
    },
    {
      value: 'Savannah, GA',
      // i18n-ignore: proper place name
      label: 'Savannah, GA',
      // i18n-ignore: proper place name
      subtitle: 'Georgia Coast, USA',
      badge: 'City',
    },
    {
      value: 'Miami, FL',
      // i18n-ignore: proper place name
      label: 'Miami, FL',
      // i18n-ignore: proper place name
      subtitle: 'Florida, USA',
      badge: 'City',
    },
    {
      value: 'Nassau, Bahamas',
      // i18n-ignore: proper place name
      label: 'Nassau, Bahamas',
      // i18n-ignore: proper place name
      subtitle: 'Bahamas',
      badge: 'Island',
    },
    {
      value: 'Tokyo, Japan',
      // i18n-ignore: proper place name
      label: 'Tokyo, Japan',
      // i18n-ignore: proper place name
      subtitle: 'Japan',
      badge: 'City',
    },
    {
      value: 'London, UK',
      // i18n-ignore: proper place name
      label: 'London, UK',
      // i18n-ignore: proper place name
      subtitle: 'United Kingdom',
      badge: 'City',
    },
  ]) {
    pushOpt(p);
  }

  for (const [code, wp] of Object.entries(AIRPORT_WAYPOINTS)) {
    pushOpt({
      value: code,
      label: `${code} — ${wp.name}`,
      subtitle: `${wp.lat.toFixed(2)}°, ${wp.lon.toFixed(2)}°`,
      badge: code,
      keywords: [code, wp.name],
    });
  }

  return opts;
});

const corridorState = computed(() => {
  void telemetryRevision.value;
  void liveTick.value;
  return rt.value.corridorDrawer?.getState?.() || null;
});

watch(
  corridorPrefillOrigin,
  (val) => {
    const trimmed = String(val || '').trim();
    if (trimmed) {
      corridorFrom.value = trimmed;
      corridorPrefillOrigin.value = '';
    }
  },
  { immediate: true },
);

async function runConnectPlaces(
  from = corridorFrom.value,
  to = corridorTo.value,
) {
  corridorFrom.value = from;
  corridorTo.value = to;
  await rt.value.corridorDrawer?.connectPlaces?.(from, to, {
    openDrawerOnConnect: false,
    flyCamera: true,
  });
  store.bumpTelemetry();
}

function setCorridorFromCamera(which) {
  const pos = rt.value.getCameraGroundTarget?.();
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return;
  const formatted = `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`;
  if (which === 'from') corridorFrom.value = formatted;
  else corridorTo.value = formatted;
}

function swapCorridorEndpoints() {
  const prev = corridorFrom.value;
  corridorFrom.value = corridorTo.value;
  corridorTo.value = prev;
  if (corridorFrom.value && corridorTo.value) {
    void runConnectPlaces(corridorFrom.value, corridorTo.value);
  }
}

function clearCorridor() {
  rt.value.corridorDrawer?.clear?.();
  store.bumpTelemetry();
}

function reframeCorridor() {
  rt.value.corridorDrawer?.frameCorridor?.();
}

async function launchCorridorMode(modeId) {
  const ok = await rt.value.corridorDrawer?.launchMode?.(modeId);
  if (ok) {
    const simKind = modeId === 'h145' || modeId === 'jet' ? 'flight' : modeId;
    rt.value.syncActiveSimSnapshot?.(simKind);
  }
  store.bumpTelemetry();
}

onMounted(() => {
  unsubDomiciles = onDomicileRegistryChange(() => {
    domicilesTick.value += 1;
  });
  pollTimer = setInterval(() => {
    if (isAnyVehicleActive()) {
      liveTick.value += 1;
    }
  }, 650);
});

onBeforeUnmount(() => {
  unsubDomiciles?.();
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div
    class="es-vehicles-mobility"
    data-sovereign-ui="vehicles-mobility-module"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
  >
    <UiSegmented
      v-model="activeTab"
      class="es-mobility-tabs"
      :options="mobilityTabOptions"
      :label="t('Vehicles and Corridors modes')"
      keyboard="radio"
    />

    <!-- ── TAB 1: FLIGHT ────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'flight'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('Flight Simulator') }}</span>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Browse Flight Experiences')"
          @click="store.openExplorer({ chips: ['flights-heli'] })"
        >
          <UiIcon name="travel_explore" :size="null" />
        </UiButton>
      </div>

      <UiSegmented
        v-model="flightMode"
        :options="flightModeOptions"
        :label="t('Flight route mode')"
      />

      <UiSegmented
        v-model="flightAircraft"
        :options="flightAircraftOptions"
        :label="t('Aircraft class')"
      />

      <template v-if="flightMode === 'preset'">
        <SearchablePlacePicker
          v-model="flightOrigin"
          picker-id="flight-origin"
          :label="t('Origin Hub')"
          :placeholder="t('Search airport or city...')"
          :options="airportPickerOptions"
        />
        <SearchablePlacePicker
          v-model="flightDest"
          picker-id="flight-dest"
          :label="t('Destination Hub')"
          :placeholder="t('Search airport or city...')"
          :options="airportPickerOptions"
        />
      </template>

      <template v-else>
        <div class="es-field-row">
          <label class="es-field-label" for="es-flight-from-input">{{
            t('Custom Departure')
          }}</label>
          <input
            id="es-flight-from-input"
            v-model="flightCustomFrom"
            type="text"
            class="es-text-input"
            :placeholder="t('e.g. MIA, Key West, 25.76,-80.19')"
          />
        </div>
        <div class="es-field-row">
          <label class="es-field-label" for="es-flight-to-input">{{
            t('Custom Destination')
          }}</label>
          <input
            id="es-flight-to-input"
            v-model="flightCustomTo"
            type="text"
            class="es-text-input"
            :placeholder="t('e.g. EYW, London, JFK')"
          />
        </div>
      </template>

      <div class="es-grid-2">
        <div class="es-field-row">
          <span class="es-field-label">{{ t('Altitude') }}</span>
          <UiSelect
            v-model="flightAlt"
            class="es-select"
            :options="flightAltOptions"
            :aria-label="t('Cruise altitude')"
          />
        </div>
        <div class="es-field-row">
          <span class="es-field-label">{{ t('Pace') }}</span>
          <UiSelect
            v-model="flightDuration"
            class="es-select"
            :options="flightDurationOptions"
            :aria-label="t('Flight pace')"
          />
        </div>
      </div>

      <UiCheckbox v-model="flightCockpit">
        {{ t('First-Person Cockpit View') }}
      </UiCheckbox>

      <div v-if="flightTelemetry" class="es-status-line">
        <strong
          >{{ flightTelemetry.fromCode }} → {{ flightTelemetry.toCode }}</strong
        >
        · {{ flightTelemetry.speedText }} · {{ flightTelemetry.altText }} ({{
          flightTelemetry.progressPct
        }}%)
      </div>
      <div v-else-if="flightStatus" class="es-muted">{{ flightStatus }}</div>

      <div class="es-btn-row">
        <UiButton
          v-for="cam in [
            { id: 'cockpit', label: t('Cockpit') },
            { id: 'chase', label: t('Chase') },
            { id: 'heli', label: t('Heli') },
            { id: 'overview', label: t('Overview') },
            { id: 'free', label: t('Free') },
          ]"
          :key="cam.id"
          variant="action"
          size="compact"
          :data-flight-cam="cam.id"
          :pressed="flightTelemetry?.cameraMode === cam.id"
          pressed-class="active"
          :label="cam.label"
          @click="setFlightCamera(cam.id)"
        >
          {{ cam.label }}
        </UiButton>
      </div>

      <div class="es-btn-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch"
          data-mobility-action="launch-flight"
          :label="t('Launch Flight')"
          @click="launchFlight"
        >
          <UiIcon name="flight" :size="null" />
          <span>{{ t('Launch Flight') }}</span>
        </UiButton>
        <UiButton
          variant="action"
          tone="danger"
          size="compact"
          :label="t('Stop Flight')"
          @click="stopFlight"
        >
          {{ t('Stop') }}
        </UiButton>
      </div>
    </div>

    <!-- ── TAB 2: RAIL ──────────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'rail'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('World of Rails') }}</span>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Browse Rail Experiences')"
          @click="store.openExplorer({ chips: ['rails-monorails'] })"
        >
          <UiIcon name="travel_explore" :size="null" />
        </UiButton>
      </div>

      <UiSegmented
        v-model="railMode"
        :options="railModeOptions"
        :label="t('Rail route mode')"
      />

      <template v-if="railMode === 'preset'">
        <SearchablePlacePicker
          v-model="railCorridorId"
          picker-id="rail-corridor"
          :label="t('Rail Corridor')"
          :placeholder="t('Search rail, monorail, skyliner...')"
          :options="railCorridorOptions"
        />
        <SearchablePlacePicker
          v-if="railTrackProfileOptions.length > 0"
          v-model="railTrackProfileId"
          picker-id="rail-track-profile"
          :label="t('Track Profile')"
          :placeholder="t('Filter track profiles...')"
          :options="railTrackProfileOptions"
        />
      </template>

      <template v-else>
        <div class="es-field-row">
          <label class="es-field-label" for="es-rail-from-input">{{
            t('Origin Coordinates')
          }}</label>
          <input
            id="es-rail-from-input"
            v-model="railCustomFrom"
            type="text"
            class="es-text-input"
          />
        </div>
        <div class="es-field-row">
          <label class="es-field-label" for="es-rail-to-input">{{
            t('Destination Coordinates')
          }}</label>
          <input
            id="es-rail-to-input"
            v-model="railCustomTo"
            type="text"
            class="es-text-input"
          />
        </div>
      </template>

      <div class="es-field-row">
        <div class="es-section-head">
          <span class="es-field-label">{{ t('Cruising Speed') }}</span>
          <span class="es-muted">{{ railSpeedMph }} mph</span>
        </div>
        <UiSlider
          :model-value="railSpeedMph"
          :min="15"
          :max="175"
          :step="5"
          :aria-label="t('Rail cruising speed')"
          @update:model-value="(v) => (railSpeedMph = Number(v) || 45)"
        />
      </div>

      <div class="es-btn-row">
        <UiButton
          v-for="cam in [
            { id: 'cab', label: t('Cab') },
            { id: 'chase', label: t('Chase') },
            { id: 'heli', label: t('Heli') },
            { id: 'overview', label: t('Overview') },
            { id: 'free', label: t('Free') },
          ]"
          :key="cam.id"
          variant="action"
          size="compact"
          :data-rail-cam="cam.id"
          :pressed="(railTelemetry?.cameraMode || railCameraMode) === cam.id"
          pressed-class="active"
          :label="cam.label"
          @click="setRailCamera(cam.id)"
        >
          {{ cam.label }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Snap Back to Train')"
          @click="snapRailBack"
        >
          {{ t('Snap') }}
        </UiButton>
      </div>

      <div v-if="railTelemetry" class="es-status-line">
        <strong>{{ railTelemetry.trainName }}</strong> ·
        {{ railTelemetry.speedMph }} mph · {{ railTelemetry.progressPct }}%
      </div>
      <div v-else-if="railStatus" class="es-muted">{{ railStatus }}</div>

      <div class="es-btn-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch"
          data-mobility-action="launch-rail"
          :label="t('Launch Train Run')"
          @click="launchRail"
        >
          <UiIcon name="train" :size="null" />
          <span>{{ t('Launch Train Run') }}</span>
        </UiButton>
        <UiButton
          variant="action"
          tone="danger"
          size="compact"
          :label="t('Stop Train')"
          @click="stopRail"
        >
          {{ t('Stop') }}
        </UiButton>
      </div>
    </div>

    <!-- ── TAB 3: DRIVE ─────────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'drive'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('Infinite Drive') }}</span>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Browse Scenic Drives')"
          @click="store.openExplorer({ chips: ['scenic-drives'] })"
        >
          <UiIcon name="travel_explore" :size="null" />
        </UiButton>
      </div>

      <UiSegmented
        v-model="driveMode"
        :options="driveModeOptions"
        :label="t('Drive mode')"
      />

      <template v-if="driveMode === 'preset'">
        <SearchablePlacePicker
          v-model="driveCorridorId"
          picker-id="drive-corridor"
          :label="t('Highway Corridor')"
          :placeholder="t('Search highway or scenic drive...')"
          :options="driveCorridorOptions"
        />
        <div v-if="activeDriveCorridor?.description" class="es-muted">
          {{ activeDriveCorridor.description }}
        </div>
      </template>

      <template v-else-if="driveMode === 'custom'">
        <div class="es-field-row">
          <label class="es-field-label" for="es-drive-from-input">{{
            t('Origin Coordinates')
          }}</label>
          <input
            id="es-drive-from-input"
            v-model="driveCustomFrom"
            type="text"
            class="es-text-input"
          />
        </div>
        <div class="es-field-row">
          <label class="es-field-label" for="es-drive-to-input">{{
            t('Destination Coordinates')
          }}</label>
          <input
            id="es-drive-to-input"
            v-model="driveCustomTo"
            type="text"
            class="es-text-input"
          />
        </div>
      </template>

      <template v-else>
        <div class="es-muted">
          {{
            t(
              'Click any traffic dot on the globe or latch onto the closest traffic contact.',
            )
          }}
        </div>
      </template>

      <div class="es-field-row">
        <div class="es-section-head">
          <span class="es-field-label">{{ t('Cruising Speed') }}</span>
          <span class="es-muted">{{ driveSpeedMph }} mph</span>
        </div>
        <UiSlider
          :model-value="driveSpeedMph"
          :min="25"
          :max="140"
          :step="5"
          :aria-label="t('Drive cruising speed')"
          @update:model-value="(v) => (driveSpeedMph = Number(v) || 75)"
        />
      </div>

      <UiCheckbox v-model="driveHesitation">
        {{ t('Realistic Curve Slowdowns') }}
      </UiCheckbox>

      <div class="es-btn-row">
        <UiButton
          v-for="cam in [
            { id: 'chase', label: t('Chase') },
            { id: 'seat', label: t('Cockpit') },
            { id: 'copter', label: t('Copter') },
            { id: 'overview', label: t('Overview') },
            { id: 'free', label: t('Free') },
          ]"
          :key="cam.id"
          variant="action"
          size="compact"
          :data-drive-cam="cam.id"
          :pressed="(driveTelemetry?.cameraMode || driveCameraMode) === cam.id"
          pressed-class="active"
          :label="cam.label"
          @click="setDriveCamera(cam.id)"
        >
          {{ cam.label }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Snap Back to Car')"
          @click="snapDriveBack"
        >
          {{ t('Snap') }}
        </UiButton>
      </div>

      <div v-if="driveTelemetry" class="es-status-line">
        <strong>{{ driveTelemetry.currentLocation }}</strong> ·
        {{ driveTelemetry.speedMph }} mph
        <span v-if="driveTelemetry.isParked">({{ t('Parked') }})</span>
        <span v-else>· {{ driveTelemetry.progressPct }}%</span>
      </div>
      <div v-else-if="driveStatus" class="es-muted">{{ driveStatus }}</div>

      <div class="es-btn-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch"
          data-mobility-action="launch-drive"
          :label="
            driveMode === 'stalker' ? t('Latch Traffic') : t('Start Drive')
          "
          @click="launchDrive"
        >
          <UiIcon name="traffic" :size="null" />
          <span>{{
            driveMode === 'stalker' ? t('Latch Traffic') : t('Start Drive')
          }}</span>
        </UiButton>
        <UiButton
          variant="action"
          tone="danger"
          size="compact"
          data-mobility-action="pull-over-drive"
          :label="driveTelemetry?.isParked ? t('Clear Car') : t('Pull Over')"
          @click="pullOverDrive"
        >
          {{ driveTelemetry?.isParked ? t('Clear Car') : t('Pull Over') }}
        </UiButton>
      </div>
    </div>

    <!-- ── TAB 4: SAIL ──────────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'sail'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('World of Sails') }}</span>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Browse Waterways')"
          @click="store.openExplorer({ chips: ['waterways'] })"
        >
          <UiIcon name="travel_explore" :size="null" />
        </UiButton>
      </div>

      <UiSegmented
        v-model="sailMode"
        :options="sailModeOptions"
        :label="t('Waterway mode')"
      />

      <template v-if="sailMode === 'preset'">
        <SearchablePlacePicker
          v-model="sailPresetId"
          picker-id="sail-waterway"
          :label="t('Waterway Destination')"
          :placeholder="t('Search bay, river, lake, coast...')"
          :options="waterPresetOptions"
        />
      </template>

      <template v-else-if="sailMode === 'custom'">
        <div class="es-field-row">
          <label class="es-field-label" for="es-sail-from-input">{{
            t('Departure Point')
          }}</label>
          <input
            id="es-sail-from-input"
            v-model="sailCustomFrom"
            type="text"
            class="es-text-input"
          />
        </div>
        <div class="es-field-row">
          <label class="es-field-label" for="es-sail-to-input">{{
            t('Arrival Point')
          }}</label>
          <input
            id="es-sail-to-input"
            v-model="sailCustomTo"
            type="text"
            class="es-text-input"
          />
        </div>
      </template>

      <template v-else>
        <div class="es-muted">
          {{ t('Click any lake, bay, or ocean on the globe to drop anchor.') }}
        </div>
        <UiButton
          variant="action"
          size="compact"
          :label="t('Activate Water Picker')"
          @click="activateWaterSplashdown"
        >
          <UiIcon name="my_location" :size="null" />
          <span>{{ t('Activate Water Picker') }}</span>
        </UiButton>
      </template>

      <UiSegmented
        v-model="sailVesselClass"
        :options="vesselClassOptions"
        :label="t('Vessel class')"
      />

      <div class="es-field-row">
        <div class="es-section-head">
          <span class="es-field-label">{{ t('Throttle') }}</span>
          <span class="es-muted">
            {{ sailSpeedKnots }} kts ({{ Math.round(sailSpeedKnots * 1.15078) }}
            mph)
          </span>
        </div>
        <UiSlider
          :model-value="sailSpeedKnots"
          :min="activeVesselSpec.minSpeedKnots"
          :max="activeVesselSpec.maxSpeedKnots"
          :step="1"
          :aria-label="t('Vessel throttle knots')"
          @update:model-value="onBoatSpeedChange"
        />
      </div>

      <div class="es-btn-row">
        <UiButton
          v-for="cam in [
            { id: 'helm', label: t('Helm') },
            { id: 'chase', label: t('Chase') },
            { id: 'flybridge', label: t('Bridge') },
            { id: 'overview', label: t('Overview') },
            { id: 'free', label: t('Free') },
          ]"
          :key="cam.id"
          variant="action"
          size="compact"
          :data-boat-cam="cam.id"
          :pressed="(boatTelemetry?.cameraMode || sailCameraMode) === cam.id"
          pressed-class="active"
          :label="cam.label"
          @click="setBoatCamera(cam.id)"
        >
          {{ cam.label }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Snap Back to Vessel')"
          @click="snapBoatBack"
        >
          {{ t('Snap') }}
        </UiButton>
      </div>

      <div v-if="boatTelemetry" class="es-status-line">
        <strong>{{ boatTelemetry.currentLocation }}</strong> ·
        {{ boatTelemetry.speedKnots }} kts · {{ boatTelemetry.progressPct }}%
      </div>
      <div v-else-if="sailStatus" class="es-muted">{{ sailStatus }}</div>

      <div class="es-btn-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch"
          data-mobility-action="launch-sail"
          :label="t('Splashdown & Cruise')"
          @click="launchSail"
        >
          <UiIcon name="directions_boat" :size="null" />
          <span>{{ t('Splashdown & Cruise') }}</span>
        </UiButton>
        <UiButton
          variant="action"
          tone="danger"
          size="compact"
          :label="t('Dock Vessel')"
          @click="dockBoat"
        >
          {{ t('Dock') }}
        </UiButton>
      </div>
    </div>

    <!-- ── TAB 5: METRO / BUS / MOTORMAN ────────────────────────────────── -->
    <div v-else-if="activeTab === 'metro'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('Transit & Motorman') }}</span>
      </div>

      <UiSegmented
        v-model="transitSubTab"
        :options="transitSubTabOptions"
        :label="t('Transit controller tabs')"
      />

      <template v-if="transitSubTab === 'fleet'">
        <SearchablePlacePicker
          v-model="transitCityId"
          picker-id="transit-network"
          :label="t('Transit Network')"
          :placeholder="t('Search city, metro, monorail...')"
          :options="TRANSIT_NETWORK_OPTIONS"
          @select="(opt) => engageTransit(opt.value)"
        />

        <UiSegmented
          :model-value="transitMode"
          :options="transitModeOptions"
          :label="t('Transit vehicle mode')"
          @update:model-value="onTransitModeSwitch"
        />

        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            data-mobility-action="engage-transit"
            :label="t('Engage Transit')"
            @click="engageTransit(transitCityId)"
          >
            {{ t('Engage') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            :label="t('Transit Map Overview')"
            @click="showTransitOverview"
          >
            {{ t('Map') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            :pressed="transitShowLines"
            pressed-class="active"
            :label="t('Toggle Route Lines')"
            @click="toggleTransitLines"
          >
            {{ t('Lines') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            :label="t('Snap to Transit Vehicle')"
            @click="snapTransitBack"
          >
            {{ t('Snap') }}
          </UiButton>
          <UiButton
            variant="action"
            tone="danger"
            size="compact"
            :label="t('Stop Transit')"
            @click="stopTransit"
          >
            {{ t('Stop') }}
          </UiButton>
        </div>

        <div v-if="transitLineFilters.length > 1" class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            :pressed="transitLineFilter === 'all'"
            pressed-class="active"
            :label="t('All Lines')"
            @click="transitLineFilter = 'all'"
          >
            {{ t('All') }}
          </UiButton>
          <UiButton
            v-for="lf in transitLineFilters"
            :key="lf.id"
            variant="action"
            size="compact"
            :pressed="transitLineFilter === lf.id"
            pressed-class="active"
            :label="lf.label"
            @click="transitLineFilter = lf.id"
          >
            {{ lf.label }}
          </UiButton>
        </div>

        <div class="es-quick-list ui-scroll">
          <div v-if="transitVehicles.length === 0" class="es-muted">
            {{ t('Click Engage to launch live buses and trains.') }}
          </div>
          <div
            v-for="v in transitVehicles"
            :key="v.id"
            class="es-vehicle-card"
            :class="{ 'is-selected': activeTransitVehicleId === v.id }"
          >
            <div class="es-section-head">
              <span class="es-quick-item-title">{{ v.id }}</span>
              <span class="es-muted">
                {{ Math.round((v.speedMs || 0) * 2.23694) }} mph
              </span>
            </div>
            <div class="es-quick-item-sub">
              {{ v.nextStop?.name || v.nextStation?.name || t('In Transit') }} ·
              {{ v.passengers || 0 }}/{{ v.capacity || 100 }}
            </div>
            <div class="es-btn-row">
              <UiButton
                v-for="cam in [
                  { id: 'cab', label: t('Cab') },
                  { id: 'chase', label: t('Chase') },
                  { id: 'door', label: t('Door') },
                  { id: 'heli', label: t('Heli') },
                ]"
                :key="cam.id"
                variant="action"
                size="compact"
                :pressed="
                  activeTransitVehicleId === v.id &&
                  activeTransitCamMode === cam.id
                "
                pressed-class="active"
                :label="`${v.id} ${cam.label}`"
                @click="latchTransitVehicle(v.id, cam.id)"
              >
                {{ cam.label }}
              </UiButton>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="transitSubTab === 'motorman'">
        <div class="es-status-line">
          <strong>{{ motormanState?.speedMph ?? 0 }} MPH</strong> ·
          {{ t('Throttle') }} {{ motormanState?.throttleNotch ?? 0 }} ·
          {{ motormanState?.doorsOpen ? t('Doors Open') : t('Doors Closed') }}
          · {{ motormanState?.currentScore ?? 500 }} pts
        </div>
        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Throttle Up')"
            @click="rt.motormanControls?.throttleUp?.()"
          >
            {{ t('Throttle +') }}
          </UiButton>
          <UiButton
            variant="action"
            tone="danger"
            size="compact"
            class="es-btn-stretch"
            :label="t('Apply Brake')"
            @click="rt.motormanControls?.applyBrake?.()"
          >
            {{ t('Brake') }}
          </UiButton>
        </div>
        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Toggle Doors')"
            @click="rt.motormanControls?.toggleDoors?.()"
          >
            {{ t('Doors') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Sound Horn')"
            @click="rt.motormanControls?.triggerHorn?.()"
          >
            {{ t('Horn') }}
          </UiButton>
        </div>
      </template>

      <template v-else>
        <div class="es-muted">
          {{
            dispatcherAlerts.length === 0
              ? t('Headway nominal across active transit lines.')
              : dispatcherAlerts[0]?.message
          }}
        </div>
        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Hold Station 60s')"
            @click="dispatchTransitOrder('hold')"
          >
            {{ t('Hold 60s') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Run Express')"
            @click="dispatchTransitOrder('express')"
          >
            {{ t('Run Express') }}
          </UiButton>
        </div>
      </template>
    </div>

    <!-- ── TAB 6: FREIGHT ───────────────────────────────────────────────── -->
    <div v-else-if="activeTab === 'freight'" class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('Intermodal Freight') }}</span>
        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            data-mobility-action="start-freight"
            :label="t('Start Freight Convoy')"
            @click="startFreight"
          >
            {{ t('Start') }}
          </UiButton>
          <UiButton
            variant="action"
            tone="danger"
            size="compact"
            :label="t('Stop Freight Convoy')"
            @click="stopFreight"
          >
            {{ t('Stop') }}
          </UiButton>
        </div>
      </div>

      <div v-if="freightLatched" class="es-vehicle-card is-selected">
        <div class="es-quick-item-title">
          {{ freightLatched.manifest?.carrierLivery || t('Freight Carrier') }}
          ({{ freightLatched.id }})
        </div>
        <div class="es-quick-item-sub">
          {{ freightLatched.corridor?.name || '' }}
        </div>
        <div class="es-muted">
          {{
            FREIGHT_STATE_LABELS[freightLatched.transloadState] ||
            freightLatched.transloadState
          }}
          · {{ Math.round(freightLatched.speedMph || 0) }} mph ·
          {{ Math.round(freightLatched.milesRemaining || 0) }} mi
        </div>
      </div>

      <UiSegmented
        v-model="freightSubTab"
        :options="freightSubTabOptions"
        :label="t('Freight view tabs')"
      />

      <template v-if="freightSubTab === 'spectator'">
        <div class="es-btn-row">
          <UiButton
            v-for="cam in freightCamOptions"
            :key="cam.id"
            variant="action"
            size="compact"
            :data-freight-cam="cam.id"
            :pressed="freightCameraMode === cam.id"
            pressed-class="active"
            :label="t(cam.label)"
            @click="setFreightCamera(cam.id)"
          >
            {{ t(cam.label) }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            :pressed="freightAudioUnmuted"
            pressed-class="active"
            :label="t('Toggle Freight Audio')"
            @click="toggleFreightAudio"
          >
            {{ freightAudioUnmuted ? t('Audio On') : t('Audio Off') }}
          </UiButton>
        </div>

        <div class="es-quick-list ui-scroll">
          <div v-if="freightTrucks.length === 0" class="es-muted">
            {{ t('Click Start to launch transcontinental freight convoys.') }}
          </div>
          <div
            v-for="trk in freightTrucks"
            :key="trk.id"
            class="es-quick-item"
            :class="{ 'is-selected': freightLatched?.id === trk.id }"
          >
            <div class="es-quick-item-meta">
              <span class="es-quick-item-title">
                {{ trk.id }} · {{ trk.manifest?.carrierLivery || '' }}
              </span>
              <span class="es-quick-item-sub">
                {{ trk.corridor?.name || '' }} ·
                {{ Math.round(trk.speedMph || 0) }} mph
              </span>
            </div>
            <UiButton
              variant="action"
              size="compact"
              :pressed="freightLatched?.id === trk.id"
              pressed-class="active"
              :label="`${t('Track')} ${trk.id}`"
              @click="selectFreightTruck(trk.id)"
            >
              {{ t('Track') }}
            </UiButton>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Fast Transload')"
            @click="triggerFreightAction('fast-transload')"
          >
            {{ t('Fast Transload') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            class="es-btn-stretch"
            :label="t('Weather Detour')"
            @click="triggerFreightAction('weather-detour')"
          >
            {{ t('Weather Detour') }}
          </UiButton>
        </div>
      </template>
    </div>

    <!-- ── TAB 7: CORRIDORS (CONNECT PLACES) ────────────────────────────── -->
    <div v-else class="es-section">
      <div class="es-section-head">
        <span class="es-section-title">{{ t('Connect Places') }}</span>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Browse Corridors')"
          @click="store.openExplorer({ chips: ['corridors'] })"
        >
          <UiIcon name="travel_explore" :size="null" />
        </UiButton>
      </div>

      <SearchablePlacePicker
        v-model="corridorFrom"
        picker-id="corridor-origin"
        :label="t('Origin (A)')"
        :placeholder="t('City, estate, ICAO, or lat, lon...')"
        :options="corridorPlaceOptions"
        allow-custom-text
      />

      <div class="es-btn-row">
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Use Camera for Origin')"
          @click="setCorridorFromCamera('from')"
        >
          <UiIcon name="my_location" :size="null" />
          <span>{{ t('Origin = Camera') }}</span>
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Swap Origin and Destination')"
          @click="swapCorridorEndpoints"
        >
          {{ t('Swap') }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Use Camera for Destination')"
          @click="setCorridorFromCamera('to')"
        >
          <UiIcon name="my_location" :size="null" />
          <span>{{ t('Dest = Camera') }}</span>
        </UiButton>
      </div>

      <SearchablePlacePicker
        v-model="corridorTo"
        picker-id="corridor-dest"
        :label="t('Destination (B)')"
        :placeholder="t('City, estate, ICAO, or lat, lon...')"
        :options="corridorPlaceOptions"
        allow-custom-text
      />

      <div class="es-btn-row">
        <UiButton
          v-for="p in CORRIDOR_PRESETS"
          :key="p.label"
          variant="ghost"
          size="compact"
          :label="p.label"
          @click="runConnectPlaces(p.from, p.to)"
        >
          {{ p.label }}
        </UiButton>
      </div>

      <div class="es-btn-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch"
          data-mobility-action="connect-places"
          :label="t('Connect Places')"
          @click="runConnectPlaces()"
        >
          <UiIcon name="timeline" :size="null" />
          <span>{{ t('Connect Places') }}</span>
        </UiButton>
        <UiButton
          v-if="corridorState?.relationship"
          variant="action"
          size="compact"
          :label="t('Reframe Corridor')"
          @click="reframeCorridor"
        >
          {{ t('Reframe') }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="compact"
          :label="t('Clear Corridor')"
          @click="clearCorridor"
        >
          {{ t('Clear') }}
        </UiButton>
      </div>

      <div v-if="corridorState?.statusMessage" class="es-muted">
        {{ corridorState.statusMessage }}
      </div>

      <div v-if="corridorState?.relationship" class="es-vehicle-card">
        <div class="es-quick-item-title">
          {{ corridorState.relationship.origin?.name }} →
          {{ corridorState.relationship.destination?.name }}
        </div>
        <div class="es-quick-item-sub">
          {{ Math.round(corridorState.relationship.greatCircleKm || 0) }} km ·
          {{ corridorState.relationship.initialBearingDeg }}°
          {{ corridorState.relationship.initialCardinal }} ·
          {{ corridorState.relationship.solarDeltaLabel }}
        </div>
        <div
          v-if="corridorState.modes?.modes?.length"
          class="es-quick-list ui-scroll"
        >
          <div
            v-for="mode in corridorState.modes.modes"
            :key="mode.id"
            class="es-quick-item"
          >
            <div class="es-quick-item-meta">
              <span class="es-quick-item-title">{{ mode.label }}</span>
              <span class="es-quick-item-sub">
                {{ mode.badge }} · {{ mode.etaLabel || 'N/A' }}
              </span>
            </div>
            <UiButton
              variant="action"
              size="compact"
              :disabled="!mode.feasible"
              :label="`${t('Launch')} ${mode.label}`"
              @click="launchCorridorMode(mode.id)"
            >
              {{ t('Launch') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
