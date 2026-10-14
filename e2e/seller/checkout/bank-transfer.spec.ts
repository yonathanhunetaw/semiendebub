import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPayment, courierDelivery, expectInManagerInbox, openCheckout, payIntoAccount, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/** A walk-in pays into the manager's bank account for a courier delivery; the manager confirms once the seller says it landed. */
test('walk-in, bank transfer, courier delivery: the seller says paid, the manager confirms', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, fixture.items[0].item_id);

    const reference = await test.step('checkout: the whole total into the bank account, courier delivery', async () => {
        await openCheckout(seller, cartId);
        await payIntoAccount(seller);
        await courierDelivery(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('the seller says the customer paid', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await expect(seller.getByText('will check the account and confirm it')).toBeVisible();
    });

    await expectInManagerInbox(manager, reference);
    await confirmPayment(manager, reference);

    await seller.goto(app('seller', '/orders?tab=paid'));
    await expect(seller.getByText(reference).first()).toBeVisible();
});
