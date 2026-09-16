/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Turns a raw fetch failure (an HTTP status, a thrown network error, or an
 * unexpected response shape) into the categorized, human-readable message
 * the Ops Console error log shows — never a raw stack trace. Every adapter
 * (src/lib/integrations/adapters/*.ts) funnels its failures through
 * {@link classifyHttpError} / {@link classifyThrown} so the translation
 * lives in exactly one place instead of being reinvented per provider.
 */
import type { IntegrationErrorCategory, IntegrationProvider } from '@prisma/client';
import { PROVIDER_LABEL } from './registry-labels';

export interface ClassifiedError {
  category: IntegrationErrorCategory;
  humanMessage: string;
}

/** An HTTP response came back, but not a 2xx — classify by status code
 * (and, for 429, an optional `Retry-After` in seconds). */
export function classifyHttpError(
  provider: IntegrationProvider,
  status: number,
  retryAfterSeconds?: number | null,
): ClassifiedError {
  const name = PROVIDER_LABEL[provider];

  if (status === 401 || status === 403) {
    return {
      category: 'AUTH_EXPIRED',
      humanMessage: `${name} API token expired or lacks read scope on the configured project/board. Re-enter a valid token in this connection's settings.`,
    };
  }
  if (status === 429) {
    const wait = retryAfterSeconds && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds / 60) : 15;
    return {
      category: 'RATE_LIMITED',
      humanMessage: `${name} rate limit reached; backing off for ${wait} minute${wait === 1 ? '' : 's'} before the next automatic retry.`,
    };
  }
  if (status >= 500) {
    return {
      category: 'NETWORK_TIMEOUT',
      humanMessage: `${name} returned a server error (HTTP ${status}). This is usually transient — the next scheduled sync will retry automatically.`,
    };
  }
  if (status === 404) {
    return {
      category: 'SCHEMA_MISMATCH',
      humanMessage: `${name} returned "not found" for the configured project/board — check that the key in this connection's settings still exists and the token can see it.`,
    };
  }
  return {
    category: 'UNKNOWN',
    humanMessage: `${name} returned an unexpected HTTP ${status}. Check the connection's raw detail below, or contact support if this persists.`,
  };
}

/** No HTTP response at all — a thrown network error (DNS failure,
 * connection refused, or our own client-side timeout). Node's `fetch`
 * (undici) wraps the actual cause as `TypeError: fetch failed` with the
 * real `ENOTFOUND`/`ECONNREFUSED`/etc. nested in `.cause`, not in the
 * top-level message — check both. */
export function classifyThrown(provider: IntegrationProvider, err: unknown): ClassifiedError {
  const name = PROVIDER_LABEL[provider];
  const topMessage = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : '';
  const message = causeMessage ? `${topMessage}: ${causeMessage}` : topMessage;

  if (/timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return {
      category: 'NETWORK_TIMEOUT',
      humanMessage: `${name} did not respond in time. This is usually a transient network issue — the next scheduled sync will retry automatically.`,
    };
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN/i.test(message)) {
    return {
      category: 'NETWORK_TIMEOUT',
      humanMessage: `Couldn't reach ${name} — the base URL in this connection's settings may be wrong, or ${name} is temporarily unreachable.`,
    };
  }
  return {
    category: 'UNKNOWN',
    humanMessage: `${name} sync failed unexpectedly: ${message.slice(0, 200)}`,
  };
}

/** The response came back 2xx but didn't parse into the shape this
 * adapter's normalizer expects — a provider-side API change, most likely. */
export function classifySchemaMismatch(provider: IntegrationProvider, detail: string): ClassifiedError {
  const name = PROVIDER_LABEL[provider];
  return {
    category: 'SCHEMA_MISMATCH',
    humanMessage: `${name} returned data in a shape PS-DOS didn't expect (${detail}). The provider may have changed its API — this needs an adapter update, not a retry.`,
  };
}

/** The connection has no credential configured yet — not a failure of a
 * real sync attempt, but the adapter still needs a categorized result to
 * return rather than fabricating one. */
export function notConfiguredError(provider: IntegrationProvider): ClassifiedError {
  const name = PROVIDER_LABEL[provider];
  return {
    category: 'AUTH_EXPIRED',
    humanMessage: `No API credential is saved for this ${name} connection yet. Add one in the connection's settings, then Retry Sync.`,
  };
}
