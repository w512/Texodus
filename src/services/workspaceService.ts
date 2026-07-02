import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { type FileTreeNode, useWorkspaceStore } from '../stores/workspace';
import { useSettingsStore } from '../stores/settings';
import { allowAssetDirectory } from './assetScopeService';
import { findNode } from '../utils/workspaceTree';
import { dirname, normalizePath, resolveLocalPath } from '../utils/path';

const VISIBLE_FILE_EXTENSIONS = /\.(md|markdown|txt)$/i;
const IGNORED_DIRECTORIES = new Set(['.git', '.obsidian', 'node_modules', 'dist', 'target']);

export async function selectWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
  });

  return typeof selected === 'string' ? selected : null;
}

export async function loadWorkspaceTree(rootPath: string): Promise<FileTreeNode[]> {
  return await readDirectoryNodes(rootPath);
}

/**
 * Eagerly reads the whole workspace and returns a flat list of every visible
 * file. Used by Quick Open, whose search must cover directories the sidebar
 * hasn't lazily expanded yet. Applies the same extension/ignore filters as
 * the sidebar tree; `seen` guards against symlink cycles. Unreadable
 * subdirectories are skipped rather than failing the whole scan.
 */
export async function listWorkspaceFilesRecursively(rootPath: string): Promise<FileTreeNode[]> {
  const files: FileTreeNode[] = [];
  const seen = new Set<string>([normalizePath(rootPath)]);

  async function walk(directoryPath: string): Promise<void> {
    const nodes = await readDirectoryNodes(directoryPath);
    for (const node of nodes) {
      if (node.kind === 'file') {
        files.push(node);
        continue;
      }
      const key = normalizePath(node.path);
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await walk(node.path);
      } catch {
        // Permission denied or the directory vanished mid-scan — skip it.
      }
    }
  }

  await walk(rootPath);
  return files;
}

export async function openWorkspaceFolder(): Promise<void> {
  const selected = await selectWorkspaceFolder();
  if (!selected) return;

  useSettingsStore().setLastWorkspacePath(selected);
  await refreshWorkspaceTree(selected);
}

export async function openRememberedWorkspaceFolder(): Promise<void> {
  const rememberedPath = useSettingsStore().lastWorkspacePath;
  if (!rememberedPath) return;

  await refreshWorkspaceTree(rememberedPath);
}

export async function loadWorkspaceDirectoryChildren(directoryPath: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  const node = findNode(workspaceStore.tree, directoryPath);
  if (node?.kind === 'directory' && node.children !== undefined) return;

  try {
    const children = await readDirectoryNodes(directoryPath);
    workspaceStore.setDirectoryChildren(directoryPath, children);
  } catch (e) {
    workspaceStore.setError(e instanceof Error ? e.message : String(e));
  }
}

async function reloadExpandedDirectories(rootPath: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  const normalizedRoot = normalizePath(rootPath);
  const expanded = workspaceStore.expandedPaths
    .filter((path) => {
      const normalized = normalizePath(path);
      return normalized !== normalizedRoot && isPathInsideWorkspace(path, rootPath);
    })
    .sort((a, b) => pathDepth(a) - pathDepth(b));

  for (const path of expanded) {
    await loadWorkspaceDirectoryChildren(path);
  }
}

function pathDepth(path: string): number {
  return normalizePath(path).split('/').filter(Boolean).length;
}

export async function refreshWorkspaceTree(rootPath?: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  const path = rootPath ?? workspaceStore.rootPath;
  if (!path) return;

  workspaceStore.setLoading(true);
  workspaceStore.setError(null);
  try {
    await allowAssetDirectory(path);
    const tree = await loadWorkspaceTree(path);
    workspaceStore.setWorkspace(path, tree);
    await reloadExpandedDirectories(path);
  } catch (e) {
    workspaceStore.setError(e instanceof Error ? e.message : String(e));
  } finally {
    workspaceStore.setLoading(false);
  }
}

export async function refreshWorkspaceTreeIfPathInside(filePath: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  if (!workspaceStore.rootPath) return;
  if (!isPathInsideWorkspace(filePath, workspaceStore.rootPath)) return;

  await refreshWorkspaceTree(workspaceStore.rootPath);
  await expandAndLoadParentDirectories(filePath, workspaceStore.rootPath);
  workspaceStore.setSelectedPath(filePath);
}

export async function expandAndLoadParentDirectories(filePath: string, rootPath: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  const parentDirs = getParentDirectoriesInsideWorkspace(filePath, rootPath);

  for (const dir of parentDirs) {
    workspaceStore.expandPath(dir);
    await loadWorkspaceDirectoryChildren(dir);
  }
}

function getParentDirectoriesInsideWorkspace(filePath: string, rootPath: string): string[] {
  const normalizedRoot = normalizePath(rootPath);
  const dirs: string[] = [];
  let current = normalizePath(dirname(filePath));

  while (current && current !== normalizedRoot && isPathInsideWorkspace(current, rootPath)) {
    dirs.unshift(current);
    const parent = normalizePath(dirname(current));
    if (parent === current) break;
    current = parent;
  }

  dirs.unshift(normalizedRoot);
  return dirs;
}

function isPathInsideWorkspace(path: string, rootPath: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

async function readDirectoryNodes(directoryPath: string): Promise<FileTreeNode[]> {
  const entries = await readDir(directoryPath);
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    const path = resolveLocalPath(directoryPath, entry.name);

    if (entry.isDirectory) {
      // Hidden/config/build folders can be huge or forbidden by Tauri scopes
      // (for example Obsidian's `.obsidian`). They are not useful for the
      // Markdown workspace tree, so skip them in the MVP.
      if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;

      // Lazy loading: do not recurse here. Children are loaded only when the
      // user expands this directory in the Sidebar.
      nodes.push({ name: entry.name, path, kind: 'directory' });
      continue;
    }

    if (entry.isFile && VISIBLE_FILE_EXTENSIONS.test(entry.name)) {
      nodes.push({ name: entry.name, path, kind: 'file' });
    }
  }

  return sortTree(nodes);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
