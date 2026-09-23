import Link from 'next/link';
import { Suspense } from 'react';
import { requireOrgContext, type OrgContext } from '@/lib/session';
import { getScopedPortfolioSummary, type ScopedPortfolioSummary } from '@/lib/db/scoped-portfolio';
import { loadPortfolioDashboardExtras, loadDecisionCenterAlerts } from '@/server/queries/pages/dashboards';
import { getExecutiveTriage } from '@/server/queries/executive-triage';
import { loadDecisionContext } from '@/server/queries/decision-context';
import { getProjectHealth } from '@/server/queries/health';
import { loadCapacityRows } from '@/server/queries/capacity';
import { blendedSummary, type ResourceCapacityRow } from '@/lib/capacity-engine';
import { getVisibleCustomKpis, getKpiMetricValues } from '@/server/queries/kpi-data';
import { personaForDeliveryRole } from '@/lib/governance/rbacMatrix';
import { DELIVERY_ROLE_LABEL } from '@/lib/auth/rbac';
import { canViewMargins } from '@/lib/security/masking';
import { MaskedValue } from '@/components/security/Masked';
import { StatCard } from '@/components/ui/stat-card';
import { SkeletonCard } from '@/components/ui/skeleton';
import { ModuleTabs } from '@/components/ui/module-tabs';
import { TruncatedCell, type DataTableColumn } from '@/components/ui/data-table';
import { KpiWidgetRow } from '@/components/kpi/KpiWidgetCard';
import { DecisionCenter } from '@/components/portfolio/DecisionCenter';
import { ProjectsExplorer, type ProjectExplorerRow } from '@/components/portfolio/ProjectsExplorer';
import { CreateProjectForm } from './create-project-form';

const HEALTH_DOT: Record<string, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };

export default async function HomePage() {
  const context = await requireOrgContext();
  const { organizationId, deliveryRole, governance } = context;

  // WP4: the project list, stat cards, and program rollups are now the
  // scoped portfolio — a PROJECT_MANAGER sees only their own projects, a
  // PRACTICE_DIRECTOR their practice, and so on (see
  // src/lib/db/scoped-portfolio.ts). ADMIN/VP_EXECUTIVE see the full
  // tenant, same as before this WP.
  const portfolioSummary = await getScopedPortfolioSummary(context);
  const { projects, summary, programRollups } = portfolioSummary;
  const scopedProjectIds = projects.map((p) => p.id);
  const showMargins = canViewMargins(deliveryRole, governance);

  // Streaming: only the data every panel/tab actually needs to paint its
  // FIRST frame is awaited here. The Decision Center — the exception-
  // driven "needs attention today" panel, and the heaviest single piece of
  // this page's server work (triage synthesis + the PS Orchestration
  // engine's own real-headroom/swap-candidate search) — is deliberately
  // NOT awaited in this function: it's an async Server Component of its
  // own (below), rendered inside a <Suspense> boundary, so the stat cards
  // and the project registry table paint immediately while it streams in
  // separately, instead of the whole page waiting on its slowest query.
  // "Resources on Roster" is scoped like the /capacity roster — practice-
  // boundary data, same as the project list. `practiceCount` stays
  // tenant-wide deliberately: a structural fact about the org (how many
  // practice buckets exist), not a roster. See loadPortfolioDashboardExtras.
  const [{ recentActivity, resourceCount, practiceCount, raidCounts }, capacityRows] = await Promise.all([
    loadPortfolioDashboardExtras(context, scopedProjectIds),
    loadCapacityRows(organizationId),
  ]);
  const utilization = blendedSummary(capacityRows);
  const openRaidByProject = new Map(raidCounts.map((r) => [r.projectId, r._count._all]));

  // Custom KPI Definition Engine — skip the extra schedule/RAID/capacity
  // queries entirely when the tenant hasn't defined any KPIs, the common
  // case today.
  const customKpis = await getVisibleCustomKpis(organizationId);
  const kpiValues = customKpis.length > 0 ? await getKpiMetricValues(organizationId, scopedProjectIds, summary) : {};
  const viewerPersona = personaForDeliveryRole(deliveryRole);

  const portfolioPanel = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Engagements in Scope" value={String(summary.projectCount)} />
        <StatCard label="Total Contract Value" value={`$${Math.round(summary.totalValue).toLocaleString('en-US')}`} />
        <StatCard
          label="Avg. Baseline Margin"
          value={showMargins ? (summary.hasMargin ? `${summary.avgMarginPct.toFixed(1)}%` : '—') : '••••'}
          restricted={!showMargins}
        />
        <StatCard
          label="High-Risk (Red) Projects"
          value={String(summary.highRiskCount)}
          tone={summary.highRiskCount > 0 ? 'text-critical' : undefined}
        />
      </div>

      <KpiWidgetRow kpis={customKpis} values={kpiValues} persona={viewerPersona} />

      <Link
        href="/capacity"
        className="card !p-4 flex items-center justify-between gap-4 hover:border-brand/50 transition-colors"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">
            Blended Billable Utilization
          </div>
          <div className="flex items-baseline gap-3">
            <span
              className={`text-2xl font-display font-bold tabular-nums ${
                utilization.attainmentPct >= 0.98
                  ? 'text-success'
                  : utilization.attainmentPct >= 0.85
                    ? 'text-warning'
                    : 'text-critical'
              }`}
            >
              {(utilization.utilizationPct * 100).toFixed(1)}%
            </span>
            <span className="text-[12px] text-ink-faint">
              vs {(utilization.targetUtilPct * 100).toFixed(0)}% target · {(utilization.attainmentPct * 100).toFixed(0)}%
              attainment · {utilization.headcountFte.toFixed(1)} billable FTE
            </span>
          </div>
        </div>
        <span className="text-brand text-xs font-semibold whitespace-nowrap">Resource &amp; Capacity →</span>
      </Link>

      {programRollups.length > 0 && (
        <div className="card">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Program Rollups</div>
          <h2 className="text-[15.5px] font-bold mb-4">Parent Programs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Program</th>
                  <th className="py-2 pr-4">Waves</th>
                  <th className="py-2 pr-4">Contract Value</th>
                  <th className="py-2 pr-4">Blended EAC Margin</th>
                  <th className="py-2 pr-4">Open RR Hours</th>
                  <th className="py-2 pr-4">Health</th>
                </tr>
              </thead>
              <tbody>
                {programRollups.map(({ parent, rollup }) => (
                  <tr key={parent.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 font-semibold">
                      <Link href={`/commercial-baseline/${parent.id}`} className="hover:text-brand">
                        {parent.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-ink-muted">{rollup.childCount}</td>
                    <td className="py-2.5 pr-4 tabular-nums">${Math.round(rollup.totalContractValue).toLocaleString('en-US')}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      <MaskedValue canView={showMargins} value={`${rollup.blendedEacMarginPct.toFixed(1)}%`} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-ink-muted">{rollup.totalOpenRRHours.toLocaleString('en-US')}</td>
                    <td className="py-2.5 pr-4">
                      {rollup.health === 'NA' ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <span className={`status-dot ${HEALTH_DOT[rollup.health]}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Resources on Roster" value={String(resourceCount)} />
        <StatCard label="Practices" value={String(practiceCount)} />
      </div>
    </>
  );

  // No-Scroll table discipline: Project / Health / Open RAID / the action
  // link are core (always shown — the table can't do its job without
  // them); Client / PM / Model / Methodology are useful but optional, so a
  // viewer on a laptop-width window can decline them via "Customize
  // Display" instead of the table quietly overflowing sideways. All four
  // stay visible by default — this narrows the columns, it doesn't change
  // what a first-time visitor sees.
  //
  // RSC boundary: DataTable is a Client Component, so its columns carry no
  // render function (a function isn't serializable across a Server->Client
  // props boundary — Next.js throws at runtime the moment one crosses it).
  // Each row's cells are rendered right here, in this Server Component,
  // into plain ReactNode values instead.
  const projectColumns: DataTableColumn[] = [
    { key: 'name', header: 'Project', className: 'font-semibold max-w-[26ch]' },
    { key: 'client', header: 'Client', optional: true, className: 'text-ink-muted max-w-[18ch]' },
    { key: 'pm', header: 'PM', optional: true, className: 'text-ink-muted max-w-[16ch]' },
    { key: 'model', header: 'Model', optional: true, className: 'text-ink-muted' },
    { key: 'methodology', header: 'Methodology', optional: true, className: 'text-ink-muted capitalize' },
    { key: 'health', header: 'Health', align: 'center' },
    { key: 'raid', header: 'Open RAID', align: 'right', className: 'tabular-nums' },
    { key: 'action', header: '' },
  ];
  const projectRows: ProjectExplorerRow[] = projects.map((p) => {
    const health = getProjectHealth(p);
    return {
      key: p.id,
      healthCode: health.code,
      cellTitles: { client: p.client, pm: p.projectManager?.name },
      cells: {
        name: (
          <>
            <TruncatedCell>{p.name}</TruncatedCell>
            {health.code !== 'G' && p.narrativeBlockers && (
              <div className="text-[11px] font-normal text-ink-faint mt-0.5 whitespace-normal leading-snug">
                {p.narrativeBlockers}
              </div>
            )}
          </>
        ),
        client: <TruncatedCell>{p.client || '—'}</TruncatedCell>,
        pm: <TruncatedCell>{p.projectManager?.name ?? 'Unassigned'}</TruncatedCell>,
        model: p.commercialModel,
        methodology: p.methodology.toLowerCase(),
        health: (
          <span
            className={`status-dot ${HEALTH_DOT[health.code]}`}
            title={health.code !== 'G' && p.narrativeBlockers ? p.narrativeBlockers : undefined}
          />
        ),
        raid: openRaidByProject.get(p.id) ?? 0,
        action: (
          <Link href={`/commercial-baseline/${p.id}`} className="text-brand text-xs font-semibold whitespace-nowrap">
            Open →
          </Link>
        ),
      },
    };
  });

  const engagementsPanel = (
    <>
      <div className="card card-tint-governance">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Portfolio Registry</div>
            <h2 className="text-[15.5px] font-bold">Active Projects</h2>
            <p className="text-[12.5px] text-ink-muted mt-1 max-w-xl">
              Every engagement in your scope, its assigned leadership, live health, and one-click access to its
              modules.
            </p>
          </div>
        </div>

        <ProjectsExplorer
          storageKey="portfolio-active-projects"
          caption="Active projects in scope"
          rows={projectRows}
          emptyMessage={
            <>
              No projects in scope yet.{' '}
              {deliveryRole === 'ADMIN'
                ? 'Create your first engagement below to seed its scope, schedule, and audit rows.'
                : 'Ask an Admin to assign you to a project.'}
            </>
          }
          columns={projectColumns}
        />
      </div>

      <div className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Quick Launch</div>
        <h2 className="text-[15.5px] font-bold mb-4">Register a New Engagement</h2>
        <CreateProjectForm />
      </div>
    </>
  );

  const activityPanel = (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Portfolio</div>
      <h2 className="text-[15.5px] font-bold mb-4">Recent Activity</h2>
      {recentActivity.length === 0 ? (
        <p className="text-ink-muted text-sm">No governance actions logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {recentActivity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <span className="status-dot bg-brand mt-1.5" />
              <div>
                <div>{a.text}</div>
                <div className="text-ink-faint text-xs mt-0.5">
                  {a.project?.name ? `${a.project.name} · ` : ''}
                  {a.user?.name ?? a.user?.email ?? 'System'} · {a.createdAt.toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">PS Control Tower</h1>
        <p className="text-ink-muted text-sm mt-1">
          {deliveryRole === 'ADMIN' || deliveryRole === 'VP_EXECUTIVE'
            ? 'Portfolio-wide view across every registered engagement in your organization.'
            : `Scoped to your ${DELIVERY_ROLE_LABEL[deliveryRole]} portfolio — ${projects.length} engagement${projects.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      <Suspense fallback={<SkeletonCard lines={4} />}>
        <DecisionCenterSection
          context={context}
          portfolioSummary={portfolioSummary}
          capacityRows={capacityRows}
          scopedProjectIds={scopedProjectIds}
        />
      </Suspense>

      <ModuleTabs
        tabs={[
          { key: 'portfolio', label: 'Portfolio' },
          { key: 'engagements', label: 'Engagements' },
          { key: 'activity', label: 'Activity' },
        ]}
        panels={{ portfolio: portfolioPanel, engagements: engagementsPanel, activity: activityPanel }}
      />
    </>
  );
}

/**
 * The Decision Center's own data assembly, split out of `HomePage` so it
 * can stream in behind a `<Suspense>` boundary instead of gating the rest
 * of the page on its own slower queries (`getExecutiveTriage`'s narrative
 * synthesis, `loadDecisionCenterAlerts`, and the PS Orchestration engine's
 * real-headroom/swap-candidate search in `loadDecisionContext`). Receives
 * `portfolioSummary` and `capacityRows` as props — both already fetched by
 * the caller for its own stat cards — so this never re-fetches either.
 */
async function DecisionCenterSection({
  context,
  portfolioSummary,
  capacityRows,
  scopedProjectIds,
}: {
  context: OrgContext;
  portfolioSummary: ScopedPortfolioSummary;
  capacityRows: ResourceCapacityRow[];
  scopedProjectIds: string[];
}) {
  const { deliveryRole, governance } = context;
  const [decisionCenterAlerts, { items: triageItems, flagged }] = await Promise.all([
    loadDecisionCenterAlerts(context, scopedProjectIds),
    getExecutiveTriage(context, portfolioSummary),
  ]);
  const decisionContext = await loadDecisionContext(context, flagged, capacityRows);

  return (
    <DecisionCenter
      triageItems={triageItems}
      decisionContext={decisionContext}
      viewer={{ deliveryRole, approvalThresholdUsd: governance.interventionApprovalThresholdUsd }}
      pendingDecisions={decisionCenterAlerts.pendingDecisions}
      criticalRaid={decisionCenterAlerts.criticalRaid}
    />
  );
}

