# Site routing model — `A2R_SITE_MODE`

_Status: shipped (P1). Replaces `NEXT_PUBLIC_COMING_SOON`._

## Why it changed

`NEXT_PUBLIC_COMING_SOON` was a **client-exposed, build-baked** flag:
`NEXT_PUBLIC_*` values are inlined into the JavaScript bundle at build
time, so the routing decision was visible in the browser and welded to a
particular build artifact. The audit flagged this — a routing/security
decision must be server-side and evaluated per request.

## The model

One **server-only** env var, `A2R_SITE_MODE`, a strict enum:

| Mode | Anonymous visitor to `/` | Signed-in visitor to `/` |
| --- | --- | --- |
| `marketing` | the public early-access page (cacheable) | → `/launch` |
| `internal` | → `/launch` (the full app is the front door) | → `/launch` |
| `live` | → `/login` (product launched; root is the sign-in entry) | → `/launch` |

The decision is made **entirely in `src/middleware.ts`** (Edge, per
request) via the pure helpers in `src/lib/config/site-mode.mjs`:
`parseSiteMode()` and `resolveRootRoute()`. `src/app/page.tsx` holds no
routing logic — it is a static, CDN-cacheable marketing asset that
middleware only lets an anonymous visitor reach in `marketing` mode.

## Fail-closed

- **Parse**: whitespace and letter-case are tolerated; **anything else** —
  missing, misspelled (`intrnal`), an unknown value (`preview`, `app`, `1`)
  — resolves to `marketing`. An unknown value is **never** interpreted as
  `internal` or `live`. (`src/lib/config/site-mode.mjs` → `parseSiteMode`.)
- **Build**: a Vercel **production** build (`VERCEL_ENV=production`) with no
  valid `A2R_SITE_MODE` **fails outright** — `next.config.mjs` throws
  `🛑 SITE MODE MISCONFIGURED`. Non-production builds (local, preview, CI)
  fall back to `marketing` at runtime instead of failing.
- **Runtime**: middleware always resolves through `parseSiteMode`, so even
  if an invalid value somehow reached a running server, `/` serves the
  marketing page — it never exposes the app.

## Cache posture

| Surface | `Cache-Control` | Set by |
| --- | --- | --- |
| `/` (marketing mode, anonymous) | `public, max-age=0, s-maxage=300, stale-while-revalidate=3600` | `src/middleware.ts` |
| `/` (any redirect) | `no-store, must-revalidate` | `src/middleware.ts` |
| every authenticated route, `/change-password`, matched `/api/*` | `no-store, must-revalidate` | `src/middleware.ts` |
| `/login`, `/register`, `/onboarding` | `no-store, must-revalidate` | `next.config.mjs` `headers()` |
| `/terms`, `/privacy` | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` | `next.config.mjs` `headers()` |

## Vercel setup

**Project → Settings → Environment Variables**, scoped per environment:

| Environment | `A2R_SITE_MODE` |
| --- | --- |
| Production (`main` → www.a2rventures.com) | `marketing` while pre-launch; flip to `live` at GA |
| Preview (`feature/landing-page-preview`, etc.) | `internal` |
| Development | `internal` (or omit — local falls back to `marketing`) |

It is a plain env var — **not** prefixed `NEXT_PUBLIC_`. After changing it,
redeploy (it is read at request time in middleware, but Vercel needs a
redeploy to propagate a var change).

To take the product live: set Production `A2R_SITE_MODE=live` and redeploy.
`/` then sends visitors to `/login`; the marketing page is no longer served
(swap in a real landing page later by adding a `live`-mode branch).
