import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setMockInvoke } from '../mock-tauri';

// Mock workspaceService (non-Tauri dep)
vi.mock('./workspaceService', () => ({
  refreshWorkspaceTreeIfPathInside: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../composables/useUnsavedPrompt', () => ({
  promptUnsavedChanges: vi.fn().mockResolvedValue('discard'),
}));

import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { message } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  saveFile,
  saveFileAs,
  newFile,
  closeFile,
  requestNewDocument,
  requestOpenDocument,
  requestOpenFromPath,
} from './fileService';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';

const mockedReadTextFile = vi.mocked(readTextFile);
const mockedWriteTextFile = vi.mocked(writeTextFile);

beforeEach(() => {
  setActivePinia(createPinia());
});

// Open/Save dialogs are Rust commands (`pick_document` / `pick_save_path`)
// so the pick can grant fs/asset scope; tests stub them via setMockInvoke.
// The default mock invoke resolves `undefined` for unset commands = cancel.

describe('saveFile', () => {
  it('writes content to the existing file path and clears dirty', async () => {
    const store = useEditorStore();
    store.loadFile('content', '/tmp/note.md');
    store.updateContent('modified');

    const result = await saveFile(store);
    expect(result).toBe(true);
    expect(mockedWriteTextFile).toHaveBeenCalledWith('/tmp/note.md', 'modified');
    expect(store.isDirty).toBe(false);
  });

  it('falls back to saveFileAs when no file path is set', async () => {
    const store = useEditorStore();
    store.updateContent('new content');

    setMockInvoke('pick_save_path', () => '/tmp/saved.md');
    const result = await saveFile(store);
    expect(result).toBe(true);
    expect(invoke).toHaveBeenCalledWith('pick_save_path', expect.anything());
    expect(mockedWriteTextFile).toHaveBeenCalledWith('/tmp/saved.md', 'new content');
    expect(store.filePath).toBe('/tmp/saved.md');
  });

  it('returns false when saveAs dialog is cancelled', async () => {
    const store = useEditorStore();
    store.updateContent('content');

    setMockInvoke('pick_save_path', () => null);
    const result = await saveFile(store);
    expect(result).toBe(false);
    expect(mockedWriteTextFile).not.toHaveBeenCalled();
  });
});

describe('saveFileAs', () => {
  it('saves to the chosen path and updates store', async () => {
    const store = useEditorStore();
    store.updateContent('hello');

    setMockInvoke('pick_save_path', () => '/tmp/new.md');
    const result = await saveFileAs(store);
    expect(result).toBe(true);
    expect(mockedWriteTextFile).toHaveBeenCalledWith('/tmp/new.md', 'hello');
    expect(store.filePath).toBe('/tmp/new.md');
    expect(store.isDirty).toBe(false);
  });

  it('returns false when user cancels', async () => {
    const store = useEditorStore();
    setMockInvoke('pick_save_path', () => null);
    const result = await saveFileAs(store);
    expect(result).toBe(false);
  });

  it('shows error dialog on write failure', async () => {
    const store = useEditorStore();
    store.updateContent('data');
    setMockInvoke('pick_save_path', () => '/tmp/fail.md');
    mockedWriteTextFile.mockRejectedValue(new Error('Disk full'));
    const result = await saveFileAs(store);
    expect(result).toBe(false);
    expect(message).toHaveBeenCalled();
  });
});

describe('newFile', () => {
  it('resets the store after confirming', async () => {
    const store = useEditorStore();
    store.loadFile('content', '/tmp/a.md');
    await newFile(store);
    expect(store.content).toBe('');
    expect(store.filePath).toBeNull();
  });
});

describe('closeFile', () => {
  it('resets the store after confirming', async () => {
    const store = useEditorStore();
    store.loadFile('content', '/tmp/a.md');
    await closeFile(store);
    expect(store.content).toBe('');
    expect(store.filePath).toBeNull();
  });
});

describe('requestNewDocument (windows mode)', () => {
  it('invokes open_new_window in windows mode', async () => {
    const store = useEditorStore();
    // windows mode is the default
    await requestNewDocument(store);
    expect(invoke).toHaveBeenCalledWith('open_new_window');
  });

  it('shows error dialog when invoke fails', async () => {
    const store = useEditorStore();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Window creation failed'));
    await requestNewDocument(store);
    expect(message).toHaveBeenCalled();
  });
});

describe('requestNewDocument (tabs mode)', () => {
  it('adds a tab in tabs mode', async () => {
    const store = useEditorStore();
    const settings = useSettingsStore();
    settings.setDocumentMode('tabs');
    const initialCount = store.tabCount;
    await requestNewDocument(store);
    expect(store.tabCount).toBe(initialCount + 1);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('requestOpenFromPath (tabs mode)', () => {
  it('focuses the existing tab instead of opening a duplicate', async () => {
    const store = useEditorStore();
    const settings = useSettingsStore();
    settings.setDocumentMode('tabs');
    store.loadFile('first', '/tmp/a.md');
    const firstId = store.activeTabId;
    store.addTab({ content: 'second', filePath: '/tmp/b.md', isDirty: false });

    await requestOpenFromPath(store, '/tmp/a.md');

    expect(store.tabCount).toBe(2);
    expect(store.activeTabId).toBe(firstId);
    expect(mockedReadTextFile).not.toHaveBeenCalled();
  });

  it('opens a new tab for a path that is not open yet', async () => {
    const store = useEditorStore();
    const settings = useSettingsStore();
    settings.setDocumentMode('tabs');
    store.loadFile('first', '/tmp/a.md');
    mockedReadTextFile.mockResolvedValue('new content');

    await requestOpenFromPath(store, '/tmp/c.md');

    expect(store.tabCount).toBe(2);
    expect(store.filePath).toBe('/tmp/c.md');
    expect(store.content).toBe('new content');
  });
});

describe('requestOpenDocument (windows mode)', () => {
  it('opens file directly when current document is empty', async () => {
    const store = useEditorStore();
    setMockInvoke('pick_document', () => '/tmp/open.md');
    mockedReadTextFile.mockResolvedValue('file content');
    await requestOpenDocument(store);
    expect(store.content).toBe('file content');
    expect(store.filePath).toBe('/tmp/open.md');
  });

  it('does nothing when the dialog is cancelled', async () => {
    const store = useEditorStore();
    setMockInvoke('pick_document', () => null);
    await requestOpenDocument(store);
    expect(mockedReadTextFile).not.toHaveBeenCalled();
  });

  it('opens new window with path when current document is dirty', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    store.updateContent('modified');
    setMockInvoke('pick_document', () => '/tmp/other.md');
    await requestOpenDocument(store);
    expect(invoke).toHaveBeenCalledWith('open_new_window', { path: '/tmp/other.md' });
  });

  it('shows error when open_new_window fails with a path', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    store.updateContent('modified');
    setMockInvoke('pick_document', () => '/tmp/other.md');
    setMockInvoke('open_new_window', () => {
      throw new Error('Failed');
    });
    await requestOpenDocument(store);
    expect(message).toHaveBeenCalled();
  });
});