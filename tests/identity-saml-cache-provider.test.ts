import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { makeSamlCacheProvider } from '@/lib/identity/saml-cache-provider';

/**
 * Live-DB coverage for src/lib/identity/saml-cache-provider.ts — the
 * replay-protection store the SAML SP-initiated flow relies on. Two
 * properties matter beyond node-saml's own InResponseTo logic (covered
 * end-to-end in tests/identity-saml-handshake.test.ts): tenant isolation
 * (org A must never be able to read or remove org B's outstanding
 * request), and expiry (a request past its TTL reads back as absent even
 * though the row technically still exists until the next prune).
 */

async function demoOrgId(): Promise<string> {
  const org = await db.organization.findFirst({ where: { slug: 'a2r-ventures-demo' }, select: { id: true } });
  if (!org) throw new Error('demo org not seeded — run prisma/seed.ts against this DB first');
  return org.id;
}

let organizationId: string;
const requestIdsToClean: string[] = [];

afterAll(async () => {
  if (requestIdsToClean.length) {
    await db.samlAuthRequest.deleteMany({ where: { requestId: { in: requestIdsToClean } } });
  }
});

describe('makeSamlCacheProvider', () => {
  it('round-trips save → get → remove for one tenant', async () => {
    organizationId = await demoOrgId();
    const provider = makeSamlCacheProvider(organizationId);
    const key = `test-req-${Date.now()}-a`;
    requestIdsToClean.push(key);

    const saved = await provider.saveAsync(key, new Date().toISOString());
    expect(saved).not.toBeNull();

    const value = await provider.getAsync(key);
    expect(value).not.toBeNull();

    const removed = await provider.removeAsync(key);
    expect(removed).toBe(key);

    const afterRemove = await provider.getAsync(key);
    expect(afterRemove).toBeNull();
  });

  it('never lets one tenant read or remove another tenant’s outstanding request', async () => {
    const orgA = await demoOrgId();
    const otherOrg = await db.organization.findFirst({ where: { slug: { not: 'a2r-ventures-demo' } }, select: { id: true } });
    if (!otherOrg) {
      // Environments with only the demo org seeded can't exercise
      // cross-tenant isolation — skip rather than fail on a fixture gap.
      return;
    }

    const providerA = makeSamlCacheProvider(orgA);
    const providerB = makeSamlCacheProvider(otherOrg.id);
    const key = `test-req-${Date.now()}-cross-tenant`;
    requestIdsToClean.push(key);

    await providerA.saveAsync(key, new Date().toISOString());

    // Org B's provider is scoped to a DIFFERENT organizationId — the same
    // requestId under org A must be invisible to it.
    const crossTenantRead = await providerB.getAsync(key);
    expect(crossTenantRead).toBeNull();

    const crossTenantRemove = await providerB.removeAsync(key);
    expect(crossTenantRemove).toBeNull();

    // The row is untouched — org A can still read and remove its own.
    const ownRead = await providerA.getAsync(key);
    expect(ownRead).not.toBeNull();
    await providerA.removeAsync(key);
  });

  it('a request past its TTL reads back as absent', async () => {
    organizationId = await demoOrgId();
    const key = `test-req-${Date.now()}-expired`;
    requestIdsToClean.push(key);

    // Bypass the provider's own save (which always stamps a future
    // expiresAt) to plant an already-expired row directly.
    await db.samlAuthRequest.create({
      data: {
        organizationId,
        requestId: key,
        value: new Date(Date.now() - 20 * 60_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000), // 1 minute in the past
      },
    });

    const value = await makeSamlCacheProvider(organizationId).getAsync(key);
    expect(value).toBeNull();
  });

  it('saveAsync opportunistically prunes this tenant’s own expired rows', async () => {
    organizationId = await demoOrgId();
    const staleKey = `test-req-${Date.now()}-stale-to-prune`;
    await db.samlAuthRequest.create({
      data: {
        organizationId,
        requestId: staleKey,
        value: 'stale',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const freshKey = `test-req-${Date.now()}-triggers-prune`;
    requestIdsToClean.push(freshKey);
    await makeSamlCacheProvider(organizationId).saveAsync(freshKey, new Date().toISOString());

    // Prune runs fire-and-forget inside saveAsync — give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const stale = await db.samlAuthRequest.findUnique({ where: { requestId: staleKey } });
    expect(stale).toBeNull();
  });
});
