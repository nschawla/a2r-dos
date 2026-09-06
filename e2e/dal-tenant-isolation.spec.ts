import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Suite O — DAL / tenant-isolation at the HTTP boundary (P1).
 *
 *   O1  a signed-in tenant-A user reaches their own portfolio + the
 *       portfolio CSV export (200), and the CSV contains only tenant-A rows
 *   O2  the same user, feeding a tenant-B projectId into the project
 *       export / status-report / audit-certificate routes, gets 404 —
 *       never a 200 with tenant B's payload
 *   O3  navigating to a tenant-B project module page renders not-found,
 *       not tenant B's data
 *
 * Self-cleaning: a throwaway ADMIN user in the demo org; the tenant-B
 * project id is read from the seeded "Acme Health" org.
 */

const PW = 'DalIsolation-E2E-51';
const DEMO_SLUG = 'a2r-ventures-demo';
const OTHER_SLUG = 'acme-health';

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
let otherProjectId: string;
let otherProjectName: string;
const email = `dal-iso-e2e-${Date.now()}@a2rventures.com`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  loadEnv();
  db = new PrismaClient();
  const [demo, other] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG }, select: { id: true } }),
    db.organization.findUniqueOrThrow({ where: { slug: OTHER_SLUG }, select: { id: true } }),
  ]);
  const otherProject = await db.project.findFirstOrThrow({
    where: { organizationId: other.id, hierarchyLevel: { not: 'PARENT' } },
    select: { id: true, name: true },
  });
  otherProjectId = otherProject.id;
  otherProjectName = otherProject.name;

  const u = await db.user.create({
    data: {
      email,
      name: 'DAL Iso E2E',
      passwordHash: await bcrypt.hash(PW, 10),
      memberships: { create: { organizationId: demo.id, role: 'ADMIN', deliveryRole: 'ADMIN' } },
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

test.describe('Suite O — DAL tenant isolation at the HTTP boundary', () => {
  test('O1 · tenant-A user sees only their own portfolio + CSV', async () => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });

    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();

    const csv = await page.request.get('/api/reports/portfolio-csv');
    expect(csv.status()).toBe(200);
    const body = await csv.text();
    // the demo org's throwaway admin sees an ADMIN (global) portfolio of the
    // demo tenant — never the Acme engagement name.
    expect(body).not.toContain(otherProjectName);
  });

  test('O2 · tenant-B project ids are 404 on every export route', async () => {
    for (const path of [
      `/api/projects/${otherProjectId}/export`,
      `/api/projects/${otherProjectId}/status-report`,
      `/api/projects/${otherProjectId}/audit-certificate`,
    ]) {
      const res = await page.request.get(path, { failOnStatusCode: false });
      expect(res.status(), `${path} → ${res.status()}`).toBe(404);
      const text = await res.text();
      expect(text).not.toContain(otherProjectName);
    }
  });

  test('O3 · a tenant-B project module page never renders tenant-B data', async () => {
    // `notFound()` fires because loadAuditModulePage scopes the lookup to
    // the viewer's org. (The dev server reports 200 for the not-found UI —
    // a known next-dev quirk, same as Suite M's cache-header assertion — so
    // this asserts the rendered content, not the HTTP status.)
    await page.goto(`/audit/${otherProjectId}`);
    await expect(page.getByRole('heading', { name: 'Audit Completion' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(otherProjectName);
  });
});
