import { requireOrgContext } from '@/lib/session';
import { INGESTION_TEMPLATES } from '@/server/services/templates';
import { IngestionTemplateHub } from '@/components/ingestion/IngestionTemplateHub';

/**
 * Tenant-admin view of the Data Ingestion & Template Hub — the same
 * component and templates the A2R Ops Console shows at /ops/ingestion,
 * inside the customer's own workspace so an admin can grab a template and
 * head straight to the module's Import CSV action.
 */
export default async function AdminIngestionPage() {
  await requireOrgContext();

  return (
    <IngestionTemplateHub
      templates={INGESTION_TEMPLATES}
      intro="Fill a template, then use the Import CSV action in the matching module (or ask your A2R contact to set up an automated feed). Every import is previewed before it commits."
    />
  );
}
