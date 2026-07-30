import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { hasPendingSave, flushPendingSave, useAutoSave } from './useAutoSave';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';

describe('hasPendingSave', () => {
  it('returns false initially', () => {
    expect(hasPendingSave()).toBe(false);
  });
});

describe('flushPendingSave', () => {
  it('returns false when nothing is pending', async () => {
    const result = await flushPendingSave();
    expect(result).toBe(false);
  });
});

describe('flushPendingSave with a write in flight', () => {
  let scope: ReturnType<typeof effectScope>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    // useAutoSave registers onUnmounted; outside a component Vue only warns.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    warn.mockRestore();
  });

  /** Enables auto-save, installs the composable, and dirties a file-backed tab
   *  so one debounced save is pending. */
  async function pendingEdit(): Promise<void> {
    const settings = useSettingsStore();
    settings.setAutoSave(true);
    const store = useEditorStore();
    store.loadFile('original', '/tmp/note.md');
    scope.run(() => useAutoSave(store));
    store.updateContent('edited');
    await nextTick();
    expect(hasPendingSave()).toBe(true);
  }

  // Every destructive action (closing a window, switching or closing a tab,
  // opening another document) awaits flushPendingSave and then reads isDirty.
  // Returning false while the write was still in the air let those flows act on
  // stale state — e.g. the close path skipping the unsaved-changes prompt.
  it('joins the running flush instead of reporting "nothing to do"', async () => {
    let releaseWrite: () => void = () => {};
    const writeStarted = new Promise<void>((resolveStarted) => {
      vi.mocked(writeTextFile).mockImplementation(() => new Promise<void>((resolveWrite) => {
        resolveStarted();
        releaseWrite = () => resolveWrite();
      }));
    });

    await pendingEdit();

    const first = flushPendingSave();
    await writeStarted; // the write is now in flight, `pending` already drained
    const second = flushPendingSave();

    releaseWrite();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(useEditorStore().isDirty).toBe(false);
  });

  it('picks up an edit made while the previous write was in flight', async () => {
    const writes: [string, string][] = [];
    let releaseFirstWrite: () => void = () => {};
    const firstWriteStarted = new Promise<void>((resolveStarted) => {
      vi.mocked(writeTextFile).mockImplementation(async (path: string | URL, content: string) => {
        writes.push([String(path), content]);
        if (writes.length === 1) {
          resolveStarted();
          await new Promise<void>((resolveWrite) => { releaseFirstWrite = () => resolveWrite(); });
        }
      });
    });

    await pendingEdit();
    const store = useEditorStore();

    const flush = flushPendingSave();
    await firstWriteStarted;

    // A keystroke lands while the first write is still open.
    store.updateContent('edited again');
    await nextTick();
    releaseFirstWrite();

    expect(await flush).toBe(true);
    expect(writes.map(([, content]) => content)).toEqual(['edited', 'edited again']);
    expect(hasPendingSave()).toBe(false);
    expect(store.isDirty).toBe(false);
  });
});
