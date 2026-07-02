import { save, message } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile, readFile } from "@tauri-apps/plugin-fs";
import { type Token, type Tokens } from "marked";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { lexMarkdown, renderMarkdownToHtml, sanitizeMarkdownHtml } from "./markdownSanitizer";
import { renderMermaidBlocks, renderMermaidSvg } from "./mermaidRenderer";
import { dirname, hasUrlScheme, isAbsolutePath, resolveLocalPath } from "../utils/path";
import { showToast } from "../utils/toast";

type PdfMakeModule = {
  createPdf: (def: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
  addVirtualFileSystem: (vfs: unknown) => void;
};

let pdfMakePromise: Promise<PdfMakeModule> | null = null;

// pdfmake + its Roboto VFS adds ~1 MB to the bundle; lazy-load on first export
// so initial app start stays light.
function loadPdfMake(): Promise<PdfMakeModule> {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/vfs_fonts"),
    ]).then(([pdfMakeMod, vfsMod]) => {
      const pdfMake = (pdfMakeMod.default ?? pdfMakeMod) as PdfMakeModule;
      const vfs = (vfsMod as { default?: unknown }).default ?? vfsMod;
      pdfMake.addVirtualFileSystem(vfs);
      return pdfMake;
    });
  }
  return pdfMakePromise;
}

const EXPORT_DANGER_COLOR = '#dc2626';

const EXPORT_CSS = `
  body {
    max-width: 780px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #1a1d23;
    background: #fff;
  }
  h1,h2,h3,h4,h5,h6 { font-weight: 700; line-height: 1.3; color: #111; margin: 1.6rem 0 0.6rem; }
  h1 { font-size: 1.85em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }
  h2 { font-size: 1.45em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }
  h3 { font-size: 1.2em; }
  h4 { font-size: 1.05em; }
  h5 { font-size: 0.95em; color: #666; }
  h6 { font-size: 0.875em; color: #666; }
  p { margin: 0.85em 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  blockquote { margin: 1em 0; padding: 0.5em 1.25em; border-left: 4px solid #2563eb; background: #f5f7fa; border-radius: 0 6px 6px 0; color: #555; font-style: italic; }
  pre { background: #f0f0f0; padding: 1.1rem 1.3rem; border-radius: 8px; overflow-x: auto; margin: 1em 0; font-size: 13px; }
  code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  :not(pre) > code { background: #f0f0f0; padding: 0.15em 0.45em; border-radius: 4px; font-size: 0.875em; }
  img { max-width: 100%; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 0.5em 0.85em; }
  th { background: #f5f7fa; font-weight: 600; }
  hr { border: none; border-top: 2px solid #e0e0e0; margin: 1.5em 0; }
  input[type="checkbox"] { margin-right: 0.5em; accent-color: #2563eb; vertical-align: middle; }
  .mermaid-preview-container {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1.5em 0;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow-x: auto;
  }
  .mermaid-preview-container svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .mermaid-error-container {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin: 1.5em 0;
    color: #1a1d23;
    font-family: inherit;
  }
  .mermaid-error-title { font-weight: 600; color: ${EXPORT_DANGER_COLOR}; margin-bottom: 0.5rem; font-size: 0.95rem; }
  .mermaid-error-text { margin: 0; padding: 0.75rem; background: rgba(0, 0, 0, 0.05); border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; overflow-x: auto; white-space: pre-wrap; }
  @media print {
    body { margin: 0; padding: 0.5in; max-width: none; }
    pre, blockquote { break-inside: avoid; }
    h1,h2,h3,h4 { break-after: avoid; }
  }
`;

// Extensions we can embed as data: URIs, mapped to their MIME type.
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
};

/** Base64-encodes bytes in chunks to avoid blowing the call stack on large images. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Rewrites `<img>` elements with local paths to self-contained `data:` URIs so
 * the exported HTML renders anywhere, not just next to the source file. Mirrors
 * live preview's `rewriteLocalImages`, but embeds bytes instead of using the
 * asset protocol (which only resolves inside the app). Remote/`data:` sources
 * and unreadable/unknown files are left untouched.
 */
async function inlineLocalImages(container: HTMLElement, filePath: string | null): Promise<void> {
  const baseDir = filePath ? dirname(filePath) : "";
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || hasUrlScheme(src)) return;
      if (!isAbsolutePath(src) && !baseDir) return;
      const abs = resolveLocalPath(baseDir, src);
      const ext = abs.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME_TYPES[ext];
      if (!mime) return;
      try {
        const bytes = await readFile(abs);
        img.setAttribute("src", `data:${mime};base64,${bytesToBase64(bytes)}`);
      } catch (e) {
        console.warn(`Failed to inline image for HTML export: ${abs}`, e);
      }
    }),
  );
}

/**
 * Renders the current markdown to a self-contained HTML document with
 * embedded styling. Mermaid diagrams are pre-rendered to inline SVG and local
 * images are embedded as data: URIs so the exported file works offline and
 * doesn't violate the app's strict CSP.
 */
export async function renderExportHtml(markdown: string, title: string, filePath: string | null = null): Promise<string> {
  const bodyHtml = sanitizeMarkdownHtml(renderMarkdownToHtml(markdown));

  // Inline mermaid as SVG via a detached container so the export file has
  // zero external dependencies. The container is never attached to the DOM
  // — mermaid manages its own temporary render nodes in document.body.
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = bodyHtml;
  await renderMermaidBlocks(tempContainer, { theme: "default" });
  await inlineLocalImages(tempContainer, filePath);
  const finalBody = tempContainer.innerHTML;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
${finalBody}
</body>
</html>`;
}

/** Escapes text for safe insertion into an HTML `<title>` element.
 *  DOMPurify.sanitize is not suitable here — it strips tags rather than
 *  escaping special characters, which would corrupt titles containing `<`. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extracts a document title from the filename or falls back to 'Untitled'.
 */
export function getExportTitle(filePath: string | null): string {
  if (!filePath) return "Untitled";
  const parts = filePath.split(/[\\/]/);
  const name = parts[parts.length - 1];
  return name.replace(/\.[^.]+$/, "") || name;
}

/**
 * Exports the rendered HTML as a .html file via save dialog.
 * Returns true on success, false if the user cancelled or an error occurred.
 */
export async function exportHtml(markdown: string, filePath: string | null): Promise<boolean> {
  try {
    const title = getExportTitle(filePath);

    // Dialog first (like exportPdf): rendering — mermaid → SVG, images →
    // base64 — is the expensive part and is wasted work on cancel.
    const savePath = await save({
      filters: [{ name: "HTML Document", extensions: ["html", "htm"] }],
      defaultPath: `${title}.html`,
    });
    if (!savePath) return false;

    const html = await renderExportHtml(markdown, title, filePath);
    await writeTextFile(savePath as string, html);
    showToast('Exported as HTML');
    return true;
  } catch (e) {
    console.error("HTML export failed:", e);
    await message(`HTML export failed: ${e instanceof Error ? e.message : String(e)}`, { title: 'Export Error', kind: 'error' });
    return false;
  }
}

/**
 * Exports the raw markdown content as a .txt file via save dialog.
 * Returns true on success, false if the user cancelled or an error occurred.
 */
export async function exportTxt(markdown: string, filePath: string | null): Promise<boolean> {
  try {
    const title = getExportTitle(filePath);

    const savePath = await save({
      filters: [{ name: "Plain Text", extensions: ["txt"] }],
      defaultPath: `${title}.txt`,
    });
    if (!savePath) return false;

    await writeTextFile(savePath as string, markdown);
    showToast('Exported as TXT');
    return true;
  } catch (e) {
    console.error("TXT export failed:", e);
    await message(`TXT export failed: ${e instanceof Error ? e.message : String(e)}`, { title: 'Export Error', kind: 'error' });
    return false;
  }
}

// ── PDF export ────────────────────────────────────────────────────────────

interface MermaidPngResult {
  pngUrl: string;
  width: number;
  height: number;
}

// Per-export map of code-token → rendered PNG. A WeakMap avoids the previous
// pattern of mutating `marked` tokens with `(token as any).mermaidPngUrl`.
type MermaidPngMap = WeakMap<Tokens.Code, MermaidPngResult>;

interface EmbeddedImage {
  dataUrl: string;
  width: number;
  height: number;
}

// Per-export map of image-token → embedded data URI. Populated up-front so the
// synchronous token→content walk can look images up without awaiting.
type ImageMap = WeakMap<Tokens.Image, EmbeddedImage>;

// pdfmake/PDFKit only embeds PNG and JPEG bitmaps; other formats (gif/webp/svg)
// stay as the text placeholder.
const PDF_IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Reads pixel dimensions off a data URL so we can cap width to the page. */
function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image for sizing"));
    img.src = dataUrl;
  });
}

/** Walks the token tree collecting every image token, including inside lists
 *  and table cells (which the generic `.tokens` recursion doesn't reach). */
function collectImageTokens(tokens: Token[]): Tokens.Image[] {
  const out: Tokens.Image[] = [];
  const walk = (list: Token[]) => {
    for (const t of list) {
      if (t.type === "image") {
        out.push(t as Tokens.Image);
        continue;
      }
      if (t.type === "list") {
        for (const item of (t as Tokens.List).items) {
          if (Array.isArray(item.tokens)) walk(item.tokens);
        }
      } else if (t.type === "table") {
        const tbl = t as Tokens.Table;
        for (const cell of tbl.header) if (Array.isArray(cell.tokens)) walk(cell.tokens);
        for (const row of tbl.rows) for (const cell of row) if (Array.isArray(cell.tokens)) walk(cell.tokens);
      } else if ("tokens" in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
        walk((t as { tokens: Token[] }).tokens);
      }
    }
  };
  walk(tokens);
  return out;
}

/** Reads local raster images and records them as data URIs for embedding.
 *  Remote/`data:` sources and unsupported/unreadable files are left untouched
 *  (they fall back to the `[alt]` text placeholder). */
async function preRenderImages(
  imageTokens: Tokens.Image[],
  baseDir: string,
  images: ImageMap,
): Promise<void> {
  for (const token of imageTokens) {
    const src = token.href;
    if (!src || hasUrlScheme(src)) continue;
    if (!isAbsolutePath(src) && !baseDir) continue;
    const abs = resolveLocalPath(baseDir, src);
    const ext = abs.split(".").pop()?.toLowerCase() ?? "";
    const mime = PDF_IMAGE_MIME_TYPES[ext];
    if (!mime) continue;
    try {
      const bytes = await readFile(abs);
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      const { width, height } = await loadImageDimensions(dataUrl);
      images.set(token, { dataUrl, width, height });
    } catch (e) {
      console.warn(`Failed to embed image in PDF export: ${abs}`, e);
    }
  }
}

/** Renders a run of inline tokens, splitting out any resolved images as
 *  block-level `{ image }` content (pdfmake can't inline images into a text
 *  run). Unresolved images stay as the inline `[alt]` placeholder. When no
 *  images are present this yields a single styled text block. */
function inlineWithImagesToContent(tokens: Token[], images: ImageMap, style?: string): Content[] {
  const out: Content[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const inline = inlineTokensToContent(run);
    if (inline.length > 0) out.push(style ? { text: inline, style } : { text: inline });
    run = [];
  };
  for (const t of tokens) {
    const embedded = t.type === "image" ? images.get(t as Tokens.Image) : undefined;
    if (embedded) {
      flush();
      const width = Math.min(495, embedded.width || 495);
      out.push({ image: embedded.dataUrl, width, margin: [0, 6, 0, 6] });
    } else {
      run.push(t);
    }
  }
  flush();
  return out.length > 0 ? out : [style ? { text: "", style } : { text: "" }];
}

function inlineTokensToContent(tokens: Token[] | undefined): Content[] {
  if (!tokens) return [];
  const out: Content[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens) out.push(...inlineTokensToContent(tt.tokens));
        else out.push({ text: tt.text });
        break;
      }
      case "strong":
        out.push({ text: inlineTokensToContent((t as Tokens.Strong).tokens), bold: true });
        break;
      case "em":
        out.push({ text: inlineTokensToContent((t as Tokens.Em).tokens), italics: true });
        break;
      case "del":
        out.push({ text: inlineTokensToContent((t as Tokens.Del).tokens), decoration: "lineThrough" });
        break;
      case "codespan":
        out.push({ text: (t as Tokens.Codespan).text, style: "codespan" });
        break;
      case "link": {
        const lt = t as Tokens.Link;
        out.push({ text: inlineTokensToContent(lt.tokens), link: lt.href, color: "#2563eb", decoration: "underline" });
        break;
      }
      case "br":
        out.push({ text: "\n" });
        break;
      case "escape":
        out.push({ text: (t as Tokens.Escape).text });
        break;
      case "image": {
        const it = t as Tokens.Image;
        out.push({ text: `[${it.text || it.href}]`, italics: true, color: "#888" });
        break;
      }
      case "html":
        break;
      default: {
        const txt = (t as { text?: string }).text;
        if (txt) out.push({ text: txt });
      }
    }
  }
  return out;
}

function blockTokensToContent(tokens: Token[], mermaidPngs: MermaidPngMap, images: ImageMap): Content[] {
  const out: Content[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const h = token as Tokens.Heading;
        const depth = Math.min(Math.max(h.depth, 1), 6);
        out.push({ text: inlineTokensToContent(h.tokens), style: `h${depth}` });
        break;
      }
      case "paragraph": {
        const p = token as Tokens.Paragraph;
        out.push(...inlineWithImagesToContent(p.tokens, images, "paragraph"));
        break;
      }
      case "text": {
        const tt = token as Tokens.Text;
        if (tt.tokens) out.push(...inlineWithImagesToContent(tt.tokens, images));
        else out.push({ text: tt.text });
        break;
      }
      case "list": {
        const l = token as Tokens.List;
        const items: Content[] = l.items.map((item) => {
          const inner = blockTokensToContent(item.tokens, mermaidPngs, images);
          const flat: Content = inner.length === 1 ? inner[0] : { stack: inner };
          if (item.task) {
            const marker = item.checked ? "☑  " : "☐  ";
            return { text: [{ text: marker }, flat] };
          }
          return flat;
        });
        out.push(l.ordered ? { ol: items } : { ul: items });
        break;
      }
      case "code": {
        const c = token as Tokens.Code;
        const png = mermaidPngs.get(c);
        if (png) {
          const width = Math.min(495, png.width || 495);
          out.push({
            image: png.pngUrl,
            width,
            margin: [0, 6, 0, 6],
            alignment: "center",
          });
        } else {
          out.push({ text: c.text, style: "code", preserveLeadingSpaces: true });
        }
        break;
      }
      case "blockquote": {
        const b = token as Tokens.Blockquote;
        out.push({ stack: blockTokensToContent(b.tokens, mermaidPngs, images), style: "blockquote", margin: [12, 4, 0, 4] });
        break;
      }
      case "hr":
        out.push({
          canvas: [{ type: "line", x1: 0, y1: 5, x2: 495, y2: 5, lineWidth: 0.5, lineColor: "#cccccc" }],
          margin: [0, 6, 0, 6],
        });
        break;
      case "table": {
        const tbl = token as Tokens.Table;
        const header = tbl.header.map((cell) => ({
          text: inlineTokensToContent(cell.tokens),
          style: "tableHeader",
          alignment: (cell.align ?? undefined) as "left" | "center" | "right" | undefined,
        }));
        const body = tbl.rows.map((row) =>
          row.map((cell) => ({
            text: inlineTokensToContent(cell.tokens),
            alignment: (cell.align ?? undefined) as "left" | "center" | "right" | undefined,
          })),
        );
        out.push({
          table: {
            headerRows: 1,
            widths: Array(tbl.header.length).fill("*"),
            body: [header, ...body] as Content[][],
          },
          layout: "lightHorizontalLines",
          margin: [0, 6, 0, 6],
        });
        break;
      }
      case "space":
      case "html":
      case "def":
        break;
      default: {
        const txt = (token as { text?: string }).text;
        if (txt) out.push({ text: txt });
      }
    }
  }
  return out;
}

function svgToPng(svgString: string): Promise<MermaidPngResult> {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = svgDoc.documentElement;

    const viewBox = svgEl.getAttribute("viewBox");
    let width = 600;
    let height = 400;
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = parts[2];
        height = parts[3];
      }
    } else {
      const wAttr = svgEl.getAttribute("width");
      const hAttr = svgEl.getAttribute("height");
      if (wAttr && hAttr) {
        width = parseFloat(wAttr);
        height = parseFloat(hAttr);
      }
    }

    const encoded = encodeURIComponent(svgString)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encoded;

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = 2; // high-DPI for crisp print output
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas 2d context"));
          return;
        }

        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        resolve({
          pngUrl: canvas.toDataURL("image/png"),
          width,
          height,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => {
      reject(new Error("Failed to load SVG into image: " + String(err)));
    };
    img.src = dataUrl;
  });
}

/**
 * Walks the token tree once, collecting every fenced mermaid code block.
 * Replaces the previous two-pass approach (checkHasMermaid + preRender).
 */
function collectMermaidCodeTokens(tokens: Token[]): Tokens.Code[] {
  const out: Tokens.Code[] = [];
  const walk = (list: Token[]) => {
    for (const t of list) {
      if (t.type === "code" && (t as Tokens.Code).lang === "mermaid") {
        out.push(t as Tokens.Code);
      }
      if (t.type === "list") {
        for (const item of (t as Tokens.List).items) {
          if (Array.isArray(item.tokens)) walk(item.tokens);
        }
      } else if ("tokens" in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
        walk((t as { tokens: Token[] }).tokens);
      }
    }
  };
  walk(tokens);
  return out;
}

async function preRenderMermaidPngs(
  codeTokens: Tokens.Code[],
  mermaidPngs: MermaidPngMap,
): Promise<void> {
  for (let i = 0; i < codeTokens.length; i++) {
    const token = codeTokens[i];
    const id = `mermaid-pdf-${Date.now()}-${i}`;
    try {
      const svg = await renderMermaidSvg(token.text, id, { theme: "default" });
      const png = await svgToPng(svg);
      mermaidPngs.set(token, png);
    } catch (err) {
      console.error("Failed to render Mermaid diagram for PDF:", err);
      const tempEl = document.getElementById(id);
      if (tempEl) tempEl.remove();
    }
  }
}

async function buildPdfDocDefinition(markdown: string, title: string, filePath: string | null): Promise<TDocumentDefinitions> {
  const tokens = lexMarkdown(markdown);

  const mermaidPngs: MermaidPngMap = new WeakMap();
  const mermaidTokens = collectMermaidCodeTokens(tokens);
  if (mermaidTokens.length > 0) {
    await preRenderMermaidPngs(mermaidTokens, mermaidPngs);
  }

  const images: ImageMap = new WeakMap();
  const imageTokens = collectImageTokens(tokens);
  if (imageTokens.length > 0) {
    await preRenderImages(imageTokens, filePath ? dirname(filePath) : "", images);
  }

  return {
    info: { title },
    content: blockTokensToContent(tokens, mermaidPngs, images),
    defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.4, color: "#1a1d23" },
    pageMargins: [50, 50, 50, 50],
    styles: {
      h1: { fontSize: 22, bold: true, color: "#111", margin: [0, 12, 0, 6] },
      h2: { fontSize: 18, bold: true, color: "#111", margin: [0, 10, 0, 6] },
      h3: { fontSize: 15, bold: true, color: "#111", margin: [0, 8, 0, 4] },
      h4: { fontSize: 13, bold: true, color: "#111", margin: [0, 6, 0, 4] },
      h5: { fontSize: 11, bold: true, color: "#666", margin: [0, 4, 0, 2] },
      h6: { fontSize: 10, bold: true, color: "#666", margin: [0, 4, 0, 2] },
      paragraph: { margin: [0, 4, 0, 4] },
      code: { fontSize: 9.5, background: "#f0f0f0", margin: [0, 4, 0, 4] },
      codespan: { background: "#f0f0f0" },
      blockquote: { color: "#555", italics: true },
      tableHeader: { bold: true, fillColor: "#f5f7fa" },
    },
  };
}

/**
 * Generates a vector PDF from the document via pdfmake and writes it to a
 * user-chosen path. Output is real selectable text (not a rasterized snapshot).
 */
export async function exportPdf(markdown: string, filePath: string | null): Promise<boolean> {
  try {
    const title = getExportTitle(filePath);

    const savePath = await save({
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      defaultPath: `${title}.pdf`,
    });
    if (!savePath) return false;

    const docDef = await buildPdfDocDefinition(markdown, title, filePath);
    const pdfMake = await loadPdfMake();
    const blob = await pdfMake.createPdf(docDef).getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(savePath as string, bytes);
    showToast('Exported as PDF');
    return true;
  } catch (e) {
    console.error("PDF export failed:", e);
    await message(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`, { title: 'Export Error', kind: 'error' });
    return false;
  }
}
