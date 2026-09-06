/**
 * Next.js instrumentation hook — runs once when a server instance boots
 * (self-hosted `next start`, and every serverless / edge cold start on
 * Vercel), before any request is handled.
 *
 * P0 #4 — re-assert the preview/production data-isolation guardrail here so
 * a deployment that somehow shipped mis-configured (build check bypassed,
 * env changed post-build) refuses to serve traffic. The Prisma client
 * (src/lib/db.ts) runs the same check a third time, right before it opens a
 * connection.
 */
export async function register(): Promise<void> {
  // Node runtime only — the check is env-string-only, but the module it
  // pulls in should not be bundled for the edge.
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { assertEnvironmentIsolation } = await import('@/lib/config/environment-isolation');
  assertEnvironmentIsolation();
}
