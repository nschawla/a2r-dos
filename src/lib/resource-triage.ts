/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Resource & Capacity Cockpit Executive Triage & Thematic Clustering
 * (docs/RESOURCE_CAPACITY_TRIAGE.md) — the fourth and final application
 * of the dual-tile macro-first pattern shipped for RAID
 * (src/lib/raid-triage.ts), Financial Realization
 * (src/lib/financial-triage.ts), and Schedule (src/lib/schedule-triage.ts):
 * a portfolio-wide utilization rollup, plus a thematic grouping of the
 * at-risk resource subset by likely staffing root cause.
 *
 * Pure — no Prisma, no React, no network call. Deliberately NOT a live LLM
 * classification, same reasoning as the other three.
 *
 * One requested theme, "Pending Skillset Certification Gaps," is
 * deliberately NOT implemented as specified — PS-DOS has no certification
 * or skills-tracking data model at all (confirmed against prisma/schema.prisma;
 * see docs/RESOURCE_CAPACITY_TRIAGE.md §2), and this app's whole triage
 * pattern has been built on the rule that a cluster only ever buckets data
 * that's already real, never invents it. In its place: **Bench /
 * Unassigned Capacity** — resources carrying zero active engagements. It's
 * a real, already-computed signal (the same one behind Tile 1's own
 * "unassigned headcount" figure) and captures the same underlying business
 * story the requested theme was reaching for — skilled capacity sitting
 * idle while other resources are stretched thin elsewhere.
 *
 * Like Financial Realization and Schedule's classifiers, this is a
 * fixed-priority decision list over real, already-computed structured
 * signals — a Resource row has no free-text narrative to keyword-score.
 */

export type Rag = 'Red' | 'Amber';
export type ResourceRag = 'Red' | 'Amber' | 'Green';

export type ResourceTheme =
  | 'SENIOR_ARCHITECT_OVERALLOCATION'
  | 'LEAD_PM_CONTENTION'
  | 'JUNIOR_ANALYST_UNDERUTILIZATION'
  | 'BENCH_UNDERUTILIZATION'
  | 'OTHER';

export const RESOURCE_THEME_ORDER: ResourceTheme[] = [
  'SENIOR_ARCHITECT_OVERALLOCATION',
  'LEAD_PM_CONTENTION',
  'JUNIOR_ANALYST_UNDERUTILIZATION',
  'BENCH_UNDERUTILIZATION',
  'OTHER',
];

export const RESOURCE_THEME_LABEL: Record<ResourceTheme, string> = {
  SENIOR_ARCHITECT_OVERALLOCATION: 'Senior / Architect Over-allocation',
  LEAD_PM_CONTENTION: 'Cross-Project Contention for Lead PMs',
  JUNIOR_ANALYST_UNDERUTILIZATION: 'Junior / Analyst Under-utilization',
  BENCH_UNDERUTILIZATION: 'Bench / Unassigned Capacity',
  OTHER: 'Other',
};

export const RESOURCE_THEME_BLURB: Record<ResourceTheme, string> = {
  SENIOR_ARCHITECT_OVERALLOCATION: 'A senior-tier billable head is running hot — burnout and quality risk on the critical path.',
  LEAD_PM_CONTENTION: 'A PM/delivery-management role is spread across too many concurrent engagements at once.',
  JUNIOR_ANALYST_UNDERUTILIZATION: 'A junior-tier billable head is staffed but tracking well under their target utilization.',
  BENCH_UNDERUTILIZATION: 'A billable head is carrying zero active engagements — real margin sitting idle.',
  OTHER: "At risk, but doesn't match a known pattern — review the resource directly.",
};

/** > this share of available hours billed = severely over-allocated —
 * the exact ">110% capacity" threshold from the feature spec. */
export const OVER_ALLOCATION_THRESHOLD = 1.1;
/** < this share of target attainment = under-utilized. */
export const UNDER_UTILIZATION_ATTAINMENT_THRESHOLD = 0.7;

const SENIOR_ROLE_KEYWORDS = ['architect', 'principal', 'director', 'vp ', 'head of'];
const PM_ROLE_KEYWORDS = ['project manager', 'program manager', 'delivery manager', 'engagement manager'];
const JUNIOR_ROLE_KEYWORDS = ['analyst', 'associate', 'junior', 'coordinator'];

function roleMatches(roleName: string | null, keywords: string[]): boolean {
  if (!roleName) return false;
  const lower = roleName.toLowerCase();
  return keywords.some((k) => lower.includes(k)) || lower === 'pm';
}

export interface ResourceTriageInput {
  id: string;
  name: string;
  psPractice: string;
  /** Resource.role.name (the rate-card job title) — the app's existing
   * "what kind of capacity is this" proxy, same field decision-context.ts
   * already reads for its skill/role matching. Null when the resource has
   * no rate-card role linked yet. */
  roleName: string | null;
  isBillableHead: boolean;
  fte: number;
  /** Real hours from capacity-engine.ts's resourceCapacityRow — carried
   * through so Tile 1's blended utilization can be computed with the
   * EXACT same formula as blendedSummary (hours-weighted, not a simple
   * average of per-row percentages), so it never disagrees with the
   * Capacity Cockpit page's own headline number. */
  availableHours: number;
  billableHours: number;
  utilizationPct: number;
  targetUtilPct: number;
  attainmentPct: number;
  projectCount: number;
  /** projectCount > CONCURRENCY_OVERLOAD_THRESHOLD — capacity-engine.ts's
   * own existing concurrency-overload flag. */
  overloaded: boolean;
  /** Distinct active-project ids this resource is PD/DM/PM/contributor on
   * — real, used to compute each cluster's "distinct projects touched". */
  projectIds: string[];
}

export interface ResourceTriageItem extends ResourceTriageInput {
  theme: ResourceTheme;
  rag: Rag;
}

export interface ResourceThemeCluster {
  theme: ResourceTheme;
  label: string;
  blurb: string;
  /** Member resources — named distinctly from `projectCount` below since,
   * unlike RAID/Financial/Schedule (where each cluster member IS a
   * project), a cluster member here is a resource that may itself touch
   * several projects. */
  resourceCount: number;
  redCount: number;
  amberCount: number;
  /** Distinct projects this theme's member resources collectively touch —
   * the "systemic vs. isolated" signal, same reasoning as the other three
   * triage modules. */
  projectCount: number;
  items: ResourceTriageItem[];
}

export interface ResourceTriageResult {
  /** Billable heads considered (non-billable roles like Directors and
   * Engagement Coordinators have no meaningful utilization denominator —
   * see capacity-engine.ts — and are excluded from every figure below). */
  resourceCount: number;
  utilizationPct: number;
  targetUtilPct: number;
  /** Billable heads carrying zero active engagements. */
  benchCount: number;
  /** utilizationPct > OVER_ALLOCATION_THRESHOLD (>110% of capacity) — the
   * literal headline figure the feature spec asks for. A narrower count
   * than redCount below, which also folds in concurrency overload. */
  severelyOverAllocatedCount: number;
  redCount: number;
  amberCount: number;
  optimalCount: number;
  clusters: ResourceThemeCluster[];
}

/**
 * A resource's overall health — Tile 1's 3-way split and Tile 2's
 * population gate both derive from this one function, same discipline
 * Schedule's phaseHealthRag established (one source of truth so the two
 * tiles can never visibly disagree). Only meaningful for billable heads;
 * callers should treat non-billable heads as excluded entirely rather
 * than calling this on them (utilizationPct is forced to 0 for a
 * non-billable row regardless of real work — see resourceCapacityRow).
 *
 *  - Red: severely over-allocated (>110% of available hours billed), OR
 *    already flagged overloaded by concurrency (capacity-engine.ts's own
 *    >5-concurrent-engagements signal) — either is a real, urgent
 *    "this person is stretched too thin" read.
 *  - Amber: not Red, and tracking well under their target attainment.
 *  - Green: everything else — the optimal band.
 */
export function resourceHealthRag(
  input: Pick<ResourceTriageInput, 'utilizationPct' | 'attainmentPct' | 'overloaded'>
): ResourceRag {
  if (input.utilizationPct > OVER_ALLOCATION_THRESHOLD || input.overloaded) return 'Red';
  if (input.attainmentPct < UNDER_UTILIZATION_ATTAINMENT_THRESHOLD) return 'Amber';
  return 'Green';
}

/**
 * Fixed-priority decision list, evaluated top to bottom:
 *
 *  1. Senior / Architect Over-allocation — Red, and the role name reads
 *     senior-tier (Architect, Principal, Director, VP, Head of).
 *  2. Cross-Project Contention for Lead PMs — Red, and the role name
 *     reads PM/delivery-management-tier.
 *  3. Junior / Analyst Under-utilization — Amber, and the role name
 *     reads junior-tier (Analyst, Associate, Junior, Coordinator).
 *  4. Bench / Unassigned Capacity — Amber, and carrying zero active
 *     engagements, regardless of role (the honest substitute for the
 *     ungrounded "Certification Gaps" theme — see the file header).
 *  5. OTHER — at risk, but none of the above signals fired.
 */
export function classifyResourceTheme(
  input: Pick<ResourceTriageInput, 'roleName' | 'projectCount'> & { rag: Rag }
): ResourceTheme {
  if (input.rag === 'Red' && roleMatches(input.roleName, SENIOR_ROLE_KEYWORDS)) return 'SENIOR_ARCHITECT_OVERALLOCATION';
  if (input.rag === 'Red' && roleMatches(input.roleName, PM_ROLE_KEYWORDS)) return 'LEAD_PM_CONTENTION';
  if (input.rag === 'Amber' && roleMatches(input.roleName, JUNIOR_ROLE_KEYWORDS)) return 'JUNIOR_ANALYST_UNDERUTILIZATION';
  if (input.rag === 'Amber' && input.projectCount === 0) return 'BENCH_UNDERUTILIZATION';
  return 'OTHER';
}

/**
 * Assembles the full triage result from every scoped billable-head
 * resource. The caller (src/server/queries/resource-triage.ts) is
 * responsible for the DB read and the RBAC scoping; this only classifies
 * and aggregates what it's handed.
 */
export function buildResourceTriage(inputs: ResourceTriageInput[]): ResourceTriageResult {
  const billable = inputs.filter((r) => r.isBillableHead);

  // Same formula, and the same "every row's hours count toward the
  // numerator, only billable heads' available hours form the denominator"
  // convention, as capacity-engine.ts's own blendedSummary — a Director
  // charging time still bills the client even though their role isn't a
  // billable head for utilization-target purposes. Keeping this identical
  // is what guarantees Tile 1's headline number never disagrees with the
  // Capacity Cockpit page it sits above.
  const billableHoursNum = inputs.reduce((s, r) => s + r.billableHours, 0);
  const availableHoursDen = billable.reduce((s, r) => s + r.availableHours, 0);
  const utilizationPct = availableHoursDen > 0 ? billableHoursNum / availableHoursDen : 0;
  const headcountFte = billable.reduce((s, r) => s + r.fte, 0);
  const targetUtilPct = headcountFte > 0 ? billable.reduce((s, r) => s + r.targetUtilPct * r.fte, 0) / headcountFte : 0;

  let benchCount = 0;
  let severelyOverAllocatedCount = 0;
  let redCount = 0;
  let amberCount = 0;
  let optimalCount = 0;
  const atRisk: ResourceTriageItem[] = [];

  for (const r of billable) {
    if (r.projectCount === 0) benchCount += 1;
    if (r.utilizationPct > OVER_ALLOCATION_THRESHOLD) severelyOverAllocatedCount += 1;

    const rag = resourceHealthRag(r);
    if (rag === 'Green') {
      optimalCount += 1;
      continue;
    }
    if (rag === 'Red') redCount += 1;
    else amberCount += 1;

    atRisk.push({ ...r, theme: classifyResourceTheme({ ...r, rag }), rag });
  }

  const clusters: ResourceThemeCluster[] = RESOURCE_THEME_ORDER.map((theme) => {
    const members = atRisk.filter((i) => i.theme === theme);
    const projectIds = new Set<string>();
    for (const m of members) for (const pid of m.projectIds) projectIds.add(pid);
    return {
      theme,
      label: RESOURCE_THEME_LABEL[theme],
      blurb: RESOURCE_THEME_BLURB[theme],
      resourceCount: members.length,
      redCount: members.filter((i) => i.rag === 'Red').length,
      amberCount: members.filter((i) => i.rag === 'Amber').length,
      projectCount: projectIds.size,
      items: members,
    };
  })
    .filter((c) => c.resourceCount > 0)
    // Worst first — same reasoning as the other three: more distinct
    // projects touched by the same theme outranks a bigger single-cluster
    // headcount, since the former is the systemic read leadership wants.
    .sort((a, b) => b.projectCount - a.projectCount || b.resourceCount - a.resourceCount);

  return {
    resourceCount: billable.length,
    utilizationPct,
    targetUtilPct,
    benchCount,
    severelyOverAllocatedCount,
    redCount,
    amberCount,
    optimalCount,
    clusters,
  };
}
