<template>
  <ThemeProvider>
    <KeyboardShortcuts />
    <div class="app-wrapper">
      <TitleBar
        :layoutMode="settingsStore.layoutMode"
        :themeMode="settingsStore.themeMode"
        :sidebarVisible="settingsStore.sidebarVisible"
        :title="windowTitle"
        @toggle-layout="settingsStore.setLayoutMode($event)"
        @toggle-sidebar="settingsStore.toggleSidebar()"
        @cycle-theme="settingsStore.cycleTheme()"
        @format="handleFormat"
      />
      <TabBar />
      <SearchBar />
      <div class="app-main">
        <Transition name="sidebar-slide">
          <div
            v-if="settingsStore.sidebarVisible"
            class="sidebar-shell"
            :style="{ width: `${settingsStore.sidebarWidth}px` }"
          >
            <Sidebar />
            <div
              class="sidebar-resizer"
              title="Resize sidebar"
              @pointerdown="startSidebarResize"
            ></div>
          </div>
        </Transition>
        <EditorLayout :layoutMode="settingsStore.layoutMode">
          <template #editor><TextEditor /></template>
          <template #preview><MarkdownPreview /></template>
        </EditorLayout>
      </div>
    </div>
    <UnsavedChangesDialog />
    <AboutDialog />
    <SettingsDialog />
    <QuickOpenPalette />
  </ThemeProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useSettingsStore } from './stores/settings';
import { useEditorStore } from './stores/editor';
import TitleBar from './components/TitleBar.vue';
import TabBar from './components/TabBar.vue';
import SearchBar from './components/SearchBar.vue';
import Sidebar from './components/Sidebar.vue';
import EditorLayout from './components/EditorLayout.vue';
import TextEditor from './components/TextEditor.vue';
import MarkdownPreview from './components/MarkdownPreview.vue';
import ThemeProvider from './components/ThemeProvider.vue';
import KeyboardShortcuts from './components/KeyboardShortcuts.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import AboutDialog from './components/AboutDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import QuickOpenPalette from './components/QuickOpenPalette.vue';
import {
  saveFile,
  updateWindowTitle,
  showToast,
  requestOpenFromPath,
} from './services/fileService';
import { basename, resolveLocalPath } from './utils/path';
import { applyFormat } from './composables/useFormatting';
import { setupAppMenu } from './composables/useAppMenu';
import { useMarkdownPreview } from './composables/useMarkdownPreview';
import { promptUnsavedChanges } from './composables/useUnsavedPrompt';
import { useFileWatch } from './composables/useFileWatch';
import { useAutoSave, flushPendingSave } from './composables/useAutoSave';
import { restoreSession, useSessionRestore } from './composables/useSessionRestore';
import { refreshWorkspaceTree } from './services/workspaceService';
import { useWorkspaceStore } from './stores/workspace';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { copyFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const settingsStore = useSettingsStore();
const editorStore = useEditorStore();
const workspaceStore = useWorkspaceStore();
const { getEditorView } = useMarkdownPreview();
useFileWatch(editorStore);
useAutoSave(editorStore);
useSessionRestore(editorStore);

const handleFormat = (format: string) => applyFormat(format, getEditorView());

// ── Resizable sidebar ─────────────────────────────────────────────────────────

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
let sidebarResizeStartX = 0;
let sidebarResizeStartWidth = 0;
let sidebarResizePointerId: number | null = null;

function startSidebarResize(event: PointerEvent) {
  sidebarResizeStartX = event.clientX;
  sidebarResizeStartWidth = settingsStore.sidebarWidth;
  sidebarResizePointerId = event.pointerId;
  document.body.classList.add('is-resizing-sidebar');
  window.addEventListener('pointermove', handleSidebarResize);
  window.addEventListener('pointerup', stopSidebarResize, { once: true });
  window.addEventListener('pointercancel', stopSidebarResize, { once: true });
}

function handleSidebarResize(event: PointerEvent) {
  if (sidebarResizePointerId !== null && event.pointerId !== sidebarResizePointerId) return;
  const nextWidth = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, sidebarResizeStartWidth + event.clientX - sidebarResizeStartX),
  );
  settingsStore.setSidebarWidth(nextWidth);
}

function stopSidebarResize() {
  sidebarResizePointerId = null;
  document.body.classList.remove('is-resizing-sidebar');
  window.removeEventListener('pointermove', handleSidebarResize);
} 

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
  [() => editorStore.filePath, () => editorStore.isDirty, () => settingsStore.documentMode],
  () => {
    void updateWindowTitle(editorStore);
    // Report window status to Rust. documentMode is included so the backend
    // can route OS "Open With" files into a tab (tabs mode) vs a new window.
    void invoke('report_window_status', {
      path: editorStore.filePath,
      isDirty: editorStore.isDirty,
      documentMode: settingsStore.documentMode
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

// Drains the Rust-side pending-file queue. Used both at mount (to pick up
// paths that arrived before we could listen) and on every `open-file-pending`
// wake-up (Finder "Open With" while running, second-launch via single-instance).
// The queue can hold several paths (multi-select "Open With" in tabs mode);
// open them sequentially so each lands in its own tab/window.
async function consumePendingFiles() {
  try {
    const paths = await invoke<string[]>('take_pending_files');
    for (const path of paths) {
      await requestOpenFromPath(editorStore, path);
    }
  } catch (e) {
    console.warn('Failed to consume pending files:', e);
    showToast('Failed to open file');
  }
}

onMounted(async () => {
  try {
    await setupAppMenu(editorStore);
  } catch (e) {
    console.warn('Native menu setup failed:', e);
  }

  // Restore tabs from previous session before draining pending files.
  try {
    await restoreSession(editorStore);
  } catch (e) {
    console.warn('Session restore failed:', e);
  }

  try {
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      // Flush any pending auto-save before checking dirty state.
      if (settingsStore.autoSave) await flushPendingSave();

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

      // Check if the drop landed on the sidebar — if so, copy files into
      // the workspace root instead of opening them.
      const cssX = event.payload.position.x / window.devicePixelRatio;
      const sidebarEl = document.querySelector('.sidebar-shell');
      const onSidebar = settingsStore.sidebarVisible
        && sidebarEl
        && cssX <= sidebarEl.getBoundingClientRect().right;

      if (onSidebar && workspaceStore.rootPath) {
        const supported = paths.filter((p) => /\.(md|markdown|txt)$/i.test(p));
        for (const p of supported) {
          const dest = resolveLocalPath(workspaceStore.rootPath, basename(p));
          try {
            await copyFile(p, dest);
          } catch {
            // File may already exist at destination — skip silently.
          }
        }
        if (supported.length > 0) {
          showToast(`Copied ${supported.length} file${supported.length > 1 ? 's' : ''} to workspace`);
          await refreshWorkspaceTree(workspaceStore.rootPath);
        }
        return;
      }

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
      void consumePendingFiles();
    });
    await consumePendingFiles();
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

.app-main {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.sidebar-shell {
  position: relative;
  flex: 0 0 auto;
  min-width: 220px;
  max-width: 420px;
  height: 100%;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}

.sidebar-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  right: 2px;
  width: 1px;
  height: 100%;
  background: transparent;
  transition: background 0.15s ease;
}

.sidebar-resizer:hover::after,
body.is-resizing-sidebar .sidebar-resizer::after {
  background: var(--accent-color);
}

body.is-resizing-sidebar {
  cursor: col-resize;
  user-select: none;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: width 0.18s ease, min-width 0.18s ease, opacity 0.18s ease;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  width: 0;
  min-width: 0;
  opacity: 0;
}

/* Search match highlights in the rendered preview (CSS Custom Highlight API). */
::highlight(texodus-search) {
  background-color: var(--search-highlight-soft);
}
::highlight(texodus-search-current) {
  background-color: var(--search-highlight);
  color: var(--search-highlight-fg);
}

</style>
