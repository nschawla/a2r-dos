'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { seedOrganizationDefaults } from '@/lib/tenant/defaults';

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

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: normalizedEmail, name, passwordHash } });
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });
    await seedOrganizationDefaults(tx, org.id);
    await tx.activityLogEntry.create({
      data: { organizationId: org.id, userId: user.id, text: `${name} created ${orgName}`, tab: 'home' },
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

  const parsed = newOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { orgName } = parsed.data;
  const slug = await uniqueSlug(orgName);

  await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, slug } });
    await tx.membership.create({ data: { userId: session.user.id, organizationId: org.id, role: 'OWNER' } });
    await seedOrganizationDefaults(tx, org.id);
    await tx.activityLogEntry.create({
      data: { organizationId: org.id, userId: session.user.id, text: `Organization created`, tab: 'home' },
    });
  });

  return { ok: true };
}
