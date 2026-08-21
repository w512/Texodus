import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkspaceStore, WORKSPACE_UI_STORAGE_KEY } from './workspace';
import type { FileTreeNode } from '../utils/workspaceTree';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

function makeTree(): FileTreeNode[] {
  return [
    { name: 'root', path: '/root', kind: 'directory', children: [
      { name: 'a.md', path: '/root/a.md', kind: 'file' },
      { name: 'docs', path: '/root/docs', kind: 'directory', children: [
        { name: 'b.md', path: '/root/docs/b.md', kind: 'file' },
      ]},
    ]},
  ];
}

describe('workspace store', () => {
  it('starts empty', () => {
    const store = useWorkspaceStore();
    expect(store.rootPath).toBeNull();
    expect(store.tree).toEqual([]);
    expect(store.expandedPaths).toEqual([]);
    expect(store.selectedPath).toBeNull();
    expect(store.documentTitles).toEqual({});
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  describe('setWorkspace', () => {
    it('sets root, tree, clears error, and expands root', () => {
      const store = useWorkspaceStore();
      store.setError('old error');
      store.setWorkspace('/root', makeTree());
      expect(store.rootPath).toBe('/root');
      expect(store.tree).toHaveLength(1);
      expect(store.error).toBeNull();
      expect(store.expandedPaths).toEqual(['/root']);
    });

    it('re-expanding same workspace keeps existing expanded paths', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.expandPath('/root/docs');
      store.setWorkspace('/root', makeTree());
      expect(store.expandedPaths).toContain('/root');
      expect(store.expandedPaths).toContain('/root/docs');
    });

    it('switching to a different workspace resets expanded paths to root only', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.expandPath('/root/docs');
      store.setWorkspace('/other', []);
      expect(store.expandedPaths).toEqual(['/other']);
    });
  });

  describe('UI state persistence', () => {
    it('restores expanded and selected paths when reopening the same workspace', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.expandPath('/root/docs');
      store.setSelectedPath('/root/docs/b.md');

      setActivePinia(createPinia());
      const restored = useWorkspaceStore();
      restored.setWorkspace('/root', makeTree());

      expect(restored.expandedPaths).toEqual(['/root', '/root/docs']);
      expect(restored.selectedPath).toBe('/root/docs/b.md');
    });

    it('ignores persisted paths outside the workspace and malformed payloads', () => {
      localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify({
        rootPath: '/root',
        expandedPaths: ['/root/docs', '/other/private'],
        selectedPath: '/other/private.md',
      }));
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      expect(store.expandedPaths).toEqual(['/root', '/root/docs']);
      expect(store.selectedPath).toBeNull();

      setActivePinia(createPinia());
      localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, '{bad');
      const malformed = useWorkspaceStore();
      malformed.setWorkspace('/root', makeTree());
      expect(malformed.expandedPaths).toEqual(['/root']);
    });

    it('does not apply UI state saved for a different workspace', () => {
      localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify({
        rootPath: '/old',
        expandedPaths: ['/old/docs'],
        selectedPath: '/old/docs/a.md',
      }));
      const store = useWorkspaceStore();
      store.setWorkspace('/new', []);
      expect(store.expandedPaths).toEqual(['/new']);
      expect(store.selectedPath).toBeNull();
    });
  });

  describe('toggleExpanded', () => {
    it('adds a path when not expanded', () => {
      const store = useWorkspaceStore();
      store.toggleExpanded('/foo');
      expect(store.expandedPaths).toContain('/foo');
      expect(store.isExpanded('/foo')).toBe(true);
    });

    it('removes a path when already expanded', () => {
      const store = useWorkspaceStore();
      store.toggleExpanded('/foo');
      store.toggleExpanded('/foo');
      expect(store.expandedPaths).not.toContain('/foo');
      expect(store.isExpanded('/foo')).toBe(false);
    });
  });

  describe('expandPath', () => {
    it('adds a path only once', () => {
      const store = useWorkspaceStore();
      store.expandPath('/foo');
      store.expandPath('/foo');
      expect(store.expandedPaths.filter((p) => p === '/foo')).toHaveLength(1);
    });
  });

  describe('document titles', () => {
    it('stores titles and clears them when switching workspaces', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.setDocumentTitle('/root/a.md', 'Alpha');
      expect(store.documentTitles['/root/a.md']).toBe('Alpha');
      store.setWorkspace('/other', []);
      expect(store.documentTitles).toEqual({});
    });
  });

  describe('setDirectoryChildren', () => {
    it('sets children on an existing directory node', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      const children: FileTreeNode[] = [
        { name: 'new.md', path: '/root/docs/new.md', kind: 'file' },
      ];
      store.setDirectoryChildren('/root/docs', children);
      const docsNode = store.tree[0].children![1];
      expect(docsNode.children).toEqual(children);
    });

    it('does nothing for a non-existent path', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      const original = JSON.stringify(store.tree);
      store.setDirectoryChildren('/nonexistent', [{ name: 'x', path: '/x', kind: 'file' }]);
      expect(JSON.stringify(store.tree)).toBe(original);
    });

    it('does nothing for a file node', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.setDirectoryChildren('/root/a.md', [{ name: 'x', path: '/x', kind: 'file' }]);
      // a.md is a file, children should not be set
      const fileNode = store.tree[0].children![0];
      expect(fileNode.children).toBeUndefined();
    });
  });

  describe('removeExpandedPathPrefix', () => {
    it('removes the exact path and all children', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.expandPath('/root/docs');
      store.expandPath('/root/docs/sub');
      store.expandPath('/root/other');
      store.removeExpandedPathPrefix('/root/docs');
      expect(store.expandedPaths).not.toContain('/root/docs');
      expect(store.expandedPaths).not.toContain('/root/docs/sub');
      expect(store.expandedPaths).toContain('/root');
      expect(store.expandedPaths).toContain('/root/other');
    });

    it('normalises backslashes', () => {
      const store = useWorkspaceStore();
      store.expandedPaths = ['C:\\docs', 'C:\\docs\\sub', 'C:\\other'];
      store.removeExpandedPathPrefix('C:\\docs');
      expect(store.expandedPaths).toEqual(['C:\\other']);
    });
  });

  describe('replaceExpandedPathPrefix', () => {
    it('replaces exact match and rewrites child prefixes', () => {
      const store = useWorkspaceStore();
      store.expandedPaths = ['/old', '/old/sub', '/old/sub/deep', '/unrelated'];
      store.replaceExpandedPathPrefix('/old', '/new');
      expect(store.expandedPaths).toContain('/new');
      expect(store.expandedPaths).toContain('/new/sub');
      expect(store.expandedPaths).toContain('/new/sub/deep');
      expect(store.expandedPaths).toContain('/unrelated');
      expect(store.expandedPaths).not.toContain('/old');
    });

    it('normalises backslashes in both old and new', () => {
      const store = useWorkspaceStore();
      store.expandedPaths = ['C:\\old', 'C:\\old\\sub'];
      store.replaceExpandedPathPrefix('C:\\old', 'C:\\new');
      // exact match keeps newPath as-is; children use newNormalized (forward slashes)
      expect(store.expandedPaths).toContain('C:\\new');
      expect(store.expandedPaths).toContain('C:/new/sub');
    });
  });

  describe('reset', () => {
    it('clears everything', () => {
      const store = useWorkspaceStore();
      store.setWorkspace('/root', makeTree());
      store.expandPath('/root/docs');
      store.setSelectedPath('/root/a.md');
      store.setLoading(true);
      store.setError('err');
      store.reset();
      expect(store.rootPath).toBeNull();
      expect(store.tree).toEqual([]);
      expect(store.expandedPaths).toEqual([]);
      expect(store.selectedPath).toBeNull();
      expect(store.documentTitles).toEqual({});
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });
  });
});