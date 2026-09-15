/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Shared "is this open item due soon or overdue" classifier — used by the
 * RAID Cockpit and the SteerCo Decision & Action Tracker so both tables
 * distinguish a plain Open item from one that actually needs attention
 * now, instead of lumping every open item under one generic status.
 *
 * Deliberately just a date comparison, not a new workflow state: it reads
 * the same `targetDate` / `resolutionTargetDate` field these records
 * already carry, and never gates anything — a closed/resolved item is
 * simply never asked about its due status by the caller.
 */
export type DueStatus = 'overdue' | 'due-soon' | 'none';

/** Within this many days of today (inclusive) counts as "due soon". */
export const DUE_SOON_WINDOW_DAYS = 7;

export function dueStatusFor(targetDateIso: string | null | undefined, now: Date = new Date()): DueStatus {
  if (!targetDateIso) return 'none';
  const target = new Date(targetDateIso);
  if (Number.isNaN(target.getTime())) return 'none';

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((target.getTime() - todayStart.getTime()) / 86_400_000);

  if (diffDays < 0) return 'overdue';
  if (diffDays <= DUE_SOON_WINDOW_DAYS) return 'due-soon';
  return 'none';
}

export const DUE_STATUS_LABEL: Record<Exclude<DueStatus, 'none'>, string> = {
  overdue: 'Overdue',
  'due-soon': 'Due soon',
};

/** Tailwind badge classes — critical/warning, the same tokens the rest of
 * the app reserves for RAG status, so "overdue" reads with the same
 * weight as a Red project everywhere else. */
export const DUE_STATUS_BADGE_CLASS: Record<Exclude<DueStatus, 'none'>, string> = {
  overdue: 'bg-critical-soft text-critical',
  'due-soon': 'bg-warning-soft text-warning',
};
