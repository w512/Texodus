import { describe, it, expect, beforeEach, vi } from 'vitest';
import { markFileWritten, wasRecentlyWritten, clearWriteSuppression } from './writeSuppression';

describe('writeSuppression', () => {
  beforeEach(() => {
    clearWriteSuppression();
  });

  it('returns false for unknown path', () => {
    expect(wasRecentlyWritten('/some/never-written.md')).toBe(false);
  });

  it('returns true after markFileWritten', () => {
    const path = '/test/recent.md';
    markFileWritten(path);
    expect(wasRecentlyWritten(path)).toBe(true);
  });

  it('returns false for a different path after marking another', () => {
    markFileWritten('/test/file-a.md');
    expect(wasRecentlyWritten('/test/file-b.md')).toBe(false);
  });

  it('returns false after suppression window expires', () => {
    const path = '/test/expired.md';
    markFileWritten(path);
    // Advance time past the 4-second window.
    vi.useFakeTimers();
    vi.advanceTimersByTime(4001);
    expect(wasRecentlyWritten(path)).toBe(false);
    vi.useRealTimers();
  });

  it('returns true just before suppression window expires', () => {
    const path = '/test/almost.md';
    markFileWritten(path);
    vi.useFakeTimers();
    vi.advanceTimersByTime(3999);
    expect(wasRecentlyWritten(path)).toBe(true);
    vi.useRealTimers();
  });

  it('clearWriteSuppression removes all entries', () => {
    markFileWritten('/test/a.md');
    markFileWritten('/test/b.md');
    clearWriteSuppression();
    expect(wasRecentlyWritten('/test/a.md')).toBe(false);
    expect(wasRecentlyWritten('/test/b.md')).toBe(false);
  });

  it('handles multiple marks on the same path (latest wins)', () => {
    const path = '/test/repeated.md';
    markFileWritten(path);
    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);
    markFileWritten(path); // Re-mark resets the window.
    vi.advanceTimersByTime(2000);
    expect(wasRecentlyWritten(path)).toBe(true);
    vi.useRealTimers();
  });
});