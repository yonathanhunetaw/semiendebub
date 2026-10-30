import { expect, test } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Settings holds appearance and your access only. The old Administration card listed screens already reachable
 * elsewhere, so it is gone: users, vendors, sessions, system and Import / Export are Settings tabs, and stores,
 * warehouses, fleet and items are in the sidebar's global zone.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

test('Settings has no Administration card, and every screen it listed is still one click away', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/settings'));

    await expect(admin.getByText('Administration', { exact: true })).toHaveCount(0);
    await expect(admin.getByText('Appearance', { exact: true })).toBeVisible();

    for (const tab of ['Users', 'Vendors', 'Sessions', 'System', 'Import / Export']) await expect(admin.getByRole('tab', { name: tab, exact: true })).toBeVisible();

    for (const entry of ['Items', 'All stores', 'Warehouses', 'Fleet']) await expect(admin.getByRole('link', { name: new RegExp(`^${entry}`) }).first()).toBeVisible();
});
