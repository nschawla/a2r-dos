/**
 * Secure Data Ingestion API Bridge — request auth wrapper.
 *
 * `withApiAuth(handler)` extracts the `Authorization: Bearer <key>` header,
 * validates it against the tenant-scoped API Key Service
 * (src/lib/ops/api-keys.ts), and hands the handler an `ApiAuthContext`
 * carrying the authenticated `tenantId`. Missing / malformed tokens get a
 * 401; revoked / expired / suspended-tenant keys get a 403.
 *
 * SEC-1 (GA-readiness audit) — once a key is known-good, the request is
 * rate-limited per API key (default 60/min) before the handler runs;
 * over-limit callers get a 429 with `Retry-After`.
 *
 * Routes under /api/v1/* are excluded from the session middleware
 * (src/middleware.ts) — they authenticate by API key, not a cookie.
 */
import { NextResponse } from 'next/server';
import { validateApiKey, type ValidatedApiKey } from '@/lib/ops/api-keys';
import { hit, tooManyRequestsResponse, type RateLimitRule } from '@/lib/rate-limiter';
import { captureException, captureMessage } from '@/lib/observability';

export interface ApiAuthContext {
  /** The tenant every write in this request is locked to. */
  tenantId: string;
  apiKey: ValidatedApiKey;
}

type ApiRouteHandler = (request: Request, ctx: ApiAuthContext) => Promise<Response> | Response;

interface WithApiAuthOptions {
  /** Per-API-key sliding-window limit. Defaults to 60 requests / minute. */
  rateLimit?: RateLimitRule;
}

const DEFAULT_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export function withApiAuth(handler: ApiRouteHandler, options: WithApiAuthOptions = {}) {
  const rule = options.rateLimit ?? DEFAULT_RATE_LIMIT;

  return async (request: Request): Promise<Response> => {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Missing bearer token. Send `Authorization: Bearer <api key>`.' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="A2R Ingestion API"' } }
      );
    }

    const result = await validateApiKey(token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const rl = hit(`api:v1:${result.key.apiKeyId}`, rule);
    if (!rl.ok) {
      captureMessage('API ingestion rate limit exceeded', {
        scope: 'api/v1',
        apiKeyId: result.key.apiKeyId,
        tenantId: result.key.tenantId,
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return tooManyRequestsResponse(
        rl,
        `Rate limit exceeded for this API key (${rule.limit} requests/minute). Retry in ${rl.retryAfterSeconds}s.`
      );
    }

    try {
      return await handler(request, { tenantId: result.key.tenantId, apiKey: result.key });
    } catch (err) {
      captureException(err, {
        scope: 'api/v1',
        apiKeyId: result.key.apiKeyId,
        tenantId: result.key.tenantId,
      });
      return NextResponse.json({ error: 'Internal error processing the request.' }, { status: 500 });
    }
  };
}
