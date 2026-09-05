/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Federated-login orchestrator — the single entry point a SAML assertion
 * handler or OIDC callback route calls once it has validated an assertion
 * and extracted the identity. It:
 *
 *   1. resolves the delivery / membership role from the tenant's
 *      security-group mappings (src/lib/identity/mapping.ts),
 *   2. computes the JIT plan (src/lib/identity/jit.ts),
 *   3. applies it in one transaction — creating the User and/or Membership,
 *      re-syncing a drifted SSO-provisioned role, stamping lastJitSyncAt,
 *   4. writes an activity-log line and a GOVERNANCE-grade ledger event when
 *      access actually changed.
 *
 * The live IdP handshake (redirect, assertion signature validation against
 * the stored certificate / JWKS) is the follow-on integration; this module
 * is protocol-agnostic and takes an already-verified identity.
 */
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import { resolveFederatedRole, type GroupMappingRule } from '@/lib/identity/mapping';
import { computeJitOutcome } from '@/lib/identity/jit';

export interface VerifiedFederatedIdentity {
  organizationId: string;
  email: string;
  name: string | null;
  /** Raw group / role claim values from the assertion. */
  groups: string[];
}

export type FederatedLoginResult =
  | { ok: true; userId: string; membershipCreated: boolean; roleSynced: boolean }
  | { ok: false; reason: 'no-idp' | 'idp-disabled' | 'no-tenant-access'; message: string };

export async function applyFederatedLogin(
  identity: VerifiedFederatedIdentity
): Promise<FederatedLoginResult> {
  // The SSO callback runs before any session/tenant is resolved, so the
  // org-scope Prisma extension has no scope to pin to. Every read and write
  // below is explicitly keyed to identity.organizationId (which came from a
  // signature-verified assertion), so run the whole flow unscoped.
  return runUnscoped('sso-jit', () => applyFederatedLoginInner(identity));
}

async function applyFederatedLoginInner(
  identity: VerifiedFederatedIdentity
): Promise<FederatedLoginResult> {
  const email = identity.email.toLowerCase().trim();

  const idp = await db.identityProvider.findUnique({
    where: { organizationId: identity.organizationId },
    include: { groupMappings: true },
  });
  if (!idp) return { ok: false, reason: 'no-idp', message: 'This organization has no identity provider configured.' };
  if (!idp.enabled) return { ok: false, reason: 'idp-disabled', message: 'Identity federation is not enabled for this organization.' };

  const rules: GroupMappingRule[] = idp.groupMappings.map((m) => ({
    claimValue: m.claimValue,
    deliveryRole: m.deliveryRole,
    membershipRole: m.membershipRole,
    practiceId: m.practiceId,
    priority: m.priority,
  }));
  const resolvedRole = resolveFederatedRole(identity.groups, rules, {
    deliveryRole: idp.defaultDeliveryRole,
    membershipRole: idp.defaultMembershipRole,
  });

  const [existingUser, existingMembership] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true, name: true } }),
    db.user
      .findUnique({ where: { email }, select: { id: true } })
      .then((u) =>
        u
          ? db.membership.findUnique({
              where: { userId_organizationId: { userId: u.id, organizationId: identity.organizationId } },
              select: { role: true, deliveryRole: true, provisionedVia: true },
            })
          : null
      ),
  ]);

  const outcome = computeJitOutcome({
    existingUser,
    existingMembership: existingMembership
      ? {
          role: existingMembership.role,
          deliveryRole: existingMembership.deliveryRole,
          provisionedVia: existingMembership.provisionedVia,
        }
      : null,
    resolvedRole,
    jitEnabled: idp.jitEnabled,
  });

  if (outcome.action.kind === 'deny-no-membership') {
    return {
      ok: false,
      reason: 'no-tenant-access',
      message: 'Your account is not a member of this workspace and just-in-time provisioning is disabled.',
    };
  }

  const now = new Date();
  let membershipCreated = false;
  let roleSynced = false;

  const userId = await db.$transaction(async (tx) => {
    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: { name: existingUser.name ?? identity.name ?? undefined },
          select: { id: true },
        })
      : await tx.user.create({
          data: { email, name: identity.name ?? undefined },
          select: { id: true },
        });

    if (outcome.action.kind === 'create-user-and-membership' || outcome.action.kind === 'create-membership') {
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: identity.organizationId,
          role: outcome.targetRole.role,
          deliveryRole: outcome.targetRole.deliveryRole,
          provisionedVia: 'SSO_JIT',
          lastJitSyncAt: now,
        },
      });
      membershipCreated = true;
    } else if (outcome.action.kind === 'update-membership-role') {
      await tx.membership.update({
        where: { userId_organizationId: { userId: user.id, organizationId: identity.organizationId } },
        data: {
          role: outcome.targetRole.role,
          deliveryRole: outcome.targetRole.deliveryRole,
          provisionedVia: 'SSO_JIT',
          lastJitSyncAt: now,
        },
      });
      roleSynced = true;
    } else {
      await tx.membership.update({
        where: { userId_organizationId: { userId: user.id, organizationId: identity.organizationId } },
        data: { lastJitSyncAt: now },
      });
    }

    if (outcome.mutatesAccess) {
      const verb = membershipCreated ? 'provisioned' : 'role re-synced for';
      await tx.activityLogEntry.create({
        data: {
          organizationId: identity.organizationId,
          userId: user.id,
          text: `SSO ${verb} ${email} → ${outcome.targetRole.role} / ${outcome.targetRole.deliveryRole}${
            resolvedRole.matchedClaim ? ` (group "${resolvedRole.matchedClaim}")` : ' (default role)'
          }`,
          tab: 'home',
        },
      });
    }

    return user.id;
  });

  if (outcome.mutatesAccess) {
    await recordLedgerEvent(db, {
      organizationId: identity.organizationId,
      actorId: userId,
      actionType: 'SSO_JIT_PROVISION',
      targetResource: `Membership:${userId}:${identity.organizationId}`,
      metadata: {
        email,
        action: outcome.action.kind,
        matchedClaim: resolvedRole.matchedClaim,
        role: outcome.targetRole.role,
        deliveryRole: outcome.targetRole.deliveryRole,
        ...(outcome.action.kind === 'update-membership-role' ? { from: outcome.action.from } : {}),
      },
    });
  }

  return { ok: true, userId, membershipCreated, roleSynced };
}
