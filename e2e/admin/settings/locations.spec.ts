import { expect, test } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Locations (who runs each place) live in Settings > Store setup. A global admin assigns managers and stock
 * keepers; a store admin only sees who they are.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

test('Locations is a Settings link, not a Store tab', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/settings'));
    await expect(admin.getByRole('link', { name: /Locations/ }).first()).toBeVisible();

    await admin.goto(app('admin', `/stores/${fixture.store.id}/hub`));
    await expect(admin.getByText('Locations', { exact: true })).toHaveCount(0);
});

test('a global admin can assign managers and stock keepers', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/inventory/locations'));

    await expect(admin.getByText('Managers').first()).toBeVisible();
    await expect(admin.getByRole('button', { name: /^(Assign|Change)$/ }).first()).toBeVisible();
    await expect(admin.getByText(/a global admin changes them/)).toHaveCount(0);
});

test('a store admin sees who they are but has no way to change them', async ({ browser }) => {
    const storeAdmin = await signIn(browser, 'admin', fixture.people.storeAdmin.email);
    await storeAdmin.goto(app('admin', '/inventory/locations'));

    await expect(storeAdmin.getByText('Managers').first()).toBeVisible();
    await expect(storeAdmin.getByText('Stock keepers').first()).toBeVisible();
    await expect(storeAdmin.getByText(/a global admin changes them/)).toBeVisible();
    await expect(storeAdmin.getByRole('button', { name: /^(Assign|Change)$/ })).toHaveCount(0);
});
