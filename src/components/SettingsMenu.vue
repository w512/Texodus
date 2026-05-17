<template>
  <div class="settings-menu" ref="rootRef">
    <button
      class="trigger"
      :class="{ active: isOpen }"
      title="Settings"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span class="trigger-icon" :style="{ '--icon': `url(${iconSettings})` }"></span>
    </button>

    <Transition name="popover">
      <div v-if="isOpen" class="popover" role="dialog" aria-label="Settings">
        <div class="popover-row">
          <label for="editor-font">Editor font</label>
          <select
            id="editor-font"
            :value="settingsStore.editorFont"
            @change="settingsStore.setEditorFont(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="f in EDITOR_FONTS" :key="f.label" :value="f.value">{{ f.label }}</option>
          </select>
        </div>

        <div class="popover-row">
          <label for="preview-font">Preview font</label>
          <select
            id="preview-font"
            :value="settingsStore.previewFont"
            @change="settingsStore.setPreviewFont(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="f in PREVIEW_FONTS" :key="f.label" :value="f.value">{{ f.label }}</option>
          </select>
        </div>

        <div class="popover-row">
          <label for="font-size">Font size</label>
          <div class="stepper">
            <button
              class="stepper-btn"
              :disabled="settingsStore.fontSize <= FONT_SIZE_MIN"
              aria-label="Decrease font size"
              @click="settingsStore.setFontSize(settingsStore.fontSize - 1)"
            >−</button>
            <select
              id="font-size"
              class="stepper-value"
              :value="settingsStore.fontSize"
              @change="settingsStore.setFontSize(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }} px</option>
            </select>
            <button
              class="stepper-btn"
              :disabled="settingsStore.fontSize >= FONT_SIZE_MAX"
              aria-label="Increase font size"
              @click="settingsStore.setFontSize(settingsStore.fontSize + 1)"
            >+</button>
          </div>
        </div>

        <div class="popover-preview">
          <div class="sample" :style="{ fontFamily: settingsStore.editorFont }">
            Editor: const greet = () =&gt; "Hello, world";
          </div>
          <div class="sample" :style="{ fontFamily: settingsStore.previewFont }">
            Preview: The quick brown fox jumps over the lazy dog.
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  useSettingsStore,
  EDITOR_FONTS,
  PREVIEW_FONTS,
  FONT_SIZES,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
} from '../stores/settings';
import iconSettings from '../assets/icons/icons8-settings-100.png';

const settingsStore = useSettingsStore();
const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const toggle = () => { isOpen.value = !isOpen.value; };
const close = () => { isOpen.value = false; };

const onClickOutside = (e: MouseEvent) => {
  if (!isOpen.value) return;
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close();
};

const onKey = (e: KeyboardEvent) => {
  if (isOpen.value && e.key === 'Escape') { e.preventDefault(); close(); }
};

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside);
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside);
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.settings-menu { position: relative; }

.popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 280px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
  padding: 0.85rem 0.9rem;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.popover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.popover-row label {
  font-size: 0.8125rem;
  color: var(--text-muted);
  font-weight: 500;
}

.popover-row select {
  flex: 1;
  max-width: 60%;
  padding: 0.3rem 0.5rem;
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.popover-row select:focus {
  outline: 2px solid var(--accent-subtle);
  border-color: var(--accent-color);
}

.stepper {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
  max-width: 60%;
  flex: 1;
}

.stepper-btn {
  width: 26px;
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
  padding: 0.3rem 0.4rem;
  color: var(--text-color);
  font-size: 0.8125rem;
  text-align: center;
  cursor: pointer;
}

.stepper-value:focus { outline: none; background: var(--btn-hover); }

.popover-preview {
  margin-top: 0.25rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.sample {
  font-size: 0.8125rem;
  color: var(--text-color);
  line-height: 1.5;
}

/* Trigger button — matches Toolbar's .tb-btn styling (scoped styles don't cross
   into child components, so we restate the rules here for visual parity). */
.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0.3rem 0.4rem;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-color);
  transition: background 0.15s, color 0.15s, transform 0.1s;
}

.trigger:hover {
  background: var(--btn-hover);
  color: var(--accent-color);
}

/* PNG icon tinted via mask + currentColor, matching Toolbar's .tb-icon. */
.trigger-icon {
  width: 15px;
  height: 15px;
  background-color: currentColor;
  -webkit-mask: var(--icon) center / contain no-repeat;
  mask: var(--icon) center / contain no-repeat;
  transition: transform 0.15s;
}

.trigger:hover .trigger-icon { transform: scale(1.1); }
.trigger:active { transform: scale(0.94); }

.trigger.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

/* Animation */
.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
