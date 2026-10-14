import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, confirmPart, deliveryMethod, openCheckout, startCart, type CustomerSpec } from '../../lib/flows';
import { saleOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Credit is the admin's to give, never a seller's. An order paid entirely on credit goes straight
 * to Pick & pack (the admin vouched for it); the customer then pays it back from their page, and
 * that repayment needs its second person like any other money.
 */
const buyer = fixture.customers.business;
const spec: CustomerSpec = { key: 'business', first: 'E2E', last: buyer.name.replace(/^E2E /, ''), phone: buyer.phone, tin: null, type: 'Business' };

/** The Credit card's figures on the seller's customer page. */
async function credit(seller: Page): Promise<{ owes: string; limit: string }> {
    await seller.goto(app('seller', `/customers/${buyer.id}`));
    const card = seller.locator('div').filter({ has: seller.getByText('Owes', { exact: true }) }).filter({ has: seller.getByText('Limit', { exact: true }) }).last();
    const figure = async (label: string) => (await card.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]').innerText()).trim();

    return { owes: await figure('Owes'), limit: await figure('Limit') };
}

test('the admin gives credit, the seller sells on it, and the repayment is confirmed by a second person', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    await test.step('the admin sets a 1,000 ETB limit, 30 days to pay', async () => {
        await admin.goto(app('admin', '/customers'));
        // One card per customer, its name a heading; the card is the nearest ancestor with buttons.
        const card = admin.getByRole('heading', { name: buyer.name, exact: true }).locator('xpath=ancestor::*[.//button][1]');
        await card.getByRole('button', { name: 'Edit' }).first().click();
        const dialog = admin.getByRole('dialog');
        await dialog.getByLabel('Credit limit (ETB)').fill('1000');
        await dialog.getByLabel('Days to pay').fill('30');
        await dialog.getByRole('button', { name: 'Update' }).click();
        await expect(dialog).toBeHidden();
    });

    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await test.step('the seller sees the limit on the customer', async () => {
        expect((await credit(seller)).limit).toMatch(/1,000\.00/);
    });

    const reference = await test.step('an order paid wholly on credit goes straight to Pick & pack', async () => {
        const cartId = await startCart(seller, spec);
        await addFirstVariant(seller, cartId, fixture.items[0].item_id);
        await openCheckout(seller, cartId);
        await seller.getByRole('button', { name: /Add to credit/ }).click();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await deliveryMethod(seller, 'Add later').click();
        await seller.getByRole('button', { name: /^Place order/ }).click();
        await expect(seller).not.toHaveURL(/\/orders\/confirmation/);
        const ref = (await seller.getByText(/SALE-\d{8}-[A-Z0-9]+/).first().innerText()).match(/SALE-\d{8}-[A-Z0-9]+/)![0];

        expect(saleOf(ref)).toMatchObject({ stage: 'pick_pack', payments: [{ method: 'credit', status: 'confirmed' }] });

        return ref;
    });

    const total = saleOf(reference).total;
    await test.step('the customer now owes the order total', async () => {
        expect((await credit(seller)).owes).toContain(total.toFixed(2));
    });

    await test.step('the customer pays it back in cash; the manager confirms; they owe nothing', async () => {
        await seller.goto(app('seller', `/customers/${buyer.id}`));
        await seller.getByRole('button', { name: 'Take a repayment' }).click();
        await seller.locator('input[type="number"]').first().fill(String(total));
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await seller.getByRole('button', { name: 'Record repayment' }).click();

        const manager = await signIn(browser, 'seller', fixture.manager.email);
        await confirmPart(manager, 'Credit repayment');
        expect((await credit(seller)).owes).toMatch(/0\.00/);
    });
});
