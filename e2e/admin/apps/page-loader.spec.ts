import { expect, test, type Page } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * The page loader (Components/Shared/NavProgress.tsx): a slow page change shows a spinning ring in the middle and a
 * line under the top bar, never a percentage; background refreshes never show it. Switching
 * apps dims the screen and keeps the Apps button lit; the Apps box spins while it fetches who you can be.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const { people } = fixture;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const loading = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('nav-loading'));

/** Starts recording whether the loader ever comes up from now on; read it with `everShown`. */
async function watchLoader(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as { loaderShown: boolean };
        w.loaderShown = false;
        new MutationObserver(() => {
            if (document.documentElement.classList.contains('nav-loading')) w.loaderShown = true;
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
}
/** A tab across the top of Settings (General, Users, System…). */
const settingsTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const everShown = (page: Page) => page.evaluate(() => (window as unknown as { loaderShown: boolean }).loaderShown);

/** Holds this page's Inertia page loads to `pattern` back for `ms` before they reach the server. */
async function slowDown(page: Page, pattern: string | RegExp, ms: number, partial = false): Promise<void> {
    await page.route(pattern, async (route) => {
        const headers = route.request().headers();
        if (headers['x-inertia'] && Boolean(headers['x-inertia-partial-data']) === partial) await wait(ms);
        await route.continue();
    });
}

test('a slow page shows the ring in the middle and the line under the top bar, without a number, then both go', async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/settings'));
    await slowDown(admin, /\/users(\?|$)/, 2500);

    await settingsTab(admin, 'Users').click();
    // Not straight away: a page that opens inside 0.4 s never shows it.
    await wait(150);
    expect(await loading(admin)).toBe(false);

    await expect.poll(() => loading(admin), { timeout: 2_000 }).toBe(true);
    const center = admin.locator('.nav-center');
    await expect(center).toHaveCSS('opacity', '1');
    await expect(center).toHaveText('');
    const lineTop = await admin.locator('.nav-line').evaluate((el) => parseFloat(getComputedStyle(el).top));
    expect(lineTop).toBeGreaterThan(0); // under the admin top bar, not on the window edge

    await expect(admin).toHaveURL(/\/users/, { timeout: 60_000 });
    await expect.poll(() => loading(admin), { timeout: 10_000 }).toBe(false);
    await expect(center).toHaveCSS('opacity', '0');
});

test('a page refreshing itself in the background never shows the loader', async ({ browser }) => {
    test.setTimeout(120_000);
    // The courier's dashboard refreshes itself every 20 seconds.
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await courier.goto(app('delivery', '/dashboard'));
    await courier.waitForLoadState('networkidle');

    // Make the refresh slow, so it would be seen if it counted.
    await slowDown(courier, /\/dashboard/, 1500, true);
    await watchLoader(courier);
    await courier.waitForRequest((request) => Boolean(request.headers()['x-inertia-partial-data']), { timeout: 40_000 });
    await wait(2500);
    expect(await everShown(courier)).toBe(false);
});

test('the Apps box spins while it fetches the apps and people', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/dashboard'));
    await admin.route('**/impersonate/users', async (route) => {
        await wait(1500);
        await route.continue();
    });

    await admin.getByRole('button', { name: 'Apps' }).first().click();
    const spinner = admin.getByRole('status', { name: 'Loading apps' });
    await expect(spinner).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Seller', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(spinner).toHaveCount(0);
});

test('switching apps dims the screen with the Apps button lit above it, and the new app opens clear', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/dashboard'));

    await admin.getByRole('button', { name: 'Apps' }).first().click();
    await admin.getByRole('button', { name: 'Seller', exact: true }).click();
    await admin.route('**/impersonate', async (route) => {
        if (route.request().method() === 'POST') await wait(2000);
        await route.continue();
    });
    await admin.getByText(fixture.seller.name, { exact: true }).click();

    await expect(admin.locator('.nav-dim')).toHaveAttribute('data-visible', 'true');
    await expect(admin.locator('.nav-lift')).toHaveAttribute('data-visible', 'true');
    await expect(admin.locator('.nav-lift > *')).toHaveCount(1); // the copy of the Apps button
    await expect(admin.locator('.nav-center')).toHaveCSS('opacity', '0'); // only one loader at a time

    await expect(admin).toHaveURL(/seller\.duka\.test:\d+\/dashboard/, { timeout: 15_000 });
    await expect(admin.locator('.nav-dim')).toHaveAttribute('data-visible', 'false');
    expect(await loading(admin)).toBe(false);
});
