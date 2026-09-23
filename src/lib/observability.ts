/**
 * OBS-1 (GA-readiness audit) — centralized error / event reporting.
 *
 * Today this emits one structured JSON line to `console.error` (or
 * `console.warn` for non-error events) with a timestamp and caller
 * context. When a Sentry (or Rollbar / Bugsnag) DSN is provisioned, drop
 * the SDK call in at the marked hook below — every call site in the app
 * already routes through here, so nothing else has to change.
 *
 * Safe to import from both server and client code: it touches only
 * `console` and pure JS. No `next/*`, no node built-ins.
 *
 *   import { captureException } from '@/lib/observability';
 *   try { … } catch (err) { captureException(err, { route: '/api/v1/…' }); }
 */

export type ObservabilityLevel = 'error' | 'warning' | 'info';

export interface ObservabilityContext {
  /** Where the event came from, e.g. 'global-error', 'server-action', 'api/v1/ingest'. */
  scope?: string;
  /** Anything useful for triage — ids, route, tenant, retryAfter, etc. Keep it JSON-serializable. */
  [key: string]: unknown;
}

interface StructuredEvent {
  timestamp: string;
  level: ObservabilityLevel;
  kind: 'exception' | 'message';
  message: string;
  name?: string;
  stack?: string;
  digest?: string;
  /** This event's own correlation id — see generateTraceId(). Distinct
   * from `digest`, which is Next.js's own id for a render-time error
   * caught by an error.tsx boundary; this is the one `captureException`
   * mints for every event (render errors carry both). */
  traceId?: string;
  context?: Record<string, unknown>;
}

/**
 * A short, support-ticket-friendly correlation id — see
 * docs/CLIENT_SUPPORT_RUNBOOK.md for the full convention this backs. Every
 * `captureException` call mints one and logs it in the structured event;
 * `withAction`/`withRouteHandler` also surface it to the caller (in the
 * generic error message / JSON body) so a user can quote it verbatim in a
 * support ticket and Tier 2/3 can `grep` the exact log line back out.
 *
 * `crypto.randomUUID()` is a Web Crypto global — available in every
 * runtime this file needs to run in (browser, Node 19+, the Edge runtime)
 * with no import, keeping this module's "no node built-ins" contract
 * intact. 8 hex chars (32 bits) is short enough to read aloud or paste
 * into a ticket, and collision odds are irrelevant for a "grep the last
 * few minutes of logs for this string" workflow, not a security id.
 */
export function generateTraceId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(-8);
  }
}

/** JSON.stringify that never throws on circular refs / BigInt / functions. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') return `${val}n`;
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return '"[unserializable]"';
  }
}

function normalizeError(error: unknown): { message: string; name?: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Unknown error',
      name: error.name,
      stack: error.stack,
      digest: (error as { digest?: string }).digest,
    };
  }
  if (typeof error === 'string') return { message: error };
  return { message: safeStringify(error) };
}

function emit(event: StructuredEvent): void {
  const line = safeStringify({ source: 'a2r-observability', ...event });
  if (event.level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.warn(line);
  }

  // ── Sentry integration hook ───────────────────────────────────────────
  // When SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set, initialize the SDK in
  // instrumentation.ts + a client config, then forward here:
  //
  //   import * as Sentry from '@sentry/nextjs';
  //   if (event.kind === 'exception') {
  //     Sentry.captureException(originalError, { level: event.level, extra: event.context });
  //   } else {
  //     Sentry.captureMessage(event.message, { level: event.level, extra: event.context });
  //   }
  //
  // (pass the original error object through — see captureException below.)
}

/**
 * Report an unexpected error. Use in every `catch` that isn't a
 * domain-level expected failure (those return `{ ok:false, error }` tuples
 * and don't come here).
 */
export function captureException(error: unknown, context?: ObservabilityContext): string {
  const norm = normalizeError(error);
  const traceId = generateTraceId();
  emit({
    timestamp: new Date().toISOString(),
    level: 'error',
    kind: 'exception',
    message: norm.message,
    name: norm.name,
    stack: norm.stack,
    digest: norm.digest,
    traceId,
    context: context && Object.keys(context).length > 0 ? { ...context } : undefined,
  });
  // When the Sentry hook above is wired, also call:
  //   Sentry.captureException(error, { extra: context, tags: { traceId } });
  return traceId;
}

/**
 * Report a noteworthy non-exception event (e.g. a rate-limit trip, a
 * degraded-but-handled path). Defaults to `warning`.
 */
export function captureMessage(
  message: string,
  context?: ObservabilityContext,
  level: ObservabilityLevel = 'warning'
): void {
  emit({
    timestamp: new Date().toISOString(),
    level,
    kind: 'message',
    message,
    context: context && Object.keys(context).length > 0 ? { ...context } : undefined,
  });
}
