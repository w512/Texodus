import { describe, expect, it } from 'vitest';
import { sanitizeMermaidSvg } from './mermaidRenderer';

describe('Mermaid SVG sanitization', () => {
  it('keeps ordinary diagram SVG elements', () => {
    const result = sanitizeMermaidSvg('<svg><g><rect width="10"/><text>Safe</text></g></svg>');
    expect(result).toContain('<rect width="10"></rect>');
    expect(result).toContain('<text>Safe</text>');
  });

  it('strips executable and externally embedded SVG content', () => {
    const result = sanitizeMermaidSvg(`
      <svg onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><iframe src="https://evil.test"></iframe></foreignObject>
        <image href="https://evil.test/tracker.png" />
        <text onclick="alert(2)">Diagram</text>
      </svg>
    `);

    expect(result).toContain('Diagram');
    expect(result).not.toMatch(/script|foreignObject|iframe|<image|onload|onclick|evil\.test/i);
  });
});
