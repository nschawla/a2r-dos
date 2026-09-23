import { Suspense } from 'react';
import { requireOrgContext } from '@/lib/session';
import { loadScheduleTriage } from '@/server/queries/schedule-triage';
import { SkeletonCard } from '@/components/ui/skeleton';
import { ScheduleTriageHeader } from '@/components/modules/schedule/ScheduleTriageHeader';
import { ProjectPicker } from '@/components/dashboard/project-picker';

export default async function ScheduleIndexPage() {
  const context = await requireOrgContext();

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Schedule &amp; Milestone Burndown</h1>
        <p className="text-ink-muted text-sm mt-1">
          Baseline vs. actual/forecast phase dates — portfolio-wide triage, then drill into any engagement.
        </p>
      </div>

      {/* Macro View — streamed separately from the project picker below so
          the (fast) scoped-project list still paints immediately even if
          the triage rollup across every scoped project's phases is slower. */}
      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>}>
        <ScheduleTriageSection context={context} />
      </Suspense>

      {/* Micro View — jump straight to one engagement's own schedule. */}
      <ProjectPicker modulePath="/schedule" moduleLabel="Milestone Governance" moduleDesc="Choose an engagement to review its schedule." />
    </>
  );
}

async function ScheduleTriageSection({ context }: { context: Awaited<ReturnType<typeof requireOrgContext>> }) {
  const triage = await loadScheduleTriage(context);
  return <ScheduleTriageHeader triage={triage} />;
}
