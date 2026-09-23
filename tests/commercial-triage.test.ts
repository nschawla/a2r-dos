/**
 * Unit tests for the Commercial Baseline Cockpit Executive Triage &
 * Thematic Clustering engine (src/lib/commercial-triage.ts). Pure — no
 * DB. Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import {
  buildCommercialTriage,
  classifyCommercialTheme,
  commercialRagFor,
  type CommercialTriageProjectInput,
} from '../src/lib/commercial-triage';

function project(overrides: Partial<CommercialTriageProjectInput> = {}): CommercialTriageProjectInput {
  return {
    id: 'p-1',
    name: 'Test Engagement',
    bac: 100_000,
    actualsCost: 100_000,
    healthCost: 'Green',
    healthScope: 'Green',
    commercialModel: 'FF',
    locked: true,
    hasChangeOrderActivity: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('commercialRagFor', () => {
  it('maps Red healthCost to Red regardless of everything else', () => {
    expect(commercialRagFor({ healthCost: 'Red', healthScope: 'Green', hasChangeOrderActivity: false })).toBe('Red');
  });

  it('maps Amber healthCost to Amber', () => {
    expect(commercialRagFor({ healthCost: 'Amber', healthScope: 'Green', hasChangeOrderActivity: false })).toBe('Amber');
  });

  it('maps a scope-cap breach alone to Amber even with healthy cost', () => {
    expect(commercialRagFor({ healthCost: 'Green', healthScope: 'Red', hasChangeOrderActivity: false })).toBe('Amber');
  });

  it('maps real change-order activity alone to Amber even with healthy cost/scope', () => {
    expect(commercialRagFor({ healthCost: 'Green', healthScope: 'Green', hasChangeOrderActivity: true })).toBe('Amber');
  });

  it('maps a fully clean project to null (excluded from triage)', () => {
    expect(commercialRagFor({ healthCost: 'Green', healthScope: 'Green', hasChangeOrderActivity: false })).toBeNull();
  });
});

describe('classifyCommercialTheme', () => {
  it('classifies real change-order activity as Change Order Exposure, taking priority over everything', () => {
    const theme = classifyCommercialTheme({
      commercialModel: 'FF',
      healthCost: 'Red',
      healthScope: 'Red',
      hasChangeOrderActivity: true,
    });
    expect(theme).toBe('CHANGE_ORDER_EXPOSURE');
  });

  it('classifies Fixed Fee margin erosion as Margin Squeeze on Fixed-Fee Deliverables', () => {
    const theme = classifyCommercialTheme({ commercialModel: 'FF', healthCost: 'Amber', healthScope: 'Green', hasChangeOrderActivity: false });
    expect(theme).toBe('MARGIN_SQUEEZE_FIXED_FEE');
  });

  it('classifies T&M margin erosion as Blended Rate Erosion', () => {
    const theme = classifyCommercialTheme({ commercialModel: 'TM', healthCost: 'Amber', healthScope: 'Green', hasChangeOrderActivity: false });
    expect(theme).toBe('BLENDED_RATE_EROSION');
  });

  it('classifies a scope-cap breach with healthy cost as Exceeded Baseline Scope Caps', () => {
    const theme = classifyCommercialTheme({ commercialModel: 'TM', healthCost: 'Green', healthScope: 'Red', hasChangeOrderActivity: false });
    expect(theme).toBe('EXCEEDED_BASELINE_SCOPE_CAP');
  });

  it('falls back to OTHER when nothing matches', () => {
    const theme = classifyCommercialTheme({ commercialModel: 'FF', healthCost: 'Green', healthScope: 'Green', hasChangeOrderActivity: false });
    expect(theme).toBe('OTHER');
  });
});

describe('buildCommercialTriage', () => {
  it('sums total contracted value and counts active contracts across every scoped project', () => {
    const result = buildCommercialTriage([project({ id: 'a', bac: 100_000 }), project({ id: 'b', bac: 50_000 })]);
    expect(result.totalContractedValue).toBe(150_000);
    expect(result.projectCount).toBe(2);
  });

  it('splits locked vs. draft baselines', () => {
    const result = buildCommercialTriage([project({ id: 'a', locked: true }), project({ id: 'b', locked: false })]);
    expect(result.lockedCount).toBe(1);
    expect(result.draftCount).toBe(1);
  });

  it('counts and sums by commercial model', () => {
    const result = buildCommercialTriage([
      project({ id: 'a', commercialModel: 'FF', bac: 100_000 }),
      project({ id: 'b', commercialModel: 'FF', bac: 50_000 }),
      project({ id: 'c', commercialModel: 'TM', bac: 25_000 }),
    ]);
    expect(result.byCommercialModel.FF).toEqual({ count: 2, bac: 150_000 });
    expect(result.byCommercialModel.TM).toEqual({ count: 1, bac: 25_000 });
  });

  it('excludes fully clean projects from clusters entirely', () => {
    const result = buildCommercialTriage([project({ id: 'a' })]);
    expect(result.clusters).toHaveLength(0);
  });

  it('groups at-risk projects into clusters and only returns non-empty ones', () => {
    const result = buildCommercialTriage([
      project({ id: 'a', hasChangeOrderActivity: true }),
      project({ id: 'b', commercialModel: 'FF', healthCost: 'Amber' }),
      project({ id: 'c' }),
    ]);
    const themes = result.clusters.map((c) => c.theme);
    expect(themes).toContain('CHANGE_ORDER_EXPOSURE');
    expect(themes).toContain('MARGIN_SQUEEZE_FIXED_FEE');
    expect(themes).not.toContain('BLENDED_RATE_EROSION');
  });

  it('sorts clusters by distinct project count first, then total variance dollars', () => {
    const result = buildCommercialTriage([
      // Change order theme: 1 project, huge variance.
      project({ id: 'a', hasChangeOrderActivity: true, bac: 100_000, actualsCost: 400_000 }),
      // FF margin-squeeze theme: 2 projects, smaller variances each — more systemic.
      project({ id: 'b', commercialModel: 'FF', healthCost: 'Amber', bac: 100_000, actualsCost: 110_000 }),
      project({ id: 'c', commercialModel: 'FF', healthCost: 'Amber', bac: 100_000, actualsCost: 105_000 }),
    ]);
    expect(result.clusters[0]!.theme).toBe('MARGIN_SQUEEZE_FIXED_FEE');
    expect(result.clusters[1]!.theme).toBe('CHANGE_ORDER_EXPOSURE');
  });

  it('computes per-cluster Red/Amber counts and total variance independent of portfolio-wide totals', () => {
    const result = buildCommercialTriage([
      project({ id: 'a', commercialModel: 'FF', healthCost: 'Red', bac: 100_000, actualsCost: 150_000 }),
      project({ id: 'b', commercialModel: 'FF', healthCost: 'Amber', bac: 100_000, actualsCost: 120_000 }),
    ]);
    const cluster = result.clusters.find((c) => c.theme === 'MARGIN_SQUEEZE_FIXED_FEE')!;
    expect(cluster.redCount).toBe(1);
    expect(cluster.amberCount).toBe(1);
    expect(cluster.totalVarianceUsd).toBe(70_000);
  });
});
