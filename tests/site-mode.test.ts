import { describe, it, expect } from 'vitest';
import {
  SITE_MODES,
  parseSiteMode,
  resolveRootRoute,
  siteModeBuildError,
} from '@/lib/config/site-mode.mjs';

describe('parseSiteMode — strict enum, fail-closed', () => {
  it('accepts the three exact values', () => {
    for (const m of SITE_MODES) {
      expect(parseSiteMode(m)).toEqual({ mode: m, raw: m, fellBack: false });
    }
  });

  it('tolerates surrounding whitespace and letter-case', () => {
    expect(parseSiteMode('  MARKETING ').mode).toBe('marketing');
    expect(parseSiteMode('Internal').mode).toBe('internal');
    expect(parseSiteMode('LIVE').mode).toBe('live');
  });

  it('falls back to marketing for missing / empty', () => {
    expect(parseSiteMode(undefined)).toEqual({ mode: 'marketing', raw: undefined, fellBack: true });
    expect(parseSiteMode(null)).toMatchObject({ mode: 'marketing', fellBack: true });
    expect(parseSiteMode('')).toMatchObject({ mode: 'marketing', fellBack: true });
  });

  it('NEVER interprets an unknown / misspelled value as internal or live', () => {
    for (const bad of ['internalx', 'intrnal', 'preview', 'app', 'staging', '1', 'true', 'on', 'liv', 'marketting']) {
      const r = parseSiteMode(bad);
      expect(r.mode).toBe('marketing');
      expect(r.fellBack).toBe(true);
    }
  });
});

describe('resolveRootRoute', () => {
  it('a signed-in visitor always goes to /launch, regardless of mode', () => {
    for (const m of SITE_MODES) {
      expect(resolveRootRoute(m, true)).toEqual({ kind: 'redirect', to: '/launch' });
    }
  });

  it('marketing → serve the public page for an anonymous visitor', () => {
    expect(resolveRootRoute('marketing', false)).toEqual({ kind: 'marketing' });
  });

  it('internal → anonymous visitor goes to /launch', () => {
    expect(resolveRootRoute('internal', false)).toEqual({ kind: 'redirect', to: '/launch' });
  });

  it('live → anonymous visitor goes to /login', () => {
    expect(resolveRootRoute('live', false)).toEqual({ kind: 'redirect', to: '/login' });
  });
});

describe('siteModeBuildError — fail the deployment when misconfigured in prod', () => {
  it('passes a Vercel production build with a valid mode', () => {
    expect(siteModeBuildError({ VERCEL_ENV: 'production', A2R_SITE_MODE: 'marketing' })).toBeNull();
    expect(siteModeBuildError({ VERCEL_ENV: 'production', A2R_SITE_MODE: 'live' })).toBeNull();
  });

  it('FAILS a Vercel production build with a missing value', () => {
    const err = siteModeBuildError({ VERCEL_ENV: 'production' });
    expect(err).toContain('not set');
    expect(err).toContain('marketing | internal | live');
  });

  it('FAILS a Vercel production build with a misspelled value', () => {
    expect(siteModeBuildError({ VERCEL_ENV: 'production', A2R_SITE_MODE: 'intrnal' })).toContain('"intrnal"');
  });

  it('does NOT fail a preview / local / CI build (they fall back at runtime)', () => {
    expect(siteModeBuildError({ VERCEL_ENV: 'preview' })).toBeNull();
    expect(siteModeBuildError({ VERCEL_ENV: 'development', A2R_SITE_MODE: 'garbage' })).toBeNull();
    expect(siteModeBuildError({})).toBeNull();
  });
});
