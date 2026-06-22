import { describe, it, expect } from 'vitest';
import { createMarkdownState, setSearchHighlights, searchHighlightField } from './useCodeMirror';

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
