import { test, expect, type Page } from '@playwright/test';

/**
 * Suite M — server-only site routing (`A2R_SITE_MODE`, P1).
 *
 *   M1  when `/` serves a page (marketing mode — the default), it is the
 *       public marketing page
 *   M2  the routing flag is NOT in the client bundle
 *   M3  a signed-in visitor to `/` is bounced into the app, not shown the
 *       marketing page — true in every mode
 *
 * M1/M2 self-skip if the server under test is running in `internal` /
 * `live` mode (where `/` is a redirect).
 *
 * The Cache-Control posture (marketing → public, everything else →
 * no-store) is only observable against a production build — `next dev`
 * forces `no-store` on every response — so it is verified separately, not
 * here.
 */

const DEMO_PW = 'password12345';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await page.context().close();
});

test.describe('Suite M — site routing model', () => {
  test('M1 · anonymous `/` is the marketing page', async () => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
    test.skip(new URL(page.url()).pathname !== '/', 'server not in marketing mode');

    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /Absolute Clarity/i })).toBeVisible();
    await expect(page.getByText('Coming soon · Early access')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('M2 · the routing flag is not exposed to the browser', async () => {
    test.skip(new URL(page.url()).pathname !== '/', 'server not in marketing mode');
    const html = await page.content();
    expect(html).not.toMatch(/NEXT_PUBLIC_COMING_SOON/);
    expect(html).not.toMatch(/A2R_SITE_MODE/);
  });

  test('M3 · a signed-in visitor to `/` is sent into the app', async () => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('pm@a2rventures-demo.test');
    await page.locator('input[type="password"]').fill(DEMO_PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !/\/login|\/launch/.test(u.pathname), { timeout: 30_000 });

    await page.goto('/');
    await expect(page).toHaveURL(
      /\/(portfolio|steerco|capacity|financials|command|reports)/,
      { timeout: 15_000 },
    );
    await expect(page.getByText('Coming soon · Early access')).toHaveCount(0);
  });
});
