import { expect, test, type Page } from '@playwright/test';
import { closeWindows, fixture, signIn } from '../lib/support';
import { playIn } from '../lib/world';

/**
 * First person: through the worker's eyes, drag to look round, scroll to zoom the lens, and read a table's
 * screen and sign, a board on a wall, the racks. Screenshots are kept in test-results/ for the owner to look at.
 */
test.afterEach(async () => closeWindows());

const goToDesk = async (page: Page, label: RegExp) => {
    await page.getByRole('button', { name: 'Desks', exact: true }).click();
    const menu = page.getByTestId('desk-menu');
    await expect(menu).toBeVisible();
    await menu.locator('div').filter({ hasText: label }).filter({ has: page.getByRole('button', { name: 'Go' }) }).last().getByRole('button', { name: 'Go' }).click();
};

/** Drag across the world: the view turns (a mouse drag that moves more than a tap is a look). */
const look = async (page: Page, dx: number, dy = 0) => {
    const view = page.viewportSize()!;
    const x = view.width / 2;
    const y = view.height * 0.45;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);
};

/** Scroll in (lens closer) or, with a negative count, out. */
const zoomIn = async (page: Page, clicks: number) => {
    const view = page.viewportSize()!;
    await page.mouse.move(view.width / 2, view.height * 0.45);
    for (let i = 0; i < Math.abs(clicks); i++) await page.mouse.wheel(0, clicks > 0 ? -300 : 300);
    await page.waitForTimeout(1500);
};

test('through the worker\'s eyes: a table, the staff board and the shop', async ({ browser }) => {
    test.setTimeout(400_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1100, height: 720 });
    await playIn(page, 'admin');

    // The HUD's switch, and V.
    await page.getByRole('button', { name: 'First person', exact: true }).click();
    await expect(page.getByRole('button', { name: 'First person', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/fp-1-outside.png' });
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'First person', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // At a desk: the table's sign and screen, zoomed in to read.
    await goToDesk(page, /Staff & keys desk/);
    await expect(page.getByTestId('station-work')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Close the desk' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/fp-2-desk.png' });
    await zoomIn(page, 3);
    await page.screenshot({ path: 'test-results/fp-3-desk-zoomed.png' });
    await zoomIn(page, -3);

    // At the board: turn to the west wall and read it.
    await goToDesk(page, /Staff board/);
    await expect(page.getByTestId('station-board')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Close the desk' }).click();
    await look(page, -300);
    await page.screenshot({ path: 'test-results/fp-4-board.png' });
    await zoomIn(page, 3);
    await page.screenshot({ path: 'test-results/fp-5-board-zoomed.png' });
    await zoomIn(page, -3);

    // And in the shop: the counter, then the notice board on the back wall and the racks beside it.
    await goToDesk(page, /Counter desk/);
    await expect(page.locator('[data-testid^="station-"]').first()).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Close the desk' }).click();
    await page.screenshot({ path: 'test-results/fp-6-shop.png' });
    await look(page, 0, 0);
    await zoomIn(page, 2);
    await page.screenshot({ path: 'test-results/fp-7-shop-zoomed.png' });
    expect(errors).toEqual([]);
});
