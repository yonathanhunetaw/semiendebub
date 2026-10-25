import { expect, test } from '@playwright/test';
import { pngFile } from '../lib/files';
import { run } from '../lib/flows';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

test.afterEach(closeWindows);

/**
 * An expense with its receipt photo: Finance records it, and the second person (a global admin, on the admin
 * app's Expenses) opens that very receipt and confirms it. Receipts go to the local documents disk.
 */
test('an expense recorded with a receipt photo is opened and confirmed by a second person', async ({ browser }) => {
    const what = `E2E printer paper ${run.slice(-6)}`;
    const finance = await signIn(browser, 'finance', fixture.people.finance.email);

    await test.step('Finance records it with the photo', async () => {
        await finance.goto('/expenses');
        await finance.getByPlaceholder('Amount (ETB)').fill('275');
        await finance.getByPlaceholder('What for').fill(what);
        await finance.getByLabel('Receipt photo (optional)').setInputFiles(pngFile('paper-receipt.png'));
        await finance.getByRole('button', { name: 'Record', exact: true }).click();
        await expect(flash(finance, /Expense recorded/)).toBeVisible();

        // Its own expense waits: the recorder cannot confirm it.
        const row = finance.locator('li').filter({ hasText: what });
        await expect(row.getByRole('link', { name: 'Receipt' })).toBeVisible();
        await expect(row.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
    });

    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto('/expenses');
    const row = admin.locator('li').filter({ hasText: what });

    await test.step('the second person opens the receipt: the same picture comes back', async () => {
        const href = await row.getByRole('link', { name: 'Receipt' }).getAttribute('href');
        const receipt = await admin.request.get(href!);
        expect(receipt.status()).toBe(200);
        expect(receipt.headers()['content-type']).toContain('image/png');
        expect(Buffer.compare(await receipt.body(), pngFile().buffer)).toBe(0);
    });

    await test.step('and confirms it', async () => {
        await row.getByRole('button', { name: 'Confirm' }).click();
        await expect(flash(admin, /Expense confirmed/)).toBeVisible();
        await expect(admin.locator('li').filter({ hasText: what }).filter({ hasText: /confirmed by/ })).toBeVisible();
    });
});
