import { expect, test } from '@playwright/test';
import { siteAt, sweepSites } from '../lib/inspect';
import { app, closeWindows, fixture, flash, signIn } from '../lib/support';

/**
 * The days that go wrong, at the store's Remote Hub (open 00:00–23:59 and fresh for today, e2e:prepare):
 *   nobody opened in time, so the sweep marks it late; the keeper, without the key, cannot open;
 *   the manager opens without it and must say how; the keeper clocks in; closing waits until the
 *   manager clocks them out too; today is a holiday, so the keeper's hours are overtime: the manager
 *   fixes the clock-in an hour earlier and approves it.
 */

test.afterAll(closeWindows);

const today = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A datetime-local value an hour earlier, kept on the same day. */
const hourEarlier = (value: string): string => {
    const d = new Date(new Date(value).getTime() - 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const earlier = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return earlier.slice(0, 10) === value.slice(0, 10) ? earlier : `${value.slice(0, 10)}T00:01`;
};

test('a late opening without the key, a close that waits, and overtime approved', async ({ browser }) => {
    test.setTimeout(300_000);
    const hub = fixture.remoteHub;
    const keeper = fixture.keeper;
    const holiday = `E2E holiday ${Date.now().toString().slice(-6)}`;

    await test.step('nobody opened in time: the sweep marks it late', async () => {
        expect(siteAt(hub.id).status).toBe('planned');
        sweepSites();
        expect(siteAt(hub.id).status).toBe('missed');
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);

    await test.step('the manager sees the late opening in My work', async () => {
        await manager.goto('/work');
        await expect(manager.locator('section').filter({ hasText: hub.name }).getByText('Late opening')).toBeVisible();
    });

    const stock = await signIn(browser, 'stockkeeper', keeper.email);

    await test.step('the keeper, without the key, cannot open', async () => {
        await stock.goto(siteAt(hub.id).printed);
        await expect(stock.getByText(/You do not hold the key\. Nobody holds it: ask/)).toBeVisible();
        await expect(stock.getByRole('button', { name: /^Open / })).toHaveCount(0);
    });

    await test.step('the manager opens without the key, saying how', async () => {
        await manager.goto(siteAt(hub.id).printed);
        const open = manager.getByRole('button', { name: `Open ${hub.name}` });
        await expect(open).toBeDisabled();
        await manager.getByPlaceholder('You do not hold the key: how did you open? (required)').fill('E2E: spare key from the owner');
        await open.click();
        await expect(flash(manager, /is open\./)).toBeVisible();
        await expect(manager.getByText('without the key', { exact: false }).first()).toBeVisible();

        const site = siteAt(hub.id);
        expect(site.status).toBe('open');
        expect(site.key_holder).toBeNull();
        expect(site.clocked_in).toContain(fixture.manager.id);
    });

    await test.step('the keeper clocks in with the counter’s moving code', async () => {
        await stock.goto(siteAt(hub.id).live);
        await stock.getByRole('button', { name: 'Clock in' }).click();
        await expect(flash(stock, /Clocked in at/)).toBeVisible();
        expect(siteAt(hub.id).clocked_in).toContain(keeper.id);
    });

    await test.step('closing waits until the manager clocks the keeper out too', async () => {
        await manager.goto(siteAt(hub.id).live);
        const close = manager.getByRole('button', { name: `Close ${hub.name}` });
        await expect(manager.getByText(/^Still clocked in: .*Clock them out as I close\.$/)).toBeVisible();
        await expect(close).toBeDisabled();
        await manager.getByLabel(/Clock them out as I close/).check();
        await close.click();
        await expect(flash(manager, /is closed\./)).toBeVisible();

        const site = siteAt(hub.id);
        expect(site.status).toBe('closed');
        expect(site.clocked_in).toEqual([]);
    });

    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    await test.step('the admin makes today a public holiday', async () => {
        await admin.goto(app('admin', '/work/overtime'));
        await admin.locator('input[type="date"]').fill(today());
        await admin.getByPlaceholder('Name (e.g. Meskel)').fill(holiday);
        await admin.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(flash(admin, 'Holiday saved.')).toBeVisible();
    });

    await test.step('the manager fixes the keeper’s clock-in and approves the overtime', async () => {
        await manager.goto(`/work/sites/${hub.id}/attendance`);
        const entry = manager.getByRole('listitem').filter({ hasText: `${keeper.name} ·` }).filter({ hasText: 'worked' }).first();
        await entry.getByRole('button', { name: 'Fix times' }).click();
        const clockIn = entry.locator('input[type="datetime-local"]').first();
        await clockIn.fill(hourEarlier(await clockIn.inputValue()));
        await entry.getByPlaceholder('Why (required)').fill('E2E: came in early, forgot to clock in');
        await entry.getByRole('button', { name: 'Save' }).click();
        await expect(flash(manager, 'Times fixed.')).toBeVisible();

        const row = manager.getByRole('listitem').filter({ hasText: `${keeper.name} ·` }).filter({ hasText: 'overtime' });
        await expect(row.getByText('To approve')).toBeVisible();
        await expect(row.getByText(/holiday/).first()).toBeVisible();
        await row.getByRole('button', { name: 'Approve' }).click();
        await expect(flash(manager, 'Overtime approved.')).toBeVisible();
        await expect(row.getByText('Approved', { exact: true })).toBeVisible();
    });

    await test.step('the holiday comes off again', async () => {
        await admin.reload();
        await admin.getByRole('listitem').filter({ hasText: holiday }).getByRole('button', { name: 'Remove' }).click();
        await expect(admin.getByRole('listitem').filter({ hasText: holiday })).toHaveCount(0);
    });
});
