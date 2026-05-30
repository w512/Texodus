<template>
  <ThemeProvider>
    <KeyboardShortcuts />
    <div class="app-wrapper">
      <TitleBar
        :layoutMode="settingsStore.layoutMode"
        :themeMode="settingsStore.themeMode"
        :title="windowTitle"
        @toggle-layout="settingsStore.setLayoutMode($event)"
        @cycle-theme="settingsStore.cycleTheme()"
        @format="handleFormat"
      />
      <TabBar />
      <EditorLayout :layoutMode="settingsStore.layoutMode">
        <template #editor><TextEditor /></template>
        <template #preview><MarkdownPreview /></template>
      </EditorLayout>
    </div>
    <UnsavedChangesDialog />
    <AboutDialog />
    <SettingsDialog />
  </ThemeProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useSettingsStore } from './stores/settings';
import { useEditorStore } from './stores/editor';
import TitleBar from './components/TitleBar.vue';
import TabBar from './components/TabBar.vue';
import EditorLayout from './components/EditorLayout.vue';
import TextEditor from './components/TextEditor.vue';
import MarkdownPreview from './components/MarkdownPreview.vue';
import ThemeProvider from './components/ThemeProvider.vue';
import KeyboardShortcuts from './components/KeyboardShortcuts.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import AboutDialog from './components/AboutDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import {
  saveFile,
  updateWindowTitle,
  showToast,
  requestOpenFromPath,
} from './services/fileService';
import { basename } from './utils/path';
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
const { getEditorView } = useMarkdownPreview();

const handleFormat = (format: string) => applyFormat(format, getEditorView());

// ── Rebuild native menu on inputs that affect its structure ──────────────────
// Recent-files list, current tab count (Close vs Close Tab label), and the
// documentMode toggle all change which items appear in the File menu.

watch(
  [
    () => settingsStore.recentFiles,
    () => settingsStore.documentMode,
    () => editorStore.tabCount,
  ],
  async () => {
    try { await setupAppMenu(editorStore); } catch { /* non-critical */ }
  },
  { deep: true }
);

// ── Window title for titlebar ─────────────────────────────────────────────────

const windowTitle = computed(() => {
  const name = editorStore.filePath ? basename(editorStore.filePath) : 'Untitled';
  return editorStore.isDirty ? `● ${name}` : name;
});

// ── Window title (§4.5) ───────────────────────────────────────────────────────

watch(
  [() => editorStore.filePath, () => editorStore.isDirty],
  () => {
    void updateWindowTitle(editorStore);
    // Report window status to Rust
    void invoke('report_window_status', {
      path: editorStore.filePath,
      isDirty: editorStore.isDirty
    }).catch((e) => {
      console.warn('Failed to report window status:', e);
    });
  },
  { immediate: true }
);

// ── Window close confirmation (§4.4) + Tauri drag-drop (§4.1) ─────────────────

type Unlisten = (() => void) | null;
let unlistenClose: Unlisten = null;
let unlistenDrop: Unlisten = null;
let unlistenFileOpen: Unlisten = null;
let unlistenFocus: Unlisten = null;

// Drains the Rust-side pending-file slot. Used both at mount (to pick up a
// path that arrived before we could listen) and on every `open-file-pending`
// wake-up (Finder "Open With" while running, second-launch via single-instance).
async function consumePendingFile() {
  try {
    const path = await invoke<string | null>('take_pending_file');
    if (path) await requestOpenFromPath(editorStore, path);
  } catch (e) {
    console.warn('Failed to consume pending file:', e);
    showToast('Failed to open file');
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
      if (!editorStore.anyTabDirty) return;
      event.preventDefault();

      // Walk all dirty tabs sequentially. Switching the active tab first lets
      // saveFile / the prompt operate on the right document.
      const dirtyIds = editorStore.tabs.filter((t) => t.isDirty).map((t) => t.id);
      for (const id of dirtyIds) {
        editorStore.setActiveTab(id);
        const choice = await promptUnsavedChanges();
        if (choice === 'cancel') return;
        if (choice === 'save') {
          const saved = await saveFile(editorStore);
          if (!saved) return;
        }
      }
      await win.destroy();
    });
  } catch (e) {
    console.warn('onCloseRequested not available:', e);
  }

  try {
    const win = getCurrentWindow();
    unlistenFocus = await win.onFocusChanged(async ({ payload: focused }) => {
      if (focused) {
        try {
          await setupAppMenu(editorStore);
        } catch (e) {
          console.warn('Native menu setup on focus failed:', e);
        }
      }
    });
  } catch (e) {
    console.warn('onFocusChanged not available:', e);
  }

  try {
    const webview = getCurrentWebview();
    unlistenDrop = await webview.onDragDropEvent(async (event) => {
      if (event.payload.type !== 'drop') return;
      const paths = event.payload.paths ?? [];
      const target = paths.find((p) => /\.(md|markdown|txt)$/i.test(p));
      if (!target) return;
      await requestOpenFromPath(editorStore, target);
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
  unlistenFocus?.();
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
