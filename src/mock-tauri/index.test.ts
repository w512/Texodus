import { describe, it, expect, beforeEach } from 'vitest';
import {
  setMockFile,
  setMockDir,
  setMockInvoke,
  clearMockInvokes,
  resetMockTauri,
  mockFs,
  mockCore,
  isTauri,
  mockFsSize,
  mockInvokeCount,
} from './index';

beforeEach(() => {
  resetMockTauri();
});

describe('in-memory file system', () => {
  it('setMockFile creates a readable file', async () => {
    setMockFile('/tmp/note.md', '# Hello');
    const content = await mockFs.readTextFile('/tmp/note.md');
    expect(content).toBe('# Hello');
  });

  it('readTextFile throws for missing file', async () => {
    await expect(mockFs.readTextFile('/tmp/missing.md')).rejects.toThrow();
  });

  it('readTextFile throws for directory', async () => {
    setMockDir('/tmp/docs');
    await expect(mockFs.readTextFile('/tmp/docs')).rejects.toThrow('directory');
  });

  it('writeTextFile creates and overwrites files', async () => {
    await mockFs.writeTextFile('/tmp/a.md', 'first');
    expect(await mockFs.readTextFile('/tmp/a.md')).toBe('first');

    await mockFs.writeTextFile('/tmp/a.md', 'second');
    expect(await mockFs.readTextFile('/tmp/a.md')).toBe('second');
  });

  it('readDir returns entries in a directory', async () => {
    setMockDir('/root/docs');
    setMockFile('/root/docs/a.md', 'a');
    setMockFile('/root/docs/b.md', 'b');

    const entries = await mockFs.readDir('/root/docs');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name).sort()).toEqual(['a.md', 'b.md']);
  });

  it('readDir returns subdirectories without recursing', async () => {
    setMockDir('/root');
    setMockDir('/root/docs');
    setMockFile('/root/docs/note.md', 'x');

    const entries = await mockFs.readDir('/root');
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('docs');
    expect(entries[0].isDirectory).toBe(true);
  });

  it('stat returns mtime and size', async () => {
    setMockFile('/tmp/f.md', 'hello world');
    const info = await mockFs.stat('/tmp/f.md');
    expect(info.size).toBe(11);
    expect(info.mtime).toBeInstanceOf(Date);
  });

  it('stat throws for missing file', async () => {
    await expect(mockFs.stat('/tmp/none.md')).rejects.toThrow();
  });

  it('mkdir creates a directory entry', async () => {
    await mockFs.mkdir('/tmp/newdir');
    const entries = await mockFs.readDir('/tmp');
    expect(entries.some((e) => e.name === 'newdir' && e.isDirectory)).toBe(true);
  });

  it('remove deletes a file', async () => {
    setMockFile('/tmp/del.md', 'data');
    await mockFs.remove('/tmp/del.md');
    await expect(mockFs.readTextFile('/tmp/del.md')).rejects.toThrow();
  });

  it('remove deletes a directory and its children', async () => {
    setMockDir('/root/docs');
    setMockFile('/root/docs/a.md', 'a');
    setMockFile('/root/docs/sub/b.md', 'b');

    await mockFs.remove('/root/docs');
    expect(mockFsSize()).toBe(0);
  });

  it('rename moves a file', async () => {
    setMockFile('/tmp/old.md', 'content');
    await mockFs.rename('/tmp/old.md', '/tmp/new.md');

    await expect(mockFs.readTextFile('/tmp/old.md')).rejects.toThrow();
    expect(await mockFs.readTextFile('/tmp/new.md')).toBe('content');
  });

  it('rename throws for missing source', async () => {
    await expect(mockFs.rename('/tmp/missing.md', '/tmp/target.md')).rejects.toThrow();
  });

  it('copyFile duplicates a file', async () => {
    setMockFile('/tmp/src.md', 'original');
    await mockFs.copyFile('/tmp/src.md', '/tmp/copy.md');
    expect(await mockFs.readTextFile('/tmp/copy.md')).toBe('original');
    expect(await mockFs.readTextFile('/tmp/src.md')).toBe('original');
  });

  it('copyFile throws for missing source', async () => {
    await expect(mockFs.copyFile('/tmp/none.md', '/tmp/dest.md')).rejects.toThrow();
  });
});

describe('mock invoke', () => {
  it('returns undefined for unknown commands', async () => {
    const result = await mockCore.invoke('unknown_command');
    expect(result).toBeUndefined();
  });

  it('calls registered handler', async () => {
    setMockInvoke('my_command', (args) => ({ ok: true, ...args }));
    const result = await mockCore.invoke('my_command', { x: 1 });
    expect(result).toEqual({ ok: true, x: 1 });
  });

  it('clearMockInvokes removes all handlers', async () => {
    setMockInvoke('test', () => 42);
    clearMockInvokes();
    expect(mockInvokeCount()).toBe(0);
    const result = await mockCore.invoke('test');
    expect(result).toBeUndefined();
  });
});

describe('resetMockTauri', () => {
  it('clears both fs and invoke handlers', () => {
    setMockFile('/tmp/a.md', 'x');
    setMockInvoke('cmd', () => 1);
    expect(mockFsSize()).toBe(1);
    expect(mockInvokeCount()).toBe(1);

    resetMockTauri();
    expect(mockFsSize()).toBe(0);
    expect(mockInvokeCount()).toBe(0);
  });
});

describe('isTauri', () => {
  it('returns false in test environment', () => {
    expect(isTauri()).toBe(false);
  });
});