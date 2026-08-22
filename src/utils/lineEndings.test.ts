import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLineEnding,
  defaultLineEnding,
  detectLineEnding,
  normalizeLineEndings,
} from './lineEndings';

function withUserAgent(ua: string, fn: () => void): void {
  const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('detectLineEnding', () => {
  it('detects CRLF and LF documents', () => {
    expect(detectLineEnding('a\r\nb\r\nc')).toBe('\r\n');
    expect(detectLineEnding('a\nb\nc')).toBe('\n');
  });

  it('follows the majority in a mixed document', () => {
    expect(detectLineEnding('a\r\nb\r\nc\nd')).toBe('\r\n');
    expect(detectLineEnding('a\r\nb\nc\nd')).toBe('\n');
  });

  it('treats lone CR as LF, matching the CodeMirror buffer', () => {
    expect(detectLineEnding('a\rb\rc')).toBe('\n');
  });

  it('falls back to the platform default when there are no line breaks', () => {
    withUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', () => {
      expect(detectLineEnding('')).toBe('\r\n');
      expect(detectLineEnding('single line')).toBe('\r\n');
      expect(defaultLineEnding()).toBe('\r\n');
    });
    withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', () => {
      expect(detectLineEnding('')).toBe('\n');
      expect(defaultLineEnding()).toBe('\n');
    });
  });
});

describe('normalizeLineEndings', () => {
  it('collapses CRLF and lone CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('returns LF-only text unchanged', () => {
    const text = 'a\nb\nc';
    expect(normalizeLineEndings(text)).toBe(text);
  });
});

describe('applyLineEnding', () => {
  it('re-expands LF to CRLF', () => {
    expect(applyLineEnding('a\nb\nc', '\r\n')).toBe('a\r\nb\r\nc');
  });

  it('never doubles a CR that is already there', () => {
    expect(applyLineEnding('a\r\nb', '\r\n')).toBe('a\r\nb');
  });

  it('is a no-op for LF documents', () => {
    expect(applyLineEnding('a\nb', '\n')).toBe('a\nb');
  });

  it('round-trips a CRLF file through the normalised buffer', () => {
    const onDisk = '# Title\r\n\r\nBody\r\n';
    expect(applyLineEnding(normalizeLineEndings(onDisk), detectLineEnding(onDisk))).toBe(onDisk);
  });
});
