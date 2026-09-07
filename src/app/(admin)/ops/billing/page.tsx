import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { listTenants } from '@/server/queries/ops-telemetry';

export const metadata: Metadata = { title: 'Billing · A2R Ops' };

const TIER_LABEL: Record<string, string> = { TRIAL: 'Trial', STANDARD: 'Standard', ENTERPRISE: 'Enterprise' };
const TIER_CLS: Record<string, string> = {
  TRIAL: 'text-ink-muted border-border',
  STANDARD: 'text-brand border-brand/40 bg-brand/10',
  ENTERPRISE: 'text-success border-success/40 bg-success/10',
};

/**
 * A2R Operator Control Plane — Billing / Finance (v1.16.0).
 *
 * Subscription and contract-tier records per tenant. There is no invoicing
 * engine in this build yet; this is the read surface for the BILLING role
 * over what exists — `Organization.contractTier`, lifecycle status, seat
 * count, and provisioning date.
 */
export default async function OpsBillingPage() {
  await requireOpsCapability('billing:view');
  const tenants = await listTenants();

  const byTier = tenants.reduce<Record<string, number>>((acc, t) => {
    acc[t.contractTier] = (acc[t.contractTier] ?? 0) + 1;
    return acc;
  }, {});
  const activeSeats = tenants.filter((t) => t.status === 'ACTIVE').reduce((n, t) => n + t.activeUsers, 0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Billing &amp; Finance</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Subscription tier, lifecycle status, and seat count for every client organization. Invoicing
          records are not yet modelled — this is the read surface over contract state.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['TRIAL', 'STANDARD', 'ENTERPRISE'] as const).map((tier) => (
          <div key={tier} className="card">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{TIER_LABEL[tier]}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{byTier[tier] ?? 0}</div>
            <div className="text-[11px] text-ink-faint">tenants</div>
          </div>
        ))}
        <div className="card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Active seats</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{activeSeats}</div>
          <div className="text-[11px] text-ink-faint">across live tenants</div>
        </div>
      </div>

      <section className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Tenant</th>
                <th className="py-2 pr-4">Tier</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Seats</th>
                <th className="py-2 pr-4">Since</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-semibold">
                    {t.name}
                    <span className="text-ink-faint font-normal"> · {t.slug}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`badge !py-0.5 !px-2 border ${TIER_CLS[t.contractTier]}`}>
                      {TIER_LABEL[t.contractTier]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{t.status.replace('_', ' ').toLowerCase()}</td>
                  <td className="py-2 pr-4 tabular-nums">{t.activeUsers}</td>
                  <td className="py-2 pr-4 text-ink-muted tabular-nums">{t.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
