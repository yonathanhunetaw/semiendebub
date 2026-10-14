import { expect, test } from '@playwright/test';
import {
    addCustomer,
    addItems,
    confirmPayment,
    customer,
    deliveryMethod,
    openCheckout,
    payInCash,
    pickAndPack,
    placeOrder,
    startCart,
} from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * In-store sales: the customer takes the goods at the counter, so Pick &
 * pack hands them over and the order is Delivered with no courier. The
 * two-person rule still holds: the seller's cash waits for the store
 * manager before anything leaves the shelf.
 */

test('a walk-in pays cash, the manager confirms it, a stock keeper hands it over in store', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await test.step('seller starts a walk-in cart and adds items', async () => {
        const id = await startCart(seller, null);
        await addItems(seller, id);

        return id;
    });

    const reference = await test.step('checkout starts on In store; the seller takes cash', async () => {
        await openCheckout(seller, cartId);
        await expect(deliveryMethod(seller, 'In store')).toHaveAttribute('aria-checked', 'true');
        await payInCash(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('nothing can be picked before the manager confirms the cash', async () => {
        // Pick & pack redirects to the orders list; an unpaid order stays under To pay.
        await seller.goto(app('seller', `/orders/${reference}/pick-pack`));
        const card = seller.getByRole('link', { name: new RegExp(reference) }).locator('xpath=ancestor::*[.//a[contains(@href, "/pay")]][1]');
        await expect(card).toContainText('To pay');
        await expect(card.getByRole('link', { name: 'Pay now' })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Start' })).toHaveCount(0);
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await test.step('store manager confirms the cash', () => confirmPayment(manager, reference));

    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);

    await test.step('stock keeper picks it and hands it to the customer', async () => {
        await keeper.goto(app('stockkeeper', '/orders'));

        const header = keeper.getByRole('button', { name: new RegExp(reference) });
        const card = header.locator('xpath=..');
        await expect(card).toContainText('In store · the customer takes it here');

        // Each line's suggested shelf or floor is already chosen; tick it in hand.
        for (const inHand of await card.getByRole('button', { name: / in hand$/ }).all()) {
            await inHand.click();
            await expect(inHand).toHaveAttribute('aria-pressed', 'true');
        }

        await card.getByLabel('Packed & labelled').check();
        await card.getByRole('button', { name: 'Hand to customer' }).click();
        await expect(keeper.getByRole('button', { name: new RegExp(reference) })).toHaveCount(0);
    });

    await test.step('the seller sees it delivered, handed over in store', async () => {
        await seller.goto(app('seller', '/orders?tab=delivered'));
        await expect(seller.getByText(reference).first()).toBeVisible();

        await seller.goto(app('seller', `/orders/${reference}/custody`));
        await expect(seller.getByText('Handed to the customer in store').first()).toBeVisible();
    });
});

test('a named customer takes it in store, handed over by the seller', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const buyer = customer('counter', 'Individual', 3);

    await addCustomer(seller, buyer);
    const cartId = await startCart(seller, buyer);
    await addItems(seller, cartId);

    await openCheckout(seller, cartId);
    // A named customer starts on a courier delivery; the seller picks In store.
    await deliveryMethod(seller, 'In store').click();
    await expect(seller.getByText('The customer takes it here.')).toBeVisible();
    await payInCash(seller);
    const reference = await placeOrder(seller, 'Place order & request confirmation');

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await confirmPayment(manager, reference);

    await pickAndPack(seller, reference, 'customer');

    // Other paid orders may be waiting, so Pick & pack can move on to them;
    // this one is in Delivered either way.
    await seller.goto(app('seller', '/orders?tab=delivered'));
    await expect(seller.getByText(reference).first()).toBeVisible();
});
