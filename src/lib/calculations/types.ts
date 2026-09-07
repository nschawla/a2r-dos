/**
 * Shared input/output types for the calculation engine. These are plain
 * data shapes — deliberately not the Prisma model types — so this package
 * has zero dependency on the database client, React, or Next.js and can be
 * unit-tested (and reused, e.g. from a worker or CLI) in total isolation.
 * Adapt Prisma rows to these shapes at the call site (server action /
 * route handler), not inside the engine.
 *
 * WP2 — money / rate *inputs* accept `number | string | Decimal`
 * (`DecimalInput`). `calc-adapters.ts` passes the exact decimal string
 * straight from the `NUMERIC` column; test fixtures keep passing `number`
 * literals. The engine normalises everything through `money.ts`'s `d()`.
 * Computed *outputs* stay `number` (see the engine modules).
 */
import type { DecimalInput } from './money';

export type { DecimalInput };
export type EstimationMode = 'matrix' | 'direct';
export type CommercialModel = 'ff' | 'tm';
export type ScopeComplexity = 'low' | 'medium' | 'high';
export type AuditStatus = 'yes' | 'partial' | 'no' | 'na';
export type HierarchyLevel = 'standalone' | 'parent' | 'child';

/** WP6 — Employee (FTE) vs. Contractor/Vendor classification, carried on
 * the rate-card role itself (see DealEditor/EacEditor's badges and
 * computeContractorExposure in financials.ts). Optional so any code built
 * against pre-WP6 RateRole literals (tests, fixtures) still type-checks;
 * every real call site populates it via toRateRoles, which defaults an
 * absent value to 'fte' — the same default the Prisma schema uses. */
export type EmploymentType = 'fte' | 'contractor';

/** A rate-card role, as consumed by every module that needs bill/cost rates. */
export interface RateRole {
  id: string;
  name: string;
  billRate: DecimalInput;
  costRate: DecimalInput;
  employmentType?: EmploymentType;
}

/** One cell of the Phase-Effort Matrix (Module 1). */
export interface EffortCellInput {
  phaseKey: string;
  roleId: string;
  hours: number;
}

/** Module 1's Direct Baseline Intake fields, used when estimationMode = 'direct'. */
export interface DirectIntakeInput {
  soldHours: number;
  targetRevenue: DecimalInput;
  blendedMarginPct: DecimalInput;
}

/** Everything sizing.ts needs from a project. */
export interface SizingProjectInput {
  estimationMode: EstimationMode;
  commercialModel: CommercialModel;
  contingencyPct: DecimalInput;
  effortCells: EffortCellInput[];
  directIntake?: DirectIntakeInput | null;
}

/** One row of the Universal Scope & Taxonomy Matrix, as consumed by the matrix suggester. */
export interface ScopeItemInput {
  /** Workstream key — must match a WORKSTREAM_PHASE_HOURS entry (see constants.ts) to contribute hours. */
  key: string;
  included: boolean;
  complexity: ScopeComplexity;
}

/** phaseKey -> roleId -> hours */
export type EffortMatrix = Record<string, Record<string, number>>;

/** One row of Module 2's audit tracker for a project. */
export interface AuditEntryInput {
  controlKey: string;
  status: AuditStatus;
}

/** Everything audit.ts's project-health check needs. */
export interface ProjectHealthInput {
  locked: boolean;
  auditEntries: AuditEntryInput[];
}

export type HealthCode = 'G' | 'Y' | 'R';

/** One row of Module 4's actuals/forecast/open-demand intake for a project. */
export interface FinancialActualInput {
  /** DeliveryRole id in matrix mode, or '_direct' for a direct-mode project's single blended row. */
  roleKey: string;
  hours: number;
  cost: DecimalInput;
  /** Omit/null to default to the role's (or project's, in direct mode) baseline sold hours. */
  forecastHours?: number | null;
  openRRHours?: number | null;
}

/** One row of Module 5's schedule for a project. */
export interface SchedulePhaseInput {
  phaseKey: string;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  pctComplete: number;
  status: string;
}

/** Module 0's governance tolerances — the only org-policy values the engine needs. */
export interface ScheduleTolerances {
  warnDays: number;
  critDays: number;
}

export const DEFAULT_SCHEDULE_TOLERANCES: ScheduleTolerances = { warnDays: 5, critDays: 15 };
