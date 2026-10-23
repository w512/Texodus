import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useDocumentSearch } from '../composables/useDocumentSearch';
import SearchBar from './SearchBar.vue';

vi.mock('../composables/useDocumentSearch', async () => {
  const { ref } = await import('vue');
  const queryText = ref('needle');
  const state = {
    isOpen: ref(true),
    queryText,
    caseSensitive: ref(false),
    useRegex: ref(false),
    wholeWord: ref(false),
    replacementText: ref(''),
    showReplace: ref(false),
    canReplace: ref(true),
    matchCount: ref(3),
    currentIndex: ref(2),
    hasError: ref(false),
    focusNonce: ref(0),
    close: vi.fn(),
    setQuery: vi.fn((value: string) => { queryText.value = value; }),
    setCaseSensitive: vi.fn(),
    setRegex: vi.fn(),
    setWholeWord: vi.fn(),
    setReplacement: vi.fn((value: string) => { state.replacementText.value = value; }),
    toggleReplace: vi.fn(() => { state.showReplace.value = !state.showReplace.value; }),
    replaceCurrent: vi.fn(),
    replaceAll: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    refresh: vi.fn(),
    retarget: vi.fn(),
  };
  return { useDocumentSearch: () => state };
});

beforeEach(() => {
  setActivePinia(createPinia());
  const search = useDocumentSearch();
  search.isOpen.value = true;
  search.queryText.value = 'needle';
  search.matchCount.value = 3;
  search.currentIndex.value = 2;
  search.hasError.value = false;
  search.replacementText.value = '';
  search.showReplace.value = false;
  search.canReplace.value = true;
});

describe('SearchBar', () => {
  it('renders the current match count and forwards query edits', async () => {
    const wrapper = mount(SearchBar);
    expect(wrapper.get('.searchbar-count').text()).toBe('2/3');

    await wrapper.get('input').setValue('updated');
    expect(useDocumentSearch().setQuery).toHaveBeenCalledWith('updated');
  });

  it('handles navigation and close keyboard shortcuts', async () => {
    const wrapper = mount(SearchBar);
    const input = wrapper.get('input');

    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('keydown', { key: 'Enter', shiftKey: true });
    await input.trigger('keydown', { key: 'Escape' });

    expect(useDocumentSearch().next).toHaveBeenCalledOnce();
    expect(useDocumentSearch().prev).toHaveBeenCalledOnce();
    expect(useDocumentSearch().close).toHaveBeenCalledOnce();
  });

  it('shows empty, no-result, and invalid-pattern states', async () => {
    const wrapper = mount(SearchBar);
    const search = useDocumentSearch();

    search.matchCount.value = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.searchbar-count').text()).toBe('No results');

    search.hasError.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.searchbar-count').text()).toBe('Bad pattern');
    expect(wrapper.get('.searchbar-field').classes()).toContain('has-error');

    search.queryText.value = '  ';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.searchbar-count').text()).toBe('');
  });

  it('toggles the replace row and forwards replacement actions', async () => {
    const wrapper = mount(SearchBar);
    expect(wrapper.find('.replace-field').exists()).toBe(false);

    await wrapper.get('.sb-expand').trigger('click');
    expect(useDocumentSearch().toggleReplace).toHaveBeenCalledOnce();
    expect(wrapper.find('.replace-field').exists()).toBe(true);

    await wrapper.get('.searchbar-replace').setValue('replacement');
    expect(useDocumentSearch().setReplacement).toHaveBeenCalledWith('replacement');

    await wrapper.get('[title="Replace (Enter)"]').trigger('click');
    await wrapper.get('[title="Replace all (Cmd/Ctrl+Enter)"]').trigger('click');
    expect(useDocumentSearch().replaceCurrent).toHaveBeenCalledOnce();
    expect(useDocumentSearch().replaceAll).toHaveBeenCalledOnce();
  });

  it('offers an explicit replace toggle beside the search options', async () => {
    const wrapper = mount(SearchBar);
    await wrapper.get('.sb-replace-toggle').trigger('click');
    expect(useDocumentSearch().toggleReplace).toHaveBeenCalledOnce();
  });

  it('focuses the replacement field when the replace row opens', async () => {
    const wrapper = mount(SearchBar, { attachTo: document.body });
    await wrapper.get('.sb-replace-toggle').trigger('click');
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(wrapper.get('.searchbar-replace').element);
    wrapper.unmount();
  });

  it('replaces on Enter in the replacement field', async () => {
    const wrapper = mount(SearchBar);
    await wrapper.get('.sb-expand').trigger('click');

    await wrapper.get('.searchbar-replace').trigger('keydown', { key: 'Enter' });
    expect(useDocumentSearch().replaceCurrent).toHaveBeenCalledOnce();

    await wrapper.get('.searchbar-replace').trigger('keydown', { key: 'Enter', metaKey: true });
    expect(useDocumentSearch().replaceAll).toHaveBeenCalledOnce();
  });
});
