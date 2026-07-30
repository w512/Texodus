import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { watch as watchFs, type WatchEvent } from '@tauri-apps/plugin-fs';
import { setMockFile } from '../mock-tauri';
import { useEditorStore, type Tab } from '../stores/editor';
import { mtimeValue, uniqueOpenPaths, useFileWatch, watchedDirectory } from './useFileWatch';
import { promptUnsavedChanges } from './useUnsavedPrompt';

vi.mock('./useUnsavedPrompt', () => ({
  promptUnsavedChanges: vi.fn(async () => 'discard'),
  whenPromptsIdle: vi.fn(async () => {}),
}));

function tab(id: string, filePath: string | null): Tab {
  return { id, filePath, content: '', isDirty: false };
}

beforeEach(() => setActivePinia(createPinia()));

describe('file watcher helpers', () => {
  it('deduplicates and sorts open paths using normalized spellings', () => {
    expect(uniqueOpenPaths([
      tab('a', 'C:\\Docs\\b.md'),
      tab('b', 'C:/Docs/b.md'),
      tab('c', '/notes/a.md'),
      tab('d', null),
    ])).toEqual(['/notes/a.md', 'C:\\Docs\\b.md']);
  });

  it('normalizes the parent directory watched for a file', () => {
    expect(watchedDirectory('C:\\Docs\\note.md')).toBe('C:/Docs');
    expect(watchedDirectory('/note.md')).toBe('/');
  });

  it('builds stable mtime fingerprint values across plugin representations', () => {
    expect(mtimeValue(new Date(1234))).toBe('1234');
    expect(mtimeValue(1234)).toBe('1234');
    expect(mtimeValue('1970-01-01T00:00:01.234Z')).toBe('1234');
    expect(mtimeValue(null)).toBe('no-mtime');
  });
});

describe('useFileWatch', () => {
  async function mountWatcher(content: string, dirty: boolean) {
    const store = useEditorStore();
    store.loadFile(content, '/docs/note.md');
    store.setDirty(dirty);

    let emitWatchEvent: ((event: WatchEvent) => void) | null = null;
    const unwatch = vi.fn();
    vi.mocked(watchFs).mockImplementation(async (_path, callback) => {
      emitWatchEvent = callback;
      return unwatch;
    });

    const Host = defineComponent({
      setup() {
        useFileWatch(store);
        return () => h('div');
      },
    });
    const wrapper = mount(Host);
    await flushPromises();
    if (!emitWatchEvent) throw new Error('watch callback was not installed');
    const emit = emitWatchEvent as (event: WatchEvent) => void;
    return { store, wrapper, unwatch, emitWatchEvent: emit };
  }

  it('reloads a clean tab after an external filesystem event and cleans up', async () => {
    setMockFile('/docs/note.md', 'changed on disk');
    const { store, wrapper, unwatch, emitWatchEvent } = await mountWatcher('old', false);

    emitWatchEvent({ type: 'any', paths: ['/docs/note.md'], attrs: {} } as WatchEvent);
    await flushPromises();

    expect(store.content).toBe('changed on disk');
    expect(store.isDirty).toBe(false);
    expect(promptUnsavedChanges).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(unwatch).toHaveBeenCalledOnce();
  });

  it('prompts before replacing a dirty tab and honors Reload', async () => {
    setMockFile('/docs/note.md', 'external');
    const { store, wrapper, emitWatchEvent } = await mountWatcher('local draft', true);

    emitWatchEvent({ type: 'any', paths: ['/docs/note.md'], attrs: {} } as WatchEvent);
    await flushPromises();

    expect(promptUnsavedChanges).toHaveBeenCalledWith(expect.objectContaining({
      title: 'File changed on disk',
      discardLabel: 'Reload',
    }));
    expect(store.content).toBe('external');
    expect(store.isDirty).toBe(false);
    wrapper.unmount();
  });
});
