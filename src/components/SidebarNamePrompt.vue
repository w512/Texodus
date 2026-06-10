<template>
  <div class="sidebar-prompt-backdrop" @click.self="emit('cancel')">
    <form class="sidebar-prompt" @submit.prevent="emit('confirm', value)">
      <label class="sidebar-prompt__label" for="sidebar-name-input">{{ title }}</label>
      <input
        id="sidebar-name-input"
        ref="inputRef"
        v-model="value"
        class="sidebar-prompt__input"
        type="text"
        @keydown.escape.prevent="emit('cancel')"
      />
      <div class="sidebar-prompt__actions">
        <button type="button" @click="emit('cancel')">Cancel</button>
        <button type="submit">OK</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

// Mounted fresh on every open (parent v-if), so the initial value and the
// focus/select happen naturally in setup/onMounted.
const props = defineProps<{
  title: string;
  initialValue: string;
}>();

const emit = defineEmits<{
  (e: 'confirm', value: string): void;
  (e: 'cancel'): void;
}>();

const value = ref(props.initialValue);
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
  inputRef.value?.select();
});
</script>

<style scoped>
.sidebar-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
}

.sidebar-prompt {
  width: min(360px, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  color: var(--text-color);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
}

.sidebar-prompt__label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
}

.sidebar-prompt__input {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-color);
  font: inherit;
}

.sidebar-prompt__input:focus {
  outline: 2px solid var(--accent-subtle);
  border-color: var(--accent-color);
}

.sidebar-prompt__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.sidebar-prompt__actions button {
  padding: 0.42rem 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-secondary);
  color: var(--text-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.sidebar-prompt__actions button:hover {
  background: var(--btn-hover);
}
</style>
