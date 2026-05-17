<template>
  <ThemeProvider>
    <KeyboardShortcuts />
    <div class="app-wrapper">
      <TitleBar
        :layoutMode="settingsStore.layoutMode"
        :themeMode="settingsStore.themeMode"
        :title="windowTitle"
        :toolbarVisible="toolbarVisible"
        @toggle-layout="settingsStore.setLayoutMode($event)"
        @cycle-theme="settingsStore.cycleTheme()"
        @toggle-toolbar="toolbarVisible = !toolbarVisible"
      />
      <Toolbar
        v-show="toolbarVisible"
        :isDirty="editorStore.isDirty"
        @new-file="handleNewFile"
        @open-file="handleOpenFile"
        @save-file="handleSaveFile"
        @save-as="handleSaveAs"
        @format="handleFormat"
      />
      <EditorLayout :layoutMode="settingsStore.layoutMode">
        <template #editor><TextEditor /></template>
        <template #preview><MarkdownPreview /></template>
      </EditorLayout>
    </div>
    <UnsavedChangesDialog />
    <AboutDialog />
  </ThemeProvider>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from './stores/settings';
import { useEditorStore } from './stores/editor';
import TitleBar from './components/TitleBar.vue';
import Toolbar from './components/Toolbar.vue';
import EditorLayout from './components/EditorLayout.vue';
import TextEditor from './components/TextEditor.vue';
import MarkdownPreview from './components/MarkdownPreview.vue';
import ThemeProvider from './components/ThemeProvider.vue';
import KeyboardShortcuts from './components/KeyboardShortcuts.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import AboutDialog from './components/AboutDialog.vue';
import {
  openFile, saveFile, saveFileAs, newFile,
  loadFileFromPath, updateWindowTitle,
} from './services/fileService';
import { applyFormat } from './composables/useFormatting';
import { setupAppMenu } from './composables/useAppMenu';
import { useMarkdownPreview } from './composables/useMarkdownPreview';
import { promptUnsavedChanges } from './composables/useUnsavedPrompt';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const settingsStore = useSettingsStore();
const editorStore = useEditorStore();
const { getEditorElement } = useMarkdownPreview();
const toolbarVisible = ref(true);

// ── File handlers ─────────────────────────────────────────────────────────────

const handleNewFile = () => newFile(editorStore);
const handleOpenFile = () => openFile(editorStore);
const handleSaveFile = () => saveFile(editorStore);
const handleSaveAs = () => saveFileAs(editorStore);
const handleFormat = (format) => applyFormat(format, getEditorElement());

// ── Window title for titlebar ─────────────────────────────────────────────────

const windowTitle = computed(() => {
  const name = editorStore.filePath
    ? editorStore.filePath.split('/').pop().split('\\').pop()
    : 'Untitled';
  return editorStore.isDirty ? `● ${name}` : name;
});

// ── Window title (§4.5) ───────────────────────────────────────────────────────

watch(
  [() => editorStore.filePath, () => editorStore.isDirty],
  () => updateWindowTitle(editorStore),
  { immediate: true }
);

// ── Window close confirmation (§4.4) + Tauri drag-drop (§4.1) ─────────────────

let unlistenClose = null;
let unlistenDrop = null;
let unlistenFileOpen = null;

// Drains the Rust-side pending-file slot. Used both at mount (to pick up a
// path that arrived before we could listen) and on every `open-file-pending`
// wake-up (Finder "Open With" while running, second-launch via single-instance).
async function consumePendingFile() {
  try {
    const path = await invoke('take_pending_file');
    if (path) await loadFileFromPath(editorStore, path);
  } catch (e) {
    console.warn('Failed to consume pending file:', e);
  }
}

onMounted(async () => {
  try {
    await setupAppMenu(editorStore);
  } catch (e) {
    console.warn('Native menu setup failed:', e);
  }

  try {
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      if (!editorStore.isDirty) return;
      event.preventDefault();

      const choice = await promptUnsavedChanges();
      if (choice === 'cancel') return;
      if (choice === 'save') {
        const saved = await saveFile(editorStore);
        if (!saved) return;
      }
      await win.destroy();
    });
  } catch (e) {
    console.warn('onCloseRequested not available:', e);
  }

  try {
    const webview = getCurrentWebview();
    unlistenDrop = await webview.onDragDropEvent(async (event) => {
      if (event.payload.type !== 'drop') return;
      const paths = event.payload.paths ?? [];
      const target = paths.find((p) => /\.(md|markdown|txt)$/i.test(p));
      if (!target) return;
      await loadFileFromPath(editorStore, target);
    });
  } catch (e) {
    console.warn('onDragDropEvent not available:', e);
  }

  // Subscribe BEFORE draining: if a second `open-file-pending` fires between
  // the listener attach and the initial drain, we still catch it.
  try {
    unlistenFileOpen = await listen('open-file-pending', () => {
      void consumePendingFile();
    });
    await consumePendingFile();
  } catch (e) {
    console.warn('File-association handler setup failed:', e);
  }
});

onUnmounted(() => {
  unlistenClose?.();
  unlistenDrop?.();
  unlistenFileOpen?.();
});
</script>

<style>
/* Toast container (§4.2) */
#toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}

.toast {
  background: var(--text-color, #1a1d23);
  color: var(--bg-color, #fafafa);
  padding: 0.55rem 1rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.22s ease, transform 0.22s ease;
  letter-spacing: 0.01em;
}

.toast--visible {
  opacity: 1;
  transform: translateY(0);
}

/* Layout wrapper */
.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-color);
}

</style>
