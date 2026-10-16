import { expect, test } from '@playwright/test';
import { addSupplier, raiseAndSubmit } from '../lib/procurement';
import { app, fixture, signIn } from '../lib/support';

/**
 * Procurement P1: a supplier, a purchase order with a line, and the two-person
 * approval. Whoever raises an order never approves it; from the admin limit
 * (500,000 ETB by default) only a global admin may.
 */
test('a second buyer approves an order below the limit; the first places it with the supplier', async ({ browser }) => {
    test.setTimeout(120_000);
    const buyer = await signIn(browser, 'procurement', fixture.people.procurement.email);
    const supplier = `E2E Supplier ${Date.now()}`;

    await addSupplier(buyer, supplier);
    const reference = await raiseAndSubmit(buyer, supplier, 10, 40); // 400 USD = 50,000 ETB
    const url = buyer.url();

    await test.step('the buyer may not approve their own order', async () => {
        await expect(buyer.getByText('A second person has to approve it.')).toBeVisible();
        await expect(buyer.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    });

    await test.step('the second buyer finds it on their home page and approves it', async () => {
        const second = await signIn(browser, 'procurement', fixture.people.procurement2.email);
        await second.goto(app('procurement', '/dashboard'));
        await second.getByRole('link', { name: new RegExp(reference) }).first().click();
        await second.getByRole('button', { name: 'Approve' }).click();
        await expect(second.getByText(`${reference} approved.`)).toBeVisible();
    });

    await test.step('the buyer marks it ordered', async () => {
        await buyer.goto(url);
        await buyer.getByRole('button', { name: 'Mark ordered' }).click();
        await buyer.getByRole('dialog').getByRole('button', { name: 'Mark ordered' }).click();
        await expect(buyer.getByText(`${reference} is ordered.`)).toBeVisible();
        await expect(buyer.getByText('Ordered', { exact: true }).first()).toBeVisible();
    });
});

test('from the limit only a global admin approves, in the admin app; sent back, it is a draft again', async ({ browser }) => {
    test.setTimeout(120_000);
    const buyer = await signIn(browser, 'procurement', fixture.people.procurement.email);
    const supplier = `E2E Big Supplier ${Date.now()}`;

    await addSupplier(buyer, supplier);
    const reference = await raiseAndSubmit(buyer, supplier, 100, 50); // 5,000 USD = 625,000 ETB
    const url = buyer.url();

    await test.step('the second buyer is refused: it needs a global admin', async () => {
        const second = await signIn(browser, 'procurement', fixture.people.procurement2.email);
        await second.goto(url);
        await expect(second.getByText(/need a global admin/)).toBeVisible();
        await expect(second.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    });

    await test.step('the global admin sends it back from the admin app, the buyer sees it as a draft', async () => {
        const admin = await signIn(browser, 'admin', fixture.people.admin.email);
        await admin.goto(app('admin', '/purchase-orders'));
        const card = admin.locator('section').filter({ hasText: reference }).last();
        await card.getByRole('button', { name: 'Send back' }).click();
        await admin.getByRole('dialog').getByLabel('Reason').fill('Ask for a 5% discount first');
        await admin.getByRole('dialog').getByRole('button', { name: 'Send back' }).click();
        await expect(admin.getByText(`${reference} sent back to draft.`)).toBeVisible();

        await buyer.goto(url);
        await expect(buyer.getByText('Ask for a 5% discount first')).toBeVisible();
        await expect(buyer.getByRole('link', { name: 'Edit' })).toBeVisible();
    });

    await test.step('submitted again, the global admin approves it', async () => {
        await buyer.getByRole('button', { name: 'Submit for approval' }).click();
        await expect(buyer.getByText('Awaiting approval').first()).toBeVisible();

        const admin = await signIn(browser, 'admin', fixture.people.admin.email);
        await admin.goto(app('admin', '/purchase-orders'));
        await admin.locator('section').filter({ hasText: reference }).last().getByRole('button', { name: 'Approve' }).click();
        await expect(admin.getByText(`${reference} approved.`)).toBeVisible();
    });
});
