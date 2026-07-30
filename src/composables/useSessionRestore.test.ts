import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setMockFile } from '../mock-tauri';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { parseSavedSession, restoreSession, saveSession } from './useSessionRestore';

const SESSION_KEY = 'texodus.session.tabs.v1';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

function enableTabSessions(): void {
  useSettingsStore().setDocumentMode('tabs');
}

describe('session restore', () => {
  it('persists only saved tabs and remembers the active file', () => {
    enableTabSessions();
    const store = useEditorStore();
    store.loadFile('a', '/docs/a.md');
    store.addTab({ content: 'draft', filePath: null, isDirty: true });
    store.addTab({ content: 'b', filePath: '/docs/b.md', isDirty: false });

    saveSession(store);

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
      tabs: [{ filePath: '/docs/a.md' }, { filePath: '/docs/b.md' }],
      activeFilePath: '/docs/b.md',
    });
  });

  it('restores readable files, skips missing files, and reactivates the saved tab', async () => {
    enableTabSessions();
    setMockFile('/docs/a.md', 'A');
    setMockFile('/docs/b.md', 'B');
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      tabs: [
        { filePath: '/docs/missing.md' },
        { filePath: '/docs/a.md' },
        { filePath: '/docs/b.md' },
      ],
      activeFilePath: '/docs/a.md',
    }));
    const store = useEditorStore();

    await restoreSession(store);

    expect(store.tabs.map((tab) => [tab.filePath, tab.content])).toEqual([
      ['/docs/a.md', 'A'],
      ['/docs/b.md', 'B'],
    ]);
    expect(store.filePath).toBe('/docs/a.md');
  });

  it('does nothing outside main-window tabs mode', async () => {
    setMockFile('/docs/a.md', 'A');
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      tabs: [{ filePath: '/docs/a.md' }],
      activeFilePath: '/docs/a.md',
    }));
    const store = useEditorStore();

    await restoreSession(store);

    expect(store.filePath).toBeNull();
  });

  it('validates persisted JSON instead of trusting its shape', () => {
    expect(parseSavedSession('{bad')).toBeNull();
    expect(parseSavedSession('{"tabs":{}}')).toBeNull();
    expect(parseSavedSession(JSON.stringify({
      tabs: [{ filePath: '/ok.md' }, {}, { filePath: 7 }, { filePath: '' }],
      activeFilePath: 7,
    }))).toEqual({ tabs: [{ filePath: '/ok.md' }], activeFilePath: null });
  });
});
