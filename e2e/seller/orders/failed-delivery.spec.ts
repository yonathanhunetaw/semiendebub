import { expect, test, type Browser, type Page } from '@playwright/test';
import {
    addFirstVariant,
    confirmPayment,
    courierDelivery,
    openCheckout,
    payInCash,
    pickAndPack,
    placeOrder,
    reportProblem,
    runCard,
    runStep,
    startCart,
} from '../../lib/flows';
import { saleOf, stockOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * A courier delivery that does not go to plan. A failed attempt can be retried; a run returned to
 * the depot cancels the order and puts every picked line back where it was picked from.
 */
const item = fixture.items[0];
/** What the store holds of the item, shelf and floor together, plus what couriers carry. */
const storeUnits = () => {
    const stock = stockOf(item.variant);
    const at = (id: number) => stock[String(id)] ?? 0;

    return { store: at(fixture.locations.shelf) + at(fixture.locations.floor), transit: at(fixture.locations.transit) };
};

/** A paid, packed walk-in order waiting for the E2E courier; returns its reference. */
async function readyForCourier(browser: Browser, seller: Page): Promise<string> {
    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, item.item_id);
    await openCheckout(seller, cartId);
    await payInCash(seller);
    await courierDelivery(seller);
    const reference = await placeOrder(seller, 'Place order & request confirmation');

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await confirmPayment(manager, reference);
    await pickAndPack(seller, reference, 'delivery');

    return reference;
}

test('nobody home: the courier reports it, tries again and delivers', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const reference = await readyForCourier(browser, seller);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await courier.goto(app('delivery', '/delivery'));

    await test.step('collect, start the run, then report nobody home', async () => {
        await runStep(courier, reference, 'Collect', 'Start run');
        await runStep(courier, reference, 'Start run', 'Mark delivered');
        await reportProblem(courier, reference, 'Nobody home');
        await expect(runCard(courier, reference)).toContainText('Failed');
    });

    await test.step('try again: collect, start the run and deliver', async () => {
        await runStep(courier, reference, 'Collect', 'Start run');
        await runStep(courier, reference, 'Start run', 'Mark delivered');
        await runStep(courier, reference, 'Mark delivered', null);
        await expect.poll(() => saleOf(reference).stage).toBe('delivered');
    });
});

test('refused at the door: returned to the depot, the order is cancelled and the stock is back', async ({ browser }) => {
    const before = storeUnits();
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const reference = await readyForCourier(browser, seller);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await courier.goto(app('delivery', '/delivery'));

    await test.step('collected: one unit is in the courier\'s hands', async () => {
        await runStep(courier, reference, 'Collect', 'Start run');
        expect(storeUnits()).toEqual({ store: before.store - 1, transit: before.transit + 1 });
    });

    await test.step('refused: report it and return it to the depot', async () => {
        await reportProblem(courier, reference, 'Refused');
        await runStep(courier, reference, 'Return to depot', null);
        await expect.poll(() => saleOf(reference).stage).toBe('cancelled');
    });

    // Open question for the owner: the cash stays confirmed on the seller's balance; there is
    // no refund step yet.
    await test.step('the unit is back in the store, nothing left with the courier', () => {
        expect(storeUnits()).toEqual(before);
    });
});
