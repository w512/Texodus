<template>
  <div ref="containerRef" class="editor-textarea"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { createMarkdownEditor, reconfigureTheme } from '../composables/useCodeMirror';
import type { EditorView } from '@codemirror/view';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const { setEditorView, syncFromEditor } = useMarkdownPreview();
const containerRef = ref<HTMLElement | null>(null);

let view: EditorView | null = null;

const SCROLL_HIDE_DELAY = 1200;
let scrollHideTimer: ReturnType<typeof setTimeout> | null = null;

function isDarkPreview(): boolean {
  if (settingsStore.themeMode === 'dark') return true;
  if (settingsStore.themeMode === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

function handleScroll() {
  if (!view) return;
  syncFromEditor();
  const el = view.scrollDOM;
  el.classList.add('is-scrolling');
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_HIDE_DELAY);
}

onMounted(() => {
  if (!containerRef.value) return;
  view = createMarkdownEditor({
    parent: containerRef.value,
    initialDoc: editorStore.content,
    theme: {
      dark: isDarkPreview(),
      font: settingsStore.editorFont,
      fontSize: settingsStore.fontSize,
    },
    onChange: (value) => editorStore.updateContent(value),
    onScroll: handleScroll,
  });
  setEditorView(view);
});

// External content changes (file open / new / load from drop) → CM doc.
// Comparing strings short-circuits the typing loop: when the user types,
// onChange writes the same value into the store; this watcher fires, sees
// the doc already matches, and bails before causing a redundant dispatch.
watch(
  () => editorStore.content,
  (newContent) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === newContent) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newContent },
    });
  },
);

// Reactive theme + font: reconfigure the theme compartment in place rather
// than rebuilding state, so cursor/selection survive the swap.
watch(
  [
    () => settingsStore.themeMode,
    () => settingsStore.colorScheme,
    () => settingsStore.editorFont,
    () => settingsStore.fontSize,
  ],
  () => {
    if (!view) return;
    reconfigureTheme(view, {
      dark: isDarkPreview(),
      font: settingsStore.editorFont,
      fontSize: settingsStore.fontSize,
    });
  },
);

onUnmounted(() => {
  view?.destroy();
  view = null;
  setEditorView(null);
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
});
</script>

<style scoped>
.editor-textarea {
  width: 100%;
  height: 100%;
  background: transparent;
  color: var(--text-color);
  transition: color 0.2s;
}
</style>
