<template>
  <Transition name="searchbar">
    <div v-if="isOpen" class="searchbar">
      <div class="searchbar-fields">
        <div class="searchbar-field" :class="{ 'has-error': hasError }">
          <button
            type="button"
            class="sb-expand"
            :aria-expanded="showReplace"
            :title="showReplace ? 'Hide replace' : 'Show replace'"
            @click="toggleReplace"
          >{{ showReplace ? '▴' : '▾' }}</button>
          <input
            ref="inputRef"
            type="text"
            class="searchbar-input searchbar-find"
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
            <button
              type="button"
              class="sb-toggle sb-replace-toggle"
              :class="{ active: showReplace }"
              :aria-pressed="showReplace"
              aria-label="Replace"
              :title="showReplace ? 'Hide replace' : 'Show replace'"
              @click="toggleReplace"
            >⇄</button>
          </div>
        </div>

        <div v-if="showReplace" class="searchbar-field replace-field">
          <input
            ref="replaceInputRef"
            type="text"
            class="searchbar-input searchbar-replace"
            placeholder="Replace with…"
            spellcheck="false"
            :value="replacementText"
            :disabled="!canReplace"
            @input="setReplacement(($event.target as HTMLInputElement).value)"
            @keydown="onReplaceKeydown"
          />
          <button
            type="button"
            class="sb-btn sb-text-btn"
            title="Replace (Enter)"
            :disabled="!matchCount || !canReplace"
            @click="replaceCurrent"
          >Replace</button>
          <button
            type="button"
            class="sb-btn sb-text-btn"
            title="Replace all (Cmd/Ctrl+Enter)"
            :disabled="!matchCount || !canReplace"
            @click="replaceAll"
          >All</button>
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
  replacementText, showReplace, canReplace,
  matchCount, currentIndex, hasError, focusNonce,
  close, setQuery, setCaseSensitive, setRegex, setWholeWord, next, prev, refresh, retarget,
  setReplacement, toggleReplace, replaceCurrent, replaceAll,
} = useDocumentSearch();

const settingsStore = useSettingsStore();
const editorStore = useEditorStore();
const inputRef = ref<HTMLInputElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);

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

function onReplaceKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) replaceAll();
    else replaceCurrent();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

// Focus + select the field whenever search is (re)opened via Cmd/Ctrl+F.
watch(focusNonce, async () => {
  await nextTick();
  const input = showReplace.value ? replaceInputRef.value : inputRef.value;
  input?.focus();
  input?.select();
});

// Opening the replace row moves the caret there so typing lands in the
// replacement field instead of the find field.
watch(showReplace, async (visible) => {
  if (!visible) return;
  await nextTick();
  replaceInputRef.value?.focus();
  replaceInputRef.value?.select();
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
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  z-index: 15;
}

.searchbar-fields {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  max-width: 560px;
}

.searchbar-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  padding: 0.15rem 0.4rem 0.15rem 0.6rem;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.sb-expand {
  flex-shrink: 0;
  width: 1.15rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.sb-expand:hover {
  color: var(--accent-color);
}

.searchbar-field.has-error {
  border-color: var(--danger-color);
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

.searchbar-input:disabled {
  opacity: 0.55;
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

.sb-text-btn {
  width: auto;
  padding: 0 0.45rem;
  font-size: 0.75rem;
  font-weight: 600;
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
