import { expect, test } from '@playwright/test';
import { addSupplier, raiseAndSubmit } from '../lib/procurement';
import { app, fixture, signIn } from '../lib/support';

/**
 * Procurement P2: an order on installments (30% deposit on order, 70% on
 * shipping). Once approved, procurement records the deposit at the rate the
 * bank used; it counts as paid only when finance confirms it.
 */
test('the deposit is recorded at the rate paid and counts once finance confirms it', async ({ browser }) => {
    test.setTimeout(150_000);
    const buyer = await signIn(browser, 'procurement', fixture.people.procurement.email);
    const supplier = `E2E Pay Supplier ${Date.now()}`;

    await addSupplier(buyer, supplier);
    const reference = await raiseAndSubmit(buyer, supplier, 10, 100, 'installments'); // 1,000 USD
    const url = buyer.url();

    await test.step('before approval the schedule is a preview', async () => {
        await expect(buyer.getByText('Schedule fixed on approval')).toBeVisible();
        await expect(buyer.getByText('USD 300.00')).toBeVisible();
        await expect(buyer.getByText('USD 700.00')).toBeVisible();
    });

    await test.step('a second buyer approves; the schedule is fixed', async () => {
        const second = await signIn(browser, 'procurement', fixture.people.procurement2.email);
        await second.goto(url);
        await second.getByRole('button', { name: 'Approve' }).click();
        await expect(second.getByText(`${reference} approved.`)).toBeVisible();
    });

    await test.step('the buyer places it and records the deposit at 131.5 ETB', async () => {
        await buyer.goto(url);
        await buyer.getByRole('button', { name: 'Mark ordered' }).click();
        await buyer.getByRole('dialog').getByRole('button', { name: 'Mark ordered' }).click();
        await expect(buyer.getByText(`${reference} is ordered.`)).toBeVisible();

        await buyer.getByRole('button', { name: 'Record payment' }).first().click();
        const sheet = buyer.getByRole('dialog');
        await expect(sheet.getByLabel(/^Amount/)).toHaveValue('300');
        await sheet.getByLabel(/^Rate paid/).fill('131.5');
        await sheet.getByLabel('Bank reference').fill('TT-E2E-1');
        await expect(sheet.getByText('= ETB 39,450.00 left the bank')).toBeVisible();
        await sheet.getByRole('button', { name: 'Record payment' }).click();
        await expect(buyer.getByText(/USD 300.00 recorded on Deposit/)).toBeVisible();
        await expect(buyer.getByText('To confirm').first()).toBeVisible();
    });

    await test.step('finance confirms it in the finance app', async () => {
        const finance = await signIn(browser, 'finance', fixture.people.finance.email);
        await finance.goto(app('finance', '/supplier-payments'));
        const row = finance.locator('li').filter({ hasText: reference });
        await expect(row).toContainText('ETB 39,450.00');
        await row.getByRole('button', { name: 'Confirm' }).click();
        await expect(finance.getByText('Payment confirmed: it now counts as paid.')).toBeVisible();
    });

    await test.step('the order shows the deposit paid and 700 left', async () => {
        await buyer.goto(url);
        await expect(buyer.getByText('USD 700.00 left')).toBeVisible();
        await expect(buyer.getByText('Paid', { exact: true }).first()).toBeVisible();
        await expect(buyer.getByText('Confirmed').first()).toBeVisible();
    });
});
