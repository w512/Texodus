import { describe, it, expect } from 'vitest';
import {
  filenameStemToTitle,
  extractH1TitleFromContent,
  extractFrontmatterTitleFromContent,
  deriveDisplayTitle,
} from './noteTitle';

describe('filenameStemToTitle', () => {
  it('converts kebab-case to title case', () => {
    expect(filenameStemToTitle('my-note.md')).toBe('My Note');
  });

  it('handles filenames without extension', () => {
    expect(filenameStemToTitle('hello-world')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(filenameStemToTitle('readme')).toBe('Readme');
  });

  it('handles empty stem', () => {
    expect(filenameStemToTitle('.md')).toBe('');
  });
});

describe('extractH1TitleFromContent', () => {
  it('extracts H1 title', () => {
    expect(extractH1TitleFromContent('# Hello World\nbody')).toBe('Hello World');
  });

  it('returns null when no H1', () => {
    expect(extractH1TitleFromContent('## Subheading\nbody')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(extractH1TitleFromContent('')).toBeNull();
  });

  it('strips markdown formatting from H1', () => {
    expect(extractH1TitleFromContent('# **Bold** and _italic_')).toBe('Bold and italic');
  });

  it('strips link syntax from H1', () => {
    expect(extractH1TitleFromContent('# [Link text](http://x.com)')).toBe('Link text');
  });

  it('strips wikilink syntax from H1', () => {
    expect(extractH1TitleFromContent('# [[target|Display]]')).toBe('Display');
    expect(extractH1TitleFromContent('# [[plain-target]]')).toBe('plain-target');
  });

  it('skips frontmatter when looking for H1', () => {
    expect(extractH1TitleFromContent('---\ntitle: FM Title\n---\n# Real Title')).toBe('Real Title');
  });

  it('finds first non-blank line as H1', () => {
    expect(extractH1TitleFromContent('\n\n\n# Title')).toBe('Title');
  });
});

describe('extractFrontmatterTitleFromContent', () => {
  it('extracts title from frontmatter', () => {
    expect(extractFrontmatterTitleFromContent('---\ntitle: FM Title\n---\n# H1')).toBe('FM Title');
  });

  it('returns null when no frontmatter', () => {
    expect(extractFrontmatterTitleFromContent('# Hello')).toBeNull();
  });

  it('returns null for empty title', () => {
    expect(extractFrontmatterTitleFromContent('---\ntitle: ""\n---\n')).toBeNull();
  });

  it('returns null when title is not a string', () => {
    expect(extractFrontmatterTitleFromContent('---\ntitle: 42\n---\n')).toBeNull();
  });
});

describe('deriveDisplayTitle', () => {
  it('prefers H1 over frontmatter title', () => {
    const result = deriveDisplayTitle({
      content: '---\ntitle: FM Title\n---\n# H1 Title',
      filename: 'my-note.md',
    });
    expect(result.title).toBe('H1 Title');
    expect(result.hasH1).toBe(true);
  });

  it('falls back to frontmatter title when no H1', () => {
    const result = deriveDisplayTitle({
      content: '---\ntitle: FM Title\n---\nBody text',
      filename: 'my-note.md',
    });
    expect(result.title).toBe('FM Title');
    expect(result.hasH1).toBe(false);
  });

  it('falls back to filename when no H1 or frontmatter', () => {
    const result = deriveDisplayTitle({
      content: 'Just some body text',
      filename: 'my-note.md',
    });
    expect(result.title).toBe('My Note');
    expect(result.hasH1).toBe(false);
  });

  it('uses pre-parsed frontmatterTitle when provided', () => {
    const result = deriveDisplayTitle({
      content: 'Body text',
      filename: 'my-note.md',
      frontmatterTitle: 'Custom Title',
    });
    expect(result.title).toBe('Custom Title');
  });
});