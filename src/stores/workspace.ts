import { defineStore } from 'pinia';
import { type FileTreeNode, findNode } from '../utils/workspaceTree';
import { normalizePath } from '../utils/path';

export type { FileTreeNode };

interface WorkspaceState {
  rootPath: string | null;
  tree: FileTreeNode[];
  expandedPaths: string[];
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    rootPath: null,
    tree: [],
    expandedPaths: [],
    selectedPath: null,
    isLoading: false,
    error: null,
  }),
  getters: {
    isExpanded: (state) => (path: string) => state.expandedPaths.includes(path),
  },
  actions: {
    setWorkspace(rootPath: string, tree: FileTreeNode[]) {
      const isSameWorkspace = this.rootPath === rootPath;
      this.rootPath = rootPath;
      this.tree = tree;
      this.error = null;

      if (!isSameWorkspace) {
        this.expandedPaths = [rootPath];
      } else if (!this.expandedPaths.includes(rootPath)) {
        this.expandedPaths.push(rootPath);
      }
    },
    setTree(tree: FileTreeNode[]) {
      this.tree = tree;
    },
    setDirectoryChildren(path: string, children: FileTreeNode[]) {
      const node = findNode(this.tree, path);
      if (node && node.kind === 'directory') node.children = children;
    },
    setSelectedPath(path: string | null) {
      this.selectedPath = path;
    },
    setLoading(value: boolean) {
      this.isLoading = value;
    },
    setError(message: string | null) {
      this.error = message;
    },
    toggleExpanded(path: string) {
      if (this.expandedPaths.includes(path)) {
        this.expandedPaths = this.expandedPaths.filter((p) => p !== path);
      } else {
        this.expandedPaths.push(path);
      }
    },
    expandPath(path: string) {
      if (!this.expandedPaths.includes(path)) this.expandedPaths.push(path);
    },
    /** Drops `path` and every expanded path inside it (delete flows). */
    removeExpandedPathPrefix(path: string) {
      const normalizedPath = normalizePath(path);
      const prefix = `${normalizedPath}/`;
      this.expandedPaths = this.expandedPaths.filter((p) => {
        const normalized = normalizePath(p);
        return normalized !== normalizedPath && !normalized.startsWith(prefix);
      });
    },
    /** Rewrites `oldPath` (and every expanded path inside it) to live under
     *  `newPath` — rename/move flows. */
    replaceExpandedPathPrefix(oldPath: string, newPath: string) {
      const oldNormalized = normalizePath(oldPath);
      const newNormalized = normalizePath(newPath);
      const oldPrefix = `${oldNormalized}/`;
      this.expandedPaths = this.expandedPaths.map((p) => {
        const normalized = normalizePath(p);
        if (normalized === oldNormalized) return newPath;
        if (normalized.startsWith(oldPrefix)) return newNormalized + normalized.slice(oldNormalized.length);
        return p;
      });
    },
    reset() {
      this.rootPath = null;
      this.tree = [];
      this.expandedPaths = [];
      this.selectedPath = null;
      this.isLoading = false;
      this.error = null;
    },
  },
});
