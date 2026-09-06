import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { loadMethodologyLabels } from '@/server/queries/pages/dashboards';
import { getMethodologyPlaybook, LIFECYCLE_GATE_ORDER } from '@/lib/control-guidance';
import { ControlGuidanceContent } from '@/components/audit/ControlGuidance';

export const metadata = { title: 'Methodology Reference' };

export default async function MethodologyReferencePage() {
  const { organizationId, organizationName } = await requireOrgContext();

  const [playbook, controlLabels] = await Promise.all([
    Promise.resolve(getMethodologyPlaybook()),
    loadMethodologyLabels({ organizationId }),
  ]);
  const labelByKey = new Map(controlLabels.map((c) => [c.controlKey, c.label]));

  const byGate = LIFECYCLE_GATE_ORDER.map((gate) => ({
    gate,
    controls: playbook.filter((c) => c.lifecycleGate === gate),
  })).filter((g) => g.controls.length > 0);

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Methodology Playbook</div>
        <h1 className="text-2xl font-display font-bold">Methodology Reference</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          The full A2R delivery standard — every governance control, what it exists to achieve, the artifacts a reviewer
          expects, when in the lifecycle it&rsquo;s established, and the criteria it&rsquo;s verified against. The display
          labels below reflect {organizationName}&rsquo;s own overrides; the underlying standard is fixed.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/audit" className="btn-secondary !w-auto px-4 text-xs">
            Back to Control Audit
          </Link>
          <Link href="/admin" className="text-ink-faint hover:text-ink text-xs px-3 py-2">
            Edit display labels →
          </Link>
        </div>
      </div>

      {/* lifecycle gate legend */}
      <div className="card !p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">Lifecycle Gates</div>
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {LIFECYCLE_GATE_ORDER.map((g, i) => (
            <li key={g} className="flex items-center gap-2">
              <span className="badge !py-0.5 !px-2 text-[10px]">{g}</span>
              {i < LIFECYCLE_GATE_ORDER.length - 1 && <span className="text-ink-faint">→</span>}
            </li>
          ))}
        </ol>
      </div>

      {byGate.map(({ gate, controls }) => (
        <section key={gate} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5 border-b border-border/70 pb-1.5">
            <h2 className="text-[15.5px] font-bold">{gate}</h2>
            <span className="text-ink-faint text-xs">
              {controls.length} control{controls.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {controls.map((c) => {
              const displayLabel = labelByKey.get(c.key) ?? c.defaultLabel;
              return (
                <article key={c.key} className="card" data-control={c.key}>
                  <h3 className="text-[15px] font-display font-bold mb-3">{displayLabel}</h3>
                  <ControlGuidanceContent guidance={c} displayLabel={displayLabel} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
