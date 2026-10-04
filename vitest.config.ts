import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "src/*" so test targets that pull in
    // app modules (e.g. a service importing '@/lib/db') resolve. Existing
    // tests that use relative imports keep working unchanged.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Loads .env so DB-integration tests (tests/security/**) can reach Postgres.
    setupFiles: ['tests/setup.ts'],
    // Root-caused 2026-10-04: with RLS_ENFORCE=1 (.env.test), every bare
    // tenant-model operation is wrapped in its own Prisma $transaction
    // (two extra `SET LOCAL` round-trips + the op itself —
    // src/lib/db/rls-transaction.ts) before it ever reaches the staging
    // Supabase pooler. A single such operation routinely costs 2-5s
    // against that pooler's real latency; a test or hook that does two or
    // more of them sequentially (a common setup shape — create an org,
    // then a project, then a few child rows) easily exceeds vitest's
    // un-configured 5000ms/10000ms defaults. Those defaults predate
    // RLS_ENFORCE being turned on (Phase C, v1.9.0) and were never
    // revisited after. The result was never a real failure: every one of
    // a consistent ~64-test, 14-file "flaky" set turned out to be a
    // `Test timed out` / `Hook timed out` error, not a failed assertion —
    // confirmed by rerunning the worst offender (tests/org-scope.test.ts)
    // with a generous timeout and getting a clean pass, tenant-isolation
    // assertions included. 20s comfortably covers every observed case
    // (worst seen: ~9.5s) with real margin, and costs the hundreds of
    // fast pure-unit tests nothing — it only raises the ceiling a slow
    // test is judged against, not how long a fast one takes.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Stamp each run's result to a gitignored file the Ops Console's
    // Platform Pulse reads — automated test-status ingestion, no manual entry.
    reporters: [
      'default',
      ['json', { outputFile: './.a2r/vitest-result.json' }],
    ],
  },
});
