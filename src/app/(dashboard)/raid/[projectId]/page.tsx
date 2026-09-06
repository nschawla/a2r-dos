import { notFound } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { loadRaidModulePage } from '@/server/queries/pages/project-modules';
import { RaidBoard } from '@/components/modules/raid/RaidBoard';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { getProjectHealth } from '@/server/queries/health';
import { canEditProject } from '@/lib/auth/rbac';

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export default async function RaidProjectPage({ params }: { params: { projectId: string } }) {
  const { organizationId, deliveryRole, resourceId, resourcePracticeId } = await requireOrgContext();

  const { project, resources } = await loadRaidModulePage({ organizationId }, params.projectId);
  if (!project) notFound();

  const health = getProjectHealth(project);
  const canEdit = canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project);

  const entries = project.raidEntries.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title ?? '',
    description: e.description,
    severity: e.severity,
    likelihood: e.likelihood,
    impact: e.impact ?? '',
    mitigationPlan: e.mitigationPlan ?? '',
    ownerId: e.ownerId ?? '',
    targetDate: toDateInputValue(e.targetDate),
    status: e.status,
    escalate: e.escalate,
    createdAt: e.createdAt.toISOString(),
  }));

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
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
          Operational Governance · {project.name}
        </div>
        <h1 className="text-2xl font-display font-bold">RAID Cockpit</h1>
      </div>

      <RaidBoard
        projectId={project.id}
        canEdit={canEdit}
        entries={entries}
        resources={resources.map((r) => ({ id: r.id, name: r.name }))}
      />
    </>
  );
}
