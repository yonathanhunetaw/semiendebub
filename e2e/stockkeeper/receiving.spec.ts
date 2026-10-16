import { expect, test } from '@playwright/test';
import { stockOf } from '../lib/inspect';
import { app, fixture, signIn } from '../lib/support';
import { claim, handOver, handToCourier, raiseTransfer, receive } from '../lib/transfers';

/**
 * Receiving with a difference. Four leave the Remote Hub; three arrive, one of them damaged:
 *
 *   the 2 good ones land in the store, the damaged one is written off (settled at once),
 *   the missing one stays in the courier's custody as an open "Short" discrepancy,
 *   the keeper who counted cannot settle it; a second keeper settles it as found, and it lands.
 */
const variant = fixture.remoteVariant.id;
const { remoteHub, transit } = fixture.locations;
// "store": every store location but the Remote Hub. Landed units may go on towards the shelf
// at once (a waiting refill), so the floor alone is not the measure.
const at = () => {
    const all = stockOf(variant);
    const store = Object.entries(all).filter(([id]) => ![remoteHub, transit].includes(Number(id))).reduce((sum, [, units]) => sum + units, 0);

    return { remote: all[String(remoteHub)] ?? 0, transit: all[String(transit)] ?? 0, store };
};

test('three of four arrive, one damaged: the shortfall waits with the courier until another keeper settles it', async ({ browser }) => {
    test.setTimeout(180_000);
    const before = at();
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    const reference = (await raiseTransfer(keeper, /Remote Hub/, /Store Floor/, 4))!;
    await claim(courier, reference);
    await handToCourier(keeper, reference);
    await handOver(courier, reference);

    await test.step('the keeper counts 3 arrived, 1 of them damaged', async () => {
        await receive(keeper, reference, { sent: 4, arrived: 3, damaged: 1 });
        // 2 good ones land; the damaged one is written off; the missing one is still the courier's.
        await expect.poll(() => at()).toEqual({ remote: before.remote - 4, transit: before.transit + 1, store: before.store + 2 });
    });

    const cards = (page: typeof keeper) => page.locator('li').filter({ hasText: reference });
    await test.step('Receiving lists the short one open and the damaged one settled; the counter may not settle', async () => {
        await keeper.goto(app('stockkeeper', '/receiving?status=all'));
        const short = cards(keeper).filter({ hasText: 'Short' });
        await expect(short).toContainText('Waiting for someone other than the receiver to settle it.');
        await expect(short.getByRole('button', { name: 'Settle' })).toHaveCount(0);
        await expect(cards(keeper).filter({ hasText: 'Damaged' })).toContainText(/written off/i);
    });

    await test.step('a second keeper settles it as found: it lands', async () => {
        const keeper2 = await signIn(browser, 'stockkeeper', fixture.people.keeper2.email);
        await keeper2.goto(app('stockkeeper', '/receiving'));
        await cards(keeper2).filter({ hasText: 'Short' }).getByRole('button', { name: 'Settle' }).click();
        await keeper2.getByRole('radio', { name: /Found/ }).check();
        await keeper2.getByPlaceholder('Note (optional)').fill('Under the seat');
        await keeper2.getByRole('button', { name: 'Confirm', exact: true }).click();
        await expect(keeper2.getByText(/RD-[A-Z0-9-]+ settled\./)).toBeVisible();

        await expect.poll(() => at()).toEqual({ remote: before.remote - 4, transit: before.transit, store: before.store + 3 });
        await keeper2.goto(app('stockkeeper', '/receiving?status=resolved'));
        await expect(cards(keeper2).filter({ hasText: 'Short' })).toContainText('E2E Keeper Two');
    });
});
