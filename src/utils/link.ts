/**
 * Link validation utilities for the Markdown preview.
 */

import { hasUrlScheme, isAbsolutePath, resolveLocalPath } from './path';

/** Extensions the app opens as in-app documents rather than handing to the OS. */
const MARKDOWN_LINK_RE = /\.(md|markdown|txt)$/i;

/**
 * Returns true when `href` is a safe external link that the preview may open
 * via the OS — `http:`, `https:`, or `mailto:`. Unsafe schemes like `data:`,
 * `javascript:`, `vbscript:`, etc. are rejected. Relative paths (no scheme)
 * are also rejected — they're handled by `rewriteLocalImages`, not link clicks.
 */
export function isAllowedExternalHref(href: string): boolean {
  if (!hasUrlScheme(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** What a clicked preview link resolves to. */
export type LinkTarget =
  | { kind: 'external'; url: string } // http/https/mailto — hand the URL to the OS
  | { kind: 'document'; path: string } // local markdown — open in-app
  | { kind: 'os-file'; path: string } // local non-markdown file — hand to the OS
  | { kind: 'needs-base' } // relative link but the current doc has no path yet
  | { kind: 'ignore' }; // in-page anchors and unsupported schemes

/**
 * Decides how a clicked preview link should be handled. Pure: `baseDir` is the
 * directory of the current document (`''` when it hasn't been saved). Relative
 * and absolute local paths are resolved against `baseDir`; `#anchor`/`?query`
 * suffixes are stripped and percent-encoding is decoded before resolving.
 */
export function resolveLinkTarget(href: string, baseDir: string): LinkTarget {
  if (!href || href.startsWith('#')) return { kind: 'ignore' };
  if (isAllowedExternalHref(href)) return { kind: 'external', url: href };
  // Any other scheme (data:, javascript:, file:, unknown) is not navigable.
  if (hasUrlScheme(href)) return { kind: 'ignore' };

  const rawPath = href.split('#')[0].split('?')[0];
  if (!rawPath) return { kind: 'ignore' };

  let relative: string;
  try {
    relative = decodeURIComponent(rawPath);
  } catch {
    relative = rawPath; // malformed percent-encoding — use as-is
  }

  if (!isAbsolutePath(relative) && !baseDir) return { kind: 'needs-base' };

  const path = resolveLocalPath(baseDir, relative);
  return MARKDOWN_LINK_RE.test(path) ? { kind: 'document', path } : { kind: 'os-file', path };
}