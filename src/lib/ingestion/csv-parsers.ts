/**
 * WP6 — CSV Ingestion Pipeline: pure parsing + validation. Zero
 * React/Next/Prisma dependency (same philosophy as src/lib/calculations
 * and src/lib/auth/rbac.ts) so this is unit-testable in isolation and
 * usable from both the dry-run preview and the commit action without
 * duplicating a single line of parsing logic between them — the commit
 * action re-runs the exact same parse against the same raw text rather
 * than trusting a client-round-tripped "already validated" result.
 *
 * No CSV library dependency either: this sandbox has no npm registry
 * access (see the README's environment note), so a small hand-rolled
 * RFC4180-ish tokenizer lives here instead of pulling in `papaparse` or
 * `csv-parse` — one fewer dependency even once registry access exists.
 *
 * The org's live roster (delivery roles, resources) is passed in by the
 * caller rather than queried here, exactly like sizing.ts takes `roles:
 * RateRole[]` as a parameter instead of reaching into Prisma itself — this
 * file only ever sees plain data.
 */
import { PHASES } from '../constants';

export const MAX_CSV_ROWS = 2000;

export interface CsvIssue {
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParsedCsvRow<T> {
  /** 1-based, counting only data rows (the header is not row 1). */
  rowNumber: number;
  raw: Record<string, string>;
  /** Null whenever at least one 'error'-severity issue exists for this row. */
  data: T | null;
  issues: CsvIssue[];
}

export interface CsvParseResult<T> {
  header: string[];
  rows: ParsedCsvRow<T>[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  /** True when the file had more than MAX_CSV_ROWS data rows — only the
   * first MAX_CSV_ROWS were parsed. */
  truncated: boolean;
}

export interface RoleLookupEntry {
  id: string;
  name: string;
  employmentType: 'fte' | 'contractor';
}

export interface ResourceLookupEntry {
  id: string;
  name: string;
}

// ------------------------------------------------------------- tokenizer

/** Hand-rolled RFC4180-ish tokenizer: quoted fields (with embedded commas,
 * newlines, and doubled-quote escaping), \r\n / \n / bare \r line endings,
 * and a leading BOM are all handled. Blank lines are dropped. */
function tokenizeCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  function endField() {
    row.push(field);
    field = '';
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      endField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0]?.trim() === ''));
}

/** Exported for src/lib/ingestion/workbook-reader.ts (the WP7 batch
 * engine's CSV path) so both pipelines share the one RFC4180-ish
 * tokenizer rather than growing a second copy. `maxRows` defaults to this
 * module's own cap; the batch engine passes its own (larger) limit. */
export function tokenizeAndCap(
  text: string,
  maxRows: number = MAX_CSV_ROWS
): { header: string[]; records: Record<string, string>[]; truncated: boolean } {
  const rows = tokenizeCsv(text);
  const [headerRow, ...dataRows] = rows;
  const header = (headerRow ?? []).map((h) => h.trim());
  const truncated = dataRows.length > maxRows;
  const capped = truncated ? dataRows.slice(0, maxRows) : dataRows;
  const records = capped.map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = (r[idx] ?? '').trim();
    });
    return rec;
  });
  return { header, records, truncated };
}

function summarize<T>(header: string[], rows: ParsedCsvRow<T>[], truncated: boolean): CsvParseResult<T> {
  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  for (const r of rows) {
    if (r.data !== null) validCount++;
    for (const issue of r.issues) {
      if (issue.severity === 'error') errorCount++;
      else warningCount++;
    }
  }
  return { header, rows, validCount, errorCount, warningCount, truncated };
}

// ------------------------------------------------------------- field helpers

function pick(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    for (const rk of Object.keys(raw)) {
      if (rk.toLowerCase() === k.toLowerCase()) return raw[rk] ?? '';
    }
  }
  return '';
}

function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseBoolean(text: string): boolean {
  return ['true', 'yes', 'y', '1'].includes(text.trim().toLowerCase());
}

function parseDateText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function matchByName<T extends { name: string }>(entries: T[], raw: string): T | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return entries.find((e) => e.name.trim().toLowerCase() === needle);
}

function matchPhase(raw: string): string | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  const exact = PHASES.find((p) => p.key.toLowerCase() === needle || p.name.toLowerCase() === needle);
  if (exact) return exact.key;
  if (needle.length >= 3) {
    const prefix = PHASES.find((p) => p.name.toLowerCase().startsWith(needle));
    if (prefix) return prefix.key;
  }
  return undefined;
}

// =========================================================
// MODULE 1 — EFFORT MATRIX HOURS
// =========================================================

export interface EffortMatrixCsvRow {
  phaseKey: string;
  roleId: string;
  hours: number;
}

/** Expected columns: Phase, Role, Hours — plus an optional Employment Type
 * column, cross-checked against the matched role's rate-card setting as an
 * informational warning only (the rate card is always authoritative; the
 * CSV column exists so an importer can sanity-check their own export
 * before uploading, not to override anything). */
export function parseEffortMatrixCsv(text: string, roles: RoleLookupEntry[]): CsvParseResult<EffortMatrixCsvRow> {
  const { header, records, truncated } = tokenizeAndCap(text);

  const rows: ParsedCsvRow<EffortMatrixCsvRow>[] = records.map((raw, idx) => {
    const issues: CsvIssue[] = [];
    const phaseRaw = pick(raw, 'Phase', 'Workstream');
    const roleRaw = pick(raw, 'Role');
    const hoursRaw = pick(raw, 'Hours');
    const empRaw = pick(raw, 'Employment Type', 'EmploymentType');

    const phaseKey = matchPhase(phaseRaw);
    if (!phaseKey) issues.push({ field: 'Phase', message: `Unrecognized phase "${phaseRaw}".`, severity: 'error' });

    const role = matchByName(roles, roleRaw);
    if (!role) issues.push({ field: 'Role', message: `No delivery role named "${roleRaw}" on this org's rate card.`, severity: 'error' });

    const hours = parseNumber(hoursRaw);
    if (hours === null || hours < 0) {
      issues.push({ field: 'Hours', message: `"${hoursRaw}" is not a valid non-negative number.`, severity: 'error' });
    }

    if (role && empRaw.trim()) {
      const csvType = empRaw.trim().toLowerCase().startsWith('c') ? 'contractor' : 'fte';
      if (csvType !== role.employmentType) {
        issues.push({
          field: 'Employment Type',
          message: `CSV says "${empRaw}" but the rate card has "${role.employmentType.toUpperCase()}" for ${role.name} — the rate card wins; this row still imports.`,
          severity: 'warning',
        });
      }
    }

    const hasError = issues.some((i) => i.severity === 'error');
    const data = hasError || !phaseKey || !role || hours === null ? null : { phaseKey, roleId: role.id, hours };
    return { rowNumber: idx + 1, raw, data, issues };
  });

  return summarize(header, rows, truncated);
}

// =========================================================
// MODULE 3 — RAID LOGS
// =========================================================

export interface RaidCsvRow {
  type: 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DEPENDENCY';
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MED' | 'LOW';
  impact: string;
  mitigationPlan: string;
  ownerId: string | null;
  targetDate: string | null;
  escalate: boolean;
}

const RAID_TYPES = ['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY'] as const;
const SEVERITY_ALIASES: Record<string, RaidCsvRow['severity']> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MED: 'MED',
  MEDIUM: 'MED',
  LOW: 'LOW',
};

/** Expected columns: Type, Title, Description, Severity, Impact,
 * Mitigation Plan, Owner, Target Date, Escalate. Owner is matched by name
 * against the org's Resource directory (blank = unassigned; a non-blank
 * name that doesn't match is an error, not silently dropped). */
export function parseRaidCsv(text: string, resources: ResourceLookupEntry[]): CsvParseResult<RaidCsvRow> {
  const { header, records, truncated } = tokenizeAndCap(text);

  const rows: ParsedCsvRow<RaidCsvRow>[] = records.map((raw, idx) => {
    const issues: CsvIssue[] = [];
    const typeRaw = pick(raw, 'Type');
    const title = pick(raw, 'Title');
    const description = pick(raw, 'Description');
    const severityRaw = pick(raw, 'Severity');
    const impact = pick(raw, 'Impact');
    const mitigationPlan = pick(raw, 'Mitigation Plan', 'MitigationPlan');
    const ownerRaw = pick(raw, 'Owner');
    const targetDateRaw = pick(raw, 'Target Date', 'TargetDate');
    const escalateRaw = pick(raw, 'Escalate');

    const type = RAID_TYPES.find((t) => t === typeRaw.trim().toUpperCase());
    if (!type) issues.push({ field: 'Type', message: `"${typeRaw}" must be one of Risk, Assumption, Issue, Dependency.`, severity: 'error' });

    if (!description.trim()) issues.push({ field: 'Description', message: 'Description is required.', severity: 'error' });

    const severity = SEVERITY_ALIASES[severityRaw.trim().toUpperCase()];
    if (!severity) issues.push({ field: 'Severity', message: `"${severityRaw}" must be one of Critical, High, Med/Medium, Low.`, severity: 'error' });

    let ownerId: string | null = null;
    if (ownerRaw.trim()) {
      const owner = matchByName(resources, ownerRaw);
      if (!owner) {
        issues.push({ field: 'Owner', message: `No resource named "${ownerRaw}" in the directory.`, severity: 'error' });
      } else {
        ownerId = owner.id;
      }
    }

    let targetDate: string | null = null;
    if (targetDateRaw.trim()) {
      targetDate = parseDateText(targetDateRaw);
      if (targetDate === null) issues.push({ field: 'Target Date', message: `"${targetDateRaw}" is not a recognizable date.`, severity: 'error' });
    }

    const escalate = parseBoolean(escalateRaw);

    const hasError = issues.some((i) => i.severity === 'error');
    const data =
      hasError || !type || !severity
        ? null
        : { type, title: title.trim(), description: description.trim(), severity, impact: impact.trim(), mitigationPlan: mitigationPlan.trim(), ownerId, targetDate, escalate };
    return { rowNumber: idx + 1, raw, data, issues };
  });

  return summarize(header, rows, truncated);
}

// =========================================================
// MODULE 4 — FINANCIAL ACTUALS
// =========================================================

export interface FinancialActualCsvRow {
  roleKey: string;
  hours: number;
  cost: number;
  forecastHours: number | null;
  openRRHours: number | null;
}

/** Expected columns: Role, Hours, Cost, Forecast Hours, Open RR Hours.
 * Role is either a rate-card role name (matrix-mode projects) or the
 * literal "Direct" (direct-intake projects, mapped to the engine's
 * '_direct' sentinel) — whichever matches the project's actual
 * estimationMode; the other form is an error, not a silent fallback. */
export function parseFinancialActualsCsv(
  text: string,
  roles: RoleLookupEntry[],
  estimationMode: 'matrix' | 'direct'
): CsvParseResult<FinancialActualCsvRow> {
  const { header, records, truncated } = tokenizeAndCap(text);

  const rows: ParsedCsvRow<FinancialActualCsvRow>[] = records.map((raw, idx) => {
    const issues: CsvIssue[] = [];
    const roleRaw = pick(raw, 'Role');
    const hoursRaw = pick(raw, 'Hours');
    const costRaw = pick(raw, 'Cost');
    const forecastRaw = pick(raw, 'Forecast Hours', 'ForecastHours');
    const openRRRaw = pick(raw, 'Open RR Hours', 'OpenRRHours', 'Open RR');

    let roleKey: string | null = null;
    const isDirectLiteral = ['direct', '_direct'].includes(roleRaw.trim().toLowerCase());
    if (estimationMode === 'direct') {
      if (isDirectLiteral) roleKey = '_direct';
      else issues.push({ field: 'Role', message: `This project is in Direct Intake mode — Role must be "Direct", not "${roleRaw}".`, severity: 'error' });
    } else {
      if (isDirectLiteral) {
        issues.push({ field: 'Role', message: `This project is in Matrix mode — "Direct" isn't a valid role here.`, severity: 'error' });
      } else {
        const role = matchByName(roles, roleRaw);
        if (!role) issues.push({ field: 'Role', message: `No delivery role named "${roleRaw}" on this org's rate card.`, severity: 'error' });
        else roleKey = role.id;
      }
    }

    const hours = parseNumber(hoursRaw);
    if (hours === null || hours < 0) issues.push({ field: 'Hours', message: `"${hoursRaw}" is not a valid non-negative number.`, severity: 'error' });

    const cost = parseNumber(costRaw);
    if (cost === null || cost < 0) issues.push({ field: 'Cost', message: `"${costRaw}" is not a valid non-negative number.`, severity: 'error' });

    let forecastHours: number | null = null;
    if (forecastRaw.trim()) {
      forecastHours = parseNumber(forecastRaw);
      if (forecastHours === null || forecastHours < 0) {
        issues.push({ field: 'Forecast Hours', message: `"${forecastRaw}" is not a valid non-negative number.`, severity: 'error' });
      }
    }

    let openRRHours: number | null = null;
    if (openRRRaw.trim()) {
      openRRHours = parseNumber(openRRRaw);
      if (openRRHours === null || openRRHours < 0) {
        issues.push({ field: 'Open RR Hours', message: `"${openRRRaw}" is not a valid non-negative number.`, severity: 'error' });
      }
    }

    const hasError = issues.some((i) => i.severity === 'error');
    const data = hasError || !roleKey || hours === null || cost === null ? null : { roleKey, hours, cost, forecastHours, openRRHours };
    return { rowNumber: idx + 1, raw, data, issues };
  });

  return summarize(header, rows, truncated);
}
