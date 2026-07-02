<template>
  <div class="format-menu" ref="menuContainer">
    <button class="trigger" @click="toggleMenu" title="Format">
      <span class="trigger-text">Aa <span class="caret">▼</span></span>
    </button>
    
    <div v-if="isOpen" class="dropdown-menu">
      <div class="menu-item" @click="format('bold')">
        <span class="icon"><b>B</b></span>
        <span class="label">Bold</span>
        <span class="shortcut">⌘B</span>
      </div>
      <div class="menu-item" @click="format('italic')">
        <span class="icon"><i style="font-family: serif">I</i></span>
        <span class="label">Italic</span>
        <span class="shortcut">⌘I</span>
      </div>
      <div class="menu-item" @click="format('underline')">
        <span class="icon"><u>U</u></span>
        <span class="label">Underline</span>
        <span class="shortcut">⌘U</span>
      </div>
      <div class="menu-item" @click="format('strikethrough')">
        <span class="icon"><s>S</s></span>
        <span class="label">Strikethrough</span>
        <span class="shortcut">⇧⌘E</span>
      </div>
      <div class="menu-item" @click="format('link')">
        <span class="icon">🔗</span>
        <span class="label">Link</span>
        <span class="shortcut">^⇧L</span>
      </div>
      <div class="menu-item" @click="format('image')">
        <span class="icon">🖼️</span>
        <span class="label">Images</span>
        <span class="shortcut"></span>
      </div>
      <div class="menu-item" @click="format('table')">
        <span class="icon">▦</span>
        <span class="label">Table</span>
        <span class="shortcut">⌥⌘T</span>
      </div>
      
      <div class="menu-divider"></div>
      
      <div class="menu-item" @click="format('list')">
        <span class="icon">•</span>
        <span class="label">Unordered List</span>
        <span class="shortcut">^U</span>
      </div>
      <div class="menu-item" @click="format('ordered_list')">
        <span class="icon">1.</span>
        <span class="label">Ordered List</span>
        <span class="shortcut">^⇧U</span>
      </div>
      <div class="menu-item" @click="format('task_list')">
        <span class="icon">☑</span>
        <span class="label">Task List</span>
        <span class="shortcut">⇧⌘T</span>
      </div>
      
      <div class="menu-divider"></div>
      
      <div class="menu-item" @click="format('blockquote')">
        <span class="icon">❞</span>
        <span class="label">Block Quote</span>
        <span class="shortcut">⇧⌘B</span>
      </div>
      <div class="menu-item" @click="format('code')">
        <span class="icon">{}</span>
        <span class="label">Inline Code</span>
        <span class="shortcut">⌘K</span>
      </div>
      <div class="menu-item" @click="format('block_code')">
        <span class="icon">{ }</span>
        <span class="label">Block Code</span>
        <span class="shortcut">⇧⌘K</span>
      </div>
      <div class="menu-item" @click="format('inline_math')">
        <span class="icon">√x</span>
        <span class="label">Inline Math</span>
        <span class="shortcut">^K</span>
      </div>
      <div class="menu-item" @click="format('block_math')">
        <span class="icon">√x</span>
        <span class="label">Block Math</span>
        <span class="shortcut">^⇧K</span>
      </div>
      
      <div class="menu-divider"></div>
      
      <div class="menu-item" @click="format('heading1')">
        <span class="icon">H<span class="sub">1</span></span>
        <span class="label">Heading 1</span>
        <span class="shortcut">⌘1</span>
      </div>
      <div class="menu-item" @click="format('heading2')">
        <span class="icon">H<span class="sub">2</span></span>
        <span class="label">Heading 2</span>
        <span class="shortcut">⌘2</span>
      </div>
      <div class="menu-item" @click="format('heading3')">
        <span class="icon">H<span class="sub">3</span></span>
        <span class="label">Heading 3</span>
        <span class="shortcut">⌘3</span>
      </div>
      <div class="menu-item" @click="format('heading4')">
        <span class="icon">H<span class="sub">4</span></span>
        <span class="label">Heading 4</span>
        <span class="shortcut">⌘4</span>
      </div>
      <div class="menu-item" @click="format('heading5')">
        <span class="icon">H<span class="sub">5</span></span>
        <span class="label">Heading 5</span>
        <span class="shortcut">⌘5</span>
      </div>
      <div class="menu-item" @click="format('heading6')">
        <span class="icon">H<span class="sub">6</span></span>
        <span class="label">Heading 6</span>
        <span class="shortcut">⌘6</span>
      </div>
      <div class="menu-item" @click="format('paragraph')">
        <span class="icon">¶</span>
        <span class="label">Paragraph</span>
        <span class="shortcut">⇧⌘0</span>
      </div>
      <div class="menu-item" @click="format('horizontal_rule')">
        <span class="icon">☰</span>
        <span class="label">Horizontal Rule</span>
        <span class="shortcut">⌥⌘R</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const isOpen = ref(false);
const menuContainer = ref<HTMLElement | null>(null);

const emit = defineEmits(['format']);

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

const closeMenu = (e: MouseEvent) => {
  if (menuContainer.value && !menuContainer.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

const format = (type: string) => {
  emit('format', type);
  isOpen.value = false;
};

onMounted(() => {
  document.addEventListener('click', closeMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenu);
});
</script>

<style scoped>
.format-menu {
  position: relative;
  display: inline-block;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--toolbar-bg);
  border: 1px solid var(--border-color);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  height: 24px;
}

.trigger:hover {
  background: var(--btn-hover);
  border-color: var(--accent-subtle);
}

.trigger-text {
  display: flex;
  align-items: center;
  gap: 4px;
}

.caret {
  font-size: 0.6rem;
  opacity: 0.7;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 260px;
  max-height: calc(100vh - 50px);
  overflow-y: auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 6px 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.dropdown-menu::-webkit-scrollbar {
  width: 8px;
}
.dropdown-menu::-webkit-scrollbar-track {
  background: transparent;
}
.dropdown-menu::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb, rgba(128, 128, 128, 0.4));
  border-radius: 4px;
}
.dropdown-menu::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover, rgba(128, 128, 128, 0.6));
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, color 0.1s;
  color: var(--text-color);
  font-size: 0.85rem;
}

.menu-item:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.icon {
  width: 24px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  margin-right: 8px;
  font-size: 1rem;
  opacity: 0.8;
}

.sub {
  font-size: 0.6em;
  vertical-align: sub;
}

.label {
  flex: 1;
  text-align: left;
}

.shortcut {
  font-size: 0.75rem;
  opacity: 0.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 6px 0;
  opacity: 0.6;
}
</style>
