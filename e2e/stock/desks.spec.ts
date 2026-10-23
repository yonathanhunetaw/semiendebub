import { expect, test } from '@playwright/test';
import { closeWindows, fixture, signIn } from '../lib/support';
import { goLive, playIn, walkToDesk } from '../lib/world';

/**
 * The desks of the Guide world: every module that is not a walk-and-carry job stands at a desk on
 * the plaza south of the shop. A desk lists what its module has waiting for the viewer and posts the
 * same routes the module's own page does (game/stations.ts). One world rendering at a time.
 */
test.afterEach(async () => closeWindows());

const apps = [
    { name: 'admin', sub: 'admin', email: () => fixture.people.admin.email, desks: [/Calendar & office/, /Staff & keys/] },
    { name: 'seller', sub: 'seller', email: () => fixture.seller.email, desks: [/Orders desk/, /Calendar & office/] },
    { name: 'stock keeper', sub: 'stockkeeper', email: () => fixture.keeper.email, desks: [/Receiving desk/, /Transfers desk/, /Counts & levels/] },
    { name: 'courier', sub: 'delivery', email: () => fixture.courier.email, desks: [/Delivery desk/, /Calendar & office/] },
] as const;

for (const a of apps) {
    test(`Practice: the ${a.name}'s desks are listed, walked to, and open`, async ({ browser }) => {
        test.setTimeout(300_000);
        const page = await signIn(browser, a.sub, a.email());
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await playIn(page, a.sub);

        await page.getByRole('button', { name: 'Desks', exact: true }).click();
        const menu = page.getByTestId('desk-menu');
        await expect(menu).toBeVisible({ timeout: 20_000 });
        for (const desk of a.desks) await expect(menu.getByText(desk).first()).toBeVisible();
        await page.screenshot({ path: `test-results/desks-${a.sub}-menu.png` });
        await page.getByRole('button', { name: 'Close the desk list' }).click();

        // Walk to the first one and see its card.
        const first = a.desks[0];
        await page.getByRole('button', { name: 'Desks', exact: true }).click();
        await menu.locator('div').filter({ hasText: first }).filter({ has: page.getByRole('button', { name: 'Go' }) }).last().getByRole('button', { name: 'Go' }).click();
        await expect(page.locator('[data-testid^="station-"]').first()).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `test-results/desks-${a.sub}-desk.png` });
        expect(errors).toEqual([]);
    });
}

test('Live: the stock keeper raises a transfer at the Transfers desk, answered by the real route', async ({ browser }) => {
    test.setTimeout(300_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));
    await playIn(keeper, 'stockkeeper');
    await goLive(keeper);
    await walkToDesk(keeper, /Transfers desk/, 'moves');

    const card = keeper.getByTestId('item-moves-remote_hub-backroom');
    await card.getByRole('button', { name: /Raise the transfer/ }).click();
    await card.getByTestId('field-quantity').fill('2');
    await card.getByRole('button', { name: /Raise the transfer \(for real\)/ }).click();
    // The route's own answer: a real transfer, queued for dispatch.
    await expect(keeper.getByText(/Transfer raised and queued for dispatch/)).toBeVisible({ timeout: 20_000 });
    await keeper.screenshot({ path: 'test-results/desks-live-transfer.png' });
    expect(errors).toEqual([]);
});

test('Live: the stock keeper starts a count at the Counts desk', async ({ browser }) => {
    test.setTimeout(300_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await playIn(keeper, 'stockkeeper');
    await goLive(keeper);
    await walkToDesk(keeper, /Counts & levels/, 'counts');
    const card = keeper.getByTestId('item-counts-start');
    await card.getByRole('button', { name: /Start a count/ }).click();
    // The route redirects to the new count's page, so the world leaves for it.
    await card.getByRole('button', { name: /Start a count/ }).click();
    await expect(keeper).toHaveURL(/\/stocktakes\/\d+/, { timeout: 30_000 });
    // Leave nothing open behind: a second count on the same place would stop the stocktake specs.
    await keeper.getByRole('button', { name: 'Void' }).click();
    await expect(keeper.getByText(/Count voided/)).toBeVisible({ timeout: 15_000 });
});
