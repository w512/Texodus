import { beforeAll, describe, expect, it } from 'vitest';
import {
  lexMarkdown,
  parseMarkdownTokens,
  renderFrontmatterHtml,
  renderMarkdownToSafeHtml,
  sanitizeMarkdownHtml,
  splitRenderableFrontmatter,
} from './markdownSanitizer';
import { ensureKatex } from './katexRenderer';

beforeAll(async () => {
  await ensureKatex();
});

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

  it('renders inline TeX as KaTeX MathML', async () => {
    const out = await renderMarkdownToSafeHtml('Euler: $e^{i\\pi}+1=0$');
    expect(out).toContain('<span class="katex">');
    expect(out).toContain('<math');
    expect(out).toContain('<msup>');
    expect(out).toContain('<annotation encoding="application/x-tex">e^{i\\pi}+1=0</annotation>');
  });

  it('renders block TeX as a display formula', async () => {
    const out = await renderMarkdownToSafeHtml('$$\n\\frac{a}{b}\n$$');
    expect(out).toContain('<math');
    expect(out).toContain('display="block"');
    expect(out).toContain('<mfrac>');
  });

  it('leaves ordinary dollar amounts alone', async () => {
    const out = await renderMarkdownToSafeHtml('It costs $5 and $10.');
    expect(out).toContain('$5 and $10.');
    expect(out).not.toContain('class="katex"');
  });

  it('shows invalid TeX as an error instead of throwing', async () => {
    const out = await renderMarkdownToSafeHtml('$\\frac{1}$');
    expect(out).toContain('class="katex-error"');
    expect(out).toContain('\\frac{1}');
  });

  it('does not parse TeX inside inline code', async () => {
    const out = await renderMarkdownToSafeHtml('`$x$`');
    expect(out).toContain('<code>$x$</code>');
    expect(out).not.toContain('class="katex"');
  });

  it('does not parse LaTeX delimiters inside code', async () => {
    const inline = await renderMarkdownToSafeHtml('`\\(x\\)` and `\\[y\\]`');
    expect(inline).toContain('<code>\\(x\\)</code>');
    expect(inline).not.toContain('class="katex"');

    const fenced = await renderMarkdownToSafeHtml('```\n\\begin{equation}\nx=1\n\\end{equation}\n```');
    expect(fenced).toContain('<code');
    expect(fenced).not.toContain('<math');
  });

  it('renders inline TeX whose closing delimiter is on the next line', async () => {
    const out = await renderMarkdownToSafeHtml('Euler: $\\Theta(n)\n$.');
    expect(out).toContain('class="katex"');
    expect(out).toContain('<annotation encoding="application/x-tex">\\Theta(n)</annotation>');
    expect(out).toContain('.</p>');
  });

  it('renders a single-dollar block whose delimiters sit on their own lines', async () => {
    const out = await renderMarkdownToSafeHtml('$\n\\Theta(n)\n$');
    expect(out).toContain('<math');
    expect(out).toContain('display="block"');
    expect(out).toContain('>Θ</mi>');
  });

  it('renders block TeX containing inline math inside \\text', async () => {
    const source = '$\nC_4(n)=\\Theta(1)+\\Theta(1)+\\cdots+\\Theta(1)\n\\quad\\text{($\\Theta(n)$ termes),}\n$';
    const out = await renderMarkdownToSafeHtml(source);
    expect(out).toContain('<math');
    expect(out).toContain('display="block"');
    expect(out).toContain('\\text{($\\Theta(n)$ termes),}');
    expect(out).not.toContain('class="katex-error"');

    const preview = parseMarkdownTokens(lexMarkdown(source));
    expect(preview).toContain('<math');
    expect(preview).not.toContain('class="katex-error"');
  });

  it('renders inline TeX containing dollar math inside \\text', async () => {
    const out = await renderMarkdownToSafeHtml('Count: $\\text{($\\Theta(n)$ termes)}$');
    expect(out).toContain('<math');
    expect(out).toContain('\\text{($\\Theta(n)$ termes)}');
    expect(out).not.toContain('class="katex-error"');
  });

  it('renders LaTeX inline delimiters', async () => {
    const source = 'Euler: \\(e^{i\\pi}+1=0\\)';
    const out = await renderMarkdownToSafeHtml(source);
    expect(out).toContain('class="katex"');
    expect(out).toContain('<annotation encoding="application/x-tex">e^{i\\pi}+1=0</annotation>');
    expect(parseMarkdownTokens(lexMarkdown(source))).toContain('class="katex"');
  });

  it('renders LaTeX display delimiters', async () => {
    const source = '\\[\n\\frac{a}{b}\n\\]';
    const out = await renderMarkdownToSafeHtml(source);
    expect(out).toContain('<math');
    expect(out).toContain('display="block"');
    expect(out).toContain('<mfrac>');
    expect(parseMarkdownTokens(lexMarkdown(source))).toContain('<math');
  });

  it('keeps nested dollars inside inline double-dollar and bracket math', async () => {
    const doubleDollar = await renderMarkdownToSafeHtml('$$\\text{($\\Theta(n)$ termes)}$$');
    expect(doubleDollar).toContain('<math');
    expect(doubleDollar).not.toContain('class="katex-error"');

    const bracket = await renderMarkdownToSafeHtml('\\[\n\\text{($\\Theta(n)$ termes)}\n\\]');
    expect(bracket).toContain('<math');
    expect(bracket).not.toContain('class="katex-error"');
  });

  it('renders equation and align environments', async () => {
    const equation = await renderMarkdownToSafeHtml('\\begin{equation}\nx=1\n\\end{equation}');
    expect(equation).toContain('<math');
    expect(equation).toContain('display="block"');
    expect(equation).not.toContain('class="katex-error"');
    expect(parseMarkdownTokens(lexMarkdown('\\begin{equation}\nx=1\n\\end{equation}'))).toContain('<math');

    const align = await renderMarkdownToSafeHtml('\\begin{align}\na&=b\\\\\nc&=d\n\\end{align}');
    expect(align).toContain('<math');
    expect(align).toContain('display="block"');
    expect(align).not.toContain('class="katex-error"');

    const matrix = await renderMarkdownToSafeHtml('\\begin{pmatrix}\n1&2\\\\\n3&4\n\\end{pmatrix}');
    expect(matrix).toContain('<math');
    expect(matrix).not.toContain('class="katex-error"');

    const multline = await renderMarkdownToSafeHtml('\\begin{multline}\na+b+c\\\\\n=d\n\\end{multline}');
    expect(multline).toContain('<math');
    expect(multline).not.toContain('class="katex-error"');

    const eqnarray = await renderMarkdownToSafeHtml('\\begin{eqnarray}\na&=&b\\\\\nc&=&d\n\\end{eqnarray}');
    expect(eqnarray).toContain('<math');
    expect(eqnarray).not.toContain('class="katex-error"');
  });

  it('does not let inline TeX span a blank line', async () => {
    const out = await renderMarkdownToSafeHtml('$\\Theta(n)\n\n$.');
    expect(out).not.toContain('class="katex"');
  });

  it('does not treat an escaped opening dollar as TeX', async () => {
    const out = await renderMarkdownToSafeHtml('\\$x$');
    expect(out).not.toContain('class="katex"');
  });

  it('sanitizes hostile markup inside a math element', () => {
    const out = sanitizeMarkdownHtml(
      '<math><mrow><mi>x</mi><script>alert(1)</script><mi onclick="alert(2)">y</mi></mrow></math>',
    );
    expect(out).toContain('<math>');
    expect(out).toContain('<mi>x</mi>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
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

// Issue #8: marked has emitted plain `<h2>` since v7, so every `#section` link
// — a hand-written TOC, a link copied from GitHub — pointed at nothing, in the
// preview and in exported HTML alike.
describe('heading anchors', () => {
  it('gives every heading a GitHub-compatible id', async () => {
    const html = await renderMarkdownToSafeHtml('# Example Markdown Syntax\n\n## C++ & "friends"!\n');
    expect(html).toContain('<h1 id="example-markdown-syntax">');
    expect(html).toContain('<h2 id="c--friends">');
  });

  it('slugs the visible text, not the inline markup', async () => {
    const html = await renderMarkdownToSafeHtml('## **Bold** `code`\n');
    expect(html).toContain('id="bold-code"');
    expect(html).toContain('<strong>Bold</strong>');
  });

  it('numbers duplicate headings and restarts on the next document', async () => {
    const first = await renderMarkdownToSafeHtml('## Dup\n\n## Dup\n');
    expect(first).toContain('id="dup"');
    expect(first).toContain('id="dup-1"');

    // Rendering is per-document: a slugger carried over from the previous
    // render would start this one at `dup-2` and break every anchor.
    const second = await renderMarkdownToSafeHtml('## Dup\n');
    expect(second).toContain('id="dup"');
    expect(second).not.toContain('id="dup-1"');
  });

  it('assigns ids on the token path the preview uses', () => {
    // The preview lexes and parses itself before sanitizing; the anchor rides
    // along as data-anchor and becomes the id in the sanitizer.
    const raw = parseMarkdownTokens(lexMarkdown('## Preview Heading\n'));
    expect(sanitizeMarkdownHtml(raw)).toContain('id="preview-heading"');
  });

  it('keeps anchors whose name collides with a document property', async () => {
    // DOMPurify drops `id="title"` as DOM clobbering; the renderer routes
    // heading anchors around that so a heading named "Title" stays linkable.
    const html = await renderMarkdownToSafeHtml('# Title\n\n## Images\n');
    expect(html).toContain('id="title"');
    expect(html).toContain('id="images"');
  });

  it('does not let the anchor attribute survive into the output', async () => {
    expect(await renderMarkdownToSafeHtml('# Title\n')).not.toContain('data-anchor');
  });

  it('ignores a data-anchor smuggled in through raw HTML', () => {
    const clean = sanitizeMarkdownHtml('<div data-anchor="x">d</div><h2 data-anchor="a b">h</h2>');
    expect(clean).not.toContain('data-anchor');
    expect(clean).not.toContain('id=');
  });
});
