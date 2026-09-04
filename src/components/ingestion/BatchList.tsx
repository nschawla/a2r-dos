'use client';

/**
 * WP7 — the "recent batches" table under the drag-and-drop portal at
 * /admin/ingestion's Batch Import tab. Server-rendered data, handed down
 * as a prop — no client fetch on mount, since the parent page already
 * loaded it for the same request that renders BatchUploadPortal.
 */
import Link from 'next/link';
import clsx from 'clsx';
import { BATCH_DATA_TYPE_LABEL } from '@/lib/ingestion/batch-schemas';
import type { BatchListItem } from '@/server/actions/data-import';

const STATUS_STYLE: Record<BatchListItem['status'], string> = {
  STAGED: 'bg-warning-soft text-warning',
  COMMITTED: 'bg-success-soft text-success',
  DISCARDED: 'bg-na-soft text-na',
};

const STATUS_LABEL: Record<BatchListItem['status'], string> = {
  STAGED: 'Quarantine review',
  COMMITTED: 'Committed',
  DISCARDED: 'Discarded',
};

export function BatchList({ batches }: { batches: BatchListItem[] }) {
  if (batches.length === 0) {
    return (
      <section className="card">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Batch History</div>
        <p className="text-sm text-ink-muted">No batches uploaded yet — drop a file above to get started.</p>
      </section>
    );
  }

  return (
    <section className="card !p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Batch History</div>
        <h2 className="text-[15.5px] font-bold">Recent Batches</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
              <th className="py-2.5 px-5">File</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Rows</th>
              <th className="py-2.5 px-3">Uploaded</th>
              <th className="py-2.5 px-5" />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 px-5 font-mono text-[12px] text-ink">{b.fileName}</td>
                <td className="py-2.5 px-3 text-ink-muted">{BATCH_DATA_TYPE_LABEL[b.dataType]}</td>
                <td className="py-2.5 px-3">
                  <span className={clsx('text-[10.5px] font-semibold rounded-full px-2 py-0.5', STATUS_STYLE[b.status])}>
                    {STATUS_LABEL[b.status]}
                    {b.status === 'STAGED' && b.errorRows > 0 ? ` · ${b.errorRows} error${b.errorRows === 1 ? '' : 's'}` : ''}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-ink-muted tabular-nums">
                  {b.validRows}/{b.totalRows} valid
                </td>
                <td className="py-2.5 px-3 text-ink-faint">{new Date(b.createdAt).toLocaleDateString()}</td>
                <td className="py-2.5 px-5 text-right">
                  <Link href={`/admin/ingestion/batches/${b.id}`} className="text-brand hover:underline font-semibold text-xs">
                    {b.status === 'STAGED' ? 'Review' : 'View'} &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
