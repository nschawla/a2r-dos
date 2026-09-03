import { ProjectPicker } from '@/components/dashboard/project-picker';

export default function ScheduleIndexPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Schedule &amp; Milestone Burndown</h1>
        <p className="text-ink-muted text-sm mt-1">Baseline vs. actual/forecast phase dates.</p>
      </div>
      <ProjectPicker modulePath="/schedule" moduleLabel="Milestone Governance" moduleDesc="Choose an engagement to review its schedule." />
    </>
  );
}
