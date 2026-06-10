<template>
  <Transition name="fade">
    <div v-if="settingsStore.aboutVisible" class="about-overlay" @click.self="close">
      <div class="about-dialog glass">
        <button class="close-btn" @click="close" aria-label="Close">&times;</button>

        <div class="about-header">
          <img src="../assets/logo.png" class="app-icon" alt="Texodus Logo" />
          <h1>Texodus</h1>
          <p class="version">Version {{ appVersion }}</p>
        </div>

        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'info' }"
            @click="activeTab = 'info'"
          >
            About
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'license' }"
            @click="activeTab = 'license'"
          >
            License
          </button>
        </div>

        <div class="tab-content">
          <div v-if="activeTab === 'info'" class="tab-pane info-pane">
            <p>A fast, native Markdown editor built with Tauri and Vue.</p>
            <div class="credits">
              <p>Icons by <a href="https://icons8.com" target="_blank" rel="noopener">Icons8</a></p>
              <p>&copy; 2026 Nick. All rights reserved.</p>
            </div>
          </div>

          <div v-if="activeTab === 'license'" class="tab-pane license-pane">
            <pre class="license-text">{{ licenseText }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import packageJson from '../../package.json';
// The repo's LICENSE.txt is the single source of truth; ?raw inlines it at
// build time so the dialog can't drift from the actual license.
import licenseText from '../../LICENSE.txt?raw';
import { useSettingsStore } from '../stores/settings';

const settingsStore = useSettingsStore();
const activeTab = ref<'info' | 'license'>('info');
const appVersion = ref(packageJson.version);

onMounted(async () => {
  try {
    appVersion.value = await getVersion();
  } catch (error) {
    console.warn('Could not fetch app version from Tauri, using fallback:', error);
  }
});

const close = () => {
  settingsStore.setAboutVisible(false);
  activeTab.value = 'info';
};
</script>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}

.about-dialog {
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass {
  background: rgba(var(--bg-color-rgb, 255, 255, 255), 0.85);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  z-index: 10;
}

.close-btn:hover {
  background: var(--btn-hover);
  color: var(--text-color);
}

.about-header {
  padding: 2rem 1.5rem 1.5rem;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
}

.app-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  object-fit: contain;
  display: block;
}

.about-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-color);
}

.version {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.tabs {
  display: flex;
  padding: 0.5rem;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  flex: 1;
  padding: 0.5rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-color);
  background: rgba(0, 0, 0, 0.05);
}

.tab-btn.active {
  background: var(--bg-color);
  color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.info-pane {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  text-align: center;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-color);
}

.credits {
  margin-top: auto;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.credits a {
  color: var(--accent-color);
  text-decoration: none;
}

.credits a:hover {
  text-decoration: underline;
}

.license-pane {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
}

.license-text {
  font-family: var(--editor-font, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  white-space: pre-wrap;
  margin: 0;
  color: var(--text-color);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
