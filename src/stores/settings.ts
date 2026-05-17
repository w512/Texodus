import { defineStore } from 'pinia';

export type LayoutMode = 'split' | 'preview' | 'focus';
export type ThemeMode = 'light' | 'dark' | 'system';

// Bundled = shipped via @fontsource/* (works offline).
// System-only = available only when the user's OS provides it; falls back
// through the monospace stack otherwise (Consolas ships on Windows).
export const EDITOR_FONTS = [
  { label: 'JetBrains Mono',  value: "'JetBrains Mono', monospace" },
  { label: 'Iosevka',         value: "'Iosevka', monospace" },
  { label: 'Google Sans Code',value: "'Google Sans Code', monospace" },
  { label: 'Consolas',        value: "'Consolas', 'Cascadia Code', monospace" },
  { label: 'Fira Code',       value: "'Fira Code', monospace" },
  { label: 'Courier New',     value: "'Courier New', monospace" },
  { label: 'Inter',           value: "'Inter', system-ui, sans-serif" },
];

export const PREVIEW_FONTS = [
  { label: 'Inter',           value: "'Inter', system-ui, sans-serif" },
  { label: 'Roboto',          value: "'Roboto', system-ui, sans-serif" },
  { label: 'Georgia',         value: "Georgia, serif" },
  { label: 'Merriweather',    value: "'Merriweather', Georgia, serif" },
  { label: 'JetBrains Mono',  value: "'JetBrains Mono', monospace" },
  { label: 'Iosevka',         value: "'Iosevka', monospace" },
  { label: 'Google Sans Code',value: "'Google Sans Code', monospace" },
];

export const FONT_SIZES = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
] as const;
export const FONT_SIZE_MIN = FONT_SIZES[0];
export const FONT_SIZE_MAX = FONT_SIZES[FONT_SIZES.length - 1];

interface SettingsState {
  layoutMode: LayoutMode;
  themeMode: ThemeMode;
  editorFont: string;
  previewFont: string;
  fontSize: number;
}

const STORAGE_KEY = 'texodus.settings.v1';
const DEFAULTS: SettingsState = {
  layoutMode: 'split',
  themeMode: 'system',
  editorFont: EDITOR_FONTS[0].value,
  previewFont: PREVIEW_FONTS[0].value,
  fontSize: 14,
};

function loadFromStorage(): SettingsState {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadFromStorage(),
  actions: {
    setLayoutMode(mode: LayoutMode) { this.layoutMode = mode; },
    setThemeMode(mode: ThemeMode) { this.themeMode = mode; },
    setEditorFont(font: string) { this.editorFont = font; },
    setPreviewFont(font: string) { this.previewFont = font; },
    setFontSize(size: number) {
      this.fontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(size)));
    },
    cycleTheme() {
      const modes: ThemeMode[] = ['system', 'light', 'dark'];
      this.themeMode = modes[(modes.indexOf(this.themeMode) + 1) % modes.length];
    },
    persist() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
      } catch {
        // Quota exceeded or unavailable — silently ignore.
      }
    },
  },
});
