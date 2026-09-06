/** Types for site-mode.mjs (plain ESM so next.config.mjs shares the logic). P1. */
export const SITE_MODES: readonly ['marketing', 'internal', 'live'];

export type SiteMode = (typeof SITE_MODES)[number];

export interface SiteModeResolution {
  mode: SiteMode;
  raw: string | undefined;
  /** true when `raw` was missing / invalid and we fell back to 'marketing'. */
  fellBack: boolean;
}

export function parseSiteMode(raw: string | undefined | null): SiteModeResolution;

export type RootRoute = { kind: 'marketing' } | { kind: 'redirect'; to: string };

export function resolveRootRoute(mode: SiteMode, isAuthenticated: boolean): RootRoute;

export function siteModeBuildError(env: Record<string, string | undefined>): string | null;
