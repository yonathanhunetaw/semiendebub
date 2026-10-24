import { expect, test, type Page } from '@playwright/test';
import { app, closeWindows, fixture, signIn } from '../lib/support';
import { playIn } from '../lib/world';

/**
 * The world's layout, looked at: the shop (12 × 12 m), the office behind it, the delivery platform and the ground
 * beyond the site. Screenshots only; they are what the owner looks at, so they are kept in test-results/.
 */
test.afterEach(async () => closeWindows());

const zoom = async (page: Page, clicks: number, direction = 1) => {
    const view = page.viewportSize()!;
    await page.mouse.move(view.width / 2, view.height / 2);
    for (let i = 0; i < clicks; i++) await page.mouse.wheel(0, 500 * direction);
    await page.waitForTimeout(1200);
};

const goToDesk = async (page: Page, label: RegExp) => {
    await page.getByRole('button', { name: 'Desks', exact: true }).click();
    const menu = page.getByTestId('desk-menu');
    await expect(menu).toBeVisible();
    await menu.locator('div').filter({ hasText: label }).filter({ has: page.getByRole('button', { name: 'Go' }) }).last().getByRole('button', { name: 'Go' }).click();
};

test('the shop, the office and the platform', async ({ browser }) => {
    test.setTimeout(400_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // A modest window: a big one at retina size renders slowly in headless Chrome and the worker's walk (paced by frame time) crawls.
    await page.setViewportSize({ width: 1100, height: 720 });
    await playIn(page, 'admin');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/layout-1-spawn.png' });

    // Into the shop, to its counter.
    await goToDesk(page, /Counter desk/);
    await expect(page.locator('[data-testid^="station-"]').first()).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/layout-2-shop.png' });

    // Then to the office, and its board.
    await page.getByRole('button', { name: 'Close the desk' }).click();
    await goToDesk(page, /Staff board/);
    await expect(page.getByTestId('station-board')).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/layout-3-board.png' });
    await page.getByRole('button', { name: 'Close the desk' }).click();
    await zoom(page, 3);
    await page.screenshot({ path: 'test-results/layout-4-office.png' });

    // The whole site from the director's camera.
    await page.getByRole('button', { name: 'Director', exact: true }).click();
    await zoom(page, 12);
    await page.screenshot({ path: 'test-results/layout-5-site.png' });
    expect(errors).toEqual([]);
});

test('the delivery platform and the road', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await signIn(browser, 'delivery', fixture.courier.email);
    await page.setViewportSize({ width: 1100, height: 720 });
    await playIn(page, 'delivery');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/layout-6-platform.png' });
    await page.getByRole('button', { name: 'Director', exact: true }).click();
    await zoom(page, 6);
    await page.screenshot({ path: 'test-results/layout-7-platform-wide.png' });
});

test('the whole site along its street, and each place opened at its door', async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(app('admin', '/guide?view=world'));
    await expect(page.getByRole('button', { name: 'Play as a worker' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'See the whole site' }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/site-1-home.png' });
    // The shop from inside: the racks wall to wall, hanging over the store floor; then the whole shop from above.
    await page.getByRole('button', { name: "See the shop's racks" }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-results/site-0-racks-back.png' });
    await page.getByRole('button', { name: 'Whole shop' }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-results/site-0-whole-shop.png' });
    await page.getByRole('button', { name: 'See the whole site' }).click();
    await page.waitForTimeout(1800);
    // Zoomed out, only the places along the street are named: not the shop's shelf, floor or counter.
    await expect(page.locator('.world-label:not(.is-far)', { hasText: /^Counter$/ })).toHaveCount(0);

    // Opening a place puts the worker at its door, in Play; Escape steps back out.
    const places = ['Suppliers', 'Storage hub', 'Main Hub A', 'Main Hub B', 'Remote Hub', 'Main Store', 'Office', 'Customer parking', 'Admin', 'Shops'];
    for (const [n, label] of places.entries()) {
        await page.locator('.world-label', { hasText: new RegExp(`^${label}$`) }).first().dispatchEvent('click');
        await expect(page.getByRole('button', { name: 'Back to watching' })).toBeVisible();
        await page.waitForTimeout(2200);
        await page.screenshot({ path: `test-results/site-${n + 2}-${label.toLowerCase().replace(/ /g, '-')}.png` });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Play as a worker' })).toBeVisible();
        await page.waitForTimeout(600);
    }
    expect(errors).toEqual([]);
});

test('on a phone: the whole site fits, and a place opens at its door', async ({ browser }) => {
    test.setTimeout(200_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(app('admin', '/guide?view=world'));
    await expect(page.getByRole('button', { name: 'Play as a worker' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'See the whole site' }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/phone-1-home.png' });
    await page.locator('.world-label', { hasText: /^Remote Hub$/ }).dispatchEvent('click');
    await expect(page.getByRole('button', { name: 'Back to watching' })).toBeVisible();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: 'test-results/phone-2-remote-hub-door.png' });
    // Director: the camera goes back over the whole site, the street running top to bottom.
    await page.getByRole('button', { name: 'Director', exact: true }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-results/phone-3-director.png' });
    expect(errors).toEqual([]);
});
