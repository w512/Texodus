<template>
  <div class="editor-container" :class="layoutMode" ref="containerRef">
    <Transition name="panel">
      <div v-if="layoutMode !== 'preview'" class="editor-pane" :style="paneStyle">
        <slot name="editor"></slot>
      </div>
    </Transition>
    <div
      v-if="layoutMode === 'split'"
      class="pane-divider"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="startDrag"
    ></div>
    <Transition name="panel">
      <div v-if="layoutMode !== 'focus'" class="preview-pane" :style="paneStyle">
        <slot name="preview"></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { type LayoutMode, useSettingsStore } from '../stores/settings';

const props = defineProps<{
  layoutMode: LayoutMode;
}>();

const settingsStore = useSettingsStore();
const containerRef = ref<HTMLElement | null>(null);

const paneStyle = computed(() => {
  if (props.layoutMode !== 'split') return {};
  return { flex: `0 0 ${settingsStore.splitRatio * 100}%` };
});

// ── Draggable divider ────────────────────────────────────────────────────

let dragPointerId: number | null = null;
let dragHandle: HTMLElement | null = null;

function startDrag(event: PointerEvent) {
  if (dragPointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  if (!containerRef.value) return;

  dragPointerId = event.pointerId;
  dragHandle = event.currentTarget as HTMLElement;
  dragHandle.setPointerCapture?.(event.pointerId);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
  document.addEventListener('pointermove', handleDragMove);
  document.addEventListener('pointerup', stopDrag);
  document.addEventListener('pointercancel', stopDrag);
}

function handleDragMove(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return;
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0) return;

  // Read the current rect on every move: the window can be resized while the
  // pointer is held, and using the pointerdown rect makes the ratio drift.
  settingsStore.setSplitRatio((event.clientX - rect.left) / rect.width);
}

function stopDrag(event?: PointerEvent) {
  if (dragPointerId === null) return;
  if (event && event.pointerId !== dragPointerId) return;

  if (dragHandle?.hasPointerCapture?.(dragPointerId)) {
    dragHandle.releasePointerCapture(dragPointerId);
  }
  dragPointerId = null;
  dragHandle = null;
  document.removeEventListener('pointermove', handleDragMove);
  document.removeEventListener('pointerup', stopDrag);
  document.removeEventListener('pointercancel', stopDrag);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  settingsStore.persistSplitRatio();
}

// Leaving split mode must end an in-progress gesture without resetting the
// user's ratio; it will be reused when split mode is selected again.
watch(() => props.layoutMode, (mode) => {
  if (mode !== 'split') stopDrag();
});

onUnmounted(() => stopDrag());
</script>

<style scoped>
.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
  background: var(--bg-color);
  transition: background 0.25s;
}

.editor-pane,
.preview-pane {
  flex: 1;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}

/* Resize divider */
.pane-divider {
  width: 5px;
  background: var(--border-color);
  flex-shrink: 0;
  cursor: col-resize;
  touch-action: none;
  transition: background 0.15s;
  position: relative;
  z-index: 1;
}

.pane-divider:hover,
.pane-divider:active {
  background: var(--accent-color);
}

/* Single-pane modes: pane spans the full window so the scroll container
   covers the entire surface (otherwise the side gutters swallow scroll
   events). Content is centered visually via dynamic horizontal padding on
   the inner scrollable element, not via constraining the outer pane. */
.editor-container.preview .preview-pane :deep(.preview-content),
.editor-container.focus .editor-pane :deep(.cm-scroller) {
  padding-left: max(2.5rem, calc((100% - 780px) / 2));
  padding-right: max(2.5rem, calc((100% - 780px) / 2));
}

/* ── Panel transition (§2.3) ── */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.panel-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.panel-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
</style>