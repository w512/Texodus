import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEditorStore } from '../stores/editor';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';

const APP_NAME = 'Texodus';
const FILE_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }];

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
    store.loadFile(content, path);
    await updateWindowTitle(store);
  } catch (e) {
    await showError('Failed to open file', e);
  }
}

export async function loadFileFromPath(store: EditorStore, path: string): Promise<void> {
  try {
    if (!(await confirmCanProceed(store))) return;
    const content = await readTextFile(path);
    store.loadFile(content, path);
    await updateWindowTitle(store);
  } catch (e) {
    await showError('Failed to open file', e);
  }
}

export async function saveFile(store: EditorStore): Promise<boolean> {
  try {
    if (!store.filePath) return await saveFileAs(store);

    await writeTextFile(store.filePath, store.content);
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
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: store.filePath || 'untitled.md',
    });
    if (!selected) return false;

    const path = selected as string;
    await writeTextFile(path, store.content);
    store.setFilePath(path);
    store.setDirty(false);
    await updateWindowTitle(store);
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

export async function updateWindowTitle(store: EditorStore): Promise<void> {
  try {
    const win = getCurrentWindow();
    const fileName = store.filePath ? store.filePath.split(/[\\/]/).pop() : 'Untitled';
    const dirtyMark = store.isDirty ? '* ' : '';
    await win.setTitle(`${dirtyMark}${fileName}`);
  } catch {
    // Non-critical
  }
}

// ── Toast notification ────────────────────────────────────────────────────────

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(text: string, duration = 2500): void {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

async function showError(title: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await message(`${title}: ${detail}`, { title: 'Error', kind: 'error' });
}
