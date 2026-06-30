/**
 * Fuzzy matching and search ranking utilities.
 *
 */

/** Search rank tier: 0 = exact match, 1 = prefix match, 2 = fuzzy only. Lower is better. */
export function searchRank(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  return 2;
}

/**
 * Fuzzy match: all query chars must appear in order in the target.
 * Returns match boolean and a score (higher = better match).
 */
export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t.charAt(ti) === q.charAt(qi)) {
      // Consecutive matches score higher.
      if (ti === lastMatchIndex + 1) score += 2;
      // Matches at word boundaries score higher.
      const prev = t.charAt(ti - 1);
      if (ti === 0 || prev === ' ' || prev === '-' || prev === '_' || prev === '/') score += 3;
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}

export interface RankedResult<T> {
  item: T;
  rank: number;
  score: number;
}

/**
 * Rank items by fuzzy match quality against a query.
 * Items that don't match are excluded.
 *
 * @param query   The search query
 * @param items   Items to search
 * @param getText Function to extract searchable text from each item
 * @returns       Sorted results (best first), only matching items
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): RankedResult<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.map((item) => ({ item, rank: 2, score: 0 }));

  const results: RankedResult<T>[] = [];

  for (const item of items) {
    const text = getText(item);
    const rank = searchRank(q, text);
    const { match, score } = fuzzyMatch(q, text);

    if (rank < 2 || match) {
      results.push({ item, rank, score: score + (2 - rank) * 100 });
    }
  }

  results.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.score - a.score;
  });

  return results;
}
