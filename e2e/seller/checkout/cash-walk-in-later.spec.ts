import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPayment, deliveryFee, deliveryMethod, expectInManagerInbox, openCheckout, payInCash, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * A walk-in pays cash, and neither the delivery fee nor the delivery is decided yet.
 * The cash needs a second person, so the store manager is signed in first.
 */
test('walk-in, cash, delivery fee "Calculate later", delivery "Add later": the manager sees it and confirms', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await test.step('seller starts a walk-in cart with the first variant of one item', async () => {
        const id = await startCart(seller, null);
        await addFirstVariant(seller, id, fixture.items[0].item_id);

        return id;
    });

    const reference = await test.step('checkout: cash now, fee calculated later, delivery added later', async () => {
        await openCheckout(seller, cartId);
        await deliveryMethod(seller, 'Add later').click();
        await deliveryFee(seller, 'Calculate later').click();
        await payInCash(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('the manager sees the order waiting to be confirmed', () => expectInManagerInbox(manager, reference));
    await test.step('the manager confirms the cash', () => confirmPayment(manager, reference));

    await test.step('the seller finds it under Paid', async () => {
        await seller.goto(app('seller', '/orders?tab=paid'));
        await expect(seller.getByText(reference).first()).toBeVisible();
    });
});
