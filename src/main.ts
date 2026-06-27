import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useSettingsStore, SETTINGS_STORAGE_KEY } from './stores/settings';

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

// Cross-window sync: `storage` fires in the *other* windows when one window
// persists. Re-reading keeps every window's settings consistent (notably
// documentMode, which the Rust side relies on to route "Open With" files).
// No feedback loop: re-persisting an identical payload doesn't change the
// stored value, and `storage` only fires on actual changes.
function onStorageChange(e: StorageEvent) {
  if (e.key === SETTINGS_STORAGE_KEY) settings.reloadFromStorage();
}
window.addEventListener('storage', onStorageChange);

// HMR cleanup: in dev mode, hot-reloading this module would otherwise
// accumulate duplicate `storage` listeners. `import.meta.hot` is only
// defined in Vite's dev server, so this block is tree-shaken in production.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('storage', onStorageChange);
  });
}

app.mount('#app');
