/**
 * SteerCo Briefing — the board-meeting aggregation: the portfolio's Pulse
 * vitals, its margin health, what moved since the last review, and the
 * escalated-risk watchlist, in one lean presentation. Org-scoped (a
 * briefing is inherently the whole portfolio).
 *
 * Every figure comes from the same engines the module pages and the
 * Executive Briefing Hub use — `composeSteerCoBriefing` is a pure reshape
 * of `getExecutiveBriefing` + `getActiveStream`, so this can never drift.
 */
import { getExecutiveBriefing, type ExecutiveBriefing } from '@/server/queries/executive-briefing';
import { getActiveStream, type StreamEvent, type StreamTone } from '@/server/queries/active-stream';
import { compactMoney, pctFromFraction, pctFromNumber, pointsDelta } from '@/lib/format';
import type { PulseVital } from '@/components/command-center/PulseStrip';

export interface SteerCoMargin {
  showFinancials: boolean;
  baselineMarginPct: number;
  eacMarginPct: number;
  /** EAC margin minus baseline margin, in points — negative is erosion. */
  deltaPts: number;
  tcv: number;
  eacCost: number;
  bac: number;
}

export interface SteerCoHighlight {
  id: string;
  label: string;
  detail: string | null;
  context: string | null;
  at: string;
  tone: StreamTone;
}

export interface SteerCoWatchItem {
  id: string;
  title: string;
  context: string;
  severity: string;
  owner: string | null;
  tone: StreamTone;
}

export interface SteerCoBriefing {
  organizationName: string;
  generatedAt: string;
  headline: {
    activeEngagements: number;
    greenSharePct: number;
    redCount: number;
    compliancePct: number;
  };
  vitals: PulseVital[];
  margin: SteerCoMargin;
  highlights: SteerCoHighlight[];
  watchlist: SteerCoWatchItem[];
}

function velocityTone(attainment: number): PulseVital['tone'] {
  if (attainment >= 0.98) return 'good';
  if (attainment >= 0.85) return 'warn';
  return 'critical';
}

function marginTone(pct: number): PulseVital['tone'] {
  if (pct >= 30) return 'good';
  if (pct >= 15) return 'warn';
  return 'critical';
}

function watchTone(severity: string): StreamTone {
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'HIGH') return 'warn';
  return 'default';
}

/** Pure: reshape the org aggregators into the briefing. */
export function composeSteerCoBriefing(input: {
  organizationName: string;
  generatedAt: string;
  exec: ExecutiveBriefing;
  stream: StreamEvent[];
  showFinancials: boolean;
}): SteerCoBriefing {
  const { macro, utilization, healthDistribution, criticalRaid } = input.exec;
  const escalated = criticalRaid.filter((r) => r.escalated).length;
  const red = healthDistribution.overall.red;
  const healthTotal = healthDistribution.overall.green + healthDistribution.overall.amber + red;
  // getExecutiveBriefing reports drift as (baseline − EAC); flip it so a
  // negative number reads as "margin eroded".
  const marginDeltaPts = -macro.marginDriftPts;

  const vitals: PulseVital[] = [
    {
      label: 'Book of Business',
      value: compactMoney(macro.totalTcv),
      sub: `${macro.activeEngagements} active engagement${macro.activeEngagements === 1 ? '' : 's'}`,
    },
    {
      label: 'Delivery Velocity',
      value: pctFromFraction(utilization.utilizationPct),
      sub: `${pctFromFraction(utilization.attainmentPct, 0)} of ${pctFromFraction(utilization.targetUtilPct, 0)} target`,
      tone: velocityTone(utilization.attainmentPct),
    },
    {
      label: 'Margin Health',
      value: input.showFinancials ? pctFromNumber(macro.blendedEacMarginPct) : '••••',
      sub: input.showFinancials
        ? `baseline ${pctFromNumber(macro.baselineMarginPct)} · ${pointsDelta(marginDeltaPts)} vs plan`
        : 'restricted to Partners',
      tone: input.showFinancials ? marginTone(macro.blendedEacMarginPct) : 'default',
    },
    {
      label: 'Risk Flags',
      value: String(red + escalated),
      sub: `${red} red engagement${red === 1 ? '' : 's'} · ${escalated} escalated`,
      tone: red + escalated === 0 ? 'good' : 'critical',
    },
  ];

  return {
    organizationName: input.organizationName,
    generatedAt: input.generatedAt,
    headline: {
      activeEngagements: macro.activeEngagements,
      greenSharePct: healthTotal > 0 ? Math.round((healthDistribution.overall.green / healthTotal) * 100) : 0,
      redCount: red,
      compliancePct: Math.round(macro.avgCompliancePct),
    },
    vitals,
    margin: {
      showFinancials: input.showFinancials,
      baselineMarginPct: macro.baselineMarginPct,
      eacMarginPct: macro.blendedEacMarginPct,
      deltaPts: marginDeltaPts,
      tcv: macro.totalTcv,
      eacCost: macro.aggregateEacCost,
      bac: macro.aggregateBac,
    },
    highlights: input.stream
      .filter((e) => e.kind === 'governance' || e.kind === 'risk')
      .slice(0, 6)
      .map((e) => ({ id: e.id, label: e.title, detail: e.detail, context: e.context, at: e.at, tone: e.tone })),
    watchlist: criticalRaid.slice(0, 6).map((r) => ({
      id: r.id,
      title: r.title?.trim() || `${r.type[0]}${r.type.slice(1).toLowerCase()} — ${r.projectName}`,
      context: r.projectName,
      severity: r.severity,
      owner: r.ownerName,
      tone: watchTone(r.severity),
    })),
  };
}

export async function getSteerCoBriefing(
  organizationId: string,
  organizationName: string,
  opts: { showFinancials: boolean }
): Promise<SteerCoBriefing> {
  const [exec, stream] = await Promise.all([
    getExecutiveBriefing(organizationId),
    getActiveStream(organizationId, 40),
  ]);
  return composeSteerCoBriefing({
    organizationName,
    generatedAt: new Date().toISOString(),
    exec,
    stream,
    showFinancials: opts.showFinancials,
  });
}
