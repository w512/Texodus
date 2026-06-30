/**
 * Compact YAML frontmatter parser for Markdown files.
 *
 * No external dependency — handles the subset of YAML commonly used in
 * Markdown frontmatter: key-value pairs, inline arrays, block lists,
 * booleans, numbers, and strings (optionally quoted).
 *
 */

export type FrontmatterValue = string | number | boolean | string[] | number[];

export type FrontmatterState = 'valid' | 'empty' | 'none' | 'invalid';

export interface FrontmatterWarnings {
  collidingProperties: { key: string; labels: string[] }[];
}

export interface ParsedFrontmatter {
  [key: string]: FrontmatterValue;
}

type MarkdownContent = string;
type FrontmatterBody = string;
type FrontmatterText = string;

const FRONTMATTER_CLOSE_DELIMITER = /(?:^|\r?\n)---(?:\r?\n|$)/;

function unquote(s: FrontmatterText): FrontmatterText {
  return s.replace(/^["']|["']$/g, '');
}

function isBlockScalar(value: FrontmatterText): boolean {
  return value === '|' || value === '>';
}

function isInlineArrayLiteral(value: FrontmatterText): boolean {
  return value.startsWith('[') && value.endsWith(']') && !value.startsWith('[[');
}

function isNumericScalar(value: FrontmatterText): boolean {
  if (!value) return false;
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  if (!unsigned) return false;
  const parts = unsigned.split('.');
  return (parts.length === 1 || parts.length === 2)
    && parts.every((part) => part.length > 0 && [...part].every((c) => c >= '0' && c <= '9'));
}

function collapseList(items: FrontmatterText[]): FrontmatterValue {
  return items.length === 1 ? items[0] : items;
}

function parseInlineArray(value: FrontmatterText): FrontmatterValue {
  const items = value.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  return collapseList(items);
}

function parseScalar(value: FrontmatterText): FrontmatterValue {
  const clean = unquote(value);
  const lower = clean.toLowerCase();
  if (lower === 'true' || lower === 'yes') return true;
  if (lower === 'false' || lower === 'no') return false;
  if (clean === value && isNumericScalar(clean)) return Number(clean);
  return clean;
}

function parseListItem(line: string): FrontmatterText | null {
  const match = line.match(/^ {2}- (.*)$/);
  return match ? unquote(match[1]) : null;
}

function parseKeyValueLine(line: string): { key: string; value: FrontmatterText } | null {
  const match = line.match(/^["']?([^"':]+)["']?\s*:\s*(.*)$/);
  if (!match) return null;
  return { key: match[1].trim(), value: match[2].trim() };
}

function isNestedLine(line: string): boolean {
  return line.startsWith(' ') || line.startsWith('\t');
}

function frontmatterContentStart(content: MarkdownContent): number | null {
  if (content.startsWith('---\r\n')) return 5;
  if (content.startsWith('---\n')) return 4;
  return null;
}

function extractFrontmatterBody(content: MarkdownContent | null): FrontmatterBody | null {
  if (!content) return null;
  const start = frontmatterContentStart(content);
  if (start === null) return null;
  const rest = content.slice(start);
  const close = rest.match(FRONTMATTER_CLOSE_DELIMITER);
  if (!close || close.index === undefined) return null;
  return rest.slice(0, close.index);
}

/** Detect whether content has valid, empty, missing, or invalid frontmatter. */
export function detectFrontmatterState(content: MarkdownContent | null): FrontmatterState {
  if (!content) return 'none';
  const body = extractFrontmatterBody(content);
  if (body === null) return 'none';
  const trimmed = body.trim();
  if (!trimmed) return 'empty';
  const hasValidLine = trimmed.split(/\r?\n/).some((line) => /^[A-Za-z][\w -]*:/.test(line));
  return hasValidLine ? 'valid' : 'invalid';
}

/** Parse frontmatter from a markdown string into a key-value map. */
export function parseFrontmatter(content: MarkdownContent | null): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  const body = extractFrontmatterBody(content);
  if (!body) return result;

  const lines = body.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Block scalar (| or >) — skip the value and following indented lines.
    const kv = parseKeyValueLine(line);
    if (kv && isBlockScalar(kv.value)) {
      i++;
      while (i < lines.length && isNestedLine(lines[i])) i++;
      continue;
    }

    // Inline array: [a, b, c]
    if (kv && isInlineArrayLiteral(kv.value)) {
      result[kv.key] = parseInlineArray(kv.value);
      i++;
      continue;
    }

    // Block list: key:\n  - item\n  - item
    if (kv && kv.value === '') {
      i++;
      const listItems: string[] = [];
      while (i < lines.length && isNestedLine(lines[i])) {
        const item = parseListItem(lines[i]);
        if (item !== null) listItems.push(item);
        i++;
      }
      if (listItems.length > 0) {
        result[kv.key] = collapseList(listItems);
      }
      continue;
    }

    // Simple key: value
    if (kv) {
      result[kv.key] = parseScalar(kv.value);
      i++;
      continue;
    }

    // Unrecognised line — skip
    i++;
  }

  return result;
}

/** Split content into [frontmatter, body] — frontmatter is the raw block including delimiters, or '' if none. */
export function splitFrontmatter(content: MarkdownContent): [string, string] {
  const start = frontmatterContentStart(content);
  if (start === null) return ['', content];
  const rest = content.slice(start);
  const close = rest.match(FRONTMATTER_CLOSE_DELIMITER);
  if (!close || close.index === undefined) return ['', content];
  const bodyStart = start + close.index + close[0].length;
  return [content.slice(0, bodyStart), content.slice(bodyStart)];
}

/** Extract the `title` field from frontmatter, if present. */
export function frontmatterTitle(content: MarkdownContent | null): string | null {
  const fm = parseFrontmatter(content);
  const title = fm.title;
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  return trimmed || null;
}

/** Get tags from frontmatter as a string array. */
export function frontmatterTags(content: MarkdownContent | null): string[] {
  const fm = parseFrontmatter(content);
  const tags = fm.tags;
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}