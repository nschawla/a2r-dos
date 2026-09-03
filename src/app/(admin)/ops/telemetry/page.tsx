import Link from 'next/link';
import { requireOpsContext } from '@/lib/ops-auth';
import { getPlatformTelemetry } from '@/server/queries/ops-telemetry';
import { StatCard } from '@/components/ui/stat-card';

const TIER_LABEL: Record<string, string> = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };

export default async function OpsTelemetryPage() {
  await requireOpsContext();
  const t = await getPlatformTelemetry();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Platform Telemetry</h1>
        <p className="text-ink-muted text-sm mt-1">
          High-level health across every tenant in the A2R Delivery OS estate.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tenants"
          value={String(t.totalTenants)}
          sub={`${t.activeTenants} active · ${t.suspendedTenants} suspended`}
        />
        <StatCard
          label="Total Active Engagements"
          value={String(t.totalActiveEngagements)}
          sub={`${t.redEngagements} at red health`}
          tone={t.redEngagements > 0 ? 'text-warning' : undefined}
        />
        <StatCard
          label="Global Margin Average"
          value={t.hasMargin ? `${t.globalMarginAvgPct.toFixed(1)}%` : '—'}
          sub="Baseline sold margin, all sized engagements"
        />
        <StatCard
          label="At-Risk RAID Items"
          value={String(t.atRiskRaidItems)}
          sub="Escalated or critical, still open"
          tone={t.atRiskRaidItems > 0 ? 'text-critical' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Users" value={String(t.totalUsers)} sub="Across all tenants" />
        <StatCard
          label="Suspended Tenants"
          value={String(t.suspendedTenants)}
          sub={t.suspendedTenants > 0 ? 'Members locked out of workspace' : 'None'}
          tone={t.suspendedTenants > 0 ? 'text-warning' : undefined}
        />
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">Per-Tenant</div>
            <h2 className="text-[15.5px] font-bold">Breakdown</h2>
          </div>
          <Link href="/ops/tenants" className="text-brand-hi text-xs font-semibold self-center">
            Manage tenants →
          </Link>
        </div>

        {t.tenants.length === 0 ? (
          <p className="text-ink-muted text-sm py-6 text-center">No tenants provisioned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Users</th>
                  <th className="py-2 pr-4">Engagements</th>
                </tr>
              </thead>
              <tbody>
                {t.tenants.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 font-semibold">
                      {row.name}
                      <span className="block font-mono text-[10px] text-ink-faint">{row.slug}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-ink-muted">{TIER_LABEL[row.contractTier] ?? row.contractTier}</td>
                    <td className="py-2.5 pr-4">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.activeUsers}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.engagements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}


function StatusPill({ status }: { status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD' }) {
  const meta =
    status === 'ACTIVE'
      ? { label: 'Active', cls: '!text-success !border-success/40' }
      : status === 'GRACE_PERIOD'
        ? { label: 'Grace period', cls: '!text-warning !border-warning/40' }
        : { label: 'Suspended', cls: '!text-critical !border-critical/40' };
  return <span className={`badge !py-1 !px-2 ${meta.cls}`}>{meta.label}</span>;
}
