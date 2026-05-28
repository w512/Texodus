<template>
  <div class="editor-container" :class="layoutMode">
    <Transition name="panel">
      <div v-if="layoutMode !== 'preview'" class="editor-pane">
        <slot name="editor"></slot>
      </div>
    </Transition>
    <div class="pane-divider" v-if="layoutMode === 'split'"></div>
    <Transition name="panel">
      <div v-if="layoutMode !== 'focus'" class="preview-pane">
        <slot name="preview"></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup>
defineProps({
  layoutMode: String,
});
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
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.25s;
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
