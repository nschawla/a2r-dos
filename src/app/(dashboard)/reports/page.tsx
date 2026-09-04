import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import { getScopedProjectsForUser } from '@/lib/db/scoped-portfolio';
import { getProjectHealth } from '@/server/queries/health';
import { getExecutiveBriefing } from '@/server/queries/executive-briefing';
import { canEditProject } from '@/lib/auth/rbac';
import { listSteerCoDecisions } from '@/server/actions/steerco';
import { ExecutiveBriefing } from '@/components/reports/ExecutiveBriefing';
import { ReportsHubClient, type ReportsProjectView } from '@/components/reports/reports-hub-client';
import { canViewMargins } from '@/lib/security/masking';
import { ModuleTabs } from '@/components/ui/module-tabs';

/**
 * Executive Briefing Hub (`/reports`). Server component with two layers:
 *
 *   1. The portfolio-wide, print-optimised Executive Briefing (org-scoped —
 *      an exec briefing is inherently the whole PS portfolio). Data comes
 *      from src/server/queries/executive-briefing.ts; the print button and
 *      @media print rules in globals.css turn it into a board-ready PDF.
 *
 *   2. Below it (screen only), the per-engagement SteerCo deck / margin
 *      rollup / compliance certificate tooling — role-scoped via
 *      `getScopedProjectsForUser`, reads `?project=` for deep-linking from a
 *      module ProjectHeader, and hands everything to the client component
 *      that owns the selector UI and the SteerCo Decision Tracker.
 *
 * Deliberately NOT gated by `steerco:view` (reserved since WP4 for a
 * future, unrestricted cross-portfolio "SteerCo War Room" — see rbac.ts).
 * This Hub is a role-scoped-per-project reporting utility: a PROJECT_MANAGER
 * should be able to generate a SteerCo deck for their own engagement, which
 * an ADMIN/VP_EXECUTIVE-only gate would block.
 *
 * Program containers (hierarchyLevel PARENT) are excluded from the
 * selector — they have no sizing/financials/audit of their own to report
 * on, same reasoning as the Portfolio CSV route's own exclusion.
 */
export default async function ReportsHubPage({ searchParams }: { searchParams: { project?: string } }) {
  const context = await requireOrgContext();
  const { organizationId, deliveryRole, governance, resourceId, resourcePracticeId } = context;

  const scoped = await getScopedProjectsForUser(context);
  const reportable = scoped.filter((p) => p.hierarchyLevel !== 'PARENT');

  const projects: ReportsProjectView[] = reportable.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client,
    healthCode: getProjectHealth(p).code,
  }));

  const requested = searchParams.project;
  const selected = requested ? reportable.find((p) => p.id === requested) : undefined;
  const selectedProject = selected ?? reportable[0];
  const selectedProjectId = selectedProject?.id ?? null;

  const [decisionsResult, resources, briefing] = await Promise.all([
    selectedProjectId ? listSteerCoDecisions(selectedProjectId) : Promise.resolve(null),
    db.resource.findMany({ where: { organizationId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getExecutiveBriefing(organizationId),
  ]);

  const canEdit = selectedProject
    ? canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, selectedProject)
    : false;

  return (
    <>
      <div className="no-print">
        <h1 className="text-2xl font-display font-bold">Executive Briefing Hub</h1>
        <p className="text-ink-muted text-sm mt-1">
          A portfolio-wide, print-ready board briefing — plus per-engagement SteerCo decks and compliance certificates.
          Every figure is generated from the same live engines the module pages use, so nothing here can drift from what
          the app itself shows.
        </p>
      </div>

      <ModuleTabs
        printKey="briefing"
        tabs={[
          { key: 'briefing', label: 'Portfolio Briefing' },
          { key: 'engagements', label: 'Engagement Reports' },
        ]}
        panels={{
          briefing: (
            <ExecutiveBriefing briefing={briefing} showFinancials={canViewMargins(deliveryRole, governance)} />
          ),
          engagements: (
            <section className="flex flex-col gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
                  Per-Engagement Reports
                </div>
                <h2 className="text-[15.5px] font-bold">
                  SteerCo Decks, Margin Rollups &amp; Compliance Certificates
                </h2>
              </div>
              <ReportsHubClient
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedProjectLocked={selectedProject?.locked ?? null}
                canEdit={canEdit}
                decisions={decisionsResult && decisionsResult.ok ? decisionsResult.decisions : []}
                decisionsError={decisionsResult && !decisionsResult.ok ? decisionsResult.error : null}
                resources={resources}
              />
            </section>
          ),
        }}
      />
    </>
  );
}
