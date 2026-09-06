import { NextResponse } from 'next/server';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { loadProjectExport } from '@/server/queries/reports-exports';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { rateLimitGuard, tooManyRequestsResponse, withRateLimitHeaders } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';

/**
 * "Export JSON Package" — a full, org-scoped snapshot of one project. Route
 * handlers can't `redirect()`, so this returns real HTTP status codes.
 *
 * P2 — per-user rate limit (RATE_LIMITS.BULK_EXPORT), `X-RateLimit-*` on the
 * 200, and the handler is wrapped so an unhandled throw → structured log + 500.
 */
export const GET = withRouteHandler<{ params: Promise<{ projectId: string }> }>(
  'projects/export',
  async (_request, { params }) => {
    const { projectId } = await params;
    const blocked = await passwordRotationGate();
    if (blocked) return blocked;
    const context = await getOrgContextOrNull();
    if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const g = rateLimitGuard(`export:project:${context.userId}`, RATE_LIMITS.BULK_EXPORT);
    if (!g.allowed) {
      return tooManyRequestsResponse(g.result, 'Too many project exports. Please wait a few minutes.');
    }

    const project = await loadProjectExport({ organizationId: context.organizationId }, projectId);
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: context.session.user.email ?? context.session.user.name ?? context.userId,
      organization: { id: context.organizationId, name: context.organizationName },
      project,
    };

    const fileName = `${project.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}_a2r-export.json`;

    const res = new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
    return withRateLimitHeaders(res, g.result);
  },
);
