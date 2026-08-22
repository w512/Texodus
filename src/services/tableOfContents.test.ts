import { describe, expect, it } from 'vitest';
import type { Tokens } from 'marked';
import {
  buildTableOfContents,
  collectHeadingAnchors,
  collectHeadings,
  renderTableOfContentsMarkdown,
} from './tableOfContents';
import { lexMarkdown, renderMarkdownToSafeHtml } from './markdownSanitizer';

describe('collectHeadings', () => {
  it('collects headings in document order with their anchors', () => {
    expect(collectHeadings('# Title\n\n## First\n\n### Nested\n\n## Second\n')).toEqual([
      { depth: 1, text: 'Title', slug: 'title' },
      { depth: 2, text: 'First', slug: 'first' },
      { depth: 3, text: 'Nested', slug: 'nested' },
      { depth: 2, text: 'Second', slug: 'second' },
    ]);
  });

  it('resolves inline markup to the text the anchor is built from', () => {
    expect(collectHeadings('## **Bold** `code`\n')).toEqual([
      { depth: 2, text: 'Bold code', slug: 'bold-code' },
    ]);
  });

  it('numbers duplicates exactly like the renderer', () => {
    expect(collectHeadings('## Dup\n\n## Dup\n').map((e) => e.slug)).toEqual(['dup', 'dup-1']);
  });

  it('ignores frontmatter and fenced code', () => {
    const doc = '---\ntitle: Not a heading\n---\n\n# Real\n\n```\n# Not a heading\n```\n';
    expect(collectHeadings(doc).map((e) => e.text)).toEqual(['Real']);
  });

  it('finds headings nested in blockquotes and list items', () => {
    expect(collectHeadings('> ## Quoted\n\n- ## In a list\n').map((e) => e.slug))
      .toEqual(['quoted', 'in-a-list']);
  });

  it('skips headings whose text is entirely markup', () => {
    expect(collectHeadings('## \n\n# Real\n').map((e) => e.text)).toEqual(['Real']);
  });
});

describe('renderTableOfContentsMarkdown', () => {
  it('indents relative to the shallowest heading present', () => {
    expect(buildTableOfContents('## Top\n\n### Child\n\n#### Grandchild\n')).toBe(
      '- [Top](#top)\n  - [Child](#child)\n    - [Grandchild](#grandchild)',
    );
  });

  it('escapes brackets that would close the link early', () => {
    expect(buildTableOfContents('# A [b] c\n')).toBe('- [A \\[b\\] c](#a-b-c)');
  });

  it('returns an empty string for a document without headings', () => {
    expect(buildTableOfContents('just a paragraph\n')).toBe('');
    expect(renderTableOfContentsMarkdown([])).toBe('');
  });
});

// The whole point of the feature: every generated link must resolve against
// the ids the renderer emits for the same document.
describe('generated anchors match the rendered HTML', () => {
  it('links only to ids that exist in the output', async () => {
    const doc = '# Title\n\n## C++ & "friends"!\n\n## Dup\n\n## Dup\n\n### Проверка\n';
    const html = await renderMarkdownToSafeHtml(doc);
    for (const entry of collectHeadings(doc)) {
      expect(html).toContain(`id="${entry.slug}"`);
    }
  });
});

describe('collectHeadingAnchors', () => {
  it('maps heading tokens to the same slugs collectHeadings produces', () => {
    const doc = '# Title\n\n## Dup\n\n> ### Dup\n';
    const tokens = lexMarkdown(doc);
    const { byToken, ids } = collectHeadingAnchors(tokens);

    expect([...ids]).toEqual(collectHeadings(doc).map((e) => e.slug));
    const first = tokens.find((t) => t.type === 'heading') as Tokens.Heading;
    expect(byToken.get(first)).toBe('title');
  });

  it('reaches headings nested in blockquotes', () => {
    const [quote] = lexMarkdown('> ## Quoted\n') as [Tokens.Blockquote];
    const heading = quote.tokens.find((t) => t.type === 'heading') as Tokens.Heading;
    expect(collectHeadingAnchors([quote]).byToken.get(heading)).toBe('quoted');
  });
});
