import { expect, test } from '@playwright/test';
import { app, fixture, flash, signIn, closeWindows } from '../lib/support';
import { unitsAt } from './dev';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A stocktake of the Remote Hub, on the dev database (make walkthrough). Demo Keeper counts the
 * Agenda cartons one short and submits; they may not approve their own count. Demo Keeper Two
 * approves it and the shortfall is booked. Lines nobody counted are left alone.
 */
test('stocktake: one keeper counts the Remote Hub one short, a second keeper approves it', async ({ browser }) => {
    const goods = fixture.remoteVariant;
    const counter = await signIn(browser, 'stockkeeper', fixture.keeper.email);

    const before = unitsAt(goods.id, fixture.remoteHub.id);

    await test.step('1. the keeper starts a count of the Remote Hub', async () => {
        await counter.goto(app('stockkeeper', '/stocktakes'));
        await counter.getByLabel('Place').selectOption(String(fixture.remoteHub.id));
        await counter.getByPlaceholder('e.g. Monthly count, aisle A').fill('Demo count, Remote Hub');
        await counter.getByRole('button', { name: 'Start counting' }).click();
        await expect(counter).toHaveURL(/\/stocktakes\/\d+$/);
    });

    await test.step(`2. they count ${goods.sku}: ${before - 1} on the shelf where the books say ${before}; submit`, async () => {
        await counter.getByPlaceholder('Find an item, SKU or barcode').fill(goods.sku);
        const line = counter.getByRole('listitem').filter({ hasText: goods.sku });
        await expect(line).toContainText(String(before));
        await line.getByRole('spinbutton').fill(String(before - 1));
        await line.getByRole('spinbutton').press('Enter');
        await expect(line).toContainText('-1');
        await counter.getByRole('button', { name: 'Submit count' }).click();
        await expect(counter.getByText('Someone other than you approves this count.')).toBeVisible();
        await expect(counter.getByRole('button', { name: /Approve and book/ })).toHaveCount(0);
        expect(unitsAt(goods.id, fixture.remoteHub.id), 'submitting books nothing yet').toBe(before);
    });

    await test.step('3. Demo Keeper Two approves it: the difference is booked', async () => {
        const approver = await signIn(browser, 'stockkeeper', fixture.people.keeper2.email);
        await approver.goto(counter.url());
        await approver.getByRole('button', { name: 'Approve and book 1 difference' }).click();
        await expect(flash(approver, 'Count approved and differences booked.')).toBeVisible();
        await expect(approver.getByText(new RegExp(`approved by ${fixture.people.keeper2.name}`))).toBeVisible();
        expect(unitsAt(goods.id, fixture.remoteHub.id)).toBe(before - 1);
    });

    console.log(`
  Walkthrough done: stocktake ${counter.url().split('/').pop()} of ${fixture.remoteHub.name}, ${goods.sku} counted one short, approved by ${fixture.people.keeper2.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Keeper       ${fixture.keeper.email}    ${counter.url()}
    Admin        ${fixture.people.admin.email}    ${app('admin', '/inventory/counts')}
`);
});
