/**
 * Enterprise-flow integration tests — compose the pure decision engines the
 * way the running app does, and assert the observable outcome of each
 * flow the QA framework must cover:
 *
 *   1. role-based landing resolution
 *   2. multi-role workspace (perspective) switching
 *   3. governance template application — Standard / Agile / Board-Only
 *   4. financial data masking for delivery roles
 *   5. Ops Console SSO configuration → federated login
 *
 * No I/O — every engine below is pure, which is exactly why the app can
 * trust them at request time.
 */
import { describe, it, expect } from 'vitest';
import { DELIVERY_ROLES, type DeliveryRole } from '../src/lib/auth/rbac';
import {
  availableLenses,
  landingFor,
  resolveLens,
  type LensViewerContext,
} from '../src/lib/workspace/lenses';
import {
  DEFAULT_GOVERNANCE,
  GOVERNABLE_MODULES,
  applyTemplate,
  hiddenHrefs,
  isModuleHidden,
  isPathHidden,
  resolveStoredGovernance,
  withOverrides,
  type ResolvedGovernanceConfig,
} from '../src/lib/governance/config';
import {
  MASK,
  canViewCostRates,
  canViewMargins,
  financialVisibility,
  maskMoney,
  maskPct,
  maskRateRolesForViewer,
  restrictedNoticeFor,
} from '../src/lib/security/masking';
import { parseSamlMetadata, validateOidcDiscovery } from '../src/lib/identity/metadata';
import { emailMatchesDomains } from '../src/lib/identity/vendors';
import { encryptSecret, decryptSecret, secretFingerprint } from '../src/lib/identity/crypto';
import { resolveFederatedRole, extractGroupClaims, type GroupMappingRule } from '../src/lib/identity/mapping';
import { computeJitOutcome } from '../src/lib/identity/jit';

process.env.NEXTAUTH_SECRET ||= 'enterprise-flows-test-secret';

// =====================================================================
// 1. Role-based landing resolution
// =====================================================================

/** What the /launch dispatcher returns for a viewer with the given cookie. */
function landingRouteFor(ctx: LensViewerContext, storedCookie: string | null = null): string {
  return landingFor(resolveLens(storedCookie, ctx));
}

describe('Enterprise flow · role-based landing resolution', () => {
  const cases: [DeliveryRole, string][] = [
    ['ADMIN', '/'],
    ['VP_EXECUTIVE', '/steerco'],
    ['PRACTICE_DIRECTOR', '/'],
    ['DELIVERY_MANAGER', '/'],
    ['PROJECT_MANAGER', '/'],
  ];

  it.each(cases)('a fresh %s sign-in lands on %s', (role, route) => {
    expect(landingRouteFor({ deliveryRole: role, isA2rStaff: false })).toBe(route);
  });

  it('an A2R staff member who also holds a tenant membership still lands per their delivery role', () => {
    expect(landingRouteFor({ deliveryRole: 'PROJECT_MANAGER', isA2rStaff: true })).toBe('/');
  });

  it('every role resolves to a real in-app landing route', () => {
    for (const role of DELIVERY_ROLES) {
      const route = landingRouteFor({ deliveryRole: role, isA2rStaff: false });
      expect(route.startsWith('/')).toBe(true);
    }
  });

  it('a saved perspective wins over the role default at landing time', () => {
    const admin: LensViewerContext = { deliveryRole: 'ADMIN', isA2rStaff: false };
    expect(landingRouteFor(admin)).toBe('/'); // default
    expect(landingRouteFor(admin, 'executive')).toBe('/steerco');
    expect(landingRouteFor(admin, 'operations')).toBe('/command');
  });
});

// =====================================================================
// 2. Multi-role workspace (perspective) switching
// =====================================================================

describe('Enterprise flow · multi-role workspace switching', () => {
  const admin: LensViewerContext = { deliveryRole: 'ADMIN', isA2rStaff: false };
  const pd: LensViewerContext = { deliveryRole: 'PRACTICE_DIRECTOR', isA2rStaff: false };
  const pm: LensViewerContext = { deliveryRole: 'PROJECT_MANAGER', isA2rStaff: false };

  it('an admin can switch between all four perspectives, each with a distinct landing', () => {
    const lenses = availableLenses(admin);
    expect(lenses).toEqual(['executive', 'delivery', 'finance', 'operations']);
    const routes = lenses.map(landingFor);
    expect(new Set(routes).size).toBe(4);
  });

  it('a Project Manager only gets Delivery + Operations; a stale/tampered cookie is ignored', () => {
    expect(availableLenses(pm)).toEqual(['delivery', 'operations']);
    expect(resolveLens('finance', pm)).toBe('delivery');
    expect(resolveLens('executive', pm)).toBe('delivery');
    expect(resolveLens('not-a-real-lens', pm)).toBe('delivery');
  });

  it('turning on Strict Financial Governance revokes a Practice Director’s Finance perspective mid-session', () => {
    expect(availableLenses(pd)).toContain('finance');
    expect(resolveLens('finance', pd)).toBe('finance');

    const strict = applyTemplate('STRICT_FINANCIAL');
    const pdStrict: LensViewerContext = {
      ...pd,
      maskFinancialsForDelivery: strict.maskFinancialsForDelivery,
    };

    expect(availableLenses(pdStrict)).not.toContain('finance');
    // the PD's stored 'finance' choice now collapses to the role default
    expect(resolveLens('finance', pdStrict)).toBe('delivery');
  });

  it('an A2R operator viewing a tenant gets every perspective regardless of delivery tier', () => {
    expect(availableLenses({ deliveryRole: 'PROJECT_MANAGER', isA2rStaff: true })).toEqual([
      'executive',
      'delivery',
      'finance',
      'operations',
    ]);
  });
});

// =====================================================================
// 3. Governance template application
// =====================================================================

/** Apply a template, then reload it through the same normaliser the DB
 * loader (getGovernanceConfig) runs — with a deliberately stale label. */
function applyAndReload(key: 'STANDARD' | 'AGILE_DELIVERY' | 'BOARD_ONLY'): ResolvedGovernanceConfig {
  const resolved = applyTemplate(key);
  return resolveStoredGovernance({
    template: 'CUSTOM',
    hiddenModules: resolved.hiddenModules,
    maskFinancialsForDelivery: resolved.maskFinancialsForDelivery,
  });
}

describe('Enterprise flow · governance template application', () => {
  it('Standard Delivery — nothing hidden, standard masking', () => {
    const g = applyAndReload('STANDARD');
    expect(g.template).toBe('STANDARD');
    expect(g.hiddenModules).toEqual([]);
    expect(hiddenHrefs(g)).toEqual([]);
    expect(g.maskFinancialsForDelivery).toBe(false);
  });

  it('Agile Delivery — hides Commercial Baseline + Executive Hub, scrubs delivery financials', () => {
    const g = applyAndReload('AGILE_DELIVERY');
    expect(g.template).toBe('AGILE_DELIVERY');
    expect(new Set(g.hiddenModules)).toEqual(new Set(['commercial-baseline', 'reports']));
    expect(hiddenHrefs(g).sort()).toEqual(['/commercial-baseline', '/reports']);
    // a deep link into a hidden module is flagged; a still-visible one isn't
    expect(isPathHidden(g, '/commercial-baseline/proj-123')).toBe(true);
    expect(isPathHidden(g, '/reports')).toBe(true);
    expect(isPathHidden(g, '/financials/proj-123')).toBe(false);
    expect(g.maskFinancialsForDelivery).toBe(true);
  });

  it('Board-Only — only briefing / portfolio / reporting / audit survive; the board still sees financials', () => {
    const g = applyAndReload('BOARD_ONLY');
    expect(g.template).toBe('BOARD_ONLY');
    const stillVisible = GOVERNABLE_MODULES.filter((m) => !isModuleHidden(g, m.key))
      .map((m) => m.key)
      .sort();
    expect(stillVisible).toEqual(['admin', 'audit', 'audit-log', 'control-tower', 'reports', 'steerco']);
    // core modules are never hidden, even by a template
    expect(isModuleHidden(g, 'control-tower')).toBe(false);
    expect(isModuleHidden(g, 'admin')).toBe(false);
    expect(g.maskFinancialsForDelivery).toBe(false);
  });

  it('a hand override on top of a template flips the label to Custom, and reverts cleanly', () => {
    const board = applyTemplate('BOARD_ONLY');
    const unhidFinancials = withOverrides(board, {
      hiddenModules: board.hiddenModules.filter((k) => k !== 'financials'),
    });
    expect(unhidFinancials.template).toBe('CUSTOM');
    expect(isModuleHidden(unhidFinancials, 'financials')).toBe(false);

    const reverted = withOverrides(unhidFinancials, { hiddenModules: board.hiddenModules });
    expect(reverted.template).toBe('BOARD_ONLY');
  });

  it('every template round-trips: applyTemplate → resolveStoredGovernance detects the same label', () => {
    for (const key of ['STANDARD', 'STRICT_FINANCIAL', 'AGILE_DELIVERY', 'BOARD_ONLY'] as const) {
      const g = applyTemplate(key);
      expect(resolveStoredGovernance(g).template).toBe(key);
    }
  });
});

// =====================================================================
// 4. Financial data masking for delivery roles
// =====================================================================

describe('Enterprise flow · financial data masking for delivery roles', () => {
  const STANDARD = DEFAULT_GOVERNANCE;
  const STRICT = applyTemplate('STRICT_FINANCIAL');

  it('the standard role-based visibility tiers', () => {
    expect(financialVisibility('ADMIN', STANDARD)).toBe('full');
    expect(financialVisibility('VP_EXECUTIVE', STANDARD)).toBe('summary');
    expect(financialVisibility('PRACTICE_DIRECTOR', STANDARD)).toBe('summary');
    expect(financialVisibility('DELIVERY_MANAGER', STANDARD)).toBe('restricted');
    expect(financialVisibility('PROJECT_MANAGER', STANDARD)).toBe('restricted');
  });

  it('Strict Financial Governance pushes the Practice Director down to restricted; execs untouched', () => {
    expect(financialVisibility('ADMIN', STRICT)).toBe('full');
    expect(financialVisibility('VP_EXECUTIVE', STRICT)).toBe('summary');
    expect(financialVisibility('PRACTICE_DIRECTOR', STRICT)).toBe('restricted');
    expect(canViewMargins('PRACTICE_DIRECTOR', STRICT)).toBe(false);
    expect(canViewMargins('VP_EXECUTIVE', STRICT)).toBe(true);
  });

  it('a restricted viewer sees masked figures and the Partner-only notice', () => {
    const canView = canViewMargins('PROJECT_MANAGER', STANDARD);
    expect(canView).toBe(false);
    expect(maskMoney(1_430_428, canView)).toBe(MASK);
    expect(maskPct(37.5, canView)).toBe(MASK);
    expect(restrictedNoticeFor(financialVisibility('PROJECT_MANAGER', STANDARD))).toMatch(
      /restricted to Partners/i
    );
  });

  it('the server strips rate-card numbers from a restricted viewer’s payload before it leaves the server', () => {
    const roles = [{ id: 'r1', name: 'Lead Architect', billRate: 288, costRate: 181 }];
    // PD under Standard keeps the numbers — the engine needs them for margin math
    expect(maskRateRolesForViewer(roles, 'PRACTICE_DIRECTOR', STANDARD)[0]!.costRate).toBe(181);
    // PD under Strict: zeroed in the payload
    const strippedPd = maskRateRolesForViewer(roles, 'PRACTICE_DIRECTOR', STRICT)[0]!;
    expect(strippedPd.costRate).toBe(0);
    expect(strippedPd.billRate).toBe(0);
    expect(strippedPd.name).toBe('Lead Architect'); // non-sensitive fields kept
  });

  it('raw cost rates stay Partner-only regardless of the governance template', () => {
    for (const g of [STANDARD, STRICT]) {
      expect(canViewCostRates('ADMIN', g)).toBe(true);
      expect(canViewCostRates('VP_EXECUTIVE', g)).toBe(false);
      expect(canViewCostRates('PRACTICE_DIRECTOR', g)).toBe(false);
    }
  });
});

// =====================================================================
// 5. Ops Console SSO configuration → federated login
// =====================================================================

const SAML_METADATA = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sts.windows.net/contoso-tenant/">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data>
        <ds:X509Certificate>MIID${'B'.repeat(320)}</ds:X509Certificate>
      </ds:X509Data></ds:KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://login.microsoftonline.com/contoso-tenant/saml2"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

describe('Enterprise flow · Ops Console SSO configuration', () => {
  it('an operator verifies Contoso Azure AD SAML metadata', () => {
    const r = parseSamlMetadata(SAML_METADATA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entityId).toBe('https://sts.windows.net/contoso-tenant/');
    expect(r.value.ssoUrl).toBe('https://login.microsoftonline.com/contoso-tenant/saml2');
    expect(r.value.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('or verifies an OIDC discovery document', () => {
    const r = validateOidcDiscovery({
      issuer: 'https://login.microsoftonline.com/contoso/v2.0',
      authorization_endpoint: 'https://login.microsoftonline.com/contoso/oauth2/v2.0/authorize',
      token_endpoint: 'https://login.microsoftonline.com/contoso/oauth2/v2.0/token',
      jwks_uri: 'https://login.microsoftonline.com/contoso/discovery/v2.0/keys',
      scopes_supported: ['openid', 'profile', 'email'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.issuer).toContain('contoso');
  });

  it('the OIDC client secret is encrypted at rest; only a fingerprint is ever exposed', () => {
    const secret = 'contoso-oidc-client-secret-value-abc123';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
    const fp = secretFingerprint(secret);
    expect(fp).toHaveLength(12);
    expect(secret).not.toContain(fp);
  });

  it('a federated login resolves its role from the tenant’s security-group mappings, then JIT-provisions', () => {
    const mappings: GroupMappingRule[] = [
      { claimValue: 'Contoso-Delivery-Admins', deliveryRole: 'ADMIN', membershipRole: 'ADMIN', practiceId: null, priority: 10 },
      { claimValue: 'Contoso-PMs', deliveryRole: 'PROJECT_MANAGER', membershipRole: 'MEMBER', practiceId: null, priority: 50 },
    ];
    const fallback = { deliveryRole: 'PROJECT_MANAGER' as const, membershipRole: 'MEMBER' as const };

    // first login — in the PMs group only
    const groups = extractGroupClaims({ groups: ['Contoso-PMs', 'Unrelated-Group'] });
    const resolved = resolveFederatedRole(groups, mappings, fallback);
    expect(resolved.deliveryRole).toBe('PROJECT_MANAGER');
    expect(resolved.matchedClaim).toBe('Contoso-PMs');

    const first = computeJitOutcome({
      existingUser: null,
      existingMembership: null,
      resolvedRole: resolved,
      jitEnabled: true,
    });
    expect(first.action.kind).toBe('create-user-and-membership');
    expect(first.targetRole).toEqual({ role: 'MEMBER', deliveryRole: 'PROJECT_MANAGER' });

    // later added to the Admins group — an SSO-provisioned membership re-syncs
    const promoted = resolveFederatedRole(['Contoso-Delivery-Admins', 'Contoso-PMs'], mappings, fallback);
    expect(promoted.deliveryRole).toBe('ADMIN'); // priority 10 wins over 50
    const resync = computeJitOutcome({
      existingUser: { id: 'u1', name: 'Jo' },
      existingMembership: { role: 'MEMBER', deliveryRole: 'PROJECT_MANAGER', provisionedVia: 'SSO_JIT' },
      resolvedRole: promoted,
      jitEnabled: true,
    });
    expect(resync.action.kind).toBe('update-membership-role');
    expect(resync.targetRole.deliveryRole).toBe('ADMIN');

    // but a hand-assigned admin is never downgraded by JIT
    const manual = computeJitOutcome({
      existingUser: { id: 'u2', name: 'Sam' },
      existingMembership: { role: 'ADMIN', deliveryRole: 'ADMIN', provisionedVia: 'MANUAL' },
      resolvedRole: resolveFederatedRole(['Contoso-PMs'], mappings, fallback),
      jitEnabled: true,
    });
    expect(manual.action.kind).toBe('touch-membership');
    expect(manual.mutatesAccess).toBe(false);
  });

  it('with JIT disabled a stranger is denied, but an existing member still gets in', () => {
    const resolved = resolveFederatedRole([], [], {
      deliveryRole: 'PROJECT_MANAGER',
      membershipRole: 'MEMBER',
    });
    expect(
      computeJitOutcome({ existingUser: null, existingMembership: null, resolvedRole: resolved, jitEnabled: false })
        .action.kind
    ).toBe('deny-no-membership');
    expect(
      computeJitOutcome({
        existingUser: { id: 'u9', name: 'Existing' },
        existingMembership: { role: 'MEMBER', deliveryRole: 'PROJECT_MANAGER', provisionedVia: 'MANUAL' },
        resolvedRole: resolved,
        jitEnabled: false,
      }).action.kind
    ).toBe('touch-membership');
  });

  it('enforced SSO blocks password login only for the tenant’s configured domains', () => {
    const domains = ['contoso.com', 'contoso.co.uk'];
    expect(emailMatchesDomains('jo@contoso.com', domains)).toBe(true);
    expect(emailMatchesDomains('jo@CONTOSO.CO.UK', domains)).toBe(true);
    expect(emailMatchesDomains('jo@fabrikam.com', domains)).toBe(false);
  });
});
