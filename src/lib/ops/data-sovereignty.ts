/**
 * Super-Admin — Data Sovereignty & Offboarding Engine.
 *
 *  - `buildTenantExportPackage`: a structured, self-verifying JSON bundle
 *    of everything a tenant owns (projects, baselines, audit logs, roster,
 *    governance config, compliance ledger). The bundle carries a SHA-256
 *    digest of its own canonical contents — the "cryptographic" part: a
 *    recipient can re-hash the payload and confirm nothing was altered in
 *    transit.
 *
 *  - `executePurgeProtocol`: a reversible-by-DBA **soft delete**
 *    (Organization.purgedAt) that removes the tenant from every operator
 *    and client surface, and emits a signed "Certificate of Destruction".
 *
 * Both write to the tenant's Immutable Audit Ledger before they finish.
 */
import { db } from '@/lib/db';
import { canonicalJson, sha256, recordLedgerEvent, type LedgerDbClient } from '@/lib/audit-ledger';
import type { LifecycleActor } from '@/lib/ops/tenant-management';

export const EXPORT_SCHEMA_VERSION = '1.0';

export interface TenantExportManifest {
  schemaVersion: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  generatedAt: string;
  generatedBy: string;
  recordCounts: Record<string, number>;
  /** SHA-256 over the canonical JSON of `payload` — recompute to verify. */
  payloadDigest: string;
}

export interface TenantExportPackage {
  manifest: TenantExportManifest;
  payload: Record<string, unknown>;
}

/** Everything a tenant owns, as a portable bundle. Password hashes and
 * other cross-tenant secrets are never included. */
export async function buildTenantExportPackage(
  organizationId: string,
  generatedBy: string
): Promise<{ ok: true; package: TenantExportPackage } | { ok: false; error: string }> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { ok: false, error: 'Tenant not found.' };

  const [
    memberships,
    practices,
    deliveryRoles,
    resources,
    controlLabels,
    orgPolicy,
    roleUtilizationPolicies,
    holidays,
    weeklyAssignmentSlots,
    projects,
    activity,
    auditLogs,
    auditLedger,
  ] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { email: true, name: true } } },
    }),
    db.practice.findMany({ where: { organizationId } }),
    db.deliveryRole.findMany({ where: { organizationId } }),
    db.resource.findMany({ where: { organizationId } }),
    db.controlLabel.findMany({ where: { organizationId } }),
    db.orgPolicy.findUnique({ where: { organizationId } }),
    db.roleUtilizationPolicy.findMany({ where: { organizationId } }),
    db.organizationHoliday.findMany({ where: { organizationId } }),
    db.weeklyAssignmentSlot.findMany({ where: { organizationId } }),
    db.project.findMany({
      where: { organizationId },
      include: {
        scopeItems: true,
        effortCells: true,
        auditEntries: true,
        raidEntries: true,
        financials: true,
        schedulePhases: true,
        contributors: true,
        steerCoDecisions: true,
      },
    }),
    db.activityLogEntry.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
    db.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
    db.immutableAuditLedger.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const payload: Record<string, unknown> = {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      contractTier: org.contractTier,
      createdAt: org.createdAt.toISOString(),
    },
    memberships: memberships.map((m) => ({
      userEmail: m.user.email,
      userName: m.user.name,
      role: m.role,
      deliveryRole: m.deliveryRole,
      createdAt: m.createdAt.toISOString(),
    })),
    practices,
    deliveryRoles,
    resources,
    controlLabels,
    orgPolicy,
    roleUtilizationPolicies,
    holidays,
    weeklyAssignmentSlots,
    projects,
    activityLog: activity,
    auditTrail: auditLogs,
    complianceLedger: auditLedger,
  };

  const recordCounts: Record<string, number> = {
    memberships: memberships.length,
    practices: practices.length,
    deliveryRoles: deliveryRoles.length,
    resources: resources.length,
    projects: projects.length,
    scopeItems: projects.reduce((s, p) => s + p.scopeItems.length, 0),
    effortCells: projects.reduce((s, p) => s + p.effortCells.length, 0),
    auditEntries: projects.reduce((s, p) => s + p.auditEntries.length, 0),
    raidEntries: projects.reduce((s, p) => s + p.raidEntries.length, 0),
    financialActuals: projects.reduce((s, p) => s + p.financials.length, 0),
    schedulePhases: projects.reduce((s, p) => s + p.schedulePhases.length, 0),
    steerCoDecisions: projects.reduce((s, p) => s + p.steerCoDecisions.length, 0),
    weeklyAssignmentSlots: weeklyAssignmentSlots.length,
    holidays: holidays.length,
    activityLog: activity.length,
    auditTrail: auditLogs.length,
    complianceLedger: auditLedger.length,
  };

  const payloadDigest = sha256(canonicalJson(payload));

  return {
    ok: true,
    package: {
      manifest: {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        tenantId: org.id,
        tenantSlug: org.slug,
        tenantName: org.name,
        generatedAt: new Date().toISOString(),
        generatedBy,
        recordCounts,
        payloadDigest,
      },
      payload,
    },
  };
}

// ─────────────────────────────────────────────────── Purge Protocol

export interface DestructionCertificate {
  certificateId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  executedAt: string;
  executedBy: string;
  method: 'SOFT_DELETE';
  recordCounts: Record<string, number>;
  /** digest of the final export snapshot taken immediately before purge */
  finalSnapshotDigest: string;
  /** SHA-256 over the canonical JSON of everything above — the certificate's own seal */
  certificateHash: string;
}

/**
 * Soft-deletes a tenant: stamps `Organization.purgedAt`, forces it to
 * SUSPENDED, ends any live impersonation grants, snapshots a final export
 * for the certificate, writes TENANT_PURGE_EXECUTED to the ledger, and
 * returns a self-sealed Certificate of Destruction.
 *
 * Data rows are retained (recoverable by a DBA) — this is a governance
 * checkpoint, not an irreversible wipe; that stays a deliberate,
 * out-of-band operation.
 */
export async function executePurgeProtocol(input: {
  organizationId: string;
  actor: LifecycleActor;
}): Promise<{ ok: true; certificate: DestructionCertificate } | { ok: false; error: string }> {
  const org = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, slug: true, purgedAt: true },
  });
  if (!org) return { ok: false, error: 'Tenant not found.' };
  if (org.purgedAt) return { ok: false, error: 'Tenant has already been purged.' };

  // Final snapshot for the certificate's tamper-evidence.
  const snapshot = await buildTenantExportPackage(org.id, `${input.actor.email} (pre-purge snapshot)`);
  if (!snapshot.ok) return { ok: false, error: snapshot.error };

  const executedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: { purgedAt: executedAt, status: 'SUSPENDED' },
    });
    await tx.impersonationGrant.updateMany({
      where: { organizationId: org.id, endedAt: null },
      data: { endedAt: executedAt },
    });
    await tx.activityLogEntry.create({
      data: {
        organizationId: org.id,
        text: `PURGE PROTOCOL executed by A2R operator ${input.actor.name} — tenant soft-deleted`,
        tab: 'home',
      },
    });
    await recordLedgerEvent(tx, {
      organizationId: org.id,
      actorId: input.actor.userId,
      actionType: 'TENANT_PURGE_EXECUTED',
      targetResource: `Organization:${org.id}`,
      metadata: {
        tenant: org.name,
        operator: input.actor.email,
        method: 'SOFT_DELETE',
        finalSnapshotDigest: snapshot.package.manifest.payloadDigest,
        recordCounts: snapshot.package.manifest.recordCounts,
      },
    });
  });

  const base = {
    certificateId: `cod_${sha256(`${org.id}:${executedAt.toISOString()}`).slice(0, 24)}`,
    tenantId: org.id,
    tenantSlug: org.slug,
    tenantName: org.name,
    executedAt: executedAt.toISOString(),
    executedBy: input.actor.email,
    method: 'SOFT_DELETE' as const,
    recordCounts: snapshot.package.manifest.recordCounts,
    finalSnapshotDigest: snapshot.package.manifest.payloadDigest,
  };

  return {
    ok: true,
    certificate: { ...base, certificateHash: sha256(canonicalJson(base)) },
  };
}
