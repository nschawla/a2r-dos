/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P0-2 (Phase C) — `withTenantTx`: the interactive-transaction wrapper that
 * carries the tenant identity into the database session for RLS.
 *
 * Drop-in for `db.$transaction(fn)` at every call site that touches a
 * tenant-owned model. Behaviour depends on `RLS_ENFORCE`:
 *
 *   - unset (today's production): exactly `db.$transaction(fn)` plus a cheap
 *     async-context flag — no `SET LOCAL`, no behaviour change. This is why
 *     the call-site conversion could land and be verified green before RLS
 *     was switched on anywhere.
 *
 *   - `'1'` (staging), request resolves to ONE tenant: open the tx, run
 *     `SET LOCAL ROLE a2r_app` + `SET LOCAL app.current_org = <org>`
 *     (`applyRlsSession`), mark the async context so the per-op RLS
 *     extension passes its writes straight through, then run `fn(tx)`.
 *
 *   - `'1'`, cross-tenant / pre-session context (`admin` scope or none —
 *     tenant provisioning, the Purge Protocol, SSO JIT): open the tx WITHOUT
 *     switching role, so it runs as `postgres` (BYPASSRLS). These callers
 *     pass an explicit `organizationId` on every write.
 *
 * Node-only.
 */
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentOrgScope, resolveScopeLazily } from '@/lib/db/org-scope';
import { applyRlsSession, isRlsEnforced, runWithGucSet } from '@/lib/db/rls-transaction';
import { isBreakGlassActive } from '@/lib/db/rls-break-glass';

/** The interactive-transaction client `db.$transaction(fn)` hands its callback. */
export type TenantTx = Prisma.TransactionClient;

export interface TenantTxOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Prisma's interactive-transaction defaults are 2s maxWait / 5s timeout.
 * Under RLS every tenant tx carries two extra `SET LOCAL` round trips, and
 * the heaviest flows (tenant provisioning's `seedOrganizationDefaults`,
 * workspace restore) legitimately do dozens of statements — so raise the
 * ceiling. A trivial 2-statement tx still returns in milliseconds; this is
 * only a cap.
 */
const TX_DEFAULTS: TenantTxOptions = { maxWait: 8_000, timeout: 20_000 };

export async function withTenantTx<T>(
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions,
): Promise<T> {
  const opts = { ...TX_DEFAULTS, ...options };
  if (!isRlsEnforced()) {
    return db.$transaction((tx) => runWithGucSet(() => fn(tx)), opts);
  }

  const scope = currentOrgScope() ?? (await resolveScopeLazily());

  if (!scope || scope.kind !== 'org') {
    // Cross-tenant / pre-session — run as postgres (BYPASSRLS), no role switch.
    return db.$transaction((tx) => runWithGucSet(() => fn(tx)), opts);
  }

  return withTenantTxFor(scope.organizationId, fn, opts);
}

/**
 * Like `withTenantTx`, but for an EXPLICIT tenant rather than the resolved
 * request scope — for code that already knows the organization it is
 * writing for and may differ from the ambient scope (the audit-ledger
 * append, an ops action recording an event against a target tenant).
 */
export async function withTenantTxFor<T>(
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions,
): Promise<T> {
  const opts = { ...TX_DEFAULTS, ...options };
  if (!isRlsEnforced() || (await isBreakGlassActive())) {
    // Break-glass: run as `postgres`, no role switch — tenant isolation
    // falls back to the app tier (org-scope.ts). `rls-break-glass.ts` has
    // already emitted the alert.
    return db.$transaction((tx) => runWithGucSet(() => fn(tx)), opts);
  }
  return db.$transaction(async (tx) => {
    await applyRlsSession(tx, organizationId);
    return runWithGucSet(() => fn(tx));
  }, opts);
}
