/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Types for the Visual Onboarding Journey Wizard
 * (Admin & Org Setup → Onboarding, `/admin/onboarding`) — a guided,
 * five-phase setup walkthrough for a newly provisioned tenant. Pure types
 * and data only, no React/Next/Prisma imports, matching the split every
 * other `src/lib/*` config module in this app already uses (see
 * src/lib/governance/config.ts, src/lib/governance/rbacMatrix.ts).
 */
import type { GovernanceTemplateKey } from '@/lib/governance/config';

// ========================================================= the 5 phases

export type OnboardingStepId = 'provisioning' | 'governance' | 'data-ingestion' | 'role-mapping' | 'go-live';

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  'provisioning',
  'governance',
  'data-ingestion',
  'role-mapping',
  'go-live',
] as const;

export interface OnboardingStep {
  id: OnboardingStepId;
  /** 1-based position in the pipeline — drives ordering and the "locked
   * until you reach it" rule in `statusForStep` below. */
  order: number;
  /** Full step name, shown in the active step's card header. */
  title: string;
  /** Short label under the pipeline node — kept tight for small screens. */
  shortLabel: string;
  /** One-line "what happens here", shown under the title. */
  description: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'provisioning',
    order: 1,
    title: 'Workspace Provisioning',
    shortLabel: 'Provisioning',
    description: 'Confirm your organization is live and ready to configure.',
  },
  {
    id: 'governance',
    order: 2,
    title: 'Governance Template',
    shortLabel: 'Governance',
    description: 'Choose the compliance posture that fits how your firm runs delivery.',
  },
  {
    id: 'data-ingestion',
    order: 3,
    title: 'Base Data Ingestion',
    shortLabel: 'Data Ingestion',
    description: 'Bring in your existing project, work order, and resourcing data.',
  },
  {
    id: 'role-mapping',
    order: 4,
    title: 'Role Mapping',
    shortLabel: 'Role Mapping',
    description: 'Review how your roster maps onto A2R Delivery OS access tiers.',
  },
  {
    id: 'go-live',
    order: 5,
    title: 'Go-Live Verification',
    shortLabel: 'Go-Live',
    description: 'Confirm every step is complete and step into your live workspace.',
  },
] as const;

export type OnboardingStepStatus = 'complete' | 'active' | 'locked';

// ================================================ Step 3 — mock datasets
//
// Modeled on a PowerPlan-style capital-project accounting export — the
// kind of legacy dataset a professional-services or utilities client
// migrating onto A2R Delivery OS is likely to be carrying: a projects
// master, a work-order/financials ledger, and a resource allocation
// sheet. Deliberately its own column-naming convention (snake_case,
// generic "work order" / "cost category" language) rather than reusing
// src/server/services/templates.ts's own intake templates — this step
// represents data arriving in *somebody else's* shape, not A2R's own.

export type OnboardingDatasetId = 'projects-master' | 'work-orders-financials' | 'resource-allocations';

export interface OnboardingDatasetSchema {
  id: OnboardingDatasetId;
  /** Canonical expected filename, shown as the drop target's label. */
  fileName: string;
  label: string;
  description: string;
  requiredColumns: readonly string[];
  optionalColumns?: readonly string[];
}

export const ONBOARDING_DATASETS: readonly OnboardingDatasetSchema[] = [
  {
    id: 'projects-master',
    fileName: 'projects_master.csv',
    label: 'Projects Master',
    description: 'One row per capital project or engagement.',
    requiredColumns: ['project_code', 'project_name', 'client_name', 'start_date', 'status'],
    optionalColumns: ['end_date', 'contract_value'],
  },
  {
    id: 'work-orders-financials',
    fileName: 'work_orders_financials.csv',
    label: 'Work Orders & Financials',
    description: 'Budgeted vs. actual cost by work order.',
    requiredColumns: ['work_order_id', 'project_code', 'cost_category', 'budgeted_amount', 'actual_amount'],
    optionalColumns: ['period'],
  },
  {
    id: 'resource-allocations',
    fileName: 'resource_allocations.csv',
    label: 'Resource Allocations',
    description: 'Weekly staffing allocation by person and project.',
    requiredColumns: ['employee_id', 'employee_name', 'project_code', 'role', 'allocation_pct'],
    optionalColumns: ['week_ending'],
  },
] as const;

export type DatasetUploadStatus = 'pending' | 'checking' | 'valid' | 'invalid';

export interface DatasetUploadResult {
  datasetId: OnboardingDatasetId;
  fileName: string;
  status: DatasetUploadStatus;
  rowCount: number;
  /** Required columns from the schema that the file's header is missing. */
  missingColumns: string[];
  /** Header columns that don't match any required/optional column on the
   * schema — informational only, never blocks validity by itself. */
  unexpectedColumns: string[];
  /** A general, non-column-specific note — e.g. "unsupported file type"
   * when the file couldn't be parsed at all. */
  note?: string;
}

// ============================================================ wizard state

export interface OnboardingWizardState {
  currentStepId: OnboardingStepId;
  /** Steps explicitly confirmed via that step's own "Continue" action.
   * Always a prefix of ONBOARDING_STEPS in practice (the wizard only
   * advances linearly) — kept explicit rather than re-derived so a step
   * can be re-visited without silently un-completing it. */
  completedStepIds: OnboardingStepId[];
  selectedGovernanceTemplate: GovernanceTemplateKey | null;
  datasetUploads: Partial<Record<OnboardingDatasetId, DatasetUploadResult>>;
  roleMappingReviewed: boolean;
}

export function initialOnboardingState(seedGovernanceTemplate: GovernanceTemplateKey): OnboardingWizardState {
  return {
    currentStepId: 'provisioning',
    completedStepIds: [],
    selectedGovernanceTemplate: seedGovernanceTemplate,
    datasetUploads: {},
    roleMappingReviewed: false,
  };
}

// ============================================================ pure helpers

function orderOf(stepId: OnboardingStepId): number {
  return ONBOARDING_STEPS.find((s) => s.id === stepId)?.order ?? 0;
}

/**
 * A pipeline node's visual status. A step already passed (lower order than
 * the current step, or explicitly in `completedStepIds`) reads as
 * complete; the current step is active; anything ahead that hasn't been
 * reached yet is locked and not clickable.
 */
export function statusForStep(state: OnboardingWizardState, stepId: OnboardingStepId): OnboardingStepStatus {
  if (stepId === state.currentStepId) return 'active';
  if (state.completedStepIds.includes(stepId) || orderOf(stepId) < orderOf(state.currentStepId)) return 'complete';
  return 'locked';
}

/** Basic schema validation for Step 3 — column presence only (no type or
 * FK checks, unlike the real Self-Service Batch Import Engine at
 * /admin/ingestion). Column names are matched case-insensitively and
 * order-independently. */
export function validateDatasetHeader(
  schema: OnboardingDatasetSchema,
  header: readonly string[]
): { missingColumns: string[]; unexpectedColumns: string[] } {
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());
  const missingColumns = schema.requiredColumns.filter((c) => !normalizedHeader.includes(c.toLowerCase()));

  const known = new Set([...schema.requiredColumns, ...(schema.optionalColumns ?? [])].map((c) => c.toLowerCase()));
  const unexpectedColumns = header.filter((h) => h.trim() !== '' && !known.has(h.trim().toLowerCase()));

  return { missingColumns, unexpectedColumns };
}
