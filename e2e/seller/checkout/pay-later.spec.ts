import { expect, test } from '@playwright/test';
import { addCustomer, addFirstVariant, confirmPayment, customer, openCheckout, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

const buyer = customer('later', 'Business', 4);

/** A business customer pays later: the order waits in To pay until the seller adds the cash on the To pay page. */
test('business customer, pay later: the order sits in To pay, then cash is added and the manager confirms', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    await addCustomer(seller, buyer);
    const cartId = await startCart(seller, buyer);
    await addFirstVariant(seller, cartId, fixture.items[0].item_id);

    const reference = await test.step('checkout: pay later, delivery added later', async () => {
        await openCheckout(seller, cartId);
        await seller.getByRole('button', { name: 'Pay later', exact: true }).click();
        await seller.getByRole('radiogroup', { name: 'Delivery method' }).getByRole('radio', { name: /Add later/ }).click();

        return placeOrder(seller, 'Place order (To pay)');
    });

    await test.step('it is listed under To pay', async () => {
        await seller.goto(app('seller', '/orders?tab=to_pay'));
        await expect(seller.getByText(reference).first()).toBeVisible();
    });

    await test.step('the seller adds the cash on the To pay page', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await seller.getByRole('button', { name: 'Save split' }).click();
        await expect(seller.getByText(`Payment split saved for ${reference}`)).toBeVisible();
    });

    await confirmPayment(manager, reference);
});
