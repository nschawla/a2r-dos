/**
 * Data Ingestion & Template Hub — the canonical enterprise-intake
 * templates, defined once and served both as downloadable CSVs
 * (src/app/api/templates/[template]/route.ts) and as the schema tables +
 * guidance shown in the hub UI (src/components/ingestion/IngestionTemplateHub.tsx).
 *
 * Single source of truth: the column list, descriptions, examples, and
 * required flags all come from here, so a downloaded template can never
 * drift from the schema the hub documents.
 *
 * Zero dependencies — hand-rolled RFC4180-ish escaping, same reasoning as
 * src/lib/reports/portfolio-csv.ts. A downloadable starter file only ever
 * needs to open cleanly in Excel / Google Sheets, which plain CSV already
 * does — the `xlsx` package this app now depends on (see
 * src/lib/ingestion/workbook-reader.ts) is there to *read* a client's own
 * Excel export back on upload, not to make this file write one.
 */

export interface TemplateColumn {
  name: string;
  description: string;
  /** A realistic value, also used as the first sample row. */
  example: string;
  required: boolean;
}

export interface IngestionTemplate {
  /** URL slug + the key the hub UI addresses it by. */
  id: string;
  /** Download filename. */
  filename: string;
  title: string;
  /** One-line statement of what this template feeds. */
  purpose: string;
  /** Rules the person filling it out needs — dates, units, allowed values. */
  guidance: string[];
  columns: TemplateColumn[];
  /** Example data rows, each aligned to `columns` order. */
  sampleRows: string[][];
}

const ISO_DATE_RULE = 'All dates are ISO 8601 — `YYYY-MM-DD` (e.g. 2026-03-01). No timezones, no time component.';
const ENCODING_RULE = 'Save as UTF-8 CSV. The first row must be the header exactly as shown; column order does not matter, extra columns are ignored.';
const EMPTY_RULE = 'Leave a cell blank for "no value" — do not use "N/A", "-", or "0" as a placeholder.';

export const INGESTION_TEMPLATES: IngestionTemplate[] = [
  {
    id: 'resource-allocation',
    filename: 'resource-allocation-template.csv',
    title: 'Resource Allocations',
    purpose: 'Your delivery roster — one row per person, with capacity and rate-card economics.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      '`employeeId` is your HRIS / PSA identifier and is the stable key used to match a person on re-import — keep it consistent between loads.',
      '`weeklyCapacityHours` is contracted availability (e.g. 40 for a full-time employee, 20 for a half-time contractor), not hours worked.',
      '`costRate` and `billRate` are hourly, in your billing currency, numbers only — no currency symbols or thousands separators.',
      '`role` should match a role name on your rate card; unknown roles are flagged for mapping at preview time.',
    ],
    columns: [
      { name: 'employeeId', description: 'Stable HRIS/PSA identifier for the person (match key on re-import).', example: 'EMP-10432', required: true },
      { name: 'resourceName', description: 'Full name as it should appear in the roster.', example: 'Priya Raman', required: true },
      { name: 'email', description: 'Work email — also used to link timesheet actuals to this person.', example: 'priya.raman@contoso.com', required: true },
      { name: 'role', description: 'Delivery role / rate-card title.', example: 'Senior Consultant', required: true },
      { name: 'department', description: 'Practice, capability, or cost centre the person rolls up to.', example: 'Data & Analytics', required: false },
      { name: 'weeklyCapacityHours', description: 'Contracted weekly availability in hours (not worked hours).', example: '40', required: true },
      { name: 'costRate', description: 'Fully-loaded internal hourly cost.', example: '95', required: false },
      { name: 'billRate', description: 'Standard external hourly bill rate.', example: '210', required: false },
    ],
    sampleRows: [
      ['EMP-10432', 'Priya Raman', 'priya.raman@contoso.com', 'Senior Consultant', 'Data & Analytics', '40', '95', '210'],
      ['EMP-10510', 'Marcus Bell', 'marcus.bell@contoso.com', 'Solution Architect', 'Technology & Cloud', '40', '120', '265'],
      ['CTR-2201', 'Dana Okafor', 'dana.okafor@partnerco.com', 'Data Engineer', 'Data & Analytics', '32', '110', '240'],
    ],
  },
  {
    id: 'project-baseline',
    filename: 'project-baseline-template.csv',
    title: 'Project Financial Baselines',
    purpose: 'The commercial baseline for each engagement — contract shape, budget, and window.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      ISO_DATE_RULE,
      '`projectCode` is your engagement / SOW identifier and is the match key on re-import and for linking timesheet actuals.',
      '`contractType` — one of `Fixed Fee`, `Time & Materials`, or `Retainer` (mapped to the internal commercial model on import).',
      '`totalBudget` is the total contract value at signature, numbers only, in your billing currency.',
      '`status` — one of `Active`, `On Hold`, or `Closed`.',
      '`endDate` may be blank for an open-ended retainer.',
    ],
    columns: [
      { name: 'projectCode', description: 'Engagement / SOW identifier (match key on re-import).', example: 'ENG-2026-014', required: true },
      { name: 'projectName', description: 'Engagement name.', example: 'Contoso Health — Data Platform Modernization', required: true },
      { name: 'clientName', description: 'End client / account name.', example: 'Contoso Health', required: true },
      { name: 'contractType', description: 'Fixed Fee | Time & Materials | Retainer.', example: 'Fixed Fee', required: true },
      { name: 'totalBudget', description: 'Total contract value at signature (numbers only).', example: '1250000', required: true },
      { name: 'startDate', description: 'Engagement start (YYYY-MM-DD).', example: '2026-03-01', required: true },
      { name: 'endDate', description: 'Engagement end (YYYY-MM-DD) — blank for open-ended.', example: '2026-11-30', required: false },
      { name: 'status', description: 'Active | On Hold | Closed.', example: 'Active', required: true },
    ],
    sampleRows: [
      ['ENG-2026-014', 'Contoso Health — Data Platform Modernization', 'Contoso Health', 'Fixed Fee', '1250000', '2026-03-01', '2026-11-30', 'Active'],
      ['ENG-2026-021', 'Northwind — Supply Chain Control Tower', 'Northwind Traders', 'Time & Materials', '640000', '2026-04-15', '', 'Active'],
      ['ENG-2025-188', 'Fabrikam — Cloud FinOps Retainer', 'Fabrikam', 'Retainer', '180000', '2026-01-01', '2026-12-31', 'On Hold'],
    ],
  },
  {
    id: 'timesheet-actuals',
    filename: 'timesheet-actuals-template.csv',
    title: 'Aggregated Period Actuals & Hours',
    purpose: 'Approved hours by person / project / task for a closed period, exported from your PSA or timesheet tool.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      ISO_DATE_RULE,
      'One row per person + project + task + period. Pre-aggregate — do not send daily punches; send the period total.',
      '`employeeEmail` and `projectCode` must match a row already loaded via the Resource Allocations and Project Baselines templates.',
      '`hoursWorked` is approved hours for the period, decimal allowed (e.g. 37.5).',
      '`periodStartDate` / `periodEndDate` bound the reporting period (typically a week or a month); the pair must not overlap another row for the same person + project + task.',
      '`billingStatus` — one of `Billable`, `Non-Billable`, or `Written Off`.',
      '`taskName` is free text; blank is treated as general project work.',
    ],
    columns: [
      { name: 'employeeEmail', description: 'Work email — must match a Resource Allocations row.', example: 'priya.raman@contoso.com', required: true },
      { name: 'projectCode', description: 'Engagement identifier — must match a Project Baseline row.', example: 'ENG-2026-014', required: true },
      { name: 'taskName', description: 'Task / work package (free text; blank = general project work).', example: 'Discovery & Assessment', required: false },
      { name: 'hoursWorked', description: 'Approved hours for the period (decimal allowed).', example: '37.5', required: true },
      { name: 'periodStartDate', description: 'Reporting period start (YYYY-MM-DD).', example: '2026-03-02', required: true },
      { name: 'periodEndDate', description: 'Reporting period end (YYYY-MM-DD).', example: '2026-03-08', required: true },
      { name: 'billingStatus', description: 'Billable | Non-Billable | Written Off.', example: 'Billable', required: true },
    ],
    sampleRows: [
      ['priya.raman@contoso.com', 'ENG-2026-014', 'Discovery & Assessment', '37.5', '2026-03-02', '2026-03-08', 'Billable'],
      ['marcus.bell@contoso.com', 'ENG-2026-014', 'Solution Architecture', '40', '2026-03-02', '2026-03-08', 'Billable'],
      ['dana.okafor@partnerco.com', 'ENG-2026-014', 'Internal Enablement', '4', '2026-03-02', '2026-03-08', 'Non-Billable'],
    ],
  },
  {
    id: 'weekly-actuals-batch',
    filename: 'weekly-actuals-batch-template.csv',
    title: 'Weekly Actuals — Batch Upload',
    purpose: 'A single weekly file of hours by person + project, for the Self-Service Ingestion Portal at Admin & Org Setup → Data Ingestion → Batch Import.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      ISO_DATE_RULE,
      'One row per person + project + week. Any file can span as many projects and people as you like in one batch.',
      '`projectCode` must match a `projectCode` already on file (see Project Financial Baselines); `employeeEmail` must match a resource on the roster.',
      '`weekEnding` may be any day in the reporting week — it is filed under that week’s Monday automatically.',
      'Rows that don’t match are quarantined for inline correction, not silently dropped — nothing commits to the workspace until every row in the batch is clean.',
    ],
    columns: [
      { name: 'projectCode', description: 'Engagement identifier — must match a Project Baseline row.', example: 'ENG-2026-014', required: true },
      { name: 'employeeEmail', description: 'Work email — must match a resource on the roster.', example: 'priya.raman@contoso.com', required: true },
      { name: 'weekEnding', description: 'Any date within the reporting week (YYYY-MM-DD).', example: '2026-03-08', required: true },
      { name: 'actualHours', description: 'Actual hours worked that week (decimal allowed).', example: '37.5', required: true },
      { name: 'forecastedHours', description: 'Updated forecast for the week, if changed.', example: '40', required: false },
    ],
    sampleRows: [
      ['ENG-2026-014', 'priya.raman@contoso.com', '2026-03-08', '37.5', '40'],
      ['ENG-2026-014', 'marcus.bell@contoso.com', '2026-03-08', '40', '40'],
      ['ENG-2026-021', 'dana.okafor@partnerco.com', '2026-03-08', '32', ''],
    ],
  },
  {
    id: 'milestone-progress-batch',
    filename: 'milestone-progress-batch-template.csv',
    title: 'Milestone & Progress Updates — Batch Upload',
    purpose: 'A single weekly file of phase status/% complete across projects, for the Self-Service Ingestion Portal at Admin & Org Setup → Data Ingestion → Batch Import.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      ISO_DATE_RULE,
      'One row per project + phase. `phase` is one of Initiate, Design, Build, Test (UAT, SIT), Deploy (Cutover, Go-Live), Sustain (Hypercare, Warranty).',
      '`status` — one of Not Started, In Progress, Complete, Delayed.',
      '`pctComplete` is 0–100. `actualStartDate` / `actualEndDate` are only needed when they’ve changed — leave blank to keep whatever is already on file.',
    ],
    columns: [
      { name: 'projectCode', description: 'Engagement identifier — must match a Project Baseline row.', example: 'ENG-2026-014', required: true },
      { name: 'phase', description: 'Delivery phase name.', example: 'Build', required: true },
      { name: 'status', description: 'Not Started | In Progress | Complete | Delayed.', example: 'In Progress', required: true },
      { name: 'pctComplete', description: '% complete for the phase, 0-100.', example: '65', required: true },
      { name: 'actualStartDate', description: 'Actual start date, if it changed (YYYY-MM-DD).', example: '2026-02-16', required: false },
      { name: 'actualEndDate', description: 'Actual end date, if the phase just closed (YYYY-MM-DD).', example: '', required: false },
    ],
    sampleRows: [
      ['ENG-2026-014', 'Build', 'In Progress', '65', '2026-02-16', ''],
      ['ENG-2026-021', 'Design', 'Complete', '100', '2026-01-12', '2026-02-02'],
      ['ENG-2025-188', 'Sustain (Hypercare, Warranty)', 'Delayed', '40', '', ''],
    ],
  },
  {
    id: 'forecast-eac-batch',
    filename: 'forecast-eac-batch-template.csv',
    title: 'Forecast & EAC Updates — Batch Upload',
    purpose: 'A single weekly file of revised forecast and cost-to-complete inputs by role across projects, for the Self-Service Ingestion Portal at Admin & Org Setup → Data Ingestion → Batch Import.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      'One row per project + rate-card role. `role` must match a role name already on your rate card — matrix-mode projects only; a project in Direct Intake mode should use that project’s own Financial Realization import instead.',
      '`forecastHours` is the updated forecast-to-complete for the role. `openRRHours` is the remaining run-rate hours still open — the driver a revised EAC is computed from downstream, not a separately typed dollar figure.',
    ],
    columns: [
      { name: 'projectCode', description: 'Engagement identifier — must match a Project Baseline row.', example: 'ENG-2026-014', required: true },
      { name: 'role', description: 'Rate-card role name — must match a role on your rate card.', example: 'Senior Consultant', required: true },
      { name: 'forecastHours', description: 'Revised forecast-to-complete hours for the role.', example: '80', required: true },
      { name: 'openRRHours', description: 'Remaining open run-rate hours (the cost-to-complete driver).', example: '25', required: true },
    ],
    sampleRows: [
      ['ENG-2026-014', 'Senior Consultant', '80', '25'],
      ['ENG-2026-014', 'Solution Architect', '40', '10'],
      ['ENG-2026-021', 'Data Engineer', '60', '30'],
    ],
  },
  {
    id: 'status-raid-batch',
    filename: 'status-raid-batch-template.csv',
    title: 'Status Reports & RAID Log — Batch Upload',
    purpose: 'A single weekly file of narrative status highlights and new RAID items across projects, for the Self-Service Ingestion Portal at Admin & Org Setup → Data Ingestion → Batch Import.',
    guidance: [
      ENCODING_RULE,
      EMPTY_RULE,
      ISO_DATE_RULE,
      'One row per project update. A row may be a pure narrative update, a pure new RAID item, or both — but never neither. `statusNarrative` lands in that project’s Activity Log; the RAID columns create a new RAID Cockpit entry.',
      '`raidType` — one of Risk, Assumption, Issue, Dependency. `raidSeverity` — Critical, High, Med, or Low (defaults to Med if left blank while a RAID item is present).',
      '`raidOwnerEmail` must match a resource already on the roster — leave blank for an unassigned RAID item.',
    ],
    columns: [
      { name: 'projectCode', description: 'Engagement identifier — must match a Project Baseline row.', example: 'ENG-2026-014', required: true },
      { name: 'weekEnding', description: 'Reporting week (YYYY-MM-DD).', example: '2026-03-08', required: true },
      { name: 'statusNarrative', description: 'Free-text weekly status highlight.', example: 'UAT kicked off on schedule.', required: false },
      { name: 'raidType', description: 'Risk | Assumption | Issue | Dependency — required if any RAID column is filled in.', example: 'Risk', required: false },
      { name: 'raidDescription', description: 'The RAID item itself — required once raidType is set.', example: 'Vendor may slip the API delivery date.', required: false },
      { name: 'raidSeverity', description: 'Critical | High | Med | Low.', example: 'High', required: false },
      { name: 'raidOwnerEmail', description: 'Work email of the RAID item owner, if assigned.', example: 'priya.raman@contoso.com', required: false },
    ],
    sampleRows: [
      ['ENG-2026-014', '2026-03-08', 'UAT kicked off on schedule.', 'Risk', 'Vendor may slip the API delivery date.', 'High', 'priya.raman@contoso.com'],
      ['ENG-2026-021', '2026-03-08', 'On track for go-live.', '', '', '', ''],
      ['ENG-2025-188', '2026-03-08', '', 'Issue', 'Test environment down for 2 days.', 'Med', ''],
    ],
  },
];

export function getTemplate(id: string): IngestionTemplate | undefined {
  return INGESTION_TEMPLATES.find((t) => t.id === id);
}

/** RFC4180-ish: quote + double embedded quotes when a field has a comma,
 * quote, or newline. Mirrors src/lib/ingestion/csv-parsers.ts's tokenizer. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Header row + the template's sample rows, CRLF-terminated (Excel-friendly). */
export function renderTemplateCsv(template: IngestionTemplate): string {
  const header = template.columns.map((c) => c.name);
  const lines = [header, ...template.sampleRows].map((row) => row.map(csvField).join(','));
  return lines.join('\r\n') + '\r\n';
}
