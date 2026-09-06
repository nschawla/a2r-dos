/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P2 — the centralized server-side error boundary for Server Actions.
 *
 * Every mutation action that returns the `{ ok:true } | { ok:false; error }`
 * contract is wrapped:
 *
 *   export const updateAuditEntry = withAction('updateAuditEntry', async (input) => {
 *     …
 *   });
 *
 * On a thrown error (unhandled bug, DB timeout, connection drop) the wrapper
 *   1. re-throws Next.js control-flow signals (`redirect()` / `notFound()`),
 *   2. maps the auth guard errors onto the codes the client already handles
 *      (`PASSWORD_CHANGE_REQUIRED`, `ELEVATION_REQUIRED`) — no noise log,
 *   3. otherwise emits ONE structured line via `captureException` with the
 *      action name + best-effort actor context (never the input, never a
 *      secret) and returns a safe generic `{ ok:false, error }`.
 *
 * Domain failures (validation, "already exists", "not authorized") are
 * still returned as `{ ok:false, error }` by the action body itself and
 * pass straight through here.
 *
 * Server-only. Node runtime (pulls in `next/headers` + `getServerSession`
 * lazily, inside the catch, and only for telemetry).
 */
import { captureException } from '@/lib/observability';

export const GENERIC_ACTION_ERROR = 'An unexpected error occurred. Please try again.';

/** The shape every wrapped action's return type conforms to. */
export type ActionResultish = { ok: boolean };

/**
 * Next.js throws these as *control flow*, not failures — `redirect()`,
 * `notFound()`, and the static-generation bailout the framework uses to
 * discover a route is dynamic. The wrapper must re-throw them untouched.
 */
export function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'NEXT_NOT_FOUND' ||
    digest === 'DYNAMIC_SERVER_USAGE' ||
    digest === 'BAILOUT_TO_CLIENT_SIDE_RENDERING' ||
    digest.startsWith('NEXT_REDIRECT')
  );
}

/** A guard error already carrying a client-handled code. */
function guardCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'PASSWORD_CHANGE_REQUIRED' || code === 'ELEVATION_REQUIRED' ? code : null;
}

const REDACT_KEY = /pass(word)?|secret|token|authorization|cookie|hash|credential|bearer/i;

/** Defence in depth — scrub anything secret-shaped from a context object
 * before it is logged. We control what we pass, but a nested error's own
 * fields could carry something. */
export function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACT_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactContext(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Best-effort `{ userId, activeOrgId }` for triage. Its own try/catch —
 * telemetry must never be the thing that throws. */
async function actorContext(): Promise<Record<string, unknown>> {
  try {
    const [{ getServerSession }, { authOptions }, { cookies }] = await Promise.all([
      import('next-auth'),
      import('@/lib/auth'),
      import('next/headers'),
    ]);
    const session = await getServerSession(authOptions);
    return {
      userId: session?.user?.id ?? null,
      activeOrgId: (await cookies()).get('a2r_active_org')?.value ?? null,
    };
  } catch {
    return {};
  }
}

/**
 * Wrap a `{ ok }`-returning Server Action. The return type is `Promise<R>`
 * unchanged — the wrapper's own `{ ok:false, error }` fallback is assignable
 * to the failure member of every action's union (which is always
 * `{ ok:false; error:string; …optional }`), so call-site types and their
 * narrowing are entirely unaffected.
 */
export function withAction<A extends unknown[], R extends ActionResultish>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (isNextControlFlow(err)) throw err;

      const code = guardCode(err);
      if (code) return { ok: false, error: code } as unknown as R;

      captureException(err, redactContext({ scope: 'server-action', action: name, ...(await actorContext()) }));
      return { ok: false, error: GENERIC_ACTION_ERROR } as unknown as R;
    }
  };
}
