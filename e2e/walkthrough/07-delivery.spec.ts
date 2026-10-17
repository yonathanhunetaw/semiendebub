import { expect, test } from '@playwright/test';
import {
    addCustomer,
    addItems,
    confirmPayment,
    courierDelivery,
    deliver,
    openCheckout,
    payIntoAccount,
    pickAndPack,
    placeOrder,
    run,
    startCart,
    type CustomerSpec,
} from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A delivery order, start to finish, on the dev database (make walkthrough). Nothing is
 * cleaned up: the customer, order, bank payment, delivery run and stock movements stay.
 *
 * 1. Demo Seller adds the customer, starts a cart, adds two items.
 * 2. Checkout: the whole total by bank transfer into DEMO-0001, a courier delivery to an
 *    address, assigned to Demo Courier; order placed.
 * 3. The seller records "Customer says paid".
 * 4. Demo Manager, who owns the account, confirms the money arrived (the second person).
 * 5. The seller picks and packs both lines and hands them to delivery.
 * 6. Demo Courier collects, starts the run and marks it delivered.
 */

const customer: CustomerSpec = {
    key: 'delivery',
    first: 'Demo',
    last: `Delivery ${run}`,
    phone: `0955${run.slice(-6)}`,
    tin: `8${run.slice(-9)}`,
    type: 'Individual',
};

test('delivery: new customer, cart, bank transfer, manager confirms, courier delivers', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    await test.step('1. the seller adds the customer', () => addCustomer(seller, customer));

    const cartId = await test.step('2. the seller starts a cart for them and adds two items', async () => {
        const id = await startCart(seller, customer);
        await addItems(seller, id);

        return id;
    });

    const reference = await test.step(`3. checkout: bank transfer into ${fixture.account.number}, delivered by ${fixture.courier.name}`, async () => {
        await openCheckout(seller, cartId);
        await payIntoAccount(seller);
        await courierDelivery(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('4. the seller records that the customer says they paid', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await expect(seller.getByText('will check the account and confirm it')).toBeVisible();
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await test.step('5. the store manager sees the money in the account and confirms it', () => confirmPayment(manager, reference));

    await test.step('6. the seller picks, packs and hands it to delivery', () => pickAndPack(seller, reference, 'delivery'));

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('7. the courier collects it, starts the run and marks it delivered', () => deliver(courier, reference));

    await test.step('8. the seller sees it delivered', async () => {
        await seller.goto(app('seller', '/orders?tab=delivered'));
        await expect(seller.getByText(reference).first()).toBeVisible();
    });

    console.log(`
  Walkthrough done: order ${reference}, cart #${cartId}, customer "${customer.first} ${customer.last}" (${customer.phone}), store ${fixture.store.name}.
  Where to look (sign in as the demo staff; the password is in e2e/.fixture/demo.json):
    Seller   ${fixture.seller.email}
      ${app('seller', '/orders?tab=delivered')}      the order, Delivered
      ${app('seller', `/orders/${reference}/custody`)}   seller → delivery → courier → customer
    Manager  ${fixture.manager.email}
      ${app('seller', '/payments/inbox')}                the bank payment, confirmed
    Courier  ${fixture.courier.email}
      ${app('delivery', '/delivery?status=delivered')}   the run, delivered
      ${app('delivery', '/history')}                     the courier's history
    Admin (your own account)
      ${app('admin', '/orders')}   ${app('admin', '/payments')}   ${app('admin', '/payment-accounts')}
`);
});
