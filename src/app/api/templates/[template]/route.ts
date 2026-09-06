/**
 * Data Ingestion & Template Hub — template download endpoint.
 *
 *   GET /api/templates/<id>   →  text/csv attachment
 *
 * `<id>` is one of the slugs in src/server/services/templates.ts. Any
 * authenticated session may download — templates are non-sensitive
 * reference files.
 *
 * P2 — per-user rate limit (RATE_LIMITS.TEMPLATE_DOWNLOAD), `X-RateLimit-*`
 * on the 200, wrapped for structured error capture.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { getTemplate, renderTemplateCsv } from '@/server/services/templates';
import { withRouteHandler } from '@/lib/observability/route-wrapper';
import { rateLimitGuard, tooManyRequestsResponse, withRateLimitHeaders } from '@/lib/rate-limiter';
import { RATE_LIMITS } from '@/lib/rate-limits';

export const dynamic = 'force-dynamic';

export const GET = withRouteHandler<{ params: Promise<{ template: string }> }>('templates/download', async (_request, { params }) => {
  const { template: templateSlug } = await params;
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const g = rateLimitGuard(`template:${session.user.id}`, RATE_LIMITS.TEMPLATE_DOWNLOAD);
  if (!g.allowed) return tooManyRequestsResponse(g.result, 'Too many template downloads. Please wait a moment.');

  const template = getTemplate(templateSlug);
  if (!template) {
    return NextResponse.json({ error: `Unknown template "${templateSlug}".` }, { status: 404 });
  }

  const res = new NextResponse(renderTemplateCsv(template), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
  return withRateLimitHeaders(res, g.result);
});
