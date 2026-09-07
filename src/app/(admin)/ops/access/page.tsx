import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { listActiveStaffGrants } from '@/lib/ops/staff-grants';
import { OperatorAccessManager } from '@/components/ops/OperatorAccessManager';

export const metadata: Metadata = { title: 'Role & Access · A2R Ops' };

/**
 * A2R Operator Control Plane — Role & Access Management (v1.16.0).
 *
 * View and change operator roles. A change needs `roles:manage`
 * (SUPER_ADMIN) plus a live JIT elevation. Grant / revoke of the
 * entitlement itself stays on /ops/staff.
 */
export default async function OpsAccessPage() {
  const ops = await requireOpsCapability('roles:manage');
  const grants = await listActiveStaffGrants();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Role &amp; Access</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          The A2R organizational roles and what each one may reach in this console. Granting or revoking
          operator access is on <span className="text-ink">Staff Access</span>; this page changes the role
          of an account that already holds it.
        </p>
      </div>

      <OperatorAccessManager
        operators={grants.map((g) => ({
          userId: g.userId,
          userEmail: g.userEmail,
          userName: g.userName,
          role: g.role,
        }))}
        currentUserId={ops.userId}
      />
    </>
  );
}
