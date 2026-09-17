/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Live SAML handshake orchestrator — v1.19.0. The two route handlers under
 * /api/auth/saml/* (login, acs) are thin: all of the actual SP-initiated
 * request-building, response validation, error classification, and
 * federated-login handoff lives here.
 *
 *   initiateSamlLogin(email, host)  — SP-initiated AuthnRequest, called
 *                                     from the public /login page.
 *   handleSamlAcsPost(...)          — validates the IdP's POSTed
 *                                     SAMLResponse and, on success, hands
 *                                     off to applyFederatedLogin (the same
 *                                     protocol-agnostic JIT seam OIDC will
 *                                     use later).
 *
 * Pre-session, cross-tenant-by-necessity (no org is resolved yet) — every
 * DB read/write here runs `runUnscoped`, exactly like the rest of the
 * pre-auth SSO path (identity-jit.ts, auth.ts's credentials authorize()).
 */
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';
import { buildSamlClient, spEntityId } from '@/lib/identity/saml-config';
import { findSamlIdpForEmail } from '@/lib/identity/lookup';
import { extractGroupClaims } from '@/lib/identity/mapping';
import { classifySamlThrown, classifyKnownRefusal, type ClassifiedSsoError } from '@/lib/identity/saml-errors';
import { applyFederatedLogin } from './identity-jit';

// ─────────────────────────────────────────────────────── SP-initiated login

export type InitiateSamlLoginResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Build the AuthnRequest redirect for the tenant whose SAML IdP owns this
 * email's domain. Deliberately vague on failure — a public, unauthenticated
 * endpoint should not reveal whether an email domain exists or is federated
 * beyond "SSO isn't available for that address"; the Ops Console error log
 * carries the specific reason for genuine handshake failures, not this
 * pre-flight lookup.
 */
export async function initiateSamlLogin(email: string, host: string | undefined): Promise<InitiateSamlLoginResult> {
  return runUnscoped('saml-initiate', async () => {
    const idp = await findSamlIdpForEmail(email);
    if (!idp) {
      return { ok: false, error: 'Single sign-on is not configured for this email address.' };
    }
    const client = buildSamlClient({
      organizationId: idp.organizationId,
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCertificate: idp.samlCertificate,
    });
    if (!client) {
      return { ok: false, error: 'Single sign-on is not configured for this email address.' };
    }
    try {
      // RelayState carries the tenant's organizationId — the ACS callback
      // has no session yet, so this is how it knows which tenant's IdP
      // config (and cache-provider scope) to validate the response against.
      // Tamper-resistant in practice: a forged RelayState pointing at a
      // different org still needs a response the FORGED org's stored
      // certificate actually validates, which an attacker cannot produce
      // without that org's IdP's private key.
      const redirectUrl = await client.getAuthorizeUrlAsync(idp.organizationId, host, {});
      return { ok: true, redirectUrl };
    } catch (err) {
      console.error('[saml-sso] getAuthorizeUrlAsync failed', err);
      return { ok: false, error: 'Could not start the single sign-on request. Please try again.' };
    }
  });
}

// ─────────────────────────────────────────────────────────────── ACS (SP)

export type SamlAcsResult =
  | { ok: true; userId: string; email: string; name: string | null; sessionVersion: number; membershipCreated: boolean }
  | { ok: false; organizationId: string | null; classified: ClassifiedSsoError };

/** Persist a failed attempt to the Ops Console troubleshooting log. A
 * failure with no resolvable organizationId (e.g. a missing/garbled
 * RelayState) has nowhere tenant-scoped to log to — it's still captured
 * via `console.error` for platform-level diagnosis. */
async function logFailure(organizationId: string | null, classified: ClassifiedSsoError, emailAttempted?: string) {
  if (!organizationId) {
    console.error('[saml-sso] ACS failure with no resolvable tenant', classified);
    return;
  }
  await runUnscoped('saml-acs-log-failure', () =>
    db.ssoLoginError.create({
      data: {
        organizationId,
        category: classified.category,
        humanMessage: classified.humanMessage,
        rawDetail: classified.rawDetail,
        emailAttempted: emailAttempted ?? null,
      },
    })
  ).catch((err) => console.error('[saml-sso] failed to write SsoLoginError', err));
}

export async function handleSamlAcsPost(samlResponse: string, relayState: string): Promise<SamlAcsResult> {
  const organizationId = (relayState ?? '').trim();
  if (!organizationId) {
    const classified = classifyKnownRefusal('no-relay-state');
    await logFailure(null, classified);
    return { ok: false, organizationId: null, classified };
  }

  return runUnscoped('saml-acs', async () => {
    const idp = await db.identityProvider.findUnique({ where: { organizationId } });
    if (!idp) {
      const classified = classifyKnownRefusal('no-idp', `organizationId=${organizationId}`);
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }
    if (idp.protocol !== 'SAML') {
      const classified = classifyKnownRefusal('not-saml');
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }
    if (!idp.enabled) {
      const classified = classifyKnownRefusal('idp-disabled');
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }

    const client = buildSamlClient({
      organizationId,
      samlEntityId: idp.samlEntityId,
      samlSsoUrl: idp.samlSsoUrl,
      samlCertificate: idp.samlCertificate,
    });
    if (!client) {
      const classified = classifyKnownRefusal('no-idp', 'metadata not verified (missing SSO URL / certificate)');
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }

    let profile: import('@node-saml/node-saml').Profile | null;
    try {
      const result = await client.validatePostResponseAsync({ SAMLResponse: samlResponse, RelayState: relayState });
      profile = result.profile;
    } catch (err) {
      const classified = classifySamlThrown(err);
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }

    if (!profile || !profile.nameID) {
      const classified = classifyKnownRefusal('no-name-id');
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }

    // node-saml's `idpIssuer` config option does NOT check this for the
    // login path (only for SLO — see saml-config.ts's comment), so the
    // cross-check the whole rest of this flow relies on ("this assertion
    // really came from the IdP verified and stored for THIS tenant, not
    // just any assertion this tenant's certificate happens to validate")
    // is done here, explicitly, against the verified profile.
    if (idp.samlEntityId && profile.issuer !== idp.samlEntityId) {
      const classified = classifyKnownRefusal(
        'issuer-mismatch',
        `Expected: ${idp.samlEntityId} Received: ${profile.issuer}`
      );
      await logFailure(organizationId, classified);
      return { ok: false, organizationId, classified };
    }

    const email = (profile.email ?? profile.mail ?? profile.nameID).toLowerCase().trim();
    const groups = extractGroupClaims(profile as Record<string, unknown>);

    const outcome = await applyFederatedLogin({
      organizationId,
      email,
      name: (profile['displayName'] as string | undefined) ?? (profile['name'] as string | undefined) ?? null,
      groups,
    });

    if (!outcome.ok) {
      const classified = classifyKnownRefusal(
        outcome.reason === 'no-idp' ? 'no-idp' : outcome.reason === 'idp-disabled' ? 'idp-disabled' : 'no-tenant-access',
        outcome.message
      );
      await logFailure(organizationId, classified, email);
      return { ok: false, organizationId, classified };
    }

    const user = await db.user.findUnique({
      where: { id: outcome.userId },
      select: { email: true, name: true, sessionVersion: true },
    });
    if (!user) {
      // Vanishingly unlikely (the user row was just created/updated in the
      // same call) — but never assume; fail the login rather than mint a
      // session for an id we can no longer read back.
      const classified = classifyKnownRefusal('no-tenant-access', 'user vanished immediately after provisioning');
      await logFailure(organizationId, classified, email);
      return { ok: false, organizationId, classified };
    }

    return {
      ok: true,
      userId: outcome.userId,
      email: user.email,
      name: user.name,
      sessionVersion: user.sessionVersion,
      membershipCreated: outcome.membershipCreated,
    };
  });
}

/** Exposed for the SP metadata route. */
export { spEntityId };
