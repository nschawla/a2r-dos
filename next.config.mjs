/** @type {import('next').NextConfig} */
// Deploy trigger: 2026-09-07T14:20 — fresh build to pick up corrected DATABASE_URL / DIRECT_URL env vars.
import { readFileSync } from 'node:fs';
import { evaluateEnvironmentIsolation } from './src/lib/config/env-isolation-core.mjs';
import { siteModeBuildError } from './src/lib/config/site-mode.mjs';

// ── Build-time config guardrails (env isolation + site mode) ───────────
// These check the Vercel environment-variable *scoping*, not anything in
// the commit. Historically they `throw` — which fails EVERY build for a
// deploy whose env vars are mis-scoped, including unrelated (docs-only)
// commits, in ~12s before `next build` really starts.
//
// On Vercel we now log a loud banner and let the build finish: the SAME
// checks run again at server boot (src/instrumentation.ts) and just before
// the Prisma client is created (src/lib/db.ts), and those FAIL CLOSED — a
// mis-scoped deployment 500s on every request and never serves a byte of
// data. So the isolation / routing guarantees are unchanged; only the
// (redundant) build-time hard-stop is downgraded to a warning there.
// Locally (`next build` / `next dev` with no VERCEL var) the hard `throw`
// stays, for fast feedback. See docs/VERCEL_DEPLOYMENT.md.
const onVercel = !!process.env.VERCEL;

function failOrWarn(banner) {
  if (onVercel) {
    console.error(`${banner}\n[build continues — the runtime guard enforces this fail-closed]\n`);
  } else {
    throw new Error(`${banner}\nThe build has been stopped on purpose.\n`);
  }
}

{
  // P0 #4 — preview / production data-isolation guardrail.
  const verdict = evaluateEnvironmentIsolation(process.env);
  if (!verdict.ok) {
    failOrWarn(`\n\n🛑 ENVIRONMENT ISOLATION VIOLATION (${verdict.code})\n\n${verdict.message}\n`);
  } else if (verdict.warning) {
    console.warn(`\n[env-isolation] ${verdict.warning}\n`);
  }
}

{
  // P1 — server-only site routing mode. A missing / invalid A2R_SITE_MODE
  // on a Vercel *production* build: the middleware falls back to
  // 'marketing' (the fail-closed value — the internal app is never shown),
  // so this is a warning, not a stop.
  const err = siteModeBuildError(process.env);
  if (err) failOrWarn(`\n\n🛑 SITE MODE MISCONFIGURED\n\n${err}\n`);
}

// ── Version & build stamping ────────────────────────────────────────────
// The app version is the single source in package.json; a short commit SHA
// and the build timestamp are picked up from the CI environment when
// present (Vercel / GitHub Actions / generic). All three are exposed as
// NEXT_PUBLIC_* so src/lib/build-info.ts can read them on the client and
// the server without a runtime filesystem read. See the Ops Console footer
// + Release Notes viewer.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const buildSha = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.SOURCE_COMMIT ||
  ''
).slice(0, 7);
const buildTime = new Date().toISOString();

// SEC-2 (GA-readiness audit) — baseline enterprise security headers applied
// to every response. Deliberately the conservative defaults:
//   - X-Frame-Options: DENY + CSP frame-ancestors 'none' — the app (and
//     especially the Ops Console / impersonation controls) must never be
//     iframed. There is no internal embedding use case today; revisit only
//     if one appears.
//   - nosniff, strict-origin-when-cross-origin, and a Permissions-Policy
//     that switches off device APIs the product doesn't use.
// A full Content-Security-Policy (script/style/connect allow-lists) is a
// larger, separate change — this covers the headers a security review
// checks first. HSTS is intentionally left to the platform/CDN layer so it
// isn't emitted on plain-HTTP local dev.
// Documented in docs/SECURITY.md § "HTTP response hardening".
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

// ── P1 — explicit cache posture ────────────────────────────────────────
// src/middleware.ts already stamps `no-store` on every response it handles
// (every authenticated route, /change-password, and the API routes it
// matches) and a cacheable header on the marketing `/`. These rules cover
// the auth-adjacent pages middleware does NOT match, plus the genuinely
// public legal pages.
const NO_STORE = { key: 'Cache-Control', value: 'no-store, must-revalidate' };
const PUBLIC_CACHE = {
  key: 'Cache-Control',
  value: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
};

const nextConfig = {
  reactStrictMode: true,
  // Lint is run as its own CI/pre-commit step (`npm run lint`), not gated on
  // `next build`, so a lint warning never blocks a deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // src/instrumentation.ts runs on every server boot (the P0 #4 env-isolation
  // guardrail). Loaded by default in Next 15 — the old
  // `experimental.instrumentationHook` opt-in was removed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Auth-adjacent pages that the middleware matcher excludes — must
      // never be cached by a browser or a shared proxy.
      { source: '/login', headers: [NO_STORE] },
      { source: '/register', headers: [NO_STORE] },
      { source: '/onboarding', headers: [NO_STORE] },
      // Public legal pages — safe to cache at the edge.
      { source: '/terms', headers: [PUBLIC_CACHE] },
      { source: '/privacy', headers: [PUBLIC_CACHE] },
    ];
  },
};

export default nextConfig;
