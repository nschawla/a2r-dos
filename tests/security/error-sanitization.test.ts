import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * P2 — global error sanitization. No API route handler or server action may
 * surface a raw backend error (Prisma exception, stack, driver message) to
 * the client. Two static guards, `vitest run`-enforced:
 *
 *   1. every `src/app/api/**​/route.ts` runs through `withRouteHandler` or
 *      `withApiAuth` (which return a generic 500 on an unhandled throw) —
 *      or is on the small documented allowlist;
 *   2. nowhere in `src/app/api` / `src/server/actions` is a caught error's
 *      `.message` / `.stack` / `String(err)` interpolated into a response
 *      body or an `{ error }` return.
 */
const ROOT = join(process.cwd(), 'src');

/** Routes exempt from the wrapper rule, with the reason. */
const ROUTE_ALLOWLIST: Record<string, string> = {
  'src/app/api/health/route.ts': 'liveness probe — no deps, no throw, constant body',
  'src/app/api/health/ready/route.ts': 'own try/catch, returns only { database: "ok"|"error"|"timeout" }',
  'src/app/api/auth/[...nextauth]/route.ts': 'NextAuth generates its own generic error responses',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('every API route has an error boundary', () => {
  const routes = walk(join(ROOT, 'app', 'api')).filter((f) => /(^|\/)route\.tsx?$/.test(f));

  for (const route of routes) {
    const rel = relative(process.cwd(), route);
    it(rel, () => {
      const src = readFileSync(route, 'utf8');
      const wrapped = /withRouteHandler|withApiAuth/.test(src);
      if (wrapped) return;
      expect(ROUTE_ALLOWLIST[rel], `${rel} is neither wrapped nor allowlisted`).toBeTruthy();
    });
  }
});

describe('no handler leaks a raw error into a response', () => {
  const LEAK = [
    /error:\s*String\(\s*(err|e|error)\b/,
    /error:\s*`[^`]*\$\{\s*(err|e|error)\b/,
    /\berr(or)?\.message\b(?![^\n]*issues)/, // err.message / error.message, not zod issues
    /\berr(or)?\.stack\b/,
    /\(\s*(err|e|error)\s+as\s+Error\s*\)\.message/,
    /JSON\.stringify\(\s*(err|e|error)\b/,
  ];
  const files = [
    ...walk(join(ROOT, 'app', 'api')),
    ...walk(join(ROOT, 'server', 'actions')),
  ];

  for (const file of files) {
    const rel = relative(process.cwd(), file);
    it(rel, () => {
      const src = readFileSync(file, 'utf8');
      for (const pat of LEAK) {
        const m = src.match(pat);
        expect(m, `${rel} appears to expose a raw error to the client: "${m?.[0]}"`).toBeNull();
      }
    });
  }
});
