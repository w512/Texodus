import { describe, it, expect } from 'vitest';
import { fuzzyMatch, searchRank, fuzzySearch } from './fuzzyMatch';

describe('searchRank', () => {
  it('returns 0 for exact match', () => {
    expect(searchRank('hello', 'hello')).toBe(0);
  });

  it('returns 1 for prefix match', () => {
    expect(searchRank('hel', 'hello')).toBe(1);
  });

  it('returns 2 for fuzzy-only match', () => {
    expect(searchRank('hlo', 'hello')).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(searchRank('HELLO', 'hello')).toBe(0);
    expect(searchRank('Hello', 'Hello World')).toBe(1);
  });
});

describe('fuzzyMatch', () => {
  it('matches when all chars appear in order', () => {
    expect(fuzzyMatch('abc', 'axbycz')).toEqual({ match: true, score: expect.any(Number) });
  });

  it('does not match when chars are out of order', () => {
    expect(fuzzyMatch('cba', 'abc').match).toBe(false);
  });

  it('does not match when a char is missing', () => {
    expect(fuzzyMatch('xyz', 'abc').match).toBe(false);
  });

  it('matches exact string', () => {
    expect(fuzzyMatch('hello', 'hello').match).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('HELLO', 'hello').match).toBe(true);
    expect(fuzzyMatch('hello', 'HELLO').match).toBe(true);
  });

  it('gives higher score for consecutive matches', () => {
    const consecutive = fuzzyMatch('abc', 'abcdef');
    const scattered = fuzzyMatch('abc', 'a.b.c');
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });

  it('gives higher score for word-boundary matches', () => {
    const boundary = fuzzyMatch('note', 'my-note-file');
    const middle = fuzzyMatch('ote', 'bottle');
    expect(boundary.score).toBeGreaterThan(middle.score);
  });

  it('matches empty query', () => {
    expect(fuzzyMatch('', 'anything').match).toBe(true);
  });
});

describe('fuzzySearch', () => {
  const items = ['hello-world.md', 'goodbye.md', 'hello.md', 'world-tour.md'];

  it('returns all items for empty query', () => {
    const results = fuzzySearch('', items, (s) => s);
    expect(results).toHaveLength(4);
  });

  it('ranks exact match first', () => {
    const results = fuzzySearch('hello.md', items, (s) => s);
    expect(results[0].item).toBe('hello.md');
  });

  it('ranks prefix match above fuzzy match', () => {
    const results = fuzzySearch('hello', items, (s) => s);
    // Both 'hello.md' and 'hello-world.md' are prefix matches (rank 1).
    // 'hello-world.md' scores higher due to word-boundary bonus after 'hello'.
    expect(results[0].rank).toBeLessThanOrEqual(1);
    expect(results[0].item).toMatch(/^hello/);
  });

  it('excludes non-matching items', () => {
    const results = fuzzySearch('zzz', items, (s) => s);
    expect(results).toHaveLength(0);
  });

  it('sorts by rank then by score', () => {
    const results = fuzzySearch('hlo', items, (s) => s);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev.rank === curr.rank) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      } else {
        expect(prev.rank).toBeLessThan(curr.rank);
      }
    }
  });
});