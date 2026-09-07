import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { assertNonProductionTestDb } from './tests/helpers/db-target';

/**
 * Phase 1 — Automated Testing & RTM.
 *
 * Targets a locally running dev server on http://localhost:3000. If one is
 * already up (the usual case during development) Playwright reuses it;
 * otherwise it boots `npm run dev` and waits for it.
 *
 * WP2 — this config file loads at the top of the Playwright process, before
 * any worker or the dev server is spawned, so pinning the DB URL here is
 * inherited everywhere: the webServer child, every worker, and each spec's
 * own `PrismaClient`. The suites mutate data — a production URL aborts.
 */
{
  const loadEnvFile = (file: string): void => {
    try {
      for (const line of readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
      }
    } catch {
      /* absent */
    }
  };
  loadEnvFile('.env.test');
  loadEnvFile('.env');
  const url = assertNonProductionTestDb('playwright');
  process.env.DATABASE_URL = url;
  const testDirect =
    process.env.TEST_DIRECT_URL ||
    (() => {
      try {
        for (const line of readFileSync(join(process.cwd(), '.env.test'), 'utf8').split(/\r?\n/)) {
          const m = line.match(/^\s*DIRECT_URL\s*=\s*(.*)\s*$/);
          if (m && m[1] !== undefined) return m[1].replace(/^["']|["']$/g, '');
        }
      } catch {
        /* absent */
      }
      return undefined;
    })();
  if (testDirect) process.env.DIRECT_URL = testDirect;

  // Batch 2 — the suite legitimately elevates the same seeded operator from
  // independent tests inside one 30 s TOTP window; disable ONLY the
  // anti-replay high-water check for the dev server (the code is still
  // verified). Ignored when NODE_ENV=production. global-setup seeds the
  // operators' `operator_mfa` rows.
  process.env.OPS_MFA_ALLOW_REPLAY = '1';
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
