import type { DeliveryAccessRole, MembershipRole, OrgStatus } from '@prisma/client';
import 'next-auth';
import 'next-auth/jwt';

export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  /** Tenant lifecycle state — SUSPENDED locks non-staff members out of the
   * client workspace (see src/app/(dashboard)/layout.tsx). Refreshed every
   * request with the rest of this array. */
  organizationStatus: OrgStatus;
  role: MembershipRole;
  /** WP4 real RBAC tier for this membership. Null when unset — see
   * src/lib/auth/rbac.ts#resolveDeliveryRole() for the fallback used in
   * that case. Refreshed every request along with the rest of this array
   * (see src/lib/auth.ts's jwt callback), so an admin's role change is
   * visible without forcing a re-login. */
  deliveryRole: DeliveryAccessRole | null;
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** A2R Operator Control Plane — true for accounts holding an explicit,
       * un-revoked `staff_grants` entitlement. Resolved live in the jwt
       * callback each request (hasActiveStaffGrant); src/lib/ops-auth.ts
       * re-checks the table directly. No email-domain shortcut. */
      isA2rStaff: boolean;
      /** True while the account's password was set by someone else and the
       * user must pick their own. src/middleware.ts forces them to
       * /change-password until changePasswordAction clears it. Refreshed
       * every request with the rest of the token. */
      mustChangePassword: boolean;
    };
    memberships: SessionMembership[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    isA2rStaff?: boolean;
    mustChangePassword?: boolean;
    memberships?: SessionMembership[];
  }
}
