/**
 * Unit tests for the Financial Realization Cockpit Executive Triage &
 * Thematic Clustering engine (src/lib/financial-triage.ts). Pure — no DB.
 * Run with: npm test (vitest).
 */
import { describe, expect, it } from 'vitest';
import {
  buildFinancialTriage,
  classifyFinancialTheme,
  financialRagFor,
  type FinancialTriageProjectInput,
} from '../src/lib/financial-triage';

function project(overrides: Partial<FinancialTriageProjectInput> = {}): FinancialTriageProjectInput {
  return {
    id: 'p-1',
    name: 'Test Engagement',
    bac: 100_000,
    actualsCost: 100_000,
    vac: 0,
    healthCost: 'Green',
    billingType: 'FF',
    clientTier: 'STANDARD',
    scopeAtRisk: false,
    milestoneDelayed: false,
    contractorCostPct: 0,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('financialRagFor', () => {
  it('maps Red and Amber to a RAG value', () => {
    expect(financialRagFor('Red')).toBe('Red');
    expect(financialRagFor('Amber')).toBe('Amber');
  });
  it('maps Green to null — excluded from triage entirely', () => {
    expect(financialRagFor('Green')).toBeNull();
  });
});

describe('classifyFinancialTheme', () => {
  it('classifies a delayed milestone on a Fixed Price project', () => {
    const theme = classifyFinancialTheme({
      billingType: 'FF',
      milestoneDelayed: true,
      scopeAtRisk: false,
      contractorCostPct: 0,
      bac: 100_000,
      actualsCost: 100_000,
    });
    expect(theme).toBe('UNBILLED_MILESTONE_DELAY');
  });

  it('does not classify a delayed milestone on a T&M project as unbilled — bills on hours, not milestones', () => {
    const theme = classifyFinancialTheme({
      billingType: 'TM',
      milestoneDelayed: true,
      scopeAtRisk: false,
      contractorCostPct: 0,
      bac: 100_000,
      actualsCost: 100_000,
    });
    expect(theme).not.toBe('UNBILLED_MILESTONE_DELAY');
  });

  it('classifies scope-at-risk as Scope Creep Overrun', () => {
    const theme = classifyFinancialTheme({
      billingType: 'FF',
      milestoneDelayed: false,
      scopeAtRisk: true,
      contractorCostPct: 0,
      bac: 100_000,
      actualsCost: 100_000,
    });
    expect(theme).toBe('SCOPE_CREEP_OVERRUN');
  });

  it('classifies high contractor cost share as Subcontractor Rate Variance', () => {
    const theme = classifyFinancialTheme({
      billingType: 'FF',
      milestoneDelayed: false,
      scopeAtRisk: false,
      contractorCostPct: 55,
      bac: 100_000,
      actualsCost: 100_000,
    });
    expect(theme).toBe('SUBCONTRACTOR_RATE_VARIANCE');
  });

  it('classifies plain overrun with no other driver as Labor Burn Acceleration', () => {
    const theme = classifyFinancialTheme({
      billingType: 'TM',
      milestoneDelayed: false,
      scopeAtRisk: false,
      contractorCostPct: 5,
      bac: 100_000,
      actualsCost: 130_000,
    });
    expect(theme).toBe('LABOR_BURN_ACCELERATION');
  });

  it('falls back to OTHER when nothing matches', () => {
    const theme = classifyFinancialTheme({
      billingType: 'TM',
      milestoneDelayed: false,
      scopeAtRisk: false,
      contractorCostPct: 5,
      bac: 100_000,
      actualsCost: 95_000,
    });
    expect(theme).toBe('OTHER');
  });

  it('prioritizes milestone delay over scope-at-risk when both fire', () => {
    const theme = classifyFinancialTheme({
      billingType: 'FF',
      milestoneDelayed: true,
      scopeAtRisk: true,
      contractorCostPct: 0,
      bac: 100_000,
      actualsCost: 100_000,
    });
    expect(theme).toBe('UNBILLED_MILESTONE_DELAY');
  });
});

describe('buildFinancialTriage', () => {
  it('sums BAC, Actuals, and VAC across every scoped project', () => {
    const result = buildFinancialTriage([
      project({ id: 'a', bac: 100_000, actualsCost: 90_000, vac: 10_000 }),
      project({ id: 'b', bac: 50_000, actualsCost: 60_000, vac: -10_000 }),
    ]);
    expect(result.totalBac).toBe(150_000);
    expect(result.totalActuals).toBe(150_000);
    expect(result.totalVac).toBe(0);
    expect(result.projectCount).toBe(2);
  });

  it('splits over-budget vs on-budget by healthCost', () => {
    const result = buildFinancialTriage([
      project({ id: 'a', healthCost: 'Green' }),
      project({ id: 'b', healthCost: 'Amber' }),
      project({ id: 'c', healthCost: 'Red' }),
    ]);
    expect(result.onBudgetCount).toBe(1);
    expect(result.overBudgetCount).toBe(2);
    expect(result.redCount).toBe(1);
    expect(result.amberCount).toBe(1);
  });

  it('counts and sums by billing type', () => {
    const result = buildFinancialTriage([
      project({ id: 'a', billingType: 'FF', bac: 100_000 }),
      project({ id: 'b', billingType: 'FF', bac: 50_000 }),
      project({ id: 'c', billingType: 'TM', bac: 25_000 }),
    ]);
    expect(result.byBillingType.FF).toEqual({ count: 2, bac: 150_000 });
    expect(result.byBillingType.TM).toEqual({ count: 1, bac: 25_000 });
  });

  it('excludes Green projects from clusters entirely', () => {
    const result = buildFinancialTriage([project({ id: 'a', healthCost: 'Green', scopeAtRisk: true })]);
    expect(result.clusters).toHaveLength(0);
  });

  it('groups at-risk projects into clusters and only returns non-empty ones', () => {
    const result = buildFinancialTriage([
      project({ id: 'a', healthCost: 'Red', scopeAtRisk: true }),
      project({ id: 'b', healthCost: 'Amber', billingType: 'FF', milestoneDelayed: true }),
      project({ id: 'c', healthCost: 'Green' }),
    ]);
    const themes = result.clusters.map((c) => c.theme);
    expect(themes).toContain('SCOPE_CREEP_OVERRUN');
    expect(themes).toContain('UNBILLED_MILESTONE_DELAY');
    expect(themes).not.toContain('SUBCONTRACTOR_RATE_VARIANCE');
  });

  it('sorts clusters by distinct project count first, then total variance dollars', () => {
    const result = buildFinancialTriage([
      // Subcontractor theme: 1 project, big overrun.
      project({ id: 'a', healthCost: 'Red', contractorCostPct: 60, bac: 100_000, actualsCost: 400_000 }),
      // Scope theme: 2 projects, smaller overruns each — more systemic.
      project({ id: 'b', healthCost: 'Amber', scopeAtRisk: true, bac: 100_000, actualsCost: 110_000 }),
      project({ id: 'c', healthCost: 'Amber', scopeAtRisk: true, bac: 100_000, actualsCost: 105_000 }),
    ]);
    expect(result.clusters[0]!.theme).toBe('SCOPE_CREEP_OVERRUN');
    expect(result.clusters[1]!.theme).toBe('SUBCONTRACTOR_RATE_VARIANCE');
  });

  it('computes per-cluster Red/Amber counts and total variance independent of portfolio-wide totals', () => {
    const result = buildFinancialTriage([
      project({ id: 'a', healthCost: 'Red', scopeAtRisk: true, bac: 100_000, actualsCost: 150_000 }),
      project({ id: 'b', healthCost: 'Amber', scopeAtRisk: true, bac: 100_000, actualsCost: 120_000 }),
    ]);
    const cluster = result.clusters.find((c) => c.theme === 'SCOPE_CREEP_OVERRUN')!;
    expect(cluster.redCount).toBe(1);
    expect(cluster.amberCount).toBe(1);
    expect(cluster.totalVarianceUsd).toBe(70_000);
  });
});
