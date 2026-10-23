import { describe, expect, it } from 'vitest';
import { renderMathSvg } from './mathRenderer';

describe('renderMathSvg', () => {
  it('returns a standalone SVG for inline TeX', () => {
    const svg = renderMathSvg('E=mc^2', false);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
  });

  it('renders display math with the same SVG surface', () => {
    const svg = renderMathSvg('\\frac{a}{b}', true);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
  });

  it('accepts formulas spanning lines', () => {
    const svg = renderMathSvg('\\Theta(n)\n', false);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('emits an error SVG instead of throwing on invalid TeX', () => {
    const svg = renderMathSvg('\\frac{a}{b', false);
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
