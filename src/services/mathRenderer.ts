/**
 * Renders TeX to standalone SVG for the PDF export.
 *
 * pdfmake embeds SVG as vector content, so formulas stay crisp in the PDF and
 * need no rasterisation. The live preview keeps using KaTeX MathML; this
 * renderer exists only because pdfmake cannot consume MathML.
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import type { LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const html = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'noundefined'] }),
  OutputJax: new SVG({ fontCache: 'local' }),
});

export function renderMathSvg(tex: string, displayMode: boolean): string {
  const node = html.convert(tex, { display: displayMode }) as unknown as LiteElement;
  const svg = adaptor.innerHTML(node);
  if (!svg.startsWith('<svg')) {
    throw new Error('MathJax did not return an SVG element');
  }
  return svg;
}
