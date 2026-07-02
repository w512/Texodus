<template>
  <Teleport to="body">
    <Transition name="quick-open-fade">
      <div
        v-if="quickOpen.isOpen.value"
        class="quick-open-overlay"
        @click.self="quickOpen.closeQuickOpen()"
      >
        <div class="quick-open-palette">
          <input
            ref="inputRef"
            v-model="quickOpen.query.value"
            class="quick-open-input"
            type="text"
            placeholder="Search files by name…"
            spellcheck="false"
            autocomplete="off"
          />
          <div class="quick-open-results" v-if="quickOpen.results.value.length > 0">
            <div
              v-for="(result, i) in quickOpen.results.value"
              :key="result.item.path"
              class="quick-open-item"
              :class="{ 'quick-open-item--active': i === quickOpen.selectedIndex.value }"
              @click="quickOpen.selectResult(i)"
              @mousemove="quickOpen.selectedIndex.value = i"
            >
              <span class="quick-open-item__icon">📄</span>
              <span class="quick-open-item__name">{{ result.item.name }}</span>
              <span class="quick-open-item__dir">{{ dirOf(result.item.path) }}</span>
            </div>
          </div>
          <div v-else-if="quickOpen.query.value.trim()" class="quick-open-empty">
            No matching files
          </div>
          <div v-else-if="!hasWorkspace" class="quick-open-empty">
            Open a folder to search files
          </div>
          <div v-else class="quick-open-empty">
            Start typing to search…
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import { useQuickOpen } from '../composables/useQuickOpen';
import { useWorkspaceStore } from '../stores/workspace';
import { dirname, normalizePath } from '../utils/path';

const quickOpen = useQuickOpen();
const workspaceStore = useWorkspaceStore();

const inputRef = computed(() => null as HTMLInputElement | null);
const hasWorkspace = computed(() => !!workspaceStore.rootPath);

// Focus the input when the palette opens.
watch(
  () => quickOpen.isOpen.value,
  async (open) => {
    if (!open) return;
    await nextTick();
    const el = document.querySelector<HTMLInputElement>('.quick-open-input');
    el?.focus();
  },
);

function dirOf(path: string): string {
  if (!workspaceStore.rootPath) return '';
  const root = normalizePath(workspaceStore.rootPath);
  const normalized = normalizePath(path);
  const relative = normalized.startsWith(root + '/')
    ? normalized.slice(root.length + 1)
    : normalized;
  const dir = dirname(relative);
  return dir ? dir : '';
}
</script>

<style scoped>
.quick-open-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
}

.quick-open-palette {
  width: 90%;
  max-width: 560px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.quick-open-input {
  width: 100%;
  padding: 0.8rem 1rem;
  border: none;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-size: 0.95rem;
  outline: none;
}

.quick-open-input::placeholder {
  color: var(--text-muted);
}

.quick-open-results {
  max-height: 360px;
  overflow-y: auto;
  padding: 0.3rem 0;
}

.quick-open-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 1rem;
  cursor: pointer;
  transition: background 0.08s ease;
}

.quick-open-item--active {
  background: var(--accent-subtle, rgba(0, 120, 212, 0.08));
}

.quick-open-item__icon {
  font-size: 0.85rem;
  opacity: 0.7;
  flex-shrink: 0;
}

.quick-open-item__name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-open-item__dir {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: auto;
  max-width: 200px;
}

.quick-open-empty {
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
}

.quick-open-fade-enter-active,
.quick-open-fade-leave-active {
  transition: opacity 0.12s ease;
}

.quick-open-fade-enter-from,
.quick-open-fade-leave-to {
  opacity: 0;
}
</style>