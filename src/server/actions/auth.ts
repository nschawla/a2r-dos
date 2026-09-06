'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { runUnscoped } from '@/lib/db/org-scope';
import { seedOrganizationDefaults } from '@/lib/tenant/defaults';
import { validatePasswordStrength } from '@/lib/auth/password-policy';
import {
  PASSWORD_CHANGE_REQUIRED,
  sessionRequiresPasswordChange,
} from '@/lib/auth/password-rotation';
import { establishFreshSession } from '@/lib/auth/session-mint';

export type ActionResult = { ok: true } | { ok: false; error: string };

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org'
  );
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

const registerSchema = z.object({
  orgName: z.string().min(2, 'Organization name is too short').max(120),
  name: z.string().min(1, 'Name is required').max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Creates a brand-new tenant: the signing-up user, their Organization, an
 * OWNER membership, and the default starter roster (see
 * seedOrganizationDefaults). This is the SaaS equivalent of the prototype's
 * `defaultState()`.
 */
export async function registerOrganization(input: unknown): Promise<ActionResult> {
  // Public signup, but a signed-in forced-rotation session must not be able
  // to spin up a brand-new account/tenant to sidestep the restriction.
  if (await sessionRequiresPasswordChange()) return { ok: false, error: PASSWORD_CHANGE_REQUIRED };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { orgName, name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false, error: 'An account with that email already exists.' };
  }

  const slug = await uniqueSlug(orgName);
  const passwordHash = await bcrypt.hash(password, 10);

  // Tenant provisioning: the org does not exist until inside the tx, so
  // there is no scope to pin to. The seed writes all set organizationId
  // explicitly — run the transaction with the cross-tenant marker.
  await runUnscoped('tenant-provisioning', async () => {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: normalizedEmail, name, passwordHash } });
      const org = await tx.organization.create({ data: { name: orgName, slug } });
      await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });
      await seedOrganizationDefaults(tx, org.id);
      await tx.activityLogEntry.create({
        data: { organizationId: org.id, userId: user.id, text: `${name} created ${orgName}`, tab: 'home' },
      });
    });
  });

  return { ok: true };
}

const newOrgSchema = z.object({ orgName: z.string().min(2, 'Organization name is too short').max(120) });

/**
 * Onboarding path for an already-authenticated user with zero memberships
 * (e.g. every prior invite/org was removed). Creates a new tenant owned by
 * the current session user.
 */
export async function createOrganizationForCurrentUser(input: unknown): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: 'Not signed in.' };
  // P0 #3 — a forced-rotation session may not create a tenant.
  if (await sessionRequiresPasswordChange()) return { ok: false, error: PASSWORD_CHANGE_REQUIRED };

  const parsed = newOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { orgName } = parsed.data;
  const slug = await uniqueSlug(orgName);

  await runUnscoped('tenant-provisioning', async () => {
    await db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName, slug } });
      await tx.membership.create({ data: { userId: session.user.id, organizationId: org.id, role: 'OWNER' } });
      await seedOrganizationDefaults(tx, org.id);
      await tx.activityLogEntry.create({
        data: { organizationId: org.id, userId: session.user.id, text: `Organization created`, tab: 'home' },
      });
    });
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Change password
// ─────────────────────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(1, 'Enter a new password.').max(200),
});

export type ChangePasswordResult =
  | { ok: true; sessionRefreshed: boolean }
  | { ok: false; error: string };

/**
 * Sets a new password for the signed-in user. This is the ONE action a
 * forced-rotation session is allowed to call (see
 * src/lib/auth/password-rotation.ts), so it deliberately does not gate on
 * `mustChangePassword`.
 *
 * It verifies the current password first (defence against a hijacked but
 * still-forced session), enforces the shared strength policy, and refuses a
 * no-op re-use. On success, atomically:
 *   - writes the new hash + clears `mustChangePassword`
 *   - stamps `passwordChangedAt` → the jwt callback now revokes EVERY
 *     session token issued before this instant (all other devices)
 *   - deletes any NextAuth adapter Session rows for the user
 * then mints one fresh session for the current device so the user stays
 * signed in with a clean, fully-authenticated token. If minting isn't
 * possible (no NEXTAUTH_SECRET), `sessionRefreshed` is false and the client
 * falls back to sign-out + re-login.
 */
export async function changePasswordAction(input: unknown): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { currentPassword, newPassword } = parsed.data;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, error: 'You are not signed in.' };
  const userId = session.user.id;

  const policyError = validatePasswordStrength(newPassword);
  if (policyError) return { ok: false, error: policyError };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true, name: true },
  });
  if (!user?.passwordHash) {
    return { ok: false, error: 'This account signs in through your identity provider and has no password to change.' };
  }

  const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentOk) return { ok: false, error: 'Your current password is incorrect.' };

  const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsOld) return { ok: false, error: 'Choose a password different from your current one.' };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const changedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: changedAt },
    });
    // Revoke every adapter-backed session for this user. (Empty today under
    // the JWT strategy for credential logins; future-proofs an OAuth
    // addition and satisfies "invalidate all sessions".)
    await tx.session.deleteMany({ where: { userId } });
  });

  const sessionRefreshed = await establishFreshSession({
    userId,
    email: user.email,
    name: user.name,
  });

  return { ok: true, sessionRefreshed };
}
