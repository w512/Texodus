import { beforeEach, describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMarkdownState, setSearchHighlights, searchHighlightField } from './useCodeMirror';
import { useEditorStore } from '../stores/editor';

beforeEach(() => setActivePinia(createPinia()));

// Regression guard: the editor's search highlight is driven by our own
// decoration field (CodeMirror's built-in highlighter only paints while its
// search panel is open, which this app never uses). These assert that pushing
// match ranges actually produces decorations — i.e. there's something for the
// theme's --search-highlight colors to style.
describe('searchHighlightField', () => {
  const make = () => createMarkdownState({
    initialDoc: 'foo foo foo',
    theme: { dark: false, font: 'monospace', fontSize: 14, lineHeight: 1.5 },
    onChange: () => {},
    onScroll: () => {},
  });

  it('renders a decoration per pushed match', () => {
    const state = make().update({
      effects: setSearchHighlights.of({
        matches: [{ from: 0, to: 3 }, { from: 4, to: 7 }, { from: 8, to: 11 }],
        current: 1,
      }),
    }).state;
    expect(state.field(searchHighlightField).size).toBe(3);
  });

  it('clears decorations when an empty match set is pushed', () => {
    const withMatches = make().update({
      effects: setSearchHighlights.of({ matches: [{ from: 0, to: 3 }], current: 0 }),
    }).state;
    expect(withMatches.field(searchHighlightField).size).toBe(1);

    const cleared = withMatches.update({
      effects: setSearchHighlights.of({ matches: [], current: -1 }),
    }).state;
    expect(cleared.field(searchHighlightField).size).toBe(0);
  });

  it('skips zero-width ranges', () => {
    const state = make().update({
      effects: setSearchHighlights.of({ matches: [{ from: 2, to: 2 }, { from: 4, to: 7 }], current: 0 }),
    }).state;
    expect(state.field(searchHighlightField).size).toBe(1);
  });
});

// Regression guard for GitHub issue #7: CodeMirror stores every document as LF,
// so feeding it raw CRLF produces a document that differs from what was handed
// in — the editor immediately reports an "edit" that dirties the tab and makes
// the file watcher believe the file changed on disk. The editor store therefore
// normalises on load; these assertions pin both halves of that contract.
describe('line-ending normalisation', () => {
  const state = (doc: string) => createMarkdownState({
    initialDoc: doc,
    theme: { dark: false, font: 'monospace', fontSize: 14, lineHeight: 1.5 },
    onChange: () => {},
    onScroll: () => {},
  });

  it('rewrites CRLF input to LF (the reason the buffer must be normalised)', () => {
    expect(state('a\r\nb').doc.toString()).toBe('a\nb');
  });

  it('round-trips a normalised buffer without reporting a change', () => {
    const store = useEditorStore();
    store.loadFile('# Title\r\n\r\nBody\r\n', '/docs/note.md');

    const initial = state(store.content);
    expect(initial.doc.toString()).toBe(store.content);

    // What TextEditor.vue does when the store's content changes in place.
    const tr = initial.update({
      changes: { from: 0, to: initial.doc.length, insert: store.content },
    });
    expect(tr.state.doc.toString()).toBe(store.content);
    expect(store.isDirty).toBe(false);
  });
});
