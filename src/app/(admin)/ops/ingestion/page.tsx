import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { INGESTION_TEMPLATES } from '@/server/services/templates';
import { IngestionTemplateHub } from '@/components/ingestion/IngestionTemplateHub';

export const metadata: Metadata = {
  title: 'Data Ingestion & Templates · A2R Ops',
};

/**
 * A2R Operator Control Plane — the intake reference an operator walks a new
 * tenant admin through: the standardized templates, the schema for each,
 * and the load rules. Same component the tenant-facing /admin surface uses.
 */
export default async function OpsIngestionPage() {
  await requireOpsCapability('ingestion:manage');

  return (
    <IngestionTemplateHub
      templates={INGESTION_TEMPLATES}
      intro="Standardized enterprise-intake templates. Share these with a tenant admin during onboarding, or point them at /admin where the same hub lives inside their workspace."
    />
  );
}
