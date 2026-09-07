import { authenticator } from 'otplib';

/**
 * Batch 2 — a fixed, known operator TOTP secret for the Playwright suite.
 * `e2e/global-setup.ts` seeds an activated `operator_mfa` row carrying this
 * secret for every operator the suite elevates; the elevation helpers fill
 * the modal's code field with `e2eOperatorTotp()`.
 *
 * The dev server runs with `OPS_MFA_ALLOW_REPLAY=1` (playwright.config.ts)
 * so back-to-back elevations in one 30 s window don't trip anti-replay.
 */
export const E2E_OPERATOR_MFA_SECRET = 'CZKUAH3RBF7F2OQWGNTRS2LCAMAG4YLG';

export function e2eOperatorTotp(): string {
  return authenticator.generate(E2E_OPERATOR_MFA_SECRET);
}
