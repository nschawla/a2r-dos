/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P2 — the named sliding-window rate-limit rules for the app's high-risk /
 * resource-intensive boundaries. One place to see (and tune) every limit.
 *
 * Each rule's `limit` is `Number(process.env.RL_<NAME>_LIMIT)` when that is
 * a positive finite number, otherwise the default below. `windowMs` is
 * fixed in code. The limiter itself is `src/lib/rate-limiter.ts` (a true
 * in-process sliding window; per-instance — see its docstring for the
 * Redis swap seam).
 *
 * Keying convention (the caller builds the key):
 *   auth boundaries        → per client IP     `auth:login:<ip>`, `auth:register:<ip>`
 *   authenticated actions  → per user id       `pw-change:<userId>`, `import:stage:<userId>`
 *   download / report      → per user id       `export:csv:<userId>` (IP fallback)
 */
import type { RateLimitRule } from '@/lib/rate-limiter';

const MINUTE = 60_000;

function limitFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[`RL_${name}_LIMIT`]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function rule(name: string, fallbackLimit: number, windowMs: number): RateLimitRule {
  return { limit: limitFromEnv(name, fallbackLimit), windowMs };
}

export const RATE_LIMITS = {
  /** Credentials sign-in POST — brute-force / credential-stuffing guard. */
  LOGIN: rule('LOGIN', 10, MINUTE),
  /** Public self-service tenant registration. */
  REGISTER: rule('REGISTER', 5, 15 * MINUTE),
  /** Password change — verifies the current password (a bcrypt compare) every call. */
  PASSWORD_CHANGE: rule('PASSWORD_CHANGE', 5, 10 * MINUTE),
  /** AI document parser — each call is a paid LLM round-trip. */
  DOC_PARSE: rule('DOC_PARSE', 10, MINUTE),
  /** Bulk data exports — the portfolio CSV and the per-project JSON snapshot. */
  BULK_EXPORT: rule('BULK_EXPORT', 30, 5 * MINUTE),
  /** Print-ready document generation — SteerCo status deck, audit certificate. */
  DOC_GEN: rule('DOC_GEN', 30, MINUTE),
  /** Intake CSV template downloads (non-sensitive reference files). */
  TEMPLATE_DOWNLOAD: rule('TEMPLATE_DOWNLOAD', 60, MINUTE),
  /** Self-service batch import — stage / commit / inline-correct. */
  BATCH_INGEST: rule('BATCH_INGEST', 20, MINUTE),
  /** Workspace snapshot export / restore — heavy, whole-tenant operations. */
  WORKSPACE_SNAPSHOT: rule('WORKSPACE_SNAPSHOT', 5, 10 * MINUTE),
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
