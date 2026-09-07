/**
 * A2R Operator Control Plane — Batch 2: mandatory second factor for JIT
 * privilege elevation.
 *
 * The elevation step-up was password-only (AAL1). It now also requires an
 * **activated** TOTP enrollment (RFC 6238, authenticator app) and a valid
 * 6-digit code — or a single-use recovery code. This is a genuine second
 * factor ("something you have"); it is not phishing-resistant against a
 * real-time MITM (WebAuthn / passkeys is the follow-up upgrade — see
 * docs/JIT_STAFF_ELEVATION.md).
 *
 * Storage — `operator_mfa`, one row per operator, a platform table (in
 * UNSCOPED_MODELS):
 *   - `secretCiphertext`         the ACTIVE TOTP secret, AES-256-GCM sealed
 *                                under a DEDICATED, versioned key
 *                                (`MFA_ENCRYPTION_KEY`, not NEXTAUTH_SECRET —
 *                                see src/lib/crypto/secret-box.ts). A secret
 *                                on an older key version is re-sealed on the
 *                                next successful verification.
 *   - `pendingSecretCiphertext`  a not-yet-confirmed secret from enrollment
 *   - `activatedAt`              null ⇒ does NOT satisfy the requirement
 *   - `lastStepCounter`          anti-replay high-water mark (TOTP step);
 *                                advanced by a single conditional UPDATE
 *   - `recoveryCodeHashes`       10 single-use codes, SHA-256-hashed (the
 *                                codes are high-entropy random, so a fast
 *                                digest — like the bearer tokens — is the
 *                                right primitive, not a password KDF);
 *                                consumed under a row lock
 *
 * Server-only (Prisma + node crypto).
 */
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { seal, open, needsReseal } from '@/lib/crypto/secret-box';
import { hashToken, tokenHashesEqual } from '@/lib/crypto/bearer-token';

// ±1 time-step (30 s) of clock drift tolerated; 6 digits; 30 s period.
authenticator.options = { window: 1, step: 30, digits: 6 };

const ISSUER = 'A2R Operator Console';
const RECOVERY_CODE_COUNT = 10;

/** The RFC 6238 time-step counter for `whenMs` (default: now). */
function stepCounter(whenMs: number = Date.now()): number {
  return Math.floor(whenMs / 1000 / 30);
}

/**
 * TOTP anti-replay is normally on. `OPS_MFA_ALLOW_REPLAY` disables *only*
 * the `lastStepCounter` high-water check (the code is still fully verified),
 * for the Playwright suite where independent tests legitimately elevate the
 * same seeded operator inside one 30 s window. Ignored in production — a
 * stray flag can never weaken the live control.
 */
function replayCheckDisabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    /^(1|true|yes|on)$/i.test(process.env.OPS_MFA_ALLOW_REPLAY ?? '')
  );
}

/** A human-friendly single-use recovery code: `XXXXX-XXXXX` (Crockford-ish,
 * no ambiguous chars). ~51 bits of entropy. */
function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 4) out += '-';
  }
  return out;
}

export interface MfaStatus {
  /** an `operator_mfa` row exists */
  enrolled: boolean;
  /** the row has an active, confirmed secret — this is what elevation needs */
  activated: boolean;
  /** an enrollment has been started but not yet confirmed */
  pending: boolean;
  activatedAt: string | null;
  lastUsedAt: string | null;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const row = await db.operatorMfa.findUnique({ where: { userId } });
  return {
    enrolled: row !== null,
    activated: !!row?.secretCiphertext && !!row?.activatedAt,
    pending: !!row?.pendingSecretCiphertext,
    activatedAt: row?.activatedAt ? row.activatedAt.toISOString() : null,
    lastUsedAt: row?.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

/** True iff `userId` has an activated second factor (what elevation gates on). */
export async function hasActivatedMfa(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await db.operatorMfa.findUnique({
    where: { userId },
    select: { secretCiphertext: true, activatedAt: true },
  });
  return !!row?.secretCiphertext && !!row?.activatedAt;
}

export interface EnrollmentChallenge {
  /** base32 secret, for manual entry into an authenticator app */
  secret: string;
  /** otpauth:// URI encoding the same secret */
  otpauthUri: string;
  /** a PNG data URI of the otpauth URI, for scanning */
  qrDataUri: string;
}

/**
 * Begin (or restart / rotate) a TOTP enrollment for `userId`: mint a fresh
 * secret and stash it as the row's *pending* secret. Does NOT touch the
 * active secret — an in-flight or abandoned enrollment never weakens a
 * working factor. Call `activateEnrollment` next.
 *
 * The action layer gates this:
 *   - no activated factor yet  → self-service, behind a fresh password check
 *   - an activated factor exists → rotation, behind a live JIT elevation
 */
export async function beginEnrollment(userId: string, accountLabel: string): Promise<EnrollmentChallenge> {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(accountLabel || 'operator', ISSUER, secret);
  const qrDataUri = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });

  await db.operatorMfa.upsert({
    where: { userId },
    create: { userId, pendingSecretCiphertext: seal(secret) },
    update: { pendingSecretCiphertext: seal(secret) },
  });

  return { secret, otpauthUri, qrDataUri };
}

export type ActivateResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; reason: 'NO_PENDING' | 'BAD_CODE' };

/**
 * Confirm a pending enrollment: the operator proves one live code, the
 * pending secret is promoted to active, and 10 fresh single-use recovery
 * codes are issued (returned once, only their SHA-256 hashes are stored).
 */
export async function activateEnrollment(userId: string, code: string): Promise<ActivateResult> {
  const row = await db.operatorMfa.findUnique({ where: { userId } });
  if (!row?.pendingSecretCiphertext) return { ok: false, reason: 'NO_PENDING' };

  const secret = open(row.pendingSecretCiphertext);
  if (safeCheckDelta(code, secret) === null) return { ok: false, reason: 'BAD_CODE' };

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const recoveryCodeHashes = recoveryCodes.map((c) => hashToken(c));

  await db.operatorMfa.update({
    where: { userId },
    data: {
      secretCiphertext: row.pendingSecretCiphertext,
      pendingSecretCiphertext: null,
      activatedAt: new Date(),
      lastUsedAt: new Date(),
      // `lastStepCounter` stays null — it is an *elevation-path* anti-replay
      // high-water mark. Not seeding it here lets the operator use the same
      // code they just confirmed for their first elevation (same 30 s
      // window) instead of waiting for the next one.
      recoveryCodeHashes,
    },
  });

  return { ok: true, recoveryCodes };
}

export type SecondFactorResult =
  | { ok: true; method: 'totp' | 'recovery' }
  | { ok: false; reason: 'NO_MFA' | 'NOT_ACTIVATED' | 'BAD_CODE' | 'REPLAYED' };

/**
 * The elevation step-up check. Accepts a 6-digit TOTP code or an
 * `XXXXX-XXXXX` recovery code.
 *
 * Both paths consume the credential ATOMICALLY at the database so two
 * concurrent requests presenting the same valid code cannot both succeed:
 *   - TOTP:     a single conditional UPDATE that advances `lastStepCounter`
 *               only when the candidate step is strictly higher.
 *   - recovery: `SELECT … FOR UPDATE` inside a transaction, so the second
 *               request blocks, then observes the code already gone.
 */
export async function verifySecondFactor(
  userId: string,
  code: string | undefined | null,
): Promise<SecondFactorResult> {
  const input = (code ?? '').trim().toUpperCase();
  const row = await db.operatorMfa.findUnique({ where: { userId } });
  if (!row) return { ok: false, reason: 'NO_MFA' };
  if (!row.secretCiphertext || !row.activatedAt) return { ok: false, reason: 'NOT_ACTIVATED' };
  if (!input) return { ok: false, reason: 'BAD_CODE' };

  // ── Recovery code path — anything that is not exactly 6 digits ─────────
  if (!/^\d{6}$/.test(input)) {
    const inputHash = hashToken(input);
    return db.$transaction(async (tx) => {
      // Lock the row: a concurrent recovery-code use blocks here until this
      // transaction commits, then re-reads a list with the code removed.
      const locked = await tx.$queryRaw<Array<{ recoveryCodeHashes: unknown }>>`
        SELECT "recoveryCodeHashes" FROM "operator_mfa" WHERE "userId" = ${userId} FOR UPDATE`;
      const hashes: string[] = Array.isArray(locked[0]?.recoveryCodeHashes)
        ? (locked[0]!.recoveryCodeHashes as string[])
        : [];
      const idx = hashes.findIndex((h) => tokenHashesEqual(h, inputHash));
      if (idx === -1) return { ok: false as const, reason: 'BAD_CODE' as const };
      hashes.splice(idx, 1);
      await tx.operatorMfa.update({
        where: { userId },
        data: { recoveryCodeHashes: hashes, lastUsedAt: new Date() },
      });
      return { ok: true as const, method: 'recovery' as const };
    });
  }

  // ── TOTP path ────────────────────────────────────────────────────────
  const secret = open(row.secretCiphertext);
  const delta = safeCheckDelta(input, secret);
  if (delta === null) return { ok: false, reason: 'BAD_CODE' };

  const matchedCounter = BigInt(stepCounter() + delta);
  const bypassReplay = replayCheckDisabled();

  // Opportunistic key rotation — re-seal a secret that is on an old key
  // version. Strictly best-effort: a `seal()` failure (e.g. the new key is
  // not configured yet) must never fail the verification itself.
  let reseal: { secretCiphertext?: string } = {};
  if (needsReseal(row.secretCiphertext)) {
    try {
      reseal = { secretCiphertext: seal(secret) };
    } catch {
      /* leave the old ciphertext in place; migrate on a later verification */
    }
  }

  // ONE conditional UPDATE is the anti-replay guard: it only matches (and so
  // only counts) when this step is strictly newer than what any prior
  // request recorded. Two racing requests with the same code → the first
  // advances the counter, the second's WHERE no longer matches → count 0.
  const res = await db.operatorMfa.updateMany({
    where: bypassReplay
      ? { userId }
      : { userId, OR: [{ lastStepCounter: null }, { lastStepCounter: { lt: matchedCounter } }] },
    data: { lastStepCounter: matchedCounter, lastUsedAt: new Date(), ...reseal },
  });
  if (res.count === 0) return { ok: false, reason: 'REPLAYED' };
  return { ok: true, method: 'totp' };
}

/**
 * Remove the operator's second factor entirely (row deleted). NOT
 * self-service — a phished password must not be able to strip MFA. Callers:
 * the `ops:mfa:reset` CLI (direct DB), or a future operator-acting-on-
 * another-operator path under elevation.
 */
export async function disableMfa(userId: string): Promise<void> {
  await db.operatorMfa.deleteMany({ where: { userId } });
}

/** otplib's `checkDelta` throws on a malformed token — normalise to null. */
function safeCheckDelta(token: string, secret: string): number | null {
  try {
    const d = authenticator.checkDelta(token, secret);
    return typeof d === 'number' ? d : null;
  } catch {
    return null;
  }
}
