/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * DAL query functions for the tenant-admin pages (/admin, /admin/onboarding,
 * /admin/ingestion) and the Ops Console Identity Federation panel. Each
 * fails closed via `assertTenantContext` and reads through the org-scoped
 * `tenantDb`. Ledger/permission helpers stay in the page.
 */
import { tenantDb, assertTenantContext, type TenantScoped } from '@/lib/dal';

export async function loadAdminConsolePage({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  const [practices, roles, resources, policy, controlLabels] = await Promise.all([
    tenantDb.practice.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    tenantDb.deliveryRole.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    tenantDb.resource.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { role: true, practice: true },
    }),
    tenantDb.orgPolicy.findUnique({ where: { organizationId } }),
    tenantDb.controlLabel.findMany({ where: { organizationId } }),
  ]);
  return { practices, roles, resources, policy, controlLabels };
}

export async function loadAdminOnboardingPage({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  const [org, governanceRow, resources, projectCount] = await Promise.all([
    tenantDb.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, slug: true, contractTier: true, createdAt: true },
    }),
    tenantDb.governanceConfig.findUnique({ where: { organizationId } }),
    tenantDb.resource.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { role: true, practice: true },
    }),
    tenantDb.project.count({ where: { organizationId } }),
  ]);
  return { org, governanceRow, resources, projectCount };
}

/** Batch-import lookup data — only fetched for members with the
 * `admin:ingestion` permission (the page gates the call). */
export async function loadBatchImportLookups({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  const [projects, resources, roles] = await Promise.all([
    tenantDb.project.findMany({
      where: { organizationId },
      select: { id: true, externalId: true, name: true, estimationMode: true },
    }),
    tenantDb.resource.findMany({
      where: { organizationId },
      select: { id: true, name: true, email: true },
    }),
    tenantDb.deliveryRole.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);
  return { projects, resources, roles };
}

/** Ops Console → Identity Federation: a single tenant's practice list,
 * fetched under the operator's cross-tenant (admin) scope with an explicit
 * `organizationId` filter for the tenant being configured. */
export async function loadOpsIdentityPractices(organizationId: string) {
  return tenantDb.practice.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
