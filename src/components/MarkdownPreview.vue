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
      'input',
    ],
    ALLOWED_ATTR: ['href','src','alt','title','class','id','rel','type','checked'],
  });
  previewRef.value.innerHTML = clean;

  await nextTick();

  // Lazy load Mermaid only when there are mermaid blocks
  const mermaidBlocks = previewRef.value.querySelectorAll('pre code.language-mermaid');
  if (mermaidBlocks.length > 0) {
    try {
      const mermaidModule = await import('mermaid');
      const mermaid = mermaidModule.default || mermaidModule;
      
      const isDark = previewRef.value.closest('.theme-root')?.classList.contains('dark') || 
                     document.body.classList.contains('dark') || 
                     document.documentElement.classList.contains('dark');
      
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
      });

      for (let i = 0; i < mermaidBlocks.length; i++) {
        const block = mermaidBlocks[i];
        const codeText = block.textContent || '';
        const pre = block.parentElement;
        if (!pre) continue;

        const id = `mermaid-preview-${Date.now()}-${i}`;
        try {
          const { svg } = await mermaid.render(id, codeText);
          const container = document.createElement('div');
          container.className = 'mermaid-preview-container';
          container.innerHTML = svg;
          pre.replaceWith(container);
        } catch (err) {
          console.error('Mermaid render error:', err);
          
          const errorContainer = document.createElement('div');
          errorContainer.className = 'mermaid-error-container';
          
          const errorTitle = document.createElement('div');
          errorTitle.className = 'mermaid-error-title';
          errorTitle.textContent = 'Mermaid Rendering Error';
          errorContainer.appendChild(errorTitle);

          const errorText = document.createElement('pre');
          errorText.className = 'mermaid-error-text';
          errorText.textContent = err.message || String(err);
          errorContainer.appendChild(errorText);

          pre.replaceWith(errorContainer);
          
          const tempEl = document.getElementById(id);
          if (tempEl) tempEl.remove();
        }
      }
    } catch (importErr) {
      console.error('Failed to load or run Mermaid:', importErr);
    }
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
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  },
  { immediate: true }
);

watch(
  [() => settingsStore.themeMode, () => settingsStore.colorScheme],
  () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  }
);

const toggleMarkdownCheckbox = (index) => {
  const original = editorStore.content;
  
  // Mask fenced code blocks to prevent matching checkboxes in them
  const masked = original.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));
  
  // Regex to match markdown task list checkboxes: e.g., - [ ] or * [x]
  // Matches list items starting with list markers (optionally inside blockquotes)
  const checkboxRegex = /^[>\s]*([-*+]|\d+[.)])\s+(\[[ xX]\])/mg;
  
  let match;
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
const handleLinkClick = async (e) => {
  // 1. Handle task list checkbox click
  if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
    e.preventDefault(); // Prevent visual toggle desync
    const checkboxes = Array.from(previewRef.value.querySelectorAll('input[type="checkbox"]'));
    const index = checkboxes.indexOf(e.target);
    if (index !== -1) {
      toggleMarkdownCheckbox(index);
    }
    return;
  }

  // 2. Handle external link clicks (§3.2)
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

const SCROLL_HIDE_DELAY = 1200;
let scrollHideTimer = null;
const handleScroll = (e) => {
  syncFromPreview();
  const el = e.currentTarget;
  el.classList.add('is-scrolling');
  clearTimeout(scrollHideTimer);
  scrollHideTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_HIDE_DELAY);
};

let themeMediaQuery = null;
const handleSystemThemeChange = () => {
  if (settingsStore.themeMode === 'system') {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, DEBOUNCE_MS);
  }
};

onMounted(() => {
  setPreviewElement(previewRef.value);
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeMediaQuery.addEventListener('change', handleSystemThemeChange);
});

onUnmounted(() => {
  clearTimeout(renderTimer);
  clearTimeout(scrollHideTimer);
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
