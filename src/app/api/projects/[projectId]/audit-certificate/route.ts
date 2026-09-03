import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrgContextOrNull } from '@/lib/session';
import { CONTROL_DEFS, getControlDef } from '@/lib/constants';
import { computeAuditProgress, computeProjectHealth } from '@/lib/calculations/audit';
import { toAuditEntries, methodologyLower } from '@/server/queries/calc-adapters';
import { AuditCertificateView, type AuditCertificateControlRow } from '@/components/reports/AuditCertificateView';

/**
 * "Export Audit Certificate" / the Reports Hub's "Stage-Gate Audit
 * Certificate" launcher — mirrors status-report/route.ts's shape (fetch,
 * compute via the shared engine, hand off to a pure HTML-string view,
 * return text/html for the browser's own Print-to-PDF) but sources its
 * control rows the same way audit/[projectId]/page.tsx does: CONTROL_DEFS
 * as the 10-row spine, org-level ControlLabel overrides layered on top of
 * the methodology-specific default label, and a missing AuditEntry
 * defaulting to 'NO'/empty rather than being dropped — a control nobody
 * has touched yet is a real, reportable compliance gap, not an absent row.
 */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const context = await getOrgContextOrNull();
  if (!context) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const [project, controlLabels] = await Promise.all([
    db.project.findFirst({
      where: { id: params.projectId, organizationId: context.organizationId },
      include: { auditEntries: true },
    }),
    db.controlLabel.findMany({ where: { organizationId: context.organizationId } }),
  ]);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const labelByKey = new Map(controlLabels.map((c) => [c.controlKey, c.label]));
  const entryByKey = new Map(project.auditEntries.map((e) => [e.controlKey, e]));
  const methodologyKey = methodologyLower(project.methodology);

  const controls: AuditCertificateControlRow[] = CONTROL_DEFS.map((c) => {
    const entry = entryByKey.get(c.id);
    const label = labelByKey.get(c.id) ?? getControlDef(c.id)?.labels[methodologyKey] ?? c.id;
    return {
      controlKey: c.id,
      label,
      status: entry?.status ?? 'NO',
      owner: entry?.owner ?? null,
      repoLink: entry?.repoLink ?? null,
      verifiedAt: entry?.updatedAt ? entry.updatedAt.toISOString() : null,
    };
  });

  const progress = computeAuditProgress(toAuditEntries(project.auditEntries));
  const health = computeProjectHealth({ locked: project.locked, auditEntries: toAuditEntries(project.auditEntries) });

  // Certificate ids are deliberately derivable, not random — anyone holding
  // a printed certificate can be told "regenerate it from the project and
  // date" rather than the app needing to persist a certificate registry it
  // has no other use for.
  const stamp = new Date();
  const dateStamp = stamp.toISOString().slice(0, 10).replace(/-/g, '');
  const certificateId = `A2R-AC-${project.id.slice(-8).toUpperCase()}-${dateStamp}`;
  const generatedAt = stamp.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const html = AuditCertificateView({
    organizationName: context.organizationName,
    project: { name: project.name, client: project.client },
    methodologyLabel: methodologyKey.charAt(0).toUpperCase() + methodologyKey.slice(1),
    controls,
    progress,
    health,
    locked: project.locked,
    lockedAt: project.lockedAt ? project.lockedAt.toISOString() : null,
    certificateId,
    generatedAt,
  });

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
