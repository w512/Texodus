/**
 * Lazy KaTeX entry point.
 *
 * The preview only pays for KaTeX when the open document contains TeX.
 * `mathRenderer.ts` is the separate MathJax path used for PDF export (SVG).
 */
type Katex = typeof import('katex').default;

let katex: Katex | null = null;
let loading: Promise<void> | null = null;

export function isKatexReady(): boolean {
  return katex !== null;
}

export function ensureKatex(): Promise<void> {
  loading ??= import('katex').then((module) => {
    katex = module.default;
  });
  return loading;
}

export function renderTexToMathml(tex: string, displayMode: boolean): string {
  if (!katex) throw new Error('KaTeX is not loaded; call ensureKatex() first');
  return katex.renderToString(tex, {
    throwOnError: false,
    output: 'mathml',
    displayMode,
  });
}
