/**
 * Builds a markdown table of contents from a document's headings.
 *
 * The output is plain markdown — a nested list of `#anchor` links — so it
 * renders the same here, on GitHub, and in exported HTML, and stays readable
 * in the source file. Anchors come from the shared slugger, so a generated
 * entry always points at the id `markdownSanitizer` puts on the heading.
 */
import type { Token, Tokens } from 'marked';
import { inlineMarkdownToPlainText, lexMarkdown, splitRenderableFrontmatter } from './markdownSanitizer';
import { createHeadingSlugger } from '../utils/headingSlug';

export interface TocEntry {
  /** Heading level, 1–6. */
  depth: number;
  /** Heading text with inline markup resolved (`**Bold**` → `Bold`). */
  text: string;
  /** The anchor the rendered heading carries. */
  slug: string;
}

/** Depth-first walk in document order, so headings nested in blockquotes or
 *  list items are numbered by the slugger exactly as the renderer numbers
 *  them — otherwise repeated headings would drift apart by one. */
function forEachHeading(tokens: Token[], visit: (heading: Tokens.Heading) => void): void {
  for (const token of tokens) {
    if (token.type === 'heading') {
      visit(token as Tokens.Heading);
      continue;
    }
    if ('items' in token && Array.isArray(token.items)) {
      for (const item of token.items as Tokens.ListItem[]) {
        forEachHeading(item.tokens ?? [], visit);
      }
      continue;
    }
    if ('tokens' in token && Array.isArray(token.tokens)) {
      forEachHeading(token.tokens as Token[], visit);
    }
  }
}

export function collectHeadings(markdown: string): TocEntry[] {
  // Frontmatter never reaches the lexer anywhere else either; without this a
  // `title:` line could be read as a heading.
  const { body } = splitRenderableFrontmatter(markdown);
  const slugger = createHeadingSlugger();
  const entries: TocEntry[] = [];

  forEachHeading(lexMarkdown(body), (heading) => {
    const text = inlineMarkdownToPlainText(heading.text).trim();
    if (!text) return;
    entries.push({ depth: heading.depth, text, slug: slugger.slug(text) });
  });

  return entries;
}

/** `[` and `]` inside link text would close the link early. */
function escapeLinkText(text: string): string {
  return text.replace(/([[\]])/g, '\\$1');
}

/**
 * Renders entries as a nested bullet list. Indentation is relative to the
 * shallowest heading present, so a document whose headings start at `##`
 * still produces a list that begins flush left.
 */
export function renderTableOfContentsMarkdown(entries: TocEntry[]): string {
  if (entries.length === 0) return '';
  const minDepth = Math.min(...entries.map((e) => e.depth));
  return entries
    .map((e) => `${'  '.repeat(e.depth - minDepth)}- [${escapeLinkText(e.text)}](#${e.slug})`)
    .join('\n');
}

/** Convenience wrapper: markdown in, table of contents out (`''` if the
 *  document has no headings). */
export function buildTableOfContents(markdown: string): string {
  return renderTableOfContentsMarkdown(collectHeadings(markdown));
}
