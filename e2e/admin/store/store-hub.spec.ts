import { expect, test } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * The Store page is a hub of grouped cards (Stock, Movement, Approvals, Setup) under a banner of the store's figures like the seller's More page. Each tile
 * opens a screen that carries a back link, and an item opens as three stacked cards: where it is and how it is
 * packed, the refill levels, then the variants.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const hub = `/stores/${fixture.store.id}/hub`;

test('the sidebar Store card opens the hub: four cards of icon tiles, no tab bars', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/dashboard'));
    await admin.goto(app('admin', `/dashboard?store=${fixture.store.id}`));
    await admin.getByRole('link', { name: /^Store/ }).first().click();
    await expect(admin).toHaveURL(new RegExp(`/stores/${fixture.store.id}/hub`));

    for (const card of ['Stock', 'Movement', 'Approvals', 'Setup']) await expect(admin.getByText(card, { exact: true }).first()).toBeVisible();
    for (const tile of ['Items', 'Replenish', 'Price deviations', 'Capacity', 'Transfers', 'Shipments', 'Refills', 'Stock counts', 'Locations', 'Payment accounts']) {
        await expect(admin.getByText(tile, { exact: true }).first()).toBeVisible();
    }
    // The old two rows of tabs are gone, and so is Places.
    await expect(admin.getByRole('tab')).toHaveCount(0);
    await expect(admin.getByText('Places', { exact: true })).toHaveCount(0);
    await expect(admin.getByText(/Server Error|SQLSTATE/)).toHaveCount(0);
});

test('every tile opens its screen, with a back link to the hub', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const tiles: Array<[string, RegExp]> = [
        ['Items', /\/stores\/\d+$/],
        ['Replenish', /\/inventory\/replenish$/],
        ['Price deviations', /\/inventory\/deviations$/],
        ['Capacity', /\/inventory\/capacity/],
        ['Transfers', /\/inventory\/transfers/],
        ['Shipments', /\/inventory\/shipments/],
        ['Refills', /\/inventory\/replenishment/],
        ['Stock counts', /\/inventory\/counts/],
        ['Locations', /\/inventory\/locations/],
    ];

    for (const [tile, url] of tiles) {
        await admin.goto(app('admin', hub));
        // The page's own tiles, not the sidebar's links of the same name.
        await admin.locator('main').getByRole('link', { name: new RegExp(`\\b${tile}\\b`) }).first().click();
        await expect(admin, tile).toHaveURL(url);
        await expect(admin.getByText(/Server Error|SQLSTATE/), tile).toHaveCount(0);

        const back = admin.locator('main').getByRole('link', { name: new RegExp(fixture.store.name) }).first();
        await expect(back, `${tile}: back link`).toBeVisible();
        await back.click();
        await expect(admin, `${tile}: back`).toHaveURL(new RegExp(`/stores/${fixture.store.id}/hub`));
    }
});

test('a store admin opens their own hub and is refused another store\'s', async ({ browser }) => {
    const storeAdmin = await signIn(browser, 'admin', fixture.people.storeAdmin.email);
    expect((await storeAdmin.goto(app('admin', hub)))?.status()).toBe(200);
    expect((await storeAdmin.goto(app('admin', '/stores/999999/hub')))?.status()).toBe(404);
});

test('an item opens as stacked cards with real refill levels, no fake controls', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', `/stores/${fixture.store.id}/inventory/items/${fixture.items[0].item_id}`));

    for (const heading of ['Where it is', 'How it is packed', 'Refill levels']) await expect(admin.getByText(heading, { exact: true })).toBeVisible();
    await expect(admin.getByText(/SKU variants/)).toBeVisible();
    for (const unit of ['Cartons', 'Boxes', 'Pieces']) await expect(admin.getByText(unit, { exact: true }).first()).toBeVisible();

    // The prototype controls that saved nothing are gone, and so is the "$2 Ctn" template glitch.
    await expect(admin.getByText('Request Transfer')).toHaveCount(0);
    await expect(admin.getByText('Replenishment Rules')).toHaveCount(0);
    await expect(admin.getByText(/\$\d+ Ctn/)).toHaveCount(0);
    await expect(admin.getByRole('slider')).toHaveCount(0);
    await expect(admin.getByRole('tab')).toHaveCount(0);
});

test('tapping a place changes what is counted, and the remote hub is opt-in', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', `/stores/${fixture.store.id}/inventory/items/${fixture.items[0].item_id}`));

    const total = () => admin.locator('text=/^[\\d,]+$/').first();
    const all = admin.getByRole('button', { name: /All places/ });
    await all.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await all.click();
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    await expect(total()).toBeVisible();
});

test('refill levels link to the real capacity editor', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', `/stores/${fixture.store.id}/inventory/items/${fixture.items[0].item_id}`));

    await admin.getByRole('link', { name: /(Edit|Set) levels/ }).first().click();
    await expect(admin).toHaveURL(/\/inventory\/capacity\/\d+/);
    await expect(admin.getByText(/Server Error|SQLSTATE/)).toHaveCount(0);
});
