'use client';

/**
 * WP7 — the quarantine / inline-correction grid at
 * /admin/ingestion/batches/[batchId]. Every ERROR row renders as editable
 * cells (the file's own raw values, untouched until someone corrects
 * them); VALID and CORRECTED rows render read-only — editing a row that
 * already passed isn't part of this flow. "Re-validate & Commit" is the
 * hard stop: it stays disabled for as long as `errorRows > 0`, and the
 * server enforces the same rule again on click regardless of what this
 * button's disabled state claims (see commitImportBatch's doc comment).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import { BATCH_DATA_TYPE_LABEL } from '@/lib/ingestion/batch-schemas';
import { updateImportRow, commitImportBatch, discardImportBatch, type BatchDetail, type StagedRowView } from '@/server/actions/data-import';

const STATUS_META: Record<StagedRowView['status'], { label: string; className: string }> = {
  VALID: { label: 'Valid', className: 'bg-success-soft text-success' },
  CORRECTED: { label: 'Corrected', className: 'bg-brand/10 text-brand' },
  ERROR: { label: 'Error', className: 'bg-critical-soft text-critical' },
};

export function BatchDetailView({ initialBatch }: { initialBatch: BatchDetail }) {
  const router = useRouter();
  const run = useSafeAction();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [batch, setBatch] = useState<BatchDetail>(initialBatch);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const locked = batch.status !== 'STAGED';

  function draftFor(row: StagedRowView): Record<string, string> {
    return drafts[row.id] ?? row.raw;
  }

  function setDraftField(rowId: string, key: string, value: string, base: Record<string, string>) {
    setDrafts((d) => ({ ...d, [rowId]: { ...(d[rowId] ?? base), [key]: value } }));
  }

  function handleSaveRow(row: StagedRowView) {
    const patch = drafts[row.id];
    if (!patch) return;
    setSavingRowId(row.id);
    startTransition(async () => {
      const outcome = await run(() => updateImportRow(batch.id, row.id, patch), {
        errorTitle: 'Couldn’t save that correction',
      });
      setSavingRowId(null);
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        toast({ variant: 'error', title: 'Row still has errors', description: res.error });
        return;
      }
      setBatch((b) => ({
        ...b,
        validRows: res.validRows,
        errorRows: res.errorRows,
        totalRows: res.totalRows,
        rows: b.rows.map((r) => (r.id === row.id ? res.row : r)),
      }));
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      if (res.row.status !== 'ERROR') {
        toast({ variant: 'success', title: `Row ${row.rowIndex} corrected`, description: 'Moved out of quarantine.' });
      }
    });
  }

  function handleCommit() {
    if (batch.errorRows > 0) return;
    setCommitting(true);
    startTransition(async () => {
      const outcome = await run(() => commitImportBatch(batch.id), { errorTitle: 'Couldn’t commit this batch' });
      setCommitting(false);
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        toast({ variant: 'error', title: 'Commit blocked', description: res.error });
        router.refresh();
        return;
      }
      toast({ variant: 'success', title: 'Batch committed', description: `${res.committedRows} row(s) written to the workspace.` });
      router.refresh();
    });
  }

  function handleDiscard() {
    if (!window.confirm('Discard this batch? Nothing has been written yet — this just removes it from the quarantine queue.')) return;
    setDiscarding(true);
    startTransition(async () => {
      const outcome = await run(() => discardImportBatch(batch.id), { errorTitle: 'Couldn’t discard this batch' });
      setDiscarding(false);
      if (!outcome.ok) return;
      const res = outcome.data;
      if (!res.ok) {
        toast({ variant: 'error', title: 'Couldn’t discard', description: res.error });
        return;
      }
      toast({ variant: 'default', title: 'Batch discarded' });
      router.push('/admin/ingestion');
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
            {BATCH_DATA_TYPE_LABEL[batch.dataType]} Batch
          </div>
          <h1 className="text-xl font-display font-bold">{batch.fileName}</h1>
          <p className="text-[12.5px] text-ink-muted mt-1">
            Uploaded {new Date(batch.createdAt).toLocaleString()}
            {batch.uploadedByName ? ` by ${batch.uploadedByName}` : ''}
            {batch.committedAt ? ` · Committed ${new Date(batch.committedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <span className="badge bg-success-soft text-success">{batch.validRows} valid</span>
          {batch.errorRows > 0 && <span className="badge bg-critical-soft text-critical">{batch.errorRows} in quarantine</span>}
          <span className="badge bg-na-soft text-na">{batch.totalRows} total</span>
        </div>
      </div>

      {locked && (
        <div className="card !py-3 text-[13px] text-ink-muted">
          This batch is <span className="font-semibold text-ink">{batch.status === 'COMMITTED' ? 'committed' : 'discarded'}</span> —
          rows are shown for reference and can no longer be edited.
        </div>
      )}

      <section className="card !p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Quarantine &amp; Correction</div>
            <h2 className="text-[15.5px] font-bold">Every Row</h2>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[32rem]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 z-10">
              <tr className="text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
                <th className="py-2 px-3">Row</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Data</th>
                <th className="py-2 px-3">Issues</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {batch.rows.map((row) => {
                const meta = STATUS_META[row.status];
                const isError = row.status === 'ERROR';
                const draft = draftFor(row);
                const dirty = Boolean(drafts[row.id]);
                return (
                  <tr key={row.id} className={clsx('border-t border-border/60 align-top', isError && 'bg-critical-soft/20')}>
                    <td className="py-2 px-3 tabular-nums text-ink-faint">{row.rowIndex}</td>
                    <td className="py-2 px-3">
                      <span className={clsx('text-[10.5px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap', meta.className)}>{meta.label}</span>
                    </td>
                    <td className="py-2 px-3 min-w-[22rem]">
                      {isError && !locked ? (
                        <div className="flex flex-col gap-1.5">
                          {Object.entries(row.raw).map(([key, value]) => (
                            <label key={key} className="flex items-center gap-2">
                              <span className="text-[10.5px] text-ink-faint w-32 flex-none truncate" title={key}>
                                {key}
                              </span>
                              <input
                                type="text"
                                value={draft[key] ?? value}
                                onChange={(e) => setDraftField(row.id, key, e.target.value, row.raw)}
                                className="input !py-1 !text-[11.5px] flex-1 min-w-0"
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-muted">
                          {Object.entries(row.raw).map(([key, value]) => (
                            <span key={key}>
                              <span className="text-ink-faint">{key}:</span> {value || <span className="text-ink-faint">&mdash;</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-ink-muted min-w-[16rem]">
                      {row.errors.length === 0 ? (
                        <span className="text-ink-faint">&mdash;</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {row.errors.map((issue, i) => (
                            <li key={i} className="text-critical">
                              {issue.field}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {isError && !locked && (
                        <button
                          type="button"
                          className="btn-secondary !w-auto !py-1 px-3 text-[11px] disabled:opacity-50"
                          disabled={!dirty || savingRowId === row.id}
                          onClick={() => handleSaveRow(row)}
                        >
                          {savingRowId === row.id ? 'Checking…' : 'Save & re-validate'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!locked && (
        <div className="card flex items-center justify-between gap-4 flex-wrap">
          <div className="text-[13px]">
            {batch.errorRows > 0 ? (
              <p className="text-critical font-semibold">
                {batch.errorRows} row{batch.errorRows === 1 ? '' : 's'} still {batch.errorRows === 1 ? 'has' : 'have'} unresolved errors — correct
                every row above before you can commit this batch. No partial commits are allowed.
              </p>
            ) : (
              <p className="text-success font-semibold">Every row is clean. Committing will write {batch.validRows} row(s) to the live workspace.</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-none">
            <button type="button" className="text-critical hover:underline text-xs px-3 py-2 disabled:opacity-50" onClick={handleDiscard} disabled={discarding}>
              {discarding ? 'Discarding…' : 'Discard batch'}
            </button>
            <button
              type="button"
              className="btn-primary !w-auto px-5 text-xs disabled:opacity-50"
              disabled={batch.errorRows > 0 || committing}
              title={batch.errorRows > 0 ? `Resolve ${batch.errorRows} error row(s) first` : undefined}
              onClick={handleCommit}
            >
              {committing ? 'Committing…' : 'Re-validate & Commit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
