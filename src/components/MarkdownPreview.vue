<template>
  <div
    ref="previewRef"
    class="preview-content markdown-body"
    :style="{ fontFamily: settingsStore.previewFont, fontSize: settingsStore.fontSize + 'px' }"
    @click="handleLinkClick"
    @scroll="handleScroll"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { sanitizeMarkdownHtml } from '../services/markdownSanitizer';
import { renderMermaidBlocks } from '../services/mermaidRenderer';
import { marked, type Token } from 'marked';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const { setPreviewElement, syncFromPreview } = useMarkdownPreview();
const previewRef = ref<HTMLElement | null>(null);

// Debounce rendering (§6.2)
let renderTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 120;

// Cached last-rendered HTML — lets us skip a DOM thrash on theme/color-scheme
// changes (which re-trigger render but produce identical HTML for non-mermaid
// docs), avoiding flicker and preserving selection.
let lastRenderedHtml = '';

const isDarkPreview = computed(() => {
  if (settingsStore.themeMode === 'dark') return true;
  if (settingsStore.themeMode === 'light') return false;
  // 'system' — fall back to OS preference
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
});

// Walks block-level tokens and records the 0-indexed source line each block
// starts at. Used to attach `data-source-line` anchors for the line-based
// scroll sync. `space` tokens don't produce DOM output, so we skip them.
function collectBlockLines(tokens: Token[]): number[] {
  const lines: number[] = [];
  let line = 0;
  for (const token of tokens) {
    if (token.type !== 'space') lines.push(line);
    const raw = (token as { raw?: string }).raw ?? '';
    for (const c of raw) if (c === '\n') line++;
  }
  return lines;
}

function attachLineAnchors(container: HTMLElement, lines: number[]) {
  let i = 0;
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if (i >= lines.length) break;
    child.dataset.sourceLine = String(lines[i]);
    i++;
  }
}

const renderMarkdown = async () => {
  if (!previewRef.value) return;

  // Lex first so we can record per-block source line numbers, then parse the
  // already-tokenised tree (avoids tokenising twice via marked.parse).
  const tokens = marked.lexer(editorStore.content);
  const blockLines = collectBlockLines(tokens);
  const html = marked.parser(tokens) as string;
  const clean = sanitizeMarkdownHtml(html);

  const htmlChanged = clean !== lastRenderedHtml;
  if (htmlChanged) {
    lastRenderedHtml = clean;
    previewRef.value.innerHTML = clean;
  }

  await nextTick();

  // Mermaid replaces matching `<pre>` blocks with new `<div>`s — attach line
  // anchors AFTER so the replacements get the data attribute too.
  await renderMermaidBlocks(previewRef.value, {
    theme: isDarkPreview.value ? 'dark' : 'default',
  });

  if (htmlChanged) {
    attachLineAnchors(previewRef.value, blockLines);
  }

  // Lazy load Prism only when there are remaining code blocks (§6.2)
  if (previewRef.value.querySelector('pre code')) {
    const Prism = await import('prismjs');
    await import('../themes/prism.css');
    Prism.default.highlightAllUnder(previewRef.value);
  }
};

watch(
  () => editorStore.content,
  () => {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  },
  { immediate: true }
);

watch(
  [() => settingsStore.themeMode, () => settingsStore.colorScheme],
  () => {
    // Theme switch: drop the HTML cache so we re-emit the raw mermaid
    // `<pre>` blocks and let renderMermaidBlocks re-render them with the
    // new theme. Without this the previous run's themed SVGs would persist.
    lastRenderedHtml = '';
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  }
);

const toggleMarkdownCheckbox = (index: number) => {
  const original = editorStore.content;

  // Mask fenced code blocks AND inline code spans so checkboxes that happen
  // to appear inside `\`- [ ]\`` or fenced blocks aren't miscounted.
  const masked = original
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));

  // Regex to match markdown task list checkboxes: e.g., - [ ] or * [x]
  // Matches list items starting with list markers (optionally inside blockquotes)
  const checkboxRegex = /^[>\s]*([-*+]|\d+[.)])\s+(\[[ xX]\])/mg;

  let match: RegExpExecArray | null;
  let count = 0;
  let foundStart = -1;
  let isChecked = false;
  
  while ((match = checkboxRegex.exec(masked)) !== null) {
    if (count === index) {
      const cb = match[2]; // The checkbox portion: '[ ]', '[x]', or '[X]'
      foundStart = match.index + match[0].indexOf(cb);
      isChecked = cb !== '[ ]';
      break;
    }
    count++;
  }
  
  if (foundStart !== -1) {
    const newContent = 
      original.substring(0, foundStart) + 
      (isChecked ? '[ ]' : '[x]') + 
      original.substring(foundStart + 3);
    
    editorStore.updateContent(newContent);
  }
};

// Intercept clicks in the preview (external links and checkboxes)
const handleLinkClick = async (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target || !previewRef.value) return;

  // 1. Handle task list checkbox click
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    e.preventDefault(); // Prevent visual toggle desync
    const checkboxes = Array.from(
      previewRef.value.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    const index = checkboxes.indexOf(target);
    if (index !== -1) {
      toggleMarkdownCheckbox(index);
    }
    return;
  }

  // 2. Handle external link clicks (§3.2)
  const anchor = target.closest('a[href]');
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

const SCROLL_HIDE_DELAY = 1200;
let scrollHideTimer: ReturnType<typeof setTimeout> | null = null;
const handleScroll = (e: Event) => {
  syncFromPreview();
  const el = e.currentTarget as HTMLElement;
  el.classList.add('is-scrolling');
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_HIDE_DELAY);
};

let themeMediaQuery: MediaQueryList | null = null;
const handleSystemThemeChange = () => {
  if (settingsStore.themeMode === 'system') {
    lastRenderedHtml = '';
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  }
};

onMounted(() => {
  setPreviewElement(previewRef.value);
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeMediaQuery.addEventListener('change', handleSystemThemeChange);
});

onUnmounted(() => {
  if (renderTimer) clearTimeout(renderTimer);
  if (scrollHideTimer) clearTimeout(scrollHideTimer);
  setPreviewElement(null);
  themeMediaQuery?.removeEventListener('change', handleSystemThemeChange);
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
  /* position: relative makes `child.offsetTop` measure against this element
     (and `scrollTop`), which the line-anchor scroll sync depends on. */
  position: relative;
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
  color: var(--heading-color);
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
  color: var(--code-text);
  padding: 1.1rem 1.3rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
  font-size: 13px;
}

:deep(pre code) {
  color: var(--code-text);
  font-family: var(--editor-font, monospace);
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

:deep(input[type="checkbox"]) {
  margin-right: 0.5em;
  cursor: pointer;
  accent-color: var(--accent-color);
  vertical-align: middle;
}

/* ── Mermaid Diagrams ───────────────────────────────────────── */
:deep(.mermaid-preview-container) {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1.5em 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow-x: auto;
}

:deep(.mermaid-preview-container svg) {
  max-width: 100%;
  height: auto;
  display: block;
}

:deep(.mermaid-error-container) {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 1.5em 0;
  color: var(--text-color);
  font-family: inherit;
}

:deep(.mermaid-error-title) {
  font-weight: 600;
  color: #ef4444;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

:deep(.mermaid-error-text) {
  margin: 0;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-family: var(--editor-font, monospace);
  font-size: 0.8125rem;
  color: var(--text-color);
  overflow-x: auto;
  white-space: pre-wrap;
}

.theme-root.dark :deep(.mermaid-error-text) {
  background: rgba(0, 0, 0, 0.2);
}
</style>
