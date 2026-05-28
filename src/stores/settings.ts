import { defineStore } from 'pinia';
import { type ColorSchemeId } from '../themes';

export type LayoutMode = 'split' | 'preview' | 'focus';
export type ThemeMode = 'light' | 'dark' | 'system';
export type { ColorSchemeId };

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

const RECENT_FILES_MAX = 10;

interface PersistedSettings {
  layoutMode: LayoutMode;
  themeMode: ThemeMode;
  colorScheme: ColorSchemeId;
  editorFont: string;
  previewFont: string;
  fontSize: number;
  recentFiles: string[];
}

interface SettingsState extends PersistedSettings {
  settingsVisible: boolean;
  aboutVisible: boolean;
}

const STORAGE_KEY = 'texodus.settings.v1';
const DEFAULTS: PersistedSettings = {
  layoutMode: 'split',
  themeMode: 'system',
  colorScheme: 'default',
  editorFont: EDITOR_FONTS[0].value,
  previewFont: PREVIEW_FONTS[0].value,
  fontSize: 14,
  recentFiles: [],
};

function loadFromStorage(): SettingsState {
  const transient = { settingsVisible: false, aboutVisible: false };
  if (typeof localStorage === 'undefined') return { ...DEFAULTS, ...transient };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, ...transient };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return { ...DEFAULTS, ...parsed, ...transient };
  } catch {
    return { ...DEFAULTS, ...transient };
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadFromStorage(),
  actions: {
    setLayoutMode(mode: LayoutMode) { this.layoutMode = mode; },
    setThemeMode(mode: ThemeMode) { this.themeMode = mode; },
    setColorScheme(id: ColorSchemeId) { this.colorScheme = id; },
    setSettingsVisible(v: boolean) { this.settingsVisible = v; },
    setAboutVisible(v: boolean) { this.aboutVisible = v; },
    setEditorFont(font: string) { this.editorFont = font; },
    setPreviewFont(font: string) { this.previewFont = font; },
    setFontSize(size: number) {
      this.fontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(size)));
    },
    cycleTheme() {
      const modes: ThemeMode[] = ['system', 'light', 'dark'];
      this.themeMode = modes[(modes.indexOf(this.themeMode) + 1) % modes.length];
    },
    addRecentFile(path: string) {
      this.recentFiles = [
        path,
        ...this.recentFiles.filter(p => p !== path),
      ].slice(0, RECENT_FILES_MAX);
    },
    clearRecentFiles() {
      this.recentFiles = [];
    },
    persist() {
      if (typeof localStorage === 'undefined') return;
      try {
        const { settingsVisible: _s, aboutVisible: _a, ...toSave } = this.$state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch {
        // Quota exceeded or unavailable — silently ignore.
      }
    },
  },
});
