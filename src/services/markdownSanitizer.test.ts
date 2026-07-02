import { describe, expect, it } from 'vitest';
import { renderMarkdownToSafeHtml, sanitizeMarkdownHtml } from './markdownSanitizer';

describe('sanitizeMarkdownHtml', () => {
  it('strips script tags', () => {
    const out = sanitizeMarkdownHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>hi</p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips event-handler attributes but keeps the element', () => {
    const out = sanitizeMarkdownHtml('<img src="x.png" onerror="alert(1)">');
    expect(out).toContain('<img');
    expect(out).toContain('src="x.png"');
    expect(out).not.toContain('onerror');
  });

  it('removes javascript: URLs', () => {
    const out = sanitizeMarkdownHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('drops disallowed embedding tags entirely', () => {
    expect(sanitizeMarkdownHtml('<iframe src="https://evil"></iframe>')).not.toContain('<iframe');
    expect(sanitizeMarkdownHtml('<object data="x"></object>')).not.toContain('<object');
    expect(sanitizeMarkdownHtml('<style>body{display:none}</style>')).not.toContain('<style');
  });

  it('keeps <u> produced by the Underline formatting command', () => {
    const out = sanitizeMarkdownHtml('<p><u>underlined</u></p>');
    expect(out).toContain('<u>underlined</u>');
  });

  it('keeps the whitelisted structural tags', () => {
    const input = '<h2 id="t">T</h2><blockquote>q</blockquote><table><tbody><tr><td>c</td></tr></tbody></table>';
    const out = sanitizeMarkdownHtml(input);
    expect(out).toContain('<h2 id="t">');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<td>c</td>');
  });
});

describe('renderMarkdownToSafeHtml', () => {
  it('renders GFM markdown', async () => {
    const out = await renderMarkdownToSafeHtml('# Title\n\n**bold** and `code`\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<table');
  });

  it('sanitizes raw HTML embedded in markdown', async () => {
    const out = await renderMarkdownToSafeHtml('hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
  });
});
