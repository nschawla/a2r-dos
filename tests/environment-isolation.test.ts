import { describe, it, expect } from 'vitest';
import {
  evaluateEnvironmentIsolation,
  DEFAULT_PRODUCTION_SUPABASE_REF,
} from '@/lib/config/env-isolation-core.mjs';
import {
  assertEnvironmentIsolation,
  EnvironmentIsolationError,
  __resetEnvironmentIsolationCache,
} from '@/lib/config/environment-isolation';

const PROD_REF = DEFAULT_PRODUCTION_SUPABASE_REF;
const PROD_DIRECT = `postgresql://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres?sslmode=require`;
const PROD_POOLER = `postgresql://postgres.${PROD_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`;
const PREVIEW_DB = 'postgresql://postgres:pw@db.previewrefpreviewref.supabase.co:5432/postgres?sslmode=require';

describe('evaluateEnvironmentIsolation', () => {
  it('FAILS a Vercel preview deployment pointed at the production DB (direct host)', () => {
    const v = evaluateEnvironmentIsolation({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      DATABASE_URL: PROD_DIRECT,
      DIRECT_URL: PROD_DIRECT,
    });
    expect(v).toMatchObject({ ok: false, code: 'PREVIEW_USING_PRODUCTION_DB' });
  });

  it('FAILS when the production ref only appears in the pooler username', () => {
    const v = evaluateEnvironmentIsolation({
      VERCEL_URL: 'a2r-dos-git-feature-x.vercel.app',
      VERCEL_ENV: 'preview',
      DATABASE_URL: PROD_POOLER,
    });
    expect(v.ok).toBe(false);
  });

  it('FAILS a Vercel "development" deployment pointed at production', () => {
    const v = evaluateEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'development', DATABASE_URL: PROD_DIRECT });
    expect(v.ok).toBe(false);
  });

  it('PASSES a Vercel preview deployment on its own separate database', () => {
    const v = evaluateEnvironmentIsolation({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      DATABASE_URL: PREVIEW_DB,
      DIRECT_URL: PREVIEW_DB,
    });
    expect(v).toEqual({ ok: true });
  });

  it('PASSES a Vercel production deployment on the production database', () => {
    const v = evaluateEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: PROD_DIRECT });
    expect(v).toEqual({ ok: true });
  });

  it('PASSES local dev / CI even when .env points at production (no VERCEL vars)', () => {
    const v = evaluateEnvironmentIsolation({ DATABASE_URL: PROD_DIRECT, DIRECT_URL: PROD_DIRECT });
    expect(v).toEqual({ ok: true });
  });

  it('respects the ALLOW_PROD_DB_OUTSIDE_PROD escape hatch (with a warning)', () => {
    const v = evaluateEnvironmentIsolation({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      DATABASE_URL: PROD_DIRECT,
      ALLOW_PROD_DB_OUTSIDE_PROD: 'true',
    });
    expect(v.ok).toBe(true);
    expect((v as { warning?: string }).warning).toMatch(/permitted to use the PRODUCTION database/i);
  });

  it('honours PRODUCTION_DB_HOST as an additional match', () => {
    const v = evaluateEnvironmentIsolation({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      PRODUCTION_SUPABASE_PROJECT_REF: 'unused-ref',
      PRODUCTION_DB_HOST: 'db.custom-prod.example.com',
      DATABASE_URL: 'postgresql://u:p@db.custom-prod.example.com:5432/postgres',
    });
    expect(v.ok).toBe(false);
  });

  it('warns (not fatal) when a production deployment is NOT on the known production DB', () => {
    const v = evaluateEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: PREVIEW_DB });
    expect(v.ok).toBe(true);
    expect((v as { warning?: string }).warning).toMatch(/does not reference the expected production database/i);
  });

  it('is a no-op when no database URL is configured', () => {
    expect(evaluateEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'preview' })).toEqual({ ok: true });
  });
});

describe('assertEnvironmentIsolation — fails closed', () => {
  it('throws EnvironmentIsolationError for a preview→production wiring', () => {
    __resetEnvironmentIsolationCache();
    expect(() =>
      assertEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PROD_DIRECT }),
    ).toThrow(EnvironmentIsolationError);
    __resetEnvironmentIsolationCache();
  });

  it('does not throw for a correctly isolated preview', () => {
    __resetEnvironmentIsolationCache();
    expect(() =>
      assertEnvironmentIsolation({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: PREVIEW_DB }),
    ).not.toThrow();
    __resetEnvironmentIsolationCache();
  });
});
