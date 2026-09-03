import { requireOrgContext } from '@/lib/session';
import { getScopedPortfolioSummary } from '@/lib/db/scoped-portfolio';
import { getBlendedUtilization } from '@/server/queries/capacity';
import { getNotificationSummary } from '@/server/queries/notifications';
import { getActiveStream } from '@/server/queries/active-stream';
import { canViewMargins } from '@/lib/security/masking';
import { compactMoney } from '@/lib/format';
import { PulseStrip, type PulseVital } from '@/components/command-center/PulseStrip';
import { ActiveStream } from '@/components/command-center/ActiveStream';
import { CommandBar } from '@/components/command-center/CommandBar';

/**
 * The Single-Pane Command Center — venture vitals up top (Pulse), the live
 * chronological stream in the middle, and the universal Command Bar pinned
 * to the bottom. One page, one column, zero board clutter.
 */
export default async function CommandCenterPage() {
  const context = await requireOrgContext();
  const { organizationId, deliveryRole, governance } = context;
  const isStaff = context.session.user.isA2rStaff === true;
  const showMargins = canViewMargins(deliveryRole, governance);

  const [{ projects, summary }, util, notif, stream] = await Promise.all([
    getScopedPortfolioSummary(context),
    getBlendedUtilization(organizationId),
    getNotificationSummary(organizationId),
    getActiveStream(organizationId),
  ]);

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
          Venture vitals, one bar to run the room, and the live stream.
        </p>
      </div>

      <PulseStrip vitals={vitals} />
      <CommandBar projects={projects.map((p) => ({ id: p.id, name: p.name }))} isStaff={isStaff} />
      <ActiveStream events={stream} />
    </>
  );
}
