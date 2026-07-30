<template>
  <ContextMenu class="sidebar-context-menu" :x="x" :y="y" @close="emit('close')">
    <button v-if="isFile" role="menuitem" type="button" @click="emit('action', 'open-in-new-window')">Open in New Window</button>
    <div v-if="isFile" class="sidebar-context-menu__separator" role="separator"></div>
    <button role="menuitem" type="button" @click="emit('action', 'new-file')">New File</button>
    <button role="menuitem" type="button" @click="emit('action', 'new-folder')">New Folder</button>
    <div v-if="!isRoot" class="sidebar-context-menu__separator" role="separator"></div>
    <button v-if="!isRoot" role="menuitem" type="button" @click="emit('action', 'rename')">Rename</button>
    <button v-if="!isRoot" role="menuitem" type="button" class="sidebar-context-menu__danger" @click="emit('action', 'delete')">Delete</button>
    <div class="sidebar-context-menu__separator" role="separator"></div>
    <button role="menuitem" type="button" @click="emit('action', 'reveal')">Reveal in Finder/Explorer</button>
    <button role="menuitem" type="button" @click="emit('action', 'copy-relative-path')">Copy Relative Path</button>
  </ContextMenu>
</template>

<script setup lang="ts">
import ContextMenu from './ContextMenu.vue';

export type SidebarContextAction =
  | 'open-in-new-window'
  | 'new-file'
  | 'new-folder'
  | 'rename'
  | 'delete'
  | 'reveal'
  | 'copy-relative-path';

defineProps<{
  x: number;
  y: number;
  /** Root menu hides Rename/Delete — the workspace root itself can't be touched. */
  isRoot: boolean;
  /** Only file nodes get "Open in New Window" — it makes no sense on folders. */
  isFile: boolean;
}>();

const emit = defineEmits<{
  (e: 'action', action: SidebarContextAction): void;
  (e: 'close'): void;
}>();
</script>

<style scoped>
.sidebar-context-menu {
  min-width: 190px;
}

.sidebar-context-menu button {
  width: 100%;
  display: block;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.sidebar-context-menu button:hover,
.sidebar-context-menu button:focus-visible {
  outline: none;
  background: var(--btn-hover);
  color: var(--accent-color);
}

.sidebar-context-menu__danger {
  color: var(--danger-color) !important;
}

.sidebar-context-menu__separator {
  height: 1px;
  margin: 0.25rem 0.2rem;
  background: var(--border-color);
}
</style>
