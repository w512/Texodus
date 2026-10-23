import { describe, expect, it } from 'vitest';
import { renderMarkdownToSafeHtml } from './markdownSanitizer';
import { isKatexReady, renderTexToMathml } from './katexRenderer';

describe('katexRenderer', () => {
  it('starts unloaded', () => {
    expect(isKatexReady()).toBe(false);
  });

  it('stays unloaded for a document without TeX', async () => {
    const html = await renderMarkdownToSafeHtml('# Plain\n\nNo formulas here.');

    expect(html).toContain('<h1');
    expect(isKatexReady()).toBe(false);
  });

  it('loads on demand for a document with TeX', async () => {
    const html = await renderMarkdownToSafeHtml('Area: $\\pi r^2$');

    expect(isKatexReady()).toBe(true);
    expect(html).toContain('<math');
    expect(html).toContain('<msup>');
  });

  it('renders TeX in the requested display mode', () => {
    const inline = renderTexToMathml('\\frac{a}{b}', false);
    const block = renderTexToMathml('\\frac{a}{b}', true);

    expect(inline).toContain('<math');
    expect(inline).not.toContain('display="block"');
    expect(block).toContain('<math');
    expect(block).toContain('display="block"');
  });

  it('keeps invalid TeX from throwing', () => {
    expect(renderTexToMathml('\\frac{1}', false)).toContain('katex-error');
  });
});
