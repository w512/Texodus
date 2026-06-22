<template>
  <Transition name="searchbar">
    <div v-if="isOpen" class="searchbar">
      <div class="searchbar-field" :class="{ 'has-error': hasError }">
        <input
          ref="inputRef"
          type="text"
          class="searchbar-input"
          placeholder="Find in document…"
          spellcheck="false"
          :value="queryText"
          @input="setQuery(($event.target as HTMLInputElement).value)"
          @keydown="onKeydown"
        />
        <span class="searchbar-count">{{ countLabel }}</span>
        <div class="searchbar-toggles">
          <button
            type="button"
            class="sb-toggle"
            :class="{ active: caseSensitive }"
            :aria-pressed="caseSensitive"
            title="Match case"
            @click="setCaseSensitive(!caseSensitive)"
          >Aa</button>
          <button
            type="button"
            class="sb-toggle"
            :class="{ active: wholeWord }"
            :aria-pressed="wholeWord"
            title="Whole word"
            @click="setWholeWord(!wholeWord)"
          >W</button>
          <button
            type="button"
            class="sb-toggle"
            :class="{ active: useRegex }"
            :aria-pressed="useRegex"
            title="Regular expression"
            @click="setRegex(!useRegex)"
          >.*</button>
        </div>
      </div>

      <div class="searchbar-nav">
        <button type="button" class="sb-btn" title="Previous match (Shift+Enter)" :disabled="!matchCount" @click="prev">
          <span class="sb-icon">↑</span>
        </button>
        <button type="button" class="sb-btn" title="Next match (Enter)" :disabled="!matchCount" @click="next">
          <span class="sb-icon">↓</span>
        </button>
        <button type="button" class="sb-btn" title="Close (Esc)" @click="close">
          <span class="sb-icon">✕</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useDocumentSearch } from '../composables/useDocumentSearch';
import { useSettingsStore } from '../stores/settings';
import { useEditorStore } from '../stores/editor';

const {
  isOpen, queryText, caseSensitive, useRegex, wholeWord,
  matchCount, currentIndex, hasError, focusNonce,
  close, setQuery, setCaseSensitive, setRegex, setWholeWord, next, prev, refresh, retarget,
} = useDocumentSearch();

const settingsStore = useSettingsStore();
const editorStore = useEditorStore();
const inputRef = ref<HTMLInputElement | null>(null);

const countLabel = computed(() => {
  if (!queryText.value.trim()) return '';
  if (hasError.value) return 'Bad pattern';
  if (matchCount.value === 0) return 'No results';
  return `${currentIndex.value}/${matchCount.value}`;
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) prev(); else next();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

// Focus + select the field whenever search is (re)opened via Cmd/Ctrl+F.
watch(focusNonce, async () => {
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
});

// Layout switch changes which pane the search targets (and whether the editor
// is mounted at all). Re-run after the DOM settles; a second pass on the next
// frame catches the editor finishing its mount when entering split/focus.
watch(() => settingsStore.layoutMode, () => {
  if (!isOpen.value) return;
  void nextTick(() => { retarget(); requestAnimationFrame(() => retarget()); });
});

// Document edits / tab switches change matches — keep highlight + counter live
// without stealing the selection (refresh re-runs in non-reselect mode). Deferred
// to nextTick so a tab switch's editor setState lands before we re-push matches.
watch(() => [editorStore.content, editorStore.activeTabId], () => {
  if (isOpen.value) void nextTick(refresh);
});
</script>

<style scoped>
.searchbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  height: 40px;
  padding: 0 0.75rem;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  z-index: 15;
}

.searchbar-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
  max-width: 560px;
  padding: 0.15rem 0.4rem 0.15rem 0.6rem;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.searchbar-field.has-error {
  border-color: #d04b4b;
}

.searchbar-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-color);
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.2rem 0;
}

.searchbar-input:focus {
  outline: none;
}

.searchbar-input::placeholder {
  color: var(--text-muted);
}

.searchbar-count {
  flex-shrink: 0;
  min-width: 3.5rem;
  text-align: right;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.searchbar-toggles {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.sb-toggle {
  min-width: 1.6rem;
  height: 1.5rem;
  padding: 0 0.3rem;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sb-toggle:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.sb-toggle.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.searchbar-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.sb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sb-btn:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.sb-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.sb-icon {
  font-size: 0.85rem;
  line-height: 1;
}

.searchbar-enter-active,
.searchbar-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.searchbar-enter-from,
.searchbar-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
