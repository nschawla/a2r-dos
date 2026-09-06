import { notFound } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { loadScheduleModulePage } from '@/server/queries/pages/project-modules';
import { ScheduleTracker } from '@/components/modules/schedule/ScheduleTracker';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { getProjectHealth } from '@/server/queries/health';
import { canEditProject } from '@/lib/auth/rbac';
import { DEFAULT_SCHEDULE_TOLERANCES } from '@/lib/calculations/types';

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export default async function ScheduleProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { organizationId, deliveryRole, resourceId, resourcePracticeId } = await requireOrgContext();

  const { project, policy } = await loadScheduleModulePage({ organizationId }, (await params).projectId);
  if (!project) notFound();

  const health = getProjectHealth(project);
  const canEdit = canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project);
  const tolerances = policy ? { warnDays: policy.slipWarnDays, critDays: policy.slipCritDays } : DEFAULT_SCHEDULE_TOLERANCES;

  const phases = project.schedulePhases.map((p) => ({
    phaseKey: p.phaseKey,
    plannedStart: toDateInputValue(p.plannedStart),
    plannedEnd: toDateInputValue(p.plannedEnd),
    actualStart: toDateInputValue(p.actualStart),
    actualEnd: toDateInputValue(p.actualEnd),
    pctComplete: p.pctComplete,
    status: p.status,
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
          Milestone Governance · {project.name}
        </div>
        <h1 className="text-2xl font-display font-bold">Schedule &amp; Milestone Burndown</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Slip is measured against this org&rsquo;s configured warning ({tolerances.warnDays}d) and critical (
          {tolerances.critDays}d) thresholds. Pace Risk is independent of slip — it flags a phase burning calendar
          time faster than logged work, before it actually finishes late.
        </p>
      </div>

      <ScheduleTracker projectId={project.id} canEdit={canEdit} phases={phases} tolerances={tolerances} />
    </>
  );
}
