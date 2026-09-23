/**
 * Unit tests for the RAID Cockpit Executive Triage & Thematic Clustering
 * engine (src/lib/raid-triage.ts). Pure — no DB. Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import { buildRaidTriage, classifyRaidTheme, ragFor, type RaidTriageItemInput } from '../src/lib/raid-triage';

function item(overrides: Partial<RaidTriageItemInput> = {}): RaidTriageItemInput {
  return {
    id: 'r-1',
    projectId: 'p-1',
    projectName: 'Test Engagement',
    type: 'RISK',
    title: null,
    description: 'A generic open item with no particular pattern.',
    impact: null,
    severity: 'HIGH',
    targetDate: null,
    overdue: false,
    ownerName: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ragFor', () => {
  it('maps CRITICAL and HIGH to Red', () => {
    expect(ragFor('CRITICAL')).toBe('Red');
    expect(ragFor('HIGH')).toBe('Red');
  });
  it('maps MED to Amber', () => {
    expect(ragFor('MED')).toBe('Amber');
  });
});

describe('classifyRaidTheme', () => {
  it('classifies a resource-bottleneck description', () => {
    const theme = classifyRaidTheme({
      title: 'Team understaffed for Q4 push',
      description: 'We are short-staffed and the bench has no available capacity to backfill.',
      impact: null,
    });
    expect(theme).toBe('RESOURCE_BOTTLENECK');
  });

  it('classifies an integration/data description', () => {
    const theme = classifyRaidTheme({
      title: 'API integration failing',
      description: 'The data migration between the legacy system and the new API keeps corrupting records.',
      impact: null,
    });
    expect(theme).toBe('INTEGRATION_DATA');
  });

  it('classifies a scope-creep description', () => {
    const theme = classifyRaidTheme({
      title: null,
      description: 'Client keeps asking for additional requirements outside the original scope — clear scope creep.',
      impact: null,
    });
    expect(theme).toBe('SCOPE_CREEP');
  });

  it('classifies a vendor-delay description', () => {
    const theme = classifyRaidTheme({
      title: 'Subcontractor missed milestone',
      description: 'Our third-party vendor breached the SLA on the hardware delivery.',
      impact: null,
    });
    expect(theme).toBe('VENDOR_DELAY');
  });

  it('falls back to OTHER when nothing matches', () => {
    const theme = classifyRaidTheme({ title: 'Weather delay', description: 'A storm closed the office for two days.', impact: null });
    expect(theme).toBe('OTHER');
  });

  it('picks the theme with the most keyword hits, not just the first match', () => {
    const theme = classifyRaidTheme({
      title: 'Vendor mentioned once',
      description:
        'Vendor aside, this is really about being short-staffed: understaffed, low capacity, overloaded, and stuck backfilling open headcount.',
      impact: null,
    });
    expect(theme).toBe('RESOURCE_BOTTLENECK');
  });

  it('reads the impact field too, not just title/description', () => {
    const theme = classifyRaidTheme({ title: 'Unclear item', description: 'See impact.', impact: 'Scope creep is driving unplanned work.' });
    expect(theme).toBe('SCOPE_CREEP');
  });
});

describe('buildRaidTriage', () => {
  it('splits total count into Red and Amber correctly', () => {
    const result = buildRaidTriage([
      item({ id: 'a', severity: 'CRITICAL' }),
      item({ id: 'b', severity: 'HIGH' }),
      item({ id: 'c', severity: 'MED' }),
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.redCount).toBe(2);
    expect(result.amberCount).toBe(1);
  });

  it('counts items by RAID type', () => {
    const result = buildRaidTriage([
      item({ id: 'a', type: 'RISK' }),
      item({ id: 'b', type: 'RISK' }),
      item({ id: 'c', type: 'ISSUE' }),
    ]);
    expect(result.byType).toEqual({ RISK: 2, ASSUMPTION: 0, ISSUE: 1, DEPENDENCY: 0 });
  });

  it('groups items into clusters and only returns non-empty ones', () => {
    const result = buildRaidTriage([
      item({ id: 'a', description: 'Understaffed and over capacity.' }),
      item({ id: 'b', description: 'A generic item matching nothing.' }),
    ]);
    const themes = result.clusters.map((c) => c.theme);
    expect(themes).toContain('RESOURCE_BOTTLENECK');
    expect(themes).toContain('OTHER');
    expect(themes).not.toContain('VENDOR_DELAY');
  });

  it('counts distinct projects touched per cluster', () => {
    const result = buildRaidTriage([
      item({ id: 'a', projectId: 'p-1', description: 'Understaffed team.' }),
      item({ id: 'b', projectId: 'p-2', description: 'Also short-staffed and over capacity.' }),
      item({ id: 'c', projectId: 'p-1', description: 'Resource bench is empty, backfill needed.' }),
    ]);
    const cluster = result.clusters.find((c) => c.theme === 'RESOURCE_BOTTLENECK')!;
    expect(cluster.count).toBe(3);
    expect(cluster.projectCount).toBe(2);
  });

  it('sorts clusters by distinct project count first, then item count', () => {
    const result = buildRaidTriage([
      // Vendor theme: 1 project, 3 items.
      item({ id: 'a', projectId: 'p-1', description: 'Vendor SLA breach.' }),
      item({ id: 'b', projectId: 'p-1', description: 'Subcontractor delay again.' }),
      item({ id: 'c', projectId: 'p-1', description: 'Third-party vendor missed delivery.' }),
      // Resource theme: 2 projects, 2 items — fewer items, but more systemic.
      item({ id: 'd', projectId: 'p-2', description: 'Understaffed and overloaded.' }),
      item({ id: 'e', projectId: 'p-3', description: 'Short-staffed, capacity gap.' }),
    ]);
    expect(result.clusters[0]!.theme).toBe('RESOURCE_BOTTLENECK');
    expect(result.clusters[1]!.theme).toBe('VENDOR_DELAY');
  });

  it('computes per-cluster Red/Amber counts independent of the portfolio-wide totals', () => {
    const result = buildRaidTriage([
      item({ id: 'a', severity: 'CRITICAL', description: 'Understaffed.' }),
      item({ id: 'b', severity: 'MED', description: 'Also understaffed and overloaded.' }),
    ]);
    const cluster = result.clusters.find((c) => c.theme === 'RESOURCE_BOTTLENECK')!;
    expect(cluster.redCount).toBe(1);
    expect(cluster.amberCount).toBe(1);
  });
});
