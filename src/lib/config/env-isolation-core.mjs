/**
 * P0 #4 — preview / production data-isolation guardrail (pure core).
 *
 * Dependency-free ESM so it can be imported by BOTH:
 *   - next.config.mjs           → hard-fails `next build` / `next dev`
 *   - src/lib/config/environment-isolation.ts → hard-fails at runtime
 *     (server boot via src/instrumentation.ts, and again just before the
 *      Prisma client is created in src/lib/db.ts)
 *
 * The threat: a Vercel Preview / Development deployment configured with the
 * PRODUCTION database credentials. A leaked or brute-forced preview URL
 * would then be an unauthenticated path into real client data.
 *
 * Unit-tested by tests/environment-isolation.test.ts.
 */

/**
 * The production Supabase project ref — the `<ref>` in both
 * `db.<ref>.supabase.co` and the `postgres.<ref>` pooler username. This is
 * NOT a secret: it is the public subdomain of every production connection
 * string. Baked in as the default so the guard works even if the
 * PRODUCTION_SUPABASE_PROJECT_REF env var was never set. Override it (or add
 * PRODUCTION_DB_HOST) if the production database is ever migrated.
 */
export const DEFAULT_PRODUCTION_SUPABASE_REF = 'xoaabhqsbfetffyawayw';

const TRUTHY = /^(1|true|yes|on)$/i;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, warning?: string } | { ok: false, code: string, message: string }}
 */
export function evaluateEnvironmentIsolation(env) {
  const onVercel = TRUTHY.test(env.VERCEL || '') || !!env.VERCEL_URL;
  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();
  const escapeHatch = TRUTHY.test(env.ALLOW_PROD_DB_OUTSIDE_PROD || '');

  const prodRef = (env.PRODUCTION_SUPABASE_PROJECT_REF || DEFAULT_PRODUCTION_SUPABASE_REF)
    .trim()
    .toLowerCase();
  const prodHost = (env.PRODUCTION_DB_HOST || '').trim().toLowerCase();

  const urls = [env.DATABASE_URL, env.DIRECT_URL]
    .filter((u) => typeof u === 'string' && u.length > 0)
    .map((u) => u.toLowerCase());

  const matchesProd = (u) =>
    (prodRef.length > 0 && u.includes(prodRef)) || (prodHost.length > 0 && u.includes(prodHost));
  const pointsAtProductionDb = urls.length > 0 && urls.some(matchesProd);

  // Only Vercel Preview / Development deployments are gated here. Local
  // `next dev` and CI (no VERCEL vars) keep whatever their .env points at,
  // and a Vercel *production* deployment is expected to use production.
  const isProtectedDeployment = onVercel && (vercelEnv === 'preview' || vercelEnv === 'development');

  if (isProtectedDeployment && pointsAtProductionDb) {
    if (escapeHatch) {
      return {
        ok: true,
        warning:
          `ALLOW_PROD_DB_OUTSIDE_PROD is set — a Vercel "${vercelEnv}" deployment is ` +
          `permitted to use the PRODUCTION database. This override must NEVER be set on ` +
          `a shared Vercel environment; use it only for a one-off local build.`,
      };
    }
    return {
      ok: false,
      code: 'PREVIEW_USING_PRODUCTION_DB',
      message:
        `This is a Vercel "${vercelEnv}" deployment, but DATABASE_URL / DIRECT_URL point at ` +
        `the PRODUCTION database (project ref "${prodRef}"${prodHost ? ` / host "${prodHost}"` : ''}).\n` +
        `Preview and Development deployments must use a SEPARATE database — otherwise a ` +
        `leaked preview URL is a backdoor into live client data.\n\n` +
        `Fix: in the Vercel dashboard → Project → Settings → Environment Variables, set ` +
        `Preview-scoped (and Development-scoped) DATABASE_URL / DIRECT_URL pointing at a ` +
        `non-production database, and scope the production values to Production only.\n` +
        `See docs/PREVIEW_ENVIRONMENT_ISOLATION.md.`,
    };
  }

  // Non-fatal: a Vercel *production* deployment not pointed at the known
  // production database. Surfaced, never fatal (don't brick prod on a
  // legitimate database migration).
  if (
    onVercel &&
    vercelEnv === 'production' &&
    urls.length > 0 &&
    !pointsAtProductionDb &&
    (prodRef.length > 0 || prodHost.length > 0)
  ) {
    return {
      ok: true,
      warning:
        `Vercel production deployment's DATABASE_URL does not reference the expected ` +
        `production database ("${prodHost || prodRef}"). If the project was migrated, ` +
        `update PRODUCTION_SUPABASE_PROJECT_REF / PRODUCTION_DB_HOST.`,
    };
  }

  return { ok: true };
}
