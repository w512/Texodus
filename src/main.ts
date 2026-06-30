import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from './stores/settings';
import { createCrossWindowSync, broadcastChange } from './utils/crossWindowSync';

// Bundled fonts (no external CDN, works offline) — selected weights only
// to keep the bundle lean.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/iosevka/400.css';
import '@fontsource/iosevka/500.css';
import '@fontsource/google-sans-code/400.css';
import '@fontsource/google-sans-code/500.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Persist settings on any change.
const settings = useSettingsStore(pinia);
settings.$subscribe(() => settings.persist(), { detached: true });

// Cross-window sync: BroadcastChannel for instant notification + storage
// event fallback. When another window persists settings, this window
// re-reads from localStorage to stay consistent (notably documentMode,
// which the Rust side relies on to route "Open With" files).
const SYNC_CHANNEL = 'texodus-settings-sync';
const syncCleanup = createCrossWindowSync({
  channelName: SYNC_CHANNEL,
  storageKey: SETTINGS_STORAGE_KEY,
  onSync: () => settings.reloadFromStorage(),
});

// Expose broadcastChange so settings.persist() can notify other windows.
// Stored on the store instance as a non-reactive method.
(settings as unknown as { _broadcastSync: () => void })._broadcastSync = () =>
  broadcastChange(SYNC_CHANNEL);

// HMR cleanup: in dev mode, hot-reloading this module would otherwise
// accumulate duplicate listeners.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    syncCleanup();
  });
}

app.mount('#app');
