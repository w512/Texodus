/**
 * Line-ending handling.
 *
 * CodeMirror 6 normalises every document to `\n` internally: creating a state
 * from (or dispatching an insert of) CRLF text produces an LF document and
 * reports the transaction as `docChanged`. If the editor store kept the raw
 * bytes, opening a CRLF file would immediately mark the tab dirty and the file
 * watcher would then see "buffer ≠ disk" and raise a spurious
 * "File changed on disk" conflict — the exact symptom Windows users hit.
 *
 * So the buffer is the normalised form (always LF) and the tab remembers the
 * file's own ending, which is re-applied on every write. Nothing on disk gets
 * silently converted, and nothing in memory ever holds a `\r`.
 */

export type LineEnding = '\n' | '\r\n';

/**
 * The ending used for documents that have none of their own: brand-new
 * untitled buffers and single-line files. Follows the host OS, matching what
 * other editors do, so a new document created on Windows saves as CRLF.
 */
export function defaultLineEnding(): LineEnding {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Windows/i.test(ua) ? '\r\n' : '\n';
}

/**
 * The dominant ending in `content`, or `defaultLineEnding()` when the text has
 * no line breaks at all. Lone `\r` (classic Mac) counts as LF: CodeMirror
 * normalises it the same way and re-emitting it would be more surprising than
 * writing LF.
 */
export function detectLineEnding(content: string): LineEnding {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    if (ch === 13 /* \r */) {
      if (content.charCodeAt(i + 1) === 10 /* \n */) {
        crlf++;
        i++;
      } else {
        lf++;
      }
    } else if (ch === 10) {
      lf++;
    }
  }
  if (crlf === 0 && lf === 0) return defaultLineEnding();
  return crlf > lf ? '\r\n' : '\n';
}

/** Collapses CRLF and lone CR to LF — the in-memory (and CodeMirror) form. */
export function normalizeLineEndings(content: string): string {
  return content.indexOf('\r') === -1 ? content : content.replace(/\r\n?/g, '\n');
}

/** Re-applies `lineEnding` to normalised text, for writing back to disk. */
export function applyLineEnding(content: string, lineEnding: LineEnding): string {
  if (lineEnding === '\n') return content;
  return normalizeLineEndings(content).replace(/\n/g, '\r\n');
}
