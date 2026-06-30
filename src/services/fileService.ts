import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
import { refreshWorkspaceTreeIfPathInside } from './workspaceService';
import { allowAssetDirectoryForFile } from './assetScopeService';
import { basename } from '../utils/path';
import { showToast } from '../utils/toast';
import { markFileWritten } from '../utils/writeSuppression';
import { flushPendingSave } from '../composables/useAutoSave';

export { showToast };

const FILE_FILTERS =[{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }];

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

export async function openFile(store: EditorStore): Promise<void> {
  try {
    if (!(await confirmCanProceed(store))) return;

    const selected = await open({ multiple: false, filters: FILE_FILTERS });
    if (!selected) return;

    const path = selected as string;
    const content = await readTextFile(path);
    await allowAssetDirectoryForFile(path);
    store.loadFile(content, path);
    useSettingsStore().addRecentFile(path);
    await updateWindowTitle(store);
  } catch (e) {
    await showError('Failed to open file', e);
  }
}

export async function loadFileFromPath(store: EditorStore, path: string): Promise<void> {
  try {
    if (!(await confirmCanProceed(store))) return;
    const content = await readTextFile(path);
    await allowAssetDirectoryForFile(path);
    store.loadFile(content, path);
    useSettingsStore().addRecentFile(path);
    await updateWindowTitle(store);
  } catch (e) {
    await showError('Failed to open file', e);
  }
}

export async function saveFile(store: EditorStore): Promise<boolean> {
  try {
    if (!store.filePath) return await saveFileAs(store);

    await writeTextFile(store.filePath, store.content);
    markFileWritten(store.filePath);
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
    const selected = await save({
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      defaultPath: store.filePath || 'untitled.md',
    });
    if (!selected) return false;

    const path = selected as string;
    await writeTextFile(path, store.content);
    await allowAssetDirectoryForFile(path);
    markFileWritten(path);
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
  const settings = useSettingsStore();
  if (settings.documentMode === 'tabs') {
    const selected = await open({ multiple: false, filters: FILE_FILTERS });
    if (!selected) return;
    await requestOpenFromPath(store, selected as string);
  } else {
    if (store.filePath || store.isDirty) {
      const selected = await open({ multiple: false, filters: FILE_FILTERS });
      if (!selected) return;
      try {
        await invoke('open_new_window', { path: selected as string });
      } catch (e) {
        await showError('Failed to open new window', e);
      }
    } else {
      await openFile(store);
    }
  }
}

export async function requestOpenFromPath(store: EditorStore, path: string): Promise<void> {
  const settings = useSettingsStore();

  // Flush any pending auto-save before switching documents.
  if (settings.autoSave) await flushPendingSave();

  if (settings.documentMode === 'tabs') {
    try {
      const content = await readTextFile(path);
      await allowAssetDirectoryForFile(path);
      if (isActiveTabEmpty(store)) {
        store.loadFile(content, path);
      } else {
        store.addTab({ content, filePath: path, isDirty: false });
      }
      useSettingsStore().addRecentFile(path);
      await updateWindowTitle(store);
    } catch (e) {
      await showError('Failed to open file', e);
    }
  } else {
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
