/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Commercial Baseline Cockpit Executive Triage & Thematic Clustering
 * (docs/COMMERCIAL_BASELINE_TRIAGE.md) — the fifth application of the
 * dual-tile macro-first pattern shipped for RAID, Financial Realization,
 * Schedule, and Resource & Capacity: a portfolio-wide contract/baseline
 * rollup, plus a thematic grouping of the at-risk subset by likely
 * commercial root cause.
 *
 * Pure — no Prisma, no React, no network call. Deliberately NOT a live LLM
 * classification, same reasoning as the other four.
 *
 * Two requested things this module does NOT implement as literally
 * specified, because PS-DOS has no real data behind them — see
 * docs/COMMERCIAL_BASELINE_TRIAGE.md §2 for the full reasoning:
 *
 *  - "Milestone-based" as a third Commercial Model — the schema's
 *    CommercialModel enum is only FF (Fixed Fee) / TM (Time & Materials).
 *    Tile 1 shows the real 2-way split.
 *  - "Unsigned Change Orders" — there is no e-signature or contract-
 *    amendment-approval tracking anywhere in the schema. The real,
 *    closest signal PS-DOS actually has is a PortfolioIntervention row
 *    with optionKey 'change_order' — a governed, executed decision that a
 *    change order is the response to this engagement's flagged driver
 *    (src/lib/decision-options.ts). That's real, already-computed change-
 *    order ACTIVITY, not a "signed vs. unsigned" status this app doesn't
 *    track — the theme below is named and scoped accordingly.
 *  - "Contract Status: Fully Executed / Pending Change Order / Under
 *    Review" — the real, closest signal is Project.locked (baseline
 *    finalized) vs. not. Tile 1 shows that real 2-state split, honestly
 *    labeled, not the three fabricated contract-status labels.
 */
export type CommercialModel = 'FF' | 'TM';
export type Rag = 'Red' | 'Amber';

export type CommercialTheme =
  | 'CHANGE_ORDER_EXPOSURE'
  | 'MARGIN_SQUEEZE_FIXED_FEE'
  | 'BLENDED_RATE_EROSION'
  | 'EXCEEDED_BASELINE_SCOPE_CAP'
  | 'OTHER';

export const COMMERCIAL_THEME_ORDER: CommercialTheme[] = [
  'CHANGE_ORDER_EXPOSURE',
  'MARGIN_SQUEEZE_FIXED_FEE',
  'BLENDED_RATE_EROSION',
  'EXCEEDED_BASELINE_SCOPE_CAP',
  'OTHER',
];

export const COMMERCIAL_THEME_LABEL: Record<CommercialTheme, string> = {
  CHANGE_ORDER_EXPOSURE: 'Change Order Exposure',
  MARGIN_SQUEEZE_FIXED_FEE: 'Margin Squeeze on Fixed-Fee Deliverables',
  BLENDED_RATE_EROSION: 'Blended Rate Erosion',
  EXCEEDED_BASELINE_SCOPE_CAP: 'Exceeded Baseline Scope Caps',
  OTHER: 'Other',
};

export const COMMERCIAL_THEME_BLURB: Record<CommercialTheme, string> = {
  CHANGE_ORDER_EXPOSURE: 'A governed Change Order has been executed on this engagement — real contractual amendment activity on file.',
  MARGIN_SQUEEZE_FIXED_FEE: 'Fixed-Fee revenue is locked; cost overrun eats margin directly, with no re-billing recourse.',
  BLENDED_RATE_EROSION: 'T&M revenue scales with hours — margin erosion here usually reads as resource-mix / rate-card drift, not scope.',
  EXCEEDED_BASELINE_SCOPE_CAP: 'Unplanned or expanding scope has pushed past the sold baseline.',
  OTHER: "At risk, but doesn't match a known pattern — review the commercial baseline directly.",
};

export interface CommercialTriageProjectInput {
  id: string;
  name: string;
  /** Budget at Completion — the "contracted value" figure, same
   * denormalized snapshot Financial Realization's Tile 1 reads (avoids
   * re-running the Decimal-heavy sizing/EAC engine across the whole
   * scoped portfolio on every page load). */
  bac: number;
  actualsCost: number;
  /** 'Green' | 'Amber' | 'Red'. */
  healthCost: string;
  /** 'Green' | 'Amber' | 'Red'. */
  healthScope: string;
  commercialModel: CommercialModel;
  /** Baseline finalized (true) vs. still in draft/under review (false) —
   * the real, closest signal to "contract status" this schema tracks. */
  locked: boolean;
  /** True when a PortfolioIntervention with optionKey 'change_order'
   * exists for this project — real, already-executed change-order
   * activity, never inferred. */
  hasChangeOrderActivity: boolean;
  updatedAt: string;
}

export interface CommercialTriageItem extends CommercialTriageProjectInput {
  theme: CommercialTheme;
  rag: Rag;
  /** actualsCost - bac. Positive = over the contracted baseline. */
  varianceUsd: number;
}

export interface CommercialThemeCluster {
  theme: CommercialTheme;
  label: string;
  blurb: string;
  projectCount: number;
  redCount: number;
  amberCount: number;
  totalVarianceUsd: number;
  items: CommercialTriageItem[];
}

export interface CommercialTriageResult {
  projectCount: number;
  totalContractedValue: number;
  /** Locked (baseline finalized) vs. not — the real 2-state "contract
   * status" split; see the file header. */
  lockedCount: number;
  draftCount: number;
  byCommercialModel: Record<CommercialModel, { count: number; bac: number }>;
  redCount: number;
  amberCount: number;
  clusters: CommercialThemeCluster[];
}

/** Red healthCost is always Red. Amber is anything else genuinely worth a
 * look: Amber healthCost, a scope-cap breach, or real change-order
 * activity on file — none of those alone is as acute as a Red margin
 * read, but each is a legitimate reason a commercial reviewer would open
 * the project. Green on every count is the only way to reach Green. */
export function commercialRagFor(input: Pick<CommercialTriageProjectInput, 'healthCost' | 'healthScope' | 'hasChangeOrderActivity'>): Rag | null {
  if (input.healthCost === 'Red') return 'Red';
  if (input.healthCost === 'Amber' || input.healthScope === 'Red' || input.hasChangeOrderActivity) return 'Amber';
  return null;
}

/**
 * Fixed-priority decision list, evaluated top to bottom:
 *
 *  1. Change Order Exposure — a governed Change Order is already on file
 *     for this engagement (the most concrete, already-logged evidence).
 *  2. Margin Squeeze on Fixed-Fee Deliverables — Fixed Fee, and
 *     healthCost isn't Green (no re-billing recourse on FF, so any
 *     erosion IS a squeeze).
 *  3. Blended Rate Erosion — T&M, and healthCost isn't Green (T&M
 *     revenue already scales with hours, so lingering erosion here more
 *     often reads as rate/resource-mix drift than scope).
 *  4. Exceeded Baseline Scope Caps — healthScope is already Red.
 *  5. OTHER — at risk, but none of the above fired.
 */
export function classifyCommercialTheme(
  input: Pick<CommercialTriageProjectInput, 'commercialModel' | 'healthCost' | 'healthScope' | 'hasChangeOrderActivity'>
): CommercialTheme {
  if (input.hasChangeOrderActivity) return 'CHANGE_ORDER_EXPOSURE';
  if (input.commercialModel === 'FF' && input.healthCost !== 'Green') return 'MARGIN_SQUEEZE_FIXED_FEE';
  if (input.commercialModel === 'TM' && input.healthCost !== 'Green') return 'BLENDED_RATE_EROSION';
  if (input.healthScope === 'Red') return 'EXCEEDED_BASELINE_SCOPE_CAP';
  return 'OTHER';
}

/**
 * Assembles the full triage result from every scoped project. The caller
 * (src/server/queries/commercial-triage.ts) is responsible for the DB
 * read and the RBAC scoping; this only classifies and aggregates what
 * it's handed.
 */
export function buildCommercialTriage(inputs: CommercialTriageProjectInput[]): CommercialTriageResult {
  let totalContractedValue = 0;
  let lockedCount = 0;
  let draftCount = 0;
  let redCount = 0;
  let amberCount = 0;
  const byCommercialModel: Record<CommercialModel, { count: number; bac: number }> = {
    FF: { count: 0, bac: 0 },
    TM: { count: 0, bac: 0 },
  };
  const atRisk: CommercialTriageItem[] = [];

  for (const p of inputs) {
    totalContractedValue += p.bac;
    if (p.locked) lockedCount += 1;
    else draftCount += 1;
    byCommercialModel[p.commercialModel].count += 1;
    byCommercialModel[p.commercialModel].bac += p.bac;

    const rag = commercialRagFor(p);
    if (rag === null) continue;
    if (rag === 'Red') redCount += 1;
    else amberCount += 1;

    atRisk.push({ ...p, theme: classifyCommercialTheme(p), rag, varianceUsd: p.actualsCost - p.bac });
  }

  const clusters: CommercialThemeCluster[] = COMMERCIAL_THEME_ORDER.map((theme) => {
    const members = atRisk.filter((i) => i.theme === theme);
    return {
      theme,
      label: COMMERCIAL_THEME_LABEL[theme],
      blurb: COMMERCIAL_THEME_BLURB[theme],
      projectCount: members.length,
      redCount: members.filter((i) => i.rag === 'Red').length,
      amberCount: members.filter((i) => i.rag === 'Amber').length,
      totalVarianceUsd: members.reduce((s, i) => s + i.varianceUsd, 0),
      items: members,
    };
  })
    .filter((c) => c.projectCount > 0)
    .sort((a, b) => b.projectCount - a.projectCount || b.totalVarianceUsd - a.totalVarianceUsd);

  return {
    projectCount: inputs.length,
    totalContractedValue,
    lockedCount,
    draftCount,
    byCommercialModel,
    redCount,
    amberCount,
    clusters,
  };
}
