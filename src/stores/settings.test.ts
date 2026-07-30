import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useSettingsStore,
  SETTINGS_STORAGE_KEY,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  SIDEBAR_MAX_WIDTH,
} from './settings';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('settings store', () => {
  it('clamps and rounds the font size', () => {
    const store = useSettingsStore();
    store.setFontSize(100);
    expect(store.fontSize).toBe(FONT_SIZE_MAX);
    store.setFontSize(1);
    expect(store.fontSize).toBe(FONT_SIZE_MIN);
    store.setFontSize(14.6);
    expect(store.fontSize).toBe(15);
  });

  it('clamps and rounds the line height to two decimals', () => {
    const store = useSettingsStore();
    store.setLineHeight(9);
    expect(store.lineHeight).toBe(2.4);
    store.setLineHeight(0.1);
    expect(store.lineHeight).toBe(1.2);
    store.setLineHeight(1.7000000000000002);
    expect(store.lineHeight).toBe(1.7);
  });

  it('accepts search highlight colors with or without a leading #, normalised', () => {
    const store = useSettingsStore();
    // `<input type="color">` emits `#rrggbb` — must be accepted.
    store.setSearchHighlightColor('#1A2B3C');
    expect(store.searchHighlightColor).toBe('#1a2b3c');
    // Bare hex is also accepted, and normalised to `#rrggbb`.
    store.setSearchHighlightColor('ABCDEF');
    expect(store.searchHighlightColor).toBe('#abcdef');
    // Invalid input is rejected, leaving the previous value untouched.
    store.setSearchHighlightColor('nope');
    expect(store.searchHighlightColor).toBe('#abcdef');
  });

  it('keeps recent files deduplicated, newest first, capped at 10', () => {
    const store = useSettingsStore();
    for (let i = 0; i < 12; i++) store.addRecentFile(`/f/${i}.md`);
    store.addRecentFile('/f/5.md');

    expect(store.recentFiles).toHaveLength(10);
    expect(store.recentFiles[0]).toBe('/f/5.md');
    expect(store.recentFiles.filter((p) => p === '/f/5.md')).toHaveLength(1);
  });

  it('cycleTheme walks system -> light -> dark -> system', () => {
    const store = useSettingsStore();
    expect(store.themeMode).toBe('system');
    store.cycleTheme();
    expect(store.themeMode).toBe('light');
    store.cycleTheme();
    expect(store.themeMode).toBe('dark');
    store.cycleTheme();
    expect(store.themeMode).toBe('system');
  });

  it('persist writes only persisted fields to localStorage', () => {
    const store = useSettingsStore();
    store.setDocumentMode('tabs');
    store.setSettingsVisible(true);
    store.setLayoutMode('focus');
    store.persist();

    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(saved.documentMode).toBe('tabs');
    expect(saved).not.toHaveProperty('settingsVisible');
    expect(saved).not.toHaveProperty('systemFonts');
    // layoutMode is per-window and must NOT be in the shared settings payload.
    expect(saved).not.toHaveProperty('layoutMode');
  });

  it('reloadFromStorage picks up changes another window persisted', () => {
    const store = useSettingsStore();
    store.setLayoutMode('focus');
    store.persist();

    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    saved.documentMode = 'tabs';
    saved.fontSize = 18;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved));

    store.setSettingsVisible(true);
    store.reloadFromStorage();
    expect(store.documentMode).toBe('tabs');
    expect(store.fontSize).toBe(18);
    // Transient UI state must survive the reload.
    expect(store.settingsVisible).toBe(true);
    // layoutMode is per-window — must NOT be overwritten by reloadFromStorage.
    expect(store.layoutMode).toBe('focus');
  });

  it('reloadFromStorage does not re-persist/echo the data it just received', () => {
    const store = useSettingsStore();
    // Another window wrote a change to shared storage; seed it directly.
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ fontSize: 19 }));

    store.reloadFromStorage();
    expect(store.fontSize).toBe(19);

    // The `$patch` inside reloadFromStorage fires persist() via `$subscribe`
    // in the real app. That persist() must be a no-op here — re-writing and
    // re-broadcasting data we only *received* would bounce it back out and
    // fan out into O(N) redundant writes across open windows.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    store.persist();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('falls back to defaults on corrupt stored JSON', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    localStorage.setItem('texodus.layoutMode.v1', '{not json');
    const store = useSettingsStore();
    expect(store.documentMode).toBe('windows');
    expect(store.layoutMode).toBe('split');
  });
});

// Stored values bypass the setters, so they get validated on the way in:
// hand-edited storage, a payload from an older schema, or a truncated write
// must not be able to put the store into an unusable state.
describe('settings validation on load', () => {
  it('clamps out-of-range numbers', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      fontSize: 9999,
      lineHeight: -3,
      sidebarWidth: 10000,
    }));
    const store = useSettingsStore();
    expect(store.fontSize).toBe(FONT_SIZE_MAX);
    expect(store.lineHeight).toBe(1.2);
    expect(store.sidebarWidth).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('rounds numbers the way the setters do', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      fontSize: 14.6,
      lineHeight: 1.7000000000000002,
    }));
    const store = useSettingsStore();
    expect(store.fontSize).toBe(15);
    expect(store.lineHeight).toBe(1.7);
  });

  it('rejects values outside the allowed enums', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      themeMode: 'sepia',
      colorScheme: 'no-such-scheme',
      // A bogus documentMode would travel to Rust via report_window_status
      // and misroute OS "Open With" files.
      documentMode: 'panes',
    }));
    localStorage.setItem('texodus.layoutMode.v1', JSON.stringify('zoomed'));
    const store = useSettingsStore();
    expect(store.themeMode).toBe('system');
    expect(store.colorScheme).toBe('default');
    expect(store.documentMode).toBe('windows');
    expect(store.layoutMode).toBe('split');
  });

  it('rejects wrong types and keeps the defaults', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      fontSize: '18',
      lineHeight: null,
      sidebarVisible: 'yes',
      autoSave: 1,
      editorFont: '   ',
      searchHighlightColor: 'not-a-color',
      recentFiles: 'nope',
      lastWorkspacePath: 42,
    }));
    const store = useSettingsStore();
    expect(store.fontSize).toBe(14);
    expect(store.lineHeight).toBe(1.75);
    expect(store.sidebarVisible).toBe(true);
    expect(store.autoSave).toBe(false);
    expect(store.editorFont).toContain('JetBrains Mono');
    expect(store.searchHighlightColor).toBe('#ffd54a');
    expect(store.recentFiles).toEqual([]);
    expect(store.lastWorkspacePath).toBeNull();
  });

  it('normalises the stored highlight color and cleans the recent-files list', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      searchHighlightColor: 'AABBCC',
      recentFiles: ['/a.md', '', '/a.md', 7, '/b.md', ...Array.from({ length: 12 }, (_, i) => `/x${i}.md`)],
    }));
    const store = useSettingsStore();
    expect(store.searchHighlightColor).toBe('#aabbcc');
    expect(store.recentFiles).toHaveLength(10);
    expect(store.recentFiles.slice(0, 3)).toEqual(['/a.md', '/b.md', '/x0.md']);
  });

  it('accepts a valid stored payload unchanged', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      themeMode: 'dark',
      colorScheme: 'nord',
      fontSize: 16,
      lineHeight: 1.5,
      documentMode: 'tabs',
      sidebarVisible: false,
      sidebarWidth: 300,
      autoSave: true,
      lastWorkspacePath: '/work',
    }));
    const store = useSettingsStore();
    expect(store.themeMode).toBe('dark');
    expect(store.colorScheme).toBe('nord');
    expect(store.fontSize).toBe(16);
    expect(store.lineHeight).toBe(1.5);
    expect(store.documentMode).toBe('tabs');
    expect(store.sidebarVisible).toBe(false);
    expect(store.sidebarWidth).toBe(300);
    expect(store.autoSave).toBe(true);
    expect(store.lastWorkspacePath).toBe('/work');
  });
});
