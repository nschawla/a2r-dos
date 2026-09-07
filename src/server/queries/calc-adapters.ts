/**
 * Adapts Prisma rows (uppercase enums, nullable columns, relation objects)
 * into the plain, lowercase-enum shapes src/lib/calculations expects. This
 * is the one place that boundary is crossed — pages and route handlers
 * should go through these adapters rather than hand-rolling the enum-case
 * conversion inline (WP1/WP2's Deal/Financials/Schedule pages did the
 * latter before this file existed; WP3 rewires them to use it).
 */
import type {
  AuditEntry,
  AuditStatus as PrismaAuditStatus,
  CommercialModel as PrismaCommercialModel,
  DeliveryRole,
  EffortCell,
  EstimationMode as PrismaEstimationMode,
  FinancialActual,
  HierarchyLevel as PrismaHierarchyLevel,
  Methodology as PrismaMethodology,
  Project,
  ResourceEmploymentType as PrismaEmploymentType,
  SchedulePhase,
  ScheduleStatus as PrismaScheduleStatus,
} from '@prisma/client';
import type {
  AuditEntryInput,
  AuditStatus,
  FinancialActualInput,
  HierarchyLevel,
  RateRole,
  SchedulePhaseInput,
  SizingProjectInput,
} from '@/lib/calculations/types';

const EMPLOYMENT_TYPE_MAP: Record<PrismaEmploymentType, RateRole['employmentType']> = {
  FTE: 'fte',
  CONTRACTOR: 'contractor',
};

/**
 * Financial precision — the monetary / rate / margin columns are Postgres
 * NUMERIC, so Prisma hands them back as `Decimal`. This adapter is the ONE
 * documented boundary between the Prisma row shape and the calc-engine input
 * shapes.
 *
 * WP2: money / rate values cross as their **exact decimal string**
 * (`decStr`), not `.toNumber()` — the engine (`src/lib/calculations/money.ts`)
 * does all `$`/rate arithmetic in `decimal.js` and rounds once at the
 * accounting boundary. `dec()` (→ `number`) is kept only for the handful of
 * non-monetary Decimal columns a caller genuinely wants as a number.
 */
type Dec = { toNumber(): number; toString(): string };
function dec(v: Dec): number;
function dec(v: Dec | null): number | null;
function dec(v: Dec | null): number | null {
  return v == null ? null : v.toNumber();
}
/** Exact decimal string for a NUMERIC column, straight into the engine. */
function decStr(v: Dec): string;
function decStr(v: Dec | null): string | null;
function decStr(v: Dec | null): string | null {
  return v == null ? null : v.toString();
}

export function toRateRoles(
  roles: Pick<DeliveryRole, 'id' | 'name' | 'billRate' | 'costRate' | 'employmentType'>[]
): RateRole[] {
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    billRate: decStr(r.billRate),
    costRate: decStr(r.costRate),
    employmentType: EMPLOYMENT_TYPE_MAP[r.employmentType],
  }));
}

const ESTIMATION_MODE_MAP: Record<PrismaEstimationMode, SizingProjectInput['estimationMode']> = {
  MATRIX: 'matrix',
  DIRECT: 'direct',
};

const COMMERCIAL_MODEL_MAP: Record<PrismaCommercialModel, SizingProjectInput['commercialModel']> = {
  FF: 'ff',
  TM: 'tm',
};

type SizingProjectRow = Pick<
  Project,
  | 'estimationMode'
  | 'commercialModel'
  | 'contingencyPct'
  | 'directIntakeSoldHours'
  | 'directIntakeTargetRevenue'
  | 'directIntakeBlendedMarginPct'
> & { effortCells: Pick<EffortCell, 'phaseKey' | 'roleId' | 'hours'>[] };

export function toSizingInput(project: SizingProjectRow): SizingProjectInput {
  return {
    estimationMode: ESTIMATION_MODE_MAP[project.estimationMode],
    commercialModel: COMMERCIAL_MODEL_MAP[project.commercialModel],
    contingencyPct: decStr(project.contingencyPct),
    effortCells: project.effortCells.map((c) => ({ phaseKey: c.phaseKey, roleId: c.roleId, hours: c.hours })),
    directIntake: {
      soldHours: project.directIntakeSoldHours,
      targetRevenue: decStr(project.directIntakeTargetRevenue),
      blendedMarginPct: decStr(project.directIntakeBlendedMarginPct),
    },
  };
}

export function toFinancialActuals(
  rows: Pick<FinancialActual, 'roleKey' | 'hours' | 'cost' | 'forecastHours' | 'openRRHours'>[]
): FinancialActualInput[] {
  return rows.map((r) => ({
    roleKey: r.roleKey,
    hours: r.hours,
    cost: decStr(r.cost),
    forecastHours: r.forecastHours,
    openRRHours: r.openRRHours,
  }));
}

const SCHEDULE_STATUS_MAP: Record<PrismaScheduleStatus, string> = {
  NOTSTARTED: 'notstarted',
  INPROGRESS: 'inprogress',
  COMPLETE: 'complete',
  DELAYED: 'delayed',
};

export function toScheduleInput(
  phases: Pick<SchedulePhase, 'phaseKey' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd' | 'pctComplete' | 'status'>[]
): { phases: SchedulePhaseInput[] } {
  return {
    phases: phases.map((p) => ({
      phaseKey: p.phaseKey,
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      actualStart: p.actualStart,
      actualEnd: p.actualEnd,
      pctComplete: p.pctComplete,
      status: SCHEDULE_STATUS_MAP[p.status],
    })),
  };
}

const AUDIT_STATUS_MAP: Record<PrismaAuditStatus, AuditStatus> = {
  YES: 'yes',
  PARTIAL: 'partial',
  NO: 'no',
  NA: 'na',
};

export function toAuditEntries(entries: Pick<AuditEntry, 'controlKey' | 'status'>[]): AuditEntryInput[] {
  return entries.map((e) => ({ controlKey: e.controlKey, status: AUDIT_STATUS_MAP[e.status] }));
}

export function methodologyLower(m: PrismaMethodology): 'waterfall' | 'agile' | 'hybrid' {
  return m.toLowerCase() as 'waterfall' | 'agile' | 'hybrid';
}

const HIERARCHY_LEVEL_MAP: Record<PrismaHierarchyLevel, HierarchyLevel> = {
  STANDALONE: 'standalone',
  PARENT: 'parent',
  CHILD: 'child',
};

export function hierarchyLevelLower(h: PrismaHierarchyLevel): HierarchyLevel {
  return HIERARCHY_LEVEL_MAP[h];
}
