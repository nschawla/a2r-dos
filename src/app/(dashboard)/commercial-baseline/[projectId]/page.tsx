import { notFound } from 'next/navigation';
import { requireOrgContext } from '@/lib/session';
import { loadCommercialBaselineModulePage } from '@/server/queries/pages/project-modules';
import { ProjectHeader } from '@/components/projects/ProjectHeader';
import { DealEditor } from '@/components/modules/deal/DealEditor';
import { getProjectHealth } from '@/server/queries/health';
import { canEditProject } from '@/lib/auth/rbac';
import { toRateRoles } from '@/server/queries/calc-adapters';
import { financialVisibility, maskRateRolesForViewer, restrictedNoticeFor } from '@/lib/security/masking';
import { RestrictedNotice } from '@/components/security/Masked';

export default async function DealProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { organizationId, deliveryRole, governance, resourceId, resourcePracticeId } = await requireOrgContext();

  const { project, roleRows } = await loadCommercialBaselineModulePage({ organizationId }, (await params).projectId);
  if (!project) notFound();

  const health = getProjectHealth(project);
  const canEdit = canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, project);
  const visibility = financialVisibility(deliveryRole, governance);
  const maskedRoles = maskRateRolesForViewer(toRateRoles(roleRows), deliveryRole, governance);

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
          Engagement Governance · {project.name}
        </div>
        <h1 className="text-2xl font-display font-bold">Commercial Baseline</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Contractual scope, baseline hours, sold margin, and agreed rate cards.
        </p>
      </div>

      <div className="card">
        <h2 className="text-[15.5px] font-bold mb-4">Commercial Setup</h2>
        {/* Each label/value pair is its own grid cell (a <div> wrapping its
            own <dt>/<dd>), never bare alternating dt/dd siblings flowing
            straight into the grid — with a 3-column grid, sequential
            dt,dd,dt,dd,... flow shifts the pairing by one position after
            the first row (label lands in what reads as a value column,
            value lands under the next label), compounding down every
            subsequent row. Wrapping each pair keeps one label always
            paired with its own value regardless of column count. */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Client</dt>
            <dd className="text-right">{project.client || '—'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Commercial model</dt>
            <dd className="text-right">{project.commercialModel === 'FF' ? 'Fixed Fee' : 'Time & Materials'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Methodology</dt>
            <dd className="text-right capitalize">{project.methodology.toLowerCase()}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Governance profile</dt>
            <dd className="text-right capitalize">{project.govProfile.toLowerCase()}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Contingency</dt>
            <dd className="text-right">{Number(project.contingencyPct)}%</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Practice Director</dt>
            <dd className="text-right">{project.practiceDirector?.name ?? 'Unassigned'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Delivery Manager</dt>
            <dd className="text-right">{project.deliveryManager?.name ?? 'Unassigned'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">Project Manager</dt>
            <dd className="text-right">{project.projectManager?.name ?? 'Unassigned'}</dd>
          </div>
        </dl>
      </div>

      <RestrictedNotice text={restrictedNoticeFor(visibility)} />

      <DealEditor
        projectId={project.id}
        canEdit={canEdit}
        visibility={visibility}
        estimationMode={project.estimationMode}
        commercialModel={project.commercialModel}
        contingencyPct={Number(project.contingencyPct)}
        roles={maskedRoles}
        effortCells={project.effortCells.map((c) => ({ phaseKey: c.phaseKey, roleId: c.roleId, hours: c.hours }))}
        directIntake={{
          soldHours: project.directIntakeSoldHours,
          targetRevenue: Number(project.directIntakeTargetRevenue),
          blendedMarginPct: visibility === 'restricted' ? 0 : Number(project.directIntakeBlendedMarginPct),
        }}
      />

      <div className="card">
        <h2 className="text-[15.5px] font-bold mb-1">Universal Scope &amp; Taxonomy Matrix</h2>
        <p className="text-[12.5px] text-ink-muted mb-4">Workstreams included in this engagement, and their sizing complexity.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Workstream</th>
                <th className="py-2 pr-4">Included</th>
                <th className="py-2 pr-4">Complexity</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {project.scopeItems.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-semibold">{s.name}</td>
                  <td className="py-2 pr-4 text-ink-muted">{s.included ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4 text-ink-muted capitalize">{s.complexity.toLowerCase()}</td>
                  <td className="py-2 pr-4 text-ink-muted">{s.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
