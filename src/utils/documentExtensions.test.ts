import { describe, expect, it } from 'vitest';
import { isSupportedDocument, SUPPORTED_DOCUMENT_EXTENSIONS } from './documentExtensions';

describe('document extensions', () => {
  it('keeps the supported extension list in one exported constant', () => {
    expect(SUPPORTED_DOCUMENT_EXTENSIONS).toEqual(['md', 'markdown', 'txt']);
  });

  it('matches supported paths case-insensitively', () => {
    expect(isSupportedDocument('/notes/readme.md')).toBe(true);
    expect(isSupportedDocument('C:\\Docs\\README.Markdown')).toBe(true);
    expect(isSupportedDocument('notes.TXT')).toBe(true);
  });

  it('rejects missing, trailing, and compound unsupported extensions', () => {
    expect(isSupportedDocument('/notes/md')).toBe(false);
    expect(isSupportedDocument('/notes/readme.md.bak')).toBe(false);
    expect(isSupportedDocument('/notes/readme.')).toBe(false);
    expect(isSupportedDocument('')).toBe(false);
  });
});
