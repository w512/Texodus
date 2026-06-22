<template>
  <div
    ref="previewRef"
    class="preview-content markdown-body"
    :style="{ fontFamily: settingsStore.previewFont, fontSize: settingsStore.fontSize + 'pt', lineHeight: String(settingsStore.lineHeight) }"
    @click="handleLinkClick"
    @scroll="handleScroll"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { useMarkdownPreview } from '../composables/useMarkdownPreview';
import { useDocumentSearch } from '../composables/useDocumentSearch';
import { sanitizeMarkdownHtml } from '../services/markdownSanitizer';
import { renderMermaidBlocks } from '../services/mermaidRenderer';
import { marked, type Token } from 'marked';
import { convertFileSrc } from '@tauri-apps/api/core';
import { dirname, hasUrlScheme, isAbsolutePath, resolveLocalPath } from '../utils/path';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const { setPreviewElement, syncFromPreview } = useMarkdownPreview();
const { refresh: refreshSearch } = useDocumentSearch();
const previewRef = ref<HTMLElement | null>(null);

// Debounce rendering (§6.2)
let renderTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 120;

// Cached last-rendered HTML — lets us skip a DOM thrash when content arrives
// unchanged (e.g. theme reflow re-triggers render but the markdown didn't
// change), avoiding flicker and preserving selection. `forceRerender` lets
// callers (tab switch, theme change) demand a write even when the diff says
// nothing changed — crucial for the empty→empty case where the cached
// sentinel and fresh output would otherwise both be '' and miss the swap.
let lastRenderedHtml = '';
let forceRerender = true;

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

// Rewrite local `<img>` sources (relative paths or absolute filesystem paths)
// into Tauri asset-protocol URLs so the webview can actually load them under
// the CSP. Relative paths resolve against the open file's directory; if no
// file is open we skip the rewrite and the image will fail to load until the
// user saves the document.
function rewriteLocalImages(container: HTMLElement, filePath: string | null) {
  const baseDir = filePath ? dirname(filePath) : '';
  for (const img of Array.from(container.querySelectorAll('img'))) {
    const src = img.getAttribute('src');
    if (!src || hasUrlScheme(src)) continue;
    if (!isAbsolutePath(src) && !baseDir) continue;
    const abs = resolveLocalPath(baseDir, src);
    img.src = convertFileSrc(abs);
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

  const htmlChanged = forceRerender || clean !== lastRenderedHtml;
  if (htmlChanged) {
    lastRenderedHtml = clean;
    forceRerender = false;
    previewRef.value.innerHTML = clean;
    rewriteLocalImages(previewRef.value, editorStore.filePath);
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

  // Re-apply search highlights against the freshly rendered DOM — the previous
  // Range objects are detached once innerHTML is replaced.
  refreshSearch();
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
    // Theme switch: force a fresh write so mermaid blocks pick up the new
    // theme. Without this the previous run's themed SVGs would persist.
    forceRerender = true;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  }
);

// File path change ⇒ relative image paths resolve against a new base dir,
// AND the active tab may have flipped to a different (or empty) document.
// Force a fresh write so the new content reaches the DOM even when the
// diff is empty-vs-empty.
watch(
  () => editorStore.filePath,
  () => {
    forceRerender = true;
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
  line-height: var(--line-height, 1.75);
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
  margin: 1.5em 0;
  overflow: hidden;
}

:deep(.mermaid-toolbar) {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color);
}

:deep(.mermaid-toolbar-spacer) {
  flex: 1;
}

:deep(.mermaid-action-button) {
  padding: 0.28rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-color);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

:deep(.mermaid-action-button:hover) {
  background: var(--btn-hover);
  color: var(--accent-color);
}

:deep(.mermaid-zoom-label) {
  min-width: 3rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}

:deep(.mermaid-viewport) {
  min-height: 220px;
  max-height: 70vh;
  padding: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  cursor: grab;
}

:deep(.mermaid-viewport.is-dragging) {
  cursor: grabbing;
  user-select: none;
}

:deep(.mermaid-canvas) {
  transform-origin: center center;
  transition: transform 0.12s ease;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.mermaid-preview-container svg) {
  max-width: 100%;
  height: auto;
  display: block;
  flex: 0 0 auto;
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

:deep(.mermaid-error-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}

:deep(.mermaid-error-title) {
  font-weight: 700;
  color: #ef4444;
  font-size: 0.95rem;
}

:deep(.mermaid-error-hint) {
  margin-bottom: 0.75rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
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
