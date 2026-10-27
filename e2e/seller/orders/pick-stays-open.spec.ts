import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPayment, courierDelivery, openCheckout, payInCash, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Ticking an order's first line starts picking, which moves it from Paid to Pick & pack. The order the seller is
 * working on must follow it: the card stays on screen, on the Pick & pack tab, with the next step in reach.
 * (It used to drop out of the Paid tab, leaving "No orders in this tab".)
 */
test('ticking the first line keeps the order in view, on its new tab', async ({ browser }) => {
    const item = fixture.items[0];
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, item.item_id);
    await openCheckout(seller, cartId);
    await payInCash(seller);
    await courierDelivery(seller);
    const reference = await placeOrder(seller, 'Place order & request confirmation');
    await confirmPayment(await signIn(browser, 'seller', fixture.manager.email), reference);

    // The pick-pack link lands on the orders list with this order open.
    await seller.goto(app('seller', `/orders/${reference}/pick-pack`));
    await expect(seller).toHaveURL(new RegExp(`/orders\\?open=${reference}`));

    const inHand = seller.getByRole('button', { name: /^back_hand\s*I have \d+ from/ });
    await expect(inHand.first()).toBeVisible();
    await inHand.first().click();

    // Still there after the stage moved: its pick panel with the pack step, under the Pick & pack tab.
    await expect(seller.getByLabel(/Packed and labelled/)).toBeVisible();
    await expect(seller.getByText('No orders in this tab')).toHaveCount(0);
    await expect(seller.getByText(reference).first()).toBeVisible();
});
