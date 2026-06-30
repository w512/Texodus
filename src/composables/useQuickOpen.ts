/**
 * Quick Open palette composable.
 *
 * Manages open/close state, query, keyboard navigation, and result
 * computation. Uses fuzzySearch to rank files from the workspace tree.
 */

import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type ComputedRef } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { fuzzySearch, type RankedResult } from '../utils/fuzzyMatch';
import { type FileTreeNode, findNode } from '../utils/workspaceTree';
import { basename } from '../utils/path';
import { isMac } from '../utils/platform';
import { requestOpenFromPath } from '../services/fileService';

export interface QuickOpenFile {
  path: string;
  name: string;
  displayTitle: string;
}

/** Recursively collect all file nodes from the workspace tree. */
function collectFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const files: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      files.push(node);
    } else if (node.kind === 'directory' && node.children) {
      files.push(...collectFiles(node.children));
    }
  }
  return files;
}

const MAX_RESULTS = 50;

// ── Singleton state ─────────────────────────────────────────────────────────────
// The Quick Open palette is app-global: one instance, opened/closed from
// anywhere (keyboard shortcut, menu item). Using module-level refs keeps it
// simple without a Pinia store.

const isOpen = ref(false);
const query = ref('');
const selectedIndex = ref(0);
const isMacPlatform = isMac;

/** Collect files from the workspace tree, sorted alphabetically by name. */
const allFiles: ComputedRef<QuickOpenFile[]> = computed(() => {
  const store = useWorkspaceStore();
  if (!store.tree.length) return [];
  const files = collectFiles(store.tree);
  return files.map((node) => ({
    path: node.path,
    name: node.name,
    displayTitle: node.name,
  })).sort((a, b) => a.name.localeCompare(b.name));
});

/** Ranked search results for the current query. */
const results: ComputedRef<RankedResult<QuickOpenFile>[]> = computed(() => {
  return fuzzySearch(query.value, allFiles.value, (f) => f.name).slice(0, MAX_RESULTS);
});

/** Open the Quick Open palette. */
function openQuickOpen(): void {
  query.value = '';
  selectedIndex.value = 0;
  isOpen.value = true;
}

/** Close the Quick Open palette. */
function closeQuickOpen(): void {
  isOpen.value = false;
  query.value = '';
  selectedIndex.value = 0;
}

/** Select a file from the results and open it. */
async function selectResult(index: number): Promise<void> {
  const ranked = results.value;
  if (index < 0 || index >= ranked.length) return;
  const file = ranked[index].item;
  closeQuickOpen();
  const editorStore = useEditorStore();
  await requestOpenFromPath(editorStore, file.path);
}

/** Move selection up (negative) or down (positive). */
function moveSelection(delta: number): void {
  const count = results.value.length;
  if (count === 0) return;
  selectedIndex.value = (selectedIndex.value + delta + count) % count;
}

/** Handle keydown events inside the Quick Open palette. */
function handleKeydown(e: KeyboardEvent): void {
  if (!isOpen.value) {
    // Cmd/Ctrl+P opens the palette.
    const mod = isMacPlatform ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyP') {
      e.preventDefault();
      openQuickOpen();
    }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    closeQuickOpen();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSelection(1);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSelection(-1);
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    void selectResult(selectedIndex.value);
    return;
  }
}

/** Reset selection to 0 whenever the query changes. */
watch(query, () => { selectedIndex.value = 0; });

export function useQuickOpen() {
  onMounted(() => window.addEventListener('keydown', handleKeydown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

  return {
    isOpen,
    query,
    results,
    selectedIndex,
    openQuickOpen,
    closeQuickOpen,
    selectResult,
  };
}