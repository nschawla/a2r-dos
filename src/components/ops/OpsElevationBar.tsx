'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useSafeAction, OPS_ELEVATE_EVENT } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';
import {
  requestOpsElevationAction,
  endOpsElevationAction,
} from '@/server/actions/ops-elevation';

export interface ElevationBarState {
  reason: string;
  expiresAt: string;
}

const DURATION_CHOICES = [15, 30, 60] as const;

function remainingLabel(expiresAt: number, now: number): string {
  const ms = Math.max(0, expiresAt - now);
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A2R Operator Control Plane — the Just-In-Time elevation strip, mounted
 * under the header in src/app/(admin)/layout.tsx.
 *
 * Unelevated: an amber "read-only" bar with an **Elevate** button. Elevated:
 * a green bar with a live countdown and **Drop elevation**. Also opens its
 * modal on the `a2r:ops-elevate` window event that useSafeAction dispatches
 * when a privileged action returns `ELEVATION_REQUIRED`.
 */
export function OpsElevationBar({
  elevation,
  maxMinutes,
}: {
  elevation: ElevationBarState | null;
  maxMinutes: number;
}) {
  const router = useRouter();
  const runAction = useSafeAction();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [ttl, setTtl] = useState<number>(30);
  const [formError, setFormError] = useState<string | null>(null);

  // `now` stays 0 until mounted so SSR and the first client render agree
  // (no hydration mismatch on the live countdown). See below.
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const expiresAt = elevation ? new Date(elevation.expiresAt).getTime() : null;
  const expiredRef = useRef(false);

  const choices = DURATION_CHOICES.filter((d) => d <= maxMinutes);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
  }, []);

  // live countdown while elevated
  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // when the window runs out, re-render the server tree once
  useEffect(() => {
    if (mounted && expiresAt !== null && now >= expiresAt && !expiredRef.current) {
      expiredRef.current = true;
      toast({ variant: 'default', title: 'Elevation expired — back to read-only.' });
      router.refresh();
    }
  }, [mounted, now, expiresAt, router, toast]);

  const openModal = useCallback(() => {
    setFormError(null);
    setReason('');
    setPassword('');
    setTtl(choices.includes(30) ? 30 : choices[0] ?? 15);
    setModalOpen(true);
  }, [choices]);

  // open on the cross-component "elevation required" event
  useEffect(() => {
    const handler = () => {
      if (!elevation) openModal();
    };
    window.addEventListener(OPS_ELEVATE_EVENT, handler);
    return () => window.removeEventListener(OPS_ELEVATE_EVENT, handler);
  }, [elevation, openModal]);

  function submit() {
    setFormError(null);
    startTransition(async () => {
      const outcome = await runAction(
        () => requestOpsElevationAction({ reason, password, ttlMinutes: ttl }),
        { errorTitle: 'Couldn’t start elevation' },
      );
      if (!outcome.ok) return;
      if (!outcome.data.ok) {
        setFormError(outcome.data.error);
        return;
      }
      toast({ variant: 'success', title: `Elevated for ${ttl} minutes.` });
      setPassword('');
      setModalOpen(false);
      expiredRef.current = false;
      router.refresh();
    });
  }

  function drop() {
    startTransition(async () => {
      await runAction(() => endOpsElevationAction(), { errorTitle: 'Couldn’t drop elevation' });
      toast({ variant: 'default', title: 'Elevation dropped.' });
      router.refresh();
    });
  }

  const live = expiresAt !== null && now < expiresAt;

  return (
    <>
      <div
        data-elevation={live ? 'active' : 'none'}
        className={clsx(
          'flex items-center justify-between gap-3 px-7 py-2 text-[12px] border-b',
          live
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-warning/10 border-warning/30 text-warning',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx('status-dot', live ? 'bg-success' : 'bg-warning')} />
          {live ? (
            <span className="truncate">
              <span className="font-semibold">Elevated</span> · expires in{' '}
              <span className="tabular-nums font-semibold">
                {mounted ? remainingLabel(expiresAt!, now) : '··:··'}
              </span>
              {elevation?.reason ? <span className="text-ink-faint"> · {elevation.reason}</span> : null}
            </span>
          ) : (
            <span>
              <span className="font-semibold">Read-only.</span> Elevate to run a privileged operation
              (provision, suspend, impersonate, export, purge, API keys, identity federation, staff access).
            </span>
          )}
        </div>
        {live ? (
          <button
            type="button"
            onClick={drop}
            disabled={pending}
            className="flex-none rounded-sm border border-success/40 px-3 py-1 text-[11px] font-semibold hover:bg-success/15 disabled:opacity-60"
          >
            Drop elevation
          </button>
        ) : (
          <button
            type="button"
            onClick={openModal}
            disabled={pending}
            className="flex-none rounded-sm border border-warning/40 px-3 py-1 text-[11px] font-semibold hover:bg-warning/15 disabled:opacity-60"
          >
            Elevate
          </button>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Request privilege elevation"
          onClick={() => setModalOpen(false)}
        >
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">
                  A2R Operator · Just-In-Time
                </div>
                <h2 className="text-[15.5px] font-bold">Request privilege elevation</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="w-7 h-7 flex-none rounded-sm border border-border-soft text-ink-muted hover:text-ink flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-ink-muted">Reason (recorded in the elevation audit trail)</span>
                <textarea
                  className="input min-h-[72px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Provisioning tenant for Contoso — signed order #4821"
                  maxLength={500}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-ink-muted">
                  Confirm your password <span className="text-ink-faint">(step-up — required to escalate)</span>
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  maxLength={200}
                />
              </label>

              <div className="flex flex-col gap-1 text-xs">
                <span className="text-ink-muted">Window</span>
                <div className="flex gap-2">
                  {choices.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTtl(d)}
                      className={clsx(
                        'rounded-sm border px-3 py-1.5 font-semibold',
                        ttl === d
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border text-ink-muted hover:border-ink-faint',
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
                <span className="text-[10.5px] text-ink-faint">
                  Auto-expires — cap is {maxMinutes} minutes. Re-elevate when it runs out.
                </span>
              </div>

              {formError && <p className="text-critical text-xs">{formError}</p>}

              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  className="text-ink-faint hover:text-ink text-xs px-3 py-2"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || reason.trim().length < 10 || password.length < 1}
                  onClick={submit}
                  className={clsx('btn-primary !w-auto px-5 text-xs', pending && 'opacity-60')}
                >
                  {pending ? 'Elevating…' : 'Elevate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
