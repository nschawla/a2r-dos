import Link from 'next/link';
import { Suspense, cache } from 'react';
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
import { DecisionCenter, DecisionCenterSummary } from '@/components/portfolio/DecisionCenter';
import { ProjectsExplorer, type ProjectExplorerRow } from '@/components/portfolio/ProjectsExplorer';
import { TrackedProjectLink } from '@/components/portfolio/TrackedProjectLink';
import { CommandBar } from '@/components/command-center/CommandBar';
import { d, money, sumMoney } from '@/lib/calculations/money';
import { CreateProjectForm } from './create-project-form';

const HEALTH_DOT: Record<string, string> = { G: 'bg-success', Y: 'bg-warning', R: 'bg-critical' };

/**
 * The Decision Center's own data assembly (triage synthesis + the PS
 * Orchestration engine's real-headroom/swap-candidate search) — the
 * heaviest single piece of this page's server work, and needed in TWO
 * places since the Control Tower UX Refactor: the Overview tab's compact
 * summary tile, and the Decisions tab's full card list. `cache()` (React's
 * per-request memoization) means calling this twice with the same
 * `context`/`portfolioSummary`/`capacityRows`/`scopedProjectIds`
 * references only actually runs the underlying queries once — the second
 * call resolves from the first's cached result, not a duplicate DB round
 * trip.
 */
const loadDecisionCenterData = cache(
  async (
    context: OrgContext,
    portfolioSummary: ScopedPortfolioSummary,
    capacityRows: ResourceCapacityRow[],
    scopedProjectIds: string[]
  ) => {
    const [decisionCenterAlerts, { items: triageItems, flagged }] = await Promise.all([
      loadDecisionCenterAlerts(context, scopedProjectIds),
      getExecutiveTriage(context, portfolioSummary),
    ]);
    const decisionContext = await loadDecisionContext(context, flagged, capacityRows);
    return { decisionCenterAlerts, triageItems, decisionContext };
  }
);

export default async function HomePage() {
  const context = await requireOrgContext();
  const { organizationId, deliveryRole, governance } = context;
  const isStaff = context.session.user.isA2rStaff === true;

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
  // FIRST frame is awaited here. The Decision Center data (see
  // loadDecisionCenterData above) is deliberately NOT awaited in this
  // function: it feeds two async Server Components below, each behind its
  // own <Suspense> boundary, so the stat cards and the project registry
  // table paint immediately while it streams in separately, instead of the
  // whole page waiting on its slowest query.
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

  // ── Overview — Bento Grid, 4-row structure ────────────────────────────
  //
  // Every "how's the portfolio doing right now" signal in one scannable,
  // above-the-fold grid instead of a long vertical stack, organized into
  // four logical rows (Scope & Footprint / Financial Scale & Backlog /
  // Action & Risk / Performance & Health) rather than an undifferentiated
  // stat strip — each row groups genuinely related signals so the eye
  // reads it as a structured brief, not a grab-bag of tiles. Cells use the
  // same tighter `card !p-4` density as StatCard and the five triage-
  // module dual-tile headers, rather than the default `.card` p-6 — more
  // signal per pixel.
  //
  // Row 2's Unscheduled Backlog (USB) figure reads Project.unscheduledBacklog
  // directly — a real denormalized snapshot column (schema comment: "USB —
  // sold-but-unscheduled value") that existed but was never surfaced
  // anywhere in the app before this pass. Summed in exact decimal
  // (src/lib/calculations/money.ts's d/sumMoney/money — same accumulate-
  // then-round-once convention the WP2 engine itself uses), same as
  // Actuals-to-Date and Forecast at Completion (EAC = bac − vac) below it —
  // real per-project snapshot fields, not derived/fabricated figures.
  const totalActuals = money(sumMoney(projects.map((p) => d(p.actualsCost))));
  const totalForecastEac = money(sumMoney(projects.map((p) => d(p.bac).minus(d(p.vac)))));
  const totalUnscheduledBacklog = money(sumMoney(projects.map((p) => d(p.unscheduledBacklog))));

  const utilizationTile = (
    <Link
      href="/capacity"
      className="card !p-4 flex flex-col justify-between gap-2 hover:border-brand/50 transition-colors"
    >
      <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">
        Blended Billable Utilization
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
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
        <span className="text-[11px] text-ink-faint">
          vs {(utilization.targetUtilPct * 100).toFixed(0)}% target · {utilization.headcountFte.toFixed(1)} FTE
        </span>
      </div>
      <span className="text-brand text-xs font-semibold whitespace-nowrap">Resource &amp; Capacity →</span>
    </Link>
  );

  const overviewPanel = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Row 1 — Scope & Footprint */}
      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Engagements" value={String(summary.projectCount)} />
        <StatCard label="Active Resources" value={String(resourceCount)} />
        <StatCard label="Practices" value={String(practiceCount)} />
      </div>

      {/* Row 2 — Financial Scale & Backlog */}
      <div className="sm:col-span-2 lg:col-span-3 card !p-4">
        <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">
          Total Contract Value
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="text-2xl font-display font-bold tabular-nums leading-none">
            ${Math.round(summary.totalValue).toLocaleString('en-US')}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Actuals to Date</div>
              <div className="text-[15px] font-display font-bold tabular-nums">
                <MaskedValue canView={showMargins} value={`$${totalActuals.toLocaleString('en-US')}`} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
                Forecast at Completion
              </div>
              <div className="text-[15px] font-display font-bold tabular-nums">
                <MaskedValue canView={showMargins} value={`$${totalForecastEac.toLocaleString('en-US')}`} />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-brand font-semibold">
                Unscheduled Backlog (USB)
              </div>
              <div
                className={`text-[15px] font-display font-bold tabular-nums ${
                  totalUnscheduledBacklog > 0 ? 'text-warning' : ''
                }`}
              >
                <MaskedValue canView={showMargins} value={`$${totalUnscheduledBacklog.toLocaleString('en-US')}`} />
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-ink-faint mt-2">
          Sold-but-unscheduled value not yet on a locked baseline — revenue leakage and cash-flow-predictability
          exposure until it&apos;s scheduled and billed.
        </p>
      </div>

      {/* Row 3 — Action & Risk */}
      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<SkeletonCard lines={2} />}>
          <DecisionCenterSummarySection
            context={context}
            portfolioSummary={portfolioSummary}
            capacityRows={capacityRows}
            scopedProjectIds={scopedProjectIds}
          />
        </Suspense>
        <StatCard
          label="High-Risk (Red) Projects"
          value={String(summary.highRiskCount)}
          tone={summary.highRiskCount > 0 ? 'text-critical' : undefined}
          className="h-full justify-center"
        />
      </div>

      {/* Row 4 — Performance & Health */}
      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatCard
          label="Avg. Baseline Margin"
          value={showMargins ? (summary.hasMargin ? `${summary.avgMarginPct.toFixed(1)}%` : '—') : '••••'}
          restricted={!showMargins}
          className="h-full justify-center"
        />
        {utilizationTile}
      </div>

      {customKpis.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-3">
          <KpiWidgetRow kpis={customKpis} values={kpiValues} persona={viewerPersona} />
        </div>
      )}

      {programRollups.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-3 card !p-4">
          <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Program Rollups</div>
          <h2 className="text-[14px] font-bold mb-3">Parent Programs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-1.5 pr-4">Program</th>
                  <th className="py-1.5 pr-4">Waves</th>
                  <th className="py-1.5 pr-4">Contract Value</th>
                  <th className="py-1.5 pr-4">Blended EAC Margin</th>
                  <th className="py-1.5 pr-4">Open RR Hours</th>
                  <th className="py-1.5 pr-4">Health</th>
                </tr>
              </thead>
              <tbody>
                {programRollups.map(({ parent, rollup }) => (
                  <tr key={parent.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-semibold">
                      <TrackedProjectLink href={`/commercial-baseline/${parent.id}`} label={parent.name} className="hover:text-brand">
                        {parent.name}
                      </TrackedProjectLink>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-ink-muted">{rollup.childCount}</td>
                    <td className="py-2 pr-4 tabular-nums">${Math.round(rollup.totalContractValue).toLocaleString('en-US')}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      <MaskedValue canView={showMargins} value={`${rollup.blendedEacMarginPct.toFixed(1)}%`} />
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-ink-muted">{rollup.totalOpenRRHours.toLocaleString('en-US')}</td>
                    <td className="py-2 pr-4">
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
    </div>
  );

  // ── Decisions — the full Decision Center, tucked into its own tab ────
  //
  // The Impact-Aware Decision Cards are the richest, tallest content on
  // this page (each one a multi-field grid plus an options row) — exactly
  // the kind of heavy section the Control Tower UX Refactor moves out of
  // the always-visible fold and into a dedicated tab a viewer reaches in
  // one click (from the Overview tile above, or the tab pill itself).
  const decisionsPanel = (
    <Suspense fallback={<SkeletonCard lines={4} />}>
      <DecisionCenterFullSection
        context={context}
        portfolioSummary={portfolioSummary}
        capacityRows={capacityRows}
        scopedProjectIds={scopedProjectIds}
      />
    </Suspense>
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
      // PS-DOS IQ (client-side NL search, ProjectsExplorer.tsx) filters
      // against this plain-text/plain-value data, never the pre-rendered
      // `cells` below — those are JSX, not searchable text.
      searchable: {
        name: p.name,
        client: p.client ?? '',
        pm: p.projectManager?.name ?? '',
        model: p.commercialModel,
        methodology: p.methodology,
        raidCount: openRaidByProject.get(p.id) ?? 0,
        unassigned: !p.projectManager,
      },
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
          <TrackedProjectLink
            href={`/commercial-baseline/${p.id}`}
            label={p.name}
            className="text-brand text-xs font-semibold whitespace-nowrap"
          >
            Open →
          </TrackedProjectLink>
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

      {/* The universal Command Bar (Command Center Merge) — pinned above the
          tabs so it stays reachable regardless of which one is active,
          mirroring its original bottom-pinned positioning on the now-retired
          /command page. */}
      <CommandBar projects={projects.map((p) => ({ id: p.id, name: p.name }))} isStaff={isStaff} />

      <ModuleTabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'decisions', label: 'Decisions' },
          { key: 'engagements', label: 'Engagements' },
          { key: 'activity', label: 'Activity' },
        ]}
        panels={{ overview: overviewPanel, decisions: decisionsPanel, engagements: engagementsPanel, activity: activityPanel }}
      />
    </>
  );
}

async function DecisionCenterSummarySection({
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
  const { decisionCenterAlerts, triageItems } = await loadDecisionCenterData(context, portfolioSummary, capacityRows, scopedProjectIds);
  return (
    <DecisionCenterSummary
      triageItems={triageItems}
      pendingDecisions={decisionCenterAlerts.pendingDecisions}
      criticalRaid={decisionCenterAlerts.criticalRaid}
    />
  );
}

async function DecisionCenterFullSection({
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
  const { decisionCenterAlerts, triageItems, decisionContext } = await loadDecisionCenterData(
    context,
    portfolioSummary,
    capacityRows,
    scopedProjectIds
  );

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
