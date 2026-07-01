import { describe, expect, it } from 'vitest';
import type { WatchEvent } from '@tauri-apps/plugin-fs';
import { changesTree } from './useWorkspaceWatch';

function event(type: WatchEvent['type']): WatchEvent {
  return { type, paths: ['/ws/x'], attrs: {} } as WatchEvent;
}

describe('changesTree', () => {
  it('refreshes on structural events (create / remove / rename)', () => {
    expect(changesTree(event({ create: { kind: 'file' } }))).toBe(true);
    expect(changesTree(event({ remove: { kind: 'folder' } }))).toBe(true);
    expect(changesTree(event({ modify: { kind: 'rename', mode: 'both' } }))).toBe(true);
  });

  it('ignores read-access events', () => {
    expect(changesTree(event({ access: { kind: 'open', mode: 'any' } }))).toBe(false);
  });

  it('ignores content and metadata modifications', () => {
    expect(changesTree(event({ modify: { kind: 'data', mode: 'content' } }))).toBe(false);
    expect(changesTree(event({ modify: { kind: 'metadata', mode: 'write-time' } }))).toBe(false);
  });

  it('refreshes defensively for coarse / unknown event kinds', () => {
    expect(changesTree(event('any'))).toBe(true);
    expect(changesTree(event('other'))).toBe(true);
    expect(changesTree(event({ modify: { kind: 'any' } }))).toBe(true);
    expect(changesTree(event({ modify: { kind: 'other' } }))).toBe(true);
  });
});
