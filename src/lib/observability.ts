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
  context?: Record<string, unknown>;
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
export function captureException(error: unknown, context?: ObservabilityContext): void {
  const norm = normalizeError(error);
  emit({
    timestamp: new Date().toISOString(),
    level: 'error',
    kind: 'exception',
    message: norm.message,
    name: norm.name,
    stack: norm.stack,
    digest: norm.digest,
    context: context && Object.keys(context).length > 0 ? { ...context } : undefined,
  });
  // When the Sentry hook above is wired, also call:
  //   Sentry.captureException(error, { extra: context });
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
