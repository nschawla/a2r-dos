/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P2 — the centralized server-side error boundary for Route Handlers.
 *
 *   export const GET = withRouteHandler('reports/portfolio-csv', async (req, ctx) => {
 *     …
 *     return new NextResponse(csv, { status: 200, headers });
 *   });
 *
 * The handler's own `Response` (any status, including the 4xx it chose for
 * an auth failure or a 404) passes through untouched. Only an *unhandled
 * throw* is caught → one `captureException` line + a generic
 * `500 { error: 'Internal server error.' }` (no stack, no internals to the
 * client). `withApiAuth` (the /api/v1 bridge) has its own equivalent catch
 * and is left alone.
 *
 * Server-only.
 */
import { NextResponse } from 'next/server';
import { captureException } from '@/lib/observability';
import { isNextControlFlow } from '@/lib/observability/action-wrapper';

export function withRouteHandler<Ctx = undefined>(
  name: string,
  handler: (request: Request, ctx: Ctx) => Promise<Response> | Response,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request: Request, ctx: Ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      // redirect() / notFound() / the static-generation bailout — framework
      // control flow, must propagate untouched.
      if (isNextControlFlow(err)) throw err;
      captureException(err, { scope: 'api', route: name });
      return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
  };
}
