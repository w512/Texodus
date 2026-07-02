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
marked.use({
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
  return marked.lexer(markdown, MARKED_OPTIONS);
}

export function parseMarkdownTokens(tokens: Token[]): string {
  return marked.parser(tokens, MARKED_OPTIONS) as string;
}

export function renderMarkdownToHtml(markdown: string): string {
  return marked.parse(markdown, MARKED_OPTIONS);
}

export async function renderMarkdownToSafeHtml(markdown: string): Promise<string> {
  return sanitizeMarkdownHtml(renderMarkdownToHtml(markdown));
}
