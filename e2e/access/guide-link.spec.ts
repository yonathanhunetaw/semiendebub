import { expect, test } from '@playwright/test';
import { app, fixture, signIn } from '../lib/support';

/**
 * "How Duka works" is reached from each app's Settings only: no floating "?" button and no "How this works" chip
 * on any page. (Stock keepers have no Settings page, so it is in their menu.)
 */
const { people } = fixture;

test('no page shows a How this works button, in any app', async ({ browser }) => {
    const visits: Array<[Awaited<ReturnType<typeof signIn>>, string]> = [
        [await signIn(browser, 'seller', fixture.seller.email), app('seller', '/dashboard')],
        [await signIn(browser, 'seller', fixture.seller.email), app('seller', '/carts')],
        [await signIn(browser, 'delivery', fixture.courier.email), app('delivery', '/dashboard')],
        [await signIn(browser, 'stockkeeper', fixture.keeper.email), app('stockkeeper', '/dashboard')],
        [await signIn(browser, 'admin', people.admin.email), app('admin', '/dashboard')],
    ];

    for (const [page, url] of visits) {
        await page.goto(url);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await expect(page.getByLabel('How this works'), url).toHaveCount(0);
        await expect(page.getByText('How this works'), url).toHaveCount(0);
    }
});

test('the guide is one step from each app\'s Settings', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto(app('seller', '/settings'));
    await seller.getByRole('link', { name: /The people, the order's road/ }).click();
    await expect(seller).toHaveURL(/seller\.duka\.test:\d+\/guide/);

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await courier.goto(app('delivery', '/profile'));
    await courier.getByRole('link', { name: /How Duka works/ }).click();
    await expect(courier).toHaveURL(/delivery\.duka\.test:\d+\/guide/);

    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/settings'));
    await admin.getByRole('link', { name: /How Duka works/ }).click();
    await expect(admin).toHaveURL(/admin\.duka\.test:\d+\/guide/);

    // Stock keepers have no Settings page: the guide is in their menu.
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await keeper.setViewportSize({ width: 1280, height: 800 });
    await keeper.goto(app('stockkeeper', '/dashboard'));
    await keeper.getByRole('navigation', { name: 'Stock keeper sections' }).getByRole('link', { name: /How Duka works/ }).click();
    await expect(keeper).toHaveURL(/stockkeeper\.duka\.test:\d+\/guide/);
});
