import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useSettingsStore } from '../stores/settings';
import EditorLayout from './EditorLayout.vue';

function pointerEvent(type: string, clientX: number, pointerId = 7): Event {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'mouse' },
  });
  return event;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('EditorLayout divider', () => {
  it('uses pointer events, current container geometry, and persists the ratio', async () => {
    const wrapper = mount(EditorLayout, {
      props: { layoutMode: 'split' },
      slots: { editor: 'Editor', preview: 'Preview' },
    });
    const store = useSettingsStore();
    const container = wrapper.get('.editor-container').element as HTMLElement;
    let width = 100;
    container.getBoundingClientRect = () => ({
      x: 10, y: 0, left: 10, right: 10 + width, top: 0, bottom: 100,
      width, height: 100, toJSON: () => ({}),
    });

    wrapper.get('.pane-divider').element.dispatchEvent(pointerEvent('pointerdown', 60));
    document.dispatchEvent(pointerEvent('pointermove', 60));
    expect(store.splitRatio).toBe(0.5);

    // Reflow during the gesture: the second move must use the new width.
    width = 200;
    document.dispatchEvent(pointerEvent('pointermove', 160));
    expect(store.splitRatio).toBe(0.75);

    document.dispatchEvent(pointerEvent('pointerup', 160));
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem('texodus.splitRatio.v1')!)).toBe(0.75);
    expect(wrapper.get('.editor-pane').attributes('style')).toContain('75%');
  });

  it('keeps the ratio when leaving and returning to split mode', async () => {
    const store = useSettingsStore();
    store.setSplitRatio(0.7);
    const wrapper = mount(EditorLayout, { props: { layoutMode: 'split' } });

    await wrapper.setProps({ layoutMode: 'preview' });
    await wrapper.setProps({ layoutMode: 'split' });

    expect(store.splitRatio).toBe(0.7);
    expect(wrapper.get('.editor-pane').attributes('style')).toContain('70%');
  });
});
