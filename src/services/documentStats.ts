/**
 * Plain-text document statistics for `DocumentStatsMenu`.
 *
 * Counts words/characters on the prose a reader actually sees, not on the
 * markdown source: syntax markers (`#`, `**`, list bullets), link URLs,
 * fenced code blocks, raw HTML and frontmatter are all excluded. Inline
 * code and image alt text stay — they read as part of the sentence.
 */
import { type Token, type Tokens } from 'marked';
import { lexMarkdown } from './markdownSanitizer';
import { splitFrontmatter } from '../utils/frontmatter';

export interface DocumentStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
}

/** Concatenates the visible text of an inline token run (no separators —
 *  source spacing already lives inside the text tokens). */
function inlineText(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  let out = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'codespan':
        out += (token as Tokens.Codespan).text;
        break;
      case 'image':
        out += (token as Tokens.Image).text ?? '';
        break;
      case 'link': {
        const link = token as Tokens.Link;
        out += link.tokens?.length ? inlineText(link.tokens) : link.text;
        break;
      }
      case 'br':
        out += ' ';
        break;
      case 'html':
        break;
      case 'escape':
        out += (token as Tokens.Escape).text;
        break;
      default: {
        const t = token as { tokens?: Token[]; text?: string };
        out += t.tokens?.length ? inlineText(t.tokens) : (t.text ?? '');
      }
    }
  }
  return out;
}

/** Pushes one string per block-level unit (paragraph, heading, list item,
 *  table cell…) so words never merge across block boundaries. */
function collectBlockText(tokens: Token[], out: string[]): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'code': // fenced/indented block — not prose
      case 'html': // raw HTML — markup, not text
      case 'def':
      case 'space':
      case 'hr':
        break;
      case 'heading':
      case 'paragraph':
        out.push(inlineText((token as Tokens.Paragraph).tokens));
        break;
      case 'blockquote':
        collectBlockText((token as Tokens.Blockquote).tokens, out);
        break;
      case 'list':
        for (const item of (token as Tokens.List).items) collectBlockText(item.tokens, out);
        break;
      case 'table': {
        const table = token as Tokens.Table;
        for (const cell of table.header) out.push(inlineText(cell.tokens));
        for (const row of table.rows) for (const cell of row) out.push(inlineText(cell.tokens));
        break;
      }
      case 'text': {
        // Tight list-item content surfaces as block-level text tokens.
        const t = token as Tokens.Text;
        out.push(t.tokens?.length ? inlineText(t.tokens) : t.text);
        break;
      }
      default: {
        const t = token as { text?: string };
        if (typeof t.text === 'string') out.push(t.text);
      }
    }
  }
}

/** The document's visible prose, one line per block-level unit. */
export function extractMarkdownPlainText(markdown: string): string {
  if (!markdown) return '';
  const [, body] = splitFrontmatter(markdown);
  const out: string[] = [];
  collectBlockText(lexMarkdown(body), out);
  return out.filter((s) => s.trim().length > 0).join('\n');
}

export function computeDocumentStats(markdown: string): DocumentStats {
  const text = extractMarkdownPlainText(markdown);
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
  };
}
