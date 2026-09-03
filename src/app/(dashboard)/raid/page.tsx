import { ProjectPicker } from '@/components/dashboard/project-picker';

export default function RaidIndexPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">RAID Cockpit</h1>
        <p className="text-ink-muted text-sm mt-1">Risks, Assumptions, Issues, and Dependencies per engagement.</p>
      </div>
      <ProjectPicker modulePath="/raid" moduleLabel="Operational Governance" moduleDesc="Choose an engagement to open its RAID log." />
    </>
  );
}
