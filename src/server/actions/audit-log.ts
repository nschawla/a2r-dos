'use server';

/**
 * WP6 — read side of the Audit Trail. Deliberately a lighter check than
 * `authorizeProjectEdit`: viewing a project's governance history only
 * needs "this project is in my org" (the same access level implied by the
 * module page itself having loaded), not edit authority — a read-only
 * VP_EXECUTIVE or a PM who isn't PM-of-record on this particular project
 * should still be able to see what happened here, even though they
 * couldn't have caused any of it themselves.
 */
import { db } from '@/lib/db';
import { requireOrgContext } from '@/lib/session';

export interface AuditTrailEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousState: unknown;
  newState: unknown;
  createdAt: string;
  userName: string | null;
}

export type FetchAuditTrailResult = { ok: true; entries: AuditTrailEntry[] } | { ok: false; error: string };

/** Most recent 200 entries for one project — the drawer filters/searches
 * client-side within that window; a project generating enough governance
 * events to need real pagination is a "load the rest via a date-ranged
 * follow-up call" problem for a future WP, not this one. */
export async function fetchAuditTrail(projectId: string): Promise<FetchAuditTrailResult> {
  const { organizationId } = await requireOrgContext();

  const project = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
  if (!project) return { ok: false, error: 'Project not found.' };

  const rows = await db.auditLog.findMany({
    where: { projectId, organizationId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });

  return {
    ok: true,
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      previousState: r.previousState,
      newState: r.newState,
      createdAt: r.createdAt.toISOString(),
      userName: r.user?.name ?? r.user?.email ?? null,
    })),
  };
}
