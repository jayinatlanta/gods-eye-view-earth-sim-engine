<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { t } from '../../../i18n/index.js';
import UiButton from '../../kit/UiButton.vue';
import UiCheckbox from '../../kit/UiCheckbox.vue';
import UiIcon from '../../kit/UiIcon.vue';
import UiSegmented from '../../kit/UiSegmented.vue';
import UiSelect from '../../kit/UiSelect.js';
import UiSlider from '../../kit/UiSlider.js';
import { useSovereignUiStore } from '../../stores/sovereignUi.js';
import {
  DOMICILE_TYPOLOGIES,
  DOMICILE_TYPOLOGY_META,
  checkInTempBasecamp,
  checkOutTempBasecamp,
  claimDomicileAtLocation,
  getAllDomiciles,
  getTempBasecamp,
  onDomicileRegistryChange,
  onTempBasecampChange,
} from '../../../layers/estates/domicileCatalog.js';
import {
  BIOME_META,
  WILDERNESS_TRAILHEADS,
} from '../../../layers/wilderness/trailheadCatalog.js';
import {
  SETTLEMENT_TYPOLOGIES,
  TYPOLOGY_METADATA,
} from '../../../layers/citylife/localeClassifier.js';
import { LIVING_CITIES } from '../../../citylife/livingCitiesCatalog.js';
import { isolatePointerEvent } from '../cameraControlBridge.js';

/**
 * Explore & Play Sovereign Vue Module (Phase 1 First Registered Module).
 *
 * Replaces the legacy fixed 350px flyouts of:
 * - Wander & Tour v2 (`wanderDrawer.js`)
 * - Living City (`cityDrawer.js`)
 * - Domiciles & Estates (`estateDrawer.js`)
 * - Wilderness Trailheads (`wildernessDrawer.js`)
 */
const store = useSovereignUiStore();
const { activeExploreTab, telemetryRevision, quickStopRequested } =
  storeToRefs(store);

const subTabOptions = computed(() => [
  { value: 'tour', label: t('Tour') },
  { value: 'city', label: t('City') },
  { value: 'estate', label: t('Domiciles') },
  { value: 'wilderness', label: t('Trails') },
]);

const transitModeOptions = computed(() => [
  { value: 'walk_midway', label: t('Walk') },
  { value: 'scooter', label: t('Scooter') },
  { value: 'resort_cart', label: t('Cart') },
  { value: 'aerial_tram', label: t('Tram') },
  { value: 'lazy_river_tube', label: t('River') },
]);

const densityOptions = computed(() => [
  { value: 'calm', label: t('Calm') },
  { value: 'lively', label: t('Lively') },
  { value: 'rush', label: t('Rush') },
]);

const fleetModeOptions = computed(() => [
  { value: 'walk', label: t('Walk') },
  { value: 'bike', label: t('Bike') },
  { value: 'scooter', label: t('Scooter') },
  { value: 'ev', label: t('EV') },
  { value: 'h145', label: t('H145') },
]);

const typologyOptions = computed(() => [
  { value: 'auto', label: t('Auto-Classify Locale') },
  ...Object.values(SETTLEMENT_TYPOLOGIES).map((key) => ({
    value: key,
    label: TYPOLOGY_METADATA[key]?.label || key,
  })),
]);

const rt = computed(() => store.runtime || {});
const companionEnabled = ref(true);
const selectedDensity = ref('lively');
const rainEnabled = ref(false);
const selectedTypology = ref('auto');
const soundVolume = ref(45);
const campfireMuted = ref(false);
const stargazingOn = ref(false);
const showQuickStopForm = ref(false);
const customStopName = ref('');
const customStopLore = ref('');
const customStopStatus = ref('');

const domicilesTick = ref(0);
let unsubDomiciles = null;
let unsubBasecamp = null;

const tourStatus = computed(() => {
  void telemetryRevision.value;
  return rt.value.tourAndPlayEngine?.getStatus?.() || null;
});

const wanderTelemetry = computed(() => {
  void telemetryRevision.value;
  return rt.value.wanderEngine?.getTelemetry?.() || null;
});

const cityTelemetry = computed(() => {
  void telemetryRevision.value;
  return rt.value.cityEngine?.getActiveTelemetry?.() || null;
});

const fleetTelemetry = computed(() => {
  void telemetryRevision.value;
  return rt.value.fleetEngine?.getActiveTelemetry?.() || null;
});

const activeTempBasecamp = computed(() => {
  void domicilesTick.value;
  void telemetryRevision.value;
  return getTempBasecamp();
});

const domicilesList = computed(() => {
  void domicilesTick.value;
  return getAllDomiciles().slice(0, 8);
});

const topLivingCities = computed(() =>
  Object.values(LIVING_CITIES).slice(0, 6),
);
const topTrailheads = computed(() => WILDERNESS_TRAILHEADS.slice(0, 6));

const activeTransitMode = computed({
  get: () => tourStatus.value?.effectiveTransitMode || 'walk_midway',
  set: (next) => {
    rt.value.tourAndPlayEngine?.setTransitMode?.(next);
    store.bumpTelemetry();
  },
});

const activeFleetMode = computed({
  get: () => fleetTelemetry.value?.mode || 'walk',
  set: (next) => {
    rt.value.fleetEngine?.setFleetMode?.(next);
    store.bumpTelemetry();
  },
});

const activeBridges = computed(() => {
  const st = tourStatus.value;
  if (!st?.isActive) return [];
  return [
    ...(st.parkHopperBridges || []),
    ...(st.resortExcursionBridges || []),
  ].slice(0, 4);
});

function openExplorerFor(chips = []) {
  store.openExplorer({ chips, intro: false });
}

function toggleWanderHere() {
  const wander = rt.value.wanderEngine;
  if (!wander) return;
  if (wander.isWandering) {
    rt.value.tourAndPlayEngine?.stop?.();
    wander.stopWandering();
    store.clearActiveSim('wander');
    store.clearActiveSim('tour');
  } else {
    const pos = rt.value.getCameraGroundTarget?.() || {
      lat: 33.7749,
      lon: -84.3725,
      elev: null,
      heading: 0,
    };
    wander.startWandering({
      lat: pos.lat,
      lon: pos.lon,
      elev: pos.elev,
      heading: pos.heading || 0,
      companion: companionEnabled.value,
    });
    rt.value.syncActiveSimSnapshot?.('wander');
  }
  store.bumpTelemetry();
}

function setWanderCamera(mode) {
  store.patchActiveSimCameraMode(mode);
  rt.value.wanderEngine?.setCameraMode?.(mode);
  store.bumpTelemetry();
}

function onCompanionToggle(next) {
  companionEnabled.value = Boolean(next);
  rt.value.wanderEngine?.toggleCompanion?.(companionEnabled.value);
  store.bumpTelemetry();
}

function launchPlayActivity(activityId) {
  const target = rt.value.getCameraGroundTarget?.() || {};
  rt.value.tourAndPlayEngine?.startPlayActivity?.({
    activityId,
    lat: target.lat,
    lon: target.lon,
  });
  rt.value.syncActiveSimSnapshot?.('tour');
  store.bumpTelemetry();
}

function launchExcursionBridge(bridge) {
  if (!bridge) return;
  const targetCityId = bridge.targetCityId || bridge.toCityId;
  const targetStopId = bridge.targetStopId || bridge.arrivalStopId;
  const railCorridor = bridge.railProfileId || bridge.railRouteId;
  const onArrival = targetCityId
    ? () => {
        rt.value.tourAndPlayEngine?.startCityTour?.({
          cityId: targetCityId,
          startStopId: targetStopId,
        });
        rt.value.syncActiveSimSnapshot?.('tour');
      }
    : undefined;
  if (bridge.railCorridorId && rt.value.railwayEngine?.spawnRailRoute) {
    rt.value.railwayEngine.spawnRailRoute(
      bridge.railCorridorId,
      bridge.railCorridorId,
      {
        corridor: railCorridor,
        onArrival,
      },
    );
  } else if (bridge.railCorridorId && rt.value.railwayEngine?.spawnTrain) {
    rt.value.railwayEngine.spawnTrain(bridge.railCorridorId, {
      corridor: railCorridor,
      onArrival,
    });
  } else if (targetCityId) {
    rt.value.tourAndPlayEngine?.hopToLinkedPark?.(targetCityId);
    rt.value.syncActiveSimSnapshot?.('tour');
  }
  store.bumpTelemetry();
}

function triggerFireworks() {
  rt.value.parkFireworks?.launchFinale?.();
  store.bumpTelemetry();
}

function checkInCurrentResort() {
  const st = tourStatus.value;
  if (!st?.cityId) return;
  const meta = st.metadata || {};
  checkInTempBasecamp({
    resortId: st.cityId,
    title: meta.name || st.cityName || st.cityId,
    lat: meta.centerLat ?? st.currentLandmark?.lat ?? 28.4046,
    lon: meta.centerLon ?? st.currentLandmark?.lon ?? -81.4628,
    elev: st.currentLandmark?.elev ?? 26,
  });
  domicilesTick.value += 1;
  store.bumpTelemetry();
}

function checkOutResort() {
  checkOutTempBasecamp();
  domicilesTick.value += 1;
  store.bumpTelemetry();
}

function saveQuickStop() {
  const name = customStopName.value.trim();
  const lore = customStopLore.value.trim();
  if (!name || lore.length < 10) {
    customStopStatus.value = t(
      'Enter a stop name and short description (10+ chars).',
    );
    return;
  }
  const ok = rt.value.addQuickCustomStop?.({ name, lore });
  if (ok) {
    customStopName.value = '';
    customStopLore.value = '';
    customStopStatus.value = t('Stop saved to custom tour.');
    showQuickStopForm.value = false;
  } else {
    customStopStatus.value = t('Could not save stop at current location.');
  }
  store.bumpTelemetry();
}

function stepIntoCurrentCity() {
  const cityEngine = rt.value.cityEngine;
  if (!cityEngine) return;
  cityEngine.stepIntoCurrentLocation?.({
    density: selectedDensity.value,
    typology:
      selectedTypology.value === 'auto' ? undefined : selectedTypology.value,
  });
  rt.value.syncActiveSimSnapshot?.('city');
  store.bumpTelemetry();
}

function stepIntoCityById(cityId) {
  rt.value.cityEngine?.stepIntoCity?.(cityId, {
    density: selectedDensity.value,
  });
  rt.value.syncActiveSimSnapshot?.('city');
  store.bumpTelemetry();
}

function stopCitySim() {
  rt.value.cityEngine?.clearPedestrians?.();
  store.clearActiveSim('city');
  store.bumpTelemetry();
}

function onDensityChange(next) {
  selectedDensity.value = next;
  rt.value.cityEngine?.setDensity?.(next);
  store.bumpTelemetry();
}

function onRainChange(next) {
  rainEnabled.value = Boolean(next);
  rt.value.cityEngine?.toggleRain?.(rainEnabled.value);
  store.bumpTelemetry();
}

function onTypologyChange(next) {
  selectedTypology.value = next;
  if (next !== 'auto') {
    rt.value.cityEngine?.setTypologyOverride?.(next);
  }
  store.bumpTelemetry();
}

function onCitySoundVolume(val) {
  soundVolume.value = val;
  rt.value.cityEngine?.getAmbientSoundscape?.()?.setVolume?.(val / 100);
}

function visitDomicile(domicile) {
  if (!domicile) return;
  // Release any active Wander / Tour / City camera lock before flying to domicile
  rt.value.tourAndPlayEngine?.stop?.();
  if (rt.value.wanderEngine?.isWandering) {
    rt.value.wanderEngine.stopWandering();
  }
  rt.value.coordinator?.notifySimulationStarted?.('estate');
  rt.value.claimScout?.selectDomicile?.(domicile.id);
  rt.value.fleetEngine?.spawnAtDomicile?.(domicile.id);
  if (typeof rt.value.claimScout?.flyToDomicile === 'function') {
    rt.value.claimScout.flyToDomicile(domicile.id, {
      mode: 'overview',
      duration: 1.5,
    });
  } else {
    rt.value.flyToCoords?.(
      domicile.lat,
      domicile.lon,
      (domicile.elev || 20) + 260,
      {
        pitchDeg: -45,
        duration: 1.5,
        reason: `estate-visit-${domicile.id}`,
      },
    );
  }
  rt.value.syncActiveSimSnapshot?.('estate');
  store.bumpTelemetry();
}

function toggleFleetRide() {
  const fleet = rt.value.fleetEngine;
  if (!fleet) return;
  if (fleet.isActive) {
    fleet.stop();
    store.clearActiveSim('estate');
  } else {
    fleet.start();
    fleet.setCameraMode('chase');
    rt.value.syncActiveSimSnapshot?.('estate');
  }
  store.bumpTelemetry();
}

function toggleFleetTandem() {
  rt.value.fleetEngine?.toggleCompanionMode?.();
  store.bumpTelemetry();
}

function claimHavenHere(typology) {
  const pos = rt.value.getCameraGroundTarget?.() || {
    lat: 33.749,
    lon: -84.388,
    elev: 250,
  };
  const meta = DOMICILE_TYPOLOGY_META[typology];
  claimDomicileAtLocation({
    lat: pos.lat,
    lon: pos.lon,
    elev: pos.elev || 20,
    typology,
    title: `${meta?.shortLabel || 'Haven'} (${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)})`,
  });
  domicilesTick.value += 1;
  store.bumpTelemetry();
}

function selectTrailhead(trail) {
  if (!trail) return;
  rt.value.wildernessDrawer?.selectTrailhead?.(trail.id);
  const trailLat = trail.coordinates?.lat ?? trail.lat;
  const trailLon = trail.coordinates?.lon ?? trail.lon;
  const trailElev = trail.coordinates?.elevM ?? trail.elev ?? 1000;
  rt.value.flyToCoords?.(trailLat, trailLon, trailElev + 320, {
    pitchDeg: -35,
    duration: 1.6,
    reason: `wilderness-${trail.id}`,
  });
  store.bumpTelemetry();
}

function onCampfireMuteToggle(muted) {
  campfireMuted.value = Boolean(muted);
  if (rt.value.wildernessAudio?.setMuted) {
    rt.value.wildernessAudio.setMuted(campfireMuted.value);
  } else if (rt.value.wildernessAudio?.toggleMute) {
    rt.value.wildernessAudio.toggleMute();
  }
}

function onStargazingToggle(on) {
  stargazingOn.value = Boolean(on);
  rt.value.wildernessAudio?.setStargazingMode?.(stargazingOn.value);
}

watch(quickStopRequested, (count) => {
  if (count > 0) {
    showQuickStopForm.value = true;
  }
});

onMounted(() => {
  unsubDomiciles = onDomicileRegistryChange(() => {
    domicilesTick.value += 1;
  });
  unsubBasecamp = onTempBasecampChange(() => {
    domicilesTick.value += 1;
  });
});

onBeforeUnmount(() => {
  unsubDomiciles?.();
  unsubBasecamp?.();
});
</script>

<template>
  <div
    class="es-explore-play"
    data-sovereign-ui="explore-play-module"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
  >
    <UiSegmented
      v-model="activeExploreTab"
      :options="subTabOptions"
      :label="t('Explore & Play Sections')"
    />

    <!-- 1. TOUR & WANDER -->
    <template v-if="activeExploreTab === 'tour'">
      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Experiences & Tours') }}</span>
          <UiButton
            variant="primary"
            size="compact"
            data-action="browse-experiences"
            :label="t('Browse Experiences')"
            @click="openExplorerFor([])"
          >
            <UiIcon name="travel_explore" :size="null" />
            <span>{{ t('Browse All') }}</span>
          </UiButton>
        </div>

        <div class="es-status-line">
          <template v-if="tourStatus?.isActive">
            {{ tourStatus.cityName || t('Active Tour') }} ·
            {{ tourStatus.currentLandmark?.name || t('Exploring') }}
            ({{ (tourStatus.currentLandmarkIndex ?? 0) + 1 }}/{{
              tourStatus.totalLandmarks || 1
            }})
          </template>
          <template v-else-if="wanderTelemetry?.isWandering">
            {{ t('Wandering') }} ·
            {{ wanderTelemetry.locationLabel || t('Ground Level') }}
          </template>
          <template v-else>
            {{
              t(
                'Launch any theme park, resort stay, state park, or street-level stroll.',
              )
            }}
          </template>
        </div>

        <div class="es-btn-row">
          <UiButton
            variant="primary"
            size="compact"
            class="es-btn-stretch"
            data-action="toggle-wander"
            :label="
              wanderTelemetry?.isWandering ? t('Stop Wander') : t('Wander Here')
            "
            @click="toggleWanderHere"
          >
            {{
              wanderTelemetry?.isWandering ? t('Stop Wander') : t('Wander Here')
            }}
          </UiButton>
          <UiButton
            v-if="tourStatus?.isActive"
            variant="action"
            size="compact"
            data-action="next-tour-stop"
            :label="t('Next Stop')"
            @click="
              rt.tourAndPlayEngine?.continueTour?.({ advanceToNext: true })
            "
          >
            {{ t('Next Stop') }}
          </UiButton>
        </div>

        <div v-if="wanderTelemetry?.isWandering" class="es-field-row">
          <span class="es-field-label">{{ t('Camera View') }}</span>
          <div class="es-btn-row">
            <UiButton
              v-for="cam in [
                { id: 'first_person', label: t('1st Person') },
                { id: 'iso_chase', label: t('Chase') },
                { id: 'heli', label: t('Heli') },
                { id: 'overview', label: t('Overview') },
                { id: 'free', label: t('Free') },
              ]"
              :key="cam.id"
              variant="action"
              size="compact"
              :data-panel-cam="cam.id"
              :pressed="wanderTelemetry.cameraMode === cam.id"
              pressed-class="active"
              :label="cam.label"
              @click="setWanderCamera(cam.id)"
            >
              {{ cam.label }}
            </UiButton>
          </div>
        </div>

        <div v-if="tourStatus?.isActive" class="es-field-row">
          <span class="es-field-label">{{ t('Tour Transit') }}</span>
          <UiSegmented
            v-model="activeTransitMode"
            :options="transitModeOptions"
            :label="t('Tour Transit Mode')"
          />
        </div>

        <UiCheckbox
          :model-value="companionEnabled"
          @update:model-value="onCompanionToggle"
        >
          {{ t('Companion Co-Stroll') }}
        </UiCheckbox>

        <div v-if="activeBridges.length" class="es-field-row">
          <span class="es-field-label">{{ t('Excursion Bridges') }}</span>
          <div class="es-btn-row">
            <UiButton
              v-for="bridge in activeBridges"
              :key="bridge.id || bridge.label"
              variant="action"
              size="compact"
              :label="bridge.label || bridge.targetCityId"
              @click="launchExcursionBridge(bridge)"
            >
              {{ bridge.shortLabel || bridge.label || t('Hop') }}
            </UiButton>
          </div>
        </div>

        <div v-if="tourStatus?.isActive" class="es-btn-row">
          <UiButton
            variant="action"
            size="compact"
            :label="t('Launch Evening Fireworks')"
            @click="triggerFireworks"
          >
            {{ t('Fireworks') }}
          </UiButton>
          <UiButton
            v-if="tourStatus.venueCategory === 'resort_stay'"
            variant="action"
            size="compact"
            :label="t('Check In as Basecamp')"
            @click="checkInCurrentResort"
          >
            {{ t('Check In Basecamp') }}
          </UiButton>
        </div>
      </section>

      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Local Play Mode') }}</span>
        </div>
        <div class="es-btn-row">
          <UiButton
            v-for="act in [
              { id: 'beach', label: t('Beach') },
              { id: 'movie', label: t('Cinema') },
              { id: 'dining', label: t('Dining') },
              { id: 'shopping', label: t('Shopping') },
            ]"
            :key="act.id"
            variant="action"
            size="compact"
            :label="act.label"
            @click="launchPlayActivity(act.id)"
          >
            {{ act.label }}
          </UiButton>
        </div>
      </section>

      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Quick Stop Creator') }}</span>
          <UiButton
            variant="action"
            size="compact"
            :pressed="showQuickStopForm"
            pressed-class="active"
            :label="t('Toggle Quick Stop Creator')"
            @click="showQuickStopForm = !showQuickStopForm"
          >
            {{ showQuickStopForm ? t('Hide') : t('Add Stop') }}
          </UiButton>
        </div>
        <template v-if="showQuickStopForm">
          <input
            v-model="customStopName"
            type="text"
            class="es-text-input"
            :placeholder="t('Stop name (e.g. Harbor Overlook)')"
            :aria-label="t('Custom Stop Name')"
          />
          <input
            v-model="customStopLore"
            type="text"
            class="es-text-input"
            :placeholder="t('Short lore note (10+ chars)')"
            :aria-label="t('Custom Stop Description')"
          />
          <UiButton
            variant="primary"
            size="compact"
            :label="t('Save Stop Here')"
            @click="saveQuickStop"
          >
            {{ t('Save Stop at Camera') }}
          </UiButton>
          <span v-if="customStopStatus" class="es-muted">{{
            customStopStatus
          }}</span>
        </template>
      </section>
    </template>

    <!-- 2. LIVING CITY -->
    <template v-else-if="activeExploreTab === 'city'">
      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Living City Sim') }}</span>
          <UiButton
            variant="action"
            size="compact"
            :label="t('Browse Living Cities')"
            @click="openExplorerFor(['living-cities'])"
          >
            {{ t('All Cities') }}
          </UiButton>
        </div>
        <div class="es-status-line">
          <template
            v-if="cityTelemetry?.isActive || rt.cityEngine?.isSimActive?.()"
          >
            {{
              cityTelemetry?.cityName ||
              rt.cityEngine?.getActiveCity?.()?.name ||
              t('Active Locale')
            }}
          </template>
          <template v-else>
            {{
              t(
                'Drop pedestrians, urban spectacles & ambient soundscape at street level.',
              )
            }}
          </template>
        </div>
        <div class="es-btn-row">
          <UiButton
            variant="primary"
            size="compact"
            class="es-btn-stretch"
            :label="t('Step Into Current View')"
            @click="stepIntoCurrentCity"
          >
            {{ t('Step In Here') }}
          </UiButton>
          <UiButton
            v-if="rt.cityEngine?.isSimActive?.()"
            variant="action"
            tone="danger"
            size="compact"
            :label="t('Stop City Sim')"
            @click="stopCitySim"
          >
            {{ t('Stop') }}
          </UiButton>
        </div>

        <div class="es-field-row">
          <span class="es-field-label">{{ t('Crowd Density') }}</span>
          <UiSegmented
            :model-value="selectedDensity"
            :options="densityOptions"
            :label="t('Pedestrian Density')"
            @update:model-value="onDensityChange"
          />
        </div>

        <div class="es-field-row">
          <span class="es-field-label">{{ t('Locale Archetype') }}</span>
          <UiSelect
            :model-value="selectedTypology"
            :options="typologyOptions"
            class="es-select"
            :aria-label="t('Locale Archetype Override')"
            @update:model-value="onTypologyChange"
          />
        </div>

        <UiCheckbox
          :model-value="rainEnabled"
          @update:model-value="onRainChange"
        >
          {{ t('Rain Umbrellas & Wet Reflections') }}
        </UiCheckbox>

        <div class="es-field-row">
          <span class="es-field-label"
            >{{ t('Soundscape Volume') }} ({{ soundVolume }}%)</span
          >
          <UiSlider
            :model-value="soundVolume"
            :min="0"
            :max="100"
            :step="5"
            :aria-label="t('City Soundscape Volume')"
            @update:model-value="onCitySoundVolume"
          />
        </div>
      </section>

      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Featured Cities') }}</span>
        </div>
        <div class="es-quick-list ui-scroll">
          <div
            v-for="city in topLivingCities"
            :key="city.id"
            class="es-quick-item"
          >
            <div class="es-quick-item-meta">
              <span class="es-quick-item-title">{{ city.name }}</span>
              <span class="es-quick-item-sub">{{
                city.country || city.region
              }}</span>
            </div>
            <UiButton
              variant="action"
              size="compact"
              :label="`${t('Step Into')} ${city.name}`"
              @click="stepIntoCityById(city.id)"
            >
              {{ t('Step In') }}
            </UiButton>
          </div>
        </div>
      </section>
    </template>

    <!-- 3. DOMICILES & ESTATES -->
    <template v-else-if="activeExploreTab === 'estate'">
      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{
            t('Personal Fleet & Basecamp')
          }}</span>
          <UiButton
            variant="action"
            size="compact"
            :label="t('Browse Domiciles')"
            @click="openExplorerFor(['domiciles'])"
          >
            {{ t('All Estates') }}
          </UiButton>
        </div>

        <div v-if="activeTempBasecamp" class="es-quick-item">
          <div class="es-quick-item-meta">
            <span class="es-quick-item-title">{{
              activeTempBasecamp.title
            }}</span>
            <span class="es-quick-item-sub">{{
              t('Active Resort Basecamp')
            }}</span>
          </div>
          <UiButton
            variant="action"
            tone="danger"
            size="compact"
            :label="t('Check Out Basecamp')"
            @click="checkOutResort"
          >
            {{ t('Check Out') }}
          </UiButton>
        </div>

        <div class="es-field-row">
          <span class="es-field-label">{{ t('Fleet Mode') }}</span>
          <UiSegmented
            v-model="activeFleetMode"
            :options="fleetModeOptions"
            :label="t('Personal Fleet Mode')"
          />
        </div>

        <div class="es-btn-row">
          <UiButton
            variant="primary"
            size="compact"
            class="es-btn-stretch"
            :label="
              fleetTelemetry?.isActive ? t('Park Fleet') : t('Launch Fleet')
            "
            @click="toggleFleetRide"
          >
            {{ fleetTelemetry?.isActive ? t('Park Fleet') : t('Start Ride') }}
          </UiButton>
          <UiButton
            variant="action"
            size="compact"
            :pressed="fleetTelemetry?.companionMode === 'companion_tandem'"
            pressed-class="active"
            :label="t('Toggle Solo or Tandem')"
            @click="toggleFleetTandem"
          >
            {{
              fleetTelemetry?.companionMode === 'companion_tandem'
                ? t('Tandem')
                : t('Solo')
            }}
          </UiButton>
        </div>

        <div class="es-field-row">
          <span class="es-field-label">{{ t('Claim Haven at Camera') }}</span>
          <div class="es-btn-row">
            <UiButton
              variant="action"
              size="compact"
              :label="t('Claim Primary Residence')"
              @click="claimHavenHere(DOMICILE_TYPOLOGIES.PRIMARY_RESIDENCE)"
            >
              {{ t('Own Home') }}
            </UiButton>
            <UiButton
              variant="action"
              size="compact"
              :label="t('Claim Vacation Property')"
              @click="claimHavenHere(DOMICILE_TYPOLOGIES.VACATION_SANCTUARY)"
            >
              {{ t('Vacation') }}
            </UiButton>
            <UiButton
              variant="action"
              size="compact"
              :label="t('Claim Workplace HQ')"
              @click="claimHavenHere(DOMICILE_TYPOLOGIES.VENTURE_HQ)"
            >
              {{ t('Workplace') }}
            </UiButton>
          </div>
        </div>
      </section>

      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Saved Domiciles') }}</span>
        </div>
        <div class="es-quick-list ui-scroll">
          <div v-for="dom in domicilesList" :key="dom.id" class="es-quick-item">
            <div class="es-quick-item-meta">
              <span class="es-quick-item-title">{{ dom.title || dom.id }}</span>
              <span class="es-quick-item-sub">{{
                dom.address || dom.typology
              }}</span>
            </div>
            <UiButton
              variant="action"
              size="compact"
              :label="`${t('Visit')} ${dom.title || dom.id}`"
              @click="visitDomicile(dom)"
            >
              {{ t('Visit') }}
            </UiButton>
          </div>
        </div>
      </section>
    </template>

    <!-- 4. WILDERNESS TRAILHEADS -->
    <template v-else>
      <section class="es-section">
        <div class="es-section-head">
          <span class="es-section-title">{{ t('Wilderness & Bivouac') }}</span>
          <UiButton
            variant="action"
            size="compact"
            :label="t('Browse Trailheads')"
            @click="openExplorerFor(['wilderness', 'state-parks'])"
          >
            {{ t('All Trails') }}
          </UiButton>
        </div>

        <UiCheckbox
          :model-value="!campfireMuted"
          @update:model-value="(on) => onCampfireMuteToggle(!on)"
        >
          {{ t('Campfire & Wilderness Audio') }}
        </UiCheckbox>

        <UiCheckbox
          :model-value="stargazingOn"
          @update:model-value="onStargazingToggle"
        >
          {{ t('Backcountry Stargazing Mode') }}
        </UiCheckbox>

        <div class="es-quick-list ui-scroll">
          <div
            v-for="trail in topTrailheads"
            :key="trail.id"
            class="es-quick-item"
          >
            <div class="es-quick-item-meta">
              <span class="es-quick-item-title">{{ trail.name }}</span>
              <span class="es-quick-item-sub">
                {{ trail.park || BIOME_META[trail.biome]?.label }} ·
                {{ trail.distanceKm }} km
              </span>
            </div>
            <UiButton
              variant="action"
              size="compact"
              :label="`${t('Fly To')} ${trail.name}`"
              @click="selectTrailhead(trail)"
            >
              {{ t('Fly To') }}
            </UiButton>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
