import { ProjectPicker } from '@/components/dashboard/project-picker';

export default function FinancialsIndexPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Financial Realization</h1>
        <p className="text-ink-muted text-sm mt-1">The Estimate at Completion (EAC) engine.</p>
      </div>
      <ProjectPicker modulePath="/financials" moduleLabel="Financial Realization" moduleDesc="Choose an engagement to review actuals, forecast, and EAC." />
    </>
  );
}
