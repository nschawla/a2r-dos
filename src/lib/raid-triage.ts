/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * RAID Cockpit Executive Triage & Thematic Clustering
 * (docs/RAID_EXECUTIVE_TRIAGE.md) — turns the per-project RAID log into a
 * portfolio-wide macro view: an aggregate Red/Amber count, and a thematic
 * grouping of open critical/high/medium items by likely root cause
 * (Resource Bottlenecks, Integration/Data Failures, Scope Creep, Vendor
 * Delays), so a leader sees systemic patterns across projects rather than
 * isolated line items.
 *
 * Pure — no Prisma, no React, no network call. Deliberately NOT a live LLM
 * classification: this runs on every /raid page load, and an executive
 * scanning the RAID Cockpit needs it to be instant and always available
 * (no ANTHROPIC_API_KEY dependency, no per-request latency/cost) — the
 * same reasoning that already governs the rest of this app's computed
 * engines. It IS a real classification of real text (title + description +
 * impact), via keyword scoring against each theme's known vocabulary —
 * transparent and deterministic rather than a black box, and it never
 * invents an item's content or severity, only buckets it.
 */
import type { Severity } from './ui/severity';

export type RaidType = 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DEPENDENCY';
export type Rag = 'Red' | 'Amber';

export type RaidTheme = 'RESOURCE_BOTTLENECK' | 'INTEGRATION_DATA' | 'SCOPE_CREEP' | 'VENDOR_DELAY' | 'OTHER';

export const RAID_THEME_ORDER: RaidTheme[] = [
  'RESOURCE_BOTTLENECK',
  'INTEGRATION_DATA',
  'SCOPE_CREEP',
  'VENDOR_DELAY',
  'OTHER',
];

export const RAID_THEME_LABEL: Record<RaidTheme, string> = {
  RESOURCE_BOTTLENECK: 'Resource Bottlenecks',
  INTEGRATION_DATA: 'Integration / Data Failures',
  SCOPE_CREEP: 'Scope Creep',
  VENDOR_DELAY: 'Vendor Delays',
  OTHER: 'Other',
};

export const RAID_THEME_BLURB: Record<RaidTheme, string> = {
  RESOURCE_BOTTLENECK: 'Staffing gaps, overallocation, and capacity shortfalls.',
  INTEGRATION_DATA: 'System integration, data quality, and migration failures.',
  SCOPE_CREEP: 'Unplanned or expanding scope beyond the baseline.',
  VENDOR_DELAY: 'Third-party, supplier, or subcontractor slippage.',
  OTHER: "Doesn't match a known pattern — read the item directly.",
};

/** Keyword vocabulary per theme — scored by occurrence count against the
 * item's own text. Ordered by RAID_THEME_ORDER for deterministic tie-
 * breaking (an item matching two themes equally lands in whichever comes
 * first in that list); OTHER never has a vocabulary — it's the zero-match
 * fallback, not a competing bucket. */
const THEME_KEYWORDS: Record<Exclude<RaidTheme, 'OTHER'>, string[]> = {
  RESOURCE_BOTTLENECK: [
    'resource',
    'staffing',
    'understaffed',
    'capacity',
    'bandwidth',
    'overallocat',
    'over-allocat',
    'bench strength',
    'backfill',
    'headcount',
    'hiring',
    'attrition',
    'burnout',
    'overloaded',
    'utilization',
    'short-staffed',
    'shortage of',
  ],
  INTEGRATION_DATA: [
    'integration',
    ' api ',
    'api integration',
    'interface',
    'data quality',
    'data loss',
    'data migration',
    'migrat',
    ' sync',
    'etl',
    'data mapping',
    'interoperab',
    'legacy system',
    'schema',
    'data model',
    'corrupt',
  ],
  SCOPE_CREEP: [
    'scope creep',
    'out of scope',
    'change order',
    'additional requirement',
    'expanded requirement',
    'expanding scope',
    'gold-plat',
    'unplanned work',
    'scope expansion',
    'new requirement',
  ],
  VENDOR_DELAY: [
    'vendor',
    'third-party',
    'third party',
    'subcontractor',
    'supplier',
    'sla breach',
    'sla miss',
    'external partner',
    'procurement delay',
    'outsourc',
  ],
};

export interface RaidTriageItemInput {
  id: string;
  projectId: string;
  projectName: string;
  type: RaidType;
  title: string | null;
  description: string;
  impact: string | null;
  severity: Severity;
  targetDate: string | null;
  overdue: boolean;
  ownerName: string | null;
  updatedAt: string;
}

export interface RaidTriageItem extends RaidTriageItemInput {
  theme: RaidTheme;
  rag: Rag;
}

export interface RaidThemeCluster {
  theme: RaidTheme;
  label: string;
  blurb: string;
  count: number;
  redCount: number;
  amberCount: number;
  /** Distinct projects this theme's open items touch — the "systemic vs.
   * isolated" signal: a theme with items on 1 project is a project
   * problem, the same theme on 4 projects is an organizational pattern. */
  projectCount: number;
  items: RaidTriageItem[];
}

export interface RaidTriageResult {
  items: RaidTriageItem[];
  totalCount: number;
  redCount: number;
  amberCount: number;
  /** Counts by RAID type (Risk/Assumption/Issue/Dependency) — the
   * "severity breakdown" Tile 1 shows alongside the Red/Amber headline. */
  byType: Record<RaidType, number>;
  clusters: RaidThemeCluster[];
}

/** CRITICAL/HIGH severity reads as Red; MED reads as Amber. LOW-severity
 * items are out of scope for this triage view entirely — the caller never
 * passes them in (see loadRaidTriage's query filter). */
export function ragFor(severity: Severity): Rag {
  return severity === 'CRITICAL' || severity === 'HIGH' ? 'Red' : 'Amber';
}

function itemText(item: Pick<RaidTriageItemInput, 'title' | 'description' | 'impact'>): string {
  return [item.title, item.description, item.impact].filter(Boolean).join(' ').toLowerCase();
}

export function classifyRaidTheme(item: Pick<RaidTriageItemInput, 'title' | 'description' | 'impact'>): RaidTheme {
  const text = itemText(item);
  let best: RaidTheme = 'OTHER';
  let bestScore = 0;
  for (const theme of RAID_THEME_ORDER) {
    if (theme === 'OTHER') continue;
    const keywords = THEME_KEYWORDS[theme];
    let score = 0;
    for (const kw of keywords) if (text.includes(kw)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  return best;
}

const TYPE_ORDER: RaidType[] = ['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY'];

/**
 * Assembles the full triage result from every open, Red/Amber RAID item in
 * the viewer's scope. The caller (src/server/queries/raid-triage.ts) is
 * responsible for the DB read and the RBAC scoping; this only classifies
 * and aggregates what it's handed.
 */
export function buildRaidTriage(inputs: RaidTriageItemInput[]): RaidTriageResult {
  const items: RaidTriageItem[] = inputs.map((input) => ({
    ...input,
    theme: classifyRaidTheme(input),
    rag: ragFor(input.severity),
  }));

  const byType: Record<RaidType, number> = { RISK: 0, ASSUMPTION: 0, ISSUE: 0, DEPENDENCY: 0 };
  let redCount = 0;
  let amberCount = 0;
  for (const item of items) {
    byType[item.type] += 1;
    if (item.rag === 'Red') redCount += 1;
    else amberCount += 1;
  }

  const clusters: RaidThemeCluster[] = RAID_THEME_ORDER.map((theme) => {
    const themeItems = items.filter((i) => i.theme === theme);
    return {
      theme,
      label: RAID_THEME_LABEL[theme],
      blurb: RAID_THEME_BLURB[theme],
      count: themeItems.length,
      redCount: themeItems.filter((i) => i.rag === 'Red').length,
      amberCount: themeItems.filter((i) => i.rag === 'Amber').length,
      projectCount: new Set(themeItems.map((i) => i.projectId)).size,
      items: themeItems,
    };
  })
    .filter((c) => c.count > 0)
    // Worst first: more distinct projects touched outranks a bigger single-
    // project pile — a 4-project pattern is the more urgent read even if a
    // single noisy project has more raw items in another theme.
    .sort((a, b) => b.projectCount - a.projectCount || b.count - a.count);

  return {
    items,
    totalCount: items.length,
    redCount,
    amberCount,
    byType,
    clusters,
  };
}

export { TYPE_ORDER as RAID_TYPE_ORDER };
