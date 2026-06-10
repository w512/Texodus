<template>
  <aside class="sidebar" aria-label="Workspace files">
    <header class="sidebar__header">
      <div class="sidebar__title-row">
        <div class="sidebar__title">Workspace</div>
        <div class="sidebar__actions">
          <button
            class="sidebar__icon-button"
            type="button"
            title="Open Folder…"
            :disabled="workspaceStore.isLoading"
            @click="openFolder"
          >
            <span class="sidebar__button-icon" :style="{ '--icon': `url(${iconOpenFolder})` }"></span>
          </button>
          <button
            class="sidebar__icon-button"
            type="button"
            title="Refresh workspace"
            :disabled="!workspaceStore.rootPath || workspaceStore.isLoading"
            @click="refresh"
          >
            ↻
          </button>
        </div>
      </div>
      <div v-if="workspaceStore.rootPath" class="sidebar__root" :title="workspaceStore.rootPath">
        {{ rootName }}
      </div>
    </header>

    <div
      ref="sidebarBodyRef"
      class="sidebar__body"
      :class="{ 'sidebar__body--root-drop': draggingNode && dropTargetPath === workspaceStore.rootPath }"
      @contextmenu.prevent="openRootContextMenu"
    >
      <div v-if="workspaceStore.isLoading" class="sidebar__state">Loading files…</div>
      <div v-else-if="workspaceStore.error" class="sidebar__state sidebar__state--error">
        {{ workspaceStore.error }}
      </div>
      <div v-else-if="!workspaceStore.rootPath" class="sidebar__state">
        <p class="sidebar__state-text">Choose a folder to browse Markdown files.</p>
        <div v-if="settingsStore.lastWorkspacePath" class="sidebar__remembered">
          <div class="sidebar__remembered-label">Last workspace</div>
          <div class="sidebar__remembered-path" :title="settingsStore.lastWorkspacePath">
            {{ lastWorkspaceName }}
          </div>
          <button class="sidebar__remembered-button" type="button" @click="openLastFolder">
            Open Last Folder
          </button>
        </div>
      </div>
      <div v-else-if="workspaceStore.tree.length === 0" class="sidebar__state">
        No Markdown or text files found.
      </div>
      <ul v-else class="sidebar__tree">
        <SidebarNode
          v-for="node in workspaceStore.tree"
          :key="node.path"
          :node="node"
          :selected-path="workspaceStore.selectedPath"
          :expanded-paths="workspaceStore.expandedPaths"
          :dragging-path="draggingNode?.path ?? null"
          :drop-target-path="dropTargetPath"
          @open-file="openFile"
          @toggle-directory="toggleDirectory"
          @node-context-menu="openNodeContextMenu"
          @node-pointer-down="prepareDrag"
        />
      </ul>
    </div>

    <SidebarContextMenu
      v-if="contextMenu.visible && contextMenu.node"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :is-root="contextMenu.isRoot"
      @action="runContextAction"
    />

    <SidebarNamePrompt
      v-if="namePrompt.visible"
      :title="namePrompt.title"
      :initial-value="namePrompt.initialValue"
      @confirm="confirmNamePrompt"
      @cancel="closeNamePrompt"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import SidebarNode from './SidebarNode.vue';
import SidebarContextMenu, { type SidebarContextAction } from './SidebarContextMenu.vue';
import SidebarNamePrompt from './SidebarNamePrompt.vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useWorkspaceStore } from '../stores/workspace';
import {
  loadWorkspaceDirectoryChildren,
  openRememberedWorkspaceFolder,
  openWorkspaceFolder,
  refreshWorkspaceTree,
} from '../services/workspaceService';
import { loadFileFromPath } from '../services/fileService';
import {
  copyWorkspaceRelativePath,
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceNode,
  moveWorkspaceNode,
  renameWorkspaceNode,
  revealWorkspaceNode,
} from '../services/workspaceFileOperations';
import { type FileTreeNode } from '../stores/workspace';
import { useSidebarDragDrop } from '../composables/useSidebarDragDrop';
import { basename } from '../utils/path';
import iconOpenFolder from '../assets/icons/icons8-open-file-100.png';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

const rootName = computed(() => workspaceStore.rootPath ? basename(workspaceStore.rootPath) : '');
const lastWorkspaceName = computed(() => settingsStore.lastWorkspacePath ? basename(settingsStore.lastWorkspacePath) : '');
const sidebarBodyRef = ref<HTMLElement | null>(null);

const { draggingNode, dropTargetPath, prepareDrag, consumeSuppressedClick } = useSidebarDragDrop({
  bodyRef: sidebarBodyRef,
  getRootPath: () => workspaceStore.rootPath,
  onDragStart: closeContextMenu,
  onDrop: moveWorkspaceNode,
});

const contextMenu = reactive<{
  visible: boolean;
  x: number;
  y: number;
  node: FileTreeNode | null;
  isRoot: boolean;
}>({ visible: false, x: 0, y: 0, node: null, isRoot: false });

const namePrompt = reactive<{
  visible: boolean;
  title: string;
  initialValue: string;
  action: 'new-file' | 'new-folder' | 'rename' | null;
  node: FileTreeNode | null;
}>({ visible: false, title: '', initialValue: '', action: null, node: null });

watch(
  () => editorStore.filePath,
  (path) => workspaceStore.setSelectedPath(path),
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('click', closeContextMenu);
  window.addEventListener('keydown', handleContextMenuKeydown);
});

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('keydown', handleContextMenuKeydown);
});

async function openFolder() {
  try {
    await openWorkspaceFolder();
  } catch (e) {
    workspaceStore.setError(e instanceof Error ? e.message : String(e));
  }
}

async function refresh() {
  await refreshWorkspaceTree();
}

async function openLastFolder() {
  await openRememberedWorkspaceFolder();
}

async function toggleDirectory(path: string) {
  if (consumeSuppressedClick()) return;
  if (!workspaceStore.isExpanded(path)) {
    await loadWorkspaceDirectoryChildren(path);
  }
  workspaceStore.toggleExpanded(path);
}

function openNodeContextMenu(node: FileTreeNode, event: MouseEvent) {
  contextMenu.visible = true;
  contextMenu.node = node;
  contextMenu.isRoot = false;
  const position = getContextMenuPosition(event);
  contextMenu.x = position.x;
  contextMenu.y = position.y;
}

function openRootContextMenu(event: MouseEvent) {
  if (!workspaceStore.rootPath) return;
  contextMenu.visible = true;
  contextMenu.isRoot = true;
  contextMenu.node = {
    name: rootName.value || workspaceStore.rootPath,
    path: workspaceStore.rootPath,
    kind: 'directory',
    children: workspaceStore.tree,
  };
  const position = getContextMenuPosition(event);
  contextMenu.x = position.x;
  contextMenu.y = position.y;
}

function getContextMenuPosition(event: MouseEvent): { x: number; y: number } {
  const menuWidth = 210;
  const menuHeight = contextMenu.isRoot ? 150 : 250;
  const padding = 8;
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - padding);
  const opensUpward = event.clientY + menuHeight + padding > window.innerHeight;
  const y = opensUpward
    ? Math.max(padding, event.clientY - menuHeight)
    : event.clientY;

  return { x, y };
}

function closeContextMenu() {
  contextMenu.visible = false;
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu();
}

async function runContextAction(action: SidebarContextAction) {
  const node = contextMenu.node;
  closeContextMenu();
  if (!node) return;

  if (action === 'new-file') openNamePrompt('new-file', node, 'New file name', 'untitled.md');
  else if (action === 'new-folder') openNamePrompt('new-folder', node, 'New folder name', 'New Folder');
  else if (action === 'rename') openNamePrompt('rename', node, 'Rename', node.name);
  else if (action === 'delete') await deleteWorkspaceNode(node);
  else if (action === 'reveal') await revealWorkspaceNode(node);
  else if (action === 'copy-relative-path') await copyWorkspaceRelativePath(node);
}

function openNamePrompt(
  action: 'new-file' | 'new-folder' | 'rename',
  node: FileTreeNode,
  title: string,
  initialValue: string,
) {
  namePrompt.visible = true;
  namePrompt.title = title;
  namePrompt.initialValue = initialValue;
  namePrompt.action = action;
  namePrompt.node = node;
}

function closeNamePrompt() {
  namePrompt.visible = false;
  namePrompt.action = null;
  namePrompt.node = null;
}

async function confirmNamePrompt(rawValue: string) {
  const node = namePrompt.node;
  const action = namePrompt.action;
  const value = rawValue.trim();
  closeNamePrompt();
  if (!node || !action || !value) return;

  if (action === 'new-file') await createWorkspaceFile(node, value);
  else if (action === 'new-folder') await createWorkspaceFolder(node, value);
  else if (action === 'rename') await renameWorkspaceNode(node, value);
}

async function openFile(path: string) {
  if (consumeSuppressedClick()) return;
  await loadFileFromPath(editorStore, path);
  if (editorStore.filePath === path) workspaceStore.setSelectedPath(path);
}
</script>

<style scoped>
.sidebar {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-color);
  overflow: hidden;
}

.sidebar__header {
  flex: 0 0 auto;
  padding: 0.85rem 0.75rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.sidebar__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.sidebar__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sidebar__root {
  margin-bottom: 0.65rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
}

.sidebar__icon-button {
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-color);
  color: var(--text-color);
  font: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.sidebar__button-icon {
  width: 0.95rem;
  height: 0.95rem;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
}

.sidebar__icon-button:hover:not(:disabled) {
  background: var(--btn-hover);
}

.sidebar__icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.sidebar__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.55rem;
  transition: background 0.12s ease;
}

.sidebar__body--root-drop {
  background: var(--accent-subtle);
}

:global(body.is-dragging-sidebar-node) {
  cursor: grabbing;
  user-select: none;
}

.sidebar__tree {
  margin: 0;
  padding: 0;
}

.sidebar__state {
  padding: 0.8rem 0.45rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.sidebar__state-text {
  margin: 0 0 0.8rem;
}

.sidebar__remembered {
  padding: 0.65rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color);
}

.sidebar__remembered-label {
  margin-bottom: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sidebar__remembered-path {
  margin-bottom: 0.6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
  font-weight: 600;
}

.sidebar__remembered-button {
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-secondary);
  color: var(--text-color);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.sidebar__remembered-button:hover {
  background: var(--btn-hover);
}

.sidebar__state--error {
  color: #d04b4b;
}
</style>
