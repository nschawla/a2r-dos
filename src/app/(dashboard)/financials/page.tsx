import { Suspense } from 'react';
import { requireOrgContext } from '@/lib/session';
import { loadFinancialTriage } from '@/server/queries/financial-triage';
import { SkeletonCard } from '@/components/ui/skeleton';
import { FinancialTriageHeader } from '@/components/modules/financials/FinancialTriageHeader';
import { ProjectPicker } from '@/components/dashboard/project-picker';

export default async function FinancialsIndexPage() {
  const context = await requireOrgContext();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Financial Realization</h1>
        <p className="text-ink-muted text-sm mt-1">The Estimate at Completion (EAC) engine — portfolio-wide triage, then drill into any engagement.</p>
      </div>

      {/* Macro View — streamed separately from the project picker below so
          the (fast) scoped-project list still paints immediately even if
          the triage rollup across every scoped project is slower. */}
      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>}>
        <FinancialTriageSection context={context} />
      </Suspense>

      {/* Micro View — jump straight to one engagement's own EAC. */}
      <ProjectPicker modulePath="/financials" moduleLabel="Financial Realization" moduleDesc="Choose an engagement to review actuals, forecast, and EAC." />
    </>
  );
}

async function FinancialTriageSection({ context }: { context: Awaited<ReturnType<typeof requireOrgContext>> }) {
  const triage = await loadFinancialTriage(context);
  return <FinancialTriageHeader triage={triage} />;
}
