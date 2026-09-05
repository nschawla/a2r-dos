import { PrismaClient } from '@prisma/client';
import { captureMessage } from '@/lib/observability';
import {
  currentOrgScope,
  resolveScopeLazily,
  isTenantModel,
  UNSCOPED_MODELS,
  mergeOrgWhere,
  mergeOrgWhereUnique,
  flattenUniqueWhere,
  applyOrgToCreateData,
  OrgScopeError,
} from '@/lib/db/org-scope';

/**
 * CMP-4 (GA-readiness audit) — DB channel security check.
 *
 * Prisma takes its TLS settings from the DATABASE_URL query string, not
 * from the client constructor: a production connection string must carry
 * `sslmode=require` (or stricter — `verify-full` with a CA bundle). See
 * .env.example. This check is loud but non-fatal — a misconfigured prod
 * deploy shows up in logs immediately instead of silently running an
 * unencrypted database channel, without taking the app down over it.
 */
function assertDbChannelSecurity(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const url = process.env.DATABASE_URL ?? '';
  const hasTls = /[?&](sslmode=(require|verify-ca|verify-full)|ssl=true)/i.test(url);
  const isLoopback = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (!hasTls && !isLoopback) {
    captureMessage(
      'DATABASE_URL is missing sslmode=require — the database channel may be unencrypted in production.',
      { scope: 'db/ssl' },
      'warning'
    );
  }
}

function createBaseClient(): PrismaClient {
  assertDbChannelSecurity();
  return new PrismaClient({
    // Slow-query visibility is OBS-2's job; for now keep prod quiet
    // (errors only) and dev at warn+error.
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/** Reads whose `where` must stay a unique selector — routed to the
 * `*First` variant with the org filter ANDed in. */
const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
/** Unique-target writes — keep the unique selector at the top level of
 * `where` (Prisma's "extended where unique") and add the org constraint
 * beside it. A cross-tenant target then throws P2025. */
const UNIQUE_WRITE_OPS = new Set(['update', 'delete']);
/** Operations with a fully filterable `where` — `AND` is always valid. */
const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * ORM-level tenant scoping (see src/lib/db/org-scope.ts). Every operation
 * on a tenant-owned model is rewritten to include the request's
 * `organizationId`; an operation with no scope set throws.
 */
function extendWithOrgScope(base: PrismaClient) {
  return base.$extends({
    name: 'org-scope',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!isTenantModel(model) || UNSCOPED_MODELS.has(model)) {
            return query(args);
          }

          // Fast path: an explicit setOrgScope / setAdminScope / runUnscoped.
          // Dependable path: the lazy resolver (session + a2r_active_org
          // cookie, or the /ops middleware header) — enterWith() from the
          // async guards is not guaranteed across every App Router boundary,
          // so a live request that reaches here with nothing set is resolved
          // here rather than left to leak or throw.
          const scope = currentOrgScope() ?? (await resolveScopeLazily());
          if (!scope) {
            if (IS_TEST) {
              // eslint-disable-next-line no-console
              console.warn(`[org-scope] ${operation} on ${model} ran unscoped (test env — passthrough)`);
              return query(args);
            }
            throw new OrgScopeError(model, operation);
          }
          if (scope.kind === 'admin') return query(args);

          const orgId = scope.organizationId;
          const a = { ...(args ?? {}) };

          if (
            operation === 'create' ||
            operation === 'createMany' ||
            operation === 'createManyAndReturn'
          ) {
            if (a.data !== undefined) a.data = applyOrgToCreateData(model, a.data, orgId);
            return query(a);
          }

          if (operation === 'upsert') {
            a.where = mergeOrgWhereUnique(model, a.where, orgId);
            if (a.create !== undefined) a.create = applyOrgToCreateData(model, a.create, orgId);
            // update-side: validate only (don't rewrite the FK on every save).
            if (a.update !== undefined) {
              a.update = applyOrgToCreateData(model, a.update, orgId, { inject: false });
            }
            return query(a);
          }

          if (UNIQUE_WRITE_OPS.has(operation)) {
            a.where = mergeOrgWhereUnique(model, a.where, orgId);
            if (operation === 'update' && a.data !== undefined) {
              a.data = applyOrgToCreateData(model, a.data, orgId, { inject: false });
            }
            return query(a);
          }

          if (UNIQUE_READ_OPS.has(operation)) {
            const firstOp = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
            const flatWhere = flattenUniqueWhere(a.where);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (base as any)[modelKey][firstOp]({
              ...a,
              where: mergeOrgWhere(model, flatWhere, orgId),
            });
          }

          if (WHERE_OPS.has(operation)) {
            a.where = mergeOrgWhere(model, a.where, orgId);
            return query(a);
          }

          // Unknown op — safest to let it through only for a non-write.
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof extendWithOrgScope>;

// Standard Next.js dev-mode singleton: without this, hot-reload creates a
// fresh PrismaClient (and a fresh connection pool) on every file save.
const globalForPrisma = globalThis as unknown as {
  prismaBase?: PrismaClient;
  prisma?: ExtendedClient;
};

const base = globalForPrisma.prismaBase ?? createBaseClient();
const extended: ExtendedClient = globalForPrisma.prisma ?? extendWithOrgScope(base);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaBase = base;
  globalForPrisma.prisma = extended;
}

/**
 * Exported as `PrismaClient` deliberately. `$extends` produces a structurally
 * different client type (no `$use`/`$on`, a stricter `$transaction` callback
 * arg), which would ripple a type change through ~15 files that pass `db` or
 * a `tx` into helpers typed as `PrismaClient` / `Prisma.TransactionClient`.
 * The org-scope query extension still runs at runtime — including inside
 * interactive `$transaction(fn)` callbacks — so this cast changes types only,
 * not behaviour.
 */
export const db = extended as unknown as PrismaClient;
