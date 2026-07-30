<template>
  <div
    ref="menuRef"
    class="app-context-menu"
    role="menu"
    tabindex="-1"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @click.stop
    @keydown="handleKeydown"
  >
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

const VIEWPORT_PADDING = 8;

const props = defineProps<{
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const menuRef = ref<HTMLElement | null>(null);
const position = reactive({ x: props.x, y: props.y });
let previouslyFocused: HTMLElement | null = null;

function menuItems(): HTMLElement[] {
  if (!menuRef.value) return [];
  return Array.from(menuRef.value.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
  ));
}

function clampToViewport(): void {
  const menu = menuRef.value;
  if (!menu) return;
  const rect = menu.getBoundingClientRect();
  const width = rect.width || menu.offsetWidth;
  const height = rect.height || menu.offsetHeight;
  const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING);
  const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING);
  position.x = Math.max(VIEWPORT_PADDING, Math.min(props.x, maxX));
  position.y = Math.max(VIEWPORT_PADDING, Math.min(props.y, maxY));
}

async function positionAndFocus(): Promise<void> {
  position.x = props.x;
  position.y = props.y;
  await nextTick();
  clampToViewport();
  menuItems()[0]?.focus();
}

function focusRelative(delta: number): void {
  const items = menuItems();
  if (items.length === 0) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
  items[(start + delta + items.length) % items.length].focus();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
  } else if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault();
    focusRelative(1);
  } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
    event.preventDefault();
    focusRelative(-1);
  } else if (event.key === 'Home') {
    event.preventDefault();
    menuItems()[0]?.focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    menuItems().at(-1)?.focus();
  }
}

watch(() => [props.x, props.y], () => { void positionAndFocus(); });

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  window.addEventListener('resize', clampToViewport);
  void positionAndFocus();
});

onUnmounted(() => {
  window.removeEventListener('resize', clampToViewport);
  previouslyFocused?.focus();
});
</script>

<style scoped>
.app-context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 180px;
  padding: 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-color);
  color: var(--text-color);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}
</style>
