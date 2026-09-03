/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Just-In-Time provisioning — pure decision core. Given the current state
 * (does the user exist? do they already have a membership in this tenant?)
 * and a resolved federated role, `computeJitOutcome` returns the plan the
 * DB orchestrator (src/server/services/identity-jit.ts) then applies inside
 * one transaction.
 */
import type { DeliveryAccessRole, MembershipRole } from '@prisma/client';
import type { ResolvedFederatedRole } from './mapping';

export interface JitInputs {
  /** null → no A2R user with this email yet. */
  existingUser: { id: string; name: string | null } | null;
  /** The user's current membership in THIS tenant, if any. */
  existingMembership: {
    role: MembershipRole;
    deliveryRole: DeliveryAccessRole | null;
    provisionedVia: 'MANUAL' | 'SSO_JIT';
  } | null;
  resolvedRole: ResolvedFederatedRole;
  /** IdP.jitEnabled — off means "federate identity, but never create or
   * re-role memberships automatically". */
  jitEnabled: boolean;
}

export type JitAction =
  /** Create the User row, then a fresh SSO_JIT membership. */
  | { kind: 'create-user-and-membership' }
  /** User exists; create their first membership in this tenant. */
  | { kind: 'create-membership' }
  /** Membership exists and its role drifted from the mapping — re-sync. */
  | { kind: 'update-membership-role'; from: { role: MembershipRole; deliveryRole: DeliveryAccessRole | null } }
  /** Membership exists and matches (or is MANUAL and left alone) — just stamp lastJitSyncAt. */
  | { kind: 'touch-membership' }
  /** JIT disabled and the user has no membership here — login federates
   * identity but grants no tenant access. */
  | { kind: 'deny-no-membership' };

export interface JitOutcome {
  action: JitAction;
  /** The role the membership should end up at (for create / update). */
  targetRole: { role: MembershipRole; deliveryRole: DeliveryAccessRole };
  createsUser: boolean;
  /** True when a membership is created or its role changes — worth an
   * activity-log + ledger entry. */
  mutatesAccess: boolean;
}

export function computeJitOutcome(input: JitInputs): JitOutcome {
  const target = {
    role: input.resolvedRole.membershipRole,
    deliveryRole: input.resolvedRole.deliveryRole,
  };

  // No membership in this tenant.
  if (!input.existingMembership) {
    if (!input.jitEnabled) {
      return { action: { kind: 'deny-no-membership' }, targetRole: target, createsUser: false, mutatesAccess: false };
    }
    if (!input.existingUser) {
      return {
        action: { kind: 'create-user-and-membership' },
        targetRole: target,
        createsUser: true,
        mutatesAccess: true,
      };
    }
    return { action: { kind: 'create-membership' }, targetRole: target, createsUser: false, mutatesAccess: true };
  }

  // Membership exists. A MANUALLY-managed membership is never re-roled by
  // JIT — an admin's explicit assignment wins. Only memberships this IdP
  // provisioned stay in sync with the group mapping.
  const m = input.existingMembership;
  const drifted = m.role !== target.role || m.deliveryRole !== target.deliveryRole;

  if (input.jitEnabled && m.provisionedVia === 'SSO_JIT' && drifted) {
    return {
      action: { kind: 'update-membership-role', from: { role: m.role, deliveryRole: m.deliveryRole } },
      targetRole: target,
      createsUser: false,
      mutatesAccess: true,
    };
  }

  return { action: { kind: 'touch-membership' }, targetRole: target, createsUser: false, mutatesAccess: false };
}
