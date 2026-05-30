<template>
  <div v-if="isVisible" class="tab-bar" role="tablist">
    <button
      v-for="tab in editorStore.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === editorStore.activeTabId }"
      role="tab"
      :aria-selected="tab.id === editorStore.activeTabId"
      :title="tab.filePath || 'Untitled'"
      @click="editorStore.setActiveTab(tab.id)"
      @mousedown.middle.prevent="onClose(tab.id, $event)"
    >
      <span class="tab-label">{{ labelFor(tab) }}</span>
      <span v-if="tab.isDirty" class="tab-dirty" aria-label="Unsaved changes">●</span>
      <span
        class="tab-close"
        role="button"
        aria-label="Close tab"
        @click.stop="onClose(tab.id, $event)"
      >×</span>
    </button>
    <button
      class="tab-add"
      :title="'New Tab'"
      aria-label="New Tab"
      @click="onNewTab"
    >+</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore, type Tab } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
import { saveFile, updateWindowTitle } from '../services/fileService';
import { basename } from '../utils/path';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();

const isVisible = computed(
  () => settingsStore.documentMode === 'tabs' || editorStore.tabCount > 1,
);

function labelFor(tab: Tab): string {
  return tab.filePath ? basename(tab.filePath) : 'Untitled';
}

async function onClose(id: string, event: Event) {
  event.stopPropagation();
  const tab = editorStore.tabs.find((t) => t.id === id);
  if (!tab) return;

  if (tab.isDirty) {
    // Activate the tab being closed so the unsaved prompt + Save acts on it.
    editorStore.setActiveTab(id);
    const choice = await promptUnsavedChanges();
    if (choice === 'cancel') return;
    if (choice === 'save') {
      const saved = await saveFile(editorStore);
      if (!saved) return;
    }
  }

  editorStore.closeTab(id);
  await updateWindowTitle(editorStore);
}

async function onNewTab() {
  // The "+" button is part of the tab UI, so it always adds a tab regardless
  // of documentMode — the menu's "New Window" handles the alternative.
  editorStore.addTab();
  await updateWindowTitle(editorStore);
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  scrollbar-width: thin;
  flex-shrink: 0;
  user-select: none;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem 0.4rem 0.85rem;
  border: none;
  border-right: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.2;
  cursor: pointer;
  max-width: 220px;
  min-width: 80px;
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.tab:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.tab.active {
  background: var(--bg-color);
  color: var(--text-color);
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent-color);
}

.tab-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: left;
}

.tab-dirty {
  color: var(--accent-color);
  font-size: 0.55rem;
  line-height: 1;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 0.95rem;
  line-height: 1;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.tab-add {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 0.85rem;
  font-size: 1rem;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}

.tab-add:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}
</style>
