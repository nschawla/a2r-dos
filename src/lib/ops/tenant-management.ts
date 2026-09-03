/**
 * Super-Admin — Tenant Fleet Management Service.
 *
 * Backend for the /ops "Manage tenants" view: the tenant lifecycle state
 * machine and the Impersonation Gateway. Every consequential action is
 * written to the affected tenant's Immutable Audit Ledger.
 *
 * Nothing here handles cookies or HTTP — the ops Server Actions
 * (src/server/actions/ops.ts) own that; this module is the pure service
 * layer so it can be unit-tested and reused.
 */
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { recordLedgerEvent, type LedgerDbClient } from '@/lib/audit-ledger';
import { TENANT_STATE, type TenantLifecycleState } from '@/lib/ops/tenant-lifecycle';

export { TENANT_STATE, canTransition, type TenantLifecycleState, type TenantStateDescriptor } from '@/lib/ops/tenant-lifecycle';

export interface LifecycleActor {
  userId: string;
  email: string;
  name: string;
}

export interface ApplyLifecycleResult {
  ok: boolean;
  error?: string;
  from?: TenantLifecycleState;
  to?: TenantLifecycleState;
}

/**
 * Moves a tenant between lifecycle states, records the activity + a
 * TENANT_LIFECYCLE_CHANGE ledger entry, and returns the transition.
 */
export async function applyTenantLifecycle(
  client: LedgerDbClient,
  input: { organizationId: string; to: TenantLifecycleState; actor: LifecycleActor }
): Promise<ApplyLifecycleResult> {
  const org = await client.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, status: true, purgedAt: true },
  });
  if (!org) return { ok: false, error: 'Tenant not found.' };
  if (org.purgedAt) return { ok: false, error: 'Tenant has been purged and can no longer be modified.' };

  const from = org.status as TenantLifecycleState;
  if (from === input.to) return { ok: false, error: `Tenant is already ${TENANT_STATE[input.to].label}.` };

  await client.organization.update({ where: { id: org.id }, data: { status: input.to } });
  await client.activityLogEntry.create({
    data: {
      organizationId: org.id,
      text: `Lifecycle: ${TENANT_STATE[from].label} → ${TENANT_STATE[input.to].label} by A2R operator ${input.actor.name}`,
      tab: 'home',
    },
  });
  await recordLedgerEvent(client, {
    organizationId: org.id,
    actorId: input.actor.userId,
    actionType: 'TENANT_LIFECYCLE_CHANGE',
    targetResource: `Organization:${org.id}`,
    metadata: { tenant: org.name, from, to: input.to, operator: input.actor.email },
  });

  return { ok: true, from, to: input.to };
}

// ─────────────────────────────────────────────── Impersonation Gateway

export const IMPERSONATION_COOKIE = 'a2r_impersonation';
export const IMPERSONATION_TTL_MINUTES = 20;

export interface ImpersonationSession {
  grantId: string;
  token: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  actorEmail: string;
  readOnly: boolean;
  expiresAt: Date;
}

/**
 * Mints a short-lived, read-only impersonation grant for `organizationId`
 * and records an ADMIN_IMPERSONATION_ACCESS entry on that tenant's ledger.
 * The returned token is what the ops action drops into the
 * `a2r_impersonation` cookie.
 */
export async function startImpersonation(
  client: LedgerDbClient,
  input: { organizationId: string; reason: string; actor: LifecycleActor }
): Promise<{ ok: true; session: ImpersonationSession } | { ok: false; error: string }> {
  const org = await client.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, slug: true, purgedAt: true },
  });
  if (!org) return { ok: false, error: 'Tenant not found.' };
  if (org.purgedAt) return { ok: false, error: 'Tenant has been purged — impersonation is not available.' };

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60_000);

  const grant = await client.impersonationGrant.create({
    data: {
      token,
      actorId: input.actor.userId,
      organizationId: org.id,
      reason: input.reason.slice(0, 500),
      readOnly: true,
      expiresAt,
    },
    select: { id: true },
  });

  await recordLedgerEvent(client, {
    organizationId: org.id,
    actorId: input.actor.userId,
    actionType: 'ADMIN_IMPERSONATION_ACCESS',
    targetResource: `Organization:${org.id}`,
    metadata: {
      tenant: org.name,
      operator: input.actor.email,
      reason: input.reason.slice(0, 500),
      readOnly: true,
      expiresAt: expiresAt.toISOString(),
      grantId: grant.id,
    },
  });

  return {
    ok: true,
    session: {
      grantId: grant.id,
      token,
      organizationId: org.id,
      organizationSlug: org.slug,
      organizationName: org.name,
      actorEmail: input.actor.email,
      readOnly: true,
      expiresAt,
    },
  };
}

/** Validates a token from the impersonation cookie. Returns the live
 * session or null (expired / ended / unknown / tenant purged). */
export async function resolveImpersonation(token: string): Promise<ImpersonationSession | null> {
  if (!token) return null;
  const grant = await db.impersonationGrant.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, slug: true, purgedAt: true } } },
  });
  if (!grant || grant.endedAt || grant.expiresAt.getTime() < Date.now() || grant.organization.purgedAt) return null;
  return {
    grantId: grant.id,
    token: grant.token,
    organizationId: grant.organizationId,
    organizationSlug: grant.organization.slug,
    organizationName: grant.organization.name,
    actorEmail: '', // resolved from session where needed
    readOnly: grant.readOnly,
    expiresAt: grant.expiresAt,
  };
}

/** Ends an impersonation grant (idempotent). */
export async function endImpersonation(token: string): Promise<void> {
  if (!token) return;
  await db.impersonationGrant.updateMany({
    where: { token, endedAt: null },
    data: { endedAt: new Date() },
  });
}
