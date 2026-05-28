import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as showOpenDialog } from '@tauri-apps/plugin-dialog';
import { openFile, saveFile, saveFileAs, newFile, loadFileFromPath, closeFile } from '../services/fileService';
import { exportPdf, exportHtml, exportTxt } from "../services/exportService";
import type { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '../utils/path';

const FILE_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }];

type EditorStore = ReturnType<typeof useEditorStore>;

// macOS hangs submenus under the global menu bar and expects an "app" submenu
// (About / Hide / Quit) first; Windows/Linux render the menu in the window's
// own bar and have no such submenu.
const isMac = navigator.userAgent.includes('Macintosh');

// Keep a global reference to prevent the menu (and its JS callbacks)
// from being garbage collected by V8, which breaks menu actions on Windows.
let activeMenu: Menu | null = null;

/**
 * Builds and installs the native application menu.
 *
 * `setAsAppMenu()` replaces the default menu wholesale, so we also restate the
 * Edit submenu — otherwise the editor textarea would lose native clipboard /
 * undo shortcuts. File accelerators live here (not in KeyboardShortcuts.vue) so
 * they have a single owner and don't double-fire.
 */
export async function setupAppMenu(store: EditorStore): Promise<void> {
  const settingsStore = useSettingsStore();

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
        action: () => {
          if (store.filePath || store.isDirty) {
            void invoke('open_new_window', { path: filePath });
          } else {
            void loadFileFromPath(store, filePath);
          }
        },
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

  const fileItems = [
    await MenuItem.new({
      id: 'file-new',
      text: 'New Window',
      accelerator: 'CmdOrCtrl+N',
      action: () => { void invoke('open_new_window'); },
    }),
    await MenuItem.new({
      id: 'file-open',
      text: 'Open…',
      accelerator: 'CmdOrCtrl+O',
      action: async () => {
        if (store.filePath || store.isDirty) {
          // Current window has content — pick file, then open in new window
          const selected = await showOpenDialog({ multiple: false, filters: FILE_FILTERS });
          if (!selected) return;
          void invoke('open_new_window', { path: selected as string });
        } else {
          void openFile(store);
        }
      },
    }),
    openRecentSubmenu,
    await MenuItem.new({
      id: 'file-close',
      text: 'Close',
      accelerator: 'CmdOrCtrl+W',
      action: () => { void closeFile(store); },
    }),
    await PredefinedMenuItem.new({ item: 'Separator' }),
    await MenuItem.new({
      id: 'file-export-pdf',
      text: 'Export as PDF…',
      accelerator: 'CmdOrCtrl+Shift+P',
      action: () => { void exportPdf(store.content, store.filePath); },
    }),
    await MenuItem.new({
      id: 'file-export-html',
      text: 'Export as HTML…',
      accelerator: 'CmdOrCtrl+Shift+H',
      action: () => { void exportHtml(store.content, store.filePath); },
    }),
    await MenuItem.new({
      id: 'file-export-txt',
      text: 'Export as TXT…',
      accelerator: 'CmdOrCtrl+Shift+X',
      action: () => { void exportTxt(store.content, store.filePath); },
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
  ];

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

  submenus.push(fileSubmenu, editSubmenu, helpSubmenu);

  const menu = await Menu.new({ items: submenus });
  activeMenu = menu; // Prevent GC

  if (isMac) {
    await menu.setAsAppMenu();
  } else {
    try {
      await menu.setAsWindowMenu(getCurrentWindow());
    } catch (e) {
      // Fallback if setAsWindowMenu fails
      await menu.setAsAppMenu();
    }
  }
}
