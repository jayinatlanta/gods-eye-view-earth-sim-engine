import { toRadians } from './geo/index.js';
import { cameraOf } from './render/rendererOf.js';

/**
 * The view the renderer starts from: the whole planet, looking straight
 * down, centred where Cesium's default view rectangle is.
 */
export const START_VIEW = Object.freeze({
  lon: -82.5,
  lat: 35,
  height: 23000000,
});

/**
 * Camera presets for notable locations.
 */
export const CAMERA_PRESETS = {
  austin: {
    destination: { lon: -97.7431, lat: 30.2672, height: 800 },
    orientation: {
      heading: toRadians(0),
      pitch: toRadians(-35),
      roll: 0.0,
    },
  },
  atlanta: {
    destination: { lon: -84.3835972, lat: 33.7767611, height: 750 },
    orientation: {
      heading: toRadians(190),
      pitch: toRadians(-25),
      roll: 0.0,
    },
  },
  sf: {
    destination: { lon: -122.4194, lat: 37.7749, height: 1000 },
    orientation: {
      heading: toRadians(30),
      pitch: toRadians(-30),
      roll: 0.0,
    },
  },
  nyc: {
    destination: { lon: -73.9857, lat: 40.7484, height: 1200 },
    orientation: {
      heading: toRadians(-20),
      pitch: toRadians(-30),
      roll: 0.0,
    },
  },
  miami: {
    destination: { lon: -80.1884, lat: 25.7743, height: 850 },
    orientation: {
      heading: toRadians(0),
      pitch: toRadians(-25),
      roll: 0.0,
    },
  },
  orlando: {
    destination: { lon: -81.3732, lat: 28.5434, height: 850 },
    orientation: {
      heading: toRadians(0),
      pitch: toRadians(-25),
      roll: 0.0,
    },
  },
  charlotte: {
    destination: { lon: -80.8431, lat: 35.2271, height: 850 },
    orientation: {
      heading: toRadians(45),
      pitch: toRadians(-25),
      roll: 0.0,
    },
  },
};

/**
 * Put the camera at a start view without a flight. A host may pass a city
 * (`{ lon, lat, height, heading?, pitch? }`, angles in degrees) instead of
 * the planet.
 */
export function applyStartView(viewer, view = START_VIEW) {
  const { lon, lat, height, heading = 0, pitch = -90 } = view;
  cameraOf(viewer).setView({
    destination: { lon, lat, height },
    orientation: {
      heading: toRadians(heading),
      pitch: toRadians(pitch),
      roll: 0,
    },
  });
}

/**
 * Fly the camera to a preset location with a smooth animation.
 */
export function flyToPreset(viewer, presetName, duration = 3.0) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  cameraOf(viewer).flyTo(preset.destination, {
    orientation: preset.orientation,
    durationS: duration,
    easing: 'cubicInOut',
  });
}

function cinematicFlyIn(
  viewer,
  { lon, lat, startHeight = 25000, endHeight = 800, heading = 0, pitch = -25 },
) {
  const cam = cameraOf(viewer);
  cam.setView({
    destination: { lon, lat, height: startHeight },
    orientation: {
      heading: toRadians(0),
      pitch: toRadians(-90),
      roll: 0.0,
    },
  });

  const timer = setTimeout(() => {
    if (viewer.isDestroyed?.()) return;
    cam.flyTo(
      { lon, lat, height: endHeight },
      {
        orientation: {
          heading: toRadians(heading),
          pitch: toRadians(pitch),
          roll: 0.0,
        },
        durationS: 4.0,
        easing: 'cubicInOut',
      },
    );
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed?.()) cam.cancelFlight();
  };
}

/**
 * Set camera to Austin on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAustin(viewer) {
  return cinematicFlyIn(viewer, {
    lon: -97.7431,
    lat: 30.2672,
    endHeight: 800,
    heading: 0,
    pitch: -35,
  });
}

/**
 * Set camera to Atlanta on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAtlanta(viewer) {
  return cinematicFlyIn(viewer, {
    lon: -84.3835972,
    lat: 33.7767611,
    endHeight: 850,
    heading: 190,
    pitch: -25,
  });
}

/**
 * Set camera to Miami on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToMiami(viewer) {
  return cinematicFlyIn(viewer, {
    lon: -80.1884,
    lat: 25.7743,
    endHeight: 650,
    heading: 0,
    pitch: -25,
  });
}

/**
 * Set camera to Orlando on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToOrlando(viewer) {
  return cinematicFlyIn(viewer, {
    lon: -81.3732,
    lat: 28.5434,
    endHeight: 650,
    heading: 0,
    pitch: -25,
  });
}

/**
 * Set camera to Charlotte on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToCharlotte(viewer) {
  return cinematicFlyIn(viewer, {
    lon: -80.8431,
    lat: 35.2271,
    endHeight: 650,
    heading: 45,
    pitch: -25,
  });
}
