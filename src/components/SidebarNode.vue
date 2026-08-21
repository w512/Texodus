<template>
  <li class="sidebar-node">
    <button
      class="sidebar-node__button"
      :class="{
        'sidebar-node__button--selected': node.path === selectedPath,
        'sidebar-node__button--dragging': node.path === draggingPath,
        'sidebar-node__button--drop-target': node.path === dropTargetPath && canDropHere,
        'sidebar-node__button--drop-invalid': node.path === dropTargetPath && !canDropHere,
      }"
      type="button"
      :data-sidebar-path="node.path"
      :data-sidebar-kind="node.kind"
      @click="handleClick"
      @contextmenu.prevent.stop="emit('node-context-menu', node, $event)"
      @pointerdown.left.stop="emit('node-pointer-down', node, $event)"
    >
      <span
        v-if="node.kind === 'directory'"
        class="sidebar-node__chevron"
        :style="{ '--icon': `url(${isExpanded ? iconExpandArrow : iconForward})` }"
        aria-hidden="true"
      ></span>
      <span v-else class="sidebar-node__spacer"></span>
      <span
        class="sidebar-node__icon"
        :style="{ '--icon': `url(${node.kind === 'directory' ? (isExpanded ? iconOpenFolder : iconFolder) : iconDocument})` }"
        aria-hidden="true"
      ></span>
      <span class="sidebar-node__name" :title="node.path">{{ displayName }}</span>
    </button>

    <ul v-if="node.kind === 'directory' && isExpanded" class="sidebar-node__children">
      <li v-if="node.children?.length === 0" class="sidebar-node__empty">Empty</li>
      <SidebarNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :expanded-paths="expandedPaths"
        :dragging-path="draggingPath"
        :drop-target-path="dropTargetPath"
        :document-title-mode="documentTitleMode"
        :document-titles="documentTitles"
        @open-file="(path, newWindow) => $emit('open-file', path, newWindow)"
        @toggle-directory="$emit('toggle-directory', $event)"
        @node-context-menu="(childNode, event) => $emit('node-context-menu', childNode, event)"
        @node-pointer-down="(childNode, event) => $emit('node-pointer-down', childNode, event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type FileTreeNode } from '../stores/workspace';
import type { DocumentTitleMode } from '../stores/settings';
import { isSameOrInside } from '../utils/path';
import iconFolder from '../assets/icons/icons8-folder-100.png';
import iconDocument from '../assets/icons/icons8-document-100.png';
import iconOpenFolder from '../assets/icons/icons8-open-file-100.png';
import iconForward from '../assets/icons/icons8-forward-100.png';
import iconExpandArrow from '../assets/icons/icons8-expand-arrow-100.png';

const props = defineProps<{
  node: FileTreeNode;
  selectedPath: string | null;
  expandedPaths: string[];
  draggingPath: string | null;
  dropTargetPath: string | null;
  documentTitleMode: DocumentTitleMode;
  documentTitles: Record<string, string>;
}>();

const emit = defineEmits<{
  'open-file': [path: string, newWindow: boolean];
  'toggle-directory': [path: string];
  'node-context-menu': [node: FileTreeNode, event: MouseEvent];
  'node-pointer-down': [node: FileTreeNode, event: PointerEvent];
}>();

const isExpanded = computed(() => props.expandedPaths.includes(props.node.path));
const displayName = computed(() => {
  if (props.node.kind === 'directory' || props.documentTitleMode === 'filename') return props.node.name;
  return props.documentTitles[props.node.path] ?? props.node.name;
});
const canDropHere = computed(() => {
  if (!props.draggingPath) return false;
  if (props.node.kind !== 'directory') return false;
  return props.draggingPath !== props.node.path && !isSameOrInside(props.node.path, props.draggingPath);
});

function handleClick(event: MouseEvent) {
  if (props.node.kind === 'directory') {
    emit('toggle-directory', props.node.path);
  } else {
    // Cmd (macOS) / Ctrl (Windows, Linux) + click = open in a new window.
    // On macOS Ctrl+click never lands here — it fires `contextmenu` instead.
    emit('open-file', props.node.path, event.metaKey || event.ctrlKey);
  }
}

</script>

<style scoped>
.sidebar-node {
  list-style: none;
}

.sidebar-node__button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.7rem;
  padding: 0.2rem 0.45rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.sidebar-node__button:hover {
  background: var(--btn-hover);
}

.sidebar-node__button--selected {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.sidebar-node__button--dragging {
  opacity: 0.45;
}

.sidebar-node__button--drop-target {
  background: var(--accent-subtle);
  outline: 1px solid var(--accent-color);
}

.sidebar-node__button--drop-invalid {
  background: rgba(208, 75, 75, 0.12);
  outline: 1px solid var(--danger-color);
}

.sidebar-node__chevron,
.sidebar-node__spacer {
  width: 0.8rem;
  height: 0.8rem;
  flex: 0 0 0.8rem;
}

.sidebar-node__chevron {
  background-color: var(--text-muted);
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
}

.sidebar-node__icon {
  width: 0.95rem;
  height: 0.95rem;
  flex: 0 0 0.95rem;
  background-color: var(--text-muted);
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
}

.sidebar-node__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-node__children {
  margin: 0;
  padding: 0 0 0 0.85rem;
}

.sidebar-node__empty {
  list-style: none;
  padding: 0.25rem 0.45rem 0.25rem 1.95rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-style: italic;
}
</style>
