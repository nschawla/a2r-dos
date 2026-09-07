/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P0-2 — Database Row-Level Security: the per-request tenant bridge.
 *
 * ══ STATUS ══════════════════════════════════════════════════════════════
 * NO-OP unless `process.env.RLS_ENFORCE === '1'`. Exercised on the
 * **staging** database as of Phase C (v1.9.0). NOT set on production — that
 * cutover is the tail of docs/RLS_ENFORCEMENT_RUNBOOK.md.
 * ════════════════════════════════════════════════════════════════════════
 *
 * HOW IT WORKS. `db` connects as the Supabase `postgres` role (BYPASSRLS,
 * table owner), so RLS is normally inert for the app. When `RLS_ENFORCE=1`,
 * every tenant-scoped database operation is run inside a transaction whose
 * first two statements are:
 *
 *     SELECT set_config('role', 'a2r_app', true);          -- SET LOCAL ROLE
 *     SELECT set_config('app.current_org', <org>, true);   -- SET LOCAL GUC
 *
 * `a2r_app` is NOBYPASSRLS (migration 16), so from that point in the tx the
 * `tenant_isolation` policies (migration 17) apply, keyed on the GUC.
 * `SET LOCAL` reverts on COMMIT/ROLLBACK, so nothing leaks onto the pooled
 * connection. This `SET ROLE`-in-a-tx approach needs no second connection
 * pool and no Supavisor custom-role support — the pooler only ever sees the
 * `postgres` login.
 *
 * Two code paths set that up:
 *   1. `withTenantTx(fn)` (src/lib/db/with-tenant-tx.ts) — every existing
 *      `db.$transaction(fn)` that touches a tenant model is converted to it.
 *   2. This extension — for a BARE `db.model.op()` with no surrounding tx,
 *      wraps that single op. When it sees the async-context mark left by
 *      `withTenantTx` (`isGucSet()`) it passes straight through.
 *
 * Cross-tenant / pre-session work (ops console, provisioning, SSO JIT, the
 * retention sweep) resolves to `admin`/no scope and simply runs as
 * `postgres` (BYPASSRLS) — no role switch, no GUC.
 *
 * Node-only. Never imported by the Edge middleware.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import {
  currentOrgScope,
  resolveScopeLazily,
  isTenantModel,
  UNSCOPED_MODELS,
} from '@/lib/db/org-scope';

/** The GUC the RLS policies read (see migration 17). */
export const RLS_GUC = 'app.current_org';
/** The NOBYPASSRLS role every tenant tx switches to (migration 16). */
export const RLS_ROLE = 'a2r_app';

/** Whether DB-level RLS enforcement is switched on for this process. */
export function isRlsEnforced(): boolean {
  return process.env.RLS_ENFORCE === '1';
}

/**
 * Emit the two `SET LOCAL` statements that put a transaction into
 * tenant-scoped, RLS-enforced mode. Call as the first thing inside any
 * `db.$transaction` that will touch tenant data under `RLS_ENFORCE=1`.
 */
export async function applyRlsSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: { $executeRawUnsafe: (q: string, ...v: any[]) => Promise<unknown> },
  organizationId: string,
): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT set_config('role', $1, true)`, RLS_ROLE);
  await tx.$executeRawUnsafe(`SELECT set_config('${RLS_GUC}', $1, true)`, organizationId);
}

// ── "the tenant session is already set for this async context" marker ────
const gucScope = new AsyncLocalStorage<true>();

/** Run `fn` in an async context that records the tenant session as set. */
export function runWithGucSet<T>(fn: () => T): T {
  return gucScope.run(true, fn);
}

/** True when the current async context is inside a `withTenantTx` callback. */
export function isGucSet(): boolean {
  return gucScope.getStore() === true;
}

/**
 * Compose the RLS bridge onto an (already org-scoped) client. Returns the
 * client untouched when `RLS_ENFORCE` is not `'1'` — a zero-cost passthrough
 * everywhere the flag is unset.
 */
export function extendWithRlsTransaction<T extends PrismaClient>(base: T): T {
  if (!isRlsEnforced()) return base;

  const extended = base.$extends({
    name: 'rls-set-local',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !isTenantModel(model) || UNSCOPED_MODELS.has(model)) {
            return query(args);
          }
          // Inside a `withTenantTx` — the enclosing tx already ran the two
          // SET LOCALs (org branch) or is deliberately running as postgres
          // (admin branch).
          if (isGucSet()) return query(args);

          const scope = currentOrgScope() ?? (await resolveScopeLazily());

          // Cross-tenant / pre-session — run as postgres (BYPASSRLS). A
          // single-tenant GUC is meaningless here and these callers pass
          // an explicit organizationId on every write.
          if (!scope || scope.kind !== 'org') return query(args);

          // Bare `db.model.op()` in a tenant request — wrap this one op.
          // `base` is the pre-rls (org-scoped) client, so the inner `tx`
          // does not re-enter this extension.
          const orgId = scope.organizationId;
          const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
          return base.$transaction(async (tx) => {
            await applyRlsSession(tx, orgId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (tx as any)[modelKey][operation](args);
          }, { maxWait: 8_000, timeout: 15_000 });
        },
      },
    },
  });

  return extended as unknown as T;
}
