import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  detectFrontmatterState,
  splitFrontmatter,
  frontmatterTitle,
  frontmatterTags,
  type FrontmatterState,
} from './frontmatter';

describe('detectFrontmatterState', () => {
  it('returns "none" for null', () => {
    expect(detectFrontmatterState(null)).toBe<FrontmatterState>('none');
  });

  it('returns "none" for content without frontmatter', () => {
    expect(detectFrontmatterState('# Hello')).toBe<FrontmatterState>('none');
  });

  it('returns "none" for content that starts with text, not ---', () => {
    expect(detectFrontmatterState('text\n---\nkey: value\n---')).toBe<FrontmatterState>('none');
  });

  it('returns "empty" for ---\\n---', () => {
    expect(detectFrontmatterState('---\n---\n# Body')).toBe<FrontmatterState>('empty');
  });

  it('returns "valid" for content with key-value pairs', () => {
    expect(detectFrontmatterState('---\ntitle: Hello\ntags: a\n---\n')).toBe<FrontmatterState>('valid');
  });

  it('returns "invalid" for --- followed by non-YAML content', () => {
    expect(detectFrontmatterState('---\nNot a key value\n---')).toBe<FrontmatterState>('invalid');
  });
});

describe('parseFrontmatter', () => {
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('# Hello')).toEqual({});
  });

  it('parses simple key-value pairs', () => {
    const fm = parseFrontmatter('---\ntitle: My Note\ndate: 2025-01-01\n---\n');
    expect(fm.title).toBe('My Note');
    expect(fm.date).toBe('2025-01-01');
  });

  it('parses booleans', () => {
    const fm = parseFrontmatter('---\npublished: true\ndraft: no\n---\n');
    expect(fm.published).toBe(true);
    expect(fm.draft).toBe(false);
  });

  it('parses numbers', () => {
    const fm = parseFrontmatter('---\norder: 42\nprice: 3.14\n---\n');
    expect(fm.order).toBe(42);
    expect(fm.price).toBe(3.14);
  });

  it('parses negative numbers', () => {
    const fm = parseFrontmatter('---\noffset: -10\n---\n');
    expect(fm.offset).toBe(-10);
  });

  it('parses inline arrays', () => {
    const fm = parseFrontmatter('---\ntags: [a, b, c]\n---\n');
    expect(fm.tags).toEqual(['a', 'b', 'c']);
  });

  it('parses single-item inline array as string', () => {
    const fm = parseFrontmatter('---\ntags: [only]\n---\n');
    expect(fm.tags).toBe('only');
  });

  it('parses block lists', () => {
    const fm = parseFrontmatter('---\ntags:\n  - alpha\n  - beta\n---\n');
    expect(fm.tags).toEqual(['alpha', 'beta']);
  });

  it('parses single-item block list as string', () => {
    const fm = parseFrontmatter('---\ntags:\n  - solo\n---\n');
    expect(fm.tags).toBe('solo');
  });

  it('parses quoted strings', () => {
    const fm = parseFrontmatter('---\ntitle: "Hello World"\nauthor: \'Jane\'\n---\n');
    expect(fm.title).toBe('Hello World');
    expect(fm.author).toBe('Jane');
  });

  it('skips block scalars (| and >)', () => {
    const fm = parseFrontmatter('---\nsummary: |\n  Multi-line\n  content\ntitle: Real\n---\n');
    expect(fm.title).toBe('Real');
    expect(fm.summary).toBeUndefined();
  });

  it('handles empty frontmatter', () => {
    expect(parseFrontmatter('---\n---\n')).toEqual({});
  });

  it('handles null input', () => {
    expect(parseFrontmatter(null)).toEqual({});
  });

  it('handles CRLF line endings', () => {
    const fm = parseFrontmatter('---\r\ntitle: Hello\r\ntags:\r\n  - a\r\n  - b\r\n---\r\n');
    expect(fm.title).toBe('Hello');
    expect(fm.tags).toEqual(['a', 'b']);
  });
});

describe('splitFrontmatter', () => {
  it('returns ["", content] when no frontmatter', () => {
    const [fm, body] = splitFrontmatter('# Hello');
    expect(fm).toBe('');
    expect(body).toBe('# Hello');
  });

  it('splits frontmatter from body', () => {
    const content = '---\ntitle: Test\n---\n# Heading';
    const [fm, body] = splitFrontmatter(content);
    expect(fm).toContain('---');
    expect(fm).toContain('title: Test');
    expect(body).toBe('# Heading');
  });
});

describe('frontmatterTitle', () => {
  it('returns title from frontmatter', () => {
    expect(frontmatterTitle('---\ntitle: My Title\n---\n')).toBe('My Title');
  });

  it('returns null when no title', () => {
    expect(frontmatterTitle('---\ntags: [a]\n---\n')).toBeNull();
  });

  it('returns null when no frontmatter', () => {
    expect(frontmatterTitle('# Hello')).toBeNull();
  });

  it('returns null for empty title', () => {
    expect(frontmatterTitle('---\ntitle: ""\n---\n')).toBeNull();
  });
});

describe('frontmatterTags', () => {
  it('returns tags from inline array', () => {
    expect(frontmatterTags('---\ntags: [a, b, c]\n---\n')).toEqual(['a', 'b', 'c']);
  });

  it('returns tags from block list', () => {
    expect(frontmatterTags('---\ntags:\n  - x\n  - y\n---\n')).toEqual(['x', 'y']);
  });

  it('returns tags from comma-separated string', () => {
    expect(frontmatterTags('---\ntags: one, two, three\n---\n')).toEqual(['one', 'two', 'three']);
  });

  it('returns empty array when no tags', () => {
    expect(frontmatterTags('---\ntitle: Test\n---\n')).toEqual([]);
  });
});