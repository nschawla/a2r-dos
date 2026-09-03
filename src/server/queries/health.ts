import type { AuditEntry, Project } from '@prisma/client';
import { computeProjectHealth, type ProjectHealth } from '@/lib/calculations/audit';
import { toAuditEntries } from './calc-adapters';

/** Green/Yellow/Red rollup for a project, via the WP2 engine. */
export function getProjectHealth(
  project: Pick<Project, 'locked'> & { auditEntries: Pick<AuditEntry, 'controlKey' | 'status'>[] }
): ProjectHealth {
  return computeProjectHealth({
    locked: project.locked,
    auditEntries: toAuditEntries(project.auditEntries),
  });
}
