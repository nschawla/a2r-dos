import { notFound } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { loadFinancialsModulePage } from '@/server/queries/pages/project-modules';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { EacEditor } from '@/components/modules/financials/EacEditor';
import { getProjectHealth } from '@/server/queries/health';
import { canEditProject } from '@/lib/auth/rbac';
import { toFinancialActuals, toRateRoles } from '@/server/queries/calc-adapters';
import {
  financialVisibility,
  maskRateRolesForViewer,
  maskFinancialActualsForViewer,
  restrictedNoticeFor,
} from '@/lib/security/masking';
import { RestrictedNotice } from '@/components/security/Masked';

export default async function FinancialsProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { organizationId, deliveryRole, governance, resourceId, resourcePracticeId } = await requireOrgContext();

  const { project, roleRows, weeklySlots } = await loadFinancialsModulePage({ organizationId }, (await params).projectId);
  if (!project) notFound();

  const health = getProjectHealth(project);
  const canEdit = canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project);

  // Role-based data masking — strip cost rates / per-line cost out of the
  // payload for restricted viewers (PM / DM) so the numbers never reach
  // the client, and drive the UI's masked rendering via `visibility`.
  const visibility = financialVisibility(deliveryRole, governance);
  const maskedRoles = maskRateRolesForViewer(toRateRoles(roleRows), deliveryRole, governance);
  const maskedActuals = maskFinancialActualsForViewer(
    toFinancialActuals(project.financials),
    deliveryRole,
    governance
  );

  // RTM C4 — burn-curve series: one point per ISO week, forecast vs actual
  // hours summed across every resource assigned that week. `actualCum` stops
  // advancing once weeks have no logged actuals (i.e. the future), so the
  // Actual line naturally ends at "today" while Planned runs to project end.
  const burnByWeek = new Map<string, { forecast: number; actual: number }>();
  for (const s of weeklySlots) {
    const key = s.weekDate.toISOString().slice(0, 10);
    const acc = burnByWeek.get(key) ?? { forecast: 0, actual: 0 };
    acc.forecast += s.forecastedHours;
    acc.actual += s.actualHours;
    burnByWeek.set(key, acc);
  }
  const burnSeries = [...burnByWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, forecastHours: v.forecast, actualHours: v.actual }));

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
          Financial Realization · {project.name}
        </div>
        <h1 className="text-2xl font-display font-bold">Estimate at Completion (EAC)</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          True EAC Cost = Actual Cost to Date + (Assigned Forecast Hours × Cost Rate) + (Open Resource Request Hours ×
          Baseline Cost Rate). Edit any field below — the KPI cards recalculate as you type.
        </p>
      </div>

      <RestrictedNotice text={restrictedNoticeFor(visibility)} />

      <EacEditor
        projectId={project.id}
        canEdit={canEdit}
        visibility={visibility}
        estimationMode={project.estimationMode}
        commercialModel={project.commercialModel}
        contingencyPct={project.contingencyPct}
        roles={maskedRoles}
        effortCells={project.effortCells.map((c) => ({ phaseKey: c.phaseKey, roleId: c.roleId, hours: c.hours }))}
        directIntake={{
          soldHours: project.directIntakeSoldHours,
          targetRevenue: project.directIntakeTargetRevenue,
          blendedMarginPct: visibility === 'restricted' ? 0 : project.directIntakeBlendedMarginPct,
        }}
        actuals={maskedActuals}
        burnSeries={burnSeries}
      />
    </>
  );
}
