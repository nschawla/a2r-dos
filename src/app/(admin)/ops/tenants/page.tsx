import { requireOpsContext } from '@/lib/ops-auth';
import { listTenants } from '@/server/queries/ops-telemetry';
import { ProvisionTenantModal } from '@/components/ops/ProvisionTenantModal';
import { TenantStatusToggle } from '@/components/ops/TenantStatusToggle';
import { TenantActionsMenu } from '@/components/ops/TenantActionsMenu';

const TIER_LABEL: Record<string, string> = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };
const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: '!text-success !border-success/40' },
  SUSPENDED: { label: 'Suspended', cls: '!text-critical !border-critical/40' },
  GRACE_PERIOD: { label: 'Grace period', cls: '!text-warning !border-warning/40' },
};

export default async function OpsTenantsPage() {
  await requireOpsContext();
  const tenants = await listTenants();

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Tenants</h1>
          <p className="text-ink-muted text-sm mt-1">
            Every client organization on A2R Delivery OS — {tenants.length} total.
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Active Users</th>
                  <th className="py-2 pr-4">Engagements</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-semibold">
                      {row.name}
                      <span className="block font-mono text-[10px] text-ink-faint">{row.slug}</span>
                    </td>
                    <td className="py-3 pr-4 text-ink-muted">{TIER_LABEL[row.contractTier] ?? row.contractTier}</td>
                    <td className="py-3 pr-4">
                      <span className={`badge !py-1 !px-2 ${STATUS_META[row.status]?.cls ?? '!text-warning !border-warning/40'}`}>
                        {STATUS_META[row.status]?.label ?? row.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{row.activeUsers}</td>
                    <td className="py-3 pr-4 tabular-nums">{row.engagements}</td>
                    <td className="py-3 pr-4 text-ink-muted tabular-nums">
                      {row.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center">
                        <TenantStatusToggle
                          organizationId={row.id}
                          organizationName={row.name}
                          status={row.status}
                        />
                        <TenantActionsMenu
                          tenant={{ id: row.id, name: row.name, slug: row.slug, status: row.status }}
                        />
                      </span>
                    </td>
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
