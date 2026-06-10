<template>
  <Transition name="fade">
    <div v-if="settingsStore.settingsVisible" class="settings-overlay" @click.self="close">
      <div class="settings-dialog glass">
        <button class="close-btn" @click="close" aria-label="Close">&times;</button>

        <div class="dialog-header">
          <h2>Settings</h2>
        </div>

        <div class="dialog-body">
          <div class="settings-row">
            <label for="editor-font">Editor font</label>
            <select
              id="editor-font"
              :value="settingsStore.editorFont"
              @change="settingsStore.setEditorFont(($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="Bundled">
                <option v-for="f in EDITOR_FONTS" :key="`bundled-editor-${f.label}`" :value="f.value">{{ f.label }}</option>
              </optgroup>
              <optgroup v-if="editorSystemFontOptions.length" label="System fonts">
                <option v-for="f in editorSystemFontOptions" :key="`system-editor-${f.label}`" :value="f.value">{{ f.label }}</option>
              </optgroup>
            </select>
          </div>

          <div class="settings-row">
            <label for="preview-font">Preview font</label>
            <select
              id="preview-font"
              :value="settingsStore.previewFont"
              @change="settingsStore.setPreviewFont(($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="Bundled">
                <option v-for="f in PREVIEW_FONTS" :key="`bundled-preview-${f.label}`" :value="f.value">{{ f.label }}</option>
              </optgroup>
              <optgroup v-if="previewSystemFontOptions.length" label="System fonts">
                <option v-for="f in previewSystemFontOptions" :key="`system-preview-${f.label}`" :value="f.value">{{ f.label }}</option>
              </optgroup>
            </select>
          </div>

          <div class="settings-hint" aria-live="polite">
            <span v-if="systemFontsLoading">Loading system fonts…</span>
            <span v-else-if="systemFontsError">System fonts unavailable</span>
            <span v-else-if="settingsStore.systemFontsLoaded">{{ settingsStore.systemFonts.length }} system fonts found</span>
          </div>

          <div class="settings-row">
            <label>Open documents in</label>
            <div class="segmented" role="radiogroup" aria-label="Document mode">
              <button
                type="button"
                role="radio"
                :aria-checked="settingsStore.documentMode === 'windows'"
                :class="{ active: settingsStore.documentMode === 'windows' }"
                @click="settingsStore.setDocumentMode('windows')"
              >Windows</button>
              <button
                type="button"
                role="radio"
                :aria-checked="settingsStore.documentMode === 'tabs'"
                :class="{ active: settingsStore.documentMode === 'tabs' }"
                @click="settingsStore.setDocumentMode('tabs')"
              >Tabs</button>
            </div>
          </div>

          <div class="settings-row">
            <label for="font-size">Font size</label>
            <SettingsStepper
              id="font-size"
              label="font size"
              :model-value="settingsStore.fontSize"
              :options="FONT_SIZES"
              :step="1"
              :format="(s: number) => `${s} pt`"
              @update:model-value="settingsStore.setFontSize($event)"
            />
          </div>

          <div class="settings-row">
            <label for="line-height">Line height</label>
            <SettingsStepper
              id="line-height"
              label="line height"
              :model-value="settingsStore.lineHeight"
              :options="LINE_HEIGHTS"
              :step="0.05"
              :format="(h: number) => h.toFixed(2)"
              @update:model-value="settingsStore.setLineHeight($event)"
            />
          </div>

          <div class="settings-preview">
            <span class="section-label">Fonts preview</span>
            <div class="fonts-preview">
              <div class="sample" :style="{ fontFamily: settingsStore.editorFont, fontSize: settingsStore.fontSize + 'pt', lineHeight: String(settingsStore.lineHeight) }">
                <strong>Editor:</strong> const greet = () =&gt; "Hello, world";
              </div>
              <div class="sample" :style="{ fontFamily: settingsStore.previewFont, fontSize: settingsStore.fontSize + 'pt', lineHeight: String(settingsStore.lineHeight) }">
                <strong>Preview:</strong> The quick brown fox jumps over the lazy dog.
              </div>
            </div>
          </div>

          <div class="settings-section">
            <span class="section-label">Color scheme</span>
            <ColorSchemePicker
              :model-value="settingsStore.colorScheme"
              @update:model-value="settingsStore.setColorScheme($event)"
            />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import {
  useSettingsStore,
  EDITOR_FONTS,
  PREVIEW_FONTS,
  FONT_SIZES,
  LINE_HEIGHTS,
} from '../stores/settings';
import SettingsStepper from './SettingsStepper.vue';
import ColorSchemePicker from './ColorSchemePicker.vue';
import { useSystemFonts } from '../composables/useSystemFonts';

const settingsStore = useSettingsStore();
const {
  loading: systemFontsLoading,
  error: systemFontsError,
  editorSystemFontOptions,
  previewSystemFontOptions,
  loadSystemFonts,
} = useSystemFonts();

const close = () => { settingsStore.setSettingsVisible(false); };

const onKey = (e: KeyboardEvent) => {
  if (settingsStore.settingsVisible && e.key === 'Escape') {
    e.preventDefault();
    close();
  }
};

watch(
  () => settingsStore.settingsVisible,
  (visible) => {
    if (visible) void loadSystemFonts();
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKey);
  if (settingsStore.settingsVisible) void loadSystemFonts();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}

.settings-dialog {
  width: 360px;
  max-width: 90vw;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass {
  background: rgba(var(--bg-color-rgb, 255, 255, 255), 0.85);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  z-index: 10;
}

.close-btn:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.dialog-header {
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.dialog-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.dialog-body {
  padding: 1rem 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.settings-row label {
  font-size: 0.8125rem;
  color: var(--text-muted);
  font-weight: 500;
  white-space: nowrap;
}

.settings-row select {
  flex: 1;
  max-width: 58%;
  padding: 0.35rem 0.5rem;
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.settings-row select:focus {
  outline: 2px solid var(--accent-subtle);
  border-color: var(--accent-color);
}

.settings-hint {
  margin-top: -0.35rem;
  min-height: 1rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: right;
}

.segmented {
  display: inline-flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  max-width: 58%;
  flex: 1;
}

.segmented button {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.segmented button + button {
  border-left: 1px solid var(--border-color);
}

.segmented button:hover:not(.active) {
  background: var(--btn-hover);
  color: var(--text-color);
}

.segmented button.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
  font-weight: 500;
}

.settings-preview {
  margin-top: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fonts-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.85rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.25rem;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.03);
}

.fonts-preview .sample {
  color: var(--text-color);
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.fonts-preview .sample strong {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 0.6875rem !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-color);
  font-weight: 600;
  opacity: 0.9;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
  font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
