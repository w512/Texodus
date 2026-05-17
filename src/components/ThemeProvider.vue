<template>
  <div class="theme-root" :class="resolvedTheme" :style="themeStyle">
    <slot></slot>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSettingsStore } from '../stores/settings';

const settingsStore = useSettingsStore();
const systemDark = ref(false);

let mq = null;
const updateSystemTheme = (e) => { systemDark.value = e.matches; };

onMounted(() => {
  mq = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.value = mq.matches;
  mq.addEventListener('change', updateSystemTheme);
});

onUnmounted(() => {
  mq?.removeEventListener('change', updateSystemTheme);
});

const resolvedTheme = computed(() => {
  if (settingsStore.themeMode === 'system') {
    return systemDark.value ? 'dark' : 'light';
  }
  return settingsStore.themeMode;
});

const themeStyle = computed(() => ({
  '--editor-font': settingsStore.editorFont,
  '--preview-font': settingsStore.previewFont,
}));
</script>

<style>
/* ── Design tokens ──────────────────────────────────────────── */
.theme-root {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  transition: background-color 0.25s, color 0.25s;
}

/* Light theme */
.theme-root.light {
  --bg-color:         #fafafa;
  --bg-secondary:     #f3f4f6;
  --toolbar-bg:       rgba(255,255,255,0.85);
  --border-color:     #e2e5ea;
  --text-color:       #1a1d23;
  --text-muted:       #6b7280;
  --accent-color:     #6366f1;
  --accent-subtle:    rgba(99, 102, 241, 0.12);
  --btn-hover:        rgba(0,0,0,0.05);
  --code-bg:          #1e1e2e;
  --inline-code-bg:   rgba(99,102,241,0.08);
  --blockquote-bg:    rgba(99,102,241,0.05);
  --scrollbar-thumb:        rgba(0,0,0,0.22);
  --scrollbar-thumb-hover:  rgba(0,0,0,0.4);
}

/* Dark theme */
.theme-root.dark {
  --bg-color:         #0d0f14;
  --bg-secondary:     #151821;
  --toolbar-bg:       rgba(16,18,26,0.88);
  --border-color:     #252836;
  --text-color:       #e2e4eb;
  --text-muted:       #6b7280;
  --accent-color:     #818cf8;
  --accent-subtle:    rgba(129, 140, 248, 0.15);
  --btn-hover:        rgba(255,255,255,0.06);
  --code-bg:          #0a0c10;
  --inline-code-bg:   rgba(129,140,248,0.12);
  --blockquote-bg:    rgba(129,140,248,0.07);
  --scrollbar-thumb:        rgba(255,255,255,0.22);
  --scrollbar-thumb-hover:  rgba(255,255,255,0.4);
}

/* Global resets */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  background: var(--bg-color);
  color: var(--text-color);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar styling — macOS-style overlay: invisible by default, fades in
   when the user hovers over a scrollable element. The 2px transparent border
   on the thumb (combined with background-clip: padding-box) gives it the
   characteristic inset look of native overlay scrollbars. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background-color: transparent;
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 6px;
  transition: background-color 0.25s ease;
}

/* Show thumb only when the user is hovering the scrollable element. */
*:hover::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb);
}
*:hover::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
}

/* Firefox / Gecko (no-op in Tauri's WebKit/WebView2, but kept for parity). */
* { scrollbar-width: thin; scrollbar-color: transparent transparent; }
*:hover { scrollbar-color: var(--scrollbar-thumb) transparent; }
</style>
