import { onUnmounted, watch as vueWatch } from 'vue';
import { watch as watchFs, type UnwatchFn, type WatchEvent } from '@tauri-apps/plugin-fs';
import { useWorkspaceStore } from '../stores/workspace';
import { refreshWorkspaceTree } from '../services/workspaceService';
import { useSettingsStore } from '../stores/settings';
import { refreshDocumentTitles } from '../services/documentTitleService';

/**
 * Watches the open workspace root recursively and auto-refreshes the sidebar
 * tree when files/folders are created, deleted or renamed by external tools.
 * Runs independently of sidebar visibility (mounted from App.vue) so the tree
 * is up to date the moment the sidebar is shown.
 *
 * Content writes are intentionally ignored: they don't change the tree shape,
 * and reacting to them would refresh on every (auto)save. In-app file ops
 * refresh the tree themselves, so those double-fires are harmless (debounced).
 */
export function useWorkspaceWatch(): void {
  const workspaceStore = useWorkspaceStore();
  const settingsStore = useSettingsStore();
  let unwatch: UnwatchFn | null = null;
  let watchedRoot: string | null = null;
  let debounceTimer: number | null = null;

  function scheduleRefresh() {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      // `background`: this refresh is not user-initiated, so it must not put
      // the sidebar into its loading state (that hides the whole tree).
      void refreshWorkspaceTree(undefined, { background: true });
    }, 400);
  }

  function stop() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const fn = unwatch;
    unwatch = null;
    watchedRoot = null;
    if (fn) fn();
  }

  const stopRootWatcher = vueWatch(
    () => workspaceStore.rootPath,
    async (rootPath) => {
      if (rootPath === watchedRoot) return;
      stop();
      if (!rootPath) return;

      watchedRoot = rootPath;
      try {
        unwatch = await watchFs(
          rootPath,
          (event) => {
            if (changesTree(event)) scheduleRefresh();
            else if (settingsStore.documentTitleMode === 'title') {
              void refreshDocumentTitles(event.paths);
            }
          },
          { recursive: true, delayMs: 300 },
        );
      } catch (e) {
        console.warn('Failed to watch workspace root:', rootPath, e);
        watchedRoot = null;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopRootWatcher();
    stop();
  });
}

/** True for events that can alter the tree shape (create/remove/rename), false
 *  for pure read-access and content/metadata modifications. Exported for tests. */
export function changesTree(event: WatchEvent): boolean {
  const type = event.type;
  if (typeof type === 'string') return true; // 'any' | 'other' — refresh defensively
  if ('access' in type) return false;
  if ('modify' in type) {
    const kind = type.modify.kind;
    return kind !== 'data' && kind !== 'metadata';
  }
  return true; // create | remove
}
