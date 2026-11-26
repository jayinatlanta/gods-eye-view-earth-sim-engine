<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { t } from '../../i18n/index.js';
import RailPanel from '../rail/RailPanel.vue';
import UiButton from '../kit/UiButton.vue';
import UiIcon from '../kit/UiIcon.vue';
import {
  bindPanelDisclosure,
  collapsePanelOnEscape,
} from '../panelDisclosure.js';
import { useSovereignUiStore } from '../stores/sovereignUi.js';
import { EARTH_SIM_MODULES, getEarthSimModuleById } from './moduleRegistry.js';
import { isolatePointerEvent } from './cameraControlBridge.js';

/**
 * Single Extensible Sovereign `Earth Sim` RailPanel (`#earth-sim-panel`).
 *
 * Teleported into upstream `#left-panel-stack` from `SovereignUiRoot.vue`.
 * Uses `data-rail-icon="public"` so upstream `PanelNavigation` & `PanelRailView`
 * render its left-rail icon automatically and strip it whenever `hidden` is true.
 * Binds Escape disclosure directly via `bindPanelDisclosure` (zero edits to
 * upstream `panelChrome.js`).
 */
const store = useSovereignUiStore();
const { activeModuleId, customUiHidden, exclusiveUpstreamSurface } =
  storeToRefs(store);

const isPanelHidden = computed(
  () => customUiHidden.value || exclusiveUpstreamSurface.value,
);

const activeModule = computed(() =>
  getEarthSimModuleById(activeModuleId.value),
);

let escapeBinding = null;

function openExperiences() {
  store.openExplorer({ intro: false });
}

function openConnectPlaces() {
  store.openModule('vehicles-mobility', {
    expandPanel: true,
    mobilityTab: 'corridors',
  });
}

function toggleSandboxArchitect() {
  const sandbox =
    store.runtime?.sandboxDrawer || globalThis?.window?.__gevSandboxDrawer;
  sandbox?.toggle?.();
}

function toggleAiForge() {
  const agentPanel =
    store.runtime?.agentForgePanel || globalThis?.window?.__gevAgentForgePanel;
  agentPanel?.toggle?.();
}

onMounted(() => {
  const panelEl = document.getElementById('earth-sim-panel');
  if (!panelEl) return;
  escapeBinding = bindPanelDisclosure({
    panel: panelEl,
    onEscape: (event) =>
      collapsePanelOnEscape(event, {
        panel: panelEl,
        onChange: () => store.collapseEarthSimPanel(),
        returnFocusTo: () =>
          document.querySelector(
            '.gev-panel-rail--left [data-rail-item="earth-sim-panel"]',
          ),
      }),
  });
});

onBeforeUnmount(() => {
  escapeBinding?.destroy?.();
  escapeBinding = null;
});
</script>

<template>
  <RailPanel
    id="earth-sim-panel"
    data-rail-icon="public"
    data-sovereign-ui="rail-panel"
    :title="t('Earth Sim')"
    :hint="t('Modular Earth Sim Engine Hub')"
    start-collapsed
    scroll
    :hidden="isPanelHidden"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
  >
    <div
      class="es-quick-actions"
      role="toolbar"
      :aria-label="t('Earth Sim Quick Tools')"
    >
      <UiButton
        variant="action"
        size="compact"
        class="es-quick-tool-btn"
        data-action="open-experiences"
        :label="t('Browse Experiences')"
        @click="openExperiences"
      >
        <UiIcon name="travel_explore" :size="null" />
        <span>{{ t('Experiences') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-quick-tool-btn"
        data-action="open-connect-places"
        :label="t('Connect Places & Launch Transport')"
        @click="openConnectPlaces"
      >
        <UiIcon name="timeline" :size="null" />
        <span>{{ t('Connect') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-quick-tool-btn"
        data-action="open-sandbox-architect"
        :label="t('World Architect & Sandbox (B)')"
        @click="toggleSandboxArchitect"
      >
        <UiIcon name="view_in_ar" :size="null" />
        <span>{{ t('Architect') }}</span>
      </UiButton>
      <UiButton
        variant="action"
        size="compact"
        class="es-quick-tool-btn"
        data-action="open-ai-forge"
        :label="t('AI Assistant & Dev Forge')"
        @click="toggleAiForge"
      >
        <UiIcon name="bolt" :size="null" />
        <span>{{ t('AI Forge') }}</span>
      </UiButton>
    </div>

    <div v-if="EARTH_SIM_MODULES.length > 1" class="es-module-switcher">
      <UiButton
        v-for="mod in EARTH_SIM_MODULES"
        :key="mod.id"
        variant="action"
        size="compact"
        class="es-module-tab-btn"
        :pressed="activeModule?.id === mod.id"
        pressed-class="active"
        :label="t(mod.label)"
        @click="store.setActiveModule(mod.id)"
      >
        <UiIcon :name="mod.icon" :size="null" />
        <span>{{ t(mod.label) }}</span>
      </UiButton>
    </div>

    <div class="es-module-body">
      <component :is="activeModule.component" v-if="activeModule" />
    </div>
  </RailPanel>
</template>
