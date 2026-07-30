import { stat } from '@tauri-apps/plugin-fs';
import type { useSettingsStore } from '../stores/settings';

type SettingsStore = ReturnType<typeof useSettingsStore>;

/** True only for a definite missing-path error, not a scope or transient I/O failure. */
export function isMissingFileError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes('enoent')
    || message.includes('not found')
    || message.includes('no such file or directory')
    || message.includes('cannot find the file')
    || message.includes('os error 2');
}

/**
 * Removes recent entries whose files definitely no longer exist. Permission,
 * scope, and transient I/O failures are retained so the user can retry or use
 * the existing scope-recovery flow instead of silently losing the entry.
 */
export async function pruneMissingRecentFiles(settings: SettingsStore): Promise<void> {
  const snapshot = [...settings.recentFiles];
  const missing = await Promise.all(snapshot.map(async (path) => {
    try {
      await stat(path);
      return null;
    } catch (error) {
      return isMissingFileError(error) ? path : null;
    }
  }));

  const missingPaths = new Set(missing.filter((path): path is string => path !== null));
  if (missingPaths.size > 0) settings.removeRecentFiles(missingPaths);
}
