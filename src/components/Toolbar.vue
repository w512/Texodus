<template>
  <header class="toolbar glass">
    <!-- Left: File actions -->
    <div class="toolbar-group">
      <button id="btn-new" class="tb-btn" title="New File (⌘N)" @click="$emit('new-file')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconNew})` }"></span>
      </button>
      <button id="btn-open" class="tb-btn" title="Open File (⌘O)" @click="$emit('open-file')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconOpen})` }"></span>
      </button>
      <button id="btn-save" class="tb-btn" :class="{ 'dirty': isDirty }" title="Save (⌘S)" @click="$emit('save-file')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconSave})` }"></span>
      </button>
      <button id="btn-save-as" class="tb-btn" title="Save As (⌘⇧S)" @click="$emit('save-as')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconSaveAs})` }"></span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Center: Formatting actions -->
    <div class="toolbar-group">
      <button id="btn-bold" class="tb-btn icon-only" title="Bold (⌘B)" @click="$emit('format', 'bold')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconBold})` }"></span>
      </button>
      <button id="btn-italic" class="tb-btn icon-only" title="Italic (⌘I)" @click="$emit('format', 'italic')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconItalic})` }"></span>
      </button>
      <button id="btn-heading" class="tb-btn icon-only" title="Heading" @click="$emit('format', 'heading')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconHeading})` }"></span>
      </button>
      <button id="btn-list" class="tb-btn icon-only" title="List" @click="$emit('format', 'list')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconList})` }"></span>
      </button>
      <button id="btn-link" class="tb-btn icon-only" title="Link" @click="$emit('format', 'link')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconLink})` }"></span>
      </button>
      <button id="btn-code" class="tb-btn icon-only" title="Inline Code" @click="$emit('format', 'code')">
        <span class="tb-icon" :style="{ '--icon': `url(${iconCode})` }"></span>
      </button>
    </div>
  </header>
</template>

<script setup>


import iconNew from '../assets/icons/icons8-file-100.png';
import iconOpen from '../assets/icons/icons8-open-file-100.png';
import iconSave from '../assets/icons/icons8-save-100.png';
import iconSaveAs from '../assets/icons/icons8-save-as-100.png';
import iconBold from '../assets/icons/icons8-bold-100.png';
import iconItalic from '../assets/icons/icons8-italic-100.png';
import iconHeading from '../assets/icons/icons8-header-1-100.png';
import iconList from '../assets/icons/icons8-list-100.png';
import iconLink from '../assets/icons/icons8-link-100.png';
import iconCode from '../assets/icons/icons8-source-code-100.png';


defineProps({
  isDirty: Boolean,
});

defineEmits(['new-file', 'open-file', 'save-file', 'save-as', 'format']);


</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.75rem;
  height: 46px;
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

/* Glassmorphism (§6.1) */
.glass {
  background: var(--toolbar-bg);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: var(--border-color);
  margin: 0 0.5rem;
  opacity: 0.6;
}

.tb-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: none;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color);
  transition: background 0.15s, color 0.15s, transform 0.1s;
  white-space: nowrap;
}

/* PNG icons are tinted via mask + currentColor so they still follow
   hover / active / dark-mode coloring like the previous inline SVGs. */
.tb-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
  transition: transform 0.15s;
}

.tb-btn:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}

.tb-btn:hover .tb-icon { transform: scale(1.1); }

.tb-btn:active { transform: scale(0.94); }

.tb-btn.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
  font-weight: 600;
}

.tb-btn.dirty span { color: var(--accent-color); }

.tb-btn.icon-only { padding: 0.3rem 0.4rem; }


@media (max-width: 640px) {
  .hide-sm { display: none; }
}
</style>
