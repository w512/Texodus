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
    matchCount: ref(3),
    currentIndex: ref(2),
    hasError: ref(false),
    focusNonce: ref(0),
    close: vi.fn(),
    setQuery: vi.fn((value: string) => { queryText.value = value; }),
    setCaseSensitive: vi.fn(),
    setRegex: vi.fn(),
    setWholeWord: vi.fn(),
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
});
