import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { hasPermission } from '@/lib/auth/rbac';
import { getImportBatch } from '@/server/actions/data-import';
import { BatchDetailView } from '@/components/ingestion/BatchDetailView';

export default async function BatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const context = await requireOrgContext();
  if (!hasPermission(context.deliveryRole, 'admin:ingestion')) {
    notFound();
  }

  const result = await getImportBatch((await params).batchId);
  if (!result.ok) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/ingestion?v=batch" className="text-xs text-ink-faint hover:text-ink font-semibold w-fit">
        &larr; Data Ingestion &amp; Templates
      </Link>
      <BatchDetailView initialBatch={result.batch} />
    </div>
  );
}
