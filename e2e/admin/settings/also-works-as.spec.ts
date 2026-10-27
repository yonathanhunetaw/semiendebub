import { expect, test } from '@playwright/test';
import { app, fixture, flash, signIn } from '../../lib/support';

/**
 * "Also works as": a user holds a main role plus any roles ticked beside it. The ticks show on the Users list and
 * the user's page, edit keeps them, and a seller ticked as a stock keeper sees the Stock keeping card.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const stamp = Date.now().toString().slice(-6);

test('ticking Stock keeper on a seller shows on the list, survives an edit, and opens stock keeping for them', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const email = `e2e.tick-${stamp}@duka.test`;

    await admin.goto(app('admin', '/users/create'));
    await admin.getByLabel('First Name').fill('Tick');
    await admin.getByLabel('Last Name').fill(`Tester ${stamp}`);
    await admin.getByLabel('Email').fill(email);
    await admin.getByLabel('Main role', { exact: true }).click();
    await admin.getByRole('option', { name: 'seller', exact: true }).click();
    await admin.getByLabel('Store', { exact: true }).click();
    await admin.getByRole('option', { name: fixture.store.name, exact: true }).click();

    // The main role is not offered again as a tick; admin and dev never are.
    await expect(admin.getByRole('checkbox', { name: 'seller', exact: true })).toHaveCount(0);
    await expect(admin.getByRole('checkbox', { name: 'admin', exact: true })).toHaveCount(0);
    await expect(admin.getByRole('checkbox', { name: 'dev', exact: true })).toHaveCount(0);
    await admin.getByRole('checkbox', { name: 'stock keeper', exact: true }).check();

    await admin.getByLabel('Password', { exact: true }).fill(fixture.password);
    await admin.getByLabel('Confirm Password').fill(fixture.password);
    await admin.getByRole('button', { name: /create|save/i }).click();
    await expect(flash(admin, 'User created successfully.')).toBeVisible();

    // The list shows the extra role as a chip beside the main one.
    const row = admin.getByRole('row').filter({ hasText: `Tester ${stamp}` });
    await expect(row.getByText('Seller', { exact: true })).toBeVisible();
    await expect(row.getByText('stock keeper', { exact: true })).toBeVisible();

    // Edit keeps the tick.
    await admin.getByRole('row').filter({ hasText: `Tester ${stamp}` }).locator('a[href*="/edit"]').click();
    await expect(admin.getByRole('checkbox', { name: 'stock keeper', exact: true })).toBeChecked();

    // They sign in to the seller app and find Stock keeping on the More page.
    const seller = await signIn(browser, 'seller', email);
    await seller.goto(app('seller', '/menu'));
    await expect(seller.getByText('Stock keeping', { exact: true }).first()).toBeVisible();

    // Untick it: the card goes.
    await admin.getByRole('checkbox', { name: 'stock keeper', exact: true }).uncheck();
    await admin.getByRole('button', { name: /update|save/i }).click();
    await expect(flash(admin, 'User updated successfully.')).toBeVisible();
    await seller.goto(app('seller', '/menu'));
    await expect(seller.getByText('Stock keeping', { exact: true })).toHaveCount(0);
});

test('a global admin is a checkbox: ticking it clears the store, unticking asks for one', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    await admin.goto(app('admin', '/users/create'));
    await admin.getByLabel('Main role', { exact: true }).click();
    await admin.getByRole('option', { name: 'admin', exact: true }).click();

    const global = admin.getByRole('checkbox', { name: /Global admin/ });
    await global.check();
    await expect(admin.getByLabel('Admin of store')).toHaveCount(0);

    await global.uncheck();
    await expect(admin.getByLabel('Admin of store')).toBeVisible();
});
