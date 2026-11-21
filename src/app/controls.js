import { catalogControlServices } from './catalog.js';
import { StyleManager } from '../ui/composition.js';
import {
  flyToAustin,
  flyToAtlanta,
  flyToMiami,
  flyToOrlando,
  flyToCharlotte,
} from '../camera.js';
import { installZoomOutGuard } from './zoomOutGuard.js';
import { initCockpitCloudEffects } from '../cockpitCloudEffects.js';
import { t } from '../i18n/index.js';
import { getForkProfile } from '../config/forkProfile.js';

/**
 * Construct the existing controls and camera presentation. `initialShareCode`
 * opens a share code (the `<code>` of `/share/<code>`) at start-up, for a host
 * whose address does not carry one. `localePicker: false` removes the language
 * picker, for a host that offers its own language choice (`switchLocale` from
 * the `./i18n` entry).
 */
export function createApplicationControls({
  scene: { viewer, mapStackController, operations },
  loaderStatus,
  Controls = StyleManager,
  services,
  catalog,
  placeSearch,
  defer,
  initialShareCode = null,
  localePicker = true,
}) {
  // Initialize the style manager (post-processing, HUD, locations, share links)
  const styleManager = new Controls(viewer, {
    services: {
      ...services,
      ...operations.surface.controlServices,
      searchAndFlyTo: operations.searchAndFlyTo,
      fetchRegionalBrief: (...args) =>
        operations.requests.regional.getBrief(...args),
      ...catalogControlServices(catalog),
    },
    requestServices: operations.requests,
    mapStackController,
    placeSearch,
    // A share code to open at start-up instead of the page's address.
    initialShareCode,
    localePicker,
  });
  defer(() => styleManager.orbitController.stop());
  defer(() => styleManager.hud.destroy());
  defer(() => styleManager.dispose());
  defer(
    installZoomOutGuard(viewer, {
      subscribeCameraHandoff: (listener) =>
        styleManager.subscribeCameraHandoff?.(listener),
    }),
  );
  // The previous multi-canvas weather compositor remains disabled. Cockpit
  // clouds use a separate, capped low-resolution GPU pass that never attaches
  // Cesium fog or post-process stages and is fully stopped in map mode.
  const weatherEffects = null;
  const cockpitCloudEffects = initCockpitCloudEffects(viewer, {
    weatherService: operations.requests.weather,
  });
  defer(() => cockpitCloudEffects?.destroy());

  // If no share link state, do default fly-to (supports ?city=..., ?explore=..., ?goto=..., or DEFAULT_STARTUP_CITY)
  if (!styleManager.hasShareState) {
    const searchParams =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location?.search || '')
        : new URLSearchParams();
    const exploreTarget =
      searchParams.get('explore') || searchParams.get('goto');
    const localeTarget =
      searchParams.get('locale') || searchParams.get('livingLocale');
    const stadiumTarget =
      searchParams.get('stadium') || searchParams.get('gameday');
    const connectFrom =
      searchParams.get('connectFrom') || searchParams.get('relFrom');
    const connectTo =
      searchParams.get('connectTo') || searchParams.get('relTo');
    const targetCity = (
      searchParams.get('city') || getForkProfile().defaultStartupCity
    ).toLowerCase();

    if (connectFrom && connectTo) {
      // i18n-ignore
      loaderStatus.textContent = `Connecting ${connectFrom} → ${connectTo}...`;
    } else if (stadiumTarget) {
      loaderStatus.textContent = t(`Stepping into ${stadiumTarget}...`);
    } else if (localeTarget) {
      loaderStatus.textContent = t(`Stepping into ${localeTarget}...`);
    } else if (
      exploreTarget &&
      typeof operations?.searchAndFlyTo === 'function'
    ) {
      loaderStatus.textContent = t(`Exploring ${exploreTarget}...`);
      const timer = setTimeout(() => {
        operations.searchAndFlyTo(exploreTarget);
      }, 700);
      defer(() => clearTimeout(timer));
    } else if (targetCity === 'atlanta') {
      // i18n-ignore
      loaderStatus.textContent = 'Flying to Atlanta, GA...';
      defer(flyToAtlanta(viewer));
    } else if (targetCity === 'miami') {
      // i18n-ignore
      loaderStatus.textContent = 'Flying to Miami, FL...';
      defer(flyToMiami(viewer));
    } else if (targetCity === 'orlando') {
      // i18n-ignore
      loaderStatus.textContent = 'Flying to Orlando, FL...';
      defer(flyToOrlando(viewer));
    } else if (targetCity === 'charlotte') {
      // i18n-ignore
      loaderStatus.textContent = 'Flying to Charlotte, NC...';
      defer(flyToCharlotte(viewer));
    } else {
      loaderStatus.textContent = t('Flying to Austin, TX...');
      defer(flyToAustin(viewer));
    }
  } else {
    loaderStatus.textContent = t('Restoring shared view...');
  }

  return { styleManager, weatherEffects, cockpitCloudEffects };
}
