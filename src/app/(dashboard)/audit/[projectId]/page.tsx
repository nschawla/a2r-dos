import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import { CONTROL_DEFS, getControlDef } from '@/lib/constants';
import { AuditChecklist } from '@/components/modules/audit/AuditChecklist';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { getProjectHealth } from '@/server/queries/health';
import { canEditProject } from '@/lib/auth/rbac';

export default async function AuditProjectPage({ params }: { params: { projectId: string } }) {
  const { organizationId, deliveryRole, resourceId, resourcePracticeId } = await requireOrgContext();

  const project = await db.project.findFirst({
    where: { id: params.projectId, organizationId },
    include: { auditEntries: true },
  });
  if (!project) notFound();

  const health = getProjectHealth(project);
  const canEdit = canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project);
  const controlLabels = await db.controlLabel.findMany({ where: { organizationId } });
  const labelByKey = new Map(controlLabels.map((c) => [c.controlKey, c.label]));
  const entryByKey = new Map(project.auditEntries.map((e) => [e.controlKey, e]));

  const methodologyKey = project.methodology.toLowerCase() as 'waterfall' | 'agile' | 'hybrid';

  // WP5: the AuditChecklist client component owns the live weighted-
  // compliance recompute (computeAuditProgress) as every card's status is
  // clicked, so this page just hands it the full entry set — one row per
  // control, defaulting to 'NO'/empty fields for controls with no logged
  // entry yet (rows are pre-seeded on project creation, but this stays
  // defensive for partial data, same as the WP2 engine itself).
  const entries = CONTROL_DEFS.map((c) => {
    const entry = entryByKey.get(c.id);
    const label = labelByKey.get(c.id) ?? getControlDef(c.id)?.labels[methodologyKey] ?? c.id;
    return {
      controlKey: c.id,
      label,
      why: c.why,
      status: entry?.status ?? ('NO' as const),
      owner: entry?.owner ?? '',
      repoLink: entry?.repoLink ?? '',
      notes: entry?.notes ?? '',
      updatedAt: entry?.updatedAt ? entry.updatedAt.toISOString() : null,
    };
  });

  return (
    <>
      <ProjectHeader
        projectId={project.id}
        name={project.name}
        client={project.client}
        hierarchyLevel={project.hierarchyLevel}
        waveTag={project.waveTag}
        locked={project.locked}
        healthCode={health.code}
        canEdit={canEdit}
      />

      <div>
        <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">
          Governance Health · {project.name}
        </div>
        <h1 className="text-2xl font-display font-bold">Audit Completion</h1>
        <p className="text-ink-muted text-sm mt-1">
          Delivery controls &amp; governance standards — click a status to update it instantly, or the{' '}
          <span className="font-serif italic">i</span> beside any control for its playbook guidance.
        </p>
        <div className="mt-2">
          <Link href="/methodology" className="text-brand-hi hover:text-brand text-xs font-semibold">
            Open the Methodology Reference →
          </Link>
        </div>
      </div>

      <AuditChecklist projectId={project.id} canEdit={canEdit} entries={entries} />
    </>
  );
}
