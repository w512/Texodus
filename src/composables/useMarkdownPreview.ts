/**
 * Module-level singleton holding shared editor/preview DOM refs and
 * coordinating bi-directional scroll synchronization (§3.3).
 *
 * The single `isSyncing` flag prevents feedback loops in both directions
 * — whichever pane fired the scroll wins for that frame.
 */
let editorEl: HTMLTextAreaElement | null = null;
let previewEl: HTMLElement | null = null;
let isSyncing = false;

function withSyncLock(fn: () => void): void {
  isSyncing = true;
  fn();
  requestAnimationFrame(() => { isSyncing = false; });
}

function scrollPercentage(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

export function useMarkdownPreview() {
  return {
    setEditorElement(el: HTMLTextAreaElement | null) { editorEl = el; },
    setPreviewElement(el: HTMLElement | null) { previewEl = el; },
    getEditorElement(): HTMLTextAreaElement | null { return editorEl; },

    /** Editor → Preview sync. Called from the textarea's scroll handler. */
    syncFromEditor() {
      if (!previewEl || isSyncing) return;
      const pct = scrollPercentage(editorEl ?? { scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
      const max = previewEl.scrollHeight - previewEl.clientHeight;
      withSyncLock(() => { previewEl!.scrollTop = pct * max; });
    },

    /** Preview → Editor sync. Called from the preview's scroll handler. */
    syncFromPreview() {
      if (!editorEl || !previewEl || isSyncing) return;
      const pct = scrollPercentage(previewEl);
      const max = editorEl.scrollHeight - editorEl.clientHeight;
      withSyncLock(() => { editorEl!.scrollTop = pct * max; });
    },
  };
}
