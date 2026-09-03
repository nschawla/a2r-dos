/**
 * Vitest setup — loads `.env` into `process.env` before any test module
 * (and therefore `@/lib/db`) is imported. `next` / `prisma` do this
 * automatically; plain vitest does not. Pure tests don't need it; the
 * DB-integration tests under tests/security/ do.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key && rawValue !== undefined && !process.env[key]) {
        process.env[key] = rawValue.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env — DB-integration tests will surface their own connection error */
  }
}
