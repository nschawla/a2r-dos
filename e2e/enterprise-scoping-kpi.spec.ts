import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Suite K — Role-Based Scoped Filtering & Custom KPI Builder E2E.
 *
 *   K1  a Practice Director's Resource & Capacity Cockpit is genuinely
 *       narrower than an Admin's — not just a different label, a
 *       smaller real roster
 *   K2  the same scoping holds for the Financial Realization project
 *       picker (src/components/dashboard/project-picker.tsx) — a
 *       Practice Director sees strictly fewer engagements than an Admin
 *   K3  creating a Custom KPI in the admin builder reflects instantly on
 *       the Control Tower for a bound persona, and never renders for an
 *       unbound one
 *
 * Serial: one shared page, re-logging in per test, same shape as Suite J.
 * The afterAll hook deletes any CustomKpi rows this suite created, so the
 * suite is idempotent on the shared demo DB — nothing here should survive
 * a re-run.
 */

const DEMO_PW = 'password12345';
const DEMO_SLUG = 'a2r-ventures-demo';
const TEST_KPI_NAME = 'E2E Suite K — Portfolio Margin Health';

let page: Page;
const pageErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`));
});

test.afterAll(async () => {
  await page.context().close();

  if (!process.env.DATABASE_URL) {
    try {
      const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      /* .env unreadable — Prisma surfaces its own error */
    }
  }
  const db = new PrismaClient();
  try {
    await db.customKpi.deleteMany({ where: { name: { startsWith: 'E2E Suite K' } } });
  } finally {
    await db.$disconnect();
  }

  expect(pageErrors, `runtime errors during Suite K:\n${pageErrors.join('\n')}`).toEqual([]);
});

async function signIn(p: Page, email: string, password = DEMO_PW) {
  await p.goto('/login');
  await p.locator('input[type="email"]').fill(email);
  await p.locator('input[type="password"]').fill(password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
}

async function expectNoErrorOverlay(p: Page) {
  await expect(p.locator('nextjs-portal')).toHaveCount(0);
}

// ── K1 · Capacity Cockpit scoping ────────────────────────────────────

test.describe('Suite K1 — Role-Based Scoped Filtering on Resource & Capacity', () => {
  let adminResourceCount = 0;

  test('an Admin sees the tenant-wide roster', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/capacity');
    await expectNoErrorOverlay(page);

    const label = page.locator('#capacity-scope-indicator');
    await expect(label).toContainText('Tenant-wide');

    // Scoped to the "Per-Resource Utilization" roster card specifically —
    // the Utilization tab also renders a practice-summary table above it,
    // and a bare `table tbody tr` would count both together.
    adminResourceCount = await page
      .locator('div.card', { hasText: 'Per-Resource Utilization' })
      .locator('tbody tr')
      .count();
    expect(adminResourceCount).toBeGreaterThan(0);
  });

  test('a Practice Director sees a strictly narrower roster, scoped to their own practiceId', async () => {
    await signIn(page, 'pd@a2rventures-demo.test');
    await page.goto('/capacity');
    await expectNoErrorOverlay(page);

    const label = page.locator('#capacity-scope-indicator');
    await expect(label).toContainText('Scoped to your practice');

    const pdResourceCount = await page
      .locator('div.card', { hasText: 'Per-Resource Utilization' })
      .locator('tbody tr')
      .count();
    expect(pdResourceCount).toBeGreaterThan(0);
    expect(pdResourceCount).toBeLessThan(adminResourceCount);
  });
});

// ── K2 · project-picker scoping ──────────────────────────────────────

test.describe('Suite K2 — Role-Based Scoped Filtering on the Financial Realization picker', () => {
  test('an Admin can pick from every engagement', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/financials');
    await expectNoErrorOverlay(page);
    const adminCount = await page.locator('a[href^="/financials/"]').count();
    expect(adminCount).toBeGreaterThan(0);
  });

  test('a Practice Director sees strictly fewer engagements than the Admin did', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/financials');
    const adminCount = await page.locator('a[href^="/financials/"]').count();

    await signIn(page, 'pd@a2rventures-demo.test');
    await page.goto('/financials');
    await expectNoErrorOverlay(page);
    const pdCount = await page.locator('a[href^="/financials/"]').count();

    expect(pdCount).toBeGreaterThan(0);
    expect(pdCount).toBeLessThan(adminCount);
  });
});

// ── K3 · Custom KPI Builder ───────────────────────────────────────────

test.describe('Suite K3 — Custom KPI Builder reflects instantly on the Control Tower', () => {
  test('an Admin creates a KPI bound to Global Admin, and it appears on the Control Tower', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/admin/kpis');
    await expectNoErrorOverlay(page);

    await page.click('#new-kpi-button');
    await page.locator('input[placeholder="e.g. Portfolio Margin Health"]').fill(TEST_KPI_NAME);
    // Data source/metric default to FINANCIALS / blendedMarginPct.
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill('30'); // target
    await numberInputs.nth(1).fill('20'); // warning
    await page.getByRole('button', { name: 'Global Admin' }).click();
    await page.getByRole('button', { name: 'Create KPI' }).click();
    await expect(page.locator(`text=${TEST_KPI_NAME}`)).toBeVisible({ timeout: 10_000 });

    await page.goto('/portfolio');
    await expectNoErrorOverlay(page);
    await expect(page.locator(`text=${TEST_KPI_NAME}`)).toBeVisible();
  });

  test('the same KPI does not render for a Project Manager it is not bound to', async () => {
    await signIn(page, 'pm@a2rventures-demo.test');
    await page.goto('/portfolio');
    await expectNoErrorOverlay(page);
    await expect(page.locator(`text=${TEST_KPI_NAME}`)).toHaveCount(0);
  });

  test('deleting the KPI removes it from the Control Tower immediately', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/admin/kpis');
    page.once('dialog', (d) => d.accept());
    await page.locator('li', { hasText: TEST_KPI_NAME }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator(`text=${TEST_KPI_NAME}`)).toHaveCount(0);

    await page.goto('/portfolio');
    await expect(page.locator(`text=${TEST_KPI_NAME}`)).toHaveCount(0);
  });
});
