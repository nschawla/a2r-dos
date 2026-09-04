'use client';

/**
 * WP7 — Self-Service Batch Import Engine: the drag-and-drop entry point at
 * /admin/ingestion's "Batch Import" tab. Reads the dropped file entirely
 * client-side (src/lib/ingestion/workbook-reader.ts handles both CSV and
 * Excel) and validates it instantly against this org's live projects/
 * resources (passed in as props from the server component page) using the
 * exact same src/lib/ingestion/batch-schemas.ts functions the server
 * re-runs on stage — so the counts shown here are never a guess the
 * server might overrule, just a preview of what it will say.
 *
 * Deliberately does NOT offer inline correction before staging — that's
 * what the quarantine grid on the batch detail page is for (see
 * BatchDetailView). This step is upload → validate → stage only; a file
 * with errors still stages fine, with its bad rows already sorted into
 * the error queue on arrival.
 */
import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useSafeAction } from '@/lib/client/safe-action';
import { readUploadedRows, detectFileKind } from '@/lib/ingestion/workbook-reader';
import {
  validateBatchRow,
  BATCH_DATA_TYPES,
  BATCH_DATA_TYPE_LABEL,
  columnsForDataType,
  type BatchImportDataType,
  type BatchValidationContext,
  type BatchRowIssue,
} from '@/lib/ingestion/batch-schemas';
import { stageImportBatch } from '@/server/actions/data-import';

type Stage = 'idle' | 'reading' | 'ready' | 'staging';

interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: BatchRowIssue[];
}

export function BatchUploadPortal({ lookups }: { lookups: BatchValidationContext }) {
  const router = useRouter();
  const run = useSafeAction();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dataType, setDataType] = useState<BatchImportDataType>('WEEKLY_ACTUALS');
  const [stage, setStage] = useState<Stage>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = columnsForDataType(dataType);

  function reset() {
    setStage('idle');
    setFileName(null);
    setRows(null);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const kind = detectFileKind(file.name);
      if (!kind) {
        setError(`"${file.name}" isn't a supported file type — upload a .csv or .xlsx file.`);
        return;
      }
      setFileName(file.name);
      setStage('reading');
      try {
        const buffer = await file.arrayBuffer();
        const { records, truncated } = readUploadedRows(file.name, buffer);
        if (records.length === 0) {
          setError('That file has no data rows to import.');
          setStage('idle');
          return;
        }
        const validated = records.map((raw, idx) => ({
          rowNumber: idx + 1,
          raw,
          errors: validateBatchRow(dataType, raw, lookups).errors,
        }));
        setRows(records);
        setPreview(validated);
        setStage('ready');
        if (truncated) {
          setError(`This file has more rows than a single batch supports — only the first ${records.length} were read.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file.');
        setStage('idle');
      }
    },
    [dataType, lookups]
  );

  function handleStage() {
    if (!rows || !fileName) return;
    setStage('staging');
    startTransition(async () => {
      const outcome = await run(() => stageImportBatch(dataType, fileName, rows), {
        errorTitle: 'Couldn’t stage this batch',
        context: { scope: 'batch-import', dataType },
      });
      if (!outcome.ok) {
        setStage('ready');
        return;
      }
      const res = outcome.data;
      if (!res.ok) {
        setError(res.error);
        setStage('ready');
        return;
      }
      router.push(`/admin/ingestion/batches/${res.batchId}`);
    });
  }

  const validCount = preview?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorCount = preview ? preview.length - validCount : 0;

  return (
    <section className="card flex flex-col gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Self-Service Ingestion Portal</div>
        <h2 className="text-[15.5px] font-bold">Batch Import — Weekly Metrics</h2>
        <p className="text-[12.5px] text-ink-muted mt-1 max-w-2xl">
          Drop a CSV or Excel file of weekly actuals or milestone/progress updates across any number of engagements.
          Rows are validated on arrival — anything malformed is quarantined for correction, never silently dropped or
          committed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {BATCH_DATA_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={stage === 'reading' || stage === 'staging'}
            onClick={() => {
              setDataType(t);
              reset();
            }}
            className={clsx(
              'rounded-md px-3.5 py-1.5 text-[13px] font-semibold border transition-colors disabled:opacity-50',
              dataType === t ? 'bg-surface-3 border-border-soft text-ink' : 'border-border text-ink-muted hover:text-ink hover:bg-surface-2'
            )}
          >
            {BATCH_DATA_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <p className="text-[11.5px] text-ink-faint">
        Expected columns:{' '}
        {columns.map((c, i) => (
          <span key={c.header}>
            <span className="font-mono text-ink-muted">{c.header}</span>
            {!c.required && <span className="text-ink-faint"> (optional)</span>}
            {i < columns.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>

      {stage === 'idle' || stage === 'reading' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          id="batch-import-zone"
          className={clsx(
            'rounded-lg border-2 border-dashed px-6 py-10 flex flex-col items-center justify-center gap-2 text-center transition-colors',
            dragOver ? 'border-brand bg-brand/5' : 'border-border-soft bg-surface-2/50'
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-ink-faint" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
          </svg>
          {stage === 'reading' ? (
            <p className="text-sm text-ink-muted">Reading {fileName}&hellip;</p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Drag a .csv or .xlsx file here, or</p>
              <label className="btn-secondary !w-auto px-4 text-xs cursor-pointer inline-flex items-center justify-center">
                Choose a file&hellip;
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
              </label>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-ink-faint">{fileName}</span>
            <span className="badge bg-success-soft text-success">{validCount} valid</span>
            {errorCount > 0 && <span className="badge bg-critical-soft text-critical">{errorCount} quarantined</span>}
          </div>

          {preview && errorCount > 0 && (
            <div className="overflow-y-auto max-h-64 border border-border-soft rounded-sm">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
                    <th className="py-1.5 px-3">Row</th>
                    <th className="py-1.5 px-3">Why it&rsquo;ll be quarantined</th>
                  </tr>
                </thead>
                <tbody>
                  {preview
                    .filter((r) => r.errors.length > 0)
                    .slice(0, 50)
                    .map((r) => (
                      <tr key={r.rowNumber} className="border-t border-border/60">
                        <td className="py-1.5 px-3 tabular-nums text-ink-faint align-top">{r.rowNumber}</td>
                        <td className="py-1.5 px-3 text-ink-muted">
                          <ul className="flex flex-col gap-0.5">
                            {r.errors.map((issue, i) => (
                              <li key={i} className="text-critical">
                                {issue.field}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={reset} disabled={stage === 'staging'}>
              Choose a different file
            </button>
            <button type="button" className="btn-primary !w-auto px-5 text-xs disabled:opacity-50" onClick={handleStage} disabled={stage === 'staging'}>
              {stage === 'staging' ? 'Staging…' : `Stage ${rows?.length ?? 0} row${rows?.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-critical text-xs">{error}</p>}
    </section>
  );
}
