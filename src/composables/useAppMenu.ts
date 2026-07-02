import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  saveFile,
  saveFileAs,
  requestNewDocument,
  requestOpenDocument,
  requestOpenFromPath,
  requestCloseDocument,
  showError,
} from '../services/fileService';
import { exportPdf, exportHtml, exportTxt } from "../services/exportService";
import { openWorkspaceFolder } from '../services/workspaceService';
import { openQuickOpen } from './useQuickOpen';
import type { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '../utils/path';
import { isMac } from '../utils/platform';

type EditorStore = ReturnType<typeof useEditorStore>;
type SettingsStore = ReturnType<typeof useSettingsStore>;

// macOS hangs submenus under the global menu bar and expects an "app" submenu
// (About / Hide / Quit) first; Windows/Linux render the menu in the window's
// own bar and have no such submenu.

// Cached Menu + the input snapshot it was built from. Building costs dozens
// of IPC round-trips (one per MenuItem.new), while App.vue re-installs the
// menu on every window focus so this window's callbacks own the global menu
// again after another window replaced it — re-applying the cached instance is
// a single call. Holding the reference also prevents the menu's JS callbacks
// from being garbage collected by V8, which breaks menu actions on Windows.
let cachedMenu: Menu | null = null;
let cachedMenuKey = '';

/** Snapshot of every input that changes the menu's *structure* or the data
 *  captured in item closures (recent-file paths, Close vs Close Tab label).
 *  Everything else is read from live stores at click time. */
function menuInputsKey(store: EditorStore, settingsStore: SettingsStore): string {
  return JSON.stringify({
    recentFiles: settingsStore.recentFiles,
    documentMode: settingsStore.documentMode,
    closeActsOnTab: settingsStore.documentMode === 'tabs' && store.tabCount > 1,
  });
}

/**
 * Builds (or reuses, when its inputs are unchanged) and installs the native
 * application menu.
 *
 * `setAsAppMenu()` replaces the default menu wholesale, so we also restate the
 * Edit submenu — otherwise the editor textarea would lose native clipboard /
 * undo shortcuts. File accelerators live here (not in KeyboardShortcuts.vue) so
 * they have a single owner and don't double-fire.
 */
export async function setupAppMenu(store: EditorStore): Promise<void> {
  const settingsStore = useSettingsStore();
  const key = menuInputsKey(store, settingsStore);
  if (!cachedMenu || key !== cachedMenuKey) {
    cachedMenu = await buildAppMenu(store, settingsStore);
    cachedMenuKey = key;
  }

  if (isMac) {
    await cachedMenu.setAsAppMenu();
  } else {
    try {
      await cachedMenu.setAsWindowMenu(getCurrentWindow());
    } catch {
      // Fallback if setAsWindowMenu fails
      await cachedMenu.setAsAppMenu();
    }
  }
}

async function buildAppMenu(store: EditorStore, settingsStore: SettingsStore): Promise<Menu> {

  const recentMenuItems: (MenuItem | PredefinedMenuItem)[] = [];
  if (settingsStore.recentFiles.length === 0) {
    recentMenuItems.push(await MenuItem.new({
      id: 'recent-empty',
      text: 'No Recent Files',
      enabled: false,
      action: () => {},
    }));
  } else {
    for (let i = 0; i < settingsStore.recentFiles.length; i++) {
      const filePath = settingsStore.recentFiles[i];
      const parts = filePath.split(/[\\/]/);
      const label = parts.length >= 2
        ? `${basename(filePath)}  —  ${parts[parts.length - 2]}`
        : basename(filePath);
      recentMenuItems.push(await MenuItem.new({
        id: `recent-${i}`,
        text: label,
        action: () => { void requestOpenFromPath(store, filePath); },
      }));
    }
    recentMenuItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    recentMenuItems.push(await MenuItem.new({
      id: 'recent-clear',
      text: 'Clear Recent Files',
      action: () => { settingsStore.clearRecentFiles(); },
    }));
  }

  const openRecentSubmenu = await Submenu.new({
    text: 'Open Recent',
    items: recentMenuItems,
  });

  const inTabsMode = settingsStore.documentMode === 'tabs';

  const fileItems: (MenuItem | PredefinedMenuItem | Submenu)[] = [];

  if (inTabsMode) {
    fileItems.push(await MenuItem.new({
      id: 'file-new-tab',
      text: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      action: () => { void requestNewDocument(store); },
    }));
  }

  fileItems.push(
    await MenuItem.new({
      id: 'file-new',
      text: 'New Window',
      accelerator: 'CmdOrCtrl+N',
      action: async () => {
        try { await invoke('open_new_window'); }
        catch (e) { await showError('Failed to open new window', e); }
      },
    }),
    await MenuItem.new({
      id: 'file-open',
      text: 'Open…',
      accelerator: 'CmdOrCtrl+O',
      action: () => { void requestOpenDocument(store); },
    }),
    await MenuItem.new({
      id: 'file-open-folder',
      text: 'Open Folder…',
      accelerator: 'CmdOrCtrl+Shift+O',
      action: () => { void openWorkspaceFolder(); },
    }),
    openRecentSubmenu,
    await MenuItem.new({
      id: 'file-quick-open',
      text: 'Quick Open…',
      accelerator: 'CmdOrCtrl+P',
      action: () => { openQuickOpen(); },
    }),
    await MenuItem.new({
      id: 'file-close',
      text: inTabsMode && store.tabCount > 1 ? 'Close Tab' : 'Close',
      accelerator: 'CmdOrCtrl+W',
      action: () => { void requestCloseDocument(store); },
    }),
  );

  if (inTabsMode) {
    fileItems.push(
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({
        id: 'file-next-tab',
        text: 'Next Tab',
        accelerator: 'CmdOrCtrl+Alt+Right',
        action: () => { store.activateNextTab(); },
      }),
      await MenuItem.new({
        id: 'file-prev-tab',
        text: 'Previous Tab',
        accelerator: 'CmdOrCtrl+Alt+Left',
        action: () => { store.activatePreviousTab(); },
      }),
    );
  }

  fileItems.push(
    await PredefinedMenuItem.new({ item: 'Separator' }),
    await MenuItem.new({
      id: 'file-export-pdf',
      text: 'Export as PDF…',
      accelerator: 'CmdOrCtrl+Shift+P',
      action: async () => { await exportPdf(store.content, store.filePath); },
    }),
    await MenuItem.new({
      id: 'file-export-html',
      text: 'Export as HTML…',
      accelerator: 'CmdOrCtrl+Shift+H',
      action: async () => { await exportHtml(store.content, store.filePath); },
    }),
    await MenuItem.new({
      id: 'file-export-txt',
      text: 'Export as TXT…',
      accelerator: 'CmdOrCtrl+Shift+X',
      action: async () => { await exportTxt(store.content, store.filePath); },
    }),
    await PredefinedMenuItem.new({ item: 'Separator' }),
    await MenuItem.new({
      id: 'file-save',
      text: 'Save',
      accelerator: 'CmdOrCtrl+S',
      action: () => { void saveFile(store); },
    }),
    await MenuItem.new({
      id: 'file-save-as',
      text: 'Save As…',
      accelerator: 'CmdOrCtrl+Shift+S',
      action: () => { void saveFileAs(store); },
    }),
  );

  if (!isMac) {
    fileItems.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    fileItems.push(await PredefinedMenuItem.new({ item: 'Quit', text: 'Exit' }));
  }

  const fileSubmenu = await Submenu.new({ text: 'File', items: fileItems });

  const editSubmenu = await Submenu.new({
    text: 'Edit',
    items: [
      await PredefinedMenuItem.new({ item: 'Undo' }),
      await PredefinedMenuItem.new({ item: 'Redo' }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await PredefinedMenuItem.new({ item: 'Cut' }),
      await PredefinedMenuItem.new({ item: 'Copy' }),
      await PredefinedMenuItem.new({ item: 'Paste' }),
      await PredefinedMenuItem.new({ item: 'SelectAll' }),
    ],
  });

  const viewSubmenu = await Submenu.new({
    text: 'View',
    items: [
      await MenuItem.new({
        id: 'view-toggle-sidebar',
        text: 'Toggle Sidebar',
        accelerator: 'CmdOrCtrl+Alt+B',
        action: () => { settingsStore.toggleSidebar(); },
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({
        id: 'view-split',
        text: 'Split View',
        accelerator: 'CmdOrCtrl+Alt+S',
        action: () => { settingsStore.setLayoutMode('split'); },
      }),
      await MenuItem.new({
        id: 'view-focus-editor',
        text: 'Focus Editor',
        accelerator: 'CmdOrCtrl+Alt+E',
        action: () => { settingsStore.setLayoutMode('focus'); },
      }),
      await MenuItem.new({
        id: 'view-focus-preview',
        text: 'Focus Preview',
        accelerator: 'CmdOrCtrl+Alt+P',
        action: () => { settingsStore.setLayoutMode('preview'); },
      }),
    ],
  });

  const helpSubmenu = await Submenu.new({
    text: 'Help',
    items: [
      await MenuItem.new({
        id: 'help-about',
        text: isMac ? 'About Texodus' : 'About',
        action: () => { settingsStore.setAboutVisible(true); },
      }),
    ],
  });
  const submenus: Submenu[] = [];

  if (isMac) {
    submenus.push(await Submenu.new({
      text: 'Texodus',
      items: [
        await MenuItem.new({
          id: 'app-about',
          text: 'About Texodus',
          action: () => { settingsStore.setAboutVisible(true); },
        }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Services' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Hide' }),
        await PredefinedMenuItem.new({ item: 'HideOthers' }),
        await PredefinedMenuItem.new({ item: 'ShowAll' }),
        await PredefinedMenuItem.new({ item: 'Separator' }),
        await PredefinedMenuItem.new({ item: 'Quit' }),
      ],
    }));
  }

  submenus.push(fileSubmenu, editSubmenu, viewSubmenu, helpSubmenu);

  return await Menu.new({ items: submenus });
}
