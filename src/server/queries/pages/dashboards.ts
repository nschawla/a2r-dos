/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * DAL query functions for the portfolio-level dashboard pages
 * (/portfolio, /capacity, /methodology, /reports). Each fails closed via
 * `assertTenantContext` and reads through the org-scoped `tenantDb`. The
 * pages keep every engine/transform/masking call; only the raw reads
 * live here.
 */
import { tenantDb, assertTenantContext, type TenantScoped } from '@/lib/dal';
import { getScopedResourceWhere, getScopedProjectWhere } from '@/lib/scoping';
import { mondayOf, startOfDay, type DateRange } from '@/lib/capacity-engine';
import type { OrgContext } from '@/lib/session';

// ── /methodology ──────────────────────────────────────────────────────

export async function loadMethodologyLabels({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  return tenantDb.controlLabel.findMany({
    where: { organizationId },
    select: { controlKey: true, label: true },
  });
}

// ── /portfolio (PS Control Tower) ─────────────────────────────────────

export async function loadPortfolioDashboardExtras(context: OrgContext, scopedProjectIds: string[]) {
  assertTenantContext(context);
  const { organizationId } = context;
  const [recentActivity, resourceCount, practiceCount, raidCounts] = await Promise.all([
    tenantDb.activityLogEntry.findMany({
      where: { organizationId, OR: [{ projectId: null }, { projectId: { in: scopedProjectIds } }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, email: true } }, project: { select: { name: true } } },
    }),
    tenantDb.resource.count({ where: getScopedResourceWhere(context) }),
    tenantDb.practice.count({ where: { organizationId } }),
    tenantDb.raidEntry.groupBy({
      by: ['projectId'],
      where: { projectId: { in: scopedProjectIds }, status: { not: 'CLOSED' } },
      _count: { _all: true },
    }),
  ]);
  return { recentActivity, resourceCount, practiceCount, raidCounts };
}

// ── /capacity (Resource & Capacity Cockpit) ──────────────────────────

const FORECAST_WEEKS = 52;

export interface CapacityWindow {
  period: DateRange;
  periodStart: Date;
  periodEnd: Date;
  firstWeek: Date;
  forecastWeeks: number;
}

/** The trailing-13-week utilisation window + the forward 52-week forecast
 * window — computed once here so the page's `weeks[]` build and this
 * module's queries agree. */
export function capacityWindow(now = new Date()): CapacityWindow {
  const periodEnd = startOfDay(now);
  const periodStart = mondayOf(now);
  periodStart.setDate(periodStart.getDate() - 13 * 7);
  const firstWeek = mondayOf(now);
  return {
    period: { start: periodStart, end: periodEnd },
    periodStart,
    periodEnd,
    firstWeek,
    forecastWeeks: FORECAST_WEEKS,
  };
}

export async function loadCapacityCockpitData(context: OrgContext, now = new Date()) {
  assertTenantContext(context);
  const { organizationId } = context;
  const win = capacityWindow(now);
  const resourceWhere = getScopedResourceWhere(context);
  const projectWhere = await getScopedProjectWhere(context);

  const lastWeekExclusive = new Date(win.firstWeek);
  lastWeekExclusive.setDate(lastWeekExclusive.getDate() + FORECAST_WEEKS * 7);

  const [resources, holidays, policies, actualsByResource, forecastSlots, activeProjects] = await Promise.all([
    tenantDb.resource.findMany({
      where: resourceWhere,
      orderBy: [{ psPractice: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        psPractice: true,
        fte: true,
        startDate: true,
        endDate: true,
        targetUtilPct: true,
        projectCount: true,
        rolePolicy: { select: { roleName: true, targetUtilPct: true, isBillableHead: true } },
      },
    }),
    tenantDb.organizationHoliday.findMany({ where: { organizationId }, orderBy: { date: 'asc' } }),
    tenantDb.roleUtilizationPolicy.findMany({ where: { organizationId }, orderBy: { roleName: 'asc' } }),
    tenantDb.weeklyAssignmentSlot.groupBy({
      by: ['resourceId'],
      where: { organizationId, weekDate: { gte: win.periodStart, lte: win.periodEnd } },
      _sum: { actualHours: true },
    }),
    tenantDb.weeklyAssignmentSlot.findMany({
      where: { organizationId, weekDate: { gte: win.firstWeek, lt: lastWeekExclusive } },
      select: { resourceId: true, weekDate: true, forecastedHours: true },
    }),
    tenantDb.project.findMany({
      where: { ...projectWhere, hierarchyLevel: { not: 'PARENT' } },
      select: {
        id: true,
        name: true,
        practiceDirectorId: true,
        deliveryManagerId: true,
        projectManagerId: true,
        contributors: { select: { resourceId: true } },
      },
    }),
  ]);

  return { window: win, resources, holidays, policies, actualsByResource, forecastSlots, activeProjects };
}

// ── /reports (Executive Briefing Hub) ────────────────────────────────

export async function loadReportsHubRows({ organizationId }: TenantScoped) {
  assertTenantContext({ organizationId });
  const [resources, deliveryRoles] = await Promise.all([
    tenantDb.resource.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    tenantDb.deliveryRole.findMany({ where: { organizationId } }),
  ]);
  return { resources, deliveryRoles };
}
