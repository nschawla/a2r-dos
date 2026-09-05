import { describe, it, expect } from 'vitest';
import {
  validatePasswordStrength,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../src/lib/auth/password-policy';

describe('validatePasswordStrength', () => {
  it('accepts a password that meets every rule', () => {
    expect(validatePasswordStrength('Correct-Horse-9')).toBeNull();
    expect(validatePasswordStrength('aA1' + 'x'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('rejects anything shorter than the minimum', () => {
    expect(validatePasswordStrength('Ab1' + 'x'.repeat(MIN_PASSWORD_LENGTH - 4))).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    );
  });

  it('rejects anything longer than the maximum', () => {
    expect(validatePasswordStrength('Ab1' + 'x'.repeat(MAX_PASSWORD_LENGTH))).toMatch(/under/);
  });

  it('requires a lowercase letter', () => {
    expect(validatePasswordStrength('ABCDEFGH1234')).toBe('Include a lowercase letter.');
  });

  it('requires an uppercase letter', () => {
    expect(validatePasswordStrength('abcdefgh1234')).toBe('Include an uppercase letter.');
  });

  it('requires a digit', () => {
    expect(validatePasswordStrength('abcdEFGHijkl')).toBe('Include a number.');
  });

  it('rejects a leading or trailing space', () => {
    expect(validatePasswordStrength(' Abcdef12345')).toMatch(/space/);
    expect(validatePasswordStrength('Abcdef12345 ')).toMatch(/space/);
  });

  it('returns exactly one reason — the first rule it fails', () => {
    // too short AND missing an uppercase + digit — should surface length first
    const reason = validatePasswordStrength('abc');
    expect(reason).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
  });
});
