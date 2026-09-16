/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * The one `fetch` wrapper every adapter (src/lib/integrations/adapters/*.ts)
 * calls through — GET only (see the file-level read-only note in types.ts),
 * a bounded timeout so a hung external API can't stall a sync run
 * indefinitely, and every failure funneled through errors.ts so no adapter
 * hand-rolls its own error-message translation.
 */
import type { IntegrationProvider } from '@prisma/client';
import { classifyHttpError, classifyThrown } from './errors';
import type { AdapterResult } from './types';

const DEFAULT_TIMEOUT_MS = 15000;

export interface HttpGetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** GET `url`, parse the body as JSON, and classify any failure. Never
 * throws — every outcome is an `AdapterResult`. */
export async function getJson<T = unknown>(
  provider: IntegrationProvider,
  url: string,
  opts: HttpGetOptions = {},
): Promise<AdapterResult<{ status: number; body: T; rateLimitRemaining: number | null; rateLimitResetAt: string | null }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...opts.headers },
      signal: controller.signal,
    });
    const rateLimitRemaining = parseIntOrNull(res.headers.get('x-ratelimit-remaining'));
    const retryAfter = parseIntOrNull(res.headers.get('retry-after'));
    const rateLimitResetAt = retryAfter ? new Date(Date.now() + retryAfter * 1000).toISOString() : null;

    if (!res.ok) {
      const { category, humanMessage } = classifyHttpError(provider, res.status, retryAfter);
      const rawDetail = await safeText(res);
      return { ok: false, category, humanMessage, rawDetail: rawDetail.slice(0, 2000) };
    }

    let body: T;
    try {
      body = (await res.json()) as T;
    } catch (e) {
      return {
        ok: false,
        category: 'SCHEMA_MISMATCH',
        humanMessage: `The response body wasn't valid JSON.`,
        rawDetail: String(e).slice(0, 2000),
      };
    }
    return { ok: true, value: { status: res.status, body, rateLimitRemaining, rateLimitResetAt } };
  } catch (err) {
    const { category, humanMessage } = classifyThrown(provider, err);
    return { ok: false, category, humanMessage, rawDetail: err instanceof Error ? err.stack : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST a JSON body and parse a JSON response — for providers whose READ
 * API is transported over POST (GraphQL `query` operations, e.g.
 * Monday.com). Still strictly read-only: the body this sends is always a
 * `query`, never a `mutation` — see the adapter that calls this for the
 * exact query text, which is the actual read/write boundary, not the verb.
 */
export async function postJson<T = unknown>(
  provider: IntegrationProvider,
  url: string,
  jsonBody: unknown,
  opts: HttpGetOptions = {},
): Promise<AdapterResult<{ status: number; body: T; rateLimitRemaining: number | null; rateLimitResetAt: string | null }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...opts.headers },
      body: JSON.stringify(jsonBody),
      signal: controller.signal,
    });
    const rateLimitRemaining = parseIntOrNull(res.headers.get('x-ratelimit-remaining'));
    const retryAfter = parseIntOrNull(res.headers.get('retry-after'));
    const rateLimitResetAt = retryAfter ? new Date(Date.now() + retryAfter * 1000).toISOString() : null;

    if (!res.ok) {
      const { category, humanMessage } = classifyHttpError(provider, res.status, retryAfter);
      const rawDetail = await safeText(res);
      return { ok: false, category, humanMessage, rawDetail: rawDetail.slice(0, 2000) };
    }
    let body: T;
    try {
      body = (await res.json()) as T;
    } catch (e) {
      return {
        ok: false,
        category: 'SCHEMA_MISMATCH',
        humanMessage: `The response body wasn't valid JSON.`,
        rawDetail: String(e).slice(0, 2000),
      };
    }
    return { ok: true, value: { status: res.status, body, rateLimitRemaining, rateLimitResetAt } };
  } catch (err) {
    const { category, humanMessage } = classifyThrown(provider, err);
    return { ok: false, category, humanMessage, rawDetail: err instanceof Error ? err.stack : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function parseIntOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
