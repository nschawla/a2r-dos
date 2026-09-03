/**
 * A2R Operator Control Plane — cross-tenant reads for the /ops console.
 *
 * These deliberately span EVERY organization (no tenant scoping) — they are
 * only ever called behind src/lib/ops-auth.ts's staff guard. Nothing here
 * is reachable from a client-workspace route.
 */
import type { OrgStatus, ContractTier } from '@prisma/client';
import { db } from '@/lib/db';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import { computeProjectHealth } from '@/lib/calculations/audit';
import { toRateRoles, toSizingInput, toAuditEntries } from '@/server/queries/calc-adapters';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  contractTier: ContractTier;
  createdAt: Date;
  /** Users with a Membership in this tenant (i.e. seats in use). */
  activeUsers: number;
  /** Non-container engagements (PARENT rollups excluded). */
  engagements: number;
}

export async function listTenants(): Promise<TenantRow[]> {
  const orgs = await db.organization.findMany({
    where: { purgedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: {
          memberships: true,
          projects: { where: { hierarchyLevel: { not: 'PARENT' } } },
        },
      },
    },
  });

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    status: o.status,
    contractTier: o.contractTier,
    createdAt: o.createdAt,
    activeUsers: o._count.memberships,
    engagements: o._count.projects,
  }));
}

export interface PlatformTelemetry {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalActiveEngagements: number;
  /** Mean baseline (sold) margin % across every sized engagement in every
   * tenant. `hasMargin` is false when no engagement anywhere has sized
   * hours yet. */
  globalMarginAvgPct: number;
  hasMargin: boolean;
  /** Open RAID items flagged for SteerCo escalation or logged CRITICAL. */
  atRiskRaidItems: number;
  /** Red-health engagements across the whole platform. */
  redEngagements: number;
  /** Per-tenant slice, newest first, for the telemetry table. */
  tenants: TenantRow[];
}

export async function getPlatformTelemetry(): Promise<PlatformTelemetry> {
  // Purged tenants are excluded from every platform metric — the Purge
  // Protocol soft-deletes via Organization.purgedAt.
  const liveOrgFilter = { organization: { purgedAt: null } };
  const [tenants, orgAgg, roleRows, projects, totalUsers, atRiskRaidItems] = await Promise.all([
    listTenants(),
    db.organization.groupBy({ by: ['status'], where: { purgedAt: null }, _count: { _all: true } }),
    db.deliveryRole.findMany({ where: liveOrgFilter }),
    db.project.findMany({
      where: liveOrgFilter,
      include: {
        effortCells: true,
        auditEntries: { select: { controlKey: true, status: true } },
      },
    }),
    db.user.count(),
    db.raidEntry.count({
      where: {
        status: { not: 'CLOSED' },
        OR: [{ escalate: true }, { severity: 'CRITICAL' }],
        project: liveOrgFilter,
      },
    }),
  ]);

  const activeTenants = orgAgg.find((g) => g.status === 'ACTIVE')?._count._all ?? 0;
  const suspendedTenants = orgAgg.find((g) => g.status === 'SUSPENDED')?._count._all ?? 0;

  // Rate cards are per-tenant — bucket the roster once so each project is
  // costed against its own organization's rate card.
  const rolesByOrg = new Map<string, typeof roleRows>();
  for (const r of roleRows) {
    const list = rolesByOrg.get(r.organizationId) ?? [];
    list.push(r);
    rolesByOrg.set(r.organizationId, list);
  }

  let marginSum = 0;
  let marginCount = 0;
  let totalActiveEngagements = 0;
  let redEngagements = 0;

  for (const p of projects) {
    if (p.hierarchyLevel === 'PARENT') continue; // structural container, not an engagement
    totalActiveEngagements += 1;

    const roles = toRateRoles(rolesByOrg.get(p.organizationId) ?? []);
    const totals = computeTotalsFor(toSizingInput(p), roles);
    if (totals.totalHours > 0) {
      marginSum += totals.marginPct;
      marginCount += 1;
    }

    const health = computeProjectHealth({ locked: p.locked, auditEntries: toAuditEntries(p.auditEntries) });
    if (health.code === 'R') redEngagements += 1;
  }

  return {
    totalTenants: tenants.length,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalActiveEngagements,
    globalMarginAvgPct: marginCount > 0 ? marginSum / marginCount : 0,
    hasMargin: marginCount > 0,
    atRiskRaidItems,
    redEngagements,
    tenants: [...tenants].reverse(),
  };
}
