import { expect, test, type Page } from '@playwright/test';
import { run } from '../lib/flows';
import { app, fixture, flash, signIn, closeWindows } from '../lib/support';
import { devQuery } from './dev';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * Running the stores, on the dev database (make walkthrough): what you will do on prod before
 * users start. Demo Admin
 *
 *   1. opens a new store (it comes with its own Store, Store Shelf and Store Floor locations)
 *   2. takes on a seller for Main Store, who signs straight in to the seller app
 *   3. gives that seller their own business price on an item in Main Store
 */
const stamp = run.slice(-6);
const storeName = `Demo Store ${stamp}`;
const hire = { first: 'Demo', last: `Hire ${stamp}`, email: `demo.hire-${stamp}@duka.test` };
const price = 1.8;

/** An MUI Select by its floating label. */
const select = (panel: ReturnType<Page['locator']>, label: string) =>
    panel.locator('.MuiFormControl-root').filter({ has: panel.page().locator('label', { hasText: new RegExp(`^${label}$`) }) }).getByRole('combobox');

test('admin setup: a new store, a new seller who signs in, and their own price', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    const storeId = await test.step(`1. the admin opens "${storeName}"`, async () => {
        await admin.goto(app('admin', '/stores'));
        await admin.getByRole('link', { name: 'Add Store' }).click();
        await admin.getByLabel('Store name').fill(storeName);
        await admin.getByLabel('Location').fill('Bole, Addis Ababa');
        await admin.getByLabel('Manager name').fill('Demo Manager');
        await admin.getByRole('button', { name: 'Add store' }).click();
        await expect(flash(admin, 'Store created successfully.')).toBeVisible();
        const id = Number(devQuery(`SELECT id FROM stores WHERE name='${storeName}'`));
        expect(devQuery(`SELECT GROUP_CONCAT(kind ORDER BY kind) FROM stock_locations WHERE store_id=${id}`)).toBe('backroom,shelf,store');

        return id;
    });

    await test.step(`2. the admin takes on ${hire.first} ${hire.last} as a seller in ${fixture.store.name}`, async () => {
        await admin.goto(app('admin', '/users/create'));
        await admin.getByLabel('First Name').fill(hire.first);
        await admin.getByLabel('Last Name').fill(hire.last);
        await admin.getByLabel('Email').fill(hire.email);
        await admin.getByLabel('Role', { exact: true }).click();
        await admin.getByRole('option', { name: 'seller', exact: true }).click();
        await admin.getByLabel('Store', { exact: true }).click();
        await admin.getByRole('option', { name: fixture.store.name, exact: true }).click();
        await admin.getByLabel('Password', { exact: true }).fill(fixture.password);
        await admin.getByLabel('Confirm Password').fill(fixture.password);
        await admin.getByRole('button', { name: /create|save/i }).click();
        await expect(flash(admin, 'User created successfully.')).toBeVisible();
    });

    const item = fixture.items[1];
    await test.step(`3. the admin gives them a business price of ${price.toFixed(2)} on ${item.name}`, async () => {
        await admin.goto(app('admin', `/stores/${fixture.store.id}`));
        await admin.getByPlaceholder('Search SKU, name, or scan barcode...').fill(item.name);
        await expect(admin).toHaveURL(/search=/);
        await admin.getByRole('button', { name: new RegExp(item.name) }).first().click();
        const sheet = admin.locator('.MuiDrawer-paper').last();
        await sheet.getByRole('button', { name: 'Edit price' }).click();
        const panel = admin.locator('.MuiDrawer-paper').last();
        await panel.getByRole('tab', { name: 'Seller Price' }).click();
        await select(panel, 'Seller').click();
        await admin.getByRole('option', { name: `${hire.first} ${hire.last}`, exact: true }).click();
        await panel.getByLabel('Business Seller Price').fill(String(price));
        await panel.getByRole('button', { name: 'Save Seller Price' }).click();
        const group = admin.locator('.MuiDrawer-paper').filter({ hasText: 'Prices applied' }).getByText('Seller prices', { exact: true }).locator('xpath=ancestor::div[3]');
        await expect(group).toContainText(`${hire.first} ${hire.last}`);
    });

    await test.step('4. the new seller signs straight in and can start a cart', async () => {
        const seller = await signIn(browser, 'seller', hire.email);
        await expect(seller).toHaveURL(/seller\.duka\.test:\d+\/dashboard/);
        await seller.goto(app('seller', '/carts/create'));
        await expect(seller.getByRole('button', { name: 'Start cart' })).toBeVisible();
    });

    console.log(`
  Walkthrough done: store "${storeName}" (#${storeId}); seller ${hire.email} in ${fixture.store.name}, with a business price of ${price.toFixed(2)} on ${item.name}.
  Where to look (password in e2e/.fixture/demo.json; the new seller has the same one):
    Admin    ${fixture.people.admin.email}    ${app('admin', `/stores/${storeId}`)}   ${app('admin', '/users')}
             ${app('admin', `/stores/${fixture.store.id}`)}   the item's "Seller prices"
    Seller   ${hire.email}    ${app('seller', '/dashboard')}
`);
});
