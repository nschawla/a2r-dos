import Link from 'next/link';
import { requireOrgContext } from '@/lib/session';
import { getComplianceLedger } from '@/lib/audit-ledger';

export const metadata = { title: 'SOC 2 Compliance Ledger' };

export default async function ComplianceLedgerPage() {
  const { organizationId, organizationName } = await requireOrgContext();
  const { events, integrity } = await getComplianceLedger(organizationId, 200);

  const checkedAt = new Date(integrity.checkedAt);

  return (
    <>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
          <Link href="/admin" className="hover:text-brand">
            Admin &amp; Org Setup
          </Link>{' '}
          / Compliance
        </div>
        <h1 className="text-2xl font-display font-bold">SOC 2 Compliance Ledger</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-2xl">
          An append-only, hash-chained record of every high-consequence governance action in{' '}
          <span className="text-ink font-semibold">{organizationName}</span>. Each entry seals the one before it with a
          SHA-256 hash, so any edit, deletion, or reordering after the fact breaks the chain and is flagged below.
        </p>
      </div>

      {/* Live cryptographic integrity badge */}
      <div
        className={`card !p-4 flex flex-wrap items-center justify-between gap-4 border ${
          integrity.ok ? '!border-success/40' : '!border-critical/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-none ${
              integrity.ok ? 'bg-success-soft text-success' : 'bg-critical-soft text-critical'
            }`}
            aria-hidden
          >
            {integrity.ok ? '✓' : '✕'}
          </span>
          <div>
            <div className={`text-[15px] font-display font-bold ${integrity.ok ? 'text-success' : 'text-critical'}`}>
              {integrity.ok ? 'Ledger Integrity: Verified' : `Ledger Integrity: BROKEN`}
            </div>
            <div className="text-[11.5px] text-ink-faint">
              {integrity.ok
                ? `${integrity.count} entries validated · unbroken SHA-256 chain`
                : `Chain broken at entry #${integrity.brokenAtSequence} (${integrity.reason?.replace(/-/g, ' ')})`}
              {' · checked '}
              {checkedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Chain head fingerprint</div>
          <code className="font-mono text-[12px] text-ink-muted break-all">
            {integrity.headHash ? `${integrity.headHash.slice(0, 24)}…` : '— (empty ledger)'}
          </code>
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">Immutable Ledger</div>
            <h2 className="text-[15.5px] font-bold">Recent Audit Events</h2>
          </div>
          <span className="text-xs text-ink-faint self-center">{integrity.count} total entries</span>
        </div>

        {events.length === 0 ? (
          <p className="text-ink-muted text-sm py-6 text-center">
            No governance events have been recorded yet. Baseline overrides, role-policy changes, and other
            high-consequence actions will appear here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-faint text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Timestamp (UTC)</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Record hash</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0 align-top">
                    <td className="py-2.5 pr-3 tabular-nums text-ink-faint font-mono text-xs">{e.sequence}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-ink-muted whitespace-nowrap text-xs">
                      {new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{e.actorName}</span>
                      {e.actorEmail && <span className="block text-[11px] text-ink-faint">{e.actorEmail}</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge !py-0.5 !px-2 text-[10px]">{e.actionLabel}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <code className="font-mono text-[11.5px] text-ink-muted">{e.targetResource}</code>
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-[11px] text-brand cursor-pointer select-none">details</summary>
                          <pre className="mt-1 text-[10.5px] text-ink-faint bg-surface-2 rounded-sm p-2 overflow-x-auto max-w-md">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <code className="font-mono text-[11px] text-ink-faint" title={`${e.previousHash ?? 'genesis'} → ${e.currentHash}`}>
                        {e.previousHash ? `${e.previousHash.slice(0, 8)}…→` : '⟨genesis⟩→'}
                        <span className="text-ink-muted">{e.currentHash.slice(0, 10)}…</span>
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-4">
          Verified live on every page load: each row&rsquo;s hash is re-derived from its canonical payload plus the prior
          row&rsquo;s hash and compared to the stored value. This ledger has no write path other than automatic event
          capture and no update or delete path anywhere in the application.
        </p>
      </div>
    </>
  );
}
