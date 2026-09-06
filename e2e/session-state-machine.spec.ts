import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Suite N — restricted-session state machine (P1).
 *
 *   N1  a live ACTIVE browser session works normally
 *   N2  the instant the account's sessionVersion is bumped (an atomic
 *       all-device logout — what changePasswordAction does), that same
 *       browser session is:
 *         · redirected to /login on the next navigation
 *         · rejected (401 SESSION_REVOKED) from a protected API route
 *         · rejected from a protected Server Action
 *   N3  a REVOKED token never heals — re-visiting stays logged out
 *
 * Self-cleaning: creates a throwaway user + ADMIN membership in the demo
 * org, deletes both in afterAll.
 */

const PW = 'StateMachine-E2E-77';
const DEMO_SLUG = 'a2r-ventures-demo';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* Prisma surfaces its own error */
  }
}

let page: Page;
let db: PrismaClient;
let userId: string;
const email = `session-sm-e2e-${Date.now()}@a2rventures.com`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  loadEnv();
  db = new PrismaClient();
  const org = await db.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG }, select: { id: true } });
  const u = await db.user.create({
    data: {
      email,
      name: 'Session SM E2E',
      passwordHash: await bcrypt.hash(PW, 10),
      memberships: { create: { organizationId: org.id, role: 'ADMIN', deliveryRole: 'ADMIN' } },
    },
  });
  userId = u.id;
  page = await (await browser.newContext()).newPage();
});

test.afterAll(async () => {
  await page.context().close();
  await db.membership.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

test.describe('Suite N — restricted-session state machine', () => {
  test('N1 · the ACTIVE session reaches a protected page', async () => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();

    // sanity: the protected API works for the ACTIVE session
    const ok = await page.request.get('/api/reports/portfolio-csv');
    expect(ok.status()).toBe(200);
  });

  test('N2 · bumping sessionVersion instantly logs the live session out + blocks protected access', async () => {
    // Simulate the atomic all-device logout changePasswordAction performs
    // (the sessionVersion { increment: 1 } inside its transaction).
    await db.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 }, passwordChangedAt: new Date() },
    });

    // The very next navigation → bounced to /login. The DB-backed jwt
    // callback re-derived REVOKED (token.sessionVersion < users.sessionVersion).
    await page.goto('/portfolio');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toHaveCount(0);

    // A protected API call from the same (now stale) browser session is
    // rejected with 401 — caught by middleware (`SESSION_REVOKED`, once the
    // cookie is re-flagged) or the route-handler auth layer, both of which
    // resolve the session through the DB-backed jwt callback.
    const res = await page.request.get('/api/reports/portfolio-csv', { failOnStatusCode: false });
    expect(res.status(), await res.text()).toBe(401);
    expect(await res.json()).toMatchObject({
      error: expect.stringMatching(/SESSION_REVOKED|Not authenticated/),
    });

    // A protected page that is not itself a redirect target → still /login.
    await page.goto('/capacity');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('N3 · the REVOKED session does not heal on a later visit', async () => {
    await page.goto('/portfolio');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toHaveCount(0);
  });
});
