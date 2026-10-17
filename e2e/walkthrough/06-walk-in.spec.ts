import { expect, test } from '@playwright/test';
import { addCustomer, addItems, confirmPayment, deliveryMethod, openCheckout, payInCash, placeOrder, run, startCart, type CustomerSpec } from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A walk-in customer, start to finish, on the dev database (make walkthrough). Nothing is
 * cleaned up: the customer, cart, order, payment and stock movements stay where the apps
 * show them, and the last step prints where to look.
 *
 * 1. Demo Seller adds the customer and starts a cart for them, adds two items.
 * 2. Checkout: In store, cash taken by the seller, order placed.
 * 3. Demo Manager (the second person) confirms the cash in the payment inbox.
 * 4. Demo Keeper picks both lines from the shelf/floor and hands them to the customer.
 * 5. The order is Delivered, handed over in store.
 */

const customer: CustomerSpec = {
    key: 'demo',
    first: 'Demo',
    last: `Customer ${run}`,
    phone: `0966${run.slice(-6)}`,
    tin: `9${run.slice(-9)}`,
    type: 'Individual',
};

test('walk-in: new customer, cart, cash, manager confirms, handed over in store', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    await test.step('1. the seller adds the customer', () => addCustomer(seller, customer));

    const cartId = await test.step('2. the seller starts a cart for them and adds two items', async () => {
        const id = await startCart(seller, customer);
        await addItems(seller, id);

        return id;
    });

    const reference = await test.step('3. checkout: in store, the seller takes cash', async () => {
        await openCheckout(seller, cartId);
        // A named customer's checkout starts on delivery; only a walk-in cart starts on In store.
        await deliveryMethod(seller, 'In store').click();
        await expect(deliveryMethod(seller, 'In store')).toHaveAttribute('aria-checked', 'true');
        await payInCash(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await test.step('4. the store manager confirms the cash (the second person)', () => confirmPayment(manager, reference));

    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await test.step('5. the stock keeper picks both lines and hands them to the customer', async () => {
        await keeper.goto(app('stockkeeper', '/orders'));
        const card = keeper.getByRole('button', { name: new RegExp(reference) }).locator('xpath=..');
        await expect(card).toContainText('In store · the customer takes it here');

        for (const inHand of await card.getByRole('button', { name: / in hand$/ }).all()) {
            await inHand.click();
            await expect(inHand).toHaveAttribute('aria-pressed', 'true');
        }

        await card.getByLabel('Packed & labelled').check();
        await card.getByRole('button', { name: 'Hand to customer' }).click();
        await expect(keeper.getByRole('button', { name: new RegExp(reference) })).toHaveCount(0);
    });

    await test.step('6. the seller sees it delivered, handed over in store', async () => {
        await seller.goto(app('seller', `/orders/${reference}/custody`));
        await expect(seller.getByText('Handed to the customer in store').first()).toBeVisible();
    });

    console.log(`
  Walkthrough done: order ${reference}, cart #${cartId}, customer "${customer.first} ${customer.last}" (${customer.phone}), store ${fixture.store.name}.
  Where to look (sign in as the demo staff; the password is in e2e/.fixture/demo.json):
    Seller   ${fixture.seller.email}
      ${app('seller', '/customers')}                     the new customer
      ${app('seller', '/orders?tab=delivered')}      the order, Delivered
      ${app('seller', `/orders/${reference}/custody`)}   who held it, step by step
    Manager  ${fixture.manager.email}
      ${app('seller', '/payments/inbox')}                the cash, no longer waiting (confirmed)
    Keeper   ${fixture.keeper.email}
      ${app('stockkeeper', '/orders')}                   picked and handed over
    Admin (your own account)
      ${app('admin', '/orders')}                       the order among all orders
      ${app('admin', `/orders/${reference}/custody`)}    its custody, as the admin sees it
      ${app('admin', '/payments')}                     the confirmed cash payment
`);
});
