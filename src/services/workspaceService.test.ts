import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { readDir, type DirEntry } from '@tauri-apps/plugin-fs';
import {
  loadWorkspaceTree,
  loadWorkspaceDirectoryChildren,
  refreshWorkspaceTree,
  refreshWorkspaceTreeIfPathInside,
  expandAndLoadParentDirectories,
  openRememberedWorkspaceFolder,
} from './workspaceService';
import { useWorkspaceStore, WORKSPACE_UI_STORAGE_KEY } from '../stores/workspace';
import { useSettingsStore } from '../stores/settings';

const mockedReadDir = vi.mocked(readDir);

function entry(name: string, isDirectory: boolean): DirEntry {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('loadWorkspaceTree', () => {
  it('builds a sorted tree with directories first', async () => {
    mockedReadDir.mockResolvedValue([
      entry('z.md', false),
      entry('docs', true),
      entry('a.md', false),
    ]);
    const tree = await loadWorkspaceTree('/root');
    expect(tree).toHaveLength(3);
    // directories come first, then files alphabetically
    expect(tree[0].name).toBe('docs');
    expect(tree[0].kind).toBe('directory');
    expect(tree[1].name).toBe('a.md');
    expect(tree[2].name).toBe('z.md');
  });

  it('filters to md, markdown, txt extensions only', async () => {
    mockedReadDir.mockResolvedValue([
      entry('note.md', false),
      entry('note.MARKDOWN', false),
      entry('readme.txt', false),
      entry('image.png', false),
      entry('script.js', false),
    ]);
    const tree = await loadWorkspaceTree('/root');
    expect(tree).toHaveLength(3);
    expect(tree.map((n) => n.name).sort()).toEqual(['note.MARKDOWN', 'note.md', 'readme.txt']);
  });

  it('skips hidden and ignored directories', async () => {
    mockedReadDir.mockResolvedValue([
      entry('.hidden', true),
      entry('.git', true),
      entry('node_modules', true),
      entry('docs', true),
    ]);
    const tree = await loadWorkspaceTree('/root');
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('docs');
  });

  it('creates directory nodes without children (lazy loading)', async () => {
    mockedReadDir.mockResolvedValue([entry('docs', true)]);
    const tree = await loadWorkspaceTree('/root');
    expect(tree[0].children).toBeUndefined();
  });

  it('uses forward-slash paths via resolveLocalPath', async () => {
    mockedReadDir.mockResolvedValue([entry('a.md', false)]);
    const tree = await loadWorkspaceTree('/root');
    expect(tree[0].path).toBe('/root/a.md');
  });
});

describe('remembered workspace restore', () => {
  it('quietly restores the tree, expanded directories, and selection', async () => {
    useSettingsStore().setLastWorkspacePath('/root');
    localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify({
      rootPath: '/root',
      expandedPaths: ['/root', '/root/docs', '/root/docs/sub'],
      selectedPath: '/root/docs/sub/note.md',
    }));
    mockedReadDir.mockImplementation(async (path) => {
      if (path === '/root') return [entry('docs', true)];
      if (path === '/root/docs') return [entry('sub', true)];
      if (path === '/root/docs/sub') return [entry('note.md', false)];
      return [];
    });

    await openRememberedWorkspaceFolder(true);

    const store = useWorkspaceStore();
    expect(store.rootPath).toBe('/root');
    expect(store.expandedPaths).toEqual(['/root', '/root/docs', '/root/docs/sub']);
    expect(store.selectedPath).toBe('/root/docs/sub/note.md');
    expect(store.tree[0].children?.[0].children?.[0].name).toBe('note.md');
  });

  it('leaves the sidebar empty without a startup error when restore fails', async () => {
    useSettingsStore().setLastWorkspacePath('/missing');
    mockedReadDir.mockRejectedValue(new Error('Folder not found'));

    await openRememberedWorkspaceFolder(true);

    const store = useWorkspaceStore();
    expect(store.rootPath).toBeNull();
    expect(store.error).toBeNull();
    expect(store.isLoading).toBe(false);
  });
});

describe('loadWorkspaceDirectoryChildren', () => {
  it('sets children on the directory node in the store', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', [
      { name: 'root', path: '/root', kind: 'directory', children: [
        { name: 'docs', path: '/root/docs', kind: 'directory' },
      ]},
    ]);
    mockedReadDir.mockResolvedValue([entry('b.md', false)]);
    await loadWorkspaceDirectoryChildren('/root/docs');
    const node = store.tree[0].children![0];
    expect(node.children).toHaveLength(1);
    expect(node.children![0].name).toBe('b.md');
  });

  it('does not reload if children are already loaded', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', [
      { name: 'root', path: '/root', kind: 'directory', children: [
        { name: 'docs', path: '/root/docs', kind: 'directory', children: [
          { name: 'existing.md', path: '/root/docs/existing.md', kind: 'file' },
        ]},
      ]},
    ]);
    await loadWorkspaceDirectoryChildren('/root/docs');
    expect(mockedReadDir).not.toHaveBeenCalled();
  });

  it('sets error on store when readDir throws', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', [
      { name: 'root', path: '/root', kind: 'directory', children: [
        { name: 'docs', path: '/root/docs', kind: 'directory' },
      ]},
    ]);
    mockedReadDir.mockRejectedValue(new Error('Permission denied'));
    await loadWorkspaceDirectoryChildren('/root/docs');
    expect(store.error).toBe('Permission denied');
  });
});

describe('refreshWorkspaceTree', () => {
  it('loads tree, sets workspace, and clears loading', async () => {
    mockedReadDir.mockResolvedValue([entry('a.md', false)]);
    await refreshWorkspaceTree('/root');
    const store = useWorkspaceStore();
    expect(store.rootPath).toBe('/root');
    expect(store.tree).toHaveLength(1);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('sets error and clears loading on failure', async () => {
    mockedReadDir.mockRejectedValue(new Error('Access denied'));
    await refreshWorkspaceTree('/root');
    const store = useWorkspaceStore();
    expect(store.error).toBe('Access denied');
    expect(store.isLoading).toBe(false);
  });

  it('does nothing without a rootPath argument or store rootPath', async () => {
    await refreshWorkspaceTree();
    expect(mockedReadDir).not.toHaveBeenCalled();
  });

  it('raises the loading flag while a foreground refresh is in flight', async () => {
    const store = useWorkspaceStore();
    let release: (() => void) | undefined;
    mockedReadDir.mockReturnValue(new Promise((resolve) => {
      release = () => resolve([entry('a.md', false)]);
    }));

    const pending = refreshWorkspaceTree('/root');
    expect(store.isLoading).toBe(true);
    release!();
    await pending;
    expect(store.isLoading).toBe(false);
  });

  it('never raises the loading flag for a background refresh', async () => {
    const store = useWorkspaceStore();
    let release: (() => void) | undefined;
    mockedReadDir.mockReturnValue(new Promise((resolve) => {
      release = () => resolve([entry('a.md', false)]);
    }));

    const pending = refreshWorkspaceTree('/root', { background: true });
    expect(store.isLoading).toBe(false);
    release!();
    await pending;
    expect(store.isLoading).toBe(false);
    expect(store.tree).toHaveLength(1);
  });

  it('leaves a concurrent foreground refresh loading when a background one finishes', async () => {
    const store = useWorkspaceStore();
    store.setLoading(true);
    mockedReadDir.mockResolvedValue([entry('a.md', false)]);

    await refreshWorkspaceTree('/root', { background: true });

    expect(store.isLoading).toBe(true);
  });
});

describe('refreshWorkspaceTreeIfPathInside', () => {
  it('refreshes when path is inside the workspace root', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', [
      { name: 'root', path: '/root', kind: 'directory', children: [
        { name: 'a.md', path: '/root/a.md', kind: 'file' },
      ]},
    ]);
    mockedReadDir.mockResolvedValue([]);
    await refreshWorkspaceTreeIfPathInside('/root/docs/new.md');
    expect(store.selectedPath).toBe('/root/docs/new.md');
  });

  it('does nothing when path is outside the workspace', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', []);
    mockedReadDir.mockResolvedValue([]);
    await refreshWorkspaceTreeIfPathInside('/other/file.md');
    expect(mockedReadDir).not.toHaveBeenCalled();
  });

  it('does nothing when no workspace is open', async () => {
    await refreshWorkspaceTreeIfPathInside('/anywhere/file.md');
    expect(mockedReadDir).not.toHaveBeenCalled();
  });
});

describe('expandAndLoadParentDirectories', () => {
  it('expands all parent directories from root to the file parent', async () => {
    const store = useWorkspaceStore();
    store.setWorkspace('/root', [
      { name: 'root', path: '/root', kind: 'directory', children: [
        { name: 'docs', path: '/root/docs', kind: 'directory', children: [
          { name: 'sub', path: '/root/docs/sub', kind: 'directory' },
        ]},
      ]},
    ]);
    mockedReadDir.mockResolvedValue([]);
    await expandAndLoadParentDirectories('/root/docs/sub/file.md', '/root');
    expect(store.expandedPaths).toContain('/root');
    expect(store.expandedPaths).toContain('/root/docs');
    expect(store.expandedPaths).toContain('/root/docs/sub');
  });
});