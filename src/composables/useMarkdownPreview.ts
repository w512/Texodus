/**
 * Module-level singleton holding shared editor/preview refs and coordinating
 * bi-directional scroll synchronization (§3.3).
 *
 * Sync strategy: line-anchor mapping with **fractional** line positions and
 * virtual anchors at the document edges. Both directions are exact inverses
 * of each other, so the chained `syncFrom*` calls converge in one round
 * thanks to the SYNC_THRESHOLD_PX bail.
 *
 *   editor scrollTop → fractional source line → interpolated preview scrollTop
 *   preview scrollTop → fractional source line → interpolated editor scrollTop
 *
 * Sub-pixel fractional positions are necessary: an integer line would snap
 * every editor scroll to the start of the topmost visible line, and the
 * inverse `syncFromPreview` would then snap the editor back, locking the
 * user out of scrolling within a single source line.
 */
import type { EditorView } from '@codemirror/view';

let editorView: EditorView | null = null;
let previewEl: HTMLElement | null = null;
let isSyncing = false;

function withSyncLock(fn: () => void): void {
  isSyncing = true;
  fn();
  requestAnimationFrame(() => { isSyncing = false; });
}

// Skip the sync if the target pane is already within this many pixels of
// where it would go. With invertible math the chained `syncFrom*` round-trip
// is a no-op; this threshold absorbs sub-pixel rounding so it stays a no-op.
const SYNC_THRESHOLD_PX = 1;

interface Anchor {
  line: number;
  top: number;
}

/** Reads `data-source-line` attributes off the preview's top-level blocks. */
function realAnchors(container: HTMLElement): Anchor[] {
  const out: Anchor[] = [];
  for (const el of Array.from(
    container.querySelectorAll<HTMLElement>(':scope > [data-source-line]'),
  )) {
    const line = parseInt(el.dataset.sourceLine!, 10);
    if (Number.isFinite(line)) out.push({ line, top: el.offsetTop });
  }
  return out;
}

/** Anchor list with virtual start (0, 0) and virtual end (totalLines, maxScroll)
 *  prepended/appended. Guarantees the interpolation never extrapolates past
 *  the actual scrollable range — which would let the browser clamp the assignment
 *  and break the round-trip. */
function bracketedAnchors(container: HTMLElement, totalLines: number): Anchor[] {
  const real = realAnchors(container);
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const endLine = Math.max(1, totalLines);

  const out: Anchor[] = [];
  if (real.length === 0 || real[0].line > 0) out.push({ line: 0, top: 0 });
  out.push(...real);
  const last = out[out.length - 1];
  if (last.line < endLine) out.push({ line: endLine, top: maxScroll });
  return out;
}

/** Topmost editor source line currently visible, as a fractional 0-indexed
 *  position inside the line (e.g. 4.5 = halfway through the 5th line). */
function editorTopLine(view: EditorView): number {
  const scrollTop = view.scrollDOM.scrollTop;
  const block = view.lineBlockAtHeight(scrollTop);
  const lineNum = view.state.doc.lineAt(block.from).number - 1;
  const frac = block.height > 0
    ? (scrollTop - block.top) / block.height
    : 0;
  return lineNum + Math.max(0, Math.min(1, frac));
}

/** Inverse of editorTopLine. */
function editorLineToScroll(view: EditorView, line: number): number {
  const totalLines = view.state.doc.lines;
  if (line <= 0) return 0;

  const intPart = Math.min(totalLines - 1, Math.floor(line));
  const fracPart = Math.max(0, Math.min(1, line - intPart));
  const docLine = view.state.doc.line(intPart + 1);
  const block = view.lineBlockAt(docLine.from);
  return block.top + fracPart * block.height;
}

function interpolate(anchors: Anchor[], key: 'line' | 'top', value: number, out: 'top' | 'line'): number {
  // Linear search — anchor lists are short (top-level blocks only), so this
  // is fine. Returns the interpolated `out` value for the given `key=value`.
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (value >= a[key] && value <= b[key]) {
      const span = b[key] - a[key];
      const t = span > 0 ? (value - a[key]) / span : 0;
      return a[out] + t * (b[out] - a[out]);
    }
  }
  // Past the last anchor — clamp.
  if (value <= anchors[0][key]) return anchors[0][out];
  return anchors[anchors.length - 1][out];
}

export function useMarkdownPreview() {
  return {
    setEditorView(view: EditorView | null) { editorView = view; },
    setPreviewElement(el: HTMLElement | null) { previewEl = el; },
    getEditorView(): EditorView | null { return editorView; },

    /** Editor → Preview sync. Called from the editor's scroll handler. */
    syncFromEditor() {
      if (!previewEl || isSyncing || !editorView) return;
      const anchors = bracketedAnchors(previewEl, editorView.state.doc.lines);
      if (anchors.length < 2) return;
      const line = editorTopLine(editorView);
      const target = interpolate(anchors, 'line', line, 'top');
      if (Math.abs(previewEl.scrollTop - target) < SYNC_THRESHOLD_PX) return;
      withSyncLock(() => { previewEl!.scrollTop = target; });
    },

    /** Preview → Editor sync. Called from the preview's scroll handler. */
    syncFromPreview() {
      if (!editorView || !previewEl || isSyncing) return;
      const anchors = bracketedAnchors(previewEl, editorView.state.doc.lines);
      if (anchors.length < 2) return;
      const line = interpolate(anchors, 'top', previewEl.scrollTop, 'line');
      const target = editorLineToScroll(editorView, line);
      const scroller = editorView.scrollDOM;
      if (Math.abs(scroller.scrollTop - target) < SYNC_THRESHOLD_PX) return;
      withSyncLock(() => { scroller.scrollTop = target; });
    },
  };
}
