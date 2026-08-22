import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useEditorStore } from '../stores/editor';
import MarkdownPreview from './MarkdownPreview.vue';

// The heavy render extras are irrelevant to link handling and pull in large
// lazy chunks.
vi.mock('../services/mermaidRenderer', () => ({
  renderMermaidBlocks: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/prismHighlighter', () => ({
  ensurePrismLanguages: vi.fn().mockResolvedValue(undefined),
  highlightUnder: vi.fn(),
}));

const openInOs = vi.fn();
vi.mock('@tauri-apps/plugin-shell', () => ({ open: (target: string) => openInOs(target) }));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

/** Mounts the preview over `markdown` and waits out the render debounce. */
async function mountPreview(markdown: string) {
  const store = useEditorStore();
  store.loadFile(markdown, '/docs/note.md');
  const wrapper = mount(MarkdownPreview, { attachTo: document.body });
  await vi.advanceTimersByTimeAsync(200);
  await flushPromises();
  return wrapper;
}

describe('in-page anchors', () => {
  it('scrolls to the heading a table-of-contents link points at', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const wrapper = await mountPreview('- [Second Section](#second-section)\n\n# First\n\n## Second Section\n');
    const heading = wrapper.element.querySelector('#second-section');
    expect(heading).not.toBeNull();

    await wrapper.get('a[href="#second-section"]').trigger('click');

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.instances[0]).toBe(heading);
    expect(openInOs).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('resolves a percent-encoded fragment', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const wrapper = await mountPreview('[go](#%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB)\n\n## Раздел\n');
    await wrapper.get('a').trigger('click');

    expect(scrollIntoView.mock.instances[0]).toBe(wrapper.element.querySelector('#раздел'));
    wrapper.unmount();
  });

  it('does nothing for a fragment with no matching heading', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const wrapper = await mountPreview('[go](#nowhere)\n\n## Somewhere\n');
    await wrapper.get('a').trigger('click');

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(openInOs).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
