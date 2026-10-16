import { expect, test } from '@playwright/test';
import { storeNamed } from '../../lib/inspect';
import { app, fixture, flash, signIn } from '../../lib/support';

/**
 * A global admin opening a store and taking someone on. The new person signs in to
 * their own app straight away: there is no e-mail verification step.
 */
const stamp = Date.now().toString().slice(-6);

test('global admin adds a store, renames it, and it opens with its own stock', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const name = `E2E Store ${stamp}`;

    await admin.goto(app('admin', '/stores'));
    await admin.getByRole('link', { name: 'Add Store' }).click();
    await admin.getByLabel('Store name').fill(name);
    await admin.getByLabel('Location').fill('Bole, Addis Ababa');
    await admin.getByLabel('Manager name').fill('Almaz');
    await admin.getByRole('button', { name: 'Add store' }).click();
    await expect(flash(admin, 'Store created successfully.')).toBeVisible();

    // The list pages by ten, so go to the new store by its id. It came with its own stock
    // locations: the store node, its shelf and its back room (no Remote Hub is invented).
    const store = storeNamed(name);
    expect(store.locations).toEqual(['backroom', 'shelf', 'store']);

    // Rename it from the edit page.
    await admin.goto(app('admin', `/stores/${store.id}/edit`));
    await expect(admin.getByLabel('Store name')).toHaveValue(name);
    await admin.getByLabel('Store name').fill(`${name} Renamed`);
    await admin.getByRole('button', { name: 'Save changes' }).click();
    await expect(flash(admin, 'Store updated.')).toBeVisible();
    expect(storeNamed(`${name} Renamed`).id).toBe(store.id);

    // A duplicate name is refused, next to the field.
    await admin.goto(app('admin', '/stores/create'));
    await admin.getByLabel('Store name').fill(`${name} Renamed`);
    await admin.getByRole('button', { name: 'Add store' }).click();
    await expect(admin.getByText('The name has already been taken.')).toBeVisible();

    // Its page opens.
    await admin.goto(app('admin', `/stores/${store.id}`));
    await expect(admin.getByText(`${name} Renamed`, { exact: true }).locator('visible=true').first()).toBeVisible();
    await expect(admin.getByText(/Server Error|SQLSTATE/)).toHaveCount(0);
});

test('global admin takes on a seller, who signs straight in to the seller app', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const email = `e2e.new-seller-${stamp}@duka.test`;

    await admin.goto(app('admin', '/users/create'));
    await admin.getByLabel('First Name').fill('Newly');
    await admin.getByLabel('Last Name').fill(`Hired ${stamp}`);
    await admin.getByLabel('Email').fill(email);
    await admin.getByLabel('Role', { exact: true }).click();
    await admin.getByRole('option', { name: 'seller', exact: true }).click();
    await admin.getByLabel('Store', { exact: true }).click();
    await admin.getByRole('option', { name: fixture.store.name, exact: true }).click();
    await admin.getByLabel('Password', { exact: true }).fill(fixture.password);
    await admin.getByLabel('Confirm Password').fill(fixture.password);
    await admin.getByRole('button', { name: /create|save/i }).click();
    await expect(flash(admin, 'User created successfully.')).toBeVisible();

    const seller = await signIn(browser, 'seller', email);
    await expect(seller).toHaveURL(/seller\.duka\.test:\d+\/dashboard/);
    // They sell for the store they were put in.
    await seller.goto(app('seller', '/carts/create'));
    await expect(seller.getByText(/Server Error|SQLSTATE/)).toHaveCount(0);
});
