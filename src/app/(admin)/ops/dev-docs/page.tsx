import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { BUILD_INFO } from '@/lib/build-info';
import { CHANGELOG } from '@/lib/changelog';
import { DevDocs } from '@/components/ops/DevDocs';

export const metadata: Metadata = { title: 'Developer Docs · A2R Ops' };

/**
 * /ops/dev-docs — the in-app engineering reference for A2R DOS. A2R-staff
 * only (requireOpsContext, same gate as every other Ops Console page).
 *
 * Thin by design: the live build/release data comes from BUILD_INFO and
 * CHANGELOG, and everything else is a hand-authored consolidation living
 * in the DevDocs component. No secret values anywhere — see that file's
 * header.
 */
export default async function OpsDevDocsPage() {
  await requireOpsCapability('devdocs:view');

  return <DevDocs build={BUILD_INFO} releases={CHANGELOG} />;
}
