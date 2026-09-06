/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * DAL query functions for the download / export route handlers under
 * `src/app/api/**` (portfolio CSV, project JSON export, audit certificate,
 * SteerCo status report, AI document-parser project hints). Each fails
 * closed via `assertTenantContext` and reads through the org-scoped
 * `tenantDb`; the routes keep their auth guard, the compute engines, and
 * the response shaping.
 */
import { tenantDb, assertTenantContext, type TenantScoped } from '@/lib/dal';
import { getScopedProjectWhere } from '@/lib/scoping';
import type { OrgContext } from '@/lib/session';

/** GET /api/reports/portfolio-csv — the delivery-role rate card. Projects
 * come from `getScopedProjectsForUser` in the route (already a DAL fn). */
export async function loadPortfolioCsvRoles({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  return tenantDb.deliveryRole.findMany({ where: { organizationId } });
}

/** GET /api/projects/[projectId]/export — a full one-project snapshot. */
export async function loadProjectExport({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  return tenantDb.project.findFirst({
    where: { id: projectId, organizationId },
    include: {
      scopeItems: { orderBy: { sortOrder: 'asc' } },
      effortCells: { include: { role: true } },
      auditEntries: true,
      raidEntries: { include: { owner: true }, orderBy: { createdAt: 'desc' } },
      financials: { include: { role: true } },
      schedulePhases: true,
      practiceDirector: true,
      deliveryManager: true,
      projectManager: true,
    },
  });
}

/** GET /api/projects/[projectId]/audit-certificate. */
export async function loadAuditCertificate({ organizationId }: TenantScoped, projectId: string) {
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

/** GET /api/projects/[projectId]/status-report — the SteerCo status deck. */
export async function loadStatusReport({ organizationId }: TenantScoped, projectId: string) {
  assertTenantContext({ organizationId });
  const [project, roles, policy, escalatedRaid, decisions] = await Promise.all([
    tenantDb.project.findFirst({
      where: { id: projectId, organizationId },
      include: { effortCells: true, auditEntries: true, financials: true, schedulePhases: true },
    }),
    tenantDb.deliveryRole.findMany({ where: { organizationId } }),
    tenantDb.orgPolicy.findUnique({ where: { organizationId } }),
    tenantDb.raidEntry.findMany({
      where: { projectId, escalate: true, organizationId },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        severity: true,
        mitigationPlan: true,
        targetDate: true,
      },
    }),
    tenantDb.steerCoDecision.findMany({
      where: { projectId, organizationId },
      orderBy: [{ status: 'asc' }, { resolutionTargetDate: 'asc' }, { createdAt: 'desc' }],
      include: { owner: { select: { name: true } } },
    }),
  ]);
  return { project, roles, policy, escalatedRaid, decisions };
}

/** POST /api/parse-document — the role-scoped project hints handed to the
 * LLM (codes + names only). */
export async function loadParseDocumentProjectHints(context: OrgContext, take: number) {
  assertTenantContext(context);
  return tenantDb.project.findMany({
    where: await getScopedProjectWhere(context),
    select: { externalId: true, name: true },
    take,
    orderBy: { name: 'asc' },
  });
}
