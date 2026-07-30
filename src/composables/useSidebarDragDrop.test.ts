import { describe, expect, it } from 'vitest';
import { canDropSidebarNode } from './useSidebarDragDrop';

describe('sidebar drag and drop targets', () => {
  it('allows moving a node to an unrelated directory or parent', () => {
    expect(canDropSidebarNode('/ws/a/file.md', '/ws/b')).toBe(true);
    expect(canDropSidebarNode('/ws/a/file.md', '/ws/a')).toBe(true);
  });

  it('rejects dropping onto itself or inside a dragged directory', () => {
    expect(canDropSidebarNode('/ws/a', '/ws/a')).toBe(false);
    expect(canDropSidebarNode('/ws/a', '/ws/a/sub')).toBe(false);
    expect(canDropSidebarNode('C:\\WS\\a', 'C:/WS/a/sub')).toBe(false);
  });

  it('does not confuse sibling prefixes with descendants', () => {
    expect(canDropSidebarNode('/ws/a', '/ws/ab')).toBe(true);
  });
});
