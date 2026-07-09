/**
 * Single source of truth for converting markdown to safe HTML.
 *
 * Both the live preview (MarkdownPreview.vue) and the HTML/PDF export
 * pipeline (exportService.ts) used to duplicate the DOMPurify whitelist
 * and the `marked` options. Keeping them in one place ensures sanitization
 * rules can't quietly drift between the two surfaces.
 */
import { marked, type MarkedOptions, type Token, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { detectFrontmatterState, extractFrontmatterBody, splitFrontmatter } from '../utils/frontmatter';

export const MARKED_OPTIONS = {
  breaks: true,
  gfm: true,
  async: false,
} satisfies MarkedOptions & { async: false };

// GFM task-list checkboxes carry a `data-task` marker so the preview can map
// a clicked checkbox back to its source `[ ]`/`[x]` by index. Without it, a
// raw-HTML `<input type="checkbox">` in the document shifts the DOM index
// against `collectMarkdownTaskCheckboxes` and clicks toggle the wrong item.
// (`disabled` is emitted like stock marked but stripped by the sanitizer —
// that's what makes the checkboxes clickable in the preview.)
//
// MARKED_OPTIONS is folded into the defaults here, and lexMarkdown /
// parseMarkdownTokens below call marked without an options argument: marked's
// `lexer(src, options)` / `parser(tokens, options)` *replace* the defaults
// with explicit options (`options ?? this.defaults`, no merge), which silently
// drops this renderer override — data-task disappears and preview checkbox
// clicks stop mapping back to source markers.
marked.use({
  ...MARKED_OPTIONS,
  renderer: {
    checkbox({ checked }: Tokens.Checkbox): string {
      return `<input ${checked ? 'checked="" ' : ''}disabled="" type="checkbox" data-task="">`;
    },
  },
});

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','h5','h6','p','br','hr',
  'ul','ol','li','blockquote','pre','code',
  // 'u' backs the Underline formatting command (useFormatting inserts <u>…</u>).
  'strong','em','del','u','a','img','table','thead',
  'tbody','tr','th','td','sup','sub','span','div',
  'input',
];

const ALLOWED_ATTR = ['href','src','alt','title','class','id','rel','type','checked','data-task'];

export function sanitizeMarkdownHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function lexMarkdown(markdown: string): Token[] {
  return marked.lexer(markdown);
}

export function parseMarkdownTokens(tokens: Token[]): string {
  return marked.parser(tokens) as string;
}

export function renderMarkdownToHtml(markdown: string): string {
  return marked.parse(markdown, MARKED_OPTIONS);
}

export async function renderMarkdownToSafeHtml(markdown: string): Promise<string> {
  const { frontmatterYaml, body } = splitRenderableFrontmatter(markdown);
  const frontmatterHtml = frontmatterYaml !== null ? renderFrontmatterHtml(frontmatterYaml) : '';
  return sanitizeMarkdownHtml(frontmatterHtml + renderMarkdownToHtml(body));
}

/**
 * YAML frontmatter isn't markdown: fed straight to `marked`, its `---`
 * delimiters parse as `<hr>`s and the `key: value` lines collapse into a
 * setext `<h2>` — giant bold text at the top of the document. Every render
 * surface (live preview, HTML export, PDF export) must split it off first
 * and render it as a dedicated metadata block.
 */
export interface RenderableMarkdown {
  /** Raw YAML between the `---` delimiters, or null when the document has none. */
  frontmatterYaml: string | null;
  /** The markdown that should reach the marked lexer. */
  body: string;
  /** Source lines consumed by the frontmatter block — shift body line anchors by this. */
  bodyLineOffset: number;
  /** Source chars consumed by the frontmatter block — shift body char positions by this. */
  bodyCharOffset: number;
}

const NO_FRONTMATTER: RenderableMarkdown = Object.freeze({
  frontmatterYaml: null,
  body: '',
  bodyLineOffset: 0,
  bodyCharOffset: 0,
});

export function splitRenderableFrontmatter(markdown: string): RenderableMarkdown {
  // Only a block detected as real frontmatter (opens on the first line and
  // has at least one `key:` line) is split off; an empty or key-less block is
  // more likely deliberate markdown (`---` rules) and stays untouched.
  if (detectFrontmatterState(markdown) !== 'valid') {
    return { ...NO_FRONTMATTER, body: markdown };
  }
  const [raw, body] = splitFrontmatter(markdown);
  let lineOffset = 0;
  for (const c of raw) if (c === '\n') lineOffset++;
  return {
    frontmatterYaml: extractFrontmatterBody(markdown) ?? '',
    body,
    bodyLineOffset: lineOffset,
    bodyCharOffset: raw.length,
  };
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renders split-off frontmatter as a muted metadata block. The
 *  `language-yaml` class lets the preview's lazy Prism loader pick it up for
 *  key/value highlighting; `frontmatter` styles it apart from real code. */
export function renderFrontmatterHtml(frontmatterYaml: string): string {
  return `<pre class="frontmatter"><code class="language-yaml">${escapeHtmlText(frontmatterYaml)}</code></pre>\n`;
}
