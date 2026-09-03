/**
 * Secure Data Ingestion API Bridge — API Key Service.
 *
 * Tenant-scoped API credentials for automated data entry from external
 * enterprise systems (CRM, ERP, legacy timesheets). Only the SHA-256 hash
 * of a key is persisted; the plaintext is returned exactly once at
 * creation. Every key belongs to exactly one tenant, so a request
 * authenticated with it can only ever touch that tenant's data.
 *
 * Pure crypto + a couple of DB helpers — no HTTP. The request wrapper
 * lives in src/lib/api-auth.ts, the issuance/revoke Server Actions in
 * src/server/actions/ops.ts.
 */
import { db } from '@/lib/db';
import { recordLedgerEvent, type LedgerDbClient } from '@/lib/audit-ledger';
import { generateApiKeyPlaintext, hashApiKey, looksLikeApiKey } from '@/lib/ops/api-key-crypto';

export { hashApiKey, looksLikeApiKey, generateApiKeyPlaintext, API_KEY_PREFIX } from '@/lib/ops/api-key-crypto';

export interface IssuedApiKey {
  id: string;
  name: string;
  organizationId: string;
  keyPrefix: string;
  expiresAt: string | null;
  createdAt: string;
  /** Plaintext — shown ONCE, never stored. */
  plaintext: string;
}

export interface IssueApiKeyInput {
  organizationId: string;
  name: string;
  createdByEmail: string;
  /** Optional TTL. Omit for a non-expiring key. */
  expiresInDays?: number | null;
  /** User id for the ledger entry (the operator issuing the key). */
  actorId: string;
}

/**
 * Mints a new API key for a tenant and records an `API_KEY_ISSUED` entry
 * on that tenant's Immutable Audit Ledger.
 */
export async function issueApiKey(
  client: LedgerDbClient,
  input: IssueApiKeyInput
): Promise<{ ok: true; key: IssuedApiKey } | { ok: false; error: string }> {
  const org = await client.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, name: true, purgedAt: true },
  });
  if (!org) return { ok: false, error: 'Tenant not found.' };
  if (org.purgedAt) return { ok: false, error: 'Tenant has been purged — API keys cannot be issued.' };

  const { plaintext, keyPrefix, hashedKey } = generateApiKeyPlaintext();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : null;

  const row = await client.apiKey.create({
    data: {
      organizationId: org.id,
      name: input.name.slice(0, 120),
      keyPrefix,
      hashedKey,
      createdByEmail: input.createdByEmail,
      expiresAt,
    },
    select: { id: true, name: true, keyPrefix: true, expiresAt: true, createdAt: true },
  });

  await recordLedgerEvent(client, {
    organizationId: org.id,
    actorId: input.actorId,
    actionType: 'API_KEY_ISSUED',
    targetResource: `ApiKey:${row.id}`,
    metadata: {
      tenant: org.name,
      apiKeyName: row.name,
      keyPrefix,
      issuedBy: input.createdByEmail,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  return {
    ok: true,
    key: {
      id: row.id,
      name: row.name,
      organizationId: org.id,
      keyPrefix,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      plaintext,
    },
  };
}

export async function revokeApiKey(
  client: LedgerDbClient,
  input: { apiKeyId: string; organizationId: string; actorId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = await client.apiKey.findFirst({
    where: { id: input.apiKeyId, organizationId: input.organizationId },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!key) return { ok: false, error: 'API key not found.' };
  if (key.revokedAt) return { ok: false, error: 'API key is already revoked.' };

  await client.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await recordLedgerEvent(client, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    actionType: 'API_KEY_REVOKED',
    targetResource: `ApiKey:${key.id}`,
    metadata: { apiKeyName: key.name },
  });
  return { ok: true };
}

export interface ValidatedApiKey {
  apiKeyId: string;
  apiKeyName: string;
  keyPrefix: string;
  tenantId: string;
}

export type ApiKeyValidationResult =
  | { ok: true; key: ValidatedApiKey }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Validates an incoming plaintext key (already stripped of the `Bearer `
 * prefix) and returns the associated `tenantId`. Bumps `lastUsedAt` on
 * success. 401 for unknown/malformed, 403 for revoked/expired/purged.
 */
export async function validateApiKey(plaintext: string): Promise<ApiKeyValidationResult> {
  const token = (plaintext ?? '').trim();
  if (!token || !looksLikeApiKey(token)) {
    return { ok: false, status: 401, error: 'Malformed or missing API key.' };
  }

  const key = await db.apiKey.findUnique({
    where: { hashedKey: hashApiKey(token) },
    include: { organization: { select: { id: true, purgedAt: true, status: true } } },
  });
  if (!key) return { ok: false, status: 401, error: 'Invalid API key.' };
  if (key.revokedAt) return { ok: false, status: 403, error: 'API key has been revoked.' };
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 403, error: 'API key has expired.' };
  }
  if (key.organization.purgedAt) return { ok: false, status: 403, error: 'Tenant is no longer active.' };
  if (key.organization.status === 'SUSPENDED') {
    return { ok: false, status: 403, error: 'Tenant is suspended — ingestion is disabled.' };
  }

  // fire-and-forget last-used bump
  db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    ok: true,
    key: { apiKeyId: key.id, apiKeyName: key.name, keyPrefix: key.keyPrefix, tenantId: key.organizationId },
  };
}
