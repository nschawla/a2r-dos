import { requireOpsContext } from '@/lib/ops-auth';
import { db } from '@/lib/db';
import { listTenants } from '@/server/queries/ops-telemetry';
import { getIdentityProvider } from '@/lib/identity/service';
import { OpsTenantSelect } from '@/components/ops/OpsTenantSelect';
import { IdentityFederationPanel } from '@/components/ops/IdentityFederationPanel';

export const dynamic = 'force-dynamic';

/**
 * A2R Ops Console — Enterprise Identity Federation. Federation is
 * platform-level infrastructure an operator configures on a tenant's
 * behalf (moved out of the tenant Admin module in v1.2.1). Pick a tenant,
 * then configure / verify / map / enable its SSO IdP.
 */
export default async function OpsIdentityPage({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  await requireOpsContext();
  const tenants = await listTenants();

  const orgId = searchParams.org ?? null;
  const selected = orgId ? tenants.find((t) => t.id === orgId) ?? null : null;

  const [idp, practices] = selected
    ? await Promise.all([
        getIdentityProvider(selected.id),
        db.practice.findMany({
          where: { organizationId: selected.id },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
      ])
    : [null, [] as { id: string; name: string }[]];

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold">Identity Federation</h1>
          <p className="text-ink-muted text-sm mt-1">
            Per-tenant Enterprise SSO — SAML 2.0 / OIDC connections, metadata verification, security-group
            role mapping, and JIT provisioning. Platform infrastructure, configured per tenant.
          </p>
        </div>
        <div className="self-center">
          <OpsTenantSelect
            tenants={tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
            selected={orgId}
            basePath="/ops/identity"
          />
        </div>
      </div>

      {!selected ? (
        <div className="card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Tenants</div>
          <h2 className="text-[15.5px] font-bold mb-3">Select a tenant to configure</h2>
          <ul className="flex flex-col divide-y divide-border/60">
            {tenants.map((t) => (
              <li key={t.id}>
                <a
                  href={`/ops/identity?org=${t.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:text-brand transition-colors"
                >
                  <span className="font-semibold">
                    {t.name}
                    <span className="block font-mono text-[10px] text-ink-faint">{t.slug}</span>
                  </span>
                  <span className="text-brand text-xs font-semibold">Configure →</span>
                </a>
              </li>
            ))}
            {tenants.length === 0 && (
              <li className="py-3 text-ink-muted text-sm">No tenants provisioned yet.</li>
            )}
          </ul>
        </div>
      ) : (
        <IdentityFederationPanel
          organizationId={selected.id}
          tenantName={selected.name}
          idp={idp}
          practices={practices}
        />
      )}
    </>
  );
}
