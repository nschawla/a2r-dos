/**
 * P1 — server-only site routing mode.
 *
 * Replaces the client-exposed, build-baked `NEXT_PUBLIC_COMING_SOON`. The
 * routing decision for the site root (`/`) now lives entirely in
 * src/middleware.ts (Edge, evaluated per request), reading the server-only
 * `A2R_SITE_MODE` env var — never shipped to the browser, never inlined
 * into the build artifact.
 *
 * Dependency-free ESM so it is importable by next.config.mjs (build-time
 * strictness) and the Edge middleware alike. `.d.mts` sibling carries the
 * TS types. Unit-tested by tests/site-mode.test.ts.
 *
 * Modes:
 *   marketing  → `/` serves the public early-access page (cacheable).
 *                THE FAIL-CLOSED DEFAULT.
 *   internal   → `/` forwards anonymous visitors to `/launch` (the full
 *                app is the front door — internal / preview deployments).
 *   live       → `/` forwards anonymous visitors to `/login` (the product
 *                is launched; the root is just the sign-in entry).
 *
 * A signed-in visitor is always forwarded to `/launch` regardless of mode.
 */

/** @type {readonly ['marketing', 'internal', 'live']} */
export const SITE_MODES = ['marketing', 'internal', 'live'];

/**
 * Strict parse. Whitespace and letter-case are tolerated; anything else —
 * missing, misspelled, an unknown value — falls back to `marketing`.
 * An unknown value is NEVER interpreted as `internal` or `live`.
 *
 * @param {string | undefined | null} raw
 * @returns {{ mode: 'marketing' | 'internal' | 'live', raw: string | undefined, fellBack: boolean }}
 */
export function parseSiteMode(raw) {
  const value = typeof raw === 'string' ? raw : undefined;
  const normalized = (value ?? '').trim().toLowerCase();
  if (SITE_MODES.includes(normalized)) {
    return { mode: /** @type {'marketing' | 'internal' | 'live'} */ (normalized), raw: value, fellBack: false };
  }
  return { mode: 'marketing', raw: value, fellBack: true };
}

/**
 * The `/` routing decision. Pure.
 *
 * @param {'marketing' | 'internal' | 'live'} mode
 * @param {boolean} isAuthenticated
 * @returns {{ kind: 'marketing' } | { kind: 'redirect', to: string }}
 */
export function resolveRootRoute(mode, isAuthenticated) {
  if (isAuthenticated) return { kind: 'redirect', to: '/launch' };
  switch (mode) {
    case 'internal':
      return { kind: 'redirect', to: '/launch' };
    case 'live':
      return { kind: 'redirect', to: '/login' };
    case 'marketing':
    default:
      return { kind: 'marketing' };
  }
}

/**
 * Build-time strictness for next.config.mjs. A Vercel PRODUCTION build MUST
 * declare a valid A2R_SITE_MODE — a missing / misspelled value there fails
 * the deployment rather than silently guessing. Non-production builds
 * (local, preview, CI) fall back to `marketing` at runtime instead.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null} an error message when the build must fail, else null
 */
export function siteModeBuildError(env) {
  const isVercelProduction = (env.VERCEL_ENV || '').trim().toLowerCase() === 'production';
  if (!isVercelProduction) return null;

  const { fellBack, raw } = parseSiteMode(env.A2R_SITE_MODE);
  if (!fellBack) return null;

  return (
    `A2R_SITE_MODE is ${raw === undefined ? 'not set' : `"${raw}"`} on a Vercel *production* ` +
    `build. It must be exactly one of: ${SITE_MODES.join(' | ')}.\n` +
    `Set it in the Vercel dashboard → Project → Settings → Environment Variables, scoped to ` +
    `Production. For the pre-launch marketing page use "marketing".`
  );
}
