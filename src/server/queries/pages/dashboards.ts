/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
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

// ── /portfolio Decision Center — exception-driven "needs attention today" ──
//
// Deliberately narrow: two concrete, already-modeled exception classes
// (an open SteerCo decision awaiting a call, a CRITICAL/HIGH RAID item
// still open) rather than a new derived-risk score. Both are scoped by
// `scopedProjectIds` — the same row-level scope the rest of the page uses
// — so a Project Manager sees only their own engagements' exceptions, a
// Practice Director their whole practice's, and Admin/VP the full tenant.
// Red-health engagements are computed by the page itself from the project
// list it already loaded (via `getProjectHealth`) — no extra query.

export interface DecisionAlert {
  id: string;
  projectId: string;
  projectName: string;
  decisionRequired: string;
  ownerName: string | null;
  resolutionTargetDate: string | null;
  overdue: boolean;
}

export interface RaidAlert {
  id: string;
  projectId: string;
  projectName: string;
  type: 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DEPENDENCY';
  title: string;
  severity: 'CRITICAL' | 'HIGH';
  targetDate: string | null;
  overdue: boolean;
}

export async function loadDecisionCenterAlerts(
  context: OrgContext,
  scopedProjectIds: string[]
): Promise<{ pendingDecisions: DecisionAlert[]; criticalRaid: RaidAlert[] }> {
  assertTenantContext(context);
  const { organizationId } = context;
  const now = new Date();

  const [decisions, raid] = await Promise.all([
    tenantDb.steerCoDecision.findMany({
      where: { organizationId, projectId: { in: scopedProjectIds }, status: 'OPEN' },
      orderBy: [{ resolutionTargetDate: 'asc' }, { createdAt: 'asc' }],
      take: 8,
      include: { project: { select: { name: true } }, owner: { select: { name: true } } },
    }),
    tenantDb.raidEntry.findMany({
      where: {
        organizationId,
        projectId: { in: scopedProjectIds },
        status: { not: 'CLOSED' },
        severity: { in: ['CRITICAL', 'HIGH'] },
      },
      orderBy: [{ targetDate: 'asc' }, { createdAt: 'asc' }],
      take: 8,
      include: { project: { select: { name: true } } },
    }),
  ]);

  return {
    pendingDecisions: decisions.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      projectName: d.project.name,
      decisionRequired: d.decisionRequired,
      ownerName: d.owner?.name ?? null,
      resolutionTargetDate: d.resolutionTargetDate?.toISOString() ?? null,
      overdue: d.resolutionTargetDate != null && d.resolutionTargetDate < now,
    })),
    criticalRaid: raid.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      type: r.type,
      title: r.title ?? r.description.split('\n')[0]!.slice(0, 90),
      severity: r.severity as 'CRITICAL' | 'HIGH',
      targetDate: r.targetDate?.toISOString() ?? null,
      overdue: r.targetDate != null && r.targetDate < now,
    })),
  };
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

// ── /command — Executive Action Triage feed ──────────────────────────
//
// Two-step by design (src/lib/executive-triage.ts#selectTriageProjects
// picks the flagged project IDs first, pure, from data the page already
// loaded): this only ever fetches schedule phases and open RAID items for
// that short flagged list, never the whole scoped portfolio.

export async function loadTriageDrivers(
  { organizationId }: TenantScoped,
  projectIds: string[]
) {
  assertTenantContext({ organizationId });
  if (projectIds.length === 0) return { phases: [], raid: [] };

  const [phases, raid] = await Promise.all([
    tenantDb.schedulePhase.findMany({
      where: { organizationId, projectId: { in: projectIds } },
      select: { projectId: true, phaseKey: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, pctComplete: true, status: true },
    }),
    tenantDb.raidEntry.findMany({
      where: { organizationId, projectId: { in: projectIds }, status: { not: 'CLOSED' } },
      select: {
        projectId: true,
        title: true,
        description: true,
        impact: true,
        mitigationPlan: true,
        severity: true,
        escalate: true,
        targetDate: true,
        updatedAt: true,
        owner: { select: { name: true } },
      },
    }),
  ]);

  return { phases, raid };
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
