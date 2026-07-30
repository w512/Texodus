import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditorStore } from '../stores/editor';
import { useSettingsStore } from '../stores/settings';
import { menuInputsKey } from './useAppMenu';

beforeEach(() => setActivePinia(createPinia()));

describe('app menu cache inputs', () => {
  it('changes for recent files and document mode', () => {
    const editor = useEditorStore();
    const settings = useSettingsStore();
    const initial = menuInputsKey(editor, settings);

    settings.addRecentFile('/docs/a.md');
    expect(menuInputsKey(editor, settings)).not.toBe(initial);

    const withRecent = menuInputsKey(editor, settings);
    settings.setDocumentMode('tabs');
    expect(menuInputsKey(editor, settings)).not.toBe(withRecent);
  });

  it('only includes tab count when it changes the Close action', () => {
    const editor = useEditorStore();
    const settings = useSettingsStore();
    const windowsKey = menuInputsKey(editor, settings);
    editor.addTab({ content: '', filePath: null });
    expect(menuInputsKey(editor, settings)).toBe(windowsKey);

    settings.setDocumentMode('tabs');
    const multiTabKey = menuInputsKey(editor, settings);
    editor.closeTab(editor.activeTabId);
    expect(menuInputsKey(editor, settings)).not.toBe(multiTabKey);
  });
});
