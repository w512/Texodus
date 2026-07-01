/**
 * Document search shared state + engine, driven by the app-level SearchBar.
 *
 * Two targets, chosen by which pane is actually mounted:
 *   - Editor present (split / focus) → CodeMirror. We set the search query via
 *     `setSearchQuery` (reuses CM's match highlighting) and move the selection
 *     to the current match; in split the preview follows through scroll-sync.
 *   - Preview only → the rendered preview. Matches are highlighted with the CSS
 *     Custom Highlight API (no DOM mutation, so sanitization and the
 *     `data-source-line` scroll anchors are untouched); degrades to scroll-only
 *     where the API is unavailable.
 *
 * Match list + index are the single source of truth for the "N/M" counter and
 * for navigation, regardless of target.
 */
import { ref } from 'vue';
import { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { useMarkdownPreview } from './useMarkdownPreview';
import { setSearchHighlights } from './useCodeMirror';

// CSS Custom Highlight API — not present in every TS lib / webview, so reach it
// through globalThis with narrow typing and feature-detect at runtime.
const env = globalThis as unknown as {
  Highlight?: new (...ranges: Range[]) => unknown;
  CSS?: { highlights?: { set(name: string, h: unknown): void } };
};
const HighlightCtor = env.Highlight;
const highlightsApi = env.CSS?.highlights;
const HL_ALL = 'texodus-search';
const HL_CURRENT = 'texodus-search-current';

const { getEditorView, getPreviewElement } = useMarkdownPreview();

const isOpen = ref(false);
const queryText = ref('');
const caseSensitive = ref(false);
const useRegex = ref(false);
const wholeWord = ref(false);
const matchCount = ref(0);
const currentIndex = ref(0); // 1-based; 0 = no current match
const hasError = ref(false); // invalid regular expression
const focusNonce = ref(0);   // bumped to (re)focus the input

let editorMatches: { from: number; to: number }[] = [];
let previewMatches: Range[] = [];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeRegex(): RegExp | null {
  const text = queryText.value;
  if (!text) return null;
  let pattern = useRegex.value ? text : escapeRegExp(text);
  if (wholeWord.value) pattern = `\\b(?:${pattern})\\b`;
  try {
    return new RegExp(pattern, caseSensitive.value ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function makeQuery(): SearchQuery {
  return new SearchQuery({
    search: queryText.value,
    caseSensitive: caseSensitive.value,
    regexp: useRegex.value,
    wholeWord: wholeWord.value,
  });
}

// ── Editor target ──────────────────────────────────────────────────────────

function collectEditorMatches(query: SearchQuery, state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const cursor = query.getCursor(state) as Iterator<{ from: number; to: number }>;
  let v = cursor.next();
  let guard = 0;
  while (!v.done && guard++ < 200000) {
    out.push({ from: v.value.from, to: v.value.to });
    v = cursor.next();
  }
  return out;
}

function selectEditorMatch(view: EditorView, m: { from: number; to: number }): void {
  view.dispatch({
    selection: { anchor: m.from, head: m.to },
    effects: EditorView.scrollIntoView(m.from, { y: 'center' }),
    userEvent: 'select.search',
  });
}

function highlightEditor(view: EditorView, current: number): void {
  view.dispatch({ effects: setSearchHighlights.of({ matches: editorMatches, current }) });
}

function applyEditor(view: EditorView, reselect: boolean): void {
  const query = makeQuery();
  hasError.value = useRegex.value && !query.valid;
  if (!query.valid) {
    editorMatches = [];
    matchCount.value = 0;
    currentIndex.value = 0;
    view.dispatch({ effects: setSearchHighlights.of({ matches: [], current: -1 }) });
    return;
  }
  editorMatches = collectEditorMatches(query, view.state);
  matchCount.value = editorMatches.length;
  if (editorMatches.length === 0) {
    currentIndex.value = 0;
    view.dispatch({ effects: setSearchHighlights.of({ matches: [], current: -1 }) });
    return;
  }
  let idx: number;
  if (reselect) {
    // Jump to the first match at/after the caret (find-as-you-type).
    const anchor = view.state.selection.main.from;
    idx = editorMatches.findIndex((m) => m.to > anchor);
    if (idx < 0) idx = 0;
  } else {
    // Document edit: keep the selection, just recompute the current index.
    const sel = view.state.selection.main;
    const found = editorMatches.findIndex((m) => m.from === sel.from && m.to === sel.to);
    idx = found >= 0 ? found : Math.min((currentIndex.value || 1) - 1, editorMatches.length - 1);
  }
  currentIndex.value = idx + 1;
  highlightEditor(view, idx);
  if (reselect) selectEditorMatch(view, editorMatches[idx]);
}

// ── Preview target (CSS Custom Highlight API) ───────────────────────────────

function collectPreviewRanges(root: HTMLElement, re: RegExp): Range[] {
  // Skip text that isn't document content: mermaid diagram toolbars ("Copy
  // SVG", "Reset", the zoom "100%" label) and text rendered inside the SVGs
  // themselves. Otherwise these leak into the N/M counter and navigation.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (parent?.closest('.mermaid-toolbar, svg')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const ranges: Range[] = [];

  // Run the regex per text node instead of concatenating all text into a
  // single string. This avoids allocating a potentially huge `full` string,
  // eliminates the nodes[]/locateNode machinery, and bounds each regex
  // execution to a single text node.
  //
  // Trade-off: matches spanning a text-node boundary (e.g. "fo" in one
  // node + "o" in the next) are missed. In practice this is extremely
  // rare — text-node boundaries fall on HTML tag edges, and search terms
  // almost never cross tag boundaries.
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const data = text.data;
    if (!data) continue;

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(data)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const range = document.createRange();
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      ranges.push(range);
    }
  }

  return ranges;
}

// Force the preview to repaint from scratch. WKWebView repaints the
// `::highlight()` layer when ranges are *added* (so matches appear), but does
// not invalidate the previously painted pixels when the highlights are emptied
// or deleted — leaving stale highlights after the search bar closes. Toggling
// `display` evicts the element from the render tree and rebuilds it on restore,
// which paints fresh from the current (now empty) highlight registry. The
// toggle is synchronous, so the intermediate state is never painted (no flash);
// we save/restore `scrollTop` because `display:none` resets it.
function forcePreviewRepaint(): void {
  const el = getPreviewElement();
  if (!el) return;
  const top = el.scrollTop;
  const prev = el.style.display;
  el.style.display = 'none';
  void el.offsetHeight; // force reflow while detached
  el.style.display = prev;
  el.scrollTop = top;
}

// Empty the highlight registry. Keep the entries registered (deleting doesn't
// repaint reliably on WKWebView). This alone does NOT clear the painted pixels
// on WKWebView — callers that end with no matches must follow with
// forcePreviewRepaint(); callers that immediately repaint ranges don't need to.
function clearPreviewHighlights(): void {
  if (!highlightsApi || !HighlightCtor) return;
  highlightsApi.set(HL_ALL, new HighlightCtor());
  highlightsApi.set(HL_CURRENT, new HighlightCtor());
}

function paintPreview(): void {
  if (!HighlightCtor || !highlightsApi) return;
  const current = previewMatches[currentIndex.value - 1];
  const others = previewMatches.filter((_, i) => i !== currentIndex.value - 1);
  highlightsApi.set(HL_ALL, new HighlightCtor(...others));
  highlightsApi.set(HL_CURRENT, current ? new HighlightCtor(current) : new HighlightCtor());
}

function scrollPreviewToCurrent(): void {
  const el = getPreviewElement();
  const current = previewMatches[currentIndex.value - 1];
  if (!el || !current) return;
  const elRect = el.getBoundingClientRect();
  const r = current.getBoundingClientRect();
  el.scrollTop += (r.top - elRect.top) - el.clientHeight / 2 + r.height / 2;
}

function applyPreview(reselect: boolean): void {
  const el = getPreviewElement();
  const re = makeRegex();
  hasError.value = useRegex.value && re === null;
  if (!el || !re) {
    previewMatches = [];
    matchCount.value = 0;
    currentIndex.value = 0;
    return;
  }
  previewMatches = collectPreviewRanges(el, re);
  matchCount.value = previewMatches.length;
  if (previewMatches.length === 0) {
    currentIndex.value = 0;
    clearPreviewHighlights();
    forcePreviewRepaint();
    return;
  }
  if (reselect || currentIndex.value < 1 || currentIndex.value > previewMatches.length) {
    currentIndex.value = 1;
  }
  paintPreview();
  if (reselect) scrollPreviewToCurrent();
}

// Split view: highlight every preview match (no distinct "current" — the editor
// owns navigation and the preview tracks it via scroll-sync). Does not touch the
// shared counter/index, which the editor owns here.
function paintPreviewAll(): void {
  const el = getPreviewElement();
  previewMatches = [];
  if (!el) return;
  const re = makeRegex();
  if (!re) return;
  previewMatches = collectPreviewRanges(el, re);
  if (!HighlightCtor || !highlightsApi) return;
  if (previewMatches.length === 0) { forcePreviewRepaint(); return; }
  highlightsApi.set(HL_ALL, new HighlightCtor(...previewMatches));
  highlightsApi.set(HL_CURRENT, new HighlightCtor());
}

// ── Orchestration ───────────────────────────────────────────────────────────

function apply(reselect: boolean): void {
  clearPreviewHighlights();
  hasError.value = false;
  const view = getEditorView();
  if (!isOpen.value || !queryText.value.trim()) {
    if (view) view.dispatch({ effects: setSearchHighlights.of({ matches: [], current: -1 }) });
    forcePreviewRepaint(); // clear stale preview highlights (close / empty query)
    editorMatches = [];
    previewMatches = [];
    matchCount.value = 0;
    currentIndex.value = 0;
    return;
  }
  if (view) {
    // Editor is authoritative for the counter, current match and navigation.
    applyEditor(view, reselect);
    // In split view the preview is also mounted — highlight its matches too.
    paintPreviewAll();
  } else {
    applyPreview(reselect);
  }
}

function step(forward: boolean): void {
  if (matchCount.value === 0) return;
  const n = matchCount.value;
  const idx = ((currentIndex.value - 1) + (forward ? 1 : -1) + n) % n;
  currentIndex.value = idx + 1;
  const view = getEditorView();
  if (view) {
    highlightEditor(view, idx);
    if (editorMatches[idx]) selectEditorMatch(view, editorMatches[idx]);
  } else {
    paintPreview();
    scrollPreviewToCurrent();
  }
}

function openSearch(): void {
  isOpen.value = true;
  focusNonce.value++;
  apply(true);
}

function closeSearch(): void {
  isOpen.value = false;
  apply(false); // clears highlights
  getEditorView()?.focus();
}

export function useDocumentSearch() {
  return {
    isOpen, queryText, caseSensitive, useRegex, wholeWord,
    matchCount, currentIndex, hasError, focusNonce,
    open: openSearch,
    close: closeSearch,
    setQuery(v: string) { queryText.value = v; apply(true); },
    setCaseSensitive(v: boolean) { caseSensitive.value = v; apply(true); },
    setRegex(v: boolean) { useRegex.value = v; apply(true); },
    setWholeWord(v: boolean) { wholeWord.value = v; apply(true); },
    next() { step(true); },
    prev() { step(false); },
    /** Re-run after a document edit: refresh matches/highlight, keep selection. */
    refresh() { if (isOpen.value) apply(false); },
    /** Re-run after the target pane changes (layout switch): re-highlight and
     *  jump to a match in the now-active pane. */
    retarget() { if (isOpen.value) apply(true); },
  };
}
