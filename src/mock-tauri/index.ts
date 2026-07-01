/**
 * Mock Tauri layer for browser dev and unit tests.
 *
 * Provides an in-memory file system and mock implementations for all Tauri
 * commands used by the app. In tests, import the helpers to set up file
 * content and control invoke handlers. In browser dev mode, the polyfill
 * auto-installs when Tauri is not detected.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MockDirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

// ── In-memory file system ──────────────────────────────────────────────────────

interface FsNode {
  name: string;
  isDir: boolean;
  content?: string;
  mtime: number;
}

const fs = new Map<string, FsNode>();

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function setMockFile(path: string, content: string): void {
  const p = normalizePath(path);
  const name = p.split('/').pop() || p;
  fs.set(p, { name, isDir: false, content, mtime: Date.now() });
}

export function setMockDir(path: string): void {
  const p = normalizePath(path);
  const name = p.split('/').pop() || p;
  if (!fs.has(p)) {
    fs.set(p, { name, isDir: true, mtime: Date.now() });
  }
}

export function clearMockFs(): void {
  fs.clear();
}

export function mockFsSize(): number {
  return fs.size;
}

// ── Mock invoke handlers ────────────────────────────────────────────────────────

const invokeHandlers = new Map<string, (args: Record<string, unknown>) => unknown>();

export function setMockInvoke(
  command: string,
  handler: (args: Record<string, unknown>) => unknown,
): void {
  invokeHandlers.set(command, handler);
}

export function clearMockInvokes(): void {
  invokeHandlers.clear();
}

export function mockInvokeCount(): number {
  return invokeHandlers.size;
}

// ── Reset everything ────────────────────────────────────────────────────────────

export function resetMockTauri(): void {
  fs.clear();
  invokeHandlers.clear();
}

// ── Tauri environment detection ──────────────────────────────────────────────────

export function isTauri(): boolean {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as { isTauri?: unknown }).isTauri === 'boolean') {
    return Boolean((globalThis as { isTauri?: unknown }).isTauri);
  }
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

// ── Mock implementations (used by both vitest mocks and browser polyfill) ───────

async function mockReadTextFile(path: string): Promise<string> {
  const p = normalizePath(path);
  const node = fs.get(p);
  if (!node) throw new Error(`File not found: ${path}`);
  if (node.isDir) throw new Error(`Is a directory: ${path}`);
  return node.content ?? '';
}

async function mockReadFile(path: string): Promise<Uint8Array> {
  const p = normalizePath(path);
  const node = fs.get(p);
  if (!node) throw new Error(`File not found: ${path}`);
  if (node.isDir) throw new Error(`Is a directory: ${path}`);
  return new TextEncoder().encode(node.content ?? '');
}

async function mockWriteTextFile(path: string, content: string): Promise<void> {
  const p = normalizePath(path);
  const name = p.split('/').pop() || p;
  fs.set(p, { name, isDir: false, content, mtime: Date.now() });
}

async function mockReadDir(dir: string): Promise<MockDirEntry[]> {
  const p = normalizePath(dir);
  const prefix = p.endsWith('/') ? p : p + '/';
  const entries: MockDirEntry[] = [];

  for (const [key, node] of fs) {
    if (key === p) continue;
    if (!key.startsWith(prefix)) continue;
    const remainder = key.slice(prefix.length);
    if (remainder.includes('/')) {
      // Subdirectory — return the top-level child only
      const childName = remainder.split('/')[0];
      const childPath = prefix + childName;
      const child = fs.get(childPath);
      if (child && child.isDir && !entries.some((e) => e.name === childName)) {
        entries.push({ name: childName, isDirectory: true, isFile: false });
      }
    } else {
      entries.push({
        name: node.name,
        isDirectory: node.isDir,
        isFile: !node.isDir,
      });
    }
  }

  return entries;
}

async function mockStat(path: string): Promise<{ mtime: Date; size: number }> {
  const p = normalizePath(path);
  const node = fs.get(p);
  if (!node) throw new Error(`File not found: ${path}`);
  return { mtime: new Date(node.mtime), size: node.content?.length ?? 0 };
}

function mockWatch(
  _path: string,
  _cb: () => void,
  _opts?: { delayMs?: number },
): UnwatchFn {
  return () => {};
}

async function mockMkdir(path: string): Promise<void> {
  const p = normalizePath(path);
  const name = p.split('/').pop() || p;
  fs.set(p, { name, isDir: true, mtime: Date.now() });
}

async function mockRemove(path: string): Promise<void> {
  const p = normalizePath(path);
  fs.delete(p);
  // Remove children
  const prefix = p.endsWith('/') ? p : p + '/';
  for (const key of [...fs.keys()]) {
    if (key.startsWith(prefix)) fs.delete(key);
  }
}

async function mockRename(oldPath: string, newPath: string): Promise<void> {
  const op = normalizePath(oldPath);
  const np = normalizePath(newPath);
  const node = fs.get(op);
  if (!node) throw new Error(`File not found: ${oldPath}`);
  node.name = np.split('/').pop() || np;
  fs.delete(op);
  fs.set(np, node);
}

async function mockCopyFile(src: string, dest: string): Promise<void> {
  const sp = normalizePath(src);
  const dp = normalizePath(dest);
  const node = fs.get(sp);
  if (!node) throw new Error(`File not found: ${src}`);
  const name = dp.split('/').pop() || dp;
  fs.set(dp, { name, isDir: false, content: node.content, mtime: Date.now() });
}

async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // Small delay to simulate async IPC.
  await new Promise((r) => setTimeout(r, 10));
  const handler = invokeHandlers.get(command);
  if (handler) return handler(args ?? {}) as T;
  // Default: resolve with undefined for unknown commands.
  return undefined as T;
}

// ── Export mock implementations ─────────────────────────────────────────────────

export const mockFs = {
  readTextFile: mockReadTextFile,
  readFile: mockReadFile,
  writeTextFile: mockWriteTextFile,
  readDir: mockReadDir,
  stat: mockStat,
  watch: mockWatch,
  mkdir: mockMkdir,
  remove: mockRemove,
  rename: mockRename,
  copyFile: mockCopyFile,
};

export const mockDialog = {
  open: async () => null as string | string | null,
  save: async () => null as string | null,
  message: async () => undefined,
  confirm: async () => true,
};

export const mockCore = {
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `asset://localhost/${path.replace(/\\/g, '/')}`,
};

type UnlistenFn = () => void | Promise<void>;
type UnwatchFn = UnlistenFn;

const mockWindow = {
  label: 'main',
  setTitle: async (_title: string): Promise<void> => {},
  destroy: async (): Promise<void> => {},
  onCloseRequested: async (_cb: (e: { preventDefault: () => void }) => void): Promise<UnlistenFn> => () => {},
  onFocusChanged: async (_cb: (e: { payload: boolean }) => void): Promise<UnlistenFn> => () => {},
};

const mockWebview = {
  onDragDropEvent: async (_cb: (e: { payload: { type: string; paths: string[]; position: { x: number; y: number } } }) => void): Promise<UnlistenFn> => () => {},
};

const mockEvent = {
  listen: async (_event: string, _cb: (e: { payload: unknown }) => void): Promise<UnlistenFn> => () => {},
};

const mockMenu = {
  Menu: {
    new: async (_opts: unknown) => ({
      setAsAppMenu: async () => {},
      setAsWindowMenu: async () => {},
    }),
  },
  Submenu: {
    new: async (_opts: unknown) => ({}),
  },
  MenuItem: {
    new: async (_opts: unknown) => ({}),
  },
  PredefinedMenuItem: {
    new: async (_opts: unknown) => ({}),
  },
};

const mockOpener = {
  revealItemInDir: async (_path: string): Promise<void> => {},
};

export const mockApis = {
  '@tauri-apps/plugin-fs': mockFs,
  '@tauri-apps/plugin-dialog': mockDialog,
  '@tauri-apps/api/core': mockCore,
  '@tauri-apps/api/window': { getCurrentWindow: () => mockWindow },
  '@tauri-apps/api/webview': { getCurrentWebview: () => mockWebview },
  '@tauri-apps/api/event': mockEvent,
  '@tauri-apps/api/menu': mockMenu,
  '@tauri-apps/plugin-opener': mockOpener,
};

// ── Browser polyfill ────────────────────────────────────────────────────────────

/** Install mock Tauri globals on the window object for browser dev mode. */
export function installBrowserPolyfill(): void {
  if (typeof window === 'undefined') return;
  // Already has Tauri — don't polyfill.
  if (isTauri()) return;

  // Install minimal globals so static imports don't crash.
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  (window as unknown as Record<string, unknown>).__TAURI__ = {};
}