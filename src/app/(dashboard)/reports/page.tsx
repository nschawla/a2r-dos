import { requireOrgContext } from '@/lib/session';
import { loadReportsHubRows } from '@/server/queries/pages/dashboards';
import { getScopedProjectsForUser } from '@/lib/db/scoped-portfolio';
import { getProjectHealth } from '@/server/queries/health';
import { getExecutiveBriefing } from '@/server/queries/executive-briefing';
import { canEditProject } from '@/lib/auth/rbac';
import { listSteerCoDecisions } from '@/server/actions/steerco';
import { ExecutiveBriefing } from '@/components/reports/ExecutiveBriefing';
import { ReportsHubClient, type ReportsProjectView } from '@/components/reports/reports-hub-client';
import { canViewMargins } from '@/lib/security/masking';
import { ModuleTabs } from '@/components/ui/module-tabs';
import { computePortfolioSummary } from '@/lib/calculations/portfolio';
import { toAuditEntries, toRateRoles, toSizingInput, hierarchyLevelLower } from '@/server/queries/calc-adapters';
import { getVisibleCustomKpis, getKpiMetricValues } from '@/server/queries/kpi-data';
import { personaForDeliveryRole } from '@/lib/governance/rbacMatrix';
import { KpiWidgetRow } from '@/components/kpi/KpiWidgetCard';

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

  const [decisionsResult, { resources, deliveryRoles }, briefing, customKpis] = await Promise.all([
    selectedProjectId ? listSteerCoDecisions(selectedProjectId) : Promise.resolve(null),
    loadReportsHubRows({ organizationId }),
    getExecutiveBriefing(organizationId),
    getVisibleCustomKpis(organizationId),
  ]);

  const canEdit = selectedProject
    ? canEditProject({ deliveryRole, resourceId, practiceId: resourcePracticeId }, selectedProject)
    : false;

  // Custom KPI Definition Engine — reuses `scoped` (this viewer's own
  // role-scoped project list, already fetched above for the engagement
  // picker) rather than a fresh org-wide query. That's a narrower scope
  // than the Executive Briefing panel above it, which is deliberately
  // org-wide for every viewer (see this file's own doc comment) — a
  // Practice Director's custom-KPI cards here read their own practice,
  // not the whole tenant the briefing shows. Skipped entirely when the
  // tenant has no custom KPIs defined.
  const scopedProjectIds = scoped.map((p) => p.id);
  const rateRoles = toRateRoles(deliveryRoles);
  const portfolioSummary = computePortfolioSummary(
    scoped.map((p) => ({
      id: p.id,
      hierarchyLevel: hierarchyLevelLower(p.hierarchyLevel),
      locked: p.locked,
      sizing: toSizingInput(p),
      auditEntries: toAuditEntries(p.auditEntries),
    })),
    rateRoles
  );
  const kpiValues =
    customKpis.length > 0 ? await getKpiMetricValues(organizationId, scopedProjectIds, portfolioSummary) : {};
  const viewerPersona = personaForDeliveryRole(deliveryRole);

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
            <>
              <ExecutiveBriefing briefing={briefing} showFinancials={canViewMargins(deliveryRole, governance)} />
              <div className="no-print">
                <KpiWidgetRow kpis={customKpis} values={kpiValues} persona={viewerPersona} />
              </div>
            </>
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
