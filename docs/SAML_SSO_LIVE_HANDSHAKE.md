# Enterprise SAML SSO — Live Handshake — PS-DOS™

_Introduced v1.19.0._ How a PS-DOS tenant's corporate identity provider
(Azure AD / Entra ID, Okta, Google Workspace, or any conformant SAML 2.0
IdP) actually signs a user in — the follow-on to the identity-federation
*configuration* layer shipped in v1.2.0 (`docs/` — see
`identity-federation` in the project memory / README Phase 3c), which
built everything up to "a verified identity in hand" but left the real
IdP redirect, signature validation, and session mint as a deliberate
follow-on. This document is that follow-on.

---

## 1. What was already there, and what this adds

| Layer | Since | This release |
| --- | --- | --- |
| `IdentityProvider` / `SsoGroupMapping` schema, Ops Console configuration panel, metadata parsing & verification | v1.2.0 | unchanged |
| JIT provisioning decision core (`src/lib/identity/jit.ts`, `mapping.ts`) and orchestrator (`src/server/services/identity-jit.ts#applyFederatedLogin`) | v1.2.0 | unchanged — this release is its first real caller |
| **The actual redirect to the IdP, cryptographic signature validation, and session mint** | — | **new** |

`applyFederatedLogin` was always protocol-agnostic: it takes an
already-verified `{ organizationId, email, name, groups }` and does the
provisioning. Every piece of this release exists to get from "a raw
SAMLResponse arrived at an HTTP endpoint" to that one verified-identity
call.

---

## 2. The handshake, end to end

```
 tenant user                     PS-DOS (SP)                          corporate IdP
 ───────────                     ───────────                          ─────────────
 clicks "Continue     GET /api/auth/saml/login?email=…
 with SSO" on /login  ─────────────────────────────────▶
                       findSamlIdpForEmail(email) resolves
                       the tenant by domain; builds a signed
                       AuthnRequest (node-saml), stores its
                       request id in saml_auth_requests
                       (RelayState = organizationId)
                       ◀── 303 redirect to the IdP's SSO URL ──
                                                          user authenticates
                                                          at their real IdP
                       POST /api/auth/saml/acs
                       (SAMLResponse, RelayState)
                       ◀─────────────────────────────────────
                       1. resolve tenant from RelayState
                       2. build a SAML client scoped to
                          THAT tenant's stored cert/SSO URL
                       3. node-saml validates: XML digital
                          signature, Conditions window,
                          Audience, InResponseTo (consumes
                          the cached request — replay-proof)
                       4. explicit Issuer cross-check against
                          the tenant's stored samlEntityId
                       5. applyFederatedLogin(...) — JIT
                          provisioning, role resolved from
                          group claims
                       6. establishFreshSession(...) — mints
                          the same NextAuth session cookie a
                          password login gets
                       303 redirect to /launch
                       ─────────────────────────────────▶
```

Every step that can fail writes a categorized `SsoLoginError` row (§4) and
redirects back to `/login?ssoError=<code>` with a specific, human-readable
message — never a raw exception surfaced to the user or left unlogged for
the tenant's admin.

---

## 3. Security properties

### 3.1 Signature validation — a library, not hand-rolled XML parsing

`@node-saml/node-saml` (the maintained successor to `passport-saml`) does
the actual cryptographic work: parses the response, locates the `Signature`
element, verifies it against the certificate on file for that specific
tenant (`IdentityProvider.samlCertificate` — never anything embedded in the
XML itself, which would let an attacker just declare their own key), checks
the `Conditions` validity window, and checks the `AudienceRestriction`
against this SP's entity id. None of that is reimplemented in this codebase
— `src/lib/identity/saml-config.ts` only builds the configuration object.

**Tested against real cryptography, not mocks.**
`tests/identity-saml-handshake.test.ts` generates an actual RSA keypair and
self-signed X.509 certificate, hand-signs a SAML assertion with it, and
feeds the result through the exact `validatePostResponseAsync` call the
live ACS route makes. It proves — not assumes — that a tampered assertion
is rejected, an expired one is rejected, a wrong-issuer one is rejected,
and a correctly signed one provisions the user. This is the same
discipline as the live-network test in the v1.18.0 integration-adapters
work: a mock would have proven nothing about whether this app's own
configuration (audience string, ACS URL, certificate format) actually
lines up with what a real IdP interaction produces.

### 3.2 Replay protection — database-backed, not in-memory

node-saml ships an in-memory `CacheProvider` by default, which is wrong for
a serverless deployment: the `/login` invocation that generates a request
id and the `/acs` invocation that validates it minutes later can land on
different instances with no shared memory. `src/lib/identity/
saml-cache-provider.ts` implements the same `CacheProvider` interface
against the new `SamlAuthRequest` table instead — durable, and the
`removeAsync` that consumes a request on first use is what makes a
resubmitted SAMLResponse fail the second time (`REPLAY_DETECTED`).

**A real bug this test discipline caught before shipping:** the first
version of `removeAsync` deleted a row by `requestId` alone and checked
tenant ownership only *after* the delete had already happened — so a
caller scoped to the wrong tenant (having somehow obtained another
tenant's `requestId`) could still delete that tenant's row, a cross-tenant
denial-of-service against their in-flight sign-in. `tests/
identity-saml-cache-provider.test.ts`'s tenant-isolation test caught this
directly; the fix scopes the delete itself to `(requestId, organizationId)`
via `deleteMany`, never a delete-then-check.

### 3.3 The Issuer check node-saml *doesn't* do for you

`node-saml`'s `idpIssuer` config option exists and looks like it protects
the login path — it doesn't. Reading the library's source
(`verifyIssuer`) shows it's only called from the SAML *logout* flow
(`verifyLogoutRequest` / `verifyLogoutResponse`), never from
`validatePostResponseAsync`. Relying on it for login would have been a
silent gap: this release found that during its own testing (the
"different IdP" test case in `identity-saml-handshake.test.ts` passed
`ok: true` when it should have failed) and added an explicit check in
`src/server/services/saml-sso.ts` — compare the verified assertion's
`Issuer` against the tenant's stored `samlEntityId` after
`validatePostResponseAsync` returns. This is defense-in-depth on top of
the real security boundary (the signature must validate against the
tenant's own stored certificate) — it mainly catches an admin
misconfiguration (the wrong certificate saved for a tenant), since an
actual attacker without that tenant's IdP's private key cannot produce a
validating signature regardless of what `Issuer` they claim.

### 3.4 Tenant isolation

Both new tables (`saml_auth_requests`, `sso_login_errors`) carry
`organizationId`, are registered in `DIRECT_ORG_MODELS`, and carry their
own `tenant_isolation` RLS policy (migration 27, extending migration 17's
policy set — the same pattern the v1.18.0 integration tables used in
migration 26). Every DB call in the pre-session SSO path runs
`runUnscoped` (no session/org context exists yet), pinned explicitly to
the `organizationId` resolved from the (signature-verified) response's
RelayState.

---

## 4. Ops Console — Identity Federation panel (`/ops/identity`)

Two additions to the existing per-tenant configuration panel:

- **PS-DOS Service Provider details** — the SP Entity ID, ACS URL, and SP
  metadata URL, each one-click copyable, so an IdP admin can finish the
  other half of trust setup without hunting through documentation. One SP
  identity is shared across every PS-DOS tenant (the standard multi-tenant
  SaaS pattern); what's tenant-specific is which IdP that shared SP trusts.
- **Recent federated sign-in failures** — every `SsoLoginError` for the
  selected tenant, newest first, in the same plain-language style as the
  External Integrations dashboard's error log (`docs/
  INTEGRATION_ADAPTERS.md` §4): a category chip, a specific actionable
  message, and an expandable raw-detail line — never a stack trace.

---

## 5. v1 scope — what this does NOT do yet

- **OIDC has no live handshake yet.** The configuration layer supports
  OIDC (discovery-URL verification, client id/secret storage), but the
  authorization-code redirect + token exchange + JWKS verification is not
  built — only SAML's live handshake shipped this release.
  `applyFederatedLogin` is already protocol-agnostic, so an OIDC handshake
  is additive, not a rework.
- **Single Logout (SLO) is not implemented.** node-saml supports it
  (`getLogoutUrlAsync` / `validatePostRequestAsync` for logout messages);
  this release only wires the login path. Signing out of PS-DOS does not
  propagate to the IdP.
- **No IdP-initiated flow.** Only SP-initiated (the user starts at
  PS-DOS's `/login`) is supported. An IdP-initiated POST straight to the
  ACS endpoint (no prior `/login` redirect, so no cached request id) is
  rejected as `REPLAY_DETECTED` / "InResponseTo is missing" — by design,
  for now; supporting it is a deliberate follow-up (it changes the replay
  model, since there's no SP-generated request to check against).
- **No encrypted assertions.** `decryptionPvk` is not configured — an IdP
  set to encrypt assertions (uncommon; most send signed-but-unencrypted)
  is not yet supported.
- **Production untouched.** Migration 27 is applied to staging only;
  production's identity-federation *configuration* has been live since
  v1.2.0, but no tenant has the live handshake enabled until an operator
  configures and verifies SAML metadata for them.
