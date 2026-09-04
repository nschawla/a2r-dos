/**
 * WP7 — Self-Service Batch Import Engine: pure schema + validation for the
 * two weekly BAU data types (Weekly Actuals, Milestone & Progress
 * Updates). Same philosophy as src/lib/ingestion/csv-parsers.ts (zero
 * React/Next/Prisma dependency, org roster/project data passed in by the
 * caller) — but reshaped for a tenant-wide *batch* spanning many projects
 * per file, not one project's own import modal, and reused verbatim on
 * both sides of the wire: BatchUploadPortal calls these client-side for
 * instant preview, and src/server/actions/data-import.ts calls the exact
 * same functions server-side as the only source of truth a row's staged
 * status/errors ever come from — the client's own read is never trusted
 * past the preview it renders.
 *
 * "Plain-English error messages for every failure" is the WP7 spec's own
 * words — every BatchRowIssue.message here is written to stand alone in
 * the quarantine grid with no additional context, per that requirement.
 */
import { PHASES, type PhaseKey } from '../constants';

export const MAX_BATCH_ROWS = 5000;

export type BatchImportDataType = 'WEEKLY_ACTUALS' | 'MILESTONE_PROGRESS';

export const BATCH_DATA_TYPES: readonly BatchImportDataType[] = ['WEEKLY_ACTUALS', 'MILESTONE_PROGRESS'] as const;

export const BATCH_DATA_TYPE_LABEL: Record<BatchImportDataType, string> = {
  WEEKLY_ACTUALS: 'Weekly Actuals',
  MILESTONE_PROGRESS: 'Milestone & Progress Updates',
};

export interface BatchRowIssue {
  field: string;
  message: string;
}

export interface ProjectRefLookup {
  id: string;
  /** Project.externalId — the "Project Code" a client's own systems know
   * this engagement by. May be blank on older/demo projects, in which
   * case only exact-name matching applies for that project. */
  code: string | null;
  name: string;
}

export interface ResourceRefLookup {
  id: string;
  name: string;
  email: string | null;
}

// ------------------------------------------------------------- shared cell helpers

function get(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    for (const rk of Object.keys(raw)) {
      if (rk.trim().toLowerCase() === k.toLowerCase()) return (raw[rk] ?? '').trim();
    }
  }
  return '';
}

function parseNumber(text: string): number | null {
  if (text === '') return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Accepts ISO (2026-03-09), US slash (03/09/2026), or anything else
 * `Date` can parse unambiguously; rejects anything it can't. Returns the
 * date at UTC midnight so downstream week-anchoring is timezone-stable. */
function parseDateText(text: string): Date | null {
  if (!text) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    const d = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

/** The Monday (UTC) of the ISO week a date falls in — WeeklyAssignmentSlot
 * always keys on the Monday, regardless of which day of that week a
 * client's export happens to report. */
function mondayOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  return monday;
}

function matchProject(raw: string, projects: readonly ProjectRefLookup[]): ProjectRefLookup | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    projects.find((p) => p.code && p.code.trim().toLowerCase() === needle) ??
    projects.find((p) => p.name.trim().toLowerCase() === needle)
  );
}

function matchResource(raw: string, resources: readonly ResourceRefLookup[]): ResourceRefLookup | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    resources.find((r) => r.email && r.email.trim().toLowerCase() === needle) ??
    resources.find((r) => r.name.trim().toLowerCase() === needle)
  );
}

function matchPhase(raw: string): PhaseKey | undefined {
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
// WEEKLY ACTUALS
// =========================================================

export interface WeeklyActualsColumns {
  projectRef: string;
  resourceRef: string;
  weekEnding: string;
  actualHours: string;
  forecastedHours: string;
}

export const WEEKLY_ACTUALS_COLUMNS: { key: keyof WeeklyActualsColumns; header: string; required: boolean }[] = [
  { key: 'projectRef', header: 'Project Code', required: true },
  { key: 'resourceRef', header: 'Employee Email', required: true },
  { key: 'weekEnding', header: 'Week Ending', required: true },
  { key: 'actualHours', header: 'Actual Hours', required: true },
  { key: 'forecastedHours', header: 'Forecasted Hours', required: false },
];

export interface WeeklyActualsBatchRow {
  projectId: string;
  resourceId: string;
  /** ISO date string for the Monday of the reported week. */
  weekDate: string;
  actualHours: number;
  forecastedHours: number | null;
}

export interface BatchValidationContext {
  projects: readonly ProjectRefLookup[];
  resources: readonly ResourceRefLookup[];
}

export function validateWeeklyActualsRow(
  raw: Record<string, string>,
  ctx: BatchValidationContext
): { data: WeeklyActualsBatchRow | null; errors: BatchRowIssue[] } {
  const errors: BatchRowIssue[] = [];

  const projectRaw = get(raw, 'Project Code', 'ProjectCode', 'Project');
  const resourceRaw = get(raw, 'Employee Email', 'EmployeeEmail', 'Email', 'Resource');
  const weekRaw = get(raw, 'Week Ending', 'WeekEnding', 'Week');
  const hoursRaw = get(raw, 'Actual Hours', 'ActualHours', 'Hours');
  const forecastRaw = get(raw, 'Forecasted Hours', 'ForecastedHours', 'Forecast Hours');

  let projectId: string | null = null;
  if (!projectRaw) {
    errors.push({ field: 'Project Code', message: 'Project Code is required — every row must reference a project.' });
  } else {
    const project = matchProject(projectRaw, ctx.projects);
    if (!project) {
      errors.push({
        field: 'Project Code',
        message: `No project with code "${projectRaw}" was found in this workspace — check it against the Project Baseline you were sent, or confirm the engagement code with your A2R delivery lead.`,
      });
    } else {
      projectId = project.id;
    }
  }

  let resourceId: string | null = null;
  if (!resourceRaw) {
    errors.push({ field: 'Employee Email', message: 'Employee Email is required — every row must reference a person on the roster.' });
  } else {
    const resource = matchResource(resourceRaw, ctx.resources);
    if (!resource) {
      errors.push({
        field: 'Employee Email',
        message: `No team member with the email "${resourceRaw}" was found in this workspace's roster.`,
      });
    } else {
      resourceId = resource.id;
    }
  }

  let weekDate: string | null = null;
  if (!weekRaw) {
    errors.push({ field: 'Week Ending', message: 'Week Ending is required — every row must be dated.' });
  } else {
    const parsed = parseDateText(weekRaw);
    if (!parsed) {
      errors.push({ field: 'Week Ending', message: `"${weekRaw}" isn't a recognizable date — use YYYY-MM-DD (e.g. 2026-03-09).` });
    } else {
      weekDate = mondayOfWeek(parsed).toISOString();
    }
  }

  const actualHours = parseNumber(hoursRaw);
  if (hoursRaw === '') {
    errors.push({ field: 'Actual Hours', message: 'Actual Hours is required.' });
  } else if (actualHours === null || actualHours < 0) {
    errors.push({ field: 'Actual Hours', message: `"${hoursRaw}" isn't a valid number of hours — use a positive number like 37.5.` });
  }

  let forecastedHours: number | null = null;
  if (forecastRaw !== '') {
    forecastedHours = parseNumber(forecastRaw);
    if (forecastedHours === null || forecastedHours < 0) {
      errors.push({ field: 'Forecasted Hours', message: `"${forecastRaw}" isn't a valid number of hours — use a positive number, or leave it blank.` });
    }
  }

  if (errors.length > 0 || !projectId || !resourceId || !weekDate || actualHours === null) {
    return { data: null, errors };
  }
  return { data: { projectId, resourceId, weekDate, actualHours, forecastedHours }, errors: [] };
}

// =========================================================
// MILESTONE & PROGRESS UPDATES
// =========================================================

export interface MilestoneProgressColumns {
  projectRef: string;
  phaseRef: string;
  status: string;
  pctComplete: string;
  actualStart: string;
  actualEnd: string;
}

export const MILESTONE_PROGRESS_COLUMNS: { key: keyof MilestoneProgressColumns; header: string; required: boolean }[] = [
  { key: 'projectRef', header: 'Project Code', required: true },
  { key: 'phaseRef', header: 'Phase', required: true },
  { key: 'status', header: 'Status', required: true },
  { key: 'pctComplete', header: '% Complete', required: true },
  { key: 'actualStart', header: 'Actual Start Date', required: false },
  { key: 'actualEnd', header: 'Actual End Date', required: false },
];

export type MilestoneStatus = 'NOTSTARTED' | 'INPROGRESS' | 'COMPLETE' | 'DELAYED';

const STATUS_ALIASES: Record<string, MilestoneStatus> = {
  'NOT STARTED': 'NOTSTARTED',
  NOTSTARTED: 'NOTSTARTED',
  'IN PROGRESS': 'INPROGRESS',
  INPROGRESS: 'INPROGRESS',
  COMPLETE: 'COMPLETE',
  COMPLETED: 'COMPLETE',
  DELAYED: 'DELAYED',
  'AT RISK': 'DELAYED',
};

export interface MilestoneProgressBatchRow {
  projectId: string;
  phaseKey: PhaseKey;
  status: MilestoneStatus;
  pctComplete: number;
  actualStart: string | null;
  actualEnd: string | null;
}

export function validateMilestoneProgressRow(
  raw: Record<string, string>,
  ctx: Pick<BatchValidationContext, 'projects'>
): { data: MilestoneProgressBatchRow | null; errors: BatchRowIssue[] } {
  const errors: BatchRowIssue[] = [];

  const projectRaw = get(raw, 'Project Code', 'ProjectCode', 'Project');
  const phaseRaw = get(raw, 'Phase', 'Phase Key', 'Workstream');
  const statusRaw = get(raw, 'Status');
  const pctRaw = get(raw, '% Complete', 'Pct Complete', 'PctComplete', 'Percent Complete');
  const startRaw = get(raw, 'Actual Start Date', 'ActualStartDate', 'Actual Start');
  const endRaw = get(raw, 'Actual End Date', 'ActualEndDate', 'Actual End');

  let projectId: string | null = null;
  if (!projectRaw) {
    errors.push({ field: 'Project Code', message: 'Project Code is required — every row must reference a project.' });
  } else {
    const project = matchProject(projectRaw, ctx.projects);
    if (!project) {
      errors.push({
        field: 'Project Code',
        message: `No project with code "${projectRaw}" was found in this workspace — check it against the Project Baseline you were sent, or confirm the engagement code with your A2R delivery lead.`,
      });
    } else {
      projectId = project.id;
    }
  }

  let phaseKey: PhaseKey | undefined;
  if (!phaseRaw) {
    errors.push({ field: 'Phase', message: 'Phase is required — one of: ' + PHASES.map((p) => p.name).join(', ') + '.' });
  } else {
    phaseKey = matchPhase(phaseRaw);
    if (!phaseKey) {
      errors.push({
        field: 'Phase',
        message: `"${phaseRaw}" isn't a recognized delivery phase — use one of: ${PHASES.map((p) => p.name).join(', ')}.`,
      });
    }
  }

  let status: MilestoneStatus | undefined;
  if (!statusRaw) {
    errors.push({ field: 'Status', message: 'Status is required — one of: Not Started, In Progress, Complete, Delayed.' });
  } else {
    status = STATUS_ALIASES[statusRaw.trim().toUpperCase()];
    if (!status) {
      errors.push({ field: 'Status', message: `"${statusRaw}" must be one of: Not Started, In Progress, Complete, Delayed.` });
    }
  }

  const pctComplete = parseNumber(pctRaw);
  if (pctRaw === '') {
    errors.push({ field: '% Complete', message: '% Complete is required.' });
  } else if (pctComplete === null || pctComplete < 0 || pctComplete > 100) {
    errors.push({ field: '% Complete', message: `"${pctRaw}" must be a number between 0 and 100.` });
  }

  let actualStart: string | null = null;
  if (startRaw) {
    const parsed = parseDateText(startRaw);
    if (!parsed) {
      errors.push({ field: 'Actual Start Date', message: `"${startRaw}" isn't a recognizable date — use YYYY-MM-DD (e.g. 2026-03-09).` });
    } else {
      actualStart = parsed.toISOString();
    }
  }

  let actualEnd: string | null = null;
  if (endRaw) {
    const parsed = parseDateText(endRaw);
    if (!parsed) {
      errors.push({ field: 'Actual End Date', message: `"${endRaw}" isn't a recognizable date — use YYYY-MM-DD (e.g. 2026-03-09).` });
    } else {
      actualEnd = parsed.toISOString();
    }
  }

  if (actualStart && actualEnd && actualEnd < actualStart) {
    errors.push({ field: 'Actual End Date', message: 'Actual End Date cannot be before Actual Start Date.' });
  }

  if (errors.length > 0 || !projectId || !phaseKey || !status || pctComplete === null) {
    return { data: null, errors };
  }
  return { data: { projectId, phaseKey, status, pctComplete, actualStart, actualEnd }, errors: [] };
}

// =========================================================
// dispatch
// =========================================================

export type BatchRow = WeeklyActualsBatchRow | MilestoneProgressBatchRow;

/** One entry point both the client preview and the server's authoritative
 * re-validation call — never two divergent code paths for "is this row OK". */
export function validateBatchRow(
  dataType: BatchImportDataType,
  raw: Record<string, string>,
  ctx: BatchValidationContext
): { data: BatchRow | null; errors: BatchRowIssue[] } {
  if (dataType === 'WEEKLY_ACTUALS') return validateWeeklyActualsRow(raw, ctx);
  return validateMilestoneProgressRow(raw, ctx);
}

export function columnsForDataType(dataType: BatchImportDataType): { header: string; required: boolean }[] {
  const cols = dataType === 'WEEKLY_ACTUALS' ? WEEKLY_ACTUALS_COLUMNS : MILESTONE_PROGRESS_COLUMNS;
  return cols.map((c) => ({ header: c.header, required: c.required }));
}
