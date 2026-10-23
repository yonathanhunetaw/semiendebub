import { expect, test, type Page } from '@playwright/test';
import { closeWindows, fixture, signIn } from '../lib/support';
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
