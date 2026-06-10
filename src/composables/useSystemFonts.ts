/**
 * Lazy system-font discovery for the settings dialog.
 *
 * Fonts come from the Rust `list_system_fonts` command (fontdb) and are
 * cached in the settings store, so the scan runs once per app session.
 * Exposes the store list re-shaped into editor/preview `FontOption`s with
 * the right generic fallback appended, minus fonts already bundled.
 */
import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  useSettingsStore,
  EDITOR_FONTS,
  PREVIEW_FONTS,
  type FontOption,
} from '../stores/settings';

export function useSystemFonts() {
  const settingsStore = useSettingsStore();
  const loading = ref(false);
  const error = ref(false);

  const quoteFontFamily = (name: string) => `'${name.replace(/'/g, "\\'")}'`;

  const systemFontOptions = computed<FontOption[]>(() => {
    const bundledLabels = new Set([...EDITOR_FONTS, ...PREVIEW_FONTS].map(f => f.label));
    return settingsStore.systemFonts
      .filter(name => !bundledLabels.has(name))
      .map(name => ({ label: name, value: quoteFontFamily(name) }));
  });

  const editorSystemFontOptions = computed<FontOption[]>(() =>
    systemFontOptions.value.map(f => ({ ...f, value: `${f.value}, monospace` })),
  );

  const previewSystemFontOptions = computed<FontOption[]>(() =>
    systemFontOptions.value.map(f => ({ ...f, value: `${f.value}, system-ui, sans-serif` })),
  );

  async function loadSystemFonts() {
    if (settingsStore.systemFontsLoaded || loading.value) return;
    loading.value = true;
    error.value = false;
    try {
      settingsStore.setSystemFonts(await invoke<string[]>('list_system_fonts'));
    } catch (e) {
      console.warn('Failed to list system fonts:', e);
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, editorSystemFontOptions, previewSystemFontOptions, loadSystemFonts };
}
