import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { setMockFile } from '../mock-tauri';
import { useWorkspaceStore } from '../stores/workspace';
import {
  clearDocumentTitleCache,
  documentTitleFromContent,
  loadDocumentTitles,
  refreshDocumentTitles,
  updateDocumentTitleFromContent,
} from './documentTitleService';

beforeEach(() => {
  setActivePinia(createPinia());
  clearDocumentTitleCache();
});

describe('document title service', () => {
  it('uses H1, then frontmatter title, then the exact filename', () => {
    expect(documentTitleFromContent('# Main **Title**', 'note.md')).toBe('Main Title');
    expect(documentTitleFromContent('---\ntitle: Metadata Title\n---\nBody', 'note.md')).toBe('Metadata Title');
    expect(documentTitleFromContent('Body only', 'my-note.md')).toBe('my-note.md');
  });

  it('loads nested file titles with fallback and stores them in Pinia', async () => {
    setMockFile('/ws/a.md', '# Alpha');
    setMockFile('/ws/docs/b.md', 'No heading');
    const nodes = [
      { name: 'a.md', path: '/ws/a.md', kind: 'file' as const },
      {
        name: 'docs', path: '/ws/docs', kind: 'directory' as const, children: [
          { name: 'b.md', path: '/ws/docs/b.md', kind: 'file' as const },
        ],
      },
    ];

    const titles = await loadDocumentTitles(nodes);

    expect(titles).toEqual({ '/ws/a.md': 'Alpha', '/ws/docs/b.md': 'b.md' });
    expect(useWorkspaceStore().documentTitles).toEqual(titles);
  });

  it('updates cached titles from live editor content', async () => {
    updateDocumentTitleFromContent('/ws/live.md', '# Live');
    const titles = await loadDocumentTitles([
      { name: 'live.md', path: '/ws/live.md', kind: 'file' },
    ]);

    expect(titles['/ws/live.md']).toBe('Live');
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it('refreshes titles for supported paths from workspace events', async () => {
    setMockFile('/ws/live.md', '# Updated externally');
    await refreshDocumentTitles(['/ws/live.md', '/ws/image.png']);
    expect(useWorkspaceStore().documentTitles['/ws/live.md']).toBe('Updated externally');
    expect(readTextFile).toHaveBeenCalledTimes(1);
  });

  it('falls back when a file cannot be read', async () => {
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error('denied'));
    const titles = await loadDocumentTitles([
      { name: 'private.md', path: '/ws/private.md', kind: 'file' },
    ]);
    expect(titles['/ws/private.md']).toBe('private.md');
  });
});
