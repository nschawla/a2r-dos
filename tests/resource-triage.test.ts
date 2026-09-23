/**
 * Unit tests for the Resource & Capacity Cockpit Executive Triage &
 * Thematic Clustering engine (src/lib/resource-triage.ts). Pure — no DB.
 * Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import {
  buildResourceTriage,
  classifyResourceTheme,
  resourceHealthRag,
  type ResourceTriageInput,
} from '../src/lib/resource-triage';

function resource(overrides: Partial<ResourceTriageInput> = {}): ResourceTriageInput {
  return {
    id: 'r-1',
    name: 'Test Resource',
    psPractice: 'TRANS-Delivery',
    roleName: 'Solution Architect',
    isBillableHead: true,
    fte: 1,
    availableHours: 400,
    billableHours: 280,
    utilizationPct: 0.7,
    targetUtilPct: 0.7,
    attainmentPct: 1.0,
    projectCount: 2,
    overloaded: false,
    projectIds: ['p-1'],
    ...overrides,
  };
}

describe('resourceHealthRag', () => {
  it('marks severe over-allocation (>110%) Red', () => {
    expect(resourceHealthRag({ utilizationPct: 1.25, attainmentPct: 1.5, overloaded: false })).toBe('Red');
  });

  it('marks concurrency overload Red even with normal utilization', () => {
    expect(resourceHealthRag({ utilizationPct: 0.7, attainmentPct: 1.0, overloaded: true })).toBe('Red');
  });

  it('marks well-under-target attainment Amber', () => {
    expect(resourceHealthRag({ utilizationPct: 0.3, attainmentPct: 0.4, overloaded: false })).toBe('Amber');
  });

  it('marks a normal, on-target resource Green', () => {
    expect(resourceHealthRag({ utilizationPct: 0.7, attainmentPct: 1.0, overloaded: false })).toBe('Green');
  });
});

describe('classifyResourceTheme', () => {
  it('classifies a Red senior-tier role as Senior/Architect Over-allocation', () => {
    const theme = classifyResourceTheme({ roleName: 'Lead Architect', projectCount: 3, rag: 'Red' });
    expect(theme).toBe('SENIOR_ARCHITECT_OVERALLOCATION');
  });

  it('classifies a Red PM-tier role as Cross-Project Contention for Lead PMs', () => {
    const theme = classifyResourceTheme({ roleName: 'Project Manager', projectCount: 7, rag: 'Red' });
    expect(theme).toBe('LEAD_PM_CONTENTION');
  });

  it('classifies an Amber junior-tier role as Junior/Analyst Under-utilization', () => {
    const theme = classifyResourceTheme({ roleName: 'Business Analyst', projectCount: 1, rag: 'Amber' });
    expect(theme).toBe('JUNIOR_ANALYST_UNDERUTILIZATION');
  });

  it('classifies an Amber, zero-project resource as Bench/Unassigned Capacity regardless of role', () => {
    const theme = classifyResourceTheme({ roleName: 'Solution Architect', projectCount: 0, rag: 'Amber' });
    expect(theme).toBe('BENCH_UNDERUTILIZATION');
  });

  it('falls back to OTHER when nothing matches', () => {
    const theme = classifyResourceTheme({ roleName: 'Solution Architect', projectCount: 3, rag: 'Amber' });
    expect(theme).toBe('OTHER');
  });

  it('does not classify a Red non-senior, non-PM role as a specific theme', () => {
    const theme = classifyResourceTheme({ roleName: 'Consultant', projectCount: 3, rag: 'Red' });
    expect(theme).toBe('OTHER');
  });

  it('classifies a Red "Director" role as senior-tier over-allocation', () => {
    const theme = classifyResourceTheme({ roleName: 'Director', projectCount: 2, rag: 'Red' });
    expect(theme).toBe('SENIOR_ARCHITECT_OVERALLOCATION');
  });
});

describe('buildResourceTriage', () => {
  it('computes blended utilization using the hours-weighted formula, not a simple average of row percentages', () => {
    const result = buildResourceTriage([
      // Two very different-sized rows — a naive average of the two
      // utilizationPct values (0.5, 1.0) would give 0.75; the correct
      // hours-weighted blend is Σbillable / Σavailable = 500/800 = 0.625.
      resource({ id: 'a', availableHours: 400, billableHours: 200, utilizationPct: 0.5 }),
      resource({ id: 'b', availableHours: 400, billableHours: 300, utilizationPct: 0.75 }),
    ]);
    expect(result.utilizationPct).toBeCloseTo(500 / 800, 5);
  });

  it('counts every row toward the utilization numerator but only billable heads toward the denominator', () => {
    const result = buildResourceTriage([
      resource({ id: 'a', isBillableHead: true, availableHours: 400, billableHours: 200 }),
      resource({ id: 'b', isBillableHead: false, availableHours: 400, billableHours: 100 }),
    ]);
    // Denominator: only the billable head's 400 available hours.
    // Numerator: both rows' billable hours, 200 + 100 = 300.
    expect(result.utilizationPct).toBeCloseTo(300 / 400, 5);
    expect(result.resourceCount).toBe(1); // non-billable head excluded from the headcount figure
  });

  it('counts unassigned headcount and severely-over-allocated resources', () => {
    const result = buildResourceTriage([
      resource({ id: 'a', projectCount: 0 }),
      resource({ id: 'b', utilizationPct: 1.2, attainmentPct: 1.7 }),
      resource({ id: 'c' }),
    ]);
    expect(result.benchCount).toBe(1);
    expect(result.severelyOverAllocatedCount).toBe(1);
  });

  it('splits the roster into Red/Amber/Optimal', () => {
    const result = buildResourceTriage([
      resource({ id: 'a', utilizationPct: 1.2, attainmentPct: 1.7 }),
      resource({ id: 'b', utilizationPct: 0.2, attainmentPct: 0.3 }),
      resource({ id: 'c' }),
    ]);
    expect(result.redCount).toBe(1);
    expect(result.amberCount).toBe(1);
    expect(result.optimalCount).toBe(1);
  });

  it('excludes Optimal (Green) resources from clusters entirely', () => {
    const result = buildResourceTriage([resource()]);
    expect(result.clusters).toHaveLength(0);
  });

  it('groups at-risk resources into clusters and only returns non-empty ones', () => {
    const result = buildResourceTriage([
      resource({ id: 'a', roleName: 'Lead Architect', utilizationPct: 1.3, attainmentPct: 1.8 }),
      resource({ id: 'b', roleName: 'Business Analyst', utilizationPct: 0.2, attainmentPct: 0.3 }),
      resource({ id: 'c' }),
    ]);
    const themes = result.clusters.map((c) => c.theme);
    expect(themes).toContain('SENIOR_ARCHITECT_OVERALLOCATION');
    expect(themes).toContain('JUNIOR_ANALYST_UNDERUTILIZATION');
    expect(themes).not.toContain('LEAD_PM_CONTENTION');
  });

  it('computes distinct projects touched per cluster as the union across member resources', () => {
    const result = buildResourceTriage([
      resource({ id: 'a', roleName: 'Lead Architect', utilizationPct: 1.3, attainmentPct: 1.8, projectIds: ['p-1', 'p-2'] }),
      resource({ id: 'b', roleName: 'Solution Architect', utilizationPct: 1.2, attainmentPct: 1.6, projectIds: ['p-2', 'p-3'] }),
    ]);
    const cluster = result.clusters.find((c) => c.theme === 'SENIOR_ARCHITECT_OVERALLOCATION')!;
    expect(cluster.resourceCount).toBe(2);
    expect(cluster.projectCount).toBe(3); // p-1, p-2, p-3 — union, not sum
  });

  it('sorts clusters by distinct project count first, then resource count', () => {
    const result = buildResourceTriage([
      // PM theme: 2 resources, but all on the same single project.
      resource({ id: 'a', roleName: 'Project Manager', overloaded: true, projectCount: 7, projectIds: ['p-1'] }),
      resource({ id: 'b', roleName: 'Program Manager', overloaded: true, projectCount: 6, projectIds: ['p-1'] }),
      // Senior theme: 1 resource, but touches 3 distinct projects — more systemic.
      resource({ id: 'c', roleName: 'Lead Architect', utilizationPct: 1.3, attainmentPct: 1.8, projectIds: ['p-2', 'p-3', 'p-4'] }),
    ]);
    expect(result.clusters[0]!.theme).toBe('SENIOR_ARCHITECT_OVERALLOCATION');
    expect(result.clusters[1]!.theme).toBe('LEAD_PM_CONTENTION');
  });
});
