import { NextResponse } from 'next/server';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { getScopedProjectsForUser } from '@/lib/db/scoped-portfolio';
import { loadPortfolioCsvRoles } from '@/server/queries/reports-exports';
import { computeTotalsFor } from '@/lib/calculations/sizing';
import { computeEacSummary } from '@/lib/calculations/financials';
import { computeProjectHealth } from '@/lib/calculations/audit';
import { toAuditEntries, toFinancialActuals, toRateRoles, toSizingInput } from '@/server/queries/calc-adapters';
import { buildPortfolioCsvRows, serializePortfolioCsv } from '@/lib/reports/portfolio-csv';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { rateLimitGuard, tooManyRequestsResponse, withRateLimitHeaders } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';

/**
 * WP7 — "Portfolio Margin Rollup CSV". A GET route (not a Server Action +
 * client Blob) — no confirmation step, matches the project-export route.
 * Scoped via `getScopedProjectsForUser` (see src/lib/db/scoped-portfolio.ts):
 * a PROJECT_MANAGER's download contains only their own projects.
 *
 * P2 — rate-limited per user (RATE_LIMITS.BULK_EXPORT); the `X-RateLimit-*`
 * headers are on the 200 too, and the whole handler is wrapped so an
 * unhandled throw becomes one structured log + a generic 500.
 */
export const GET = withRouteHandler('reports/portfolio-csv', async () => {
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;
  const context = await getOrgContextOrNull();
  if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const g = await rateLimitGuard(`export:csv:${context.userId}`, RATE_LIMITS.BULK_EXPORT);
  if (!g.allowed) {
    return tooManyRequestsResponse(g.result, 'Too many portfolio exports. Please wait a few minutes.');
  }

  const [projects, roleRows] = await Promise.all([
    getScopedProjectsForUser(context),
    loadPortfolioCsvRoles({ organizationId: context.organizationId }),
  ]);
  const roles = toRateRoles(roleRows);

  // Program containers (hierarchyLevel PARENT) have no sizing/financials of
  // their own — they roll up their children — so exclude them here, same as
  // computePortfolioSummary.
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

  const res = new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="a2r-portfolio-margin-rollup_${stamp}.csv"`,
    },
  });
  return withRateLimitHeaders(res, g.result);
});
