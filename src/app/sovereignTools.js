import * as Cesium from 'cesium';
import { initAgentBridge } from '../agent/agentBridge.js';
import { createSightseeingEngine } from '../discovery/sightseeingEngine.js';
import { createSyntheticFlightEngine } from '../flight/syntheticFlightEngine.js';
import { createFlightDrawer } from '../flight/flightDrawer.js';
import { createCompositeTravelEngine } from '../flight/compositeTravelEngine.js';
import { createRailwayEngine } from '../layers/transit/railwayEngine.js';
import { createRailDrawer } from '../transit/railDrawer.js';
import { createDriveEngine } from '../layers/drive/driveEngine.js';
import { createDriveDrawer } from '../drive/driveDrawer.js';
import { createBoatEngine } from '../layers/vessels/boatEngine.js';
import { createBoatDrawer } from '../vessels/boatDrawer.js';
import { createPedestrianEngine } from '../layers/citylife/pedestrianEngine.js';
import { createAvatarWanderEngine } from '../layers/citylife/avatarWanderEngine.js';
import {
  addTourStop,
  createCustomTour,
  createTourAndPlayEngine,
  resolveTourOrPlayContext,
} from '../layers/citylife/tourAndPlayEngine.js';
import { createTourPoiCards } from '../layers/citylife/tourPoiCards.js';
import { createParkAdventureController } from '../layers/citylife/parkSecretsAndNpcs.js';
import { createParkFireworksFinale } from '../layers/citylife/parkFireworksFinale.js';
import { createWanderDrawer } from '../citylife/wanderDrawer.js';
import { createCityDrawer } from '../citylife/cityDrawer.js';
import { createSelfModifyingAgentPanel } from '../ui/selfModifyingAgentPanel.js';
import { createEarthSimTourOverlay } from '../ui/earthSimTourOverlay.js';
import { createSyntheticBusEngine } from '../layers/citylife/syntheticBusEngine.js';
import { createSyntheticMetroEngine } from '../layers/citylife/syntheticMetroEngine.js';
import { createPassengerFlow } from '../layers/citylife/passengerFlow.js';
import { createMotormanControls } from '../citylife/motormanControls.js';
import { createTransitControllerDrawer } from '../citylife/transitControllerDrawer.js';
import { createFreightSimEngine } from '../layers/freight/freightSimEngine.js';
import { createFreightLogisticsDrawer } from '../citylife/freightLogisticsDrawer.js';
import { createPropertyClaimScout } from '../layers/estates/propertyClaimScout.js';
import { createPersonalFleetEngine } from '../layers/estates/personalFleetEngine.js';
import { createProceduralEstateAudio } from '../layers/estates/proceduralEstateAudio.js';
import { createEstateDrawer } from '../citylife/estateDrawer.js';
import { createWildernessDrawer } from '../citylife/wildernessDrawer.js';
import { createSandboxDrawer } from '../citylife/sandboxDrawer.js';
import { createProceduralCampfireAudio } from '../layers/wilderness/proceduralCampfireAudio.js';
import { createWorldSandboxEngine } from '../layers/sandbox/worldSandboxEngine.js';
import { createCorridorVisualizer } from '../corridor/corridorVisualizer.js';
import { createCorridorDrawer } from '../corridor/corridorDrawer.js';
import { checkInTempBasecamp } from '../layers/estates/domicileCatalog.js';
import { pickActiveGroundPosition } from '../layers/citylife/surfaceHeight.js';
import { msg } from '../i18n/index.js';
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { applicationPinia, createUiRuntime } from '../ui/vueRuntime.js';
import { useSovereignUiStore } from '../ui/stores/sovereignUi.js';
import SovereignUiRoot from '../ui/sovereign/SovereignUiRoot.vue';
import {
  butterGoogle3DTiles,
  cancelGoogle3DTilesButter,
  getTilesetButterState,
} from '../ui/sovereign/tilesetButter.js';
import '../ui/styles/sovereign-ui.css';

/**
 * Attach Cesium-backed Living World, Transit, Flight, Rail, Drive, Boat,
 * Freight, Estates, Wilderness, Sandbox, Corridor, and AGY Forge tools.
 * Dynamically loaded by `src/app/tools.js` only when a real Cesium Viewer is
 * active, keeping stub-renderer startup (`qa:stub-boot`) 100% Cesium-free.
 */
export function attachSovereignTools({
  cesiumViewer,
  viewer,
  dataManager,
  operations,
  styleManager,
  voiceCommands,
  placeSearch,
  signal,
  defer,
  debug,
}) {
  let tourAndPlayEngine = null;
  const sightseeingEngine = createSightseeingEngine({
    viewer: cesiumViewer,
    dataManager,
    operations,
    isAmbientDwellSuppressed: () =>
      Boolean(tourAndPlayEngine?.getStatus?.()?.isTour),
  });
  defer(() => sightseeingEngine.destroy());
  debug.sightseeingEngine = sightseeingEngine;
  window.__gevSightseeing = sightseeingEngine;

  const flightEngine = createSyntheticFlightEngine({
    viewer: cesiumViewer,
    operations,
    cockpitController: window.__gevCockpit || null,
  });
  defer(() => flightEngine.destroy());
  debug.flightEngine = flightEngine;
  window.__gevFlightEngine = flightEngine;

  const railwayEngine = createRailwayEngine({
    viewer: cesiumViewer,
    operations,
  });
  defer(() => railwayEngine.destroy());
  debug.railwayEngine = railwayEngine;
  window.__gevRailEngine = railwayEngine;

  const driveEngine = createDriveEngine({
    viewer: cesiumViewer,
    operations,
    trafficLayer: dataManager.layers.get('traffic')?.module,
  });
  defer(() => driveEngine.destroy());
  debug.driveEngine = driveEngine;
  window.__gevDriveEngine = driveEngine;

  const boatEngine = createBoatEngine({
    viewer: cesiumViewer,
    operations,
  });
  defer(() => boatEngine.destroy());
  debug.boatEngine = boatEngine;
  window.__gevBoatEngine = boatEngine;

  const cityEngine = createPedestrianEngine({
    viewer: cesiumViewer,
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => cityEngine.destroy());
  debug.cityEngine = cityEngine;
  window.__gevCityEngine = cityEngine;
  window.__gevViewer = cesiumViewer;

  let corridorDrawer = null;
  const agentBridge = initAgentBridge({
    runner: (name, args) => voiceCommands.runner(name, args, { signal }),
    operations,
    viewer: cesiumViewer,
    styleManager,
    sightseeingEngine,
    flightEngine,
    railwayEngine,
    driveEngine,
    boatEngine,
    cityEngine,
    getCorridorDrawer: () => corridorDrawer,
  });
  defer(() => agentBridge.destroy());
  debug.agentBridge = agentBridge;

  const flightDrawer = createFlightDrawer({
    flightEngine,
  });
  defer(() => flightDrawer.destroy());
  debug.flightDrawer = flightDrawer;

  const railDrawer = createRailDrawer({
    railwayEngine,
  });
  defer(() => railDrawer.destroy());
  debug.railDrawer = railDrawer;
  window.__gevRailDrawer = railDrawer;

  const driveDrawer = createDriveDrawer({
    driveEngine,
  });
  defer(() => driveDrawer.destroy());
  debug.driveDrawer = driveDrawer;
  window.__gevDriveDrawer = driveDrawer;

  const boatDrawer = createBoatDrawer({
    boatEngine,
  });
  defer(() => boatDrawer.destroy());
  debug.boatDrawer = boatDrawer;
  window.__gevBoatDrawer = boatDrawer;

  const wanderEngine = createAvatarWanderEngine({
    viewer: cesiumViewer,
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => wanderEngine.destroy());
  debug.wanderEngine = wanderEngine;
  window.__gevWanderEngine = wanderEngine;

  tourAndPlayEngine = createTourAndPlayEngine({
    wanderEngine,
    cityEngine,
    viewer: cesiumViewer,
  });
  defer(() => tourAndPlayEngine.destroy());
  debug.tourAndPlayEngine = tourAndPlayEngine;
  window.__gevTourAndPlayEngine = tourAndPlayEngine;

  let wasTourActive = false;
  const unsubTourSightseeingGuard = tourAndPlayEngine.onStatusChange?.(
    (nextStatus) => {
      const activeTour = Boolean(nextStatus?.isTour);
      if (activeTour && !wasTourActive) {
        sightseeingEngine.clearBillboards?.();
      }
      wasTourActive = activeTour;
    },
  );
  defer(() => unsubTourSightseeingGuard?.());

  const tourPoiCards = createTourPoiCards({
    viewer: cesiumViewer,
    tourAndPlayEngine,
    sightseeingDrawer: sightseeingEngine?.getDrawer?.() || null,
  });
  defer(() => tourPoiCards.destroy());
  debug.tourPoiCards = tourPoiCards;
  window.__gevTourPoiCards = tourPoiCards;

  const parkAdventures = createParkAdventureController({
    viewer: cesiumViewer,
    tourAndPlayEngine,
    wanderEngine,
  });
  defer(() => parkAdventures.destroy());
  debug.parkAdventures = parkAdventures;
  window.__gevParkAdventures = parkAdventures;

  const parkFireworks = createParkFireworksFinale({
    viewer: cesiumViewer,
    tourAndPlayEngine,
  });
  defer(() => parkFireworks.destroy());
  debug.parkFireworks = parkFireworks;
  window.__gevParkFireworks = parkFireworks;

  const agentForgePanel = createSelfModifyingAgentPanel({
    viewer,
    container: typeof document !== 'undefined' ? document.body : null,
    mountLauncher: false,
  });
  defer(() => agentForgePanel.destroy());
  debug.agentForgePanel = agentForgePanel;
  window.__gevAgentForgePanel = agentForgePanel;

  const wanderDrawer = createWanderDrawer({
    wanderEngine,
    cityEngine,
    tourAndPlayEngine,
    tourPoiCards,
    parkAdventures,
    parkFireworks,
    agentForgePanel,
    railwayEngine,
    railDrawer,
    viewer: cesiumViewer,
  });
  defer(() => wanderDrawer.destroy());
  debug.wanderDrawer = wanderDrawer;
  window.__gevWanderDrawer = wanderDrawer;

  const cityDrawer = createCityDrawer({
    cityEngine,
    wanderEngine,
    tourAndPlayEngine,
    agentForgePanel,
    viewer: cesiumViewer,
  });
  defer(() => cityDrawer.destroy());
  debug.cityDrawer = cityDrawer;
  window.__gevCityDrawer = cityDrawer;

  const passengerFlow = createPassengerFlow({ viewer: cesiumViewer });
  defer(() => passengerFlow.clearStops());
  debug.passengerFlow = passengerFlow;
  window.__gevPassengerFlow = passengerFlow;

  const busEngine = createSyntheticBusEngine({
    viewer: cesiumViewer,
    passengerFlow,
  });
  defer(() => busEngine.destroy());
  debug.busEngine = busEngine;
  window.__gevBusEngine = busEngine;

  const metroEngine = createSyntheticMetroEngine({
    viewer: cesiumViewer,
    passengerFlow,
  });
  defer(() => metroEngine.destroy());
  debug.metroEngine = metroEngine;
  window.__gevMetroEngine = metroEngine;

  const motormanControls = createMotormanControls();
  defer(() => motormanControls.destroy());
  debug.motormanControls = motormanControls;
  window.__gevMotormanControls = motormanControls;

  const transitDrawer = createTransitControllerDrawer({
    busEngine,
    metroEngine,
    passengerFlow,
    motormanControls,
  });
  defer(() => transitDrawer.destroy());
  debug.transitDrawer = transitDrawer;
  window.__gevTransitDrawer = transitDrawer;

  const freightEngine = createFreightSimEngine({ viewer: cesiumViewer });
  defer(() => freightEngine.destroy());
  debug.freightEngine = freightEngine;
  window.__gevFreightEngine = freightEngine;

  const freightDrawer = createFreightLogisticsDrawer({
    freightEngine,
    viewer: cesiumViewer,
  });
  defer(() => freightDrawer.destroy());
  debug.freightDrawer = freightDrawer;
  window.__gevFreightDrawer = freightDrawer;

  const estateAudio = createProceduralEstateAudio();
  defer(() => estateAudio.destroy());

  const claimScout = createPropertyClaimScout({ viewer: cesiumViewer });
  defer(() => claimScout.destroy());
  debug.claimScout = claimScout;
  window.__gevClaimScout = claimScout;

  const fleetEngine = createPersonalFleetEngine({
    viewer: cesiumViewer,
    audioEngine: estateAudio,
    claimScout,
  });
  defer(() => fleetEngine.destroy());
  debug.fleetEngine = fleetEngine;
  window.__gevFleetEngine = fleetEngine;

  const estateDrawer = createEstateDrawer({
    claimScout,
    fleetEngine,
    audioEngine: estateAudio,
    viewer: cesiumViewer,
  });
  defer(() => estateDrawer.destroy());
  debug.estateDrawer = estateDrawer;
  window.__gevEstateDrawer = estateDrawer;

  const compositeTravel = createCompositeTravelEngine({
    viewer: cesiumViewer,
    flightEngine,
    driveEngine,
    fleetEngine,
  });
  debug.compositeTravel = compositeTravel;
  window.__gevCompositeTravel = compositeTravel;

  const wildernessAudio = createProceduralCampfireAudio();
  defer(() => wildernessAudio.destroy());
  debug.wildernessAudio = wildernessAudio;

  const wildernessDrawer = createWildernessDrawer({
    viewer: cesiumViewer,
    audioEngine: wildernessAudio,
  });
  defer(() => wildernessDrawer.destroy());
  debug.wildernessDrawer = wildernessDrawer;
  window.__gevWildernessDrawer = wildernessDrawer;

  const sandboxEngine = createWorldSandboxEngine({
    viewer: cesiumViewer,
  });
  defer(() => sandboxEngine.destroy());
  debug.sandboxEngine = sandboxEngine;
  window.__gevSandboxEngine = sandboxEngine;

  const sandboxDrawer = createSandboxDrawer({
    viewer: cesiumViewer,
    sandboxEngine,
  });
  defer(() => sandboxDrawer.destroy());
  debug.sandboxDrawer = sandboxDrawer;
  window.__gevSandboxDrawer = sandboxDrawer;

  const corridorVisualizer = createCorridorVisualizer({ viewer: cesiumViewer });
  defer(() => corridorVisualizer.destroy());
  debug.corridorVisualizer = corridorVisualizer;

  corridorDrawer = createCorridorDrawer({
    viewer: cesiumViewer,
    visualizer: corridorVisualizer,
    driveEngine,
    flightEngine,
    railwayEngine,
    boatEngine,
    placeSearch,
  });
  defer(() => corridorDrawer.destroy());
  debug.corridorDrawer = corridorDrawer;
  window.__gevCorridorDrawer = corridorDrawer;

  const sovereignUiStore = useSovereignUiStore(applicationPinia());
  const coordinator = getGlobalDrawerCoordinator();

  const WANDER_CAMERA_OPTIONS = Object.freeze([
    { id: 'first_person', label: msg('1st Person') },
    { id: 'iso_chase', label: msg('Chase') },
    { id: 'heli', label: msg('Heli') },
    { id: 'overview', label: msg('Overview') },
    { id: 'free', label: msg('Free') },
  ]);
  const CITY_CAMERA_OPTIONS = Object.freeze([
    { id: 'companion', label: msg('Companion') },
    { id: 'flaneur', label: msg('Flaneur') },
    { id: 'balcony', label: msg('Balcony') },
    { id: 'overview', label: msg('Overview') },
    { id: 'free', label: msg('Free') },
  ]);
  const FLEET_CAMERA_OPTIONS = Object.freeze([
    { id: 'first_person', label: msg('1st Person') },
    { id: 'chase', label: msg('Chase') },
    { id: 'overview', label: msg('Overview') },
    { id: 'free', label: msg('Free') },
  ]);

  function getCameraGroundTarget() {
    const camPos = cityEngine?.getCurrentCameraGroundPosition?.();
    if (camPos && Number.isFinite(camPos.lat) && Number.isFinite(camPos.lon)) {
      const headingDeg = Number.isFinite(cesiumViewer?.camera?.heading)
        ? ((Cesium.Math.toDegrees(cesiumViewer.camera.heading) % 360) + 360) %
          360
        : 0;
      return {
        lat: camPos.lat,
        lon: camPos.lon,
        elev: Number.isFinite(camPos.elev) ? camPos.elev : null,
        heading: headingDeg,
      };
    }
    try {
      const canvas = cesiumViewer?.scene?.canvas;
      if (canvas?.clientWidth && canvas?.clientHeight) {
        const picked = pickActiveGroundPosition(
          cesiumViewer,
          new Cesium.Cartesian2(
            canvas.clientWidth / 2,
            canvas.clientHeight / 2,
          ),
        );
        if (picked) {
          const carto = Cesium.Cartographic.fromCartesian(picked);
          return {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lon: Cesium.Math.toDegrees(carto.longitude),
            elev: Number.isFinite(carto.height) ? carto.height : null,
            heading: 0,
          };
        }
      }
      const posCarto = cesiumViewer?.camera?.positionCartographic;
      if (posCarto) {
        return {
          lat: Cesium.Math.toDegrees(posCarto.latitude),
          lon: Cesium.Math.toDegrees(posCarto.longitude),
          elev: 0,
          heading: 0,
        };
      }
    } catch {
      /* fallback */
    }
    return { lat: 33.7749, lon: -84.3725, elev: 290, heading: 0 };
  }

  function flyToCoords(
    lat,
    lon,
    heightM = 950,
    {
      headingDeg = 0,
      pitchDeg = -42,
      duration = 1.4,
      reason = 'sovereign-flyto',
    } = {},
  ) {
    if (
      !cesiumViewer?.camera ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return;
    }
    try {
      cesiumViewer.camera.cancelFlight?.();
      cesiumViewer.camera.lookAtTransform?.(Cesium.Matrix4.IDENTITY);
      cesiumViewer.camera.flyTo?.({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
        orientation: {
          heading: Cesium.Math.toRadians(headingDeg),
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
        duration,
      });
    } catch {
      /* ignore headless mock errors */
    }
    butterGoogle3DTiles(cesiumViewer, reason, { maxMs: 2600 });
  }

  function syncActiveSimSnapshot(preferredKind = null) {
    const tourSt = tourAndPlayEngine?.getStatus?.();
    if ((preferredKind === 'tour' || !preferredKind) && tourSt?.isActive) {
      sovereignUiStore.setActiveSim({
        kind: 'tour',
        title: tourSt.cityName || msg('Earth Sim Tour'),
        subtitle: tourSt.currentLandmark?.name || tourSt.activity?.label || '',
        speedLabel: tourSt.effectiveTransitMode || '',
        cameraMode: wanderEngine?.getCameraMode?.() || 'iso_chase',
        cameraModes: WANDER_CAMERA_OPTIONS,
        canStep: Boolean(tourSt.isTour && tourSt.totalLandmarks > 1),
        canResume: Boolean(tourSt.canResume),
      });
      return;
    }
    if (
      (preferredKind === 'wander' || !preferredKind) &&
      wanderEngine?.isWandering
    ) {
      const tel = wanderEngine.getTelemetry?.() || {};
      sovereignUiStore.setActiveSim({
        kind: 'wander',
        title: msg('Ground Wander'),
        subtitle: tel.shortHudLocation || tel.locationLabel || '',
        speedLabel: `${Number(tel.speedMph || 0).toFixed(1)} mph`,
        cameraMode: wanderEngine.getCameraMode?.() || 'iso_chase',
        cameraModes: WANDER_CAMERA_OPTIONS,
        canStep: false,
        canResume: false,
      });
      return;
    }
    if (
      (preferredKind === 'city' || !preferredKind) &&
      cityEngine?.isSimActive?.()
    ) {
      const tel = cityEngine.getActiveTelemetry?.() || {};
      sovereignUiStore.setActiveSim({
        kind: 'city',
        title:
          tel.cityName ||
          cityEngine.getActiveCity?.()?.name ||
          msg('Living City'),
        subtitle: tel.personaName || '',
        speedLabel: '',
        cameraMode: cityEngine.getCameraMode?.() || 'companion',
        cameraModes: CITY_CAMERA_OPTIONS,
        canStep: true,
        canResume: false,
      });
      return;
    }
    if (
      (preferredKind === 'estate' || !preferredKind) &&
      fleetEngine?.isActive
    ) {
      const tel = fleetEngine.getActiveTelemetry?.() || {};
      sovereignUiStore.setActiveSim({
        kind: 'estate',
        title: tel.activeDomicileTitle || msg('Personal Fleet'),
        subtitle: tel.shortModeName || tel.modeName || '',
        speedLabel: `${Number(tel.speedMph || 0).toFixed(1)} mph`,
        cameraMode: fleetEngine.getCameraMode?.() || 'chase',
        cameraModes: FLEET_CAMERA_OPTIONS,
        canStep: false,
        canResume: false,
      });
      return;
    }
    if (!preferredKind) {
      sovereignUiStore.setActiveSim(null);
    }
  }

  function launchExperience(item) {
    if (!item?.launch) return;
    const { kind } = item.launch;
    if (kind === 'tour' || kind === 'resort') {
      if (kind === 'resort') {
        checkInTempBasecamp({
          resortId: item.launch.cityId,
          title: item.title,
          lat: item.lat,
          lon: item.lon,
          elev: item.elev || 26,
        });
      }
      tourAndPlayEngine?.startCityTour?.({
        cityId: item.launch.cityId,
        tourMode: item.launch.tourMode || 'all',
      });
      butterGoogle3DTiles(cesiumViewer, `exp-launch-${item.launch.cityId}`, {
        maxMs: 2800,
      });
      syncActiveSimSnapshot('tour');
    } else if (kind === 'city') {
      cityEngine?.stepIntoCity?.(item.launch.cityId);
      butterGoogle3DTiles(cesiumViewer, `exp-city-${item.launch.cityId}`, {
        maxMs: 2800,
      });
      syncActiveSimSnapshot('city');
    } else if (kind === 'wilderness') {
      wildernessDrawer?.selectTrailhead?.(item.launch.trailheadId);
      butterGoogle3DTiles(
        cesiumViewer,
        `exp-trail-${item.launch.trailheadId}`,
        {
          maxMs: 2800,
        },
      );
    } else if (kind === 'domicile') {
      fleetEngine?.spawnAtDomicile?.(item.launch.domicileId);
      fleetEngine?.setCameraMode?.('chase');
      flyToCoords(item.lat, item.lon, (item.elev || 20) + 120, {
        pitchDeg: -38,
        duration: 1.4,
        reason: `exp-domicile-${item.launch.domicileId}`,
      });
      syncActiveSimSnapshot('estate');
    }
  }

  function addQuickCustomStop({ name, lore }) {
    const pos = getCameraGroundTarget();
    const ctx = resolveTourOrPlayContext(pos.lat, pos.lon);
    const stop = {
      name,
      lat: pos.lat,
      lon: pos.lon,
      elev: pos.elev || 20,
      category: 'Custom Landmark',
      lore,
      companionNote: `Custom pinned stop: ${name}`,
    };
    if (ctx?.cityId && ctx.hasExistingTour) {
      return Boolean(addTourStop(ctx.cityId, stop)?.ok);
    }
    return Boolean(
      createCustomTour({
        tour: {
          name: `${name} Walk`,
          country: 'USA',
          centerLat: pos.lat,
          centerLon: pos.lon,
        },
        firstStop: stop,
      })?.ok,
    );
  }

  sovereignUiStore.connectRuntime({
    coordinator,
    viewer: cesiumViewer,
    styleManager,
    wanderEngine,
    tourAndPlayEngine,
    cityEngine,
    fleetEngine,
    claimScout,
    estateAudio,
    wildernessAudio,
    wildernessDrawer,
    parkAdventures,
    parkFireworks,
    tourPoiCards,
    agentForgePanel,
    railwayEngine,
    railDrawer,
    driveEngine,
    flightEngine,
    boatEngine,
    busEngine,
    metroEngine,
    freightEngine,
    sandboxEngine,
    corridorDrawer,
    flyToCoords,
    getCameraGroundTarget,
    launchExperience,
    syncActiveSimSnapshot,
    addQuickCustomStop,
  });

  const unsubTourHud = tourAndPlayEngine.onStatusChange?.((st) => {
    if (st?.isActive) syncActiveSimSnapshot('tour');
    else if (wanderEngine?.isWandering) syncActiveSimSnapshot('wander');
    else sovereignUiStore.clearActiveSim('tour');
    sovereignUiStore.bumpTelemetry();
  });
  const unsubWanderCam = wanderEngine.onCameraModeChange?.((mode) => {
    sovereignUiStore.patchActiveSimCameraMode(mode);
    sovereignUiStore.bumpTelemetry();
  });
  const unsubCityCam = cityEngine.onCameraModeChange?.((mode) => {
    sovereignUiStore.patchActiveSimCameraMode(mode, { kind: 'city' });
    sovereignUiStore.bumpTelemetry();
  });
  const unsubFleetCam = fleetEngine.onCameraModeChange?.((mode) => {
    sovereignUiStore.patchActiveSimCameraMode(mode, { kind: 'estate' });
    sovereignUiStore.bumpTelemetry();
  });
  const unsubSimState = coordinator.onSimulationStateChange?.((evt) => {
    if (evt?.type === 'stopped') {
      syncActiveSimSnapshot(null);
    } else if (evt?.type === 'started') {
      syncActiveSimSnapshot(evt.id);
    }
    sovereignUiStore.bumpTelemetry();
  });

  const sovereignUiRuntime = createUiRuntime({ pinia: applicationPinia() });
  let sovereignHostEl = null;
  let unmountSovereignRoot = null;
  if (typeof document !== 'undefined' && document.body) {
    sovereignHostEl = document.createElement('div');
    sovereignHostEl.id = 'gev-sovereign-host';
    document.body.appendChild(sovereignHostEl);
    unmountSovereignRoot = sovereignUiRuntime.mount(
      SovereignUiRoot,
      sovereignHostEl,
    );
  }
  defer(() => {
    unsubTourHud?.();
    unsubWanderCam?.();
    unsubCityCam?.();
    unsubFleetCam?.();
    unsubSimState?.();
    cancelGoogle3DTilesButter();
    unmountSovereignRoot?.();
    sovereignUiRuntime.destroy();
    sovereignHostEl?.remove?.();
    sovereignUiStore.disconnectRuntime();
    if (window.__gevSovereignUiStore === sovereignUiStore) {
      delete window.__gevSovereignUiStore;
    }
    if (window.__gevTilesetButter) {
      delete window.__gevTilesetButter;
    }
  });
  debug.sovereignUiStore = sovereignUiStore;
  window.__gevSovereignUiStore = sovereignUiStore;
  window.__gevTilesetButter = {
    butterGoogle3DTiles: (reason, opts) =>
      butterGoogle3DTiles(cesiumViewer, reason, opts),
    getTilesetButterState,
  };

  const earthSimIntro = createEarthSimTourOverlay({
    coordinator,
    agentPanel: agentForgePanel,
  });
  defer(() => earthSimIntro.destroy());
  debug.earthSimIntro = earthSimIntro;
  window.__gevEarthSimIntro = earthSimIntro;

  return {
    agentBridge,
    sightseeingEngine,
    flightEngine,
    railwayEngine,
    driveEngine,
    boatEngine,
    cityEngine,
    wanderEngine,
    tourAndPlayEngine,
    wanderDrawer,
    agentForgePanel,
    busEngine,
    metroEngine,
    passengerFlow,
    motormanControls,
    transitDrawer,
    freightEngine,
    freightDrawer,
    claimScout,
    fleetEngine,
    estateDrawer,
    estateAudio,
    wildernessDrawer,
    wildernessAudio,
    sandboxEngine,
    sandboxDrawer,
    corridorVisualizer,
    corridorDrawer,
  };
}
