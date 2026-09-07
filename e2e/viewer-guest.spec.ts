import { test, expect, type Page } from '@playwright/test';

/**
 * Suite Q — Viewer / Guest role (v1.16.0).
 *
 * The five family guest accounts (seeded by e2e/global-setup.ts) are
 * `MembershipRole.VIEWER` + `deliveryRole = VIEWER` members of the A2R DOS
 * Demo org: strict read-only observation.
 *
 *   Q1  a guest signs in and lands in the demo workspace (Executive Viewer)
 *   Q2  read-only surfaces render; no tenant-admin nav
 *   Q3  financials are scrubbed (restricted tier)
 *   Q4  the internal Ops Console is completely walled off
 *   Q5  tenant administration is walled off
 */

const GUEST = { email: 'abha@a2rventures.local', password: 'a2r-DOS-233444' };

let page: Page;
const pageErrors: string[] = [];
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`));
});

test.afterAll(async () => {
  await page.context().close();
  expect(pageErrors, `runtime errors during Suite Q:\n${pageErrors.join('\n')}`).toEqual([]);
});

async function signIn(p: Page) {
  await p.goto('/login');
  await p.locator('input[type="email"]').fill(GUEST.email);
  await p.locator('input[autocomplete="current-password"]').fill(GUEST.password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30_000 });
}

test('Q1 · a guest signs in and lands in the demo workspace as an Executive Viewer', async () => {
  await signIn(page);
  await expect(page).toHaveURL(/\/steerco/);
  await expect(page.getByText('SteerCo Briefing').first()).toBeVisible();
  // the header identity chip carries the read-only persona label
  await expect(page.getByRole('button', { name: /Abha/ })).toContainText(/Viewer/);
});

test('Q2 · read-only surfaces render; no tenant-admin navigation', async () => {
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();

  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Executive Briefing Hub', level: 1 })).toBeVisible();

  // a guest never sees the tenant-admin nav
  await expect(page.getByRole('link', { name: 'Admin & Org Setup' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Commercial Baseline/ })).toHaveCount(0);
});

test('Q3 · financials are scrubbed for the viewer tier', async () => {
  await page.goto('/portfolio');
  await expect(page.locator('.card', { hasText: 'Avg. Baseline Margin' })).toContainText('••••');

  await page.goto('/reports');
  await expect(page.getByText(/restricted to Partners/i).first()).toBeVisible();
});

test('Q4 · the internal Ops Console is completely walled off', async () => {
  for (const path of ['/ops', '/ops/telemetry', '/ops/tenants', '/ops/staff', '/ops/access']) {
    await page.goto(path);
    await expect(page, `guest reached ${path}`).not.toHaveURL(new RegExp(`${path}(/|$)`));
    await expect(page).toHaveURL(/\/(portfolio|steerco|launch|login)/);
  }
});

test('Q5 · tenant administration is walled off', async () => {
  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin(\/|$)/);
});
