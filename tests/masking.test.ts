/**
 * Unit tests for the role-based financial data-masking layer
 * (src/lib/security/masking.ts). Pure, no I/O — the same testability
 * contract as the calculation engine and rbac.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  financialVisibility,
  canViewMargins,
  canViewCostRates,
  canViewAnyFinancials,
  maskMoney,
  maskPct,
  maskRate,
  maskRateRolesForViewer,
  maskFinancialActualsForViewer,
  MASK,
} from '../src/lib/security/masking';

describe('financialVisibility tiers', () => {
  it('ADMIN (Partner/Owner) sees everything', () => {
    expect(financialVisibility('ADMIN')).toBe('full');
    expect(canViewMargins('ADMIN')).toBe(true);
    expect(canViewCostRates('ADMIN')).toBe(true);
  });

  it('VP_EXECUTIVE and PRACTICE_DIRECTOR get the summary tier — margins yes, raw cost rates no', () => {
    for (const role of ['VP_EXECUTIVE', 'PRACTICE_DIRECTOR'] as const) {
      expect(financialVisibility(role)).toBe('summary');
      expect(canViewMargins(role)).toBe(true);
      expect(canViewCostRates(role)).toBe(false);
    }
  });

  it('DELIVERY_MANAGER and PROJECT_MANAGER are restricted — no financial figures at all', () => {
    for (const role of ['DELIVERY_MANAGER', 'PROJECT_MANAGER'] as const) {
      expect(financialVisibility(role)).toBe('restricted');
      expect(canViewMargins(role)).toBe(false);
      expect(canViewCostRates(role)).toBe(false);
      expect(canViewAnyFinancials(role)).toBe(false);
    }
  });
});

describe('org governance override — maskFinancialsForDelivery', () => {
  const strict = { maskFinancialsForDelivery: true };

  it('downgrades PRACTICE_DIRECTOR from summary to restricted', () => {
    expect(financialVisibility('PRACTICE_DIRECTOR', strict)).toBe('restricted');
    expect(canViewMargins('PRACTICE_DIRECTOR', strict)).toBe(false);
    expect(canViewAnyFinancials('PRACTICE_DIRECTOR', strict)).toBe(false);
  });

  it('leaves ADMIN and VP_EXECUTIVE untouched', () => {
    expect(financialVisibility('ADMIN', strict)).toBe('full');
    expect(financialVisibility('VP_EXECUTIVE', strict)).toBe('summary');
    expect(canViewMargins('VP_EXECUTIVE', strict)).toBe(true);
  });

  it('is a no-op when the flag is absent or false', () => {
    expect(financialVisibility('PRACTICE_DIRECTOR', {})).toBe('summary');
    expect(financialVisibility('PRACTICE_DIRECTOR', { maskFinancialsForDelivery: false })).toBe('summary');
  });

  it('strips the rate card for a PRACTICE_DIRECTOR under the strict toggle', () => {
    const roles = [{ id: 'r1', name: 'Architect', billRate: 288, costRate: 181 }];
    expect(maskRateRolesForViewer(roles, 'PRACTICE_DIRECTOR')).toEqual(roles); // default: kept
    const stripped = maskRateRolesForViewer(roles, 'PRACTICE_DIRECTOR', strict);
    expect(stripped[0]!.costRate).toBe(0);
    expect(stripped[0]!.billRate).toBe(0);
  });

  it('zeroes per-line actual cost for a PRACTICE_DIRECTOR under the strict toggle', () => {
    const rows = [{ cost: 18_100 }];
    expect(maskFinancialActualsForViewer(rows, 'PRACTICE_DIRECTOR')[0]!.cost).toBe(18_100);
    expect(maskFinancialActualsForViewer(rows, 'PRACTICE_DIRECTOR', strict)[0]!.cost).toBe(0);
  });
});

describe('value formatters', () => {
  it('render the value when authorized and the mask token otherwise', () => {
    expect(maskMoney(125_400, true)).toBe('$125,400');
    expect(maskMoney(125_400, false)).toBe(MASK);
    expect(maskPct(34.25, true)).toBe('34.3%');
    expect(maskPct(34.25, false)).toBe(MASK);
    expect(maskRate(181, true)).toBe('$181');
    expect(maskRate(181, false)).toBe(MASK);
  });
});

describe('server-side payload stripping', () => {
  const roles = [
    { id: 'r1', name: 'Lead Architect', billRate: 288, costRate: 181, employmentType: 'fte' as const },
    { id: 'r2', name: 'Contractor SC', billRate: 198, costRate: 126, employmentType: 'contractor' as const },
  ];

  it('leaves the rate card untouched for full and summary viewers (the engine needs cost rates for margin math)', () => {
    expect(maskRateRolesForViewer(roles, 'ADMIN')).toEqual(roles);
    expect(maskRateRolesForViewer(roles, 'PRACTICE_DIRECTOR')).toEqual(roles);
  });

  it('zeroes bill AND cost rates for restricted viewers so the numbers never reach the client', () => {
    const stripped = maskRateRolesForViewer(roles, 'PROJECT_MANAGER');
    for (const r of stripped) {
      expect(r.costRate).toBe(0);
      expect(r.billRate).toBe(0);
    }
    // names/ids/employment type are preserved
    expect(stripped[0]!.name).toBe('Lead Architect');
    expect(stripped[1]!.employmentType).toBe('contractor');
  });

  it('zeroes per-line actual cost for restricted viewers, keeps it for summary+', () => {
    const rows = [{ roleKey: 'r1', hours: 100, cost: 18_100 }];
    expect(maskFinancialActualsForViewer(rows, 'PROJECT_MANAGER')[0]!.cost).toBe(0);
    expect(maskFinancialActualsForViewer(rows, 'VP_EXECUTIVE')[0]!.cost).toBe(18_100);
  });
});
