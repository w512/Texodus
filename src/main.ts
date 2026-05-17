import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useSettingsStore } from './stores/settings';

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

app.mount('#app');
