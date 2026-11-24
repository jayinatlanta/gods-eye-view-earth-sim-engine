<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { EXCLUSIVE_SURFACE_CLASSES } from '../../exclusiveSurfaces.js';
import { t } from '../../i18n/index.js';
import UiButton from '../kit/UiButton.vue';
import UiIcon from '../kit/UiIcon.vue';
import { useSovereignUiStore } from '../stores/sovereignUi.js';
import EarthSimRailPanel from './EarthSimRailPanel.vue';
import ExperiencesExplorer from './ExperiencesExplorer.vue';
import ActiveSimMicroHud from './ActiveSimMicroHud.vue';
import { isolatePointerEvent } from './cameraControlBridge.js';

/**
 * Top-Level Sovereign Vue 3 Root (`SovereignUiRoot.vue`).
 *
 * Dynamically mounted only by `src/app/sovereignTools.js` (so `qa:stub-boot`
 * remains 100% Cesium-free).
 * - Teleports the single extensible `#earth-sim-panel` into `#left-panel-stack`.
 * - Renders top-right `#gev-experiences-entry` with upstream's official
 *   `data-stories-corner` attribute so `StoriesView` automatically positions
 *   `Stories` to its left with zero overlap across all viewports.
 * - Renders `ExperiencesExplorer.vue` and `ActiveSimMicroHud.vue`.
 * - Renders the standalone `"Hide Custom UI"` (`Alt+H`) Vue Kit pill.
 * - Observes `document.body` class mutations for upstream `EXCLUSIVE_SURFACE_CLASSES`
 *   and `stories-mode`.
 */
const store = useSovereignUiStore();
const { customUiHidden, exclusiveUpstreamSurface, explorerOpen } =
  storeToRefs(store);

const hasLeftPanelStack = ref(false);
const entryPos = ref({ top: 14, right: 14, compact: false });

const showExperiencesEntry = computed(
  () =>
    !customUiHidden.value &&
    !exclusiveUpstreamSurface.value &&
    !explorerOpen.value,
);

const showHidePill = computed(
  () => !exclusiveUpstreamSurface.value && !explorerOpen.value,
);

const SUPPRESSING_BODY_CLASSES = [...EXCLUSIVE_SURFACE_CLASSES, 'stories-mode'];

function syncExclusiveSurface() {
  if (typeof document === 'undefined' || !document.body) return;
  const active = SUPPRESSING_BODY_CLASSES.some((cls) =>
    document.body.classList.contains(cls),
  );
  store.setExclusiveUpstreamSurface(active);
}

/**
 * Places `#gev-experiences-entry` (`data-stories-corner`) cleanly in GEV's
 * top-right row without colliding with `#style-indicator` (desktop/tablet)
 * or `#corner-actions` (mobile <=720px). Upstream `StoriesView.vue` automatically
 * reads `[data-stories-corner]` and shifts `Stories` to our left!
 */
function placeExperiencesEntry() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const width = window.innerWidth || 1280;
  const styleEl = document.getElementById('style-indicator');
  const styleRect = styleEl?.getBoundingClientRect?.();
  if (styleRect && styleRect.width > 0 && styleRect.height > 0) {
    entryPos.value = {
      top: Math.round(styleRect.top),
      right: Math.max(14, Math.round(width - styleRect.left + 10)),
      compact: false,
    };
    return;
  }
  const colRect = document
    .getElementById('corner-actions')
    ?.getBoundingClientRect?.();
  if (colRect && colRect.width > 0 && colRect.height > 0) {
    entryPos.value = {
      top: Math.round(colRect.bottom + 8),
      right: Math.max(10, Math.round(width - colRect.right)),
      compact: width <= 720,
    };
    return;
  }
  entryPos.value = { top: 14, right: 14, compact: width <= 720 };
}

function openExperiences() {
  store.openExplorer({ intro: false });
}

function toggleHideCustomUi() {
  store.toggleCustomUiHidden();
}

function onGlobalKeyDown(event) {
  if (!event?.altKey || (event.key !== 'h' && event.key !== 'H')) return;
  const tag = event.target?.tagName;
  if (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    event.target?.isContentEditable
  ) {
    return;
  }
  event.preventDefault();
  store.toggleCustomUiHidden();
}

let bodyObserver = null;
let cornerResizeObserver = null;
let placeTimer = null;

onMounted(() => {
  hasLeftPanelStack.value = Boolean(
    typeof document !== 'undefined' &&
    document.getElementById('left-panel-stack'),
  );
  syncExclusiveSurface();
  placeExperiencesEntry();

  if (typeof MutationObserver === 'function' && document.body) {
    bodyObserver = new MutationObserver(() => {
      syncExclusiveSurface();
      placeExperiencesEntry();
    });
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  if (typeof ResizeObserver === 'function') {
    cornerResizeObserver = new ResizeObserver(placeExperiencesEntry);
    const styleEl = document.getElementById('style-indicator');
    const colEl = document.getElementById('corner-actions');
    if (styleEl) cornerResizeObserver.observe(styleEl);
    if (colEl) cornerResizeObserver.observe(colEl);
  }

  window.addEventListener('resize', placeExperiencesEntry);
  window.addEventListener('keydown', onGlobalKeyDown);
  // One delayed pass after boot CSS/fonts settle so Stories & Experiences align pixel-perfectly.
  placeTimer = setTimeout(placeExperiencesEntry, 450);
});

onBeforeUnmount(() => {
  bodyObserver?.disconnect?.();
  bodyObserver = null;
  cornerResizeObserver?.disconnect?.();
  cornerResizeObserver = null;
  window.removeEventListener('resize', placeExperiencesEntry);
  window.removeEventListener('keydown', onGlobalKeyDown);
  if (placeTimer !== null) {
    clearTimeout(placeTimer);
    placeTimer = null;
  }
});
</script>

<template>
  <div id="gev-sovereign-ui-root">
    <Teleport v-if="hasLeftPanelStack" to="#left-panel-stack">
      <EarthSimRailPanel />
    </Teleport>

    <!-- Sibling Top-Right Experiences Entry Button (Upstream data-stories-corner contract) -->
    <UiButton
      v-show="showExperiencesEntry"
      id="gev-experiences-entry"
      data-stories-corner=""
      data-sovereign-ui="experiences-entry"
      variant="ghost"
      :class="{ 'es-entry-compact': entryPos.compact }"
      :style="{ top: `${entryPos.top}px`, right: `${entryPos.right}px` }"
      :label="t('Explore Earth Sim Experiences')"
      @pointerdown.stop="isolatePointerEvent"
      @click="openExperiences"
    >
      <UiIcon name="travel_explore" :size="null" />
      <span class="es-entry-label">{{ t('Experiences') }}</span>
    </UiButton>

    <!-- Full-Screen Sibling Experiences Card + Pin Explorer -->
    <ExperiencesExplorer
      v-if="explorerOpen && !customUiHidden && !exclusiveUpstreamSurface"
    />

    <!-- Active-Sim Auto-Folding Micro-HUD -->
    <ActiveSimMicroHud />

    <!-- Standalone Hide Custom UI (Alt+H) Restore/Toggle Pill -->
    <UiButton
      v-if="showHidePill"
      id="gev-sovereign-hide-pill"
      data-sovereign-ui="hide-pill"
      variant="ghost"
      :class="{ 'is-hidden-mode': customUiHidden }"
      :pressed="customUiHidden"
      pressed-class="is-hidden-mode"
      :label="
        customUiHidden
          ? t('Restore Custom Sim UI (Alt+H)')
          : t('Hide Custom UI without stopping sims (Alt+H)')
      "
      @pointerdown.stop="isolatePointerEvent"
      @click="toggleHideCustomUi"
    >
      <UiIcon
        :name="customUiHidden ? 'visibility' : 'visibility_off'"
        :size="null"
      />
      <span>{{ customUiHidden ? t('Sim UI') : t('Hide Custom UI') }}</span>
    </UiButton>
  </div>
</template>
