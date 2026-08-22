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

/**
 * Assigns each heading token the anchor the renderer gives it. Shared by
 * everything that has to agree with the rendered HTML: the table-of-contents
 * builder and the PDF exporter, which turns the same slugs into named
 * destinations.
 */
function forEachSluggedHeading(
  tokens: Token[],
  visit: (heading: Tokens.Heading, text: string, slug: string) => void,
): void {
  const slugger = createHeadingSlugger();
  forEachHeading(tokens, (heading) => {
    const text = inlineMarkdownToPlainText(heading.text).trim();
    // A heading with no visible text has no useful anchor. Skipping it can't
    // shift the others: duplicates are numbered per slug, and its slug would
    // be the empty string.
    if (!text) return;
    visit(heading, text, slugger.slug(text));
  });
}

export function collectHeadings(markdown: string): TocEntry[] {
  // Frontmatter never reaches the lexer anywhere else either; without this a
  // `title:` line could be read as a heading.
  const { body } = splitRenderableFrontmatter(markdown);
  const entries: TocEntry[] = [];
  forEachSluggedHeading(lexMarkdown(body), (heading, text, slug) => {
    entries.push({ depth: heading.depth, text, slug });
  });
  return entries;
}

/** Anchors for an already-lexed document. */
export interface HeadingAnchors {
  /** The destination id for a heading token. */
  byToken: WeakMap<Tokens.Heading, string>;
  /** Every id in the document, so a link can be checked before it's linked. */
  ids: Set<string>;
}

export function collectHeadingAnchors(tokens: Token[]): HeadingAnchors {
  const byToken = new WeakMap<Tokens.Heading, string>();
  const ids = new Set<string>();
  forEachSluggedHeading(tokens, (heading, _text, slug) => {
    byToken.set(heading, slug);
    ids.add(slug);
  });
  return { byToken, ids };
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
