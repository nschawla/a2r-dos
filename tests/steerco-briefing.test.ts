import { describe, it, expect } from 'vitest';
import { composeSteerCoBriefing } from '../src/server/queries/steerco-briefing';
import type { ExecutiveBriefing } from '../src/server/queries/executive-briefing';
import type { StreamEvent } from '../src/server/queries/active-stream';

function makeExec(over: Partial<ExecutiveBriefing> = {}): ExecutiveBriefing {
  return {
    organizationName: 'A2R DOS Demo',
    generatedAt: '2026-09-03T12:00:00.000Z',
    macro: {
      totalTcv: 1_430_000,
      aggregateBac: 900_000,
      aggregateActualsCost: 420_000,
      aggregateEacCost: 940_000,
      blendedEacMarginPct: 34.3,
      baselineMarginPct: 37.5,
      marginDriftPts: 3.2, // getExecutiveBriefing convention: baseline − EAC (+ = eroded)
      activeEngagements: 6,
      lockedEngagements: 4,
      avgCompliancePct: 82.4,
    },
    utilization: {
      headcountFte: 5.8,
      availableHours: 3109,
      billableHours: 2492,
      utilizationPct: 0.802,
      targetUtilPct: 0.68,
      attainmentPct: 1.174,
      practices: [],
    },
    concurrency: { overloadedCount: 1, benchCount: 0, avgConcurrency: 2.1, top: [] },
    healthDistribution: {
      overall: { green: 4, amber: 1, red: 1 },
      lenses: [],
    },
    burn: { plannedToDateHours: 0, actualToDateHours: 0, plannedTotalHours: 0, variancePct: 0, weekly: [] },
    criticalRaid: [
      { id: 'r1', projectName: 'Wave 2', type: 'ISSUE', title: 'Payroll engine failing regression', severity: 'CRITICAL', likelihood: null, ownerName: 'M. Chen', targetDate: null, status: 'OPEN', escalated: true },
      { id: 'r2', projectName: 'Claims Pilot', type: 'RISK', title: 'OCR accuracy below pilot bar', severity: 'HIGH', likelihood: null, ownerName: null, targetDate: null, status: 'OPEN', escalated: true },
    ],
    ...over,
  };
}

const STREAM: StreamEvent[] = [
  { id: 'g1', kind: 'governance', title: 'Baseline locked', detail: 'project', context: 'Wave 1', at: '2026-09-03T10:00:00.000Z', tone: 'good' },
  { id: 'a1', kind: 'activity', title: 'Seeded something', detail: null, context: 'Wave 1', at: '2026-09-03T09:30:00.000Z', tone: 'default' },
  { id: 'r1', kind: 'risk', title: 'Payroll engine failing', detail: 'Critical', context: 'Wave 2', at: '2026-09-03T09:00:00.000Z', tone: 'critical' },
];

const base = (showFinancials = true) =>
  composeSteerCoBriefing({
    organizationName: 'A2R DOS Demo',
    generatedAt: '2026-09-03T12:00:00.000Z',
    exec: makeExec(),
    stream: STREAM,
    showFinancials,
  });

describe('composeSteerCoBriefing', () => {
  it('builds the four Pulse vitals', () => {
    const b = base();
    expect(b.vitals.map((v) => v.label)).toEqual([
      'Book of Business',
      'Delivery Velocity',
      'Margin Health',
      'Risk Flags',
    ]);
    expect(b.vitals[0]).toMatchObject({ value: '$1.43M', sub: '6 active engagements' });
    expect(b.vitals[1]).toMatchObject({ value: '80.2%', tone: 'good' }); // attainment 1.174 >= 0.98
  });

  it('counts risk flags as red engagements + escalated RAID', () => {
    // red = 1, escalated = 2  ->  value "3"
    expect(base().vitals[3]).toMatchObject({ value: '3', tone: 'critical' });
  });

  it('masks margin figures when financials are restricted', () => {
    const masked = base(false);
    expect(masked.vitals[2]).toMatchObject({ value: '••••', sub: 'restricted to Partners', tone: 'default' });
    expect(masked.margin.showFinancials).toBe(false);

    const shown = base(true);
    expect(shown.vitals[2]).toMatchObject({ value: '34.3%' });
    expect(shown.vitals[2]!.sub).toContain('baseline 37.5%');
    expect(shown.vitals[2]!.sub).toContain('-3.2 pts');
  });

  it('reshapes margin detail from macro (drift flipped to EAC − baseline)', () => {
    expect(base().margin).toMatchObject({
      baselineMarginPct: 37.5,
      eacMarginPct: 34.3,
      deltaPts: -3.2, // 3.2 (baseline − EAC) flipped: EAC margin is 3.2 pts below plan
      tcv: 1_430_000,
      eacCost: 940_000,
      bac: 900_000,
    });
  });

  it('highlights = governance + risk stream events only, capped at 6', () => {
    const h = base().highlights;
    expect(h.map((x) => x.id)).toEqual(['g1', 'r1']); // 'a1' (activity) dropped
    expect(h.length).toBeLessThanOrEqual(6);
  });

  it('watchlist = criticalRaid, severity mapped to tone', () => {
    const w = base().watchlist;
    expect(w).toHaveLength(2);
    expect(w[0]!).toMatchObject({ id: 'r1', severity: 'CRITICAL', tone: 'critical', owner: 'M. Chen' });
    expect(w[1]!).toMatchObject({ id: 'r2', severity: 'HIGH', tone: 'warn' });
  });

  it('headline math: green share, red count, rounded compliance', () => {
    expect(base().headline).toEqual({
      activeEngagements: 6,
      greenSharePct: 67, // 4 / (4+1+1) = 0.666 -> 67
      redCount: 1,
      compliancePct: 82, // 82.4 -> 82
    });
  });

  it('handles an empty portfolio without dividing by zero', () => {
    const b = composeSteerCoBriefing({
      organizationName: 'Empty',
      generatedAt: '2026-09-03T12:00:00.000Z',
      exec: makeExec({
        macro: { ...makeExec().macro, totalTcv: 0, activeEngagements: 0 },
        healthDistribution: { overall: { green: 0, amber: 0, red: 0 }, lenses: [] },
        criticalRaid: [],
      }),
      stream: [],
      showFinancials: true,
    });
    expect(b.headline.greenSharePct).toBe(0);
    expect(b.watchlist).toEqual([]);
    expect(b.highlights).toEqual([]);
    expect(b.vitals[3]).toMatchObject({ value: '0', tone: 'good' });
  });
});
