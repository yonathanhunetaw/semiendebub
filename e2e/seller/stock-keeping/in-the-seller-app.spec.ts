import { expect, test, type Page } from '@playwright/test';
import { unitsAt } from '../../lib/inspect';
import { app, fixture, flash, signIn } from '../../lib/support';

/**
 * A seller who is also ticked as a stock keeper does stock keeping inside the seller app, under /stock: the
 * same screens as the stock keeper app, but every link stays on the seller app, and in there they act as a
 * stock keeper. A seller who is not ticked has no way in.
 */
const { people } = fixture;

const sellerHost = /^http:\/\/seller\.duka\.test:\d+\//;

/** Fails if the page left the seller app or broke. */
async function expectStillInSeller(page: Page, what: string): Promise<void> {
    await expect(page, what).toHaveURL(sellerHost);
    await expect(page.getByText(/Server Error|SQLSTATE|Forbidden/), what).toHaveCount(0);
}

test('the More page lists Stock keeping for a dual seller and opens it under /stock', async ({ browser }) => {
    const dual = await signIn(browser, 'seller', people.dualSeller.email);
    await dual.goto(app('seller', '/menu'));

    await expect(dual.getByText('Stock keeping', { exact: true }).first()).toBeVisible();
    await dual.getByRole('link', { name: /Stock keeping/ }).first().click();
    await expect(dual).toHaveURL(/seller\.duka\.test:\d+\/stock\/dashboard/);
    await expectStillInSeller(dual, 'stock dashboard');
});

test('a plain seller has no Stock keeping card and gets nothing at /stock', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto(app('seller', '/menu'));
    await expect(seller.getByText('Stock keeping', { exact: true })).toHaveCount(0);

    const response = await seller.goto(app('seller', '/stock/dashboard'));
    expect(response?.status()).toBe(403);
});

test('every stock keeping screen opens in the seller app and none of its links leave it', async ({ browser }) => {
    const dual = await signIn(browser, 'seller', people.dualSeller.email);
    const screens = ['dashboard', 'inventory', 'transfers', 'shelving', 'shipments', 'orders', 'stock-alerts', 'levels', 'floor', 'receiving', 'arrivals', 'stocktakes'];

    for (const screen of screens) {
        const response = await dual.goto(app('seller', `/stock/${screen}`));
        expect(response?.status(), screen).toBe(200);
        await expectStillInSeller(dual, screen);

        // Every link on the page points at the seller app (the nav, the tiles, the rows).
        const hrefs = await dual.locator('a[href^="http"]').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
        const leaving = hrefs.filter((href) => !/^http:\/\/seller\.duka\.test:\d+\//.test(href));
        expect(leaving, `${screen}: links that leave the seller app`).toEqual([]);
    }
});

test('on a desktop the stock keeper nav stays in the seller app and offers a way back to selling', async ({ browser }) => {
    const dual = await signIn(browser, 'seller', people.dualSeller.email);
    await dual.setViewportSize({ width: 1280, height: 800 });
    await dual.goto(app('seller', '/stock/dashboard'));

    const nav = dual.getByRole('navigation', { name: 'Stock keeper sections' });
    await expect(nav.getByRole('link', { name: /Stock alerts/ })).toBeVisible();
    // Calendar, My work and the guide are the seller app's own, so they are not repeated here.
    await expect(nav.getByRole('link', { name: /Calendar|My work|How Duka works/ })).toHaveCount(0);

    await nav.getByRole('link', { name: /Levels/ }).click();
    await expect(dual).toHaveURL(/seller\.duka\.test:\d+\/stock\/levels/);
    await expect(nav.getByRole('link', { name: /Levels/ })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('link', { name: /Seller app/ }).click();
    await expect(dual).toHaveURL(/seller\.duka\.test:\d+\/dashboard/);
});

test('the work is done as a stock keeper: a stocktake starts, and its page stays under /stock', async ({ browser }) => {
    const dual = await signIn(browser, 'seller', people.dualSeller.email);
    await dual.setViewportSize({ width: 1280, height: 800 });
    await dual.goto(app('seller', '/stock/stocktakes'));
    await expectStillInSeller(dual, 'stocktakes');

    // The same permission screen the stock keeper app has: shelving rules answer as a stock keeper.
    const response = await dual.goto(app('seller', '/stock/shelving/permissions'));
    expect(response?.status()).toBe(200);
    expect(response?.url()).toMatch(/\/stock\/shelving\/permissions/);
});

test('the stock keeper app itself is unchanged for a plain stock keeper', async ({ browser }) => {
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await keeper.setViewportSize({ width: 1280, height: 800 });
    await keeper.goto(app('stockkeeper', '/dashboard'));

    const nav = keeper.getByRole('navigation', { name: 'Stock keeper sections' });
    await expect(nav.getByRole('link', { name: /Calendar/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Seller app/ })).toHaveCount(0);
    await nav.getByRole('link', { name: /Levels/ }).click();
    await expect(keeper).toHaveURL(/stockkeeper\.duka\.test:\d+\/levels/);
});

test('a dual seller counts the Remote Hub inside the seller app; a second keeper approves it and the ledger moves', async ({ browser }) => {
    const { remoteVariant, remoteHub } = fixture;
    const before = unitsAt(remoteVariant.id, remoteHub.id);
    test.skip(before < 2, 'the Remote Hub needs at least two units of the seeded variant');

    const dual = await signIn(browser, 'seller', people.dualSeller.email);
    await dual.goto(app('seller', '/stock/stocktakes'));
    await dual.getByLabel('Place').selectOption(String(remoteHub.id));
    await dual.getByPlaceholder('e.g. Monthly count, aisle A').fill('E2E dual count');
    await dual.getByRole('button', { name: 'Start counting' }).click();

    // The redirect after starting stays in the seller app, under /stock.
    await expect(dual).toHaveURL(/seller\.duka\.test:\d+\/stock\/stocktakes\/\d+$/);

    await dual.getByPlaceholder('Find an item, SKU or barcode').fill(remoteVariant.sku);
    const line = dual.getByRole('listitem').filter({ hasText: remoteVariant.sku });
    await line.getByRole('spinbutton').fill(String(before - 1));
    await line.getByRole('spinbutton').press('Enter');
    await expect(line).toContainText('-1');
    await dual.getByRole('button', { name: 'Submit count' }).click();
    await expect(dual.getByText('Someone other than you approves this count.')).toBeVisible();
    await expect(dual).toHaveURL(/seller\.duka\.test:\d+\/stock\/stocktakes\/\d+$/);
    expect(unitsAt(remoteVariant.id, remoteHub.id)).toBe(before);

    // A different keeper approves it in the stock keeper app, and the shortfall is booked.
    const approver = await signIn(browser, 'stockkeeper', people.keeper2.email);
    await approver.goto(app('stockkeeper', new URL(dual.url()).pathname.replace('/stock', '')));
    await approver.getByRole('button', { name: 'Approve and book 1 difference' }).click();
    await expect(flash(approver, 'Count approved and differences booked.')).toBeVisible();
    expect(unitsAt(remoteVariant.id, remoteHub.id)).toBe(before - 1);
});
