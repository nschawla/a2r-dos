import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { listActiveStaffGrants } from '@/lib/ops/staff-grants';
import { listElevationHistory } from '@/lib/ops/staff-elevation';
import { StaffAccessManager } from '@/components/ops/StaffAccessManager';

export const metadata: Metadata = {
  title: 'Staff Access · A2R Ops',
};

/**
 * A2R Operator Control Plane — who holds internal /ops access, and the
 * only place to grant or revoke it.
 *
 * P0 #2: this replaced the `User.isA2rStaff` boolean and the
 * `@a2rventures.com` email wildcard. Access is now one explicit,
 * attributed, revocable `staff_grants` row per operator.
 */
export default async function OpsStaffAccessPage() {
  const ops = await requireOpsCapability('staff:manage');
  const [grants, elevations] = await Promise.all([
    listActiveStaffGrants(),
    listElevationHistory(25),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Staff Access</h1>
        <p className="text-ink-muted text-sm mt-1">
          Every account that can reach this Operator Control Plane. Access is an explicit grant tied to a
          specific user — there is no email-domain shortcut. A revoke takes effect immediately. A standing
          grant is only <em>eligibility</em>; every privileged operation runs under a Just-In-Time elevation
          (below).
        </p>
      </div>

      <StaffAccessManager grants={grants} currentUserEmail={ops.email} />

      <section className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
          Audit trail
        </div>
        <h2 className="text-[15.5px] font-bold mb-1">Just-In-Time elevations</h2>
        <p className="text-[12.5px] text-ink-muted mb-4">
          Every temporary privilege elevation — who, why, for how long. Elevations auto-expire; there are no
          standing privileged sessions.
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
                    <td className="py-2 pr-4 text-ink-muted max-w-[28ch] truncate" title={e.reason}>
                      {e.reason}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted tabular-nums">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted tabular-nums">
                      {new Date(e.expiresAt).toLocaleString()}
                    </td>
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
