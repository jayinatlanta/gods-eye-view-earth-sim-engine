import { SceneDirector } from '../scenes/director.js';
import { initAnnotations } from '../annotations/index.js';
import { initDrawTool } from '../annotations/drawTool.js';
import {
  claimPointer,
  isPointerFree,
  releasePointer,
} from '../data/inputOwnership.js';
import { initGeoFileImport } from '../ui/geoFileImport.js';
import { useDisplayStore } from '../ui/stores/display.js';
import { applicationPinia } from '../ui/vueRuntime.js';
import { initImageryBoxTool } from '../ui/imageryBoxTool.js';
import { createRecentImageryPanel } from '../ui/recentImagery.js';
import { createDataLibrary } from '../library/controller.js';
import { flyToLibraryExtent } from '../library/camera.js';
import { createLibraryBrowser } from '../ui/libraryBrowser.js';
import { useDataLibraryStore } from '../ui/stores/dataLibrary.js';
import { localGeoJsonServices } from './localGeojsonServices.js';
import { initGevVoiceCommands } from '../voice/gevRealtime.js';
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
import { createTourAndPlayEngine } from '../layers/citylife/tourAndPlayEngine.js';
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
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';
import { installViews, isEmbeddedInline } from './embed.js';
import {
  installScopeMask,
  destroyScopeMask,
  isScopeMaskEnabled,
} from '../scopeMask.js';
import { KEYHOLE_OUTER_RADIUS } from '../celestialRing.js';
import { installGlobeInViewRecovery } from './viewer.js';
import { installLayerReleaseTrim } from '../sceneCommandRelease.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';

/** Attach scene tools, rendering listeners and the application debug handle. */
export function createApplicationTools({
  scene,
  controls,
  data,
  loadingScreen,
  placeSearch,
  voice = {},
  startChrome,
  onSceneDirector,
  sceneDataPacks,
  drawMarkActions = [],
  signal,
  defer,
}) {
  const { viewer, tileset, mapStackController, operations } = scene;
  const { styleManager, weatherEffects, cockpitCloudEffects } = controls;
  const { dataManager } = data;
  const sceneDirector = new SceneDirector(viewer, styleManager, dataManager, {
    dataPacks: sceneDataPacks,
    isMapStackAvailable: (id) =>
      mapStackController?.isStackAvailable(id) === true,
  });
  dataManager.layers
    .get('bhote-koshi-2026')
    ?.module.attachSceneController(sceneDirector);
  defer(() => sceneDirector.destroy());
  defer(
    installGlobeInViewRecovery(viewer, {
      // The scope mask hides everything outside its keyhole.
      keyholeRadius: () => (isScopeMaskEnabled() ? KEYHOLE_OUTER_RADIUS : 0),
      // An authored scene frames its own shots, holds included.
      paused: () => sceneDirector.running,
    }),
  );
  onSceneDirector?.(sceneDirector);
  const annotations = initAnnotations({
    viewer,
    tileset,
    placeSearch,
    resolver: operations.annotationResolver,
  });
  defer(() => {
    if (window.__gevAnnotations === annotations) delete window.__gevAnnotations;
    annotations.destroy();
  });
  const displayStore = useDisplayStore(applicationPinia());
  // The Display panel's controls answer through the store; returns the
  // disconnect.
  const connectDisplay = (actions) => {
    const token = displayStore.connect(actions);
    return () => displayStore.detach(token);
  };
  // UTILITIES ▸ Draw: the same whiteboard, drawn by hand. It claims the pointer
  // while a session is open, so its teardown belongs to the application
  // lifetime rather than to whoever last pressed the button. A row's fly-to
  // goes through the shell's navigation policy, as Import's does.
  // `drawMarkActions` are an application's own buttons on a drawn area's or
  // line's row (annotations/drawMarks.js); the standalone shell adds none.
  const drawTool = initDrawTool({
    viewer,
    annotations,
    navigation: styleManager,
    publish: (view) => displayStore.publishDraw(view),
    connect: connectDisplay,
    markActions: drawMarkActions,
  });
  defer(() => drawTool?.destroy());
  // UTILITIES ▸ Import: the person's own GeoJSON/KML/KMZ/GPX files, each its
  // own data source. They live for the page session, so the application
  // lifetime removes them and the drop listeners on the viewer container.
  const geoFileImport = initGeoFileImport({
    viewer,
    navigation: styleManager,
    ground: operations.surface?.groundFloor,
    subscribeMapSource: (listener) => mapStackController?.subscribe?.(listener),
    publish: (view) => displayStore.publishGeoImport(view),
    connect: connectDisplay,
  });
  defer(() => geoFileImport?.destroy());
  // DATA ▸ Library: entries register their layers only when a viewer adds
  // them, after the core catalog is sealed. The browser dialog and the
  // controller share the application lifetime.
  const dataLibrary = createDataLibrary({
    dataManager,
    services: localGeoJsonServices,
    getTileset: () => tileset,
    mapStackController,
    shareLink: styleManager.shareLinkManager,
    requestRender: governorRequestRender,
    // Zoom to layer: an immediate navigation, so Cockpit can refuse it and
    // the current follow owner is released first (as for imported files).
    zoomTo: (extent) =>
      styleManager.runImmediateNavigation('layer', () =>
        flyToLibraryExtent(viewer, extent),
      ) !== false,
  });
  defer(() => dataLibrary.destroy());
  // Browse: the owner presents the dialog through the store; LayerPanelsView
  // draws the Browse button and the dialog from it.
  const libraryStore = useDataLibraryStore(applicationPinia());
  const libraryBrowser = createLibraryBrowser({
    library: dataLibrary,
    publish: (view) => libraryStore.publish(view),
  });
  libraryStore.connect(libraryBrowser.controls);
  defer(() => {
    libraryBrowser.destroy();
    libraryStore.connect(null);
  });
  dataLibrary.start({ signal }).catch((error) => {
    if (!signal?.aborted) console.warn('[Library] start failed:', error);
  });
  // The live gate's handle (scripts/qa-data-library.mjs).
  const libraryHandle = {
    library: dataLibrary,
    browser: libraryBrowser,
    // What Copy Link would copy.
    buildShareLink: () => styleManager.shareLinkManager?.buildLink?.() ?? null,
  };
  window.__gevDataLibrary = libraryHandle;
  defer(() => {
    if (window.__gevDataLibrary === libraryHandle)
      delete window.__gevDataLibrary;
  });
  // DATA ▸ Recent Imagery: the box tool claims the pointer like Draw and the
  // panel lives on the right rail, so both belong to the application
  // lifetime. The tileset lets the layer drape while the globe is hidden.
  const recentImagery = dataManager.layers.get('recent-imagery')?.module;
  if (recentImagery) {
    recentImagery.attachTileset(tileset);
    const imageryBoxTool = initImageryBoxTool({
      viewer,
      onBox: (box) => recentImagery.setBox(box),
      onCancel: (reason, message, box) => {
        if (message) recentImagery.reportBoxRefusal(message, box);
      },
      onActive: (active) => recentImagery.setToolActive(active),
      // The tool takes Escape in a capture listener, so the panel's order
      // (clear a preview before cancelling the tool) is applied here.
      onEscape: () => recentImagery.clearPreview(),
    });
    // The readout mounts in its rail body through the layer panel, like the
    // weather readout.
    data.presentation.attachRecentImagery((container) =>
      createRecentImageryPanel({
        container,
        viewer,
        layer: recentImagery,
        tool: imageryBoxTool,
      }),
    );
    // The live gate's handle (scripts/qa-recent-imagery.mjs).
    const recentImageryHandle = { layer: recentImagery, tool: imageryBoxTool };
    window.__gevRecentImagery = recentImageryHandle;
    defer(() => {
      if (window.__gevRecentImagery === recentImageryHandle)
        delete window.__gevRecentImagery;
      data.presentation.attachRecentImagery(null);
      imageryBoxTool?.destroy();
    });
  }
  if (startChrome)
    defer(startChrome({ loadingScreen, styleManager, dataManager, signal }));
  // Idle render governor: flips the scene into requestRenderMode whenever
  // nothing animates per frame. Installed AFTER every module above has had
  // its chance to register pre-install holds. (perf wave 2)
  installRenderGovernor(viewer);
  // Cesium keeps a turned-off layer's draw commands (and so all its entities)
  // alive in reused per-pass arrays; trim them after each disable.
  defer(
    installLayerReleaseTrim({
      scene: viewer.scene,
      dataManager,
      requestRender: governorRequestRender,
    }),
  );

  // Install the explicit scope mask used by the DISPLAY controls.
  installScopeMask(viewer);
  defer(() => destroyScopeMask());

  // The follow camera recomputes the tracked target's dead-reckon position
  // every frame — tracking anything is a per-frame animation. (perf wave 2)
  const removeTrackingListener = viewer.trackedEntityChanged.addEventListener(
    () => {
      if (viewer.trackedEntity) holdContinuousRender('tracked-entity');
      else releaseContinuousRender('tracked-entity');
    },
  );

  // Hidden-state suspension (perf wave 2): when the window/tab is hidden,
  // stop the default render loop outright — a hidden canvas repaints for
  // nobody, and browser rAF throttling still lets throttled frames burn
  // GPU. Holder/data state is untouched, so return is seamless: restore
  // the loop, refresh the one DOM surface we gated, render a frame.
  const syncVisibilitySuspension = () => {
    // A panel's host may report it hidden while it is on screen; the panel
    // keeps drawing itself (see keepPanelRendering in embed.js).
    const hidden = document.hidden && !isEmbeddedInline();
    viewer.useDefaultRenderLoop = !hidden;
    cockpitCloudEffects?.setSuspended?.(hidden);
    if (!hidden) {
      data.presentation.flushVisible();
      governorRequestRender('visibility-restore');
    }
  };
  document.addEventListener('visibilitychange', syncVisibilitySuspension);
  defer(() =>
    document.removeEventListener('visibilitychange', syncVisibilitySuspension),
  );
  defer(() => {
    removeTrackingListener();
    releaseContinuousRender('tracked-entity');
  });
  // Apply the CURRENT state too — bootstrap can complete while the tab is
  // already hidden, and waiting for the next transition would leave the
  // loop burning behind a hidden tab. (perf wave 2 fix)
  syncVisibilitySuspension();

  window.__godsEyeView = {
    viewer,
    styleManager,
    tileset,
    dataManager,
    sceneDirector,
    mapStackController,
    annotations,
    weatherEffects,
    cockpitCloudEffects,
    getRenderGovernorDiagnostics,
    surfaceServices: operations.surface,
    requestRender: governorRequestRender,
  };
  const debug = window.__godsEyeView;
  defer(() => {
    if (window.__godsEyeView === debug) delete window.__godsEyeView;
  });
  const voiceCommands = initGevVoiceCommands({
    ...voice,
    floorServices: operations.surface.groundFloor,
    annotationResolver: operations.annotationResolver,
    searchNavigation: operations.searchAndFlyTo,
    signal,
    placeSearch,
    viewer,
    styleManager,
    dataManager,
    sceneDirector,
    annotations,
  });
  defer(() => {
    voiceCommands.stop({ removeUi: true });
    if (window.__gevVoiceCommands === voiceCommands)
      delete window.__gevVoiceCommands;
  });
  debug.voiceCommands = voiceCommands;
  const sightseeingEngine = createSightseeingEngine({
    viewer,
    dataManager,
    operations,
  });
  defer(() => sightseeingEngine.destroy());
  debug.sightseeingEngine = sightseeingEngine;
  window.__gevSightseeing = sightseeingEngine;
  const flightEngine = createSyntheticFlightEngine({
    viewer,
    operations,
    cockpitController: window.__gevCockpit || null,
  });
  defer(() => flightEngine.destroy());
  debug.flightEngine = flightEngine;
  window.__gevFlightEngine = flightEngine;

  const railwayEngine = createRailwayEngine({
    viewer,
    operations,
  });
  defer(() => railwayEngine.destroy());
  debug.railwayEngine = railwayEngine;
  window.__gevRailEngine = railwayEngine;

  const driveEngine = createDriveEngine({
    viewer,
    operations,
    trafficLayer: dataManager.layers.get('traffic')?.module,
  });
  defer(() => driveEngine.destroy());
  debug.driveEngine = driveEngine;
  window.__gevDriveEngine = driveEngine;

  const boatEngine = createBoatEngine({
    viewer,
    operations,
  });
  defer(() => boatEngine.destroy());
  debug.boatEngine = boatEngine;
  window.__gevBoatEngine = boatEngine;

  const cityEngine = createPedestrianEngine({
    viewer,
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => cityEngine.destroy());
  debug.cityEngine = cityEngine;
  window.__gevCityEngine = cityEngine;
  window.__gevViewer = viewer;

  let corridorDrawer = null;
  const agentBridge = initAgentBridge({
    runner: (name, args) => voiceCommands.runner(name, args, { signal }),
    operations,
    viewer,
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
    viewer,
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => wanderEngine.destroy());
  debug.wanderEngine = wanderEngine;
  window.__gevWanderEngine = wanderEngine;

  const tourAndPlayEngine = createTourAndPlayEngine({
    wanderEngine,
    cityEngine,
  });
  defer(() => tourAndPlayEngine.destroy());
  debug.tourAndPlayEngine = tourAndPlayEngine;
  window.__gevTourAndPlayEngine = tourAndPlayEngine;

  const wanderDrawer = createWanderDrawer({
    wanderEngine,
    cityEngine,
    tourAndPlayEngine,
    viewer,
  });
  defer(() => wanderDrawer.destroy());
  debug.wanderDrawer = wanderDrawer;
  window.__gevWanderDrawer = wanderDrawer;

  const cityDrawer = createCityDrawer({
    cityEngine,
    wanderEngine,
    tourAndPlayEngine,
    viewer,
  });
  defer(() => cityDrawer.destroy());
  debug.cityDrawer = cityDrawer;
  window.__gevCityDrawer = cityDrawer;

  const agentForgePanel = createSelfModifyingAgentPanel({
    viewer,
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => agentForgePanel.destroy());
  debug.agentForgePanel = agentForgePanel;
  window.__gevAgentForgePanel = agentForgePanel;

  const passengerFlow = createPassengerFlow({ viewer });
  defer(() => passengerFlow.clearStops());
  debug.passengerFlow = passengerFlow;
  window.__gevPassengerFlow = passengerFlow;

  const busEngine = createSyntheticBusEngine({
    viewer,
    passengerFlow,
  });
  defer(() => busEngine.destroy());
  debug.busEngine = busEngine;
  window.__gevBusEngine = busEngine;

  const metroEngine = createSyntheticMetroEngine({
    viewer,
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

  const freightEngine = createFreightSimEngine({ viewer });
  defer(() => freightEngine.destroy());
  debug.freightEngine = freightEngine;
  window.__gevFreightEngine = freightEngine;

  const freightDrawer = createFreightLogisticsDrawer({
    freightEngine,
    viewer,
  });
  defer(() => freightDrawer.destroy());
  debug.freightDrawer = freightDrawer;
  window.__gevFreightDrawer = freightDrawer;

  const estateAudio = createProceduralEstateAudio();
  defer(() => estateAudio.destroy());

  const claimScout = createPropertyClaimScout({ viewer });
  defer(() => claimScout.destroy());
  debug.claimScout = claimScout;
  window.__gevClaimScout = claimScout;

  const fleetEngine = createPersonalFleetEngine({
    viewer,
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
    viewer,
  });
  defer(() => estateDrawer.destroy());
  debug.estateDrawer = estateDrawer;
  window.__gevEstateDrawer = estateDrawer;

  const compositeTravel = createCompositeTravelEngine({
    viewer,
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
    viewer,
    audioEngine: wildernessAudio,
  });
  defer(() => wildernessDrawer.destroy());
  debug.wildernessDrawer = wildernessDrawer;
  window.__gevWildernessDrawer = wildernessDrawer;

  const sandboxEngine = createWorldSandboxEngine({
    viewer,
  });
  defer(() => sandboxEngine.destroy());
  debug.sandboxEngine = sandboxEngine;
  window.__gevSandboxEngine = sandboxEngine;

  const sandboxDrawer = createSandboxDrawer({
    viewer,
    sandboxEngine,
  });
  defer(() => sandboxDrawer.destroy());
  debug.sandboxDrawer = sandboxDrawer;
  window.__gevSandboxDrawer = sandboxDrawer;

  const corridorVisualizer = createCorridorVisualizer({ viewer });
  defer(() => corridorVisualizer.destroy());
  debug.corridorVisualizer = corridorVisualizer;

  corridorDrawer = createCorridorDrawer({
    viewer,
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

  const customUxToggle = getGlobalDrawerCoordinator().mountCustomUxToggle({
    container: typeof document !== 'undefined' ? document.body : null,
  });
  defer(() => customUxToggle.destroy());
  debug.customUxToggle = customUxToggle;

  const earthSimIntro = createEarthSimTourOverlay({
    coordinator: getGlobalDrawerCoordinator(),
    agentPanel: agentForgePanel,
  });
  defer(() => earthSimIntro.destroy());
  debug.earthSimIntro = earthSimIntro;
  window.__gevEarthSimIntro = earthSimIntro;

  defer(
    installViews({
      shell: styleManager,
      viewer,
      dataManager,
      run: (name, args, options = {}) =>
        voiceCommands.runner(name, args, { ...options, signal }),
      signal,
      terrain: operations.requests.terrain,
    }),
  );
  // An application's own tool takes the pointer as Draw does, and its own
  // click handlers yield while a tool holds it, as the layers' do
  // (data/inputOwnership.js).
  return {
    sceneDirector,
    annotations,
    voiceCommands,
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
    pointer: {
      claim: claimPointer,
      release: releasePointer,
      isFree: isPointerFree,
    },
  };
}
