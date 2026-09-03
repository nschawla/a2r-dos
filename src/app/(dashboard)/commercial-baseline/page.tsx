import { ProjectPicker } from '@/components/dashboard/project-picker';

export default function CommercialBaselineIndexPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Commercial Baseline</h1>
        <p className="text-ink-muted text-sm mt-1">
          Contractual scope, baseline hours, sold margin, and agreed rate cards.
        </p>
      </div>
      <ProjectPicker
        modulePath="/commercial-baseline"
        moduleLabel="Commercial Baseline"
        moduleDesc="Choose an engagement to open its commercial setup and sizing baseline."
      />
    </>
  );
}
