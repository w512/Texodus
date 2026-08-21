import { readTextFile } from '@tauri-apps/plugin-fs';
import { useWorkspaceStore } from '../stores/workspace';
import type { FileTreeNode } from '../utils/workspaceTree';
import {
  extractFrontmatterTitleFromContent,
  extractH1TitleFromContent,
} from '../utils/noteTitle';
import { basename, normalizePath } from '../utils/path';
import { isSupportedDocument } from '../utils/documentExtensions';

const titleCache = new Map<string, string>();
const LOAD_CONCURRENCY = 8;

/** H1 → frontmatter title → exact filename (the stable fallback). */
export function documentTitleFromContent(content: string, filename: string): string {
  return extractH1TitleFromContent(content)
    ?? extractFrontmatterTitleFromContent(content)
    ?? filename;
}

export function updateDocumentTitleFromContent(path: string, content: string): string {
  const title = documentTitleFromContent(content, basename(path));
  titleCache.set(normalizePath(path), title);
  useWorkspaceStore().setDocumentTitle(path, title);
  return title;
}

async function loadDocumentTitle(path: string, filename: string): Promise<string> {
  const key = normalizePath(path);
  const cached = titleCache.get(key);
  if (cached) return cached;
  try {
    const title = documentTitleFromContent(await readTextFile(path), filename);
    titleCache.set(key, title);
    return title;
  } catch {
    return filename;
  }
}

function loadedFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const files: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') files.push(node);
    else if (node.children) files.push(...loadedFiles(node.children));
  }
  return files;
}

/** Loads titles with bounded IPC concurrency and mirrors them into Pinia. */
export async function loadDocumentTitles(nodes: FileTreeNode[]): Promise<Record<string, string>> {
  const files = loadedFiles(nodes);
  const titles: Record<string, string> = {};
  let next = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      titles[file.path] = await loadDocumentTitle(file.path, file.name);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(LOAD_CONCURRENCY, files.length) },
    () => worker(),
  ));

  const store = useWorkspaceStore();
  for (const [path, title] of Object.entries(titles)) store.setDocumentTitle(path, title);
  return titles;
}

export async function refreshDocumentTitles(paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths.filter(isSupportedDocument))];
  await Promise.all(uniquePaths.map(async (path) => {
    try {
      const content = await readTextFile(path);
      updateDocumentTitleFromContent(path, content);
    } catch {
      // The path may have been deleted/renamed between the event and the read.
    }
  }));
}

export function clearDocumentTitleCache(): void {
  titleCache.clear();
}
