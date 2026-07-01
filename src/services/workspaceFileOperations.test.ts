import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { rename, remove } from '@tauri-apps/plugin-fs';
import { message } from '@tauri-apps/plugin-dialog';
import { setMockFile } from '../mock-tauri';
import { useEditorStore } from '../stores/editor';
import type { FileTreeNode } from '../stores/workspace';
import { deleteWorkspaceNode, renameWorkspaceNode } from './workspaceFileOperations';

// Never render the unsaved-changes modal in tests; the flows under test use
// clean tabs, so this is only a safety net.
vi.mock('../composables/useUnsavedPrompt', () => ({
  promptUnsavedChanges: vi.fn().mockResolvedValue('discard'),
}));

function fileNode(path: string): FileTreeNode {
  return { path, name: path.split('/').pop() ?? path, kind: 'file' };
}

function dirNode(path: string): FileTreeNode {
  return { path, name: path.split('/').pop() ?? path, kind: 'directory' };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('deleteWorkspaceNode — P2: resets every affected tab', () => {
  it('clears all tabs inside the deleted folder, leaving others intact', async () => {
    const store = useEditorStore();
    store.loadFile('a', '/ws/folder/a.md');                                 // active tab
    const idB = store.addTab({ content: 'b', filePath: '/ws/folder/sub/b.md' });
    const idC = store.addTab({ content: 'c', filePath: '/ws/other/c.md' });
    const idA = store.tabs.find((t) => t.filePath === '/ws/folder/a.md')!.id;

    await deleteWorkspaceNode(dirNode('/ws/folder'));

    expect(vi.mocked(remove)).toHaveBeenCalledWith('/ws/folder', { recursive: true });

    const tabA = store.tabs.find((t) => t.id === idA)!;
    const tabB = store.tabs.find((t) => t.id === idB)!;
    const tabC = store.tabs.find((t) => t.id === idC)!;

    expect(tabA.filePath).toBeNull();
    expect(tabA.content).toBe('');
    expect(tabB.filePath).toBeNull();
    expect(tabB.content).toBe('');

    // The tab outside the deleted folder is untouched.
    expect(tabC.filePath).toBe('/ws/other/c.md');
    expect(tabC.content).toBe('c');
  });
});

describe('renameWorkspaceNode — P3: case-only rename', () => {
  it('proceeds with a case-only rename instead of reporting a conflict', async () => {
    setMockFile('/ws/foo.md', 'x');

    await renameWorkspaceNode(fileNode('/ws/foo.md'), 'Foo.md');

    expect(vi.mocked(rename)).toHaveBeenCalledWith('/ws/foo.md', '/ws/Foo.md');
    expect(vi.mocked(message)).not.toHaveBeenCalled();
  });

  it('still blocks a rename onto a different existing file', async () => {
    setMockFile('/ws/foo.md', 'x');
    setMockFile('/ws/bar.md', 'y');

    await renameWorkspaceNode(fileNode('/ws/foo.md'), 'bar.md');

    expect(vi.mocked(rename)).not.toHaveBeenCalled();
    expect(vi.mocked(message)).toHaveBeenCalled();
  });
});
