/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Developer Documentation — the in-app engineering reference for A2R DOS,
 * rendered at /ops/dev-docs behind the A2R-staff gate (requireOpsContext).
 * No tenant can reach it.
 *
 * This page CONSOLIDATES the repo's canonical docs (README.md, CHANGELOG.md,
 * docs/*.md) into one screen and pins the live build/release data — it does
 * not replace those files. When something here disagrees with the repo, the
 * repo wins; fix it there and re-summarize here.
 *
 * It holds NO secret values. The "Environment & credentials" section is a
 * reference to variable names, what issues them, and how to rotate them —
 * real values live in the deployment platform's env store / a vault.
 *
 * Presentational server component: all data comes in as props.
 */
import type { ReactNode } from 'react';
import type { BuildInfo } from '@/lib/build-info';
import { CHANGE_TYPE_META, type ReleaseNote } from '@/lib/changelog';

// ─────────────────────────────────────────────────────────────────────────
// Content — hand-authored, sourced from README.md / docs/*.md / the schema.
// Keep entries terse; link to the canonical file rather than restating it.
// ─────────────────────────────────────────────────────────────────────────

interface Subsystem {
  area: string;
  entryPoints: string[];
  note: string;
}

const SUBSYSTEMS: Subsystem[] = [
  {
    area: 'Auth & session',
    entryPoints: ['src/lib/session.ts', 'src/lib/ops-auth.ts', 'src/lib/auth/rbac.ts'],
    note: 'Three independent authorization axes — see the table below. NextAuth JWT sessions; the jwt callback refreshes memberships / staff-grant status / mustChangePassword from the DB every request.',
  },
  {
    area: 'Forced password change',
    entryPoints: ['src/lib/auth/password-rotation.ts', 'src/lib/auth/password-policy.ts', 'src/app/(auth)/change-password/', 'src/server/actions/auth.ts (changePasswordAction)'],
    note: 'User.mustChangePassword (set by provisionTenantAction). Enforced deeply server-side (P0 #3): every Server Action / Route Handler auth path rejects the session with 403 PASSWORD_CHANGE_REQUIRED — middleware only adds the page redirect. changePasswordAction is atomic: clears the flag, stamps User.passwordChangedAt (the jwt callback then revokes every token issued before that instant → all other devices logged out), deletes adapter Sessions, and mints one fresh session. Policy: ≥12, upper+lower+digit.',
  },
  {
    area: 'Multi-tenancy & scoping',
    entryPoints: ['src/lib/db/scoped-portfolio.ts', 'src/lib/scoping.ts'],
    note: 'Every tenant model carries organizationId (row-level isolation). scoping.ts adds practice/report/assignment-level row scoping for Practice Directors and below.',
  },
  {
    area: 'Database access control (RLS)',
    entryPoints: ['prisma/migrations/00000000000007_rls_lockdown/migration.sql'],
    note: 'RLS is ENABLEd (not FORCEd) on every public table with no policies — deny-all for any role except the Prisma-owned BYPASSRLS role. Web-exposed anon/authenticated roles have all grants revoked. Closes the Supabase Security Advisor "RLS disabled" finding; the app is a pure Prisma client (no @supabase/*), so nothing in it is affected.',
  },
  {
    area: 'RBAC Master Matrix',
    entryPoints: ['src/lib/governance/rbacMatrix.ts', 'src/middleware.ts'],
    note: '5 personas → allowed sidebar groups / module pills / route prefixes. Unauthorized items are omitted from render; middleware is an edge route guard (defence in depth, not the authoritative gate).',
  },
  {
    area: 'Enterprise governance',
    entryPoints: ['src/lib/governance/'],
    note: 'Hybrid Configuration Model: a compliance template (Standard / Strict Financial / Agile / Board-Only) plus Layer-2 overrides for route visibility and financial masking. Rides on the request context.',
  },
  {
    area: 'Identity federation',
    entryPoints: ['src/lib/identity/', '/ops/identity'],
    note: 'Per-tenant SAML 2.0 / OIDC. Metadata verify + pin, JIT provisioning, security-group → role mapping. OIDC client secrets AES-256-GCM encrypted at rest (key derived from NEXTAUTH_SECRET).',
  },
  {
    area: 'Compliance ledger',
    entryPoints: ['src/lib/audit-ledger.ts', '/admin/audit-log'],
    note: 'Hash-chained ImmutableAuditLedger. recordLedgerEvent / verifyLedgerIntegrity. Highest-consequence actions only (tenant lifecycle, SSO config, batch-import commits, governance changes).',
  },
  {
    area: 'Calculation engine',
    entryPoints: ['src/lib/calculations/', 'src/server/queries/calc-adapters.ts'],
    note: 'Pure sizing / EAC / project-health logic — no Prisma, no React. Server adapters map Prisma rows into its plain inputs.',
  },
  {
    area: 'Capacity & concurrency',
    entryPoints: ['src/lib/capacity-engine.ts'],
    note: 'WeeklyAssignmentSlot is the weekly capacity/actual grain. Utilization, concurrency radar, 52-week forecast, holiday & role-utilization policy inputs.',
  },
  {
    area: '4-pillar batch ingestion',
    entryPoints: ['src/lib/ingestion/batch-schemas.ts', 'src/server/actions/data-import.ts'],
    note: 'Weekly Actuals · Milestone & Progress · Forecast & EAC · Status Reports & RAID Log. One stage → quarantine → correct → commit pipeline; commit is all-or-nothing and ledgered. Adding a pillar = 4 changes in a fixed order (see the file header).',
  },
  {
    area: 'AI document parser',
    entryPoints: [
      'src/lib/ai-parser.ts',
      'src/app/api/parse-document/route.ts',
      'src/components/ingestion/AiDocumentParser.tsx',
    ],
    note: 'Claude turns pasted status/RAID text into STATUS_RAID rows that feed the batch flow. Forced tool call + zod validation. Needs ANTHROPIC_API_KEY; returns 503 without it. Writes nothing itself.',
  },
  {
    area: 'Custom KPI engine',
    entryPoints: ['src/types/kpi.ts', 'src/lib/kpi-engine.ts', '/admin/kpis'],
    note: 'Curated metric bindings (not a formula language) → live cards on the Control Tower and Executive Hub, per target persona. Gated CRUD; deliberately ungated display read.',
  },
  {
    area: 'Data Ingestion API Bridge',
    entryPoints: ['src/lib/api-auth.ts', 'src/app/api/v1/'],
    note: 'Bearer-token, server-to-server only (no CORS). Tenant-scoped ApiKey service; withApiAuth wrapper adds validation + per-key rate limiting.',
  },
  {
    area: 'Version governance',
    entryPoints: ['src/lib/build-info.ts', 'src/lib/changelog.ts'],
    note: 'Build stamp + release notes. CHANGELOG.md mirrors changelog.ts (the .ts is authoritative). tests/changelog.test.ts enforces CHANGELOG[0].version === package.json version.',
  },
  {
    area: 'Observability & rate limiting',
    entryPoints: ['src/lib/observability.ts', 'src/lib/rate-limiter.ts'],
    note: 'captureException / captureMessage emit structured JSON today; Sentry integration hook is marked and reserved. Rate limiter is an in-process sliding window.',
  },
  {
    area: 'Auto Demo',
    entryPoints: ['src/lib/demo/demo-script.ts', 'src/components/demo/'],
    note: '11-beat hands-free cinematic tour with spotlight highlights and 150–180 wpm captions. docs/AUTO_DEMO_SCRIPT.md is the synced production/voiceover reference.',
  },
  {
    area: 'Public "Coming Soon" page',
    entryPoints: ['src/app/page.tsx', 'src/components/marketing/', 'src/server/actions/early-access.ts'],
    note: 'Dark early-access landing at /. NEXT_PUBLIC_COMING_SOON gates it — ON by default; a falsy value (preview deploys) makes / forward to /launch instead. Sneak Peek modal (React portal, past the backdrop-blur header). submitEarlyAccessLead is public + unauthenticated — Zod + honeypot + per-IP rate limit, structured-log-only (no persistence yet, same pattern as the support-ticket action).',
  },
];

interface AuthAxis {
  axis: string;
  values: string;
  enforces: string;
}

const AUTH_AXES: AuthAxis[] = [
  {
    axis: 'Console tier — MembershipRole',
    values: 'OWNER · ADMIN · MEMBER · VIEWER',
    enforces: 'Tenant-console capabilities via hasPermission (admin:* actions).',
  },
  {
    axis: 'Delivery RBAC — DeliveryAccessRole',
    values: 'VP_EXECUTIVE · PRACTICE_DIRECTOR · DELIVERY_MANAGER · PROJECT_MANAGER · (+ ADMIN)',
    enforces:
      'canEditProject edit authority · rbacMatrix nav/route allow-list · scoping.ts row visibility. Three different questions, one role.',
  },
  {
    axis: 'A2R staff — staff_grants entitlement',
    values: 'explicit un-revoked staff_grants row (granted at /ops/staff)',
    enforces: 'The Ops Console (/ops/*) only. No relationship to any tenant membership, and no email-domain shortcut. requireOpsContext re-checks the grant table live on every render / action.',
  },
];

interface SetupStep {
  cmd: string;
  note: string;
}

const SETUP_STEPS: SetupStep[] = [
  { cmd: 'npm install', note: 'Node 20 LTS or later.' },
  {
    cmd: 'cp .env.example .env',
    note: 'Fill DATABASE_URL / DIRECT_URL / NEXTAUTH_URL; set NEXTAUTH_SECRET with `openssl rand -base64 32`.',
  },
  {
    cmd: 'npx prisma db push --skip-generate && npx prisma generate',
    note: 'Applies prisma/schema.prisma to the database. This project does NOT use `prisma migrate` — schema changes are: edit schema.prisma → db push → generate.',
  },
  { cmd: 'npm run db:seed', note: 'Idempotent — safe to re-run. Seeds the A2R DOS Demo + Acme Health tenants and per-role logins.' },
  { cmd: 'npm run dev', note: '→ http://localhost:3000' },
];

const VERIFY_GATE = ['npx tsc --noEmit', 'npx vitest run', 'npx playwright test'];

interface EnvVar {
  name: string;
  required: 'required' | 'optional' | 'build-time';
  purpose: string;
  source: string;
  rotation: string;
}

const ENV_VARS: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    required: 'required',
    purpose:
      'Prisma runtime queries. On serverless (Vercel) this MUST be the connection pooler — Supabase\'s direct host db.<ref>.supabase.co is IPv6-only and Vercel has no IPv6 egress, so a direct URL fails every query there. TLS required in production (sslmode; db.ts warns if missing).',
    source: 'Supabase dashboard → Project Settings → Database → Connection string → "Transaction pooler" (port 6543, +pgbouncer=true&connection_limit=1).',
    rotation: 'Rotate the DB password in the provider console, update both URLs, redeploy.',
  },
  {
    name: 'DIRECT_URL',
    required: 'required',
    purpose:
      'A real Postgres session for `prisma db push` / `prisma migrate` only (these cannot run through a transaction-mode pooler). Wired via datasource.directUrl in schema.prisma; falls back to DATABASE_URL when unset.',
    source: 'Supabase "Session pooler" (port 5432 on the pooler host) or the direct connection where the migration runner has IPv4 to it.',
    rotation: 'As DATABASE_URL.',
  },
  {
    name: 'NEXTAUTH_SECRET',
    required: 'required',
    purpose:
      'Signs NextAuth session JWTs, AND is the key-derivation input for the AES-256-GCM encryption of stored OIDC client secrets (SECURITY.md §8).',
    source: '`openssl rand -base64 32`',
    rotation:
      'Rotating invalidates every active session and makes already-encrypted IdP client secrets undecryptable — each tenant must re-enter its SSO secret afterward. Rotate deliberately.',
  },
  {
    name: 'NEXTAUTH_URL',
    required: 'required',
    purpose: 'Canonical origin for auth callbacks.',
    source: 'The deployment URL.',
    rotation: 'Update on any domain change.',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: 'optional',
    purpose: 'The AI document parser (src/lib/ai-parser.ts, POST /api/parse-document). Absent → the endpoint returns a clean 503.',
    source: 'Anthropic Console — console.anthropic.com.',
    rotation: 'Create a new key in the console, swap the value, revoke the old key.',
  },
  {
    name: 'RETENTION_API_TOKEN',
    required: 'optional',
    purpose:
      'Shared secret for POST /api/internal/retention (header x-a2r-internal-token) so a cron scheduler can trigger the retention sweep. Unset → the endpoint accepts only an authenticated A2R-staff session.',
    source: 'Generate a random string.',
    rotation: 'Set the new value in the env and the scheduler config together.',
  },
  {
    name: 'RETENTION_*_DAYS',
    required: 'optional',
    purpose:
      'Override retention windows: ACTIVITY_LOG (730) · AUDIT_LOG (2555) · IMPERSONATION_GRANT (545) · API_KEY (365). The immutable ledger is never swept.',
    source: 'Defaults are in .env.example.',
    rotation: 'n/a.',
  },
  {
    name: 'NEXT_PUBLIC_COMING_SOON',
    required: 'optional',
    purpose:
      'Gates the site root (src/app/page.tsx). ON by default → `/` is the public early-access page. Set to 0 / false / off / no on a deploy that should present the full app instead (preview deployments) → `/` forwards to /launch.',
    source: 'Set per Vercel environment. Production leaves it unset (or =1); the preview branch sets it =0.',
    rotation: 'n/a.',
  },
  {
    name: 'PRODUCTION_SUPABASE_PROJECT_REF · PRODUCTION_DB_HOST · ALLOW_PROD_DB_OUTSIDE_PROD',
    required: 'optional',
    purpose:
      'P0 #4 preview/prod isolation guardrail (src/lib/config/env-isolation-core.mjs). A Vercel Preview/Development deployment wired to the production DB hard-fails the build (next.config.mjs), server boot (instrumentation.ts) and the Prisma client (db.ts). Production ref is baked in; these only override it. ALLOW_PROD_DB_OUTSIDE_PROD is a local-only escape hatch — never set it in Vercel. See docs/PREVIEW_ENVIRONMENT_ISOLATION.md.',
    source: 'Only if the production database is migrated. Preview/Prod DATABASE_URL/DIRECT_URL must be scoped per environment in Vercel.',
    rotation: 'n/a.',
  },
  {
    name: 'NEXT_PUBLIC_APP_VERSION · _BUILD_SHA · _BUILD_TIME',
    required: 'build-time',
    purpose: 'Feed the Ops build stamp (src/lib/build-info.ts). Normally injected by next.config.mjs from package.json + CI vars.',
    source: 'CI: VERCEL_GIT_COMMIT_SHA / GITHUB_SHA / GIT_COMMIT_SHA / SOURCE_COMMIT.',
    rotation: 'n/a — derived at build time.',
  },
  {
    name: 'SENTRY_DSN · NEXT_PUBLIC_SENTRY_DSN',
    required: 'optional',
    purpose: 'Reserved — the observability.ts Sentry hook is marked but not yet wired. Setting these does nothing today.',
    source: 'Sentry project settings (when adopted).',
    rotation: 'n/a.',
  },
];

interface CanonicalDoc {
  path: string;
  covers: string;
}

const CANONICAL_DOCS: CanonicalDoc[] = [
  { path: 'README.md', covers: 'Per-phase FRD + RTM traceability tables, local setup, work-package history, "What’s next".' },
  { path: 'CHANGELOG.md ↔ src/lib/changelog.ts', covers: 'Release notes. The .ts file is authoritative; the .md mirrors it. Keep them in sync when cutting a release.' },
  { path: 'docs/SECURITY.md', covers: 'Security architecture, the three RBAC axes + masking + scoping, compliance posture, current test counts.' },
  { path: 'docs/ERD.md', covers: 'Prisma schema map — Mermaid ER diagram + domain notes. Regenerate when a model is added / removed / re-related.' },
  { path: 'docs/USER_MANUAL.md', covers: 'End-user / operator guide for the tenant workspace.' },
  { path: 'docs/UAT_TEST_RUNBOOK.md', covers: 'Human-executable UAT scenarios (per module) + a summary of automated coverage.' },
  { path: 'docs/ADMIN_ONBOARDING.md', covers: 'Tenant-admin first-run setup (workspace profile, rate card, team, baseline).' },
  { path: 'docs/AUTO_DEMO_SCRIPT.md', covers: 'Auto Demo voiceover script + production cue sheet. Synced to src/lib/demo/demo-script.ts.' },
];

const SYNC_CONVENTIONS = [
  'src/lib/changelog.ts ↔ CHANGELOG.md — update both in the same commit; a version bump touches package.json + changelog.ts together (test-enforced).',
  'src/lib/demo/demo-script.ts ↔ docs/AUTO_DEMO_SCRIPT.md — any caption or durationMs change updates the doc in the same commit.',
  'prisma/schema.prisma → docs/ERD.md — a model add / remove / re-relate updates the ERD.',
  'A shipped feature updates README.md (FRD/RTM), docs/SECURITY.md (posture + counts), and this page.',
];

// ─────────────────────────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 flex flex-col gap-4">
      <h2 className="text-lg font-display font-bold text-ink border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[12px] bg-surface-2 border border-border-soft rounded px-1.5 py-0.5 text-ink">
      {children}
    </code>
  );
}

const REQ_BADGE: Record<EnvVar['required'], string> = {
  required: 'bg-critical-soft text-critical',
  optional: 'bg-surface-2 text-ink-faint',
  'build-time': 'bg-warning-soft text-warning',
};

export function DevDocs({ build, releases }: { build: BuildInfo; releases: ReleaseNote[] }) {
  const canonicalVersion = releases[0]?.version ?? build.version;
  const stampIsDev = build.version === '0.0.0-dev';

  const toc = [
    ['build', 'Build & release'],
    ['architecture', 'Architecture'],
    ['setup', 'Local setup'],
    ['credentials', 'Environment & credentials'],
    ['canonical', 'Canonical docs'],
  ] as const;

  return (
    <>
      <div>
        <h1 className="text-2xl font-display font-bold">Developer Documentation</h1>
        <p className="text-ink-muted text-sm mt-1 max-w-3xl">
          The in-app engineering reference for A2R Delivery OS — build summary, architecture notes, and
          setup guidelines in one place. A2R staff only; no tenant can reach this page. It{' '}
          <span className="font-medium">consolidates</span> the repo docs listed at the bottom — it does not
          replace them. When this page and the repo disagree, the repo wins.
        </p>
      </div>

      <nav className="card !p-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        <span className="text-ink-faint font-semibold uppercase tracking-wide text-[10.5px] self-center">
          On this page
        </span>
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-brand hover:underline font-medium">
            {label}
          </a>
        ))}
      </nav>

      {/* ── Build & release ─────────────────────────────────────────────── */}
      <Section id="build" title="Build & release">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card !p-4">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">App version</div>
            <div className="font-mono text-xl font-semibold text-ink mt-1">v{canonicalVersion}</div>
            <div className="text-[11px] text-ink-faint mt-1">package.json · CHANGELOG[0] (test-enforced equal)</div>
          </div>
          <div className="card !p-4">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">Build stamp</div>
            <div className="font-mono text-[13px] text-ink mt-1 break-all">{build.fullStamp}</div>
            <div className="text-[11px] text-ink-faint mt-1">src/lib/build-info.ts (from CI-injected env)</div>
          </div>
          <div className="card !p-4">
            <div className="text-[10.5px] uppercase tracking-wide text-ink-faint font-semibold">Commit</div>
            <div className="font-mono text-[13px] text-ink mt-1">{build.commit ?? '—'}</div>
            <div className="text-[11px] text-ink-faint mt-1">
              {build.buildTime ? new Date(build.buildTime).toISOString().slice(0, 10) : 'local dev — no build time'}
            </div>
          </div>
        </div>

        {stampIsDev && (
          <p className="text-[12px] text-warning">
            Build stamp reads <Code>0.0.0-dev</Code> — the <Code>NEXT_PUBLIC_*</Code> injection in{' '}
            <Code>next.config.mjs</Code> is not currently wired, so <Code>BUILD_INFO</Code> has no CI values to
            read. The canonical version above (from <Code>package.json</Code> / <Code>changelog.ts</Code>) is
            unaffected.
          </p>
        )}

        <h3 className="text-[13px] font-semibold text-ink-muted mt-2">Release history</h3>
        <div className="flex flex-col gap-4">
          {releases.map((r) => (
            <div key={r.version} className="card !p-4">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-mono text-[15px] font-semibold text-ink">v{r.version}</span>
                <span className="text-[11px] text-ink-faint font-mono">{r.date}</span>
              </div>
              <p className="text-[12.5px] text-ink-muted italic mt-1">{r.headline}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {r.changes.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-ink-muted">
                    <span
                      className={`badge !py-0.5 !px-2 !text-[10px] flex-none self-start ${CHANGE_TYPE_META[c.type].badgeClass}`}
                    >
                      {CHANGE_TYPE_META[c.type].label}
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Architecture ───────────────────────────────────────────────── */}
      <Section id="architecture" title="Architecture">
        <div className="card !p-4 text-[12.5px] text-ink-muted flex flex-col gap-1.5">
          <p>
            <span className="font-semibold text-ink">Stack.</span> Next.js 14 App Router · TypeScript (strict) ·
            Prisma 5 + PostgreSQL (Supabase) · NextAuth (credentials + per-tenant SAML/OIDC) · Tailwind
            (&ldquo;Executive Clarity&rdquo; light theme) · Vitest + Playwright.
          </p>
          <p>
            <span className="font-semibold text-ink">Route groups.</span> <Code>src/app/(dashboard)</Code> — the
            tenant workspace (the Control Tower is <Code>/portfolio</Code>). <Code>src/app/(admin)</Code> — the
            A2R Ops Console (<Code>/ops/*</Code>), its own chrome and a hard staff gate.{' '}
            <Code>src/app/(public)</Code> — the legal pages <Code>/terms</Code> / <Code>/privacy</Code> (light
            shell). <Code>src/app/(auth)</Code> — login / register. The dark &ldquo;Coming Soon&rdquo; page is{' '}
            <Code>src/app/page.tsx</Code> at the root layout only; all of <Code>/</Code>, <Code>/terms</Code>,{' '}
            <Code>/privacy</Code> are excluded from the middleware auth gate.
          </p>
          <p>
            <span className="font-semibold text-ink">Schema workflow.</span> Edit{' '}
            <Code>prisma/schema.prisma</Code> → <Code>npx prisma db push --skip-generate</Code> →{' '}
            <Code>npx prisma generate</Code>. Never <Code>prisma migrate</Code>.
          </p>
          <p>
            <span className="font-semibold text-ink">Conventions.</span> Server Actions return{' '}
            <Code>{'{ ok: true, ... } | { ok: false, error }'}</Code> unions (not the{' '}
            <Code>ActionResult</Code> generic default). Pure logic lives in <Code>src/lib/*</Code> with no
            React/Prisma import and has a Vitest file. Client mutations go through <Code>useSafeAction</Code>.
          </p>
        </div>

        <h3 className="text-[13px] font-semibold text-ink-muted">Authorization — three independent axes</h3>
        <div className="overflow-x-auto border border-border-soft rounded-sm">
          <table className="w-full text-[12px] min-w-[640px]">
            <thead className="bg-surface-2 text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
              <tr>
                <th className="py-2 px-3">Axis</th>
                <th className="py-2 px-3">Values</th>
                <th className="py-2 px-3">Enforces</th>
              </tr>
            </thead>
            <tbody>
              {AUTH_AXES.map((a) => (
                <tr key={a.axis} className="border-t border-border/60 align-top">
                  <td className="py-2 px-3 font-medium text-ink whitespace-nowrap">{a.axis}</td>
                  <td className="py-2 px-3 font-mono text-ink-faint">{a.values}</td>
                  <td className="py-2 px-3 text-ink-muted">{a.enforces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-[13px] font-semibold text-ink-muted">Subsystem map</h3>
        <div className="overflow-x-auto border border-border-soft rounded-sm">
          <table className="w-full text-[12px] min-w-[720px]">
            <thead className="bg-surface-2 text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
              <tr>
                <th className="py-2 px-3">Area</th>
                <th className="py-2 px-3">Entry points</th>
                <th className="py-2 px-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {SUBSYSTEMS.map((s) => (
                <tr key={s.area} className="border-t border-border/60 align-top">
                  <td className="py-2 px-3 font-medium text-ink whitespace-nowrap">{s.area}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-col gap-0.5">
                      {s.entryPoints.map((e) => (
                        <span key={e} className="font-mono text-[11px] text-ink-faint">
                          {e}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-ink-muted">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Local setup ────────────────────────────────────────────────── */}
      <Section id="setup" title="Local setup">
        <ol className="flex flex-col gap-2.5">
          {SETUP_STEPS.map((s, i) => (
            <li key={s.cmd} className="flex gap-3">
              <span className="flex-none w-5 h-5 rounded-full bg-surface-3 text-ink-faint text-[11px] font-semibold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <div className="font-mono text-[12.5px] text-ink bg-surface-2 border border-border-soft rounded px-2 py-1 inline-block">
                  {s.cmd}
                </div>
                <p className="text-[12px] text-ink-muted mt-1">{s.note}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="card !p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-1.5">
            Verification gate — green before every commit
          </div>
          <div className="flex flex-col gap-1">
            {VERIFY_GATE.map((c) => (
              <div key={c} className="font-mono text-[12px] text-ink">
                <span className="text-ink-faint">$ </span>
                {c}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mt-2">
            The two <Code>tests/security/*</Code> suites and all Playwright suites need a reachable database;
            everything else runs offline.
          </p>
        </div>
      </Section>

      {/* ── Environment & credentials ──────────────────────────────────── */}
      <Section id="credentials" title="Environment & credentials">
        <div className="rounded-sm border border-warning/40 bg-warning-soft px-3 py-2 text-[12px] text-ink-muted">
          <span className="font-semibold text-warning">Reference only — no values.</span> Secrets live in the
          deployment platform&rsquo;s environment store or a vault, never in the repo, a committed file, or this
          page. This table lists what each variable is for and how to rotate it.
        </div>

        <div className="overflow-x-auto border border-border-soft rounded-sm">
          <table className="w-full text-[12px] min-w-[820px]">
            <thead className="bg-surface-2 text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
              <tr>
                <th className="py-2 px-3">Variable</th>
                <th className="py-2 px-3">&nbsp;</th>
                <th className="py-2 px-3">Purpose</th>
                <th className="py-2 px-3">Issued by</th>
                <th className="py-2 px-3">Rotation</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((v) => (
                <tr key={v.name} className="border-t border-border/60 align-top">
                  <td className="py-2 px-3 font-mono text-[11px] text-ink whitespace-nowrap">{v.name}</td>
                  <td className="py-2 px-3">
                    <span className={`badge !py-0.5 !px-2 !text-[10px] ${REQ_BADGE[v.required]}`}>{v.required}</span>
                  </td>
                  <td className="py-2 px-3 text-ink-muted">{v.purpose}</td>
                  <td className="py-2 px-3 text-ink-muted">{v.source}</td>
                  <td className="py-2 px-3 text-ink-muted">{v.rotation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card !p-4 text-[12px] text-ink-muted flex flex-col gap-1.5">
          <p className="font-semibold text-ink">Demo / seed logins</p>
          <p>
            The seeded per-role logins (all <Code>password12345</Code>) and the A2R staff accounts are listed in{' '}
            <Code>docs/UAT_TEST_RUNBOOK.md §1.2</Code>. Those are throwaway demo-tenant credentials — never real
            secrets and not usable against any production data.
          </p>
          <p>
            Rotate <Code>NEXTAUTH_SECRET</Code> last and deliberately (see its row above) — it is coupled to
            stored encrypted IdP secrets, not just sessions.
          </p>
        </div>
      </Section>

      {/* ── Canonical docs ─────────────────────────────────────────────── */}
      <Section id="canonical" title="Canonical docs">
        <p className="text-[12.5px] text-ink-muted">
          These files in the repo are the source of truth this page summarizes. Read them for the full detail.
        </p>
        <div className="overflow-x-auto border border-border-soft rounded-sm">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead className="bg-surface-2 text-left text-ink-faint uppercase tracking-wide text-[10.5px]">
              <tr>
                <th className="py-2 px-3">File</th>
                <th className="py-2 px-3">Covers</th>
              </tr>
            </thead>
            <tbody>
              {CANONICAL_DOCS.map((d) => (
                <tr key={d.path} className="border-t border-border/60 align-top">
                  <td className="py-2 px-3 font-mono text-[11px] text-ink whitespace-nowrap">{d.path}</td>
                  <td className="py-2 px-3 text-ink-muted">{d.covers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-[13px] font-semibold text-ink-muted">Sync conventions</h3>
        <ul className="flex flex-col gap-1.5 text-[12px] text-ink-muted list-disc pl-5">
          {SYNC_CONVENTIONS.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
