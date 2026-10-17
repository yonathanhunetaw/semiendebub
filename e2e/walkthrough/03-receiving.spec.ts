import { expect, test } from '@playwright/test';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { claim, handOver, handToCourier, raiseTransfer, receive } from '../lib/transfers';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * Receiving with a difference, on the dev database (make walkthrough). Four cartons leave the
 * Remote Hub; three arrive, one of them damaged:
 *
 *   the 2 good ones land on the floor, the damaged one is written off at once,
 *   the missing one stays in the courier's custody as an open "Short" discrepancy,
 *   Demo Keeper (who counted) may not settle it; Demo Keeper Two settles it as found, and it lands.
 */
const sent = 4;

test('receiving: 3 of 4 arrive, 1 damaged; a second keeper settles the missing one', async ({ browser }) => {
    const goods = fixture.remoteVariant;
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    const reference = await test.step(`1. the keeper raises ${sent} × ${goods.sku}, Remote Hub → Store Floor; the courier carries it`, async () => {
        const ref = (await raiseTransfer(keeper, /Remote Hub/, /Store Floor/, sent))!;
        expect(ref, 'the transfer was refused').toBeTruthy();
        await claim(courier, ref);
        await handToCourier(keeper, ref);
        await handOver(courier, ref);

        return ref;
    });

    await test.step('2. the keeper counts 3 arrived, 1 of them damaged', () => receive(keeper, reference, { sent, arrived: 3, damaged: 1 }));

    const cards = (page: typeof keeper) => page.locator('li').filter({ hasText: reference });
    await test.step('3. Receiving lists the short one open, the damaged one written off; the counter may not settle', async () => {
        await keeper.goto(app('stockkeeper', '/receiving?status=all'));
        const short = cards(keeper).filter({ hasText: 'Short' });
        await expect(short).toContainText('Waiting for someone other than the receiver to settle it.');
        await expect(short.getByRole('button', { name: 'Settle' })).toHaveCount(0);
        await expect(cards(keeper).filter({ hasText: 'Damaged' })).toContainText(/written off/i);
    });

    await test.step('4. Demo Keeper Two settles the missing carton as found: it lands', async () => {
        const keeper2 = await signIn(browser, 'stockkeeper', fixture.people.keeper2.email);
        await keeper2.goto(app('stockkeeper', '/receiving'));
        await cards(keeper2).filter({ hasText: 'Short' }).getByRole('button', { name: 'Settle' }).click();
        await keeper2.getByRole('radio', { name: /Found/ }).check();
        await keeper2.getByPlaceholder('Note (optional)').fill('Found under the seat');
        await keeper2.getByRole('button', { name: 'Confirm', exact: true }).click();
        await expect(keeper2.getByText(/RD-[A-Z0-9-]+ settled\./)).toBeVisible();
        await keeper2.goto(app('stockkeeper', '/receiving?status=resolved'));
        await expect(cards(keeper2).filter({ hasText: 'Short' })).toContainText(fixture.people.keeper2.name);
    });

    console.log(`
  Walkthrough done: transfer ${reference}, ${sent} × ${goods.sku} sent, 3 arrived (1 damaged, written off), the missing one found by ${fixture.people.keeper2.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Keeper       ${fixture.keeper.email}    ${app('stockkeeper', '/receiving?status=all')}
    Keeper Two   ${fixture.people.keeper2.email}    ${app('stockkeeper', '/receiving?status=resolved')}
    Courier      ${fixture.courier.email}    ${app('delivery', '/transfers?tab=mine')}
`);
});
