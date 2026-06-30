/**
 * Auto-save composable with debounce + flush.
 *
 * When autoSave is enabled in settings, editor content changes are debounced
 * (1.5s) and then written to disk silently — no toast, no title flash.
 *
 * `flushPendingSave()` can be called before destructive actions (tab switch,
 * close, open) to immediately persist any pending changes.
 *
 * Write suppression is handled by the separate `writeSuppression` module so
 * that both auto-save and manual saves share the same suppression registry
 * without coupling the file watcher to this composable.
 */

import { watch, onUnmounted, type WatchStopHandle } from 'vue';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { showToast } from '../utils/toast';
import { markFileWritten } from '../utils/writeSuppression';

type EditorStore = ReturnType<typeof useEditorStore>;

const AUTOSAVE_DEBOUNCE_MS = 1500;

// ── Module-level state (singleton) ─────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPath: string | null = null;
let pendingContent: string | null = null;
let isFlushing = false;

/** Check if there is a pending auto-save for the current tab. */
export function hasPendingSave(): boolean {
  return debounceTimer !== null;
}

/**
 * Immediately save any pending debounced content. Returns true if a save
 * was actually performed.
 */
export async function flushPendingSave(): Promise<boolean> {
  if (isFlushing) return false;
  if (!debounceTimer) return false;

  clearTimeout(debounceTimer);
  debounceTimer = null;

  const path = pendingPath;
  const content = pendingContent;
  pendingPath = null;
  pendingContent = null;

  if (!path || content === null) return false;

  return await doSave(path, content);
}

async function doSave(path: string, content: string): Promise<boolean> {
  isFlushing = true;
  try {
    await writeTextFile(path, content);
    const store = useEditorStore();
    const tab = store.tabs.find((t) => t.filePath === path);
    if (tab) store.setTabDirty(tab.id, false);
    markFileWritten(path);
    return true;
  } catch (e) {
    console.warn('Auto-save failed:', path, e);
    showToast('Auto-save failed');
    return false;
  } finally {
    isFlushing = false;
  }
}

function scheduleSave(path: string, content: string): void {
  pendingPath = path;
  pendingContent = content;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const p = pendingPath;
    const c = pendingContent;
    pendingPath = null;
    pendingContent = null;
    if (p && c !== null) void doSave(p, c);
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Installs auto-save behaviour. Call once in App.vue setup.
 *
 * Watches:
 * - Content changes → schedules a debounced save (if autoSave enabled + file has path)
 * - AutoSave setting toggle → flushes pending on disable
 */
export function useAutoSave(store: EditorStore): void {
  let stopContentWatch: WatchStopHandle | null = null;

  function startContentWatcher() {
    if (stopContentWatch) return;
    stopContentWatch = watch(
      () => store.content,
      (newContent) => {
        const settings = useSettingsStore();
        if (!settings.autoSave) return;
        const path = store.filePath;
        if (!path) return; // Untitled — can't auto-save without a path.
        scheduleSave(path, newContent);
      },
    );
  }

  function stopContentWatcher() {
    if (stopContentWatch) {
      stopContentWatch();
      stopContentWatch = null;
    }
  }

  // React to autoSave being toggled on/off.
  watch(
    () => useSettingsStore().autoSave,
    (enabled) => {
      if (enabled) {
        startContentWatcher();
      } else {
        // Flushing pending before stopping so no content is lost.
        void flushPendingSave().finally(() => stopContentWatcher());
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    void flushPendingSave();
    stopContentWatcher();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });
}