import { defineStore } from 'pinia';
import { type FileTreeNode, findNode } from '../utils/workspaceTree';
import { isSameOrInside, normalizePath } from '../utils/path';

export type { FileTreeNode };

export const WORKSPACE_UI_STORAGE_KEY = 'texodus.workspace.ui.v1';

interface PersistedWorkspaceUi {
  rootPath: string;
  expandedPaths: string[];
  selectedPath: string | null;
}

interface WorkspaceState {
  rootPath: string | null;
  tree: FileTreeNode[];
  expandedPaths: string[];
  selectedPath: string | null;
  documentTitles: Record<string, string>;
  isLoading: boolean;
  error: string | null;
}

function loadWorkspaceUi(rootPath: string): Omit<PersistedWorkspaceUi, 'rootPath'> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_UI_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedWorkspaceUi>;
    if (typeof value.rootPath !== 'string' || normalizePath(value.rootPath) !== normalizePath(rootPath)) {
      return null;
    }

    const byNormalized = new Map<string, string>();
    byNormalized.set(normalizePath(rootPath), rootPath);
    if (Array.isArray(value.expandedPaths)) {
      for (const path of value.expandedPaths) {
        if (typeof path !== 'string' || !isSameOrInside(path, rootPath)) continue;
        byNormalized.set(normalizePath(path), path);
      }
    }
    const selectedPath = typeof value.selectedPath === 'string'
      && isSameOrInside(value.selectedPath, rootPath)
      ? value.selectedPath
      : null;
    return { expandedPaths: [...byNormalized.values()], selectedPath };
  } catch {
    return null;
  }
}

function persistWorkspaceUi(state: WorkspaceState): void {
  if (typeof localStorage === 'undefined' || !state.rootPath) return;
  const selectedPath = state.selectedPath && isSameOrInside(state.selectedPath, state.rootPath)
    ? state.selectedPath
    : null;
  const payload: PersistedWorkspaceUi = {
    rootPath: state.rootPath,
    expandedPaths: state.expandedPaths.filter((path) => isSameOrInside(path, state.rootPath!)),
    selectedPath,
  };
  try { localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify(payload)); }
  catch { /* quota or disabled storage */ }
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    rootPath: null,
    tree: [],
    expandedPaths: [],
    selectedPath: null,
    documentTitles: {},
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
        this.documentTitles = {};
        const restored = loadWorkspaceUi(rootPath);
        this.expandedPaths = restored?.expandedPaths ?? [rootPath];
        this.selectedPath = restored?.selectedPath ?? null;
      } else if (!this.expandedPaths.includes(rootPath)) {
        this.expandedPaths.push(rootPath);
      }
      persistWorkspaceUi(this.$state);
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
      persistWorkspaceUi(this.$state);
    },
    setDocumentTitle(path: string, title: string) {
      if (title) this.documentTitles[path] = title;
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
      persistWorkspaceUi(this.$state);
    },
    expandPath(path: string) {
      if (!this.expandedPaths.includes(path)) {
        this.expandedPaths.push(path);
        persistWorkspaceUi(this.$state);
      }
    },
    /** Drops `path` and every expanded path inside it (delete flows). */
    removeExpandedPathPrefix(path: string) {
      const normalizedPath = normalizePath(path);
      const prefix = `${normalizedPath}/`;
      this.expandedPaths = this.expandedPaths.filter((p) => {
        const normalized = normalizePath(p);
        return normalized !== normalizedPath && !normalized.startsWith(prefix);
      });
      persistWorkspaceUi(this.$state);
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
      persistWorkspaceUi(this.$state);
    },
    reset() {
      this.rootPath = null;
      this.tree = [];
      this.expandedPaths = [];
      this.selectedPath = null;
      this.documentTitles = {};
      this.isLoading = false;
      this.error = null;
    },
  },
});
