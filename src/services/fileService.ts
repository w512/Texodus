import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
import { refreshWorkspaceTreeIfPathInside } from './workspaceService';
import { basename, normalizePath } from '../utils/path';
import { showToast } from '../utils/toast';
import { markFileWritten } from '../utils/writeSuppression';
import { flushPendingSave } from '../composables/useAutoSave';
import { isMissingFileError } from './recentFilesService';

export { showToast };

// Open/Save dialogs go through the Rust `pick_document` / `pick_save_path`
// commands, not the JS dialog plugin: the Rust side grants fs/asset scope for
// the picked file's *directory* (relative images, sibling links, dir watch),
// which the JS plugin's automatic file-level grant doesn't cover.

type EditorStore = ReturnType<typeof useEditorStore>;

/**
 * Resolves the 3-way unsaved-changes prompt.
 * Returns true when the caller may proceed, false when the user cancelled.
 */
async function confirmCanProceed(store: EditorStore): Promise<boolean> {
  if (!store.isDirty) return true;

  const choice = await promptUnsavedChanges();
  if (choice === 'cancel') return false;
  if (choice === 'save') return await saveFile(store);
  return true; // discard
}

/** True when the fs plugin rejected the path as outside the granted scope
 *  (see the FS scope model in CLAUDE.md) rather than a real I/O failure.
 *  Release builds say "forbidden path: …"; debug builds append a
 *  "…not allowed on the scope…" hint — match both. */
function isScopeDenied(err: unknown): boolean {
  const text = String(err instanceof Error ? err.message : err);
  return text.includes('forbidden path') || text.includes('not allowed');
}

/**
 * Recovery for scope-denied opens (recent files or preview links that predate
 * the current grants): scope is only issued through real dialog interactions,
 * so offer the native dialog pre-navigated to the file — one pick re-grants
 * access and the file opens normally.
 */
async function recoverScopeDeniedOpen(store: EditorStore, path: string): Promise<void> {
  const ok = await confirm(
    `Texodus doesn't have access to:\n${path}\n\nAccess is granted through the system file dialog. Choose the file there to open it.`,
    { title: 'No access to file', kind: 'warning', okLabel: 'Choose File…', cancelLabel: 'Cancel' },
  );
  if (!ok) return;
  const picked = await invoke<string | null>('pick_document', { startIn: path });
  if (!picked) return;
  await requestOpenFromPath(store, picked);
}

async function showOpenError(store: EditorStore, path: string, err: unknown): Promise<void> {
  if (isScopeDenied(err)) {
    await recoverScopeDeniedOpen(store, path);
    return;
  }
  if (isMissingFileError(err)) {
    useSettingsStore().removeRecentFiles(new Set([path]));
  }
  await showError('Failed to open file', err);
}

/**
 * Asks Rust to focus the window that already has `path` open (per the
 * statuses collected via `report_window_status`). True when one was found —
 * the caller should then skip opening a second buffer of the same file,
 * which would silently diverge from the first one on edit.
 */
async function focusWindowWithPath(path: string): Promise<boolean> {
  try {
    return (await invoke<boolean>('focus_window_with_path', { path })) === true;
  } catch {
    return false;
  }
}

export async function loadFileFromPath(store: EditorStore, path: string): Promise<void> {
  try {
    if (!(await confirmCanProceed(store))) return;
    const content = await readTextFile(path);
    store.loadFile(content, path);
    useSettingsStore().addRecentFile(path);
    await updateWindowTitle(store);
  } catch (e) {
    await showOpenError(store, path, e);
  }
}

export async function saveFile(store: EditorStore): Promise<boolean> {
  try {
    if (!store.filePath) return await saveFileAs(store);

    await writeTextFile(store.filePath, store.content);
    markFileWritten(store.filePath, store.content);
    store.setDirty(false);
    await updateWindowTitle(store);
    showToast('File saved');
    return true;
  } catch (e) {
    await showError('Failed to save file', e);
    return false;
  }
}

export async function saveFileAs(store: EditorStore): Promise<boolean> {
  try {
    const path = await invoke<string | null>('pick_save_path', {
      defaultPath: store.filePath || 'untitled.md',
    });
    if (!path) return false;

    await writeTextFile(path, store.content);
    markFileWritten(path, store.content);
    store.setFilePath(path);
    store.setDirty(false);
    useSettingsStore().addRecentFile(path);
    await updateWindowTitle(store);
    await refreshWorkspaceTreeIfPathInside(path);
    showToast('File saved');
    return true;
  } catch (e) {
    await showError('Failed to save file', e);
    return false;
  }
}

export async function newFile(store: EditorStore): Promise<void> {
  if (!(await confirmCanProceed(store))) return;
  store.reset();
  await updateWindowTitle(store);
}

export async function closeFile(store: EditorStore): Promise<void> {
  if (!(await confirmCanProceed(store))) return;
  store.reset();
  await updateWindowTitle(store);
}

// ── Mode-aware document ops ───────────────────────────────────────────────────
// These wrap the low-level ops above with a branch on settings.documentMode.
// Callers (native menu, drag-drop, TabBar) should prefer these so the same
// action (Open, New, Close) does the right thing in either mode.

function isActiveTabEmpty(store: EditorStore): boolean {
  return !store.filePath && !store.isDirty && store.content === '';
}

export async function requestNewDocument(store: EditorStore): Promise<void> {
  const settings = useSettingsStore();
  if (settings.documentMode === 'tabs') {
    store.addTab();
    await updateWindowTitle(store);
  } else {
    try {
      await invoke('open_new_window');
    } catch (e) {
      await showError('Failed to open new window', e);
    }
  }
}

export async function requestOpenDocument(store: EditorStore): Promise<void> {
  const path = await invoke<string | null>('pick_document');
  if (!path) return;
  await requestOpenFromPath(store, path);
}

export async function requestOpenFromPath(store: EditorStore, path: string): Promise<void> {
  const settings = useSettingsStore();

  // Flush any pending auto-save before switching documents.
  if (settings.autoSave) await flushPendingSave();

  if (settings.documentMode === 'tabs') {
    // Already open in a tab? Focus it instead of creating a duplicate buffer
    // that would silently diverge from the first one on edit.
    const normalized = normalizePath(path);
    const existing = store.tabs.find(
      (t) => t.filePath && normalizePath(t.filePath) === normalized,
    );
    if (existing) {
      store.setActiveTab(existing.id);
      await updateWindowTitle(store);
      return;
    }
    // The active tab of another window? Focus that window instead.
    if (await focusWindowWithPath(path)) return;
    try {
      const content = await readTextFile(path);
      if (isActiveTabEmpty(store)) {
        store.loadFile(content, path);
      } else {
        store.addTab({ content, filePath: path, isDirty: false });
      }
      useSettingsStore().addRecentFile(path);
      await updateWindowTitle(store);
    } catch (e) {
      await showOpenError(store, path, e);
    }
  } else {
    // Some window (possibly this one) already shows the file? Focus it.
    if (await focusWindowWithPath(path)) return;
    if (store.filePath || store.isDirty) {
      try {
        await invoke('open_new_window', { path });
      } catch (e) {
        await showError('Failed to open new window', e);
      }
    } else {
      await loadFileFromPath(store, path);
    }
  }
}

/**
 * Sidebar/tree navigation: opens `path` in the *current* window instead of
 * spawning a window per click the way `requestOpenFromPath` does in windows
 * mode. A dirty document goes through the 3-button unsaved prompt (inside
 * `loadFileFromPath`); a file already open in another window focuses that
 * window instead of loading a duplicate buffer. Tabs mode keeps the regular
 * open-as-tab behaviour.
 */
export async function requestNavigateToPath(store: EditorStore, path: string): Promise<void> {
  const settings = useSettingsStore();
  if (settings.documentMode === 'tabs') {
    await requestOpenFromPath(store, path);
    return;
  }

  // Flush any pending auto-save before switching documents.
  if (settings.autoSave) await flushPendingSave();

  if (store.filePath && normalizePath(store.filePath) === normalizePath(path)) return;
  if (await focusWindowWithPath(path)) return;
  await loadFileFromPath(store, path);
}

/**
 * Explicit "open in a new window" (sidebar Cmd/Ctrl+click or context menu).
 * Ignores documentMode — the user asked for a window — but still focuses an
 * existing window when the file is already open somewhere.
 */
export async function requestOpenInNewWindow(path: string): Promise<void> {
  if (await focusWindowWithPath(path)) return;
  try {
    await invoke('open_new_window', { path });
  } catch (e) {
    await showError('Failed to open new window', e);
  }
}

/**
 * Close action wired to Cmd/Ctrl+W. In tabs mode this closes the active tab
 * (with an unsaved-changes prompt when dirty); in windows mode it resets the
 * current document in place — the OS close button / Cmd+Q still own actually
 * destroying the window.
 */
export async function requestCloseDocument(store: EditorStore): Promise<void> {
  const settings = useSettingsStore();

  // Flush any pending auto-save before closing.
  if (settings.autoSave) await flushPendingSave();

  if (settings.documentMode === 'tabs' && store.tabCount > 1) {
    if (!(await confirmCanProceed(store))) return;
    store.closeTab(store.activeTabId);
    await updateWindowTitle(store);
  } else {
    await closeFile(store);
  }
}

export async function updateWindowTitle(store: EditorStore): Promise<void> {
  try {
    const win = getCurrentWindow();
    const fileName = store.filePath ? basename(store.filePath) : 'Untitled';
    const dirtyMark = store.isDirty ? '* ' : '';
    await win.setTitle(`${dirtyMark}${fileName}`);
  } catch {
    // Non-critical
  }
}

export async function showError(title: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await message(`${title}: ${detail}`, { title: 'Error', kind: 'error' });
}
