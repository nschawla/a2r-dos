/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * Module 4 — Financial Realization (EAC Engine). Ported from the
 * prototype's `financialRows` + `computeEacSummary`.
 */
import { numOr } from './_internal';
import { d, money, rate, roundMoney, sumMoney } from './money';
import { computeTotalsFor, type SizingTotals } from './sizing';
import type { EmploymentType, FinancialActualInput, RateRole, SizingProjectInput } from './types';

export interface EacRow {
  id: string;
  label: string;
  costRate: number;
  baselineHours: number;
  actualHours: number;
  actualCost: number;
  forecastHours: number;
  openRRHours: number;
  eacCost: number;
  /** WP6 — undefined for the direct-mode '_direct' blended row, which has
   * no single rate-card role to attribute an employment type to. */
  employmentType?: EmploymentType;
}

export type EacStatus = 'erosion' | 'upside' | 'on-baseline';

export interface EacSummary {
  totals: SizingTotals;
  rows: EacRow[];
  totalActualHours: number;
  totalActualCost: number;
  totalForecastHours: number;
  totalOpenRRHours: number;
  totalEacCost: number;
  /** (revenue - totalEacCost) / revenue * 100 — 0 when revenue is 0. */
  eacMarginPct: number;
  /** totals.marginPct - eacMarginPct, in points. Positive = margin eroded; negative = upside. */
  drift: number;
  status: EacStatus;
}

/** drift > 0.05pt = erosion, drift < -0.05pt = upside, otherwise on baseline. Matches the prototype's varianceLabel threshold exactly. */
function classifyDrift(drift: number): EacStatus {
  if (drift > 0.05) return 'erosion';
  if (drift < -0.05) return 'upside';
  return 'on-baseline';
}

/**
 * True EAC Cost = Actual Cost to Date
 *              + (Assigned Forecast Hours × Cost Rate)
 *              + (Open Resource Request Hours × Baseline Cost Rate)
 *
 * Direct-mode projects get a single blended row ('_direct') using
 * totals.cost / totals.totalHours as an implied blended cost rate. Matrix
 * mode gets one row per rate-card role, whether or not actuals have been
 * logged for it yet (baseline hours still show, everything else zeroes).
 *
 * A role's forecastHours defaults to its baseline sold hours when not
 * provided (or explicitly null) — an un-forecast role is assumed to still
 * land on its original sizing, not on zero.
 */
export function computeEacSummary(
  project: SizingProjectInput,
  roles: RateRole[],
  actuals: FinancialActualInput[]
): EacSummary {
  const totals = computeTotalsFor(project, roles);
  const actualByKey = new Map(actuals.map((a) => [a.roleKey, a]));

  // Per row, `eacCost` is accumulated exactly (decimal.js) and rounded to
  // cents; `actualCostD` is kept as a Decimal for the exact-sum totals below.
  type RowWithDecimals = EacRow & { _actualCostD: import('./money').Decimal; _eacCostD: import('./money').Decimal };
  let rows: RowWithDecimals[];
  if (project.estimationMode === 'direct') {
    const blendedCostRateD = totals.totalHours > 0 ? d(totals.cost).div(totals.totalHours) : d(0);
    const a = actualByKey.get('_direct');
    const actualHours = numOr(a?.hours, 0);
    const actualCostD = d(a?.cost);
    const forecastHours = numOr(a?.forecastHours, totals.totalHours);
    const openRRHours = numOr(a?.openRRHours, 0);
    const eacCostD = roundMoney(
      actualCostD.plus(d(forecastHours).times(blendedCostRateD)).plus(d(openRRHours).times(blendedCostRateD)),
    );
    rows = [
      {
        id: '_direct',
        label: 'All Roles (Blended)',
        costRate: rate(blendedCostRateD),
        baselineHours: totals.totalHours,
        actualHours,
        actualCost: money(actualCostD),
        forecastHours,
        openRRHours,
        eacCost: eacCostD.toNumber(),
        _actualCostD: actualCostD,
        _eacCostD: eacCostD,
      },
    ];
  } else {
    rows = roles.map((r) => {
      const a = actualByKey.get(r.id);
      const baseline = totals.roleTotals[r.id] ?? 0;
      const actualHours = numOr(a?.hours, 0);
      const actualCostD = d(a?.cost);
      const forecastHours = numOr(a?.forecastHours, baseline);
      const openRRHours = numOr(a?.openRRHours, 0);
      const costRateD = d(r.costRate);
      const eacCostD = roundMoney(
        actualCostD.plus(d(forecastHours).times(costRateD)).plus(d(openRRHours).times(costRateD)),
      );
      return {
        id: r.id,
        label: r.name,
        costRate: rate(costRateD),
        baselineHours: baseline,
        actualHours,
        actualCost: money(actualCostD),
        forecastHours,
        openRRHours,
        eacCost: eacCostD.toNumber(),
        employmentType: r.employmentType ?? 'fte',
        _actualCostD: actualCostD,
        _eacCostD: eacCostD,
      };
    });
  }

  let totalActualHours = 0;
  let totalForecastHours = 0;
  let totalOpenRRHours = 0;
  for (const r of rows) {
    totalActualHours += r.actualHours;
    totalForecastHours += r.forecastHours;
    totalOpenRRHours += r.openRRHours;
  }
  const totalActualCostD = sumMoney(rows.map((r) => r._actualCostD));
  const totalEacCostD = sumMoney(rows.map((r) => r._eacCostD));
  const totalActualCost = money(totalActualCostD);
  const totalEacCost = money(totalEacCostD);

  const revD = d(totals.revenue);
  const eacMarginPct = revD.gt(0) ? revD.minus(totalEacCostD).div(revD).times(100).toNumber() : 0;
  const drift = totals.marginPct - eacMarginPct;

  return {
    totals,
    // drop the internal Decimal carriers — the public shape is EacRow
    rows: rows.map(({ _actualCostD, _eacCostD, ...r }) => r),
    totalActualHours,
    totalActualCost,
    totalForecastHours,
    totalOpenRRHours,
    totalEacCost,
    eacMarginPct,
    drift,
    status: classifyDrift(drift),
  };
}

export interface ContractorExposure {
  /** False for direct-mode projects — the single '_direct' blended row has
   * no per-role employment type to attribute cost/hours to, so exposure
   * isn't computable there. The KPI card hides itself when this is false. */
  applicable: boolean;
  contractorEacCost: number;
  totalEacCost: number;
  /** 0-100. 0 when totalEacCost is 0 or exposure isn't applicable. */
  contractorPct: number;
  contractorHours: number;
  totalHours: number;
}

/**
 * WP6 — "Contractor / 3rd-Party Cost Exposure": what share of a project's
 * True EAC Cost sits on rate-card roles tagged Contractor/Vendor rather
 * than Employee (FTE). Hours/cost are summed across each role's actual +
 * forecast + open-RR basis — the same basis `computeEacSummary` uses for
 * its own totals — so this always reconciles against the EAC KPI cards
 * above it rather than presenting a second, disagreeing total.
 */
export function computeContractorExposure(eac: EacSummary): ContractorExposure {
  const applicable = eac.rows.length > 0 && eac.rows[0]?.id !== '_direct';

  let contractorEacCostD = d(0);
  let contractorHours = 0;
  if (applicable) {
    for (const r of eac.rows) {
      if (r.employmentType === 'contractor') {
        contractorEacCostD = contractorEacCostD.plus(d(r.eacCost));
        contractorHours += r.actualHours + r.forecastHours + r.openRRHours;
      }
    }
  }
  const contractorEacCost = money(contractorEacCostD);

  const totalHours = eac.totalActualHours + eac.totalForecastHours + eac.totalOpenRRHours;
  const contractorPct =
    applicable && eac.totalEacCost > 0
      ? contractorEacCostD.div(eac.totalEacCost).times(100).toNumber()
      : 0;

  return { applicable, contractorEacCost, totalEacCost: eac.totalEacCost, contractorPct, contractorHours, totalHours };
}
