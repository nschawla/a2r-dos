/**
 * Minimal dependency-free fuzzy matcher for the command palette. No
 * external fuzzy-search library is installed (see the project README on
 * the npm-registry constraint this sandbox was built under), so this is a
 * small, deliberately simple scorer rather than a Fuse.js-style port:
 *
 *  - exact substring match scores highest (shorter/earlier match = better)
 *  - otherwise, an in-order (non-contiguous) subsequence match still counts,
 *    scored lower and penalized by how spread out the matched characters are
 *  - no match returns null
 *
 * Good enough for filtering a few hundred short strings (project names,
 * people, RAID descriptions) client-side on every keystroke.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = target.toLowerCase();

  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx; // earlier substring match = higher score

  // Subsequence fallback: every query character must appear in order in target.
  let ti = 0;
  let spread = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch!, ti);
    if (found === -1) return null;
    if (firstMatch === -1) firstMatch = found;
    lastMatch = found;
    ti = found + 1;
  }
  spread = lastMatch - firstMatch;
  return 500 - spread - firstMatch * 0.1;
}

export function fuzzyFilter<T>(query: string, items: T[], getText: (item: T) => string, limit = 8): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
