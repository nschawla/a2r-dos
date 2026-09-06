/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * P0-2 — Database Row-Level Security: the per-request `SET LOCAL` bridge.
 *
 * ══ STATUS: DORMANT ══════════════════════════════════════════════════════
 * This extension is a NO-OP unless `process.env.RLS_ENFORCE === '1'`, and
 * that flag is set NOWHERE in the deployed configuration yet. Enforcement
 * is a staged Phase-C rollout that also needs:
 *   - the restricted `a2r_app` login role + its Supavisor pooler credential
 *     (prisma/migrations/00000000000016_rls_restricted_role),
 *   - the per-table policies applied and soaked
 *     (prisma/migrations/00000000000017_rls_tenant_policies),
 *   - `DATABASE_URL` swapped to connect as `a2r_app` (NOBYPASSRLS),
 *   - a rehearsal database + load validation of the transaction overhead.
 * See docs/RLS_ENFORCEMENT_RUNBOOK.md. Do not set `RLS_ENFORCE=1` against
 * the shared production database without completing that runbook.
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHY A TRANSACTION. Prisma holds a POOLED connection. RLS policies read
 * the tenant from a session GUC (`current_setting('app.current_org')`),
 * which must be set per-request without leaking onto the pooled connection
 * for the next request. `SET LOCAL` (here: `set_config(_, _, true)`) is
 * scoped to the current transaction and reverts on COMMIT/ROLLBACK, so
 * every tenant-model operation is wrapped in its own tx that sets the GUC
 * first. This also works with Supabase's transaction-mode pooler (the only
 * pooling mode that survives `SET LOCAL`).
 *
 * The scope comes from the SAME AsyncLocalStorage cell the v1.7.0 org-scope
 * extension uses (`currentOrgScope()` / `resolveScopeLazily()`), so there
 * is no new request plumbing — this layer just mirrors the resolved tenant
 * down into the database session.
 *
 * KNOWN LIMITATION (tracked for Phase C). When a call is ALREADY inside an
 * interactive `db.$transaction(fn)` callback, this extension cannot open a
 * nested transaction; it detects that case and runs the operation in the
 * caller's transaction WITHOUT re-setting the GUC. The caller's tx is
 * expected to have set `app.current_org` itself (a `withTenantTx()` helper
 * is part of the Phase-C work). Until then, `RLS_ENFORCE=1` is only safe
 * once every multi-statement flow has been audited — hence dormant.
 *
 * Node-only. Never imported by the Edge middleware.
 */
import type { PrismaClient } from '@prisma/client';
import {
  currentOrgScope,
  resolveScopeLazily,
  isTenantModel,
  UNSCOPED_MODELS,
} from '@/lib/db/org-scope';

/** The GUC the RLS policies read (see migration 17). */
export const RLS_GUC = 'app.current_org';

/** Whether DB-level RLS enforcement is switched on for this process. */
export function isRlsEnforced(): boolean {
  return process.env.RLS_ENFORCE === '1';
}

/**
 * Compose the `SET LOCAL` bridge onto an (already org-scoped) client.
 * Returns the client untouched when `RLS_ENFORCE` is not `'1'` — so in
 * every current environment this is a zero-cost passthrough and `db`
 * behaves exactly as it did before P0-2 landed.
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

          const scope = currentOrgScope() ?? (await resolveScopeLazily());
          // `admin` scope (ops console / pre-session) → empty GUC; the
          // policies' `current_setting(_, true)` yields '' and the bypass
          // branch / `postgres` fallback applies (see migration 17).
          const orgId = scope && scope.kind === 'org' ? scope.organizationId : '';

          // Already inside an interactive tx — cannot nest. Run in place;
          // the enclosing tx is responsible for the GUC (Phase-C
          // `withTenantTx`). Detected via the absence of `$transaction`
          // on the client Prisma handed this extension.
          const canOpenTx = typeof (base as { $transaction?: unknown }).$transaction === 'function';
          if (!canOpenTx) return query(args);

          return base.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT set_config('${RLS_GUC}', $1, true)`, orgId);
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (tx as any)[modelKey][operation](args);
          });
        },
      },
    },
  });

  return extended as unknown as T;
}
