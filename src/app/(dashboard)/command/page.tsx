import { Suspense } from 'react';
import { requireOrgContext, type OrgContext } from '@/lib/session';
import { getScopedPortfolioSummary, type ScopedPortfolioSummary } from '@/lib/db/scoped-portfolio';
import { loadCapacityRows } from '@/server/queries/capacity';
import { blendedSummary, type ResourceCapacityRow } from '@/lib/capacity-engine';
import { getNotificationSummary } from '@/server/queries/notifications';
import { getActiveStream } from '@/server/queries/active-stream';
import { getExecutiveTriage } from '@/server/queries/executive-triage';
import { loadDecisionContext } from '@/server/queries/decision-context';
import { canViewMargins } from '@/lib/security/masking';
import { compactMoney } from '@/lib/format';
import { SkeletonCard } from '@/components/ui/skeleton';
import { PulseStrip, type PulseVital } from '@/components/command-center/PulseStrip';
import { ActiveStream } from '@/components/command-center/ActiveStream';
import { CommandBar } from '@/components/command-center/CommandBar';
import { ActionTriageFeed } from '@/components/command-center/ActionTriageFeed';

/**
 * The Single-Pane Command Center — the Executive Action Triage feed leads
 * (docs/UI_DESIGN_SYSTEM.md §6), then venture vitals, the live
 * chronological stream, and the universal Command Bar pinned to the
 * bottom. One page, one column, zero board clutter.
 */
export default async function CommandCenterPage() {
  const context = await requireOrgContext();
  const { organizationId, deliveryRole, governance } = context;
  const isStaff = context.session.user.isA2rStaff === true;
  const showMargins = canViewMargins(deliveryRole, governance);

  // `loadCapacityRows` (not the higher-level getBlendedUtilization) so the
  // PS Orchestration & Decision Engine's resource-swap search below can
  // reuse the exact same rows instead of the org's capacity being computed
  // twice in one request.
  //
  // Streaming: the triage feed's own narrative synthesis + the PS
  // Orchestration engine's real-headroom/swap-candidate search
  // (getExecutiveTriage + loadDecisionContext) are this page's heaviest
  // single piece of server work, and they feed ONLY the triage feed at the
  // top — not the vitals strip, the command bar, or the activity stream.
  // Rather than block all four behind the slowest of the two, the triage
  // feed is its own async Server Component (below) rendered inside a
  // <Suspense> boundary: the vitals/bar/stream paint immediately, and the
  // feed streams in right after.
  const [portfolioSummary, capacityRows, notif, stream] = await Promise.all([
    getScopedPortfolioSummary(context),
    loadCapacityRows(organizationId),
    getNotificationSummary(organizationId),
    getActiveStream(organizationId),
  ]);
  const util = blendedSummary(capacityRows);
  const { projects, summary } = portfolioSummary;

  const attain = util.attainmentPct;
  const riskFlags = notif.raidAlerts.length + notif.paceAlerts.length;

  const vitals: PulseVital[] = [
    {
      label: 'Book of Business',
      value: compactMoney(summary.totalValue),
      sub: `${summary.projectCount} engagement${summary.projectCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Delivery Velocity',
      value: `${(util.utilizationPct * 100).toFixed(1)}%`,
      sub: `${(attain * 100).toFixed(0)}% of ${(util.targetUtilPct * 100).toFixed(0)}% target`,
      tone: attain >= 0.98 ? 'good' : attain >= 0.85 ? 'warn' : 'critical',
    },
    {
      label: 'Margin Health',
      value: showMargins ? (summary.hasMargin ? `${summary.avgMarginPct.toFixed(1)}%` : '—') : '••••',
      sub: 'blended sold margin',
      tone:
        showMargins && summary.hasMargin
          ? summary.avgMarginPct >= 30
            ? 'good'
            : summary.avgMarginPct >= 15
              ? 'warn'
              : 'critical'
          : 'default',
    },
    {
      label: 'Risk Flags',
      value: String(riskFlags),
      sub: `${summary.highRiskCount} red · ${notif.raidAlerts.length} escalated`,
      tone: riskFlags === 0 ? 'good' : summary.highRiskCount > 0 || notif.raidAlerts.length > 0 ? 'critical' : 'warn',
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Command Center</h1>
        <p className="text-ink-muted text-sm mt-1">
          What needs a decision today, venture vitals, one bar to run the room, and the live stream.
        </p>
      </div>

      <Suspense fallback={<SkeletonCard lines={4} />}>
        <ActionTriageFeedSection
          context={context}
          portfolioSummary={portfolioSummary}
          capacityRows={capacityRows}
        />
      </Suspense>
      <PulseStrip vitals={vitals} />
      <CommandBar projects={projects.map((p) => ({ id: p.id, name: p.name }))} isStaff={isStaff} />
      <ActiveStream events={stream} />
    </>
  );
}

/**
 * The triage feed's own data assembly, split out of `CommandCenterPage` so
 * it can stream in behind a `<Suspense>` boundary instead of gating the
 * vitals strip / command bar / activity stream on its own slower queries.
 * Receives `portfolioSummary` and `capacityRows` as props — both already
 * fetched by the caller for its own vitals — so this never re-fetches
 * either.
 */
async function ActionTriageFeedSection({
  context,
  portfolioSummary,
  capacityRows,
}: {
  context: OrgContext;
  portfolioSummary: ScopedPortfolioSummary;
  capacityRows: ResourceCapacityRow[];
}) {
  const { deliveryRole, governance } = context;
  const { items: triageItems, flagged } = await getExecutiveTriage(context, portfolioSummary);
  const decisionContext = await loadDecisionContext(context, flagged, capacityRows);

  return (
    <ActionTriageFeed
      items={triageItems}
      decisionContext={decisionContext}
      viewer={{ deliveryRole, approvalThresholdUsd: governance.interventionApprovalThresholdUsd }}
    />
  );
}
