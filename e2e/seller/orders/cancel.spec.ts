import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, deliveryMethod, openCheckout, payIntoAccount, placeOrder, startCart } from '../../lib/flows';
import { saleOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Cancelling an order from its To pay page: the stock it held goes back on sale and payment
 * parts whose money never arrived are voided.
 */
async function cancel(seller: Page, reference: string): Promise<void> {
    await seller.goto(app('seller', `/orders/${reference}/pay`));
    seller.once('dialog', (dialog) => dialog.accept());
    await seller.getByRole('button', { name: 'Cancel order' }).click();
    await expect.poll(() => saleOf(reference).stage).toBe('cancelled');
}

test('an unpaid order is cancelled: its hold is released and its unpaid part voided', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, fixture.items[0].item_id);
    await openCheckout(seller, cartId);
    await payIntoAccount(seller);
    await deliveryMethod(seller, 'Add later').click();
    const reference = await placeOrder(seller, 'Place order & request confirmation');

    await test.step('placing it holds the stock', () => {
        expect(saleOf(reference).holds).toEqual([expect.objectContaining({ variant: fixture.items[0].variant, quantity: 1, status: 'open' })]);
    });

    await test.step('cancel it', () => cancel(seller, reference));

    await test.step('the hold is released and the part voided', () => {
        const sale = saleOf(reference);
        expect(sale.holds.map((h) => h.status)).toEqual(['released']);
        expect(sale.payments.map((p) => p.status)).toEqual(['void']);
    });
});
