import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { listElevationHistory } from '@/lib/ops/staff-elevation';
import { listActiveStaffGrants } from '@/lib/ops/staff-grants';
import { OPERATOR_ROLE_LABEL } from '@/lib/ops/operator-roles';

export const metadata: Metadata = { title: 'Audit & Compliance · A2R Ops' };

/**
 * A2R Operator Control Plane — Auditor / Compliance (v1.16.0).
 *
 * Read-only view of the operator-side audit trail: who currently holds
 * operator access (and at what role), and every Just-In-Time privilege
 * elevation — who, why, how long, whether a second factor was proven.
 * Per-tenant immutable ledgers live inside each tenant workspace
 * (`/admin/audit-log`, reachable via impersonation).
 */
export default async function OpsAuditPage() {
  await requireOpsCapability('audit:view');
  const [elevations, grants] = await Promise.all([listElevationHistory(75), listActiveStaffGrants()]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Audit &amp; Compliance</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          The operator-side audit trail. Read-only. Per-tenant hash-chained ledgers are inside each client
          workspace (Admin → Audit Log).
        </p>
      </div>

      <section className="card">
        <h2 className="text-[15.5px] font-bold mb-1">Operators with active access ({grants.length})</h2>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Granted</th>
                <th className="py-2 pr-4">By</th>
                <th className="py-2 pr-4">Reason</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-semibold">{g.userEmail}</td>
                  <td className="py-2 pr-4 text-ink-muted">{OPERATOR_ROLE_LABEL[g.role]}</td>
                  <td className="py-2 pr-4 text-ink-muted tabular-nums">{g.grantedAt.slice(0, 10)}</td>
                  <td className="py-2 pr-4 text-ink-faint">{g.grantedByEmail ?? 'seed'}</td>
                  <td className="py-2 pr-4 text-ink-muted max-w-[28ch] truncate" title={g.reason}>{g.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" id="jit-elevation-log">
        <h2 className="text-[15.5px] font-bold mb-1">Just-In-Time elevations</h2>
        <p className="text-[12.5px] text-ink-muted mb-3">
          Every temporary privilege elevation. Auto-expiring; no standing privileged sessions.
        </p>
        {elevations.length === 0 ? (
          <p className="text-ink-muted text-sm">No elevations recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Operator</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2 pr-4">Expires</th>
                  <th className="py-2 pr-4">State</th>
                </tr>
              </thead>
              <tbody>
                {elevations.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-semibold">{e.userEmail}</td>
                    <td className="py-2 pr-4 text-ink-muted max-w-[30ch] truncate" title={e.reason}>{e.reason}</td>
                    <td className="py-2 pr-4 text-ink-muted tabular-nums">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-ink-muted tabular-nums">{new Date(e.expiresAt).toLocaleString()}</td>
                    <td className="py-2 pr-4">
                      {e.active ? (
                        <span className="badge !py-0.5 !px-2 !text-success !border-success/40">
                          <span className="status-dot bg-success" />
                          Active
                        </span>
                      ) : (
                        <span className="text-ink-faint">
                          {e.endedReason === 'operator'
                            ? 'Dropped'
                            : e.endedReason === 'superseded'
                              ? 'Superseded'
                              : 'Expired'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
