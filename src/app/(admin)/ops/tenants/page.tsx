import { requireOpsCapability } from '@/lib/ops-auth';
import { listTenants } from '@/server/queries/ops-telemetry';
import { ProvisionTenantModal } from '@/components/ops/ProvisionTenantModal';
import { TenantStatusToggle } from '@/components/ops/TenantStatusToggle';
import { TenantActionsMenu } from '@/components/ops/TenantActionsMenu';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/ui/data-table';

const TIER_LABEL: Record<string, string> = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };
const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: '!text-success !border-success/40' },
  SUSPENDED: { label: 'Suspended', cls: '!text-critical !border-critical/40' },
  GRACE_PERIOD: { label: 'Grace period', cls: '!text-warning !border-warning/40' },
};

export default async function OpsTenantsPage() {
  await requireOpsCapability('tenants:view');
  const tenants = await listTenants();

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Tenants</h1>
          <p className="text-ink-muted text-sm mt-1">
            Every client organization on PS-DOS — {tenants.length} total.
          </p>
        </div>
        <div className="self-center">
          <ProvisionTenantModal />
        </div>
      </div>

      <div className="card">
        {tenants.length === 0 ? (
          <p className="text-ink-muted text-sm py-6 text-center">
            No tenants yet. Use “Provision New Tenant” to create the first one.
          </p>
        ) : (
          <DataTable storageKey="ops-tenants" caption="Every client organization" columns={tenantColumns} rows={tenantRows(tenants)} />
        )}
      </div>
    </>
  );
}

// No-Scroll table discipline: Tenant / Status / Actions are core; Tier,
// Active Users, Engagements, and Created are useful at a glance but
// optional — visible by default, hideable via "Customize Display".
const tenantColumns: DataTableColumn[] = [
  { key: 'tenant', header: 'Tenant', className: 'font-semibold' },
  { key: 'tier', header: 'Tier', optional: true, className: 'text-ink-muted' },
  { key: 'status', header: 'Status' },
  { key: 'users', header: 'Active Users', optional: true, align: 'right', className: 'tabular-nums' },
  { key: 'engagements', header: 'Engagements', optional: true, align: 'right', className: 'tabular-nums' },
  { key: 'created', header: 'Created', optional: true, className: 'text-ink-muted tabular-nums' },
  { key: 'actions', header: '' },
];

function tenantRows(tenants: Awaited<ReturnType<typeof listTenants>>): DataTableRow[] {
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
      status: (
        <span className={`badge !py-1 !px-2 ${STATUS_META[row.status]?.cls ?? '!text-warning !border-warning/40'}`}>
          {STATUS_META[row.status]?.label ?? row.status}
        </span>
      ),
      users: row.activeUsers,
      engagements: row.engagements,
      created: row.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      actions: (
        <span className="inline-flex items-center">
          <TenantStatusToggle organizationId={row.id} organizationName={row.name} status={row.status} />
          <TenantActionsMenu tenant={{ id: row.id, name: row.name, slug: row.slug, status: row.status }} />
        </span>
      ),
    },
  }));
}
