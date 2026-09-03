import { describe, it, expect } from 'vitest';
import { parseTestReport } from '../src/lib/dev-signals';
import { getPlatformStream, type PlatformPulse } from '../src/server/queries/platform-pulse';

describe('parseTestReport', () => {
  it('maps a green vitest json payload', () => {
    const sig = parseTestReport({
      numTotalTests: 141,
      numPassedTests: 141,
      numFailedTests: 0,
      startTime: Date.parse('2026-09-03T14:00:00.000Z'),
      success: true,
    });
    expect(sig).toEqual({
      total: 141,
      passed: 141,
      failed: 0,
      green: true,
      at: '2026-09-03T14:00:00.000Z',
    });
  });

  it('flags a failing run', () => {
    const sig = parseTestReport({ numTotalTests: 10, numPassedTests: 8, numFailedTests: 2, success: false });
    expect(sig?.green).toBe(false);
    expect(sig?.failed).toBe(2);
  });

  it('returns null for empty / malformed payloads', () => {
    expect(parseTestReport(null)).toBeNull();
    expect(parseTestReport({})).toBeNull();
    expect(parseTestReport({ numTotalTests: 0 })).toBeNull();
    expect(parseTestReport('nope')).toBeNull();
  });
});

const basePulse = (over: Partial<PlatformPulse> = {}): PlatformPulse => ({
  build: {
    version: '1.0.0',
    commit: 'abc1234',
    buildTime: '2026-09-03T10:00:00.000Z',
    latestRelease: { version: '1.0.0', date: '2026-09-03', headline: 'GA readiness' },
  },
  database: { ok: true, latencyMs: 42, checkedAt: '2026-09-03T14:05:00.000Z' },
  tests: { total: 141, passed: 141, failed: 0, green: true, at: '2026-09-03T14:00:00.000Z' },
  git: {
    branch: 'main',
    commits: [
      { sha: 'aaa1111', subject: 'feat: pulse', author: 'Nav', at: '2026-09-03T13:00:00.000Z' },
      { sha: 'bbb2222', subject: 'chore: bump', author: 'Nav', at: '2026-09-02T09:00:00.000Z' },
    ],
  },
  ...over,
});

describe('getPlatformStream', () => {
  it('merges commits, test run, release and db probe, newest first', () => {
    const events = getPlatformStream(basePulse());
    expect(events[0]!.at >= events[events.length - 1]!.at).toBe(true);
    expect(events.some((e) => e.id === 'git-aaa1111')).toBe(true);
    expect(events.some((e) => e.title.includes('Test suite green'))).toBe(true);
    expect(events.some((e) => e.title === 'Released v1.0.0')).toBe(true);
    expect(events.some((e) => e.title.startsWith('Database reachable'))).toBe(true);
    // strictly descending by timestamp
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1]!.at >= events[i]!.at).toBe(true);
    }
  });

  it('marks a failing suite and an unreachable db as critical', () => {
    const events = getPlatformStream(
      basePulse({
        tests: { total: 10, passed: 7, failed: 3, green: false, at: '2026-09-03T14:00:00.000Z' },
        database: { ok: false, latencyMs: 2000, checkedAt: '2026-09-03T14:05:00.000Z' },
      })
    );
    expect(events.find((e) => e.title.includes('Test suite failing'))?.tone).toBe('critical');
    expect(events.find((e) => e.title === 'Database unreachable')?.tone).toBe('critical');
  });

  it('degrades a slow db probe to warn', () => {
    const events = getPlatformStream(basePulse({ database: { ok: true, latencyMs: 1200, checkedAt: '2026-09-03T14:05:00.000Z' } }));
    expect(events.find((e) => e.title.startsWith('Database reachable'))?.tone).toBe('warn');
  });

  it('works with no git signal (production)', () => {
    const events = getPlatformStream(basePulse({ git: null }));
    expect(events.some((e) => e.id.startsWith('git-'))).toBe(false);
    expect(events.length).toBeGreaterThan(0);
  });

  it('honours the limit', () => {
    const many = basePulse({
      git: {
        branch: 'main',
        commits: Array.from({ length: 30 }, (_, i) => ({
          sha: `c${i}`.padEnd(7, '0'),
          subject: `commit ${i}`,
          author: 'Nav',
          at: new Date(Date.parse('2026-09-03T00:00:00.000Z') - i * 3600_000).toISOString(),
        })),
      },
    });
    expect(getPlatformStream(many, 8)).toHaveLength(8);
  });
});
