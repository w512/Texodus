import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditorStore } from './editor';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('editor store', () => {
  it('starts with a single blank active tab', () => {
    const store = useEditorStore();
    expect(store.tabs).toHaveLength(1);
    expect(store.activeTabId).toBe(store.tabs[0].id);
    expect(store.content).toBe('');
    expect(store.filePath).toBeNull();
    expect(store.isDirty).toBe(false);
  });

  it('updateContent marks the active tab dirty', () => {
    const store = useEditorStore();
    store.updateContent('hello');
    expect(store.content).toBe('hello');
    expect(store.isDirty).toBe(true);
  });

  it('loadFile replaces content and clears the dirty flag', () => {
    const store = useEditorStore();
    store.updateContent('draft');
    store.loadFile('# saved', '/tmp/a.md');
    expect(store.content).toBe('# saved');
    expect(store.filePath).toBe('/tmp/a.md');
    expect(store.isDirty).toBe(false);
  });

  it('addTab inserts after the active tab and focuses it', () => {
    const store = useEditorStore();
    const first = store.activeTabId;
    const second = store.addTab({ content: 'b' });
    expect(store.activeTabId).toBe(second);

    // Insert a third while the *first* tab is active — it must land between.
    store.setActiveTab(first);
    const third = store.addTab({ content: 'c' });
    expect(store.tabs.map((t) => t.id)).toEqual([first, third, second]);
  });

  it('closing the only tab resets it in place instead of emptying the array', () => {
    const store = useEditorStore();
    const id = store.activeTabId;
    store.loadFile('content', '/tmp/a.md');
    store.closeTab(id);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0].id).toBe(id);
    expect(store.content).toBe('');
    expect(store.filePath).toBeNull();
  });

  it('closing the active tab focuses the right neighbour, then falls back left', () => {
    const store = useEditorStore();
    const a = store.activeTabId;
    const b = store.addTab();
    const c = store.addTab();
    // Order is [a, b, c] (each added right after the then-active tab).

    store.setActiveTab(b);
    store.closeTab(b);
    expect(store.activeTabId).toBe(c);

    store.closeTab(c);
    expect(store.activeTabId).toBe(a);
  });

  it('closing an inactive tab keeps the current focus', () => {
    const store = useEditorStore();
    const a = store.activeTabId;
    const b = store.addTab();
    store.closeTab(a);
    expect(store.activeTabId).toBe(b);
  });

  it('cycles through tabs in both directions', () => {
    const store = useEditorStore();
    const a = store.activeTabId;
    const b = store.addTab();
    store.activateNextTab();
    expect(store.activeTabId).toBe(a);
    store.activatePreviousTab();
    expect(store.activeTabId).toBe(b);
  });

  it('anyTabDirty reflects background tabs', () => {
    const store = useEditorStore();
    store.updateContent('x');
    store.addTab();
    expect(store.isDirty).toBe(false);
    expect(store.anyTabDirty).toBe(true);
  });

  describe('closeOtherTabs', () => {
    it('removes every tab except the given one', () => {
      const store = useEditorStore();
      const _a = store.activeTabId;
      const b = store.addTab({ content: 'b' });
      const _c = store.addTab({ content: 'c' });
      store.closeOtherTabs(b);
      expect(store.tabs[0].id).toBe(b);
      expect(store.activeTabId).toBe(b);
    });
  });

  describe('closeTabsToTheRight', () => {
    it('removes tabs after the given one', () => {
      const store = useEditorStore();
      const a = store.activeTabId;
      const b = store.addTab();
      const _c = store.addTab();
      const _d = store.addTab();
      store.closeTabsToTheRight(b);
      expect(store.tabs.map((t) => t.id)).toEqual([a, b]);
      expect(store.activeTabId).toBe(b);
    });

    it('does nothing when the tab is already last', () => {
      const store = useEditorStore();
      const a = store.activeTabId;
      const b = store.addTab();
      store.closeTabsToTheRight(b);
      expect(store.tabs.map((t) => t.id)).toEqual([a, b]);
    });
  });

  describe('duplicateTab', () => {
    it('creates a copy after the original and activates it', () => {
      const store = useEditorStore();
      store.loadFile('hello', '/tmp/a.md');
      const a = store.activeTabId;
      const dup = store.duplicateTab(a);
      expect(dup).not.toBe(a);
      expect(store.tabs).toHaveLength(2);
      expect(store.tabs[0].id).toBe(a);
      expect(store.tabs[1].id).toBe(dup);
      expect(store.activeTabId).toBe(dup);
    });

    // Inheriting filePath would create a second buffer of the same file: the
    // two tabs diverge on edit and race to overwrite each other on save.
    it('copies the content but not the file path, and marks the copy dirty', () => {
      const store = useEditorStore();
      store.loadFile('world', '/tmp/note.md');
      const a = store.activeTabId;
      store.duplicateTab(a);
      const dup = store.tabs[1];
      expect(dup.content).toBe('world');
      expect(dup.filePath).toBeNull();
      expect(dup.isDirty).toBe(true);
      // The original is untouched.
      expect(store.tabs[0].filePath).toBe('/tmp/note.md');
      expect(store.tabs[0].isDirty).toBe(false);
    });

    it('never leaves two tabs pointing at one file', () => {
      const store = useEditorStore();
      store.loadFile('world', '/tmp/note.md');
      store.duplicateTab(store.activeTabId);
      const paths = store.tabs.map((t) => t.filePath).filter(Boolean);
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('keeps an empty duplicate clean', () => {
      const store = useEditorStore();
      const dup = store.duplicateTab(store.activeTabId);
      expect(store.tabs.find((t) => t.id === dup)?.isDirty).toBe(false);
    });

    it('can duplicate a non-active tab', () => {
      const store = useEditorStore();
      const a = store.activeTabId;
      store.addTab({ content: 'b' });
      const b = store.activeTabId;
      store.setActiveTab(a);
      store.duplicateTab(b);
      // [a, b, dup-of-b]
      expect(store.tabs[1].id).toBe(b);
      expect(store.tabs[2].content).toBe('b');
    });
  });

  describe('moveTab', () => {
    it('moves a tab before the target', () => {
      const store = useEditorStore();
      const a = store.activeTabId;
      const b = store.addTab();
      const c = store.addTab();
      // [a, b, c] → move c before a → [c, a, b]
      store.moveTab(c, a);
      expect(store.tabs.map((t) => t.id)).toEqual([c, a, b]);
    });

    it('moves a tab to end when beforeId not found', () => {
      const store = useEditorStore();
        const a = store.activeTabId;
        const b = store.addTab();
        const c = store.addTab();
        // [a, b, c] → move a before 'nonexistent' → [b, c, a]
      store.moveTab(a, 'nonexistent');
      expect(store.tabs.map((t) => t.id)).toEqual([b, c, a]);
    });
  });
});
