import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { openFile, saveFile, saveFileAs, newFile } from '../services/fileService';
import type { useEditorStore } from '../stores/editor';

type EditorStore = ReturnType<typeof useEditorStore>;

// macOS hangs submenus under the global menu bar and expects an "app" submenu
// (About / Hide / Quit) first; Windows/Linux render the menu in the window's
// own bar and have no such submenu.
const isMac = navigator.userAgent.includes('Macintosh');

/**
 * Builds and installs the native application menu.
 *
 * `setAsAppMenu()` replaces the default menu wholesale, so we also restate the
 * Edit submenu — otherwise the editor textarea would lose native clipboard /
 * undo shortcuts. File accelerators live here (not in KeyboardShortcuts.vue) so
 * they have a single owner and don't double-fire.
 */
export async function setupAppMenu(store: EditorStore): Promise<void> {
  const fileItems = [
    await MenuItem.new({
      id: 'file-new',
      text: 'New',
      accelerator: 'CmdOrCtrl+N',
      action: () => { void newFile(store); },
    }),
    await MenuItem.new({
      id: 'file-open',
      text: 'Open…',
      accelerator: 'CmdOrCtrl+O',
      action: () => { void openFile(store); },
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
    fileItems.push(await PredefinedMenuItem.new({ item: 'CloseWindow', text: 'Exit' }));
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
        action: () => { store.setAboutVisible(true); },
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
          action: () => { store.setAboutVisible(true); },
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
  await menu.setAsAppMenu();
}
