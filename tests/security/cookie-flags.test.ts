import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P1 — cookie-flag hardening. Every place the app sets one of its OWN
 * cookies (not the NextAuth session cookie, which is deliberately
 * `sameSite: 'lax'` — see src/lib/auth.ts) must set `httpOnly: true`,
 * `secure` in production, and `sameSite: 'strict'`. Static scan, like
 * tests/dal-boundary.test.ts, so `vitest run` fails on a regression.
 */

const ROOT = join(process.cwd(), 'src');

/** The app's own cookie constants — the ones this rule governs. */
const APP_COOKIE_TOKENS = [
  'ACTIVE_ORG_COOKIE',
  'LENS_COOKIE',
  'ELEVATION_COOKIE',
  'IMPERSONATION_COOKIE',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Grab the `{ … }` options object of a `cookies()).set(NAME, value, { … })` call. */
function setOptionsFor(source: string, token: string): string | null {
  const idx = source.indexOf(`.set(${token}`);
  if (idx === -1) return null;
  const braceStart = source.indexOf('{', idx);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

describe('app cookie flags', () => {
  const files = walk(ROOT).filter((f) => /\.set\((ACTIVE_ORG|LENS|ELEVATION|IMPERSONATION)_COOKIE/.test(readFileSync(f, 'utf8')));

  it('covers every app cookie set-site', () => {
    // sanity: all four cookies are set somewhere
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const token of APP_COOKIE_TOKENS) {
      expect(all).toContain(`.set(${token}`);
    }
  });

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const token of APP_COOKIE_TOKENS) {
      if (!src.includes(`.set(${token}`)) continue;
      it(`${file.replace(ROOT, 'src')} · ${token} is httpOnly + secure(prod) + sameSite strict`, () => {
        const opts = setOptionsFor(src, token);
        expect(opts, `could not parse .set(${token}, …) options`).toBeTruthy();
        expect(opts).toMatch(/httpOnly:\s*true/);
        expect(opts).toMatch(/sameSite:\s*'strict'/);
        expect(opts).toMatch(/secure:\s*process\.env\.NODE_ENV\s*===\s*'production'/);
      });
    }
  }
});

describe('NextAuth cookie config (src/lib/auth.ts)', () => {
  const auth = readFileSync(join(ROOT, 'lib/auth.ts'), 'utf8');

  it('pins the session + csrf cookies to httpOnly + secure-aware', () => {
    expect(auth).toMatch(/cookies:\s*{/);
    expect(auth).toMatch(/sessionToken:/);
    expect(auth).toMatch(/csrfToken:/);
    // session cookie stays lax by design, but must be httpOnly + secure-aware
    expect(auth).toMatch(/httpOnly:\s*true/);
    expect(auth).toMatch(/secure:\s*useSecureCookies/);
  });
});
