/**
 * WP4 — role/resource-scoped portfolio reads.
 *
 * Note on the path: this sits alongside src/lib/db.ts (the Prisma client
 * singleton, imported here as `db`) — a file and a directory of the same
 * name coexist fine; `@/lib/db` still resolves to the file, `@/lib/db/*`
 * to this directory.
 *
 * `getScopedProjectsForUser` builds a Prisma `where` clause from the
 * signed-in user's *effective* DeliveryRole (src/lib/auth/rbac.ts) and
 * their linked Resource — never from the cosmetic Persona. `deliveryRole`
 * is always one of ADMIN/VP_EXECUTIVE/PRACTICE_DIRECTOR/DELIVERY_MANAGER/
 * PROJECT_MANAGER (resolveDeliveryRole() guarantees a non-null value even
 * when Membership.deliveryRole itself is unset).
 */
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { OrgContext } from '@/lib/session';
import {
  computePortfolioSummary,
  computeProgramRollup,
  type PortfolioSummary,
  type ProgramRollup,
} from '@/lib/calculations/portfolio';
import { toAuditEntries, toFinancialActuals, toRateRoles, toSizingInput, hierarchyLevelLower } from '@/server/queries/calc-adapters';

/** Prisma where-clause fragment matching nothing — used when a role's
 * scoping depends on a resource link the signed-in user doesn't have
 * (e.g. a PRACTICE_DIRECTOR delivery role on a login with no linked
 * Resource at all). Fails closed rather than silently falling through to
 * an unscoped query. */
const MATCH_NOTHING: Prisma.ProjectWhereInput = { id: { in: [] } };

/**
 * The `where` clause alone — split out from getScopedProjectsForUser so
 * getScopedPortfolioSummary and any future caller (e.g. a scoped project
 * count) can reuse the exact same scoping logic without re-fetching rows.
 *
 *  - ADMIN / VP_EXECUTIVE: unrestricted tenant portfolio access.
 *  - PRACTICE_DIRECTOR: projects they're the assigned PD on, OR any
 *    project whose home practice (Project.practiceId) matches their own
 *    Resource's practice.
 *  - DELIVERY_MANAGER: projects they're the assigned DM on, OR projects
 *    led by a PM who reports to them (Resource.managerId).
 *  - PROJECT_MANAGER: projects they're the assigned PM of record on, OR
 *    projects they're an explicit ProjectContributor on.
 */
export async function getScopedProjectWhere(session: OrgContext): Promise<Prisma.ProjectWhereInput> {
  const { organizationId, deliveryRole, resourceId, resourcePracticeId } = session;

  switch (deliveryRole) {
    case 'ADMIN':
    case 'VP_EXECUTIVE':
    case 'VIEWER':
      return { organizationId };

    case 'PRACTICE_DIRECTOR': {
      const or: Prisma.ProjectWhereInput[] = [];
      if (resourceId) or.push({ practiceDirectorId: resourceId });
      if (resourcePracticeId) or.push({ practiceId: resourcePracticeId });
      return or.length ? { organizationId, OR: or } : MATCH_NOTHING;
    }

    case 'DELIVERY_MANAGER': {
      if (!resourceId) return MATCH_NOTHING;
      const directReports = await db.resource.findMany({
        where: { organizationId, managerId: resourceId },
        select: { id: true },
      });
      const or: Prisma.ProjectWhereInput[] = [{ deliveryManagerId: resourceId }];
      if (directReports.length) or.push({ projectManagerId: { in: directReports.map((r) => r.id) } });
      return { organizationId, OR: or };
    }

    case 'PROJECT_MANAGER': {
      if (!resourceId) return MATCH_NOTHING;
      return {
        organizationId,
        OR: [{ projectManagerId: resourceId }, { contributors: { some: { resourceId } } }],
      };
    }
  }
}

/** Fields every scoped-portfolio consumer needs: enough to run the WP2
 * engine (sizing/audit/financials) and to show basic leadership info. */
const scopedProjectInclude = {
  effortCells: true,
  auditEntries: { select: { controlKey: true, status: true } },
  financials: true,
  practiceDirector: { select: { id: true, name: true } },
  deliveryManager: { select: { id: true, name: true } },
  projectManager: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude;

export type ScopedProject = Prisma.ProjectGetPayload<{ include: typeof scopedProjectInclude }>;

export async function getScopedProjectsForUser(session: OrgContext): Promise<ScopedProject[]> {
  const where = await getScopedProjectWhere(session);
  return db.project.findMany({ where, include: scopedProjectInclude, orderBy: { createdAt: 'desc' } });
}

export interface ProgramRollupWithParent {
  parent: { id: string; name: string };
  rollup: ProgramRollup;
}

export interface ScopedPortfolioSummary {
  projects: ScopedProject[];
  summary: PortfolioSummary;
  /** One rollup per PARENT-hierarchy project in the scoped set. A parent's
   * children are aggregated in full regardless of whether each child
   * individually falls in the user's scope — if you can see the program,
   * you see its real rollup, not a partial one. */
  programRollups: ProgramRollupWithParent[];
}

/**
 * Runs the WP2 engine's computePortfolioSummary against the caller's
 * scoped project list, plus computeProgramRollup for every PARENT-level
 * project in that list.
 */
export async function getScopedPortfolioSummary(session: OrgContext): Promise<ScopedPortfolioSummary> {
  const [projects, roleRows] = await Promise.all([
    getScopedProjectsForUser(session),
    db.deliveryRole.findMany({ where: { organizationId: session.organizationId } }),
  ]);

  const roles = toRateRoles(roleRows);

  const summary = computePortfolioSummary(
    projects.map((p) => ({
      id: p.id,
      hierarchyLevel: hierarchyLevelLower(p.hierarchyLevel),
      locked: p.locked,
      sizing: toSizingInput(p),
      auditEntries: toAuditEntries(p.auditEntries),
    })),
    roles
  );

  const parents = projects.filter((p) => p.hierarchyLevel === 'PARENT');
  const programRollups: ProgramRollupWithParent[] = [];
  for (const parent of parents) {
    const children = await db.project.findMany({
      where: { organizationId: session.organizationId, parentId: parent.id },
      include: { effortCells: true, auditEntries: { select: { controlKey: true, status: true } }, financials: true },
    });
    const rollup = computeProgramRollup(
      { id: parent.id },
      children.map((c) => ({
        id: c.id,
        locked: c.locked,
        sizing: toSizingInput(c),
        auditEntries: toAuditEntries(c.auditEntries),
        financialActuals: toFinancialActuals(c.financials),
      })),
      roles
    );
    programRollups.push({ parent: { id: parent.id, name: parent.name }, rollup });
  }

  return { projects, summary, programRollups };
}
