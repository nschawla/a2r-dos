import { requireOrgContext } from '@/lib/session';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/auth/rbac';
import { INGESTION_TEMPLATES } from '@/server/services/templates';
import { IngestionTemplateHub } from '@/components/ingestion/IngestionTemplateHub';
import { BatchImportPanel } from '@/components/ingestion/BatchImportPanel';
import { AiDocumentParser } from '@/components/ingestion/AiDocumentParser';
import { listImportBatches } from '@/server/actions/data-import';
import { ModuleTabs, type ModuleTab } from '@/components/ui/module-tabs';
import type { BatchValidationContext } from '@/lib/ingestion/batch-schemas';
import type { ReactNode } from 'react';

/**
 * Tenant-admin view of the Data Ingestion & Template Hub — now two panes:
 * the existing per-module Template Hub (also shown to A2R operators at
 * /ops/ingestion, read-only reference material), and WP7's Self-Service
 * Batch Import Engine, which is genuinely tenant-scoped (it stages
 * DataImportBatch rows against this org's own projects/resources) and so
 * only ever lives here, not in the Ops Console — see
 * src/server/actions/data-import.ts's doc comment for why.
 */
export default async function AdminIngestionPage() {
  const context = await requireOrgContext();
  // Batch Import spans however many projects a file references at once,
  // bypassing the usual per-project edit scope — same tenant-admin-only
  // gate as the server actions themselves (see data-import.ts's doc
  // comment). The Templates tab stays open to every member, as it always
  // has been; only the batch tab is conditional, so an unauthorized
  // member never sees a "Stage" button that would just reject them.
  const canBatchImport = hasPermission(context.deliveryRole, 'admin:ingestion');

  const tabs: ModuleTab[] = [{ key: 'templates', label: 'Templates' }];
  const panels: Record<string, ReactNode> = {
    templates: (
      <IngestionTemplateHub
        templates={INGESTION_TEMPLATES}
        heading="Intake Templates"
        intro="Fill a template, then use the Import CSV action in the matching module (or ask your A2R contact to set up an automated feed). Every import is previewed before it commits."
      />
    ),
  };

  if (canBatchImport) {
    const [projects, resources, roles, batchesResult] = await Promise.all([
      db.project.findMany({
        where: { organizationId: context.organizationId },
        select: { id: true, externalId: true, name: true, estimationMode: true },
      }),
      db.resource.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true, email: true } }),
      db.deliveryRole.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true } }),
      listImportBatches(),
    ]);
    const lookups: BatchValidationContext = {
      projects: projects.map((p) => ({ id: p.id, code: p.externalId, name: p.name, estimationMode: p.estimationMode })),
      resources: resources.map((r) => ({ id: r.id, name: r.name, email: r.email })),
      roles,
    };
    const batches = batchesResult.ok ? batchesResult.batches : [];

    tabs.push({ key: 'batch', label: 'Batch Import' });
    panels.batch = <BatchImportPanel lookups={lookups} batches={batches} />;

    tabs.push({ key: 'ai-parser', label: 'AI Parser' });
    panels['ai-parser'] = <AiDocumentParser lookups={lookups} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold">Data Ingestion &amp; Templates</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Standardized intake templates, the self-service portal for weekly BAU batch uploads, and an
          AI parser that turns a pasted status report into reviewable batch rows.
        </p>
      </div>

      <ModuleTabs tabs={tabs} panels={panels} />
    </div>
  );
}
