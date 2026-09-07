import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WP2 — test-rig hygiene. The Vitest DB-integration suites and the
 * Playwright suite MUTATE the database (provision + purge tenants, create /
 * delete rows). They must never run against production.
 *
 * DB-URL precedence for a test run:  TEST_DATABASE_URL → .env.test → .env
 */

/** The production Supabase project ref — the public `<ref>` in the pooler
 * host / username. NOT a secret. Canonical copy: `DEFAULT_PRODUCTION_SUPABASE_REF`
 * in `src/lib/config/env-isolation-core.mjs` (P0 #4). */
const DEFAULT_PRODUCTION_SUPABASE_REF = 'xoaabhqsbfetffyawayw';

const PROD_REF = (process.env.PRODUCTION_SUPABASE_PROJECT_REF || DEFAULT_PRODUCTION_SUPABASE_REF)
  .trim()
  .toLowerCase();
const PROD_HOST = (process.env.PRODUCTION_DB_HOST || '').trim().toLowerCase();

/** True when `url` points at the production database (by project ref or host). */
export function isProductionDbUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return (PROD_REF.length > 0 && u.includes(PROD_REF)) || (PROD_HOST.length > 0 && u.includes(PROD_HOST));
}

function fromEnvFile(file: string): string | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m && m[1] !== undefined) return m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent */
  }
  return undefined;
}

/** Resolve the DB URL a test run would use, honouring the precedence above. */
export function resolveTestDatabaseUrl(): string | undefined {
  return (
    process.env.TEST_DATABASE_URL ||
    fromEnvFile('.env.test') ||
    process.env.DATABASE_URL ||
    fromEnvFile('.env')
  );
}

const ALLOW = /^(1|true|yes|on)$/i.test(process.env.A2R_ALLOW_PROD_TESTS || '');

/**
 * Throw unless the resolved test DB is safely non-production. Called from
 * `tests/setup.ts` (Vitest) and `e2e/global-setup.ts` (Playwright).
 */
export function assertNonProductionTestDb(context: 'vitest' | 'playwright'): string {
  const url = resolveTestDatabaseUrl();
  if (!url) {
    throw new Error(
      `[${context}] No database URL resolved. Set TEST_DATABASE_URL, or create .env.test / .env ` +
        `pointing at a staging or local Postgres.`,
    );
  }
  if (isProductionDbUrl(url) && !ALLOW) {
    throw new Error(
      `\n[${context}] REFUSING TO RUN — the resolved database URL points at PRODUCTION ` +
        `(ref "${PROD_REF}"${PROD_HOST ? ` / host "${PROD_HOST}"` : ''}).\n` +
        `These suites mutate data (provision + purge tenants, create / delete rows).\n` +
        `Point TEST_DATABASE_URL (or .env.test / .env) at the staging Supabase project or a ` +
        `local Postgres.\n` +
        `A2R_ALLOW_PROD_TESTS=1 is a deliberate, single-machine break-glass — never set it in CI ` +
        `or a shared environment.\n`,
    );
  }
  return url;
}
