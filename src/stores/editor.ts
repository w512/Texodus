import { defineStore } from 'pinia';

/**
 * A single open document. The store always holds at least one tab; closing
 * the last tab resets it to a fresh blank tab rather than emptying the array.
 *
 * Stage 1 of the tabs refactor: state shape is multi-tab, but only one tab
 * ever exists at runtime — UI for managing multiple tabs lands in stage 2.
 */
export interface Tab {
  id: string;
  content: string;
  filePath: string | null;
  isDirty: boolean;
}

interface EditorState {
  tabs: Tab[];
  activeTabId: string;
}

function createTab(initial: Partial<Tab> = {}): Tab {
  return {
    id: crypto.randomUUID(),
    content: '',
    filePath: null,
    isDirty: false,
    ...initial,
  };
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => {
    const initial = createTab();
    return { tabs: [initial], activeTabId: initial.id };
  },
  getters: {
    // Always returns a tab — state.tabs is invariant non-empty. Falls back to
    // tabs[0] defensively in case activeTabId ever points at a closed tab.
    activeTab(state): Tab {
      return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
    },
    activeTabIndex(state): number {
      const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
      return i < 0 ? 0 : i;
    },
    tabCount(state): number {
      return state.tabs.length;
    },
    anyTabDirty(state): boolean {
      return state.tabs.some((t) => t.isDirty);
    },
    content(): string {
      return this.activeTab.content;
    },
    filePath(): string | null {
      return this.activeTab.filePath;
    },
    isDirty(): boolean {
      return this.activeTab.isDirty;
    },
  },
  actions: {
    updateContent(newContent: string) {
      const tab = this.activeTab;
      if (tab.content === newContent) return;
      tab.content = newContent;
      tab.isDirty = true;
    },
    setFilePath(path: string | null) {
      this.activeTab.filePath = path;
    },
    setDirty(dirty: boolean) {
      this.activeTab.isDirty = dirty;
    },
    loadFile(content: string, path: string | null) {
      const tab = this.activeTab;
      tab.content = content;
      tab.filePath = path;
      tab.isDirty = false;
    },
    reset() {
      const tab = this.activeTab;
      tab.content = '';
      tab.filePath = null;
      tab.isDirty = false;
    },
    /**
     * Appends a new tab right after the active one and switches focus to it.
     * Returns the new tab's id so callers can address it (e.g. menu actions).
     */
    addTab(initial: Partial<Tab> = {}): string {
      const tab = createTab(initial);
      this.tabs.splice(this.activeTabIndex + 1, 0, tab);
      this.activeTabId = tab.id;
      return tab.id;
    },
    setActiveTab(id: string) {
      if (this.tabs.some((t) => t.id === id)) this.activeTabId = id;
    },
    /**
     * Removes the tab and focuses a neighbour. Closing the only remaining tab
     * resets it to a blank scratch tab rather than emptying the array — the
     * `tabs` invariant (non-empty) must hold for downstream consumers.
     */
    closeTab(id: string) {
      const idx = this.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return;

      if (this.tabs.length === 1) {
        // Last tab — fall back to in-place reset.
        const tab = this.tabs[0];
        tab.content = '';
        tab.filePath = null;
        tab.isDirty = false;
        this.activeTabId = tab.id;
        return;
      }

      this.tabs.splice(idx, 1);
      if (this.activeTabId === id) {
        // Prefer the tab to the right; fall back to the left at the end.
        const next = this.tabs[idx] ?? this.tabs[idx - 1];
        this.activeTabId = next.id;
      }
    },
    activateNextTab() {
      if (this.tabs.length <= 1) return;
      const next = (this.activeTabIndex + 1) % this.tabs.length;
      this.activeTabId = this.tabs[next].id;
    },
    activatePreviousTab() {
      if (this.tabs.length <= 1) return;
      const prev = (this.activeTabIndex - 1 + this.tabs.length) % this.tabs.length;
      this.activeTabId = this.tabs[prev].id;
    },
  },
});
