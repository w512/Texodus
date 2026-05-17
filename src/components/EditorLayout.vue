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
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

/* Resize divider */
.pane-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.25s;
}

/* Centered single-panel modes */
.editor-container.preview .preview-pane,
.editor-container.focus .editor-pane {
  max-width: 780px;
  margin: 0 auto;
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
