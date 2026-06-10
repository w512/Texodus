<template>
  <div class="scheme-grid">
    <button
      v-for="scheme in COLOR_SCHEMES"
      :key="scheme.id"
      class="scheme-swatch"
      :class="{ selected: modelValue === scheme.id }"
      :title="scheme.label"
      :style="{
        '--sl': scheme.light.bgColor,
        '--sd': scheme.dark.bgColor,
        '--sa': scheme.light.accentColor,
      }"
      @click="emit('update:modelValue', scheme.id)"
    >
      <div class="swatch-halves">
        <div class="swatch-h light-h"></div>
        <div class="swatch-h dark-h"></div>
      </div>
      <div class="swatch-accent"></div>
      <span class="swatch-name">{{ scheme.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { COLOR_SCHEMES, type ColorSchemeId } from '../themes';

defineProps<{
  modelValue: ColorSchemeId;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', id: ColorSchemeId): void;
}>();
</script>

<style scoped>
.scheme-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.scheme-swatch {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 7px;
  overflow: hidden;
  padding: 0;
  background: none;
  transition: border-color 0.15s, transform 0.1s;
}

.scheme-swatch:hover {
  transform: scale(1.04);
}

.scheme-swatch.selected {
  border-color: var(--accent-color);
}

.swatch-halves {
  display: flex;
  height: 32px;
}

.swatch-h.light-h {
  flex: 1;
  background: var(--sl);
}

.swatch-h.dark-h {
  flex: 1;
  background: var(--sd);
}

.swatch-accent {
  height: 3px;
  background: var(--sa);
}

.swatch-name {
  font-size: 0.5625rem;
  text-align: center;
  padding: 3px 2px;
  color: var(--text-color);
  background: var(--bg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
</style>
