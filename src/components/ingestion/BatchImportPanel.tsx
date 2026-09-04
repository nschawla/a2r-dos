'use client';

/**
 * WP7 — composes the upload portal and the batch history table into the
 * "Batch Import" tab of /admin/ingestion. Both children are plain
 * presentational pieces; this just lays them out.
 */
import { BatchUploadPortal } from './BatchUploadPortal';
import { BatchList } from './BatchList';
import type { BatchValidationContext } from '@/lib/ingestion/batch-schemas';
import type { BatchListItem } from '@/server/actions/data-import';

export function BatchImportPanel({ lookups, batches }: { lookups: BatchValidationContext; batches: BatchListItem[] }) {
  return (
    <div className="flex flex-col gap-5">
      <BatchUploadPortal lookups={lookups} />
      <BatchList batches={batches} />
    </div>
  );
}
