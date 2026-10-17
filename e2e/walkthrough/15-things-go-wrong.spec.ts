import { expect, test, type Browser, type Page } from '@playwright/test';
import {
    addFirstVariant,
    confirmPayment,
    courierDelivery,
    deliveryMethod,
    openCheckout,
    payInCash,
    payIntoAccount,
    pickAndPack,
    placeOrder,
    reportProblem,
    runCard,
    runStep,
    startCart,
} from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { devQuery } from './dev';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * When things do not go to plan, on the dev database (make walkthrough). Three short stories:
 *
 *   A. an order nobody pays is cancelled: its stock goes back on sale, its payment part is voided
 *   B. nobody home: the courier reports it, tries again later and delivers
 *   C. refused at the door: back to the depot, the order is cancelled and the stock is back
 */
const item = fixture.items[0];
const stage = (reference: string) => devQuery(`SELECT fulfillment_stage FROM sales WHERE reference_number='${reference}'`);

/** A paid, packed walk-in order waiting for Demo Courier; returns its reference. */
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

test('A. an unpaid order is cancelled: the stock goes back on sale, the payment part is voided', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const reference = await test.step('1. a walk-in order to be paid by bank transfer, never paid', async () => {
        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, item.item_id);
        await openCheckout(seller, cartId);
        await payIntoAccount(seller);
        await deliveryMethod(seller, 'Add later').click();

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('2. the seller cancels it from its To pay page', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        seller.once('dialog', (dialog) => dialog.accept());
        await seller.getByRole('button', { name: 'Cancel order' }).click();
        await expect.poll(() => stage(reference)).toBe('cancelled');
        expect(devQuery(`SELECT GROUP_CONCAT(p.status) FROM payments p JOIN sales s ON s.id=p.sale_id WHERE s.reference_number='${reference}'`)).toBe('void');
    });

    console.log(`  A. ${reference} cancelled: ${app('seller', '/orders?tab=cancelled')}`);
});

test('B. nobody home: the courier reports it, tries again and delivers', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const reference = await test.step('1. a paid, packed order goes out with Demo Courier', () => readyForCourier(browser, seller));
    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    await test.step('2. collect, start the run, report "Nobody home"', async () => {
        await courier.goto(app('delivery', '/delivery'));
        await runStep(courier, reference, 'Collect', 'Start run');
        await runStep(courier, reference, 'Start run', 'Mark delivered');
        await reportProblem(courier, reference, 'Nobody home');
        await expect(runCard(courier, reference)).toContainText('Failed');
    });

    await test.step('3. try again later: collect, start the run, deliver', async () => {
        await runStep(courier, reference, 'Collect', 'Start run');
        await runStep(courier, reference, 'Start run', 'Mark delivered');
        await runStep(courier, reference, 'Mark delivered', null);
        await expect.poll(() => stage(reference)).toBe('delivered');
    });

    console.log(`  B. ${reference}: failed once, then delivered: ${app('delivery', '/history')} (as ${fixture.courier.email})`);
});

test('C. refused at the door: returned to the depot, the order is cancelled and the stock is back', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const reference = await test.step('1. a paid, packed order goes out with Demo Courier', () => readyForCourier(browser, seller));
    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    await test.step('2. collected, then refused: report it and return it to the depot', async () => {
        await courier.goto(app('delivery', '/delivery'));
        await runStep(courier, reference, 'Collect', 'Start run');
        await reportProblem(courier, reference, 'Refused');
        await runStep(courier, reference, 'Return to depot', null);
        await expect.poll(() => stage(reference)).toBe('cancelled');
    });

    await test.step("3. it tops the courier's History as returned to the depot", async () => {
        await courier.goto(app('delivery', '/history'));
        await expect(courier.getByText(/^(Delivered|Failed|Returned to the depot) /).first()).toHaveText(/^Returned to the depot /);
    });

    // There is no refund step yet: the cash stays confirmed on the seller's balance.
    console.log(`  C. ${reference}: refused, back at the depot, cancelled; the stock is back on the floor.
     Note: there is no refund step yet, so the customer's cash still sits on ${fixture.seller.name}'s balance.`);
});
