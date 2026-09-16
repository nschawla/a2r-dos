import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { e2eOperatorTotp } from './helpers/ops-mfa';

/**
 * Suite J — Enterprise Identity & Governance E2E.
 *
 * Covers the v1.2.x enterprise flows end-to-end against a running dev
 * server + the shared demo database:
 *   J1  role-based landing resolution (per delivery role)
 *   J2  removed — the header "Perspective" pill (LensSwitcher.tsx) it
 *       covered was retired in favor of the Persona Preview banner
 *   J3  tenant governance template application (Agile Delivery ↔ Standard)
 *   J4  financial data masking for delivery roles under Strict Financial Governance
 *   J5  Ops Console SSO configuration (create → verify chips → remove)
 *
 * Serial: session + tenant governance state carry between tests. The
 * afterAll hook force-restores the demo tenant to Standard governance and
 * drops any identity provider the suite created, so the suite is
 * idempotent on the shared DB.
 */

const DEMO_PW = 'password12345';
const DEMO_SLUG = 'a2r-ventures-demo';
const ACME_SLUG = 'acme-health';

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

  // ── self-clean the shared demo DB ──
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
    const demo = await db.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
    if (demo) {
      await db.governanceConfig.upsert({
        where: { organizationId: demo.id },
        update: { template: 'STANDARD', hiddenModules: [], maskFinancialsForDelivery: false },
        create: { organizationId: demo.id, template: 'STANDARD', hiddenModules: [], maskFinancialsForDelivery: false },
      });
    }
    const acme = await db.organization.findUnique({ where: { slug: ACME_SLUG }, select: { id: true } });
    if (acme) {
      await db.identityProvider.deleteMany({ where: { organizationId: acme.id } });
    }
  } finally {
    await db.$disconnect();
  }

  expect(pageErrors, `runtime errors during Suite J:\n${pageErrors.join('\n')}`).toEqual([]);
});

async function signIn(p: Page, email: string, password = DEMO_PW) {
  await p.goto('/login');
  await p.locator('input[type="email"]').fill(email);
  await p.locator('input[type="password"]').fill(password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });
}

async function expectNoErrorOverlay(p: Page) {
  // Next 15 keeps a persistent `nextjs-portal` for the dev-tools indicator —
  // check for the actual error dialog, not the portal's presence.
  await expect(
    p.locator('nextjs-portal [data-nextjs-dialog-overlay], nextjs-portal [data-nextjs-error-overlay]')
  ).toHaveCount(0);
}

/** P1 JIT elevation — identity federation is a mutating /ops operation and
 * needs a live elevation on top of the standing operator grant. */
async function elevateOps(
  p: Page,
  reason = 'E2E automated run — SSO federation config',
  password = DEMO_PW,
) {
  await p.goto('/ops/telemetry');
  const bar = p.locator('[data-elevation]');
  await bar.waitFor();
  if ((await bar.getAttribute('data-elevation')) === 'active') return;
  await bar.getByRole('button', { name: 'Elevate' }).click();
  const dialog = p.getByRole('dialog', { name: /Request privilege elevation/ });
  await dialog.locator('textarea').fill(reason);
  await dialog.locator('input[type="password"]').fill(password); // WP2 step-up
  await dialog.locator('input[autocomplete="one-time-code"]').fill(e2eOperatorTotp()); // Batch 2 — 2FA
  await dialog.getByRole('button', { name: '60 min' }).click();
  await dialog.getByRole('button', { name: 'Elevate', exact: true }).click();
  await expect(bar).toHaveAttribute('data-elevation', 'active', { timeout: 15_000 });
}

// ── J1 · role-based landing resolution ───────────────────────────────

test.describe('Suite J1 — role-based landing resolution', () => {
  test('a VP / Executive lands on the SteerCo Briefing', async () => {
    await signIn(page, 'vp@a2rventures-demo.test');
    await expect(page).toHaveURL(/\/steerco$/);
    await expectNoErrorOverlay(page);
  });

  test('a Project Manager lands on the Control Tower', async () => {
    await signIn(page, 'pm@a2rventures-demo.test');
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();
  });

  test('an Admin lands on the Control Tower', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();
  });
});

// ── J2 · Persona Preview banner — switch navigates to the landing view ──
//
// The header "Perspective" pill / LensSwitcher.tsx it replaces is gone —
// the Persona Preview banner (PersonaPreviewBar.tsx) is the single,
// explicit control for previewing another role's view. The underlying
// Workspace Lens redirect logic the pill used to expose (resolveLens/
// defaultLens/availableLenses, still driving /launch's post-sign-in
// landing) keeps its own pure-function coverage in
// tests/workspace-lens.test.ts.

test.describe('Suite J2 — Persona Preview banner navigates to each landing view', () => {
  test('switching persona redirects instead of orphaning the current URL', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await expect(page).toHaveURL(/\/portfolio$/); // Global Admin's landing

    // Land on a page Executive Board can't see at all, to prove the
    // switch actively navigates away rather than leaving it rendered.
    await page.goto('/admin');
    await expectNoErrorOverlay(page);

    const trigger = page.getByRole('button', { name: /^Persona Preview:/ });
    await trigger.click();
    await page.getByRole('menuitemradio', { name: 'Executive Board' }).click();

    // Executive Board's landing is the SteerCo Briefing — no orphaned /admin.
    await page.waitForURL(/\/steerco$/, { timeout: 15_000 });
    await expectNoErrorOverlay(page);
    await expect(trigger).toHaveAccessibleName('Persona Preview: Executive Board');
    // The Sidebar morphed with it — Executive Board has no Commercial
    // Baseline / Admin & Org Setup links at all.
    await expect(page.getByRole('link', { name: 'Commercial Baseline' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Admin & Org Setup' })).toHaveCount(0);

    // Switch straight to a second persona — Delivery Executive — from a
    // page Executive Board could see but Delivery Executive can't.
    await trigger.click();
    await page.getByRole('menuitemradio', { name: 'Delivery Executive' }).click();
    await page.waitForURL(/\/portfolio$/, { timeout: 15_000 }); // Delivery Executive's landing
    await expectNoErrorOverlay(page);
    await expect(page.getByRole('link', { name: 'Financial Realization' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'RAID Cockpit' })).toBeVisible();

    // Exit preview — back to the real Global Admin, back on Control Tower.
    await trigger.click();
    await page.getByRole('menuitemradio', { name: /your real access/ }).click();
    await page.waitForURL(/\/portfolio$/, { timeout: 15_000 });
    await expectNoErrorOverlay(page);
    await expect(trigger).toHaveAccessibleName('Persona Preview: Global Admin');
    await expect(page.getByRole('link', { name: 'Admin & Org Setup' })).toBeVisible();
  });
});

// ── J3 · governance template application ─────────────────────────────

test.describe('Suite J3 — tenant governance template application', () => {
  test('applying "Agile Delivery" hides Commercial Baseline + Executive Hub from the sidebar', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Governance' }).click();

    // baseline: both modules visible
    await expect(page.getByRole('link', { name: 'Commercial Baseline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Executive Hub' })).toBeVisible();

    await page.getByRole('button', { name: 'Agile Delivery' }).click();
    await expect(page.getByText(/Applied "Agile Delivery"/)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('link', { name: 'Commercial Baseline' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Executive Hub' })).toHaveCount(0);
    // a core module is untouched
    await expect(page.getByRole('link', { name: 'Control Tower' })).toBeVisible();
  });

  test('restoring "Standard Delivery" brings the modules back', async () => {
    await page.getByRole('button', { name: 'Standard Delivery' }).click();
    await expect(page.getByText(/Applied "Standard Delivery"/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Commercial Baseline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Executive Hub' })).toBeVisible();
  });
});

// ── J4 · financial masking under Strict Financial Governance ─────────

test.describe('Suite J4 — financial data masking for delivery roles', () => {
  test('with Strict Financial Governance a Practice Director sees a masked portfolio margin', async () => {
    // admin turns on Strict Financial Governance
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Governance' }).click();
    await page.getByRole('button', { name: 'Strict Financial Governance' }).click();
    await expect(page.getByText(/Applied "Strict Financial Governance"/)).toBeVisible({ timeout: 15_000 });

    // a Practice Director now lands on the Control Tower with margins scrubbed
    await signIn(page, 'pd@a2rventures-demo.test');
    await expect(page.getByRole('heading', { name: 'PS Control Tower' })).toBeVisible();
    const marginCard = page.locator('div.card', { hasText: 'Avg. Baseline Margin' });
    await expect(marginCard).toContainText('••••');
  });

  test('restoring Standard governance un-masks it for the Practice Director', async () => {
    await signIn(page, 'admin@a2rventures-demo.test');
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Governance' }).click();
    await page.getByRole('button', { name: 'Standard Delivery' }).click();
    await expect(page.getByText(/Applied "Standard Delivery"/)).toBeVisible({ timeout: 15_000 });

    await signIn(page, 'pd@a2rventures-demo.test');
    const marginCard = page.locator('div.card', { hasText: 'Avg. Baseline Margin' });
    await expect(marginCard).not.toContainText('••••');
  });
});

// ── J5 · Ops Console SSO configuration ──────────────────────────────

test.describe('Suite J5 — Ops Console SSO configuration', () => {
  test('an operator configures an SSO connection for a tenant, then removes it', async () => {
    await signIn(page, 'ops@a2rventures.com');
    await elevateOps(page);
    await page.goto('/ops/identity');
    await expect(page.getByRole('heading', { name: 'Identity Federation' })).toBeVisible();

    // pick a tenant
    await page.getByRole('link', { name: /Acme Health/ }).first().click();
    await page.waitForURL(/\/ops\/identity\?org=/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /SSO & Identity Federation — Acme Health/ })).toBeVisible();

    // create the connection
    await page.getByLabel('Connection name').fill('Acme Entra ID');
    await page.getByLabel('Email domains (comma-separated)').fill('acme-health.test');
    await page.getByRole('button', { name: 'Create connection' }).click();
    await expect(page.getByText('Identity provider saved')).toBeVisible({ timeout: 15_000 });

    // status chips reflect "Configured" but not yet verified/enabled
    await expect(page.getByText('Configured', { exact: true })).toBeVisible();
    await expect(page.getByText('Unverified', { exact: true })).toBeVisible();

    // clean up
    await page.getByRole('button', { name: 'Remove connection' }).click();
    await expect(page.getByText('Identity provider removed')).toBeVisible({ timeout: 15_000 });

    await expectNoErrorOverlay(page);
  });
});
