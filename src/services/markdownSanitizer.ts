/**
 * Single source of truth for converting markdown to safe HTML.
 *
 * Both the live preview (MarkdownPreview.vue) and the HTML/PDF export
 * pipeline (exportService.ts) used to duplicate the DOMPurify whitelist
 * and the `marked` options. Keeping them in one place ensures sanitization
 * rules can't quietly drift between the two surfaces.
 */
import { marked, type MarkedOptions, type Token } from 'marked';
import DOMPurify from 'dompurify';

export const MARKED_OPTIONS = {
  breaks: true,
  gfm: true,
  async: false,
} satisfies MarkedOptions & { async: false };

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','h5','h6','p','br','hr',
  'ul','ol','li','blockquote','pre','code',
  // 'u' backs the Underline formatting command (useFormatting inserts <u>…</u>).
  'strong','em','del','u','a','img','table','thead',
  'tbody','tr','th','td','sup','sub','span','div',
  'input',
];

const ALLOWED_ATTR = ['href','src','alt','title','class','id','rel','type','checked'];

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
