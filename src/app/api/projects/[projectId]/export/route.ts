import { NextResponse } from 'next/server';
import { getOrgContextOrNull } from '@/lib/session';
import { passwordRotationGate } from '@/lib/auth/password-rotation';
import { loadProjectExport } from '@/server/queries/reports-exports';

/**
 * "Export JSON Package" — a full, org-scoped snapshot of one project
 * (scope, effort matrix, audit, RAID, financial actuals, schedule) as a
 * downloadable attachment. Route handlers can't use next/navigation's
 * redirect() for the unauthenticated/no-org case (that's a page-rendering
 * signal only), so this uses getOrgContextOrNull() and returns real HTTP
 * status codes instead.
 */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const blocked = await passwordRotationGate();
  if (blocked) return blocked;
  const context = await getOrgContextOrNull();
  if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const project = await loadProjectExport({ organizationId: context.organizationId }, params.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: context.session.user.email ?? context.session.user.name ?? context.userId,
    organization: { id: context.organizationId, name: context.organizationName },
    project,
  };

  const fileName = `${project.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}_a2r-export.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
