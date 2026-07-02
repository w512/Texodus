import { defineStore } from 'pinia';
import { type ColorSchemeId } from '../themes';

export type LayoutMode = 'split' | 'preview' | 'focus';
export type ThemeMode = 'light' | 'dark' | 'system';
export type DocumentMode = 'windows' | 'tabs';
export type { ColorSchemeId };

export interface FontOption {
  label: string;
  value: string;
}

// Bundled = shipped via @fontsource/* (works offline).
// System-only = available only when the user's OS provides it; falls back
// through the monospace stack otherwise (Consolas ships on Windows).
export const EDITOR_FONTS: FontOption[] = [
  { label: 'JetBrains Mono',  value: "'JetBrains Mono', monospace" },
  { label: 'Iosevka',         value: "'Iosevka', monospace" },
  { label: 'Google Sans Code',value: "'Google Sans Code', monospace" },
  { label: 'Consolas',        value: "'Consolas', 'Cascadia Code', monospace" },
  { label: 'Fira Code',       value: "'Fira Code', monospace" },
  { label: 'Courier New',     value: "'Courier New', monospace" },
  { label: 'Inter',           value: "'Inter', system-ui, sans-serif" },
];

export const PREVIEW_FONTS: FontOption[] = [
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

export const LINE_HEIGHTS = [
  1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6,
  1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2, 2.1, 2.2, 2.3, 2.4,
] as const;
export const LINE_HEIGHT_MIN = LINE_HEIGHTS[0];
export const LINE_HEIGHT_MAX = LINE_HEIGHTS[LINE_HEIGHTS.length - 1];

const RECENT_FILES_MAX = 10;

// Single source for the sidebar width bounds. App.vue forwards them to CSS
// (`--sidebar-min/max-width` on .sidebar-shell); setSidebarWidth clamps to them.
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 420;

/** Separate localStorage key for the default layout mode of new windows.
 *  Not synced via the `storage` event — each open window keeps its own mode. */
const LAYOUT_MODE_STORAGE_KEY = 'texodus.layoutMode.v1';
const DEFAULT_LAYOUT_MODE: LayoutMode = 'split';

interface PersistedSettings {
  themeMode: ThemeMode;
  colorScheme: ColorSchemeId;
  editorFont: string;
  previewFont: string;
  fontSize: number;
  lineHeight: number;
  recentFiles: string[];
  documentMode: DocumentMode;
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastWorkspacePath: string | null;
  smoothScrollSync: boolean;
  searchHighlightColor: string;
  autoSave: boolean;
}

interface SettingsState extends PersistedSettings {
  /** Per-window layout mode — not synced across open windows. */
  layoutMode: LayoutMode;
  settingsVisible: boolean;
  aboutVisible: boolean;
  systemFonts: string[];
  systemFontsLoaded: boolean;
}

export const SETTINGS_STORAGE_KEY = 'texodus.settings.v1';
const DEFAULTS: PersistedSettings = {
  themeMode: 'system',
  colorScheme: 'default',
  editorFont: EDITOR_FONTS[0].value,
  previewFont: PREVIEW_FONTS[0].value,
  fontSize: 14,
  lineHeight: 1.75,
  recentFiles: [],
  documentMode: 'windows',
  sidebarVisible: true,
  sidebarWidth: 260,
  lastWorkspacePath: null,
  smoothScrollSync: false,
  searchHighlightColor: '#ffd54a',
  autoSave: false,
};

// Serialized snapshot of the last value we wrote to localStorage. `persist()`
// compares against this and bails when nothing changed — without it, a
// sync-induced `reloadFromStorage()` re-persists identical data and
// re-broadcasts, forming an unbounded persist→broadcast→reload→persist loop
// (within a window via BroadcastChannel echo, and across windows via ping-pong)
// that saturates the main thread and stalls rendering.
let lastPersisted: string | null = null;

function loadPersisted(): PersistedSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function loadLayoutMode(): LayoutMode {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYOUT_MODE;
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LayoutMode;
    // Backward-compat: read from the old shared settings key before the split.
    const legacy = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<PersistedSettings & { layoutMode?: LayoutMode }>;
      if (parsed.layoutMode) return parsed.layoutMode;
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT_MODE;
}

function loadFromStorage(): SettingsState {
  return {
    ...loadPersisted(),
    layoutMode: loadLayoutMode(),
    settingsVisible: false,
    aboutVisible: false,
    systemFonts: [],
    systemFontsLoaded: false,
  };
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadFromStorage(),
  actions: {
    setLayoutMode(mode: LayoutMode) {
      this.layoutMode = mode;
      // Persist separately so new windows inherit the last-used mode,
      // without syncing to already-open windows.
      try { localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, JSON.stringify(mode)); }
      catch { /* quota */ }
    },
    setThemeMode(mode: ThemeMode) { this.themeMode = mode; },
    setColorScheme(id: ColorSchemeId) { this.colorScheme = id; },
    setDocumentMode(mode: DocumentMode) { this.documentMode = mode; },
    setSidebarVisible(v: boolean) { this.sidebarVisible = v; },
    toggleSidebar() { this.sidebarVisible = !this.sidebarVisible; },
    setSmoothScrollSync(v: boolean) { this.smoothScrollSync = v; },
    setAutoSave(v: boolean) { this.autoSave = v; },
    setSearchHighlightColor(v: string) {
      // Accept both `#rrggbb` (what `<input type="color">` emits) and a bare
      // `rrggbb`, and store a normalised `#rrggbb` to match the default.
      const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim());
      if (m) this.searchHighlightColor = `#${m[1].toLowerCase()}`;
    },
    setSidebarWidth(width: number) {
      this.sidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
    },
    setLastWorkspacePath(path: string | null) { this.lastWorkspacePath = path; },
    setSettingsVisible(v: boolean) { this.settingsVisible = v; },
    setAboutVisible(v: boolean) { this.aboutVisible = v; },
    setSystemFonts(fonts: string[]) {
      this.systemFonts = Array.from(new Set(fonts.map(f => f.trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      this.systemFontsLoaded = true;
    },
    setEditorFont(font: string) { this.editorFont = font; },
    setPreviewFont(font: string) { this.previewFont = font; },
    setFontSize(size: number) {
      this.fontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(size)));
    },
    setLineHeight(lineHeight: number) {
      const rounded = Math.round(lineHeight * 100) / 100;
      this.lineHeight = Math.max(LINE_HEIGHT_MIN, Math.min(LINE_HEIGHT_MAX, rounded));
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
    // Re-reads persisted settings from localStorage. Called when another
    // window writes the settings key (`storage` event) so every window stays
    // in sync — in particular `documentMode`, which a stale window would
    // otherwise overwrite in the Rust backend via report_window_status.
    reloadFromStorage() {
      const persisted = loadPersisted();
      // Pre-seed the persist guard with exactly what we just read. The `$patch`
      // below triggers `$subscribe → persist()`, which would otherwise re-write
      // and re-broadcast data we only *received* from another window — bouncing
      // an identical payload back out. With N windows open, one change would
      // fan out into O(N) redundant writes/broadcasts. Seeding `lastPersisted`
      // makes that echo `persist()` a no-op. See `lastPersisted`.
      lastPersisted = JSON.stringify(persisted);
      this.$patch(persisted);
    },
    persist() {
      if (typeof localStorage === 'undefined') return;
      const {
        settingsVisible: _s,
        aboutVisible: _a,
        systemFonts: _sf,
        systemFontsLoaded: _sfl,
        layoutMode: _lm,
        ...toSave
      } = this.$state;
      const serialized = JSON.stringify(toSave);
      // Nothing actually changed (e.g. a sync-induced reload, or a transient
      // UI-only mutation) — skip the write and the broadcast. This is what
      // keeps cross-window sync from looping; see `lastPersisted`.
      if (serialized === lastPersisted) return;
      lastPersisted = serialized;
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
      } catch {
        // Quota exceeded or unavailable — silently ignore.
      }
      // Notify other windows via BroadcastChannel for instant sync.
      // The _broadcastSync function is injected by main.ts after store creation.
      (this as unknown as { _broadcastSync?: () => void })._broadcastSync?.();
    },
  },
});
