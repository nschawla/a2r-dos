'use client';

/**
 * REL-2 (GA-readiness audit) — safe Server Action caller for client
 * components.
 *
 * Server Actions in this app return `{ ok: false, error }` tuples for
 * *expected* domain failures (validation, "already exists", "not
 * authorized") — callers handle those inline as before. What this wrapper
 * adds is the *unexpected* path: a network drop, an unhandled server
 * exception, a 500. Without it, `startTransition(async () => { await
 * action() })` swallows the rejection, the button re-enables, and the
 * user sees nothing.
 *
 *   const run = useSafeAction();
 *   startTransition(async () => {
 *     const outcome = await run(() => provisionTenant(input), { errorTitle: 'Couldn’t provision tenant' });
 *     if (!outcome.ok) return;            // toast already shown + logged
 *     const res = outcome.data;           // the action's own return value
 *     if (!res.ok) { setError(res.error); return; }  // expected failure — inline
 *     …
 *   });
 */

import { useCallback } from 'react';
import { useToast } from '@/components/ui/toast';
import { captureException } from '@/lib/observability';

interface SafeActionOptions {
  /** Toast heading shown when the call throws. */
  errorTitle?: string;
  /** Toast body; a sensible default is used otherwise. */
  errorDescription?: string;
  /** Extra context forwarded to the error tracker. */
  context?: Record<string, unknown>;
}

export type SafeActionOutcome<T> = { ok: true; data: T } | { ok: false; error: unknown };

export function useSafeAction() {
  const { toast } = useToast();

  return useCallback(
    async function run<T>(action: () => Promise<T>, opts: SafeActionOptions = {}): Promise<SafeActionOutcome<T>> {
      try {
        return { ok: true, data: await action() };
      } catch (error) {
        captureException(error, { scope: 'server-action', ...opts.context });
        toast({
          variant: 'error',
          title: opts.errorTitle ?? 'Something went wrong',
          description:
            opts.errorDescription ??
            'The request didn’t complete. Check your connection and try again — nothing was changed.',
        });
        return { ok: false, error };
      }
    },
    [toast]
  );
}
