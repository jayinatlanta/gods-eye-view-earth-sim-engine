<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { t } from '../../i18n/index.js';
import UiButton from '../kit/UiButton.vue';
import UiCloseButton from '../kit/UiCloseButton.vue';
import UiIcon from '../kit/UiIcon.vue';
import { useSovereignUiStore } from '../stores/sovereignUi.js';
import { isolatePointerEvent } from './cameraControlBridge.js';

/**
 * Zoomed-In Local Context Action Pill (`#gev-local-zoom-pill`).
 *
 * Appears automatically when the user zooms close to any neighborhood on Earth
 * (altitude <= 4.5 km) while no simulation is running and Experiences Explorer
 * is closed, surfacing one-click local discovery actions:
 * - Wander Here (Avatar Street-Level Stroll)
 * - Living City (Ambient Pedestrians & Traffic Here)
 * - Tour Stop (Open Quick Stop / Tour Builder Here)
 * - Connect (Open Connect Places with Origin pre-filled to here)
 */
const store = useSovereignUiStore();
const {
  localZoomContext,
  activeSim,
  activeForgeJob,
  chromeSuppressed,
  explorerOpen,
} = storeToRefs(store);

const currentCellKey = computed(() => {
  const ctx = localZoomContext.value;
  if (!ctx?.zoomedIn) return '';
  if (Number.isFinite(ctx.lat) && Number.isFinite(ctx.lon)) {
    return `${ctx.lat.toFixed(2)},${ctx.lon.toFixed(2)}`;
  }
  return ctx.localityLabel || 'local';
});

const isVisible = computed(() => {
  const ctx = localZoomContext.value;
  if (!ctx?.zoomedIn) return false;
  if (ctx.dismissedKey && ctx.dismissedKey === currentCellKey.value) {
    return false;
  }
  if (chromeSuppressed.value || explorerOpen.value) return false;
  if (activeSim.value || activeForgeJob.value?.active) return false;
  return true;
});

const placeLabel = computed(
  () => localZoomContext.value?.localityLabel || t('Local Area'),
);

function startWanderHere() {
  const rt = store.runtime;
  const wander = rt?.wanderEngine;
  if (!wander) {
    store.openModule('explore-play', { expandPanel: true, exploreTab: 'tour' });
    return;
  }
  const pos = rt.getCameraGroundTarget?.() || {
    lat: localZoomContext.value.lat ?? 33.749,
    lon: localZoomContext.value.lon ?? -84.388,
    elev: null,
    heading: 0,
  };
  wander.startWandering({
    lat: pos.lat,
    lon: pos.lon,
    elev: pos.elev,
    heading: pos.heading || 0,
    companion: true,
  });
  rt.syncActiveSimSnapshot?.('wander');
  store.bumpTelemetry();
}

function startLivingCityHere() {
  const rt = store.runtime;
  if (!rt?.cityEngine) {
    store.openModule('explore-play', { expandPanel: true, exploreTab: 'city' });
    return;
  }
  rt.cityEngine.stepIntoCurrentLocation?.({
    density: 'lively',
    rain: false,
    typologyOverride: null,
  });
  rt.syncActiveSimSnapshot?.('city');
  store.bumpTelemetry();
}

function openTourBuilderHere() {
  store.requestQuickStopCreator();
}

function openConnectFromHere() {
  const ctx = localZoomContext.value;
  const originText =
    Number.isFinite(ctx?.lat) && Number.isFinite(ctx?.lon)
      ? `${ctx.lat.toFixed(5)}, ${ctx.lon.toFixed(5)}`
      : ctx?.localityLabel || '';
  store.openConnectPlacesFromHere(originText);
}

function dismissPill() {
  store.dismissLocalZoomPill();
}
</script>

<template>
  <aside
    v-if="isVisible"
    id="gev-local-zoom-pill"
    data-sovereign-ui="local-zoom-pill"
    :aria-label="t('Local Area Actions')"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
    @touchstart.stop="isolatePointerEvent"
  >
    <div class="es-zoom-place">
      <UiIcon name="location_on" :size="null" />
      <span class="es-zoom-place-name">{{ placeLabel }}</span>
    </div>

    <div class="es-zoom-actions">
      <UiButton
        variant="action"
        size="compact"
        class="es-zoom-btn"
        data-zoom-action="wander"
        :label="t('Wander Here')"
        @click="startWanderHere"
      >
        <UiIcon name="streetview" :size="null" />
        <span>{{ t('Wander Here') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-zoom-btn"
        data-zoom-action="city"
        :label="t('Experience Living City Here')"
        @click="startLivingCityHere"
      >
        <UiIcon name="location_city" :size="null" />
        <span>{{ t('Living City') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-zoom-btn"
        data-zoom-action="tour-stop"
        :label="t('Build Tour Stop Here')"
        @click="openTourBuilderHere"
      >
        <UiIcon name="star" :size="null" />
        <span>{{ t('Build Tour') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-zoom-btn"
        data-zoom-action="connect"
        :label="t('Connect From Here')"
        @click="openConnectFromHere"
      >
        <UiIcon name="timeline" :size="null" />
        <span>{{ t('Connect') }}</span>
      </UiButton>
      <UiCloseButton
        class="es-zoom-dismiss"
        glyph="icon"
        :label="t('Dismiss local quick actions')"
        @click="dismissPill"
      />
    </div>
  </aside>
</template>
