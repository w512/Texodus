import { beforeEach, describe, expect, it } from 'vitest';
import { getExportTitle, renderExportHtml } from './exportService';
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
