/**
 * Data Ingestion & Template Hub — template download endpoint.
 *
 *   GET /api/templates/<id>   →  text/csv attachment
 *
 * `<id>` is one of the slugs in src/server/services/templates.ts
 * (resource-allocation | project-baseline | timesheet-actuals). The CSV is
 * generated from the same definition the hub UI renders its schema table
 * from, so the file and the docs can't drift.
 *
 * Any authenticated session may download — templates are non-sensitive
 * reference files, needed by both tenant admins (from /admin) and A2R
 * operators (from /ops/ingestion).
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTemplate, renderTemplateCsv } from '@/server/services/templates';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { template: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const template = getTemplate(params.template);
  if (!template) {
    return NextResponse.json(
      { error: `Unknown template "${params.template}".` },
      { status: 404 }
    );
  }

  return new NextResponse(renderTemplateCsv(template), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
