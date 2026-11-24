<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { t } from '../../i18n/index.js';
import UiButton from '../kit/UiButton.vue';
import UiCheckbox from '../kit/UiCheckbox.vue';
import UiCloseButton from '../kit/UiCloseButton.vue';
import UiEmpty from '../kit/UiEmpty.vue';
import UiIcon from '../kit/UiIcon.vue';
import UiSearchField from '../kit/UiSearchField.vue';
import UiSelect from '../kit/UiSelect.js';
import {
  EXPLORER_FEED_WIDTH_STORAGE_KEY,
  useSovereignUiStore,
} from '../stores/sovereignUi.js';
import { EARTH_SIM_INTRO_STORAGE_KEY } from '../earthSimTourOverlay.js';
import {
  EXPERIENCE_CATEGORIES,
  buildExperiencesCatalog,
  filterAndSortExperiences,
} from './experiencesCatalogAdapter.js';
import { isolatePointerEvent } from './cameraControlBridge.js';

/**
 * Sibling Stories-Style `Experiences` Card + Pin Explorer (`2.A`).
 *
 * Modeled directly on upstream `ExploreScreen.vue` ergonomics using strictly
 * `src/ui/kit/` controls:
 * - Desktop / Tablet (>720px): resizable left card feed (280px–440px, persisted)
 *   over the live Cesium globe + zero-allocation projected interactive globe pins.
 * - Mobile Phone (<=720px): 3-snap bottom sheet (`map` / `split` / `list`).
 * - Replaces `earthSimTourOverlay.js` with optional dismissible `?intro=1` banner.
 */
const store = useSovereignUiStore();
const {
  explorerQuery,
  explorerChips,
  explorerSort,
  explorerPickedId,
  explorerIntroMode,
} = storeToRefs(store);

const allItems = ref(buildExperiencesCatalog({ includeDomiciles: true }));

const filteredItems = computed(() =>
  filterAndSortExperiences(allItems.value, {
    query: explorerQuery.value,
    chips: explorerChips.value,
    sort: explorerSort.value,
  }),
);

const countLabel = computed(() =>
  filteredItems.value.length === allItems.value.length
    ? String(allItems.value.length)
    : `${filteredItems.value.length}/${allItems.value.length}`,
);

const sortOptions = computed(() => [
  { value: 'featured', label: t('Featured') },
  { value: 'az', label: t('A–Z') },
  { value: 'stops', label: t('Most Stops') },
]);

const searchFieldRef = ref(null);
const feedWidthPx = ref(readStoredFeedWidth());
const mobileSnap = ref('split'); // 'map' | 'split' | 'list'
const suppressStartupIntro = ref(readIntroDismissed());

function readStoredFeedWidth() {
  try {
    const raw = Number(
      globalThis?.localStorage?.getItem?.(EXPLORER_FEED_WIDTH_STORAGE_KEY),
    );
    if (Number.isFinite(raw) && raw >= 280 && raw <= 440) return raw;
  } catch {
    /* ignore */
  }
  return 356;
}

function writeStoredFeedWidth(w) {
  try {
    globalThis?.localStorage?.setItem?.(
      EXPLORER_FEED_WIDTH_STORAGE_KEY,
      String(Math.round(w)),
    );
  } catch {
    /* ignore */
  }
}

function readIntroDismissed() {
  try {
    return (
      globalThis?.localStorage?.getItem?.(EARTH_SIM_INTRO_STORAGE_KEY) ===
      'dismissed'
    );
  } catch {
    return false;
  }
}

function onSuppressIntroChange(checked) {
  suppressStartupIntro.value = Boolean(checked);
  try {
    if (suppressStartupIntro.value) {
      globalThis?.localStorage?.setItem?.(
        EARTH_SIM_INTRO_STORAGE_KEY,
        'dismissed',
      );
    } else {
      globalThis?.localStorage?.removeItem?.(EARTH_SIM_INTRO_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function isChipActive(chipId) {
  if (chipId === 'all') return explorerChips.value.length === 0;
  return explorerChips.value.includes(chipId);
}

function toggleChip(chipId) {
  if (chipId === 'all') {
    explorerChips.value = [];
    return;
  }
  if (explorerChips.value.includes(chipId)) {
    explorerChips.value = explorerChips.value.filter((id) => id !== chipId);
  } else {
    explorerChips.value = [...explorerChips.value, chipId];
  }
}

function resetFilters() {
  explorerQuery.value = '';
  explorerChips.value = [];
}

function closeExplorer() {
  store.closeExplorer();
}

function previewItem(item) {
  if (!item) return;
  explorerPickedId.value = item.id;
  if (
    typeof window !== 'undefined' &&
    window.innerWidth <= 720 &&
    mobileSnap.value === 'list'
  ) {
    mobileSnap.value = 'split';
  }
  store.runtime?.flyToCoords?.(
    item.lat,
    item.lon,
    Math.max(950, (item.elev || 0) + 950),
    {
      pitchDeg: -42,
      duration: 1.35,
      reason: `exp-preview-${item.id}`,
    },
  );
}

function launchItem(item) {
  if (!item) return;
  explorerPickedId.value = item.id;
  store.closeExplorer();
  store.runtime?.launchExperience?.(item);
  store.bumpTelemetry();
}

// ── Desktop feed horizontal resize handle (280px–440px) ──
let dragResize = null;
function startResize(event) {
  dragResize = {
    startX: event.clientX,
    startWidth: feedWidthPx.value,
  };
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', stopResize);
}
function onResizeMove(event) {
  if (!dragResize) return;
  const next = Math.max(
    280,
    Math.min(440, dragResize.startWidth + (event.clientX - dragResize.startX)),
  );
  feedWidthPx.value = Math.round(next);
}
function stopResize() {
  if (!dragResize) return;
  dragResize = null;
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', stopResize);
  writeStoredFeedWidth(feedWidthPx.value);
}

// ── Projected Globe Pins (Renderer-agnostic port via store.runtime) ──
const projectedPins = ref([]);
let removeFrameListener = null;
let lastProjectMs = 0;

function projectVisiblePins() {
  const projectPin = store.runtime?.projectGeoToViewport;
  if (typeof projectPin !== 'function') {
    projectedPins.value = [];
    return;
  }
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastProjectMs < 60) return;
  lastProjectMs = now;

  const maxPins = 28;
  const next = [];

  for (const item of filteredItems.value) {
    if (next.length >= maxPins) break;
    try {
      const pt = projectPin(item.lat, item.lon, item.elev || 0);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const width = pt.width || globalThis?.innerWidth || 1280;
      const height = pt.height || globalThis?.innerHeight || 800;
      const minX = width > 720 ? feedWidthPx.value + 16 : 16;
      if (
        pt.x >= minX &&
        pt.x <= width - 20 &&
        pt.y >= 48 &&
        pt.y <= height - 40
      ) {
        next.push({
          id: item.id,
          shortTitle: item.shortTitle,
          accent: item.accent,
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          item,
        });
      }
    } catch {
      /* ignore behind-globe projection errors */
    }
  }
  projectedPins.value = next;
}

function onKeyDown(event) {
  if (event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault();
    event.stopPropagation();
    closeExplorer();
    return;
  }
  if (
    event.key === '/' &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
  ) {
    event.preventDefault();
    searchFieldRef.value?.focus?.();
  }
}

watch([filteredItems, feedWidthPx], () => {
  lastProjectMs = 0;
  projectVisiblePins();
});

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true);
  if (typeof store.runtime?.onFrameRender === 'function') {
    removeFrameListener = store.runtime.onFrameRender(projectVisiblePins);
  }
  projectVisiblePins();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  stopResize();
  if (typeof removeFrameListener === 'function') {
    removeFrameListener();
    removeFrameListener = null;
  }
});
</script>

<template>
  <section
    id="gev-experiences-explorer"
    role="region"
    data-sovereign-ui="experiences-explorer"
    :aria-label="t('Earth Sim Experiences Explorer')"
  >
    <!-- Live Projected Globe Pins -->
    <div class="es-exp-pins" aria-hidden="false">
      <UiButton
        v-for="pin in projectedPins"
        :key="pin.id"
        variant="ghost"
        class="es-exp-pin"
        :class="{ 'is-picked': explorerPickedId === pin.id }"
        :style="{
          transform: `translate(${pin.x}px, ${pin.y}px) translate(-50%, -100%)`,
        }"
        :label="pin.shortTitle"
        @pointerdown.stop="isolatePointerEvent"
        @click="
          explorerPickedId === pin.id
            ? launchItem(pin.item)
            : previewItem(pin.item)
        "
      >
        <span
          class="es-exp-pin-dot"
          :style="{ background: pin.accent }"
          aria-hidden="true"
        ></span>
        <span>{{ pin.shortTitle }}</span>
      </UiButton>
    </div>

    <!-- Split-Screen Desktop Feed / Mobile 3-Snap Sheet -->
    <div
      class="es-exp-feed"
      :class="`es-snap-${mobileSnap}`"
      :style="{ width: `${feedWidthPx}px` }"
      @pointerdown.stop="isolatePointerEvent"
      @mousedown.stop="isolatePointerEvent"
    >
      <div
        class="es-exp-resizer"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('Resize Experiences Panel')"
        @pointerdown.stop="startResize"
      ></div>

      <!-- Mobile 3-Snap Controls (<=720px) -->
      <div class="es-sheet-grip">
        <UiButton
          v-for="snap in [
            { id: 'map', label: t('Map') },
            { id: 'split', label: t('Split') },
            { id: 'list', label: t('List') },
          ]"
          :key="snap.id"
          variant="action"
          size="compact"
          :pressed="mobileSnap === snap.id"
          pressed-class="active"
          :label="snap.label"
          @click="mobileSnap = snap.id"
        >
          {{ snap.label }}
        </UiButton>
      </div>

      <header class="es-exp-header">
        <div class="es-exp-brand">
          <span class="es-exp-eyebrow">{{ t('EARTH SIM ENGINE') }}</span>
          <h2 class="es-exp-title">
            {{ t('Experiences') }} ({{ countLabel }})
          </h2>
        </div>
        <UiCloseButton
          class="es-exp-close"
          glyph="icon"
          :label="t('Close Experiences Explorer')"
          @click="closeExplorer"
        />
      </header>

      <div v-if="explorerIntroMode" class="es-exp-intro-banner">
        <div>
          <strong>{{
            t("What's Inside God's Eye View (Earth Sim Engine Edition)")
          }}</strong>
          —
          {{
            t(
              'Interactive Theme Park Days, Resort Stays, State Parks, Living Cities, Domiciles & Wilderness Trails built atop GEV by',
            )
          }}
          <a
            class="es-exp-credit-link"
            href="https://github.com/bilawalsidhu/gods-eye-view"
            target="_blank"
            rel="noopener noreferrer"
            >bilawalsidhu</a
          >.
        </div>
        <UiCheckbox
          :model-value="suppressStartupIntro"
          @update:model-value="onSuppressIntroChange"
        >
          {{ t("Don't show on startup") }}
        </UiCheckbox>
      </div>

      <div class="es-exp-toolbar">
        <div class="es-exp-search-row">
          <UiSearchField
            ref="searchFieldRef"
            v-model="explorerQuery"
            class="es-exp-search"
            :label="t('Search experiences, parks, resorts, cities')"
            :placeholder="t('Search parks, resorts, cities... (/)')"
            :clear-label="t('Clear search')"
            @escape="explorerQuery = ''"
          />
          <UiSelect
            v-model="explorerSort"
            class="es-select es-exp-sort"
            :options="sortOptions"
            :aria-label="t('Sort experiences')"
          />
        </div>

        <div class="es-exp-chips">
          <UiButton
            v-for="cat in EXPERIENCE_CATEGORIES"
            :key="cat.id"
            variant="action"
            size="compact"
            class="es-exp-chip"
            :data-exp-chip="cat.id"
            :pressed="isChipActive(cat.id)"
            pressed-class="active"
            :label="t(cat.label)"
            @click="toggleChip(cat.id)"
          >
            {{ t(cat.label) }}
          </UiButton>
        </div>
      </div>

      <div class="es-exp-cards ui-scroll">
        <UiEmpty
          v-if="filteredItems.length === 0"
          :title="t('No matching experiences')"
          :body="t('Try clearing filters or searching another destination.')"
        >
          <UiButton
            variant="action"
            size="compact"
            :label="t('Reset Filters')"
            @click="resetFilters"
          >
            {{ t('Reset Filters') }}
          </UiButton>
        </UiEmpty>

        <article
          v-for="item in filteredItems"
          :key="item.id"
          class="es-card"
          :class="{ 'es-card--picked': explorerPickedId === item.id }"
          :data-experience-id="item.id"
        >
          <div class="es-card-top">
            <div class="es-card-thumb" :style="{ borderColor: item.accent }">
              <img
                v-if="item.thumbnailUrl"
                :src="item.thumbnailUrl"
                :alt="item.shortTitle"
                loading="lazy"
              />
              <UiIcon
                v-else
                :name="item.icon || 'travel_explore'"
                :size="null"
                :style="{ color: item.accent }"
              />
            </div>

            <div class="es-card-info">
              <h3 class="es-card-title">{{ item.title }}</h3>
              <div class="es-card-meta">{{ item.metaText }}</div>
              <div class="es-card-region">{{ item.region }}</div>
            </div>
          </div>

          <p class="es-card-summary">{{ item.summary }}</p>

          <div class="es-card-actions">
            <UiButton
              variant="primary"
              size="compact"
              :data-launch-id="item.id"
              :label="`${t(item.actionLabel)} — ${item.shortTitle}`"
              @click="launchItem(item)"
            >
              {{ t(item.actionLabel) }}
            </UiButton>
            <UiButton
              variant="action"
              size="compact"
              :data-preview-id="item.id"
              :label="`${t('Fly To')} ${item.shortTitle}`"
              @click="previewItem(item)"
            >
              {{ t('Fly To') }}
            </UiButton>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
