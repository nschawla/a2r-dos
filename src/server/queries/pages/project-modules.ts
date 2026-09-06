/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * DAL query functions for the per-engagement module pages
 * (/commercial-baseline, /audit, /raid, /schedule, /financials and their
 * shared project picker). Each takes a server-verified `OrgContext` (or its
 * `organizationId`), fails closed via `assertTenantContext`, and runs its
 * reads through the org-scoped `tenantDb`. Pages own the view/transform
 * logic; every `@/lib/db` touch lives here.
 */
import { tenantDb, assertTenantContext, type TenantScoped } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';

/** Shared "pick an engagement" list — role-scoped, same boundary the
 * module detail pages enforce on write (see project-picker.tsx). */
export async function loadProjectPickerList(context: OrgContext) {
  assertTenantContext(context);
  return tenantDb.project.findMany({
    where: await getScopedProjectWhere(context),
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, client: true },
  });
}

export async function loadAuditModulePage({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const [project, controlLabels] = await Promise.all([
    tenantDb.project.findFirst({
      where: { id: projectId, organizationId },
      include: { auditEntries: true },
    }),
    tenantDb.controlLabel.findMany({ where: { organizationId } }),
  ]);
  return { project, controlLabels };
}

export async function loadRaidModulePage({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const project = await tenantDb.project.findFirst({
    where: { id: projectId, organizationId },
    include: {
      raidEntries: { orderBy: { createdAt: 'desc' } },
      auditEntries: { select: { controlKey: true, status: true } },
    },
  });
  if (!project) return { project: null, resources: [] as { id: string; name: string }[] };
  const resources = await tenantDb.resource.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return { project, resources };
}

export async function loadScheduleModulePage({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const [project, policy] = await Promise.all([
    tenantDb.project.findFirst({
      where: { id: projectId, organizationId },
      include: {
        schedulePhases: true,
        auditEntries: { select: { controlKey: true, status: true } },
      },
    }),
    tenantDb.orgPolicy.findUnique({ where: { organizationId } }),
  ]);
  return { project, policy };
}

export async function loadCommercialBaselineModulePage({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const [project, roleRows] = await Promise.all([
    tenantDb.project.findFirst({
      where: { id: projectId, organizationId },
      include: {
        scopeItems: { orderBy: { sortOrder: 'asc' } },
        effortCells: { include: { role: true } },
        auditEntries: { select: { controlKey: true, status: true } },
        practiceDirector: true,
        deliveryManager: true,
        projectManager: true,
      },
    }),
    tenantDb.deliveryRole.findMany({ where: { organizationId } }),
  ]);
  return { project, roleRows };
}

export async function loadFinancialsModulePage({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const [project, roleRows, weeklySlots] = await Promise.all([
    tenantDb.project.findFirst({
      where: { id: projectId, organizationId },
      include: {
        financials: true,
        effortCells: true,
        auditEntries: { select: { controlKey: true, status: true } },
      },
    }),
    tenantDb.deliveryRole.findMany({ where: { organizationId } }),
    tenantDb.weeklyAssignmentSlot.findMany({
      where: { projectId, organizationId },
      select: { weekDate: true, forecastedHours: true, actualHours: true },
      orderBy: { weekDate: 'asc' },
    }),
  ]);
  return { project, roleRows, weeklySlots };
}
