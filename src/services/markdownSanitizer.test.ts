import { describe, expect, it } from 'vitest';
import {
  lexMarkdown,
  parseMarkdownTokens,
  renderFrontmatterHtml,
  renderMarkdownToSafeHtml,
  sanitizeMarkdownHtml,
  splitRenderableFrontmatter,
} from './markdownSanitizer';

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

  it('renders frontmatter as a metadata block instead of hr + setext h2', async () => {
    const out = await renderMarkdownToSafeHtml(
      '---\ntitle: YAML Front Matter\ntags: [a, b]\n---\n\nBody text\n\n---\n',
    );
    expect(out).toContain('<pre class="frontmatter">');
    expect(out).toContain('title: YAML Front Matter');
    // The old misparse: delimiters became <hr> and the yaml a giant <h2>.
    expect(out).not.toContain('<h2');
    // A --- later in the body still renders as a normal thematic break.
    expect(out).toContain('<hr');
    expect(out).toContain('<p>Body text</p>');
  });

  it('marks GFM task checkboxes with data-task; raw inputs stay unmarked', async () => {
    const out = await renderMarkdownToSafeHtml(
      '- [x] done\n- [ ] todo\n\n<input type="checkbox">',
    );
    expect(out.match(/data-task/g)).toHaveLength(2);
    expect(out).toContain('checked');
    // The raw-HTML input survives sanitization but without the marker.
    expect(out.match(/<input/g)).toHaveLength(3);
  });

  // The preview renders via lexMarkdown + parseMarkdownTokens, not
  // marked.parse. marked's lexer/parser *replace* defaults with explicit
  // options instead of merging, so passing options there silently drops the
  // use()-registered checkbox renderer — this guards the preview's own path.
  it('keeps the data-task override on the lexer+parser (preview) path', () => {
    const out = parseMarkdownTokens(lexMarkdown('- [x] done\n- [ ] todo\n'));
    expect(out.match(/data-task/g)).toHaveLength(2);
    expect(out).toContain('checked');
  });
});

describe('splitRenderableFrontmatter', () => {
  it('splits valid frontmatter off the body with line/char offsets', () => {
    const doc = '---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n';
    const split = splitRenderableFrontmatter(doc);
    expect(split.frontmatterYaml).toBe('title: Test\ntags: [a, b]');
    expect(split.body).toBe('\n# Heading\n');
    // Frontmatter occupies source lines 0–3; the body starts on line 4.
    expect(split.bodyLineOffset).toBe(4);
    expect(doc.slice(split.bodyCharOffset)).toBe(split.body);
  });

  it('passes documents without frontmatter through untouched', () => {
    const doc = '# Hello\n\ntext';
    expect(splitRenderableFrontmatter(doc)).toEqual({
      frontmatterYaml: null,
      body: doc,
      bodyLineOffset: 0,
      bodyCharOffset: 0,
    });
  });

  it('ignores a --- block later in the document', () => {
    const doc = 'intro\n\n---\nkey: value\n---\n';
    expect(splitRenderableFrontmatter(doc).frontmatterYaml).toBeNull();
  });

  it('leaves empty and key-less (invalid) blocks alone', () => {
    expect(splitRenderableFrontmatter('---\n---\n# Body').frontmatterYaml).toBeNull();
    expect(splitRenderableFrontmatter('---\nno key value here\n---\n').frontmatterYaml).toBeNull();
  });

  it('handles an unclosed opening delimiter as plain markdown', () => {
    const doc = '---\ntitle: never closed\n';
    expect(splitRenderableFrontmatter(doc).frontmatterYaml).toBeNull();
    expect(splitRenderableFrontmatter(doc).body).toBe(doc);
  });

  it('handles CRLF line endings', () => {
    const doc = '---\r\ntitle: Test\r\n---\r\nbody';
    const split = splitRenderableFrontmatter(doc);
    expect(split.frontmatterYaml).toBe('title: Test');
    expect(split.body).toBe('body');
    expect(split.bodyLineOffset).toBe(3);
    expect(doc.slice(split.bodyCharOffset)).toBe('body');
  });

  it('handles a document that is only frontmatter', () => {
    const split = splitRenderableFrontmatter('---\ntitle: Solo\n---');
    expect(split.frontmatterYaml).toBe('title: Solo');
    expect(split.body).toBe('');
  });
});

describe('renderFrontmatterHtml', () => {
  it('renders a language-yaml code block tagged as frontmatter', () => {
    const html = renderFrontmatterHtml('title: Test');
    expect(html).toContain('<pre class="frontmatter">');
    expect(html).toContain('<code class="language-yaml">');
    expect(html).toContain('title: Test');
  });

  it('escapes HTML so frontmatter cannot inject markup', () => {
    const html = renderFrontmatterHtml('title: <script>alert(1)</script> & <img src=x>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    // And it survives the shared sanitizer intact.
    const clean = sanitizeMarkdownHtml(html);
    expect(clean).toContain('class="frontmatter"');
    expect(clean).toContain('&lt;script&gt;');
  });
});
