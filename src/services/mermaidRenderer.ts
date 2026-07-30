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
import DOMPurify from 'dompurify';

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
    securityLevel: 'strict',
    // Keep labels as plain SVG <text>/<tspan> nodes. Mermaid's default HTML
    // labels are emitted via <foreignObject>, which we intentionally strip in
    // sanitizeMermaidSvg(), leaving diagrams with empty-looking boxes.
    htmlLabels: false,
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
  return sanitizeMermaidSvg(svg);
}

export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Mermaid output is inserted with innerHTML. Keep the generated SVG-only
    // surface and forbid tags that can execute/embed active or remote content.
    FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'image'],
  });
}

function buildErrorBlock(err: unknown, code: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mermaid-error-container';

  const header = document.createElement('div');
  header.className = 'mermaid-error-header';
  container.appendChild(header);

  const title = document.createElement('div');
  title.className = 'mermaid-error-title';
  title.textContent = 'Mermaid diagram failed to render';
  header.appendChild(title);

  const copyButton = document.createElement('button');
  copyButton.className = 'mermaid-action-button';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy source';
  copyButton.addEventListener('click', async () => {
    await copyText(code);
    brieflySetButtonText(copyButton, 'Copied');
  });
  header.appendChild(copyButton);

  const hint = document.createElement('div');
  hint.className = 'mermaid-error-hint';
  hint.textContent = 'Check the diagram syntax below and try again.';
  container.appendChild(hint);

  const text = document.createElement('pre');
  text.className = 'mermaid-error-text';
  text.textContent = err instanceof Error ? err.message : String(err);
  container.appendChild(text);

  return container;
}

function buildDiagramBlock(svg: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mermaid-preview-container';

  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';
  container.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.className = 'mermaid-viewport';
  container.appendChild(viewport);

  const canvas = document.createElement('div');
  canvas.className = 'mermaid-canvas';
  canvas.innerHTML = svg;
  viewport.appendChild(canvas);

  const state = { scale: 1 };
  const setScale = (scale: number) => {
    state.scale = Math.max(0.5, Math.min(3, Math.round(scale * 100) / 100));
    canvas.style.transform = `scale(${state.scale})`;
    canvas.style.width = `${state.scale * 100}%`;
    canvas.style.height = `${state.scale * 100}%`;
    zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
  };

  const copySvg = makeToolbarButton('Copy SVG', async (button) => {
    await copyText(svg);
    brieflySetButtonText(button, 'Copied');
  });
  toolbar.appendChild(copySvg);

  const copyPng = makeToolbarButton('Copy PNG', async (button) => {
    await copySvgAsPng(svg);
    brieflySetButtonText(button, 'Copied');
  });
  toolbar.appendChild(copyPng);

  const spacer = document.createElement('span');
  spacer.className = 'mermaid-toolbar-spacer';
  toolbar.appendChild(spacer);

  toolbar.appendChild(makeToolbarButton('−', () => setScale(state.scale - 0.1), 'Zoom out'));

  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'mermaid-zoom-label';
  zoomLabel.textContent = '100%';
  toolbar.appendChild(zoomLabel);

  toolbar.appendChild(makeToolbarButton('+', () => setScale(state.scale + 0.1), 'Zoom in'));
  toolbar.appendChild(makeToolbarButton('Reset', () => setScale(1), 'Reset zoom'));

  enableDragPan(viewport);
  setScale(1);

  return container;
}

function makeToolbarButton(
  text: string,
  action: (button: HTMLButtonElement) => void | Promise<void>,
  title = text,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mermaid-action-button';
  button.type = 'button';
  button.title = title;
  button.textContent = text;
  button.addEventListener('click', () => {
    void Promise.resolve(action(button)).catch((err) => {
      console.error('Mermaid toolbar action failed:', err);
      brieflySetButtonText(button, 'Failed');
    });
  });
  return button;
}

function brieflySetButtonText(button: HTMLButtonElement, text: string): void {
  const previous = button.textContent ?? '';
  button.textContent = text;
  setTimeout(() => { button.textContent = previous; }, 1200);
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function copySvgAsPng(svg: string): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to rasterize Mermaid SVG'));
    });
    img.src = url;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth || img.width);
    canvas.height = Math.max(1, img.naturalHeight || img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Failed to create PNG')), 'image/png');
    });

    if (!('ClipboardItem' in window) || !navigator.clipboard.write) {
      throw new Error('PNG clipboard is not supported in this WebView');
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob }),
    ]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function enableDragPan(viewport: HTMLElement): void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = viewport.scrollLeft;
    startTop = viewport.scrollTop;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    viewport.scrollLeft = startLeft - (event.clientX - startX);
    viewport.scrollTop = startTop - (event.clientY - startY);
  });

  const stop = (event: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', stop);
  viewport.addEventListener('pointercancel', stop);
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
      pre.replaceWith(buildDiagramBlock(sanitizeMermaidSvg(svg)));
    } catch (err) {
      console.error('Mermaid render error:', err);
      pre.replaceWith(buildErrorBlock(err, code));
      // Mermaid leaves a temp render node behind on failure
      const tempEl = document.getElementById(id);
      if (tempEl) tempEl.remove();
    }
  }
}
