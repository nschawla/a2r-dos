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
    // Stamp each run's result to a gitignored file the Ops Console's
    // Platform Pulse reads — automated test-status ingestion, no manual entry.
    reporters: [
      'default',
      ['json', { outputFile: './.a2r/vitest-result.json' }],
    ],
  },
});
