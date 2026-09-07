'use server';

import { withAction } from '@/lib/observability/action-wrapper';

/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Enterprise Identity Federation server actions. As of v1.2.1 this is a
 * PLATFORM-level capability: identity federation is infrastructure an A2R
 * operator configures on a tenant's behalf from the Ops Console
 * (/ops/identity), not something a tenant admin self-serves. Every action
 * therefore requires an A2R staff session, takes an explicit
 * `organizationId`, and is written to that tenant's Compliance Ledger.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireElevatedOps } from '@/lib/ops-auth';
import { recordLedgerEvent } from '@/lib/audit-ledger';
import { encryptSecret, secretFingerprint } from '@/lib/identity/crypto';
import { parseSamlMetadata, parseEmailDomainList } from '@/lib/identity/metadata';
import { fetchOidcDiscovery } from '@/lib/identity/service';
import type { ActionResult } from './auth';

const DELIVERY_ROLES = ['ADMIN', 'VP_EXECUTIVE', 'PRACTICE_DIRECTOR', 'DELIVERY_MANAGER', 'PROJECT_MANAGER'] as const;
const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

/**
 * Gate every identity-federation action: an A2R operator session, a live
 * P1 JIT elevation (identity federation is a mutating, high-privilege /ops
 * operation — see src/lib/ops/staff-elevation.ts), and an existing target
 * tenant. Returns the operator's user id (the ledger actor) or a
 * result-shaped error the caller returns verbatim (`'ELEVATION_REQUIRED'`
 * is surfaced so the ops UI can open the elevation modal).
 */
async function authorizeSsoAction(
  organizationId: string,
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const gate = await requireElevatedOps('identity:manage');
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.reason === 'ELEVATION_REQUIRED' ? 'ELEVATION_REQUIRED' : 'Not authorized.',
    };
  }
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return { ok: false, error: 'Unknown tenant.' };
  return { ok: true, actorId: gate.ops.userId };
}

async function logSsoChange(organizationId: string, actorId: string, op: string, detail?: Record<string, unknown>) {
  await recordLedgerEvent(db, {
    organizationId,
    actorId,
    actionType: 'SSO_CONFIG_CHANGE',
    targetResource: `IdentityProvider:${organizationId}`,
    metadata: { op, ...(detail ?? {}) },
  });
  revalidatePath('/ops/identity');
  revalidatePath('/admin/audit-log');
}

const withOrg = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject({ organizationId: z.string().min(1), ...shape });

// ─────────────────────────────────────────────────── provider config

const upsertSchema = withOrg({
  protocol: z.enum(['SAML', 'OIDC']),
  vendor: z.enum(['AZURE_AD', 'OKTA', 'GOOGLE_WORKSPACE', 'GENERIC']),
  displayName: z.string().min(2).max(120),
  emailDomains: z.string().max(2000),
  jitEnabled: z.boolean(),
  defaultDeliveryRole: z.enum(DELIVERY_ROLES),
  defaultMembershipRole: z.enum(MEMBERSHIP_ROLES),
  // SAML
  samlEntityId: z.string().max(400).optional(),
  samlSsoUrl: z.string().max(600).optional(),
  samlCertificate: z.string().max(20000).optional(),
  // OIDC
  oidcIssuer: z.string().max(400).optional(),
  oidcClientId: z.string().max(400).optional(),
  oidcClientSecret: z.string().max(2000).optional(),
  oidcDiscoveryUrl: z.string().max(600).optional(),
});

export const upsertIdentityProvider = withAction('upsertIdentityProvider', async (input: unknown): Promise<ActionResult> => {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  const { organizationId } = d;
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;

  const emailDomains = parseEmailDomainList(d.emailDomains);
  const clean = (s?: string) => {
    const t = (s ?? '').trim();
    return t.length > 0 ? t : null;
  };

  // Only (re)encrypt the client secret when a real new value was typed —
  // an empty field leaves the stored ciphertext untouched.
  const newSecret = clean(d.oidcClientSecret);
  const secretPatch = newSecret
    ? { oidcClientSecretCiphertext: encryptSecret(newSecret) }
    : {};

  const base = {
    protocol: d.protocol,
    vendor: d.vendor,
    displayName: d.displayName.trim(),
    emailDomains,
    jitEnabled: d.jitEnabled,
    defaultDeliveryRole: d.defaultDeliveryRole,
    defaultMembershipRole: d.defaultMembershipRole,
    samlEntityId: clean(d.samlEntityId),
    samlSsoUrl: clean(d.samlSsoUrl),
    samlCertificate: clean(d.samlCertificate),
    oidcIssuer: clean(d.oidcIssuer),
    oidcClientId: clean(d.oidcClientId),
    oidcDiscoveryUrl: clean(d.oidcDiscoveryUrl),
  };

  await db.identityProvider.upsert({
    where: { organizationId },
    update: { ...base, ...secretPatch },
    create: { organizationId, ...base, ...secretPatch, enabled: false, enforced: false },
  });

  await logSsoChange(organizationId, userId, 'upsert-config', {
    protocol: d.protocol,
    vendor: d.vendor,
    domains: emailDomains,
    secretRotated: newSecret !== null ? secretFingerprint(newSecret) : undefined,
  });
  return { ok: true };
});

// ─────────────────────────────────────────────────── metadata verification

const verifySchema = withOrg({
  samlMetadataXml: z.string().max(200000).optional(),
  oidcDiscoveryUrl: z.string().url().max(600).optional(),
});

type VerifyResult = { ok: true; summary: Record<string, string> } | { ok: false; error: string };

export const verifyIdpMetadata = withAction('verifyIdpMetadata', async (input: unknown): Promise<VerifyResult> => {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { organizationId } = parsed.data;
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;

  const idp = await db.identityProvider.findUnique({ where: { organizationId } });
  if (!idp) return { ok: false, error: 'Save the provider configuration first.' };

  const now = new Date();

  if (idp.protocol === 'SAML') {
    const xml = (parsed.data.samlMetadataXml ?? '').trim();
    if (!xml) return { ok: false, error: 'Paste the IdP SAML metadata XML to verify.' };
    const result = parseSamlMetadata(xml);
    if (!result.ok) return { ok: false, error: result.error };

    await db.identityProvider.update({
      where: { organizationId },
      data: {
        samlEntityId: result.value.entityId,
        samlSsoUrl: result.value.ssoUrl,
        samlCertificate: result.value.certificate,
        metadataFingerprint: result.value.fingerprint,
        lastVerifiedAt: now,
      },
    });
    await logSsoChange(organizationId, userId, 'verify-saml-metadata', {
      entityId: result.value.entityId,
      fingerprint: result.value.fingerprint,
    });
    return {
      ok: true,
      summary: {
        'Entity ID': result.value.entityId,
        'SSO URL': result.value.ssoUrl,
        'Certificate fingerprint': result.value.fingerprint.slice(0, 32) + '…',
      },
    };
  }

  // OIDC
  const url = (parsed.data.oidcDiscoveryUrl ?? idp.oidcDiscoveryUrl ?? '').trim();
  if (!url) return { ok: false, error: 'Enter the OIDC discovery URL to verify.' };
  const result = await fetchOidcDiscovery(url);
  if (!result.ok) return { ok: false, error: result.error };

  await db.identityProvider.update({
    where: { organizationId },
    data: {
      oidcDiscoveryUrl: url,
      oidcIssuer: result.value.issuer,
      oidcAuthEndpoint: result.value.authorizationEndpoint,
      oidcTokenEndpoint: result.value.tokenEndpoint,
      oidcJwksUri: result.value.jwksUri,
      metadataFingerprint: result.value.fingerprint,
      lastVerifiedAt: now,
    },
  });
  await logSsoChange(organizationId, userId, 'verify-oidc-discovery', {
    issuer: result.value.issuer,
    fingerprint: result.value.fingerprint,
  });
  return {
    ok: true,
    summary: {
      Issuer: result.value.issuer,
      'Authorization endpoint': result.value.authorizationEndpoint,
      'Token endpoint': result.value.tokenEndpoint,
      'JWKS URI': result.value.jwksUri,
    },
  };
});

// ─────────────────────────────────────────────────── enable / enforce

export const setIdpEnabled = withAction('setIdpEnabled', async (input: unknown): Promise<ActionResult> => {
  const parsed = withOrg({ enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const { organizationId } = parsed.data;
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;

  const idp = await db.identityProvider.findUnique({ where: { organizationId } });
  if (!idp) return { ok: false, error: 'No identity provider configured.' };
  if (parsed.data.enabled && !idp.lastVerifiedAt) {
    return { ok: false, error: 'Verify the IdP metadata before enabling federation.' };
  }

  await db.identityProvider.update({
    where: { organizationId },
    data: { enabled: parsed.data.enabled, ...(parsed.data.enabled ? {} : { enforced: false }) },
  });
  await logSsoChange(organizationId, userId, parsed.data.enabled ? 'enable' : 'disable');
  return { ok: true };
});

export const setIdpEnforced = withAction('setIdpEnforced', async (input: unknown): Promise<ActionResult> => {
  const parsed = withOrg({ enforced: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const { organizationId } = parsed.data;
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;

  const idp = await db.identityProvider.findUnique({ where: { organizationId } });
  if (!idp) return { ok: false, error: 'No identity provider configured.' };
  if (parsed.data.enforced) {
    if (!idp.enabled) return { ok: false, error: 'Enable federation before enforcing it.' };
    if (idp.emailDomains.length === 0) {
      return { ok: false, error: 'Add at least one email domain before enforcing SSO.' };
    }
  }

  await db.identityProvider.update({ where: { organizationId }, data: { enforced: parsed.data.enforced } });
  await logSsoChange(organizationId, userId, parsed.data.enforced ? 'enforce' : 'unenforce', {
    domains: idp.emailDomains,
  });
  return { ok: true };
});

export const deleteIdentityProvider = withAction('deleteIdentityProvider', async (organizationId: string): Promise<ActionResult> => {
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;
  const idp = await db.identityProvider.findUnique({ where: { organizationId }, select: { id: true } });
  if (!idp) return { ok: true };
  await db.identityProvider.delete({ where: { organizationId } });
  await logSsoChange(organizationId, userId, 'delete-config');
  return { ok: true };
});

// ─────────────────────────────────────────────────── group mappings

const mappingSchema = withOrg({
  claimValue: z.string().min(1).max(300),
  deliveryRole: z.enum(DELIVERY_ROLES),
  membershipRole: z.enum(MEMBERSHIP_ROLES),
  practiceId: z.string().optional(),
  priority: z.coerce.number().int().min(1).max(999),
});

export const upsertGroupMapping = withAction('upsertGroupMapping', async (input: unknown): Promise<ActionResult> => {
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const m = parsed.data;
  const { organizationId } = m;
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;

  const idp = await db.identityProvider.findUnique({ where: { organizationId }, select: { id: true } });
  if (!idp) return { ok: false, error: 'Save the provider configuration first.' };

  const practiceId = m.practiceId?.trim() || null;
  if (practiceId) {
    const practice = await db.practice.findFirst({ where: { id: practiceId, organizationId }, select: { id: true } });
    if (!practice) return { ok: false, error: 'Unknown practice.' };
  }

  await db.ssoGroupMapping.upsert({
    where: { identityProviderId_claimValue: { identityProviderId: idp.id, claimValue: m.claimValue.trim() } },
    update: {
      deliveryRole: m.deliveryRole,
      membershipRole: m.membershipRole,
      practiceId,
      priority: m.priority,
    },
    create: {
      identityProviderId: idp.id,
      organizationId,
      claimValue: m.claimValue.trim(),
      deliveryRole: m.deliveryRole,
      membershipRole: m.membershipRole,
      practiceId,
      priority: m.priority,
    },
  });
  await logSsoChange(organizationId, userId, 'upsert-group-mapping', {
    claim: m.claimValue.trim(),
    deliveryRole: m.deliveryRole,
  });
  return { ok: true };
});

export const deleteGroupMapping = withAction('deleteGroupMapping', async (organizationId: string, id: string): Promise<ActionResult> => {
  const auth = await authorizeSsoAction(organizationId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const userId = auth.actorId;
  const row = await db.ssoGroupMapping.findFirst({ where: { id, organizationId }, select: { claimValue: true } });
  await db.ssoGroupMapping.deleteMany({ where: { id, organizationId } });
  if (row) await logSsoChange(organizationId, userId, 'delete-group-mapping', { claim: row.claimValue });
  return { ok: true };
});
