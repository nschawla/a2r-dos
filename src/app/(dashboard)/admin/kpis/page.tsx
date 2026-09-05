import { listCustomKpis } from '@/server/actions/kpis';
import { KpiBuilderPanel } from '@/components/admin/KpiBuilderPanel';

/**
 * Admin & Org Setup → Custom KPIs. Server component: loads the tenant's
 * existing KPI definitions via the same server action the builder's own
 * mutations call, then hands them to the client panel that owns the
 * create/edit/delete UI (src/components/admin/KpiBuilderPanel.tsx).
 */
export default async function AdminKpisPage() {
  const result = await listCustomKpis();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold">Custom KPIs</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          Define metric cards from your financials, schedule, RAID, and capacity data, and assign them to the
          personas who should see them on the Control Tower and the Executive Hub.
        </p>
        {!result.ok && <p className="text-warning text-xs mt-2">{result.error}</p>}
      </div>

      <KpiBuilderPanel initialKpis={result.ok ? result.kpis : []} />
    </div>
  );
}
