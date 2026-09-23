import { Suspense } from 'react';
import { requireOrgContext } from '@/lib/session';
import { loadRaidTriage } from '@/server/queries/raid-triage';
import { SkeletonCard } from '@/components/ui/skeleton';
import { RaidTriageHeader } from '@/components/modules/raid/RaidTriageHeader';
import { ProjectPicker } from '@/components/dashboard/project-picker';

export default async function RaidIndexPage() {
  const context = await requireOrgContext();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">RAID Cockpit</h1>
        <p className="text-ink-muted text-sm mt-1">
          Risks, Assumptions, Issues, and Dependencies — portfolio-wide triage, then drill into any engagement.
        </p>
      </div>

      {/* Macro View — streamed separately from the project picker below so
          the (fast) scoped-project list still paints immediately even if
          the triage aggregation across every open RAID item is slower. */}
      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>}>
        <RaidTriageSection context={context} />
      </Suspense>

      {/* Micro View — jump straight to one engagement's own RAID log. */}
      <ProjectPicker modulePath="/raid" moduleLabel="Operational Governance" moduleDesc="Choose an engagement to open its RAID log." />
    </>
  );
}

async function RaidTriageSection({ context }: { context: Awaited<ReturnType<typeof requireOrgContext>> }) {
  const triage = await loadRaidTriage(context);
  return <RaidTriageHeader triage={triage} />;
}
