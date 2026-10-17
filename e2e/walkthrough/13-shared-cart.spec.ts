import { expect, test } from '@playwright/test';
import { addCustomer, addFirstVariant, confirmPayment, run, startCart, type CustomerSpec } from '../lib/flows';
import { app, fixture, labelWindow, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A cart the customer finishes on their own phone, on the dev database (make walkthrough):
 *
 *   Demo Seller    starts a cart for a new customer with one item and shares it
 *   the customer   opens the link (no account, no login), takes one more, adds another item,
 *                  checks out to an address paying into DEMO-0001, and says they sent it
 *   Demo Manager   confirms the money arrived; the customer's page shows it received
 */
const buyer: CustomerSpec = { key: 'shared', first: 'Demo', last: `Shared ${run}`, phone: `0933${run.slice(-6)}`, tin: `7${run.slice(-9)}`, type: 'Individual' };

test('shared cart: the customer finishes it from a link, the manager confirms the transfer', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const [first, second] = fixture.items;

    const cartId = await test.step('1. the seller adds the customer and starts a cart with one item', async () => {
        await addCustomer(seller, buyer);
        const id = await startCart(seller, buyer);
        await addFirstVariant(seller, id, first.item_id);

        return id;
    });

    const link = await test.step('2. the seller shares the cart', async () => {
        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await seller.getByRole('button', { name: 'Share with customer' }).click();
        await expect(seller.getByText(/Link ready/)).toBeVisible();

        return seller.getByLabel('Customer link').inputValue();
    });

    // The customer: a plain browser, nobody signed in.
    const context = await browser.newContext();
    await labelWindow(context, `${buyer.first} ${buyer.last} · the customer's phone, no login`, '#0f766e');
    const shopper = await context.newPage();

    await test.step('3. the customer opens the link, takes one more and adds another item', async () => {
        await shopper.goto(link);
        await expect(shopper.getByRole('heading', { name: /Demo, here is your cart/ })).toBeVisible();
        await shopper.getByRole('button', { name: 'One more' }).first().click();
        await expect(shopper.getByRole('group', { name: /Quantity of/ }).first()).toContainText('2');
        await shopper.getByLabel('Search the store').fill(second.name.slice(0, 12));
        await shopper.getByRole('button', { name: `Add ${second.name}` }).first().click();
        await expect(shopper.getByText('Added to your cart.')).toBeVisible();
    });

    await test.step('4. the seller sees the customer changed it', async () => {
        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByText('Customer changed it')).toBeVisible();
    });

    const reference = await test.step(`5. the customer checks out to an address, paying into ${fixture.account.number}`, async () => {
        await shopper.getByLabel('Address', { exact: true }).fill('Bole, near Edna Mall, house 12');
        await shopper.getByLabel('Phone').fill(buyer.phone);
        await shopper.locator('label').filter({ hasText: fixture.account.number }).click();
        const agree = shopper.getByText(/I agree to wait/);
        if (await agree.isVisible()) await agree.click();
        await shopper.getByRole('button', { name: /Place order/ }).click();
        const heading = shopper.getByRole('heading', { name: /^Order / });
        await expect(heading).toBeVisible();

        return (await heading.textContent())!.replace('Order ', '').trim();
    });

    await test.step('6. the customer says they sent it, with the bank reference', async () => {
        await shopper.getByLabel('Transfer reference').fill(`FT-DEMO-${run.slice(-6)}`);
        await shopper.getByRole('button', { name: "I've sent it" }).click();
        await expect(shopper.getByText('The store is checking')).toBeVisible();
    });

    await test.step('7. Demo Manager confirms it; the customer sees it received', async () => {
        const manager = await signIn(browser, 'seller', fixture.manager.email);
        await confirmPayment(manager, reference);
        await shopper.reload();
        await expect(shopper.getByText('Payment received')).toBeVisible();
    });

    console.log(`
  Walkthrough done: ${buyer.first} ${buyer.last} finished cart #${cartId} from the link: order ${reference}, paid into ${fixture.account.number}, confirmed.
  It now waits in Pick & pack for delivery to the address.
  Where to look (password in e2e/.fixture/demo.json):
    The customer's link (no login)   ${link}
    Seller   ${fixture.seller.email}    ${app('seller', '/orders?tab=paid')}
    Manager  ${fixture.manager.email}    ${app('seller', '/payments/inbox')}
`);
});
