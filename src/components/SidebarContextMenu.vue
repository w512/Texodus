<template>
  <div
    class="sidebar-context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @click.stop
  >
    <button type="button" @click="emit('action', 'new-file')">New File</button>
    <button type="button" @click="emit('action', 'new-folder')">New Folder</button>
    <div v-if="!isRoot" class="sidebar-context-menu__separator"></div>
    <button v-if="!isRoot" type="button" @click="emit('action', 'rename')">Rename</button>
    <button v-if="!isRoot" type="button" class="sidebar-context-menu__danger" @click="emit('action', 'delete')">Delete</button>
    <div class="sidebar-context-menu__separator"></div>
    <button type="button" @click="emit('action', 'reveal')">Reveal in Finder/Explorer</button>
    <button type="button" @click="emit('action', 'copy-relative-path')">Copy Relative Path</button>
  </div>
</template>

<script setup lang="ts">
export type SidebarContextAction =
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
}>();

const emit = defineEmits<{
  (e: 'action', action: SidebarContextAction): void;
}>();
</script>

<style scoped>
.sidebar-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 190px;
  padding: 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-color);
  color: var(--text-color);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
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

.sidebar-context-menu button:hover {
  background: var(--btn-hover);
}

.sidebar-context-menu__danger {
  color: #d04b4b !important;
}

.sidebar-context-menu__separator {
  height: 1px;
  margin: 0.25rem 0.2rem;
  background: var(--border-color);
}
</style>
