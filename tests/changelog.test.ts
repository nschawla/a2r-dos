import { describe, it, expect } from 'vitest';
import { CHANGELOG, LATEST_RELEASE, CHANGE_TYPE_META } from '../src/lib/changelog';
import pkg from '../package.json';

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('CHANGELOG', () => {
  it('has at least one release and LATEST_RELEASE is the first entry', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(LATEST_RELEASE).toBe(CHANGELOG[0]);
  });

  it('the newest release matches the app version in package.json', () => {
    // Governance invariant: bumping package.json without a changelog entry fails here.
    expect(CHANGELOG[0]!.version).toBe(pkg.version);
  });

  it('versions are valid semver and unique', () => {
    const versions = CHANGELOG.map((r) => r.version);
    for (const v of versions) expect(v).toMatch(SEMVER);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('releases are ordered newest-first by both version and date', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const prev = CHANGELOG[i - 1]!;
      const cur = CHANGELOG[i]!;
      expect(cmpSemver(prev.version, cur.version)).toBeGreaterThan(0);
      expect(prev.date >= cur.date).toBe(true);
    }
  });

  it('every release has a valid date, a headline, and typed changes', () => {
    for (const release of CHANGELOG) {
      expect(release.date).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(release.date))).toBe(false);
      expect(release.headline.trim().length).toBeGreaterThan(10);
      expect(release.changes.length).toBeGreaterThan(0);
      for (const change of release.changes) {
        expect(change.type in CHANGE_TYPE_META).toBe(true);
        expect(change.text.trim().length).toBeGreaterThan(15);
      }
    }
  });
});

describe('CHANGE_TYPE_META', () => {
  it('covers every change type with a label and a badge class', () => {
    expect(Object.keys(CHANGE_TYPE_META).sort()).toEqual(['feature', 'fix', 'improvement', 'security']);
    for (const meta of Object.values(CHANGE_TYPE_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.badgeClass).toContain('border');
    }
  });
});

function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
