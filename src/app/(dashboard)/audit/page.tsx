import Link from 'next/link';
import { ProjectPicker } from '@/components/dashboard/project-picker';

export default function AuditIndexPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Control Audit Intake</h1>
        <p className="text-ink-muted text-sm mt-1">Live governance-health tracker across every delivery control.</p>
        <div className="mt-3">
          <Link href="/methodology" className="btn-secondary !w-auto px-4 text-xs">
            Methodology Reference
          </Link>
        </div>
      </div>
      <ProjectPicker modulePath="/audit" moduleLabel="Governance Health" moduleDesc="Choose an engagement to review its audit completion." />
    </>
  );
}
