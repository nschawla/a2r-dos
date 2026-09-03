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
 * src/lib/reports/portfolio-csv.ts (this sandbox has no npm registry, and
 * a real .xlsx writer isn't installable; CSV opens natively in Excel /
 * Google Sheets anyway).
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
