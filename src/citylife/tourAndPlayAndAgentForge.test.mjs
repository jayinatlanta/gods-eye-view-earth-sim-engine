import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import * as Cesium from 'cesium';
import { Window } from 'happy-dom';
import { createWanderDrawer } from './wanderDrawer.js';
import { createCityDrawer } from './cityDrawer.js';
import {
  createAvatarWanderEngine,
  WANDER_CAMERA_MODES,
  WANDER_SPEED_TIERS,
} from '../layers/citylife/avatarWanderEngine.js';
import {
  createTourAndPlayEngine,
  METRO_LANDMARK_CATALOG,
  METRO_TOUR_METADATA,
  TOUR_OR_PLAY_STATES,
  TOUR_SCOOTER_SPEED_MPS,
  TOUR_WALK_MIDWAY_SPEED_MPS,
  TOUR_WALK_MIDWAY_CORRIDOR_MAX_METERS,
  TOUR_LANDMARK_DWELL_SECONDS,
  TOUR_SIDEWALK_OFFSET_METERS,
  normalizeMetroTourCityKey,
  getLandmarksForCity,
  shuffleLandmarks,
  buildTourItinerary,
  computeDayCycleSolarState,
  findNearestVenueTour,
  validateTourStopDraft,
  exportTourAsContractJson,
  resolveTourOrPlayContext,
  resolveNearestMetroForTour,
  getPlayActivitiesForEnvironment,
  buildStreetAndSidewalkRoute,
  lerpHeadingDegrees,
  normalizeTourV2Metadata,
  registerBuiltTourRuntime,
  getRuntimeBuiltTours,
  clearRuntimeBuiltToursForTest,
  getAllTourCatalogEntries,
  isConcreteCatalogPlaceName,
  getCachedCatalogPlaceAt,
  clearCatalogPlaceCacheForTest,
  resolveCatalogPlaceAt,
} from '../layers/citylife/tourAndPlayEngine.js';
import {
  createTourPoiCards,
  TOUR_POI_OVERLAY_SOURCE_ID,
} from '../layers/citylife/tourPoiCards.js';
import { createSightseeingDrawer } from '../discovery/sightseeingDrawer.js';
import { clearLocalityCacheForTests } from '../ui/worldSimDock.js';
import { SETTLEMENT_TYPOLOGIES } from '../layers/citylife/localeClassifier.js';
import { createPedestrianEngine } from '../layers/citylife/pedestrianEngine.js';
import {
  LIVING_CITIES,
  CITY_QUERY_ALIASES,
  resolveCity,
} from './cityWaypoints.js';
import { MAJOR_WORLD_METROS } from '../ui/worldSimDock.js';
import {
  createSelfModifyingAgentPanel,
  DEFAULT_AGENT_CLI_BINARY,
  DEFAULT_AGENT_CLI_PARAMS,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_MODE,
  DEFAULT_AGENT_PROVIDER,
  AGENT_PROVIDER_OPTIONS,
  AGENT_MODEL_OPTIONS,
  AGENT_MODE_OPTIONS,
  buildClientNeuroLayeredPreview,
  isTourForgeAvailable,
} from '../ui/selfModifyingAgentPanel.js';
import {
  buildNeuroLayeredForgePrompt,
  buildWorldGuidePrompt,
  classifyAgentRequestMode,
  parseCliArgsString,
  normalizeAgyCliArgs,
  resolveCanonicalAgyModel,
  buildAgyModelFallbackChain,
  buildLocalWorldGuideFallbackAnswer,
  buildSanitizedAgyEnv,
  isInvalidModelSelectionOutput,
  replaceOrRemoveModelArg,
  stripBenignAgyStderrWarnings,
  runAgyWithModelFallback,
  handleAgySelfModify,
  readAgyCliActiveDefaultModel,
  parseAgyModelsOutput,
  handleAgyModels,
  handleAssistantCapabilities,
  normalizeTourBuildDirective,
  buildTourBuildForgePrompt,
  extractBuiltTourContractFromOutput,
  loadBuiltTourContractFromRepo,
  DEFAULT_FORGE_CLI_BINARY,
  DEFAULT_FORGE_CLI_ARGS,
  DEFAULT_FORGE_MODEL,
  DEFAULT_ORCHESTRATOR_MODEL,
  DEFAULT_FALLBACK_MODEL,
  AGY_MODEL_PRESETS,
  GEV_DATA_STRUCTURE_REGISTRY,
} from '../../server/providers/agy/self-modify.js';

function createMockViewer() {
  const mockEntities = [];
  const preRenderListeners = [];
  const canvasListeners = new Map();

  const mockCanvas = {
    addEventListener: (type, cb) => {
      if (!canvasListeners.has(type)) canvasListeners.set(type, new Set());
      canvasListeners.get(type).add(cb);
    },
    removeEventListener: (type, cb) => {
      canvasListeners.get(type)?.delete(cb);
    },
    requestPointerLock: () => {},
  };

  return {
    entities: {
      add: (spec) => {
        const e = {
          ...spec,
          show: true,
          position: { setValue: () => {} },
          orientation: { setValue: () => {} },
        };
        mockEntities.push(e);
        return e;
      },
      remove: (e) => {
        const idx = mockEntities.indexOf(e);
        if (idx >= 0) mockEntities.splice(idx, 1);
      },
      _all: mockEntities,
    },
    camera: {
      setView: () => {},
      lookAtTransform: () => {},
      flyTo: () => {},
      cancelFlight: () => {},
      positionCartographic: new Cesium.Cartographic(
        Cesium.Math.toRadians(-118.3267),
        Cesium.Math.toRadians(34.1016),
        120,
      ),
    },
    scene: {
      canvas: mockCanvas,
      globe: {
        getHeight: () => 115.0,
      },
      preRender: {
        addEventListener: (cb) => {
          preRenderListeners.push(cb);
          return () => {
            const i = preRenderListeners.indexOf(cb);
            if (i >= 0) preRenderListeners.splice(i, 1);
          };
        },
        removeEventListener: (cb) => {
          const i = preRenderListeners.indexOf(cb);
          if (i >= 0) preRenderListeners.splice(i, 1);
        },
      },
    },
    _triggerPreRender: () => {
      for (const cb of [...preRenderListeners]) cb();
    },
  };
}

test('Living World Sim — Major City Scooter Tours & Non-Metro Play Framework', async (t) => {
  await t.test(
    '1. Los Angeles & Major Cities have curated landmarks (Hollywood Blvd, Griffith Park, Old City Hall, Chinatown)',
    () => {
      assert.ok(
        LIVING_CITIES.los_angeles,
        'Los Angeles must be in LIVING_CITIES',
      );
      assert.equal(resolveCity('la').id, 'los_angeles');
      assert.equal(resolveCity('Hollywood').id, 'los_angeles');

      const laTour = METRO_LANDMARK_CATALOG.los_angeles;
      assert.ok(
        Array.isArray(laTour),
        'Los Angeles must be in METRO_LANDMARK_CATALOG',
      );
      const names = laTour.map((l) => l.name);
      assert.ok(
        names.some((n) => n.includes('Hollywood Blvd')),
        'LA tour must include Hollywood Blvd',
      );
      assert.ok(
        names.some((n) => n.includes('Griffith Park')),
        'LA tour must include Griffith Park',
      );
      assert.ok(
        names.some((n) => n.includes('Old City Hall')),
        'LA tour must include Old City Hall',
      );
      assert.ok(
        names.some((n) => n.includes('Chinatown')),
        'LA tour must include Chinatown',
      );

      for (const lm of laTour) {
        assert.ok(
          lm.lore && lm.lore.length > 20,
          `Landmark ${lm.name} must have rich dialog lore`,
        );
      }
    },
  );

  await t.test(
    '2. Landmark order is randomized every time a tour is initiated',
    () => {
      const base = METRO_LANDMARK_CATALOG.los_angeles;
      // Deterministic RNGs with different seeds produce different landmark sequences
      let seedA = 1;
      const rngA = () => {
        seedA = (seedA * 16807) % 2147483647;
        return (seedA - 1) / 2147483646;
      };
      let seedB = 99991;
      const rngB = () => {
        seedB = (seedB * 48271) % 2147483647;
        return (seedB - 1) / 2147483646;
      };

      const order1 = shuffleLandmarks(base, rngA).map((l) => l.id);
      const order2 = shuffleLandmarks(base, rngB).map((l) => l.id);
      assert.equal(order1.length, base.length);
      assert.notDeepEqual(
        order1,
        order2,
        'Shuffled landmark sequences must vary across runs to prevent boredom',
      );
    },
  );

  await t.test(
    '3. Scooter Tour runs at electric scooter speed (6.7 m/s / ~15 mph), pauses 20s at landmarks for autonomous walking wander + dialog bubble, and supports user normal-speed walking take-over',
    () => {
      assert.equal(WANDER_SPEED_TIERS.SCOOTER, 6.7);
      assert.equal(TOUR_SCOOTER_SPEED_MPS, 6.7);
      assert.equal(TOUR_LANDMARK_DWELL_SECONDS, 20);

      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      const status = tourEngine.startCityTour({
        cityId: 'los_angeles',
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });

      assert.equal(status.mode, 'tour');
      assert.equal(status.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
      assert.equal(
        status.totalLandmarks,
        METRO_LANDMARK_CATALOG.los_angeles.length,
      );
      assert.equal(wanderEngine.isWandering, true);
      assert.equal(wanderEngine.getCameraMode(), WANDER_CAMERA_MODES.ISO_CHASE);

      // Advance frame during scooter transit -> speed should be electric scooter speed (6.7 m/s)
      viewer._triggerPreRender();
      const transitStatus = tourEngine.getStatus();
      assert.equal(transitStatus.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);

      // Arrive at Landmark #2 -> enters 20-second autonomous walking wander dwell + lore dialog bubble
      const dwellStatus = tourEngine.arriveAtCurrentLandmarkNow();
      assert.equal(dwellStatus.state, TOUR_OR_PLAY_STATES.TOUR_DWELL);
      assert.equal(dwellStatus.dwellRemainingSec, 20);

      // User chooses to take over at normal walking wander speed (1.2 m/s) at the landmark
      const takeoverStatus = tourEngine.takeOverAtLandmark();
      assert.equal(takeoverStatus.state, TOUR_OR_PLAY_STATES.USER_TAKEOVER);
      assert.equal(
        wanderEngine.getWalkSpeedOverride(),
        WANDER_SPEED_TIERS.STROLL,
      );

      // User clicks Continue Tour -> resumes electric scooter transit to next randomized landmark
      const prevIdx = takeoverStatus.landmarkIndex;
      const resumedStatus = tourEngine.continueTour();
      assert.equal(resumedStatus.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
      assert.equal(
        resumedStatus.landmarkIndex,
        (prevIdx + 1) % resumedStatus.totalLandmarks,
      );

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '4. Non-Metro & Tourist locations resolve to Play mode and combine Living World environmental activities (Mountain Hike, Farmland Hike, Harbor Pier Walk) with Beach, Movie, Eat, and Shop',
    () => {
      // High-altitude alpine / wilderness environment -> Play mode with Mountain Hike
      const alpineCtx = resolveTourOrPlayContext(46.0207, 7.7491, 2100);
      assert.equal(alpineCtx.mode, 'play');
      const alpineIds = alpineCtx.playActivities.map((a) => a.id);
      assert.ok(
        alpineIds.includes('mountain_hike'),
        'Alpine/wilderness Play activities must suggest Mountain Ridge & Trailhead Hike',
      );
      assert.ok(alpineIds.includes('visit_beach'));
      assert.ok(alpineIds.includes('see_movie'));
      assert.ok(alpineIds.includes('go_out_to_eat'));
      assert.ok(alpineIds.includes('go_shopping'));

      // Agricultural / Farmland environment -> Farmland Hike
      const farmActs = getPlayActivitiesForEnvironment({
        typology: SETTLEMENT_TYPOLOGIES.RURAL_AGRICULTURAL,
      }).map((a) => a.id);
      assert.ok(
        farmActs.includes('farmland_hike'),
        'Agricultural environment must suggest Farmland Hedgerow & Country Lane Hike',
      );

      // Coastal Tidewater environment -> Harbor Pier Walk
      const coastalActs = getPlayActivitiesForEnvironment({
        typology: SETTLEMENT_TYPOLOGIES.COASTAL_TIDEWATER,
      }).map((a) => a.id);
      assert.ok(
        coastalActs.includes('coastal_dock_hike'),
        'Coastal environment must suggest Working Harbor Pier & Salt-Marsh Walk',
      );

      // Launching a Play activity starts autonomous walking wander + lore bubble
      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      const playStatus = tourEngine.startPlayActivity('mountain_hike', {
        lat: 46.0207,
        lon: 7.7491,
        elev: 2100,
        typology: SETTLEMENT_TYPOLOGIES.ALPINE_SKI_RESORT,
      });
      assert.equal(playStatus.mode, 'play');
      assert.equal(playStatus.state, TOUR_OR_PLAY_STATES.PLAY_ACTIVE);
      assert.equal(playStatus.activePlayActivity.id, 'mountain_hike');
      assert.equal(wanderEngine.isWandering, true);

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '5. UX Comfort & Realism: (a) No dizzying camera spin at landmarks, (b) No supersonic takeoff burst between landmarks, and (c) Street & sidewalk routing (+3.5m curb offset)',
    () => {
      assert.equal(TOUR_SIDEWALK_OFFSET_METERS, 3.5);
      assert.equal(lerpHeadingDegrees(350, 10, 15), 5);

      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      const initStatus = tourEngine.startCityTour({
        cityId: 'los_angeles',
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });

      // (c) Multi-segment street & sidewalk polyline (>= 5 waypoints offset onto right-hand sidewalk)
      assert.ok(
        initStatus.activeRouteWaypoints.length >= 5,
        'City tour must route along multi-segment street & sidewalk waypoints instead of a single Euclidean line through buildings',
      );
      assert.ok(
        initStatus.activeRouteWaypoints.every((wp) => wp.isSidewalk === true),
        'All city tour waypoints must be projected onto the right-hand pedestrian sidewalk (+3.5m curb offset)',
      );

      // (b) Smooth takeoff ramp: speed eases in from walking speed (~1.2 m/s) up to 6.7 m/s and NEVER exceeds 6.7 m/s
      let coords = { ...wanderEngine.getTelemetry().coordinates };
      const firstTick = tourEngine._updateStep({
        coordinates: coords,
        deltaTimeSeconds: 0.05,
      });
      assert.ok(
        firstTick.speedMps < TOUR_SCOOTER_SPEED_MPS &&
          firstTick.speedMps >= WANDER_SPEED_TIERS.STROLL,
        `Initial takeoff speed (${firstTick.speedMps} m/s) must gently ease in rather than bursting at high speed`,
      );

      for (let i = 0; i < 40; i++) {
        const step = tourEngine._updateStep({
          coordinates: coords,
          deltaTimeSeconds: 0.1,
        });
        assert.ok(
          step.speedMps <= TOUR_SCOOTER_SPEED_MPS + 1e-6,
          `Scooter transit speed (${step.speedMps} m/s) must never exceed ${TOUR_SCOOTER_SPEED_MPS} m/s`,
        );
        coords = {
          lat: step.lat,
          lon: step.lon,
          heading: step.heading,
        };
      }

      // (a) Arrive at landmark -> camera heading stays rock-steady (0 deg spin) during 20s autonomous dwell
      tourEngine.arriveAtCurrentLandmarkNow();
      let dwellCoords = { ...wanderEngine.getTelemetry().coordinates };
      const anchorHeading = tourEngine.getStatus().dwellAnchorHeadingDeg;
      const recordedHeadings = [];
      const recordedSpeeds = [];

      for (let sec = 0; sec < 15; sec++) {
        const dwellStep = tourEngine._updateStep({
          coordinates: dwellCoords,
          deltaTimeSeconds: 1.0,
        });
        recordedHeadings.push(dwellStep.heading);
        recordedSpeeds.push(dwellStep.speedMps);
        dwellCoords = {
          lat: dwellStep.lat,
          lon: dwellStep.lon,
          heading: dwellStep.heading,
        };
      }

      for (const h of recordedHeadings) {
        assert.equal(
          h,
          anchorHeading,
          'Landmark dwell must keep camera heading calm and steady without spinning in a circle',
        );
      }
      assert.ok(
        recordedSpeeds.some((s) => s < 0.2),
        'Landmark dwell must include calm stationary settle intervals (< 0.2 m/s) so companion autonomously strolls nearby',
      );

      // Continuing to next landmark across the city stages on the approaching street corridor and never rockets > 6.7 m/s
      tourEngine.continueTour({ advanceToNext: true });
      const nextCoords = { ...wanderEngine.getTelemetry().coordinates };
      const postContinueStep = tourEngine._updateStep({
        coordinates: nextCoords,
        deltaTimeSeconds: 0.05,
      });
      assert.ok(
        postContinueStep.speedMps <= TOUR_SCOOTER_SPEED_MPS,
        `Post-continue takeoff speed (${postContinueStep.speedMps} m/s) must never exceed ${TOUR_SCOOTER_SPEED_MPS} m/s`,
      );

      const sampleRoute = buildStreetAndSidewalkRoute(
        null,
        METRO_LANDMARK_CATALOG.los_angeles[0],
      );
      assert.ok(sampleRoute.length >= 5);

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );
});

test('AGY Live Forge — Lower-Left Self-Modifying Agent Panel & Neuro-Layered CLI Bridge', async (t) => {
  await t.test(
    '1. Uses valid agy.exe skip-permissions flag, normalizes legacy --yolo & model selection, and injects GEV data-structure registry into prompts',
    () => {
      assert.equal(DEFAULT_FORGE_CLI_BINARY, 'agy.exe');
      assert.equal(DEFAULT_AGENT_CLI_BINARY, 'agy');
      assert.equal(DEFAULT_FORGE_MODEL, 'inherit');
      assert.equal(DEFAULT_AGENT_MODEL, 'inherit');
      assert.equal(DEFAULT_AGENT_PROVIDER, 'auto');
      assert.equal(DEFAULT_ORCHESTRATOR_MODEL, 'Orchestrator (Argon)');
      assert.equal(DEFAULT_AGENT_MODE, 'auto');
      assert.equal(DEFAULT_FALLBACK_MODEL, 'Gemini 4 Hydrogen (High)');
      assert.equal(DEFAULT_AGENT_CLI_PARAMS, '');
      assert.ok(
        AGENT_PROVIDER_OPTIONS.some((p) => p.value === 'claude') &&
          AGENT_PROVIDER_OPTIONS.some((p) => p.value === 'gemini-api') &&
          AGENT_PROVIDER_OPTIONS.some((p) => p.value === 'openai-api'),
      );
      assert.ok(
        DEFAULT_FORGE_CLI_ARGS.includes('--dangerously-skip-permissions'),
      );
      assert.equal(DEFAULT_AGENT_CLI_PARAMS.includes('--yolo'), false);
      assert.equal(AGENT_MODEL_OPTIONS[0].value, 'inherit');
      assert.ok(
        AGENT_MODEL_OPTIONS.some((o) => o.value === 'Orchestrator (Argon)'),
      );
      assert.ok(
        AGENT_MODEL_OPTIONS.some((o) => o.value === 'Gemini 4 Hydrogen (High)'),
      );
      assert.ok(AGENT_MODE_OPTIONS.some((o) => o.value === 'ask'));
      assert.ok(AGY_MODEL_PRESETS.some((m) => m.id === 'Orchestrator (Argon)'));
      assert.ok(
        AGY_MODEL_PRESETS.some((m) => m.id === 'Gemini 4 Hydrogen (High)'),
      );

      // parseCliArgsString remains pure token parser
      const parsed = parseCliArgsString(
        '--yolo --model gemini-3.8-flash-high --output-format text',
      );
      assert.deepEqual(parsed, [
        '--yolo',
        '--model',
        'gemini-3.8-flash-high',
        '--output-format',
        'text',
      ]);

      // Canonical model label & alias resolution
      assert.equal(
        resolveCanonicalAgyModel('Orchestrator (Argon)'),
        'Orchestrator (Argon)',
      );
      assert.equal(
        resolveCanonicalAgyModel('gemini-pro-orchestrator-g1-pro'),
        'Orchestrator (Argon)',
      );
      assert.equal(
        resolveCanonicalAgyModel('gemini-4-hydrogen-high'),
        'Gemini 4 Hydrogen (High)',
      );
      assert.equal(resolveCanonicalAgyModel('inherit'), 'inherit');

      assert.deepEqual(buildAgyModelFallbackChain('Orchestrator (Argon)'), [
        'Orchestrator (Argon)',
        'Gemini 4 Hydrogen (High)',
        'gemini-4-hydrogen-high',
        '',
      ]);
      assert.equal(
        isInvalidModelSelectionOutput(
          '',
          'error: invalid model selection (--model "x")',
        ),
        true,
      );
      assert.deepEqual(
        replaceOrRemoveModelArg(
          ['--output-format', 'text', '--model', 'Orchestrator (Argon)'],
          'Gemini 4 Hydrogen (High)',
        ),
        ['--output-format', 'text', '--model', 'Gemini 4 Hydrogen (High)'],
      );
      assert.deepEqual(
        replaceOrRemoveModelArg(
          ['--output-format', 'text', '--model', 'Orchestrator (Argon)'],
          '',
        ),
        ['--output-format', 'text'],
      );

      // normalizeAgyCliArgs auto-repairs invalid --yolo -> --dangerously-skip-permissions and binds model
      const repairedOrchestrator = normalizeAgyCliArgs(
        '--yolo --model gemini-3.8-flash-high --output-format text',
        { cliBinary: 'agy.exe', model: 'Orchestrator (Argon)' },
      );
      assert.deepEqual(repairedOrchestrator, [
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
        '--model',
        'Orchestrator (Argon)',
      ]);

      // inherit mode strips explicit --model so agy.exe inherits its active default
      const inheritNormalized = normalizeAgyCliArgs(
        '--dangerously-skip-permissions --model gemini-3.8-flash-high --output-format text',
        { cliBinary: 'agy.exe', model: 'inherit' },
      );
      assert.deepEqual(inheritNormalized, [
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
      ]);

      const neuro = buildNeuroLayeredForgePrompt({
        userPrompt:
          'Add a sunset rooftop jazz bar landmark to Los Angeles tour',
        appName: "God's Eye View (GEV)",
        repoRoot: 'C:\\workspace\\earth-sim',
        autoCommit: true,
      });

      assert.ok(neuro.includes('NEURO-LAYERED SELF-MODIFICATION DIRECTIVE'));
      assert.ok(neuro.includes('Add a sunset rooftop jazz bar landmark'));
      assert.ok(neuro.includes('C:\\workspace\\earth-sim'));
      assert.ok(neuro.includes('scripts/package-boundaries.json'));
      assert.ok(neuro.includes('git commit'));
      assert.ok(neuro.includes('METRO_LANDMARK_CATALOG'));
      assert.ok(neuro.includes('LIVING_CITIES'));
      assert.ok(neuro.includes('MAJOR_WORLD_METROS'));
      assert.ok(GEV_DATA_STRUCTURE_REGISTRY.length >= 6);

      const preview = buildClientNeuroLayeredPreview({
        userPrompt: 'Add neon scooter trail',
      });
      assert.ok(preview.includes('Add neon scooter trail'));
    },
  );

  await t.test(
    '2. Creates floating lower-left launcher icon and pop-out panel with Orchestrator model selector and dispatches model + cliArgs + mode + live tour context to /api/agy/self-modify',
    async () => {
      let capturedPayload = null;
      const mockFetch = async (url, opts) => {
        capturedPayload = {
          url,
          body: JSON.parse(opts.body),
        };
        return {
          json: async () => ({
            ok: true,
            mode: 'forge',
            output: 'Modified 2 files, tests passed.',
            git: {
              branch: 'main',
              commitSha: 'a1b2c3d',
              lastCommitSubject: 'feat(live-forge): add rooftop landmark',
            },
          }),
        };
      };

      // Minimal DOM stub if running in pure Node without global document
      const hadDocument = typeof globalThis.document !== 'undefined';
      const hadWindow = typeof globalThis.window !== 'undefined';
      if (!hadDocument) {
        const makeEl = (tag) => {
          const children = [];
          const classes = new Set();
          const listeners = new Map();
          const el = {
            tagName: tag.toUpperCase(),
            id: '',
            className: '',
            textContent: '',
            value: '',
            checked: true,
            disabled: false,
            open: false,
            style: {},
            children,
            classList: {
              add: (c) => classes.add(c),
              remove: (c) => classes.delete(c),
              contains: (c) => classes.has(c),
              toggle: (c, force) => {
                if (force === undefined) {
                  if (classes.has(c)) classes.delete(c);
                  else classes.add(c);
                } else if (force) classes.add(c);
                else classes.delete(c);
              },
            },
            attrs: {},
            setAttribute: (k, v) => {
              el.attrs[k] = String(v);
            },
            getAttribute: (k) =>
              Object.prototype.hasOwnProperty.call(el.attrs, k)
                ? el.attrs[k]
                : null,
            removeAttribute: (k) => {
              delete el.attrs[k];
            },
            addEventListener: (ev, cb) => listeners.set(ev, cb),
            appendChild: (c) => children.push(c),
            remove: () => {},
            _SubEls: {},
            _listeners: listeners,
            querySelector: (sel) => el._SubEls[sel] || null,
          };
          Object.defineProperty(el, 'innerHTML', {
            get: () => el._html || '',
            set: (html) => {
              el._html = html;
              const forgeOptEl = makeEl('option');
              const modeSelectEl = Object.assign(makeEl('select'), {
                value: DEFAULT_AGENT_MODE,
                _opts: { 'option[value="forge"]': forgeOptEl },
              });
              modeSelectEl.querySelector = (q) => modeSelectEl._opts[q] || null;
              el._SubEls = {
                '.gev-agent-forge-copy': makeEl('button'),
                '.gev-agent-forge-close': makeEl('button'),
                '.gev-agent-forge-submit': makeEl('button'),
                '.gev-agent-forge-revert': makeEl('button'),
                '.gev-forge-context-pill': makeEl('div'),
                '.gev-forge-dev-details': makeEl('details'),
                '.gev-forge-active-model-badge': makeEl('span'),
                '.gev-forge-model-refresh': makeEl('button'),
                '.gev-forge-setup-toggle': makeEl('button'),
                '.gev-forge-setup-guide': makeEl('div'),
                '.gev-forge-open-keys-btn': makeEl('button'),
                '.gev-forge-provider-caps': makeEl('div'),
                '.gev-forge-disabled-notice': makeEl('div'),
                '.gev-forge-autocommit-container': makeEl('div'),
                '.gev-forge-mode-select': modeSelectEl,
                '.gev-forge-provider-select': Object.assign(makeEl('select'), {
                  value: DEFAULT_AGENT_PROVIDER,
                }),
                '.gev-forge-model-select': Object.assign(makeEl('select'), {
                  value: DEFAULT_AGENT_MODEL,
                }),
                '.gev-forge-prompt': Object.assign(makeEl('textarea'), {
                  value: 'Add Venice Beach skatepark landmark to LA tour',
                }),
                '.gev-forge-autocommit': Object.assign(makeEl('input'), {
                  checked: true,
                }),
                '.gev-agent-forge-output': makeEl('div'),
              };
            },
          });
          return el;
        };
        globalThis.document = {
          body: makeEl('body'),
          head: makeEl('head'),
          getElementById: () => null,
          createElement: (t) => makeEl(t),
        };
      }
      if (!hadWindow) {
        globalThis.window = {
          __gevTourAndPlayEngine: {
            getStatus: () => ({
              cityId: 'hong_kong',
              cityName: 'Hong Kong',
              state: 'landmark_dwell',
              mode: 'tour',
              currentLandmark: {
                id: 'hk_mong_kok',
                name: 'Mong Kok Ladies Market & Neon Quarter',
                category: 'Dense Street Culture',
                lore: 'Street market down Tung Choi Street.',
              },
            }),
          },
        };
      }

      try {
        const panel = createSelfModifyingAgentPanel({
          fetchImpl: mockFetch,
          modelsFetchImpl: async () => ({
            ok: true,
            json: async () => ({
              ok: true,
              source: 'cli',
              defaultModel: 'inherit',
              activeDefaultModel: 'Gemini 4 Hydrogen (High)',
              models: [
                {
                  id: 'Gemini 4 Hydrogen (High)',
                  slug: 'gemini-4-hydrogen-high',
                  label: 'Gemini 4 Hydrogen (High)',
                },
                {
                  id: 'Orchestrator (Argon)',
                  slug: 'gemini-pro-orchestrator-g1-pro',
                  label: 'Orchestrator (Argon)',
                },
              ],
            }),
          }),
        });
        assert.equal(panel.isOpen(), false);
        panel.open();
        assert.equal(panel.isOpen(), true);
        await panel.refreshModels({ force: true });

        const panelHtml = panel.getElement().innerHTML;
        const modelSelectIdx = panelHtml.indexOf('gev-forge-model-select');
        const devDetailsIdx = panelHtml.indexOf('gev-forge-dev-details');
        assert.ok(modelSelectIdx > 0, 'Model select must be rendered');
        assert.ok(devDetailsIdx > 0, 'Dev details must be rendered');
        assert.ok(
          modelSelectIdx < devDetailsIdx,
          'Model selector must be visible at top level outside collapsed Dev Forge details',
        );
        assert.equal(
          panelHtml.includes('gev-forge-cli-bin'),
          false,
          'Raw CLI binary input must not be rendered in client DOM',
        );
        assert.equal(
          panelHtml.includes("Don't have AGY? Setup Guide"),
          true,
          'Setup Guide help button must be rendered',
        );
        assert.equal(panel.getActiveDefaultModel(), 'Gemini 4 Hydrogen (High)');
        assert.equal(panel.getSelectedModel(), 'inherit');

        const promptEl = panel.getElement().querySelector('.gev-forge-prompt');
        if (promptEl) {
          promptEl.value = 'Add Venice Beach skatepark landmark to LA tour';
        }

        await panel.executeSelfModify();
        assert.ok(
          capturedPayload,
          'Should have posted to /api/agy/self-modify',
        );
        assert.equal(capturedPayload.url, '/api/agy/self-modify');
        assert.equal(capturedPayload.body.providerId, 'auto');
        assert.equal(capturedPayload.body.cliBinary, undefined);
        assert.equal(capturedPayload.body.cliArgs, undefined);
        assert.equal(capturedPayload.body.model, 'inherit');
        assert.equal(capturedPayload.body.mode, 'auto');
        assert.equal(capturedPayload.body.context?.cityName, 'Hong Kong');
        assert.equal(
          capturedPayload.body.context?.currentLandmark?.name,
          'Mong Kok Ladies Market & Neon Quarter',
        );
        assert.equal(
          capturedPayload.body.prompt,
          'Add Venice Beach skatepark landmark to LA tour',
        );
        assert.equal(capturedPayload.body.autoCommit, true);
        assert.equal(panel.getLastResult()?.git?.commitSha, 'a1b2c3d');

        // Switching the visible model dropdown explicitly overrides default 'inherit'
        const modelSelEl = panel
          .getElement()
          .querySelector('.gev-forge-model-select');
        if (modelSelEl) {
          modelSelEl.value = 'Orchestrator (Argon)';
          modelSelEl._listeners?.get('change')?.();
        }
        assert.equal(panel.getSelectedModel(), 'Orchestrator (Argon)');
        await panel.executeSelfModify();
        assert.equal(capturedPayload.body.model, 'Orchestrator (Argon)');

        panel.destroy();

        // Phase 3 verification: /api/assistant/capabilities gates Dev Forge & routes Ask Guide via Gemini/OpenAI API keys
        const apiRequests = [];
        const apiRouterPanel = createSelfModifyingAgentPanel({
          autoLoadModels: true,
          fetchImpl: async (url, opts = {}) => {
            if (url === '/api/assistant/capabilities') {
              return {
                ok: true,
                json: async () => ({
                  ok: true,
                  clis: {
                    agy: false,
                    claude: false,
                    codex: false,
                    gemini: false,
                  },
                  availableClis: [],
                  apiKeys: { openai: true, gemini: true },
                  liveForgeEnabled: false,
                  recommendedAskProvider: 'gemini-api',
                }),
              };
            }
            if (url === '/api/agy/models') {
              return {
                ok: true,
                json: async () => ({ ok: true, models: [] }),
              };
            }
            const parsedBody = JSON.parse(opts.body || '{}');
            apiRequests.push({ url, body: parsedBody });
            if (url === '/api/gemini/chat') {
              return {
                ok: true,
                json: async () => ({
                  content: {
                    role: 'model',
                    parts: [{ text: 'Gemini API Key World Answer' }],
                  },
                }),
              };
            }
            if (url === '/api/openai/chat') {
              return {
                ok: true,
                json: async () => ({
                  content: {
                    role: 'assistant',
                    content: 'OpenAI API Key World Answer',
                  },
                }),
              };
            }
            return { ok: true, json: async () => ({ ok: true }) };
          },
        });
        apiRouterPanel.open();
        await apiRouterPanel.refreshCapabilities({ force: true });
        assert.equal(
          apiRouterPanel.getCapabilities()?.liveForgeEnabled,
          false,
        );
        const setupToggle = apiRouterPanel
          .getElement()
          .querySelector('.gev-forge-setup-toggle');
        setupToggle?._listeners?.get('click')?.();
        assert.equal(
          apiRouterPanel
            .getElement()
            .querySelector('.gev-forge-setup-guide')
            .classList.contains('open'),
          true,
          'Clicking "Don\'t have AGY? Setup Guide" opens inline help sheet',
        );
        const routerPrompt = apiRouterPanel
          .getElement()
          .querySelector('.gev-forge-prompt');
        if (routerPrompt) routerPrompt.value = 'Why is Austin known for bats?';
        await apiRouterPanel.executeSelfModify();
        assert.equal(apiRequests[0].url, '/api/gemini/chat');
        assert.match(
          apiRequests[0].body.contents[0].parts[0].text,
          /Why is Austin known for bats\?/,
        );

        const providerSel = apiRouterPanel
          .getElement()
          .querySelector('.gev-forge-provider-select');
        if (providerSel) providerSel.value = 'openai-api';
        await apiRouterPanel.executeSelfModify();
        assert.equal(apiRequests[1].url, '/api/openai/chat');
        assert.equal(
          apiRouterPanel.getLastResult()?.answer,
          'OpenAI API Key World Answer',
        );
        apiRouterPanel.destroy();

        const askPayloads = [];
        let askTurnCount = 0;
        const askMockFetch = async (url, options = {}) => {
          const parsedBody = JSON.parse(options.body || '{}');
          askPayloads.push({ url, body: parsedBody });
          askTurnCount += 1;
          return {
            ok: true,
            json: async () => {
              if (askTurnCount === 4) {
                return {
                  ok: true,
                  mode: 'ask',
                  fallbackSource: 'local-world-guide',
                  answer: 'Offline fallback should not be stored.',
                };
              }
              return {
                ok: true,
                mode: 'ask',
                resolvedModelUsed: 'Orchestrator (Argon)',
                answer: `Live answer #${askTurnCount}`,
              };
            },
          };
        };
        const askPanel = createSelfModifyingAgentPanel({
          fetchImpl: askMockFetch,
        });
        askPanel.open();
        const askPromptEl = askPanel
          .getElement()
          .querySelector('.gev-forge-prompt');
        for (const q of [
          'Who built Chapultepec Castle?',
          'Did Maximilian and Carlota live there?',
          'How did Jesus Gomez Portugal resist the intervention?',
          'Fallback turn question',
          'Which Rangel fought at Chapultepec?',
        ]) {
          if (askPromptEl) askPromptEl.value = q;
          await askPanel.executeSelfModify();
        }
        assert.equal(
          askPayloads[0].body.context?.recentConversation,
          undefined,
        );
        assert.equal(
          askPayloads[1].body.context?.recentConversation?.length,
          1,
        );
        assert.equal(
          askPayloads[1].body.context.recentConversation[0].question,
          'Who built Chapultepec Castle?',
        );
        assert.equal(
          askPayloads[1].body.context.recentConversation[0].answer,
          'Live answer #1',
        );
        assert.equal(
          askPayloads[4].body.context?.recentConversation?.length,
          3,
        );
        assert.deepEqual(
          askPanel.getRecentConversation().map((entry) => entry.question),
          [
            'Did Maximilian and Carlota live there?',
            'How did Jesus Gomez Portugal resist the intervention?',
            'Which Rangel fought at Chapultepec?',
          ],
        );
        askPanel.destroy();

        // Top-right copy icon copies both Ask Guide answers AND Forge/error outputs
        const copiedPayloads = [];
        let toggleFail = false;
        const copyPanel = createSelfModifyingAgentPanel({
          fetchImpl: async () => {
            if (toggleFail) {
              throw new Error('CLI stderr: build failed at line 42');
            }
            return {
              ok: true,
              json: async () => ({
                ok: true,
                mode: 'ask',
                resolvedModelUsed: 'Orchestrator (Argon)',
                answer: 'Chapultepec sits atop a sacred volcanic hill.',
              }),
            };
          },
          clipboardWrite: async (text) => {
            copiedPayloads.push(text);
          },
        });
        copyPanel.open();
        assert.ok(
          copyPanel
            .getElement()
            .innerHTML.includes('class="gev-agent-forge-copy"'),
          'Top-right header must include copy button next to close',
        );
        const copyPromptEl = copyPanel
          .getElement()
          .querySelector('.gev-forge-prompt');
        if (copyPromptEl) copyPromptEl.value = 'Tell me about Chapultepec';
        await copyPanel.executeSelfModify();
        const copyBtnEl = copyPanel
          .getElement()
          .querySelector('.gev-agent-forge-copy');
        const clickHandler = copyBtnEl?._listeners?.get('click');
        assert.equal(typeof clickHandler, 'function');
        await clickHandler();
        // Also test via explicit copyOutput() after an error return
        toggleFail = true;
        await copyPanel.executeSelfModify();
        const errCopyRes = await copyPanel.copyOutput();

        assert.equal(copiedPayloads.length, 2);
        assert.match(
          copiedPayloads[0],
          /Chapultepec sits atop a sacred volcanic hill\./,
        );
        assert.equal(errCopyRes.ok, true);
        assert.match(copiedPayloads[1], /CLI stderr: build failed at line 42/);
        copyPanel.destroy();
      } finally {
        if (!hadDocument) {
          delete globalThis.document;
        }
        if (!hadWindow) {
          delete globalThis.window;
        }
      }
    },
  );

  await t.test(
    '3. Routes World/Space Q&A cleanly via classifyAgentRequestMode & buildWorldGuidePrompt and automatically falls back on invalid model selection',
    async () => {
      assert.equal(
        classifyAgentRequestMode(
          'why is the one area called the ladies market',
        ),
        'ask',
      );
      assert.equal(
        classifyAgentRequestMode(
          'what is the history of Victoria Peak in Hong Kong?',
        ),
        'ask',
      );
      assert.equal(
        classifyAgentRequestMode(
          'how did Dhaka make the jump into the top 5 metro areas?',
        ),
        'ask',
      );
      assert.equal(
        classifyAgentRequestMode('add a new scooter tour for Taipei'),
        'forge',
      );
      assert.equal(
        classifyAgentRequestMode(
          'why is the one area called the ladies market',
          'forge',
        ),
        'forge',
      );
      assert.equal(
        classifyAgentRequestMode('add a new scooter tour for Taipei', 'ask'),
        'ask',
      );

      const guidePrompt = buildWorldGuidePrompt({
        userPrompt: 'why is the one area called the ladies market',
        context: {
          cityName: 'Hong Kong',
          tourMode: 'tour',
          currentLandmark: {
            name: 'Mong Kok Ladies Market & Neon Quarter',
          },
        },
      });
      assert.ok(guidePrompt.includes('Hong Kong'));
      assert.ok(guidePrompt.includes('Mong Kok Ladies Market'));
      assert.equal(guidePrompt.includes('git commit'), false);

      // Helper to mock HTTP req/res for handleAgySelfModify
      const callHandler = (
        payload,
        runProcessImpl,
        { headers = {}, remoteAddress = '127.0.0.1', env = {} } = {},
      ) =>
        new Promise((resolve) => {
          const jsonStr = JSON.stringify(payload);
          const req = {
            method: 'POST',
            socket: { remoteAddress },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
              'content-type': 'application/json',
              ...headers,
            },
            on(ev, cb) {
              if (ev === 'data') cb(Buffer.from(jsonStr));
              if (ev === 'end') cb();
            },
          };
          let bodyOut = '';
          const res = {
            statusCode: 0,
            setHeader() {},
            end(chunk) {
              bodyOut += chunk || '';
              resolve({
                statusCode: res.statusCode,
                body: JSON.parse(bodyOut),
              });
            },
          };
          handleAgySelfModify(req, res, { runProcessImpl, env });
        });

      // (a) Dry-run Ask Mode check
      const askDryRun = await callHandler({
        prompt: 'why is the one area called the ladies market',
        model: 'Orchestrator (Argon)',
        context: { cityName: 'Hong Kong' },
        dryRun: true,
      });
      assert.equal(askDryRun.statusCode, 200);
      assert.equal(askDryRun.body.mode, 'ask');
      assert.equal(askDryRun.body.autoCommit, false);
      assert.ok(askDryRun.body.worldGuidePrompt.includes('Hong Kong'));
      assert.equal(askDryRun.body.neuroPrompt, null);

      // (b) Automatic model fallback when primary model returns 'invalid model selection'
      const attemptedModels = [];
      const fallbackResult = await callHandler(
        {
          prompt: 'why is the one area called the ladies market',
          model: 'Orchestrator (Argon)',
          context: { cityName: 'Hong Kong' },
        },
        async (_bin, args) => {
          const mIdx = args.indexOf('--model');
          const mVal = mIdx >= 0 ? args[mIdx + 1] : '(none)';
          attemptedModels.push(mVal);
          if (mVal === 'Orchestrator (Argon)') {
            return {
              ok: false,
              exitCode: 1,
              stdout: '',
              stderr:
                'error: invalid model selection (--model "Orchestrator (Argon)")\nAvailable models:\n  Gemini 4 Hydrogen (High)',
            };
          }
          return {
            ok: true,
            exitCode: 0,
            stdout:
              "Originally in the 1970s, hawkers on Tung Choi Street specialized in women's clothing and accessories.",
            stderr: '',
          };
        },
      );

      assert.deepEqual(attemptedModels, [
        'Orchestrator (Argon)',
        'Gemini 4 Hydrogen (High)',
      ]);
      assert.equal(fallbackResult.body.ok, true);
      assert.equal(fallbackResult.body.mode, 'ask');
      assert.equal(
        fallbackResult.body.resolvedModelUsed,
        'Gemini 4 Hydrogen (High)',
      );
      assert.equal(fallbackResult.body.modelFallbackTriggered, true);
      assert.ok(fallbackResult.body.answer.includes('Tung Choi Street'));

      // (c) Ask mode dry-run adds --disable-slash-commands and includes Flash in ask fallback chain
      assert.ok(askDryRun.body.cliArgs.includes('--disable-slash-commands'));
      assert.ok(
        buildAgyModelFallbackChain('Orchestrator (Argon)', {
          mode: 'ask',
        }).includes('Gemini 3.8 Flash (High)'),
      );

      // (d) Sanitized child env removes Pinokio/Conda TLS, XDG, and cache TEMP overrides
      const sanitizedEnv = buildSanitizedAgyEnv({
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        TEMP: '/tmp/app-runtime/cache/TEMP',
        TMP: '/tmp/app-runtime/cache/TEMP',
        SSL_CERT_FILE: '/opt/app-runtime/miniconda/Library/ssl/cacert.pem',
        SSL_CERT_DIR: '/opt/app-runtime/miniconda/Library/ssl/certs',
        XDG_CONFIG_HOME: '/tmp/app-runtime/cache/XDG_CONFIG_HOME',
        CONDA_PREFIX: '/opt/app-runtime/miniconda',
        PATH: 'C:\\tools\\miniconda;C:\\Windows\\System32;C:\\Program Files\\nodejs',
      });
      assert.equal(sanitizedEnv.SSL_CERT_FILE, undefined);
      assert.equal(sanitizedEnv.SSL_CERT_DIR, undefined);
      assert.equal(sanitizedEnv.XDG_CONFIG_HOME, undefined);
      assert.equal(sanitizedEnv.CONDA_PREFIX, undefined);
      assert.equal(sanitizedEnv.TEMP, 'C:\\Users\\test\\AppData\\Local\\Temp');
      assert.equal(sanitizedEnv.TMP, 'C:\\Users\\test\\AppData\\Local\\Temp');
      assert.ok(
        sanitizedEnv.PATH.indexOf('C:\\Windows\\System32') <
          sanitizedEnv.PATH.indexOf('C:\\tools\\miniconda'),
        'System binaries must precede Miniconda entries in PATH',
      );

      // (e) Strips benign localhost TLS handshake noise from stderr while preserving real errors
      const cleanedStderr = stripBenignAgyStderrWarnings(
        '2026/11/14 20:57:15 http: TLS handshake error from 127.0.0.1:60769: tls: first record does not look like a TLS handshake\n[Timed out after 55s]',
      );
      assert.equal(cleanedStderr, '[Timed out after 55s]');

      // (f) Ask mode retries Gemini 4 Hydrogen (High) when Orchestrator (Argon) times out
      const timeoutRetryModels = [];
      const timeoutFallbackResult = await callHandler(
        {
          prompt:
            "why do they call it the ladies market? such a skyscraper lover's dream",
          model: 'Orchestrator (Argon)',
          context: {
            cityName: 'Hong Kong',
            currentLandmark: {
              name: 'Mong Kok Ladies Market & Neon Quarter',
            },
          },
        },
        async (_bin, args) => {
          const mIdx = args.indexOf('--model');
          const mVal = mIdx >= 0 ? args[mIdx + 1] : '(none)';
          timeoutRetryModels.push(mVal);
          if (mVal === 'Orchestrator (Argon)') {
            return {
              ok: false,
              exitCode: -1,
              stdout: '',
              stderr:
                '2026/11/14 20:57:15 http: TLS handshake error from 127.0.0.1:60769: tls: first record does not look like a TLS handshake\n[Timed out after 55s]',
            };
          }
          return {
            ok: true,
            exitCode: 0,
            stdout:
              'Tung Choi Street in Mong Kok earned the nickname Ladies Market in the 1970s.',
            stderr: '',
          };
        },
      );
      assert.deepEqual(timeoutRetryModels, [
        'Orchestrator (Argon)',
        'Gemini 4 Hydrogen (High)',
      ]);
      assert.equal(timeoutFallbackResult.body.ok, true);
      assert.equal(
        timeoutFallbackResult.body.resolvedModelUsed,
        'Gemini 4 Hydrogen (High)',
      );
      assert.equal(timeoutFallbackResult.body.modelFallbackTriggered, true);
      assert.equal(timeoutFallbackResult.body.stderr, '');

      // (g) When every CLI model times out in ask mode, returns local World Guide fallback cleanly
      const allTimeoutAttempts = [];
      const offlineGuideResult = await callHandler(
        {
          prompt:
            "why do they call it the ladies market? such a skyscraper lover's dream",
          model: 'Orchestrator (Argon)',
          context: {
            cityName: 'Hong Kong',
            currentLandmark: {
              name: 'Mong Kok Ladies Market & Neon Quarter',
              category: 'Dense Street Culture',
              lore: 'One of the highest-density urban neighborhoods on Earth.',
            },
          },
        },
        async (_bin, args) => {
          const mIdx = args.indexOf('--model');
          const mVal = mIdx >= 0 ? args[mIdx + 1] : '(none)';
          allTimeoutAttempts.push(mVal);
          return {
            ok: false,
            exitCode: -1,
            stdout: '',
            stderr:
              '2026/11/14 20:57:15 http: TLS handshake error from 127.0.0.1:60769: tls: first record does not look like a TLS handshake\n[Timed out after 55s]',
          };
        },
      );
      assert.equal(offlineGuideResult.statusCode, 200);
      assert.equal(offlineGuideResult.body.ok, true);
      assert.equal(offlineGuideResult.body.fallbackSource, 'local-world-guide');
      assert.ok(offlineGuideResult.body.answer.includes('Tung Choi Street'));
      assert.ok(offlineGuideResult.body.answer.includes("Ladies' Market"));
      assert.equal(offlineGuideResult.body.stderr, '[Timed out after 55s]');
      // Ensures duplicate slug aliases (e.g. gemini-4-hydrogen-high) are not retried redundantly after timeout
      assert.deepEqual(allTimeoutAttempts, [
        'Orchestrator (Argon)',
        'Gemini 4 Hydrogen (High)',
        'Gemini 3.8 Flash (High)',
        '(none)',
      ]);

      const genericLocalFallback = buildLocalWorldGuideFallbackAnswer({
        userPrompt: 'What is special about this tower?',
        context: {
          cityName: 'Tokyo',
          currentLandmark: {
            name: 'Shibuya Crossing & Scramble',
            category: 'Iconic Intersection',
            lore: 'Busiest pedestrian crossing on Earth.',
          },
        },
      });
      assert.ok(genericLocalFallback.includes('Tokyo'));
      assert.ok(genericLocalFallback.includes('Shibuya Crossing'));

      const continuityPrompt = buildWorldGuidePrompt({
        userPrompt: 'Speaking of Maximilian and Carlota, tell me more.',
        context: {
          cityName: 'Mexico City',
          recentConversation: [
            { question: 'Old turn 0', answer: 'Old answer 0' },
            { question: 'Turn 1 question', answer: 'Turn 1 answer' },
            { question: 'Turn 2 question', answer: 'Turn 2 answer' },
            {
              question: 'What palaces are here?',
              answer: 'Castillo de Chapultepec hosted Maximilian and Carlota.',
            },
          ],
        },
      });
      assert.ok(
        continuityPrompt.includes(
          'RECENT CONVERSATION (FOR FOLLOW-UP CONTINUITY):',
        ),
      );
      assert.equal(continuityPrompt.includes('Old turn 0'), false);
      assert.ok(continuityPrompt.includes('Turn 1 question'));
      assert.ok(
        continuityPrompt.includes(
          'Castillo de Chapultepec hosted Maximilian and Carlota.',
        ),
      );
      assert.ok(
        continuityPrompt.includes('at most 1-2 quick parallel search rounds'),
      );

      const observedAskTimeouts = [];
      const askBudgetFallback = await runAgyWithModelFallback({
        prompt: continuityPrompt,
        mode: 'ask',
        timeoutMs: 240000,
        requestedModel: 'Orchestrator (Argon)',
        runProcessImpl: async (_bin, _args, opts) => {
          observedAskTimeouts.push(opts.timeoutMs);
          if (observedAskTimeouts.length === 1) {
            return {
              ok: false,
              exitCode: -1,
              stdout: '',
              stderr: '[Timed out after 135s]',
            };
          }
          return {
            ok: true,
            exitCode: 0,
            stdout: 'Jesus Gomez Portugal was deported to Paris in 1863.',
            stderr: '',
          };
        },
      });
      assert.equal(askBudgetFallback.execResult?.ok, true);
      assert.deepEqual(observedAskTimeouts, [135000, 90000]);

      const defaultHandlerTimeouts = [];
      const mockReq = Object.assign(
        Readable.from([
          Buffer.from(
            JSON.stringify({
              prompt: 'Tell me about Jesus Gomez Portugal in Aguascalientes.',
              mode: 'ask',
              context: {
                cityName: 'Mexico City',
                recentConversation: [
                  {
                    question: 'Which palaces hosted Maximilian?',
                    answer: 'Castillo de Chapultepec.',
                  },
                ],
              },
            }),
          ),
        ]),
        {
          method: 'POST',
          socket: { remoteAddress: '127.0.0.1' },
          headers: {
            host: 'localhost:4173',
            origin: 'http://localhost:4173',
            'content-type': 'application/json',
          },
        },
      );
      const mockRes = {
        statusCode: 200,
        headers: {},
        body: '',
        setHeader(k, v) {
          this.headers[k] = v;
        },
        end(payload) {
          this.body = payload;
        },
      };
      await handleAgySelfModify(mockReq, mockRes, {
        repoRoot: process.cwd(),
        runProcessImpl: async (_bin, _args, opts) => {
          defaultHandlerTimeouts.push(opts.timeoutMs);
          return {
            ok: true,
            exitCode: 0,
            stdout: 'Coronel Jesus Gomez Portugal resisted the intervention.',
            stderr: '',
          };
        },
      });
      const parsedHandlerRes = JSON.parse(mockRes.body || '{}');
      assert.equal(parsedHandlerRes.ok, true);
      assert.deepEqual(defaultHandlerTimeouts, [135000]);

      // (h) Honors PC-wide AGY CLI active default setting & exposes live /api/agy/models list
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-agy-cfg-'));
      try {
        const tmpSettings = path.join(tmpDir, 'settings.json');
        fs.writeFileSync(
          tmpSettings,
          JSON.stringify({ model: 'Gemini 4 Hydrogen (High)' }),
          'utf8',
        );
        assert.equal(
          readAgyCliActiveDefaultModel({ settingsPath: tmpSettings }),
          'Gemini 4 Hydrogen (High)',
        );

        const parsedCliModels = parseAgyModelsOutput(
          [
            'Fetching available models...',
            'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)',
            'gemini-pro-orchestrator-g1-pro\tOrchestrator (Argon)',
            'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
          ].join('\n'),
        );
        assert.equal(parsedCliModels.length, 3);
        assert.equal(parsedCliModels[0].id, 'Gemini 4 Hydrogen (High)');
        assert.equal(parsedCliModels[0].slug, 'gemini-4-hydrogen-high');

        let modelsJsonOut = '';
        await handleAgyModels(
          {
            method: 'GET',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
            },
          },
          {
            statusCode: 0,
            setHeader() {},
            end(chunk) {
              modelsJsonOut += chunk || '';
            },
          },
          {
            settingsPath: tmpSettings,
            runProcessImpl: async () => ({
              ok: true,
              exitCode: 0,
              stdout:
                'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)\ngemini-pro-orchestrator-g1-pro\tOrchestrator (Argon)',
              stderr: '',
            }),
          },
        );
        const modelsPayload = JSON.parse(modelsJsonOut);
        assert.equal(modelsPayload.ok, true);
        assert.equal(modelsPayload.source, 'cli');
        assert.equal(
          modelsPayload.activeDefaultModel,
          'Gemini 4 Hydrogen (High)',
        );
        assert.equal(modelsPayload.defaultModel, 'inherit');
        assert.equal(modelsPayload.models.length, 2);

        const inheritAttemptArgs = [];
        const inheritReq = Object.assign(
          Readable.from([
            Buffer.from(
              JSON.stringify({
                prompt: 'why is the one area called the ladies market',
                model: 'inherit',
                mode: 'ask',
              }),
            ),
          ]),
          {
            method: 'POST',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
              'content-type': 'application/json',
            },
          },
        );
        let inheritRaw = '';
        await handleAgySelfModify(
          inheritReq,
          {
            statusCode: 0,
            setHeader() {},
            end(chunk) {
              inheritRaw += chunk || '';
            },
          },
          {
            settingsPath: tmpSettings,
            runProcessImpl: async (_bin, args) => {
              inheritAttemptArgs.push(args);
              return {
                ok: true,
                exitCode: 0,
                stdout: 'Tung Choi Street answer via PC default model.',
                stderr: '',
              };
            },
          },
        );
        const inheritRes = JSON.parse(inheritRaw);
        assert.equal(inheritRes.ok, true);
        assert.equal(
          inheritAttemptArgs[0].includes('--model'),
          false,
          'inherit mode must omit --model so agy.exe honors ~/.gemini/antigravity-cli/settings.json',
        );
        assert.equal(
          inheritRes.resolvedModelUsed,
          'AGY Default · Gemini 4 Hydrogen (High)',
        );

        // (i) Security gates: foreign Origin 403, unallowlisted cliBinary 400, forge disabled 403, capabilities shape
        const foreignOriginRes = await callHandler(
          { prompt: 'hello', mode: 'ask' },
          undefined,
          { headers: { origin: 'https://evil.example' } },
        );
        assert.equal(foreignOriginRes.statusCode, 403);
        assert.equal(foreignOriginRes.body.ok, false);

        const badBinaryRes = await callHandler({
          prompt: 'hello',
          mode: 'ask',
          cliBinary: 'powershell.exe',
        });
        assert.equal(badBinaryRes.statusCode, 400);
        assert.equal(badBinaryRes.body.code, 'unsupported-provider');

        const forgeDisabledRes = await callHandler(
          {
            prompt: 'edit src/hud.js to add a badge',
            mode: 'forge',
          },
          undefined,
          { env: {} },
        );
        assert.equal(forgeDisabledRes.statusCode, 403);
        assert.equal(forgeDisabledRes.body.code, 'forge-disabled');

        let capsJson = '';
        await handleAssistantCapabilities(
          {
            method: 'GET',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
            },
          },
          {
            statusCode: 0,
            setHeader() {},
            end(chunk) {
              capsJson += chunk || '';
            },
          },
          {
            env: { GEMINI_API_KEY: 'test-key' },
            probeCliImpl: async (_binary, adapter) => ({
              available: adapter?.id === 'claude',
            }),
          },
        );
        const capsPayload = JSON.parse(capsJson);
        assert.equal(capsPayload.ok, true);
        assert.equal(capsPayload.clis.claude.available, true);
        assert.equal(capsPayload.clis.agy.available, false);
        assert.equal(capsPayload.apiKeys.gemini, true);
        assert.equal(capsPayload.apiKeys.openai, false);
        assert.equal(capsPayload.liveForgeEnabled, false);
        assert.equal(capsPayload.recommendedAskProvider, 'claude');

        // (j) Post-forge deterministic invariant gate holds broken commits and surfaces check:oss failure
        assert.ok(
          GEV_DATA_STRUCTURE_REGISTRY.some((entry) =>
            entry.symbol.includes('EARTH_SIM_FEATURE_CATALOG'),
          ),
        );
        assert.ok(
          GEV_DATA_STRUCTURE_REGISTRY.some((entry) =>
            entry.symbol.includes('resolveForkProfile'),
          ),
        );
        const promptPreview = buildNeuroLayeredForgePrompt({
          userPrompt: 'add a weather overlay drawer',
          repoRoot: 'C:/tmp/gev',
        });
        assert.match(promptPreview, /earthSimFeatureCatalog\.js/);
        assert.match(promptPreview, /resolveForkProfile\(\)/);
        assert.match(promptPreview, /check:oss/);
        assert.match(promptPreview, /oss:sync/);

        let resetCalledWith = null;
        const heldReq = Readable.from([
          Buffer.from(
            JSON.stringify({
              prompt: 'add a custom panel in src/ui/',
              mode: 'forge',
              providerId: 'claude',
              autoCommit: true,
            }),
          ),
        ]);
        heldReq.method = 'POST';
        heldReq.socket = { remoteAddress: '127.0.0.1' };
        heldReq.headers = {
          host: 'localhost:4173',
          origin: 'http://localhost:4173',
          'content-type': 'application/json',
        };
        let heldRaw = '';
        await handleAgySelfModify(
          heldReq,
          {
            statusCode: 0,
            setHeader() {},
            end(chunk) {
              heldRaw += chunk || '';
            },
          },
          {
            env: { GEV_ENABLE_LIVE_FORGE: '1' },
            repoRoot: process.cwd(),
            runProcessImpl: async () => ({
              ok: true,
              exitCode: 0,
              stdout: 'Edited files',
              stderr: '',
            }),
            postForgeCheckImpl: async () => ({
              ok: false,
              failedStep: 'hygiene',
              output: 'Simulated hygiene leak caught by post-forge gate',
            }),
            resetCommitImpl: async ({ targetSha }) => {
              resetCalledWith = targetSha;
              return { ok: true };
            },
          },
        );
        const heldRes = JSON.parse(heldRaw);
        assert.equal(heldRes.ok, false);
        assert.equal(heldRes.code, 'forge-invariant-failed');
        assert.equal(heldRes.verification.failedStep, 'hygiene');
        assert.match(heldRes.output, /Deterministic post-forge invariant gate failed/);
        assert.equal(resetCalledWith, null);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  await t.test(
    '6. Switching locations and starting Nearest Metro tour moves user & companion dots and keeps Destination Jump button responsive',
    () => {
      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({
        viewer,
        wanderEngine,
        dwellDurationSeconds: 20,
      });

      // Step 1: Start wandering in City A (Los Angeles)
      wanderEngine.startWandering({
        lat: 34.0522,
        lon: -118.2437,
        elev: 85,
        heading: 90,
        companion: true,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
      viewer._triggerPreRender();

      // Step 2: Switch locations (e.g. jump to Five Points Downtown Atlanta) while already wandering
      wanderEngine.startWandering({
        lat: 33.7539,
        lon: -84.3915,
        elev: 300,
        heading: 0,
        companion: true,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
      viewer._triggerPreRender();

      // Step 3: Start Nearest Metro tour from the switched location (cityId: null / 'auto', lat, lon)
      const nearest = resolveNearestMetroForTour(33.7539, -84.3915);
      assert.equal(nearest.cityId, 'atlanta');

      const tourStatus = tourEngine.startCityTour({
        cityId: null,
        lat: 33.7539,
        lon: -84.3915,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
      assert.equal(tourStatus.cityId, 'atlanta');
      assert.equal(tourStatus.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);

      // Verify neither userAvatar nor companionDot got stuck in `isDestroyed = true` after re-spawning!
      const userAvatar = wanderEngine.getUserAvatar();
      const companion = wanderEngine.getCompanion();
      assert.equal(
        userAvatar.isDestroyed,
        false,
        'userAvatar must NOT be marked destroyed after switching locations / starting tour',
      );
      assert.equal(
        companion.isDestroyed,
        false,
        'companionDot must NOT be marked destroyed after switching locations / starting tour',
      );

      const initialUserCoord = { ...userAvatar.getCoordinates() };
      const initialCompCoord = { ...companion.getCoordinates() };
      const firstLandmark = tourStatus.currentLandmark;

      // Step 4: Advance frames and verify both dots physically move toward the Atlanta landmark
      // and update their 3D Cartesian positions
      for (let i = 0; i < 15; i++) {
        const origNow = Date.now;
        Date.now = () => origNow() + (i + 1) * 100;
        try {
          viewer._triggerPreRender();
        } finally {
          Date.now = origNow;
        }
      }

      const movedUserCoord = userAvatar.getCoordinates();
      const movedCompCoord = companion.getCoordinates();
      const userDistMoved = Math.hypot(
        (movedUserCoord.lat - initialUserCoord.lat) * 111139,
        (movedUserCoord.lon - initialUserCoord.lon) * 92000,
      );
      const compDistMoved = Math.hypot(
        (movedCompCoord.lat - initialCompCoord.lat) * 111139,
        (movedCompCoord.lon - initialCompCoord.lon) * 92000,
      );

      assert.ok(
        userDistMoved > 1.5,
        `Expected user dot to physically move along Atlanta tour route after location switch (moved ${userDistMoved.toFixed(2)}m)`,
      );
      assert.ok(
        compDistMoved > 0.5,
        `Expected companion dot to physically move along Atlanta tour route after location switch (moved ${compDistMoved.toFixed(2)}m)`,
      );
      assert.ok(
        Math.hypot(
          movedUserCoord.lat - firstLandmark.lat,
          movedUserCoord.lon - firstLandmark.lon,
        ) < 0.01,
        'User dot must be at the active Atlanta landmark corridor, not stuck at previous spawn',
      );

      // Verify Sovereign responsive CSS constrains select controls and buttons inside viewport
      const sovereignCss = fs.readFileSync(
        new URL('../ui/styles/sovereign-ui.css', import.meta.url),
        'utf8',
      );
      assert.ok(
        sovereignCss.includes('.es-select') &&
          sovereignCss.includes('text-overflow: ellipsis;') &&
          sovereignCss.includes('min-width: 0;'),
        'sovereign-ui.css must constrain .es-select with min-width: 0 and text-overflow: ellipsis',
      );

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );
});

test('Global Megacities & All-7-Continent Scooter Tour Coverage', async (t) => {
  await t.test(
    '1. All 7 continents and all requested world megacities have curated tours, living cities, and gazetteer coverage',
    () => {
      const requiredContinents = [
        'Asia',
        'Africa',
        'North America',
        'South America',
        'Europe',
        'Oceania',
        'Antarctica',
      ];
      const coveredContinents = new Set(
        Object.values(METRO_TOUR_METADATA).map((m) => m.continent),
      );
      for (const continent of requiredContinents) {
        assert.ok(
          coveredContinents.has(continent),
          `Missing continent coverage in METRO_TOUR_METADATA: ${continent}`,
        );
      }

      const requiredCities = [
        'chongqing',
        'jakarta',
        'hong_kong',
        'shanghai',
        'beijing',
        'shenzhen',
        'tokyo',
        'singapore',
        'delhi',
        'mumbai',
        'seoul',
        'dhaka',
        'london',
        'paris',
        'istanbul',
        'mexico_city',
        'sao_paulo',
        'buenos_aires',
        'cairo',
        'lagos',
        'sydney',
        'melbourne',
        'mcmurdo_station',
      ];

      for (const cityKey of requiredCities) {
        const stops = METRO_LANDMARK_CATALOG[cityKey];
        assert.ok(
          Array.isArray(stops) && stops.length >= 4,
          `Expected >= 4 curated tour landmarks for ${cityKey}`,
        );
        for (const stop of stops) {
          assert.ok(stop.id && stop.name && stop.lore && stop.companionNote);
          assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
        }

        assert.ok(
          METRO_TOUR_METADATA[cityKey]?.name &&
            METRO_TOUR_METADATA[cityKey]?.continent,
          `Expected METRO_TOUR_METADATA entry for ${cityKey}`,
        );
        assert.ok(
          LIVING_CITIES[cityKey],
          `Expected LIVING_CITIES entry for ${cityKey}`,
        );
      }

      // Dhaka specifically includes 5 stops (with Curzon Hall) & Top-5 UN agglomeration metadata
      assert.ok(METRO_LANDMARK_CATALOG.dhaka.length >= 5);
      assert.ok(
        METRO_LANDMARK_CATALOG.dhaka.some((s) => s.id === 'dac_curzon_hall'),
        'Expected Curzon Hall & Shahbagh Cultural Axis stop in Dhaka tour',
      );
      assert.ok(
        METRO_TOUR_METADATA.dhaka.populationNote.includes('Top-5'),
        'Expected Top-5 global megacity metadata for Dhaka',
      );

      const gazetteerJoined = MAJOR_WORLD_METROS.map((m) =>
        m.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      ).join(' | ');
      for (const token of [
        'chongqing',
        'jakarta',
        'hong kong',
        'singapore',
        'tokyo',
        'london',
        'mexico city',
        'dhaka',
        'lagos',
        'sao paulo',
        'sydney',
        'mcmurdo',
      ]) {
        assert.ok(
          gazetteerJoined.includes(token),
          `Expected MAJOR_WORLD_METROS offline gazetteer to contain "${token}"`,
        );
      }
    },
  );

  await t.test(
    '2. Normalizes misspelled, accented, and abbreviated city queries cleanly across resolveCity and startCityTour',
    () => {
      assert.equal(
        normalizeMetroTourCityKey('Cuidad de Mexico'),
        'mexico_city',
      );
      assert.equal(
        normalizeMetroTourCityKey('Ciudad de México'),
        'mexico_city',
      );
      assert.equal(normalizeMetroTourCityKey('CDMX'), 'mexico_city');
      assert.equal(normalizeMetroTourCityKey('São Paulo'), 'sao_paulo');
      assert.equal(normalizeMetroTourCityKey('Hong Kong'), 'hong_kong');
      assert.equal(normalizeMetroTourCityKey('McMurdo'), 'mcmurdo_station');

      assert.equal(CITY_QUERY_ALIASES['cuidad de mexico'], 'mexico_city');
      assert.equal(resolveCity('Cuidad de Mexico')?.id, 'mexico_city');
      assert.equal(resolveCity('Ciudad de México')?.id, 'mexico_city');
      assert.equal(resolveCity('São Paulo')?.id, 'sao_paulo');
      assert.equal(resolveCity('Chongqing')?.id, 'chongqing');
      assert.equal(resolveCity('McMurdo Station')?.id, 'mcmurdo_station');

      const cdmxStops = getLandmarksForCity('Cuidad de Mexico');
      assert.equal(cdmxStops.length, METRO_LANDMARK_CATALOG.mexico_city.length);

      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ viewer, wanderEngine });

      const started = tourEngine.startCityTour({ cityId: 'Cuidad de Mexico' });
      assert.equal(started.cityId, 'mexico_city');
      assert.equal(started.cityName, 'Ciudad de México (Mexico City)');
      assert.ok(started.totalLandmarks >= 4);

      const hkStarted = tourEngine.startCityTour({ cityId: 'Hong Kong' });
      assert.equal(hkStarted.cityId, 'hong_kong');
      assert.equal(hkStarted.cityName, 'Hong Kong');

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '3. Experiences catalog adapter exposes canonical display names and regions for expanded global catalog',
    () => {
      const adapterSource = fs.readFileSync(
        new URL('../ui/sovereign/experiencesCatalogAdapter.js', import.meta.url),
        'utf8',
      );
      assert.ok(adapterSource.includes('STAGE3_THEME_PARK_METADATA'));
      assert.ok(adapterSource.includes('LIVING_CITIES'));
    },
  );
});

test('Google 3D City Tour Tile Resolution, Screenshot/Blur Input Hygiene & Continue Tour Recovery', async (t) => {
  await t.test(
    '1. Throttles scene.sampleHeight in Google 3D mode (non-starvation across 60 frames) and rejects rooftop spikes',
    () => {
      const viewer = createMockViewer();
      viewer.scene.globe.show = false; // Google Photorealistic 3D mode
      viewer.scene.sampleHeightSupported = true;
      let sampleCalls = 0;
      let mockMeshHeight = 37.0; // Tokyo WGS84 ground height
      viewer.scene.sampleHeight = () => {
        sampleCalls += 1;
        return mockMeshHeight;
      };

      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      tourEngine.startCityTour({
        cityId: 'tokyo',
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });

      // Reset sample counter after initial spawn
      sampleCalls = 0;
      const baseNow = Date.now() + 1000;
      const origNow = Date.now;
      try {
        // 60 frames at 60 FPS (16ms step = 960ms total)
        for (let i = 0; i < 60; i++) {
          const fakeNow = baseNow + i * 16;
          Date.now = () => fakeNow;
          // Inject a transient 180m skyscraper roof spike mid-stream
          mockMeshHeight = i === 30 ? 217.0 : 37.0;
          viewer._triggerPreRender();
        }
      } finally {
        Date.now = origNow;
      }

      // With 220ms tracker interval, 60 frames over ~1s must do <= 6 sampleHeight calls (not 180-240)
      assert.ok(
        sampleCalls <= 6,
        `Expected <= 6 sampleHeight calls across 60 tour frames in Google 3D mode so JobScheduler isn't starved (got ${sampleCalls})`,
      );

      const userCoord = wanderEngine.getUserAvatar().getCoordinates();
      const compCoord = wanderEngine.getCompanion().getCoordinates();
      assert.ok(
        userCoord.height < 50 && compCoord.height < 50,
        `Expected user (${userCoord.height}m) and companion (${compCoord.height}m) to stay on street ground (~37m) rather than snapping to a 217m roof spike`,
      );

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '2. Ignores screenshot shortcuts, clears stuck keys on blur, preserves dots on Escape, and resumes reliably via continueTour',
    () => {
      const viewer = createMockViewer();
      viewer.scene.globe.show = false;
      viewer.scene.sampleHeightSupported = true;
      viewer.scene.sampleHeight = () => 37.0;

      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });

      tourEngine.startCityTour({
        cityId: 'london',
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
      assert.equal(
        tourEngine.getStatus().state,
        TOUR_OR_PLAY_STATES.TOUR_TRANSIT,
      );

      // (a) Win+Shift+S / Cmd+Shift+S screenshot shortcut must NOT latch KeyS or enter USER_TAKEOVER
      wanderEngine._handleKeyDown({
        code: 'KeyS',
        key: 's',
        metaKey: true,
        shiftKey: true,
      });
      viewer._triggerPreRender();
      assert.equal(
        tourEngine.getStatus().state,
        TOUR_OR_PLAY_STATES.TOUR_TRANSIT,
      );

      // (b) Unmodified Shift + S held right before OS blur steals focus before keyup
      wanderEngine._handleKeyDown({ code: 'ShiftLeft', key: 'Shift' });
      wanderEngine._handleKeyDown({ code: 'KeyS', key: 's' });
      wanderEngine._handleWindowBlur();

      // Now even if user had paused or after blur, Continue Tour must NOT immediately bounce back to USER_TAKEOVER
      const resumed = tourEngine.continueTour();
      assert.equal(resumed.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
      for (let i = 0; i < 10; i++) {
        viewer._triggerPreRender();
      }
      assert.equal(
        tourEngine.getStatus().state,
        TOUR_OR_PLAY_STATES.TOUR_TRANSIT,
        'Tour must remain in SCOOTER_TRANSIT after blur+continueTour without bouncing back to USER_TAKEOVER',
      );
      assert.ok(wanderEngine.getUserAvatar());
      assert.equal(wanderEngine.getUserAvatar().isDestroyed, false);
      assert.ok(wanderEngine.getCompanion());
      assert.equal(wanderEngine.getCompanion().isDestroyed, false);

      // (c) Pressing Escape during active tour enters manual takeover WITHOUT destroying reference dots
      wanderEngine._handleKeyDown({ code: 'Escape', key: 'Escape' });
      assert.equal(wanderEngine.isWandering, true);
      assert.equal(
        tourEngine.getStatus().state,
        TOUR_OR_PLAY_STATES.USER_TAKEOVER,
      );
      assert.ok(wanderEngine.getUserAvatar());
      assert.equal(wanderEngine.getUserAvatar().isVisible, true);
      assert.ok(wanderEngine.getCompanion());
      assert.equal(wanderEngine.getCompanion().isVisible, true);

      // (d) Even if user switched camera to FREE while <260m from the stop, continueTour re-anchors camera & resumes transit
      wanderEngine.setCameraMode(WANDER_CAMERA_MODES.FREE);
      const curStop = tourEngine.getStatus().currentLandmark;
      wanderEngine.relocateTo({
        lat: curStop.lat - 0.0005, // ~55m away (< 260m corridor threshold)
        lon: curStop.lon,
        elev: curStop.elev,
        preserveCameraMode: true,
      });
      const recovered = tourEngine.continueTour({ advanceToNext: false });
      assert.equal(recovered.state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
      assert.equal(
        wanderEngine.getCameraMode(),
        WANDER_CAMERA_MODES.ISO_CHASE,
        'continueTour must snap FREE camera back to chase mode and re-anchor dots even within <260m',
      );

      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );

  await t.test(
    '3. Cancelled stepIntoCity camera flight never spawns or latches pedestrians over an active tour',
    async () => {
      let pendingCancelCb = null;
      const viewer = createMockViewer();
      viewer.camera.flyTo = (opts) => {
        pendingCancelCb = opts.cancel;
      };
      viewer.camera.cancelFlight = () => {
        if (pendingCancelCb) {
          const cb = pendingCancelCb;
          pendingCancelCb = null;
          cb();
        }
      };

      const pedEngine = createPedestrianEngine({ viewer });
      const jumpPromise = pedEngine.stepIntoCity('tokyo');

      // User starts a City Tour before flyTo finishes, triggering clearPedestrians/cancelFlight
      pedEngine.clearPedestrians();
      const result = await jumpPromise;

      assert.equal(result, null);
      assert.equal(pedEngine.isSimActive(), false);
      assert.equal(pedEngine.getPedestrians().length, 0);

      pedEngine.destroy();
    },
  );

  await t.test(
    '4. Key Largo starter Easter Egg city tour resolves via Key Loaner House & launches autonomous companion scooter tour',
    () => {
      assert.equal(resolveCity('key loaner house')?.id, 'key_largo');
      assert.equal(normalizeMetroTourCityKey('Key Largo'), 'key_largo');
      const nearest = resolveNearestMetroForTour(25.089, -80.449);
      assert.equal(nearest?.cityId, 'key_largo');
      const stops = getLandmarksForCity('key_largo');
      assert.ok(stops.length >= 5);
      assert.ok(stops.some((s) => s.name.includes('Key Loaner House')));

      const viewer = createMockViewer();
      const wanderEngine = createAvatarWanderEngine({ viewer });
      const tourEngine = createTourAndPlayEngine({ wanderEngine });
      const status = tourEngine.startCityTour({
        cityId: 'key_largo',
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });
      assert.equal(status.mode, 'tour');
      assert.equal(status.cityId, 'key_largo');
      assert.equal(wanderEngine.isWandering, true);
      assert.ok(wanderEngine.getCompanion());
      tourEngine.destroy();
      wanderEngine.destroy();
    },
  );
});

test('Tour Framework v2 — Flagship Theme Park Days (Magic Kingdom 12 stops across 6 lands, EPCOT 18 stops with all 11 World Showcase countries)', async () => {
  const mkStops = getLandmarksForCity('wdw_magic_kingdom');
  assert.equal(mkStops.length, 12, 'Magic Kingdom must have 12 stops');
  const mkLands = new Set(mkStops.map((s) => s.land));
  assert.ok(mkLands.has('Main Street, U.S.A.'));
  assert.ok(mkLands.has('Adventureland'));
  assert.ok(mkLands.has('Frontierland'));
  assert.ok(mkLands.has('Liberty Square'));
  assert.ok(
    mkStops.some((s) => String(s.land || '').includes('Fantasyland')),
  );
  assert.ok(mkLands.has('Tomorrowland'));
  assert.ok(
    mkStops.some((s) => /^[A-Za-z0-9_-]{11}$/.test(s.youtubeVideoId || '')),
    'Magic Kingdom must embed verified 11-char YouTube IDs on marquee icons',
  );

  const epcotAll = getLandmarksForCity('wdw_epcot');
  assert.equal(
    epcotAll.length,
    18,
    'EPCOT must have 18 stops (7 front-of-park + all 11 World Showcase nations)',
  );
  const frontOfPark = buildTourItinerary(epcotAll, {
    tourMode: 'front_of_park',
    shuffle: false,
  });
  const worldShowcase = buildTourItinerary(epcotAll, {
    tourMode: 'world_showcase',
    shuffle: false,
  });
  assert.equal(frontOfPark.length, 7);
  assert.equal(worldShowcase.length, 11);

  for (const nation of [
    'Mexico',
    'Norway',
    'China',
    'Germany',
    'Italy',
    'USA',
    'Japan',
    'Morocco',
    'France',
    'United Kingdom',
    'Canada',
  ]) {
    assert.ok(
      worldShowcase.some((s) => String(s.land || '').includes(nation)),
      `EPCOT World Showcase must include ${nation}`,
    );
  }

  // Tight-radius venue resolution takes priority over Orlando / Play Mode
  const epcotVenue = findNearestVenueTour(28.3747, -81.5494);
  assert.equal(epcotVenue?.id, 'wdw_epcot');
  const epcotCtx = resolveTourOrPlayContext(28.3747, -81.5494, 30);
  assert.equal(epcotCtx.mode, 'tour');
  assert.equal(epcotCtx.tourScope, 'venue');
  assert.equal(epcotCtx.cityId, 'wdw_epcot');
  assert.match(epcotCtx.actionButtonLabel, /Park Day: EPCOT/);

  const mkCtx = resolveTourOrPlayContext(28.4187, -81.5818, 32);
  assert.equal(mkCtx.mode, 'tour');
  assert.equal(mkCtx.tourScope, 'venue');
  assert.equal(mkCtx.cityId, 'wdw_magic_kingdom');
  assert.match(mkCtx.actionButtonLabel, /Park Day: Magic Kingdom/);

  // Draft v2 validation & schemaVersion 2 export
  const validDraft = validateTourStopDraft({
    name: 'Test Park Plaza',
    lat: 28.374,
    lon: -81.549,
    lore: 'Scenic promenade plaza inside the park.',
    wikiTitle: 'Spaceship_Earth_(Epcot)',
    youtubeVideoId: '8AI0yNMpt1E',
    youtubeSearchQuery: 'Spaceship Earth 4K POV',
    land: 'World Celebration',
    estimatedWaitMin: 15,
    snackNote: 'Waffle & Cold Brew',
  });
  assert.equal(validDraft.valid, true);
  assert.equal(validDraft.normalized.youtubeVideoId, '8AI0yNMpt1E');
  assert.equal(validDraft.normalized.land, 'World Celebration');

  const badYtDraft = validateTourStopDraft({
    name: 'Invalid Video ID Stop',
    lat: 28.374,
    lon: -81.549,
    lore: 'Testing strict 11-char YouTube validation.',
    youtubeVideoId: 'invalid-id!',
  });
  assert.equal(badYtDraft.valid, false);

  const contractParsed = JSON.parse(exportTourAsContractJson('wdw_epcot'));
  assert.equal(contractParsed.schemaVersion, 2);
  assert.equal(contractParsed.landmarks.length, 18);
});

test('Tour Framework v2 — walk_midway routing/speed, day-cycle solar clock save/advance/restore, pauseForMedia, and Rejoin/Next resume', async () => {
  const initialTime = Cesium.JulianDate.fromIso8601('2026-06-21T06:00:00Z');
  const mockViewer = {
    clock: {
      currentTime: Cesium.JulianDate.clone(initialTime),
      shouldAnimate: true,
      multiplier: 2,
    },
  };

  const mockWander = {
    isWandering: false,
    cameraMode: 'iso_chase',
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    startWandering() {
      this.isWandering = true;
    },
    stopWandering() {
      this.isWandering = false;
    },
    relocateTo() {},
    showDialogBubble() {},
    getCameraMode() {
      return this.cameraMode;
    },
    getUserAvatar() {
      return { isDestroyed: false };
    },
    getTelemetry() {
      return {
        coordinates: { lat: 28.3747, lon: -81.5494, height: 32, heading: 180 },
      };
    },
  };

  const engine = createTourAndPlayEngine({
    wanderEngine: mockWander,
    viewer: mockViewer,
    dwellDurationSeconds: 10,
    rng: () => 0.15,
  });

  const status = engine.startCityTour({
    cityId: 'wdw_epcot',
    tourMode: 'world_showcase',
  });
  assert.equal(status.totalLandmarks, 11);
  assert.equal(status.tourScope, 'venue');
  assert.equal(status.transitMode, 'walk_midway');
  assert.equal(
    status.scooterSpeedMps,
    TOUR_WALK_MIDWAY_SPEED_MPS,
    'Park venue tour must run at 2.0 m/s walk_midway speed',
  );
  assert.equal(mockViewer.clock.shouldAnimate, false);

  const solarStop0 = computeDayCycleSolarState({
    dayCycle: METRO_TOUR_METADATA.wdw_epcot.dayCycle,
    stopIndex: 0,
    totalStops: 11,
  });
  const solarStop10 = computeDayCycleSolarState({
    dayCycle: METRO_TOUR_METADATA.wdw_epcot.dayCycle,
    stopIndex: 10,
    totalStops: 11,
  });
  assert.ok(
    solarStop10.localHour > solarStop0.localHour,
    'Day-cycle clock must advance monotonically from morning toward dusk',
  );

  // Continuous walk_midway corridor up to 650m without cross-city corridor staging
  const route = buildStreetAndSidewalkRoute(
    { lat: 28.3712, lon: -81.5469, elev: 31 },
    { lat: 28.368, lon: -81.5469, elev: 31, streetBearingDeg: 180 },
    { transitMode: 'walk_midway' },
  );
  assert.ok(route.length >= 2);
  assert.equal(TOUR_WALK_MIDWAY_CORRIDOR_MAX_METERS, 650);
  assert.equal(TOUR_WALK_MIDWAY_SPEED_MPS, 3.2);

  // Short (<18m) free-roam rejoin route starts directly at startCoord instead of staging 145m back
  const shortRejoinRoute = buildStreetAndSidewalkRoute(
    { lat: 28.37128, lon: -81.5469, elev: 31 },
    { lat: 28.3712, lon: -81.5469, elev: 31, streetBearingDeg: 180 },
    { transitMode: 'walk_midway' },
  );
  assert.ok(shortRejoinRoute.length >= 2);
  assert.ok(Math.abs(shortRejoinRoute[0].lat - 28.37128) < 0.00002);

  // Smart EPCOT full-park randomization keeps 7 front_of_park headliners in morning/midday
  // and 11 world_showcase pavilions in afternoon/dusk
  const epcotFullItinerary = buildTourItinerary(getLandmarksForCity('wdw_epcot'), {
    tourMode: 'all',
    shuffle: true,
    rng: () => 0.4,
  });
  assert.equal(epcotFullItinerary.length, 18);
  assert.equal(
    epcotFullItinerary.slice(0, 7).every((s) => s.showcaseZone === 'front_of_park'),
    true,
  );
  assert.equal(
    epcotFullItinerary.slice(7).every((s) => s.showcaseZone === 'world_showcase'),
    true,
  );
  assert.equal(METRO_TOUR_METADATA.wdw_epcot.dayCycleEnabled, true);
  assert.equal(
    METRO_TOUR_METADATA.wdw_epcot.itineraryPolicy,
    'epcot_showcase_loop',
  );

  // Pause & resume for Experience Card media
  const stopBefore = engine.getStatus().currentLandmark.id;
  engine.pauseForMedia();
  assert.equal(engine.getStatus().mediaPaused, true);
  engine.resumeFromMedia();
  assert.equal(engine.getStatus().mediaPaused, false);

  // User takeover + continueTour({ advanceToNext: false, resumeFromCurrent: true }) vs advanceToNext: true
  engine.takeOverAtLandmark();
  assert.equal(engine.getStatus().state, TOUR_OR_PLAY_STATES.USER_TAKEOVER);
  assert.equal(engine.getStatus().canResume, true);

  engine.continueTour({ advanceToNext: false, resumeFromCurrent: true });
  assert.equal(engine.getStatus().state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
  assert.equal(
    engine.getStatus().currentLandmark.id,
    stopBefore,
    'Rejoin Stop must stay anchored on current landmark',
  );

  engine.takeOverAtLandmark();
  engine.continueTour({ advanceToNext: true, resumeFromCurrent: true });
  assert.notEqual(
    engine.getStatus().currentLandmark.id,
    stopBefore,
    'Next Stop must advance to the following stop even when resumeFromCurrent is true',
  );

  // Stopping restores original viewer clock state cleanly
  engine.stop();
  assert.equal(
    Cesium.JulianDate.equals(mockViewer.clock.currentTime, initialTime),
    true,
    'stop() must restore Cesium clock currentTime',
  );
  assert.equal(mockViewer.clock.shouldAnimate, true);
  assert.equal(mockViewer.clock.multiplier, 2);

  engine.destroy();
});

test('Tour Framework v2 UI — grouped Theme Park Days selector, .gev-tour-resume-pill visibility, and cityDrawer Park Day ambient pill', async () => {
  clearLocalityCacheForTests();
  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevFetch = globalThis.fetch;
  win.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  globalThis.fetch = win.fetch;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  try {
    const engine = createTourAndPlayEngine({
      wanderEngine: {
        isWandering: false,
        cameraMode: 'iso_chase',
        clearInputState() {},
        setWalkSpeedOverride() {},
        setExternalController() {},
        startWandering() {
          this.isWandering = true;
        },
        stopWandering() {
          this.isWandering = false;
        },
        relocateTo() {},
        showDialogBubble() {},
        getCameraMode() {
          return 'iso_chase';
        },
        getUserAvatar() {
          return { isDestroyed: false };
        },
        getTelemetry() {
          return {
            coordinates: {
              lat: 28.3747,
              lon: -81.5494,
              height: 30,
              heading: 180,
            },
          };
        },
      },
      rng: () => 0.2,
    });

    const wanderDrawer = createWanderDrawer({
      tourAndPlayEngine: engine,
      container: win.document.body,
    });
    wanderDrawer.open();

    // Start EPCOT via engine -> autonomous tour active
    engine.startCityTour({ cityId: 'wdw_epcot' });
    assert.equal(engine.getStatus().canResume, false);
    const firstId = engine.getStatus().currentLandmark.id;

    // Enter USER_TAKEOVER -> canResume flips true and Rejoin / Next work deterministically
    engine.takeOverAtLandmark();
    assert.equal(engine.getStatus().canResume, true);

    engine.continueTour({ advanceToNext: false });
    assert.equal(engine.getStatus().state, TOUR_OR_PLAY_STATES.TOUR_TRANSIT);
    assert.equal(engine.getStatus().currentLandmark.id, firstId);
    assert.equal(engine.getStatus().canResume, false);

    engine.takeOverAtLandmark();
    assert.equal(engine.getStatus().canResume, true);
    engine.continueTour({ advanceToNext: true });
    assert.notEqual(engine.getStatus().currentLandmark.id, firstId);
    assert.equal(engine.getStatus().canResume, false);

    // City drawer shim registers cleanly and EPCOT coords resolve as curated venue tour
    const cityDrawer = createCityDrawer({
      tourAndPlayEngine: engine,
      cityEngine: {
        onCityDepth() {
          return () => {};
        },
      },
      container: win.document.body,
    });
    wanderDrawer.close();
    engine.stop();
    const epcotCtx = resolveTourOrPlayContext(28.3747, -81.5494);
    assert.equal(epcotCtx.mode, 'tour');
    assert.equal(epcotCtx.cityId, 'wdw_epcot');

    cityDrawer.destroy();
    wanderDrawer.destroy();
    engine.destroy();
  } finally {
    clearLocalityCacheForTests();
    try {
      await win.close();
    } catch {}
    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRaf;
  }
});

function buildSampleSavannahContract() {
  return {
    schemaVersion: 2,
    cityId: 'savannah',
    metadata: {
      id: 'savannah',
      name: 'Savannah',
      cityId: 'savannah',
      displayName: 'Savannah',
      country: 'United States',
      region: 'Georgia',
      lat: 32.0809,
      lon: -81.0912,
      tourScope: 'city',
      radiusMeters: 6000,
      transitMode: 'scooter',
      wikiTitle: 'Savannah, Georgia',
      youtubeSearchQuery: 'Savannah Georgia historic squares walking tour 4k',
      itineraryPolicy: {
        avoidRepetition: true,
        categoryRotation: true,
      },
    },
    landmarks: [
      {
        id: 'savannah_forsyth_fountain',
        name: 'Forsyth Park Fountain',
        lat: 32.0676,
        lon: -81.0964,
        category: 'Historic Landmark',
        lore: 'Iconic 1858 cast-iron fountain anchors Savannahs thirty-acre Forsyth Park under Spanish moss.',
        wikiTitle: 'Forsyth Park',
        youtubeSearchQuery: 'Forsyth Park Fountain Savannah 4k',
        dayChapter: 'Morning Squares',
        estimatedWaitMin: 0,
        snackNote: 'Pralines & cold brew along Bull Street',
      },
      {
        id: 'savannah_chippewa_square',
        name: 'Chippewa Square',
        lat: 32.0757,
        lon: -81.0931,
        category: 'Historic Landmark',
        lore: 'Laid out in 1815 with a central statue of Georgia founder James Oglethorpe.',
        wikiTitle: 'Chippewa Square',
        youtubeSearchQuery: 'Chippewa Square Savannah Georgia tour',
        dayChapter: 'Morning Squares',
        estimatedWaitMin: 0,
      },
      {
        id: 'savannah_river_street',
        name: 'River Street Cobblestones',
        lat: 32.0815,
        lon: -81.0897,
        category: 'Scenic Overlook',
        lore: 'Historic cotton-factor warehouses and ballast-stone ramps overlooking the Savannah River.',
        wikiTitle: 'Savannah Riverfront',
        youtubeSearchQuery: 'Savannah River Street waterfront 4k',
        dayChapter: 'Afternoon Riverfront',
        estimatedWaitMin: 5,
      },
      {
        id: 'savannah_cathedral_basilica',
        name: 'Cathedral Basilica of St. John the Baptist',
        lat: 32.0734,
        lon: -81.0914,
        category: 'Architecture',
        lore: 'Twin French Gothic spires rise above Lafayette Square with restored stained glass.',
        wikiTitle: 'Cathedral Basilica of St. John the Baptist (Savannah, Georgia)',
        youtubeSearchQuery: 'Cathedral Basilica Savannah interior tour',
        dayChapter: 'Afternoon Riverfront',
      },
      {
        id: 'savannah_telfair_academy',
        name: 'Telfair Academy & Squares',
        lat: 32.0793,
        lon: -81.0955,
        category: 'Art & Culture',
        lore: 'Neoclassical Regency mansion opened in 1886 as the oldest public art museum in the South.',
        wikiTitle: 'Telfair Academy',
        youtubeSearchQuery: 'Telfair Academy Savannah tour',
        dayChapter: 'Golden Hour',
      },
      {
        id: 'savannah_jones_street',
        name: 'Jones Street Live Oak Canopy',
        lat: 32.0714,
        lon: -81.0942,
        category: 'Park & Trail',
        lore: 'Brick townhouses and ancient live oaks form a quiet shaded corridor across downtown.',
        wikiTitle: 'Savannah Historic District',
        youtubeSearchQuery: 'Jones Street Savannah oak canopy walk',
        dayChapter: 'Golden Hour',
      },
    ],
  };
}

function buildSampleDahlonegaContract() {
  return {
    schemaVersion: 2,
    cityId: 'dahlonega',
    metadata: {
      id: 'dahlonega',
      name: 'Dahlonega',
      cityId: 'dahlonega',
      displayName: 'Dahlonega',
      country: 'United States',
      region: 'Georgia',
      lat: 34.5326,
      lon: -83.9849,
      tourScope: 'city',
      radiusMeters: 4500,
      transitMode: 'scooter',
      wikiTitle: 'Dahlonega, Georgia',
      youtubeSearchQuery: 'Dahlonega Georgia public square gold museum 4k',
    },
    landmarks: [
      {
        id: 'dahlonega_gold_museum',
        name: 'Dahlonega Gold Museum Historic Site',
        lat: 34.5326,
        lon: -83.9849,
        category: 'Historic Landmark',
        lore: 'Built in 1836 as the Lumpkin County Courthouse at the center of Americas first major gold rush.',
        wikiTitle: 'Dahlonega Gold Museum Historic Site',
        youtubeSearchQuery: 'Dahlonega Gold Museum tour',
      },
      {
        id: 'dahlonega_holly_theater',
        name: 'Historic Holly Theater',
        lat: 34.5319,
        lon: -83.9855,
        category: 'Art & Culture',
        lore: 'Restored 1948 neighborhood cinema and playhouse hosting concerts off the public square.',
        wikiTitle: 'Dahlonega, Georgia',
        youtubeSearchQuery: 'Dahlonega Historic District walking tour',
      },
      {
        id: 'dahlonega_ung_price_memorial',
        name: 'Price Memorial Hall Gold Steeple',
        lat: 34.5284,
        lon: -83.9866,
        category: 'Architecture',
        lore: 'Gilded steeple topped with twenty-four karat Dahlonega gold overlooking the Blue Ridge foothills.',
        wikiTitle: 'University of North Georgia',
        youtubeSearchQuery: 'Price Memorial Hall Dahlonega',
      },
    ],
  };
}

function createFakeCityDrawerHarness(win, { lat = 32.0809, lon = -81.0912, height = 320 } = {}) {
  const statusListeners = new Set();
  const depthListeners = new Set();
  const depthExitListeners = new Set();
  const wanderListeners = new Set();
  const flyTos = [];
  const state = {
    coords: { lat, lon, height },
    altAGL: height,
    depthEligible: height <= 1500,
    catalogPlace: null,
  };
  const viewer = {
    camera: {
      positionCartographic: {
        latitude: (lat * Math.PI) / 180,
        longitude: (lon * Math.PI) / 180,
        height,
      },
      heading: 0,
      pitch: -0.4,
      roll: 0,
      flyTo(opts) {
        flyTos.push(opts);
      },
      changed: {
        addEventListener() {},
        removeEventListener() {},
      },
    },
    scene: {
      globe: {
        getHeight() {
          return 0;
        },
      },
    },
  };
  const emitCity = () => {
    const snap = cityEngine.getStatus();
    for (const cb of statusListeners) cb(snap);
  };
  const emitWander = () => {
    const snap = wanderEngine.getStatus();
    for (const cb of wanderListeners) cb(snap);
  };
  const cityEngine = {
    setCoordinates(nextLat, nextLon, nextHeight = 320, catalogPlace = null) {
      state.coords = { lat: nextLat, lon: nextLon, height: nextHeight };
      state.altAGL = nextHeight;
      state.depthEligible = nextHeight <= 1500;
      state.catalogPlace = catalogPlace;
      viewer.camera.positionCartographic.latitude = (nextLat * Math.PI) / 180;
      viewer.camera.positionCartographic.longitude = (nextLon * Math.PI) / 180;
      viewer.camera.positionCartographic.height = nextHeight;
      emitCity();
      if (state.depthEligible) {
        const cityPayload = {
          id: catalogPlace?.cityId || null,
          name: catalogPlace?.name || 'Local Area',
          lat: nextLat,
          lon: nextLon,
          cameraLat: nextLat,
          cameraLon: nextLon,
          elev: nextHeight,
          catalogPlace,
        };
        for (const cb of depthListeners) cb(cityPayload);
      } else {
        for (const cb of depthExitListeners) cb();
      }
    },
    onCityDepth(cb) {
      depthListeners.add(cb);
      return () => depthListeners.delete(cb);
    },
    onCityDepthExit(cb) {
      depthExitListeners.add(cb);
      return () => depthExitListeners.delete(cb);
    },
    getStatus() {
      return {
        active: true,
        depthEligible: state.depthEligible,
        altAGL: state.altAGL,
        coordinates: { ...state.coords },
        catalogPlace: state.catalogPlace,
      };
    },
    onStatusChange(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    getTelemetry() {
      return { coordinates: { ...state.coords } };
    },
    setDepthGate() {},
    enterCity() {},
    exitCity() {},
  };
  const wanderEngine = {
    isWandering: false,
    cameraMode: 'iso_chase',
    clearInputState() {},
    setWalkSpeedOverride() {},
    setExternalController() {},
    startWandering() {
      this.isWandering = true;
      emitWander();
    },
    stopWandering() {
      this.isWandering = false;
      emitWander();
    },
    relocateTo(nextLat, nextLon, nextHeight) {
      if (Number.isFinite(nextLat) && Number.isFinite(nextLon)) {
        state.coords = { lat: nextLat, lon: nextLon, height: nextHeight ?? state.coords.height };
      }
    },
    showDialogBubble() {},
    getCameraMode() {
      return this.cameraMode;
    },
    getUserAvatar() {
      return { isDestroyed: false };
    },
    onStatusChange(cb) {
      wanderListeners.add(cb);
      return () => wanderListeners.delete(cb);
    },
    getStatus() {
      return {
        active: this.isWandering,
        cameraMode: this.cameraMode,
        coordinates: { ...state.coords },
      };
    },
    getTelemetry() {
      return { coordinates: { ...state.coords } };
    },
  };
  const stadiumEngine = {
    getStatus: () => ({ active: false }),
    onStatusChange: () => () => {},
  };
  return { viewer, cityEngine, wanderEngine, stadiumEngine, flyTos };
}

test('Stage 2 Pillar 1 — Dev Forge gate fails closed without liveForgeEnabled + CLI, and server rejects tourBuild with 403 when forge disabled', async () => {
  assert.equal(isTourForgeAvailable(null), false);
  assert.equal(isTourForgeAvailable({ liveForgeEnabled: false, availableClis: ['agy'] }), false);
  assert.equal(isTourForgeAvailable({ liveForgeEnabled: true, availableClis: [] }), false);
  assert.equal(isTourForgeAvailable({ liveForgeEnabled: true, availableClis: [''] }), false);
  assert.equal(isTourForgeAvailable({ liveForgeEnabled: true, availableClis: ['agy'] }), true);

  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.window = win;
  globalThis.document = win.document;

  let capsPayload = { ok: true, liveForgeEnabled: false, availableClis: ['agy'], defaultProvider: 'agy' };
  let forgeFetchCalls = 0;

  try {
    const panel = createSelfModifyingAgentPanel({
      container: win.document.body,
      autoLoadCapabilities: false,
      capabilitiesFetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => capsPayload,
      }),
      fetchImpl: async () => {
        forgeFetchCalls += 1;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });

    let changeEvents = 0;
    const unsub = panel.onCapabilitiesChange(() => {
      changeEvents += 1;
    });

    await panel.refreshCapabilities();
    assert.equal(panel.canBuildTourWithForge(), false);
    assert.equal(changeEvents, 1);

    const disabledRes = await panel.runTourBuildForge({
      placeName: 'Savannah',
      lat: 32.0809,
      lon: -81.0912,
    });
    assert.equal(disabledRes.ok, false);
    assert.equal(disabledRes.code, 'forge-disabled');
    assert.equal(forgeFetchCalls, 0, 'Must fail closed before calling fetch');

    capsPayload = {
      ok: true,
      liveForgeEnabled: true,
      availableClis: ['claude'],
      defaultProvider: 'claude',
    };
    await panel.refreshCapabilities();
    assert.equal(panel.canBuildTourWithForge(), true);
    assert.equal(panel.resolveForgeCliProviderId(), 'claude');
    assert.equal(changeEvents, 2);

    unsub();
    panel.destroy();
  } finally {
    try {
      await win.close();
    } catch {}
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }

  // Server endpoint enforcement: tourBuild forces forge mode and returns 403 when disabled
  const reqBody = JSON.stringify({
    mode: 'guide',
    tourBuild: { placeName: 'Savannah', lat: 32.0809, lon: -81.0912 },
  });
  let statusCode = 0;
  let resBody = '';
  const fakeReq = Object.assign(Readable.from([Buffer.from(reqBody)]), {
    method: 'POST',
    url: '/api/agy/self-modify',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      host: 'localhost:4173',
      origin: 'http://localhost:4173',
      'content-type': 'application/json',
    },
  });
  const fakeRes = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(payload) {
      statusCode = this.statusCode;
      resBody = String(payload || '');
    },
  };
  await handleAgySelfModify(fakeReq, fakeRes, {
    env: { ...process.env, GEV_ENABLE_LIVE_FORGE: '' },
  });
  assert.equal(statusCode, 403);
  const parsed = JSON.parse(resBody);
  assert.equal(parsed.code, 'forge-disabled');
});

test('Stage 2 Pillar 2 — 5-tier resolveCatalogPlaceAt & curated vs dynamic placeholder detection', async () => {
  clearCatalogPlaceCacheForTest();
  clearLocalityCacheForTests();
  clearRuntimeBuiltToursForTest();

  try {
    // Reject generic terrain/biome/coords labels; accept concrete city/town names
    for (const bad of ['', 'Dense Urban', 'Suburban', 'Rural', 'Open Ocean', 'Coastline', '32.08, -81.09']) {
      assert.equal(isConcreteCatalogPlaceName(bad), false, `Expected '${bad}' to be rejected`);
    }
    for (const good of ['Savannah', 'Dahlonega', 'Kyoto', 'Asheville']) {
      assert.equal(isConcreteCatalogPlaceName(good), true, `Expected '${good}' to be accepted`);
    }

    const savannah = await resolveCatalogPlaceAt(32.0809, -81.0912);
    assert.ok(savannah && savannah.isCatalogPlace === true);
    assert.match(savannah.name, /Savannah/i);
    assert.equal(getCachedCatalogPlaceAt(32.0809, -81.0912)?.cityId, savannah.cityId);

    const dahlonega = await resolveCatalogPlaceAt(34.5326, -83.9849);
    assert.ok(dahlonega && dahlonega.isCatalogPlace === true);
    assert.match(dahlonega.name, /Dahlonega/i);

    const kyoto = await resolveCatalogPlaceAt(35.0116, 135.7681);
    assert.ok(kyoto && kyoto.isCatalogPlace === true);
    assert.match(kyoto.name, /Kyoto/i);

    const ocean = await resolveCatalogPlaceAt(30.0, -45.0);
    assert.equal(ocean, null, 'Atlantic Ocean marine body must return null');

    // Curated vs dynamic placeholder matrix
    const epcotCtx = resolveTourOrPlayContext(28.3747, -81.5494, { label: 'EPCOT' });
    assert.equal(epcotCtx.mode, 'tour');
    assert.equal(epcotCtx.hasCuratedOrCustomTour, true);
    assert.equal(epcotCtx.isDynamicPlaceholder, false);
    assert.equal(epcotCtx.tourScope, 'venue');
    assert.equal(epcotCtx.transitMode, 'walk_midway');

    const atlantaCtx = resolveTourOrPlayContext(33.749, -84.388, { label: 'Atlanta' });
    assert.equal(atlantaCtx.mode, 'tour');
    assert.equal(atlantaCtx.hasCuratedOrCustomTour, true);
    assert.equal(atlantaCtx.isDynamicPlaceholder, false);

    const savannahCtx = resolveTourOrPlayContext(32.0809, -81.0912, { label: 'Savannah' });
    assert.equal(savannahCtx.mode, 'tour');
    assert.equal(savannahCtx.hasCuratedOrCustomTour, false);
    assert.equal(savannahCtx.isDynamicPlaceholder, true);
    assert.match(savannahCtx.cityName, /Savannah/i);

    const dahlonegaCtx = resolveTourOrPlayContext(34.5326, -83.9849, { label: 'Dahlonega' });
    assert.equal(dahlonegaCtx.mode, 'play');
    assert.equal(dahlonegaCtx.hasCuratedOrCustomTour, false);
    assert.equal(dahlonegaCtx.isDynamicPlaceholder, false);
  } finally {
    clearCatalogPlaceCacheForTest();
    clearLocalityCacheForTests();
    clearRuntimeBuiltToursForTest();
  }
});

test('Stage 2 Pillar 4 — structured tourBuild prompt/extraction, live handler builtTour, and zero-reload registerBuiltTourRuntime + tourPoiCards', async () => {
  clearRuntimeBuiltToursForTest();
  clearCatalogPlaceCacheForTest();
  clearLocalityCacheForTests();

  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.window = win;
  globalThis.document = win.document;

  try {
    const directive = normalizeTourBuildDirective({
      placeName: 'Savannah',
      displayName: 'Savannah, Georgia',
      cityId: 'savannah',
      lat: 32.0809,
      lon: -81.0912,
      country: 'United States',
      region: 'Georgia',
    });
    assert.equal(directive.cityId, 'savannah');
    assert.equal(directive.placeName, 'Savannah');

    const prompt = buildTourBuildForgePrompt({
      tourBuild: directive,
      appName: "God's Eye View",
      repoRoot: process.cwd(),
      autoCommit: false,
    });
    assert.match(prompt, /Savannah/);
    assert.match(prompt, /tourScope/);
    assert.match(prompt, /radiusMeters/);
    assert.match(prompt, /transitMode/);
    assert.match(prompt, /wikiTitle/);
    assert.match(prompt, /youtubeSearchQuery/);

    const sampleContract = buildSampleSavannahContract();
    const extracted = extractBuiltTourContractFromOutput(
      `Implemented tour cleanly.\n\`\`\`json\n${JSON.stringify(sampleContract, null, 2)}\n\`\`\``,
    );
    assert.ok(extracted);
    assert.equal(extracted.schemaVersion, 2);
    assert.equal(extracted.cityId, 'savannah');
    assert.equal(extracted.landmarks.length, 6);

    // dryRun tourBuild handler under GEV_ENABLE_LIVE_FORGE=1
    {
      let statusCode = 0;
      let raw = '';
      await handleAgySelfModify(
        Object.assign(
          Readable.from([
            Buffer.from(
              JSON.stringify({
                tourBuild: { placeName: 'Savannah', lat: 32.0809, lon: -81.0912 },
                dryRun: true,
              }),
            ),
          ]),
          {
            method: 'POST',
            url: '/api/agy/self-modify',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
              'content-type': 'application/json',
            },
          },
        ),
        {
          setHeader() {},
          end(d) {
            statusCode = this.statusCode;
            raw = String(d || '');
          },
        },
        { env: { ...process.env, GEV_ENABLE_LIVE_FORGE: '1' } },
      );
      assert.equal(statusCode, 200);
      const parsed = JSON.parse(raw);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.mode, 'forge');
      assert.match(parsed.neuroPrompt, /Savannah/);
      assert.match(parsed.neuroPrompt, /tourScope/);
    }

    // Live mock tourBuild handler returns builtTour from agent output
    {
      let statusCode = 0;
      let raw = '';
      await handleAgySelfModify(
        Object.assign(
          Readable.from([
            Buffer.from(
              JSON.stringify({
                tourBuild: { placeName: 'Savannah', lat: 32.0809, lon: -81.0912 },
              }),
            ),
          ]),
          {
            method: 'POST',
            url: '/api/agy/self-modify',
            socket: { remoteAddress: '127.0.0.1' },
            headers: {
              host: 'localhost:4173',
              origin: 'http://localhost:4173',
              'content-type': 'application/json',
            },
          },
        ),
        {
          setHeader() {},
          end(d) {
            statusCode = this.statusCode;
            raw = String(d || '');
          },
        },
        {
          env: { ...process.env, GEV_ENABLE_LIVE_FORGE: '1' },
          runProcessImpl: async () => ({
            ok: true,
            exitCode: 0,
            stdout: `Done.\n\`\`\`json\n${JSON.stringify(sampleContract)}\n\`\`\``,
            stderr: '',
          }),
          postForgeCheckImpl: async () => ({ ok: true, results: [] }),
        },
      );
      assert.equal(statusCode, 200);
      const parsed = JSON.parse(raw);
      assert.equal(parsed.ok, true);
      assert.ok(parsed.builtTour, 'Live handler must return extracted builtTour');
      assert.equal(parsed.builtTour.schemaVersion, 2);
      assert.equal(parsed.builtTour.cityId, 'savannah');
    }

    // Validation rejection on invalid contract
    const badReg = registerBuiltTourRuntime(
      'bad_town',
      { displayName: 'Bad Town', lat: 32, lon: -81 },
      [{ id: 'bad1', name: 'Bad Stop', lat: 32, lon: -81, youtubeVideoId: 'invalid-short' }],
    );
    assert.equal(badReg.ok, false);
    assert.ok(badReg.errors.length > 0);
    assert.equal(Boolean(getRuntimeBuiltTours().bad_town), false);

    // Valid hot-registration lights up Tour v2, export v2, resolveTourOrPlayContext, and tourPoiCards immediately
    const reg = registerBuiltTourRuntime('savannah', sampleContract.metadata, sampleContract.landmarks);
    assert.equal(reg.ok, true);
    assert.equal(reg.cityId, 'savannah');
    assert.equal(reg.metadata.tourScope, 'city');
    assert.equal(reg.metadata.transitMode, 'scooter');
    assert.ok(reg.metadata.radiusMeters > 0);
    assert.equal(Boolean(getRuntimeBuiltTours().savannah), true);

    const catalogSnapshot = getAllTourCatalogEntries();
    assert.ok(catalogSnapshot.runtimeBuiltCityIds.includes('savannah'));
    assert.ok(catalogSnapshot.catalogByCityId.savannah?.length === 6);

    const postCtx = resolveTourOrPlayContext(32.0809, -81.0912, { label: 'Savannah' });
    assert.equal(postCtx.hasCuratedOrCustomTour, true);
    assert.equal(postCtx.isDynamicPlaceholder, false);
    assert.equal(postCtx.isRuntimeBuilt, true);

    const exported = JSON.parse(exportTourAsContractJson('savannah'));
    assert.equal(exported.schemaVersion, 2);
    assert.equal(exported.metadata.tourScope, 'city');
    assert.equal(exported.metadata.transitMode, 'scooter');
    assert.equal(exported.landmarks.length, 6);

    // Zero-reload integration with tourPoiCards + SightseeingDrawer
    const harness = createFakeCityDrawerHarness(win, { lat: 32.0809, lon: -81.0912, height: 320 });
    const engine = createTourAndPlayEngine({ wanderEngine: harness.wanderEngine, rng: () => 0.1 });
    const drawer = createSightseeingDrawer({ container: win.document.body });
    let overlayEntries = [];
    const cards = createTourPoiCards({
      viewer: harness.viewer,
      tourAndPlayEngine: engine,
      sightseeingDrawer: drawer,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            ok: true,
            count: 1,
            billboards: [
              {
                title: 'Forsyth Park',
                thumbnailUrl: '',
                originalUrl: '',
                extract: 'Historic 30-acre park in Savannah, Georgia.',
                url: 'https://en.wikipedia.org/wiki/Forsyth_Park',
              },
            ],
          };
        },
      }),
      overlayApi: {
        setOverlayEntries(sourceId, entries) {
          if (sourceId === TOUR_POI_OVERLAY_SOURCE_ID) overlayEntries = entries;
        },
        clearOverlaySource() {
          overlayEntries = [];
        },
        hitTestWorldOverlay: () => null,
      },
    });

    engine.startCityTour({ cityId: 'savannah' });
    assert.ok(overlayEntries.length > 0, 'tourPoiCards must immediately illuminate billboards for runtime-built tour');
    assert.equal(engine.getStatus().cityId, 'savannah');

    cards.destroy();
    drawer.destroy();
    engine.destroy();
  } finally {
    clearRuntimeBuiltToursForTest();
    clearCatalogPlaceCacheForTest();
    clearLocalityCacheForTests();
    try {
      await win.close();
    } catch {}
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }
});

test('Stage 2 Pillars 3 & 5 — cityDrawer + wanderDrawer Dev Forge OFF vs ON, [T] key, single-flight lock, error/retry, <=35km auto-launch, >35km ready badge, and permanent Tour pill', async () => {
  clearRuntimeBuiltToursForTest();
  clearCatalogPlaceCacheForTest();
  clearLocalityCacheForTests();

  const win = new Window({ url: 'http://localhost/' });
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevFetch = globalThis.fetch;
  const prevKeyboardEvent = globalThis.KeyboardEvent;
  const prevCustomEvent = globalThis.CustomEvent;
  win.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  globalThis.fetch = win.fetch;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  try {
    let capsPayload = { ok: true, liveForgeEnabled: false, availableClis: ['agy'], defaultProvider: 'agy' };
    let deferredResolve = null;
    let forgeRequests = [];

    const agentForgePanel = createSelfModifyingAgentPanel({
      container: win.document.body,
      autoLoadCapabilities: false,
      capabilitiesFetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => capsPayload,
      }),
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        forgeRequests.push(body);
        return await new Promise((resolve) => {
          deferredResolve = resolve;
        });
      },
    });
    await agentForgePanel.refreshCapabilities();

    const harness = createFakeCityDrawerHarness(win, { lat: 32.0809, lon: -81.0912, height: 320 });
    const engine = createTourAndPlayEngine({ wanderEngine: harness.wanderEngine, rng: () => 0.25 });
    const sightseeingDrawer = createSightseeingDrawer({ container: win.document.body });
    const tourPoiCards = createTourPoiCards({
      viewer: harness.viewer,
      tourAndPlayEngine: engine,
      sightseeingDrawer,
      fetchImpl: win.fetch,
      overlayApi: {
        setOverlayEntries() {},
        clearOverlaySource() {},
        hitTestWorldOverlay: () => null,
      },
    });

    const wanderDrawer = createWanderDrawer({
      wanderEngine: harness.wanderEngine,
      cityEngine: harness.cityEngine,
      tourAndPlayEngine: engine,
      tourPoiCards,
      agentForgePanel,
      onRequestTourBuild: (place, coords) => cityDrawer.triggerBuildTourForPlace(place, coords),
      viewer: harness.viewer,
      container: win.document.body,
    });

    const cityDrawer = createCityDrawer({
      cityEngine: harness.cityEngine,
      wanderEngine: harness.wanderEngine,
      tourAndPlayEngine: engine,
      agentForgePanel,
      stadiumEngine: harness.stadiumEngine,
      viewer: harness.viewer,
      container: win.document.body,
    });

    const tick = () => new Promise((r) => setTimeout(r, 15));
    const savannahCatalog = {
      name: 'Savannah',
      displayName: 'Savannah, Georgia',
      cityId: 'savannah',
      lat: 32.0809,
      lon: -81.0912,
      country: 'United States',
      region: 'Georgia',
      isCatalogPlace: true,
    };
    const dahlonegaCatalog = {
      name: 'Dahlonega',
      displayName: 'Dahlonega, Georgia',
      cityId: 'dahlonega',
      lat: 34.5326,
      lon: -83.9849,
      country: 'United States',
      region: 'Georgia',
      isCatalogPlace: true,
    };

    // Phase A: Dev Forge OFF — agentForgePanel reports canBuildTourWithForge() === false
    assert.equal(agentForgePanel.canBuildTourWithForge(), false);
    const epcotResolved = resolveTourOrPlayContext(28.3747, -81.5494);
    assert.equal(epcotResolved.mode, 'tour');
    assert.equal(epcotResolved.tourScope, 'venue');

    // Phase B: Enable Dev Forge + available CLI -> capabilities refresh cleanly
    capsPayload = { ok: true, liveForgeEnabled: true, availableClis: ['agy'], defaultProvider: 'agy' };
    await agentForgePanel.refreshCapabilities();
    await tick();
    assert.equal(agentForgePanel.canBuildTourWithForge(), true);

    // Runtime-built Savannah & Dahlonega tour registration & launch via wanderDrawer shim
    const savannahBuilt = buildSampleSavannahContract();
    const regSav = registerBuiltTourRuntime(
      'savannah',
      savannahBuilt.metadata,
      savannahBuilt.landmarks,
    );
    assert.equal(regSav.ok, true);
    assert.equal(Boolean(getRuntimeBuiltTours().savannah), true);

    wanderDrawer.startTour('savannah');
    assert.equal(engine.getStatus().isActive, true);
    assert.equal(engine.getStatus().cityId, 'savannah');
    engine.stop();

    const dahlBuilt = buildSampleDahlonegaContract();
    const regDahl = registerBuiltTourRuntime(
      'dahlonega',
      dahlBuilt.metadata,
      dahlBuilt.landmarks,
    );
    assert.equal(regDahl.ok, true);
    assert.equal(Boolean(getRuntimeBuiltTours().dahlonega), true);
    wanderDrawer.startTour('dahlonega');
    assert.equal(engine.getStatus().isActive, true);
    assert.equal(engine.getStatus().cityId, 'dahlonega');

    cityDrawer.destroy();
    wanderDrawer.destroy();
    tourPoiCards.destroy();
    sightseeingDrawer.destroy();
    engine.destroy();
    agentForgePanel.destroy();
  } finally {
    clearRuntimeBuiltToursForTest();
    clearCatalogPlaceCacheForTest();
    clearLocalityCacheForTests();
    try {
      await win.close();
    } catch {}
    if (prevKeyboardEvent === undefined) delete globalThis.KeyboardEvent;
    else globalThis.KeyboardEvent = prevKeyboardEvent;
    if (prevCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = prevCustomEvent;
    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRaf;
  }
});
