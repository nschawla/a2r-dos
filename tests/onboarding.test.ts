import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_IDS,
  ONBOARDING_DATASETS,
  statusForStep,
  validateDatasetHeader,
  initialOnboardingState,
  type OnboardingWizardState,
} from '@/types/onboarding';

describe('ONBOARDING_STEPS', () => {
  it('has exactly 5 steps, ordered 1-5, matching ONBOARDING_STEP_IDS', () => {
    expect(ONBOARDING_STEPS).toHaveLength(5);
    expect(ONBOARDING_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(ONBOARDING_STEP_IDS);
  });

  it('covers the 5 named phases in the right order', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      'provisioning',
      'governance',
      'data-ingestion',
      'role-mapping',
      'go-live',
    ]);
  });

  it('every step has a non-empty title, shortLabel, and description', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.shortLabel.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

describe('ONBOARDING_DATASETS', () => {
  it('defines the 3 PowerPlan-style datasets with real filenames and required columns', () => {
    expect(ONBOARDING_DATASETS.map((d) => d.fileName)).toEqual([
      'projects_master.csv',
      'work_orders_financials.csv',
      'resource_allocations.csv',
    ]);
    for (const d of ONBOARDING_DATASETS) {
      expect(d.requiredColumns.length).toBeGreaterThan(0);
    }
  });
});

describe('initialOnboardingState', () => {
  it('starts on the first step with nothing completed, seeded with the given governance template', () => {
    const state = initialOnboardingState('STRICT_FINANCIAL');
    expect(state.currentStepId).toBe('provisioning');
    expect(state.completedStepIds).toEqual([]);
    expect(state.selectedGovernanceTemplate).toBe('STRICT_FINANCIAL');
    expect(state.datasetUploads).toEqual({});
    expect(state.roleMappingReviewed).toBe(false);
  });
});

describe('statusForStep', () => {
  const base: OnboardingWizardState = initialOnboardingState('STANDARD');

  it('marks the current step active', () => {
    expect(statusForStep(base, 'provisioning')).toBe('active');
  });

  it('marks every step ahead of current as locked', () => {
    expect(statusForStep(base, 'governance')).toBe('locked');
    expect(statusForStep(base, 'data-ingestion')).toBe('locked');
    expect(statusForStep(base, 'role-mapping')).toBe('locked');
    expect(statusForStep(base, 'go-live')).toBe('locked');
  });

  it('marks a step behind current as complete, even without an explicit completedStepIds entry', () => {
    const state: OnboardingWizardState = { ...base, currentStepId: 'role-mapping' };
    expect(statusForStep(state, 'provisioning')).toBe('complete');
    expect(statusForStep(state, 'governance')).toBe('complete');
    expect(statusForStep(state, 'data-ingestion')).toBe('complete');
    expect(statusForStep(state, 'role-mapping')).toBe('active');
    expect(statusForStep(state, 'go-live')).toBe('locked');
  });

  it('an explicit completedStepIds entry overrides order — a step ahead of current still reads complete', () => {
    // Unusual in practice (the wizard only ever advances linearly), but
    // proves completedStepIds membership is checked independently of the
    // order-based fallback, not swallowed by it.
    const state: OnboardingWizardState = { ...base, currentStepId: 'provisioning', completedStepIds: ['governance'] };
    expect(statusForStep(state, 'governance')).toBe('complete');
    // an untouched step further ahead is still locked
    expect(statusForStep(state, 'data-ingestion')).toBe('locked');
  });

  it('every step is either complete, active, or locked — never anything else', () => {
    for (const currentStepId of ONBOARDING_STEP_IDS) {
      const state: OnboardingWizardState = { ...base, currentStepId };
      for (const id of ONBOARDING_STEP_IDS) {
        expect(['complete', 'active', 'locked']).toContain(statusForStep(state, id));
      }
      // exactly one step is ever active
      const activeCount = ONBOARDING_STEP_IDS.filter((id) => statusForStep(state, id) === 'active').length;
      expect(activeCount).toBe(1);
    }
  });
});

describe('validateDatasetHeader', () => {
  const schema = ONBOARDING_DATASETS.find((d) => d.id === 'projects-master')!;

  it('passes a header with every required column, case- and order-insensitively', () => {
    const header = ['Status', 'Project_Code', 'PROJECT_NAME', 'client_name', 'start_date'];
    const { missingColumns, unexpectedColumns } = validateDatasetHeader(schema, header);
    expect(missingColumns).toEqual([]);
    expect(unexpectedColumns).toEqual([]);
  });

  it('flags every missing required column by its canonical name', () => {
    const header = ['project_code', 'project_name'];
    const { missingColumns } = validateDatasetHeader(schema, header);
    expect(missingColumns.sort()).toEqual(['client_name', 'start_date', 'status'].sort());
  });

  it('accepts optional columns without flagging them as unexpected', () => {
    const header = [...schema.requiredColumns, ...(schema.optionalColumns ?? [])];
    const { missingColumns, unexpectedColumns } = validateDatasetHeader(schema, header);
    expect(missingColumns).toEqual([]);
    expect(unexpectedColumns).toEqual([]);
  });

  it('flags a genuinely unrecognized column as unexpected, not missing', () => {
    const header = [...schema.requiredColumns, 'some_other_system_field'];
    const { missingColumns, unexpectedColumns } = validateDatasetHeader(schema, header);
    expect(missingColumns).toEqual([]);
    expect(unexpectedColumns).toEqual(['some_other_system_field']);
  });

  it('ignores blank header cells rather than flagging them as unexpected', () => {
    const header = [...schema.requiredColumns, '', '  '];
    const { unexpectedColumns } = validateDatasetHeader(schema, header);
    expect(unexpectedColumns).toEqual([]);
  });
});
