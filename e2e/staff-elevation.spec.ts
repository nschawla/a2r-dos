import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { e2eOperatorTotp } from './helpers/ops-mfa';

/**
 * Suite P — Just-In-Time (JIT) staff elevation (P1).
 *
 *   P1  a standing operator reaches the /ops READ views unelevated;
 *       the elevation bar shows "read-only"
 *   P2  a privileged action (Provision Tenant) while unelevated is blocked —
 *       the elevation modal is raised and no tenant is created
 *   P3  elevate (reason + 15-min window) → the bar goes green with a
 *       countdown → the same provision now succeeds
 *   P4  drop the elevation → back to read-only → the privileged action is
 *       blocked again
 *
 * Runs as the seeded `ops@a2rventures.com` operator (staff grant, no client
 * membership). Self-cleaning: deletes the throwaway tenant + this
 * operator's staff_elevations rows in afterAll.
 */

const OPS_EMAIL = 'ops@a2rventures.com';
const OPS_PW = 'password12345';
// Fixed name so e2e/global-teardown.ts can sweep it (dynamic names would leak).
const TENANT = 'JIT Elevation Test Inc';
const TENANT_ADMIN = 'founder+jit@jit-elevation.test';
const ELEVATION_REASON = 'E2E — provisioning a throwaway tenant for the JIT suite';

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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  loadEnv();
  db = new PrismaClient();
  page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(OPS_EMAIL);
  await page.locator('input[type="password"]').fill(OPS_PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
});

test.afterAll(async () => {
  await page.context().close();
  // The throwaway tenant + its admin are swept by e2e/global-teardown.ts
  // (TENANT is in its TEST_TENANT_NAMES list). Here: just clear this
  // operator's elevation rows so a re-run starts unelevated.
  const opsUser = await db.user.findUnique({ where: { email: OPS_EMAIL }, select: { id: true } });
  if (opsUser) await db.staffElevation.deleteMany({ where: { userId: opsUser.id } });
  await db.$disconnect();
});

async function openProvisionAndSubmit() {
  await page.goto('/ops/tenants');
  await page.getByRole('button', { name: 'Provision New Tenant' }).click();
  const dialog = page.getByRole('dialog', { name: 'Provision new tenant' });
  await dialog.getByPlaceholder('Contoso Health').fill(TENANT);
  await dialog.getByPlaceholder('Jordan Reyes').fill('JIT Founder');
  await dialog.getByPlaceholder('admin@contoso.com').fill(TENANT_ADMIN);
  await dialog.getByRole('button', { name: 'Provision tenant' }).click();
  return dialog;
}

test.describe('Suite P — JIT staff elevation', () => {
  test('P1 · read views reachable unelevated; bar shows read-only', async () => {
    await page.goto('/ops/telemetry');
    await expect(page.getByRole('heading', { name: 'Platform Telemetry', level: 1 })).toBeVisible();

    const bar = page.locator('[data-elevation]');
    await expect(bar).toHaveAttribute('data-elevation', 'none');
    await expect(bar).toContainText('Read-only');

    await page.goto('/ops/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants', level: 1 })).toBeVisible();
  });

  test('P2 · a privileged action while unelevated is blocked', async () => {
    const dialog = await openProvisionAndSubmit();

    // useSafeAction intercepts ELEVATION_REQUIRED → raises the elevation modal
    await expect(page.getByRole('dialog', { name: /Request privilege elevation/ })).toBeVisible({
      timeout: 15_000,
    });
    // and the tenant was NOT created
    await expect(page.getByText('Tenant provisioned')).toHaveCount(0);
    expect(await db.organization.count({ where: { name: TENANT } })).toBe(0);

    // close both stacked modals (elevation is on top)
    await page.getByRole('dialog', { name: /Request privilege elevation/ }).getByLabel('Close').click();
    await dialog.getByLabel('Close').click();
  });

  test('P3 · elevate → bar green with countdown → provision succeeds', async () => {
    await page.goto('/ops/telemetry');
    const bar = page.locator('[data-elevation]');
    await bar.getByRole('button', { name: 'Elevate' }).click();
    const modal = page.getByRole('dialog', { name: /Request privilege elevation/ });
    await modal.locator('textarea').fill(ELEVATION_REASON);
    // WP2 — step-up: the operator re-confirms their password to escalate.
    await modal.locator('input[type="password"]').fill(OPS_PW);
    // Batch 2 — second factor: a live TOTP code (seeded in global-setup).
    await modal.locator('input[autocomplete="one-time-code"]').fill(e2eOperatorTotp());
    await modal.getByRole('button', { name: '15 min' }).click();
    await modal.getByRole('button', { name: 'Elevate', exact: true }).click();

    await expect(bar).toHaveAttribute('data-elevation', 'active', { timeout: 15_000 });
    await expect(bar).toContainText('expires in');

    const dialog = await openProvisionAndSubmit();
    await expect(dialog.getByText('Tenant provisioned')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('table td', { hasText: TENANT }).first()).toBeVisible();

    // the elevation is on the in-console audit trail
    await page.goto('/ops/staff');
    await expect(page.getByText('Just-In-Time elevations')).toBeVisible();
    await expect(page.getByRole('cell', { name: ELEVATION_REASON })).toBeVisible();
  });

  test('P4 · drop elevation → read-only → privileged action blocked again', async () => {
    await page.goto('/ops/telemetry');
    const bar = page.locator('[data-elevation]');
    await bar.getByRole('button', { name: 'Drop elevation' }).click();
    await expect(bar).toHaveAttribute('data-elevation', 'none', { timeout: 15_000 });

    await openProvisionAndSubmit();
    await expect(page.getByRole('dialog', { name: /Request privilege elevation/ })).toBeVisible({
      timeout: 15_000,
    });
    // still exactly one such tenant — the P3 one, no duplicate
    expect(await db.organization.count({ where: { name: TENANT } })).toBe(1);
  });
});
