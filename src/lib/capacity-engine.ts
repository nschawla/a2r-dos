/**
 * A2R Delivery OS™ — Resource & Capacity Cockpit calculation engine.
 *
 * Pure functions, no I/O — same contract as src/lib/calculations/*. The
 * page (src/app/(dashboard)/capacity/page.tsx) and the seed both drive
 * these; keep them dependency-free so either context can call them.
 *
 * Core definitions
 * ----------------
 *   Available Hours = (weekdays in the period ∩ the resource's roster
 *     tenure  −  corporate holidays in that same window) × 8 × FTE.
 *     Individual PTO does NOT reduce this denominator — only corporate
 *     holidays and the person's start/end dates do.
 *
 *   Blended utilisation = Σ billable hours (every head)
 *                         ────────────────────────────────────────────
 *                         Σ available hours (billable heads only)
 *
 *     A "billable head" is a role whose RoleUtilizationPolicy.isBillableHead
 *     is true. Non-billable roles (Directors, Engagement Coordinators) are
 *     excluded from the denominator entirely.
 */

export const WORK_HOURS_PER_DAY = 8;

export interface DateRange {
  /** inclusive */
  start: Date;
  /** inclusive */
  end: Date;
}

/** Midnight (local) of the given date — all range math is day-granular. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday 00:00 of the ISO week containing `d`. */
export function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + ((x.getDay() === 0 ? -6 : 1) - x.getDay()));
  return x;
}

export function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/** Count of Mon–Fri days in [start, end] inclusive. */
export function weekdaysInRange(start: Date, end: Date): number {
  const a = startOfDay(start);
  const b = startOfDay(end);
  if (b < a) return 0;
  let count = 0;
  const cursor = new Date(a);
  while (cursor <= b) {
    if (isWeekday(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** How many of `holidays` land on a weekday inside [start, end] inclusive. */
export function holidayWeekdaysInRange(holidays: Date[], start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  const seen = new Set<number>();
  for (const h of holidays) {
    const t = startOfDay(h).getTime();
    if (t >= a && t <= b && isWeekday(new Date(t)) && !seen.has(t)) seen.add(t);
  }
  return seen.size;
}

export interface RosterTenure {
  fte: number;
  /** roster start — before this the person contributes no capacity */
  startDate: Date;
  /** roster end (null = still active) */
  endDate: Date | null;
}

/** The [start, end] intersection of the reporting period and the person's tenure, or null. */
export function tenureOverlap(period: DateRange, tenure: RosterTenure): DateRange | null {
  const start = startOfDay(period.start > tenure.startDate ? period.start : tenure.startDate);
  const rosterEnd = tenure.endDate ?? period.end;
  const end = startOfDay(period.end < rosterEnd ? period.end : rosterEnd);
  if (end < start) return null;
  return { start, end };
}

/**
 * Available Hours for one resource over one reporting period.
 * (weekdays − corporate holidays, both within the tenure overlap) × 8 × FTE.
 */
export function availableHours(period: DateRange, tenure: RosterTenure, holidays: Date[]): number {
  const overlap = tenureOverlap(period, tenure);
  if (!overlap) return 0;
  const workingDays =
    weekdaysInRange(overlap.start, overlap.end) - holidayWeekdaysInRange(holidays, overlap.start, overlap.end);
  return Math.max(0, workingDays) * WORK_HOURS_PER_DAY * tenure.fte;
}

/** Blended / practice utilisation: billable hours over available hours of billable heads. */
export function blendedUtilization(totalBillableHours: number, availableHoursOfBillableHeads: number): number {
  if (availableHoursOfBillableHeads <= 0) return 0;
  return totalBillableHours / availableHoursOfBillableHeads;
}

// ─────────────────────────────────────────────────────────────────────────
// Higher-level roll-ups the Capacity Cockpit page consumes
// ─────────────────────────────────────────────────────────────────────────

export interface CapacityResourceInput extends RosterTenure {
  id: string;
  name: string;
  psPractice: string;
  /** effective target utilisation (rolePolicy.targetUtilPct ?? resource.targetUtilPct) */
  targetUtilPct: number;
  isBillableHead: boolean;
  /** actual billable hours charged in the period */
  billableHours: number;
  /** live count of active engagements this person is on */
  projectCount: number;
}

export interface ResourceCapacityRow {
  id: string;
  name: string;
  psPractice: string;
  fte: number;
  isBillableHead: boolean;
  availableHours: number;
  billableHours: number;
  /** billable / available for this head (0 when not a billable head or no capacity) */
  utilizationPct: number;
  targetUtilPct: number;
  /** utilisation / target (>1 = over-attaining) */
  attainmentPct: number;
  projectCount: number;
  /** concurrency overload — more than this many active engagements */
  overloaded: boolean;
}

export const CONCURRENCY_OVERLOAD_THRESHOLD = 5;

export function resourceCapacityRow(
  r: CapacityResourceInput,
  period: DateRange,
  holidays: Date[]
): ResourceCapacityRow {
  const avail = availableHours(period, r, holidays);
  const util = r.isBillableHead && avail > 0 ? r.billableHours / avail : 0;
  const attainment = r.targetUtilPct > 0 ? util / r.targetUtilPct : 0;
  return {
    id: r.id,
    name: r.name,
    psPractice: r.psPractice,
    fte: r.fte,
    isBillableHead: r.isBillableHead,
    availableHours: avail,
    billableHours: r.billableHours,
    utilizationPct: util,
    targetUtilPct: r.targetUtilPct,
    attainmentPct: attainment,
    projectCount: r.projectCount,
    overloaded: r.projectCount > CONCURRENCY_OVERLOAD_THRESHOLD,
  };
}

export interface BlendedCapacitySummary {
  /** billable heads only */
  headcountFte: number;
  availableHours: number;
  billableHours: number;
  utilizationPct: number;
  /** headcount-weighted target across billable heads */
  targetUtilPct: number;
  attainmentPct: number;
}

/**
 * Org- or practice-level blended utilisation. Billable hours from EVERY row
 * count toward the numerator (a Director charging time still bills the
 * client); only billable heads' available hours form the denominator.
 */
export function blendedSummary(rows: ResourceCapacityRow[]): BlendedCapacitySummary {
  const billableHeads = rows.filter((r) => r.isBillableHead);
  const availableHoursDen = billableHeads.reduce((s, r) => s + r.availableHours, 0);
  const billableNum = rows.reduce((s, r) => s + r.billableHours, 0);
  const headcountFte = billableHeads.reduce((s, r) => s + r.fte, 0);
  const util = blendedUtilization(billableNum, availableHoursDen);
  const weightedTarget =
    headcountFte > 0 ? billableHeads.reduce((s, r) => s + r.targetUtilPct * r.fte, 0) / headcountFte : 0;
  return {
    headcountFte,
    availableHours: availableHoursDen,
    billableHours: billableNum,
    utilizationPct: util,
    targetUtilPct: weightedTarget,
    attainmentPct: weightedTarget > 0 ? util / weightedTarget : 0,
  };
}

export function groupByPractice(rows: ResourceCapacityRow[]): { practice: string; summary: BlendedCapacitySummary; rows: ResourceCapacityRow[] }[] {
  const byPractice = new Map<string, ResourceCapacityRow[]>();
  for (const r of rows) {
    const list = byPractice.get(r.psPractice) ?? [];
    list.push(r);
    byPractice.set(r.psPractice, list);
  }
  return [...byPractice.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([practice, list]) => ({ practice, summary: blendedSummary(list), rows: list }));
}

export function pctLabel(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
