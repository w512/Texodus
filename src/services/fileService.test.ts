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
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  saveFile,
  saveFileAs,
  newFile,
  closeFile,
  requestNewDocument,
  requestOpenDocument,
  requestOpenFromPath,
  requestNavigateToPath,
  requestOpenInNewWindow,
} from './fileService';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
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

describe('requestOpenFromPath (scope-denied recovery)', () => {
  const SCOPE_ERROR = new Error('forbidden path: /tmp/old.md');

  it('offers the dialog and opens the picked file after a scope denial', async () => {
    const store = useEditorStore();
    useSettingsStore().setDocumentMode('tabs');
    mockedReadTextFile.mockRejectedValueOnce(SCOPE_ERROR);
    mockedReadTextFile.mockResolvedValueOnce('recovered');
    vi.mocked(confirm).mockResolvedValue(true);
    setMockInvoke('pick_document', () => '/tmp/old.md');

    await requestOpenFromPath(store, '/tmp/old.md');

    expect(invoke).toHaveBeenCalledWith('pick_document', { startIn: '/tmp/old.md' });
    expect(store.content).toBe('recovered');
    expect(store.filePath).toBe('/tmp/old.md');
  });

  it('stops when the user declines the recovery prompt', async () => {
    const store = useEditorStore();
    useSettingsStore().setDocumentMode('tabs');
    mockedReadTextFile.mockRejectedValueOnce(SCOPE_ERROR);
    vi.mocked(confirm).mockResolvedValue(false);

    await requestOpenFromPath(store, '/tmp/old.md');

    expect(invoke).not.toHaveBeenCalledWith('pick_document', expect.anything());
    expect(store.filePath).toBeNull();
  });

  it('shows the plain error dialog for non-scope failures', async () => {
    const store = useEditorStore();
    useSettingsStore().setDocumentMode('tabs');
    mockedReadTextFile.mockRejectedValueOnce(new Error('Disk I/O error'));

    await requestOpenFromPath(store, '/tmp/broken.md');

    expect(confirm).not.toHaveBeenCalled();
    expect(message).toHaveBeenCalled();
  });

  it('removes a missing file from recents after an open failure', async () => {
    const store = useEditorStore();
    const settings = useSettingsStore();
    settings.setDocumentMode('tabs');
    settings.addRecentFile('/tmp/gone.md');
    mockedReadTextFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    await requestOpenFromPath(store, '/tmp/gone.md');

    expect(settings.recentFiles).not.toContain('/tmp/gone.md');
    expect(message).toHaveBeenCalled();
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

  it('focuses the window that already has the picked file instead of duplicating', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    setMockInvoke('pick_document', () => '/tmp/elsewhere.md');
    setMockInvoke('focus_window_with_path', () => true);
    await requestOpenDocument(store);
    expect(invoke).not.toHaveBeenCalledWith('open_new_window', expect.anything());
    expect(store.filePath).toBe('/tmp/existing.md');
  });
});

describe('requestNavigateToPath (windows mode)', () => {
  it('replaces the document in place instead of opening a new window', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    mockedReadTextFile.mockResolvedValue('sidebar file');

    await requestNavigateToPath(store, '/tmp/side.md');

    expect(store.filePath).toBe('/tmp/side.md');
    expect(store.content).toBe('sidebar file');
    expect(invoke).not.toHaveBeenCalledWith('open_new_window', expect.anything());
  });

  it('runs the unsaved prompt before replacing a dirty document', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    store.updateContent('modified');
    mockedReadTextFile.mockResolvedValue('next');

    await requestNavigateToPath(store, '/tmp/next.md');

    expect(promptUnsavedChanges).toHaveBeenCalled();
    expect(store.filePath).toBe('/tmp/next.md'); // module mock resolves 'discard'
  });

  it('keeps the dirty document when the user cancels the prompt', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    store.updateContent('modified');
    vi.mocked(promptUnsavedChanges).mockResolvedValueOnce('cancel');

    await requestNavigateToPath(store, '/tmp/next.md');

    expect(store.filePath).toBe('/tmp/existing.md');
    expect(store.content).toBe('modified');
  });

  it('focuses the other window when the file is already open there', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');
    setMockInvoke('focus_window_with_path', () => true);

    await requestNavigateToPath(store, '/tmp/elsewhere.md');

    expect(store.filePath).toBe('/tmp/existing.md');
    expect(mockedReadTextFile).not.toHaveBeenCalled();
  });

  it('does nothing when the path is already the current document', async () => {
    const store = useEditorStore();
    store.loadFile('existing', '/tmp/existing.md');

    await requestNavigateToPath(store, '/tmp/existing.md');

    expect(mockedReadTextFile).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('focus_window_with_path', expect.anything());
  });
});

describe('requestNavigateToPath (tabs mode)', () => {
  it('opens the file as a tab', async () => {
    const store = useEditorStore();
    useSettingsStore().setDocumentMode('tabs');
    store.loadFile('first', '/tmp/a.md');
    mockedReadTextFile.mockResolvedValue('second');

    await requestNavigateToPath(store, '/tmp/b.md');

    expect(store.tabCount).toBe(2);
    expect(store.filePath).toBe('/tmp/b.md');
  });
});

describe('requestOpenInNewWindow', () => {
  it('opens a new window with the path', async () => {
    await requestOpenInNewWindow('/tmp/a.md');
    expect(invoke).toHaveBeenCalledWith('open_new_window', { path: '/tmp/a.md' });
  });

  it('focuses the existing window instead of duplicating the file', async () => {
    setMockInvoke('focus_window_with_path', () => true);
    await requestOpenInNewWindow('/tmp/a.md');
    expect(invoke).not.toHaveBeenCalledWith('open_new_window', expect.anything());
  });

  it('shows an error dialog when window creation fails', async () => {
    setMockInvoke('open_new_window', () => {
      throw new Error('boom');
    });
    await requestOpenInNewWindow('/tmp/a.md');
    expect(message).toHaveBeenCalled();
  });
});