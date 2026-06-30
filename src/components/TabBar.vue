<template>
  <div v-if="isVisible" class="tab-bar" role="tablist">
    <button
      v-for="tab in editorStore.tabs"
      :key="tab.id"
      class="tab"
      :class="{
        active: tab.id === editorStore.activeTabId,
        dirty: tab.isDirty,
        dragging: dragState.id === tab.id,
        'drag-over': dragState.beforeId === tab.id,
      }"
      role="tab"
      :aria-selected="tab.id === editorStore.activeTabId"
      :title="tab.filePath ? `${labelFor(tab)} — ${tab.filePath}` : 'Untitled'"
      @click="handleTabClick(tab.id)"
      @mousedown.middle.prevent="onClose(tab.id, $event)"
      @contextmenu.prevent="openContextMenu($event, tab.id)"
      @pointerdown="prepareDrag(tab.id, $event)"
      :data-tab-id="tab.id"
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
    <div
      v-if="contextMenu.visible"
      class="tab-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="tab-context-item" @click="onContextDuplicate">Duplicate Tab</div>
      <div class="tab-context-item" @click="onContextClose">Close</div>
      <div
        v-if="editorStore.tabCount > 1"
        class="tab-context-item"
        @click="onContextCloseOthers"
      >Close Other Tabs</div>
      <div
        v-if="hasTabsToRight"
        class="tab-context-item"
        @click="onContextCloseRight"
      >Close Tabs to the Right</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useEditorStore, type Tab } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
import { saveFile, updateWindowTitle } from '../services/fileService';
import { basename } from '../utils/path';
import { flushPendingSave } from '../composables/useAutoSave';

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

  // Flush any pending auto-save before checking dirty state.
  if (settingsStore.autoSave) await flushPendingSave();

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

// ── Context menu ───────────────────────────────────────────────────────────

const contextMenu = ref({ visible: false, x: 0, y: 0, tabId: '' });

// ── Drag-to-reorder ─────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 5;
const dragState = ref<{ id: string; beforeId: string | null }>({ id: '', beforeId: null });
let dragCandidate: { id: string; startX: number; startY: number } | null = null;
let suppressClick = false;

function prepareDrag(id: string, e: PointerEvent) {
  // Only start drag candidate on primary button.
  if (e.button !== 0) return;
  dragCandidate = { id, startX: e.clientX, startY: e.clientY };
  window.addEventListener('pointermove', handleDragMove);
  window.addEventListener('pointerup', handleDragEnd, { once: true });
  window.addEventListener('pointercancel', cancelDrag, { once: true });
}

function handleDragMove(e: PointerEvent) {
  if (!dragCandidate) return;
  const moved = Math.hypot(e.clientX - dragCandidate.startX, e.clientY - dragCandidate.startY);
  if (!dragState.value.id && moved < DRAG_THRESHOLD_PX) return;
  if (!dragState.value.id) {
    dragState.value.id = dragCandidate.id;
    suppressClick = true;
  }
  // Find which tab the pointer is over.
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tabBtn = el?.closest<HTMLElement>('[data-tab-id]');
  if (tabBtn) {
    const overId = tabBtn.dataset.tabId!;
    if (overId !== dragState.value.id) {
      dragState.value.beforeId = overId;
    } else {
      dragState.value.beforeId = null;
    }
  } else {
    // Past the last tab — drop at end.
    dragState.value.beforeId = null;
  }
}

function handleDragEnd() {
  window.removeEventListener('pointermove', handleDragMove);
  window.removeEventListener('pointercancel', cancelDrag);
  const { id, beforeId } = dragState.value;
  endDrag();
  if (id && beforeId) {
    editorStore.moveTab(id, beforeId);
  } else if (id && !beforeId && dragCandidate) {
    // Dropped past the last tab — move to end.
    const lastTab = editorStore.tabs[editorStore.tabs.length - 1];
    if (lastTab && lastTab.id !== id) {
      editorStore.moveTab(id, lastTab.id);
      // moveTab inserts before, so swap to move after.
      editorStore.moveTab(lastTab.id, id);
    }
  }
  dragCandidate = null;
}

function cancelDrag() {
  window.removeEventListener('pointermove', handleDragMove);
  endDrag();
  dragCandidate = null;
}

function endDrag() {
  dragState.value = { id: '', beforeId: null };
}

function handleTabClick(id: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  // Flush pending auto-save for the outgoing tab before switching.
  if (settingsStore.autoSave) void flushPendingSave();
  editorStore.setActiveTab(id);
}

const hasTabsToRight = computed(() => {
  if (!contextMenu.value.visible) return false;
  const idx = editorStore.tabs.findIndex((t) => t.id === contextMenu.value.tabId);
  return idx >= 0 && idx < editorStore.tabs.length - 1;
});

function openContextMenu(e: MouseEvent, tabId: string) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, tabId };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function onContextDuplicate() {
  const id = contextMenu.value.tabId;
  closeContextMenu();
  editorStore.duplicateTab(id);
}

async function onContextClose() {
  const id = contextMenu.value.tabId;
  closeContextMenu();
  await onClose(id, new Event('click'));
}

async function onContextCloseOthers() {
  const id = contextMenu.value.tabId;
  closeContextMenu();

  // Prompt for unsaved changes on dirty tabs that will be closed.
  const dirtyTabs = editorStore.tabs.filter((t) => t.id !== id && t.isDirty);
  for (const tab of dirtyTabs) {
    editorStore.setActiveTab(tab.id);
    const choice = await promptUnsavedChanges();
    if (choice === 'cancel') return;
    if (choice === 'save') {
      const saved = await saveFile(editorStore);
      if (!saved) return;
    }
  }

  editorStore.closeOtherTabs(id);
  await updateWindowTitle(editorStore);
}

async function onContextCloseRight() {
  const id = contextMenu.value.tabId;
  closeContextMenu();

  const idx = editorStore.tabs.findIndex((t) => t.id === id);
  const rightTabs = editorStore.tabs.slice(idx + 1);
  for (const tab of rightTabs) {
    if (!tab.isDirty) continue;
    editorStore.setActiveTab(tab.id);
    const choice = await promptUnsavedChanges();
    if (choice === 'cancel') return;
    if (choice === 'save') {
      const saved = await saveFile(editorStore);
      if (!saved) return;
    }
  }

  editorStore.closeTabsToTheRight(id);
  await updateWindowTitle(editorStore);
}

onMounted(() => document.addEventListener('click', closeContextMenu));
onUnmounted(() => document.removeEventListener('click', closeContextMenu));
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

.tab.dragging {
  opacity: 0.5;
}

.tab.drag-over {
  box-shadow: inset 2px 0 0 var(--accent-color);
}

.tab-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: left;
}

.tab-dirty {
  color: var(--danger-color);
  font-size: 0.7rem;
  line-height: 1;
  text-shadow: 0 0 4px var(--danger-color);
}

.tab.dirty .tab-label {
  font-style: italic;
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

/* ── Context menu ─────────────────────────────────────────────────────── */

.tab-context-menu {
  position: fixed;
  z-index: 3000;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 180px;
}

.tab-context-item {
  padding: 7px 16px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-color);
  transition: background 0.1s;
}

.tab-context-item:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}
</style>
