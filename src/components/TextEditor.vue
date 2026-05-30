<template>
  <div ref="containerRef" class="editor-textarea"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import {
  createMarkdownEditor,
  createMarkdownState,
  reconfigureTheme,
  reconfigureThemeOnState,
  type ThemeOpts,
} from '../composables/useCodeMirror';
import type { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const { setEditorView, syncFromEditor } = useMarkdownPreview();
const containerRef = ref<HTMLElement | null>(null);

let view: EditorView | null = null;

// Saved CodeMirror states for tabs that aren't currently in the view. The
// active tab's state lives in `view.state`; inactive tabs dehydrate here so
// switching back restores undo history, selection, and scroll position.
const tabStates = new Map<string, EditorState>();
let lastActiveTabId: string | null = null;

const SCROLL_HIDE_DELAY = 1200;
let scrollHideTimer: ReturnType<typeof setTimeout> | null = null;

function isDarkPreview(): boolean {
  if (settingsStore.themeMode === 'dark') return true;
  if (settingsStore.themeMode === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

function currentThemeOpts(): ThemeOpts {
  return {
    dark: isDarkPreview(),
    font: settingsStore.editorFont,
    fontSize: settingsStore.fontSize,
  };
}

function handleScroll() {
  if (!view) return;
  syncFromEditor();
  const el = view.scrollDOM;
  el.classList.add('is-scrolling');
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_HIDE_DELAY);
}

function buildStateForContent(content: string): EditorState {
  return createMarkdownState({
    initialDoc: content,
    theme: currentThemeOpts(),
    onChange: (value) => editorStore.updateContent(value),
    onScroll: handleScroll,
  });
}

onMounted(() => {
  if (!containerRef.value) return;
  view = createMarkdownEditor({
    parent: containerRef.value,
    initialDoc: editorStore.content,
    theme: currentThemeOpts(),
    onChange: (value) => editorStore.updateContent(value),
    onScroll: handleScroll,
  });
  lastActiveTabId = editorStore.activeTabId;
  setEditorView(view);
});

// Unified handler for tab switches and external content updates. A tab switch
// is detected by a change in activeTabId; everything else is treated as an
// in-place content sync for the current tab (e.g. file reload).
watch(
  () => [editorStore.activeTabId, editorStore.content] as const,
  ([newId, newContent]) => {
    if (!view) return;

    if (lastActiveTabId !== null && lastActiveTabId !== newId) {
      // Tab switch: dehydrate the previous tab's state, rehydrate the target.
      tabStates.set(lastActiveTabId, view.state);
      const cached = tabStates.get(newId);
      tabStates.delete(newId);
      const target = cached ?? buildStateForContent(newContent);
      view.setState(target);
    } else {
      // Same tab — external content change (file open / reset). Diff and patch.
      const current = view.state.doc.toString();
      if (current !== newContent) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: newContent },
        });
      }
    }
    lastActiveTabId = newId;
  },
);

// Prune cached states for closed tabs so they don't pin memory.
watch(
  () => editorStore.tabs.map((t) => t.id).join('|'),
  () => {
    const live = new Set(editorStore.tabs.map((t) => t.id));
    for (const id of tabStates.keys()) {
      if (!live.has(id)) tabStates.delete(id);
    }
  },
);

// Reactive theme + font: reconfigure the theme compartment in place rather
// than rebuilding state, so cursor/selection survive the swap. Apply the
// reconfigure to dehydrated tab states too — otherwise switching to an old
// tab after a theme change would show the previous theme.
watch(
  [
    () => settingsStore.themeMode,
    () => settingsStore.colorScheme,
    () => settingsStore.editorFont,
    () => settingsStore.fontSize,
  ],
  () => {
    if (!view) return;
    const opts = currentThemeOpts();
    reconfigureTheme(view, opts);
    for (const [id, st] of tabStates) {
      tabStates.set(id, reconfigureThemeOnState(st, opts));
    }
  },
);

onUnmounted(() => {
  view?.destroy();
  view = null;
  tabStates.clear();
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
