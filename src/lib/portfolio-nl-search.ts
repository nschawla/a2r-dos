/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * PS-DOS IQ — client-side natural-language filtering for the Active
 * Projects registry (ProjectsExplorer.tsx). Pure, framework-free, and
 * deliberately small: this is keyword/token matching against fields
 * already loaded on the page, not an NLP model or a query-planner — there
 * is no external API call, no SQL, and no new data fetch. Recognizes a
 * short list of REAL, grounded intents (health status, PM assignment, RAID
 * volume) rather than free-form semantic understanding.
 *
 * Query grammar (space-separated tokens, every token must match — AND
 * semantics, the standard "narrow as you type" behavior):
 *   - a health-status word ("red"/"critical"/"at-risk" → R,
 *     "amber"/"yellow"/"watch" → Y, "green"/"healthy"/"on-track" → G)
 *   - "unassigned" / "no-pm" — no Project Manager on record
 *   - a RAID-volume word: "clean"/"no-raid" (0 open items), "high-raid"
 *     (>= HIGH_RAID_THRESHOLD)
 *   - a RAID threshold expression: "raid>N", "raid>=N", "raid<N",
 *     "raid<=N", "raid=N" (case-insensitive, no spaces around the operator)
 *   - anything else — a plain case-insensitive substring match against the
 *     project's name, client, PM name, commercial model, and methodology
 */

export interface NlSearchableProject {
  id: string;
  name: string;
  client: string;
  pm: string;
  model: string;
  methodology: string;
  healthCode: 'G' | 'Y' | 'R';
  raidCount: number;
  unassigned: boolean;
}

const HIGH_RAID_THRESHOLD = 3;

const HEALTH_KEYWORDS: Record<string, 'G' | 'Y' | 'R'> = {
  red: 'R',
  critical: 'R',
  'at-risk': 'R',
  atrisk: 'R',
  amber: 'Y',
  yellow: 'Y',
  watch: 'Y',
  green: 'G',
  healthy: 'G',
  'on-track': 'G',
  ontrack: 'G',
};

const RAID_THRESHOLD_RE = /^raid\s*(>=|<=|>|<|=)\s*(\d+)$/i;

/** Precomputes the one lowercase blob every plain-text token is matched
 * against — built once per row, not once per keystroke. */
export function buildSearchBlob(p: Pick<NlSearchableProject, 'name' | 'client' | 'pm' | 'model' | 'methodology'>): string {
  return [p.name, p.client, p.pm, p.model, p.methodology].join(' ').toLowerCase();
}

function tokenMatches(token: string, p: NlSearchableProject, searchBlob: string): boolean {
  if (token === 'unassigned' || token === 'no-pm') return p.unassigned;
  if (token === 'clean' || token === 'no-raid') return p.raidCount === 0;
  if (token === 'high-raid') return p.raidCount >= HIGH_RAID_THRESHOLD;

  const health = HEALTH_KEYWORDS[token];
  if (health) return p.healthCode === health;

  const thresholdMatch = RAID_THRESHOLD_RE.exec(token);
  if (thresholdMatch) {
    const [, op, nStr] = thresholdMatch;
    const n = Number(nStr);
    switch (op) {
      case '>':
        return p.raidCount > n;
      case '>=':
        return p.raidCount >= n;
      case '<':
        return p.raidCount < n;
      case '<=':
        return p.raidCount <= n;
      case '=':
        return p.raidCount === n;
      default:
        return false;
    }
  }

  return searchBlob.includes(token);
}

/** `query` is free text — tokenized on whitespace, every non-empty token
 * must match (AND) for the row to pass. An empty/whitespace-only query
 * always matches everything. */
export function matchesNlQuery(p: NlSearchableProject, searchBlob: string, query: string): boolean {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => tokenMatches(t, p, searchBlob));
}

/** Example queries shown as clickable chips beneath the search bar — real
 * intents this app's own fields actually support, not placeholder text. */
export const NL_SEARCH_SUGGESTIONS = ['red', 'unassigned', 'raid>2', 'high-raid', 'clean'] as const;
