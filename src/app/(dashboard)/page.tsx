import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import { getScopedPortfolioSummary } from '@/lib/db/scoped-portfolio';
import { getScopedResourceWhere } from '@/lib/scoping';
import { getProjectHealth } from '@/server/queries/health';
import { getBlendedUtilization } from '@/server/queries/capacity';
import { getVisibleCustomKpis, getKpiMetricValues } from '@/server/queries/kpi-data';
import { personaForDeliveryRole } from '@/lib/governance/rbacMatrix';
import { DELIVERY_ROLE_LABEL } from '@/lib/auth/rbac';
import { canViewMargins } from '@/lib/security/masking';
import { MaskedValue } from '@/components/security/Masked';
import { StatCard } from '@/components/ui/stat-card';
import { ModuleTabs } from '@/components/ui/module-tabs';
import { KpiWidgetRow } from '@/components/kpi/KpiWidgetCard';
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
  const { projects, summary, programRollups } = await getScopedPortfolioSummary(context);
  const scopedProjectIds = projects.map((p) => p.id);
  const showMargins = canViewMargins(deliveryRole, governance);

  const [recentActivity, resourceCount, practiceCount, utilization] = await Promise.all([
    db.activityLogEntry.findMany({
      where: { organizationId, OR: [{ projectId: null }, { projectId: { in: scopedProjectIds } }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, email: true } }, project: { select: { name: true } } },
    }),
    // Scoped like the roster on /capacity — "Resources on Roster" is
    // headcount for someone else's team, the same kind of practice-
    // boundary data as the project list above. `practiceCount` stays
    // tenant-wide deliberately: it's a structural fact about the org
    // (how many practice buckets exist at all), not a roster.
    db.resource.count({ where: getScopedResourceWhere(context) }),
    db.practice.count({ where: { organizationId } }),
    getBlendedUtilization(organizationId),
  ]);

  const raidCounts = await db.raidEntry.groupBy({
    by: ['projectId'],
    where: { projectId: { in: scopedProjectIds }, status: { not: 'CLOSED' } },
    _count: { _all: true },
  });
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

  const engagementsPanel = (
    <>
      <div className="card">
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

        {projects.length === 0 ? (
          <p className="text-ink-muted text-sm py-6 text-center">
            No projects in scope yet. {deliveryRole === 'ADMIN' ? 'Create your first engagement below to seed its scope, schedule, and audit rows.' : 'Ask an Admin to assign you to a project.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">PM</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Methodology</th>
                  <th className="py-2 pr-4">Health</th>
                  <th className="py-2 pr-4">Open RAID</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const health = getProjectHealth(p);
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-4 font-semibold">{p.name}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{p.client || '—'}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{p.projectManager?.name ?? 'Unassigned'}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{p.commercialModel}</td>
                      <td className="py-2.5 pr-4 text-ink-muted capitalize">{p.methodology.toLowerCase()}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`status-dot ${HEALTH_DOT[health.code]}`} />
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{openRaidByProject.get(p.id) ?? 0}</td>
                      <td className="py-2.5 pr-4">
                        <Link href={`/commercial-baseline/${p.id}`} className="text-brand text-xs font-semibold">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

