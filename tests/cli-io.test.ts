import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isProductionDbUrl,
  generatePassword,
  assertProdWriteAllowed,
  resolvePassword,
  hasFlag,
} from '../scripts/lib/cli-io';
import { validatePasswordStrength } from '@/lib/auth/password-policy';

const PROD = 'postgresql://postgres.xoaabhqsbfetffyawayw:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const STAGING = 'postgresql://postgres.urdlkmlhjhvoxsphvwte:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres';

const argvBackup = [...process.argv];
afterEach(() => {
  process.argv = [...argvBackup];
  vi.unstubAllEnvs();
});

describe('cli-io — production detection', () => {
  it('flags the production Supabase ref', () => {
    expect(isProductionDbUrl(PROD)).toBe(true);
    expect(isProductionDbUrl(PROD.toUpperCase())).toBe(true);
  });
  it('does not flag staging or empty', () => {
    expect(isProductionDbUrl(STAGING)).toBe(false);
    expect(isProductionDbUrl(undefined)).toBe(false);
    expect(isProductionDbUrl('')).toBe(false);
  });
});

describe('cli-io — generatePassword', () => {
  it('always satisfies the strength policy', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword();
      expect(pw.length).toBeGreaterThanOrEqual(12);
      expect(validatePasswordStrength(pw)).toBeNull();
    }
  });
});

describe('cli-io — hasFlag', () => {
  it('reads process.argv', () => {
    process.argv = [...argvBackup, '--yes-prod'];
    expect(hasFlag('yes-prod')).toBe(true);
    expect(hasFlag('nope')).toBe(false);
  });
});

describe('cli-io — assertProdWriteAllowed', () => {
  it('is a no-op for a non-production URL', async () => {
    await expect(assertProdWriteAllowed(STAGING, 'do a thing')).resolves.toBeUndefined();
  });

  it('refuses a production write from a non-interactive shell without --yes-prod', async () => {
    // vitest stdin is not a TTY
    await expect(assertProdWriteAllowed(PROD, 'reset a password')).rejects.toThrow(/Refusing .* PRODUCTION/);
  });

  it('allows a production write with A2R_ALLOW_PROD_WRITE=1', async () => {
    vi.stubEnv('A2R_ALLOW_PROD_WRITE', '1');
    await expect(assertProdWriteAllowed(PROD, 'reset a password')).resolves.toBeUndefined();
  });

  it('allows a production write with --yes-prod', async () => {
    process.argv = [...argvBackup, '--yes-prod'];
    await expect(assertProdWriteAllowed(PROD, 'reset a password')).resolves.toBeUndefined();
  });
});

describe('cli-io — resolvePassword', () => {
  it('generates on --generate', async () => {
    process.argv = [...argvBackup, '--generate'];
    const { password, generated } = await resolvePassword();
    expect(generated).toBe(true);
    expect(validatePasswordStrength(password)).toBeNull();
  });

  it('refuses an interactive prompt with no TTY and no flag', async () => {
    await expect(resolvePassword()).rejects.toThrow(/No TTY/);
  });
});
