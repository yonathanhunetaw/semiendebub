import { expect, test } from '@playwright/test';
import { unitsAt } from '../lib/inspect';
import { app, fixture, flash, signIn } from '../lib/support';

/**
 * A stocktake of the Remote Hub: one keeper counts, finds two units short and submits;
 * they may not approve their own count. A second keeper on the same posts approves it,
 * and the ledger drops by exactly the difference. Lines nobody counted are left alone.
 */
const { remoteVariant, remoteHub } = fixture;

test('a count is submitted by one keeper, approved by another, and the shortfall is booked', async ({ browser }) => {
    const before = unitsAt(remoteVariant.id, remoteHub.id);
    test.skip(before < 2, 'the Remote Hub needs at least two units of the seeded variant');

    const counter = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await counter.goto(app('stockkeeper', '/stocktakes'));
    await counter.getByLabel('Place').selectOption(String(remoteHub.id));
    await counter.getByPlaceholder('e.g. Monthly count, aisle A').fill('E2E count');
    await counter.getByRole('button', { name: 'Start counting' }).click();
    await expect(counter).toHaveURL(/\/stocktakes\/\d+$/);

    // Count the seeded variant two short.
    await counter.getByPlaceholder('Find an item, SKU or barcode').fill(remoteVariant.sku);
    const line = counter.getByRole('listitem').filter({ hasText: remoteVariant.sku });
    await expect(line).toContainText(String(before));
    await line.getByRole('spinbutton').fill(String(before - 2));
    await line.getByRole('spinbutton').press('Enter');
    await expect(line).toContainText('-2');

    await counter.getByRole('button', { name: 'Submit count' }).click();
    await expect(counter.getByText('Someone other than you approves this count.')).toBeVisible();
    await expect(counter.getByRole('button', { name: /Approve and book/ })).toHaveCount(0);
    // Submitting books nothing yet.
    expect(unitsAt(remoteVariant.id, remoteHub.id)).toBe(before);

    const approver = await signIn(browser, 'stockkeeper', fixture.people.keeper2.email);
    await approver.goto(counter.url());
    await approver.getByRole('button', { name: 'Approve and book 1 difference' }).click();
    await expect(flash(approver, 'Count approved and differences booked.')).toBeVisible();
    await expect(approver.getByText(/approved by E2E Keeper Two/)).toBeVisible();

    expect(unitsAt(remoteVariant.id, remoteHub.id)).toBe(before - 2);
});

test("with no second keeper at hand, the store manager approves the count in Admin → Counts", async ({ browser }) => {
    const before = unitsAt(remoteVariant.id, remoteHub.id);

    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await keeper.goto(app('stockkeeper', '/stocktakes'));
    await keeper.getByLabel('Place').selectOption(String(remoteHub.id));
    await keeper.getByRole('button', { name: 'Start counting' }).click();
    await expect(keeper).toHaveURL(/\/stocktakes\/\d+$/);

    // One more than the ledger says: found behind a box.
    await keeper.getByPlaceholder('Find an item, SKU or barcode').fill(remoteVariant.sku);
    const line = keeper.getByRole('listitem').filter({ hasText: remoteVariant.sku });
    await line.getByRole('spinbutton').fill(String(before + 1));
    await line.getByRole('spinbutton').press('Enter');
    await expect(line).toContainText('+1');
    await keeper.getByRole('button', { name: 'Submit count' }).click();
    await expect(keeper.getByText('Someone other than you approves this count.')).toBeVisible();

    const manager = await signIn(browser, 'admin', fixture.manager.email);
    await manager.goto(app('admin', '/inventory/counts'));
    const card = manager.locator('[data-testid^="count-"]').filter({ hasText: remoteHub.name });
    const reference = ((await card.getAttribute('data-testid')) ?? '').replace('count-', '');
    await expect(card).toContainText(`Submitted by ${fixture.keeper.name}`);
    await expect(card).toContainText(`${before} → ${before + 1} (+1`);
    await card.getByRole('button', { name: 'Approve and book 1 difference' }).click();
    await manager.getByRole('button', { name: 'Yes, approve' }).click();
    await expect(flash(manager, `${reference} approved and its differences booked.`)).toBeVisible();
    await expect(card).toHaveCount(0);

    expect(unitsAt(remoteVariant.id, remoteHub.id)).toBe(before + 1);
});
