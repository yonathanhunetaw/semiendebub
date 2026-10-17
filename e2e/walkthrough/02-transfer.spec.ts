import { expect, test } from '@playwright/test';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { cardOf, claim, handOver, handToCourier, raiseTransfer, receive } from '../lib/transfers';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A transfer from Main Store's Remote Hub to its floor, on the dev database (make walkthrough).
 * It moves part of what the shipment walkthrough brought in. The Remote Hub is another site,
 * so a courier carries it:
 *
 *   Demo Keeper    raises the transfer (Remote Hub → Store Floor)
 *   Demo Courier   claims it from the pool
 *   Demo Keeper    hands it to the courier          (it leaves the Remote Hub)
 *   Demo Courier   hands it over at the store       (still the courier's)
 *   Demo Keeper    checks it and receives it        (it lands on the floor)
 */
const quantity = 4;

test(`transfer: ${quantity} from the Remote Hub to the store floor, carried by the courier`, async ({ browser }) => {
    const goods = fixture.remoteVariant;
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);

    const reference = await test.step(`1. the keeper raises ${quantity} × ${goods.sku}, Remote Hub → Store Floor`, async () => {
        const ref = await raiseTransfer(keeper, /Remote Hub/, /Store Floor/, quantity);
        expect(ref, 'the transfer was refused').toBeTruthy();

        return ref!;
    });

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('2. the courier claims it from the pool', () => claim(courier, reference));
    await test.step('3. the keeper hands it to the courier', () => handToCourier(keeper, reference));
    await test.step('4. the courier hands it over at the store', () => handOver(courier, reference));

    await test.step('5. the keeper checks it and receives it: it lands on the floor', async () => {
        await keeper.goto(app('stockkeeper', '/transfers'));
        await expect(cardOf(keeper, reference)).toContainText('handed over: check it and receive it');
        await receive(keeper, reference, { sent: quantity });
    });

    console.log(`
  Walkthrough done: transfer ${reference}, ${quantity} × ${goods.sku} (${goods.item}) from ${fixture.remoteHub.name} to the floor of ${fixture.store.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Keeper   ${fixture.keeper.email}    ${app('stockkeeper', '/transfers')}
    Courier  ${fixture.courier.email}    ${app('delivery', '/transfers?tab=mine')}
    Admin    ${fixture.people.admin.email}    ${app('admin', '/inventory/transfers')}
`);
});
