/**
 * GitHub-compatible heading anchors.
 *
 * `marked` stopped emitting heading `id`s in v7, so `[Section](#section)` links
 * — the ones GitHub renders for every heading, and the ones a hand-written
 * table of contents points at — had nothing to jump to in the preview or in
 * exported HTML (issue #8). Slugs follow GitHub's rules so a document that
 * works on github.com works here and vice versa:
 *
 *   lowercase → drop everything that isn't a letter, digit, `_`, `-` or a
 *   space → each remaining space becomes `-`.
 *
 * Repeats are disambiguated with `-1`, `-2`, … in document order, which is why
 * slugging is stateful: the same heading text yields a different anchor the
 * second time it appears.
 */

/**
 * Keep letters, digits, combining marks, whitespace, `_` and `-`; drop the
 * rest (punctuation, emoji, symbols) exactly as GitHub's slugger does, so
 * `## C++ & "friends"!` becomes `c--friends`.
 */
const DROPPED = /[^\p{L}\p{N}\p{M}\s_-]/gu;

/** The base slug for a heading's plain text, before de-duplication. */
export function slugifyHeadingText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(DROPPED, '')
    // Not collapsed first: GitHub maps each space to its own dash, so a double
    // space really does produce `a--b`.
    .replace(/\s/g, '-');
}

export interface HeadingSlugger {
  /** The anchor for the next heading with this text, in document order. */
  slug(text: string): string;
  /** Starts a new document — call before every render or scan. */
  reset(): void;
}

export function createHeadingSlugger(): HeadingSlugger {
  const seen = new Map<string, number>();
  return {
    slug(text: string): string {
      const base = slugifyHeadingText(text);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${count}`;
    },
    reset() {
      seen.clear();
    },
  };
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * The visible text of rendered inline HTML — headings are slugged from what
 * the reader sees, so `## **Bold** \`code\`` anchors as `bold-code` rather
 * than picking up the markup.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}
