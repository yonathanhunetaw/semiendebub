import { expect, test } from '@playwright/test';
import { addCustomer, addFirstVariant, confirmPayment, customer, startCart } from '../lib/flows';
import { app, fixture, signIn } from '../lib/support';

/**
 * Shared S1–S6: the seller shares a cart; the customer opens the link with no
 * login, changes it, adds an item, checks out and says they sent the
 * transfer; the store manager (the account's owner) confirms it.
 */
test('a customer finishes a shared cart on their own and the manager confirms the transfer', async ({ browser }) => {
    test.setTimeout(180_000);
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const buyer = customer('shared', 'Individual', 7);
    const [first, second] = fixture.items;

    await addCustomer(seller, buyer);
    const cartId = await startCart(seller, buyer);
    await addFirstVariant(seller, cartId, first.item_id);

    const link = await test.step('the seller shares the cart', async () => {
        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await seller.getByRole('button', { name: 'Share with customer' }).click();
        await expect(seller.getByText(/Link ready/)).toBeVisible();
        await expect(seller.getByText('Sent, not opened')).toBeVisible();
        return seller.getByLabel('Customer link').inputValue();
    });
    expect(link).toMatch(/^http:\/\/shared\.duka\.test:\d+\/c\/[A-Za-z0-9]{48}$/);

    // The customer: a plain browser, nobody signed in.
    const context = await browser.newContext();
    const shopper = await context.newPage();

    await test.step('the customer opens it, adds one more and another item', async () => {
        await shopper.goto(link);
        await expect(shopper.getByRole('heading', { name: new RegExp(`${buyer.first.split(' ')[0]}, here is your cart`) })).toBeVisible();
        await shopper.getByRole('button', { name: 'One more' }).first().click();
        await expect(shopper.getByRole('group', { name: /Quantity of/ }).first()).toContainText('2');

        await shopper.getByLabel('Search the store').fill(second.name.slice(0, 12));
        await shopper.getByRole('button', { name: `Add ${second.name}` }).first().click();
        await expect(shopper.getByText('Added to your cart.')).toBeVisible();
        await expect(shopper.locator('li').filter({ hasText: second.name }).first()).toBeVisible();
    });

    await test.step('the seller sees the customer changed it', async () => {
        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByText('Customer changed it')).toBeVisible();
    });

    const reference = await test.step('the customer checks out to an address, paying by transfer', async () => {
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

    await test.step('the customer says they sent it, with the reference', async () => {
        await shopper.getByLabel('Transfer reference').fill('FT-E2E-SHARED');
        await shopper.getByRole('button', { name: "I've sent it" }).click();
        await expect(shopper.getByText('The store is checking')).toBeVisible();
    });

    await test.step('the manager confirms it; the customer sees it received', async () => {
        const manager = await signIn(browser, 'seller', fixture.manager.email);
        await confirmPayment(manager, reference);
        await shopper.reload();
        await expect(shopper.getByText('Received', { exact: true })).toBeVisible();
        await expect(shopper.getByText('Payment received')).toBeVisible();
    });

    await context.close();
});

test('a wrong link opens nothing', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    const response = await page.goto(app('shared', `/c/${'x'.repeat(48)}`));
    expect(response?.status()).toBe(404);
    await expect(page.getByText('This link no longer works')).toBeVisible();
});
