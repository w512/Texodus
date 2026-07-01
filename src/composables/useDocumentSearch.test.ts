import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

// useMarkdownPreview is called at module level in useDocumentSearch,
// so we need mock functions that persist across the module's lifetime.
// vi.hoisted ensures the refs exist before the hoisted vi.mock factory runs.
const { mockGetEditorView, mockGetPreviewElement } = vi.hoisted(() => ({
  mockGetEditorView: vi.fn<() => EditorView | null>(() => null),
  mockGetPreviewElement: vi.fn<() => HTMLElement | null>(() => null),
}));

vi.mock('./useMarkdownPreview', () => ({
  useMarkdownPreview: () => ({
    getEditorView: mockGetEditorView,
    getPreviewElement: mockGetPreviewElement,
  }),
}));

import { useDocumentSearch } from './useDocumentSearch';

function makeView(doc: string): EditorView {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return new EditorView({
    state: EditorState.create({ doc }),
    parent: div,
  });
}

// useDocumentSearch uses module-level state, so we reset between tests
// by closing the search and clearing all options.
function getSearch() {
  return useDocumentSearch();
}

function resetSearch() {
  const s = getSearch();
  s.close();
  s.setQuery('');
  s.setCaseSensitive(false);
  s.setRegex(false);
  s.setWholeWord(false);
}

function setView(doc: string) {
  const view = makeView(doc);
  mockGetEditorView.mockReturnValue(view);
  return view;
}

describe('useDocumentSearch', () => {
  let views: EditorView[] = [];

  beforeEach(() => {
    mockGetEditorView.mockReturnValue(null);
    mockGetPreviewElement.mockReturnValue(null);
    resetSearch();
  });

  afterEach(() => {
    for (const v of views) { v.destroy(); v.dom.remove(); }
    views = [];
  });

  describe('open / close', () => {
    it('opens and sets isOpen to true', () => {
      const s = getSearch();
      s.open();
      expect(s.isOpen.value).toBe(true);
    });

    it('close sets isOpen to false', () => {
      const s = getSearch();
      s.open();
      s.close();
      expect(s.isOpen.value).toBe(false);
    });

    it('close clears matches and count', () => {
      views.push(setView('foo bar foo'));
      const s = getSearch();
      s.open();
      s.setQuery('foo');
      expect(s.matchCount.value).toBe(2);
      s.close();
      expect(s.matchCount.value).toBe(0);
      expect(s.currentIndex.value).toBe(0);
    });
  });

  describe('plain text search', () => {
    it('counts all matches', () => {
      views.push(setView('foo bar foo baz foo'));
      const s = getSearch();
      s.open();
      s.setQuery('foo');
      expect(s.matchCount.value).toBe(3);
    });

    it('reports zero matches for a non-existent term', () => {
      views.push(setView('foo bar foo'));
      const s = getSearch();
      s.open();
      s.setQuery('xyz');
      expect(s.matchCount.value).toBe(0);
      expect(s.currentIndex.value).toBe(0);
    });

    it('clears matches when query is emptied', () => {
      views.push(setView('foo bar foo'));
      const s = getSearch();
      s.open();
      s.setQuery('foo');
      expect(s.matchCount.value).toBe(2);
      s.setQuery('');
      expect(s.matchCount.value).toBe(0);
    });
  });

  describe('case sensitive search', () => {
    it('matches case-insensitively by default', () => {
      views.push(setView('Hello hello HELLO'));
      const s = getSearch();
      s.open();
      s.setQuery('hello');
      expect(s.matchCount.value).toBe(3);
    });

    it('matches case-sensitively when enabled', () => {
      views.push(setView('Hello hello HELLO'));
      const s = getSearch();
      s.open();
      s.setCaseSensitive(true);
      s.setQuery('hello');
      expect(s.matchCount.value).toBe(1);
    });
  });

  describe('regex search', () => {
    it('supports regex patterns', () => {
      views.push(setView('cat bat rat hat'));
      const s = getSearch();
      s.open();
      s.setRegex(true);
      s.setQuery('[cbr]at');
      expect(s.matchCount.value).toBe(3);
    });

    it('sets hasError for an invalid regex', () => {
      views.push(setView('test'));
      const s = getSearch();
      s.open();
      s.setRegex(true);
      s.setQuery('(');
      expect(s.hasError.value).toBe(true);
      expect(s.matchCount.value).toBe(0);
    });

    it('clears hasError when switching back to plain text', () => {
      views.push(setView('test'));
      const s = getSearch();
      s.open();
      s.setRegex(true);
      s.setQuery('(');
      expect(s.hasError.value).toBe(true);
      s.setRegex(false);
      expect(s.hasError.value).toBe(false);
    });
  });

  describe('whole word search', () => {
    it('matches whole words only', () => {
      views.push(setView('foo foobar foo barfoo'));
      const s = getSearch();
      s.open();
      s.setWholeWord(true);
      s.setQuery('foo');
      // Two standalone "foo" words, not inside foobar or barfoo
      expect(s.matchCount.value).toBe(2);
    });
  });

  describe('navigation', () => {
    it('next/prev cycle through matches', () => {
      views.push(setView('foo bar foo'));
      const s = getSearch();
      s.open();
      s.setQuery('foo');
      expect(s.matchCount.value).toBe(2);
      expect(s.currentIndex.value).toBe(1);

      s.next();
      expect(s.currentIndex.value).toBe(2);

      s.next();
      // wraps around
      expect(s.currentIndex.value).toBe(1);

      s.prev();
      expect(s.currentIndex.value).toBe(2);
    });

    it('next/prev do nothing when there are no matches', () => {
      views.push(setView('foo bar foo'));
      const s = getSearch();
      s.open();
      s.setQuery('zzz');
      expect(s.matchCount.value).toBe(0);
      s.next();
      expect(s.currentIndex.value).toBe(0);
      s.prev();
      expect(s.currentIndex.value).toBe(0);
    });
  });

  describe('preview target — mermaid toolbar exclusion', () => {
    function setPreview(html: string): HTMLElement {
      const el = document.createElement('div');
      el.innerHTML = html;
      document.body.appendChild(el);
      previews.push(el);
      mockGetPreviewElement.mockReturnValue(el);
      return el;
    }

    let previews: HTMLElement[] = [];

    beforeEach(() => {
      // jsdom's Range lacks getBoundingClientRect (used for scroll-to-match,
      // which runs after the count is computed). Stub it so the preview path
      // doesn't throw; the real WebView implements it.
      Range.prototype.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    });

    afterEach(() => {
      for (const el of previews) el.remove();
      previews = [];
    });

    it('does not count text inside a mermaid toolbar', () => {
      // "Reset" appears in the toolbar and in the body; only the body match counts.
      setPreview(
        '<div class="mermaid-preview-container">' +
          '<div class="mermaid-toolbar"><button>Reset</button><span>100%</span></div>' +
          '<svg><text>Reset</text></svg>' +
          '</div>' +
          '<p>Reset the counter here.</p>',
      );
      const s = getSearch();
      s.open();
      s.setQuery('Reset');
      expect(s.matchCount.value).toBe(1);
    });

    it('counts ordinary preview content normally', () => {
      setPreview('<p>foo bar foo</p><p>foo</p>');
      const s = getSearch();
      s.open();
      s.setQuery('foo');
      expect(s.matchCount.value).toBe(3);
    });
  });
});