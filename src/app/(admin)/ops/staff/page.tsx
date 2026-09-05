import type { Metadata } from 'next';
import { requireOpsContext } from '@/lib/ops-auth';
import { listActiveStaffGrants } from '@/lib/ops/staff-grants';
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
  const ops = await requireOpsContext();
  const grants = await listActiveStaffGrants();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Staff Access</h1>
        <p className="text-ink-muted text-sm mt-1">
          Every account that can reach this Operator Control Plane. Access is an explicit grant tied to a
          specific user — there is no email-domain shortcut. A revoke takes effect immediately.
        </p>
      </div>

      <StaffAccessManager grants={grants} currentUserEmail={ops.email} />
    </>
  );
}
