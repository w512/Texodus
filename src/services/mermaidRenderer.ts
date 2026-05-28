/**
 * Single owner of Mermaid: lazy-loads the (~600KB) library on first use,
 * runs `initialize` once per call so theme switches take effect, and exposes
 * two render surfaces:
 *
 *  - `renderMermaidBlocks(container, opts)` – swaps every
 *    `<pre><code class="language-mermaid">` inside `container` for either an
 *    inline SVG (success) or a styled error block. Used by the live preview
 *    and the HTML export pipeline.
 *
 *  - `renderMermaidSvg(code, id, opts)` – low-level helper that returns raw
 *    SVG text. Used by the PDF export pipeline to feed the SVG → PNG canvas
 *    conversion.
 *
 * Previously this logic was inlined three times with subtle differences
 * (CDN script in HTML export, DOM-walked theme detection in preview, etc.);
 * centralising it ensures all surfaces stay in sync.
 */

type MermaidModule = {
  initialize: (opts: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const m = (mod as { default?: MermaidModule }).default ?? (mod as unknown as MermaidModule);
      return m;
    });
  }
  return mermaidPromise;
}

export interface MermaidRenderOptions {
  theme?: 'default' | 'dark';
}

function initMermaid(mermaid: MermaidModule, opts: MermaidRenderOptions): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: opts.theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
  });
}

export async function renderMermaidSvg(
  code: string,
  id: string,
  opts: MermaidRenderOptions = {},
): Promise<string> {
  const mermaid = await loadMermaid();
  initMermaid(mermaid, opts);
  const { svg } = await mermaid.render(id, code);
  return svg;
}

function buildErrorBlock(err: unknown): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mermaid-error-container';

  const title = document.createElement('div');
  title.className = 'mermaid-error-title';
  title.textContent = 'Mermaid Rendering Error';
  container.appendChild(title);

  const text = document.createElement('pre');
  text.className = 'mermaid-error-text';
  text.textContent = err instanceof Error ? err.message : String(err);
  container.appendChild(text);

  return container;
}

export async function renderMermaidBlocks(
  container: HTMLElement,
  opts: MermaidRenderOptions = {},
): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>('pre code.language-mermaid'),
  );
  if (blocks.length === 0) return;

  let mermaid: MermaidModule;
  try {
    mermaid = await loadMermaid();
    initMermaid(mermaid, opts);
  } catch (err) {
    console.error('Failed to load Mermaid:', err);
    return;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const pre = block.parentElement;
    if (!pre) continue;

    const code = block.textContent || '';
    const id = `mermaid-${Date.now()}-${i}`;

    try {
      const { svg } = await mermaid.render(id, code);
      const svgContainer = document.createElement('div');
      svgContainer.className = 'mermaid-preview-container';
      svgContainer.innerHTML = svg;
      pre.replaceWith(svgContainer);
    } catch (err) {
      console.error('Mermaid render error:', err);
      pre.replaceWith(buildErrorBlock(err));
      // Mermaid leaves a temp render node behind on failure
      const tempEl = document.getElementById(id);
      if (tempEl) tempEl.remove();
    }
  }
}
