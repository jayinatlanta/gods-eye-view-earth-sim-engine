<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { t } from '../../i18n/index.js';
import UiButton from '../kit/UiButton.vue';
import UiIcon from '../kit/UiIcon.vue';
import { useSovereignUiStore } from '../stores/sovereignUi.js';
import { isolatePointerEvent } from './cameraControlBridge.js';

/**
 * Active-Sim Auto-Folding Micro-HUD (StoryScreen `ov-chapter` inspired).
 *
 * - Appears automatically when an Earth Sim simulation or Dev Forge job is active.
 * - Zero `setInterval` `innerHTML` rebuilds: purely reactive to `useSovereignUiStore`.
 * - Stops pointerdown/mousedown/touchstart propagation so Cesium canvas handlers
 *   never race with camera-mode button clicks (Click #1 determinism).
 */
const store = useSovereignUiStore();
const {
  activeSim,
  activeForgeJob,
  chromeSuppressed,
  explorerOpen,
  microHudFolded,
} = storeToRefs(store);

const isVisible = computed(
  () =>
    !chromeSuppressed.value &&
    !explorerOpen.value &&
    (Boolean(activeSim.value) || Boolean(activeForgeJob.value?.active)),
);

let foldTimer = null;
const hovering = ref(false);

function clearFoldTimer() {
  if (foldTimer !== null) {
    clearTimeout(foldTimer);
    foldTimer = null;
  }
}

function scheduleAutoFold(delayMs = 5500) {
  clearFoldTimer();
  foldTimer = setTimeout(() => {
    foldTimer = null;
    if (!hovering.value && activeSim.value) {
      microHudFolded.value = true;
    }
  }, delayMs);
}

function onPointerEnter() {
  hovering.value = true;
  clearFoldTimer();
  microHudFolded.value = false;
}

function onPointerLeave() {
  hovering.value = false;
  scheduleAutoFold(3200);
}

function toggleFold() {
  clearFoldTimer();
  microHudFolded.value = !microHudFolded.value;
}

function selectCameraMode(modeId) {
  const sim = activeSim.value;
  if (!sim || !modeId) return;
  // Synchronous optimistic highlight on Click #1 (zero polling lag)
  store.patchActiveSimCameraMode(modeId, { kind: sim.kind });
  const rt = store.runtime;
  if (!rt) return;

  if (sim.kind === 'wander' || sim.kind === 'tour') {
    rt.wanderEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'city') {
    rt.cityEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'estate') {
    rt.fleetEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'flight') {
    rt.flightEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'rail') {
    rt.railwayEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'drive') {
    rt.driveEngine?.setCameraMode?.(modeId);
  } else if (sim.kind === 'boat') {
    rt.boatEngine?.setCameraMode?.(modeId);
  }
  store.bumpTelemetry();
}

function snapBack() {
  const sim = activeSim.value;
  const rt = store.runtime;
  if (!sim || !rt) return;

  if (sim.kind === 'wander' || sim.kind === 'tour') {
    rt.wanderEngine?.snapBack?.();
    const nextMode = rt.wanderEngine?.getCameraMode?.() || 'iso_chase';
    store.patchActiveSimCameraMode(nextMode, { kind: sim.kind });
  } else if (sim.kind === 'city') {
    rt.cityEngine?.snapBack?.('companion');
    store.patchActiveSimCameraMode('companion', { kind: sim.kind });
  } else if (sim.kind === 'estate') {
    rt.fleetEngine?.snapBack?.('chase');
    store.patchActiveSimCameraMode('chase', { kind: sim.kind });
  }
  store.bumpTelemetry();
}

function nextStop() {
  const sim = activeSim.value;
  const rt = store.runtime;
  if (!sim || !rt) return;
  if (sim.kind === 'tour') {
    rt.tourAndPlayEngine?.continueTour?.({ advanceToNext: true });
  } else if (sim.kind === 'city') {
    rt.cityEngine?.cyclePedestrian?.(1);
  }
  store.bumpTelemetry();
}

function toggleTakeOver() {
  const sim = activeSim.value;
  const rt = store.runtime;
  if (!sim || sim.kind !== 'tour' || !rt?.tourAndPlayEngine) return;
  if (sim.canResume) {
    rt.tourAndPlayEngine.continueTour({ advanceToNext: false });
  } else {
    rt.tourAndPlayEngine.takeOverAtLandmark?.();
  }
  store.bumpTelemetry();
}

function stopActiveSim() {
  const sim = activeSim.value;
  const rt = store.runtime;
  if (!sim || !rt) return;
  if (sim.kind === 'tour') {
    rt.tourAndPlayEngine?.stop?.();
  } else if (sim.kind === 'wander') {
    rt.wanderEngine?.stopWandering?.();
  } else if (sim.kind === 'city') {
    rt.cityEngine?.clearPedestrians?.();
  } else if (sim.kind === 'estate') {
    rt.fleetEngine?.stop?.();
  }
  store.clearActiveSim(sim.kind);
  store.bumpTelemetry();
}

function openEarthSimPanel() {
  store.openModule('explore-play', { expandPanel: true });
}

onBeforeUnmount(() => {
  clearFoldTimer();
});
</script>

<template>
  <aside
    v-if="isVisible"
    id="gev-active-sim-hud"
    data-sovereign-ui="micro-hud"
    :class="{ 'es-hud-folded': microHudFolded }"
    :aria-label="t('Active Earth Sim Controls')"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
    @touchstart.stop="isolatePointerEvent"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <div class="es-hud-top">
      <div class="es-hud-summary">
        <span class="es-hud-dot" aria-hidden="true"></span>
        <span class="es-hud-title">
          {{
            activeSim?.title || activeForgeJob?.label || t('Earth Sim Active')
          }}
        </span>
        <span
          v-if="activeSim?.subtitle || activeSim?.speedLabel"
          class="es-hud-meta"
        >
          {{
            [activeSim?.subtitle, activeSim?.speedLabel]
              .filter(Boolean)
              .join(' · ')
          }}
        </span>
      </div>
      <div class="es-hud-controls">
        <UiButton
          variant="ghost"
          size="compact"
          class="es-hud-cam-btn"
          :label="microHudFolded ? t('Expand controls') : t('Compact controls')"
          @click="toggleFold"
        >
          <UiIcon
            :name="microHudFolded ? 'arrow_drop_down' : 'arrow_upward'"
            :size="null"
          />
        </UiButton>
        <UiButton
          variant="action"
          size="compact"
          class="es-hud-cam-btn"
          :label="t('Open Earth Sim Panel')"
          @click="openEarthSimPanel"
        >
          <UiIcon name="tune" :size="null" />
        </UiButton>
      </div>
    </div>

    <div v-if="!microHudFolded && activeSim" class="es-hud-controls">
      <UiButton
        v-for="cam in activeSim.cameraModes || []"
        :key="cam.id"
        variant="action"
        size="compact"
        class="es-hud-cam-btn"
        :data-camera-mode="cam.id"
        :pressed="activeSim.cameraMode === cam.id"
        pressed-class="active"
        :label="t(cam.label)"
        @click="selectCameraMode(cam.id)"
      >
        {{ t(cam.label) }}
      </UiButton>

      <UiButton
        variant="action"
        size="compact"
        class="es-hud-cam-btn"
        data-sim-action="snap-back"
        :label="t('Snap Back')"
        @click="snapBack"
      >
        {{ t('Snap') }}
      </UiButton>

      <span class="es-hud-divider" aria-hidden="true"></span>

      <UiButton
        v-if="activeSim.kind === 'tour'"
        variant="action"
        size="compact"
        class="es-hud-cam-btn"
        data-sim-action="takeover"
        :pressed="Boolean(activeSim.canResume)"
        pressed-class="active"
        :label="activeSim.canResume ? t('Rejoin Tour') : t('Take Over')"
        @click="toggleTakeOver"
      >
        {{ activeSim.canResume ? t('Rejoin') : t('Take Over') }}
      </UiButton>

      <UiButton
        v-if="activeSim.canStep"
        variant="action"
        size="compact"
        class="es-hud-cam-btn"
        data-sim-action="next-stop"
        :label="t('Next Stop')"
        @click="nextStop"
      >
        {{ t('Next') }}
      </UiButton>

      <UiButton
        variant="action"
        tone="danger"
        size="compact"
        class="es-hud-cam-btn"
        data-sim-action="stop"
        :label="t('Stop Simulation')"
        @click="stopActiveSim"
      >
        {{ t('Stop') }}
      </UiButton>
    </div>
  </aside>
</template>
