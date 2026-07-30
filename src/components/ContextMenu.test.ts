import { afterEach, describe, expect, it } from 'vitest';
import { h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import ContextMenu from './ContextMenu.vue';

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  document.body.innerHTML = '';
});

function mountMenu(x = 20, y = 20) {
  return mount(ContextMenu, {
    attachTo: document.body,
    props: { x, y },
    slots: {
      default: () => [
        h('button', { role: 'menuitem', type: 'button' }, 'One'),
        h('button', { role: 'menuitem', type: 'button' }, 'Two'),
        h('button', { role: 'menuitem', type: 'button', disabled: true }, 'Disabled'),
      ],
    },
  });
}

describe('ContextMenu', () => {
  it('clamps its measured dimensions to every viewport edge', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    const wrapper = mountMenu(290, 190);
    const menu = wrapper.element as HTMLElement;
    menu.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 180, bottom: 150,
      width: 180, height: 150, toJSON: () => ({}),
    });

    await nextTick();
    await nextTick();

    expect(menu.style.left).toBe('112px');
    expect(menu.style.top).toBe('42px');
  });

  it('focuses the first item and cycles with arrows and Tab', async () => {
    const wrapper = mountMenu();
    await nextTick();
    await nextTick();
    const items = wrapper.findAll<HTMLElement>('[role="menuitem"]');

    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1].element);
    await items[1].trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[1].element);
  });

  it('closes on Escape and restores the previous focus', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const wrapper = mountMenu();
    await nextTick();
    await nextTick();

    await wrapper.get('[role="menuitem"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
  });
});
