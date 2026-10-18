import { expect, test } from '@playwright/test';
import { siteOf } from '../lib/inspect';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

/**
 * Leave and swaps: the seller gives a shift to Seller Two, who takes it, and the
 * manager approves; the seller asks for leave and the manager approves it.
 */

test.afterAll(closeWindows);

const dayFromNow = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a shift given to a colleague, and leave asked for, both approved by the manager', async ({ browser }) => {
    test.setTimeout(300_000);
    const id = siteOf(fixture.store.id).id;
    const date = dayFromNow(3);
    const seller = fixture.seller;
    const two = fixture.people.seller2;

    // ── The manager puts the seller on a shift in three days ──
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await manager.goto(`/work/sites/${id}/rota?week=${date}`);
    const day = manager.locator(`section[data-date="${date}"]`);
    await day.getByRole('button', { name: '+ Add shift' }).click();
    await day.locator('select').first().selectOption({ label: seller.name });
    await day.locator('input[type="time"]').nth(0).fill('09:10');
    await day.locator('input[type="time"]').nth(1).fill('13:10');
    await day.getByRole('button', { name: 'Add shift', exact: true }).click();
    await expect(flash(manager, /Shift added/)).toBeVisible();
    await manager.getByRole('button', { name: /^Publish \d+ drafts?$/ }).click();
    await expect(flash(manager, /shift\(s\) sent/)).toBeVisible();

    // ── The seller offers it to Seller Two, who takes it ──
    const first = await signIn(browser, 'seller', seller.email);
    await first.goto('/work');
    const row = first.locator('[data-shift]').filter({ hasText: '09:10–13:10' });
    await row.getByRole('button', { name: 'Give to a colleague' }).click();
    await row.locator('select').selectOption({ label: two.name });
    await row.getByRole('button', { name: 'Offer' }).click();
    await expect(flash(first, /Offered to/)).toBeVisible();

    const second = await signIn(browser, 'seller', two.email);
    await second.goto('/work');
    await second.getByRole('button', { name: 'Take it' }).click();
    await expect(flash(second, /Taken\./)).toBeVisible();

    // ── The manager approves; the shift is Seller Two's ──
    await manager.goto('/work/team');
    await manager.locator('section').filter({ hasText: `${seller.name} → ${two.name}` }).getByRole('button', { name: 'Approve' }).click();
    await expect(flash(manager, /Swap approved/)).toBeVisible();

    await second.goto('/work');
    await expect(second.locator('[data-shift]').filter({ hasText: '09:10–13:10' }).getByText('Accepted')).toBeVisible();

    // ── The seller asks for two days of leave; the manager approves ──
    await first.goto('/work');
    await first.getByRole('button', { name: 'Ask for leave' }).click();
    await first.locator('input[type="date"]').nth(0).fill(dayFromNow(10));
    await first.locator('input[type="date"]').nth(1).fill(dayFromNow(11));
    await first.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(flash(first, /Leave asked for/)).toBeVisible();

    await manager.goto('/work/team');
    await manager.locator('section').filter({ hasText: `${seller.name} · Annual leave` }).getByRole('button', { name: 'Approve' }).click();
    await expect(flash(manager, /^Approved/)).toBeVisible();

    await first.goto('/work');
    await expect(first.getByText('Approved', { exact: true }).first()).toBeVisible();
});
