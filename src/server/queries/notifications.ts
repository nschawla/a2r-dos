import { db } from '@/lib/db';
import { computePhasePace } from '@/lib/calculations/schedule';

export interface PaceAlert {
  projectId: string;
  projectName: string;
  phaseKey: string;
  elapsedPct: number;
}

export interface RaidAlert {
  id: string;
  projectId: string;
  projectName: string;
  description: string;
  severity: string;
}

export interface NotificationSummary {
  paceAlerts: PaceAlert[];
  raidAlerts: RaidAlert[];
  total: number;
}

/**
 * Org-wide alert feed for the header's notification bell: schedule phases
 * currently at "Critical Pace Risk" (see computePhasePace in
 * src/lib/calculations/schedule.ts — >75% of the planned window elapsed
 * with <50% complete), plus open RAID items flagged for SteerCo escalation.
 * Both checks reuse the WP2 engine against live data rather than
 * re-deriving the thresholds here.
 */
export async function getNotificationSummary(organizationId: string): Promise<NotificationSummary> {
  const [phases, raidEntries] = await Promise.all([
    db.schedulePhase.findMany({
      where: { project: { organizationId } },
      include: { project: { select: { id: true, name: true } } },
    }),
    db.raidEntry.findMany({
      where: { project: { organizationId }, escalate: true, status: { not: 'CLOSED' } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const now = new Date();
  const paceAlerts: PaceAlert[] = [];
  for (const phase of phases) {
    const pace = computePhasePace(phase.plannedStart, phase.plannedEnd, phase.pctComplete, {
      status: phase.status.toLowerCase(),
      now,
    });
    if (pace.state === 'critical') {
      paceAlerts.push({
        projectId: phase.project.id,
        projectName: phase.project.name,
        phaseKey: phase.phaseKey,
        elapsedPct: Math.round(pace.elapsedPct ?? 0),
      });
    }
  }

  const raidAlerts: RaidAlert[] = raidEntries.map((e) => ({
    id: e.id,
    projectId: e.project.id,
    projectName: e.project.name,
    description: e.description,
    severity: e.severity,
  }));

  return { paceAlerts, raidAlerts, total: paceAlerts.length + raidAlerts.length };
}
