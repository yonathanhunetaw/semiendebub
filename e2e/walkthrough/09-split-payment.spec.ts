import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPart, confirmPayment, deliveryMethod, openCheckout, pickAndPack, placeOrder, startCart } from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { devQuery } from './dev';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * One walk-in order paid two ways, on the dev database (make walkthrough): half cash, half by
 * bank transfer into DEMO-0001. Each part needs its own second person, and the order reaches
 * Pick & pack only when both are confirmed. Then it is handed over in store.
 */
const stage = (reference: string) => devQuery(`SELECT fulfillment_stage FROM sales WHERE reference_number='${reference}'`);

test('split payment: half cash, half bank; the order waits until both parts are confirmed', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const reference = await test.step('1. walk-in cart, one item; checkout with a bank part and a cash part, split equally', async () => {
        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, fixture.items[1].item_id);
        await openCheckout(seller, cartId);
        await seller.getByRole('button', { name: new RegExp(fixture.account.number) }).click();
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await seller.getByRole('button', { name: 'Split equally' }).click();
        await expect(seller.getByText('2 parts')).toBeVisible();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await deliveryMethod(seller, 'In store').click();

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('2. the manager confirms the cash part: still waiting on the bank part', async () => {
        await confirmPart(manager, reference);
        expect(stage(reference)).not.toBe('pick_pack');
    });

    await test.step('3. the seller says the customer paid the bank part; the manager confirms it: Pick & pack', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await confirmPayment(manager, reference);
    });

    await test.step('4. the seller picks it and hands it to the customer in store', () => pickAndPack(seller, reference, 'customer'));

    console.log(`
  Walkthrough done: order ${reference}, paid half cash, half into ${fixture.account.number}, both confirmed by ${fixture.manager.name}, handed over in store.
  Where to look (password in e2e/.fixture/demo.json):
    Seller   ${fixture.seller.email}    ${app('seller', `/orders/${reference}/pay`)}   the two parts
    Manager  ${fixture.manager.email}    ${app('seller', '/payments/inbox')}
    Admin    ${fixture.people.admin.email}    ${app('admin', '/payments')}
`);
});
