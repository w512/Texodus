import { describe, expect, it } from 'vitest';
import type { FileTreeNode } from '../stores/workspace';
import { collectFiles, toQuickOpenFiles } from './useQuickOpen';

const tree: FileTreeNode[] = [
  { name: 'z.md', path: '/ws/z.md', kind: 'file' },
  {
    name: 'docs',
    path: '/ws/docs',
    kind: 'directory',
    children: [
      { name: 'a.md', path: '/ws/docs/a.md', kind: 'file' },
      { name: 'lazy', path: '/ws/docs/lazy', kind: 'directory' },
    ],
  },
];

describe('quick open file collection', () => {
  it('collects files recursively and ignores unloaded directories', () => {
    expect(collectFiles(tree).map((file) => file.path)).toEqual([
      '/ws/z.md',
      '/ws/docs/a.md',
    ]);
  });

  it('maps and alphabetically sorts searchable files without mutating nodes', () => {
    expect(toQuickOpenFiles(collectFiles(tree))).toEqual([
      { path: '/ws/docs/a.md', name: 'a.md', displayTitle: 'a.md' },
      { path: '/ws/z.md', name: 'z.md', displayTitle: 'z.md' },
    ]);
    expect(tree[0].name).toBe('z.md');
  });
});
