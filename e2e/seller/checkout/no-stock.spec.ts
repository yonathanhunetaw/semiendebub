import { expect, test } from '@playwright/test';
import { addFirstVariant, deliveryMethod, openCheckout, payInCash, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * An item nobody has (nothing on the shelf, floor or Remote Hub) can be added to a cart: the cart
 * only prices the line. Checkout does not refuse it either. It warns the seller that the buyer will
 * get it later, from a hub, and places the order as a delayed one.
 *
 * This pins today's behaviour. Whether the seller should be able to add such an item at all is
 * the owner's call; change this test if the rule changes.
 */
test('an item with no stock can be added; checkout warns it will arrive later from a hub and still places the order', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await test.step('seller starts a walk-in cart and adds the out-of-stock item', async () => {
        const id = await startCart(seller, null);
        await addFirstVariant(seller, id, fixture.noStockItem.item_id);

        return id;
    });

    await test.step('the cart holds the line', async () => {
        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByRole('link', { name: /Checkout \(\d+\)/ })).toBeVisible();
    });

    await test.step('checkout warns that the buyer will wait for a hub', async () => {
        await openCheckout(seller, cartId);
        await expect(seller.getByText('Some lines are not on hand at this store.')).toBeVisible();
        await expect(seller.getByText('Hub Consolidation')).toBeVisible();
    });

    await test.step('the seller can still place it, with cash and delivery added later', async () => {
        await deliveryMethod(seller, 'Add later').click();
        await payInCash(seller);
        await placeOrder(seller, 'Place order & request confirmation');
    });
});
