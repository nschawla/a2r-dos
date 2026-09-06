/** @type {import('next').NextConfig} */
import { readFileSync } from 'node:fs';
import { evaluateEnvironmentIsolation } from './src/lib/config/env-isolation-core.mjs';

// ── P0 #4 — preview / production data-isolation guardrail ───────────────
// Hard-fail the build if this is a Vercel Preview / Development deployment
// wired to the PRODUCTION database. Runs at `next build` (and `next dev` /
// `next start`) — a mis-scoped preview deploy can't ship. The same check
// runs again at runtime (src/instrumentation.ts + src/lib/db.ts).
// See docs/PREVIEW_ENVIRONMENT_ISOLATION.md.
{
  const verdict = evaluateEnvironmentIsolation(process.env);
  if (!verdict.ok) {
    throw new Error(
      `\n\n🛑 ENVIRONMENT ISOLATION VIOLATION (${verdict.code})\n\n${verdict.message}\n\n` +
        `The build has been stopped on purpose. Fix the Vercel environment-variable ` +
        `scoping and redeploy.\n`,
    );
  }
  if (verdict.warning) {
    console.warn(`\n[env-isolation] ${verdict.warning}\n`);
  }
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
    // P0 #4 — enable src/instrumentation.ts (the env-isolation guardrail
    // also runs there, on server boot). Stable/default in Next 15; opt-in
    // on 14.2.
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
