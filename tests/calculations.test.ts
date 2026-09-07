/**
 * Unit tests for the pure calculation engine (src/lib/calculations). Every
 * expected value below was cross-checked by actually running the
 * implementation (via `tsx`) against a local Postgres-verified schema and
 * transcribing the output — not hand-guessed — then a subset were
 * independently re-derived by hand (see inline comments on the sizing and
 * suggestMatrixForProject cases) to confirm the implementation itself is
 * right, not just internally consistent.
 *
 * Run with: npm test  (vitest)
 */
import { describe, expect, it } from 'vitest';
import { computeAuditProgress, computeProjectHealth } from '../src/lib/calculations/audit';
import { computeEacSummary } from '../src/lib/calculations/financials';
import { computePortfolioSummary, computeProgramRollup } from '../src/lib/calculations/portfolio';
import { computePhasePace, computePhaseSlipDays, computeScheduleSummary } from '../src/lib/calculations/schedule';
import {
  computeMarginModeler,
  computeTotalsFor,
  seniorityWeightsForPhase,
  suggestMatrixForProject,
} from '../src/lib/calculations/sizing';
import type {
  AuditEntryInput,
  FinancialActualInput,
  RateRole,
  SizingProjectInput,
} from '../src/lib/calculations/types';

// ---------------------------------------------------------------- Fixtures

const roles: RateRole[] = [
  { id: 'r-arch', name: 'Lead Architect', billRate: 275, costRate: 170 },
  { id: 'r-pm', name: 'Project Manager', billRate: 210, costRate: 130 },
  { id: 'r-an', name: 'Analyst', billRate: 140, costRate: 90 },
];

const matrixProject: SizingProjectInput = {
  estimationMode: 'matrix',
  commercialModel: 'ff',
  contingencyPct: 10,
  effortCells: [
    { phaseKey: 'design', roleId: 'r-arch', hours: 40 },
    { phaseKey: 'design', roleId: 'r-pm', hours: 20 },
    { phaseKey: 'build', roleId: 'r-pm', hours: 100 },
    { phaseKey: 'build', roleId: 'r-an', hours: 150 },
  ],
};

const directTmProject: SizingProjectInput = {
  estimationMode: 'direct',
  commercialModel: 'tm',
  contingencyPct: 10,
  effortCells: [],
  directIntake: { soldHours: 500, targetRevenue: 100000, blendedMarginPct: 30 },
};

function auditAllStatus(status: AuditEntryInput['status']): AuditEntryInput[] {
  return Array.from({ length: 10 }, (_, i) => ({
    controlKey: `CTRL_${String(i + 1).padStart(2, '0')}`,
    status,
  }));
}

/** 4 controls 'yes', 6 controls 'no' -> exactly 40% weighted compliance. */
const audit40Pct: AuditEntryInput[] = [
  ...Array.from({ length: 4 }, (_, i) => ({ controlKey: `CTRL_${String(i + 1).padStart(2, '0')}`, status: 'yes' as const })),
  ...Array.from({ length: 6 }, (_, i) => ({ controlKey: `CTRL_${String(i + 5).padStart(2, '0')}`, status: 'no' as const })),
];

/** 5 'yes', 5 'no' -> exactly 50%. */
const audit50Pct: AuditEntryInput[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ controlKey: `CTRL_${String(i + 1).padStart(2, '0')}`, status: 'yes' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ controlKey: `CTRL_${String(i + 6).padStart(2, '0')}`, status: 'no' as const })),
];

/** 8 'yes', 2 'no' -> exactly 80%. */
const audit80Pct: AuditEntryInput[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ controlKey: `CTRL_${String(i + 1).padStart(2, '0')}`, status: 'yes' as const })),
  { controlKey: 'CTRL_09', status: 'no' },
  { controlKey: 'CTRL_10', status: 'no' },
];

// ======================================================== sizing.ts

describe('computeTotalsFor — matrix mode', () => {
  const totals = computeTotalsFor(matrixProject, roles);

  it('sums hours, revenue, and cost across all cells', () => {
    // 40h Architect @ $275 + 20h PM @ $210 + 100h PM @ $210 + 150h Analyst @ $140
    //   = 11,000 + 4,200 + 21,000 + 21,000 = 57,200
    expect(totals.totalHours).toBe(310);
    expect(totals.revenue).toBe(57200);
    // 40*170 + 20*130 + 100*130 + 150*90 = 6,800 + 2,600 + 13,000 + 13,500 = 35,900
    expect(totals.cost).toBe(35900);
  });

  it('computes blended bill rate as revenue / totalHours', () => {
    expect(totals.blended).toBeCloseTo(57200 / 310, 10);
  });

  it('applies contingency only for Fixed Fee, as a % of revenue', () => {
    expect(totals.contingencyAmt).toBe(5720); // 57,200 * 10%
    expect(totals.contractValue).toBe(62920);
  });

  it('computes baseline sold margin %', () => {
    expect(totals.marginPct).toBeCloseTo(37.23776223776224, 10);
  });

  it('rolls hours up by phase and by role', () => {
    expect(totals.phaseTotals).toEqual({ initiate: 0, design: 60, build: 250, test: 0, deploy: 0, sustain: 0 });
    expect(totals.roleTotals).toEqual({ 'r-arch': 40, 'r-pm': 120, 'r-an': 150 });
  });

  it('never applies contingency for Time & Materials', () => {
    const tm = computeTotalsFor({ ...matrixProject, commercialModel: 'tm' }, roles);
    expect(tm.contingencyAmt).toBe(0);
    expect(tm.contractValue).toBe(tm.revenue);
  });

  it('ignores effort cells referencing a role no longer on the roster', () => {
    const withStaleCell: SizingProjectInput = {
      ...matrixProject,
      effortCells: [...matrixProject.effortCells, { phaseKey: 'test', roleId: 'r-retired', hours: 999 }],
    };
    expect(computeTotalsFor(withStaleCell, roles)).toEqual(totals);
  });

  it('returns all zeros for an empty matrix (no divide-by-zero)', () => {
    const empty = computeTotalsFor({ estimationMode: 'matrix', commercialModel: 'ff', contingencyPct: 10, effortCells: [] }, roles);
    expect(empty).toEqual({
      totalHours: 0,
      revenue: 0,
      cost: 0,
      blended: 0,
      contingencyAmt: 0,
      contractValue: 0,
      marginPct: 0,
      phaseTotals: { initiate: 0, design: 0, build: 0, test: 0, deploy: 0, sustain: 0 },
      roleTotals: { 'r-arch': 0, 'r-pm': 0, 'r-an': 0 },
    });
  });
});

describe('computeTotalsFor — direct baseline intake mode', () => {
  it('back-solves cost from the stated blended margin (T&M, no contingency)', () => {
    const totals = computeTotalsFor(directTmProject, roles);
    expect(totals.totalHours).toBe(500);
    expect(totals.revenue).toBe(100000);
    expect(totals.cost).toBe(70000); // 100,000 * (1 - 30%)
    expect(totals.blended).toBe(200); // 100,000 / 500
    expect(totals.contingencyAmt).toBe(0);
    expect(totals.contractValue).toBe(100000);
    expect(totals.marginPct).toBe(30);
  });

  it('applies contingency for Fixed Fee direct-intake deals too', () => {
    const ff: SizingProjectInput = { ...directTmProject, commercialModel: 'ff', contingencyPct: 12 };
    const totals = computeTotalsFor(ff, roles);
    expect(totals.contingencyAmt).toBe(12000); // 100,000 * 12%
    expect(totals.contractValue).toBe(112000);
  });

  it('leaves phaseTotals/roleTotals zeroed — direct intake has no per-cell breakdown', () => {
    const totals = computeTotalsFor(directTmProject, roles);
    expect(Object.values(totals.phaseTotals).every((v) => v === 0)).toBe(true);
    expect(Object.values(totals.roleTotals).every((v) => v === 0)).toBe(true);
  });

  it('handles missing directIntake gracefully (all zeros)', () => {
    const totals = computeTotalsFor({ estimationMode: 'direct', commercialModel: 'ff', contingencyPct: 10, effortCells: [] }, roles);
    expect(totals.totalHours).toBe(0);
    expect(totals.revenue).toBe(0);
    expect(totals.marginPct).toBe(0);
  });
});

describe('computeMarginModeler', () => {
  const totals = computeTotalsFor(matrixProject, roles); // revenue 57,200 / cost 35,900 / totalHours 310

  it('computes required revenue and blended rate to hit an arbitrary target margin', () => {
    const modeler = computeMarginModeler(totals, 45);
    expect(modeler.hasBasis).toBe(true);
    // cost / (1 - 45%) = 35,900 / 0.55
    expect(modeler.requiredRevenue).toBeCloseTo(65272.72727272727, 6);
    expect(modeler.requiredBlendedRate).toBeCloseTo(65272.72727272727 / 310, 6);
  });

  it('flags a premium (negative diff) when the target exceeds current baseline margin', () => {
    const modeler = computeMarginModeler(totals, 45); // baseline margin is ~37.2%, target is 45%
    expect(modeler.diff).toBeCloseTo(57200 - 65272.72727272727, 6);
    expect(modeler.diff).toBeLessThan(0);
    expect(modeler.diffPct).toBeCloseTo(-14.113159567705008, 6);
  });

  it('flags discount headroom (positive diff) when the target is below current baseline margin', () => {
    const modeler = computeMarginModeler(totals, 20);
    expect(modeler.diff).toBeGreaterThan(0);
  });

  it('reports hasBasis: false with no hours sized, and zeroes every other field', () => {
    const zero = computeTotalsFor({ estimationMode: 'matrix', commercialModel: 'ff', contingencyPct: 10, effortCells: [] }, roles);
    const modeler = computeMarginModeler(zero, 40);
    expect(modeler).toEqual({ hasBasis: false, requiredRevenue: 0, requiredBlendedRate: 0, diff: 0, diffPct: 0 });
  });

  it('clamps the target margin to [0, 99]', () => {
    const clamped = computeMarginModeler(totals, 150);
    const at99 = computeMarginModeler(totals, 99);
    expect(clamped.requiredRevenue).toBeCloseTo(at99.requiredRevenue, 6);
    const clampedLow = computeMarginModeler(totals, -20);
    const at0 = computeMarginModeler(totals, 0);
    expect(clampedLow.requiredRevenue).toBeCloseTo(at0.requiredRevenue, 6);
  });
});

describe('seniorityWeightsForPhase', () => {
  // 3 roles sorted desc by bill rate, as suggestMatrixForProject always sorts them first.
  const sorted = [...roles].sort((a, b) => Number(b.billRate) - Number(a.billRate));

  it('skews senior (front-loaded) for initiate/design', () => {
    const weights = seniorityWeightsForPhase('design', sorted);
    expect(weights[0]).toBeGreaterThan(weights[1]!);
    expect(weights[1]).toBeGreaterThan(weights[2]!);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // raw = [1.3, 0.85, 0.4] / 2.55
    expect(weights[0]).toBeCloseTo(1.3 / 2.55, 10);
    expect(weights[1]).toBeCloseTo(0.85 / 2.55, 10);
    expect(weights[2]).toBeCloseTo(0.4 / 2.55, 10);
  });

  it('skews junior (execution-heavy) for build/test — the mirror image of design', () => {
    const weights = seniorityWeightsForPhase('build', sorted);
    expect(weights[0]).toBeLessThan(weights[1]!);
    expect(weights[1]).toBeLessThan(weights[2]!);
    expect(weights[0]).toBeCloseTo(0.4 / 2.55, 10);
    expect(weights[2]).toBeCloseTo(1.3 / 2.55, 10);
  });

  it('splits deploy/sustain evenly across the roster', () => {
    const weights = seniorityWeightsForPhase('deploy', sorted);
    weights.forEach((w) => expect(w).toBeCloseTo(1 / 3, 10));
  });

  it('assigns 100% weight to a single-role roster regardless of phase', () => {
    const weights = seniorityWeightsForPhase('build', [sorted[0]!]);
    expect(weights).toEqual([1]);
  });
});

describe('suggestMatrixForProject', () => {
  it('distributes a single included workstream across the roster, seniority-weighted per phase', () => {
    // WORKSTREAM_PHASE_HOURS.arch = { initiate:32, design:80, build:36, test:8, deploy:8, sustain:4 }, complexity 'medium' => x1
    const matrix = suggestMatrixForProject([{ key: 'arch', included: true, complexity: 'medium' }], roles);

    // initiate (front-loaded, 32h): round(32 * [0.5098, 0.3333, 0.1569]) = [16, 11, 5], sums exactly to 32
    expect(matrix.initiate).toEqual({ 'r-arch': 16, 'r-pm': 11, 'r-an': 5 });

    // design (front-loaded, 80h): round(80 * same weights) = [41, 27, 13] — sums to 81, 1 over
    // baseline due to two sequential Math.round calls (phase total, then each share) — expected, not a bug.
    expect(matrix.design).toEqual({ 'r-arch': 41, 'r-pm': 27, 'r-an': 13 });

    // build (execution-heavy, 36h): round(36 * [0.1569, 0.3333, 0.5098]) = [6, 12, 18], sums exactly to 36
    expect(matrix.build).toEqual({ 'r-arch': 6, 'r-pm': 12, 'r-an': 18 });

    // test (execution-heavy, 8h): round(8 * same weights) = [1, 3, 4], sums exactly to 8
    expect(matrix.test).toEqual({ 'r-arch': 1, 'r-pm': 3, 'r-an': 4 });

    // deploy (flat 1/3 split, 8h): round(8/3) = 3 for every role -> sums to 9, 1 over baseline
    expect(matrix.deploy).toEqual({ 'r-arch': 3, 'r-pm': 3, 'r-an': 3 });

    // sustain (flat 1/3 split, 4h): round(4/3) = 1 for every role -> sums to 3, 1 under baseline
    expect(matrix.sustain).toEqual({ 'r-arch': 1, 'r-pm': 1, 'r-an': 1 });
  });

  it('contributes nothing for an excluded scope item', () => {
    const matrix = suggestMatrixForProject([{ key: 'arch', included: false, complexity: 'medium' }], roles);
    Object.values(matrix).forEach((phaseRow) => {
      Object.values(phaseRow).forEach((hours) => expect(hours).toBe(0));
    });
  });

  it('skips a scope item with an unknown workstream key rather than throwing', () => {
    const matrix = suggestMatrixForProject([{ key: 'not-a-real-workstream', included: true, complexity: 'medium' }], roles);
    Object.values(matrix).forEach((phaseRow) => {
      Object.values(phaseRow).forEach((hours) => expect(hours).toBe(0));
    });
  });

  it('scales hours by the complexity multiplier (high = 1.5x)', () => {
    const matrix = suggestMatrixForProject([{ key: 'arch', included: true, complexity: 'high' }], roles);
    // initiate: round(32 * 1.5) = 48h, split [round(48*0.5098)=24, round(48*0.3333)=16, round(48*0.1569)=8]
    expect(matrix.initiate).toEqual({ 'r-arch': 24, 'r-pm': 16, 'r-an': 8 });
  });

  it('returns an all-zero, fully-keyed matrix for an empty roster', () => {
    const matrix = suggestMatrixForProject([{ key: 'arch', included: true, complexity: 'medium' }], []);
    expect(Object.keys(matrix)).toEqual(['initiate', 'design', 'build', 'test', 'deploy', 'sustain']);
    Object.values(matrix).forEach((phaseRow) => expect(phaseRow).toEqual({}));
  });
});

// ======================================================== audit.ts

describe('computeAuditProgress', () => {
  it('weights yes=1.0, partial=0.5, no=0, and excludes N/A from the denominator', () => {
    const entries: AuditEntryInput[] = [
      { controlKey: 'CTRL_01', status: 'yes' },
      { controlKey: 'CTRL_02', status: 'yes' },
      { controlKey: 'CTRL_03', status: 'partial' },
      { controlKey: 'CTRL_04', status: 'partial' },
      { controlKey: 'CTRL_05', status: 'no' },
      { controlKey: 'CTRL_06', status: 'na' },
      { controlKey: 'CTRL_07', status: 'na' },
      // CTRL_08-10 have no logged entry -> default to 'no'
    ];
    const progress = computeAuditProgress(entries);
    expect(progress.counts).toEqual({ yes: 2, partial: 2, no: 4, na: 2 });
    expect(progress.applicable).toBe(8); // 10 - 2 N/A
    expect(progress.score).toBe(3); // 2*1.0 + 2*0.5
    expect(progress.pct).toBe(38); // round(3/8 * 100) = 37.5 -> 38
  });

  it('treats a missing entry for a control as "no"', () => {
    const progress = computeAuditProgress([{ controlKey: 'CTRL_01', status: 'yes' }]);
    expect(progress.counts.no).toBe(9);
    expect(progress.pct).toBe(10); // 1/10 * 100
  });

  it('returns 100% when every control is N/A (nothing applicable to fail)', () => {
    const progress = computeAuditProgress(auditAllStatus('na'));
    expect(progress.applicable).toBe(0);
    expect(progress.pct).toBe(100);
  });

  it('returns 100% when every control is fully evidenced', () => {
    const progress = computeAuditProgress(auditAllStatus('yes'));
    expect(progress.pct).toBe(100);
  });

  it('returns 0% when every control is unmet', () => {
    const progress = computeAuditProgress(auditAllStatus('no'));
    expect(progress.pct).toBe(0);
  });
});

describe('computeProjectHealth', () => {
  it('is Green only when locked AND compliance >= 80%', () => {
    expect(computeProjectHealth({ locked: true, auditEntries: audit80Pct }).code).toBe('G');
    expect(computeProjectHealth({ locked: true, auditEntries: auditAllStatus('yes') }).code).toBe('G');
  });

  it('is Yellow when locked but under 80% compliance', () => {
    expect(computeProjectHealth({ locked: true, auditEntries: audit50Pct }).code).toBe('Y');
  });

  it('is Yellow when unlocked but compliance >= 50%', () => {
    expect(computeProjectHealth({ locked: false, auditEntries: audit50Pct }).code).toBe('Y');
    expect(computeProjectHealth({ locked: false, auditEntries: audit80Pct }).code).toBe('Y');
  });

  it('is Red when unlocked and compliance is under 50%', () => {
    expect(computeProjectHealth({ locked: false, auditEntries: audit40Pct }).code).toBe('R');
  });

  it('is Red for a brand-new project (unlocked, nothing audited yet)', () => {
    expect(computeProjectHealth({ locked: false, auditEntries: [] }).code).toBe('R');
  });
});

// ======================================================== financials.ts

describe('computeEacSummary — matrix mode', () => {
  const actuals: FinancialActualInput[] = [
    { roleKey: 'r-arch', hours: 42, cost: 7200, forecastHours: 0, openRRHours: 0 },
    { roleKey: 'r-pm', hours: 130, cost: 16000, forecastHours: null, openRRHours: 20 },
    // r-an: no actuals row at all -> forecastHours defaults to its baseline (150h)
  ];
  const eac = computeEacSummary(matrixProject, roles, actuals);

  it('computes True EAC Cost per role: actual cost + forecast*costRate + openRR*costRate', () => {
    const arch = eac.rows.find((r) => r.id === 'r-arch')!;
    expect(arch.eacCost).toBe(7200); // forecastHours explicitly 0, openRR 0 -> no additions

    const pm = eac.rows.find((r) => r.id === 'r-pm')!;
    // forecastHours null -> defaults to baseline (120h): 16,000 + 120*130 + 20*130 = 16,000 + 15,600 + 2,600
    expect(pm.forecastHours).toBe(120);
    expect(pm.eacCost).toBe(34200);

    const analyst = eac.rows.find((r) => r.id === 'r-an')!;
    // no actuals row at all -> actualHours/Cost 0, forecastHours defaults to baseline (150h)
    expect(analyst.forecastHours).toBe(150);
    expect(analyst.eacCost).toBe(13500); // 150 * $90
  });

  it('respects an explicit forecastHours of 0 rather than defaulting to baseline', () => {
    const arch = eac.rows.find((r) => r.id === 'r-arch')!;
    expect(arch.forecastHours).toBe(0);
  });

  it('sums to a total EAC cost and derives EAC margin % against baseline revenue', () => {
    expect(eac.totalEacCost).toBe(54900); // 7,200 + 34,200 + 13,500
    // (57,200 - 54,900) / 57,200 * 100
    expect(eac.eacMarginPct).toBeCloseTo(4.020979020979021, 10);
  });

  it('computes drift as baseline margin minus EAC margin, in points', () => {
    expect(eac.drift).toBeCloseTo(eac.totals.marginPct - eac.eacMarginPct, 10);
    expect(eac.drift).toBeCloseTo(33.21678321678322, 6);
  });

  it('classifies a >0.05pt drift as erosion', () => {
    expect(eac.status).toBe('erosion');
  });

  it('classifies a <-0.05pt drift as upside', () => {
    // Forecast running well under baseline hours drops EAC cost below the
    // baseline cost, so the true EAC margin is *higher* than the sold margin.
    const cheapActuals: FinancialActualInput[] = [
      { roleKey: 'r-arch', hours: 10, cost: 1700, forecastHours: 10, openRRHours: 0 },
      { roleKey: 'r-pm', hours: 30, cost: 3900, forecastHours: 30, openRRHours: 0 },
      { roleKey: 'r-an', hours: 40, cost: 3600, forecastHours: 40, openRRHours: 0 },
    ];
    const cheapEac = computeEacSummary(matrixProject, roles, cheapActuals);
    expect(cheapEac.drift).toBeLessThan(-0.05);
    expect(cheapEac.status).toBe('upside');
  });

  it('classifies a drift within +/-0.05pt as on-baseline', () => {
    const noActualsYet = computeEacSummary(matrixProject, roles, []);
    // With no actuals logged, every role's forecast defaults to its own
    // baseline hours at its own cost rate, so EAC cost == baseline cost.
    expect(noActualsYet.totalEacCost).toBeCloseTo(matrixProject.effortCells.reduce((sum, c) => {
      const role = roles.find((r) => r.id === c.roleId)!;
      return sum + c.hours * Number(role.costRate);
    }, 0), 6);
    expect(noActualsYet.status).toBe('on-baseline');
    expect(noActualsYet.drift).toBeCloseTo(0, 6);
  });
});

describe('computeEacSummary — direct mode', () => {
  it('uses a single blended row at the implied blended cost rate', () => {
    const eac = computeEacSummary(directTmProject, roles, [
      { roleKey: '_direct', hours: 300, cost: 55000, forecastHours: 250, openRRHours: 10 },
    ]);
    expect(eac.rows).toHaveLength(1);
    const row = eac.rows[0]!;
    expect(row.id).toBe('_direct');
    expect(row.costRate).toBe(140); // cost 70,000 / totalHours 500
    // 55,000 + 250*140 + 10*140 = 55,000 + 35,000 + 1,400
    expect(row.eacCost).toBe(91400);
    expect(eac.totalEacCost).toBe(91400);
    expect(eac.eacMarginPct).toBeCloseTo(8.6, 10); // (100,000 - 91,400) / 100,000 * 100
  });

  it('defaults forecastHours to the project total sold hours when not provided', () => {
    const eac = computeEacSummary(directTmProject, roles, []);
    expect(eac.rows[0]!.forecastHours).toBe(500);
  });
});

// ======================================================== schedule.ts

describe('computePhaseSlipDays', () => {
  it('returns null with an unknown severity when either date is missing', () => {
    expect(computePhaseSlipDays('2026-01-10', null)).toEqual({ slipDays: null, severity: 'unknown' });
    expect(computePhaseSlipDays(null, '2026-01-10')).toEqual({ slipDays: null, severity: 'unknown' });
  });

  it('is exact calendar days between planned end and actual end', () => {
    expect(computePhaseSlipDays('2026-01-01', '2026-01-11')).toEqual({ slipDays: 10, severity: 'warning' });
  });

  it('treats an on-time or early finish as onTrack (slip <= 0)', () => {
    expect(computePhaseSlipDays('2026-01-01', '2026-01-01')).toEqual({ slipDays: 0, severity: 'onTrack' });
    expect(computePhaseSlipDays('2026-01-10', '2026-01-07')).toEqual({ slipDays: -3, severity: 'onTrack' });
  });

  it('classifies against warn/crit tolerances (defaults: 5d warn, 15d crit)', () => {
    expect(computePhaseSlipDays('2026-01-01', '2026-01-08').severity).toBe('warning'); // 7d
    expect(computePhaseSlipDays('2026-01-01', '2026-01-21').severity).toBe('critical'); // 20d
    expect(computePhaseSlipDays('2026-01-01', '2026-01-03').severity).toBe('slip'); // 2d, under warn
  });

  it('accepts custom org-policy tolerances', () => {
    // 7 days is >= the default 5d warn threshold, but under a custom 10d one.
    const result = computePhaseSlipDays('2026-01-01', '2026-01-08', { warnDays: 10, critDays: 20 });
    expect(result).toEqual({ slipDays: 7, severity: 'slip' });
  });
});

describe('computePhasePace', () => {
  it('flags Critical Pace Risk past 75% elapsed with under 50% complete', () => {
    const result = computePhasePace('2026-01-01', '2026-01-11', 30, { now: new Date('2026-01-09') }); // 80% elapsed
    expect(result).toEqual({ state: 'critical', elapsedPct: 80 });
  });

  it('flags Pace Warning past 50% elapsed with under 25% complete', () => {
    const result = computePhasePace('2026-01-01', '2026-01-11', 20, { now: new Date('2026-01-07') }); // 60% elapsed
    expect(result).toEqual({ state: 'warning', elapsedPct: 60 });
  });

  it('is onPace when work keeps up with elapsed time', () => {
    const result = computePhasePace('2026-01-01', '2026-01-11', 60, { now: new Date('2026-01-07') }); // 60% elapsed, 60% done
    expect(result).toEqual({ state: 'onPace', elapsedPct: 60 });
  });

  it('short-circuits to complete regardless of elapsed time', () => {
    const result = computePhasePace('2026-01-01', '2026-01-11', 10, { status: 'complete', now: new Date('2026-01-09') });
    expect(result).toEqual({ state: 'complete', elapsedPct: null });
  });

  it('is notStarted before the planned window begins', () => {
    const result = computePhasePace('2026-01-01', '2026-01-11', 0, { now: new Date('2025-12-30') });
    expect(result.state).toBe('notStarted');
    expect(result.elapsedPct).toBeLessThan(0);
  });

  it('returns unknown when dates are missing or the window is inverted', () => {
    expect(computePhasePace(null, '2026-01-11', 0)).toEqual({ state: 'unknown', elapsedPct: null });
    expect(computePhasePace('2026-01-11', '2026-01-01', 0)).toEqual({ state: 'unknown', elapsedPct: null });
  });
});

describe('computeScheduleSummary', () => {
  const scheduleProject = {
    phases: [
      { phaseKey: 'initiate', plannedStart: '2025-12-01', plannedEnd: '2025-12-10', actualStart: '2025-12-01', actualEnd: '2025-12-10', pctComplete: 100, status: 'complete' },
      { phaseKey: 'design', plannedStart: '2025-12-10', plannedEnd: '2025-12-25', actualStart: '2025-12-10', actualEnd: null, pctComplete: 20, status: 'inprogress' },
      { phaseKey: 'build', plannedStart: '2026-01-01', plannedEnd: '2026-02-01', actualStart: null, actualEnd: null, pctComplete: 0, status: 'notstarted' },
    ],
  };

  it('rolls up worst slip and pace risk across all phases as of a given moment', () => {
    // "Now" = Dec 23: initiate finished on time (0 slip); design is 13/15
    // days (~86.7%) through its window with only 20% complete -> pace-critical;
    // build hasn't started yet.
    const summary = computeScheduleSummary(scheduleProject, { warnDays: 5, critDays: 15 }, new Date('2025-12-23'));
    expect(summary).toEqual({
      worst: 'onTrack',
      worstSlipDays: 0,
      criticalCount: 0,
      warningCount: 0,
      worstPace: 'critical',
      paceCriticalCount: 1,
      paceWarningCount: 0,
    });
  });

  it('surfaces a critical end-date slip once a phase actually finishes late', () => {
    const late = {
      phases: [
        { phaseKey: 'initiate', plannedStart: '2025-12-01', plannedEnd: '2025-12-10', actualStart: '2025-12-01', actualEnd: '2025-12-30', pctComplete: 100, status: 'complete' },
      ],
    };
    const summary = computeScheduleSummary(late, { warnDays: 5, critDays: 15 });
    expect(summary.worst).toBe('critical');
    expect(summary.criticalCount).toBe(1);
    expect(summary.worstSlipDays).toBe(20);
  });

  it('skips phases absent from the input without throwing', () => {
    const summary = computeScheduleSummary({ phases: [] });
    expect(summary).toEqual({
      worst: 'onTrack',
      worstSlipDays: 0,
      criticalCount: 0,
      warningCount: 0,
      worstPace: 'onTrack',
      paceCriticalCount: 0,
      paceWarningCount: 0,
    });
  });
});

// ======================================================== portfolio.ts

describe('computePortfolioSummary', () => {
  const parentContainer: SizingProjectInput = { estimationMode: 'matrix', commercialModel: 'ff', contingencyPct: 0, effortCells: [] };

  const projects = [
    { id: 'p1', hierarchyLevel: 'standalone' as const, locked: true, sizing: matrixProject, auditEntries: auditAllStatus('na') },
    { id: 'p2', hierarchyLevel: 'standalone' as const, locked: false, sizing: directTmProject, auditEntries: audit40Pct },
    { id: 'parent1', hierarchyLevel: 'parent' as const, locked: false, sizing: parentContainer, auditEntries: [] },
  ];

  const summary = computePortfolioSummary(projects, roles);

  it('sums contract value across every project, including parent containers', () => {
    expect(summary.totalValue).toBe(162920); // 62,920 + 100,000 + 0
  });

  it('averages margin only across projects with sized hours', () => {
    // p1: 37.238%, p2: 30% — parent container has 0 hours and is excluded
    expect(summary.hasMargin).toBe(true);
    expect(summary.avgMarginPct).toBeCloseTo((37.23776223776224 + 30) / 2, 6);
  });

  it('excludes Parent Program containers from compliance averaging', () => {
    // p1 audit is all-N/A -> 100%; p2 is 40% -> avg 70%, parent1 excluded entirely
    expect(summary.avgCompliancePct).toBe(70);
  });

  it('excludes Parent Program containers from the high-risk count', () => {
    // p1: locked + 100% compliant -> Green. p2: unlocked + 40% -> Red. parent1 excluded regardless of health.
    expect(summary.highRiskCount).toBe(1);
  });

  it('counts every project (including parents) in projectCount', () => {
    expect(summary.projectCount).toBe(3);
  });

  it('reports hasMargin: false and avgMarginPct: 0 when nothing has sized hours', () => {
    const summary2 = computePortfolioSummary(
      [{ id: 'p3', hierarchyLevel: 'standalone', locked: false, sizing: parentContainer, auditEntries: [] }],
      roles
    );
    expect(summary2.hasMargin).toBe(false);
    expect(summary2.avgMarginPct).toBe(0);
  });

  it('returns all zeros for an empty portfolio', () => {
    const empty = computePortfolioSummary([], roles);
    expect(empty).toEqual({ totalValue: 0, avgMarginPct: 0, hasMargin: false, avgCompliancePct: 0, highRiskCount: 0, projectCount: 0 });
  });
});

describe('computeProgramRollup', () => {
  const child1 = {
    id: 'c1',
    locked: true,
    sizing: matrixProject,
    auditEntries: auditAllStatus('na'),
    financialActuals: [
      { roleKey: 'r-arch', hours: 42, cost: 7200, forecastHours: 0, openRRHours: 0 },
      { roleKey: 'r-pm', hours: 130, cost: 16000, forecastHours: null, openRRHours: 20 },
    ] as FinancialActualInput[],
  };
  const child2 = {
    id: 'c2',
    locked: false,
    sizing: directTmProject,
    auditEntries: audit40Pct,
    financialActuals: [] as FinancialActualInput[],
  };

  it('aggregates contract value, revenue, EAC cost, and open RR hours across children', () => {
    const rollup = computeProgramRollup({ id: 'parent1' }, [child1, child2], roles);
    expect(rollup.parentId).toBe('parent1');
    expect(rollup.childCount).toBe(2);
    expect(rollup.totalContractValue).toBe(162920); // 62,920 + 100,000
    expect(rollup.totalRevenue).toBe(157200); // 57,200 + 100,000
    // child1 EAC 54,900 (per computeEacSummary matrix-mode test) + child2 EAC
    // 70,000 (no actuals -> forecast defaults to baseline hours * blended cost rate)
    expect(rollup.totalEacCost).toBe(124900);
    expect(rollup.totalOpenRRHours).toBe(20);
  });

  it('computes a revenue-weighted blended EAC margin %', () => {
    const rollup = computeProgramRollup({ id: 'parent1' }, [child1, child2], roles);
    // (157,200 - 124,900) / 157,200 * 100
    expect(rollup.blendedEacMarginPct).toBeCloseTo(20.5470737913486, 6);
  });

  it('reports the worst (highest-risk) health among children, never the best', () => {
    // child1: locked + 100% compliant -> Green. child2: unlocked + 40% -> Red.
    const rollup = computeProgramRollup({ id: 'parent1' }, [child1, child2], roles);
    expect(rollup.health).toBe('R');
  });

  it('reports health "NA" and all-zero totals for a program with no waves yet', () => {
    const rollup = computeProgramRollup({ id: 'parent1' }, [], roles);
    expect(rollup).toEqual({
      parentId: 'parent1',
      childCount: 0,
      totalContractValue: 0,
      totalRevenue: 0,
      totalEacCost: 0,
      blendedEacMarginPct: 0,
      totalOpenRRHours: 0,
      health: 'NA',
    });
  });
});
