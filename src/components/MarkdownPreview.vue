<template>
  <div
    ref="previewRef"
    class="preview-content markdown-body"
    :style="{ fontFamily: settingsStore.previewFont, fontSize: settingsStore.fontSize + 'px' }"
    @click="handleLinkClick"
    @scroll="handleScroll"
  ></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const { setPreviewElement, syncFromPreview } = useMarkdownPreview();
const previewRef = ref(null);

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

// Debounce rendering (§6.2)
let renderTimer = null;
const DEBOUNCE_MS = 120;

const renderMarkdown = async () => {
  if (!previewRef.value) return;
  const raw = await marked.parse(editorStore.content);
  // Sanitize to prevent XSS (§3.2). External links open via shell.open,
  // so 'target' is unnecessary; 'rel' is allowed for safe attribution.
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','hr',
      'ul','ol','li','blockquote','pre','code',
      'strong','em','del','a','img','table','thead',
      'tbody','tr','th','td','sup','sub','span','div',
    ],
    ALLOWED_ATTR: ['href','src','alt','title','class','id','rel'],
  });
  previewRef.value.innerHTML = clean;

  await nextTick();
  // Lazy load Prism only when there are code blocks (§6.2)
  if (previewRef.value.querySelector('pre code')) {
    const Prism = await import('prismjs');
    await import('prismjs/themes/prism-tomorrow.css');
    Prism.default.highlightAllUnder(previewRef.value);
  }
};

watch(
  () => editorStore.content,
  () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  },
  { immediate: true }
);

// Intercept external link clicks → open in system browser (§3.2)
const handleLinkClick = async (e) => {
  const anchor = e.target.closest('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return; // allow in-page anchors

  e.preventDefault();
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(href);
  } catch {
    // fallback: do nothing
  }
};

const handleScroll = () => syncFromPreview();

onMounted(() => setPreviewElement(previewRef.value));
onUnmounted(() => {
  clearTimeout(renderTimer);
  setPreviewElement(null);
});
</script>

<style scoped>
.preview-content {
  padding: 2rem 2.5rem;
  height: 100%;
  line-height: 1.75;
  color: var(--text-color);
  box-sizing: border-box;
  overflow-y: auto;
  transition: color 0.2s;
}

/* ── Markdown typography ──────────────────────────────────────── */
:deep(h1),
:deep(h2),
:deep(h3),
:deep(h4),
:deep(h5),
:deep(h6) {
  font-weight: 700;
  line-height: 1.3;
  /* Fixed top gap so larger headings don't get a disproportionate margin
     (em margins scale with the heading's own font-size). */
  margin: 1.6rem 0 0.6rem;
}

:deep(h1) { font-size: 1.85em; }
:deep(h2) { font-size: 1.45em; }
:deep(h3) { font-size: 1.2em; }
:deep(h4) { font-size: 1.05em; }
:deep(h5) { font-size: 0.95em; color: var(--text-muted); }
:deep(h6) { font-size: 0.875em; color: var(--text-muted); }

/* Underline only the top two levels — GitHub-style document structure. */
:deep(h1),
:deep(h2) {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

/* No runaway gap above the document's first block. */
.preview-content > :deep(:first-child) { margin-top: 0; }

:deep(p) { margin: 0.85em 0; }

:deep(a) {
  color: var(--accent-color);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}
:deep(a:hover) { border-color: var(--accent-color); }

:deep(blockquote) {
  margin: 1em 0;
  padding: 0.5em 1.25em;
  border-left: 4px solid var(--accent-color);
  background: var(--blockquote-bg);
  border-radius: 0 6px 6px 0;
  color: var(--text-muted);
  font-style: italic;
}

:deep(pre) {
  background: var(--code-bg);
  padding: 1.1rem 1.3rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
  font-size: 13px;
}

:deep(code):not(:where(pre *)) {
  background: var(--inline-code-bg);
  padding: 0.15em 0.45em;
  border-radius: 4px;
  font-size: 0.875em;
}

:deep(img) {
  max-width: 100%;
  border-radius: 6px;
}

:deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
:deep(th),
:deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5em 0.85em;
}
:deep(th) { background: var(--toolbar-bg); font-weight: 600; }

:deep(hr) {
  border: none;
  border-top: 2px solid var(--border-color);
  margin: 1.5em 0;
}
</style>
