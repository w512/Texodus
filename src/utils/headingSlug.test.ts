import { describe, expect, it } from 'vitest';
import { createHeadingSlugger, htmlToPlainText, slugifyHeadingText } from './headingSlug';

describe('slugifyHeadingText', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugifyHeadingText('Example Markdown Syntax')).toBe('example-markdown-syntax');
  });

  it('drops punctuation and symbols the way GitHub does', () => {
    expect(slugifyHeadingText('C++ & "friends"!')).toBe('c--friends');
    expect(slugifyHeadingText('What? Really...')).toBe('what-really');
  });

  it('keeps underscores, hyphens, digits and non-Latin letters', () => {
    expect(slugifyHeadingText('snake_case-2 Название')).toBe('snake_case-2-название');
  });

  it('trims the ends but not inner runs of whitespace', () => {
    expect(slugifyHeadingText('  spaced  out  ')).toBe('spaced--out');
  });

  it('collapses a heading of pure punctuation to an empty slug', () => {
    expect(slugifyHeadingText('!!!')).toBe('');
  });
});

describe('createHeadingSlugger', () => {
  it('numbers repeated headings in document order', () => {
    const slugger = createHeadingSlugger();
    expect(slugger.slug('Usage')).toBe('usage');
    expect(slugger.slug('Usage')).toBe('usage-1');
    expect(slugger.slug('Usage')).toBe('usage-2');
    expect(slugger.slug('Other')).toBe('other');
  });

  it('starts counting again after reset', () => {
    const slugger = createHeadingSlugger();
    slugger.slug('Usage');
    slugger.reset();
    expect(slugger.slug('Usage')).toBe('usage');
  });
});

describe('htmlToPlainText', () => {
  it('strips inline markup so anchors follow the visible text', () => {
    expect(htmlToPlainText('<strong>Bold</strong> <code>code</code>')).toBe('Bold code');
  });

  it('decodes the entities marked emits', () => {
    expect(htmlToPlainText('A &amp; B &lt;tag&gt; &quot;q&quot;')).toBe('A & B <tag> "q"');
  });
});
