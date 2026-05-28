/**
 * Single source of truth for converting markdown to safe HTML.
 *
 * Both the live preview (MarkdownPreview.vue) and the HTML/PDF export
 * pipeline (exportService.ts) used to duplicate the DOMPurify whitelist
 * and the `marked` options. Keeping them in one place ensures sanitization
 * rules can't quietly drift between the two surfaces.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','h5','h6','p','br','hr',
  'ul','ol','li','blockquote','pre','code',
  'strong','em','del','a','img','table','thead',
  'tbody','tr','th','td','sup','sub','span','div',
  'input',
];

const ALLOWED_ATTR = ['href','src','alt','title','class','id','rel','type','checked'];

export function sanitizeMarkdownHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export async function renderMarkdownToSafeHtml(markdown: string): Promise<string> {
  const raw = await marked.parse(markdown);
  return sanitizeMarkdownHtml(raw);
}
