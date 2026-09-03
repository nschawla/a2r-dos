'use server';

import { db } from '@/lib/db';
import { requireOrgContext } from '@/lib/session';
import { getProjectHealth } from '@/server/queries/health';

export interface CommandPaletteProject {
  id: string;
  name: string;
  client: string | null;
  hierarchyLevel: string;
  healthCode: 'G' | 'Y' | 'R';
}

export interface CommandPaletteResource {
  id: string;
  name: string;
  roleName: string | null;
  practiceName: string | null;
}

export interface CommandPaletteRaidAlert {
  id: string;
  projectId: string;
  projectName: string;
  description: string;
  severity: string;
}

export interface CommandPaletteIndex {
  projects: CommandPaletteProject[];
  resources: CommandPaletteResource[];
  raidAlerts: CommandPaletteRaidAlert[];
}

/**
 * Loads a lightweight, org-scoped search index once per palette open. Org
 * portfolios are small enough (dozens to low hundreds of rows) that
 * fetching once and fuzzy-filtering client-side as the user types is more
 * responsive than a server round-trip per keystroke, and simpler than
 * standing up a search index for this scale of data.
 */
export async function getCommandPaletteIndex(): Promise<CommandPaletteIndex> {
  const { organizationId } = await requireOrgContext();

  const [projects, resources, raidEntries] = await Promise.all([
    db.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, client: true, hierarchyLevel: true, locked: true, auditEntries: { select: { controlKey: true, status: true } } },
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
}
