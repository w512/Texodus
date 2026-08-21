import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { open } from '@tauri-apps/plugin-shell';
import { useSettingsStore } from '../stores/settings';
import AboutDialog from './AboutDialog.vue';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useSettingsStore().setAboutVisible(true);
});

describe('AboutDialog', () => {
  it('shows the injected app version', () => {
    const wrapper = mount(AboutDialog);
    expect(wrapper.get('.version').text()).toBe('Version test');
  });

  it('opens credit links through the mocked shell plugin', async () => {
    const wrapper = mount(AboutDialog);
    await wrapper.get('a').trigger('click');
    await flushPromises();

    expect(vi.mocked(open)).toHaveBeenCalledWith('https://icons8.com');
  });
});
