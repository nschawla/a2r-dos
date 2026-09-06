/**
 * P0 #4 — preview / production data-isolation guardrail (runtime wrapper).
 *
 * `assertEnvironmentIsolation()` hard-fails the process if a Vercel Preview
 * / Development deployment is wired to the PRODUCTION database. It is
 * called from:
 *   - src/instrumentation.ts  → on server boot, before any request
 *   - src/lib/db.ts           → immediately before the Prisma client is
 *                               created, so no query can ever run
 *
 * The build-time equivalent lives in next.config.mjs (same core logic).
 *
 * The pure decision function is in ./env-isolation-core.mjs so it can be
 * shared with next.config.mjs and unit-tested.
 */
import {
  evaluateEnvironmentIsolation,
  type EnvIsolationVerdict,
} from './env-isolation-core.mjs';

export { evaluateEnvironmentIsolation, type EnvIsolationVerdict };

export class EnvironmentIsolationError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'EnvironmentIsolationError';
    this.code = code;
  }
}

let cachedVerdict: EnvIsolationVerdict | null = null;

/**
 * Throws `EnvironmentIsolationError` when a protected (Vercel Preview /
 * Development) deployment points at the production database. Logs any
 * non-fatal warning once. Idempotent — safe to call from several places.
 */
export function assertEnvironmentIsolation(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): void {
  const verdict = cachedVerdict ?? (cachedVerdict = evaluateEnvironmentIsolation(env));

  if (!verdict.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `\n🛑 ENVIRONMENT ISOLATION VIOLATION (${verdict.code})\n\n${verdict.message}\n`,
    );
    throw new EnvironmentIsolationError(verdict.message, verdict.code);
  }

  if (verdict.warning) {
    // eslint-disable-next-line no-console
    console.warn(`[env-isolation] ${verdict.warning}`);
  }
}

/** Test hook — clears the memoised verdict. */
export function __resetEnvironmentIsolationCache(): void {
  cachedVerdict = null;
}
