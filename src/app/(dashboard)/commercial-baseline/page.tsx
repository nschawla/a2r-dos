import { Suspense } from 'react';
import { requireOrgContext } from '@/lib/session';
import { loadCommercialTriage } from '@/server/queries/commercial-triage';
import { SkeletonCard } from '@/components/ui/skeleton';
import { CommercialTriageHeader } from '@/components/modules/commercial-baseline/CommercialTriageHeader';
import { ProjectPicker } from '@/components/dashboard/project-picker';

export default async function CommercialBaselineIndexPage() {
  const context = await requireOrgContext();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Commercial Baseline</h1>
        <p className="text-ink-muted text-sm mt-1">
          Contractual scope, baseline hours, sold margin, and agreed rate cards — portfolio-wide triage, then drill into any engagement.
        </p>
      </div>

      {/* Macro View — streamed separately from the project picker below so
          the (fast) scoped-project list still paints immediately even if
          the triage rollup across every scoped project is slower. */}
      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>}>
        <CommercialTriageSection context={context} />
      </Suspense>

      {/* Micro View — jump straight to one engagement's own commercial setup. */}
      <ProjectPicker
        modulePath="/commercial-baseline"
        moduleLabel="Commercial Baseline"
        moduleDesc="Choose an engagement to open its commercial setup and sizing baseline."
      />
    </>
  );
}

async function CommercialTriageSection({ context }: { context: Awaited<ReturnType<typeof requireOrgContext>> }) {
  const triage = await loadCommercialTriage(context);
  return <CommercialTriageHeader triage={triage} />;
}
