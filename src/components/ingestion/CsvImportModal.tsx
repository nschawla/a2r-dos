'use client';

/**
 * WP6 — CSV Ingestion Pipeline: the modal shared by all three import
 * surfaces (Commercial Baseline's Effort Matrix, RAID Cockpit's log import,
 * Financials' Actuals import). One generic component parameterized by
 * `kind` rather than three near-identical modals, since the dry-run →
 * preview → commit flow and the table-of-issues rendering are identical
 * across all three — only the expected-columns hint text and the
 * server-side parser/lookup differ, and those already live behind the
 * `kind` switch in src/server/actions/ingestion.ts.
 *
 * The file is read client-side via FileReader (never uploaded as a
 * multipart blob — Server Actions take it as a plain string argument), and
 * that same raw text is sent to both `previewCsvImport` (dry run, no
 * writes) and, only on explicit confirmation, `commitCsvImport` — which
 * re-parses and re-validates it itself rather than trusting the preview
 * response.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { previewCsvImport, commitCsvImport, type IngestionKind } from '@/server/actions/ingestion';
import type { CsvParseResult, CsvIssue } from '@/lib/ingestion/csv-parsers';

const KIND_META: Record<IngestionKind, { title: string; columns: string; example: string }> = {
  effort: {
    title: 'Import Effort Matrix Hours',
    columns: 'Phase, Role, Hours (optional: Employment Type)',
    example: 'Phase,Role,Hours\nBuild,Senior Engineer,120\nTest,QA Analyst,40',
  },
  raid: {
    title: 'Import RAID Log',
    columns: 'Type, Title, Description, Severity, Impact, Mitigation Plan, Owner, Target Date, Escalate',
    example:
      'Type,Title,Description,Severity,Impact,Mitigation Plan,Owner,Target Date,Escalate\nRisk,Vendor delay,Third-party API may slip,High,Schedule slip,Weekly check-ins,,2026-10-01,true',
  },
  financials: {
    title: 'Import Financial Actuals',
    columns: 'Role (or "Direct" for Direct Intake projects), Hours, Cost, Forecast Hours, Open RR Hours',
    example: 'Role,Hours,Cost,Forecast Hours,Open RR Hours\nSenior Engineer,80,18400,40,0',
  },
};

type Stage = 'pick' | 'previewing' | 'preview' | 'committing' | 'done';

export interface CsvImportModalProps {
  projectId: string;
  kind: IngestionKind;
  onClose: () => void;
}

export function CsvImportModal({ projectId, kind, onClose }: CsvImportModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meta = KIND_META[kind];

  const [stage, setStage] = useState<Stage>('pick');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<CsvParseResult<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<{ importedCount: number; skippedCount: number; totalRows: number } | null>(null);

  function handleFilePicked(file: File) {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsvText(text);
      runPreview(text);
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  function runPreview(text: string) {
    setStage('previewing');
    setError(null);
    previewCsvImport(projectId, kind, text).then((res) => {
      if (!res.ok) {
        setError(res.error);
        setStage('pick');
        return;
      }
      setResult(res.result);
      setStage('preview');
    });
  }

  function handleCommit() {
    if (!csvText) return;
    setStage('committing');
    setError(null);
    commitCsvImport(projectId, kind, csvText).then((res) => {
      if (!res.ok) {
        setError(res.error);
        setStage('preview');
        return;
      }
      setCommitSummary(res);
      setStage('done');
      router.refresh();
    });
  }

  function handleReset() {
    setStage('pick');
    setFileName(null);
    setCsvText(null);
    setResult(null);
    setError(null);
    setCommitSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col !p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-brand-hi font-semibold mb-1">Data Pipeline</div>
            <h2 className="text-lg font-display font-bold">{meta.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            type="button"
            className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink hover:border-ink-faint flex items-center justify-center"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          {stage === 'pick' && (
            <>
              <p className="text-sm text-ink-muted">
                Expected columns: <span className="text-ink font-mono text-[12.5px]">{meta.columns}</span>
              </p>
              <pre className="bg-surface-2 rounded-sm p-3 text-[11px] font-mono text-ink-faint overflow-x-auto whitespace-pre">
                {meta.example}
              </pre>
              <label className="btn-secondary !w-auto px-4 text-xs cursor-pointer inline-flex items-center justify-center">
                Choose CSV file&hellip;
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFilePicked(file);
                  }}
                />
              </label>
            </>
          )}

          {stage === 'previewing' && <p className="text-ink-muted text-sm">Validating {fileName}&hellip;</p>}

          {(stage === 'preview' || stage === 'committing') && result && (
            <>
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <span className="text-ink-faint">{fileName}</span>
                <span className="badge bg-success-soft text-success">{result.validCount} valid</span>
                {result.errorCount > 0 && <span className="badge bg-critical-soft text-critical">{result.errorCount} errors</span>}
                {result.warningCount > 0 && <span className="badge bg-warning-soft text-warning">{result.warningCount} warnings</span>}
                {result.truncated && (
                  <span className="badge bg-na-soft text-na">Truncated to first {result.rows.length} rows</span>
                )}
              </div>

              <div className="overflow-y-auto max-h-80 border border-border-soft rounded-sm">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
                      <th className="py-1.5 px-3">Row</th>
                      <th className="py-1.5 px-3">Status</th>
                      <th className="py-1.5 px-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => {
                      const rowHasError = r.data === null;
                      return (
                        <tr key={r.rowNumber} className="border-t border-border/60">
                          <td className="py-1.5 px-3 tabular-nums text-ink-faint">{r.rowNumber}</td>
                          <td className="py-1.5 px-3">
                            <span
                              className={clsx(
                                'text-[10.5px] font-semibold rounded-full px-2 py-0.5',
                                rowHasError ? 'bg-critical-soft text-critical' : r.issues.length > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
                              )}
                            >
                              {rowHasError ? 'Error' : r.issues.length > 0 ? 'Warning' : 'OK'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-ink-muted">
                            {r.issues.length === 0 ? (
                              <span className="text-ink-faint">&mdash;</span>
                            ) : (
                              <ul className="flex flex-col gap-0.5">
                                {r.issues.map((issue: CsvIssue, i: number) => (
                                  <li key={i} className={issue.severity === 'error' ? 'text-critical' : 'text-warning'}>
                                    {issue.field ? `${issue.field}: ` : ''}
                                    {issue.message}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {result.validCount === 0 && (
                <p className="text-critical text-xs">No valid rows in this file — fix the errors above and re-upload.</p>
              )}
            </>
          )}

          {stage === 'done' && commitSummary && (
            <div className="flex flex-col gap-2">
              <p className="text-success text-sm font-semibold">Import committed.</p>
              <p className="text-ink-muted text-sm">
                {commitSummary.importedCount} of {commitSummary.totalRows} rows imported
                {commitSummary.skippedCount > 0 ? `, ${commitSummary.skippedCount} skipped` : ''}. Logged to this project&rsquo;s Audit
                Trail.
              </p>
            </div>
          )}

          {error && <p className="text-critical text-xs">{error}</p>}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          {stage === 'preview' && (
            <>
              <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={handleReset}>
                Choose a different file
              </button>
              <button
                type="button"
                className="btn-secondary !w-auto px-5"
                disabled={!result || result.validCount === 0}
                onClick={handleCommit}
              >
                Commit {result?.validCount ?? 0} row{result?.validCount === 1 ? '' : 's'}
              </button>
            </>
          )}
          {stage === 'committing' && (
            <button type="button" className="btn-secondary !w-auto px-5" disabled>
              Committing&hellip;
            </button>
          )}
          {stage === 'done' && (
            <button type="button" className="btn-secondary !w-auto px-5" onClick={onClose}>
              Done
            </button>
          )}
          {(stage === 'pick' || stage === 'previewing') && (
            <button type="button" className="text-ink-faint hover:text-ink text-xs px-3 py-2" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
