import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { detectFileKind, readUploadedRows } from '@/lib/ingestion/workbook-reader';

function bufferFrom(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe('detectFileKind', () => {
  it('recognizes csv, txt, xlsx, xls and xlsm, case-insensitively', () => {
    expect(detectFileKind('weekly-actuals.csv')).toBe('csv');
    expect(detectFileKind('WEEKLY-ACTUALS.CSV')).toBe('csv');
    expect(detectFileKind('export.txt')).toBe('csv');
    expect(detectFileKind('weekly-actuals.xlsx')).toBe('excel');
    expect(detectFileKind('legacy.xls')).toBe('excel');
    expect(detectFileKind('macro-book.xlsm')).toBe('excel');
  });

  it('returns null for an unsupported extension', () => {
    expect(detectFileKind('weekly-actuals.pdf')).toBeNull();
    expect(detectFileKind('no-extension')).toBeNull();
  });
});

describe('readUploadedRows — CSV', () => {
  it('parses a header + data rows into records keyed by header', () => {
    const csv = 'Project Code,Employee Email,Actual Hours\nENG-2026-014,priya.raman@contoso.com,37.5\nENG-2026-021,marcus.bell@contoso.com,40\n';
    const { header, records, truncated } = readUploadedRows('weekly.csv', bufferFrom(csv));
    expect(header).toEqual(['Project Code', 'Employee Email', 'Actual Hours']);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Actual Hours': '37.5' });
    expect(truncated).toBe(false);
  });

  it('throws a plain-English error for an unsupported extension', () => {
    expect(() => readUploadedRows('weekly.pdf', bufferFrom('irrelevant'))).toThrow(/isn't a supported file type/);
  });
});

describe('readUploadedRows — Excel', () => {
  it('round-trips a workbook built with the same xlsx library into the same record shape a CSV upload produces', () => {
    const sheetData = [
      ['Project Code', 'Employee Email', 'Actual Hours'],
      ['ENG-2026-014', 'priya.raman@contoso.com', 37.5],
      ['ENG-2026-021', 'marcus.bell@contoso.com', 40],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const { header, records, truncated } = readUploadedRows('weekly.xlsx', buffer);
    expect(header).toEqual(['Project Code', 'Employee Email', 'Actual Hours']);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ 'Project Code': 'ENG-2026-014', 'Employee Email': 'priya.raman@contoso.com', 'Actual Hours': '37.5' });
    expect(truncated).toBe(false);
  });

  it('drops fully blank trailing rows', () => {
    const sheetData = [
      ['Project Code', 'Actual Hours'],
      ['ENG-2026-014', 10],
      ['', ''],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const { records } = readUploadedRows('weekly.xlsx', buffer);
    expect(records).toHaveLength(1);
  });
});
