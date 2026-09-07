import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNonProductionTestDb } from '../tests/helpers/db-target';

/**
 * WP2 — the Playwright suite provisions and purges tenants and creates /
 * deletes rows through the running dev server. Refuse to start if that
 * server's database is production, and pin the dev server (spawned next by
 * Playwright's `webServer`) to the resolved TEST database — Next.js `dev`
 * only loads `.env` / `.env.local`, not `.env.test`, so we push the value
 * into `process.env` here where the webServer child inherits it.
 *
 * Resolution order:  TEST_DATABASE_URL → .env.test → .env
 */
function loadEnvFile(file: string): void {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
}

export default async function globalSetup(): Promise<void> {
  // `.env.test` wins over `.env` (first-write-wins above).
  loadEnvFile('.env.test');
  loadEnvFile('.env');

  const url = assertNonProductionTestDb('playwright');

  // Pin the dev server to the test DB regardless of what `.env` holds.
  process.env.DATABASE_URL = url;
  const testDirect = process.env.TEST_DIRECT_URL || readVar('.env.test', 'DIRECT_URL');
  if (testDirect) process.env.DIRECT_URL = testDirect;

  // eslint-disable-next-line no-console
  console.log(`[e2e] target DB pinned to non-production (${url.replace(/:[^:@/]+@/, ':****@')})`);
}

function readVar(file: string, key: string): string | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`));
      if (m && m[1] !== undefined) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
  return undefined;
}
