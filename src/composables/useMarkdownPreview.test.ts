import { describe, expect, it } from 'vitest';
import { bracketedAnchors, interpolateAnchors, type ScrollAnchor } from './useMarkdownPreview';

describe('markdown preview scroll anchors', () => {
  it('interpolates in both directions and clamps outside the range', () => {
    const anchors: ScrollAnchor[] = [
      { line: 0, top: 0 },
      { line: 10, top: 100 },
      { line: 20, top: 300 },
    ];

    expect(interpolateAnchors(anchors, 'line', 5, 'top')).toBe(50);
    expect(interpolateAnchors(anchors, 'top', 200, 'line')).toBe(15);
    expect(interpolateAnchors(anchors, 'line', -1, 'top')).toBe(0);
    expect(interpolateAnchors(anchors, 'line', 30, 'top')).toBe(300);
  });

  it('adds virtual document-edge anchors around preview blocks', () => {
    const container = document.createElement('div');
    Object.defineProperties(container, {
      scrollHeight: { value: 500 },
      clientHeight: { value: 100 },
    });
    const block = document.createElement('p');
    block.dataset.sourceLine = '4';
    Object.defineProperty(block, 'offsetTop', { value: 80 });
    container.appendChild(block);

    expect(bracketedAnchors(container, 20)).toEqual([
      { line: 0, top: 0 },
      { line: 4, top: 80 },
      { line: 20, top: 400 },
    ]);
  });

  it('still provides an interpolation range for an empty preview', () => {
    const container = document.createElement('div');
    Object.defineProperties(container, {
      scrollHeight: { value: 100 },
      clientHeight: { value: 100 },
    });

    expect(bracketedAnchors(container, 1)).toEqual([
      { line: 0, top: 0 },
      { line: 1, top: 0 },
    ]);
  });
});
