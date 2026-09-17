import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { generate as generateSelfSigned } from 'selfsigned';
import { SignedXml } from 'xml-crypto';
import { db } from '@/lib/db';
import { buildSamlClient, spEntityId, acsUrl } from '@/lib/identity/saml-config';
import { makeSamlCacheProvider } from '@/lib/identity/saml-cache-provider';
import { handleSamlAcsPost } from '@/server/services/saml-sso';
import { normalizeCertificate } from '@/lib/identity/metadata';

/**
 * Live cryptographic round-trip for the SAML ACS handshake — v1.19.0.
 *
 * Everything else in this feature's test coverage (saml-errors classifier,
 * cache-provider tenant isolation) exercises MY code against mocked or
 * synthetic inputs. This file is the one that proves the actual signature
 * validation works end to end: it generates a real RSA keypair + X.509
 * certificate (selfsigned), hand-builds a genuine signed SAML Response the
 * same shape a real IdP (Okta/Entra/generic) would send, and feeds it
 * through the exact same `validatePostResponseAsync` call the live ACS
 * route makes — no mocking of node-saml or xml-crypto.
 *
 * This is exactly the kind of test that caught a real bug in the
 * integration-adapters work (a live network test, not a mocked one) — a
 * hand-rolled mock of "signature valid" would prove nothing about whether
 * this app's SAML config (idpCert format, audience, InResponseTo wiring)
 * actually lines up with what node-saml expects from a real assertion.
 */

async function demoOrgId(): Promise<string> {
  const org = await db.organization.findFirst({ where: { slug: 'a2r-ventures-demo' }, select: { id: true } });
  if (!org) throw new Error('demo org not seeded — run prisma/seed.ts against this DB first');
  return org.id;
}

const TEST_IDP_ISSUER = 'https://saml-handshake-test.example/idp';
const TEST_EMAIL = 'saml-handshake-test-user@a2r-saml-handshake-test.example';

let keys: { private: string; cert: string };
let organizationId: string;
const createdUserIds: string[] = [];
// Tracked precisely (not a blanket organizationId sweep) — this test file
// shares the demo org with tests/identity-saml-cache-provider.test.ts,
// which vitest may run concurrently in a different worker against the
// same staging DB. A org-wide `deleteMany` in afterAll raced and deleted
// that file's in-flight rows out from under it (caught via the full-suite
// run, not the isolated one) — delete only the exact rows this file made.
const createdRequestIds: string[] = [];

beforeAll(async () => {
  keys = await generateSelfSigned([{ name: 'commonName', value: 'saml-handshake-test-idp' }], {
    keySize: 2048,
    algorithm: 'sha256',
  });
  organizationId = await demoOrgId();
  await db.identityProvider.upsert({
    where: { organizationId },
    update: {
      protocol: 'SAML',
      enabled: true,
      emailDomains: ['a2r-saml-handshake-test.example'],
      samlEntityId: TEST_IDP_ISSUER,
      samlSsoUrl: 'https://saml-handshake-test.example/idp/sso',
      samlCertificate: normalizeCertificate(keys.cert),
      lastVerifiedAt: new Date(),
    },
    create: {
      organizationId,
      protocol: 'SAML',
      vendor: 'GENERIC',
      displayName: 'SAML handshake test fixture',
      enabled: true,
      jitEnabled: true,
      defaultDeliveryRole: 'PROJECT_MANAGER',
      emailDomains: ['a2r-saml-handshake-test.example'],
      samlEntityId: TEST_IDP_ISSUER,
      samlSsoUrl: 'https://saml-handshake-test.example/idp/sso',
      samlCertificate: normalizeCertificate(keys.cert),
      lastVerifiedAt: new Date(),
    },
  });
});

afterAll(async () => {
  if (createdUserIds.length) {
    await db.membership.deleteMany({ where: { userId: { in: createdUserIds }, organizationId } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdRequestIds.length) {
    await db.samlAuthRequest.deleteMany({ where: { requestId: { in: createdRequestIds } } });
  }
  // SsoLoginError rows are left in place, deliberately — this table has no
  // natural per-test-row handle to track precisely (unlike samlAuthRequest's
  // requestId), and it's an accumulating diagnostic log by design: a
  // handful of test-fixture rows in the demo org are harmless, and no test
  // anywhere asserts an exact row count against it.
  await db.identityProvider.deleteMany({ where: { organizationId } });
});

/** Register a fresh SP-initiated request in the DB-backed cache, exactly
 * like /api/auth/saml/login does via node-saml's own `saveAsync` — the
 * value format (an ISO timestamp string) mirrors what node-saml itself
 * writes in generateAuthorizeRequestAsync. */
async function registerOutstandingRequest(requestId: string): Promise<void> {
  await makeSamlCacheProvider(organizationId).saveAsync(requestId, new Date().toISOString());
  createdRequestIds.push(requestId);
}

/** Hand-build a signed SAML 2.0 Response the way a real IdP would send one
 * via the HTTP-POST binding: an Assertion signed with an enveloped
 * signature (exclusive c14n, sha256), Conditions / AudienceRestriction /
 * SubjectConfirmationData wired to this SP's real entity id, ACS URL, and
 * the given InResponseTo. Returns the base64-encoded XML exactly as it
 * would arrive in the SAMLResponse form field. */
function buildSignedSamlResponse(opts: {
  inResponseTo: string;
  email?: string;
  issuer?: string;
  audience?: string;
  group?: string;
  notOnOrAfterMs?: number; // override for the expired-assertion test
  tamperAfterSigning?: boolean; // flip a byte post-signature for the invalid-signature test
}): string {
  const now = Date.now();
  const issueInstant = new Date(now).toISOString();
  const notBefore = new Date(now - 60_000).toISOString();
  const conditionsNotOnOrAfter = new Date(opts.notOnOrAfterMs ?? now + 5 * 60_000).toISOString();
  // Deliberately independent of Conditions' window: node-saml checks
  // SubjectConfirmationData's own NotOnOrAfter first (as part of matching
  // a valid SubjectConfirmation) — an expired one is silently skipped as
  // "no valid confirmation found" rather than surfacing as the specific
  // expired-assertion error this file's test is trying to isolate. Always
  // valid here; the expired-assertion test overrides Conditions instead.
  const subjectConfirmationNotOnOrAfter = new Date(now + 5 * 60_000).toISOString();
  const responseId = `_${randomUUID()}`;
  const assertionId = `_${randomUUID()}`;
  const issuer = opts.issuer ?? TEST_IDP_ISSUER;
  const audience = opts.audience ?? spEntityId();
  const email = opts.email ?? TEST_EMAIL;

  const assertionXml =
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" IssueInstant="${issueInstant}" Version="2.0">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${email}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData NotOnOrAfter="${subjectConfirmationNotOnOrAfter}" Recipient="${acsUrl()}" InResponseTo="${opts.inResponseTo}"/>` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${conditionsNotOnOrAfter}">` +
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${issueInstant}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `<saml:AttributeStatement>` +
    `<saml:Attribute Name="groups"><saml:AttributeValue>${opts.group ?? 'PS-DOS-Delivery-Leads'}</saml:AttributeValue></saml:Attribute>` +
    `</saml:AttributeStatement>` +
    `</saml:Assertion>`;

  const sig = new SignedXml({
    privateKey: keys.private,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: `//*[local-name(.)='Assertion' and @ID='${assertionId}']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  sig.computeSignature(assertionXml, {
    location: { reference: "//*[local-name(.)='Issuer']", action: 'after' },
  });
  let signedAssertionXml = sig.getSignedXml();

  if (opts.tamperAfterSigning) {
    // Flip the NameID's email after signing — same class of attack the
    // signature is supposed to catch: modify signed content post-hoc.
    signedAssertionXml = signedAssertionXml.replace(email, `attacker-${email}`);
  }

  const responseXml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${responseId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${acsUrl()}" InResponseTo="${opts.inResponseTo}">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    signedAssertionXml +
    `</samlp:Response>`;

  return Buffer.from(responseXml, 'utf8').toString('base64');
}

describe('SAML ACS live handshake', () => {
  it('buildSamlClient constructs a client for a fully-configured tenant', async () => {
    const idp = await db.identityProvider.findUniqueOrThrow({ where: { organizationId } });
    const client = buildSamlClient({
      organizationId,
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCertificate: idp.samlCertificate,
    });
    expect(client).not.toBeNull();
  });

  it('accepts a genuinely signed, well-formed assertion: verifies the signature, applies JIT provisioning, and returns the identity', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId });

    const result = await handleSamlAcsPost(samlResponse, organizationId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.membershipCreated).toBe(true);
    createdUserIds.push(result.userId);

    const membership = await db.membership.findUnique({
      where: { userId_organizationId: { userId: result.userId, organizationId } },
    });
    expect(membership?.provisionedVia).toBe('SSO_JIT');
  }, 20_000); // JIT provisioning is several sequential DB round trips — staging pooler latency (documented elsewhere in this suite) needs headroom past vitest's 5s default.

  it('rejects a replay of the same response — the InResponseTo was already consumed', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId });

    const first = await handleSamlAcsPost(samlResponse, organizationId);
    expect(first.ok).toBe(true);
    if (first.ok) createdUserIds.push(first.userId);

    const second = await handleSamlAcsPost(samlResponse, organizationId);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.classified.category).toBe('REPLAY_DETECTED');
  }, 20_000);

  it('rejects a tampered assertion — signature no longer validates', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId, tamperAfterSigning: true });

    const result = await handleSamlAcsPost(samlResponse, organizationId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classified.category).toBe('INVALID_SIGNATURE');
  });

  it('rejects an assertion whose Conditions window has already expired', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId, notOnOrAfterMs: Date.now() - 60_000 });

    const result = await handleSamlAcsPost(samlResponse, organizationId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classified.category).toBe('EXPIRED_ASSERTION');
  });

  it('rejects an assertion issued by a different IdP than the one configured for this tenant', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId, issuer: 'https://not-the-configured-idp.example' });

    const result = await handleSamlAcsPost(samlResponse, organizationId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classified.category).toBe('ISSUER_MISMATCH');
  });

  it('rejects a response with no outstanding request — InResponseTo was never issued', async () => {
    const neverIssuedRequestId = `_${randomUUID()}`;
    const samlResponse = buildSignedSamlResponse({ inResponseTo: neverIssuedRequestId });

    const result = await handleSamlAcsPost(samlResponse, organizationId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.classified.category).toBe('REPLAY_DETECTED');
  });

  it('every failure writes a human-readable SsoLoginError row for the Ops Console log', async () => {
    const requestId = `_${randomUUID()}`;
    await registerOutstandingRequest(requestId);
    const samlResponse = buildSignedSamlResponse({ inResponseTo: requestId, tamperAfterSigning: true });
    await handleSamlAcsPost(samlResponse, organizationId);

    const rows = await db.ssoLoginError.findMany({
      where: { organizationId, category: 'INVALID_SIGNATURE' },
      orderBy: { occurredAt: 'desc' },
      take: 1,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.humanMessage).not.toMatch(/\bat\s+\S+\.js:\d+/); // never a stack trace
  });
});
