import type { Metadata } from 'next';
import { requireOpsCapability } from '@/lib/ops-auth';
import { DocsHub } from '@/components/ops/DocsHub';
import { DOCS_HUB_ENTRIES, DOCS_HUB_CATEGORY_ORDER } from '@/lib/ops/docs-hub-content.generated';

export const metadata: Metadata = { title: 'Documentation Hub · A2R Ops' };

/**
 * /ops/docs — the in-app reader for the repo's curated documentation
 * (Architecture, RTM, Module Specs, QA, Implementation Guide, Release
 * Notes, Operations & Support). Same gate as every other engineering-
 * reference surface (`devdocs:view`). Complements, not replaces,
 * /ops/dev-docs — see that page for a shorter, hand-authored build/
 * architecture consolidation with the live version stamp.
 */
export default async function OpsDocsPage() {
  await requireOpsCapability('devdocs:view');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Documentation Hub</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          The repo&rsquo;s own <code className="font-mono text-[12px] bg-surface-2 border border-border-soft rounded px-1 py-0.5">docs/</code>{' '}
          files, rendered here so executives and support staff can reference them without a checkout. This is a
          read-only mirror — the files in the repo are always the source of truth; a change here would be
          overwritten by the next <code className="font-mono text-[12px] bg-surface-2 border border-border-soft rounded px-1 py-0.5">npm run docs:hub:build</code>.
        </p>
      </div>
      <DocsHub entries={[...DOCS_HUB_ENTRIES]} categoryOrder={DOCS_HUB_CATEGORY_ORDER} />
    </div>
  );
}
