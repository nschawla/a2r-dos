/**
 * Active Stream — one chronological feed of live operational and
 * governance state for the Command Center, merged from:
 *   • ActivityLogEntry — the human-readable "who did what" feed
 *   • AuditLog          — governance-grade state changes (baseline locks,
 *                         EAC updates, RAID escalation, audit scoring, imports)
 *   • RaidEntry         — currently open, SteerCo-escalated risks
 *
 * Org-scoped, newest first, capped. No per-board fan-out — this replaces
 * the cluttered multi-board view with a single settled timeline.
 */
import { db } from '@/lib/db';

export type StreamTone = 'default' | 'good' | 'warn' | 'critical';

export interface StreamEvent {
  id: string;
  kind: 'activity' | 'governance' | 'risk';
  title: string;
  detail: string | null;
  /** Engagement or actor the event belongs to. */
  context: string | null;
  /** ISO 8601. */
  at: string;
  tone: StreamTone;
}

const AUDIT_META: Record<string, { label: string; tone: StreamTone }> = {
  BASELINE_LOCKED: { label: 'Baseline locked', tone: 'good' },
  BASELINE_UNLOCKED: { label: 'Baseline unlocked', tone: 'warn' },
  EAC_ACTUAL_UPDATED: { label: 'EAC actuals updated', tone: 'default' },
  RAID_ESCALATED: { label: 'RAID escalated to SteerCo', tone: 'warn' },
  RAID_UNESCALATED: { label: 'RAID de-escalated', tone: 'default' },
  AUDIT_SCORE_CHANGED: { label: 'Audit score changed', tone: 'default' },
  CSV_IMPORT_COMMITTED: { label: 'CSV import committed', tone: 'default' },
  WORKSPACE_EXPORTED: { label: 'Workspace exported', tone: 'default' },
  WORKSPACE_RESTORED: { label: 'Workspace restored', tone: 'critical' },
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MED: 'Medium',
  LOW: 'Low',
};

export async function getActiveStream(organizationId: string, limit = 24): Promise<StreamEvent[]> {
  const [activity, audit, raid] = await Promise.all([
    db.activityLogEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    }),
    db.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    }),
    db.raidEntry.findMany({
      where: { project: { organizationId }, escalate: true, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { project: { select: { name: true } } },
    }),
  ]);

  const events: StreamEvent[] = [];

  for (const a of activity) {
    events.push({
      id: `act-${a.id}`,
      kind: 'activity',
      title: a.text,
      detail: null,
      context: a.project?.name ?? a.user?.name ?? a.user?.email ?? null,
      at: a.createdAt.toISOString(),
      tone: 'default',
    });
  }

  for (const g of audit) {
    const meta = AUDIT_META[g.action] ?? { label: humanize(g.action), tone: 'default' as StreamTone };
    const detail = g.entityType
      ? `${g.entityType.toLowerCase().replace(/_/g, ' ')}${g.entityId ? ` · ${g.entityId}` : ''}`
      : null;
    events.push({
      id: `aud-${g.id}`,
      kind: 'governance',
      title: meta.label,
      detail,
      context: g.project?.name ?? g.user?.name ?? g.user?.email ?? null,
      at: g.createdAt.toISOString(),
      tone: meta.tone,
    });
  }

  for (const r of raid) {
    const headline = r.title?.trim() || r.description.slice(0, 90);
    events.push({
      id: `raid-${r.id}`,
      kind: 'risk',
      title: headline,
      detail: `${SEVERITY_LABEL[r.severity] ?? r.severity} · SteerCo-escalated ${r.type.toLowerCase()}`,
      context: r.project.name,
      at: r.createdAt.toISOString(),
      tone: r.severity === 'CRITICAL' ? 'critical' : r.severity === 'HIGH' ? 'warn' : 'default',
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

function humanize(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
