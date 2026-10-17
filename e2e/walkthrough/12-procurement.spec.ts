import { expect, test } from '@playwright/test';
import { run } from '../lib/flows';
import { addSupplier, raiseAndSubmit } from '../lib/procurement';
import { app, fixture, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * Buying from a supplier, on the dev database (make walkthrough):
 *
 *   Demo Buyer       adds a supplier, raises a purchase order for 10 Agenda at 100 USD, 30% deposit
 *                    on order and 70% on shipping, and submits it; they may not approve their own
 *   Demo Buyer Two   approves it: the payment schedule is fixed
 *   Demo Buyer       places it with the supplier and records the deposit at the rate the bank used
 *   Demo Finance     confirms the deposit left the bank: it counts as paid, 700 USD left
 */
const supplier = `Demo Supplier ${run.slice(-6)}`;

test('procurement: a purchase order approved by a second buyer, its deposit confirmed by finance', async ({ browser }) => {
    const buyer = await signIn(browser, 'procurement', fixture.people.procurement.email);

    const reference = await test.step(`1. the buyer adds "${supplier}" and raises 10 × ${fixture.remoteVariant.sku} at 100 USD, on installments`, async () => {
        await addSupplier(buyer, supplier);

        return raiseAndSubmit(buyer, supplier, 10, 100, 'installments');
    });
    const url = buyer.url();

    await test.step('2. the buyer may not approve their own order; the schedule is still a preview', async () => {
        await expect(buyer.getByText('A second person has to approve it.')).toBeVisible();
        await expect(buyer.getByRole('button', { name: 'Approve' })).toHaveCount(0);
        await expect(buyer.getByText('Schedule fixed on approval')).toBeVisible();
    });

    await test.step('3. Demo Buyer Two approves it', async () => {
        const second = await signIn(browser, 'procurement', fixture.people.procurement2.email);
        await second.goto(url);
        await second.getByRole('button', { name: 'Approve' }).click();
        await expect(second.getByText(`${reference} approved.`)).toBeVisible();
    });

    await test.step('4. the buyer places it and records the 300 USD deposit at 131.5 ETB', async () => {
        await buyer.goto(url);
        await buyer.getByRole('button', { name: 'Mark ordered' }).click();
        await buyer.getByRole('dialog').getByRole('button', { name: 'Mark ordered' }).click();
        await expect(buyer.getByText(`${reference} is ordered.`)).toBeVisible();

        await buyer.getByRole('button', { name: 'Record payment' }).first().click();
        const sheet = buyer.getByRole('dialog');
        await expect(sheet.getByLabel(/^Amount/)).toHaveValue('300');
        await sheet.getByLabel(/^Rate paid/).fill('131.5');
        await sheet.getByLabel('Bank reference').fill(`TT-DEMO-${run.slice(-6)}`);
        await sheet.getByRole('button', { name: 'Record payment' }).click();
        await expect(buyer.getByText(/USD 300.00 recorded on Deposit/)).toBeVisible();
    });

    await test.step('5. Demo Finance confirms the deposit left the bank', async () => {
        const finance = await signIn(browser, 'finance', fixture.people.finance.email);
        await finance.goto(app('finance', '/supplier-payments'));
        const row = finance.locator('li').filter({ hasText: reference });
        await expect(row).toContainText('ETB 39,450.00');
        await row.getByRole('button', { name: 'Confirm' }).click();
        await expect(finance.getByText('Payment confirmed: it now counts as paid.')).toBeVisible();
    });

    await test.step('6. the order shows the deposit paid and 700 USD left', async () => {
        await buyer.goto(url);
        await expect(buyer.getByText('USD 700.00 left')).toBeVisible();
    });

    console.log(`
  Walkthrough done: ${reference} with ${supplier}: approved by ${fixture.people.procurement2.name}, ordered, 300 USD deposit confirmed by ${fixture.people.finance.name}, 700 USD left.
  Where to look (password in e2e/.fixture/demo.json):
    Buyer     ${fixture.people.procurement.email}    ${url}
    Finance   ${fixture.people.finance.email}    ${app('finance', '/supplier-payments')}
    Admin     ${fixture.people.admin.email}    ${app('admin', '/purchase-orders')}   ${app('admin', '/supplier-payments')}
`);
});
