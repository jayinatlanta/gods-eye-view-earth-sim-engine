<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { t } from '../../../i18n/index.js';
import UiButton from '../../kit/UiButton.vue';
import UiIcon from '../../kit/UiIcon.vue';
import UiSearchField from '../../kit/UiSearchField.vue';
import { isolatePointerEvent } from '../cameraControlBridge.js';

/**
 * Reusable Searchable Place / Route / Corridor Picker.
 *
 * Replaces ALL wide native `<select>` origin/destination/corridor/route
 * dropdowns across desktop and mobile with a strictly bounded `UiSearchField` +
 * scrollable filtered listbox supporting keyboard arrows, Enter, and Escape.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  /** Array of `{ value, label, subtitle?, badge?, keywords? }` */
  options: { type: Array, default: () => [] },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  allowCustomText: { type: Boolean, default: false },
  maxVisible: { type: Number, default: 60 },
  pickerId: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'select']);

const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchRef = ref(null);
const listRef = ref(null);

const selectedOption = computed(
  () =>
    props.options.find(
      (opt) => String(opt.value) === String(props.modelValue),
    ) || null,
);

const displayLabel = computed(() => {
  if (selectedOption.value) return selectedOption.value.label;
  if (props.modelValue) return String(props.modelValue);
  return props.placeholder || t('Select...');
});

const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  const matches = [];
  for (const opt of props.options) {
    if (!q) {
      matches.push(opt);
    } else {
      const hay = [
        opt.label || '',
        opt.subtitle || '',
        opt.badge || '',
        opt.value || '',
        ...(Array.isArray(opt.keywords) ? opt.keywords : []),
      ]
        .join(' ')
        .toLowerCase();
      if (hay.includes(q)) {
        matches.push(opt);
      }
    }
    if (matches.length >= props.maxVisible) break;
  }
  return matches;
});

watch(filteredOptions, (next) => {
  if (next.length === 0) {
    activeIndex.value = -1;
  } else if (activeIndex.value < 0 || activeIndex.value >= next.length) {
    activeIndex.value = 0;
  }
});

function scrollActiveIntoView() {
  nextTick(() => {
    const container = listRef.value;
    if (!container) return;
    const item = container.querySelector('[data-picker-active="true"]');
    item?.scrollIntoView?.({ block: 'nearest' });
  });
}

function openPicker() {
  isOpen.value = true;
  if (props.allowCustomText && props.modelValue && !selectedOption.value) {
    query.value = String(props.modelValue);
  } else {
    query.value = '';
  }
  const idx = filteredOptions.value.findIndex(
    (opt) => String(opt.value) === String(props.modelValue),
  );
  activeIndex.value =
    idx >= 0 ? idx : filteredOptions.value.length > 0 ? 0 : -1;
  nextTick(() => {
    searchRef.value?.focus?.();
    scrollActiveIntoView();
  });
}

function closePicker() {
  isOpen.value = false;
  query.value = '';
}

function togglePicker() {
  if (isOpen.value) closePicker();
  else openPicker();
}

function commitOption(opt) {
  if (!opt) return;
  const val = String(opt.value);
  emit('update:modelValue', val);
  emit('select', opt);
  closePicker();
}

function commitCustomQuery() {
  const trimmed = query.value.trim();
  if (!trimmed) return;
  emit('update:modelValue', trimmed);
  emit('select', { value: trimmed, label: trimmed, isCustom: true });
  closePicker();
}

function onPickerKeydown(event) {
  if (!isOpen.value) return;
  const list = filteredOptions.value;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    if (list.length > 0) {
      activeIndex.value = (activeIndex.value + 1 + list.length) % list.length;
      scrollActiveIntoView();
    }
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    if (list.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
      scrollActiveIntoView();
    }
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const active =
      activeIndex.value >= 0 && activeIndex.value < list.length
        ? list[activeIndex.value]
        : null;
    if (
      props.allowCustomText &&
      query.value.trim() &&
      (!active ||
        (active.label.toLowerCase() !== query.value.trim().toLowerCase() &&
          list.length === 0))
    ) {
      commitCustomQuery();
    } else if (active) {
      commitOption(active);
    } else if (props.allowCustomText && query.value.trim()) {
      commitCustomQuery();
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePicker();
  }
}

function onSearchEscape() {
  if (query.value) {
    query.value = '';
  } else {
    closePicker();
  }
}
</script>

<template>
  <div
    class="es-place-picker"
    :class="{ 'is-open': isOpen }"
    :data-place-picker="pickerId || undefined"
    data-sovereign-ui="place-picker"
    @pointerdown.stop="isolatePointerEvent"
    @mousedown.stop="isolatePointerEvent"
    @keydown="onPickerKeydown"
  >
    <span class="es-field-label">{{ label }}</span>

    <UiButton
      variant="action"
      size="compact"
      class="es-picker-trigger"
      :pressed="isOpen"
      pressed-class="active"
      :label="`${label}: ${displayLabel}`"
      @click="togglePicker"
    >
      <span class="es-picker-trigger-text">{{ displayLabel }}</span>
      <span
        v-if="selectedOption?.badge"
        class="es-picker-badge"
        aria-hidden="true"
        >{{ selectedOption.badge }}</span
      >
      <UiIcon
        :name="isOpen ? 'arrow_upward' : 'arrow_drop_down'"
        :size="null"
      />
    </UiButton>

    <div v-if="isOpen" class="es-picker-popover">
      <UiSearchField
        ref="searchRef"
        v-model="query"
        class="es-picker-search"
        :label="t('Filter options')"
        :placeholder="placeholder || t('Type to filter...')"
        :clear-label="t('Clear filter')"
        autocomplete="off"
        spellcheck="false"
        @escape="onSearchEscape"
      />

      <div v-if="allowCustomText && query.trim()" class="es-picker-custom-row">
        <UiButton
          variant="action"
          size="compact"
          class="es-btn-stretch es-picker-custom-btn"
          :label="t('Use custom place')"
          @click="commitCustomQuery"
        >
          <UiIcon name="my_location" :size="null" />
          <span class="es-picker-opt-title"
            >{{ t('Use') }}: {{ query.trim() }}</span
          >
        </UiButton>
      </div>

      <div
        ref="listRef"
        role="listbox"
        :aria-label="label"
        class="es-picker-list ui-scroll"
      >
        <div v-if="filteredOptions.length === 0" class="es-picker-empty">
          {{ emptyText || t('No matching options.') }}
        </div>

        <UiButton
          v-for="(opt, idx) in filteredOptions"
          :key="opt.value"
          variant="ghost"
          size="compact"
          role="option"
          class="es-picker-option"
          :class="{
            'is-active': idx === activeIndex,
            'is-selected': String(opt.value) === String(modelValue),
          }"
          :data-picker-active="idx === activeIndex ? 'true' : undefined"
          :data-picker-value="opt.value"
          :aria-selected="String(String(opt.value) === String(modelValue))"
          :label="opt.label"
          @mouseenter="activeIndex = idx"
          @click="commitOption(opt)"
        >
          <div class="es-picker-opt-main">
            <span class="es-picker-opt-title">{{ opt.label }}</span>
            <span v-if="opt.subtitle" class="es-picker-opt-sub">{{
              opt.subtitle
            }}</span>
          </div>
          <span v-if="opt.badge" class="es-picker-badge">{{ opt.badge }}</span>
        </UiButton>
      </div>
    </div>
  </div>
</template>
