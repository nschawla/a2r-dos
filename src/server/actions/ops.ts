'use server';

import { z } from 'zod';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getOpsContextOrNull, type OpsContext } from '@/lib/ops-auth';
import { seedOrganizationDefaults } from '@/lib/tenant/defaults';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import {
  applyTenantLifecycle,
  startImpersonation,
  endImpersonation,
  IMPERSONATION_COOKIE,
  type TenantLifecycleState,
} from '@/lib/ops/tenant-management';
import { buildTenantExportPackage, executePurgeProtocol, type TenantExportPackage, type DestructionCertificate } from '@/lib/ops/data-sovereignty';
import { issueApiKey, revokeApiKey, type IssuedApiKey } from '@/lib/ops/api-keys';

function actorOf(ops: OpsContext) {
  return { userId: ops.userId, email: ops.email, name: ops.name };
}

export type OpsResult = { ok: true } | { ok: false; error: string };
export type OpsDataResult<T> = { ok: true; data: T } | { ok: false; error: string };

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tenant'
  );
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

/** URL-safe, ~16-char one-time password handed back to the operator to
 * relay to the new tenant admin (there is no outbound email in this build,
 * so the "invite" is: create the account + surface a temp credential once). */
function generateTempPassword(): string {
  return randomBytes(12).toString('base64url');
}

const provisionSchema = z.object({
  orgName: z.string().min(2, 'Organization name is too short').max(120),
  contractTier: z.enum(['TRIAL', 'STANDARD', 'ENTERPRISE']).default('STANDARD'),
  adminName: z.string().min(1, 'Admin name is required').max(120),
  adminEmail: z.string().email('Enter a valid admin email'),
});

export interface ProvisionedTenant {
  organizationId: string;
  organizationSlug: string;
  adminEmail: string;
  /** Shown to the operator exactly once — not stored anywhere in plaintext. */
  tempPassword: string;
}

/**
 * A2R Operator Control Plane — provision a brand-new client tenant:
 *   1. the Organization (ACTIVE, on the chosen contract tier),
 *   2. its initial admin User + OWNER Membership (a one-time temp password
 *      is returned for the operator to relay — the "invite"),
 *   3. the default templates (governance policy, control labels, practice
 *      & rate-card roster — see src/lib/tenant/defaults.ts).
 * All in one transaction; nothing is half-created on failure.
 */
export async function provisionTenant(input: unknown): Promise<OpsDataResult<ProvisionedTenant>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = provisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { orgName, contractTier, adminName, adminEmail } = parsed.data;
  const normalizedEmail = adminEmail.toLowerCase().trim();

  const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return { ok: false, error: 'A user with that email already exists. Add them to a tenant from the DB, or use a different admin email.' };
  }

  const slug = await uniqueSlug(orgName);
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const organizationId = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: orgName, slug, contractTier, status: 'ACTIVE' },
    });
    const admin = await tx.user.create({
      // The operator set this password — force the admin to pick their own
      // on first sign-in (src/middleware.ts → /change-password).
      data: { email: normalizedEmail, name: adminName, passwordHash, mustChangePassword: true },
    });
    await tx.membership.create({
      data: { userId: admin.id, organizationId: org.id, role: 'OWNER', deliveryRole: 'ADMIN' },
    });
    await seedOrganizationDefaults(tx, org.id);
    await tx.activityLogEntry.create({
      data: {
        organizationId: org.id,
        userId: admin.id,
        text: `Tenant provisioned by A2R operator ${ops.name} — admin invite issued to ${normalizedEmail}`,
        tab: 'home',
      },
    });
    return org.id;
  });

  revalidatePath('/ops/tenants');
  revalidatePath('/ops/telemetry');

  return {
    ok: true,
    data: { organizationId, organizationSlug: slug, adminEmail: normalizedEmail, tempPassword },
  };
}

const statusSchema = z.object({
  organizationId: z.string().min(1),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'GRACE_PERIOD']),
});

/**
 * Move a tenant between lifecycle states (Active / Suspended / Grace
 * Period). Delegates to the Tenant Fleet Management service, which records
 * a TENANT_LIFECYCLE_CHANGE ledger entry on the affected tenant's chain.
 * SUSPENDED locks non-staff members out; GRACE_PERIOD leaves it read-only
 * — both enforced in src/app/(dashboard)/layout.tsx + src/server/authz.ts.
 */
export async function setTenantStatus(input: unknown): Promise<OpsResult> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const result = await applyTenantLifecycle(db, {
    organizationId: parsed.data.organizationId,
    to: parsed.data.status as TenantLifecycleState,
    actor: actorOf(ops),
  });
  if (!result.ok) return { ok: false, error: result.error ?? 'Lifecycle change failed.' };

  revalidatePath('/ops/tenants');
  revalidatePath('/ops/telemetry');
  return { ok: true };
}

// ─────────────────────────────────────────── Impersonation Gateway

const impersonateSchema = z.object({
  organizationId: z.string().min(1),
  reason: z.string().min(4, 'A short reason is required for the audit record').max(500),
});

export interface ImpersonationStarted {
  organizationSlug: string;
  organizationName: string;
  expiresAt: string;
}

/**
 * Start a read-only impersonation session for a tenant. Writes an
 * ADMIN_IMPERSONATION_ACCESS entry to that tenant's Immutable Audit
 * Ledger, then sets the `a2r_impersonation` cookie — the operator is now
 * inside the tenant workspace (read-only) until they exit or it expires.
 */
export async function impersonateTenant(input: unknown): Promise<OpsDataResult<ImpersonationStarted>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = impersonateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const result = await startImpersonation(db, {
    organizationId: parsed.data.organizationId,
    reason: parsed.data.reason,
    actor: actorOf(ops),
  });
  if (!result.ok) return { ok: false, error: result.error };

  cookies().set(IMPERSONATION_COOKIE, result.session.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: result.session.expiresAt,
  });

  revalidatePath('/ops/tenants');
  return {
    ok: true,
    data: {
      organizationSlug: result.session.organizationSlug,
      organizationName: result.session.organizationName,
      expiresAt: result.session.expiresAt.toISOString(),
    },
  };
}

/** End the current impersonation session (from the workspace banner). */
export async function endImpersonationAction(): Promise<OpsResult> {
  const token = cookies().get(IMPERSONATION_COOKIE)?.value;
  if (token) await endImpersonation(token);
  cookies().delete(IMPERSONATION_COOKIE);
  return { ok: true };
}

// ─────────────────────────────────────────── Data Sovereignty & Offboarding

const tenantConfirmSchema = z.object({
  organizationId: z.string().min(1),
  confirmName: z.string().min(1),
});

async function assertConfirmedTenant(
  organizationId: string,
  confirmName: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  if (!org) return { ok: false, error: 'Tenant not found.' };
  if (confirmName.trim() !== org.name) {
    return { ok: false, error: `Confirmation text must exactly match the tenant name ("${org.name}").` };
  }
  return { ok: true, name: org.name };
}

export interface TenantExportResult {
  manifest: TenantExportPackage['manifest'];
  /** the full bundle, JSON-serialized — the client offers it as a download */
  bundleJson: string;
}

/**
 * Generate a cryptographic data-export package for a tenant. Requires the
 * operator to have typed the tenant name to confirm. Writes a
 * TENANT_DATA_EXPORT ledger entry.
 */
export async function exportTenantData(input: unknown): Promise<OpsDataResult<TenantExportResult>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = tenantConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const confirmed = await assertConfirmedTenant(parsed.data.organizationId, parsed.data.confirmName);
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  const built = await buildTenantExportPackage(parsed.data.organizationId, ops.email);
  if (!built.ok) return { ok: false, error: built.error };

  await db.organization.update({
    where: { id: parsed.data.organizationId },
    data: { dataExportedAt: new Date() },
  });
  await recordLedgerEvent(db, {
    organizationId: parsed.data.organizationId,
    actorId: ops.userId,
    actionType: 'TENANT_DATA_EXPORT',
    targetResource: `Organization:${parsed.data.organizationId}`,
    metadata: {
      tenant: confirmed.name,
      operator: ops.email,
      payloadDigest: built.package.manifest.payloadDigest,
      recordCounts: built.package.manifest.recordCounts,
    },
  });

  revalidatePath('/ops/tenants');
  return {
    ok: true,
    data: { manifest: built.package.manifest, bundleJson: JSON.stringify(built.package, null, 2) },
  };
}

export interface TenantPurgeResult {
  certificate: DestructionCertificate;
  certificateJson: string;
}

/**
 * Execute the Purge Protocol — soft-deletes the tenant, ends any live
 * impersonation, snapshots a final export, writes TENANT_PURGE_EXECUTED to
 * the ledger, and returns a self-sealed Certificate of Destruction.
 * Requires the operator to type the tenant name to confirm.
 */
export async function purgeTenant(input: unknown): Promise<OpsDataResult<TenantPurgeResult>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = tenantConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const confirmed = await assertConfirmedTenant(parsed.data.organizationId, parsed.data.confirmName);
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  const result = await executePurgeProtocol({ organizationId: parsed.data.organizationId, actor: actorOf(ops) });
  if (!result.ok) return { ok: false, error: result.error };

  // NOTE: no revalidatePath here — it would re-render /ops/tenants and
  // unmount the modal (the purged row is gone) before the operator can
  // read the certificate. The client refreshes on modal close instead.
  return {
    ok: true,
    data: { certificate: result.certificate, certificateJson: JSON.stringify(result.certificate, null, 2) },
  };
}

// ─────────────────────────────────────────── Data Ingestion API keys

const issueKeySchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2, 'A key name is required').max(120),
  expiresInDays: z.coerce.number().int().positive().max(3650).nullable().optional(),
});

/** Mint a tenant-scoped API key (returns the plaintext exactly once). */
export async function issueTenantApiKey(input: unknown): Promise<OpsDataResult<IssuedApiKey>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = issueKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const result = await issueApiKey(db, {
    organizationId: parsed.data.organizationId,
    name: parsed.data.name,
    createdByEmail: ops.email,
    expiresInDays: parsed.data.expiresInDays ?? null,
    actorId: ops.userId,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/ops/tenants');
  revalidatePath('/admin/audit-log');
  return { ok: true, data: result.key };
}

export async function revokeTenantApiKey(input: unknown): Promise<OpsResult> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const parsed = z.object({ apiKeyId: z.string().min(1), organizationId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const result = await revokeApiKey(db, { ...parsed.data, actorId: ops.userId });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/ops/tenants');
  return { ok: true };
}

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdByEmail: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** List a tenant's API keys (metadata only — no secrets). */
export async function listTenantApiKeys(organizationId: string): Promise<OpsDataResult<ApiKeyRow[]>> {
  const ops = await getOpsContextOrNull();
  if (!ops) return { ok: false, error: 'Not authorized.' };

  const keys = await db.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdByEmail: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return {
    ok: true,
    data: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdByEmail: k.createdByEmail,
      createdAt: k.createdAt.toISOString(),
      expiresAt: k.expiresAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
    })),
  };
}
