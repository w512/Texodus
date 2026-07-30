import { onUnmounted, watch as vueWatch } from 'vue';
import { readTextFile, stat, watch as watchFs, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { useEditorStore, type Tab } from '../stores/editor';
import { basename, dirname, isSamePath, normalizePath } from '../utils/path';
import { promptUnsavedChanges, whenPromptsIdle } from './useUnsavedPrompt';
import { saveFile, showToast, updateWindowTitle } from '../services/fileService';
import { wasWrittenWithContent } from '../utils/writeSuppression';
import { cleanupTauriEventListeners } from '../utils/tauriEventCleanup';

type EditorStore = ReturnType<typeof useEditorStore>;

function uniqueOpenPaths(tabs: Tab[]): string[] {
  // Keyed on the normalised path so one file opened under two spellings
  // (`\` vs `/` after a folder rename on Windows) is watched once, not twice.
  const byNormalized = new Map<string, string>();
  for (const tab of tabs) {
    if (!tab.filePath) continue;
    const key = normalizePath(tab.filePath);
    if (!byNormalized.has(key)) byNormalized.set(key, tab.filePath);
  }
  return [...byNormalized.values()].sort();
}

export function useFileWatch(store: EditorStore): void {
  const unwatchByDir = new Map<string, UnwatchFn>();
  const handlingPaths = new Set<string>();
  const knownDiskVersionByPath = new Map<string, string>();
  const failedReloadToastShown = new Set<string>();
  let pollTimer: number | null = null;

  // Normalised so the watched-directory set keys on one spelling per directory
  // (the fs plugin canonicalises the path, so forward slashes are fine on
  // Windows — the same form `resolveLocalPath` already hands to readDir/stat).
  function watchRootForPath(path: string): string {
    return normalizePath(dirname(path) || path);
  }

  function stopWatching(dir: string) {
    const unwatch = unwatchByDir.get(dir);
    if (!unwatch) return;
    unwatchByDir.delete(dir);
    unwatch();
  }

  function mtimeValue(mtime: Date | string | number | null): string {
    if (mtime instanceof Date) return String(mtime.getTime());
    if (typeof mtime === 'string') return String(new Date(mtime).getTime());
    if (typeof mtime === 'number') return String(mtime);
    return 'no-mtime';
  }

  async function getDiskFingerprint(path: string): Promise<string | null> {
    try {
      const info = await stat(path);
      return `stat:${mtimeValue(info.mtime)}:${info.size}`;
    } catch (e) {
      // Some platforms / permission scopes may reject stat even when reading
      // the picked file is allowed. Fall back to content comparison below.
      console.warn('Failed to stat watched file, falling back to read:', path, e);
      return null;
    }
  }

  async function reloadChangedPath(path: string, retried = false) {
    if (handlingPaths.has(path)) return;

    handlingPaths.add(path);

    try {
      const fingerprint = await getDiskFingerprint(path);
      if (fingerprint && knownDiskVersionByPath.get(path) === fingerprint) return;

      const diskContent = await readTextFile(path);

      // Suppress only when the on-disk content matches what *we* just wrote —
      // i.e. the watcher is echoing our own save (auto-save or manual save). A
      // genuine external edit that lands inside the suppression window has
      // different content and is therefore NOT suppressed: it still reloads.
      if (wasWrittenWithContent(path, diskContent)) {
        knownDiskVersionByPath.set(path, fingerprint ?? `content:${diskContent}`);
        return;
      }

      const version = fingerprint ?? `content:${diskContent}`;
      if (knownDiskVersionByPath.get(path) === version) return;
      knownDiskVersionByPath.set(path, version);
      failedReloadToastShown.delete(path);
      // Normalised compare: a folder rename rewrites open tabs to forward
      // slashes while this watcher's bookkeeping still holds the spelling the
      // file was opened with, so `===` can miss the very tab that changed.
      const matchesPath = (tab: Tab) => Boolean(tab.filePath && isSamePath(tab.filePath, path));
      const matchingIds = store.tabs.filter(matchesPath).map((tab) => tab.id);

      for (const id of matchingIds) {
        const tab = store.tabs.find((candidate) => candidate.id === id && matchesPath(candidate));
        if (!tab) continue;

        if (tab.content === diskContent) {
          if (tab.isDirty) store.setTabDirty(id, false);
          continue;
        }

        if (!tab.isDirty) {
          store.loadTabFile(id, diskContent, path);
          showToast(`${basename(path)} reloaded`);
          continue;
        }

        // Our prompt is optional, and another modal (the close-window walk over
        // dirty tabs, a conflict on a different file) can hold the screen for
        // minutes. Wait for it, then re-read the tab: that flow may already
        // have saved or reloaded this file, and a stale conflict prompt over an
        // already-resolved conflict is pure noise.
        await whenPromptsIdle();
        const fresh = store.tabs.find((candidate) => candidate.id === id && matchesPath(candidate));
        if (!fresh) continue;
        if (fresh.content === diskContent) {
          if (fresh.isDirty) store.setTabDirty(id, false);
          continue;
        }
        if (!fresh.isDirty) {
          store.loadTabFile(id, diskContent, path);
          showToast(`${basename(path)} reloaded`);
          continue;
        }

        store.setActiveTab(id);
        const choice = await promptUnsavedChanges({
          title: 'File changed on disk',
          body: `${basename(path)} was changed outside Texodus, while you have unsaved local changes. What do you want to do?`,
          cancelLabel: 'Keep Local',
          discardLabel: 'Reload',
          saveLabel: 'Overwrite',
        });

        if (choice === 'discard') {
          store.loadFile(diskContent, path);
          showToast(`${basename(path)} reloaded`);
        } else if (choice === 'save') {
          await saveFile(store);
          knownDiskVersionByPath.set(path, await getDiskFingerprint(path) ?? `content:${store.content}`);
        } else {
          showToast('Kept local changes');
        }
      }

      await updateWindowTitle(store);
    } catch (e) {
      console.warn('Failed to reload changed file:', path, e);
      if (!retried) {
        window.setTimeout(() => void reloadChangedPath(path, true), 350);
      } else if (!failedReloadToastShown.has(path)) {
        failedReloadToastShown.add(path);
        showToast(`Failed to reload ${basename(path)}`);
      }
    } finally {
      handlingPaths.delete(path);
    }
  }

  const stopPathWatcher = vueWatch(
    () => uniqueOpenPaths(store.tabs),
    async (paths) => {
      const desiredPaths = new Set(paths);
      for (const path of [...knownDiskVersionByPath.keys()]) {
        if (!desiredPaths.has(path)) knownDiskVersionByPath.delete(path);
      }
      for (const path of [...failedReloadToastShown]) {
        if (!desiredPaths.has(path)) failedReloadToastShown.delete(path);
      }

      const desiredDirs = new Set(paths.map(watchRootForPath));

      for (const dir of [...unwatchByDir.keys()]) {
        if (!desiredDirs.has(dir)) stopWatching(dir);
      }

      for (const dir of desiredDirs) {
        if (unwatchByDir.has(dir)) continue;
        try {
          const unwatch = await watchFs(dir, () => {
            // fs.watch is the primary mechanism. On any event in the watched
            // directory, re-check open files from that directory. The re-check
            // looks at mtime/size first and reads content only when metadata
            // changed.
            for (const path of uniqueOpenPaths(store.tabs)) {
              if (watchRootForPath(path) === dir) void reloadChangedPath(path);
            }
          }, { delayMs: 300 });
          unwatchByDir.set(dir, unwatch);
        } catch (e) {
          console.warn('Failed to watch directory:', dir, e);
        }
      }
    },
    { immediate: true, deep: true }
  );

  pollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    for (const path of uniqueOpenPaths(store.tabs)) void reloadChangedPath(path);
  }, 2000);

  onUnmounted(() => {
    stopPathWatcher();
    if (pollTimer !== null) window.clearInterval(pollTimer);
    cleanupTauriEventListeners(unwatchByDir.values());
    unwatchByDir.clear();
  });
}
