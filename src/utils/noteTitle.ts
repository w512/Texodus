/**
 * Display title resolution for Markdown files.
 *
 * Cascade: H1 from body → title from frontmatter → humanized filename.
 *
 */

import { parseFrontmatter, splitFrontmatter } from './frontmatter';

type DisplayTitle = string;
type MarkdownContent = string;
type NoteFilename = string;

function replaceWikilinkAliases(text: string): string {
  return text.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1');
}

function replacePlainWikilinks(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, '$1');
}

function replaceMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function removeInlineMarkdownMarkers(text: string): string {
  return text.replace(/[*_`~]/g, '');
}

function stripMarkdownFormatting(text: string): DisplayTitle {
  return removeInlineMarkdownMarkers(
    replaceMarkdownLinks(
      replacePlainWikilinks(
        replaceWikilinkAliases(text),
      ),
    ),
  );
}

function firstNonBlankLine(body: MarkdownContent): string | null {
  let start = 0;
  while (start <= body.length) {
    const end = body.indexOf('\n', start);
    const lineEnd = end === -1 ? body.length : end;
    const line = body.slice(start, lineEnd).trim();
    if (line) return line;
    if (end === -1) return null;
    start = end + 1;
  }
  return null;
}

/** Convert a filename stem to a human-readable title: "my-note.md" → "My Note" */
export function filenameStemToTitle(filename: NoteFilename): DisplayTitle {
  const stem = filename.replace(/\.[^.]+$/, '');
  return stem
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Extract the first H1 heading title from content, with markdown stripped. */
export function extractH1TitleFromContent(content: MarkdownContent): DisplayTitle | null {
  const [, body] = splitFrontmatter(content);
  const firstLine = firstNonBlankLine(body);
  if (!firstLine?.startsWith('# ')) return null;
  const title = stripMarkdownFormatting(firstLine.slice(2)).trim();
  return title || null;
}

/** Extract title from frontmatter `title:` field. */
export function extractFrontmatterTitleFromContent(content: MarkdownContent): DisplayTitle | null {
  const fm = parseFrontmatter(content);
  const title = fm.title;
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  return trimmed || null;
}

export interface DisplayTitleInput {
  content: MarkdownContent;
  filename: NoteFilename;
  /** Pre-parsed frontmatter title, if available. */
  frontmatterTitle?: DisplayTitle | null;
}

export interface DisplayTitleState {
  title: DisplayTitle;
  hasH1: boolean;
}

/** Resolve the best display title for a note. */
export function deriveDisplayTitle({
  content,
  filename,
  frontmatterTitle,
}: DisplayTitleInput): DisplayTitleState {
  const h1Title = extractH1TitleFromContent(content);
  if (h1Title) {
    return { title: h1Title, hasH1: true };
  }

  const fmTitle = frontmatterTitle?.trim() || extractFrontmatterTitleFromContent(content);
  if (fmTitle) {
    return { title: fmTitle, hasH1: false };
  }

  return { title: filenameStemToTitle(filename), hasH1: false };
}