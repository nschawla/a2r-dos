/**
 * Vitest setup — runs before any test module (and therefore `@/lib/db`) is
 * imported.
 *
 *  1. Loads env from `.env.test` (preferred) then `.env` into `process.env`
 *     — `next` / `prisma` do this automatically; plain vitest does not.
 *  2. WP2 — resolves the test DB URL (TEST_DATABASE_URL → .env.test → .env)
 *     and REFUSES to run if it points at production. The DB-integration
 *     suites under `tests/security/**` mutate data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNonProductionTestDb, resolveTestDatabaseUrl } from './helpers/db-target';

function loadEnvFile(file: string): void {
  try {
    const raw = readFileSync(join(process.cwd(), file), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key && rawValue !== undefined && !process.env[key]) {
        process.env[key] = rawValue.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* file absent */
  }
}

// `.env.test` wins over `.env` for anything it defines (first-write-wins above).
loadEnvFile('.env.test');
loadEnvFile('.env');

// Pin DATABASE_URL to the resolved test target so `@/lib/db` and the raw
// PrismaClient instances in the security suites all agree.
const resolved = resolveTestDatabaseUrl();
if (resolved) process.env.DATABASE_URL = resolved;

// Fail fast if that target is production — before any test opens a connection.
assertNonProductionTestDb('vitest');
