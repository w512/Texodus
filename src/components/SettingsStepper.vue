<template>
  <div class="stepper">
    <button
      class="stepper-btn"
      :disabled="modelValue <= min"
      :aria-label="`Decrease ${label}`"
      @click="emit('update:modelValue', modelValue - step)"
    >−</button>
    <select
      :id="id"
      class="stepper-value"
      :value="modelValue"
      @change="emit('update:modelValue', Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="option in options" :key="option" :value="option">{{ format(option) }}</option>
    </select>
    <button
      class="stepper-btn"
      :disabled="modelValue >= max"
      :aria-label="`Increase ${label}`"
      @click="emit('update:modelValue', modelValue + step)"
    >+</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// `options` must be sorted ascending — min/max are taken from the ends.
// The −/+ buttons emit raw `value ± step`; the store setter clamps/rounds.
const props = withDefaults(defineProps<{
  id: string;
  label: string;
  modelValue: number;
  options: readonly number[];
  step: number;
  format?: (value: number) => string;
}>(), {
  format: (value: number) => String(value),
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const min = computed(() => props.options[0]);
const max = computed(() => props.options[props.options.length - 1]);
</script>

<style scoped>
.stepper {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
  max-width: 58%;
  flex: 1;
}

.stepper-btn {
  width: 28px;
  background: transparent;
  border: none;
  color: var(--text-color);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.stepper-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stepper-value {
  flex: 1;
  background: transparent;
  border: none;
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  padding: 0.35rem 0.4rem;
  color: var(--text-color);
  font-size: 0.8125rem;
  text-align: center;
  cursor: pointer;
}

.stepper-value:focus { outline: none; background: var(--btn-hover); }
</style>
