/**
 * Write suppression for the file watcher.
 *
 * When the app writes a file (auto-save or manual save), the OS file-watcher
 * fires a change event for that same path. Without suppression, the watcher
 * would reload the file from disk, potentially overwriting unsaved in-memory
 * edits and showing a spurious "reloaded" toast.
 *
 * `markFileWritten(path)` records the timestamp; `wasRecentlyWritten(path)`
 * returns true within the suppression window so the watcher can skip the event.
 */

const SUPPRESSION_MS = 4000;

const recentWrites = new Map<string, number>();

/** Record that the app just wrote to `path`. */
export function markFileWritten(path: string): void {
  recentWrites.set(path, Date.now());
}

/** True if `path` was written by the app within the suppression window. */
export function wasRecentlyWritten(path: string): boolean {
  const ts = recentWrites.get(path);
  if (!ts) return false;
  if (Date.now() - ts > SUPPRESSION_MS) {
    recentWrites.delete(path);
    return false;
  }
  return true;
}

/** Clear all suppression entries. Useful for testing. */
export function clearWriteSuppression(): void {
  recentWrites.clear();
}