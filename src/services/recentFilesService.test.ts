import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { stat } from '@tauri-apps/plugin-fs';
import { setMockFile } from '../mock-tauri';
import { useSettingsStore } from '../stores/settings';
import { isMissingFileError, pruneMissingRecentFiles } from './recentFilesService';

beforeEach(() => setActivePinia(createPinia()));

describe('recent files cleanup', () => {
  it('recognizes common Unix, Windows, and mock missing-file errors', () => {
    expect(isMissingFileError(new Error('ENOENT: no such file or directory'))).toBe(true);
    expect(isMissingFileError('The system cannot find the file specified. (os error 2)')).toBe(true);
    expect(isMissingFileError(new Error('File not found: /gone.md'))).toBe(true);
    expect(isMissingFileError(new Error('forbidden path: /private.md'))).toBe(false);
    expect(isMissingFileError(new Error('Disk I/O error'))).toBe(false);
  });

  it('removes missing entries while preserving existing files and their order', async () => {
    setMockFile('/docs/a.md', 'A');
    setMockFile('/docs/c.md', 'C');
    const settings = useSettingsStore();
    settings.addRecentFile('/docs/c.md');
    settings.addRecentFile('/docs/missing.md');
    settings.addRecentFile('/docs/a.md');

    await pruneMissingRecentFiles(settings);

    expect(settings.recentFiles).toEqual(['/docs/a.md', '/docs/c.md']);
  });

  it('keeps entries when stat fails for permissions or transient I/O', async () => {
    const settings = useSettingsStore();
    settings.addRecentFile('/docs/private.md');
    vi.mocked(stat).mockRejectedValueOnce(new Error('forbidden path: /docs/private.md'));

    await pruneMissingRecentFiles(settings);

    expect(settings.recentFiles).toEqual(['/docs/private.md']);
  });
});
