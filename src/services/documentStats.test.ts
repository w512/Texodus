import { describe, expect, it } from 'vitest';
import { computeDocumentStats, extractMarkdownPlainText } from './documentStats';

describe('computeDocumentStats', () => {
  it('does not count markdown syntax as words or characters', () => {
    const s = computeDocumentStats('# Title\n\n**bold** *text*');
    expect(s.words).toBe(3); // Title, bold, text
    expect(s.charsNoSpaces).toBe('Titleboldtext'.length);
  });

  it('counts link text but not the URL', () => {
    const s = computeDocumentStats('[click here](https://example.com/a/very/long/url)');
    expect(s.words).toBe(2);
  });

  it('skips fenced code blocks, raw HTML and frontmatter', () => {
    const md = [
      '---',
      'title: hidden words in frontmatter',
      '---',
      '',
      'real words',
      '',
      '```js',
      'const notCounted = 1;',
      '```',
      '',
      '<div data-x="y"></div>',
    ].join('\n');
    expect(computeDocumentStats(md).words).toBe(2);
  });

  it('counts list items and table cells without merging them', () => {
    const md = '- one\n- two three\n\n| a | b |\n| - | - |\n| c | d |';
    expect(computeDocumentStats(md).words).toBe(7);
  });

  it('keeps inline code and image alt text as prose', () => {
    expect(computeDocumentStats('run `npm install` now').words).toBe(4);
    expect(computeDocumentStats('![alt text](pic.png)').words).toBe(2);
  });

  it('handles empty content', () => {
    expect(computeDocumentStats('')).toEqual({ words: 0, chars: 0, charsNoSpaces: 0 });
  });
});

describe('extractMarkdownPlainText', () => {
  it('separates blocks with newlines so words do not merge', () => {
    const text = extractMarkdownPlainText('# One\n\nTwo');
    expect(text).toBe('One\nTwo');
  });

  it('unwraps blockquotes and nested lists', () => {
    const text = extractMarkdownPlainText('> quoted\n\n- outer\n  - inner');
    expect(text.split('\n')).toEqual(['quoted', 'outer', 'inner']);
  });
});
