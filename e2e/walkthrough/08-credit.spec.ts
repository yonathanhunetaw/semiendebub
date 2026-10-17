import { expect, test, type Page } from '@playwright/test';
import { addCustomer, addFirstVariant, confirmPart, deliveryMethod, openCheckout, run, startCart, type CustomerSpec } from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { customerIdByPhone } from './dev';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * Selling on credit, on the dev database (make walkthrough). Credit is the admin's to give, never
 * a seller's:
 *
 *   Demo Seller    adds a business customer
 *   Demo Admin     gives them 1,000 ETB of credit, 30 days to pay
 *   Demo Seller    sells them an item wholly on credit: it goes straight to Pick & pack
 *   Demo Seller    later takes the repayment in cash
 *   Demo Manager   confirms that cash (the second person): they owe nothing again
 */
const buyer: CustomerSpec = { key: 'credit', first: 'Demo', last: `Credit ${run}`, phone: `0944${run.slice(-6)}`, tin: null, type: 'Business' };

/** The Credit card's figures on the seller's customer page. */
async function credit(seller: Page, id: number): Promise<{ owes: string; limit: string }> {
    await seller.goto(app('seller', `/customers/${id}`));
    const card = seller.locator('div').filter({ has: seller.getByText('Owes', { exact: true }) }).filter({ has: seller.getByText('Limit', { exact: true }) }).last();
    const figure = async (label: string) => (await card.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]').innerText()).trim();

    return { owes: await figure('Owes'), limit: await figure('Limit') };
}

test('credit: the admin gives credit, the seller sells on it, the repayment is confirmed', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await test.step('1. the seller adds a business customer', () => addCustomer(seller, buyer));
    const id = customerIdByPhone(buyer.phone);

    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await test.step('2. the admin gives them a 1,000 ETB limit, 30 days to pay', async () => {
        await admin.goto(app('admin', '/customers'));
        const card = admin.getByRole('heading', { name: `${buyer.first} ${buyer.last}`, exact: true }).locator('xpath=ancestor::*[.//button][1]');
        await card.getByRole('button', { name: 'Edit' }).first().click();
        const dialog = admin.getByRole('dialog');
        await dialog.getByLabel('Credit limit (ETB)').fill('1000');
        await dialog.getByLabel('Days to pay').fill('30');
        await dialog.getByRole('button', { name: 'Update' }).click();
        await expect(dialog).toBeHidden();
        expect((await credit(seller, id)).limit).toMatch(/1,000\.00/);
    });

    const reference = await test.step('3. the seller sells them an item wholly on credit: straight to Pick & pack', async () => {
        const cartId = await startCart(seller, buyer);
        await addFirstVariant(seller, cartId, fixture.items[0].item_id);
        await openCheckout(seller, cartId);
        await seller.getByRole('button', { name: /Add to credit/ }).click();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await deliveryMethod(seller, 'Add later').click();
        await seller.getByRole('button', { name: /^Place order/ }).click();
        await expect(seller).not.toHaveURL(/\/orders\/confirmation/);

        return (await seller.getByText(/SALE-\d{8}-[A-Z0-9]+/).first().innerText()).match(/SALE-\d{8}-[A-Z0-9]+/)![0];
    });

    const owed = await test.step('4. the customer now owes the order total', async () => {
        const { owes } = await credit(seller, id);
        expect(owes).not.toMatch(/^ETB\s*0\.00$/);

        return Number(owes.replace(/[^\d.]/g, ''));
    });

    await test.step('5. they pay it back in cash; the manager confirms; they owe nothing', async () => {
        await seller.goto(app('seller', `/customers/${id}`));
        await seller.getByRole('button', { name: 'Take a repayment' }).click();
        await seller.locator('input[type="number"]').first().fill(String(owed));
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await seller.getByRole('button', { name: 'Record repayment' }).click();

        const manager = await signIn(browser, 'seller', fixture.manager.email);
        await confirmPart(manager, 'Credit repayment');
        expect((await credit(seller, id)).owes).toMatch(/0\.00/);
    });

    console.log(`
  Walkthrough done: ${buyer.first} ${buyer.last} (${buyer.phone}) got 1,000 ETB credit, bought on it (${reference}, ETB ${owed.toFixed(2)}) and repaid in cash.
  Where to look (password in e2e/.fixture/demo.json):
    Seller   ${fixture.seller.email}    ${app('seller', `/customers/${id}`)}   the credit card: limit, owes 0
    Admin    ${fixture.people.admin.email}    ${app('admin', '/customers')}   the limit on the customer
    Manager  ${fixture.manager.email}    ${app('seller', '/payments/inbox')}   the repayment, confirmed
    The order ${reference} waits in Pick & pack: ${app('seller', '/orders?tab=paid')}
`);
});
