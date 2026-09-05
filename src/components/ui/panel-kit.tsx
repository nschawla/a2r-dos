'use client';

/**
 * Shared building blocks for the settings-style panels in Admin & Org Setup
 * and the Ops Console (roster, governance, identity federation): a busy /
 * error / toast-wrapped action runner and two layout atoms.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSafeAction } from '@/lib/client/safe-action';
import { useToast } from '@/components/ui/toast';

export interface RunOpts {
  /** Toast shown on success. Omit for a silent success (still refreshes). */
  success?: string;
  /** Toast heading + inline label used on failure. */
  errorTitle?: string;
}

export function useBusyAction() {
  const router = useRouter();
  const runSafe = useSafeAction();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Returns whether the action actually succeeded — callers that need to
   * chain a next step only on success (e.g. advancing a wizard) can
   * `if (await run(...)) …` rather than re-reading `error` state, which
   * is still the *previous* render's value immediately after `await`. */
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, opts: RunOpts = {}): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const outcome = await runSafe(fn, { errorTitle: opts.errorTitle ?? 'Couldn’t save changes' });
      if (!outcome.ok) return false; // threw — error toast already shown + logged
      const result = outcome.data;
      if (!result.ok) {
        const message = result.error ?? 'Something went wrong';
        setError(message);
        toast({ variant: 'error', title: opts.errorTitle ?? 'Change not saved', description: message });
        return false;
      }
      if (opts.success) toast({ variant: 'success', title: opts.success });
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

export function PanelHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1">{eyebrow}</div>
      <h2 className="text-[15.5px] font-bold">{title}</h2>
      <p className="text-[12.5px] text-ink-muted mt-1">{desc}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
