/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Replay-protection cache for the SAML SP-initiated flow — implements
 * node-saml's `CacheProvider` interface (`saveAsync` / `getAsync` /
 * `removeAsync`), backed by the `SamlAuthRequest` table instead of an
 * in-process Map.
 *
 * node-saml ships an in-memory default, which is wrong for this
 * deployment: Vercel serverless functions are stateless between
 * invocations and can scale to multiple concurrent instances, so an
 * AuthnRequest ID `saveAsync`'d by the `/login` invocation would often not
 * be visible to the `/acs` invocation that needs to `getAsync` it a few
 * seconds later. A shared Postgres table makes the cache durable and
 * consistent across instances — which is also what makes the replay check
 * itself meaningful: `removeAsync` (called by node-saml once InResponseTo
 * validates) deletes the row, so a second POST of the same SAMLResponse
 * finds no cached request and is rejected as a replay.
 *
 * Pre-session, cross-tenant-by-necessity — every call runs unscoped
 * (like the rest of the pre-auth SSO path; see identity-jit.ts), pinned
 * explicitly to `organizationId` on every read/write.
 */
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';

/** Requests older than this are never valid — also the AuthnRequest ID's
 * lifetime on the IdP side (src/lib/identity/saml-config.ts's
 * `requestIdExpirationPeriodMs` uses the same value). */
export const SAML_REQUEST_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Opportunistic housekeeping — delete this tenant's own expired,
 * unconsumed rows on every save. Cheap (indexed on expiresAt), and keeps
 * the table from growing unbounded even though nothing else purges it
 * (its rows live minutes, not days, so it doesn't fit the day-granularity
 * retention sweep in src/server/services/data-retention.ts). */
async function pruneExpired(organizationId: string): Promise<void> {
  try {
    await db.samlAuthRequest.deleteMany({
      where: { organizationId, expiresAt: { lt: new Date() } },
    });
  } catch (err) {
    // Best-effort — a failed prune never blocks the login it rode in on.
    console.error('[saml-cache-provider] prune failed', err);
  }
}

export function makeSamlCacheProvider(organizationId: string): CacheProvider {
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      return runUnscoped('saml-cache-save', async () => {
        const now = new Date();
        const row = await db.samlAuthRequest.create({
          data: {
            organizationId,
            requestId: key,
            value,
            expiresAt: new Date(now.getTime() + SAML_REQUEST_TTL_MS),
          },
        });
        void pruneExpired(organizationId);
        return { value: row.value, createdAt: row.createdAt.getTime() };
      });
    },

    async getAsync(key: string): Promise<string | null> {
      return runUnscoped('saml-cache-get', async () => {
        const row = await db.samlAuthRequest.findUnique({ where: { requestId: key } });
        if (!row) return null;
        if (row.organizationId !== organizationId) return null; // never leak across tenants
        if (row.expiresAt.getTime() < Date.now()) return null; // expired — treat as absent
        return row.value;
      });
    },

    async removeAsync(key: string | null): Promise<string | null> {
      if (!key) return null;
      return runUnscoped('saml-cache-remove', async () => {
        try {
          // Scope the DELETE itself to this org — NOT delete-then-check.
          // `db.samlAuthRequest.delete({ where: { requestId } })` would
          // remove the row before any ownership check ran, so a caller
          // scoped to the WRONG tenant could still delete another
          // tenant's outstanding request (a real cross-tenant denial-of-
          // service: guessing/being handed another org's requestId would
          // let you kill their in-flight SSO login). `deleteMany` with
          // both `requestId` AND `organizationId` in the `where` only
          // deletes a row that matches both.
          const { count } = await db.samlAuthRequest.deleteMany({ where: { requestId: key, organizationId } });
          return count > 0 ? key : null;
        } catch {
          // Already removed (e.g. a concurrent replay attempt lost the race) —
          // node-saml treats a null return as "nothing to remove", which is
          // exactly right here: the row being gone IS the replay defense.
          return null;
        }
      });
    },
  };
}
