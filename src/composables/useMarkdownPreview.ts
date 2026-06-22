/**
 * Module-level singleton holding shared editor/preview refs and coordinating
 * bi-directional scroll synchronization (§3.3).
 *
 * Sync strategy: line-anchor mapping with **fractional** line positions and
 * virtual anchors at the document edges. Both directions are exact inverses
 * of each other.
 *
 *   editor scrollTop → fractional source line → interpolated preview scrollTop
 *   preview scrollTop → fractional source line → interpolated editor scrollTop
 *
 * Sub-pixel fractional positions are necessary: an integer line would snap
 * every editor scroll to the start of the topmost visible line, and the
 * inverse would then snap the editor back, locking the user out of scrolling
 * within a single source line.
 *
 * Smoothness — why this is more than `follower.scrollTop = target` per event:
 *   1. Work is funnelled through one rAF loop. In the default (snap) mode it
 *      coalesces a burst of trackpad events into a single, paint-aligned write
 *      per frame. With `settings.smoothScrollSync` on, the same loop instead
 *      eases the follower a fraction of the way toward a continuously
 *      re-derived target each frame, so it glides instead of jumping.
 *   2. Setting `scrollTop` makes the browser emit an "echo" scroll event a
 *      frame later. We remember the exact position we wrote and skip the
 *      matching echo, so the follower can't drive the leader back. That
 *      feedback fight — released too early by the old per-rAF lock — was the
 *      visible jitter.
 *   3. Preview anchors (per-block `offsetTop` reads) are cached and only
 *      recomputed when the cache key (scrollHeight / clientHeight / line count)
 *      changes — i.e. on re-render, image load, mermaid, resize or font change,
 *      never on a plain scroll.
 */
import type { EditorView } from '@codemirror/view';
import { useSettingsStore } from '../stores/settings';

let editorView: EditorView | null = null;
let previewEl: HTMLElement | null = null;

// Skip the write if the follower is already within this many pixels of target.
const SYNC_THRESHOLD_PX = 1;
// Tolerance for recognising our own programmatic scroll coming back as an echo.
const ECHO_EPS_PX = 2;
// Easing: fraction of the remaining distance to close each frame, and the
// distance at which we snap to the exact target and stop the loop.
const EASE_FACTOR = 0.35;
const EASE_DONE_PX = 1;

// Exact follower positions we just wrote programmatically. The matching echo
// `scroll` event is recognised by value and skipped (see module comment #2).
let expectedEditorTop: number | null = null;
let expectedPreviewTop: number | null = null;

// rAF loop state. `pendingSource` is the pane the user is driving (the leader);
// the other pane follows. In snap mode the loop runs one frame per scroll
// burst; in ease mode it sustains itself until the follower settles.
let rafId: number | null = null;
let pendingSource: 'editor' | 'preview' | null = null;

interface Anchor {
  line: number;
  top: number;
}

// Cached bracketed preview anchors, keyed by a cheap layout fingerprint. The
// key reads are O(1) while layout is clean (during scroll); they only differ
// — forcing a recompute — when the preview's content or box actually changes.
let cachedAnchors: Anchor[] | null = null;
let cacheKey = '';

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

/** Bracketed preview anchors, recomputed only when the layout fingerprint
 *  changes. Returns null when there aren't enough anchors to interpolate. */
function getAnchors(): Anchor[] | null {
  if (!previewEl || !editorView) return null;
  const lines = editorView.state.doc.lines;
  const key = `${previewEl.scrollHeight}:${previewEl.clientHeight}:${lines}`;
  if (!cachedAnchors || key !== cacheKey) {
    cachedAnchors = bracketedAnchors(previewEl, lines);
    cacheKey = key;
  }
  return cachedAnchors.length >= 2 ? cachedAnchors : null;
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

/** The pane that follows when `source` leads. */
function followerEl(source: 'editor' | 'preview'): HTMLElement | null {
  if (source === 'editor') return previewEl;
  return editorView ? editorView.scrollDOM : null;
}

/** Follower scrollTop that mirrors the leader's current position. */
function computeTarget(source: 'editor' | 'preview'): number | null {
  if (!editorView || !previewEl) return null;
  const anchors = getAnchors();
  if (!anchors) return null;
  if (source === 'editor') {
    const line = editorTopLine(editorView);
    return interpolate(anchors, 'line', line, 'top');
  }
  const line = interpolate(anchors, 'top', previewEl.scrollTop, 'line');
  return editorLineToScroll(editorView, line);
}

function rememberWrite(source: 'editor' | 'preview', value: number): void {
  if (source === 'editor') expectedPreviewTop = value;
  else expectedEditorTop = value;
}

/** One frame of the sync loop. Recomputes the target from the leader's live
 *  position, then either snaps to it or eases toward it. */
function tick(): void {
  rafId = null;
  const source = pendingSource;
  if (!source) return;

  const el = followerEl(source);
  const target = computeTarget(source);
  if (!el || target === null) { pendingSource = null; return; }

  const current = el.scrollTop;
  const dist = target - current;

  // Ease mode: glide a fraction of the way and keep the loop alive until the
  // follower has caught up to the (possibly still-moving) target.
  if (useSettingsStore().smoothScrollSync) {
    if (Math.abs(dist) <= EASE_DONE_PX) {
      if (Math.abs(dist) >= SYNC_THRESHOLD_PX) {
        el.scrollTop = target;
        rememberWrite(source, el.scrollTop);
      }
      pendingSource = null; // settled
      return;
    }
    el.scrollTop = current + dist * EASE_FACTOR;
    rememberWrite(source, el.scrollTop);
    rafId = requestAnimationFrame(tick);
    return;
  }

  // Snap mode: one write to the target, then wait for the next scroll event.
  if (Math.abs(dist) >= SYNC_THRESHOLD_PX) {
    el.scrollTop = target;
    rememberWrite(source, el.scrollTop);
  }
  pendingSource = null;
}

/** Queue / refresh a sync for the pane the user is driving. */
function schedule(source: 'editor' | 'preview'): void {
  pendingSource = source;
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

export function useMarkdownPreview() {
  return {
    setEditorView(view: EditorView | null) {
      editorView = view;
      expectedEditorTop = null;
      cachedAnchors = null;
    },
    setPreviewElement(el: HTMLElement | null) {
      previewEl = el;
      expectedPreviewTop = null;
      cachedAnchors = null;
    },
    getEditorView(): EditorView | null { return editorView; },
    getPreviewElement(): HTMLElement | null { return previewEl; },

    /** Editor → Preview sync. Called from the editor's scroll handler. */
    syncFromEditor() {
      if (!editorView) return;
      const top = editorView.scrollDOM.scrollTop;
      // Recognise the echo of our own programmatic editor scroll and drop it,
      // so the preview can't bounce the editor back.
      if (expectedEditorTop !== null && Math.abs(top - expectedEditorTop) <= ECHO_EPS_PX) {
        expectedEditorTop = null;
        return;
      }
      expectedEditorTop = null; // a real user scroll supersedes any pending echo
      schedule('editor');
    },

    /** Preview → Editor sync. Called from the preview's scroll handler. */
    syncFromPreview() {
      if (!previewEl) return;
      const top = previewEl.scrollTop;
      if (expectedPreviewTop !== null && Math.abs(top - expectedPreviewTop) <= ECHO_EPS_PX) {
        expectedPreviewTop = null;
        return;
      }
      expectedPreviewTop = null;
      schedule('preview');
    },
  };
}
