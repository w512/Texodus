/**
 * Session restore for tabs — persists open tab file paths to localStorage
 * and restores them on app startup so the user doesn't lose their workspace.
 *
 * Only tabs with a `filePath` are persisted; untitled/unsaved tabs cannot be
 * restored (their content lives only in memory). File content is reloaded
 * from disk on restore.
 */
import { watch } from 'vue';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';

type EditorStore = ReturnType<typeof useEditorStore>;

const SESSION_KEY = 'texodus.session.tabs.v1';

interface SavedTab {
  filePath: string;
}

interface SavedSession {
  tabs: SavedTab[];
  activeFilePath: string | null;
}

function canUseTabSession(): boolean {
  try {
    return getCurrentWindow().label === 'main' && useSettingsStore().documentMode === 'tabs';
  } catch {
    return false;
  }
}

export function saveSession(store: EditorStore): void {
  if (!canUseTabSession()) return;
  const tabs: SavedTab[] = store.tabs
    .filter((t) => t.filePath)
    .map((t) => ({ filePath: t.filePath! }));

  const active = store.activeTab;
  const activeFilePath = active.filePath ?? null;

  const session: SavedSession = { tabs, activeFilePath };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage quota or disabled — non-critical.
  }
}

export async function restoreSession(store: EditorStore): Promise<void> {
  if (!canUseTabSession()) return;

  let session: SavedSession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    session = JSON.parse(raw);
  } catch {
    return;
  }

  if (!session.tabs || session.tabs.length === 0) return;

  // Load each saved file into a tab.
  for (let i = 0; i < session.tabs.length; i++) {
    const filePath = session.tabs[i].filePath;
    try {
      const content = await readTextFile(filePath);
      if (i === 0) {
        // Replace the initial blank tab.
        store.loadFile(content, filePath);
      } else {
        store.addTab({ content, filePath, isDirty: false });
      }
    } catch {
      // File may have been moved/deleted since last session — skip it.
    }
  }

  // Activate the previously active tab, if it was restored.
  if (session.activeFilePath) {
    const target = store.tabs.find((t) => t.filePath === session.activeFilePath);
    if (target) store.setActiveTab(target.id);
  }
}

/**
 * Installs a watcher that persists the session whenever tabs change.
 * Call in onMounted.
 */
export function useSessionRestore(store: EditorStore): void {
  watch(
    () => [
      store.tabs.map((t) => ({ filePath: t.filePath, isDirty: t.isDirty })),
      store.activeTabId,
    ],
    () => saveSession(store),
    { deep: true },
  );
}