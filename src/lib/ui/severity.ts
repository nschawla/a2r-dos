/**
 * The one severity/priority color ladder for PS-DOS — Critical / High /
 * Medium / Low. This is the single source of truth every RAID severity
 * badge, chip, or table cell should read its color from; a file that
 * hand-rolls its own CRITICAL/HIGH/MED/LOW → color map (as several did
 * before this) risks Medium silently collapsing onto Low's grey the
 * moment someone copies the map and forgets a row — which is exactly the
 * bug this module closes. See docs/UI_DESIGN_SYSTEM.md §4.
 *
 * Mirrors the `RaidSeverity` Prisma enum (prisma/schema.prisma) exactly —
 * `MED`, not `MEDIUM`, is the wire value; only the display label spells
 * it out.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MED' | 'LOW';

export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MED', 'LOW'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MED: 'Medium',
  LOW: 'Low',
};

export const SEVERITY_RANK: Record<Severity, number> = { LOW: 1, MED: 2, HIGH: 3, CRITICAL: 4 };

/**
 * Filled "soft" chip classes — bg + text, no border. This is the
 * canonical severity look (a colored pill in a table cell or a list row);
 * pair with the shared `.badge` class or use `<SeverityBadge>` directly.
 * Four distinct tones, never doubled up:
 *   Critical → bold red · High → warm amber · Medium → muted gold ·
 *   Low → neutral grey.
 */
export const SEVERITY_CLASS: Record<Severity, string> = {
  CRITICAL: 'bg-critical-soft text-critical',
  HIGH: 'bg-warning-soft text-warning',
  MED: 'bg-medium-soft text-medium',
  LOW: 'bg-na-soft text-na',
};
