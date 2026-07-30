import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  hasUrlScheme,
  isAbsolutePath,
  isSameOrInside,
  isSamePath,
  normalizePath,
  resolveLocalPath,
} from './path';

describe('basename', () => {
  it('strips Unix directories', () => {
    expect(basename('/a/b/c.md')).toBe('c.md');
  });

  it('strips Windows directories', () => {
    expect(basename('C:\\docs\\notes.md')).toBe('notes.md');
  });

  it('returns bare names unchanged', () => {
    expect(basename('file.md')).toBe('file.md');
  });
});

describe('dirname', () => {
  it('returns the directory portion', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('C:\\docs\\notes.md')).toBe('C:\\docs');
  });

  it('returns empty string when there is no separator', () => {
    expect(dirname('file.md')).toBe('');
  });
});

describe('isAbsolutePath', () => {
  it('accepts Unix and Windows absolute paths', () => {
    expect(isAbsolutePath('/x/y')).toBe(true);
    expect(isAbsolutePath('C:\\x')).toBe(true);
    expect(isAbsolutePath('c:/x')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isAbsolutePath('x/y')).toBe(false);
    expect(isAbsolutePath('./x')).toBe(false);
  });
});

describe('hasUrlScheme', () => {
  it('detects common schemes', () => {
    expect(hasUrlScheme('https://example.com')).toBe(true);
    expect(hasUrlScheme('data:image/png;base64,xx')).toBe(true);
    expect(hasUrlScheme('asset://localhost/x')).toBe(true);
  });

  it('does not treat a Windows drive as a scheme', () => {
    expect(hasUrlScheme('C:/docs/x.md')).toBe(false);
  });

  it('rejects plain relative paths', () => {
    expect(hasUrlScheme('images/pic.png')).toBe(false);
  });
});

describe('normalizePath', () => {
  it('converts backslashes and strips trailing separators', () => {
    expect(normalizePath('a\\b\\c\\')).toBe('a/b/c');
    expect(normalizePath('/a/b///')).toBe('/a/b');
  });
});

describe('isSamePath', () => {
  it('ignores separator style', () => {
    expect(isSamePath('C:\\Docs\\note.md', 'C:/Docs/note.md')).toBe(true);
    expect(isSamePath('/tmp/a.md', '/tmp/a.md')).toBe(true);
  });

  it('ignores a trailing separator', () => {
    expect(isSamePath('/tmp/dir/', '/tmp/dir')).toBe(true);
  });

  it('is false for different files', () => {
    expect(isSamePath('/tmp/a.md', '/tmp/b.md')).toBe(false);
    expect(isSamePath('/tmp/a.md', '/tmp/sub/a.md')).toBe(false);
  });

  it('stays case-sensitive, matching the Rust side', () => {
    expect(isSamePath('/tmp/A.md', '/tmp/a.md')).toBe(false);
  });
});

describe('isSameOrInside', () => {
  it('matches the path itself', () => {
    expect(isSameOrInside('/a/b', '/a/b')).toBe(true);
    expect(isSameOrInside('/a/b/', '/a/b')).toBe(true);
  });

  it('matches nested paths', () => {
    expect(isSameOrInside('/a/b/c.md', '/a/b')).toBe(true);
    expect(isSameOrInside('C:\\ws\\sub\\f.md', 'C:/ws')).toBe(true);
  });

  it('does not match sibling prefixes', () => {
    expect(isSameOrInside('/a/bc', '/a/b')).toBe(false);
  });
});

describe('resolveLocalPath', () => {
  it('joins a relative target onto the base directory', () => {
    expect(resolveLocalPath('/base', 'img.png')).toBe('/base/img.png');
  });

  it('collapses .. and . segments', () => {
    expect(resolveLocalPath('/base/sub', '../img.png')).toBe('/base/img.png');
    expect(resolveLocalPath('/base', './a/./b.png')).toBe('/base/a/b.png');
  });

  it('returns absolute targets as-is (normalized)', () => {
    expect(resolveLocalPath('/base', '/abs/x.png')).toBe('/abs/x.png');
  });

  it('preserves a Windows drive prefix', () => {
    expect(resolveLocalPath('C:\\docs', 'img.png')).toBe('C:/docs/img.png');
    expect(resolveLocalPath('C:\\docs\\sub', '..\\img.png')).toBe('C:/docs/img.png');
  });
});
