import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * DAL import boundary (docs/DATA_ACCESS_LAYER.md §3). Pages, route handlers,
 * and UI components must not import the Prisma client directly — reads go
 * through src/server/queries/**, writes through src/server/actions/**.
 * This is the belt-and-suspenders companion to the ESLint
 * `no-restricted-imports` rule in .eslintrc.json, so `vitest run` fails on
 * a violation too.
 */

const ROOT = join(process.cwd(), 'src');
const SCANNED_DIRS = ['app', 'components'].map((d) => join(ROOT, d));

/** Documented exceptions — see docs/DATA_ACCESS_LAYER.md §3. */
const ALLOWLIST = [
  'src/app/api/health/ready/route.ts', // raw SELECT 1 liveness ping, no tenant data
  // The Bearer ingestion API — own verified context via withApiAuth.
  /^src\/app\/api\/v1\//,
];

function isAllowed(relPath: string): boolean {
  return ALLOWLIST.some((rule) =>
    typeof rule === 'string' ? rule === relPath : rule.test(relPath),
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** All `import ... from '...'` statements (handles multi-line), with a flag
 * for whether it's a type-only import. */
function importStatements(source: string): { spec: string; typeOnly: boolean }[] {
  const re = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const out: { spec: string; typeOnly: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ spec: m[3] ?? '', typeOnly: Boolean(m[1]) });
  }
  return out;
}

/** Banned: the raw Prisma client and the org-scope extension internals.
 * `@/lib/db/scoped-portfolio` is a scoped-query helper module (part of the
 * query layer) and stays allowed — pages are meant to call it. */
const BANNED = (spec: string) => spec === '@/lib/db' || spec === '@/lib/db/org-scope';

describe('DAL import boundary', () => {
  const files = SCANNED_DIRS.flatMap(walk);

  it('scans a non-trivial number of files (guards against a broken walk)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no src/app/** or src/components/** file imports the Prisma client directly', () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(process.cwd(), file);
      if (isAllowed(rel)) continue;
      const source = readFileSync(file, 'utf8');
      for (const { spec, typeOnly } of importStatements(source)) {
        if (typeOnly) continue;
        if (BANNED(spec)) violations.push(`${rel} → import '${spec}'`);
        if (spec === '@prisma/client' && /\bPrismaClient\b/.test(source)) {
          // value import of PrismaClient (type-only PrismaClient use is fine)
          const line = source
            .split('\n')
            .find((l) => l.includes('@prisma/client') && /\bPrismaClient\b/.test(l) && !/^\s*import\s+type/.test(l));
          if (line) violations.push(`${rel} → value import of PrismaClient`);
        }
      }
    }
    expect(violations, `DAL boundary violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
