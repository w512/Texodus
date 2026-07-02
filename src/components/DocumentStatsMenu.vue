<template>
  <div class="stats-menu" ref="menuContainer">
    <button class="trigger icon-only" @click="toggleMenu" title="Document Statistics">
      <span class="trigger-icon" :style="{ '--icon': `url(${iconInfo})` }"></span>
    </button>
    
    <div v-if="isOpen" class="dropdown-menu">
      <div class="menu-header">Document Statistics</div>
      
      <div class="stat-item">
        <span class="stat-label">Words</span>
        <span class="stat-value">{{ stats.words }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Characters (no spaces)</span>
        <span class="stat-value">{{ stats.charsNoSpaces }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Characters (with spaces)</span>
        <span class="stat-value">{{ stats.chars }}</span>
      </div>
      
      <div class="menu-divider"></div>
      
      <div class="stat-item">
        <span class="stat-label">Reading Time</span>
        <span class="stat-value">{{ readingTime }} min</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useEditorStore } from '../stores/editor';
import { computeDocumentStats, type DocumentStats } from '../services/documentStats';
import iconInfo from '../assets/icons/icons8-info-100.png';

const isOpen = ref(false);
const menuContainer = ref<HTMLElement | null>(null);
const editorStore = useEditorStore();

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

const closeMenu = (e: MouseEvent) => {
  if (menuContainer.value && !menuContainer.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', closeMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenu);
  if (statsTimer) clearTimeout(statsTimer);
});

// ── Statistics ────────────────────────────────────────────────────────────
// Counted on the document's plain text (markdown syntax, URLs, code blocks
// and frontmatter excluded — see services/documentStats). Lexing the whole
// document on every keystroke would be wasted work while the dropdown is
// closed, so stats compute on open and re-compute debounced while it stays
// open during edits.

const STATS_DEBOUNCE_MS = 300;
const stats = ref<DocumentStats>({ words: 0, chars: 0, charsNoSpaces: 0 });
let statsTimer: ReturnType<typeof setTimeout> | null = null;

watch(isOpen, (open) => {
  if (!open) return;
  if (statsTimer) {
    clearTimeout(statsTimer);
    statsTimer = null;
  }
  stats.value = computeDocumentStats(editorStore.content);
});

watch(
  () => editorStore.content,
  () => {
    if (!isOpen.value) return;
    if (statsTimer) clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
      statsTimer = null;
      stats.value = computeDocumentStats(editorStore.content);
    }, STATS_DEBOUNCE_MS);
  },
);

const readingTime = computed(() => {
  // Average reading speed is ~200 words per minute.
  const minutes = Math.ceil(stats.value.words / 200);
  return minutes > 0 ? minutes : 1;
});
</script>

<style scoped>
.stats-menu {
  position: relative;
  display: inline-block;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  height: 24px;
}

.trigger:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.trigger.icon-only {
  padding: 0.25rem 0.35rem;
}

.trigger-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
  transition: transform 0.15s;
}

.trigger:hover .trigger-icon { transform: scale(1.1); }
.trigger:active { transform: scale(0.94); }

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 280px;
  background: var(--bg-color, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 8px 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.menu-header {
  padding: 4px 16px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  color: var(--text-color);
  font-size: 0.85rem;
}

.stat-label {
  opacity: 0.8;
  white-space: nowrap;
}

.stat-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 6px 0;
  opacity: 0.6;
}
</style>
