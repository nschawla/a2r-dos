/**
 * WP7 — Portfolio Margin Rollup CSV: pure row-building + CSV serialization,
 * same zero-dependency philosophy as src/lib/ingestion/csv-parsers.ts (this
 * is that file's mirror image — serializing out instead of parsing in —
 * and reuses the same "no CSV library, hand-roll it" reasoning: this
 * sandbox has no npm registry access, so a small RFC4180-ish escaper lives
 * here instead of pulling in a dependency for one function's worth of
 * quoting logic).
 */
import type { EacSummary } from '../calculations/financials';
import { computeBurnToDatePct } from '../calculations/reporting';

export interface PortfolioCsvProjectInput {
  name: string;
  client: string | null;
  healthCode: 'G' | 'Y' | 'R';
  contractValue: number;
  /** computeTotalsFor(...).marginPct for this project. */
  soldMarginPct: number;
  eac: Pick<EacSummary, 'eacMarginPct' | 'totalActualCost' | 'totalEacCost' | 'totalOpenRRHours'>;
}

export interface PortfolioCsvRow {
  project: string;
  client: string;
  health: 'Green' | 'Yellow' | 'Red';
  contractValue: number;
  soldMarginPct: number;
  eacMarginPct: number;
  /** (soldMarginPct - eacMarginPct) in basis points (1 margin point = 100bps),
   * rounded to the nearest whole bp — the spec's own unit for this column. */
  marginDriftBps: number;
  burnToDatePct: number;
  openRRHours: number;
}

const HEALTH_LABEL: Record<'G' | 'Y' | 'R', 'Green' | 'Yellow' | 'Red'> = { G: 'Green', Y: 'Yellow', R: 'Red' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * One row per project, aggregating exactly what the WP7 spec asks for:
 * Sold vs. EAC Margin, Drift (bps), Burn-to-Date, and Open RR exposure —
 * plus Client/Health/Contract Value for portfolio-review context, matching
 * the level of detail the PS Control Tower's own project table already
 * shows. Every figure is derived from the same WP2/WP6 engine outputs
 * every module page uses, via the caller's own adapter calls — this
 * function never touches Prisma, so it can never see a number the app's
 * own pages don't already agree on.
 */
export function buildPortfolioCsvRows(projects: PortfolioCsvProjectInput[]): PortfolioCsvRow[] {
  return projects.map((p) => ({
    project: p.name,
    client: p.client ?? '',
    health: HEALTH_LABEL[p.healthCode],
    contractValue: round2(p.contractValue),
    soldMarginPct: round2(p.soldMarginPct),
    eacMarginPct: round2(p.eac.eacMarginPct),
    marginDriftBps: Math.round((p.soldMarginPct - p.eac.eacMarginPct) * 100),
    burnToDatePct: round2(computeBurnToDatePct(p.eac)),
    openRRHours: round2(p.eac.totalOpenRRHours),
  }));
}

const CSV_HEADER = [
  'Project',
  'Client',
  'Health',
  'Contract Value',
  'Sold Margin %',
  'True EAC Margin %',
  'Margin Drift (bps)',
  'Burn-to-Date %',
  'Open RR Hours',
];

/** RFC4180-ish field escaping: quote and double-up embedded quotes whenever
 * a field contains a comma, quote, or newline — mirrors
 * csv-parsers.ts#tokenizeCsv's own escaping convention in reverse. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF line endings, per RFC4180 — most spreadsheet tools (Excel
 * included) expect them, even though a bare `\n` also parses fine in most. */
export function serializePortfolioCsv(rows: PortfolioCsvRow[]): string {
  const lines = [CSV_HEADER.map(csvField).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.project,
        r.client,
        r.health,
        r.contractValue.toFixed(2),
        r.soldMarginPct.toFixed(2),
        r.eacMarginPct.toFixed(2),
        String(r.marginDriftBps),
        r.burnToDatePct.toFixed(2),
        r.openRRHours.toFixed(2),
      ]
        .map(csvField)
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}
