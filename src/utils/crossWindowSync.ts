/**
 * Cross-window synchronisation utility.
 *
 * Uses BroadcastChannel for instant notification when one window changes
 * persisted state. Falls back to the `storage` event (fires in other windows
 * on localStorage writes) when BroadcastChannel is unavailable.
 *
 * Usage:
 *   const cleanup = createCrossWindowSync({
 *     channelName: 'texodus-settings-sync',
 *     storageKey: 'texodus.settings.v1',
 *     onSync: () => store.reloadFromStorage(),
 *   });
 *   // In persist():
 *   broadcastChange('texodus-settings-sync');
 */

interface CrossWindowSyncOptions {
  /** BroadcastChannel name — unique per data domain. */
  channelName: string;
  /** localStorage key to watch as a fallback. */
  storageKey: string;
  /** Called when a sync signal is received from another window. */
  onSync: () => void;
}

type Listener = () => void;

const channels = new Map<string, BroadcastChannel>();

function getChannel(name: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  let ch = channels.get(name);
  if (!ch) {
    ch = new BroadcastChannel(name);
    channels.set(name, ch);
  }
  return ch;
}

/**
 * Broadcast a sync signal to other windows via BroadcastChannel.
 * The actual data lives in localStorage — this is just a "wake up" ping
 * so other windows re-read immediately instead of waiting for the
 * (slower, debounced) `storage` event.
 */
export function broadcastChange(channelName: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  // Create a throwaway channel so the message is delivered to the
  // listening channel (BroadcastChannel doesn't deliver to the same
  // instance that sent the message).
  const ch = new BroadcastChannel(channelName);
  ch.postMessage('sync');
  ch.close();
}

/**
 * Set up cross-window sync: listens to both BroadcastChannel messages
 * and `storage` events for the given key. Returns a cleanup function.
 */
export function createCrossWindowSync(options: CrossWindowSyncOptions): () => void {
  const { channelName, storageKey, onSync } = options;

  let syncing = false;
  const wrappedSync = () => {
    if (syncing) return;
    syncing = true;
    try {
      onSync();
    } finally {
      syncing = false;
    }
  };

  // BroadcastChannel listener.
  const ch = getChannel(channelName);
  const onChannelMessage = (e: MessageEvent) => {
    if (e.data === 'sync') wrappedSync();
  };
  ch?.addEventListener('message', onChannelMessage);

  // localStorage fallback — fires in other windows when localStorage changes.
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey) wrappedSync();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    ch?.removeEventListener('message', onChannelMessage);
    window.removeEventListener('storage', onStorage);
  };
}