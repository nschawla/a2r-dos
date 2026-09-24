import { describe, expect, it } from 'vitest';
import { buildSearchBlob, matchesNlQuery, type NlSearchableProject } from '@/lib/portfolio-nl-search';

function project(overrides: Partial<NlSearchableProject> = {}): NlSearchableProject {
  return {
    id: 'p1',
    name: 'Global ERP Modernization',
    client: 'Apex Global Services',
    pm: 'Jordan Rivera',
    model: 'Fixed Fee',
    methodology: 'AGILE',
    healthCode: 'G',
    raidCount: 0,
    unassigned: false,
    ...overrides,
  };
}

describe('PS-DOS IQ — buildSearchBlob', () => {
  it('joins the searchable fields into one lowercase blob', () => {
    const blob = buildSearchBlob(project({ name: 'ERP Rollout', client: 'Acme Health' }));
    expect(blob).toBe('erp rollout acme health jordan rivera fixed fee agile');
  });
});

describe('PS-DOS IQ — matchesNlQuery', () => {
  it('matches everything on an empty query', () => {
    const p = project();
    expect(matchesNlQuery(p, buildSearchBlob(p), '')).toBe(true);
    expect(matchesNlQuery(p, buildSearchBlob(p), '   ')).toBe(true);
  });

  it('matches plain-text tokens as case-insensitive substrings across name/client/pm/model/methodology', () => {
    const p = project({ name: 'Claims Automation Pilot', client: 'Acme Health' });
    const blob = buildSearchBlob(p);
    expect(matchesNlQuery(p, blob, 'claims')).toBe(true);
    expect(matchesNlQuery(p, blob, 'ACME')).toBe(true);
    expect(matchesNlQuery(p, blob, 'rivera')).toBe(true);
    expect(matchesNlQuery(p, blob, 'nonexistent-term')).toBe(false);
  });

  it('requires every token to match (AND semantics)', () => {
    const p = project({ name: 'Digital Front Door', client: 'Acme Health', healthCode: 'R' });
    const blob = buildSearchBlob(p);
    expect(matchesNlQuery(p, blob, 'red acme')).toBe(true);
    expect(matchesNlQuery(p, blob, 'red healthy')).toBe(false);
  });

  it.each([
    ['red', 'R'],
    ['critical', 'R'],
    ['at-risk', 'R'],
    ['amber', 'Y'],
    ['yellow', 'Y'],
    ['watch', 'Y'],
    ['green', 'G'],
    ['healthy', 'G'],
    ['on-track', 'G'],
  ] as const)('health keyword "%s" matches healthCode %s only', (keyword, code) => {
    const match = project({ healthCode: code });
    const noMatch = project({ healthCode: code === 'R' ? 'G' : 'R' });
    expect(matchesNlQuery(match, buildSearchBlob(match), keyword)).toBe(true);
    expect(matchesNlQuery(noMatch, buildSearchBlob(noMatch), keyword)).toBe(false);
  });

  it('"unassigned"/"no-pm" match only projects with no PM on record', () => {
    const unassigned = project({ unassigned: true, pm: '' });
    const assigned = project({ unassigned: false });
    for (const kw of ['unassigned', 'no-pm']) {
      expect(matchesNlQuery(unassigned, buildSearchBlob(unassigned), kw)).toBe(true);
      expect(matchesNlQuery(assigned, buildSearchBlob(assigned), kw)).toBe(false);
    }
  });

  it('"clean"/"no-raid" match only projects with zero open RAID items', () => {
    const clean = project({ raidCount: 0 });
    const dirty = project({ raidCount: 1 });
    for (const kw of ['clean', 'no-raid']) {
      expect(matchesNlQuery(clean, buildSearchBlob(clean), kw)).toBe(true);
      expect(matchesNlQuery(dirty, buildSearchBlob(dirty), kw)).toBe(false);
    }
  });

  it('"high-raid" matches projects at or above the high-RAID threshold', () => {
    const high = project({ raidCount: 3 });
    const low = project({ raidCount: 2 });
    expect(matchesNlQuery(high, buildSearchBlob(high), 'high-raid')).toBe(true);
    expect(matchesNlQuery(low, buildSearchBlob(low), 'high-raid')).toBe(false);
  });

  it.each([
    ['raid>2', 3, true],
    ['raid>2', 2, false],
    ['raid>=2', 2, true],
    ['raid<2', 1, true],
    ['raid<2', 2, false],
    ['raid<=2', 2, true],
    ['raid=2', 2, true],
    ['raid=2', 3, false],
  ] as const)('threshold expression "%s" against raidCount=%i -> %s', (expr, raidCount, expected) => {
    const p = project({ raidCount });
    expect(matchesNlQuery(p, buildSearchBlob(p), expr)).toBe(expected);
  });

  it('is case-insensitive for threshold expressions and combines with other tokens', () => {
    const p = project({ raidCount: 5, healthCode: 'R' });
    const blob = buildSearchBlob(p);
    expect(matchesNlQuery(p, blob, 'RAID>3 red')).toBe(true);
  });
});
