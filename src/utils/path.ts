/**
 * Cross-platform path helpers for the webview side. We avoid node's `path`
 * module so this stays usable in any Vite-built bundle.
 */

/** Strips everything up to the last `/` or `\`. */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Directory portion — everything before the last separator, or `''`. */
export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx < 0 ? '' : path.substring(0, idx);
}

/** True for Unix-style `/foo` and Windows-style `C:\foo` / `C:/foo`. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path);
}

/**
 * True if `value` begins with a URL scheme like `https:`, `data:`, `asset:`.
 * Requires ≥2 chars before the colon so `C:` (Windows drive) doesn't match.
 */
export function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+\-.]+:/i.test(value);
}

/**
 * Joins `target` against `baseDir` and collapses `.` / `..` segments.
 * Always returns forward-slash separators — Tauri's asset protocol accepts
 * those on Windows too.
 */
export function resolveLocalPath(baseDir: string, target: string): string {
  const joined = isAbsolutePath(target)
    ? target
    : `${baseDir.replace(/\\/g, '/')}/${target.replace(/\\/g, '/')}`;

  const forward = joined.replace(/\\/g, '/');
  const isAbs = forward.startsWith('/') || /^[a-zA-Z]:\//.test(forward);

  // Preserve a leading drive (`C:`) as the first segment so it doesn't get
  // collapsed by the `..` logic.
  const drive = /^([a-zA-Z]:)\//.exec(forward)?.[1] ?? '';
  const body = drive ? forward.substring(drive.length) : forward;

  const segments = body.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!isAbs) out.push('..');
      continue;
    }
    out.push(seg);
  }

  const prefix = drive ? `${drive}/` : isAbs ? '/' : '';
  return prefix + out.join('/');
}
