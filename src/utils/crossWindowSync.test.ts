import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCrossWindowSync, broadcastChange } from './crossWindowSync';

// BroadcastChannel is not available in jsdom by default — polyfill it.
class MockBroadcastChannel {
  name: string;
  listeners: Set<(e: { data: unknown }) => void> = new Set();
  static instances = new Map<string, MockBroadcastChannel[]>();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.instances.has(name)) {
      MockBroadcastChannel.instances.set(name, []);
    }
    MockBroadcastChannel.instances.get(name)!.push(this);
  }

  postMessage(data: unknown): void {
    const peers = MockBroadcastChannel.instances.get(this.name) ?? [];
    for (const peer of peers) {
      if (peer === this) continue;
      peer.listeners.forEach((fn) => fn({ data }));
    }
  }

  addEventListener(_type: string, listener: (e: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (e: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    const peers = MockBroadcastChannel.instances.get(this.name) ?? [];
    MockBroadcastChannel.instances.set(
      this.name,
      peers.filter((p) => p !== this),
    );
  }
}

describe('crossWindowSync', () => {
  beforeEach(() => {
    MockBroadcastChannel.instances.clear();
    // @ts-expect-error: polyfill BroadcastChannel for jsdom
    globalThis.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    // @ts-expect-error: clean up polyfill
    delete globalThis.BroadcastChannel;
  });

  it('broadcastChange triggers onSync in other instances', () => {
    let syncCount = 0;
    const cleanup = createCrossWindowSync({
      channelName: 'test-sync',
      storageKey: 'test-key',
      onSync: () => { syncCount++; },
    });

    broadcastChange('test-sync');
    expect(syncCount).toBe(1);

    cleanup();
  });

  it('storage event triggers onSync', () => {
    let syncCount = 0;
    const cleanup = createCrossWindowSync({
      channelName: 'test-sync-2',
      storageKey: 'test-key-2',
      onSync: () => { syncCount++; },
    });

    // Simulate a storage event from another window.
    const event = new StorageEvent('storage', {
      key: 'test-key-2',
      newValue: '{}',
    });
    window.dispatchEvent(event);

    expect(syncCount).toBe(1);
    cleanup();
  });

  it('storage event for a different key does not trigger onSync', () => {
    let syncCount = 0;
    const cleanup = createCrossWindowSync({
      channelName: 'test-sync-3',
      storageKey: 'expected-key',
      onSync: () => { syncCount++; },
    });

    const event = new StorageEvent('storage', {
      key: 'wrong-key',
      newValue: '{}',
    });
    window.dispatchEvent(event);

    expect(syncCount).toBe(0);
    cleanup();
  });

  it('cleanup removes both listeners', () => {
    let syncCount = 0;
    const cleanup = createCrossWindowSync({
      channelName: 'test-sync-4',
      storageKey: 'test-key-4',
      onSync: () => { syncCount++; },
    });

    cleanup();

    broadcastChange('test-sync-4');
    const event = new StorageEvent('storage', {
      key: 'test-key-4',
      newValue: '{}',
    });
    window.dispatchEvent(event);

    expect(syncCount).toBe(0);
  });

  it('onSync is not re-entrant', () => {
    let callCount = 0;
    const cleanup = createCrossWindowSync({
      channelName: 'test-sync-5',
      storageKey: 'test-key-5',
      onSync: () => {
        callCount++;
        // Simulate re-entrancy: broadcastChange during onSync.
        broadcastChange('test-sync-5');
      },
    });

    broadcastChange('test-sync-5');
    expect(callCount).toBe(1);

    cleanup();
  });

  it('multiple channels are independent', () => {
    let countA = 0;
    let countB = 0;
    const cleanupA = createCrossWindowSync({
      channelName: 'channel-a',
      storageKey: 'key-a',
      onSync: () => { countA++; },
    });
    const cleanupB = createCrossWindowSync({
      channelName: 'channel-b',
      storageKey: 'key-b',
      onSync: () => { countB++; },
    });

    broadcastChange('channel-a');
    expect(countA).toBe(1);
    expect(countB).toBe(0);

    broadcastChange('channel-b');
    expect(countA).toBe(1);
    expect(countB).toBe(1);

    cleanupA();
    cleanupB();
  });
});