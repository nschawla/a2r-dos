import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrgContextOrNull } from '@/lib/session';
import { getScopedProjectsForUser } from '@/lib/db/scoped-portfolio';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import { computeEacSummary } from '@/lib/calculations/financials';
import { computeProjectHealth } from '@/lib/calculations/audit';
import { toAuditEntries, toFinancialActuals, toRateRoles, toSizingInput } from '@/server/queries/calc-adapters';
import { buildPortfolioCsvRows, serializePortfolioCsv } from '@/lib/reports/portfolio-csv';

/**
 * WP7 — "Portfolio Margin Rollup CSV". Deliberately a GET route rather
 * than a Server Action + client-side Blob download (the pattern
 * WorkspaceBackup.tsx uses) — CSV export needs no confirmation step or
 * client-held state the way a destructive restore does, and a plain
 * `<a href>` download matches this app's existing project-export route
 * (src/app/api/projects/[projectId]/export/route.ts) exactly.
 *
 * Scoped via the same `getScopedProjectsForUser` every other portfolio
 * view uses (see src/lib/db/scoped-portfolio.ts) — a PROJECT_MANAGER's
 * download contains only their own projects, a PRACTICE_DIRECTOR's their
 * practice, and so on, with no separate permission check needed: the row
 * set itself is already the security boundary, exactly like the PS
 * Control Tower's own project table.
 */
export async function GET() {
  const context = await getOrgContextOrNull();
  if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const [projects, roleRows] = await Promise.all([
    getScopedProjectsForUser(context),
    db.deliveryRole.findMany({ where: { organizationId: context.organizationId } }),
  ]);
  const roles = toRateRoles(roleRows);

  // Program containers (hierarchyLevel PARENT) have no sizing/financials
  // of their own — they roll up their children instead (see
  // computeProgramRollup) — so they're excluded here the same way
  // computePortfolioSummary excludes them from compliance/health.
  const reportable = projects.filter((p) => p.hierarchyLevel !== 'PARENT');

  const csvProjects = reportable.map((p) => {
    const sizingInput = toSizingInput(p);
    const totals = computeTotalsFor(sizingInput, roles);
    const eac = computeEacSummary(sizingInput, roles, toFinancialActuals(p.financials));
    const health = computeProjectHealth({ locked: p.locked, auditEntries: toAuditEntries(p.auditEntries) });
    return {
      name: p.name,
      client: p.client,
      healthCode: health.code,
      contractValue: totals.contractValue,
      soldMarginPct: totals.marginPct,
      eac,
    };
  });

  const csv = serializePortfolioCsv(buildPortfolioCsvRows(csvProjects));
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="a2r-portfolio-margin-rollup_${stamp}.csv"`,
    },
  });
}
