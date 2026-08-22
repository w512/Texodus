import { beforeEach, describe, expect, it } from 'vitest';
import { buildPdfDocDefinition, getExportTitle, renderExportHtml } from './exportService';
import { resetMockTauri, setMockFile } from '../mock-tauri';

// The mock fs reads file content back as UTF-8 bytes, so we can predict the
// base64 the exporter will embed from the seeded text.
const IMG_TEXT = 'PNGDATA';
const IMG_BASE64 = btoa(IMG_TEXT);

describe('getExportTitle', () => {
  it('falls back to Untitled without a path', () => {
    expect(getExportTitle(null)).toBe('Untitled');
  });

  it('uses the file name without its extension', () => {
    expect(getExportTitle('/a/b/report.md')).toBe('report');
    expect(getExportTitle('C:\\docs\\notes.markdown')).toBe('notes');
  });

  it('keeps dotfiles whole instead of producing an empty title', () => {
    expect(getExportTitle('/a/.env')).toBe('.env');
  });
});

describe('renderExportHtml', () => {
  it('produces a self-contained document with the rendered markdown', async () => {
    const html = await renderExportHtml('# Hello\n\nSome *text*.', 'My Doc');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>My Doc</title>');
    expect(html).toContain('<style>');
    expect(html).toContain('Hello');
    expect(html).toContain('<em>text</em>');
  });

  it('escapes the title', async () => {
    const html = await renderExportHtml('x', '<b>"T" & Co</b>');
    expect(html).toContain('<title>&lt;b&gt;&quot;T&quot; &amp; Co&lt;/b&gt;</title>');
  });

  it('sanitizes scripts out of the exported body', async () => {
    const html = await renderExportHtml('safe\n\n<script>alert(1)</script>', 'T');
    expect(html).not.toContain('<script>alert(1)');
  });
});

describe('renderExportHtml — local image embedding', () => {
  beforeEach(() => {
    resetMockTauri();
  });

  it('inlines a relative local image as a data: URI resolved against the file dir', async () => {
    setMockFile('/notes/pics/logo.png', IMG_TEXT);
    const html = await renderExportHtml('![logo](pics/logo.png)', 'Doc', '/notes/doc.md');
    expect(html).toContain(`src="data:image/png;base64,${IMG_BASE64}"`);
    expect(html).not.toContain('pics/logo.png');
  });

  it('inlines an absolute local image path', async () => {
    setMockFile('/assets/photo.jpg', IMG_TEXT);
    const html = await renderExportHtml('![p](/assets/photo.jpg)', 'Doc', '/notes/doc.md');
    expect(html).toContain(`src="data:image/jpeg;base64,${IMG_BASE64}"`);
  });

  it('leaves remote and data: image sources untouched', async () => {
    const html = await renderExportHtml(
      '![a](https://example.com/a.png)\n\n![b](data:image/png;base64,AAAA)',
      'Doc',
      '/notes/doc.md',
    );
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('skips unsupported extensions (kept as-is, not embedded)', async () => {
    setMockFile('/notes/scan.tiff', IMG_TEXT);
    const html = await renderExportHtml('![d](scan.tiff)', 'Doc', '/notes/doc.md');
    expect(html).toContain('src="scan.tiff"');
    expect(html).not.toContain('base64');
  });

  it('leaves relative images untouched when there is no file path', async () => {
    setMockFile('/notes/pics/logo.png', IMG_TEXT);
    const html = await renderExportHtml('![logo](pics/logo.png)', 'Doc', null);
    expect(html).toContain('src="pics/logo.png"');
    expect(html).not.toContain('base64');
  });

  it('leaves the image alone when the file cannot be read', async () => {
    const html = await renderExportHtml('![x](missing.png)', 'Doc', '/notes/doc.md');
    expect(html).toContain('src="missing.png"');
    expect(html).not.toContain('base64');
  });
});

// PDF internal links: the anchors that make `#section` work in the preview and
// in exported HTML become pdfmake named destinations here, so a table of
// contents survives the export (issue #8).
describe('buildPdfDocDefinition — in-page links', () => {
  /** Every node in the content tree, flattened. */
  function walk(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, out);
      return out;
    }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      out.push(record);
      for (const value of Object.values(record)) walk(value, out);
    }
    return out;
  }

  async function nodesFor(markdown: string) {
    const def = await buildPdfDocDefinition(markdown, 'Doc', '/docs/note.md');
    return walk(def.content);
  }

  it('makes each heading a named destination', async () => {
    const nodes = await nodesFor('# First Heading\n\n## Second\n');
    expect(nodes.filter((n) => 'id' in n).map((n) => n.id)).toEqual(['first-heading', 'second']);
  });

  it('links to the destination instead of opening a URL', async () => {
    const nodes = await nodesFor('[Go](#second)\n\n## Second\n');
    const link = nodes.find((n) => 'linkToDestination' in n);
    expect(link?.linkToDestination).toBe('second');
    expect(link?.link).toBeUndefined();
  });

  it('resolves a percent-encoded fragment', async () => {
    const nodes = await nodesFor('[go](#%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB)\n\n## Раздел\n');
    expect(nodes.find((n) => 'linkToDestination' in n)?.linkToDestination).toBe('раздел');
  });

  it('leaves a fragment that names no heading as plain text', async () => {
    const nodes = await nodesFor('[Nowhere](#nope)\n\n## Second\n');
    expect(nodes.some((n) => 'linkToDestination' in n)).toBe(false);
    expect(nodes.some((n) => 'link' in n)).toBe(false);
  });

  it('still opens external links as URLs', async () => {
    const nodes = await nodesFor('[Site](https://example.com)\n');
    expect(nodes.find((n) => 'link' in n)?.link).toBe('https://example.com');
  });

  it('numbers duplicate headings the same way the renderer does', async () => {
    const nodes = await nodesFor('[second](#dup-1)\n\n## Dup\n\n## Dup\n');
    expect(nodes.filter((n) => 'id' in n).map((n) => n.id)).toEqual(['dup', 'dup-1']);
    expect(nodes.find((n) => 'linkToDestination' in n)?.linkToDestination).toBe('dup-1');
  });

  it('links from inside a table cell and a list item too', async () => {
    const nodes = await nodesFor(
      '- [in a list](#target)\n\n| h |\n| - |\n| [in a cell](#target) |\n\n## Target\n',
    );
    expect(nodes.filter((n) => n.linkToDestination === 'target')).toHaveLength(2);
  });
});

// pdfmake collapses a node's `text` array before measuring it and throws away
// the properties of every wrapper it collapses (its own "TODO: Styling in
// nested text"). Inline markup therefore has to be resolved into flat runs:
// nested wrappers silently produced unstyled text and — for links — no
// annotation at all, which is what made exported table-of-contents entries
// dead even though the document definition looked right.
describe('buildPdfDocDefinition — flat inline runs', () => {
  async function runsFor(markdown: string): Promise<Record<string, unknown>[]> {
    const def = await buildPdfDocDefinition(markdown, 'Doc', '/docs/note.md');
    const paragraph = (def.content as unknown as Record<string, unknown>[])[0];
    return paragraph.text as Record<string, unknown>[];
  }

  it('never nests a text array inside another', async () => {
    const runs = await runsFor('plain **bold** *em* ~~gone~~ `code` [x](https://e.com)\n');
    for (const run of runs) expect(typeof run.text).toBe('string');
  });

  it('puts bold and italics on the run itself', async () => {
    const runs = await runsFor('plain **bold** *em*\n');
    expect(runs.find((r) => r.text === 'bold')?.bold).toBe(true);
    expect(runs.find((r) => r.text === 'em')?.italics).toBe(true);
    expect(runs.find((r) => r.text === 'plain ')?.bold).toBeUndefined();
  });

  it('keeps formatting inside a link together with the jump', async () => {
    const def = await buildPdfDocDefinition('[**bold** link](#target)\n\n## Target\n', 'Doc', null);
    const runs = (def.content as unknown as Record<string, unknown>[])[0].text as Record<string, unknown>[];
    expect(runs[0]).toMatchObject({ text: 'bold', bold: true, linkToDestination: 'target' });
    expect(runs[1]).toMatchObject({ text: ' link', linkToDestination: 'target' });
  });

  it('merges decorations rather than replacing them', async () => {
    const runs = await runsFor('~~[gone](https://e.com)~~\n');
    expect(runs[0].decoration).toEqual(['lineThrough', 'underline']);
  });

  it('drops the link props but keeps the text for an unresolvable fragment', async () => {
    const runs = await runsFor('[**nowhere**](#nope)\n');
    expect(runs[0]).toMatchObject({ text: 'nowhere', bold: true });
    expect(runs[0].link).toBeUndefined();
    expect(runs[0].linkToDestination).toBeUndefined();
  });
});
