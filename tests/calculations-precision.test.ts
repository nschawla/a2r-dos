import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeTotalsFor, computeMarginModeler } from '@/lib/calculations/sizing';
import { computeEacSummary } from '@/lib/calculations/financials';
import { computePortfolioSummary } from '@/lib/calculations/portfolio';
import { money, roundMoney, d } from '@/lib/calculations/money';
import type { RateRole, SizingProjectInput, FinancialActualInput } from '@/lib/calculations/types';

/**
 * WP2 — proof that the calculation engine does its `$` / rate arithmetic in
 * exact decimal and does NOT accumulate IEEE-754 representation error.
 *
 * Each case builds inputs whose naïve float accumulation demonstrably
 * differs from the exact cents total, then asserts the engine returns the
 * exact value.
 */

// A rate whose product with the hours below is not exactly representable as
// a double, so a running float sum drifts.
const RATE = '100.10';
const COST = '61.73';

describe('roundMoney — explicit accounting-boundary rounding (HALF_UP, 2dp)', () => {
  it('rounds half up', () => {
    expect(roundMoney(d('0.005')).toString()).toBe('0.01');
    expect(roundMoney(d('2.345')).toString()).toBe('2.35');
    expect(roundMoney(d('2.344')).toString()).toBe('2.34');
    expect(roundMoney(d('1234567.125')).toString()).toBe('1234567.13');
  });
  it('rounds negatives half away from zero (standard HALF_UP)', () => {
    expect(roundMoney(d('-2.345')).toString()).toBe('-2.35');
    expect(roundMoney(d('-2.344')).toString()).toBe('-2.34');
  });
  it('money() returns the exact rounded value as a number', () => {
    expect(money('8420.005')).toBe(8420.01);
    expect(money(d('99999999.994'))).toBe(99999999.99);
  });
});

describe('computeTotalsFor — revenue / cost accumulate without float drift', () => {
  const roles: RateRole[] = [{ id: 'r1', name: 'Eng', billRate: RATE, costRate: COST }];
  // 400 cells of 0.37h each → 148h total. 148 × 100.10 = 14814.80 exactly.
  const cells = Array.from({ length: 400 }, (_, i) => ({
    phaseKey: 'build',
    roleId: 'r1',
    hours: 0.37,
  }));
  const project: SizingProjectInput = {
    estimationMode: 'matrix',
    commercialModel: 'tm',
    contingencyPct: 0,
    effortCells: cells,
  };

  it('the naïve float sum actually drifts (sanity check on the fixture)', () => {
    const floatSum = cells.reduce((s, c) => s + c.hours * Number(RATE), 0);
    const exact = new Decimal(0.37).times(400).times(RATE); // 14814.80
    // float sum is NOT exactly the cents value
    expect(floatSum).not.toBe(exact.toNumber());
  });

  it('the engine returns the exact cents total', () => {
    const totals = computeTotalsFor(project, roles);
    // 400 × 0.37 × 100.10 = 14814.80
    expect(totals.revenue).toBe(14814.8);
    // 400 × 0.37 × 61.73 = 9136.04
    expect(totals.cost).toBe(9136.04);
  });

  it('margin % is derived from the exact revenue/cost', () => {
    const totals = computeTotalsFor(project, roles);
    const expected = new Decimal(14814.8).minus(9136.04).div(14814.8).times(100).toNumber();
    expect(totals.marginPct).toBeCloseTo(expected, 10);
  });
});

describe('computeEacSummary — totalEacCost is the exact sum of the row costs', () => {
  const roles: RateRole[] = Array.from({ length: 60 }, (_, i) => ({
    id: `r${i}`,
    name: `Role ${i}`,
    billRate: '175.00',
    costRate: '112.37',
  }));
  const project: SizingProjectInput = {
    estimationMode: 'matrix',
    commercialModel: 'tm',
    contingencyPct: 0,
    effortCells: roles.map((r) => ({ phaseKey: 'build', roleId: r.id, hours: 13.3 })),
  };
  const actuals: FinancialActualInput[] = roles.map((r) => ({
    roleKey: r.id,
    hours: 4.1,
    cost: '461.42',
    forecastHours: 9.2,
    openRRHours: 0,
  }));

  it('exact', () => {
    const eac = computeEacSummary(project, roles, actuals);
    // per row: 461.42 + 9.2 × 112.37 = 461.42 + 1033.804 = 1495.224 → 1495.22
    // × 60 rows = 89713.20
    const perRow = roundMoney(d('461.42').plus(d('9.2').times('112.37')));
    expect(eac.rows[0]!.eacCost).toBe(perRow.toNumber());
    expect(eac.totalEacCost).toBe(perRow.times(60).toNumber());
  });
});

describe('computePortfolioSummary — totalValue is the exact sum of contract values', () => {
  const roles: RateRole[] = [{ id: 'r1', name: 'Eng', billRate: '99.99', costRate: '55.55' }];
  // 150 identical FF projects, each 7.7h → contract value with 12.5% contingency.
  const one: SizingProjectInput = {
    estimationMode: 'matrix',
    commercialModel: 'ff',
    contingencyPct: '12.5',
    effortCells: [{ phaseKey: 'build', roleId: 'r1', hours: 7.7 }],
  };
  const projects = Array.from({ length: 150 }, (_, i) => ({
    id: `p${i}`,
    hierarchyLevel: 'standalone' as const,
    locked: false,
    sizing: one,
    auditEntries: [],
  }));

  it('exact', () => {
    const summary = computePortfolioSummary(projects, roles);
    const rev = roundMoney(d('7.7').times('99.99')); // 769.92
    const cont = roundMoney(d('7.7').times('99.99').times('12.5').div(100)); // 96.24
    const cv = rev.plus(cont); // 866.16
    expect(summary.totalValue).toBe(cv.times(150).toNumber());
  });
});

describe('computeMarginModeler — modelling figures are exact (full precision)', () => {
  it('requiredRevenue = cost / (1 - target/100), exactly', () => {
    const roles: RateRole[] = [{ id: 'r1', name: 'Eng', billRate: '200', costRate: '125' }];
    const totals = computeTotalsFor(
      {
        estimationMode: 'matrix',
        commercialModel: 'tm',
        contingencyPct: 0,
        effortCells: [{ phaseKey: 'build', roleId: 'r1', hours: 100 }],
      },
      roles,
    );
    const modeler = computeMarginModeler(totals, 40);
    // cost 12500 / (1 - 0.4) = 20833.333...
    const expected = d('12500').div(d('0.6')).toNumber();
    expect(modeler.requiredRevenue).toBeCloseTo(expected, 10);
  });
});
