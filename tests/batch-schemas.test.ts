import { describe, expect, it } from 'vitest';
import {
  validateWeeklyActualsRow,
  validateMilestoneProgressRow,
  validateBatchRow,
  columnsForDataType,
  type BatchValidationContext,
} from '@/lib/ingestion/batch-schemas';

const ctx: BatchValidationContext = {
  projects: [
    { id: 'proj-1', code: 'ENG-2026-014', name: 'Contoso Health — Data Platform Modernization' },
    { id: 'proj-2', code: null, name: 'Northwind Retainer' },
  ],
  resources: [
    { id: 'res-1', name: 'Priya Raman', email: 'priya.raman@contoso.com' },
    { id: 'res-2', name: 'Marcus Bell', email: null },
  ],
};

describe('validateWeeklyActualsRow', () => {
  it('accepts a clean row and normalizes the week to its Monday', () => {
    const { data, errors } = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '37.5' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data).not.toBeNull();
    expect(data?.projectId).toBe('proj-1');
    expect(data?.resourceId).toBe('res-1');
    // 2026-03-08 is a Sunday — the Monday of that ISO week is 2026-03-02.
    expect(data?.weekDate.slice(0, 10)).toBe('2026-03-02');
    expect(data?.actualHours).toBe(37.5);
    expect(data?.forecastedHours).toBeNull();
  });

  it('matches a project by exact name when it has no code', () => {
    const { data, errors } = validateWeeklyActualsRow(
      { 'Project Code': 'Northwind Retainer', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.projectId).toBe('proj-2');
  });

  it('matches a resource by name when it has no email on file', () => {
    const { data, errors } = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'Marcus Bell', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.resourceId).toBe('res-2');
  });

  it('flags a missing Project Code as a plain-English required-field error', () => {
    const { data, errors } = validateWeeklyActualsRow(
      { 'Project Code': '', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(data).toBeNull();
    expect(errors).toContainEqual({ field: 'Project Code', message: 'Project Code is required — every row must reference a project.' });
  });

  it('flags an unmapped project reference by name', () => {
    const { data, errors } = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-9999-999', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(data).toBeNull();
    expect(errors[0]?.field).toBe('Project Code');
    expect(errors[0]?.message).toContain('ENG-9999-999');
    expect(errors[0]?.message).toContain('No project with code');
  });

  it('flags an unmapped resource reference', () => {
    const { errors } = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'nobody@nowhere.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(errors).toContainEqual({ field: 'Employee Email', message: 'No team member with the email "nobody@nowhere.com" was found in this workspace\'s roster.' });
  });

  it('flags an invalid date format in plain English', () => {
    const { errors } = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '45/99/2026', 'Actual Hours': '10' },
      ctx
    );
    expect(errors).toContainEqual({ field: 'Week Ending', message: '"45/99/2026" isn\'t a recognizable date — use YYYY-MM-DD (e.g. 2026-03-09).' });
  });

  it('rejects a negative or non-numeric Actual Hours', () => {
    const bad = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '-5' },
      ctx
    );
    expect(bad.errors.some((e) => e.field === 'Actual Hours')).toBe(true);

    const nonNumeric = validateWeeklyActualsRow(
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': 'lots' },
      ctx
    );
    expect(nonNumeric.errors.some((e) => e.field === 'Actual Hours')).toBe(true);
  });

  it('accepts a blank optional Forecasted Hours and reports every error on a maximally broken row', () => {
    const { data, errors } = validateWeeklyActualsRow({}, ctx);
    expect(data).toBeNull();
    expect(errors).toHaveLength(4); // project, resource, week, hours — every required field
  });
});

describe('validateMilestoneProgressRow', () => {
  it('accepts a clean row', () => {
    const { data, errors } = validateMilestoneProgressRow(
      { 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'In Progress', '% Complete': '65' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data).toEqual({ projectId: 'proj-1', phaseKey: 'build', status: 'INPROGRESS', pctComplete: 65, actualStart: null, actualEnd: null });
  });

  it('matches a phase by unique name prefix', () => {
    const { data, errors } = validateMilestoneProgressRow(
      { 'Project Code': 'ENG-2026-014', Phase: 'Sustain', Status: 'Complete', '% Complete': '100' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.phaseKey).toBe('sustain');
  });

  it('rejects an unrecognized phase name', () => {
    const { errors } = validateMilestoneProgressRow(
      { 'Project Code': 'ENG-2026-014', Phase: 'Discovery', Status: 'Complete', '% Complete': '100' },
      ctx
    );
    expect(errors.some((e) => e.field === 'Phase')).toBe(true);
  });

  it('rejects an unrecognized status with the allowed values spelled out', () => {
    const { errors } = validateMilestoneProgressRow(
      { 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'Almost Done', '% Complete': '50' },
      ctx
    );
    expect(errors).toContainEqual({ field: 'Status', message: '"Almost Done" must be one of: Not Started, In Progress, Complete, Delayed.' });
  });

  it('rejects a % Complete outside 0-100', () => {
    const over = validateMilestoneProgressRow({ 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'Complete', '% Complete': '140' }, ctx);
    expect(over.errors.some((e) => e.field === '% Complete')).toBe(true);

    const under = validateMilestoneProgressRow({ 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'Complete', '% Complete': '-1' }, ctx);
    expect(under.errors.some((e) => e.field === '% Complete')).toBe(true);
  });

  it('rejects an Actual End Date before the Actual Start Date', () => {
    const { errors } = validateMilestoneProgressRow(
      {
        'Project Code': 'ENG-2026-014',
        Phase: 'Build',
        Status: 'Complete',
        '% Complete': '100',
        'Actual Start Date': '2026-03-10',
        'Actual End Date': '2026-03-01',
      },
      ctx
    );
    expect(errors.some((e) => e.field === 'Actual End Date' && e.message.includes('cannot be before'))).toBe(true);
  });

  it('accepts DELAYED and its "At Risk" alias', () => {
    const delayed = validateMilestoneProgressRow({ 'Project Code': 'ENG-2026-014', Phase: 'Test', Status: 'Delayed', '% Complete': '30' }, ctx);
    expect(delayed.data?.status).toBe('DELAYED');
    const atRisk = validateMilestoneProgressRow({ 'Project Code': 'ENG-2026-014', Phase: 'Test', Status: 'At Risk', '% Complete': '30' }, ctx);
    expect(atRisk.data?.status).toBe('DELAYED');
  });
});

describe('validateBatchRow dispatch', () => {
  it('routes WEEKLY_ACTUALS and MILESTONE_PROGRESS to the matching validator', () => {
    const actuals = validateBatchRow(
      'WEEKLY_ACTUALS',
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(actuals.errors).toEqual([]);

    const milestone = validateBatchRow('MILESTONE_PROGRESS', { 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'Complete', '% Complete': '100' }, ctx);
    expect(milestone.errors).toEqual([]);
  });
});

describe('columnsForDataType', () => {
  it('returns the required and optional columns for each data type', () => {
    const actualsCols = columnsForDataType('WEEKLY_ACTUALS');
    expect(actualsCols.map((c) => c.header)).toEqual(['Project Code', 'Employee Email', 'Week Ending', 'Actual Hours', 'Forecasted Hours']);
    expect(actualsCols.find((c) => c.header === 'Forecasted Hours')?.required).toBe(false);

    const milestoneCols = columnsForDataType('MILESTONE_PROGRESS');
    expect(milestoneCols.every((c) => typeof c.required === 'boolean')).toBe(true);
  });
});
