/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Enterprise Governance Architecture — Step 1: the Hybrid Configuration
 * Model.
 *
 *   Layer 1  A pre-built compliance TEMPLATE — a pre-tested bundle of
 *            defaults (Strict Financial Governance, Agile Delivery,
 *            Board-Only, or the balanced Standard).
 *   Layer 2  The tenant's own overrides on top — which modules are visible
 *            in navigation, and whether margins / EAC are scrubbed for
 *            delivery roles below VP.
 *
 * Once the stored settings no longer match any template exactly the
 * template resolves to CUSTOM (see `detectTemplate`).
 *
 * This module is pure and dependency-light (no Prisma client, no db) — same
 * testability contract as src/lib/auth/rbac.ts and src/lib/security/masking.ts.
 * It is imported by both the server (session context, admin actions) and
 * client (Sidebar filtering, the Admin governance panel).
 */

export type GovernanceTemplateKey =
  | 'STANDARD'
  | 'STRICT_FINANCIAL'
  | 'AGILE_DELIVERY'
  | 'BOARD_ONLY'
  | 'CUSTOM';

// ───────────────────────────────────────────────────────── governable modules

export interface GovernableModule {
  /** Stable key stored in GovernanceConfig.hiddenModules. */
  key: string;
  label: string;
  /** Route prefix this module owns. */
  href: string;
  /** Core modules are never hideable — the workspace can't function
   * without them, and Admin is where you'd turn things back on. */
  core?: boolean;
}

export const GOVERNABLE_MODULES: readonly GovernableModule[] = [
  { key: 'command', label: 'Command Center', href: '/command' },
  { key: 'control-tower', label: 'Control Tower', href: '/', core: true },
  { key: 'capacity', label: 'Resource & Capacity', href: '/capacity' },
  { key: 'commercial-baseline', label: 'Commercial Baseline', href: '/commercial-baseline' },
  { key: 'financials', label: 'Financial Realization', href: '/financials' },
  { key: 'schedule', label: 'Schedule & Milestones', href: '/schedule' },
  { key: 'raid', label: 'RAID Cockpit', href: '/raid' },
  { key: 'audit', label: 'Control Audit', href: '/audit' },
  { key: 'steerco', label: 'SteerCo Briefing', href: '/steerco' },
  { key: 'reports', label: 'Executive Hub', href: '/reports' },
  // Methodology Reference is not a top-level nav item (it's contextual to
  // Control Audit), so it isn't a governable route-visibility toggle.
  { key: 'admin', label: 'Admin & Org Setup', href: '/admin', core: true },
  { key: 'audit-log', label: 'Compliance Ledger', href: '/admin/audit-log', core: true },
] as const;

/** Modules an admin is allowed to toggle (everything non-core). */
export const HIDEABLE_MODULES: readonly GovernableModule[] = GOVERNABLE_MODULES.filter((m) => !m.core);

const HIDEABLE_KEYS = new Set(HIDEABLE_MODULES.map((m) => m.key));

// ───────────────────────────────────────────────────────── resolved config

export interface ResolvedGovernanceConfig {
  template: GovernanceTemplateKey;
  /** Sanitised — only real, hideable module keys. */
  hiddenModules: string[];
  /** Layer-2 tightening: scrub margins / EAC for Practice Director and
   * below, on top of the standard role-based masking. */
  maskFinancialsForDelivery: boolean;
}

export const DEFAULT_GOVERNANCE: ResolvedGovernanceConfig = {
  template: 'STANDARD',
  hiddenModules: [],
  maskFinancialsForDelivery: false,
};

// ───────────────────────────────────────────────────────── templates

export interface GovernanceTemplateDef {
  key: Exclude<GovernanceTemplateKey, 'CUSTOM'>;
  label: string;
  blurb: string;
  hiddenModules: string[];
  maskFinancialsForDelivery: boolean;
}

/**
 * The pre-tested bundles. `hiddenModules` uses the keys from
 * GOVERNABLE_MODULES; every entry here is validated by
 * tests/governance-config.test.ts against that registry.
 */
export const GOVERNANCE_TEMPLATES: Record<
  Exclude<GovernanceTemplateKey, 'CUSTOM'>,
  GovernanceTemplateDef
> = {
  STANDARD: {
    key: 'STANDARD',
    label: 'Standard Delivery',
    blurb: 'Balanced governance — every module on, standard role-based financial visibility.',
    hiddenModules: [],
    maskFinancialsForDelivery: false,
  },
  STRICT_FINANCIAL: {
    key: 'STRICT_FINANCIAL',
    label: 'Strict Financial Governance',
    blurb:
      'Blended margin, EAC and cost variance locked to Partners and executives — scrubbed for every delivery lead. Full audit and reporting surface stays on.',
    hiddenModules: [],
    maskFinancialsForDelivery: true,
  },
  AGILE_DELIVERY: {
    key: 'AGILE_DELIVERY',
    label: 'Agile Delivery',
    blurb:
      'Delivery-team focus — the commercial baseline and the executive reporting hub are hidden, and financials are scrubbed for delivery roles. Teams see flow, health and risk.',
    hiddenModules: ['commercial-baseline', 'reports'],
    maskFinancialsForDelivery: true,
  },
  BOARD_ONLY: {
    key: 'BOARD_ONLY',
    label: 'Board-Only',
    blurb:
      'A lean executive read-out — the SteerCo briefing, portfolio, reporting hub and control audit only. Day-to-day working modules are hidden; financials stay visible to authorised roles.',
    hiddenModules: ['command', 'capacity', 'commercial-baseline', 'financials', 'schedule', 'raid'],
    maskFinancialsForDelivery: false,
  },
};

export const TEMPLATE_ORDER: readonly Exclude<GovernanceTemplateKey, 'CUSTOM'>[] = [
  'STANDARD',
  'STRICT_FINANCIAL',
  'AGILE_DELIVERY',
  'BOARD_ONLY',
];

// ───────────────────────────────────────────────────────── helpers

function sanitizeHidden(keys: readonly string[] | null | undefined): string[] {
  if (!keys) return [];
  const seen = new Set<string>();
  for (const k of keys) if (HIDEABLE_KEYS.has(k)) seen.add(k);
  // canonical order
  return HIDEABLE_MODULES.filter((m) => seen.has(m.key)).map((m) => m.key);
}

export function isGovernanceTemplateKey(v: unknown): v is Exclude<GovernanceTemplateKey, 'CUSTOM'> {
  return typeof v === 'string' && v in GOVERNANCE_TEMPLATES;
}

/**
 * Which template the given settings correspond to — or 'CUSTOM' when they
 * match none exactly. Order-insensitive on `hiddenModules`.
 */
export function detectTemplate(input: {
  hiddenModules: readonly string[];
  maskFinancialsForDelivery: boolean;
}): GovernanceTemplateKey {
  const hidden = sanitizeHidden(input.hiddenModules);
  for (const key of TEMPLATE_ORDER) {
    const t = GOVERNANCE_TEMPLATES[key];
    const tHidden = sanitizeHidden(t.hiddenModules);
    if (
      t.maskFinancialsForDelivery === input.maskFinancialsForDelivery &&
      tHidden.length === hidden.length &&
      tHidden.every((k) => hidden.includes(k))
    ) {
      return key;
    }
  }
  return 'CUSTOM';
}

/** The full resolved config for a template. */
export function applyTemplate(key: Exclude<GovernanceTemplateKey, 'CUSTOM'>): ResolvedGovernanceConfig {
  const t = GOVERNANCE_TEMPLATES[key];
  return {
    template: key,
    hiddenModules: sanitizeHidden(t.hiddenModules),
    maskFinancialsForDelivery: t.maskFinancialsForDelivery,
  };
}

/**
 * Normalise a stored row (or nothing) into a resolved config. Unknown /
 * core keys are dropped from `hiddenModules`, and `template` is always
 * re-derived from the actual settings so a stale stored label can't lie.
 */
export function resolveStoredGovernance(
  row:
    | {
        template?: string | null;
        hiddenModules?: readonly string[] | null;
        maskFinancialsForDelivery?: boolean | null;
      }
    | null
    | undefined
): ResolvedGovernanceConfig {
  if (!row) return DEFAULT_GOVERNANCE;
  const hiddenModules = sanitizeHidden(row.hiddenModules);
  const maskFinancialsForDelivery = row.maskFinancialsForDelivery === true;
  return {
    template: detectTemplate({ hiddenModules, maskFinancialsForDelivery }),
    hiddenModules,
    maskFinancialsForDelivery,
  };
}

/** Merge a partial Layer-2 override onto a base config and re-derive the
 * template label. Core keys / unknown keys in `hiddenModules` are dropped. */
export function withOverrides(
  base: ResolvedGovernanceConfig,
  patch: { hiddenModules?: readonly string[]; maskFinancialsForDelivery?: boolean }
): ResolvedGovernanceConfig {
  const hiddenModules = sanitizeHidden(patch.hiddenModules ?? base.hiddenModules);
  const maskFinancialsForDelivery =
    patch.maskFinancialsForDelivery ?? base.maskFinancialsForDelivery;
  return {
    template: detectTemplate({ hiddenModules, maskFinancialsForDelivery }),
    hiddenModules,
    maskFinancialsForDelivery,
  };
}

// ───────────────────────────────────────────────────────── visibility queries

export function isModuleHidden(cfg: ResolvedGovernanceConfig, moduleKey: string): boolean {
  if (!HIDEABLE_KEYS.has(moduleKey)) return false; // core / unknown → always visible
  return cfg.hiddenModules.includes(moduleKey);
}

/** The set of route hrefs hidden for this tenant (for Sidebar filtering). */
export function hiddenHrefs(cfg: ResolvedGovernanceConfig): string[] {
  return GOVERNABLE_MODULES.filter((m) => !m.core && cfg.hiddenModules.includes(m.key)).map((m) => m.href);
}

/**
 * Is a concrete pathname inside a hidden module? Matches the deepest
 * module href that prefixes the path (so `/financials/abc` is governed by
 * the `financials` module, and `/` only ever matches control-tower).
 */
export function isPathHidden(cfg: ResolvedGovernanceConfig, pathname: string): boolean {
  let match: GovernableModule | null = null;
  for (const m of GOVERNABLE_MODULES) {
    if (m.href === '/') {
      if (pathname === '/' && !match) match = m;
      continue;
    }
    if ((pathname === m.href || pathname.startsWith(`${m.href}/`)) && (!match || m.href.length > match.href.length)) {
      match = m;
    }
  }
  if (!match || match.core) return false;
  return cfg.hiddenModules.includes(match.key);
}
