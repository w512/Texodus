import { mkdir, remove, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs';
import { confirm, message } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEditorStore } from '../stores/editor';
import { type FileTreeNode, useWorkspaceStore } from '../stores/workspace';
import { promptUnsavedChanges } from '../composables/useUnsavedPrompt';
import { basename, dirname, isSameOrInside, normalizePath, resolveLocalPath } from '../utils/path';
import { expandAndLoadParentDirectories, refreshWorkspaceTree } from './workspaceService';

async function ensurePathDoesNotExist(path: string): Promise<boolean> {
  try {
    await stat(path);
    await message(`A file or folder already exists at:\n${path}`, { title: 'Already exists', kind: 'warning' });
    return false;
  } catch {
    return true;
  }
}

async function confirmReplaceExisting(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    const ok = await confirm(`Replace existing ${info.isDirectory ? 'folder' : 'file'} at:\n${path}?`, {
      title: 'Replace existing item',
      kind: 'warning',
      okLabel: 'Replace',
      cancelLabel: 'Cancel',
    });
    if (!ok) return false;
    await remove(path, { recursive: info.isDirectory });
    return true;
  } catch {
    return true;
  }
}

function targetDirectory(node: FileTreeNode): string {
  return node.kind === 'directory' ? node.path : dirname(node.path);
}

function removeExpandedPathPrefix(path: string): void {
  const workspaceStore = useWorkspaceStore();
  const normalizedPath = normalizePath(path);
  const prefix = `${normalizedPath}/`;
  workspaceStore.expandedPaths = workspaceStore.expandedPaths.filter((p) => {
    const normalized = normalizePath(p);
    return normalized !== normalizedPath && !normalized.startsWith(prefix);
  });
}

function replaceExpandedPathPrefix(oldPath: string, newPath: string): void {
  const workspaceStore = useWorkspaceStore();
  const oldNormalized = normalizePath(oldPath);
  const newNormalized = normalizePath(newPath);
  const oldPrefix = `${oldNormalized}/`;
  workspaceStore.expandedPaths = workspaceStore.expandedPaths.map((p) => {
    const normalized = normalizePath(p);
    if (normalized === oldNormalized) return newPath;
    if (normalized.startsWith(oldPrefix)) return newNormalized + normalized.slice(oldNormalized.length);
    return p;
  });
}

async function confirmCurrentDocumentIfAffected(path: string): Promise<boolean> {
  const editorStore = useEditorStore();
  const affectedDirtyTabs = editorStore.tabs.filter(
    (tab) => tab.filePath && isSameOrInside(tab.filePath, path) && tab.isDirty,
  );
  if (affectedDirtyTabs.length === 0) return true;

  for (const tab of affectedDirtyTabs) {
    editorStore.setActiveTab(tab.id);
    const choice = await promptUnsavedChanges();
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      await writeTextFile(tab.filePath!, tab.content);
      editorStore.setTabDirty(tab.id, false);
    }
  }
  return true;
}

function replaceOpenDocumentPathPrefix(oldPath: string, newPath: string): void {
  const editorStore = useEditorStore();
  const oldNormalized = normalizePath(oldPath);
  const newNormalized = normalizePath(newPath);
  const oldPrefix = `${oldNormalized}/`;

  for (const tab of editorStore.tabs) {
    if (!tab.filePath) continue;
    const normalized = normalizePath(tab.filePath);
    if (normalized === oldNormalized) {
      tab.filePath = newPath;
    } else if (normalized.startsWith(oldPrefix)) {
      tab.filePath = newNormalized + normalized.slice(oldNormalized.length);
    }
  }
}

async function updateWindowTitle(): Promise<void> {
  const editorStore = useEditorStore();
  try {
    const name = editorStore.filePath ? basename(editorStore.filePath) : 'Untitled';
    const dirtyMark = editorStore.isDirty ? '* ' : '';
    await getCurrentWindow().setTitle(`${dirtyMark}${name}`);
  } catch {
    // Non-critical.
  }
}

async function refreshAndReveal(path: string): Promise<void> {
  const workspaceStore = useWorkspaceStore();
  if (!workspaceStore.rootPath) return;
  await refreshWorkspaceTree(workspaceStore.rootPath);
  await expandAndLoadParentDirectories(path, workspaceStore.rootPath);
  workspaceStore.setSelectedPath(path);
}

export async function createWorkspaceFile(node: FileTreeNode, name: string): Promise<void> {
  const dir = targetDirectory(node);
  if (!name) return;

  const path = resolveLocalPath(dir, name);
  if (!(await ensurePathDoesNotExist(path))) return;

  try {
    await writeTextFile(path, '');
    await refreshAndReveal(path);
  } catch (e) {
    await message(`Failed to create file: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function createWorkspaceFolder(node: FileTreeNode, name: string): Promise<void> {
  const dir = targetDirectory(node);
  if (!name) return;

  const path = resolveLocalPath(dir, name);
  if (!(await ensurePathDoesNotExist(path))) return;

  try {
    await mkdir(path);
    await refreshAndReveal(path);
  } catch (e) {
    await message(`Failed to create folder: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function renameWorkspaceNode(node: FileTreeNode, nextName: string): Promise<void> {
  if (!(await confirmCurrentDocumentIfAffected(node.path))) return;
  if (!nextName || nextName === node.name) return;

  const nextPath = resolveLocalPath(dirname(node.path), nextName);
  if (!(await ensurePathDoesNotExist(nextPath))) return;

  try {
    await rename(node.path, nextPath);
    replaceExpandedPathPrefix(node.path, nextPath);
    replaceOpenDocumentPathPrefix(node.path, nextPath);
    await updateWindowTitle();
    await refreshAndReveal(nextPath);
  } catch (e) {
    await message(`Failed to rename: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function moveWorkspaceNode(source: FileTreeNode, targetDirectoryPath: string): Promise<void> {
  if (source.path === targetDirectoryPath || isSameOrInside(targetDirectoryPath, source.path)) {
    await message('Cannot move a folder into itself or one of its subfolders.', { title: 'Invalid move', kind: 'warning' });
    return;
  }

  const currentParent = dirname(source.path);
  if (normalizePath(currentParent) === normalizePath(targetDirectoryPath)) return;
  if (!(await confirmCurrentDocumentIfAffected(source.path))) return;

  const nextPath = resolveLocalPath(targetDirectoryPath, source.name);
  if (!(await confirmReplaceExisting(nextPath))) return;

  try {
    await rename(source.path, nextPath);
    replaceExpandedPathPrefix(source.path, nextPath);
    replaceOpenDocumentPathPrefix(source.path, nextPath);
    await updateWindowTitle();
    await refreshAndReveal(nextPath);
  } catch (e) {
    await message(`Failed to move: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function deleteWorkspaceNode(node: FileTreeNode): Promise<void> {
  if (!(await confirmCurrentDocumentIfAffected(node.path))) return;

  const ok = await confirm(`Delete ${node.kind} “${node.name}”?`, {
    title: 'Delete',
    kind: 'warning',
    okLabel: 'Delete',
    cancelLabel: 'Cancel',
  });
  if (!ok) return;

  const editorStore = useEditorStore();
  try {
    await remove(node.path, { recursive: node.kind === 'directory' });
    removeExpandedPathPrefix(node.path);
    if (editorStore.filePath && isSameOrInside(editorStore.filePath, node.path)) {
      editorStore.reset();
      await updateWindowTitle();
    }
    const parent = dirname(node.path);
    await refreshAndReveal(parent);
  } catch (e) {
    await message(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function revealWorkspaceNode(node: FileTreeNode): Promise<void> {
  try {
    await revealItemInDir(node.path);
  } catch (e) {
    await message(`Failed to reveal item: ${e instanceof Error ? e.message : String(e)}`, { title: 'Error', kind: 'error' });
  }
}

export async function copyWorkspaceRelativePath(node: FileTreeNode): Promise<void> {
  const root = useWorkspaceStore().rootPath;
  const full = node.path.replace(/\\/g, '/');
  const normalizedRoot = root?.replace(/\\/g, '/').replace(/\/+$/, '');
  const relative = normalizedRoot && full.startsWith(`${normalizedRoot}/`)
    ? full.slice(normalizedRoot.length + 1)
    : node.path;

  await navigator.clipboard.writeText(relative);
}
