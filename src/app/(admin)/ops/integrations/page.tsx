import { requireOpsCapability } from '@/lib/ops-auth';
import { loadAllConnections } from '@/server/queries/pages/ops-integrations';
import { listTenants } from '@/server/queries/ops-telemetry';
import { ConnectionHealthMatrix } from '@/components/ops/ConnectionHealthMatrix';

export const dynamic = 'force-dynamic';

/**
 * A2R Ops Console — Read-Only External Integration Adapters. Platform
 * infrastructure an operator configures on a tenant's behalf (same model
 * as /ops/identity) — a Connection Health Matrix across every tenant,
 * plus per-connection configure / test / retry-sync / error-log detail.
 */
export default async function OpsIntegrationsPage() {
  await requireOpsCapability('integrations:view');
  const [connections, tenants] = await Promise.all([
    loadAllConnections(),
    listTenants(),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">External Integrations</h1>
        <p className="text-ink-muted text-sm mt-1">
          Read-only pulls from a tenant&apos;s PSA/CRM systems — sprint velocity and issue counts (Jira / Asana /
          Monday), baseline margins and financial actuals (NetSuite / Certinia / Kantata / OpenAir), and pipeline
          book of business (Salesforce). Nothing here ever writes back to the external system.
        </p>
      </div>

      <ConnectionHealthMatrix
        connections={connections}
        tenants={tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
      />
    </>
  );
}
