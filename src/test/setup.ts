import { vi, beforeEach } from 'vitest';
import {
  mockFs,
  mockDialog,
  mockCore,
  mockApis,
  resetMockTauri,
} from '../mock-tauri';

// ── Centralised Tauri mocks ────────────────────────────────────────────────────
// All Tauri modules are mocked here so individual test files don't need to
// repeat the boilerplate. Each mock is a vi.fn() wrapping the mock-tauri
// default implementation, so tests can still use:
//   vi.mocked(readDir).mockResolvedValue([...])
// to override behaviour for specific cases.

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn((path: string) => mockFs.readTextFile(path)),
  readFile: vi.fn((path: string) => mockFs.readFile(path)),
  writeTextFile: vi.fn((path: string, content: string) => mockFs.writeTextFile(path, content)),
  readDir: vi.fn((dir: string) => mockFs.readDir(dir)),
  stat: vi.fn((path: string) => mockFs.stat(path)),
  watch: vi.fn(() => () => {}),
  mkdir: vi.fn((path: string) => mockFs.mkdir(path)),
  remove: vi.fn((path: string) => mockFs.remove(path)),
  rename: vi.fn((oldPath: string, newPath: string) => mockFs.rename(oldPath, newPath)),
  copyFile: vi.fn((src: string, dest: string) => mockFs.copyFile(src, dest)),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => mockDialog.open()),
  save: vi.fn(() => mockDialog.save()),
  message: vi.fn(() => mockDialog.message()),
  confirm: vi.fn(() => mockDialog.confirm()),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => mockCore.invoke(cmd, args)),
  convertFileSrc: vi.fn((path: string) => mockCore.convertFileSrc(path)),
}));

vi.mock('@tauri-apps/api/window', () => mockApis['@tauri-apps/api/window']);
vi.mock('@tauri-apps/api/webview', () => mockApis['@tauri-apps/api/webview']);
vi.mock('@tauri-apps/api/event', () => mockApis['@tauri-apps/api/event']);
vi.mock('@tauri-apps/api/menu', () => mockApis['@tauri-apps/api/menu']);
vi.mock('@tauri-apps/plugin-opener', () => mockApis['@tauri-apps/plugin-opener']);

// Reset mock state and restore default implementations before each test.
beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetMockTauri();
});