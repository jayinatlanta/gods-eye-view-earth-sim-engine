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
import { getGlobalDrawerCoordinator } from '../ui/worldSimDock.js';

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
  const sightseeingEngine = createSightseeingEngine({
    viewer: cesiumViewer,
    dataManager,
    operations,
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

  const tourAndPlayEngine = createTourAndPlayEngine({
    wanderEngine,
    cityEngine,
    viewer: cesiumViewer,
  });
  defer(() => tourAndPlayEngine.destroy());
  debug.tourAndPlayEngine = tourAndPlayEngine;
  window.__gevTourAndPlayEngine = tourAndPlayEngine;

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
