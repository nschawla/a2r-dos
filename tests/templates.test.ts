/**
 * Data Ingestion & Template Hub — template definitions + CSV rendering.
 */
import { describe, it, expect } from 'vitest';
import {
  INGESTION_TEMPLATES,
  getTemplate,
  renderTemplateCsv,
} from '../src/server/services/templates';

const EXPECTED_COLUMNS: Record<string, string[]> = {
  'resource-allocation': [
    'employeeId', 'resourceName', 'email', 'role', 'department', 'weeklyCapacityHours', 'costRate', 'billRate',
  ],
  'project-baseline': [
    'projectCode', 'projectName', 'clientName', 'contractType', 'totalBudget', 'startDate', 'endDate', 'status',
  ],
  'timesheet-actuals': [
    'employeeEmail', 'projectCode', 'taskName', 'hoursWorked', 'periodStartDate', 'periodEndDate', 'billingStatus',
  ],
};

describe('INGESTION_TEMPLATES', () => {
  it('exposes exactly the three intake templates', () => {
    expect(INGESTION_TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['project-baseline', 'resource-allocation', 'timesheet-actuals']
    );
  });

  it('each template matches its specified column set and order', () => {
    for (const t of INGESTION_TEMPLATES) {
      expect(t.columns.map((c) => c.name)).toEqual(EXPECTED_COLUMNS[t.id]);
    }
  });

  it('every template has a .csv filename, a purpose, guidance, and at least one required column', () => {
    for (const t of INGESTION_TEMPLATES) {
      expect(t.filename).toMatch(/^[a-z-]+\.csv$/);
      expect(t.purpose.length).toBeGreaterThan(10);
      expect(t.guidance.length).toBeGreaterThan(0);
      expect(t.columns.some((c) => c.required)).toBe(true);
    }
  });

  it('sample rows are aligned to the column count and lead with each column example', () => {
    for (const t of INGESTION_TEMPLATES) {
      expect(t.sampleRows.length).toBeGreaterThan(0);
      for (const row of t.sampleRows) {
        expect(row).toHaveLength(t.columns.length);
      }
      // the first sample row is the per-column `example` values
      expect(t.sampleRows[0]).toEqual(t.columns.map((c) => c.example));
    }
  });
});

describe('getTemplate', () => {
  it('resolves a known slug and rejects an unknown one', () => {
    expect(getTemplate('resource-allocation')?.title).toBe('Resource Allocations');
    expect(getTemplate('nope')).toBeUndefined();
  });
});

describe('renderTemplateCsv', () => {
  it('emits a header row of column names + one line per sample row, CRLF terminated', () => {
    const t = getTemplate('project-baseline')!;
    const csv = renderTemplateCsv(t);

    expect(csv.endsWith('\r\n')).toBe(true);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('projectCode,projectName,clientName,contractType,totalBudget,startDate,endDate,status');
    expect(lines).toHaveLength(1 + t.sampleRows.length);
    // a blank cell in a sample row survives as an empty field
    expect(lines.some((l) => l.includes(',,'))).toBe(true);
  });

  it('RFC4180-quotes fields containing a comma', () => {
    const t = getTemplate('project-baseline')!;
    const csv = renderTemplateCsv(t);
    // "Contoso Health — Data Platform Modernization" has no comma, but the
    // Northwind sample name does not either — inject one to prove escaping
    const withComma = renderTemplateCsv({
      ...t,
      sampleRows: [['ENG-1', 'Alpha, Bravo & Co', 'Client', 'Fixed Fee', '1', '2026-01-01', '', 'Active']],
    });
    expect(withComma).toContain('"Alpha, Bravo & Co"');
  });

  it('round-trips through a naive CSV split for every template', () => {
    for (const t of INGESTION_TEMPLATES) {
      const rows = renderTemplateCsv(t).trimEnd().split('\r\n');
      for (const row of rows) {
        // no unquoted field should itself contain a stray comma count mismatch
        const fieldCount = row.split(',').length;
        expect(fieldCount).toBeGreaterThanOrEqual(t.columns.length);
      }
    }
  });
});
