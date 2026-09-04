/**
 * WP7 — Self-Service Batch Import Engine: turns an uploaded file (CSV or
 * Excel) into the same `Record<string, string>[]` shape
 * src/lib/ingestion/batch-schemas.ts validates, regardless of which
 * format it came in as. Isomorphic — the SheetJS `xlsx` package runs
 * identically in the browser (BatchUploadPortal's instant client-side
 * preview) and in Node (nothing here currently runs server-side, since
 * data-import.ts validates the already-structured rows the client sends
 * rather than re-parsing the file bytes — see that file's doc comment for
 * why that's still the right trust boundary — but this stays isomorphic
 * on purpose in case a future server-side path needs it).
 *
 * CSV goes through csv-parsers.ts's own tokenizer (one RFC4180 parser,
 * not two). Excel goes through SheetJS: first sheet only, `defval: ''` so
 * a blank cell reads as an empty string exactly like a CSV field does,
 * and `raw: false` with an explicit date format so a date-formatted cell
 * comes out as `YYYY-MM-DD` text — batch-schemas.ts's date parser accepts
 * that directly, so the two file formats validate through the exact same
 * code path with no format-specific branching downstream of this file.
 */
import * as XLSX from 'xlsx';
import { tokenizeAndCap, MAX_CSV_ROWS } from './csv-parsers';

export interface WorkbookReadResult {
  header: string[];
  records: Record<string, string>[];
  truncated: boolean;
}

export type SupportedFileKind = 'csv' | 'excel';

/** Sniffs the file kind from its name — the small, predictable surface a
 * drag-and-drop zone actually needs (content-type sniffing on a raw
 * ArrayBuffer buys nothing extra here since every caller already has the
 * File's name). */
export function detectFileKind(fileName: string): SupportedFileKind | null {
  const ext = fileName.trim().toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return 'excel';
  return null;
}

function readCsvBuffer(buffer: ArrayBuffer, maxRows: number): WorkbookReadResult {
  const text = new TextDecoder('utf-8').decode(buffer);
  return tokenizeAndCap(text, maxRows);
}

function readExcelBuffer(buffer: ArrayBuffer, maxRows: number): WorkbookReadResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { header: [], records: [], truncated: false };

  // header: 1 -> array-of-arrays (first row is the header, exactly like
  // the CSV path) rather than SheetJS's own object-per-row mode, so
  // column order and blank trailing columns behave identically either way.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  const [headerRow, ...dataRows] = grid;
  const header = (headerRow ?? []).map((h) => String(h ?? '').trim());
  const truncated = dataRows.length > maxRows;
  const capped = truncated ? dataRows.slice(0, maxRows) : dataRows;
  const records = capped
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const rec: Record<string, string> = {};
      header.forEach((h, idx) => {
        rec[h] = String(row[idx] ?? '').trim();
      });
      return rec;
    });

  return { header, records, truncated };
}

/**
 * The one entry point BatchUploadPortal calls: file name (to sniff
 * format) + its raw bytes in, header + row records out. Throws only for
 * an unrecognized extension or a workbook SheetJS can't parse at all —
 * every other failure mode (missing columns, bad values) is a per-row
 * validation issue for batch-schemas.ts, not a read failure here.
 */
export function readUploadedRows(
  fileName: string,
  buffer: ArrayBuffer,
  maxRows: number = MAX_CSV_ROWS
): WorkbookReadResult {
  const kind = detectFileKind(fileName);
  if (kind === 'csv') return readCsvBuffer(buffer, maxRows);
  if (kind === 'excel') return readExcelBuffer(buffer, maxRows);
  throw new Error(`"${fileName}" isn't a supported file type — upload a .csv or .xlsx file.`);
}
