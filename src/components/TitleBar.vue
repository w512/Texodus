<template>
  <div class="titlebar glass" data-tauri-drag-region>
    <!-- Left spacer: room for macOS traffic lights -->
    <div class="titlebar-spacer"></div>

    <!-- Center: window title -->
    <div class="titlebar-title" data-tauri-drag-region>{{ title }}</div>

    <!-- Right: View & Theme controls (moved from toolbar) -->
    <div class="titlebar-controls">
      <button
        id="btn-toggle-toolbar"
        class="tb-btn icon-only"
        :title="toolbarVisible ? 'Hide Toolbar' : 'Show Toolbar'"
        @click="$emit('toggle-toolbar')"
      >
        <span class="tb-icon" :style="{ '--icon': `url(${toolbarVisible ? iconClosePane : iconOpenPane})` }"></span>
      </button>

      <div class="layout-switcher">
        <button
          v-for="mode in layoutModes"
          :key="mode.value"
          :id="`btn-layout-${mode.value}`"
          class="tb-btn icon-only"
          :class="{ active: layoutMode === mode.value }"
          :title="mode.label"
          @click="$emit('toggle-layout', mode.value)"
        >
          <span class="tb-icon" :style="{ '--icon': `url(${mode.icon})` }"></span>
        </button>
      </div>

      <button id="btn-theme" class="tb-btn icon-only" :title="`Theme: ${themeLabel}`" @click="$emit('cycle-theme')">
        <span class="tb-icon" :style="{ '--icon': `url(${themeIcon})` }"></span>
      </button>

      <SettingsMenu />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SettingsMenu from './SettingsMenu.vue';

import iconLayoutSplit from '../assets/icons/icons8-view-stream-100.png';
import iconLayoutFocus from '../assets/icons/icons8-pencil-drawing-100.png';
import iconLayoutPreview from '../assets/icons/icons8-preview-100.png';
import iconThemeSystem from '../assets/icons/icons8-operating-system-100.png';
import iconThemeLight from '../assets/icons/icons8-sun-100.png';
import iconThemeDark from '../assets/icons/icons8-do-not-disturb-ios-100.png';
import iconOpenPane from '../assets/icons/icons8-open-pane-100.png';
import iconClosePane from '../assets/icons/icons8-close-pane-100.png';

const props = defineProps({
  layoutMode: String,
  themeMode: String,
  title: { type: String, default: 'Texodus' },
  toolbarVisible: { type: Boolean, default: true },
});

defineEmits(['toggle-layout', 'cycle-theme', 'toggle-toolbar']);

const layoutModes = [
  { value: 'split', label: 'Split View', icon: iconLayoutSplit },
  { value: 'focus', label: 'Editor Only (Focus Mode)', icon: iconLayoutFocus },
  { value: 'preview', label: 'Preview Only', icon: iconLayoutPreview },
];

const themeLabel = computed(() => {
  if (props.themeMode === 'system') return 'System';
  if (props.themeMode === 'light') return 'Light';
  return 'Dark';
});

const themeIcon = computed(() => {
  if (props.themeMode === 'dark') return iconThemeDark;
  if (props.themeMode === 'light') return iconThemeLight;
  return iconThemeSystem;
});
</script>

<style scoped>
.titlebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  height: 38px;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
  position: relative;
  z-index: 20;
}

/* Glassmorphism */
.glass {
  background: var(--toolbar-bg);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
}

/* Space for macOS traffic lights (close/minimize/maximize) */
.titlebar-spacer {
  width: 72px;
  flex-shrink: 0;
}

.titlebar-title {
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-content: flex-end;
}

/* Button styles – match Toolbar.vue */
.tb-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: none;
  padding: 0.3rem 0.4rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color);
  transition: background 0.15s, color 0.15s, transform 0.1s;
  white-space: nowrap;
}

.tb-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
  transition: transform 0.15s;
}

.tb-btn:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.tb-btn:hover .tb-icon { transform: scale(1.1); }
.tb-btn:active { transform: scale(0.94); }

.tb-btn.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
  font-weight: 600;
}

.tb-btn.icon-only { padding: 0.25rem 0.35rem; }

.layout-switcher {
  display: flex;
  background: var(--btn-hover);
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
}

.layout-switcher .tb-btn {
  border-radius: 6px;
  padding: 0.15rem 0.35rem;
}
</style>
