import Link from 'next/link';
import { requireOpsCapability } from '@/lib/ops-auth';
import { getPlatformTelemetry } from '@/server/queries/ops-telemetry';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/ui/data-table';

const TIER_LABEL: Record<string, string> = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };

export default async function OpsTelemetryPage() {
  await requireOpsCapability('telemetry:view');
  const t = await getPlatformTelemetry();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Platform Telemetry</h1>
        <p className="text-ink-muted text-sm mt-1">
          High-level health across every tenant in the PS-DOS estate.
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
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Per-Tenant</div>
            <h2 className="text-[15.5px] font-bold">Breakdown</h2>
          </div>
          <Link href="/ops/tenants" className="text-brand text-xs font-semibold self-center">
            Manage tenants →
          </Link>
        </div>

        <DataTable
          storageKey="ops-telemetry-tenants"
          caption="Per-tenant health breakdown"
          columns={telemetryColumns}
          rows={telemetryRows(t.tenants)}
          emptyMessage="No tenants provisioned yet."
        />
      </div>
    </>
  );
}

// No-Scroll table discipline: Tenant / Status are core; Tier, Users, and
// Engagements are useful at a glance but optional — hideable via "Customize Display".
const telemetryColumns: DataTableColumn[] = [
  { key: 'tenant', header: 'Tenant', className: 'font-semibold' },
  { key: 'tier', header: 'Tier', optional: true, className: 'text-ink-muted' },
  { key: 'status', header: 'Status' },
  { key: 'users', header: 'Users', optional: true, align: 'right', className: 'tabular-nums' },
  { key: 'engagements', header: 'Engagements', optional: true, align: 'right', className: 'tabular-nums' },
];

function telemetryRows(tenants: Awaited<ReturnType<typeof getPlatformTelemetry>>['tenants']): DataTableRow[] {
  return tenants.map((row) => ({
    key: row.id,
    cellTitles: { tenant: row.name },
    cells: {
      tenant: (
        <>
          {row.name}
          <span className="block font-mono text-[10px] text-ink-faint">{row.slug}</span>
        </>
      ),
      tier: TIER_LABEL[row.contractTier] ?? row.contractTier,
      status: <StatusPill status={row.status} />,
      users: row.activeUsers,
      engagements: row.engagements,
    },
  }));
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
