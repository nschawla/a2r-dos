/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms) — see that document for the full
 * customer-data vs. A2R-IP ownership split and reverse-engineering
 * restrictions this file falls under.
 */

/**
 * Module 2 — Control Audit Intake math. Ported from the prototype's
 * `computeAuditProgressForEntries` and `computeProjectHealth`.
 */
import { CONTROL_DEFS } from '../constants';
import type { AuditEntryInput, AuditStatus, HealthCode, ProjectHealthInput } from './types';

export interface AuditProgress {
  counts: Record<AuditStatus, number>;
  /** CONTROL_DEFS.length minus the N/A count — the denominator for `score`. */
  applicable: number;
  /** yes = 1.0, partial = 0.5, no = 0, na excluded. */
  score: number;
  /** Rounded weighted compliance percentage. 100 when every control is N/A (nothing applicable to fail). */
  pct: number;
}

/**
 * Weighted compliance across all delivery controls. A control with no logged
 * entry counts as 'no' (matching the prototype's `entries[c.id] || {
 * status: 'no' }` fallback) — audit rows are expected to be pre-seeded for
 * every control on project creation, but this stays defensive for partial
 * data.
 */
export function computeAuditProgress(entries: AuditEntryInput[]): AuditProgress {
  const entryByKey = new Map(entries.map((e) => [e.controlKey, e]));
  const counts: Record<AuditStatus, number> = { yes: 0, partial: 0, no: 0, na: 0 };
  for (const c of CONTROL_DEFS) {
    const status = entryByKey.get(c.id)?.status ?? 'no';
    counts[status] += 1;
  }
  const applicable = CONTROL_DEFS.length - counts.na;
  const score = counts.yes * 1 + counts.partial * 0.5;
  const pct = applicable > 0 ? Math.round((score / applicable) * 100) : 100;
  return { counts, applicable, score, pct };
}

export interface ProjectHealth {
  code: HealthCode;
  label: 'Green' | 'Yellow' | 'Red';
}

/**
 * Green/Yellow/Red rollup:
 *  - Green: baseline locked AND audit compliance >= 80%.
 *  - Yellow: baseline locked (regardless of compliance) OR compliance >= 50%.
 *  - Red: everything else (unlocked baseline with <50% compliance).
 *
 * Order matters — this mirrors the prototype's if/else-if chain exactly:
 * a locked project with 60% compliance is Yellow, not Green, because the
 * 80% Green gate requires *both* conditions on the same check.
 */
export function computeProjectHealth(project: ProjectHealthInput): ProjectHealth {
  const audit = computeAuditProgress(project.auditEntries);
  if (project.locked && audit.pct >= 80) return { code: 'G', label: 'Green' };
  if (project.locked || audit.pct >= 50) return { code: 'Y', label: 'Yellow' };
  return { code: 'R', label: 'Red' };
}
