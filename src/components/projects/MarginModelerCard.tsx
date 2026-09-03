'use client';

import { useState } from 'react';
import { computeMarginModeler, type SizingTotals } from '@/lib/calculations/sizing';

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * WP4 deliverable: the Deal page's `computeMarginModeler` consumer. This
 * is a pure function of `totals` (itself already computed server-side via
 * `computeTotalsFor`) and a target-margin slider, so it re-runs entirely
 * client-side on every drag — no server round trip, no debounce needed.
 * Safe to import in a client bundle: src/lib/calculations has zero
 * React/Next/Prisma dependency, same as every other consumer of it.
 */
export function MarginModelerCard({ totals }: { totals: SizingTotals }) {
  const [target, setTarget] = useState(() => Math.max(0, Math.min(99, Math.round(totals.marginPct))));
  const result = computeMarginModeler(totals, target);

  return (
    <div className="card">
      <h2 className="text-[15.5px] font-bold mb-1">Target Margin Modeler</h2>
      <p className="text-[12.5px] text-ink-muted mb-4 max-w-xl">
        Back-solves the services revenue and blended bill rate required to hit an arbitrary target margin, given this
        deal&rsquo;s current cost base.
      </p>

      {!result.hasBasis ? (
        <p className="text-ink-muted text-sm">Size the Phase-Effort Matrix first — the modeler needs a cost basis to work from.</p>
      ) : (
        <>
          <label className="flex items-center gap-3 text-sm mb-5">
            <span className="text-ink-muted flex-none">Target margin</span>
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="flex-1 accent-brand"
            />
            <span className="tabular-nums font-semibold w-12 text-right">{target}%</span>
          </label>

          <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
            <dt className="text-ink-muted">Required services revenue</dt>
            <dd className="tabular-nums">{money(result.requiredRevenue)}</dd>
            <dt className="text-ink-muted">Required blended bill rate</dt>
            <dd className="tabular-nums">${result.requiredBlendedRate.toFixed(2)}/hr</dd>
            <dt className="text-ink-muted">{result.diff >= 0 ? 'Discount headroom' : 'Premium required'}</dt>
            <dd className={`tabular-nums font-semibold ${result.diff >= 0 ? 'text-success' : 'text-critical'}`}>
              {money(Math.abs(result.diff))} ({Math.abs(result.diffPct).toFixed(1)}%)
            </dd>
          </dl>
        </>
      )}
    </div>
  );
}
