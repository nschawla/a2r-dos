'use server';

/**
 * The lightweight, org-scoped index the global Cmd+K palette loads once per
 * open, plus the caller's staff flag. Non-throwing: on the auth screens or
 * for a staff login with no tenant membership it returns empty lists so the
 * palette still offers navigation.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOrgContextOrNull } from '@/lib/session';
import { getProjectHealth } from '@/server/queries/health';

export interface CommandKContext {
  projects: { id: string; name: string; client: string | null; hierarchyLevel: string; healthCode: 'G' | 'Y' | 'R' }[];
  resources: { id: string; name: string; roleName: string | null; practiceName: string | null }[];
  raidAlerts: { id: string; projectId: string; projectName: string; description: string; severity: string }[];
  isStaff: boolean;
}

const EMPTY = (isStaff: boolean): CommandKContext => ({ projects: [], resources: [], raidAlerts: [], isStaff });

export async function getCommandKContext(): Promise<CommandKContext> {
  let isStaff = false;
  try {
    const session = await getServerSession(authOptions);
    isStaff = session?.user?.isA2rStaff === true;
    if (!session?.user) return EMPTY(isStaff);

    const org = await getOrgContextOrNull();
    if (!org) return EMPTY(isStaff);

    const organizationId = org.organizationId;
    const [projects, resources, raidEntries] = await Promise.all([
      db.project.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          client: true,
          hierarchyLevel: true,
          locked: true,
          auditEntries: { select: { controlKey: true, status: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.resource.findMany({
        where: { organizationId },
        select: { id: true, name: true, role: { select: { name: true } }, practice: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      db.raidEntry.findMany({
        where: { project: { organizationId }, escalate: true, status: { not: 'CLOSED' } },
        select: { id: true, description: true, severity: true, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    return {
      isStaff,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        client: p.client,
        hierarchyLevel: p.hierarchyLevel,
        healthCode: getProjectHealth(p).code,
      })),
      resources: resources.map((r) => ({
        id: r.id,
        name: r.name,
        roleName: r.role?.name ?? null,
        practiceName: r.practice?.name ?? null,
      })),
      raidAlerts: raidEntries.map((e) => ({
        id: e.id,
        projectId: e.project.id,
        projectName: e.project.name,
        description: e.description,
        severity: e.severity,
      })),
    };
  } catch {
    return EMPTY(isStaff);
  }
}
