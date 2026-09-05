import { describe, expect, it } from 'vitest';
import {
  validateWeeklyActualsRow,
  validateMilestoneProgressRow,
  validateForecastEacRow,
  validateStatusRaidRow,
  validateBatchRow,
  columnsForDataType,
  BATCH_DATA_TYPES,
  BATCH_DATA_TYPE_LABEL,
  type BatchValidationContext,
} from '@/lib/ingestion/batch-schemas';

const ctx: BatchValidationContext = {
  projects: [
    { id: 'proj-1', code: 'ENG-2026-014', name: 'Contoso Health — Data Platform Modernization', estimationMode: 'MATRIX' },
    { id: 'proj-2', code: null, name: 'Northwind Retainer', estimationMode: 'MATRIX' },
    { id: 'proj-3', code: 'ENG-2026-099', name: 'Fabrikam Direct Intake', estimationMode: 'DIRECT' },
  ],
  resources: [
    { id: 'res-1', name: 'Priya Raman', email: 'priya.raman@contoso.com' },
    { id: 'res-2', name: 'Marcus Bell', email: null },
  ],
  roles: [
    { id: 'role-1', name: 'Senior Consultant' },
    { id: 'role-2', name: 'Solution Architect' },
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

describe('validateForecastEacRow', () => {
  it('accepts a clean matrix-mode row', () => {
    const { data, errors } = validateForecastEacRow(
      { 'Project Code': 'ENG-2026-014', Role: 'Senior Consultant', 'Forecast Hours': '120', 'Open RR Hours': '40' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data).toEqual({ projectId: 'proj-1', roleKey: 'role-1', forecastHours: 120, openRRHours: 40 });
  });

  it('rejects a Direct Intake project with a clear, actionable message', () => {
    const { data, errors } = validateForecastEacRow(
      { 'Project Code': 'ENG-2026-099', Role: 'Senior Consultant', 'Forecast Hours': '10', 'Open RR Hours': '5' },
      ctx
    );
    expect(data).toBeNull();
    expect(errors[0]?.field).toBe('Project Code');
    expect(errors[0]?.message).toContain('Direct Intake');
    expect(errors[0]?.message).toContain('Financial Realization');
  });

  it('flags an unmapped role', () => {
    const { errors } = validateForecastEacRow(
      { 'Project Code': 'ENG-2026-014', Role: 'Nonexistent Role', 'Forecast Hours': '10', 'Open RR Hours': '5' },
      ctx
    );
    expect(errors).toContainEqual({ field: 'Role', message: 'No delivery role named "Nonexistent Role" was found on this org\'s rate card.' });
  });

  it('rejects negative or non-numeric hours on either column', () => {
    const badForecast = validateForecastEacRow(
      { 'Project Code': 'ENG-2026-014', Role: 'Senior Consultant', 'Forecast Hours': '-5', 'Open RR Hours': '5' },
      ctx
    );
    expect(badForecast.errors.some((e) => e.field === 'Forecast Hours')).toBe(true);

    const badOpenRR = validateForecastEacRow(
      { 'Project Code': 'ENG-2026-014', Role: 'Senior Consultant', 'Forecast Hours': '5', 'Open RR Hours': 'lots' },
      ctx
    );
    expect(badOpenRR.errors.some((e) => e.field === 'Open RR Hours')).toBe(true);
  });

  it('requires both hours columns', () => {
    const { errors } = validateForecastEacRow({ 'Project Code': 'ENG-2026-014', Role: 'Senior Consultant' }, ctx);
    expect(errors.some((e) => e.field === 'Forecast Hours')).toBe(true);
    expect(errors.some((e) => e.field === 'Open RR Hours')).toBe(true);
  });
});

describe('validateStatusRaidRow', () => {
  it('accepts a narrative-only row', () => {
    const { data, errors } = validateStatusRaidRow(
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'Status Narrative': 'UAT kicked off on schedule.' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.narrative).toBe('UAT kicked off on schedule.');
    expect(data?.raid).toBeNull();
  });

  it('accepts a RAID-only row with severity defaulting to Med', () => {
    const { data, errors } = validateStatusRaidRow(
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'RAID Type': 'Risk', 'RAID Description': 'Vendor may slip the API delivery date.' },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.narrative).toBeNull();
    expect(data?.raid).toEqual({ type: 'RISK', description: 'Vendor may slip the API delivery date.', severity: 'MED', ownerId: null });
  });

  it('accepts a row with both a narrative and a RAID item, resolving the owner by email', () => {
    const { data, errors } = validateStatusRaidRow(
      {
        'Project Code': 'ENG-2026-014',
        'Week Ending': '2026-03-08',
        'Status Narrative': 'Overall green this week.',
        'RAID Type': 'Issue',
        'RAID Description': 'Test environment down for 2 days.',
        'RAID Severity': 'High',
        'RAID Owner Email': 'priya.raman@contoso.com',
      },
      ctx
    );
    expect(errors).toEqual([]);
    expect(data?.narrative).toBe('Overall green this week.');
    expect(data?.raid).toEqual({ type: 'ISSUE', description: 'Test environment down for 2 days.', severity: 'HIGH', ownerId: 'res-1' });
  });

  it('rejects a row with neither a narrative nor a RAID item', () => {
    const { data, errors } = validateStatusRaidRow({ 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08' }, ctx);
    expect(data).toBeNull();
    expect(errors).toContainEqual({
      field: 'Status Narrative',
      message: 'Provide a Status Narrative, a RAID item (Type + Description), or both — this row has neither.',
    });
  });

  it('requires RAID Description once a RAID Type is given', () => {
    const { errors } = validateStatusRaidRow(
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'RAID Type': 'Risk' },
      ctx
    );
    expect(errors.some((e) => e.field === 'RAID Description')).toBe(true);
  });

  it('rejects an unrecognized RAID Type or Severity', () => {
    const badType = validateStatusRaidRow(
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'RAID Type': 'Blocker', 'RAID Description': 'x' },
      ctx
    );
    expect(badType.errors.some((e) => e.field === 'RAID Type')).toBe(true);

    const badSeverity = validateStatusRaidRow(
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'RAID Type': 'Risk', 'RAID Description': 'x', 'RAID Severity': 'Catastrophic' },
      ctx
    );
    expect(badSeverity.errors.some((e) => e.field === 'RAID Severity')).toBe(true);
  });

  it('flags an unmapped RAID owner email', () => {
    const { errors } = validateStatusRaidRow(
      {
        'Project Code': 'ENG-2026-014',
        'Week Ending': '2026-03-08',
        'RAID Type': 'Risk',
        'RAID Description': 'x',
        'RAID Owner Email': 'nobody@nowhere.com',
      },
      ctx
    );
    expect(errors.some((e) => e.field === 'RAID Owner Email')).toBe(true);
  });
});

describe('validateBatchRow dispatch', () => {
  it('routes all 4 data types to their matching validator', () => {
    const actuals = validateBatchRow(
      'WEEKLY_ACTUALS',
      { 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Week Ending': '2026-03-08', 'Actual Hours': '10' },
      ctx
    );
    expect(actuals.errors).toEqual([]);

    const milestone = validateBatchRow('MILESTONE_PROGRESS', { 'Project Code': 'ENG-2026-014', Phase: 'Build', Status: 'Complete', '% Complete': '100' }, ctx);
    expect(milestone.errors).toEqual([]);

    const forecast = validateBatchRow(
      'FORECAST_EAC',
      { 'Project Code': 'ENG-2026-014', Role: 'Senior Consultant', 'Forecast Hours': '10', 'Open RR Hours': '5' },
      ctx
    );
    expect(forecast.errors).toEqual([]);

    const statusRaid = validateBatchRow(
      'STATUS_RAID',
      { 'Project Code': 'ENG-2026-014', 'Week Ending': '2026-03-08', 'Status Narrative': 'On track.' },
      ctx
    );
    expect(statusRaid.errors).toEqual([]);
  });
});

describe('BATCH_DATA_TYPES / BATCH_DATA_TYPE_LABEL', () => {
  it('has exactly the 4 agreed intake pills, each with a label', () => {
    expect(BATCH_DATA_TYPES).toEqual(['WEEKLY_ACTUALS', 'MILESTONE_PROGRESS', 'FORECAST_EAC', 'STATUS_RAID']);
    for (const type of BATCH_DATA_TYPES) {
      expect(BATCH_DATA_TYPE_LABEL[type].length).toBeGreaterThan(0);
    }
    expect(BATCH_DATA_TYPE_LABEL.FORECAST_EAC).toBe('Forecast & EAC Updates');
    expect(BATCH_DATA_TYPE_LABEL.STATUS_RAID).toBe('Status Reports & RAID Log');
  });
});

describe('columnsForDataType', () => {
  it('returns the required and optional columns for each data type', () => {
    const actualsCols = columnsForDataType('WEEKLY_ACTUALS');
    expect(actualsCols.map((c) => c.header)).toEqual(['Project Code', 'Employee Email', 'Week Ending', 'Actual Hours', 'Forecasted Hours']);
    expect(actualsCols.find((c) => c.header === 'Forecasted Hours')?.required).toBe(false);

    const milestoneCols = columnsForDataType('MILESTONE_PROGRESS');
    expect(milestoneCols.every((c) => typeof c.required === 'boolean')).toBe(true);

    const forecastCols = columnsForDataType('FORECAST_EAC');
    expect(forecastCols.map((c) => c.header)).toEqual(['Project Code', 'Role', 'Forecast Hours', 'Open RR Hours']);
    expect(forecastCols.every((c) => c.required)).toBe(true);

    const statusRaidCols = columnsForDataType('STATUS_RAID');
    expect(statusRaidCols.map((c) => c.header)).toEqual([
      'Project Code',
      'Week Ending',
      'Status Narrative',
      'RAID Type',
      'RAID Description',
      'RAID Severity',
      'RAID Owner Email',
    ]);
    expect(statusRaidCols.filter((c) => c.required).map((c) => c.header)).toEqual(['Project Code', 'Week Ending']);
  });
});
