import { describe, it, expect } from 'vitest';
import { isAllowedExternalHref, resolveLinkTarget } from './link';

describe('isAllowedExternalHref', () => {
  // ── Allowed schemes ──────────────────────────────────────────────

  it('allows http:// links', () => {
    expect(isAllowedExternalHref('http://example.com')).toBe(true);
  });

  it('allows https:// links', () => {
    expect(isAllowedExternalHref('https://example.com/path?q=1')).toBe(true);
  });

  it('allows mailto: links', () => {
    expect(isAllowedExternalHref('mailto:user@example.com')).toBe(true);
  });

  // ── Dangerous schemes ────────────────────────────────────────────

  it('rejects javascript: URIs', () => {
    expect(isAllowedExternalHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URIs', () => {
    expect(isAllowedExternalHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects vbscript: URIs', () => {
    expect(isAllowedExternalHref('vbscript:msgbox("xss")')).toBe(false);
  });

  it('rejects file: URIs', () => {
    expect(isAllowedExternalHref('file:///etc/passwd')).toBe(false);
  });

  // ── Non-scheme inputs ─────────────────────────────────────────────

  it('rejects relative paths (no scheme)', () => {
    expect(isAllowedExternalHref('images/foo.png')).toBe(false);
  });

  it('rejects absolute paths (no scheme)', () => {
    expect(isAllowedExternalHref('/etc/passwd')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedExternalHref('')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedExternalHref('http://[invalid')).toBe(false);
  });
});

describe('resolveLinkTarget', () => {
  const BASE = '/ws/notes';

  // ── External links ────────────────────────────────────────────────
  it('treats http/https/mailto as external, keeping the raw URL', () => {
    expect(resolveLinkTarget('https://example.com/x', BASE)).toEqual({
      kind: 'external',
      url: 'https://example.com/x',
    });
    expect(resolveLinkTarget('mailto:a@b.com', BASE)).toEqual({
      kind: 'external',
      url: 'mailto:a@b.com',
    });
  });

  // ── In-app documents ──────────────────────────────────────────────
  it('resolves a relative markdown link against the base dir', () => {
    expect(resolveLinkTarget('icons.md', BASE)).toEqual({
      kind: 'document',
      path: '/ws/notes/icons.md',
    });
  });

  it('collapses ../ segments when resolving', () => {
    expect(resolveLinkTarget('../guide/setup.markdown', BASE)).toEqual({
      kind: 'document',
      path: '/ws/guide/setup.markdown',
    });
  });

  it('accepts an absolute markdown path even without a base dir', () => {
    expect(resolveLinkTarget('/docs/readme.txt', '')).toEqual({
      kind: 'document',
      path: '/docs/readme.txt',
    });
  });

  it('strips #anchor and ?query before resolving', () => {
    expect(resolveLinkTarget('icons.md#section?x=1', BASE)).toEqual({
      kind: 'document',
      path: '/ws/notes/icons.md',
    });
  });

  it('decodes percent-encoded paths', () => {
    expect(resolveLinkTarget('my%20doc.md', BASE)).toEqual({
      kind: 'document',
      path: '/ws/notes/my doc.md',
    });
  });

  it('matches markdown extensions case-insensitively', () => {
    expect(resolveLinkTarget('README.MD', BASE)).toEqual({
      kind: 'document',
      path: '/ws/notes/README.MD',
    });
  });

  // ── OS-handled local files ────────────────────────────────────────
  it('routes non-markdown local files to the OS', () => {
    expect(resolveLinkTarget('report.pdf', BASE)).toEqual({
      kind: 'os-file',
      path: '/ws/notes/report.pdf',
    });
    expect(resolveLinkTarget('img/photo.png', BASE)).toEqual({
      kind: 'os-file',
      path: '/ws/notes/img/photo.png',
    });
  });

  // ── Needs a saved document ────────────────────────────────────────
  it('reports needs-base for a relative link when the doc is unsaved', () => {
    expect(resolveLinkTarget('icons.md', '')).toEqual({ kind: 'needs-base' });
    expect(resolveLinkTarget('report.pdf', '')).toEqual({ kind: 'needs-base' });
  });

  // ── Ignored ───────────────────────────────────────────────────────
  it('ignores in-page anchors and empty hrefs', () => {
    expect(resolveLinkTarget('#heading', BASE)).toEqual({ kind: 'ignore' });
    expect(resolveLinkTarget('', BASE)).toEqual({ kind: 'ignore' });
  });

  it('ignores unsupported/unsafe schemes', () => {
    expect(resolveLinkTarget('javascript:alert(1)', BASE)).toEqual({ kind: 'ignore' });
    expect(resolveLinkTarget('data:text/html,x', BASE)).toEqual({ kind: 'ignore' });
    expect(resolveLinkTarget('file:///etc/passwd', BASE)).toEqual({ kind: 'ignore' });
  });
});